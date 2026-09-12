import { Sim } from './sim.js';
import { Terrain, MATS, MAT, TILE } from './terrain.js';
import { Renderer, TEAM } from './render.js';
import { ROSTER, BY_ID, rosterFor } from './units.js';

const cv = document.getElementById('cv');
const rend = new Renderer(cv, 500);
const sim = new Sim();
const terrain = new Terrain(72, 72);
sim.terrain = terrain;

const app = {
  year: -230, picked: 'legionary', team: 0, hold: false, speed: 1, placed: [],
  mode: 'build',          // 'build' | 'army'
  mat: MAT.stone,
  tool: 'block',          // 'block' (raise/lower) | 'paint' (material only)
  brush: 1,               // radius in tiles
};
const $ = (id) => document.getElementById(id);

function setGround() {
  // ROME, 230 BC. Two districts, each with its own ground and its own build
  // material: the city inside the walls is cobble and marble, the farmland
  // outside is ploughed dirt, crops and timber fences. Every tile placed on
  // purpose — nothing here is generated.
  terrain.fill(MAT.grass, 0);

  // --- farmland, south and west ---
  terrain.stamp(16, 54, 13, 0, MAT.crop);
  terrain.stamp(34, 58, 9, 0, MAT.crop);
  terrain.stamp(12, 38, 7, 0, MAT.dirt);
  for (let i = 4; i < 30; i += 6) terrain.line(i, 46, i, 63, 0.4, 0, MAT.dirt);   // furrow lanes
  // timber fences around the fields, one level high so they only slow you
  fence(3, 45, 29, 45); fence(3, 64, 29, 64); fence(3, 45, 3, 64); fence(29, 45, 29, 64);

  // --- the river and its crossing ---
  terrain.line(0, 40, 71, 43, 1.6, 0, MAT.water);
  terrain.line(30, 39, 34, 45, 1.2, 0, MAT.road);        // the bridge road
  terrain.line(31, 40, 33, 44, 0.9, 1, MAT.cobble);      // the bridge itself

  // --- the city, north east, inside its walls ---
  terrain.stamp(46, 22, 15, 0, MAT.cobble);
  wallRect(33, 9, 60, 35, 3, MAT.stone);
  // gates: drop the wall to one level so troops can get in
  gate(46, 9); gate(46, 35); gate(33, 22); gate(60, 22);

  // insulae: blocks of housing, plaster with timber frames
  for (let bx = 37; bx <= 55; bx += 7) {
    for (let bz = 13; bz <= 31; bz += 7) {
      if (Math.abs(bx - 46) < 4 && Math.abs(bz - 22) < 4) continue;   // leave the forum
      building(bx, bz, 4, 4, 2, MAT.plaster);
    }
  }
  // the forum: a marble platform with columns
  terrain.stamp(46, 22, 4, 1, MAT.marble, false);
  for (const [ox, oz] of [[-3,-3],[3,-3],[-3,3],[3,3],[0,-3],[0,3]]) {
    terrain.set(46 + ox, 22 + oz, 5, MAT.marble);
  }
  // roads out of every gate
  terrain.line(46, 0, 46, 9, 1, 0, MAT.road);
  terrain.line(46, 35, 44, 50, 1, 0, MAT.road);
  terrain.line(0, 22, 33, 22, 1, 0, MAT.road);
}

function fence(x0, z0, x1, z1) { terrain.line(x0, z0, x1, z1, 0.4, 1, MAT.timber); }

