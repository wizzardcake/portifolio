# Hexagonal ritual table

The furniture is now a compact, room-lit artifact: a bevelled dark-walnut hexagon,
an aged bronze collar around a genuinely round opening, six restrained clasp/inlay
motifs, and four carved buttresses with bronze cuffs and stone shoes. The centre
remains open underneath. The table casts its own shadow instead of a rectangular
proxy's shadow.

## Scope and dimensions

- Desktop: approximately 1.83 × 1.25 m, with a 1.02 m circular opening.
- The outer width/depth are about 20%/18% smaller than the old rectangular table;
  the far edge leaves approximately 12 cm more space toward the back wall.
- The top remains at 0.46 m. The original seated camera fit is retained using its
  original framing envelope, rather than dollying closer to the smaller table.
- The original `#screen` coordinate system, orb diameter, card targets, reader,
  staircase, room layout and room-light parameters are unchanged.
- Portrait screens use a squarer hexagon. The supports fit the actual facets;
  their shoulders never float outside the smaller top.

The baseline in this worktree had a rectangular opening. Its table cutout, room
occlusion mask, short lining, water clip and projected abyss boundary now share
the round aperture. The existing water/depth shaders and reaction timelines are
not replaced. Only planar children are clipped; the 3D parent stays unflattened.
The existing aura's rim decoration follows the circular collar.

## Tuning

`portal-table.css`, on `.portal-table`:

| Control | Desktop | Effect |
| --- | ---: | --- |
| `--table-width` | `.89` | Outer width / original screen width |
| `--table-aspect` | `1.47` | Outer width / depth |
| `--table-opening` | `.82` | Opening diameter / shorter table dimension |

Portrait overrides width to `1.06` and aspect to `1.10`. After editing variables
live in DevTools, call `portalTable.measure()`. Keep enough rim for the collar;
the supplied values are checked for circular containment. Materials and the
collar/support profiles live in `table-model.js`. `studyRoom.table.stats` exposes
mesh count, triangle count, rebuild count and world dimensions.

## Rendering and integration

`table-model.js` uses the existing Three renderer, texture, lights and shadow map.
It batches the artifact into four meshes (~2,600 triangles); geometry is rebuilt
only when dimensions change. There is no new context, animation loop or external
asset. The short circular lining uses 48 static CSS faces. CSS furniture remains
available when the room renderer is unavailable or loses its context.

The cloth keeps its existing interaction and flight, and sizes itself to the new
outer bounds. It is still a rectangular cloth over the hexagonal top.

## Checks and preview

```sh
node tests/table-check.mjs
node tests/portal-check.mjs --environment-only
node tests/portal-check.mjs --foundation-only
node tests/portal-check.mjs --depth-only
node tests/depth-check.mjs
node tests/impact-check.mjs
```

For an isolated preview in PowerShell (without stopping another worktree's server):

```powershell
$env:PORTFOLIO_PREVIEW_PORT = '4183'
node tests/orb-check.mjs --serve
```

This serves the current worktree at `http://127.0.0.1:4183`. Remove the cloth
or use the bottom-right forward button. Screenshots from browser checks go to
`.qa/` (ignored by Git). No production debug panel was added.

## Review results

Passed: `table-check`, `portal-check --environment-only`, `portal-check
--foundation-only`, `portal-check --depth-only`, `depth-check`, `impact-check`,
and `orb-check`. The browser checks cover five viewport sizes, pointer/keyboard
card activation and retrieval, water/depth, orb dive and page handoff, reset,
reduced motion, context recovery and CSS fallback. Desktop and portrait captures
were inspected. Syntax checks and `git diff --check` passed.

The table has 2,568 triangles in four meshes. The environment check reported
9,807 total room triangles and 16 room draw calls; no extra renderer/context was
created. These are rendering counts, not a hardware FPS benchmark.

Changed files:

- `portal-table.js`, `portal-table.css`, `table-model.js`: geometry, styling and model.
- `index.html`: load the table helper and stylesheet.
- `room-scene.js`: mount the shared-renderer model and circular occlusion mask.
- `scene-camera.js`: retain the pre-redesign framing envelope.
- `portal-depth.js`, `portal-depth-volume.js`: fit the lining and aperture boundary.
- `tests/table-check.mjs`, `tests/portal-check.mjs`, `tests/depth-check.mjs`: geometry/compatibility checks.
- `tests/orb-check.mjs`: optional isolated preview port only.
- `TABLE-DESIGN.md`: tuning and review notes.

Changes were prepared on `feature/hex-table` and paused for visual approval
before committing or integrating into `main`.
