# Portal interior depth

The volume below the tabletop opening. `portal-depth-volume.js` holds the pure
material/projection helpers, `portal-depth.js` the runtime and API, and
`portal-depth.css` the lining and fallback. It does not change the surface, orb,
cards, cloth, table geometry, camera, room or lights.

## Physical versus optical

- **Physical:** the tabletop cut (unchanged) and a short lining: four CSS 3D wall
  faces, `wallDepth` × aperture height deep (clamped to 8–48 px). They are lit at the
  top, fade to transparent, and their ends are masked so the corners soften.
- **Optical:** one opaque, camera-facing billboard (`.portal-abyss`) just below the
  lining, clipped to the rays through the opening. A single WebGL pass composites six
  layers, back to front: an unlit throat, two star fields, deep spiral energy with
  glow pockets, dark mist, sinking motes, and near mist lapping at the lining.

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
| `fogDensity` | .85 | 0–1.8 | Opacity of the near mist and deep energy |
| `centralDarkness` | .88 | 0–1 | Darkness of the throat and the dark-mist veil |
| `parallaxStrength` | 1 | 0–2 | Pointer parallax; 1 slides the deepest layer ~2.5% of the width |
| `particleDepthSpeed` | 1 | 0–3 | Speed at which motes sink (one life is 34–64 s at 1) |
| `inwardPull` | .35 | 0–1 | Inward flow of mist and energy, and how far motes gather |
| `swirlAmount` | .25 | 0–1 | Spiral twist and slow rotation |
| `deepGlowIntensity` | .65 | 0–1.5 | Brightness of the deep energy's glow pockets |

Layer depths, colours and speeds are constants in `portal-depth.js` and the shader in
`portal-depth-volume.js`.

## Runtime

- One WebGL context and one draw call per frame, at up to 30 fps. The canvas matches
  the opening's on-screen footprint × DPR, capped at 600k px (180k below 600 px).
- No DOM writes per frame: parallax, drift and motes are shader uniforms. It renders
  only while uncovered, on screen and in a visible tab. Reduced motion renders single
  static frames.
- Flow and rotation phases wrap on the noise's lattice periods, so long sessions never
  drift or smear.
- Without WebGL, a static CSS gradient abyss is shown (no motes).
- The table's back legs are hidden (`.has-portal-interior`). They are only ever
  visible through the opening, which the short lining no longer screens.

## Integration notes for the surface branch

- The whole interior lies below z = −(lining + clearance), and a surface near z = 0
  draws over it. The depth only shows through wherever the surface is translucent.
- Never put `clip-path`, `filter`, `mask` or opacity < 1 on `#screen` or
  `.screen-tunnel`: that flattens the shared preserve-3d context. Clip individual
  layers instead. For the same reason the reveal fades the abyss and walls
  themselves; the tunnel only switches between 0 (covered) and 1.
- The interior already bends and darkens on `portalReaction.sample()`. A surface
  ripple should read the same adapter rather than call into the depth module.
- `portal.css` still styles the retired `.portal-stars`, `.portal-fog`,
  `.portal-particles` and `.portal-mote`. They were left in place to keep this pass out
  of a shared file and are safe to delete.
- `portal-impact.js` (cloth release) briefly scales `.portal-depth-layer`; with one
  billboard that contracts the whole interior, as before.

## Verification

`node tests/depth-check.mjs` checks: the shallow lining and hidden back legs, a
throat measurably darker than the opening, visible motes, no DOM writes during live
frames, rim-anchored parallax, drift, tuning isolation and clamping, pixel budgets,
reduced motion, covered reset and the CSS fallback. Screenshots go to the ignored
`.qa/depth-*.png`. `node tests/depth-check.mjs --serve` serves this worktree on
`http://127.0.0.1:4176` for review. `node tests/portal-check.mjs --depth-only` covers
the cutout, context loss and recovery, and retina/mobile budgets.
