import { Sim } from './sim.js';
import { Terrain } from './terrain.js';
import { Renderer, TEAM } from './render.js';
import { ROSTER, BY_ID, rosterFor } from './units.js';

const cv = document.getElementById('cv');
const rend = new Renderer(cv, 500);
const sim = new Sim();
const terrain = new Terrain(3000, 40);
sim.terrain = terrain;

const app = { year: -230, picked: 'legionary', team: 0, hold: false, speed: 1, placed: [] };
const $ = (id) => document.getElementById(id);

function setGround() {
  // Hand-placed landform, not noise: one long ridge and a rise on the right.
  terrain.applyFeatures([
    { type: 'ridge', x: -1800, z: -900, x2: 1400, z2: 1500, r: 700, height: 150 },
    { type: 'hill', x: 900, z: -300, r: 1100, height: 320 },
    { type: 'basin', x: -900, z: 600, r: 800, height: 120 },
  ]);
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
  if (e.button === 0 && !e.shiftKey) {
    const g = ground(e);
    if (g) add(app.picked, g.x, g.z, app.team, app.hold);
    drag = { mode: 'place' };
  } else {
    drag = { mode: 'pan', x: e.clientX, y: e.clientY, t: rend.target.clone() };
  }
});
cv.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (drag.mode === 'pan') {
    const k = rend.dist / cv.clientHeight * 1.4;
    rend.target.x = drag.t.x - (e.clientX - drag.x) * k;
    rend.target.z = drag.t.z - (e.clientY - drag.y) * k / Math.sin(Math.PI / 3);
  }
});
addEventListener('pointerup', () => { drag = null; });
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  rend.dist = Math.max(220, Math.min(6000, rend.dist * (e.deltaY < 0 ? 0.9 : 1 / 0.9)));
}, { passive: false });

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
});
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
window.EPOCH = { app, sim, rend, terrain, add, rebuild };
requestAnimationFrame(frame);
