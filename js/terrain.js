// EPOCH — the world is a TILE GRID. Each tile is flat, sits at an integer
// height level, and has a type. Units step up and down between levels; there
// is no smooth ground anywhere.

// A block is a PERFECT CUBE: as wide as it is tall. A soldier is 72 units,
// which is exactly four blocks — the grid is fine enough to build a house with
// a door and a window in it.
export const BLOCK = 18;
export const TILE = BLOCK;
export const LEVEL = BLOCK;
export const CHUNK = 32;       // tiles per chunk edge; meshes rebuild per chunk

// Ground materials you find, then building materials you place. A wall is
// nothing more than tiles raised a few levels with a build material on them.
export const MATS = [
  { id: 'grass',  name: 'Grass',      top: 0x7d9450, side: 0x5d6f3c, build: false },
  { id: 'dirt',   name: 'Dirt',       top: 0x9a7a4e, side: 0x6f5836, build: false },
  { id: 'rock',   name: 'Rock',       top: 0x8e8a80, side: 0x66635c, build: false },
  { id: 'water',  name: 'Water',      top: 0x4d7fa8, side: 0x3a6183, build: false, liquid: true },
  { id: 'sand',   name: 'Sand',       top: 0xd6c88c, side: 0xa89c69, build: false },
  { id: 'crop',   name: 'Crop',       top: 0xbfa83f, side: 0x8d7a2c, build: false },
  { id: 'wood',   name: 'Woodland',   top: 0x3f5b33, side: 0x2b3e23, build: false },
  { id: 'road',   name: 'Road',       top: 0xb9a375, side: 0x8b7a57, build: false },
  // --- build materials ---
  { id: 'stone',  name: 'Stone Wall', top: 0xa9a294, side: 0x7e786c, build: true },
  { id: 'brick',  name: 'Brick',      top: 0xa8593f, side: 0x7c412d, build: true },
  { id: 'marble', name: 'Marble',     top: 0xe6e2d6, side: 0xb9b4a6, build: true },
  { id: 'timber', name: 'Timber',     top: 0x8a6a43, side: 0x634c30, build: true },
  { id: 'thatch', name: 'Thatch',     top: 0xc8a94f, side: 0x957c36, build: true },
  { id: 'plaster',name: 'Plaster',    top: 0xded3bb, side: 0xa89e8b, build: true },
  { id: 'cobble', name: 'Cobble',     top: 0x9b9790, side: 0x716e68, build: true },
  { id: 'rubble', name: 'Rubble',     top: 0x8c8377, side: 0x655e55, build: true },
];
export const MAT = Object.fromEntries(MATS.map((m, i) => [m.id, i]));

export const T_GRASS = 0, T_DIRT = 1, T_ROCK = 2, T_WATER = 3, T_SAND = 4,
             T_CROP = 5, T_WOOD = 6, T_ROAD = 7;

export const TILE_COLOUR = MATS.map(m => m.top);
export const TILE_SIDE = MATS.map(m => m.side);

// How many levels a soldier can step up in one stride. Everything about walls
// falls out of this number: three levels of stone cannot be climbed, so a gap
// left at one level is a gate, and a gate is a chokepoint.
export const CLIMB = 1;

export class Terrain {
  constructor(w = 192, h = 192) {
    this.w = w; this.h = h;
    this.level = new Int16Array(w * h);
    this.type = new Uint8Array(w * h);
    this.version = 0;
    this.cw = Math.ceil(w / CHUNK);
    this.ch = Math.ceil(h / CHUNK);
    this.dirty = new Set();          // chunk indices needing a mesh rebuild
    this.markAllDirty();
  }

