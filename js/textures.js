// EPOCH — procedural block textures, generated at load into one atlas.
//
// Every material gets an albedo tile, a height tile, and a packed ORM tile
// (r = ambient occlusion, g = roughness, b = metalness), exactly the way an HD
// resource pack ships them. The normal map is derived from the height tile with
// a Sobel pass, so a brick's mortar line is a real groove that catches the sun
// rather than a painted-on dark stripe.
//
// Nothing here is downloaded: it is all drawn with canvas, so the whole thing
// is a few kilobytes of code instead of a few megabytes of PNGs.

export const TEX = 64;          // pixels per material tile
export const ATLAS_COLS = 4;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// --- per-material painters -------------------------------------------------
// SMOOTH. The detail in this game comes from the architecture — from how the
// blocks are arranged — not from texture noise. A busy stone texture fights
// the block forms and turns a city into visual mush.
//
// So every material is a flat colour with, at most, a whisper of structure
// (plank lines, marble veining, water ripples) kept at very low contrast. The
// only thing the height map carries is a soft bevel at the tile edge, which is
// what makes an individual block read as a block without any noise at all.

const EDGE = 3;          // bevel width in texels

function bevel(h) {
  // A rounded plateau: flat in the middle, ramping down at the border. Run
  // through the Sobel pass this becomes an edge that catches the light, which
  // is the entire reason you can still see where one block ends.
  const img = h.createImageData(TEX, TEX);
  for (let y = 0; y < TEX; y++) {
    for (let x2 = 0; x2 < TEX; x2++) {
      const d = Math.min(x2, y, TEX - 1 - x2, TEX - 1 - y);
      const t = Math.min(1, d / EDGE);
      const v = 168 + Math.round(87 * (t * t * (3 - 2 * t)));
      const i = (y * TEX + x2) * 4;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
  }
  h.putImageData(img, 0, 0);
}

// a barely-there mottle so a big flat field is not a single dead colour
function breathe(a, r, base, amount) {
  for (let i = 0; i < 60; i++) {
    const x = r() * TEX, y = r() * TEX, s = 10 + r() * 26;
    const g = a.createRadialGradient(x, y, 0, x, y, s);
    const k = 1 + (r() - 0.5) * amount;
    g.addColorStop(0, shade(base, k));
    g.addColorStop(1, shade(base, 1) .replace('rgb(', 'rgba(').replace(')', ',0)'));
    a.fillStyle = g;
    a.fillRect(x - s, y - s, s * 2, s * 2);
  }
}

function plain(base, amount = 0.06) {
  return (a, h, r) => { fill(a, base); breathe(a, r, base, amount); bevel(h); };
}

const PAINT = {
  grass: plain('#7a9b4e', 0.10),
  dirt: plain('#93744a', 0.08),
  rock: plain('#8b877f', 0.07),
  sand: plain('#d4c68e', 0.06),
  road: plain('#b5a079', 0.06),
  stone: plain('#a49d91', 0.05),
  cobble: plain('#918d86', 0.06),
  rubble: plain('#857d72', 0.09),
  plaster: plain('#ded3ba', 0.04),
  brick: plain('#a05540', 0.06),
  thatch: plain('#c3a44c', 0.07),

  water(a, h, r) {
    fill(a, '#4a7fa8');
    breathe(a, r, '#4a7fa8', 0.08);
    // long, soft swells — structure, not noise
    a.strokeStyle = 'rgba(210,235,250,0.14)';
    a.lineWidth = 2.5;
    for (let i = 0; i < 5; i++) {
      a.beginPath();
      const y0 = r() * TEX;
      for (let x2 = 0; x2 <= TEX; x2 += 4) {
        const y = y0 + Math.sin(x2 * 0.09 + i) * 3;
        x2 === 0 ? a.moveTo(x2, y) : a.lineTo(x2, y);
      }
      a.stroke();
    }
    bevel(h);
  },

  marble(a, h, r) {
    fill(a, '#e7e3d8');
    for (let i = 0; i < 5; i++) {
      a.strokeStyle = `rgba(158,156,148,${0.07 + r() * 0.07})`;
      a.lineWidth = 1 + r() * 2;
      a.beginPath();
      let x2 = r() * TEX, y = -4;
      a.moveTo(x2, y);
      while (y < TEX + 4) { x2 += (r() - 0.5) * 14; y += 7 + r() * 7; a.lineTo(x2, y); }
      a.stroke();
    }
    bevel(h);
  },

  timber(a, h, r) {
    fill(a, '#8a6a44');
    breathe(a, r, '#8a6a44', 0.05);
    a.strokeStyle = 'rgba(70,52,32,0.16)';
    a.lineWidth = 1;
    for (let y = 16; y < TEX; y += 16) {
      a.beginPath(); a.moveTo(0, y); a.lineTo(TEX, y); a.stroke();
    }
    bevel(h);
  },

  crop(a, h, r) {
    fill(a, '#b9a441');
    breathe(a, r, '#b9a441', 0.07);
    a.strokeStyle = 'rgba(126,108,40,0.16)';
    a.lineWidth = 1.5;
    for (let x2 = 6; x2 < TEX; x2 += 11) {
      a.beginPath(); a.moveTo(x2, 0); a.lineTo(x2, TEX); a.stroke();
    }
    bevel(h);
  },

  wood(a, h, r) {
    fill(a, '#3d5c30');
    breathe(a, r, '#3d5c30', 0.12);
    bevel(h);
  },
};

// --- little drawing helpers ---
function fill(c, col) { c.fillStyle = col; c.fillRect(0, 0, TEX, TEX); }
function rect(c, x, y, w, h2, col) { c.fillStyle = col; c.fillRect(x, y, w, h2); }
function speck(c, r, n, col) {
  c.fillStyle = col;
  for (let i = 0; i < n; i++) c.fillRect(r() * TEX, r() * TEX, 1, 1);
}
function poly(c, x, y, s, sides, r) {
  c.beginPath();
  for (let i = 0; i < sides; i++) {
    const a2 = i / sides * 6.2832;
    const rr = s * (0.7 + r() * 0.5);
    const px = x + Math.cos(a2) * rr, py = y + Math.sin(a2) * rr;
    if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.closePath(); c.fill();
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r2 = Math.min(255, (n >> 16) * k) | 0;
  const g = Math.min(255, ((n >> 8) & 255) * k) | 0;
  const b = Math.min(255, (n & 255) * k) | 0;
  return `rgb(${r2},${g},${b})`;
}

// --- atlas build -----------------------------------------------------------
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Sobel over the height tile -> tangent-space normal.
function heightToNormal(hCtx, nCtx, ox, oy, strength) {
  const src = hCtx.getImageData(0, 0, TEX, TEX).data;
  const out = nCtx.createImageData(TEX, TEX);
  const at = (x, y) => {
    x = (x + TEX) % TEX; y = (y + TEX) % TEX;
    return src[(y * TEX + x) * 4] / 255;
  };
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const dx = (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1))
               - (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy = (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1))
               - (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      let nx = dx * strength, ny = dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * TEX + x) * 4;
      out.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  nCtx.putImageData(out, ox, oy);
}

// MATS entries may carry { rough, metal, bump } to steer the maps.
export function buildAtlas(MATS) {
  const n = MATS.length;
  const cols = ATLAS_COLS, rows = Math.ceil(n / cols);
  const W = cols * TEX, H = rows * TEX;
  const albedo = canvas(W, H), normal = canvas(W, H), orm = canvas(W, H), height = canvas(W, H);
  const ac = albedo.getContext('2d'), nc = normal.getContext('2d'),
        oc = orm.getContext('2d'), hh = height.getContext('2d');
  ac.imageSmoothingEnabled = false;

  const tile = canvas(TEX, TEX), hgt = canvas(TEX, TEX);
  const tc = tile.getContext('2d'), hc = hgt.getContext('2d');

  MATS.forEach((m, i) => {
    const cx = (i % cols) * TEX, cy = ((i / cols) | 0) * TEX;
    const r = rng(i * 9176 + 17);
    tc.clearRect(0, 0, TEX, TEX); hc.clearRect(0, 0, TEX, TEX);
    const paint = PAINT[m.id] || PAINT.rock;
    paint(tc, hc, r);
    ac.drawImage(tile, cx, cy);
    hh.drawImage(hgt, cx, cy);       // kept for the parallax pass
    heightToNormal(hc, nc, cx, cy, 1.5);   // bevel only, same for every material
    // ORM: red = AO (unused, 255), green = roughness, blue = metalness
    const rough = m.rough !== undefined ? m.rough : 0.92;
    const metal = m.metal !== undefined ? m.metal : 0.0;
    oc.fillStyle = `rgb(255,${rough * 255 | 0},${metal * 255 | 0})`;
    oc.fillRect(cx, cy, TEX, TEX);
  });

  return { albedo, normal, orm, height, cols, rows };
}

// UV rect for a material index, inset by half a texel so neighbouring tiles
// never bleed into each other when mipmapped.
export function uvFor(index, cols, rows) {
  const cx = index % cols, cy = (index / cols) | 0;
  const pad = 0.5 / TEX;
  return {
    u0: (cx + pad) / cols, u1: (cx + 1 - pad) / cols,
    v0: 1 - (cy + 1 - pad) / rows, v1: 1 - (cy + pad) / rows,
  };
}
