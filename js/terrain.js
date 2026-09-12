// EPOCH — the ground: a heightmap over XZ, bilinearly sampled.

export class Terrain {
  constructor(halfSize = 3000, step = 40) {
    this.half = halfSize;
    this.step = step;
    this.n = Math.floor((halfSize * 2) / step) + 1;   // samples per side
    this.h = new Float32Array(this.n * this.n);
    this.version = 0;
  }

  xOf(i) { return -this.half + i * this.step; }
  iOf(x) { return (x + this.half) / this.step; }
  at(i, j) {
    const n = this.n;
    if (i < 0) i = 0; else if (i >= n) i = n - 1;
    if (j < 0) j = 0; else if (j >= n) j = n - 1;
    return this.h[j * n + i];
  }

  heightAt(x, z) {
    const fx = this.iOf(x), fz = this.iOf(z);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const a = this.at(i, j), b = this.at(i + 1, j);
    const c = this.at(i, j + 1), d = this.at(i + 1, j + 1);
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }

  normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
    const e = this.step;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const nx = -hx, ny = 2 * e, nz = -hz;
    const len = Math.hypot(nx, ny, nz) || 1;
    out.x = nx / len; out.y = ny / len; out.z = nz / len;
    return out;
  }

  // steepness 0..1, for walk cost
  slopeAt(x, z) {
    const n = this.normalAt(x, z, this._n || (this._n = { x: 0, y: 1, z: 0 }));
    return 1 - Math.max(0, Math.min(1, n.y));
  }

  // --- editing ---
  raise(x, z, radius, amount) {
    const i0 = Math.max(0, Math.floor(this.iOf(x - radius)));
    const i1 = Math.min(this.n - 1, Math.ceil(this.iOf(x + radius)));
    const j0 = Math.max(0, Math.floor(this.iOf(z - radius)));
    const j1 = Math.min(this.n - 1, Math.ceil(this.iOf(z + radius)));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(this.xOf(i) - x, this.xOf(j) - z) / radius;
        if (d > 1) continue;
        const fall = Math.cos(d * Math.PI * 0.5) ** 2;
        this.h[j * this.n + i] += amount * fall;
      }
    }
    this.version++;
  }

  smooth(x, z, radius) {
    const n = this.n;
    const i0 = Math.max(1, Math.floor(this.iOf(x - radius)));
    const i1 = Math.min(n - 2, Math.ceil(this.iOf(x + radius)));
    const j0 = Math.max(1, Math.floor(this.iOf(z - radius)));
    const j1 = Math.min(n - 2, Math.ceil(this.iOf(z + radius)));
    const copy = Float32Array.from(this.h);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(this.xOf(i) - x, this.xOf(j) - z) / radius;
        if (d > 1) continue;
        const avg = (copy[j * n + i] * 4 + copy[j * n + i - 1] + copy[j * n + i + 1]
                   + copy[(j - 1) * n + i] + copy[(j + 1) * n + i]) / 8;
        const fall = Math.cos(d * Math.PI * 0.5) ** 2;
        this.h[j * n + i] += (avg - this.h[j * n + i]) * fall;
      }
    }
    this.version++;
  }

  clear() { this.h.fill(0); this.version++; }

  // Hand-authored landforms: each is an explicit shape, never noise.
  // { type:'hill'|'ridge'|'basin', x, z, r, height, [x2, z2] }
  applyFeatures(features) {
    this.h.fill(0);
    for (const f of features || []) {
      if (f.type === 'ridge') {
        // a capsule: distance to the segment (x,z)-(x2,z2)
        const ax = f.x, az = f.z, bx = f.x2, bz = f.z2;
        const dx = bx - ax, dz = bz - az;
        const L2 = dx * dx + dz * dz || 1;
        for (let j = 0; j < this.n; j++) {
          for (let i = 0; i < this.n; i++) {
            const px = this.xOf(i), pz = this.xOf(j);
            let t = ((px - ax) * dx + (pz - az) * dz) / L2;
            t = Math.max(0, Math.min(1, t));
            const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t)) / f.r;
            if (d > 1) continue;
            this.h[j * this.n + i] += f.height * Math.cos(d * Math.PI * 0.5) ** 2;
          }
        }
      } else {
        const sign = f.type === 'basin' ? -1 : 1;
        for (let j = 0; j < this.n; j++) {
          for (let i = 0; i < this.n; i++) {
            const d = Math.hypot(this.xOf(i) - f.x, this.xOf(j) - f.z) / f.r;
            if (d > 1) continue;
            this.h[j * this.n + i] += sign * f.height * Math.cos(d * Math.PI * 0.5) ** 2;
          }
        }
      }
    }
    this.version++;
  }
}
