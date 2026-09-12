import { Sim } from '../js/sim.js';
import { ROSTER } from '../js/units.js';
const DT = 1 / 60;
const mode = process.argv[2] || 'stand';

if (mode === 'stand') {
  for (const spec of ROSTER) {
    const s = new Sim(); const u = s.spawn(spec.id, 0, 0, 0, 0); s.running = true;
    let worst = 0;
    for (let i = 0; i < 1200; i++) {
      s.update(DT);
      const vx = u.p.head.x - u.p.hip.x, vy = u.p.head.y - u.p.hip.y, vz = u.p.head.z - u.p.hip.z;
      if (i > 60) worst = Math.max(worst, Math.atan2(Math.hypot(vx, vz), vy));
    }
    console.log(`${worst < 0.55 ? 'OK  ' : 'FELL'} ${spec.name.padEnd(14)} head ${u.p.head.y.toFixed(1).padStart(5)}  drift ${Math.hypot(u.p.hip.x, u.p.hip.z).toFixed(0).padStart(5)}  tilt ${(worst * 180 / Math.PI).toFixed(0)}deg`);
  }
}
if (mode === 'duel') {
  const ids = ROSTER.map(r => r.id);
  for (const a of ids) {
    const row = [];
    for (const b of ids) {
      if (a === b) { row.push(' - '); continue; }
      let w = 0;
      for (let k = 0; k < 7; k++) {
        const s = new Sim(); s.spawn(a, -90, 0, 0); s.spawn(b, 90, 0, 1); s.running = true;
        for (let i = 0; i < 1800; i++) { s.update(DT); if (!s.aliveCount(0) || !s.aliveCount(1)) break; }
        if (s.aliveCount(0) && !s.aliveCount(1)) w++;
      }
      row.push(String(w).padStart(2) + ' ');
    }
    console.log(a.padEnd(12) + row.join(''));
  }
  console.log('            ' + ids.map(i => i.slice(0, 2) + ' ').join(''));
}
if (mode === 'brawl') {
  const n = Number(process.argv[3] || 40);
  const s = new Sim();
  for (let i = 0; i < n; i++) {
    s.spawn(ROSTER[i % ROSTER.length].id, -700, -600 + i * 32, 0, Math.PI / 2);
    s.spawn(ROSTER[(i + 3) % ROSTER.length].id, 700, -600 + i * 32, 1, -Math.PI / 2);
  }
  s.running = true;
  const t0 = Date.now();
  let i = 0;
  for (; i < 60 * 90; i++) { s.update(DT); if (!s.aliveCount(0) || !s.aliveCount(1)) break; }
  console.log(`${n}v${n}: ${s.aliveCount(0)}v${s.aliveCount(1)} at ${(i * DT).toFixed(0)}s`);
  console.log(`${((Date.now() - t0) / i).toFixed(2)} ms/step (need <16.6), ${s.world.points.length} points`);
}
