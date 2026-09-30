# Portal orb

The floating orb is the portal's heart. It is still one piece of matter: sealed in the
socket under the cloth, risen as a free orb, and morphed into the page when a card is
thrown in. `portal-effects.js` owns it: its pose, transitions and reactions, and
`window.portalMatter`. `portal-orb-material.js` holds its shader and tuning table.

## How it behaves

- **Awakening.** It is dark while dormant. As it rises out of the water after the
  cloth comes off, its heart lights up with the rise, and the water rings where it
  breaks the surface.
- **Idle.** It floats slowly on two unrelated periods (about 5 px), wanders a little
  over the water (about 3 px) and breathes on a 5.8 s cycle that swells the heart's
  glow. Its inner layers turn at different rates, and a faint ring answers each
  heartbeat. The wander is a transform: the orb's footprint stays at the portal
  centre. Idle life eases in, and transitions carry the rendered pose so they
  start where the float left the orb.
- **Lighting.** The room's own lights, taken from the orb's actual position:
  - the warm lamp by the nook gives the crisp main highlight;
  - the frontal fill and a dim cool sky give only soft sheen;
  - the green window and the violet stair, both behind the orb, each wrap only the
    edge on their own side, so the orb goes green toward the window and violet
    toward the stair;
  - the portal's teal and violet glow light it from below.

  The skin mirrors the room at grazing angles (Fresnel). Highlights follow the ball's
  broad form rather than every ripple of the skin.
- **Inside.** The view refracts into a thick volume and crosses it in 10 steps:
  - mist that absorbs, which gives darker, deeper regions;
  - a breathing teal heart;
  - sparse energy currents, only where a slower field allows them;
  - a few glow pockets.

  The room shows faintly through it, refracted and upside down.
- **Contact with the water.**
  - Its light pools on the water beneath it, tighter and brighter as it comes down.
  - The water around the pool darkens slightly.
  - The water is drawn gently up toward it, in time with its breath.
  - Its reflection sits where it actually floats, in its current light.
