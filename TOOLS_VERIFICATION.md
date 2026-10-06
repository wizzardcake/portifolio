# Shelf tools verification

All visual work and checks use the isolated `feature/shelf-tools` worktree.
Existing files in the original checkout and this worktree were not edited.
`verification/` was already gitignored; no ignore-file change was needed.

## What was built

- **Figma:** five individually extruded, beveled and slightly crowned enamel
  pieces in the five official colors, above a turned stone pedestal with bronze
  bands. Slow phased drift/rotation; hover assembles the logo and aligns its yaw
  toward the supplied camera. Physical depth remains visible from the side.
- **Grimoire:** thick leather boards, curved solid page blocks, separate deformed
  parchment surfaces, layered page edges, corner fittings, a bookmark, and a
  walnut stand. Procedural aged paper carries blue abstract glyphs; pages flutter
  slightly, writing pulses, and seven small glyph sprites rise/fade on hover.
- **Crystal:** a lathed bronze base, swept feet/claws, studs and teal inlay, with
  a transparent physical glass shell and one small noise shader. Teal/violet
  mist uses the existing portal orb palette and Fresnel idea without its
  raymarching. Hover eases brightness and increases swirl speed.

No downloaded models, textures, fonts or controls. Factories add zero lights.
Static details are merged by material. Only the crystal uses a custom shader.

## Visual review

1. **First pass** (`verification/tools/attempt-1/`): all three had real volume,
   but the Figma cap faces were too flat, the pages too pristine and the crystal
   pattern resembled surface marbling. The reduced-motion check found a tiny
   residual camera-yaw interpolation, subsequently fixed.
2. **Second pass** (`verification/tools/attempt-2/`): added convex Figma caps,
   softer polish, parchment stains/wear, and view-dependent inward sampling for
   the crystal mist. The shapes read better. A resource test was corrected to
   exclude Three.js's globally shared Sprite quad, which factories must not free.
3. **Final pass** (`verification/tools/final/`): refined enamel normals, corrected
   microscopic duplicate arc endpoints that caused bevel seams, and fitted the
   book's triangular corner guards inward. Close-ups and side views confirm
   depth, curved pages, solid boards, stand/feet and cast shadows. These are
   physical sculptures rather than flat logo boxes.

Remaining weaknesses: Figma's simple colored forms still feel cleaner and newer
than the antique book/base. Fine parchment wear and bronze ornament disappear
at the room's wide entry distance. The crystal is a stylized cloudy globe, with
no true refraction, volumetric occlusion, caustics or bloom. The preview's warm
point-light shadows are harder than an area-lit product render. These are
documented limits after three visual passes, not claims of photorealism.

## Final evidence

Every path below is relative to this worktree and local/gitignored:

- `verification/tools/final/all-idle.png`, `all-hover.png`
- `verification/tools/final/figma-idle.png`, `figma-hover.png`, `figma-side.png`
- `verification/tools/final/grimoire-idle.png`, `grimoire-hover.png`, `grimoire-side.png`
- `verification/tools/final/crystal-idle.png`, `crystal-hover.png`, `crystal-side.png`
- `verification/tools/final/reduced-motion.png`
- `verification/tools/final/report.json` — raw final measurements and assertions.

`node --check tools-shelf.js` and `node --check tests/shelf-tools-check.mjs` pass.
Chrome/CDP checks compile the preview module and shader, capture the images,
test real mouse raycasts for all three objects, check shelf bounds, verify
unchanging geometry/phase under the OS reduced-motion setting, verify hidden
reduced-motion glyphs, and verify each owned GPU resource is disposed exactly
once. All pass; the final browser reports zero errors and warnings.

The preview uses ACES filmic mapping, exposure 1.05, the room's .5 cool hemisphere
and .06 warm ambient fill, warm key light and a cool rear fill. The platform is
the actual shelf size: **2.08 × .26 × .035 m**, surface Y=0 in the preview.
The source shelf surface is **Y=1.4375 m**; placement is in `TOOLS_INTEGRATION.md`.

Performance is measured at **1440 × 1000, DPR 1**, headless Chrome on **Intel Iris
Xe / ANGLE D3D11**, with all three objects hovering and shadows enabled. The raw
JSON records five one-second FPS samples, draw calls, triangles and memory.
This is a local preview measurement, not a whole-room or mobile benchmark.
