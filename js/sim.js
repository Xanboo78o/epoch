// EPOCH — muscles, brains, damage, in 3D.
// Gains are carried over from FLOP unchanged: they are ACCELERATIONS, so they
// are mass-independent and port straight across from the 2D version.

import { World, GRAVITY, FLAT } from './physics.js';
import { BY_ID, buildUnit } from './units.js';
import { FlowField } from './flow.js';

const HIT_SPEED = 230;
const SWING_K = 3.6;
const STRIDE = 13;
const WALK = 100;
const FALL_SAFE = 300;
const FALL_HURT = 0.085;
const BODY_CAP = 420;

export class Sim {
  constructor() {
    this.world = new World();
    this.units = [];
    this.corpses = [];
    this.shots = [];
    this.fx = [];
    this.uid = 1;
    this.time = 0;
    this.running = false;
    this.flow = [null, null];
    this.flowT = 0;
  }

  get terrain() { return this.world.terrain; }
  set terrain(t) {
    this.world.terrain = t || FLAT;
    this.flow = [null, null];
    if (t && t.w) { this.flow = [new FlowField(t), new FlowField(t)]; this.flowT = 0; }
  }

  // One field per side, aimed at wherever the other side currently is.
  rebuildFlow() {
    const T = this.world.terrain;
    if (!this.flow[0] || !T.w) return;
    for (const team of [0, 1]) {
      const goals = [];
      const seen = new Set();
      for (const u of this.units) {
        if (!u.alive || u.team === team) continue;
        const i = T.tx(u.p.base.x), j = T.tz(u.p.base.z);
        const k = j * T.w + i;
        if (seen.has(k)) continue;
        seen.add(k); goals.push([i, j]);
      }
      this.flow[team].build(goals);
    }
  }

  reset(keepTerrain = true) {
    const t = keepTerrain ? this.world.terrain : FLAT;
    this.world = new World();
    this.world.terrain = t;
    this.units = []; this.corpses = []; this.shots = []; this.fx = [];
    this.uid = 1; this.time = 0; this.running = false;
  }

  spawn(specId, x, z, team, yaw, hold = false) {
    const spec = BY_ID[specId];
    if (!spec) return null;
    if (yaw === undefined) yaw = team === 0 ? 0 : Math.PI;
    const gy = this.world.terrain.heightAt(x, z);
    const u = buildUnit(this.world, spec, x, z, gy, team, this.uid++, yaw);
    u.hold = !!hold;
    this.units.push(u);
    return u;
  }

  remove(u) {
    for (const p of u.all) this.world.removePoint(p);
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
  }

  aliveCount(team) {
    let n = 0;
    for (const u of this.units) if (u.alive && u.team === team) n++;
    return n;
  }

