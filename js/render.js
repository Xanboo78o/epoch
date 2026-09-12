// EPOCH — 2.5D renderer. Camera pitch is locked at -60 degrees and never
// rotates; you pan and you zoom, that is all.

import * as THREE from './vendor/three.module.min.js';
import { TILE, LEVEL, TILE_COLOUR, TILE_SIDE, MATS } from './terrain.js';

export const PITCH = 60 * Math.PI / 180;   // locked. Do not add yaw controls.
export const TEAM = [
  { main: 0xb8402f, trim: 0xe08a6a, name: 'RED' },
  { main: 0x2f6fb5, trim: 0x7fb0e8, name: 'BLUE' },
];

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

// A soldier is drawn as capsules between his physics points. There is no rig
// and no animation data — whatever the solver does to him is what you see.
// One man = a base counter, a body box, a head box, an optional shield, plus
// the weapon shaft. Five draws instead of fourteen, and he reads better at the
// zoom this game is actually played at.
const MAX_BOXES = 4;

export class Renderer {
  constructor(canvas, capacity = 400) {
    this.cap = capacity;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fc0d8);
    this.scene.fog = new THREE.Fog(0x9fc0d8, 3500, 16000);

    this.cam = new THREE.PerspectiveCamera(32, 1, 10, 24000);
    this.target = new THREE.Vector3(0, 0, 0);
    this.dist = 1500;

    const hemi = new THREE.HemisphereLight(0xcfe3f2, 0x6b6048, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.25);
    sun.position.set(-900, 1500, 700);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 1400;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 100; sun.shadow.camera.far = 4200;
    sun.shadow.bias = -0.0012;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    // --- instanced soldier parts ---
    const boneGeo = new THREE.CylinderGeometry(1, 1, 1, 5, 1);
    boneGeo.computeVertexNormals();
    this.bones = this.makeInstanced(boneGeo, capacity, 0.35, 0.1);     // weapon shafts
    this.boxes = this.makeInstanced(new THREE.BoxGeometry(1, 1, 1), capacity * MAX_BOXES, 0.6, 0.05);
    this.trees = this.makeInstanced(new THREE.ConeGeometry(1, 1, 5), 3000, 0.9, 0);

    const shotGeo = new THREE.CylinderGeometry(0.6, 0.6, 1, 4, 1);
    this.shots = this.makeInstanced(shotGeo, 900, 0.5, 0.05);

