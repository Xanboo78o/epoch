// EPOCH — hand-authored maps, built out of blocks.
//
// The world is a heightmap, so a tile has exactly one height: there are no
// overhangs and no holes. That rules out windows and doorways with lintels.
// What it does support is walls, crenellations, stepped pitched roofs, towers
// and terraces, which from a locked -60 degree camera is what reads as a town.
// Buildings with roofs are solid; compounds are left open so troops can hold
// the courtyard.

import { MAT } from './terrain.js';

export function makeKit(T) {
  const set = (i, j, lv, m) => T.set(Math.round(i), Math.round(j), lv, m);

  const kit = {
    // A solid rectangle of blocks at one height.
    slab(x0, z0, x1, z1, lv, m) {
      for (let j = Math.min(z0, z1); j <= Math.max(z0, z1); j++)
        for (let i = Math.min(x0, x1); i <= Math.max(x0, x1); i++) set(i, j, lv, m);
    },

    // Just the outline — the four walls of a building, one block thick.
    box(x0, z0, x1, z1, lv, m) {
      for (let i = x0; i <= x1; i++) { set(i, z0, lv, m); set(i, z1, lv, m); }
      for (let j = z0; j <= z1; j++) { set(x0, j, lv, m); set(x1, j, lv, m); }
    },

    // Battlements: every other block one higher than the walk.
    crenellate(x0, z0, x1, z1, lv, m) {
      for (let i = x0; i <= x1; i++) {
        for (const j of [z0, z1]) set(i, j, lv + ((i + j) % 2 ? 1 : 0), m);
      }
      for (let j = z0; j <= z1; j++) {
        for (const i of [x0, x1]) set(i, j, lv + ((i + j) % 2 ? 1 : 0), m);
      }
    },

    // A stepped pyramid roof: each ring inward is one block higher. This is
    // the shape that makes a box read as a house.
    roof(x0, z0, x1, z1, baseLv, m) {
      const w = x1 - x0, d = z1 - z0;
      for (let j = 0; j <= d; j++) {
        for (let i = 0; i <= w; i++) {
          const inset = Math.min(i, w - i, j, d - j);
          set(x0 + i, z0 + j, baseLv + inset, m);
        }
      }
    },

    // Walls up, then a roof on top. Solid inside — a heightmap cannot hollow it.
    house(cx, cz, w, d, wallH, wallMat, roofMat) {
      const x0 = Math.round(cx - w / 2), x1 = Math.round(cx + w / 2);
      const z0 = Math.round(cz - d / 2), z1 = Math.round(cz + d / 2);
      kit.slab(x0, z0, x1, z1, wallH, wallMat);
      kit.roof(x0, z0, x1, z1, wallH + 1, roofMat);
      // a step at the door so it reads as an entrance
      set(cx, z1 + 1, 1, MAT.cobble);
      set(cx, z1 + 2, 1, MAT.cobble);
    },

    // Four walls around an open yard — troops can fight inside this one.
    compound(cx, cz, w, d, wallH, m, gateSide = 'S') {
      const x0 = Math.round(cx - w / 2), x1 = Math.round(cx + w / 2);
      const z0 = Math.round(cz - d / 2), z1 = Math.round(cz + d / 2);
      kit.slab(x0 + 1, z0 + 1, x1 - 1, z1 - 1, 0, MAT.dirt);
      kit.box(x0, z0, x1, z1, wallH, m);
      const g = gateSide === 'S' ? [cx, z1] : gateSide === 'N' ? [cx, z0]
              : gateSide === 'W' ? [x0, cz] : [x1, cz];
      set(g[0], g[1], 0, MAT.road);
      set(g[0] + (gateSide === 'N' || gateSide === 'S' ? 1 : 0),
          g[1] + (gateSide === 'E' || gateSide === 'W' ? 1 : 0), 0, MAT.road);
    },

    tower(cx, cz, r, h, m) {
      for (let j = -r; j <= r; j++)
        for (let i = -r; i <= r; i++)
          if (Math.hypot(i, j) <= r + 0.3) set(cx + i, cz + j, h, m);
      // battlement ring on top
      for (let a = 0; a < 40; a++) {
        const i = Math.round(Math.cos(a / 40 * 6.2832) * r);
        const j = Math.round(Math.sin(a / 40 * 6.2832) * r);
        if ((i + j) % 2 === 0) set(cx + i, cz + j, h + 1, m);
      }
    },

    // A run of wall with a walkway and battlements.
    rampart(x0, z0, x1, z1, h, m, thick = 2) {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const ci = Math.round(x0 + (x1 - x0) * t), cj = Math.round(z0 + (z1 - z0) * t);
        for (let o = 0; o < thick; o++) {
          const i = (z0 === z1) ? ci : ci + o;
          const j = (z0 === z1) ? cj + o : cj;
          const crenel = (o === 0 || o === thick - 1) && ((ci + cj) % 2 === 0);
          set(i, j, h + (crenel ? 1 : 0), m);
        }
      }
    },

    // Columns down both sides of a space — a colonnade.
    colonnade(x0, z0, x1, z1, h, m, gap = 3) {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
      for (let s = 0; s <= steps; s += gap) {
        const t = s / steps;
        const i = Math.round(x0 + (x1 - x0) * t), j = Math.round(z0 + (z1 - z0) * t);
        set(i, j, h, m);
      }
    },

    // A single column with a slab capital half a block proud of the shaft.
    column(i, j, h, m) { set(i, j, h, m); },

    // A GABLE roof: a ridge along the long axis, falling half a block per
    // course. Slabs are what make this possible — a pyramid roof in whole
    // blocks is the only shape you can build without them, and every building
    // in the city ends up looking like the same ziggurat.
    gable(x0, z0, x1, z1, baseLv, m) {
      const w = x1 - x0, d = z1 - z0;
      const alongX = w >= d;
      const span = alongX ? d : w;
      for (let j = z0; j <= z1; j++) {
        for (let i = x0; i <= x1; i++) {
          const off = alongX ? Math.min(j - z0, z1 - j) : Math.min(i - x0, x1 - i);
          set(i, j, baseLv + Math.min(off, Math.floor(span / 2)), m);
        }
      }
    },

    // A flight of slab steps climbing from lo to hi along one axis.
    steps(x0, z0, x1, z1, lo, hi, m) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
      for (let s = 0; s <= n; s++) {
        const t = s / n;
        const i = Math.round(x0 + (x1 - x0) * t), j = Math.round(z0 + (z1 - z0) * t);
        const lv = Math.round(lo + (hi - lo) * t);
        const perp = Math.abs(x1 - x0) > Math.abs(z1 - z0);
        for (let o = -2; o <= 2; o++) set(perp ? i : i + o, perp ? j + o : j, lv, m);
      }
    },

    // One slab high at the edge of a street: a kerb. Costs nothing and does
    // more for a city reading as a city than any amount of texture.
    kerb(x0, z0, x1, z1, m) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
      for (let s = 0; s <= n; s++) {
        const t = s / n;
        set(Math.round(x0 + (x1 - x0) * t), Math.round(z0 + (z1 - z0) * t), 1, m);
      }
    },

    // A townhouse: plinth, walls, a gable roof, and a porch step at the door.
    insula(cx, cz, w, d, storeys, wallMat, roofMat) {
      const x0 = Math.round(cx - w / 2), x1 = Math.round(cx + w / 2);
      const z0 = Math.round(cz - d / 2), z1 = Math.round(cz + d / 2);
      const wallH = storeys * 6;                 // 3 blocks a storey
      kit.slab(x0 - 1, z0 - 1, x1 + 1, z1 + 1, 1, MAT.cobble);   // plinth
      kit.slab(x0, z0, x1, z1, wallH, wallMat);
      kit.gable(x0 - 1, z0 - 1, x1 + 1, z1 + 1, wallH + 1, roofMat);
      set(cx, z1 + 1, 1, MAT.cobble);
      set(cx, z1 + 2, 0, MAT.cobble);
    },

    // A yard enclosed by rooms on all four sides.
    courtyardBlock(cx, cz, w, d, wallMat, roofMat) {
      const x0 = Math.round(cx - w / 2), x1 = Math.round(cx + w / 2);
      const z0 = Math.round(cz - d / 2), z1 = Math.round(cz + d / 2);
      kit.slab(x0, z0, x1, z1, 0, MAT.dirt);
      kit.slab(x0, z0, x1, z0 + 2, 10, wallMat); kit.gable(x0, z0, x1, z0 + 2, 11, roofMat);
      kit.slab(x0, z1 - 2, x1, z1, 10, wallMat); kit.gable(x0, z1 - 2, x1, z1, 11, roofMat);
      kit.slab(x0, z0, x0 + 2, z1, 10, wallMat); kit.gable(x0, z0, x0 + 2, z1, 11, roofMat);
      kit.slab(x1 - 2, z0, x1, z1, 10, wallMat); kit.gable(x1 - 2, z0, x1, z1, 11, roofMat);
      set(cx, z1, 0, MAT.cobble); set(cx, z1 - 1, 0, MAT.dirt);   // doorway
    },

    well(i, j) {
      kit.box(i - 1, j - 1, i + 1, j + 1, 2, MAT.cobble);
      set(i, j, 0, MAT.water);
    },

    statue(i, j, h, m) {
      set(i, j, h, m);
      set(i, j, h + 1, MAT.marble);
      kit.slab(i - 1, j - 1, i + 1, j + 1, 2, MAT.marble);
      set(i, j, h + 1, MAT.marble);
    },

    // Stepped seating around an arena floor.
    amphitheatre(cx, cz, rOuter, rInner, m, floorMat) {
      for (let j = -rOuter; j <= rOuter; j++) {
        for (let i = -rOuter; i <= rOuter; i++) {
          const d = Math.hypot(i * 0.8, j);
          if (d > rOuter) continue;
          if (d < rInner) { set(cx + i, cz + j, 0, floorMat); continue; }
          const tier = (Math.floor((d - rInner) / 1.5) + 1) * 2;
          set(cx + i, cz + j, tier, m);
        }
      }
    },

    aqueduct(x0, z0, x1, z1, h, m) {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const i = Math.round(x0 + (x1 - x0) * t), j = Math.round(z0 + (z1 - z0) * t);
        set(i, j, h, m);
        if (s % 6 === 0) {
          const px = (z0 === z1) ? 0 : 1, pz = (z0 === z1) ? 1 : 0;
          set(i + px, j + pz, h - 1, m);
          set(i - px, j - pz, h - 1, m);
        }
      }
    },

    field(x0, z0, x1, z1, rowDir = 'z') {
      kit.slab(x0, z0, x1, z1, 0, MAT.crop);
      if (rowDir === 'z') for (let i = x0; i <= x1; i += 3) kit.slab(i, z0, i, z1, 0, MAT.dirt);
      else for (let j = z0; j <= z1; j += 3) kit.slab(x0, j, x1, j, 0, MAT.dirt);
    },

    fence(x0, z0, x1, z1) {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        set(Math.round(x0 + (x1 - x0) * t), Math.round(z0 + (z1 - z0) * t), 2, MAT.timber);
      }
    },

    orchard(x0, z0, x1, z1, spacing = 4) {
      for (let j = z0; j <= z1; j += spacing)
        for (let i = x0; i <= x1; i += spacing) set(i, j, 0, MAT.wood);
    },
  };
  return kit;
}

