// EPOCH — verlet physics in 3D. Y is UP (three.js convention); the battlefield
// lies in XZ. Same two primitives as ever: points and sticks.

export const GRAVITY = 1400;

export const FLAT = {
  heightAt: () => 0,
  normalAt: (out) => { out.x = 0; out.y = 1; out.z = 0; return out; },
};

export class Grid {
  // Hash over XZ only. Everything in this game stands on the ground, so the
  // vertical axis buys nothing and costs a third of the bucket lookups.
  constructor(cell = 26) { this.cell = cell; this.map = new Map(); }
  key(cx, cz) { return cx * 73856093 ^ cz * 83492791; }
  clear() { this.map.clear(); }
  insert(p, i) {
    const k = this.key(Math.floor(p.x / this.cell), Math.floor(p.z / this.cell));
    let b = this.map.get(k);
    if (!b) { b = []; this.map.set(k, b); }
    b.push(i);
  }
  near(x, z, fn) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const b = this.map.get(this.key(cx + dx, cz + dz));
        if (b) for (let i = 0; i < b.length; i++) fn(b[i]);
      }
    }
  }
}

export class World {
  constructor() {
    this.points = [];
    this.sticks = [];
    this.grid = new Grid(26);
    this.iterations = 4;
    this.terrain = FLAT;
    this.freePoints = [];
    this._n = { x: 0, y: 1, z: 0 };
  }

  addPoint(x, y, z, opts = {}) {
    const p = {
      x, y, z, px: x, py: y, pz: z,
      ax: 0, ay: 0, az: 0,
      im: opts.im !== undefined ? opts.im : 1,
      r: opts.r || 5,
      unit: opts.unit !== undefined ? opts.unit : -1,
      tag: opts.tag || '',
      team: opts.team !== undefined ? opts.team : -1,
      solid: opts.solid !== false,
      // In the grid (so weapons can hit it) but not part of crowd separation.
      // Only a man's footprint shoves other men; his chest and head being
      // separate colliders meant three overlapping spheres per pair, all
      // fighting each other every frame.
      push: opts.push !== false,
      drag: opts.drag || 0,
      dead: false,
      idx: 0,
    };
    let idx = this.freePoints.pop();
    if (idx === undefined) { idx = this.points.length; this.points.push(p); }
    else this.points[idx] = p;
    p.idx = idx;
    return p;
  }

  removePoint(p) {
    if (!p || p.dead) return;
    p.dead = true; p.solid = false; p.im = 0;
    this.freePoints.push(p.idx);
  }

