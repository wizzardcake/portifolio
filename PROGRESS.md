# Entry and navigation layer: progress log

Branch `feature/entry-navigation`, created from `main` at `b65761a` on 2026-10-06.
The task is to add a distant entry view, smoke trails on the floor guiding to the
chair and to the left shelf, and a navigation state structure. The work runs in
separately verified stages; each one gets a section below.

## Phase 0: setup, findings and baseline

### Workspace

- Path `C:\Users\ander\OneDrive\Skrivebord\Portifolio`. The working tree was clean
  on `main` (`b65761a`), and `feature/entry-navigation` did not exist before.
- Other worktrees: `Portifolio-light-integration`, `Portifolio-stair-window-arch-polish`,
  and `Portifolio-loading-veil`. The last one is on `feature/loading-veil` at
  `b65761a` and has **uncommitted** changes from 2026-10-06 02:20 to 02:27 in
  `index.html`, `room-scene.js`, `room.css` and `script.js`. Those changes add a
  night veil until the room's first frame, make `runApproach()` wait for a
  `room-ready` event, and compile shaders up front. That is the same code the
  entry stages change, so the two branches will conflict.

### Visual verification

- **Claude in Chrome:** no tools for it in this session.
- **Playwright:** not installed, and the repo has no `package.json`; the site is
  dependency-free.
- **Used instead:** headless Chrome 154 driven over the DevTools protocol, the
  same method as `tests/*.mjs`, but on the real GPU (ANGLE D3D11, Intel Iris Xe)
  instead of SwiftShader. I look at every screenshot myself.
- **Deterministic captures:** a virtual clock (`performance.now` and the
  `requestAnimationFrame` timestamp overridden) plus CSS animations paused at a
  fixed time. Two independent 1440×900 runs were pixel-identical for the entry
  view and the seated view with the cloth on. With the portal open they differed
  only around the orb (0.03 % of pixels changed by more than 4/255). So "the
  seated view is unchanged" can be checked by image difference.
- **Limits:** the browser is headless, `requestAnimationFrame` is capped by vsync
  at 60 fps, and phones are emulated (390×844 at DPR 2). Nothing has been checked
  on a real phone or in other browsers.

### Architecture map

**Stage layers**, back to front:

1. `#roomShell` / `#roomCanvas`: the WebGL room (`room-scene.js`, three.js layer 0).
2. `#deviceTilt` / `#screen`: the CSS 3D portal. It holds the table aperture, the
   water (`portal-surface`), the depth volume (`portal-depth`), the orb canvas
   (`portal-effects`), the aura, the reader pages and the cloth's hit area.
3. `#roomFront` / `#roomFrontCanvas`: a second WebGL context for three.js layer 1,
   the furniture between viewer and table. Today that is the armchair and the cloth.
4. `.device-topbar` and `#desktop` (the hand of cards), fixed to the viewport and
   hidden while `body.intro-active`.
5. `.dev-nav` ◀ ▶, which jumps back to the start or skips the reveal.

**Camera** (`scene-camera.js`, `window.sceneCamera`):

- One perspective serves both WebGL and CSS: FOV 72° and a fixed 15° downward
  tilt (CSS pitch 75°).
- There is no sideways offset and no yaw. `camera.yaw` exists but nothing sets
  it, and `.screen` ignores `--view-yaw`. `portal-effects.js` does already pass
  the yaw to the orb's shader and counter-rotates the orb by it.
- `approach` (0 to 1) blends two poses:

  | Pose | Eye height | Distance from table centre |
  | --- | --- | --- |
  | `wide` | 1.55 m | Framing fit plus a 1.1 m step back: 4.35 m at 1440×900 |
  | `seated` | 1.18 m | At least 1.6 m, fitted to the table: 1.665 m at 1440×900, 1.6 m at 1920×1080, 2.53 m at 390×844 |

- A vertical lens shift (`setViewOffset` and `--scene-origin-y`) keeps the table
  at a fixed screen anchor.