    this.terrainMesh = null;
    this.terrainV = -1;
  }

  makeInstanced(geo, count, rough, metal) {
    const mat = new THREE.MeshStandardMaterial({ roughness: rough, metalness: metal });
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true;
    m.receiveShadow = false;
    m.frustumCulled = false;
    m.count = 0;
    this.scene.add(m);
    return m;
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
  }

  // Locked angle: the camera always sits back along +Z and up by the pitch.
  updateCamera() {
    const horiz = Math.cos(PITCH) * this.dist;
    const vert = Math.sin(PITCH) * this.dist;
    this.cam.position.set(this.target.x, this.target.y + vert, this.target.z + horiz);
    this.cam.lookAt(this.target);
    this.sun.position.set(this.target.x - 900, this.target.y + 1800, this.target.z + 700);
    this.sun.target.position.copy(this.target);
    this.sun.target.updateMatrixWorld();
    // Keep the shadow box matched to what you can actually see.
    const d = Math.max(600, this.dist * 0.85);
    const c = this.sun.shadow.camera;
    if (c.right !== d) {
      c.left = -d; c.right = d; c.top = d; c.bottom = -d;
      c.far = this.dist * 3 + 2000;
      c.updateProjectionMatrix();
    }
  }

  // Screen point -> a point on the y=groundY plane, for placing and panning.
  screenToGround(nx, ny, groundY = 0) {
    const ray = new THREE.Vector3(nx, ny, 0.5).unproject(this.cam).sub(this.cam.position).normalize();
    if (Math.abs(ray.y) < 1e-6) return null;
    const t = (groundY - this.cam.position.y) / ray.y;
    if (t < 0) return null;
    return this.cam.position.clone().addScaledVector(ray, t);
  }

  // The map is built as real tiles: a flat top quad per tile, plus a vertical
  // wall wherever a neighbour sits lower. No smooth ground anywhere — the
  // steps between levels are the whole look.
  buildTerrain(terrain) {
    if (this.terrainV === terrain.version && this.terrainMesh) return;
    this.terrainV = terrain.version;
    const W = terrain.w, H = terrain.h;
    const pos = [], col = [], nrm = [];
    const c = new THREE.Color(), cw = new THREE.Color();
    const half = TILE / 2;

    const quad = (ax, ay, az, bx, by, bz, cx2, cy2, cz2, dx, dy, dz, nx, ny, nz, colr) => {
      pos.push(ax, ay, az, bx, by, bz, cx2, cy2, cz2,
               ax, ay, az, cx2, cy2, cz2, dx, dy, dz);
      for (let k = 0; k < 6; k++) { nrm.push(nx, ny, nz); col.push(colr.r, colr.g, colr.b); }
    };

    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const lv = terrain.levelAt(i, j);
        const ty = terrain.typeAt(i, j);
        let y = lv * LEVEL;
        const x = terrain.wx(i), z = terrain.wz(j);
        c.setHex(TILE_COLOUR[ty]);
        // a touch of per-tile variation so a big field is not one flat colour
        const n = ((i * 73856093) ^ (j * 19349663)) & 255;
        const shade = 0.94 + (n / 255) * 0.12;
        c.multiplyScalar(shade);
        if (MATS[ty].liquid) y -= LEVEL * 0.35;
        quad(x - half, y, z - half, x - half, y, z + half,
             x + half, y, z + half, x + half, y, z - half, 0, 1, 0, c);

        // walls down to any lower neighbour, in the material's own side colour
        cw.setHex(TILE_SIDE[ty]).multiplyScalar(shade);
        const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [di, dj] of sides) {
          const nl = terrain.inside(i + di, j + dj) ? terrain.levelAt(i + di, j + dj) : lv;
          if (nl >= lv) continue;
          const ny2 = nl * LEVEL;
          const ex = di * half, ez = dj * half;
          // Edge tangent = normal x up = (-dj, 0, di). Deriving it rather than
          // picking the non-zero axis keeps the winding consistent for all
          // four sides — the naive version left west and north walls inside
          // out, so they were backface-culled and you saw straight through the
          // hillside.
          const tx = -dj * half, tz = di * half;
          quad(x + ex - tx, y, z + ez - tz, x + ex + tx, y, z + ez + tz,
               x + ex + tx, ny2, z + ez + tz, x + ex - tx, ny2, z + ez - tz,
               di, 0, dj, cw);
        }
      }
    }

    if (this.terrainMesh) {
      this.terrainMesh.geometry.dispose();
      this.scene.remove(this.terrainMesh);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.terrainMesh = new THREE.Mesh(geo, mat);
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);
  }

  // Scenery that belongs to the map rather than the battle: a tree on every
  // woodland tile. Rebuilt only when the map version changes.
  buildProps(terrain) {
    if (this.propsV === terrain.version) return;
    this.propsV = terrain.version;
    let n = 0;
    const cap = this.trees.instanceMatrix.count;
    for (let j = 0; j < terrain.h && n < cap; j++) {
      for (let i = 0; i < terrain.w && n < cap; i++) {
        if (terrain.typeAt(i, j) !== 6) continue;          // woodland
        const seed = ((i * 73856093) ^ (j * 19349663)) & 1023;
        const x = terrain.wx(i) + ((seed & 15) - 7.5) * 2.4;
        const z = terrain.wz(j) + (((seed >> 4) & 15) - 7.5) * 2.4;
        const hgt = 70 + (seed & 31) * 2.2;
        _b.set(x, terrain.heightAt(x, z) + hgt / 2, z);
        _q.identity();
        _s.set(26 + (seed & 7), hgt, 26 + (seed & 7));
        _m.compose(_b, _q, _s);
        this.trees.setMatrixAt(n, _m);
        this.trees.setColorAt(n, _c.setHex(0x2f4a26).offsetHSL(0, 0, ((seed & 31) / 31 - 0.5) * 0.08));
        n++;
      }
    }
    this.trees.count = n;
    this.trees.instanceMatrix.needsUpdate = true;
    if (this.trees.instanceColor) this.trees.instanceColor.needsUpdate = true;
  }

  // A box spanning a->b, rolled so its depth axis faces `yaw`. Needed because
  // a torso has a front and a back and a cylinder does not.
  boxBetween(mesh, idx, a, b, w, d, yaw, colour) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const len = Math.hypot(ux, uy, uz) || 1e-3;
    const upx = ux / len, upy = uy / len, upz = uz / len;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    // right = up x forward
    let rxx = upy * fz - upz * 0, ryy = upz * fx - upx * fz, rzz = upx * 0 - upy * fx;
    let rl = Math.hypot(rxx, ryy, rzz);
    if (rl < 1e-4) { rxx = 1; ryy = 0; rzz = 0; rl = 1; }
    rxx /= rl; ryy /= rl; rzz /= rl;
    // forward = right x up
    const dxx = ryy * upz - rzz * upy, dyy = rzz * upx - rxx * upz, dzz = rxx * upy - ryy * upx;
    _m.set(
      rxx * w, upx * len, dxx * d, (a.x + b.x) / 2,
      ryy * w, upy * len, dyy * d, (a.y + b.y) / 2,
      rzz * w, upz * len, dzz * d, (a.z + b.z) / 2,
      0, 0, 0, 1,
    );
    mesh.setMatrixAt(idx, _m);
    mesh.setColorAt(idx, _c.setHex(colour));
  }

  // Place one capsule instance spanning a->b.
  bone(mesh, idx, ax, ay, az, bx, by, bz, r, colour) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 1e-3;
    _a.set(dx / len, dy / len, dz / len);
    _q.setFromUnitVectors(_up, _a);
    _b.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    _s.set(r, len, r);
    _m.compose(_b, _q, _s);
    mesh.setMatrixAt(idx, _m);
    mesh.setColorAt(idx, _c.setHex(colour));
  }

  blend(hex, teamHex, t) {
    return new THREE.Color(hex).lerp(new THREE.Color(teamHex), t).getHex();
  }

  draw(sim) {
    this.buildTerrain(sim.terrain);
    this.buildProps(sim.terrain);
    let bi = 0, ti = 0, xi = 0;
    const maxB = this.boxes.instanceMatrix.count;

    for (const u of sim.units) {
      const p = u.p, sc = u.spec.scale, spec = u.spec;
      const team = TEAM[u.team];
      if (xi + MAX_BOXES > maxB) break;

      const cloth = u.alive ? this.blend(spec.cloth, team.main, 0.5)
                            : this.blend(spec.cloth, 0x24201a, 0.55);
      const skin = u.alive ? (u.flash > 0 ? 0xff8d7a : spec.skin)
                           : this.blend(spec.skin, 0x24201a, 0.55);

      // team counter on the ground — this is what makes a formation readable
      // when you are zoomed out far enough to see the whole battlefield
      if (u.alive) {
        const gy = sim.terrain.heightAt(p.base.x, p.base.z);
        _b.set(p.base.x, gy + 1.2, p.base.z);
        _q.setFromAxisAngle(_up, u.yaw);
        _s.set(24 * sc, 2.4, 24 * sc);
        _m.compose(_b, _q, _s);
        this.boxes.setMatrixAt(xi, _m);
        this.boxes.setColorAt(xi, _c.setHex(team.trim));
        xi++;
      }

      // Body runs from the base most of the way to the head — the neck is body,
      // not face — and the head is a cube on the last stretch.
      const bob = u.bob || 0;
      const nx2 = p.chest.x + (p.head.x - p.chest.x) * 0.55;
      const ny2 = p.chest.y + (p.head.y - p.chest.y) * 0.55 + bob;
      const nz2 = p.chest.z + (p.head.z - p.chest.z) * 0.55;
      _a.set(p.base.x, p.base.y, p.base.z);
      _b.set(nx2, ny2, nz2);
      this.boxBetween(this.boxes, xi++, _a, _b, 17 * sc, 12 * sc, u.yaw, cloth);

      _a.set(nx2, ny2, nz2);
      _b.set(p.head.x, p.head.y + bob + 3 * sc, p.head.z);
      this.boxBetween(this.boxes, xi++, _a, _b, 13 * sc, 13 * sc, u.yaw, skin);

      // shield, drawn only — it is a damage rule now, not a physics object
      if (u.soak) {
        const fx = Math.sin(u.yaw), fz = Math.cos(u.yaw);
        const cx2 = (p.base.x + p.chest.x) / 2, cz2 = (p.base.z + p.chest.z) / 2;
        const cy2 = (p.base.y + p.chest.y) / 2 + bob;
        _a.set(cx2 + fx * 9 * sc, cy2 - 13 * sc, cz2 + fz * 9 * sc);
        _b.set(cx2 + fx * 9 * sc, cy2 + 13 * sc, cz2 + fz * 9 * sc);
        this.boxBetween(this.boxes, xi++, _a, _b,
                        22 * sc, 4 * sc, u.yaw, this.blend(spec.shield.color, team.main, 0.45));
      }

      if (u.weapon && bi < this.bones.instanceMatrix.count) {
        const t = u.weapon.tip;
        this.bone(this.bones, bi++, p.chest.x, p.chest.y + bob, p.chest.z,
                  t.x, t.y, t.z, 2.2 * sc, spec.weapon.color);
      }
    }

    for (const s of sim.shots) {
      if (ti >= this.shots.instanceMatrix.count) break;
      const h = s.head;
      const tx = s.tail ? s.tail.x : h.px, ty = s.tail ? s.tail.y : h.py, tz = s.tail ? s.tail.z : h.pz;
      this.bone(this.shots, ti++, tx, ty, tz, h.x, h.y, h.z, 1.6, 0x5a4630);
    }

    this.bones.count = bi; this.shots.count = ti; this.boxes.count = xi;
    for (const m of [this.bones, this.shots, this.boxes]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    this.updateCamera();
    this.renderer.render(this.scene, this.cam);
  }
}