  markAllDirty() {
    this.dirty.clear();
    for (let k = 0; k < this.cw * this.ch; k++) this.dirty.add(k);
  }
  // A tile edit dirties its own chunk and any neighbour it shares a face with,
  // because a wall quad belongs to the taller of the two tiles.
  touch(i, j) {
    const ci = (i / CHUNK) | 0, cj = (j / CHUNK) | 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const a = ci + di, b = cj + dj;
        if (a >= 0 && b >= 0 && a < this.cw && b < this.ch) this.dirty.add(b * this.cw + a);
      }
    }
  }

  // world <-> tile. The grid is centred on the origin.
  get halfX() { return this.w * TILE / 2; }
  get halfZ() { return this.h * TILE / 2; }
  tx(x) { return Math.floor((x + this.halfX) / TILE); }
  tz(z) { return Math.floor((z + this.halfZ) / TILE); }
  wx(i) { return -this.halfX + (i + 0.5) * TILE; }
  wz(j) { return -this.halfZ + (j + 0.5) * TILE; }
  inside(i, j) { return i >= 0 && j >= 0 && i < this.w && j < this.h; }
  idx(i, j) { return j * this.w + i; }

  levelAt(i, j) {
    if (i < 0) i = 0; else if (i >= this.w) i = this.w - 1;
    if (j < 0) j = 0; else if (j >= this.h) j = this.h - 1;
    return this.level[j * this.w + i];
  }
  typeAt(i, j) {
    if (i < 0) i = 0; else if (i >= this.w) i = this.w - 1;
    if (j < 0) j = 0; else if (j >= this.h) j = this.h - 1;
    return this.type[j * this.w + i];
  }

  // Flat within a tile — that is the whole point of tiles.
  heightAt(x, z) { return this.levelAt(this.tx(x), this.tz(z)) * LEVEL; }

  set(i, j, level, type) {
    if (!this.inside(i, j)) return;
    const k = this.idx(i, j);
    if (level !== undefined) this.level[k] = level;
    if (type !== undefined) this.type[k] = type;
    this.touch(i, j);
    this.version++;
  }

  fill(type, level = 0) {
    this.type.fill(type); this.level.fill(level);
    this.markAllDirty(); this.version++;
  }

  // --- hand-authored brushes (map authoring, never noise) ---
  stamp(cx, cz, r, level, type, soft = true) {
    for (let j = Math.floor(cz - r); j <= cz + r; j++) {
      for (let i = Math.floor(cx - r); i <= cx + r; i++) {
        if (!this.inside(i, j)) continue;
        const d = Math.hypot(i - cx, j - cz) / r;
        if (d > 1) continue;
        const k = this.idx(i, j);
        if (type !== undefined) this.type[k] = type;
        if (level !== undefined) {
          this.level[k] = soft ? Math.round(level * Math.cos(d * Math.PI * 0.5) ** 2) : level;
        }
        this.touch(i, j);
      }
    }
    this.version++;
  }

  // A path of tiles between two points — roads, rivers, walls.
  line(x0, z0, x1, z1, width, level, type) {
    const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0)) * 2 + 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = x0 + (x1 - x0) * t, cz = z0 + (z1 - z0) * t;
      for (let j = Math.floor(cz - width); j <= cz + width; j++) {
        for (let i = Math.floor(cx - width); i <= cx + width; i++) {
          if (!this.inside(i, j)) continue;
          if (Math.hypot(i - cx, j - cz) > width) continue;
          const k = this.idx(i, j);
          if (type !== undefined) this.type[k] = type;
          if (level !== undefined) this.level[k] = level;
          this.touch(i, j);
        }
      }
    }
    this.version++;
  }

  // Terrain a unit cannot stand on at all.
  blocked(i, j) {
    if (!this.inside(i, j)) return true;
    return MATS[this.typeAt(i, j)].liquid === true;
  }

  // Can a unit walk from one tile to the next? Water stops you, and so does
  // anything more than CLIMB levels of step.
  passable(i0, j0, i1, j1) {
    if (this.blocked(i1, j1)) return false;
    return (this.levelAt(i1, j1) - this.levelAt(i0, j0)) <= CLIMB;
  }

  // Cost hint for movement — mud and crops slow you, roads speed you up.
  speedAt(x, z) {
    const t = this.typeAt(this.tx(x), this.tz(z));
    if (t === T_ROAD) return 1.25;
    if (t === T_CROP) return 0.8;
    if (t === T_DIRT) return 0.9;
    if (t === T_WOOD) return 0.7;
    return 1;
  }
}
