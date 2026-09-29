# Portal surface

The living liquid in the opening: one transparent WebGL plane (`.portal-surface`),
`portal-surface.js`. It lies at the waterline the well sets (`--water-depth`,
`PORTAL-DEPTH.md`), below the rim, so the top of the stone lining stays dry and the
rest of it is seen through the water. The abyss below is seen through it as well.

## One liquid, two layers

The water's slope field is a GLSL chunk (`WATER`, exposed as `portalSurface.glsl`):

- **Idle:** broad swells in four directions at unrelated speeds, plus two drifting
  noise layers. Never repeats, damped at the walls.
- **Rings:** up to six trains of crests running outward from wherever something
  entered the water. They widen and fade as they spread.
- **Pull:** a smooth dip drawn down under a dropped orb.

The surface shades itself with it: Fresnel reflections of the room's real lights and
the hovering orb, the fine shimmer, and the abyss's own light caught on wave faces.
The same chunk, on the same clock, is compiled into the abyss shader
(`portal-depth-volume.js`). There it displaces every depth layer by the slope where
the eye ray crosses the water, more for deeper layers. That is why the depths sway
and part under the moving surface, rather than sit still behind it.

What the water adds of its own stays restrained: light from the abyss in a loose
ring around the throat (teal to the left, violet to the right, as in the depths), a
few wisps just under the surface, and a faint glow along disturbed crests. The throat
stays dark. The breathing (two unrelated periods) is shared with the abyss's glow
pockets.

## What rings the water

| Source | Event | Where / when |
| --- | --- | --- |
| Orb drop (`portal-reaction.js`) | `portal-reaction-start` | Contact point, timed with the canvas waves |
| Cloth release (`portal-impact.js`) | `portal-impact` | Where the cloth lost its grip |
| Card thrown in (`script.js`) | `card-portal-arrival` | Landing point; strength from arrival speed |
| Orb rising out of the portal | its centre crossing the waterline | Aperture centre |

`portalSurface.splash(x, y, strength)` does the same by hand (aperture fractions:
x left to right, y back to front). Reduced motion never rings the water.

## Tuning

Live, every frame: `portalSurface.params`. 1 is the default look, 0 switches a part
off. The water level is a property of the well: `portalDepth.configure({waterLevel})`.

| Parameter | Default | Effect |
| --- | ---: | --- |
| `rippleAmplitude` | 1 | Slope of the idle swells and small ripples |
| `rippleSpeed` | 1 | Pace of the swells, the drift and the shimmer |
| `shimmer` | 1 | Fine travelling glints of the room's light |
| `refraction` | 1 | How strongly the ripples bend the view beneath, abyss included |
| `cloudSpeed` | 1 | Drift of the wisps under the surface |
| `glow` | 1 | The abyss's light caught by the water, the wisps and crest glow |
| `splash` | 1 | Strength of the rings raised by things entering the water |
| `breathing` | .18 | Slow swell of glow and ripple strength (fraction) |

Ring speed matches `portalReaction`'s `rippleSpeed` (.86 aperture heights per second;
an orb drop uses the reaction's current setting). The wavelength (.06) and lifetime
(3.2 s) are constants in `portal-surface.js`.

## Runtime

- One WebGL context, one draw call per frame at up to 30 fps. Canvas budget: 260k px
  (110k below 700 px wide), at most 1.5 × DPR.
- Its animation frame is requested only while the table is uncovered, on screen and
  in a visible tab. Under the cloth it does no work at all. Reduced motion draws
  single still frames.
- `portalSurface.water` is the per-frame state other layers read: clock, slope
  strength, rings, pull, refraction. It is read-only for them.
- Without WebGL: a still CSS tint, and the abyss is not refracted.

## Verification

`node tests/depth-check.mjs` covers the waterline, the surface plane lying on it, the
surface staying dormant under the cloth, the abyss measurably displaced by the
water's slope, and a card arrival ringing the water. `node tests/impact-check.mjs`
covers the orb dipping into the recessed water at contact and the reaction layer
riding on it.
