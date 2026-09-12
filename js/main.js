// EPOCH — glue. The UI has one shape: pick what you are doing (Build / Army /
// Battle), pick what you are doing it with, then click the map. Everything
// else hangs off that, so there is never a control on screen that belongs to
// a different job.

import { Sim } from './sim.js';
import { Terrain, MATS, MAT, TILE } from './terrain.js';
import { buildRome } from './maps.js';
import { Renderer, TEAM } from './render.js';
import { ROSTER, BY_ID, rosterFor } from './units.js';

const cv = document.getElementById('cv');
const rend = new Renderer(cv, 600);
const sim = new Sim();
const terrain = new Terrain();
sim.terrain = terrain;
const $ = (id) => document.getElementById(id);

const SPEEDS = [0.25, 0.5, 1, 2, 4];
const app = {
  mode: 'build',                 // build | army | battle
  tool: 'block',                 // block | slab | paint | erase
  mat: MAT.stone,
  brush: 1,
  year: -230,
  picked: 'legionary',
  team: 0,
  hold: false,
  speed: 1,
  placed: [],
  dirty: false,
};

// --- world ---------------------------------------------------------------
function setGround() { buildRome(terrain); }

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
  sim.running = false;
}
function demo() {
  sim.reset(true);
  app.placed = [];
  const A = rosterFor(app.year);
  const pick = (i) => A[i % A.length].id;
  for (let r = 0; r < 4; r++) {
    for (let i = 0; i < 10; i++) {
      add(pick(r), terrain.wx(64 + i * 7), terrain.wz(6 - r * 3), 0);
      add(pick(r + 2), terrain.wx(64 + i * 7), terrain.wz(186 + r * 3), 1);
    }
  }
  sim.running = false;
}

// --- editing ---------------------------------------------------------------
// One click is one thing: a block is two half-steps, a slab is one, paint only
// changes material, dig takes a block away.
function paintTile(g, remove) {
  const ci = terrain.tx(g.x), cj = terrain.tz(g.z);
  const r = app.brush;
  const dig = remove || app.tool === 'erase';
  for (let j = cj - r; j <= cj + r; j++) {
    for (let i = ci - r; i <= ci + r; i++) {
      if (!terrain.inside(i, j)) continue;
      if (Math.hypot(i - ci, j - cj) > r + 0.25) continue;
      if (app.tool === 'paint') { terrain.set(i, j, undefined, app.mat); continue; }
      const step = app.tool === 'slab' ? 1 : 2;
      const lv = terrain.levelAt(i, j) + (dig ? -step : step);
      terrain.set(i, j, Math.max(0, Math.min(60, lv)), dig ? undefined : app.mat);
    }
  }
  app.dirty = true;
}

// --- input -----------------------------------------------------------------
let drag = null;
function groundAt(e) {
  const r = cv.getBoundingClientRect();
  const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
  const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
  let p = rend.screenToGround(nx, ny, 0);
  if (!p) return null;
  return rend.screenToGround(nx, ny, terrain.heightAt(p.x, p.z));
}

cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  if (e.button !== 0) {
    drag = { mode: 'pan', x: e.clientX, y: e.clientY, t: rend.target.clone() };
    return;
  }
  const g = groundAt(e);
  if (!g) return;
  if (app.mode === 'build') { drag = { mode: 'build', rm: e.shiftKey }; paintTile(g, e.shiftKey); }
  else if (app.mode === 'army') { drag = { mode: 'place' }; add(app.picked, g.x, g.z, app.team, app.hold); }
  else drag = { mode: 'pan', x: e.clientX, y: e.clientY, t: rend.target.clone() };
});
cv.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (drag.mode === 'pan') {
    const k = rend.dist / cv.clientHeight * 1.4;
    rend.target.x = drag.t.x - (e.clientX - drag.x) * k;
    rend.target.z = drag.t.z - (e.clientY - drag.y) * k / Math.sin(Math.PI / 3);
  } else if (drag.mode === 'build') {
    const g = groundAt(e); if (g) paintTile(g, drag.rm);
  }
});
addEventListener('pointerup', () => {
  if (drag && drag.mode === 'build' && app.dirty) { app.dirty = false; rebuild(); }
  drag = null;
});
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  rend.dist = Math.max(200, Math.min(7000, rend.dist * (e.deltaY < 0 ? 0.9 : 1 / 0.9)));
}, { passive: false });

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); toggleRun(); return; }
  if (k === 'b') setMode('build');
  else if (k === 'a') setMode('army');
  else if (k === 'p') setMode('battle');
  else if (k === 'r') { rebuild(); sync(); }
  else if (k === 'g') { app.hold = !app.hold; sync(); }
  else if (k === 'tab') { e.preventDefault(); app.team = 1 - app.team; sync(); }
  else if (k >= '1' && k <= '4' && app.mode === 'build') {
    app.tool = ['block', 'slab', 'paint', 'erase'][+k - 1]; sync();
  }
});