function wallRect(x0, z0, x1, z1, lv, mat) {
  terrain.line(x0, z0, x1, z0, 0.6, lv, mat);
  terrain.line(x0, z1, x1, z1, 0.6, lv, mat);
  terrain.line(x0, z0, x0, z1, 0.6, lv, mat);
  terrain.line(x1, z0, x1, z1, 0.6, lv, mat);
}
function gate(i, j) {
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) terrain.set(i + di, j + dj, 0, MAT.road);
}
// A hollow building: walls up, floor inside left low so troops can hold it.
function building(cx, cz, w, h, lv, mat) {
  for (let j = cz - h / 2; j <= cz + h / 2; j++) {
    for (let i = cx - w / 2; i <= cx + w / 2; i++) {
      const edge = (i <= cx - w / 2 + 0.5 || i >= cx + w / 2 - 0.5 ||
                    j <= cz - h / 2 + 0.5 || j >= cz + h / 2 - 0.5);
      terrain.set(Math.round(i), Math.round(j), edge ? lv : 0, edge ? mat : MAT.dirt);
    }
  }
}

function demo() {
  sim.reset(true);
  app.placed = [];
  const A = rosterFor(app.year);
  const pick = (i) => A[i % A.length].id;
  for (let r = 0; r < 4; r++) {
    for (let i = 0; i < 9; i++) {
      add(pick(r), -700 - r * 90, -420 + i * 105, 0);
      add(pick(r + 2), 700 + r * 90, -420 + i * 105, 1);
    }
  }
}
function add(id, x, z, team, hold = false) {
  if (!BY_ID[id]) return;
  app.placed.push({ id, x, z, team, hold });
  sim.spawn(id, x, z, team, team === 0 ? Math.PI / 2 : -Math.PI / 2, hold);
}
function rebuild() {
  const keep = app.placed.slice();
  sim.reset(true);
  app.placed = [];
  for (const p of keep) add(p.id, p.x, p.z, p.team, p.hold);
}

// --- tray -----------------------------------------------------------------
function buildPalette() {
  const pal = document.getElementById('palette');
  pal.innerHTML = '';
  for (let i = 0; i < MATS.length; i++) {
    const mt = MATS[i];
    const b = document.createElement('button');
    b.className = 'swatch' + (app.mat === i ? ' sel' : '') + (mt.build ? ' build' : '');
    b.style.background = '#' + mt.top.toString(16).padStart(6, '0');
    b.title = mt.name + (mt.build ? ' (building material)' : ' (ground)');
    b.onclick = () => { app.mat = i; buildPalette(); };
    pal.appendChild(b);
  }
}

function buildTray() {
  const tray = $('tray');
  tray.innerHTML = '';
  const avail = rosterFor(app.year);
  for (const spec of ROSTER) {
    const ok = avail.includes(spec);
    const el = document.createElement('button');
    el.className = 'card' + (ok ? '' : ' locked') + (app.picked === spec.id ? ' sel' : '');
    el.innerHTML = `<span class="n">${spec.name}</span>
      <span class="c">${ok ? spec.cost + 'g' : yr(spec.era)}</span>
      <span class="b">${ok ? spec.blurb : 'not invented yet'}</span>`;
    if (ok) el.onclick = () => { app.picked = spec.id; buildTray(); };
    tray.appendChild(el);
  }
}
function yr(y) { return y < 0 ? Math.abs(y) + ' BC' : y + ' AD'; }

// --- input ----------------------------------------------------------------
let drag = null;
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  if (e.button !== 0) {
    drag = { mode: 'pan', x: e.clientX, y: e.clientY, t: rend.target.clone() };
    return;
  }
  const g = ground(e);
  if (!g) return;
  if (app.mode === 'build') {
    drag = { mode: 'build', down: e.shiftKey, last: -1 };
    paintTile(g, e.shiftKey);
  } else {
    add(app.picked, g.x, g.z, app.team, app.hold);
    drag = { mode: 'place' };
  }
});
cv.addEventListener('pointermove', (e) => {
  const gh = ground(e);
  if (gh) { app.hoverI = terrain.tx(gh.x); app.hoverJ = terrain.tz(gh.z); }
  if (!drag) return;
  if (drag.mode === 'build') { if (gh) paintTile(gh, drag.down); return; }
  if (drag.mode === 'pan') {
    const k = rend.dist / cv.clientHeight * 1.4;
    rend.target.x = drag.t.x - (e.clientX - drag.x) * k;
    rend.target.z = drag.t.z - (e.clientY - drag.y) * k / Math.sin(Math.PI / 3);
  }
});
addEventListener('pointerup', () => {
  // Put the troops back on top of whatever you just built.
  if (drag && drag.mode === 'build' && app.dirty) { app.dirty = false; rebuild(); }
  drag = null;
});
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  rend.dist = Math.max(220, Math.min(6000, rend.dist * (e.deltaY < 0 ? 0.9 : 1 / 0.9)));
}, { passive: false });

