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
