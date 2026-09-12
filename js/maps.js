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
        set(Math.round(x0 + (x1 - x0) * t), Math.round(z0 + (z1 - z0) * t), h, m);
      }
    },

    // Stepped seating around an arena floor.
    amphitheatre(cx, cz, rOuter, rInner, m, floorMat) {
      for (let j = -rOuter; j <= rOuter; j++) {
        for (let i = -rOuter; i <= rOuter; i++) {
          const d = Math.hypot(i * 0.8, j);
          if (d > rOuter) continue;
          if (d < rInner) { set(cx + i, cz + j, 0, floorMat); continue; }
          const tier = Math.floor((d - rInner) / 1.5) + 1;
          set(cx + i, cz + j, tier, m);
        }
      }
    },

    // Piers carrying a raised channel — reads as an aqueduct from above.
    aqueduct(x0, z0, x1, z1, h, m) {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const i = Math.round(x0 + (x1 - x0) * t), j = Math.round(z0 + (z1 - z0) * t);
        const pier = (s % 6 === 0);
        set(i, j, h, m);
        if (pier) {
          const px = (z0 === z1) ? 0 : 1, pz = (z0 === z1) ? 1 : 0;
          set(i + px, j + pz, h - 1, m);
          set(i - px, j - pz, h - 1, m);
        }
      }
    },

    field(x0, z0, x1, z1, rowDir = 'z') {
      kit.slab(x0, z0, x1, z1, 0, MAT.crop);
      if (rowDir === 'z') {
        for (let i = x0; i <= x1; i += 3) kit.slab(i, z0, i, z1, 0, MAT.dirt);
      } else {
        for (let j = z0; j <= z1; j += 3) kit.slab(x0, j, x1, j, 0, MAT.dirt);
      }
    },

    fence(x0, z0, x1, z1) {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        set(Math.round(x0 + (x1 - x0) * t), Math.round(z0 + (z1 - z0) * t), 1, MAT.timber);
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
  T.fill(MAT.grass, 0);

  // --- the river, and the sand along it ---
  k.slab(0, 118, 191, 126, 0, MAT.water);
  k.slab(0, 115, 191, 117, 0, MAT.sand);
  k.slab(0, 127, 191, 129, 0, MAT.sand);

  // --- the bridge, with a raised deck and stone parapets ---
  k.slab(92, 114, 99, 130, 1, MAT.cobble);
  k.slab(92, 114, 92, 130, 2, MAT.stone);
  k.slab(99, 114, 99, 130, 2, MAT.stone);
  k.slab(93, 100, 98, 115, 0, MAT.road);
  k.slab(93, 129, 98, 150, 0, MAT.road);

  // --- the city, north of the river ---
  k.slab(40, 22, 152, 106, 0, MAT.cobble);
  // ramparts with towers at every corner and beside every gate
  k.rampart(40, 22, 152, 22, 9, MAT.stone, 3);
  k.rampart(40, 106, 152, 106, 9, MAT.stone, 3);
  k.rampart(40, 22, 40, 106, 9, MAT.stone, 3);
  k.rampart(152, 22, 152, 106, 9, MAT.stone, 3);
  for (const [i, j] of [[40,22],[152,22],[40,106],[152,106]]) k.tower(i, j, 4, 12, MAT.stone);

  // four gates, each flanked by a pair of towers
  const gates = [[96, 22, 'N'], [96, 106, 'S'], [40, 64, 'W'], [152, 64, 'E']];
  for (const [gi, gj, side] of gates) {
    if (side === 'N' || side === 'S') {
      k.slab(gi - 2, gj - 2, gi + 2, gj + 2, 0, MAT.road);
      k.tower(gi - 5, gj, 3, 13, MAT.stone);
      k.tower(gi + 5, gj, 3, 13, MAT.stone);
    } else {
      k.slab(gi - 2, gj - 2, gi + 2, gj + 2, 0, MAT.road);
      k.tower(gi, gj - 5, 3, 13, MAT.stone);
      k.tower(gi, gj + 5, 3, 13, MAT.stone);
    }
  }

  // --- street grid ---
  for (let i = 52; i < 152; i += 16) k.slab(i, 24, i + 1, 104, 0, MAT.road);
  for (let j = 32; j < 106; j += 14) k.slab(42, j, 150, j + 1, 0, MAT.road);

  // --- insulae: blocks of housing between the streets ---
  const roofs = [MAT.brick, MAT.thatch, MAT.timber];
  let n = 0;
  for (let i = 44; i < 148; i += 16) {
    for (let j = 24; j < 100; j += 14) {
      const cx = i + 5, cz = j + 5;
      if (Math.abs(cx - 96) < 22 && Math.abs(cz - 64) < 18) continue;   // forum
      if (Math.hypot((cx - 128) * 0.8, cz - 88) < 20) continue;         // amphitheatre
      n++;
      if (n % 5 === 0) k.compound(cx, cz, 10, 9, 4, MAT.plaster, 'S');
      else k.house(cx, cz, 9 - (n % 3), 8 - (n % 2), 4 + (n % 3), MAT.plaster, roofs[n % 3]);
    }
  }

  // --- the forum: a marble plaza, a colonnade, and a temple ---
  k.slab(80, 52, 112, 78, 1, MAT.marble);
  k.colonnade(80, 52, 112, 52, 6, MAT.marble, 3);
  k.colonnade(80, 78, 112, 78, 6, MAT.marble, 3);
  k.colonnade(80, 52, 80, 78, 6, MAT.marble, 3);
  k.colonnade(112, 52, 112, 78, 6, MAT.marble, 3);
  // the temple on its podium
  k.slab(90, 60, 102, 72, 3, MAT.marble);
  k.colonnade(90, 60, 102, 60, 8, MAT.marble, 2);
  k.colonnade(90, 72, 102, 72, 8, MAT.marble, 2);
  k.roof(90, 60, 102, 72, 9, MAT.brick);

  // --- the amphitheatre ---
  k.amphitheatre(128, 88, 18, 9, MAT.stone, MAT.sand);

  // --- the aqueduct, marching in from the east ---
  k.aqueduct(191, 40, 153, 40, 8, MAT.stone);

  // --- farmland, south of the river ---
  k.field(16, 140, 60, 176, 'z');
  k.field(70, 148, 104, 176, 'x');
  k.fence(12, 136, 108, 136);
  k.fence(12, 180, 108, 180);
  k.fence(12, 136, 12, 180);
  k.fence(108, 136, 108, 180);
  k.compound(34, 150, 14, 12, 4, MAT.plaster, 'N');      // the villa yard
  k.house(30, 146, 9, 7, 5, MAT.plaster, MAT.thatch);
  k.orchard(120, 140, 172, 176, 5);
  k.slab(93, 150, 98, 180, 0, MAT.road);

  // --- woodland on the north-west shoulder ---
  k.orchard(6, 30, 34, 96, 4);

  T.markAllDirty();
  return { name: 'Rome, 230 BC' };
}