// One click = one block. Shift takes one away. Painting only changes the
// material, which is how a district gets its own ground.
function paintTile(g, remove) {
  const ci = terrain.tx(g.x), cj = terrain.tz(g.z);
  const r = app.brush;
  for (let j = cj - r; j <= cj + r; j++) {
    for (let i = ci - r; i <= ci + r; i++) {
      if (!terrain.inside(i, j)) continue;
      if (Math.hypot(i - ci, j - cj) > r + 0.25) continue;
      if (app.tool === 'paint') {
        terrain.set(i, j, undefined, app.mat);
      } else {
        const lv = terrain.levelAt(i, j) + (remove ? -1 : 1);
        terrain.set(i, j, Math.max(0, Math.min(24, lv)), remove ? undefined : app.mat);
      }
    }
  }
  app.dirty = true;
}

function ground(e) {
  const r = cv.getBoundingClientRect();
  const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
  const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
  let p = rend.screenToGround(nx, ny, 0);
  if (!p) return null;
  // one refinement against the real height at that spot
  const h = terrain.heightAt(p.x, p.z);
  p = rend.screenToGround(nx, ny, h);
  return p;
}

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); sim.running = !sim.running; sync(); }
  else if (k === 'r') { rebuild(); sim.running = false; sync(); }
  else if (k === 'tab') { e.preventDefault(); app.team = 1 - app.team; sync(); }
  else if (k === 'g') { app.hold = !app.hold; sync(); }
  else if (k === 'b') { app.mode = app.mode === 'build' ? 'army' : 'build'; sync(); }
  else if (k === '[') { app.brush = Math.max(0, app.brush - 1); sync(); }
  else if (k === ']') { app.brush = Math.min(6, app.brush + 1); sync(); }
});
$('modeBtn').onclick = () => { app.mode = app.mode === 'build' ? 'army' : 'build'; sync(); };
$('t_block').onclick = () => { app.tool = 'block'; sync(); };
$('t_paint').onclick = () => { app.tool = 'paint'; sync(); };
$('brushMinus').onclick = () => { app.brush = Math.max(0, app.brush - 1); sync(); };
$('brushPlus').onclick = () => { app.brush = Math.min(6, app.brush + 1); sync(); };
$('go').onclick = () => { sim.running = !sim.running; sync(); };
$('reset').onclick = () => { rebuild(); sim.running = false; sync(); };
$('demo').onclick = () => { demo(); sim.running = false; sync(); };
$('teamBtn').onclick = () => { app.team = 1 - app.team; sync(); };
$('holdBtn').onclick = () => { app.hold = !app.hold; sync(); };
$('year').oninput = (e) => {
  app.year = Number(e.target.value);
  if (!rosterFor(app.year).some(s => s.id === app.picked)) {
    app.picked = rosterFor(app.year).slice(-1)[0].id;
  }
  buildTray(); sync();
};

