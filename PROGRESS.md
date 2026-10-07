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

## Stage 1: Distant entry camera

**Changed:** `scene-camera.js`, `room-scene.js`, `script.js`, `portal.css`,
`room.css`, `index.html`, and the tests (see below).

### Camera points

- Every camera point is now an eye `position` plus a `lookAt`. The heading (yaw)
  and the tilt both come from those two points.
- `approach` (0 to 1) still blends from the entry to the seat. The path is a
  straight line for now; a curved path through extra points can be added later
  without changing the data.
- One projection serves both renderers. Three.js uses `position` plus yaw and
  pitch (Euler order `YXZ`). The CSS portal adds `--table-view-x` and turns by
  `rotateZ(--view-yaw)`. Away from the seat, CSS and WebGL now agree to within
  0.25 px. That was measured at the table's centre and corners, at the entry, mid-walk
  and seated, in three viewport sizes.
- `sceneCamera.project()` gives the same projection without three.js; the chair's
  hit area uses it.

### Entry point

| Format | Position | lookAt | Distance to the table |
| --- | --- | --- | --- |
| Landscape | (0.5, 1.6, 3.4) | (−1, 0, −2) | About 3.4 m, twice the seat's 1.665 m |
| Portrait | (0.6, 1.6, 4.2) | (−1.44, 0, −1.41) | About 4.2 m |

- **Landscape:** turned 15.5° to the left and looking 15.9° down. The room reads
  as a space: the beams, the warm study nook clearly legible left of centre
  (about 145 × 225 px at 1440×900, up from about 110 px in the old start view),
  the gothic window in the middle and the green stair tower on the right. The
  chair and table anchor the middle and right without being centred on the portal.
- **Portrait:** it stands further back and turns 20° so that the nook stays in
  frame. In the old start view the nook was off screen.
- **How it was chosen:** I compared 23 landscape and 6 portrait candidate points on contact sheets. Those
  turned more than about 25° made the dark side walls dominate.

### Behaviour

- **The entry waits.** `#deviceTilt` goes `entry` → `walking` → `ready`.
- **Idle life:** a slow sway (about 2 cm and 0.3°) and a lean toward the pointer
  (5 cm and 0.4°). The sway redraws at about 15 fps, which moves the view less
  than 0.15 px per step; it redraws at 30 fps only while the lean is still
  catching up with the pointer. There is no idle motion on touch, under reduced
  motion, or in a hidden tab, and it fades out over the first part of the walk.