// --- UI --------------------------------------------------------------------
function setMode(m) {
  app.mode = m;
  if (m === 'battle') { /* leave running state alone */ }
  sync();
}
function toggleRun() {
  sim.running = !sim.running;
  if (sim.running) setMode('battle'); else sync();
}

function buildPalettes() {
  for (const [host, want] of [[$('pal_ground'), false], [$('pal_build'), true]]) {
    host.innerHTML = '';
    MATS.forEach((m, i) => {
      if (!!m.build !== want) return;
      const b = document.createElement('button');
      b.className = 'sw' + (want ? ' block' : '') + (app.mat === i ? ' on' : '');
      b.style.background = '#' + m.top.toString(16).padStart(6, '0');
      b.title = m.name;
      b.onclick = () => { app.mat = i; if (app.tool === 'erase') app.tool = 'block'; sync(); };
      host.appendChild(b);
    });
  }
}

function buildTray() {
  const tray = $('tray');
  tray.innerHTML = '';
  const avail = rosterFor(app.year);
  for (const spec of ROSTER) {
    const ok = avail.includes(spec);
    const el = document.createElement('button');
    el.className = 'card' + (ok ? '' : ' locked') + (app.picked === spec.id ? ' on' : '');
    el.innerHTML = `<span class="n">${spec.name}</span>
      <span class="c">${ok ? spec.cost + 'g' : yr(spec.era)}</span>`;
    el.title = ok ? spec.blurb : 'not invented until ' + yr(spec.era);
    if (ok) el.onclick = () => { app.picked = spec.id; buildTray(); };
    tray.appendChild(el);
  }
}
function yr(y) { return y < 0 ? Math.abs(y) + ' BC' : y + ' AD'; }

function sync() {
  for (const [id, m] of [['m_build', 'build'], ['m_army', 'army'], ['m_play', 'battle']]) {
    $(id).classList.toggle('on', app.mode === m);
  }
  $('p_build').hidden = app.mode !== 'build';
  $('p_army').hidden = app.mode !== 'army';
  $('p_play').hidden = app.mode !== 'battle';

  for (const t of ['block', 'slab', 'paint', 'erase']) {
    $('t_' + t).classList.toggle('on', app.tool === t);
  }
  $('brushLbl').textContent = (app.brush * 2 + 1) + '×' + (app.brush * 2 + 1);
  $('yearLbl').textContent = yr(app.year);
  $('sideBtn').textContent = app.team === 0 ? 'Red army' : 'Blue army';
  $('sideBtn').className = 't wide ' + (app.team === 0 ? 'red' : 'blue');
  $('stanceBtn').textContent = app.hold ? 'Hold ground' : 'Advance';
  $('stanceBtn').classList.toggle('on', app.hold);
  $('go').textContent = sim.running ? 'PAUSE' : 'GO';
  $('go').classList.toggle('on', sim.running);
  $('speedLbl').textContent = app.speed >= 1 ? app.speed + '×' : '1/' + Math.round(1 / app.speed) + '×';
  buildPalettes();
}

