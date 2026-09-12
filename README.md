# EPOCH (working name — rename it)

Minecraft, if it were a wargame. The world is a **tile grid**: you build the
castle, the city walls and the farm out of blocks, each district with its own
ground and its own building material, then you put two armies on it and press
GO.

Everything about walls falls out of one number — a soldier can climb **one**
level. Three levels of stone cannot be climbed, so a one-level gap is a gate,
and a gate is a chokepoint. Armies path with a shared flow field per side, so
they pour around walls and funnel through the gate instead of pressing their
faces against the stonework.

**Camera is locked at -60 degrees and never rotates.** Pan and zoom only. That
is a design rule, not a limitation — do not add yaw controls.

    python3 -m http.server 8141
    # http://localhost:8141

`b` switches building/armies · click places a block, `shift`+click removes one
· `[` `]` brush size · right-drag pans · wheel zooms · `space` go · `tab` side
· `g` hold-position

## How a soldier works

Four points: a base on the ground, a chest, a head, and the tip of whatever he
is holding. No rig and no animation data — he balances, so what the solver does
to him is what you see, and he topples when he dies.

He was eleven points with articulated arms and legs. That cost roughly three
times the physics and fourteen draw calls a man to render detail invisible at
any sane zoom. Four points and five draws runs **400 men at 3.3ms a step**.

The muscle gains are **accelerations, not forces**, so they are mass
independent — a Knight moves like a Levy, only slower because his spec says so.
Shields are a damage rule (`soak`, applied to frontal hits) rather than physics
objects.

## Gotchas paid for in blood

- Verlet "velocity" is position-minus-previous-position, and the constraint
  solver moves positions without touching the previous ones. Never use it to
  detect falling — measure drop height instead.
- Internal muscle forces need a reaction on the body. A shield held with a
  one-sided force is a free engine; it made shield carriers outrun cavalry.
- A long spear swung on an arc sweeps clean over anyone inside its length.
  Spears `style: 'thrust'` and need `keepAway` so they give ground.
- Ranged units must spread their volleys, or 30 bows all kill the same one man.
- Patching JS with `python str.replace` fails SILENTLY when the needle has
  drifted. It cost two debugging rounds here. Verify with grep, or use an edit
  tool that errors on no-match.
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