  retarget(u) {
    const hx = u.p.chest.x, hz = u.p.chest.z;
    if (u.spec.brain === 'ranged') {
      // Volleys spread across the mass instead of all landing on one man.
      const pool = [];
      for (const o of this.units) {
        if (!o.alive || o.team === u.team) continue;
        if (Math.hypot(o.p.chest.x - hx, o.p.chest.z - hz) < u.spec.reach) pool.push(o);
      }
      if (pool.length) {
        const a = pool[(Math.random() * pool.length) | 0];
        const b = pool[(Math.random() * pool.length) | 0];
        const da = Math.hypot(a.p.chest.x - hx, a.p.chest.z - hz);
        const db = Math.hypot(b.p.chest.x - hx, b.p.chest.z - hz);
        u.target = da < db ? a : b;
        return;
      }
    }
    let best = null, bestD = Infinity;
    for (const o of this.units) {
      if (!o.alive || o.team === u.team) continue;
      const dx = o.p.chest.x - hx, dz = o.p.chest.z - hz;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = o; }
    }
    u.target = best;
  }

  drive(u, dt) {
    if (!u.alive) return;
    const W = this.world, p = u.p, s = u.spec.scale, spec = u.spec;
    const TER = W.terrain;
    const A = (pt, ax, ay, az) => W.accel(pt, ax, ay, az);
    const AR = (pt, ax, ay, az, onto, share = 1) => {
      W.accel(pt, ax, ay, az);
      const m = 1 / pt.im;
      W.force(onto, -ax * m * share, -ay * m * share, -az * m * share);
    };

    u.retarget -= dt;
    if (u.retarget <= 0 || !u.target || !u.target.alive) {
      this.retarget(u);
      u.retarget = 0.35 + Math.random() * 0.35;
    }
    const tgt = u.target;
    const ground = TER.heightAt(p.base.x, p.base.z);

    // --- stand up ---
    // Same inverted-pendulum controller as before, just on a shorter stack:
    // the horizontal part of base->head is sin(tilt) in the falling direction.
    const vx = p.head.x - p.base.x, vy = p.head.y - p.base.y, vz = p.head.z - p.base.z;
    const L = Math.max(1e-3, Math.hypot(vx, vy, vz));
    const lx = vx / L, lz = vz / L;
    const dlx = (lx - u.lean.x) / dt, dlz = (lz - u.lean.z) / dt;
    u.lean.x = lx; u.lean.z = lz;
    const carry = u.weapon ? 1 + Math.min(1.2, (1 / u.weapon.tip.im) / (2.6 * spec.mass)) : 1;
    const K = 13000 * s * carry, D = 380 * s * carry;
    const tx = -lx * K - dlx * D, tz = -lz * K - dlz * D;
    A(p.head, tx, 0, tz);
    const back = (1 / p.head.im) / (1 / p.base.im);
    A(p.base, -tx * back, 0, -tz * back);

    // --- where to go ---
    let wantX = 0, wantZ = 0, dist = Infinity;
    if (tgt) {
      const dx = tgt.p.chest.x - p.chest.x, dz = tgt.p.chest.z - p.chest.z;
      dist = Math.hypot(dx, dz) || 1e-3;
      const nx = dx / dist, nz = dz / dist;
      // Turn toward him instead of snapping. Retargeting every half second
      // meant a man could spin 180 degrees between two frames, which read as
      // the whole army stuttering.
      const want = Math.atan2(nx, nz);
      let d2 = want - u.yaw;
      while (d2 > Math.PI) d2 -= Math.PI * 2;
      while (d2 < -Math.PI) d2 += Math.PI * 2;
      u.yaw += Math.max(-6 * dt, Math.min(6 * dt, d2));
      if (spec.keepAway) {
        if (dist < spec.keepAway * 0.8) { wantX = -nx; wantZ = -nz; }
        else if (dist > spec.reach * 0.85) { wantX = nx; wantZ = nz; }
      } else if (dist > spec.reach * 0.72) { wantX = nx; wantZ = nz; }

      const F = this.flow[u.team];
      if ((wantX || wantZ) && F && F.ready && dist > 220) {
        const d = F.dirAt(p.base.x, p.base.z, this._fd || (this._fd = { x: 0, z: 0 }));
        if (d) { wantX = d.x; wantZ = d.z; }
      }
      if (u.hold) {
        const ox = p.base.x - u.anchorX, oz = p.base.z - u.anchorZ;
        const od = Math.hypot(ox, oz);
        if (od > 26 * s) { wantX = -ox / od; wantZ = -oz / od; }
        else { wantX = 0; wantZ = 0; }
      }
    }

    // never walk at a step you cannot climb
    if ((wantX || wantZ) && TER.passable) {
      const i0 = TER.tx(p.base.x), j0 = TER.tz(p.base.z);
      const ni = TER.tx(p.base.x + wantX * 60), nj = TER.tz(p.base.z + wantZ * 60);
      if ((ni !== i0 || nj !== j0) && !TER.passable(i0, j0, ni, nj)) {
        if (TER.passable(i0, j0, ni, j0)) wantZ = 0;
        else if (TER.passable(i0, j0, i0, nj)) wantX = 0;
        else { wantX = 0; wantZ = 0; }
      }
    }

    u.dist = dist;
    const moving = (wantX || wantZ) && spec.speed > 0;
    const spd = spec.speed * (TER.speedAt ? TER.speedAt(p.base.x, p.base.z) : 1);
    u.moving = moving;

    // --- walk ---
    // No leg cycle any more: hold the base at standing height and bob the
    // chest. At the zoom this game is played at, a bob reads as a stride.
    // Stand height must equal the base's own collision radius, or the
    // controller pushes down while the floor pushes up, forever.
    // The correction is clamped because tiles are FLAT with hard steps between
    // them: crossing one changes `ground` by a whole block in a single frame,
    // and an unclamped spring turned that into a launch.
    const baseVel = (p.base.y - p.base.py) / dt;
    const lift = ((ground + 11 * s) - p.base.y) * 300 - baseVel * 8;
    A(p.base, 0, Math.max(-4000, Math.min(4000, lift)), 0);
    u.gait += dt * (moving ? 9 * spd : 1.2);
    u.bob = moving ? Math.sin(u.gait) * 2.2 * s : 0;

    const targetVX = wantX * spd * WALK * s, targetVZ = wantZ * spd * WALK * s;
    const tv = Math.hypot(targetVX, targetVZ);
    {
      const cvx = (p.base.x - p.base.px) / dt, cvz = (p.base.z - p.base.pz) / dt;
      const gain = moving ? 22 : 16;
      A(p.base, (targetVX - cvx) * gain, 0, (targetVZ - cvz) * gain);
      A(p.chest, (targetVX - (p.chest.x - p.chest.px) / dt) * 6, 0,
                 (targetVZ - (p.chest.z - p.chest.pz) / dt) * 6);
      if (moving) { if (!u.hold) { u.anchorX = p.base.x; u.anchorZ = p.base.z; } }
      else A(p.base, (u.anchorX - p.base.x) * 1.8, 0, (u.anchorZ - p.base.z) * 1.8);

      // The governor runs whenever he has a foot down, NOT only while walking.
      // A man whose way is blocked stops "moving", and the old code switched
      // his speed limit off at exactly that moment — so the rank behind shoved
      // him along at twice walking pace until he popped free and walked again.
      // That stop-lurch-stop cycle was the stutter.
      // Generous, so that stepping up a block does not count as airborne and
      // switch the speed limit off mid-stride.
      const grounded = p.base.y < ground + 34 * s;
      if (grounded) {
        const cap = tv + 35;
        for (const q of [p.base, p.chest, p.head]) {
          const qx = (q.x - q.px) / dt, qz = (q.z - q.pz) / dt;
          const sp2 = Math.hypot(qx, qz);
          if (sp2 > cap) A(q, -(qx / sp2) * (sp2 - cap) * 45, 0, -(qz / sp2) * (sp2 - cap) * 45);
        }
      }
    }

    // --- weapon ---
    const w = u.weapon;
    const aim = tgt ? tgt.p.chest : null;
    const fwdX = Math.sin(u.yaw), fwdZ = Math.cos(u.yaw);
    if (w) {
      u.cd -= dt;
      if (spec.brain === 'melee' && tgt && dist < spec.reach * 1.15 && u.cd <= 0 && u.swingT <= 0) {
        u.swingT = 0.42; u.cd = w.spec.rate; u.hitLock.clear();
      }
      if (u.swingT > 0) {
        u.swingT -= dt;
        const t = 1 - u.swingT / 0.42;
        const F = w.spec.swing * SWING_K * s;
        const thrust = w.spec.style === 'thrust';
        if (t < (thrust ? 0.4 : 0.38)) {
          AR(w.tip, -fwdX * F * (thrust ? 1.1 : 0.5), F * (thrust ? 0.15 : 1.0),
             -fwdZ * F * (thrust ? 1.1 : 0.5), p.chest, 0.4);
          A(w.tip, 0, GRAVITY, 0);
        } else if (aim) {
          const dx = aim.x - w.tip.x, dy = aim.y - w.tip.y, dz = aim.z - w.tip.z;
          const d = Math.max(1, Math.hypot(dx, dy, dz));
          const g = thrust ? 2.4 : 1.7;
          AR(w.tip, (dx / d) * F * g, (dy / d) * F * g - (thrust ? 0 : F * 0.4),
             (dz / d) * F * g, p.chest, 0.4);
          A(w.tip, 0, GRAVITY, 0);
        }
      } else {
        const txp = p.chest.x + fwdX * 26 * s, tzp = p.chest.z + fwdZ * 26 * s;
        AR(w.tip, (txp - w.tip.x) * 16, ((p.chest.y + 6 * s) - w.tip.y) * 16,
           (tzp - w.tip.z) * 16, p.chest, 1);
        A(w.tip, 0, GRAVITY, 0);
      }
    }

    if (spec.brain === 'ranged' && tgt && u.cd <= 0 && dist < spec.reach) {
      u.cd = w.spec.rate * (0.85 + Math.random() * 0.3);
      this.fire(u, tgt);
    }
  }

  fire(u, tgt) {
    const w = u.weapon.spec, s = u.spec.scale, W = this.world;
    const from = u.p.chest;
    const dx = tgt.p.chest.x - from.x, dz = tgt.p.chest.z - from.z;
    const dy = tgt.p.chest.y - from.y;
    const flat = Math.hypot(dx, dz) || 1e-3;
    const v = w.muzzle;
    const g = GRAVITY;

    // ballistic solve in the vertical plane containing the shot
    let elev;
    const root = v * v * v * v - g * (g * flat * flat + 2 * dy * v * v);
    if (root < 0) elev = Math.PI / 4;
    else elev = Math.atan((v * v - Math.sqrt(root)) / (g * flat));

    const nx = dx / flat, nz = dz / flat;
    const spread = w.spread !== undefined ? w.spread : 0.05;
    const yawErr = (Math.random() - 0.5) * spread;
    const pitchErr = (Math.random() - 0.5) * spread;
    const ca = Math.cos(yawErr), sa = Math.sin(yawErr);
    const ax = nx * ca - nz * sa, az = nx * sa + nz * ca;
    const e = elev + pitchErr;
    const vx = ax * Math.cos(e) * v, vy = Math.sin(e) * v, vz = az * Math.cos(e) * v;

    const head = W.addPoint(from.x, from.y, from.z, {
      r: w.tipR * s, im: 1 / w.tipMass, tag: 'shot', team: u.team, unit: -2,
      solid: false, drag: 0.0006,
    });
    const dt = 1 / 60;
    head.px = head.x - vx * dt; head.py = head.y - vy * dt; head.pz = head.z - vz * dt;

    let tail = null, stick = null;
    if (w.kind === 'bow') {
      const L = 22;
      const iv = 1 / Math.hypot(vx, vy, vz);
      tail = W.addPoint(head.x - vx * iv * L, head.y - vy * iv * L, head.z - vz * iv * L, {
        r: 2, im: 1 / (w.tipMass * 0.35), tag: 'shot', team: u.team, unit: -2,
        solid: false, drag: 0.004,
      });
      tail.px = tail.x - vx * dt; tail.py = tail.y - vy * dt; tail.pz = tail.z - vz * dt;
      stick = W.addStick(head, tail, { len: L });
    }
    this.shots.push({
      head, tail, stick, team: u.team, dmg: w.dmg, kind: w.kind,
      life: w.kind === 'gun' ? 2.5 : 6, stuck: false, owner: u.uid, color: w.color,
    });
  }

  hurt(u, amount, x, y, z) {
    if (!u.alive) return;
    u.hp -= amount;
    u.flash = 0.18;
    this.fx.push({ type: 'hit', x, y, z, t: 0.22, max: 0.22 });
    if (u.hp <= 0) {
      u.alive = false; u.limp = 0; u.target = null;
      this.corpses.push(u);
      if (this.corpses.length > BODY_CAP) {
        const old = this.corpses.shift();
        if (old) this.remove(old);
      }
    }
  }

  resolveHits(dt) {
    const W = this.world, g = W.grid;
    for (const u of this.units) {
      const w = u.weapon;
      if (!w || w.tip.dead || !u.alive) continue;
      const tip = w.tip;
      const vx = (tip.x - tip.px) / dt, vy = (tip.y - tip.py) / dt, vz = (tip.z - tip.pz) / dt;
      const sp = Math.hypot(vx, vy, vz);
      if (sp < HIT_SPEED) continue;
      for (const [k, v] of u.hitLock) {
        const nv = v - dt;
        if (nv <= 0) u.hitLock.delete(k); else u.hitLock.set(k, nv);
      }
      let hit = null, hitPt = null;
      g.near(tip.x, tip.z, (j) => {
        if (hit) return;
        const q = W.points[j];
        if (q.dead || q.unit === u.uid || q.unit < 0) return;
        const o = this.byUid(q.unit);
        if (!o || o.team === u.team) return;
        if (u.hitLock.has(o.uid)) return;
        const rr = q.r + tip.r + 2;
        const dx = q.x - tip.x, dy = q.y - tip.y, dz = q.z - tip.z;
        if (dx * dx + dy * dy + dz * dz < rr * rr) { hit = o; hitPt = q; }
      });
      if (!hit) continue;
      let dmg = w.spec.dmg * Math.min(1.9, Math.max(0.35, sp / 900));
      dmg *= 1 - this.shieldFactor(hit, tip.x - hit.p.chest.x, tip.z - hit.p.chest.z);
      if (hitPt.tag === 'head') dmg *= 1.35;
      u.hitLock.set(hit.uid, 0.45);
      const kn = (1 / Math.max(0.02, tip.im)) * sp * 0.00016;
      const ux = vx / sp, uy = vy / sp, uz = vz / sp;
      for (const q of hit.all) W.impulse(q, -ux * kn * 0.55, -uy * kn * 0.55, -uz * kn * 0.55);
      W.impulse(hitPt, -ux * kn, -uy * kn, -uz * kn);
      this.hurt(hit, dmg, hitPt.x, hitPt.y, hitPt.z);
    }

    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      if (s.life <= 0 || s.head.dead) {
        W.removePoint(s.head);
        if (s.tail) W.removePoint(s.tail);
        if (s.stick) s.stick.dead = true;
        this.shots.splice(i, 1);
        continue;
      }
      if (s.stuck) continue;
      const h = s.head;
      if (h.y <= W.terrain.heightAt(h.x, h.z) + h.r) {
        s.stuck = true; h.im = 0; s.life = Math.min(s.life, 3); continue;
      }
      const vx = (h.x - h.px) / dt, vy = (h.y - h.py) / dt, vz = (h.z - h.pz) / dt;
      const sp = Math.hypot(vx, vy, vz);
      if (sp < 60) continue;
      let hit = null, hitPt = null;
      g.near(h.x, h.z, (j) => {
        if (hit) return;
        const q = W.points[j];
        if (q.dead || q.unit < 0) return;
        const o = this.byUid(q.unit);
        if (!o || (o.team === s.team && o.uid === s.owner)) return;
        const rr = q.r + h.r + 1;
        const dx = q.x - h.x, dy = q.y - h.y, dz = q.z - h.z;
        if (dx * dx + dy * dy + dz * dz < rr * rr) { hit = o; hitPt = q; }
      });
      if (!hit) continue;
      let dmg = s.dmg * Math.min(1.7, Math.max(0.4, sp / (s.kind === 'gun' ? 3000 : 800)));
      dmg *= 1 - this.shieldFactor(hit, -vx, -vz);
      if (hitPt.tag === 'head') dmg *= 1.4;
      const kn = (1 / Math.max(0.02, h.im)) * sp * 0.00022;
      const ux = vx / sp, uy = vy / sp, uz = vz / sp;
      for (const q of hit.all) W.impulse(q, -ux * kn * 0.5, -uy * kn * 0.5, -uz * kn * 0.5);
      this.hurt(hit, dmg, hitPt.x, hitPt.y, hitPt.z);
      s.stuck = true;
      if (s.kind === 'bow') {
        W.addStick(h, hitPt, { len: Math.max(2, Math.hypot(hitPt.x - h.x, hitPt.y - h.y, hitPt.z - h.z)) });
        if (s.tail) s.tail.drag = 0.25;
        s.life = Math.min(s.life, 40);
      } else {
        s.life = 0;
      }
    }
  }

  // Drop height, not impact speed: verlet "velocity" includes constraint
  // corrections, so a man standing on a slope reads as falling at 1000px/s.
  resolveFalls(dt) {
    const T = this.world.terrain;
    for (const u of this.units) {
      if (!u.alive) continue;
      const s = u.spec.scale, p = u.p;
      const grounded = p.base.y < T.heightAt(p.base.x, p.base.z) + 20 * s;
      const clear = p.chest.y - T.heightAt(p.chest.x, p.chest.z);
      if (!grounded) { if (clear > u.apex) u.apex = clear; }
      else if (u.apex) {
        const drop = u.apex - 40 * s - FALL_SAFE;
        if (drop > 0) this.hurt(u, drop * FALL_HURT, p.chest.x, p.chest.y, p.chest.z);
        u.apex = 0;
      }
    }
  }

  // A shield only helps against what it is pointed at.
  shieldFactor(u, fromX, fromZ) {
    if (!u.soak) return 0;
    const d = Math.hypot(fromX, fromZ) || 1;
    const dot = (fromX / d) * Math.sin(u.yaw) + (fromZ / d) * Math.cos(u.yaw);
    return dot > 0.15 ? u.soak * Math.min(1, dot + 0.25) : 0;
  }

  byUid(uid) {
    if (this._c && this._c.uid === uid) return this._c.u;
    for (const u of this.units) if (u.uid === uid) { this._c = { uid, u }; return u; }
    return null;
  }

  update(dt) {
    if (!this.running) {
      for (const u of this.units) u.flash = Math.max(0, u.flash - dt);
      return;
    }
    this.time += dt;
    this.flowT -= dt;
    if (this.flowT <= 0) { this.flowT = 0.55; this.rebuildFlow(); }
    for (const u of this.units) {
      u.flash = Math.max(0, u.flash - dt);
      if (u.alive) this.drive(u, dt); else u.limp += dt;
    }
    this.world.step(dt);
    this.resolveHits(dt);
    this.resolveFalls(dt);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      this.fx[i].t -= dt;
      if (this.fx[i].t <= 0) this.fx.splice(i, 1);
    }
    if (this.time % 2 < dt) this.world.compactSticks();
  }
}
