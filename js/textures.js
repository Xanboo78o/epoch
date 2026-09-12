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
// Each gets (ctx, height ctx, rand) and paints a TEXxTEX tile.
const PAINT = {
  grass(a, h, r) {
    fill(a, '#6f8a46'); fill(h, '#808080');
    for (let i = 0; i < 900; i++) {
      const x = r() * TEX, y = r() * TEX, l = 1 + r() * 3;
      const g = 60 + r() * 70;
      a.fillStyle = `rgb(${70 + g * 0.35},${110 + g * 0.5},${50 + g * 0.25})`;
      a.fillRect(x, y, 1, l);
      h.fillStyle = `rgb(${120 + r() * 70 | 0},0,0)`;
      h.fillRect(x, y, 1, l);
    }
  },
  dirt(a, h, r) {
    fill(a, '#8a6b44'); fill(h, '#7a7a7a');
    for (let i = 0; i < 500; i++) {
      const x = r() * TEX, y = r() * TEX, s = 1 + r() * 3;
      const v = r();
      a.fillStyle = v > 0.8 ? '#6d563a' : v > 0.4 ? '#977busy' : '#7e6340';
      a.fillStyle = v > 0.8 ? '#6d563a' : v > 0.4 ? '#977447' : '#7e6340';
      a.fillRect(x, y, s, s);
      h.fillStyle = `rgb(${100 + v * 90 | 0},0,0)`;
      h.fillRect(x, y, s, s);
    }
  },
  rock(a, h, r) {
    fill(a, '#83807a'); fill(h, '#808080');
    for (let i = 0; i < 90; i++) {
      const x = r() * TEX, y = r() * TEX, s = 4 + r() * 12;
      const v = 0.75 + r() * 0.45;
      a.fillStyle = shade('#83807a', v);
      poly(a, x, y, s, 5 + (r() * 3 | 0), r);
      h.fillStyle = `rgb(${90 + v * 90 | 0},0,0)`;
      poly(h, x, y, s, 5 + (r() * 3 | 0), r);
    }
  },
  water(a, h, r) {
    fill(a, '#3f72a0'); fill(h, '#808080');
    for (let y = 0; y < TEX; y++) {
      for (let x = 0; x < TEX; x++) {
        const w = Math.sin(x * 0.35 + Math.sin(y * 0.21) * 2.0) * 0.5 + 0.5;
        if (w > 0.72) { a.fillStyle = `rgba(190,225,245,${(w - 0.72) * 1.6})`; a.fillRect(x, y, 1, 1); }
        h.fillStyle = `rgb(${110 + w * 60 | 0},0,0)`; h.fillRect(x, y, 1, 1);
      }
    }
  },
  sand(a, h, r) {
    fill(a, '#cfc08a'); fill(h, '#828282');
    for (let i = 0; i < 1600; i++) {
      const x = r() * TEX, y = r() * TEX, v = r();
      a.fillStyle = shade('#cfc08a', 0.86 + v * 0.28);
      a.fillRect(x, y, 1, 1);
      h.fillStyle = `rgb(${118 + v * 26 | 0},0,0)`; h.fillRect(x, y, 1, 1);
    }
  },
  crop(a, h, r) {
    fill(a, '#9d8a34'); fill(h, '#6a6a6a');
    for (let x = 2; x < TEX; x += 5) {
      for (let i = 0; i < 26; i++) {
        const y = r() * TEX, l = 4 + r() * 7, o = (r() - 0.5) * 2;
        a.strokeStyle = shade('#c9b64a', 0.8 + r() * 0.5);
        a.lineWidth = 1;
        a.beginPath(); a.moveTo(x + o, y + l); a.lineTo(x + o * 2, y); a.stroke();
        h.strokeStyle = `rgb(${170 + r() * 60 | 0},0,0)`;
        h.beginPath(); h.moveTo(x + o, y + l); h.lineTo(x + o * 2, y); h.stroke();
      }
    }
  },
  wood(a, h, r) {   // woodland canopy
    fill(a, '#33502a'); fill(h, '#707070');
    for (let i = 0; i < 150; i++) {
      const x = r() * TEX, y = r() * TEX, s = 3 + r() * 8, v = 0.7 + r() * 0.6;
      a.fillStyle = shade('#3e6031', v);
      a.beginPath(); a.arc(x, y, s, 0, 6.2832); a.fill();
      h.fillStyle = `rgb(${90 + v * 100 | 0},0,0)`;
      h.beginPath(); h.arc(x, y, s, 0, 6.2832); h.fill();
    }
  },
  road(a, h, r) {
    fill(a, '#a89272'); fill(h, '#7e7e7e');
    for (let i = 0; i < 420; i++) {
      const x = r() * TEX, y = r() * TEX, s = 1 + r() * 4, v = 0.8 + r() * 0.4;
      a.fillStyle = shade('#a89272', v);
      a.beginPath(); a.arc(x, y, s, 0, 6.2832); a.fill();
      h.fillStyle = `rgb(${110 + v * 70 | 0},0,0)`;
      h.beginPath(); h.arc(x, y, s, 0, 6.2832); h.fill();
    }
  },
  stone(a, h, r) {   // ashlar: big dressed blocks with deep mortar
    fill(a, '#9a9488'); fill(h, '#3a3a3a');
    const rows = 4, rh = TEX / rows;
    for (let ry = 0; ry < rows; ry++) {
      const off = (ry % 2) * rh;
      for (let x = -rh; x < TEX; x += rh * 2) {
        const v = 0.86 + r() * 0.3;
        rect(a, x + off + 1, ry * rh + 1, rh * 2 - 2, rh - 2, shade('#9a9488', v));
        rect(h, x + off + 1, ry * rh + 1, rh * 2 - 2, rh - 2, `rgb(${190 + r() * 50 | 0},0,0)`);
      }
    }
    speck(a, r, 260, '#8b8578');
  },
  brick(a, h, r) {
    fill(a, '#8f4e39'); fill(h, '#3c3c3c');
    const rows = 8, rh = TEX / rows;
    for (let ry = 0; ry < rows; ry++) {
      const off = (ry % 2) * rh;
      for (let x = -rh; x < TEX; x += rh * 2) {
        const v = 0.85 + r() * 0.35;
        rect(a, x + off + 1, ry * rh + 1, rh * 2 - 2, rh - 2, shade('#a85a3f', v));
        rect(h, x + off + 1, ry * rh + 1, rh * 2 - 2, rh - 2, `rgb(${195 + r() * 45 | 0},0,0)`);
      }
    }
  },
  marble(a, h, r) {
    fill(a, '#e3ded2'); fill(h, '#9a9a9a');
    for (let i = 0; i < 16; i++) {
      a.strokeStyle = `rgba(150,148,140,${0.12 + r() * 0.25})`;
      a.lineWidth = 0.6 + r() * 2.2;
      a.beginPath();
      let x = r() * TEX, y = -4;
      a.moveTo(x, y);
      while (y < TEX + 4) { x += (r() - 0.5) * 11; y += 4 + r() * 5; a.lineTo(x, y); }
      a.stroke();
    }
    // marble is polished: height stays almost flat
    speck(h, r, 120, 'rgb(158,0,0)');
  },
  timber(a, h, r) {
    fill(a, '#7d5f3c'); fill(h, '#6e6e6e');
    for (let y = 0; y < TEX; y += 16) {
      rect(a, 0, y + 1, TEX, 14, shade('#7d5f3c', 0.88 + r() * 0.3));
      rect(h, 0, y + 1, TEX, 14, `rgb(${185 + r() * 45 | 0},0,0)`);
      for (let i = 0; i < 40; i++) {      // grain
        const gx = r() * TEX, gy = y + 2 + r() * 12;
        a.fillStyle = `rgba(60,44,26,${0.1 + r() * 0.25})`;
        a.fillRect(gx, gy, 3 + r() * 9, 1);
      }
    }
  },
  thatch(a, h, r) {
    fill(a, '#b39442'); fill(h, '#707070');
    for (let i = 0; i < 900; i++) {
      const x = r() * TEX, y = r() * TEX, l = 5 + r() * 10, v = 0.75 + r() * 0.55;
      a.strokeStyle = shade('#c9a94f', v);
      a.lineWidth = 1;
      a.beginPath(); a.moveTo(x, y); a.lineTo(x + (r() - 0.5) * 3, y + l); a.stroke();
      h.strokeStyle = `rgb(${100 + v * 110 | 0},0,0)`;
      h.beginPath(); h.moveTo(x, y); h.lineTo(x + (r() - 0.5) * 3, y + l); h.stroke();
    }
  },
  plaster(a, h, r) {
    fill(a, '#d8cdb4'); fill(h, '#8c8c8c');
    speck(a, r, 1400, '#cec2a6');
    for (let i = 0; i < 26; i++) {       // trowel marks
      a.strokeStyle = `rgba(170,160,138,${0.06 + r() * 0.12})`;
      a.lineWidth = 2 + r() * 5;
      a.beginPath();
      const x = r() * TEX, y = r() * TEX;
      a.moveTo(x, y); a.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30); a.stroke();
    }
    speck(h, r, 500, 'rgb(146,0,0)');
  },
  cobble(a, h, r) {
    fill(a, '#6f6b64'); fill(h, '#4a4a4a');
    for (let i = 0; i < 120; i++) {
      const x = r() * TEX, y = r() * TEX, s = 3 + r() * 6, v = 0.8 + r() * 0.5;
      a.fillStyle = shade('#928d84', v);
      poly(a, x, y, s, 6, r);
      h.fillStyle = `rgb(${170 + v * 60 | 0},0,0)`;
      poly(h, x, y, s, 6, r);
    }
  },
  rubble(a, h, r) {
    fill(a, '#7b746a'); fill(h, '#5a5a5a');
    for (let i = 0; i < 170; i++) {
      const x = r() * TEX, y = r() * TEX, s = 2 + r() * 7, v = 0.72 + r() * 0.6;
      a.fillStyle = shade('#867e72', v);
      poly(a, x, y, s, 3 + (r() * 4 | 0), r);
      h.fillStyle = `rgb(${120 + v * 100 | 0},0,0)`;
      poly(h, x, y, s, 3 + (r() * 4 | 0), r);
    }
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
    heightToNormal(hc, nc, cx, cy, m.bump !== undefined ? m.bump : 2.4);
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
