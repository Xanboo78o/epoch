// EPOCH — flow-field pathing over the tile grid.
//
// Every unit on a side shares one field: a Dijkstra sweep outward from wherever
// the enemy is, across tiles you are actually allowed to walk on. A unit just
// reads the downhill direction of the cell it is standing in. That is what
// makes an army pour around a wall and funnel through the gate instead of
// pressing its face against the stonework.

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
];

export class FlowField {
  constructor(terrain) {
    this.t = terrain;
    this.n = terrain.w * terrain.h;
    this.cost = new Float32Array(this.n);
    this.ready = false;
  }

  // goals: array of [i, j] tile coords
  build(goals) {
    const t = this.t, W = t.w, H = t.h;
    this.cost.fill(Infinity);
    // A plain growable array, not a fixed Int32Array(n): this is Dijkstra with
    // re-push-on-improvement, so the queue legitimately holds more entries than
    // there are cells, and the old fixed buffer silently overflowed and left
    // the whole field unbuilt once the map grew to 37k tiles.
    let head = 0;
    const q = [];
    for (const [gi, gj] of goals) {
      if (!t.inside(gi, gj) || t.blocked(gi, gj)) continue;
      const k = gj * W + gi;
      if (this.cost[k] === 0) continue;
      this.cost[k] = 0;
      q.push(k);
    }
    if (q.length === 0) { this.ready = false; return; }

    // Uniform-cost sweep. Diagonals cost more, so a plain FIFO would be wrong;
    // re-pushing on improvement keeps it correct and is fast enough at 5k cells.
    while (head < q.length) {
      const k = q[head++];
      const i = k % W, j = (k / W) | 0;
      const base = this.cost[k];
      for (const [di, dj, w] of DIRS) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        if (!t.passable(ni, nj, i, j)) continue;      // can we step FROM there to here
        const step = w + Math.max(0, t.levelAt(ni, nj) - t.levelAt(i, j)) * 0.6
                       + (1 / t.speedAt(t.wx(ni), t.wz(nj)) - 1) * 1.2;
        const nk = nj * W + ni;
        if (base + step < this.cost[nk] - 1e-4) {
          this.cost[nk] = base + step;
          q.push(nk);
        }
      }
    }
    this.ready = true;
  }

  costAtTile(i, j) {
    const t = this.t;
    if (!t.inside(i, j)) return Infinity;
    return this.cost[j * t.w + i];
  }

  // Downhill direction in world space at (x, z). Returns null if there is no
  // route from here — the caller should then just face the enemy and wait.
  dirAt(x, z, out = { x: 0, z: 0 }) {
    const t = this.t;
    const i = t.tx(x), j = t.tz(z);
    if (!t.inside(i, j)) return null;
    let best = this.costAtTile(i, j), bi = 0, bj = 0;
    if (!isFinite(best)) return null;
    for (const [di, dj] of DIRS) {
      if (!t.passable(i, j, i + di, j + dj)) continue;
      const c = this.costAtTile(i + di, j + dj);
      if (c < best - 1e-4) { best = c; bi = di; bj = dj; }
    }
    if (!bi && !bj) return null;
    // aim at the centre of the chosen tile so units track the corridor
    const dx = t.wx(i + bi) - x, dz = t.wz(j + bj) - z;
    const d = Math.hypot(dx, dz) || 1;
    out.x = dx / d; out.z = dz / d;
    return out;
  }
}
