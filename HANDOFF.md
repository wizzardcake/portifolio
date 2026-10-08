# Performance phase 1: handoff

## Where

| | |
| --- | --- |
| Worktree | `C:\Users\ander\OneDrive\Skrivebord\Portifolio\verification\performance-phase1` |
| Branch | `feature/performance-phase1` |
| Started from | `9f69b27`, which is `main` and the published site |
| HEAD | the commit adding this file, on top of `bd87d55` (`git log --oneline 9f69b27..HEAD`) |

Not merged into `main`, not pushed, not deployed. It waits for the user's
review.

## Recovered from Codex

Codex (Astra) left its work uncommitted in this worktree when it reached
its usage limit. It was recovered as found, verified, and committed
unchanged as `1111ef5`:

| File | Change |
| --- | --- |
| `room-scene.js` | The portal aura's two dormant point lights are created before the room's first frame (`studyRoom.auraLights`). |
| `portal-aura.js` | Uses those lights instead of adding its own after the first frame; it still owns their position, intensity and animation. It sizes itself from scene-camera's measured width and height instead of reading layout. |
| `portal-effects.js` | Reads the screen size once per frame, before writing styles. |
| `scene-camera.js` | Measures the CSS table once per update (`tableWidthPx`, `tableDepthPx`). |
| `script.js` | Places the entry targets from those measurements; the dial radius follows a `ResizeObserver` instead of a measurement every frame. |
| `tests/performance-check.mjs` | New: Codex's audit. Fresh Chrome profile, ANGLE D3D11, cache off, startup CPU profile, 5 s per view of frame times, renders, layouts and styles, a 30 s memory soak. `PORTFOLIO_TEST_ROOT` serves an untouched snapshot for A/B. |

Codex's own outputs are in `verification/performance/` (ignored by git):
`baseline-1`, `baseline-2`, `initialization-only`, and `baseline-source`
(a copy of `9f69b27`, identical to the commit apart from line endings).

## Commits

| Commit | What | Why |
| --- | --- | --- |
| `1111ef5` | Codex's changes, above | Added after the first frame, the aura's lights changed the light count and recompiled every lit room material. |
| `195bcf7` | The sound toggle moved beside the theme ball | Regression from `9f69b27` (on `main`): the toggle covered the theme ball at every viewport size, so `portal-check --foundation-only` failed. Found while verifying. |
| `122236e` | The aura's lights also light the lamps' glass pass (layer 2) | The glass is redrawn alone as it breathes. Seeing two fewer lights there, it needed a second program, linked just after the room appeared. |
| `b9fc856` | The shelf's motion refreshes the shadow maps only if a shadow camera can see the objects | No shadow camera can (checked in the page), yet every shadow map was redrawn up to 8 times a second while seated or at the shelf. |
| `4fd1e63` | Shader warm-up off the main thread before the first frame | The first frame compiled every shader synchronously: a 9 to 12 s freeze. |
| `bd87d55` | Loading: the room canvas hidden until its first frame; the CSS table kept until the model is drawn | The warm-up let the page paint during compilation, which showed the not-yet-drawn canvas as black, with the CSS table already hidden. |

## How it was measured

- **Machine:** the user's laptop (Intel Iris Xe, 8 threads), on mains
  power. Headless Chrome with ANGLE on D3D11, 1440x900, DPR 1.
- **Startup:** scratch probes. A long-task observer, and a hook on
  `linkProgram` that logs every shader program with its time. No CPU
  profiler, cache warm.
- **Runtime:** `tests/performance-check.mjs`. Its CPU profiler and
  disabled cache make absolute startup times longer than a visitor's.
- **A/B:** every comparison is interleaved in one session. The machine
  slowed over the session (the same build was ready at 13 s early on and
  at 16 to 17 s later), so compare numbers within a table, not across
  tables.

## Results

**Startup.** "Ready" is when the room is first shown (`#roomShell.is-ready`).
"Freeze" is the longest main-thread task. "After ready" is any long task once
the room shows.

