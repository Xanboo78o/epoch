// EPOCH — 2.5D renderer. Camera pitch is locked at -60 degrees and never
// rotates; you pan and you zoom, that is all.

import * as THREE from './vendor/three.module.min.js';

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
// Limbs only — the torso is a box, because a cylinder torso reads as a sausage.
// Radii are sized against a 72-unit-tall man: upper arm ~2.6, thigh ~3.4.
const BONES = [
  ['chest', 'head', 2.6, 'skin'],                                  // neck
  ['chest', 'elbowL', 2.7, 'cloth'], ['elbowL', 'handL', 2.3, 'skin'],
  ['chest', 'elbowR', 2.9, 'cloth'], ['elbowR', 'handR', 2.5, 'skin'],
  ['hip', 'kneeL', 3.4, 'kit'], ['kneeL', 'footL', 2.8, 'kit'],
  ['hip', 'kneeR', 3.5, 'kit'], ['kneeR', 'footR', 2.9, 'kit'],
];
const MAX_BONES = BONES.length + 1;   // +1 for the weapon shaft

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
    const boneGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
    boneGeo.computeVertexNormals();
    this.bones = this.makeInstanced(boneGeo, capacity * MAX_BONES, 0.35, 0.1);

    const headGeo = new THREE.SphereGeometry(1, 8, 6);
    this.heads = this.makeInstanced(headGeo, capacity, 0.5, 0.05);

    const shieldGeo = new THREE.BoxGeometry(1, 1, 1);
    this.shields = this.makeInstanced(shieldGeo, capacity, 0.45, 0.15);

    // torso + helmet + two boots, all boxes
    this.boxes = this.makeInstanced(new THREE.BoxGeometry(1, 1, 1), capacity * 4, 0.55, 0.08);

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

  buildTerrain(terrain) {
    if (this.terrainV === terrain.version && this.terrainMesh) return;
    this.terrainV = terrain.version;
    const n = terrain.n, size = terrain.half * 2;
    if (!this.terrainMesh) {
      const geo = new THREE.PlaneGeometry(size, size, n - 1, n - 1);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, flatShading: true, vertexColors: true });
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3));
      this.terrainMesh = new THREE.Mesh(geo, mat);
      this.terrainMesh.receiveShadow = true;
      this.scene.add(this.terrainMesh);
    }
    const pos = this.terrainMesh.geometry.attributes.position;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) pos.setY(j * n + i, terrain.at(i, j));
    }
    pos.needsUpdate = true;
    this.terrainMesh.geometry.computeVertexNormals();

    // Paint by height and steepness so relief actually reads from a locked
    // camera: grass low, pale dry grass high, bare earth on anything steep.
    const col = this.terrainMesh.geometry.attributes.color;
    const grass = new THREE.Color(0x7d9450), dry = new THREE.Color(0xb9b06a),
          rock = new THREE.Color(0x8a7a5f), c = new THREE.Color();
    const st = terrain.step;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const h = terrain.at(i, j);
        const dhx = (terrain.at(i + 1, j) - terrain.at(i - 1, j)) / (2 * st);
        const dhz = (terrain.at(i, j + 1) - terrain.at(i, j - 1)) / (2 * st);
        const steep = Math.min(1, Math.hypot(dhx, dhz) * 1.5);
        c.copy(grass).lerp(dry, Math.min(1, Math.max(0, h / 420)));
        c.lerp(rock, steep);
        col.setXYZ(j * n + i, c.r, c.g, c.b);
      }
    }
    col.needsUpdate = true;
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
    let bi = 0, hi = 0, si = 0, ti = 0, xi = 0;

    for (const u of sim.units) {
      const p = u.p, sc = u.spec.scale, spec = u.spec;
      const team = TEAM[u.team];
      const dim = u.alive ? 1 : 0.55;
      const cols = {
        cloth: this.blend(spec.cloth, team.main, 0.45),
        skin: spec.skin,
        kit: this.blend(spec.kit, team.main, 0.2),
      };
      if (u.flash > 0) { cols.skin = 0xff8d7a; }

      for (const [a, b, r, key] of BONES) {
        if (bi >= this.bones.instanceMatrix.count) break;
        const pa = p[a], pb = p[b];
        let col = cols[key];
        if (!u.alive) col = this.blend(col, 0x2a2118, 0.45);
        this.bone(this.bones, bi++, pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, r * sc, col);
      }
      if (u.weapon && bi < this.bones.instanceMatrix.count) {
        const t = u.weapon.tip;
        this.bone(this.bones, bi++, p.handR.x, p.handR.y, p.handR.z, t.x, t.y, t.z,
                  2.4 * sc, spec.weapon.color);
      }

      // torso
      if (xi < this.boxes.instanceMatrix.count - 3) {
        const tc = u.alive ? cols.cloth : this.blend(cols.cloth, 0x2a2118, 0.45);
        this.boxBetween(this.boxes, xi++, p.hip, p.chest, 17 * sc, 11 * sc, u.yaw, tc);
        // helmet, sitting on the head and tipped with it
        const hc = u.alive ? cols.kit : this.blend(cols.kit, 0x2a2118, 0.45);
        _a.set(p.head.x - p.chest.x, p.head.y - p.chest.y, p.head.z - p.chest.z).normalize();
        const hb = { x: p.head.x + _a.x * 5 * sc, y: p.head.y + _a.y * 5 * sc, z: p.head.z + _a.z * 5 * sc };
        this.boxBetween(this.boxes, xi++, p.head, hb, 11.5 * sc, 11.5 * sc, u.yaw, hc);
        // boots
        const bc = u.alive ? this.blend(cols.kit, 0x2a2118, 0.4) : 0x2a2118;
        for (const f of [p.footL, p.footR]) {
          const ft = { x: f.x + Math.sin(u.yaw) * 6 * sc, y: f.y, z: f.z + Math.cos(u.yaw) * 6 * sc };
          this.boxBetween(this.boxes, xi++, f, ft, 6.5 * sc, 4.5 * sc, u.yaw, bc);
        }
      }

      if (hi < this.heads.instanceMatrix.count) {
        _b.set(p.head.x, p.head.y, p.head.z);
        _q.identity();
        _s.setScalar(5.2 * sc);
        _m.compose(_b, _q, _s);
        this.heads.setMatrixAt(hi, _m);
        this.heads.setColorAt(hi, _c.setHex(u.alive ? cols.skin : this.blend(cols.skin, 0x2a2118, 0.5)));
        hi++;
      }

      if (u.shieldPts && si < this.shields.instanceMatrix.count) {
        const sh = u.shieldPts, sp = sh.spec;
        const mx = (sh.top.x + sh.bot.x) / 2, my = (sh.top.y + sh.bot.y) / 2, mz = (sh.top.z + sh.bot.z) / 2;
        const dx = sh.top.x - sh.bot.x, dy = sh.top.y - sh.bot.y, dz = sh.top.z - sh.bot.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        _a.set(dx / len, dy / len, dz / len);
        _q.setFromUnitVectors(_up, _a);
        _b.set(mx, my, mz);
        _s.set(sp.w * sc, len, sp.t * sc);
        _m.compose(_b, _q, _s);
        this.shields.setMatrixAt(si, _m);
        this.shields.setColorAt(si, _c.setHex(this.blend(sp.color, team.main, 0.5)));
        si++;
      }
    }

    for (const s of sim.shots) {
      if (ti >= this.shots.instanceMatrix.count) break;
      const h = s.head;
      const tx = s.tail ? s.tail.x : h.px, ty = s.tail ? s.tail.y : h.py, tz = s.tail ? s.tail.z : h.pz;
      this.bone(this.shots, ti++, tx, ty, tz, h.x, h.y, h.z, 1.6, 0x5a4630);
    }

    this.bones.count = bi; this.heads.count = hi; this.shields.count = si;
    this.shots.count = ti; this.boxes.count = xi;
    for (const m of [this.bones, this.heads, this.shields, this.shots, this.boxes]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    this.updateCamera();
    this.renderer.render(this.scene, this.cam);
  }
}