  addStick(a, b, opts = {}) {
    const s = {
      a, b,
      len: opts.len !== undefined ? opts.len
        : Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z),
      stiff: opts.stiff !== undefined ? opts.stiff : 1,
      minOnly: !!opts.minOnly,
      maxOnly: !!opts.maxOnly,
      dead: false,
    };
    this.sticks.push(s);
    return s;
  }

  force(p, fx, fy, fz) { p.ax += fx * p.im; p.ay += fy * p.im; p.az += fz * p.im; }
  // Acceleration ignoring mass — muscles work this way. A big guy has big
  // muscles, so his limbs move as fast as a small guy's.
  accel(p, ax, ay, az) { if (p.im === 0) return; p.ax += ax; p.ay += ay; p.az += az; }
  impulse(p, ix, iy, iz) { p.px -= ix * p.im; p.py -= iy * p.im; p.pz -= iz * p.im; }

  step(dt) {
    const pts = this.points;
    const T = this.terrain;

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.dead || p.im === 0) { p.ax = p.ay = p.az = 0; continue; }
      let vx = p.x - p.px, vy = p.y - p.py, vz = p.z - p.pz;
      if (p.drag) { vx *= 1 - p.drag; vy *= 1 - p.drag; vz *= 1 - p.drag; }
      p.px = p.x; p.py = p.y; p.pz = p.z;
      p.x += vx + p.ax * dt * dt;
      p.y += vy + (p.ay - GRAVITY) * dt * dt;
      p.z += vz + p.az * dt * dt;
      p.ax = p.ay = p.az = 0;
    }

    const g = this.grid;
    g.clear();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!p.dead && p.solid) g.insert(p, i);
    }

    // bodies shove each other; crowds pack and piles form
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      if (a.dead || !a.solid || !a.push) continue;
      g.near(a.x, a.z, (j) => {
        if (j <= i) return;
        const b = pts[j];
        if (b.dead || !b.solid || !b.push || b.unit === a.unit) return;
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-6) return;
        const d = Math.sqrt(d2);
        // Relax a third of the overlap per step instead of all of it. Solving
        // it outright makes a packed formation snap men about; over a few
        // frames this settles to the same place without the twitching.
        const push = (rr - d) / d * 0.35;
        const im = a.im + b.im;
        if (im === 0) return;
        const wa = a.im / im, wb = b.im / im;
        const ax = dx * push * wa, ay = dy * push * wa, az = dz * push * wa;
        const bx = dx * push * wb, by = dy * push * wb, bz = dz * push * wb;
        a.x -= ax; a.y -= ay; a.z -= az;
        b.x += bx; b.y += by; b.z += bz;
        // Separating two bodies by moving them is fine; letting that movement
        // become VELOCITY is not — in a packed formation it fires men out of
        // the crowd at twice their top speed. Carry most of it into the
        // previous position so only a little of the shove survives as motion.
        const keep = 0.85;
        a.px -= ax * keep; a.py -= ay * keep; a.pz -= az * keep;
        b.px += bx * keep; b.py += by * keep; b.pz += bz * keep;
      });
    }

    const st = this.sticks;
    const n = this._n;
    for (let k = 0; k < this.iterations; k++) {
      for (let i = 0; i < st.length; i++) {
        const s = st[i];
        if (s.dead) continue;
        const a = s.a, b = s.b;
        if (a.dead || b.dead) { s.dead = true; continue; }
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        let d = Math.hypot(dx, dy, dz);
        if (d < 1e-6) d = 1e-6;
        if (s.minOnly && d >= s.len) continue;
        if (s.maxOnly && d <= s.len) continue;
        const diff = (d - s.len) / d * s.stiff;
        const im = a.im + b.im;
        if (im === 0) continue;
        const wa = a.im / im, wb = b.im / im;
        a.x += dx * diff * wa; a.y += dy * diff * wa; a.z += dz * diff * wa;
        b.x -= dx * diff * wb; b.y -= dy * diff * wb; b.z -= dz * diff * wb;
      }

      // --- blocks have SIDES, resolved BEFORE the floor clamp ---
      // Order matters: the floor clamp below teleports a point to the top of
      // whatever column it is standing in. If a man gets shoved into a wall
      // tile and the clamp runs first, he is instantly on top of a nine-block
      // rampart. Pushing him out of the column first makes that impossible.
      if (T.tx) {
        const TILE_W = T.step;
        for (let i = 0; i < pts.length; i++) {
          const q = pts[i];
          if (q.dead || q.im === 0 || !q.push) continue;
          const climb = q.y - q.r + T.climbY;

          // If he is standing INSIDE a column he has no business being in —
          // shoved there by the crowd at a gate, usually — evict him toward
          // the lowest neighbour first. Checking only the neighbouring columns
          // missed this case entirely, and the floor clamp then stood him on
          // top of the tower.
          const oi = T.tx(q.x), oj = T.tz(q.z);
          if (T.topAt(oi, oj) > climb) {
            let bi = 0, bj = 0, best = Infinity;
            for (let s3 = 0; s3 < 4; s3++) {
              const ei = s3 === 0 ? 1 : s3 === 1 ? -1 : 0;
              const ej = s3 === 2 ? 1 : s3 === 3 ? -1 : 0;
              const top = T.topAt(oi + ei, oj + ej);
              if (top < best) { best = top; bi = ei; bj = ej; }
            }
            const halfT = T.step * 0.5;
            if (bi) {
              const edge = T.wx(oi) + bi * halfT;
              const want = edge + bi * (q.r + 0.5);
              q.px += want - q.x; q.x = want;
            } else {
              const edge = T.wz(oj) + bj * halfT;
              const want = edge + bj * (q.r + 0.5);
              q.pz += want - q.z; q.z = want;
            }
          }

          // tx/tz are divisions; computing them once per point instead of
          // once per neighbour is most of the cost of this pass.
          const ci = T.tx(q.x), cj = T.tz(q.z);
          for (let s2 = 0; s2 < 4; s2++) {
            const di = s2 === 0 ? 1 : s2 === 1 ? -1 : 0;
            const dj = s2 === 2 ? 1 : s2 === 3 ? -1 : 0;
            const ti = ci + di, tj = cj + dj;
            if (T.topAt(ti, tj) <= climb) continue;
            if (di) {
              const edge = T.wx(ti) - di * TILE_W * 0.5;
              const pen = (q.x + q.r * di - edge) * di;
              if (pen > 0) { q.x -= di * pen; q.px -= di * pen; }
            } else {
              const edge = T.wz(tj) - dj * TILE_W * 0.5;
              const pen = (q.z + q.r * dj - edge) * dj;
              if (pen > 0) { q.z -= dj * pen; q.pz -= dj * pen; }
            }
          }
        }
      }

      // Ground contact is a pure position clamp here. Friction must NOT live
      // in this loop: it runs once per solver iteration, so a point would be
      // slowed one to four times per step depending on how the constraints
      // happened to shove it, which is what made soldiers lurch and stall.
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.dead || p.im === 0) continue;
        const floor = T.heightAt(p.x, p.z) + p.r;
        if (p.y < floor) {
          p.y = floor;
          if (p.py < floor) p.py = floor;
        }
      }
    }

    // --- friction, exactly once per step ---
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.dead || p.im === 0) continue;
      if (p.y > T.heightAt(p.x, p.z) + p.r + 0.5) continue;
      const vx = p.x - p.px, vz = p.z - p.pz;
      p.px = p.x - vx * 0.86;
      p.pz = p.z - vz * 0.86;
    }
  }

  compactSticks() {
    let w = 0;
    for (let i = 0; i < this.sticks.length; i++) {
      const s = this.sticks[i];
      if (!s.dead && !s.a.dead && !s.b.dead) this.sticks[w++] = s;
    }
    this.sticks.length = w;
  }
}