- **Going to the chair:** an invisible button (`#goChair`, labelled "Gå til stolen
  og sett deg ved bordet") lies over the chair and table. It shows the pointer
  cursor and a focus ring for keyboard users. Choosing it starts the walk:
  5.4 s, smoothstep, a straight path, as before. Under reduced motion the
  visitor is seated at once.
- **The cloth** takes no input until seated.
- **Dev navigation:** ◀ returns to the entry. ▶ sits down and reveals from any state.
- **No WebGL** (the room's fallback picture): the visitor is seated immediately.
- **One driver loop** in `scene-camera.js` runs the walk, the sway and the lean,
  and only while something moves. The old rAF loop for the walk in `script.js`
  is gone.

### Rendering

`room-scene.js` now redraws the shadow maps only when something in the room
changed, not on frames where only the camera moved. The shadows do not depend
on the camera, so the picture is the same and each such frame costs less.

### Verification

Screenshots are in `verification/stage1/`, all inspected.

- **Entry views:** `entry-1440x900`, `-1920x1080`, `-390x844`, `-844x390` and
  `-1366x768`.
- **Seated views:** `seated-covered-*` and `seated-open-*`.
- **Seated compared with the baseline by image difference:**
  - With the cloth on, it is pixel-identical apart from a 67×33 px patch of sky in
    the window: 0.007 % of pixels at 1440×900, 0.006 % at 1920×1080, 0.025 % at
    390×844.
  - With the portal open, only animated content differs: the orb's inside, the
    water, the sparks and the clouds. Their phase depends on when the reveal ran.
    Every edge and silhouette is identical; I checked the heat map.
- **Frame rate** (1440×900, Iris Xe):

  | State | Result |
  | --- | --- |
  | Entry idle, sway | 60.2 fps, 0 frames over 20 ms |
  | Entry with pointer parallax | 60.2 fps, 0 frames over 20 ms |
  | Walk to the chair | 56.4 fps, 18 frames over 20 ms (baseline walk: 49.2 fps, 55 frames over 20 ms) |
  | Seated | 60.2 fps |
  | Reduced motion at the entry | 0 room renders in 2 s |

  Measurements on this laptop vary from run to run, by about 3–5 fps in the walk.
- **Keyboard and pointer:**
  - `#goChair` is the first Tab stop at the entry, and its focus ring frames the
    chair and the table (`entry-keyboard-focus.png`).
  - Enter starts the walk, and once seated the focus moves on to the cloth. A
    mouse click leaves the focus alone.
  - Over the target the cursor is a pointer.
  - At the entry the cloth cannot be reached (tabindex −1, `aria-disabled`, no
    pointer events).
  - ◀ returns to the entry, and ▶ from the entry seats and reveals.
- **Test run:** all 14 suites passed on the final stage 1 code.
  - An earlier run had one flaky `tools-check` failure ("Multiple formation
    frames are sampled", the known first-opening hitch of the Verktøy page). It
    passed 5/5 twice when run alone, and again in the full rerun.
  - `depth-check` passed 3/3 both times.
- **Tests:** every wait for `data-approach="ready"` now chooses the chair first
  (the shared `SEATED` expression in each test file). `portal-check` now checks
  the entry contract: without a choice the view stays at the entry; the walk
  still renders intermediate states, moves closer, keeps the FOV and disables
  the cloth; the tilt changes steadily and ends at exactly 75°. The
  reduced-motion check asserts the new behaviour: the visitor starts at the
  entry and choosing the chair seats them at once.

### Still weak

- The near half of the room is very dark at the entry, so the room reads partly
  as a dark corridor. The smoke on the floor (stages 2–3) is meant to carry the
  eye there; the lighting is unchanged.
- From the entry the chair stands only about 1.9 m ahead, so little floor is
  visible between the visitor and the chair. The chair branch of the smoke will
  have to come in from the side.
- In portrait the chair hides part of the table.
- The chair's hit area is invisible; until the smoke exists only the cursor
  shows that the chair can be chosen.
- The portal's own effects (water, depth, orb dive) still assume the eye is on
  the table's axis: `localEyeX` is published but not used. This only shows when
  the portal is open and the camera is away from the seat, which is not
  reachable yet.

## Stage 2: Basic smoke trail

**Changed:** a new `room-smoke.js`, and `room-scene.js`, which mounts the smoke
and advances it.

### What it is

- **One trail** of low mist on the floor. It starts out of frame at the
  visitor's feet and curves across the floor into the room, ending at the foot of
  the study nook, about 6.3 m. I chose this route for the single trail because
  it is the longest run of floor visible from the entry: from there the chair
  stands only about 1.9 m ahead. The trail becomes the trunk and the shelf branch
  in stages 3 and 5; the chair branch splits off in stage 3.
- **Four strands** on one centripetal Catmull-Rom curve, each a low arch with its
  own width, height, phase, speed and density: a flat veil on the boards, two low
  drifts (6 and 10 cm high) and one wisp that rises to about 15 cm.
- **How it is shaded:**
  - **Arches:** thickest where the eye looks through their middle, like the
    room's light shafts.
  - **The veil:** thicker seen at a glance.
  - **Wisps:** a 256² tiling noise texture of its own, built at load from its
    own seeded generator, so the room's shared random sequence (planks, sky,
    cloth) is untouched. It is sampled three times (a curl field, broad wisps,
    fine wisps), flows slowly along the trail at each strand's own speed, and
    breaks up the edges.
  - **Density:** thicker and thinner stretches drift along the trail; the trail
    gathers out of nothing over its first 1.6 m and thins away over its last
    0.9 m.
  - **Soft saturation** (`1 − e^(−gain·density)`): faint mist still reads, and
    thick mist never turns solid.
  - **Colour:** dim teal-grey with a touch of lavender, premultiplied, so it is
    mostly light with a slight veil over what lies behind.
- **Motion:** the strands wander up to about 7 cm sideways and swell up and down
  slowly, each with its own phase, so no two move alike.
- **Growing in:** each time the visitor arrives at the entry, the trail grows in
  from their feet at about 1.6 m/s, starting 0.6 s after the room's first frame.
- **When seated** it is gone: it thins away between `approach` 0.1 and 0.6.
- **Live tuning:** `studyRoom.smoke.tuning` (gain, far, thin, veil, brightness).

### Rendering

- It is drawn on the foreground canvas (layer 1) with the chair and the cloth,
  and animated in the existing cloth pulse, which now also runs while the smoke
  is visible. There is no new loop and no full redraw of the room. The room
  renderer's budget is untouched, because the smoke's 6,528 triangles are drawn
  by the foreground renderer.
- Under reduced motion it is a single still frame, fully grown in. Over 2 s at
  the entry, neither canvas renders once.

### Verification

Screenshots are in `verification/stage2/`, all inspected.

- **Entry:** `entry-try5`, `entry-smoke-1920x1080` and `entry-smoke-390x844`.
- **Growing in:** `grow-1/2/3-*`.
- **Motion:** `entry-later-*`. With the camera held still (idle off), about a
  third of the trail's pixels change within 3 s and its shape is clearly new
  after 9 s (scratch close-ups).
- **Walking:** `walk-mid-*` and `walk-late-*`, where the smoke is gone.
- **Reduced motion:** `entry-reduced-reduced-1440x900`.
- **Seated, compared with the baseline:** unchanged, with the same differences as
  stage 1. With the cloth on, a 67×33 px patch of sky; with the portal open, only
  the animated orb, water and clouds. The smoke never shows there.
- **Iterations on the look.** The third attempt was the last, per the
  three-attempt rule:
  1. Far too bright and purple, and too tall, so it read as a standing column.
  2. Dim, low and grounded, but it faded out before the nook.
  3. Legible all the way, but a solid, milky river.
  4. Broken up again, but too faint: the second swing on the same balance.
  5. Six tuning variants on one contact sheet, after adding soft saturation and
     live tuning. The default (gain 2.2) reads as soft, broken, low smoke all
     the way to the nook without becoming a tube.
- **Frame rate (machine state changed).** After a Windows update and restart
  between the stages (build 26200 → 26300, same Iris Xe and D3D11 path), this
  laptop is about twice as slow in GPU-heavy frames.
  - The unchanged baseline code now walks at 28–29 fps; it measured 49 fps in
    Phase 0. Stage 1 code walks at 24–28.5 fps and stage 2 at 24.5–29 fps,
    three runs each in one session.
  - With and without the smoke (A/B in the same run):

    | State | With smoke | Without smoke |
    | --- | --- | --- |
    | Entry idle | 59.8 fps | 59.0 fps |
    | Entry, camera still | 60.5 fps | 59.3 fps |
    | Walk | 23 fps | 21 fps |

    The smoke adds no measurable cost. Rendered alone in a synchronised timing
    test, a foreground frame takes about 5 ms more with the smoke than without
    (13.6 ms against 8.5 ms).
  - Seated: 60.2 fps.
  - Absolute numbers from different sessions cannot be compared.

- **Tests:** all 14 suites passed (the test files are unchanged in this stage).

### Still weak

- The trail ends at the foot of the nook's jamb rather than gathering at the
  worktop; that is stage 5.
- Close to the camera the trail is a broad, soft patch at the bottom of the
  frame. It reads as mist at your feet, but it is the widest part of the trail.
- The smoke is drawn only on the foreground canvas. The chair hides it, but the
  table and walls cannot. This route never passes behind either from the entry,
  but the split in stage 3 will need a check.
- How dense and bright it should be is a matter of taste. It is tunable live and
  should be judged by eye in the glue pass, together with the other trail.

## Stage 3: The split

**Changed:** `room-scene.js` (the routes and their strands) and `room-smoke.js`.
The smoke module gains two options: a strand's sideways offset can now change
along its length (`offsetEnd`), and each trail can set its own fade lengths
(`fadeIn`, `fadeOut`).

### How it divides

- **Two trails share a trunk.** Both pass through the same first two points
  (`trunk`): from the visitor's feet to about 0.75 m short of the chair's back
  right. There they part gradually, because each curve has its own tangent.
  - **To the study nook:** the stage 2 route and its four strands, sweeping left
    across the floor.
  - **Into the chair:** three thinner strands round the chair's right side,
    curling in under the seat.
- **Why the chair's share goes round the right.** Stood at the entry, the floor
  straight between the visitor and the chair is almost all below the frame, and
  the rest is hidden by the chair. A branch straight into the chair (attempt 1)
  could not be seen at all. One round its left side (attempts 2–3) ran in the
  same direction on screen as the nook's trail and merged with it. Round its
  right side, the two branches leave the trunk in opposite directions on screen,
  so the division reads at once.
- **Not a Y.**
  - The strands of each bundle start on the other's side and cross as they
    separate (`offset` → `offsetEnd` over the first half).
  - Both bundles wander, so strands overlap now and then.
  - The trunk is simply where both bundles lie together, so its density hands
    over smoothly to each branch.
- **The chair's share is short.** It gathers over 1.1 m and thins away over its
  last 0.45 m under the seat; with the stage 2 lengths (1.6 m and 0.9 m) it never
  reached full density. Its strands are thinner (0.36, 0.72 and 0.5), so this
  branch, close to the visitor, does not outweigh the long one.
- The chair is on the same layer and hides the smoke under its seat correctly.
  The branch ends at z ≈ 1.4, well before the table at z ≈ 0.6.

### Verification

Screenshots are in `verification/stage3/`, inspected without labels.

- **Entry:** `entry-1440x900`, `-1920x1080` and `-390x844`.
- **Growing in:** `grow-1/2/3-*`. Both branches grow out of the trunk together.
- **Later moment:** `entry-later-*`.
- **Walking:** `walk-mid/late-*`, where the smoke is gone.
- **Attempts:** `s3debug` in the scratchpad.

The questions from the brief:

| Question | Answer |
| --- | --- |
| Can you tell the trail divides? | Yes. In landscape one part sweeps up and left to the nook while the other curls up and right round the chair's legs. In portrait the chair's part reads as a hook round the right leg. |
| Does the eye travel to both destinations? | Yes. The left branch carries the eye across the floor to the lit nook, and the right branch ends at the chair, which is itself the strongest shape in the lower half. |
| Does one branch overpower the other? | The nook's branch is the more visible because it is long. The chair's is deliberately lighter: the chair needs no help to be seen, the nook does. Close enough to balanced. |
| Does it feel grown rather than constructed? | Mostly. The forms are soft, uneven and moving. The division happens low in the frame, close to the visitor's feet, so the trunk itself is short on screen. |

- **Seated, compared with the baseline:** unchanged with the cloth on (the same
  67×33 px of sky). With the portal open, only the animated orb, water and
  clouds differ.
- **Frame rate:** entry idle 59.5 fps with the smoke against 60.3 fps without, in
  the same run; no measurable cost from the extra branch.
- **Tests:** all 14 suites passed.

## Stage 4: Chair route

**Changed:** `room-smoke.js` and `room-scene.js`. Each trail now has its own
material; they share every uniform except their presence, and the same shader
program. This adds `smoke.setPresence(name, value)` and `smoke.presenceOf(name)`.

### Behaviour

- **The chair's branch is the guide on the way in.** Once the visitor chooses
  the chair, the trail to the nook thins away over the first part of the walk
  (`approach` 0.05–0.4). The chair's branch stays until they reach the chair and
  thins away as they sit (0.45–0.85). Seated, both are gone.
- **Furniture:** the branch goes round the chair's right side, curls round its
  right back leg and in under the seat, where the chair's legs and seat hide it
  correctly. It ends at z ≈ 1.4, under the seat, and never runs on toward the
  table or the portal (the table's near edge is at z ≈ 0.6).
- **Narrow screens:** the armchair fades out on the way in, because the seated
  eye sits behind it. The chair's branch fades over the same stretch of the
  walk, so the smoke is never left without the chair it leads to.
- **The camera's path is still the straight placeholder.** The smoke reaches the
  chair from its right side and the eye arrives from behind and above the
  backrest, which reads as walking up to the chair and sitting down. A curved
  walk that follows the smoke is for later (see the stage 6 structure).

### Verification

Screenshots are in `verification/stage4/`, all inspected.

- **Along the walk:** `route-0…8-try1` at 1440×900 and `route-0…8-portrait`, at
  `approach` 0, 0.07, 0.23, 0.42, 0.58, 0.74, 0.87, 0.98 and seated.
  - From the entry, the chair's branch curls round the chair's leg and under it
    (close-up `chair-zoom`, scratch).
  - The trail to the nook has gone by 0.42.
  - The chair's branch shows at the chair's foot until about 0.42; after that it
    is below the frame, and it has gone before the eye drops into the seat.
- **Seated, compared with the baseline:**
  - With the cloth on, it is the same as stage 1 (the 67×33 px patch of sky)
    at both 1440×900 and 390×844.
  - With the portal open, only animated content differs. The heat map shows the
    orb's inside and rim (its float phase), the water, sparks and clouds; the
    table, room and cards are unchanged. That is 0.07 % of pixels at 1440×900
    and 3.4 % at 390×844, varying with when the reveal ran.
- **Tests:** all 14 suites passed.

## Stage 5: Shelf route and shelf view

**Changed:**
- `scene-camera.js`: the shelf point, legs, a control point for curved legs, a
  lens shift per point, and hiding the portal behind the eye.
- `portal.css`: the hiding rule.
- `room-scene.js`: the trail's end, the gathering at the nook, and each trail's
  presence on the shelf leg.

### Camera

- **Legs.** The camera is now always on a leg `{from, to, progress}` between two
  named points: entry, seated or shelf. `approach` is derived from it: its
  progress on the way to the seat, 1 when seated. `setApproach()` still works,
  and `setLeg(from, to, progress)` and `moveTo()` cover any leg.
- **The shelf point.**
  - Landscape: (−1.3, 1.61, −0.15) looking at (−2.45, 0.85, −1.75). That is
    standing just left of the table and turned 36° toward the nook: a
    three-quarter view, about 21° downward.
  - Portrait: (−1.35, 1.62, 0.7) looking at (−2.7, 0.85, −1.45).
  - I chose them from 10 landscape and 4 portrait candidates on contact sheets.
    The first try stood almost inside the table's footprint (its left tip is at
    x ≈ −0.92), and its eye was at shelf height, so the shelf was seen edge-on.
- **Curved legs.** A leg may pass a control point
  (`via: {'entry>shelf': [−0.95, 1.6, 2.2]}`). The eye then follows a quadratic
  curve while its heading blends between the ends. The straight path from the
  entry to the shelf went over the chair; this one passes about 0.4 m left of
  the chair and about 0.65 m left of the table's edge. This is the structure
  for curved walks; the walk animations themselves are still to come.
- **Lens shift per point.** The entry and the seat keep the table centre at one
  screen height, exactly as before, also along the walk between them. The shelf,
  where the table is out of view, takes no shift, and legs to or from the shelf
  blend the two. Without this, the shift chased a table at the edge of the view
  and swung.
- **The CSS portal is hidden while the table is behind the eye**
  (`#screen.is-behind`, with `!important` because the aura sets its own
  visibility inline). CSS cannot project it there, and it is out of view anyway.

### Smoke

- The trail to the nook now ends running along the front of the worktop.
- **"Gathering at the nook"**: three short strands along the worktop's front
  (a flat veil and wisps up to 0.22 m and 0.36 m), well below its top (0.74 m).
  From the entry the trail visibly arrives and gathers at the foot of the nook;
  at the shelf the mist pools under the worktop.
- **On the shelf leg:** the chair's trail thins away early (progress 0.05–0.4).
  The nook's stays, only 15 % quieter once the visitor stands there.

### Verification

Screenshots are in `verification/stage5/`, all inspected.

- **The way there:** `shelf-entry/20/40/60/80/100-try2`. The camera turns
  steadily left and passes left of the chair (which drops out of frame at the
  bottom) and of the table (the cloth at the bottom right). The trail on the
  floor leads ahead the whole way. From 100 the table is behind the eye and the
  portal is hidden.
- **The shelf view:** `shelf-100-try3` (1440×900), `shelf-100-1920x1080` and
  `shelf-100-390x844`.
  - **Usable surface (1440×900):** the worktop spans about 594 × 315 px (14 % of
    the screen) and is seen from above. The shelf is about 645 × 75 px with its
    top visible. Five to eight objects could stand on the worktop and a few more
    on the shelf.
  - **Context:** in landscape the alcove window with the night sky and
    moonbeams fills the right third. In portrait the window is out of view, but
    the beams, the curved wall and the floor still place it in the room.
  - **Geometry:** no clipping or awkward geometry. The nearest jamb takes the
    left fifth of the frame.
- **Seated, compared with the baseline:** unchanged with the cloth on (the same
  sky patch at 1440×900 and 390×844). With the portal open, only animated
  content differs.
- **Captures:** two runs timed out on this machine and passed when retried. The
  machine has intermittent stalls since the Windows update; the timeout in my
  capture script was raised.
- **Tests:** 13 of 14 suites passed in the full run. `orb-check` failed once on a timing check ("It opens after pinch-off": the orb was still `idle` at the 1,447 ms sample), in code this stage did not touch. Run alone it passed 5/5 twice: a frame-timing flake on the slower machine.

## Stage 6: Navigation states

**Changed:**
- `scene-camera.js`: the states, `go()` and the `room-navigation` event.
- `script.js`: the page now follows the state. It adds the nook's target and
  Escape.
- `index.html`: `#goShelf`.
- `room-scene.js`: when the smoke grows in.
- `tests/portal-check.mjs`: a navigation check.

### Structure

- **Five named states over the existing points and legs.** They live in
  `scene-camera.js` beside the legs they name. There is no new module and no
  second loop.

  | State | Where the camera is |
  | --- | --- |
  | `ENTRY` | At the entry point (progress 0 on any leg) |
  | `CHAIR_APPROACH` | Moving on the entry–seat leg, in either direction |
  | `SEATED` | At the seat |
  | `SHELF_APPROACH` | Moving on the entry–shelf leg, in either direction |
  | `SHELF_INSPECTION` | At the shelf |

- **`sceneCamera.go(place)`** takes `'entry'`, `'chair'` or `'shelf'`.
  - It plans the way as leg steps: back to the entry first if the camera is on
    another leg, then out along the place's own leg. Passing through the entry
    is not arriving there, so `ENTRY` is not announced on the way.
  - It walks the steps with the existing driver (`moveTo`, smoothstep). A whole
    leg takes 5.4 s to the seat (as before) and 4.6 s to the shelf; part of a
    leg takes proportionally less.
  - It resolves `true` on arrival, or `false` if another `go()` has taken over.
  - Under reduced motion, or with `{instant: true}`, it jumps there at once, and
    the new state already holds when `go()` returns. The page relies on that,
    for example when ▶ sits down and reveals in one click.
- **`sceneCamera.navigation`** is the current state. Each change dispatches a
  `room-navigation` event with `{state, previous}`. The value starts as
  `SEATED`, because that is where the leg starts, so the first event on load is
  `SEATED → ENTRY`.
- **The idle life follows the state.** The sway and the lean run where the
  visitor stands (the entry and the shelf), and stop while walking and while
  seated.
- **Reset:** `go('entry')` works from anywhere. The dev ◀ uses it, instantly.
- **The data is unchanged:** points (position plus `lookAt`), legs, and `via`
  control points. The states are only names over them, so real walk animations
  can later replace a leg's path without changing the page.

### The page side

- **`script.js` no longer moves the camera itself.** One listener maps each
  state onto the page:
  - `data-approach` becomes `entry`, `walking`, `ready` (seated) or `shelf`.
  - The entry targets show only at `ENTRY`.
  - The cloth takes input only when `SEATED`.

  The chair, ◀/▶ and the room's fallback all go through `go()`.
- **`#goShelf`** is an invisible button over the nook, like `#goChair`. It
  covers the nook's opening and the floor in front where the smoke gathers, and
  is labelled "Gå bort til hylla i nisjen". The plan had the shelf reachable
  only from the console, but the shelf view needed a way in to be tried as a
  visitor would.
- **Escape walks back from the shelf.** When the keyboard is used, the focus
  returns to `#goShelf`.
- **The smoke grows in from the visitor's feet whenever it appears after being
  gone:** on arrival, and back at the entry after sitting down. It is no longer
  keyed to `data-approach`, which now has a fourth value. Back from the shelf it
  was never gone, so it does not grow in again. Its presence along each leg is
  unchanged from stages 4 and 5.
- **Fixed on the way:** while the first `go()` was async, an instant move could
  finish after a newer one had started and announce a stale state. `go()` is now
  synchronous whenever nothing has to move, and every step checks that its
  journey is still the current one.

### Verification

Screenshots are in `verification/stage6/`, all inspected.

- **The flow at 1440×900**, with real pointer clicks and keys sent over CDP.
  The state log reads:

  ```
  SEATED>ENTRY (load) | ENTRY>SHELF_APPROACH | SHELF_APPROACH>SHELF_INSPECTION |
  SHELF_INSPECTION>SHELF_APPROACH (Escape) | SHELF_APPROACH>ENTRY |
  ENTRY>CHAIR_APPROACH | CHAIR_APPROACH>SEATED | SEATED>ENTRY (◀) |
  ENTRY>SHELF_APPROACH | SHELF_APPROACH>SHELF_INSPECTION |
  SHELF_INSPECTION>SHELF_APPROACH | SHELF_APPROACH>CHAIR_APPROACH | CHAIR_APPROACH>SEATED
  ```

  The last line is `go('shelf')` followed by `go('chair')`, which passes
  through the entry.
  - **Entry:** both targets are placed. The nook's is 202 × 322 px, and the point
    clicked on the nook hits `#goShelf`.
  - **At the shelf (`nav-shelf`):** `data-approach` is `shelf`, the targets are
    hidden, the portal is hidden behind the eye, and the cloth is disabled
    (tabindex −1).
  - **Back at the entry (`nav-back-at-entry`):** the targets are back, the
    focus ring sits on the nook, and the smoke stayed put.
  - **Seated (`nav-seated`):** `ready`, the cloth enabled with tabindex 0,
    pitch 75 and no smoke.
  - **Interrupted:** `go('shelf')`, then `go('entry')` 1.2 s later. The first
    resolves `false` and the second `true`, back at the start of the leg.
- **No extra loops.** rAF requests per file over 2 s, stage 5 commit against
  stage 6 in the same session:

  | View | Stage 5 | Stage 6 |
  | --- | --- | --- |
  | Entry | camera 110, room 248, effects 110, script 110 | 111, 251, 111, 111 |
  | Seated, covered | room 226, effects 113, script 113 | 228, 114, 114 |
  | Seated, portal open | room 240; effects, surface, depth and aura 114 each | 239; 113 each |

  The same loops run in both, at the same rates.
- **Reduced motion.**
  - Every move is instant, and the log has no approach states:
    `SEATED>ENTRY | ENTRY>SHELF_INSPECTION | SHELF_INSPECTION>ENTRY | ENTRY>SEATED`.
  - Switching it on mid-walk (25 % of the way to the shelf) arrives at once.
  - The camera driver requests no frames at the entry or the shelf. The smoke
    is a still frame (`reduced-entry`, `reduced-shelf`, `reduced-seated`).
- **Compared with stage 5 by image difference.**
  - The entry and the seated view with the cloth on are pixel-identical at
    1440×900 and at 390×844 (DPR 2).
  - With the portal open, only the animated orb, water and clouds differ.
  - Against the baseline, the seated view with the cloth on still differs only
    in the 67×33 px patch of sky.
  - CSS and WebGL stay registered to within 0.16 px.
- **Tests.** In the full run, 12 of 14 suites passed.
  - `portal` and `portal --foundation-only` hit CDP timeouts while my capture
    scripts were running at the same time. Run alone, they passed 7/7 and 6/6.
  - New in `portal-check`: a walk from the entry to the shelf and back. It
    checks the states, `data-approach`, the hidden targets, the disabled cloth,
    the hidden portal and FOV 72 at the shelf, and Escape back to the entry.
    The reduced-motion block now also checks that the shelf round trip is
    instant.

### Still weak

- **Pointer users have no way back from the shelf.** Only Escape or ◀ returns.
  A minimal way back is for the glue pass; the final navigation UI is still to
  be designed.
- **The hit areas are rectangles.** At the entry, the nook's area overlaps the
  top left of the chair's, a strip of floor beside the chair's left post. Inside
  the overlap the nook wins.

## Stage 7: Glue pass

**Changed:** `index.html`, `room.css`, `script.js`, `scene-camera.js`,
`dev/arrange.js` and `tests/portal-check.mjs`. Small integration changes only.

- **A way back from the shelf with the pointer.**
  - At `SHELF_INSPECTION` an invisible button covers the view: `#leaveShelf`,
    labelled "Gå tilbake til inngangen", with a `zoom-out` cursor. A click
    anywhere walks back to the entry.
  - With the keyboard, arriving at the shelf moves the focus to it, and its
    focus ring frames the whole view. Enter walks back and the focus returns
    to the nook's target. Escape still works.
  - The dev ◀ ▶ stay above it. Objects placed on the shelf later will go above
    it too.
- **Overlapping targets.** At the entry the chair's and the nook's rectangles
  overlap over the cloth's far left corner, the chair's left post and a strip
  of floor. The chair now takes the click there, because it stands in front.
- **Instant moves leave the sway behind.**
  - Before, ▶ from the entry, or any `{instant: true}` jump, carried the
    entry's sway into the seat. There it faded out over about 3.7 s: up to
    0.3° and 2 cm, about 3 px. This had been so since stage 1.
  - A jump now clears the sway, so the seat is exact at once. At the entry or
    the shelf the sway fades in again.
- **`sceneCamera.setIdle()` is gone,** because the navigation state now owns the
  idle life.
- **The header comment in `scene-camera.js`** now describes legs and control
  points as they are.
- **`?arrange`** (the dev layout editor) sits down at once again; since stage 1
  it had stayed at the entry. Its camera panel predates the room camera, so its
  reset still uses pitch 46 and the camera overrides its sliders. I left it as it
  was.
- **`portal-check`** now leaves the shelf with a click. Escape is still checked
  in the reduced-motion block.

### Verification

Screenshots are in `verification/stage7/`, all inspected.

- **Hit tests at the entry (1440×900):** the centre of the overlap hits
  `#goChair`, the nook's centre hits `#goShelf`, and the chair hits `#goChair`.
- **Keyboard:** Enter on the nook's target walks to the shelf. On arrival the
  focus is on `#leaveShelf` and matches `:focus-visible`
  (`shelf-keyboard-focus`): a faint rounded frame inset 12 px from the edges.
  Enter walks back, and the focus returns to `#goShelf`.
- **Pointer:** at the shelf the cursor is `zoom-out`, the dev ◀ is still on
  top, and a click walks back to the entry (`shelf-mouse`).
- **Instant moves:** ▶ from a swaying, leaning entry seats the camera at once,
  with yaw exactly 0 and pitch 75, still 0 half a second later. An instant jump
  to the shelf lands exactly on its point (yaw 35.71°), and its sway is back
  1.5 s later.
- **`?arrange`:** seated, pitch 75, yaw 0 (`arrange`).
- **Tests:** all 14 suites passed in one full run.

## Final verification (`937b658`)

- **Tests:** all 14 suites passed in one full run on the final code. Every
  changed script and test passes `node --check`.
- **Console:** I ran three complete visits with real clicks, at 1440×900,
  1920×1080 and 390×844 (DPR 2): entry → nook → shelf → click back → chair →
  seated → ▶ reveal. There were no browser errors or warnings, and the state
  sequence was the same at every size.
- **Screenshots** are in `verification/final/`, all inspected:
  - The visit: `tour-entry-*`, `tour-shelf-*`, `tour-seated-covered-*` and
    `tour-seated-open-*`.
  - Deterministic: `entry-*`, `seated-covered-*` and `seated-open-*`.
  - Reduced motion: `final-reduced-*`.
- **The seated POV against the baseline,** by image difference of
  deterministic captures:

  | Size | Cloth on | Portal open |
  | --- | --- | --- |
  | 1440×900 | 0.007 % of pixels, the sky patch only | 0.06 %, animated content only |
  | 1920×1080 | 0.006 %, the sky patch only | 1.9 %, animated content only |
  | 390×844 | 0.025 %, the sky patch only | 3.4 %, animated content only |

  - The heat map at 1920×1080 puts every change in the orb, the portal's water
    and the window's sky. Table, room and cards are identical.
  - CSS and WebGL stay registered to within 0.22 px at the entry, mid-walk and
    seated.
  - The entry is pixel-identical to stage 5 at 1440×900 and 390×844.
- **Reduced motion:**
  - Every move is instant, including the click back from the shelf.
  - The camera requests no frames at the entry or the shelf.
  - Switching reduced motion on mid-walk arrives at once.
- **Frame rate:** 1440×900, A/B against the baseline `b65761a`, interleaved
  over five rounds in one session (fps):

  | Round | Scripted walk, baseline | Scripted walk, final | Real walk to the chair | Real walk to the shelf |
  | --- | --- | --- | --- | --- |
  | 1 | 59.6 | 60.2 | 56.8 | 60.0 |
  | 2 | 59.4 | 46.2 | 42.0 | 46.9 |
  | 3 | 45.4 | 45.6 | 46.4 | 44.0 |
  | 4 | 48.2 | 45.4 | 45.2 | 46.4 |
  | 5 | 41.6 | 41.0 | 40.2 | 39.8 |

  - The scripted walk is the same workload in both: setting `approach` every
    frame, so the whole room redraws each frame.
  - The machine slowed down during the session, between the two runs of
    round 2. Run in the same state, the baseline and the final walk at the same
    rate, and the real walks match the scripted one.
  - Idle at the entry, seated (cloth on, and portal open) and at the shelf:
    60.2–60.4 fps in every round. The one exception is a single baseline run
    with the portal open, at 58.
  - The room's budget is unchanged: 26 draw calls and 9,947 triangles at the
    entry and seated (the same as the baseline), and 20 calls and 6,951
    triangles at the shelf.
- **`git diff b65761a..HEAD`** touches only this task's files:
  - The scripts: `scene-camera.js`, `room-scene.js`, the new `room-smoke.js`,
    `script.js` and `dev/arrange.js`.
  - The page: `index.html`, `portal.css` and `room.css`.
  - The tests, `.gitignore` and `PROGRESS.md`.

  No unrelated edits.

### Open points

- **Merging `feature/loading-veil`.** It is uncommitted, in its own worktree.
  It defines its own `enterRoom()` in `script.js` and starts the old
  `runApproach()`, which no longer exists here. Whichever branch merges second
  must reconcile the two: keep the veil lifting at the room's first frame, drop
  the automatic walk, and rename one of the two `enterRoom()` functions.
- **Walk animations.** Legs are straight, or curved through one control point
  (entry to shelf). Points, legs and control points are data, so new paths
  need no change to the page.
- **The navigation UI.** The targets are invisible, and only the cursor, the
  focus ring and the smoke show where one can go.
- **Objects on the shelf.** The shelf view and the way back are ready for
  them; they must sit above `#leaveShelf`.
- **The portal's own effects** still assume the eye is on the table's axis
  (`localEyeX` is unused). The flow never opens the portal away from the seat.
- **The near half of the room is dark at the entry.**
- **The `?arrange` camera panel** predates the room camera.

# Refinements, second round

## Setup

- **Starting point:** `C:\Users\ander\OneDrive\Skrivebord\Portifolio`, on branch
  `feature/entry-navigation` at `73e14f9`. The working tree was clean.
- **Baseline captures** are in `verification/refine-baseline/`, taken on a
  deterministic virtual clock at 1440×900, 1920×1080 and 390×844 (DPR 2):
  - the entry, with the smoke grown in;
  - three frames along the walk to the shelf, and the shelf view;
  - the seated view, with the cloth on and with the portal open.
- **Baseline frame rate** (1440×900, two runs, fps):

  | View | Run 1 | Run 2 |
  | --- | --- | --- |
  | Entry, idle | 59.6 | 60.2 |
  | Seated, idle | 60.4 | 60.2 |
  | Portal open | 60.4 | 60.4 |
  | Shelf, idle | 60.2 | 60.4 |
  | Real walk to the chair | 38.6 | 42.4 |
  | Real walk to the shelf | 42.9 | 40.7 |
  | Scripted walk | 43.6 | 41.8 |

  The room's budget is 26 draw calls and 9,947 triangles at the entry and
  seated, and 20 calls and 6,951 triangles at the shelf.
- **Later the site was also open in a browser on this machine** (the local
  preview), and every measurement ran slower for both builds. Speed is
  therefore compared A/B within the same round.

## Refine 1: Narrower smoke

**Changed:** `room-scene.js` (the strands) and `room-smoke.js` (the scale of
the wisps and the wander).

- **Narrower strands.** Every strand's width, sideways offset and height are
  scaled down; the gathering at the nook is narrowed by about 0.7×.
  - Width about 0.55×, sideways offset about 0.6×, height about 0.85×.
  - Density is up 10 % so the narrower mist still reads.
  - A little more width variation and wander along the way break up the
    edges.
- **Wisps rescaled.** Across a strand the wisps were measured from edge to edge,
  but along it in metres. Narrowing the strands therefore stretched them into
  streaks along the trail, and attempt 1 read as a smooth ribbon.
  - Along the trail they are now as long as the strands are wide: the noise
    scale went from `.42` to `.7` per metre.
  - The flow keeps its speed in metres per second.
- **Attempts:** 1 looked like a ribbon; 2 was accepted.

### Verification

Screenshots are in `verification/refine-stage1/`:
- `entry-try1` and `entry-try2`, with their close-ups;
- the entry, the walk and the shelf at 1920×1080 and 390×844.

- **Both branches read and balance.** Near the visitor the trail to the nook is
  about half as wide: about 120–150 px at 1440×900, against about 250–300 px
  before.
- **It still reads as smoke:** soft, broken edges and puffs of varying
  density.
- **The split** is a soft divergence. It is visible in portrait; at 1440×900 it
  lies just below the frame, as before.
- **Seated:** identical to the refine baseline with the cloth on. With the
  portal open, only the orb's animation differs.
- **Frame rate:** an A/B against `73e14f9` in the same rounds shows no
  difference (fps):

  | View | `73e14f9`, round 1 | Narrower, round 1 | `73e14f9`, round 2 | Narrower, round 2 |
  | --- | --- | --- | --- | --- |
  | Entry, idle | 44.8 | 43.2 | 40.8 | 40.6 |
  | Real walk to the chair | 22.2 | 21.0 | 22.8 | 23.0 |

  The machine was under load from the open preview.
- **Tests:** all 14 suites passed.

## Refine 2: The entry camera further back

**Changed:** `scene-camera.js` (the entry point) and `room-scene.js` (the start of
the smoke's trunk).

- **The new entry points:**

  | Format | Before | Now | Further back |
  | --- | --- | --- | --- |
  | Landscape | (0.5, 1.6, 3.4) | (0.75, 1.7, 4.3), looking at (−0.95, 0, −1.8) | 0.9 m |
  | Portrait | (0.6, 1.6, 4.2) | (0.7, 1.75, 5.0), looking at (−1.3, 0, −1.2) | 0.8 m |

  - **Chosen from contact sheets** with the smoke grown in: K1 and P1 among 9
    landscape and 5 portrait candidates (scratch `cands2`).
  - **More of the room reads as a space:** the walls, beams and the long floor
    recede.
  - **Sizes:** at 1440×900 the nook keeps about 111×184 px (77 % of before).
    The chair and table stay readable.
  - **Further back made the room too small:** from about 4.6 m (K2, K3, K5, K6
    and K8) the table and the nook shrank and the dark near half took over.
- **Tilt:** both points look down a hair over the seat's 15° (pitch about
  74.97). The walk in then only ever tilts toward the seated view, as
  `portal-check` requires. The heading is unchanged at about 15.6° in landscape
  and 17.9° in portrait.
- **The smoke's trunk now starts at (1, 5.4),** behind both new points, so the
  trail still gathers at the visitor's feet. It now reaches the nook about a
  second later. A side effect: the split, which used to lie just below the
  frame, is now in view as two branches that part and twist past each other.
- **FOV unchanged.** The table keeps its anchor on screen, so the seat is
  untouched.

### Verification

Screenshots are in `verification/refine-stage2/`: the entry, the walk to the
shelf and the shelf at three sizes, and the seated views at 1440×900 and
390×844.

- **Entry:** the chair, table, nook (worktop and shelf), window and stair tower
  are all readable. The smoke reads from the visitor's feet to both
  destinations.
- **Seated:** identical to the refine baseline with the cloth on at 1440×900
  and 390×844. With the portal open, only animated content differs.
- **Registration:** CSS and WebGL agree to within 0.12 px at the new entry and
  mid-walk.
- **Frame rate:** this round was not usable for absolute numbers.
  - The laptop was running on battery at 8 % (Balanced power scheme, not
    charging). In the first round both builds were capped at exactly 30.2 fps,
    in the second at about 22.
  - Within each round the two builds matched in every view, so there is no
    sign of a regression.
- **Tests:** syntax checks passed, and `portal-check` passed 7/7: the walk in,
  its tilt, the shelf round trip and reduced motion.
  - The full suite was **not** run for this stage before committing, because
    the battery was nearly empty. It runs later, on the following stage's code
    (logged there).

## Refine 3: A frontal shelf view

**Changed:** `scene-camera.js`: the shelf points, and a control point for each
format.

- **The shelf point now stands square in front of the study nook.** It is
  centred on the nook and looks straight at its back wall (heading 90°), from
  a standing eye of 1.8 m, about 17° down.

  | Format | Position | Looks at | From the nook's opening |
  | --- | --- | --- | --- |
  | Landscape | (−0.55, 1.8, −1.55) | (−2.85, 1.1, −1.55) | 1.85 m |
  | Portrait | (1.0, 1.8, −1.55) | (−2.85, 1.15, −1.55) | 3.4 m |

  - **Landscape** (1440×900): the opening spans about 780 px of 1440. The
    worktop spans about 650 px and is seen from above. Around the arch you see
    the walls, the beams and the curve of the corner. The mist lies at the
    nook's foot, with the trail coming in from the lower left.
  - **Portrait:** the camera stands far enough back to show the nook's whole
    width.
  - **Symmetry:** the nook's centre lands at x = 720 of 1440, and the
    worktop's front edge is level (y 599 against 601).
  - **How it was chosen:** I compared 6 landscape and 3 portrait candidates
    (scratch `cands3`).
    - Closer than about 1.55 m, the floor where the trail gathers drops below
      the frame.
    - A higher eye (1.8 m rather than 1.7 m) shows more of the worktop.
- **Limit:** the upper shelf is at 1.42 m, so from any natural standing eye
  only its front edge shows. Things placed on it will still stand in view.
- **The walk there goes round the table's right,** past the window and the
  stair, and ends walking straight up to the nook.
  - **Why not the left:** I compared it frame by frame with a path round the
    left (scratch `paths3`). That one follows the trail but overshoots, then
    backs out to the frontal point, so the nook shrinks at the end.
  - **Clearances (landscape):** about 0.33 m from the table's outline, 0.72 m
    from the right wall and 1.08 m from the stair tower.
  - **Portrait** goes round the right as well, 0.39 m clear of the table, and
    ends with a short sidestep while turning to the nook.
- **`via` is now per format,** like the points.

### Verification

Screenshots are in `verification/refine-stage3/`: the entry, three frames of
the walk and the shelf at three sizes, and the sheets `sheet-walk-1440` and
`sheet-walk-390`.

- **The view:** frontal and symmetric, with usable space on the worktop, no
  clipping, and walls, beams and floor around the arch.
- **The walk:** reads naturally. The cloth's inscription sweeps past the lower
  left at mid-walk, and the nook grows steadily to the frontal view.
- **Seated:** identical to the refine baseline with the cloth on. With the
  portal open, only animated content differs.
- **Tests:** syntax checks passed, and the full suite ran on this stage's code.
  This run also counts for refine 2, whose full run was pending.
  - Architecture, table, cloth, `portal` (7/7), and the environment,
    foundation, cloth and retrieval checks passed.
  - During the run I started the next stage's edits in the same file, so I
    reran the six later suites on the clean stage 3 file. Depth, impact, aura,
    orb and tools passed.
  - `portal --depth-only` failed once on its lit-mist threshold, the known
    intermittent failure from Phase 0; this stage does not touch the portal's
    depth. Run alone it then passed 3/3.

## Refine 4: Looking round at the shelf, and back to the chair

**Changed:**
- `scene-camera.js`: the look, a direct leg from the shelf to the seat, and the
  way planner.
- `script.js`: the chair's target at the shelf.
- `room-scene.js`: a front wall with a doorway.
- `index.html`: a comment.
- `tests/portal-check.mjs`.

### The look

At `SHELF_INSPECTION` the view follows the pointer. It uses the existing
pointer listener and the one driver loop; there is no new listener and no new
loop.

- **Near the middle** the look is slight: about 1°, plus the existing lean's
  parallax.
- **Toward either edge** it turns progressively, along a smoothstep from 30 %
  to 95 % of the way to the edge, up to 75° at the very edge. It also tilts
  ±3° up or down with the pointer's height.
- **Movement:** it follows like a critically damped spring, capped at 55°/s.
  It eases back to the nook when the pointer returns to the middle or leaves
  the window.
- **Redraws:** every frame only while it turns, otherwise at the idle's pace.
- **None under reduced motion or on touch,** as for the rest of the standing
  life. Switching reduced motion on lets go of the look at once.

### Reaching the chair

- **The chair is reachable.** From the frontal shelf point it stands about 100°
  round to the left in landscape (72° in portrait). The 75° maximum brings it
  about 25° inside the frame, together with the table, with no change to the
  camera point.
- **The open front.** Turning that far looked straight into the room's open
  front end: a flat grey void behind the chair (`look-left-try1`). The opening
  lies directly behind the chair, so no smaller turn avoids it. I asked, and
  the decision was a front wall with a doorway.
- **The front wall** closes the room's open end (z = +5.9).
  - **The doorway** is where the visitor came in: x 0.25 to 1.35 and 2.1 m
    high, behind the entry point. The smoke's trunk starts just inside it, and
    a dark passage of 1 m lies beyond.
  - **Built from single-sided flat faces** merged into the existing stone and
    plinth meshes. There is no new draw call, and the room renders 9,971
    triangles instead of 9,947, still under 10,000. Faces seen only from
    inside cast no shadow into the room.
  - **It is never visible from the entry or the seat;** both are pixel-identical
    to before.

### The chair at the shelf

- The chair's invisible target (with the table, as at the entry) appears at
  the shelf once the chair is in view: all its corners in front of the eye,
  and at least 48 px of it on screen.
- A click walks to the seat (`CHAIR_APPROACH` → `SEATED`), at once under
  reduced motion.
- Clicking anywhere else still walks back to the entry.

### The leg from the shelf to the seat

- **A direct leg** (`shelf>seated`, 5.2 s) goes round the table: its left in
  landscape, 0.30 m clear of the table's outline, and its right in portrait,
  where the seat is behind the chair.
- **The look is carried along** from where the walk set off, and let go as the
  heading turns.
- **The heading** follows progress^1.8. It keeps facing the chair while
  walking round the table, then turns into the seat's view as the visitor sits
  down, at no more than about 59°/s.
- **Turn direction:** in landscape it turns the long way, to the left across
  the chair. The short way stared into the left wall at mid-walk. In portrait
  it turns the short way.
- **Exactly 0 at the seat:** headings are now reported in (−180°, 180°], so the
  seat's heading is exactly 0 however it was reached. The orb's shader uses it
  linearly.
- **The way planner** now walks direct legs between any two places, each leg
  either way. The walking states are named for where the walk leads; walking
  back to the entry, for where it comes from. `durations` is keyed by leg.

### Verification

Screenshots are in `verification/refine-stage4/`:
- `sheet-look-try3`: shelf, slight, left, centre, right, left again, and the
  walk to the chair with the earlier turn;
- `look-left-try1` (the open end, before the wall) and `look-left-try3` (with
  the wall);
- `sheet-chair-try4`: the walk with the left turn;
- `sheet-portrait` and `sheet-portrait2`: portrait;
- `reduced-shelf-pointer-left`: reduced motion.

- **The look,** at 1440×900 on the virtual clock:

  | Pointer | Yaw |
  | --- | --- |
  | Slight | 90.9° |
  | Left edge | 165.6° |
  | Back to the middle | 90.2° |
  | Right edge | 14.4° |

  The largest step per frame while turning is 0.93°, which is the speed cap;
  there is no snapping.
- **The chair target** appears when turned left and covers the chair and the
  table.
- **A click on the chair** runs `ENTRY > SHELF_APPROACH > SHELF_INSPECTION >
  CHAIR_APPROACH > SEATED`. The visitor is seated at x 0, z 1.665, eye 1.18,
  yaw 0, pitch 75 (z 2.53 in portrait). The walk faces the chair until it is
  close.
- **Seated,** reached through the entry on the deterministic capture: identical
  to the refine baseline with the cloth on, with registration within 0.1 px.
- **The entry and the shelf view** are pixel-identical to stage 3, because the
  wall is not in view.
- **The frames of the walk to the shelf differ slightly.** The walk now carries
  the entry's sway and lean and lets them go along the leg, instead of within
  about a second.
- **Reduced motion:** with the pointer at the shelf's left edge, the view stays
  at 90° and the chair target stays hidden. A click goes to the entry, and the
  chair from there seats the visitor at once.
- **Frame rate** (1440×900, laptop charging again):

  | View | fps |
  | --- | --- |
  | Entry, idle | 60.3 |
  | Shelf, idle | 60.3 |
  | Looking round at the shelf (left, right, centre over 6 s) | 58.3, with 11 frames over 20 ms |
  | Scripted walk, for reference | 51.2 |

- **Tests:** all 14 suites passed. `portal-check` now also checks that no
  target shows while looking at the nook, that the view turns at the left
  edge, and that the chair then seats the visitor at yaw 0 and pitch 75.

### Still weak

- **The front of the room is dark.** Turning to the chair shows a dark wall and
  a barely visible doorway. The chair reads against it, but with little
  contrast.
- **The look is pointer-only.** Keyboard and touch users reach the chair from
  the shelf by way of the entry: Escape or a click, then the chair.
- **The walk round the table** passes 0.30 m from the table's outline.

## Refine 5: Holistic pass

I walked the whole visit as a visitor would, on the virtual clock at
1440×900 (`verification/refine-final/sheet-visit-final`):
- the entry, with the narrower smoke growing in and parting;
- choosing the shelf, and the frontal shelf view;
- looking round with the pointer and turning to the chair;
- clicking the chair, and sitting down.

**Changed:** `scene-camera.js`, two values.

- **The walk to the shelf was three times faster than the others.** After
  refine 2 and 3 its path is 7.2 m long (it was 4.1 m), still walked in 4.6 s:
  1.57 m/s on average, 2.35 m/s at its fastest. The shelf to the seat runs at
  0.81 m/s and the walk in at 0.52 m/s. It now takes 6.6 s, about 1.1 m/s, so
  the room's walks share one pace. The walk in keeps its original, deliberate
  pace.
- **The turn into the seat from the shelf starts a little earlier in
  landscape** (progress^1.5 instead of ^1.8). The dark front half of the room
  fills the view for a shorter stretch before the lit window and stair come
  round. The peak turn drops to about 55°/s, the same as the look's cap.
  Portrait keeps 1.8; with 1.5 the chair slips out of its narrow view at
  mid-walk.

### Checked and left as they are

- **Camera distances** across the states read as one room. The entry stands
  far back, the shelf at a reading distance, and the seat as before.
- **The smoke's width** suits the room from the entry, from the shelf and when
  turning round.
- **Mouse-look against the entry's idle:** at the entry the pointer only leans
  the view a little; at the shelf it turns it. That is deliberate, since the
  shelf is the place to look round, and both use the same spring-like easing
  and the same pointer.
- **Lighting:**
  - The window's moonbeam and the green stair light carry the walks to the
    shelf and into the seat.
  - The portal's aura sleeps under the cloth throughout.
  - The front half of the room stays dark. That shows most on the walk from the
    shelf to the chair, and it needs light, not glue.
- **Tests:** all 14 suites passed on this code.

## Final verification of the refinements (`acecad4`)

- **Tests:** all 14 suites passed on the final code. Every changed script and
  test passes `node --check`.
- **Console:** I ran three complete visits with real clicks at 1440×900,
  1920×1080 and 390×844 (DPR 2): entry → nook → shelf → click back → chair →
  seated → reveal. A second run at each size went entry → shelf → look left,
  right and left again → click the chair → seated. Neither showed a browser
  error or warning.
- **The seated POV** on the deterministic capture:
  - With the cloth on, it is identical to the refine baseline at all three
    sizes. Against the original Phase 0 baseline only the known patch of sky
    differs (0.007 %, 0.006 % and 0.025 % of pixels).
  - With the portal open, only animated content differs.
  - CSS and WebGL stay registered to within 0.22 px.
  - Reached from the shelf, the seat lands at exactly yaw 0 and pitch 75, at
    the same position.
- **Portal, cards, cloth and orb:** covered by the suites. The portal (cards,
  projection, retrieval, reset, keyboard), the cloth, the orb, aura, impact,
  depth and the Verktøy page all pass, and every full visit ends with the
  reveal.
- **Reduced motion:** every move is instant. At the shelf the pointer leaves
  the view at 90° and the chair target hidden. A click goes to the entry, and
  the chair from there seats the visitor at once.
- **Frame rate:** an A/B against `73e14f9`, interleaved over two rounds with
  the laptop charging (fps; walks are bound by the room's full redraw):

  | View | `73e14f9`, round 1 | Final, round 1 | `73e14f9`, round 2 | Final, round 2 |
  | --- | --- | --- | --- | --- |
  | Entry, idle | 60.4 | 60.4 | 59.4 | 60.0 |
  | Seated | 60.2 | 60.2 | 60.2 | 60.0 |
  | Portal open | 59.4 | 60.2 | 60.2 | 60.2 |
  | Shelf, idle | 59.8 | 60.2 | 60.4 | 60.2 |
  | Real walk to the chair | 35.2 | 32.4 | 34.8 | 35.2 |
  | Scripted walk | 39 | 36 | 33 | 36.2 |
  | Real walk to the shelf | 32.2 | 33.3 | 38.7 | 38.0 |

  Looking round at the shelf runs at 58.3 fps.

  **Room budget:**

  | View | `73e14f9` | Final |
  | --- | --- | --- |
  | Entry and seated | 26 calls, 9,947 triangles | 26 calls, 9,971 triangles (the front wall) |
  | Shelf | 20 calls, 6,951 triangles | 14 calls, 6,843 triangles (the frontal view sees less) |
- **`git diff 73e14f9..HEAD`** touches only this task's files: `index.html`
  (a comment), `room-scene.js`, `room-smoke.js`, `scene-camera.js`,
  `script.js`, `tests/portal-check.mjs` and `PROGRESS.md`. No unrelated edits.
- **Screenshots** are in `verification/refine-final/`:
  - the visit: `sheet-visit-final`;
  - each size: `entry-*`, `walk-*`, `shelf-*`;
  - looking round: `look-left/right/centre/slight-look-*`;
  - the walk to the chair: `chair-walk-*-look-*`;
  - seated: `seated-from-shelf-look-*`, `seated-covered/open-*`;
  - full visits: `tour-*`;
  - reduced motion: `final-reduced-shelf-pointer-left`;
  - 1920×1080: `sheet-1920`.

## Paths: the camera walks the smoke

**The request** (from the shelf-tools report's questions):
- The smoke should follow where the camera goes; before, it did not. On
  the left the camera follows the smoke path.
- One continuous path from the door (seen only when turning round) to the
  shelf, with a branch toward the right.
- The chair stands to the right, pushed back as if someone had sat in it,
  risen with the whole chair and walked off. Sitting down is that sequence
  in reverse: straightening the chair to sit centred at the table, as the
  portal view is framed.
- The places one clicks to move to should show where one stands.

**Baseline** (`verification/nav-baseline/`):
- The walk to the shelf went round the table's right, out past the window
  and the stair (x up to 1.4); the smoke ran left.
- The walk to the chair was a straight dolly.
- Plan: `verification/nav-design/map-v1.png`.

### The ways (`scene-camera.js`, `paths`)

One definition that both the smoke (`room-scene.js`) and the camera use.
Table-centred [x, z]:
- **`trunk`:** from inside the doorway (z 6.9), under the entry's feet,
  down the table's left side (0.5 m clear of it), round to where the visitor
  stands at the shelf, and curling on into the nook.
- **`fork`:** the trunk point (0.55, 3.45) where the branch leaves.
- **`branch`:** right, to where the visitor stands beside the chair
  (1.15, 2.55).
- **`chair`:** its pose, (0.62, 2.12), turned 34° to the right: pushed back
  and turned as someone left it.
- **`sit`:** the eye's way over the chair into the seat.

### The camera

A leg's way is a centripetal Catmull-Rom curve:
- through the start point's eye;
- the trunk's points between the two places (a small planner projects
  each place onto the trunk);
- to the seat, the fork, the branch and `sit`;
- then the end point's eye.

**Pace.** Arc length is tabulated, and walking time is integrated along it:
1.1 m/s walking, easing into 0.6 m/s for the settle. A leg's progress is its
share of that time. The walk sets off and comes to rest over about 0.8 s,
at an even pace between (it used smoothstep over the whole leg).

**Heading.** The eye looks 1.1 m ahead along the way:
- over its last metres it is drawn toward where it is going: the nook's back
  wall, or the chair (from the shelf, sooner);
- it turns from the view it set off with over 1.2 m, and into the one it
  arrives at over 2.2 m.

**The chair.**
- **Looking down:** coming up to the chair, the eye looks 24° further down
  at it, stays on it while drawing it in, and lifts as the visitor sits.
- **Height:** the eye stays at standing height until the settle, then sinks
  into the seat.
- **The pull:** `chairPose` draws the chair in square to the table during
  the settle. It is the same sequence in reverse if the walk goes back.

The seat is reached at exactly yaw 0 and pitch 75. Durations come from the
ways: entry → shelf 6.3 s, entry → seat 4.4 s, shelf → seat 9.2 s (back
along the trunk and out along the branch).

### The smoke

The trails are drawn from `paths`:
- `to the study nook` is the trunk;
- `into the chair` shares the trunk to the fork, then takes the branch and
  curls in under the pushed-back chair.

Their presence now follows the leg, so the trails a walk follows stay to
lead it:
- **To the shelf,** the chair's thins and the nook's stays.
- **To the chair,** the nook's thins and the chair's stays until the visitor
  sits.
- **From the shelf,** the chair's gathers again as they set off and the
  nook's thins once they have left it.

Before, the way back from the shelf showed no smoke at all.

### Tests

`portal-check.mjs` asserted that the walk in "tilts steadily, never back and
forth". The new sequence looks down at the chair once and then up into the
seat. The assertion now requires a single dip, then a steady rise, with no
visible back and forth (0.01°).

**Verified (stages 1–3):**
- Frames in `verification/nav-1` to `nav-6-from-shelf`: the entry, the
  walks to the shelf and to the chair, the settle every 0.45 s, and the walk
  from the shelf.
- All nine suites pass: portal (with the changed tilt rule), aura, depth,
  impact, orb, architecture, cloth, table and tools.

**Still weak:**
- The pushed-back chair stands in the room's dark front right. It is hard to
  read at the entry.
- The walk back from the shelf crosses that darkness for about a second.
- Lighting is for the later lighting pass the user has asked for.

### Stage 4: where the visitor can stand

Each place to stand has a mark on the floor: a slow ring of the same mist
as the trails (`room-smoke.js`, `marks`, `setMark`). It sits at three
places:
- the entry's eye;
- the shelf's eye;
- beside the chair, at the branch's end.

**Look.** The mist lies on the floor and is turned slowly about the mark's
centre, in two layers at different speeds, so it swirls without a seam. A
veil lies inside the ring. It shares the trails' clock, noise and colours,
and is one disc of 48 triangles per mark.
- The first version drew its wisps by angle: spokes in the ring and a
  pinwheel at its centre.

**When it shows.**
- It is hidden underfoot (within 0.5 to 1.4 m of the eye) and as the
  visitor sits down.
- It is clear where they can go:
  - at the entry, the chair's and the shelf's; the shelf's lies behind the
    table from there, and the cloth hides it as it should;
  - at the shelf, turned round, the chair's and the entry's.
- Pointing at or focusing a place's target lights its mark (brighter,
  drawn in a little, turning faster) over about 0.25 s, at once under
  reduced motion. A new navigation state clears it.

**Click.** Each target now also takes the click on its mark's ring.

**Verified:**
- `verification/nav-7-marks` to `nav-9-marks`:
  - the entry, with the chair's and the nook's targets pointed at;
  - the shelf turned toward the room;
  - the logged presences and hovers.
- All nine suites pass.
