// EPOCH — soldier skeletons. 11 points, built facing a yaw, standing on terrain.

export const ROSTER = [
  {
    id: 'legionary', name: 'Legionary', era: -400, cost: 26,
    hp: 62, scale: 1.0, mass: 1.2, speed: 0.85, reach: 40, brain: 'melee',
    skin: 0xc9a684, cloth: 0x8d3b2e, kit: 0xb9702c, hair: 0x2f2418,
    shield: { w: 25, h: 34, t: 7, mass: 5, soak: 0.66, color: 0xa8452f },
    weapon: { kind: 'melee', len: 34, tipR: 4, tipMass: 2.6, dmg: 13, swing: 980, rate: 0.95, style: 'thrust', look: 'gladius', color: 0xcfd6de },
    blurb: 'Shield forward, short stabbing sword. Works in a line.',
  },
  {
    id: 'hoplite', name: 'Hoplite', era: -700, cost: 28,
    hp: 58, scale: 1.0, mass: 1.2, speed: 0.78, reach: 88, keepAway: 58, brain: 'melee',
    skin: 0xc9a684, cloth: 0x9a7f3a, kit: 0x8a8f99, hair: 0x2f2418,
    shield: { w: 32, h: 32, t: 7, mass: 6, soak: 0.7, color: 0xb8952f },
    weapon: { kind: 'melee', len: 80, tipR: 4, tipMass: 2.8, dmg: 12, swing: 860, rate: 0.85, style: 'thrust', look: 'spear', color: 0x8f7448 },
    blurb: 'Long spear behind a round shield. Do not meet him head on.',
  },
  {
    id: 'levy', name: 'Levy', era: -3000, cost: 10,
    hp: 28, scale: 0.96, mass: 1, speed: 0.95, reach: 38, brain: 'melee',
    skin: 0xc9a684, cloth: 0x7c8a5a, kit: 0x6b5136, hair: 0x5a4632,
    weapon: { kind: 'melee', len: 40, tipR: 4, tipMass: 2.2, dmg: 7, swing: 900, rate: 0.85, style: 'thrust', look: 'spear', color: 0x8a6a43 },
    blurb: 'Given a sharpened stick and pointed at the enemy.',
  },
  {
    id: 'archer', name: 'Archer', era: -2000, cost: 24,
    hp: 26, scale: 1.0, mass: 0.95, speed: 0.85, reach: 620, keepAway: 240, brain: 'ranged',
    skin: 0xc9a684, cloth: 0x4d7a4f, kit: 0x6b4a22, hair: 0x6b4a22,
    weapon: { kind: 'bow', len: 26, tipR: 3, tipMass: 1.2, dmg: 15, rate: 1.7, muzzle: 1000, spread: 0.05, look: 'bow', color: 0x7a5c33 },
    blurb: 'Will shoot his own front rank. Regularly.',
  },
  {
    id: 'horsearcher', name: 'Horse Archer', era: -600, cost: 46,
    hp: 34, scale: 1.0, mass: 1.0, speed: 2.1, reach: 700, keepAway: 420, brain: 'ranged',
    skin: 0xc2a07c, cloth: 0x6f5a8a, kit: 0x4a3a28, hair: 0x241d16,
    weapon: { kind: 'bow', len: 24, tipR: 3, tipMass: 1.2, dmg: 14, rate: 1.5, muzzle: 1050, spread: 0.06, look: 'bow', color: 0x6b4a26 },
    blurb: 'Shoots, leaves, comes back. Never where you swung.',
  },
  {
    id: 'knight', name: 'Knight', era: 1100, cost: 58,
    hp: 132, scale: 1.1, mass: 2.0, speed: 0.72, reach: 50, brain: 'melee',
    skin: 0xc9a684, cloth: 0x4a5a86, kit: 0x9aa2ad, hair: 0x2f2418,
    shield: { w: 22, h: 38, t: 8, mass: 6, soak: 0.72, color: 0x4a5a86 },
    weapon: { kind: 'melee', len: 52, tipR: 5, tipMass: 4.2, dmg: 24, swing: 1250, rate: 1.25, look: 'sword', color: 0xcfd6de },
    blurb: 'Armoured to the point of inconvenience. Very hard to stop.',
  },
  {
    id: 'longbow', name: 'Longbowman', era: 1300, cost: 42,
    hp: 28, scale: 1.02, mass: 1.0, speed: 0.7, reach: 1500, keepAway: 520, brain: 'ranged',
    skin: 0xc9a684, cloth: 0x3f5f45, kit: 0x6b4a26, hair: 0x8a6a3a,
    weapon: { kind: 'bow', len: 30, tipR: 3, tipMass: 1.3, dmg: 21, rate: 2.3, muzzle: 1650, spread: 0.02, look: 'bow', color: 0x6b4a26 },
    blurb: 'Kills you from further away than you can see him.',
  },
  {
    id: 'rifleman', name: 'Rifleman', era: 1939, cost: 54,
    hp: 40, scale: 1.0, mass: 1.05, speed: 0.9, reach: 1700, keepAway: 600, brain: 'ranged',
    skin: 0xc9a684, cloth: 0x5d6b4a, kit: 0x3f4a33, hair: 0x3d2d1e,
    weapon: { kind: 'gun', len: 34, tipR: 2, tipMass: 0.6, dmg: 30, rate: 1.15, muzzle: 5200, spread: 0.012, look: 'rifle', color: 0x4a3a28 },
    blurb: 'Flat trajectory, no arc to duck under.',
  },
];

export const BY_ID = Object.fromEntries(ROSTER.map(u => [u.id, u]));

// Units available at a given year, newest first is irrelevant — the rule is
// simply: invented on or before the year you travelled to.
export function rosterFor(year) { return ROSTER.filter(u => u.era <= year); }

