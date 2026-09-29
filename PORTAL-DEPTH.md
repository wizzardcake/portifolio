# Portal interior depth

The volume below the tabletop opening. `portal-depth-volume.js` holds the pure
material/projection helpers, `portal-depth.js` the runtime and API, and
`portal-depth.css` the lining and fallback. It does not change the orb, cards,
cloth, table geometry, camera, room or lights. It sets the waterline the liquid
surface lies at, and it is seen through that surface (`PORTAL-SURFACE.md`).

## Physical versus optical

- **Physical:** the tabletop cut (unchanged) and a short lining: four CSS 3D wall
  faces, `wallDepth` × aperture height deep (clamped to 8–48 px). They are lit at the
  top, fade to transparent, and their ends are masked so the corners soften.
- **Waterline:** the water stands `waterLevel` × the lining's depth below the rim
  (`--water-depth` on `#screen`, about 16 px at 1440 × 900). The top of the lining
  stays dry above it; the rest is seen through the water. So the eye reads rim →
  dry stone → liquid → abyss.
- **Optical:** one opaque, camera-facing billboard (`.portal-abyss`) just below the
  lining, clipped to the rays through the opening. A single WebGL pass composites six
  layers, back to front: an unlit throat, two star fields, deep spiral energy with
  glow pockets, dark mist, sinking motes, and near mist lapping at the lining.
- **Seen through the water:** for every pixel the shader finds where its eye ray
  crosses the water and reads the surface's own slope field there (the `WATER` chunk
  from `portal-surface.js`, same clock). The slope displaces every layer by its depth
  (eased as depth / (1 + depth / 4), in aperture heights): the throat and stars sway
  most, the near mist barely. Ripples and rings from the surface therefore bend the
  depths beneath them exactly where they run. The glow pockets breathe with the water.

What makes it read as deep:

- Mist lies in horizontal sheets, so it is foreshortened like the opening.
- Log-polar noise drifts inward, shrinking toward the throat and twisting into a faint
  spiral. This is the idle suction cue.
- Pointer parallax is anchored to the fixed rim. A layer slides by
  depth / (eye height + depth), so deeper layers move further, as through a real hole.
- Darkness grows toward the throat and toward the front of the opening, where the
  view falls steeply.
- Motes (24; 12 below 600 px) sink along the view axis and gather inward. They shrink
  and fade out before they reach the axis.

## Tuning

```js
portalDepth.configure({fogDensity: 1.1, centralDarkness: .95});
portalDepth.configure(portalDepth.defaults); // restore
portalDepth.settings; // copy of current settings
portalDepth.stats;    // frames, pixels, plane, optical layers, visible motes
```

| Parameter | Default | Range | Effect |
| --- | ---: | --- | --- |
| `wallDepth` | .075 | .025–.14 | Physical lining depth, in aperture heights (8–48 px) |
| `waterLevel` | .36 | 0–.8 | Waterline, as a fraction of the lining below the rim (0 = flush) |
| `fogDensity` | .85 | 0–1.8 | Opacity of the near mist and deep energy |
| `centralDarkness` | .88 | 0–1 | Darkness of the throat and the dark-mist veil |
| `parallaxStrength` | 1 | 0–2 | Pointer parallax; 1 slides the deepest layer ~2.5% of the width |
| `particleDepthSpeed` | 1 | 0–3 | Speed at which motes sink (one life is 34–64 s at 1) |
| `inwardPull` | .35 | 0–1 | Inward flow of mist and energy, and how far motes gather |
| `swirlAmount` | .25 | 0–1 | Spiral twist and slow rotation |
| `deepGlowIntensity` | .65 | 0–1.5 | Brightness of the deep energy's glow pockets |

Layer depths, colours and speeds are constants in `portal-depth.js` and the shader in
`portal-depth-volume.js`. How strongly the water bends the depths is `REFRACTION` in
`portal-depth.js` (.2, roughly 1 − 1/n for water) times the surface's `refraction`
parameter.

## Runtime

- One WebGL context and one draw call per frame, at up to 30 fps. The canvas matches
  the opening's on-screen footprint × DPR, capped at 600k px (180k below 600 px).
- No DOM writes per frame: parallax, drift, motes and the water's slope are shader
  uniforms (`portalSurface.water`, read-only). It renders only while uncovered, on
  screen and in a visible tab. Reduced motion renders single static frames.
- Flow and rotation phases wrap on the noise's lattice periods, so long sessions never
  drift or smear.
- Without WebGL, a static CSS gradient abyss is shown (no motes).
- The table's back legs are hidden (`.has-portal-interior`). They are only ever
  visible through the opening, which the short lining no longer screens.

## Integration with the surface

- The whole interior lies below z = −(lining + clearance). The surface lies at
  z = −`--water-depth`, inside the lining, and draws over it. The depth shows through
  wherever the surface is translucent (most of it: the water hides 10–30 %).
- The layers riding on the water (`.portal-reaction`, the cloth's `.portal-impact`)
  are translated to the same waterline, so rings, flares and sparks start at the water.
- Never put `clip-path`, `filter`, `mask` or opacity < 1 on `#screen` or
  `.screen-tunnel`: that flattens the shared preserve-3d context. Clip individual
  layers instead. For the same reason the reveal fades the abyss and walls
  themselves; the tunnel only switches between 0 (covered) and 1.
- The interior bends and darkens on `portalReaction.sample()`, measured alike along
  both axes so its ring stays round, like the water's rings.
- `portalDepth.offsets` (live, aperture units, throat first) lets the surface light
  the water around the throat where the abyss actually shows it.
- `portal-impact.js` (cloth release) briefly scales `.portal-depth-layer`; with one
  billboard that contracts the whole interior, as before.

## Verification

`node tests/depth-check.mjs` checks: the shallow lining and hidden back legs, the
recessed waterline and the surface plane on it, a surface dormant under the cloth, the
abyss measurably displaced by the water's slope, a card arrival ringing the water,
a throat measurably darker than the opening, visible motes, no DOM writes during live
frames, rim-anchored parallax, drift, tuning isolation and clamping, pixel budgets,
reduced motion, covered reset and the CSS fallback. Screenshots go to the ignored
`.qa/depth-*.png`. `node tests/depth-check.mjs --serve` serves this worktree on
`http://127.0.0.1:4176` for review. `node tests/portal-check.mjs --depth-only` covers
the cutout, context loss and recovery, and retina/mobile budgets.
