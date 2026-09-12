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

    // A wall circuit following hand-picked corners. Real cities are not
    // rectangles; they are whatever shape the ground and the history left.
    rampartPath(pts, h, m2, thick = 3) {
      for (let s = 0; s < pts.length - 1; s++) {
        kit.rampart(pts[s][0], pts[s][1], pts[s + 1][0], pts[s + 1][1], h, m2, thick);
      }
    },

    // A run of wall with a walkway and battlements.
    rampart(x0, z0, x1, z1, h, m, thick = 2) {
      // Thickness is laid out along the line's normal, so a wall can run at
      // any angle instead of only north-south or east-west.
      const len = Math.hypot(x1 - x0, z1 - z0) || 1;
      const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      const steps = Math.ceil(len) * 2;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const cx = x0 + (x1 - x0) * t, cz = z0 + (z1 - z0) * t;
        for (let o = -(thick - 1) / 2; o <= (thick - 1) / 2; o += 0.5) {
          const i = Math.round(cx + nx * o), j = Math.round(cz + nz * o);
          const outer = Math.abs(o) >= (thick - 1) / 2 - 0.01;
          set(i, j, h + (outer && ((i + j) % 2 === 0) ? 1 : 0), m);
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

    // --- rotated building blocks ------------------------------------------
    // The grid is square but buildings need not be. Transforming each cell
    // into the building's own frame gives a stepped, jagged footprint, which
    // is exactly what a rotated building looks like when it is made of blocks.
    rotCells(cx, cz, w, d, ang, fn) {
      const c = Math.cos(-ang), s = Math.sin(-ang);
      const rad = Math.ceil(Math.hypot(w, d) / 2) + 1;
      for (let j = Math.floor(cz - rad); j <= cz + rad; j++) {
        for (let i = Math.floor(cx - rad); i <= cx + rad; i++) {
          const dx = i - cx, dz = j - cz;
          const lx = dx * c - dz * s, lz = dx * s + dz * c;
          if (Math.abs(lx) > w / 2 || Math.abs(lz) > d / 2) continue;
          fn(i, j, lx, lz);
        }
      }
    },
    rotSlab(cx, cz, w, d, ang, lv, m2) {
      kit.rotCells(cx, cz, w, d, ang, (i, j) => set(i, j, lv, m2));
    },
    // A gable roof on a rotated building: the ridge runs along the long axis,
    // so the height only depends on how far you are across the short one.
    rotGable(cx, cz, w, d, ang, baseLv, m2) {
      const alongX = w >= d;
      const span = alongX ? d : w;
      kit.rotCells(cx, cz, w, d, ang, (i, j, lx, lz) => {
        const off = (alongX ? (span / 2 - Math.abs(lz)) : (span / 2 - Math.abs(lx)));
        set(i, j, baseLv + Math.max(0, Math.round(off)), m2);
      });
    },
    // A house that faces its street rather than the world.
    rotHouse(cx, cz, w, d, ang, storeys, wallMat, roofMat) {
      const wallH = storeys * 4;   // 2 blocks a storey
      kit.rotSlab(cx, cz, w + 2, d + 2, ang, 1, MAT.cobble);      // plinth
      kit.rotSlab(cx, cz, w, d, ang, wallH, wallMat);
      kit.rotGable(cx, cz, w + 2, d + 2, ang, wallH + 1, roofMat);
    },

    // --- streets ----------------------------------------------------------
    // Hand-picked waypoints, not a grid. Returns the segment angles so the
    // buildings can be turned to face whichever way the street is running.
    street(pts, width, mat, lv = 0) {
      const angs = [];
      for (let s = 0; s < pts.length - 1; s++) {
        const [x0, z0] = pts[s], [x1, z1] = pts[s + 1];
        const ang = Math.atan2(z1 - z0, x1 - x0);
        angs.push(ang);
        const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0)) * 2;
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const cx = x0 + (x1 - x0) * t, cz = z0 + (z1 - z0) * t;
          for (let j = Math.floor(cz - width); j <= cz + width; j++)
            for (let i = Math.floor(cx - width); i <= cx + width; i++)
              if (Math.hypot(i - cx, j - cz) <= width) set(i, j, lv, mat);
        }
      }
      return angs;
    },

    // Walk a street and drop buildings along one side, each turned to face it.
    frontage(pts, side, opts) {
      const { gap = 12, depth = 7, back = 7, storeys = 2,
              wall = MAT.plaster, roofs = [MAT.brick], skip = () => false } = opts || {};
      let carry = 0;
      for (let s = 0; s < pts.length - 1; s++) {
        const [x0, z0] = pts[s], [x1, z1] = pts[s + 1];
        const len = Math.hypot(x1 - x0, z1 - z0);
        const ang = Math.atan2(z1 - z0, x1 - x0);
        const nx = -Math.sin(ang) * side, nz = Math.cos(ang) * side;
        for (let t = carry; t < len; t += gap) {
          const cx = Math.round(x0 + (x1 - x0) * (t / len) + nx * back);
          const cz = Math.round(z0 + (z1 - z0) * (t / len) + nz * back);
          if (skip(cx, cz)) continue;
          const n = (cx * 7 + cz * 13) % 5;
          // Width is well under the spacing, or neighbours fuse into one loaf.
          kit.rotHouse(cx, cz, Math.max(5, gap - 6 + (n % 3)), depth + (n % 2), ang,
                       storeys + (n % 2), wall, roofs[n % roofs.length]);
        }
        carry = (carry - len) % gap + gap;
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
// 384x384 blocks. Every waypoint below was picked by hand: the wall circuit is
// an irregular polygon, the streets wander, and the houses are turned to face
// whichever street they stand on rather than the world axes. Nothing here is
// generated — `frontage` just walks a hand-drawn street and puts houses along
// it, the way a level designer would with a stamp tool.
export function buildRome(T) {
  const k = makeKit(T);
  const B = (n) => Math.round(n * 2);
  T.fill(MAT.grass, 0);

  // ============================ the river ==================================
  const river = [[0, 268], [70, 262], [140, 272], [210, 266], [280, 276], [383, 270]];
  k.street(river, 11, MAT.water);
  k.street(river, 13.5, MAT.sand, 0);
  k.street(river, 11, MAT.water);

  // ============================ the wall circuit ===========================
  const wall = [
    [78, 74], [132, 52], [206, 46], [272, 60], [316, 98],
    [330, 156], [320, 216], [274, 250], [200, 262], [128, 254],
    [82, 222], [64, 156], [78, 74],
  ];
  k.slab(60, 40, 336, 264, 0, MAT.cobble);     // the ground the city sits on
  k.rampartPath(wall, B(9), MAT.stone, 4);
  for (const [i, j] of wall) k.tower(i, j, 4, B(13), MAT.stone);
  // interval towers along every stretch
  for (let s = 0; s < wall.length - 1; s++) {
    const [x0, z0] = wall[s], [x1, z1] = wall[s + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let t = 26; t < len - 12; t += 26) {
      k.tower(Math.round(x0 + (x1 - x0) * t / len),
              Math.round(z0 + (z1 - z0) * t / len), 3, B(11), MAT.stone);
    }
  }

  // four gates, each cut through the circuit with a pair of towers
  const gates = [[196, 47], [166, 258], [70, 150], [326, 150]];
  for (const [gi, gj] of gates) {
    k.slab(gi - 4, gj - 5, gi + 4, gj + 5, 0, MAT.road);
    k.tower(gi - 8, gj, 3, B(15), MAT.stone);
    k.tower(gi + 8, gj, 3, B(15), MAT.stone);
  }

  // ============================ the streets ================================
  // A loose network. These wander on purpose.
  const via = {
    spine:  [[196, 48], [190, 92], [200, 132], [194, 176], [188, 218], [166, 256]],
    cross:  [[70, 150], [112, 142], [156, 152], [206, 144], [252, 154], [300, 146], [326, 150]],
    north:  [[132, 60], [148, 96], [176, 112], [214, 104], [250, 84]],
    east:   [[300, 110], [286, 152], [292, 196], [266, 232]],
    west:   [[86, 96], [104, 134], [96, 178], [116, 214], [150, 236]],
    market: [[214, 112], [244, 130], [258, 168], [238, 204], [200, 212]],
    lane:   [[120, 176], [154, 190], [186, 200], [214, 190]],
    // back lanes, to fill the quarters the main streets leave empty
    alleyA: [[104, 96], [126, 120], [118, 152], [134, 178]],
    alleyB: [[228, 66], [246, 96], [272, 118], [290, 150]],
    alleyC: [[150, 60], [162, 88], [150, 116], [164, 140]],
    alleyD: [[214, 214], [246, 224], [276, 214], [296, 186]],
  };
  k.street(via.spine, 3.2, MAT.road);
  k.street(via.cross, 3.2, MAT.road);
  for (const key of ['north', 'east', 'west', 'market', 'lane',
                     'alleyA', 'alleyB', 'alleyC', 'alleyD']) k.street(via[key], 2.0, MAT.cobble);

  // ============================ landmarks ==================================
  // The forum sits in the crook of the two main streets.
  const FORUM = [190, 152];
  k.slab(158, 128, 232, 180, B(1), MAT.marble);
  k.steps(158, 181, 232, 181, B(1), 0, MAT.marble);
  k.colonnade(160, 130, 230, 130, B(7), MAT.marble, 4);
  k.colonnade(160, 178, 230, 178, B(7), MAT.marble, 4);
  k.colonnade(160, 130, 160, 178, B(7), MAT.marble, 4);
  k.colonnade(230, 130, 230, 178, B(7), MAT.marble, 4);
  k.statue(196, 154, B(5), MAT.marble);
  k.well(168, 172); k.well(224, 172);

  // the temple, on its podium, turned a few degrees off the street
  k.rotSlab(196, 142, 26, 20, 0.12, B(3), MAT.marble);
  k.steps(196, 154, 196, 160, B(3), B(1), MAT.marble);
  k.rotSlab(196, 142, 22, 16, 0.12, B(9), MAT.marble);
  k.rotGable(196, 142, 28, 22, 0.12, B(10), MAT.brick);

  // basilica and curia flanking it
  k.rotHouse(146, 118, 34, 18, -0.22, 3, MAT.plaster, MAT.timber);
  k.rotHouse(244, 118, 28, 16, 0.18, 3, MAT.plaster, MAT.brick);

  // the amphitheatre out east, and the circus along the south-west
  k.amphitheatre(276, 196, 26, 13, MAT.stone, MAT.sand);
  k.rotSlab(126, 208, 70, 26, 0.30, 0, MAT.sand);
  k.rotSlab(126, 208, 74, 32, 0.30, B(3), MAT.stone);
  k.rotSlab(126, 208, 70, 26, 0.30, 0, MAT.sand);

  // the baths, north-west
  k.rotHouse(112, 108, 32, 22, -0.35, 2, MAT.brick, MAT.plaster);
  k.rotSlab(112, 108, 18, 10, -0.35, 0, MAT.water);

  // ============================ housing ====================================
  // Along every street, both sides, each house turned to face it.
  const roofs = [MAT.brick, MAT.thatch, MAT.timber];
  const keepClear = (x, z) => (
    (Math.abs(x - FORUM[0]) < 48 && Math.abs(z - FORUM[1]) < 36) ||
    Math.hypot((x - 276) * 0.8, z - 196) < 34 ||
    Math.hypot(x - 126, z - 208) < 42 ||
    Math.hypot(x - 112, z - 108) < 26 ||
    Math.hypot(x - 196, z - 47) < 18 || Math.hypot(x - 166, z - 258) < 18 ||
    Math.hypot(x - 70, z - 150) < 18 || Math.hypot(x - 326, z - 150) < 18
  );
  for (const [key, gap, storeys] of [
    ['spine', 13, 3], ['cross', 13, 3], ['north', 11, 2], ['east', 11, 2],
    ['west', 11, 2], ['market', 11, 2], ['lane', 10, 2],
    ['alleyA', 10, 2], ['alleyB', 10, 2], ['alleyC', 10, 2], ['alleyD', 10, 2],
  ]) {
    for (const side of [1, -1]) {
      k.frontage(via[key], side, {
        gap, depth: 9, back: 8, storeys,
        wall: MAT.plaster, roofs, skip: keepClear,
      });
    }
  }

  // a market square where two lanes meet, and wells in the quarters
  k.slab(238, 160, 262, 182, 0, MAT.cobble);
  k.well(250, 171);
  for (const [i, j] of [[120, 120], [150, 216], [284, 128], [206, 230]]) k.well(i, j);

  // ============================ the aqueduct ===============================
  k.aqueduct(383, 118, 332, 118, B(9), MAT.stone);
  k.aqueduct(332, 118, 306, 132, B(9), MAT.stone);

  // ============================ river bank =================================
  k.slab(120, 256, 250, 258, B(1), MAT.stone);          // the quay
  for (let i = 132; i < 246; i += 26) k.steps(i, 258, i, 264, B(1), 0, MAT.stone);
  k.frontage([[124, 250], [248, 252]], -1, {
    gap: 17, depth: 10, back: 9, storeys: 2, wall: MAT.brick, roofs: [MAT.timber],
  });
  // the bridge
  k.slab(178, 252, 186, 288, B(1), MAT.cobble);
  k.slab(178, 252, 178, 288, B(2), MAT.stone);
  k.slab(186, 252, 186, 288, B(2), MAT.stone);
  k.slab(179, 288, 185, 330, 0, MAT.road);

  // ============================ outside ====================================
  k.field(40, 292, 140, 356, 'z');
  k.field(210, 300, 320, 360, 'x');
  k.fence(32, 286, 148, 286); k.fence(32, 360, 148, 360);
  k.fence(32, 286, 32, 360); k.fence(148, 286, 148, 360);
  k.rotHouse(70, 302, 22, 16, 0.25, 2, MAT.plaster, MAT.thatch);   // the villa
  k.rotHouse(96, 316, 14, 10, -0.4, 1, MAT.plaster, MAT.thatch);
  k.orchard(230, 286, 340, 300, 5);
  k.orchard(12, 60, 54, 240, 4);                                    // woodland outside the west wall
  k.orchard(300, 40, 370, 96, 5);

  T.markAllDirty();
  return { name: 'Rome, 230 BC' };
}
