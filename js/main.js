import { Sim } from './sim.js';
import { Terrain, MATS, MAT, TILE } from './terrain.js';
import { buildRome } from './maps.js';
import { Renderer, TEAM } from './render.js';
import { ROSTER, BY_ID, rosterFor } from './units.js';

const cv = document.getElementById('cv');
const rend = new Renderer(cv, 500);
const sim = new Sim();
const terrain = new Terrain();   // 192x192 blocks
sim.terrain = terrain;

const app = {
  year: -230, picked: 'legionary', team: 0, hold: false, speed: 1, placed: [],
  mode: 'build',          // 'build' | 'army'
  mat: MAT.stone,
  tool: 'block',          // 'block' (raise/lower) | 'paint' (material only)
  brush: 1,               // radius in tiles
};
const $ = (id) => document.getElementById(id);

function setGround() { buildRome(terrain); }

function demo() {
  sim.reset(true);
  app.placed = [];
  const A = rosterFor(app.year);
  const pick = (i) => A[i % A.length].id;
  // Two armies drawn up north and south of the city, outside the walls.
  for (let r = 0; r < 4; r++) {
    for (let i = 0; i < 10; i++) {
      add(pick(r), terrain.wx(70 + i * 6), terrain.wz(8 - r * 3), 0);
      add(pick(r + 2), terrain.wx(70 + i * 6), terrain.wz(116 + r * 3), 1);
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
rend.dist = 2400;
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