function sync() {
  document.body.classList.toggle('buildmode', app.mode === 'build');
  $('modeBtn').textContent = app.mode === 'build' ? 'Building' : 'Armies';
  $('t_block').classList.toggle('on', app.tool === 'block');
  $('t_paint').classList.toggle('on', app.tool === 'paint');
  $('brushLbl').textContent = (app.brush * 2 + 1) + '×' + (app.brush * 2 + 1);
  $('go').textContent = sim.running ? 'PAUSE' : 'GO';
  $('go').classList.toggle('on', sim.running);
  $('yearLbl').textContent = yr(app.year);
  $('teamBtn').textContent = TEAM[app.team].name;
  $('teamBtn').className = 'btn t' + app.team;
  $('holdBtn').textContent = app.hold ? 'Hold' : 'Advance';
  $('holdBtn').classList.toggle('on', app.hold);
}

// --- loop -----------------------------------------------------------------
let last = performance.now(), acc = 0;
const DT = 1 / 60;
function frame(now) {
  const el = Math.min(0.1, (now - last) / 1000); last = now;
  acc += el * app.speed;
  let n = 0;
  while (acc >= DT && n < 6) { sim.update(DT); acc -= DT; n++; }
  if (acc > DT * 6) acc = 0;
  rend.resize(cv.clientWidth, cv.clientHeight);
  rend.draw(sim);
  $('hud').textContent = `${sim.aliveCount(0)} vs ${sim.aliveCount(1)}`;
  requestAnimationFrame(frame);
}

setGround();
buildTray();
buildPalette();
demo();
rend.target.set(0, 0, 0);
rend.dist = 2900;
sync();

{
  const q = new URLSearchParams(location.search);
  if (q.has('dist')) rend.dist = Number(q.get('dist'));
  if (q.has('tx')) rend.target.x = Number(q.get('tx'));
  if (q.has('tz')) rend.target.z = Number(q.get('tz'));
  if (q.has('run')) sim.running = true;
  const pre = Number(q.get('steps')) || 0;
  for (let i = 0; i < pre; i++) sim.update(DT);
}
window.EPOCH = { app, sim, rend, terrain, add, rebuild, paintTile };

if (new URLSearchParams(location.search).has('selftest')) {
  const out = [];
  const ok = (n, c, x = '') => out.push(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' (' + x + ')' : ''}`);
  try {
    const i = 5, j = 5;
    const gx = terrain.wx(i), gz = terrain.wz(j);
    const l0 = terrain.levelAt(i, j);
    app.mode = 'build'; app.tool = 'block'; app.mat = MAT.stone; app.brush = 0;
    paintTile({ x: gx, z: gz }, false);
    ok('click raises a block', terrain.levelAt(i, j) === l0 + 1, `${l0} -> ${terrain.levelAt(i, j)}`);
    ok('block takes the material', terrain.typeAt(i, j) === MAT.stone);
    paintTile({ x: gx, z: gz }, true);
    ok('shift removes it', terrain.levelAt(i, j) === l0);
    app.tool = 'paint'; app.mat = MAT.crop;
    const lv = terrain.levelAt(i, j);
    paintTile({ x: gx, z: gz }, false);
    ok('ground paint keeps height', terrain.levelAt(i, j) === lv && terrain.typeAt(i, j) === MAT.crop);
    app.brush = 2; app.tool = 'block'; app.mat = MAT.brick;
    paintTile({ x: terrain.wx(20), z: terrain.wz(20) }, false);
    let n = 0;
    for (let b = 18; b <= 22; b++) for (let a = 18; a <= 22; a++) if (terrain.levelAt(a, b) > 0) n++;
    ok('brush covers an area', n >= 9, n + ' tiles');
    rebuild();
    ok('rebuild keeps the army', sim.units.length === app.placed.length, `${sim.units.length}`);
    ok('walls are unclimbable', !terrain.passable(19, 20, 20, 20) || terrain.levelAt(20, 20) <= 1);
    ok('flow field exists', !!sim.flow[0]);
    sim.rebuildFlow();
    ok('flow field builds', sim.flow[0].ready);
  } catch (e) { out.push('FAIL threw: ' + e.message); }
  document.title = 'SELFTEST ' + out.join(' | ');
}
requestAnimationFrame(frame);