| Build | Ready | Freeze | After ready | Programs |
| --- | --- | --- | --- | --- |
| `9f69b27` (baseline) | 12.8-14.5 s | 8.2-10.4 s | a 7.7 s freeze in 2 of 5 loads (the recompile) | 36 |
| `1111ef5` (Codex) | 13.7-14.9 s | 10.6-11.8 s | 0.8-0.9 s, every load (the glass's second program) | 25 |

| Build (interleaved) | Ready | After ready | Programs |
| --- | --- | --- | --- |
| `1111ef5` | 16.4-16.8 s | 0.65-0.73 s | 25 |
| `122236e` | 16.5-17.4 s | none | 24 |

| Build (interleaved) | Ready | Freeze | Programs |
| --- | --- | --- | --- |
| `b9fc856` | 12.5-16.9 s | 8.9-11.6 s | 24 |
| `4fd1e63` (warm-up) | 7.5-8.7 s | 1.6-3.2 s | 27 |

The warm-up compiles three programs the first frame would not have needed,
because `compile` covers objects the first frame culls.

**Runtime** (`performance-check`, per 5 s of viewing):

| | Before | After |
| --- | --- | --- |
| Layouts at the entry | 153-158 (`9f69b27`) | 77-78 (`1111ef5`) |
| Shadow passes, seated and at the shelf | 36-38 (`122236e`) | 0 (`b9fc856`) |
| Frame rate, entry, chair and shelf | about 60 fps (the display's cap), p95 about 17 ms | unchanged |

- A shadowed frame cost about 3.3 ms of CPU; a plain one 2.4-2.7 ms.
- **Memory:** after garbage collection the heap holds at 16.2-16.9 MB
  through the 30 s soak, before and after. GPU resources hold steady:
  room 46 geometries and 26 textures, foreground 17 and 5.
- **Assets:** 42 files, 1.31 MB decoded (`three.module.js` 655 KB). Every
  texture is drawn in code.

## Verification

- **Visual.** Same cameras and states (entry, shelf, seated, the portal
  awake with the aura lit), on a fixed virtual clock.
  - Entry, shelf and seated are pixel-identical after a full redraw, from
    `9f69b27` through `4fd1e63`.
  - The awake portal differs only in the held cards and titles (CSS
    animations on real time). Two runs of the same build differ as much.
  - The aura's lights match `9f69b27` exactly in position and intensity
    with the portal awake. Their layer mask is 1 up to `1111ef5`, and 5
    (layers 0 and 2) from `122236e`.
- **Layout.** Before and after a resize, the dial radius equals
  `min(screen) * 0.4`, and the shared table size equals fresh
  `clientWidth`/`clientHeight` reads.
- **Errors.** No page errors.
- **Suites.**
  - All 16 runs pass on `4fd1e63`: architecture, table, cloth; portal
    (default, environment, foundation, cloth, retrieval, depth); depth,
    impact, aura, orb and tools; shelf-tools; and the lighting relay.
  - `portal-check --foundation-only` fails on `9f69b27` and `1111ef5`
    (the sound toggle) and passes from `195bcf7` on.
  - `impact-check` (a race in the check) and `portal --depth-only` (a
    lit-mist threshold on the edge) are known to fail now and then, on the
    baseline too. Both passed here.

## Scene loading: why only the table and cloth showed

The room canvas is shown when its first frame is drawn. On `9f69b27` that
first frame compiled every shader synchronously:

- **The freeze.** The page froze from about 2.8 s to 11.4 s. The last frame
  painted before the freeze was the dark gradient with the CSS stand-in
  table and the DOM cloth ("ikke dra i teppet"), and it stayed on screen
  throughout. That is the reported "table and tablecloth against a dark
  background".
- **The foreground.** The foreground canvas (WebGL cloth, chair, smoke) was
  drawn by the pulse loop before the room, but inside the same frozen task.
  No frame showed it alone.
- **The table model.** `has-table-model`, which hides the CSS table's top
  and feet, was set at about 3 s, long before the model was drawn.

**With the warm-up** the page keeps painting while it compiles. That exposed
two things, both fixed in the loading commit:

- **The canvas.** Before its first frame the room canvas is an opaque black
  buffer. It is now hidden until `is-ready`.
- **The CSS table.** It was already hidden. `has-table-model` is now set in
  the first drawn frame.

**What the visitor sees now** (1440x900, this laptop):

| Time | On screen |
| --- | --- |
| 0.8 s | The gradient, with the CSS table and cloth |
| 4.5 s | The gradient, with the CSS table frame and feet. The DOM cloth has stepped aside, as before. |
| about 5.6 s | Room, table model, chair, cloth and smoke, together. The smoke grows in. |

**What must be ready before the room is shown**, which the loading screen
must cover:

1. The warm-up promise: every room and foreground program compiled.
2. The first full room frame: textures uploaded, three 1024² shadow maps
   rendered, the depth materials compiled. It is still a 0.6-1.0 s task.
3. The foreground's first frame, which is now in the same frame.
4. `has-table-model`, which is now set in the same frame.

**Notes for the orb transition (not built):**

- **No public ready event yet.** Add one: a `room-ready` event, dispatched
  one frame after the first full draw. The unmerged `feature/loading-veil`
  worktree sketched one, from an old base. Start the zoom after it, and
  after the following 0.6-1.0 s first-frame task.
- **Keep the orb light.** Any WebGL the loading screen adds competes with
  the warm-up. A CSS or 2D-canvas orb costs nothing there.
- **Reduced motion.** The orb must hold still under reduced motion, like
  the room's own systems.

## Remaining bottlenecks

1. **Before the warm-up starts:** 0.5-3 s of long tasks while the scripts
   load. Parsing `three.module.js` and `room-scene.js`, building geometry,
   and drawing canvas textures (night sky, lamp atlas and gobo, wood and
   stone, cloth inscription, shelf objects). Not broken down yet; the
   `startup.cpuprofile` files from `performance-check` hold the detail.
2. **The first frame after the warm-up:** 0.6-1.0 s, for texture uploads,
   shadow maps and depth materials. `renderer.initTexture` during the
   warm-up could move the uploads off the first frame.
3. **Continuous full redraws.**
   - Seated: about 44 full room renders a second, from the shelf objects'
     30 Hz tick (within 4.5 m) and the window sky.
   - Entry: about 30 a second, from the idle sway and the sky.
   - About 2.4-2.7 ms of CPU each. Cheap on this GPU, but the largest
     steady CPU cost.
   - Cutting it means rendering less often or less of the room, a visual
     trade-off for the user to decide.
4. **The lamps' glass edges** differ slightly between a breath redraw and
   a full frame: under 0.2% of pixels, at the droplets' rims. This comes
   from the lighting pass.
5. **three.js r160's `compileAsync`** never resolves without
   `KHR_parallel_shader_compile`. The warm-up checks for the extension and
   gives up after 30 s.

## Next recommended actions

1. **Review this branch:** run it, and compare it with `main` on a phone if
   possible. Then merge it (it contains the theme-ball fix, which `main`
   needs).
2. **Profile item 1** above, and pre-upload textures in the warm-up
   (item 2). Both are measurable and visually lossless.
3. **Loading screen phase:** add the `room-ready` event, and cover the
   page until it fires.
4. **Item 3** only with the user's say on the trade-off.