// ---------------------------------------------------------------- ROME ----
export function buildRome(T) {
  const k = makeKit(T);
  // Heights are written in BLOCKS; storage is half-blocks so slabs exist.
  const B = (n) => Math.round(n * 2);
  const S = (n) => Math.round(n * 2 + 1);     // n blocks and a slab
  T.fill(MAT.grass, 0);

  // ============================ the river ==================================
  k.slab(0, 116, 191, 127, 0, MAT.water);
  k.slab(0, 113, 191, 115, 0, MAT.sand);
  k.slab(0, 128, 191, 130, 0, MAT.sand);

  // quays: a stone edge a block above the water, with steps down to it
  k.slab(24, 112, 150, 113, B(1), MAT.stone);
  k.slab(24, 130, 150, 131, B(1), MAT.stone);
  for (let i = 34; i < 150; i += 22) {
    k.steps(i, 113, i, 116, B(1), 0, MAT.stone);
    k.slab(i - 3, 108, i + 3, 111, B(1), MAT.cobble);        // loading aprons
  }
  // warehouses along the north bank
  for (let i = 30; i < 144; i += 17) {
    k.insula(i + 6, 103, 12, 8, 2, MAT.brick, MAT.timber);
  }

  // ============================ the bridge =================================
  k.slab(92, 110, 99, 133, B(1), MAT.cobble);
  k.slab(92, 110, 92, 133, B(2), MAT.stone);       // parapets
  k.slab(99, 110, 99, 133, B(2), MAT.stone);
  for (const j of [118, 125]) {                    // piers standing in the water
    k.slab(93, j, 98, j + 1, B(1), MAT.stone);
  }
  k.slab(93, 133, 98, 150, 0, MAT.road);

  // ============================ the walls ==================================
  k.slab(28, 14, 164, 104, 0, MAT.cobble);
  k.rampart(28, 14, 164, 14, B(9), MAT.stone, 3);
  k.rampart(28, 104, 164, 104, B(9), MAT.stone, 3);
  k.rampart(28, 14, 28, 104, B(9), MAT.stone, 3);
  k.rampart(164, 14, 164, 104, B(9), MAT.stone, 3);
  for (const [i, j] of [[28,14],[164,14],[28,104],[164,104]]) k.tower(i, j, 4, B(13), MAT.stone);
  // interval towers, the way a real curtain wall has them
  for (let i = 50; i < 164; i += 26) { k.tower(i, 14, 3, B(11), MAT.stone); k.tower(i, 104, 3, B(11), MAT.stone); }
  for (let j = 36; j < 104; j += 26) { k.tower(28, j, 3, B(11), MAT.stone); k.tower(164, j, 3, B(11), MAT.stone); }

  // gates with real gatehouses: a passage, flanking towers, a step up inside
  const gates = [[96, 14, 0, -1], [96, 104, 0, 1], [28, 59, -1, 0], [164, 59, 1, 0]];
  for (const [gi, gj, dx, dz] of gates) {
    k.slab(gi - 2, gj - 3, gi + 2, gj + 3, 0, MAT.road);
    if (dz) { k.tower(gi - 6, gj, 3, B(14), MAT.stone); k.tower(gi + 6, gj, 3, B(14), MAT.stone); }
    else { k.tower(gi, gj - 6, 3, B(14), MAT.stone); k.tower(gi, gj + 6, 3, B(14), MAT.stone); }
    k.slab(gi - 2 + dx * 4, gj - 2 + dz * 4, gi + 2 + dx * 4, gj + 2 + dz * 4, 0, MAT.road);
  }

  // ============================ the streets ================================
  // two great avenues, kerbed, crossing at the forum
  k.slab(93, 15, 99, 103, 0, MAT.road);
  k.slab(29, 56, 163, 62, 0, MAT.road);
  k.kerb(92, 15, 92, 103, MAT.cobble); k.kerb(100, 15, 100, 103, MAT.cobble);
  k.kerb(29, 55, 163, 55, MAT.cobble); k.kerb(29, 63, 163, 63, MAT.cobble);
  // side streets
  for (let i = 40; i < 164; i += 18) if (Math.abs(i - 96) > 8) k.slab(i, 16, i + 2, 102, 0, MAT.cobble);
  for (let j = 24; j < 104; j += 16) if (Math.abs(j - 59) > 8) k.slab(29, j, 163, j + 1, 0, MAT.cobble);

  // ============================ the forum ==================================
  k.slab(76, 40, 120, 78, B(1), MAT.marble);
  k.steps(76, 79, 120, 79, B(1), 0, MAT.marble);
  k.colonnade(78, 42, 118, 42, B(7), MAT.marble, 3);
  k.colonnade(78, 76, 118, 76, B(7), MAT.marble, 3);
  k.colonnade(78, 42, 78, 76, B(7), MAT.marble, 3);
  k.colonnade(118, 42, 118, 76, B(7), MAT.marble, 3);
  k.statue(98, 59, B(4), MAT.marble);
  k.well(84, 70); k.well(112, 70);

  // the temple: podium, a broad flight of steps, deep porch, gable roof
  k.slab(86, 44, 110, 64, B(3), MAT.marble);
  k.steps(98, 65, 98, 69, B(3), B(1), MAT.marble);
  k.colonnade(88, 46, 108, 46, B(9), MAT.marble, 2);
  k.colonnade(88, 62, 108, 62, B(9), MAT.marble, 2);
  k.colonnade(88, 46, 88, 62, B(9), MAT.marble, 2);
  k.colonnade(108, 46, 108, 62, B(9), MAT.marble, 2);
  k.gable(86, 44, 110, 64, B(10), MAT.brick);

  // the basilica, west of the forum
  k.slab(46, 40, 70, 56, B(8), MAT.plaster);
  k.gable(45, 39, 71, 57, B(9), MAT.timber);
  k.colonnade(46, 58, 70, 58, B(6), MAT.marble, 3);

  // the curia, east
  k.insula(140, 46, 18, 14, 3, MAT.plaster, MAT.brick);

  // ============================ the amphitheatre ===========================
  k.amphitheatre(136, 86, 19, 9, MAT.stone, MAT.sand);
  k.steps(136, 106, 136, 102, 0, B(2), MAT.stone);

  // ============================ the baths ==================================
  k.slab(44, 78, 74, 96, B(6), MAT.brick);
  k.gable(43, 77, 75, 97, B(7), MAT.plaster);
  k.slab(50, 84, 68, 92, 0, MAT.water);       // the pool, open to the sky
  k.slab(48, 82, 70, 83, B(1), MAT.marble);
  k.slab(48, 93, 70, 94, B(1), MAT.marble);

  // ============================ housing ====================================
  // Varied sizes and materials, set along the side streets, with the odd
  // courtyard block and a market square left open.
  const roofs = [MAT.brick, MAT.thatch, MAT.timber];
  let n = 0;
  for (let i = 33; i < 160; i += 18) {
    for (let j = 18; j < 100; j += 16) {
      const cx = i + 7, cz = j + 6;
      if (cx > 70 && cx < 126 && cz > 36 && cz < 82) continue;    // forum
      if (Math.hypot((cx - 136) * 0.8, cz - 86) < 24) continue;   // amphitheatre
      if (cx > 40 && cx < 78 && cz > 74 && cz < 100) continue;    // baths
      if (cx > 40 && cx < 74 && cz > 36 && cz < 60) continue;     // basilica
      if (cz > 98) continue;                                       // warehouses
      n++;
      if (n % 7 === 0) { k.slab(cx - 6, cz - 5, cx + 6, cz + 5, 0, MAT.cobble); k.well(cx, cz); continue; }
      if (n % 4 === 0) k.courtyardBlock(cx, cz, 13, 11, MAT.plaster, roofs[n % 3]);
      else k.insula(cx, cz, 9 + (n % 4), 7 + (n % 3), 2 + (n % 3), MAT.plaster, roofs[n % 3]);
    }
  }

  // ============================ the aqueduct ===============================
  k.aqueduct(191, 30, 165, 30, B(9), MAT.stone);
  k.aqueduct(165, 30, 165, 44, B(9), MAT.stone);

  // ============================ outside the walls ==========================
  k.field(14, 140, 58, 176, 'z');
  k.field(68, 148, 104, 178, 'x');
  k.fence(10, 136, 108, 136); k.fence(10, 180, 108, 180);
  k.fence(10, 136, 10, 180); k.fence(108, 136, 108, 180);
  k.courtyardBlock(32, 152, 17, 14, MAT.plaster, MAT.thatch);   // the villa
  k.insula(28, 145, 11, 8, 2, MAT.plaster, MAT.thatch);
  k.orchard(118, 138, 176, 178, 5);
  k.orchard(6, 22, 24, 100, 4);                                  // woodland outside the west wall
  k.slab(93, 150, 99, 180, 0, MAT.road);

  T.markAllDirty();
  return { name: 'Rome, 230 BC' };
}