$('m_build').onclick = () => setMode('build');
$('m_army').onclick = () => setMode('army');
$('m_play').onclick = () => setMode('battle');
for (const t of ['block', 'slab', 'paint', 'erase']) $('t_' + t).onclick = () => { app.tool = t; sync(); };
$('brush').oninput = (e) => { app.brush = +e.target.value; sync(); };
$('speed').oninput = (e) => { app.speed = SPEEDS[+e.target.value]; sync(); };
$('sideBtn').onclick = () => { app.team = 1 - app.team; sync(); };
$('stanceBtn').onclick = () => { app.hold = !app.hold; sync(); };
$('go').onclick = toggleRun;
$('reset').onclick = () => { rebuild(); sync(); };
$('demo').onclick = () => { demo(); sync(); };
$('year').oninput = (e) => {
  app.year = +e.target.value;
  const avail = rosterFor(app.year);
  if (!avail.some(s => s.id === app.picked)) app.picked = avail[avail.length - 1].id;
  buildTray(); sync();
};

// --- loop ------------------------------------------------------------------
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
  $('redN').textContent = sim.aliveCount(0);
  $('blueN').textContent = sim.aliveCount(1);
  requestAnimationFrame(frame);
}

setGround();
buildTray();
demo();
rend.target.set(0, 0, 0);
rend.dist = 2400;
sync();

{
  const q = new URLSearchParams(location.search);
  if (q.has('dist')) rend.dist = +q.get('dist');
  if (q.has('tx')) rend.target.x = +q.get('tx');
  if (q.has('tz')) rend.target.z = +q.get('tz');
  if (q.has('run')) sim.running = true;
  for (let i = 0, n = +q.get('steps') || 0; i < n; i++) sim.update(DT);
}
window.EPOCH = { app, sim, rend, terrain, add, rebuild, paintTile, sync };

if (new URLSearchParams(location.search).has('selftest')) {
  const out = [];
  const ok = (n, c, x = '') => out.push(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' (' + x + ')' : ''}`);
  try {
    const i = 5, j = 5, gx = terrain.wx(i), gz = terrain.wz(j);
    app.mode = 'build'; app.brush = 0; app.mat = MAT.stone;
    const l0 = terrain.levelAt(i, j);
    app.tool = 'block'; paintTile({ x: gx, z: gz }, false);
    ok('block adds two half-steps', terrain.levelAt(i, j) === l0 + 2, `${l0} -> ${terrain.levelAt(i, j)}`);
    app.tool = 'slab'; paintTile({ x: gx, z: gz }, false);
    ok('slab adds one', terrain.levelAt(i, j) === l0 + 3);
    app.tool = 'erase'; paintTile({ x: gx, z: gz }, false);
    ok('dig removes a block', terrain.levelAt(i, j) === l0 + 1);
    app.tool = 'paint'; app.mat = MAT.crop;
    const lv = terrain.levelAt(i, j); paintTile({ x: gx, z: gz }, false);
    ok('paint keeps height', terrain.levelAt(i, j) === lv && terrain.typeAt(i, j) === MAT.crop);
    setMode('army');
    ok('army panel shows', !$('p_army').hidden && $('p_build').hidden);
    setMode('battle');
    ok('battle panel shows', !$('p_play').hidden && $('p_army').hidden);
    setMode('build');
    ok('palettes split ground/build',
       $('pal_ground').children.length === MATS.filter(m => !m.build).length &&
       $('pal_build').children.length === MATS.filter(m => m.build).length,
       `${$('pal_ground').children.length}/${$('pal_build').children.length}`);
    app.year = -2000; buildTray();
    ok('year locks later units', document.querySelectorAll('.card.locked').length > 0,
       document.querySelectorAll('.card.locked').length + ' locked');
    rebuild();
    ok('rebuild keeps the army', sim.units.length === app.placed.length, String(sim.units.length));
    ok('flow field builds', (sim.rebuildFlow(), sim.flow[0].ready));
  } catch (e) { out.push('FAIL threw: ' + e.message); }
  document.title = 'SELFTEST ' + out.join(' | ');
}

addEventListener('resize', () => rend.resize(cv.clientWidth, cv.clientHeight));
requestAnimationFrame(frame);