- In CSS, `.screen` is placed with
  `perspective(focal) translate3d(0, viewY, viewZ) rotateX(75deg)`.

**The walk in** (`script.js`, `runApproach`):

- On load the camera dollies from `approach` 0 to 1 over 5.4 s with smoothstep
  easing. `#deviceTilt` goes from `data-approach="walking"` to `"ready"`.
- The cloth takes no input while walking.
- Under reduced motion the camera starts seated.
- Pulling the cloth runs `runFinishingSequence()`: the orb rises, the text plays,
  the cards fly out, and the body gets `intro-done`.

**Seated view:** `approach = 1`, the camera at `(0, 1.18, seatedDistance)` with an
x rotation of −15°. That is the view the new work must leave unchanged.

**Room** (`room-scene.js`): plan in metres, +Z toward the viewer, the table at the
world origin. The architecture is in the `shell` group, moved back by
`placement.forward = 1.3`. In table coordinates:

- Main room: x from −2.4 to 2.2, back wall at −3.9, height 2.45 m. The front is
  open at +5.9 with no wall; no camera may see past it.
- Back left: a curved corner and a vaulted alcove with the large pointed window,
  which shows the moon.
- Back right: a round stair tower (radius 1.35 m) with a 14-step spiral and green
  light from the upper floor.
- **The left shelf is the study nook.** It is a recess 0.45 m deep in the left
  wall, spanning z −2.6 to −0.5, so it sits beside and behind the table. It has a
  worktop at 0.74 m (about 0.52 m deep and 2.08 m wide), one shelf at 1.42 m
  (0.26 m deep) and a warm lamp at (−2.1, 1.5, −1.4). The worktop is the obvious
  surface for the future tool objects.
- Table: `table-model.js`, a hexagon about 1.83 × 1.25 m with its top at 0.46 m.
- Cloth: `ritual-cloth.js` and `room-scene.js`, on layer 1.
- Armchair: in `room-scene.js`, at z = `seated.distance − 0.06`, on layer 1 only.
  It fades out on narrow screens, where the seated eye sits behind it.

**Lighting:**

- Fill: hemisphere and ambient.
- Warm: the nook lamp and a front fill.
- Moonlight: a spot through the alcove window (casts shadows) and bounce lights
  at the window and the tower.
- Portal: teal and purple point lights.
- Table: a key spot (casts shadows).
- Green from the stair: a spot, the upper glow and a floor bounce.

**Fog and atmosphere:**

- There is no scene fog (no `THREE.Fog`). The room's atmosphere is additive light
  shafts (`lightInAir`: soft cones that fade with the viewing angle), dust points
  and a haze sprite at the window.
- The fog and stars inside the portal belong to `portal-depth`.

**Render loops:**

- The room draws only on request (`invalidate()`).
- `pulse` redraws the foreground canvas at about 30 fps while the cloth lies on
  the table.
- `liveOutside` redraws only the window region at about 24 fps, with the shadow
  maps frozen.
- All of them stop under reduced motion and in a hidden tab.

**Reduced motion:** handled already, in 13 files.

**Limits the tests enforce:**

- Room renderer: fewer than 30 draw calls and fewer than 10,000 triangles (now 26
  and 9,947), at most 2.6 MP.
- A settled room does not render continuously.
- Seated: eye 1.18 m, pitch 75°, FOV 72°, and the CSS and WebGL projections agree
  to within 1 px.
- During the walk: the pitch and FOV stay fixed, the distance shrinks and
  `#screen` grows.
- Every suite waits for `data-approach="ready"` and then clicks ▶.

### Baseline screenshots (`verification/baseline/`)

| File | State |
| --- | --- |
| `entry-current-{1440x900,1920x1080,390x844}.png` | Today's start of the walk (`approach = 0`) |
| `seated-covered-*.png` | Seated view with the cloth on the table |
| `seated-open-*.png` | Seated view with the portal open, the orb floating and the cards in hand |

What they show:

- The current start is symmetric on the table's axis, centred on the table and chair.
- In landscape the nook is visible but small (about 9 % of the frame's width).
- In portrait (390×844) the nook is entirely out of frame: the horizontal field of
  view there is only about 37°.
- The near floor and the ceiling are very dark, so faint smoke on the floor will
  read clearly.

### Baseline performance (1440×900, Iris Xe, headless with GPU)

| Measurement | Result |
| --- | --- |
| Seated, cloth on, idle for 5 s | 60.4 fps, p90 16.8 ms, 0 frames over 20 ms |
| Seated, portal open, orb idle for 5 s | 60.2 fps |
| Walk in (room, foreground and CSS dolly every frame) | **49.2 fps**, p90 33.3 ms, 55 frames over 20 ms |
| Room canvas alone, redrawn every frame | 60.3 fps |
| Room, one full render synchronised to the GPU (`readPixels`) | about 13 ms (10.3 ms with shadow maps frozen) |
| Foreground (armchair and cloth), synchronised | about 3.5 ms |

What this means: any effect that forces a full room redraw every frame will drop
frames on this class of GPU, as the existing walk already does. (A `gl.finish()`
timing gave 0.4 ms, but in Chrome it does not wait for the GPU, so I don't rely on it.)

### Existing tests (baseline, `b65761a`)

On the unchanged code, 13 of 14 suites passed on the first run. `portal-check
--environment-only` prints `Room` lines rather than `PASS` lines; it exited with 0.

| Suite | Result |
| --- | --- |
| `architecture-check` | 1/1 |
| `table-check` | 1/1 |
| `cloth-check` | 1/1 |
| `portal-check` | 6/6 |
| `portal-check --environment-only` | Passed |
| `portal-check --foundation-only` | 6/6 |
| `portal-check --cloth-only` | 2/2 |
| `portal-check --retrieval-only` | 1/1 |
| `portal-check --depth-only` | 1/1 |
| `depth-check` | **Flaky:** failed, failed again, then passed 3/3 |
| `impact-check` | 3/3 |
| `aura-check` | 6/6 |
| `orb-check` | 5/5 |
| `tools-check` | 5/5 |

**The `depth-check` failure was there before any changes.** Both failures were
the same assertion, "Live depth frames make no DOM style writes", with
`{"writes":0,"frames":0}`: the depth loop drew no frames in the 1.2 s window
after the test switches reduced motion off. On a fresh page the module draws
about 30 fps (36 frames in 1.2 s). The same suite passed on this commit on
2026-10-03.

The likely cause is timing in the browser environment, not the code: headless
Chrome is now `HeadlessChrome/154` on the hardware GPU. `portal-check
--depth-only` has also failed intermittently before, on its threshold for lit
mist. Neither will be counted against a stage unless it fails consistently.

## Plan (waiting for approval)

**Stage 1: Distant entry camera.** Files: `scene-camera.js`, the `draw()`
function in `room-scene.js`, the `.screen` transform in `portal.css`, and the
start of `runApproach()` in `script.js`.

- The camera pose grows from (eye, distance) to (x, eye, distance, yaw). Tilt and
  FOV stay fixed, as the tests require.
- `wide` becomes an `entry` pose: further back, moved to the right and turned a
  little left, tuned separately for landscape and portrait (as `wide.frame` is
  today). The chair and table then sit right of centre and the nook reads clearly
  on the left, in portrait too.
- `approach` blends every component, so `approach = 1` is exactly today's seated pose.
- The CSS portal gets the same offset and yaw, so CSS and WebGL stay registered
  in every pose.
- The entry view holds before the existing automatic walk starts (see question 1).

**Stage 2: Basic smoke trail.** A new `room-smoke.js` builds the geometry and
material, like `table-model.js` and `ritual-cloth.js`, with no loop of its own.
`room-scene.js` mounts it on layer 1, the foreground canvas.

- Shape: 3–4 soft, low strands along one floor curve, each a few centimetres to
  about 35 cm high with a width that varies along the path.
- Look: the room's light-shaft technique (a soft core that fades with the viewing
  angle) times a small baked tiling noise texture, sampled at 2–3 scales with
  slow, curling flow, so the edges break up. It is dim teal and lavender, kept
  below the moonlight in brightness. No volumetrics.
- Animation: in the existing ~30 fps `pulse` loop, extended to run while smoke is
  visible. That means no new loop, no full room redraws, and no change to the
  room renderer's call and triangle budget.
- Under reduced motion it is one still frame.

**Stage 3: The split.** In the same module, one trunk whose strands drift apart
gradually into a chair bundle and a shelf bundle. The density moves across
smoothly, and noise-driven wander keeps it from reading as a Y.

**Stage 4: Chair route.**

- The chair branch reaches the chair from the side the walk comes from, then thins
  and sinks around it. It is drawn on the same layer as the chair, so the chair
  hides it correctly, and it fades out before the table, never leading to the portal.
- The walk's path follows the route only if a straight blend looks wrong.
- The seated view is checked against the baseline by image difference.

**Stage 5: Shelf route and shelf view.**

- The left branch reaches the nook and gathers along the worktop's front edge,
  rising a little there.
- A deliberate `SHELF_INSPECTION` pose: about 1.6–2 m from the nook, turned about
  55–70° left, eye about 1.45 m, with the same tilt and FOV. The worktop and shelf
  fill the frame, with the alcove window at the edge for context.
- Checked for clipping, for any view past the open front, and in portrait. No
  objects yet.

**Stage 6: Navigation states.**

- Named poses (`ENTRY`, `SEATED`, `SHELF_INSPECTION`) and moves (`CHAIR_APPROACH`,
  `SHELF_APPROACH`), with `state` and `go(name)`. They live in `scene-camera.js`,
  or in a small `room-navigation.js` beside it.
- One dolly loop drives them: today's `runApproach` generalised, not a second loop.
- The smoke follows `state` for its visibility. Reset is `go('ENTRY')`.
- With no navigation UI yet, the shelf states are reachable only from the
  console. `setApproach()` stays.

**Final:** the glue pass, final verification and the report.

### Risks

1. **The CSS portal must follow a camera that moves sideways and turns.**
   Mitigation: one transform derived from the same camera definition, with
   registration checked at the table's corners in the entry and shelf poses.
   Fallback: hide the CSS portal layers outside `SEATED`. On the first entry they
   are under the cloth anyway.
2. **On the foreground canvas the smoke is hidden only by the chair and cloth,**
   not by room geometry such as the table or the nook's worktop. Mitigation:
   route the smoke so it never passes behind them in the entry or shelf view, or,
   if that's not enough, draw the table's and nook's depth into the foreground pass.
3. **The GPU budget is tight** (the room costs about 13 ms). The smoke stays on
   the foreground at 30 fps, and every stage is measured against this baseline.
4. **Portrait** has only about 37° of horizontal view, so its entry and shelf
   poses need their own tuning and may remain a compromise.
5. **The tests require the walk to finish by itself, with pitch and FOV fixed.**
   They allow yaw during the walk, but the walk then turns slightly instead of
   going straight at the table.
6. **`feature/loading-veil`** (uncommitted, in another worktree) changes the same
   start of the walk. Whichever branch merges second has to reconcile the two.
7. **The room has no front wall**, so no pose may see past z = +5.9. The night sky
   is composed as seen from the chair, so the window needs checking from the new
   poses.
8. **On narrow screens the armchair fades out**, so the route must still read
   without it.

### Decisions (2026-10-06)

1. **The entry waits for the visitor; there is no automatic walk.** The entry view
   gets subtle idle life so it is not dead: a slight camera drift and gentle
   mouse parallax. The real walk animations come after this task. The camera
   points must be defined as a position plus a `lookAt`, so that curved paths
   can be added later. Until then, moving from the entry to the chair reuses
   today's straight dolly as a placeholder. The tests change with this, because
   every suite used to wait for the automatic walk.
2. **`verification/` stays local and is listed in `.gitignore`.** Only
   `PROGRESS.md` is committed; screenshots are referenced by path.