- **A card through the surface.** On `card-portal-arrival` (`script.js`), after
  `arrivalDelay`, the orb dives. Times below are at `diveSpeed` 1, from the fall.
  1. **Falls (0–0.28 s).** It gathers speed straight down and draws out into a
     teardrop with its tail up.
  2. **Goes through (0.28–0.78 s).** It passes through the surface. The water rings
     and draws in, and the part below the waterline is seen through the water,
     dimmer and bluer. It keeps sinking, slowing, along the line of sight into the
     abyss's throat rather than straight down behind the rim. It fades as it goes and
     is gone by 0.78 s.
  3. **Unseen (0.78–0.98 s, `beat`).** The water swells over the spot, and the depth
     brightens a little beneath it.
  4. **Bursts back out (from 0.98 s).** A smaller, stretched droplet shoots up out
     of the same water, tail down. A liquid neck ties its foot to the surface and
     pinches free as the gap opens. The water rings again, with a flare and a spray of
     sparks. Without a pending page, the droplet grows back to full size, rounds
     out, overshoots its rest height slightly, squashes once and settles by about
     1.96 s.
  5. **Opens into the page (when a card's page waits, from 1.40 s).** A droplet
     bound for a page stays drawn out along its rise instead of gathering itself
     back into the orb. Just after its neck pinches free it carries straight on
     toward the page, in one motion:
     - it keeps its upward speed and its drawn-out, tailed form for a moment
       (a stretched orb);
     - its tail and stretch blend away while it spreads into a lens facing the
       reader, as wide as its growing frame allows (opening);
     - the lens squares off into the page's frame while its inner light gives
       way to the page's dark glass (unfolding);
     - it settles as the page 1.25 s later. The HTML page then fades in over that
       glass while the glass fades out beneath it.

     Translation, growth, the opening and the morph overlap throughout. It never
     returns to the orb's float or stops on the way.

  The water's answers are timed by the reaction controller at the same moments
  (`portalReaction.trigger` with a `dive` timeline). `project()` marks the drop as
  bound for a page (settled before it bursts back out, so the rebound never changes
  course midway) and waits for the rendered dive clock and neck clearance. It then
  takes over during the upward rebound, before its apex, from the displayed pose,
  size and droplet form. The velocity it carries on with comes from the droplet's
  own path, not from the frames drawn, so it is the same at any frame rate. Hermite
  curves carry that motion into the page's translation and blend the droplet's form,
  with the rate it was changing at, into the opening. There is no intermediate
  settled orb or new idle pose. With default timing, opening starts about 1.52 s
  after the card arrives (0.12 s delay + 1.40 s into the dive), subject to frame
  timing and neck clearance. The page travels and opens over `pageDuration`;
  `formBlend` sets how quickly the droplet's form hands over to the opening, and
  `pageLens` how far it spreads into a lens first. The water, flare and sparks
  finish their response beneath it through `portalReaction.releaseOrb()`. A reset
  or restore during the wait settles it, and `project()` then resolves `false`. A
  plain `triggerPortalImpact()` still just dips the orb into the water and back.
- **Reduced motion.** There is no float, wander, breath, turning or drop: the orb is
  a still, lit volume. The card flow skips the dive wait and the page transition
  takes 80 ms.

## Tuning

```js
portalOrb.configure({innerGlow: 1.2, rimLight: 1.3});
portalOrb.configure(portalOrb.defaults); // restore
portalOrb.settings; // copy of the current settings
portalOrb.stats;    // mode, awake, breath, height, drift, stretch, dive, pose, velocity, morph, open, waitingForDrop, renderPixels
portalOrb.contact;  // live and read-only: where it is over the water, and its light
```

| Parameter | Default | Range | Effect |
| --- | ---: | --- | --- |
| `innerGlow` | 1 | 0–2 | Light inside: heart, currents, glow pockets |
| `mist` | 1 | 0–2 | Density of the inner mist, its darker and deeper regions |
| `swirlSpeed` | 1 | 0–3 | Turning of the inner layers |
| `rimLight` | 1 | 0–2 | Edge light and the room's colour caught at the edge |
| `highlight` | 1 | 0–2 | Main highlight and its soft halo |
| `roomLight` | 1 | 0–2 | How strongly the room's green, violet and warm light register |
| `wobble` | .2 | 0–1 | Liquid undulation of the skin (the silhouette stays round) |
| `breathing` | 1 | 0–2 | Swell of the heart's glow, and of the water answering it |
| `bob` | 1 | 0–3 | Slow float (about 5 px at 1) |
| `drift` | 1 | 0–3 | Slow wander over the water (about 3 px at 1) |
| `contactGlow` | 1 | 0–2 | The orb's light pooled on the water beneath it |
| `contactShadow` | 1 | 0–2 | The water darkened under it |
| `dimple` | 1 | 0–3 | The water drawn gently up toward it |
| `pulseRipple` | .12 | 0–.5 | Faint rings from the heartbeat (0 = none) |
| `squash` | 1 | 0–2 | How strongly it stretches and squashes on the way |
| `teardrop` | .45 | 0–.8 | How far it narrows into a drop's tail (0 = stays round) |
| `neck` | 1 | 0–2 | Thickness of the neck tying the rising droplet to the water |
| `diveSpeed` | 1 | .5–2 | Tempo of the whole dive (2 = twice as fast) |
| `diveDepth` | 2.6 | 1–5 | Orb radii it sinks below the surface while it fades |
| `beat` | .2 s | 0–.8 | Unseen below the surface before it bursts back out |
| `emergeSize` | .7 | .4–1 | Its size as it breaks back out; it grows to full size |
| `reboundStretch` | .42 | 0–.8 | How elongated it shoots back out |
| `rebound` | .6 | 0–1.5 | Overshoot as it springs back to rest (0 = none) |
| `arrivalDrop` | 1 | 0–1 | Strength of the dive when a card arrives (0 = no dive) |
| `arrivalDelay` | .12 s | 0–.6 | From the card's splash to the orb's fall |
| `handoff` | 0 s | −.8–1.5 | Offset added to .08 s after `clear`, divided by `diveSpeed`; bounded to preserve an upward handoff |
| `pageDuration` | 1.25 s | .6–2 | Travel and opening duration; 80 ms under reduced motion |
| `formBlend` | .32 s | .15–.5 | Time to blend the carried droplet shape into the opening |
| `pageLens` | 1 | 0–1 | How far it spreads into a lens facing the reader before the page's corners form (0 = straight from orb to page) |

`handoff` is an adjustment to the rising handoff, not a wait after settling. The
requested time is `clear + (.08 + handoff) / diveSpeed`, bounded no earlier than
`clear` and no later than 78% of the rise-to-apex interval. The rendered neck must
also have cleared before the waiting page is released.

The reader destination can be supplied when projecting. A function receives the
current `sceneCamera.reader()` target each frame, so it follows viewport changes;
an object supplies fixed overrides. `width` and `height` are positive local pixel
sizes, `x` is the offset from the aperture centre, and `y`/`z` use the reader's
existing portal-local coordinates. The orb and the HTML reader use the same target.

```js
await portalMatter.project('prosjekter', {
  target: base => ({...base, x: 24, z: base.z + 12}),
});
```

This optional target changes the destination only; it does not replace the card's
activation/retrieval lifecycle or change the camera.

The rings, flare, sparks and suction are set in `portal-reaction.js`
(`portalReaction.configure`, `PORTAL-REACTION.md`). A plain dip's distance and speed
are set there too.
Light positions and colours are the `ROOM` table in `portal-effects.js`. The window's
and the stair's positions come from `portalSurface.lights`, so the orb and the water
agree.

## Files

- `portal-orb-material.js` (new): the orb's material and tuning table. It is pure: no
  DOM, pose or state. The shader draws the drop's forms: squash and stretch, the
  teardrop tail, the neck to the water, its growth, and the waterline seen through
  the water. Opening into a page, it draws the lens (`open`: wider along the canvas,
  a little shorter, flatter toward the reader) and then the page's frame, which
  faces the reader throughout. The orb's light stays with it well into the morph and
  settles into dark glass like the HTML reader's own. Its silhouette remains traced
  from the same shape through the page morph, so starting the morph does not
  suddenly apply a circular dome mask.
- `portal-effects.js`: the orb's pose, idle life, lighting, squash and stretch, contact
  data, the card-arrival dive (`diveTimeline`, `divePose`) and page hand-off, and
  `window.portalOrb`.
- `portal-reaction.js`: an optional `dive` timeline for `trigger`, to which the water
  answers (see `PORTAL-REACTION.md`).
- `portal-surface.js`:
  - reads `portalOrb.contact` for the reflection, the light pool, the shade and the
    dimple;
  - exposes `portalSurface.lights`.
- `portal.css`: the wander in the orb's transform and the shared reader target's
  horizontal offset. The flat drop shadow is kept only for the CSS stand-in.
- `index.html`: loads the material before `portal-effects.js`.
- `tests/orb-check.mjs`: the checks below.

## Runtime

- It uses the same single WebGL context and pixel cap as before: at most 640 px a side,
  at most 1.5 × DPR.
- It runs at about 30 fps at rest, and at full rate during transitions and drops.
  While the dived drop is out of sight it draws nothing, only clearing its canvas.
- The shader adds a 10-step march through the interior. Actual frame pacing depends
  on the browser, GPU and viewport; the animation's update rates are not an FPS
  measurement.
- The canvas stays fully visible until the morph reaches 1, when the projection
  promise resolves and the caller opens the HTML page. Its glass then fades out
  over about half a second while the page fades in over it (at once under reduced
  motion), so no frame shows neither. Once it has faded, the orb canvas stops
  drawing.
- No DOM layers are added. Per frame it writes two custom properties for the wander;
  the orb already wrote its height every frame.

## Verification

`node tests/orb-check.mjs` checks:

- the dormant heart and bounded tuning;
- a lit heart inside a darker body, green on the window side and violet on the stair
  side;
- the centred footprint, and stillness under reduced motion;
- the orb's light measurably pooled on the water;
- the float, breath and wander, and the water drawn up toward the orb;
- a real card throw:
  - the orb falls as a stretched teardrop and goes all the way through the surface;
  - it is lost in the depth;
  - it bursts back out as a smaller, stretched, tail-down droplet, tied to the water
    by a neck;
  - the page starts opening while the droplet is still rising after neck clearance;
  - rendered position and droplet form carry through the handoff without a jump,
    and it keeps rising on both sides of it;
  - the water response continues after the orb hands off to the page;
  - the canvas remains visible through the final morph until the HTML reader opens;
- the same flow on a frozen clock at exactly 60 fps, independent of this machine's
  speed:
  - the droplet's neck shows above the surface (under 0.1 s, too short to catch
    reliably in real time on a software renderer);
  - the page takes over a rising, drawn-out droplet, and its speed carries into
    the flight (within 12%);
  - from the burst out of the water until the page has nearly formed, every frame
    moves or grows it;
  - no frame is a plain orb, and no form or size value jumps between frames;
  - the forming page's face is solid, and its glass fades out over the open HTML
    reader rather than at once;
  - stage screenshots: rebound, neck, lift, lens, unfolding, glass, reader;
- a reset during the dive opening no page;
- the CSS fallback, with no browser or shader errors.

Screenshots go to `.qa/orb-*.png`. `node tests/orb-check.mjs --serve` serves this
worktree on `http://127.0.0.1:4177`.