export function buildUnit(world, spec, x, z, groundY, team, uid, yaw) {
  const s = spec.scale, m = spec.mass;
  const common = { unit: uid, team };
  // facing and the axis across the shoulders
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = fz, rz = -fx;

  const Y = {
    foot: groundY, knee: groundY + 17 * s, hip: groundY + 34 * s,
    chest: groundY + 56 * s, head: groundY + 72 * s,
  };
  const P = (side, fwd, y, o) =>
    world.addPoint(x + rx * side + fx * fwd, y, z + rz * side + fz * fwd, o);

  const pt = {};
  pt.head  = P(0, 0, Y.head,  { ...common, r: 9 * s, im: 1 / (1.1 * m), tag: 'head' });
  pt.chest = P(0, 0, Y.chest, { ...common, r: 8 * s, im: 1 / (2.4 * m), tag: 'chest' });
  pt.hip   = P(0, 0, Y.hip,   { ...common, r: 7 * s, im: 1 / (2.0 * m), tag: 'hip' });

  pt.elbowL = P(-9 * s, 1 * s, Y.chest - 12 * s, { ...common, r: 4 * s, im: 1 / (0.5 * m), tag: 'limb', solid: false });
  pt.handL  = P(-10 * s, 6 * s, Y.chest - 24 * s, { ...common, r: 4.5 * s, im: 1 / (0.5 * m), tag: 'handL', solid: false });
  pt.elbowR = P(9 * s, 1 * s, Y.chest - 12 * s, { ...common, r: 4 * s, im: 1 / (0.5 * m), tag: 'limb', solid: false });
  pt.handR  = P(10 * s, 6 * s, Y.chest - 24 * s, { ...common, r: 4.5 * s, im: 1 / (0.5 * m), tag: 'handR', solid: false });

  pt.kneeL = P(-5 * s, 0, Y.knee, { ...common, r: 4.5 * s, im: 1 / (0.7 * m), tag: 'limb', solid: false });
  pt.footL = P(-7 * s, 0, Y.foot, { ...common, r: 5 * s, im: 1 / (0.8 * m), tag: 'foot', solid: false });
  pt.kneeR = P(5 * s, 0, Y.knee, { ...common, r: 4.5 * s, im: 1 / (0.7 * m), tag: 'limb', solid: false });
  pt.footR = P(7 * s, 0, Y.foot, { ...common, r: 5 * s, im: 1 / (0.8 * m), tag: 'foot', solid: false });

  const S = (a, b, o) => world.addStick(pt[a], pt[b], o);
  const bones = [
    S('head', 'chest'), S('chest', 'hip'),
    S('chest', 'elbowL'), S('elbowL', 'handL'),
    S('chest', 'elbowR'), S('elbowR', 'handR'),
    S('hip', 'kneeL'), S('kneeL', 'footL'),
    S('hip', 'kneeR'), S('kneeR', 'footR'),
    S('head', 'hip', { stiff: 0.22 }),
    S('chest', 'kneeL', { stiff: 0.08 }),
    S('chest', 'kneeR', { stiff: 0.08 }),
    S('elbowL', 'elbowR', { stiff: 0.10 }),      // keeps shoulders square
    S('footL', 'footR', { stiff: 0.10, minOnly: true }),
  ];

  const unit = {
    uid, spec, team, yaw,
    p: pt, all: Object.values(pt), bones,
    hp: spec.hp, maxHp: spec.hp,
    alive: true, limp: 0,
    gait: Math.random() * Math.PI * 2,
    cd: Math.random() * 0.6, swingT: 0,
    target: null, retarget: Math.random() * 0.4,
    hitLock: new Map(), flash: 0,
    weapon: null, shieldPts: null,
    hold: false, anchorX: x, anchorZ: z,
    lean: { x: 0, z: 0 },
    apex: 0,
  };

  const w = spec.weapon;
  if (w) {
    const tip = world.addPoint(
      pt.handR.x + fx * w.len * s * 0.8, pt.handR.y + 10 * s, pt.handR.z + fz * w.len * s * 0.8,
      { unit: uid, team, r: w.tipR * s, im: 1 / (w.tipMass * m), tag: 'tip', solid: false });
    const hold = world.addStick(pt.handR, tip, { len: w.len * s });
    const brace = world.addStick(pt.elbowR, tip, {
      len: Math.hypot(tip.x - pt.elbowR.x, tip.y - pt.elbowR.y, tip.z - pt.elbowR.z),
      stiff: 0.30,
    });
    unit.weapon = { tip, hold, brace, spec: w, len: w.len * s };
    unit.all.push(tip);
  }

  if (spec.shield) {
    const sh = spec.shield;
    const top = world.addPoint(pt.handL.x, pt.handL.y + sh.h * 0.5 * s, pt.handL.z,
      { unit: uid, team, r: sh.w * s * 0.25, im: 1 / (sh.mass * m), tag: 'shield' });
    const bot = world.addPoint(pt.handL.x, pt.handL.y - sh.h * 0.5 * s, pt.handL.z,
      { unit: uid, team, r: sh.w * s * 0.25, im: 1 / (sh.mass * m), tag: 'shield' });
    world.addStick(top, bot, { len: sh.h * s });
    world.addStick(pt.handL, top, { len: sh.h * 0.5 * s });
    world.addStick(pt.handL, bot, { len: sh.h * 0.5 * s });
    world.addStick(pt.elbowL, top, {
      len: Math.hypot(top.x - pt.elbowL.x, top.y - pt.elbowL.y, top.z - pt.elbowL.z), stiff: 0.4 });
    unit.shieldPts = { top, bot, spec: sh };
    unit.all.push(top, bot);
  }

  return unit;
}
