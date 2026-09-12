# EPOCH (working name — rename it)

A 2.5D historical battle simulator. Pick a year, shape the ground, place two
armies, press GO and watch it happen.

**Camera is locked at -60 degrees and never rotates.** Pan and zoom only. That
is a design rule, not a limitation — do not add yaw controls.

    python3 -m http.server 8141
    # http://localhost:8141

click places a unit · right-drag pans · wheel zooms · `space` go · `tab` side
· `g` hold-position

## How a soldier works

There is no rig and no animation data anywhere. Every man is 11 verlet points
and a set of distance constraints; what the solver does to him is what you see.
He stands because of three things running every frame in `sim.js`:

- a PD controller on the spine (keep the head over the hips)
- knees that refuse to fold (they ride the hip->foot line)
- feet that step under the centre of mass, and *ahead* of it when walking

All muscle gains are **accelerations, not forces**, so they are mass
independent — a Knight's limbs move at the same speed as a Levy's.

## Gotchas paid for in blood

- Verlet "velocity" is position-minus-previous-position, and the constraint
  solver moves positions without touching the previous ones. Never use it to
  detect falling — measure drop height instead.
- Internal muscle forces need a reaction on the body. A shield held with a
  one-sided force is a free engine; it made shield carriers outrun cavalry.
- A long spear swung on an arc sweeps clean over anyone inside its length.
  Spears `style: 'thrust'` and need `keepAway` so they give ground.
- Ranged units must spread their volleys, or 30 bows all kill the same one man.
- Arrow drag is tiny on purpose: the ballistic solve assumes a vacuum, and
  0.002/step put longbow arrows 211px short.

## Tools

    node tools/harness.mjs stand|duel|brawl

Headless Chrome's virtual clock does not drive rAF, so `?steps=N` advances the
sim N ticks before the first paint — that is the only way to screenshot a
battle that has actually happened. WebGL needs
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.

## Not built yet

The world map select (low-poly countries on pedestals), the time-machine
cutscene, per-era map dressing, and location-special units.
