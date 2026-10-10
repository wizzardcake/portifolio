# Living exterior — implementation handoff

Branch: `feature/exterior-entry-refinement`.
Worktree: `C:\Users\ander\OneDrive\Skrivebord\Portifolio\verification\exterior-entry-refinement`.
Starting commit: `926adf8`. Main and Claude's interior worktree are untouched.
The pre-existing, unused `assets/loading/exterior.webp` stays untracked.

## Scope and current work

The existing worker exterior is being replaced by coordinated, deformed geometry:
solar core, spreading dome, descending two-floor body, growing attached spiral
tower, arch, landing and fitted curtains. Formation lasts 6.6 seconds of visible
worker time. After both formation AND real readiness: approach 2.6 s, landing pause
2 s, curtains 1.4 s, walk 2.6 s. Latest brief supersedes the old press-to-continue
step. There are no fake loading percentages.

The existing background palette, room files and performance improvements remain.
The gate now requires `siteReady` AND a painted `#roomShell.is-ready` or declared
`.room-fallback`. The former slow-load bypass is replaced by retry. Static
`inert` protects the first parsed frame; input stays blocked throughout entry.
The room appears through an even-odd cut aligned to the worker's projected arch.

## Before

`node tests/exterior-entry-check.mjs --out=living-before` passed on 2026-10-10:
headless Chrome, ANGLE D3D11, 1440×900, DPR 1. It deliberately held room-scene.js,
so the readiness time is not an ordinary cold-load measurement.
Ready 20,831 ms; entry 25,416 ms; 41 sampled main-thread entry intervals,
maximum 166.6 ms; no errors or warnings.
Evidence: `verification/exterior-entry/living-before/` (ignored).

Observed causes of roughness: 70% resolution and 15 FPS while loading,
12–16 expensive volume samples, synchronous `gl.finish()` after every frame.
The previous geometry only had static surface deformation.

## Verification in progress

New harness: `node tests/living-exterior-check.mjs --out=NAME`.
Add `--preview-only` for deterministic formation stills and the standalone view.
Evidence lives in `verification/living-exterior/NAME/` (ignored).
Iteration 2 passed full entry, readiness/input guard and worker/observer/listener
cleanup. No console errors or warnings. Worker idle GPU samples were about
2.8 ms at 1440×900; this is a limited local sample, not a device guarantee.
Visual findings (being corrected): rear shell made a second arch; glass needed
more depth; initial flat normals caused blocky highlights.

## Continuation

Inspect actual Git state first. Do not restore old exterior versions or touch the
interior worktree. Finish visual corrections, run lifecycle/fallback/mobile/cold
and warm checks, record honest measurements, make reviewed checkpoints and provide
the local preview URL. No merge, push, deployment or background redesign.

The exact interior entrance alignment remains owned by Claude. This pass preserves
the existing interior start pose; it does not move or redesign the actual room.

## Taken over by Claude (2026-10-10, evening)

Codex is not continuing; the user asked Claude to take over this work. It
now lives on **`feature/full-integration`** (worktree
`verification/full-integration`). That branch is this branch merged into
the reconstructed interior (`feature/interior-reconstruction`), so the
exterior is built against the room it contains. Nothing is merged to
`main`, pushed or deployed.

### Finished

**The building is now at the scale of the room inside it**
(`loading-living-worker.js`: `SCALE`, `TOWER`, `DOOR`, `EYE`, all from
the interior's measurements).

- Across, 0.246 a metre: the chamber's outer wall at 4.35 m is the body's
  widest, 1.07.
- Up, 0.291 a metre from the door's sill.

(Superseded on 2026-10-11 by one scale in every direction, with the room's
door at the end of its passage: see *The way in, one camera* below.)

**The stair tower** is the interior's enlarged drum (`room-tower.js`),
which the old slim spire would have let through:

- 5.69 m out at −30°, 2.05 m round;
- a band where the upper floor is inside, and a cornice;
- a tall, concave spire flaring at its eaves;
- three lancets stepped with the stair.

**The doorway** is the room's own pointed door:

- its jambs are 1.7 half-widths high, under an equilateral arch;
- it sits at the end of a passage as deep as the room's, in dark stone;
- the walk in is at the room's eye height (1.7 m), so it meets the room's
  entry view.

**The double arch is gone.** Once the curtains open, everything seen
through the doorway gives way to the room. The test is now done in screen
space (the ray to the door's plane) rather than in the object's own
coordinates. Past the door, the building is no longer drawn over the room.

**The glass has more depth.** The current layers sit further apart in
depth, the glass gathers light where seen straight on, and it darkens
toward a brighter rim.

**`tests/living-lifecycle-check.mjs`** is finished and committed:

- Two of its waits read globals before they existed. Its `until()` now
  counts an expression that throws while the page is being replaced as
  "not yet".
- From the old `loading-gate-check`, it gained three cases: no WebGL, a
  part that fails to load, and no exterior module.
- `loading-gate-check` and `exterior-entry-check` are retired. They
  waited for the visitor to press, and this way in goes by itself.

**The slow room's message and «Prøv igjen»** are readable over the
building, on small dark panels.

**Hygiene.** Byte order marks have been removed from `index.html`,
`loading-exterior-3d.js` and the lifecycle check.

### Verified (headless, mains power)

- **`living-exterior-check`** passes. A cold load: ready about 6.7–8.7 s,
  formed about 10–12 s, inside about 18.5–21 s.
- **`living-lifecycle-check`** passes in full:
  - cold and warm loads;
  - mobile with reduced motion;
  - fast readiness, which cannot skip the formation;
  - input blocked until entry;
  - a slow room, retry, and a degraded promise without a drawn room;
  - mobile resize and reduced motion;
  - the static fallback without OffscreenCanvas;
  - a missing gate script, which fails closed;
  - no WebGL, a missing part, and no exterior module.
- **The interior's suites** pass on the integration branch: navigation,
  first person, all of `portal-check`, interior, lighting, architecture,
  table, cloth, aura, depth, orb, tools, shelf tools and impact.
  `interior-check` now waits for either gate.
- **The worker's GPU cost** is about 4.8 ms a frame (median; p95 6.9) at
  1440×900, with 80 k triangles and 9 draw calls. Codex measured about
  2.8 ms with the building idle; the tower is larger and the glass has
  more layers.

### Open

- **An occasional gap of about 1 s on the main thread** early in the
  approach: 1039 ms once, and Codex saw 1332 ms. A CPU profile of the same
  window found the main thread idle (2375 of 2500 ms), so it is not
  JavaScript. It is likely GPU or compositor contention in headless
  Chrome. Check it in a real browser. (Since the way in below, runs show no
  long task in the flight at all.)
- **The brief Codex worked from** is not in the repository; the summary
  above is all there is. Visual choices beyond it (the tower's spire, the
  glass) are Claude's, for the user to review.
- **Inside the room**, the passage still ends in a closed oak door
  (`room-chamber.js` `doorLeaf`), while from outside the visitor comes in
  through curtains.

## The way in, one camera (2026-10-11)

The user's report: the outside and the inside did not match in size, the
scene change did not match, and it did not feel like walking into the room.

**Why.**

- Through the doorway the gate showed the room as drawn from its entry: a
  fixed, wide picture (72°) that stayed put while the visitor walked.
- The building had one scale across and another up.
- Its door sat in the body's shell, though the room's passage reaches a
  metre out beyond its wall.
- The flight ended at a narrower field of view, looking level.

**Now it is one camera** (`loading-living-worker.js`, `loading-gate.js`,
`scene-camera.js`).

- **One scale for the whole building.** It is 0.246 to a metre (`S`), with
  the room's floor at y −0.78. The body was drawn 0.291 to a metre upward.
  It is still drawn that way and brought down to the one scale as it is
  placed (`squash`, in the vertex shader), so its formation keeps its
  shape and timing. The tower rounds off below the floor as the body does.
- **The doorway is the room's own.**
  - It is 0.74 m either side of its axis, with jambs to 1.26 m and two
    quadratic curves to 2.54 m, drawn exactly as `room-chamber.js` draws
    it (`arch()`, and `doorway()` in the shader).
  - It stands where the room's passage ends, 5.35 m from the chamber's
    centre, as the face of a porch grown out of the body (`PORCH`).
  - The porch's passage runs back into the body in dark stone.
- **The flight's eye is given in the room's terms** (scene-camera.js
  `wayIn`: x, y, z metres; yaw and tilt in degrees; lens).
  - It uses the room's own field of view (72°, vertical) and the room's
    lens shift.
  - The room's camera follows it, so through the doorway the room is drawn
    from where the visitor really is.
  - It waits on the landing through the approach and follows it from the
    landing on.
- **The walk** goes from the landing, 2.6 m before the door, through the
  doorway and the passage, to the entry.
  - It ends exactly on the entry's own view (`sceneCamera.entryView`, sent
    with `fly()` and again on a resize).
  - It sets off and comes to rest as the room's own walks do: 5 s, about
    1.3 m/s at its pace.
  - The handover (`setWayIn(null)`) changes nothing on screen.
  - The approach (2.6 s), the still arrival (2 s) and the curtains (1.4 s)
    are as before. The whole flight is 11 s, 2.4 s longer, because the walk
    now goes all the way in.
- **Inside the room.** The outer oak door stands open while the visitor
  comes in and is shut behind them (room-scene.js).
- **Past the door's plane** the gate is transparent. The building is not
  drawn, and the worker stops presenting frames.

**Keeping the pace.** The room is now drawn with every step, beside the
worker. Measured on this laptop, on mains power:

- **Within the doorway only.** Through the doorway the room and its
  foreground draw only within the doorway's bounds (`clip`, a scissor).
- **The void is drawn in the worker.**
  - From the flight on, the worker draws the gate's void and stars itself
    (`SKY_FS`: the CSS gradients and star tiles, reproduced), and clears
    the doorway through it (`hole`).
  - The page then needs no `clip-path` cut. That cut repainted three
    full-screen layers on every step.
  - The doorway now lies in the same frame as the building, so the two
    always meet exactly.
- **No layout per pose.** On the way in, `scene-camera.js` `update()` no
  longer reads layout for each pose. It forced a style and layout pass,
  about 5 ms each.
- **Lighter glass.** The glass is drawn at 70 % from the middle of the
  approach, where the eye moves fastest.
- **Every mesh drawn once at load.** With the room's first frame, every
  mesh is drawn once into a single pixel (room-scene.js `prime()`).
  - On Windows (ANGLE/D3D11) a shader is finished only when a new kind of
    mesh is first drawn.
  - The first view from outside cost about 1.1 s at the start of the
    flight, and it stalled the worker too.

**Measured.**

| | Approach | Walk, outside | Walk, inside |
| --- | --- | --- | --- |
| Headless | 60 fps (2.6 s exactly), no long tasks | median 60 fps (p95 50 ms) | median 60 fps (p95 50 ms) |
| A visible window | exterior at 60 fps | the room in the doorway at about 30 fps | about 60 fps |

The worker itself kept 60 fps in both kinds of window. Before the
`clip-path` cut was dropped and the meshes were primed, the walk outside ran
at 20–30 fps, even headless.

**The load.** The priming draw belongs to the room's readiness. In a cold
run the largest task during loading grew from about 3 s to 3.5–4.3 s
(headless). The flight no longer has one.

**Verified** (headless, mains power):

- `living-exterior-check --sequence` (`verification/living-exterior/wayin-final/`).
  The flight, frame by frame, with the room's camera at the same place.
  The handover stands at the entry (`entryView`), with `wayIn` cleared,
  navigation `ENTRY` and the outer door shut.
- `living-lifecycle-check` passes in full, with the still arrival of two
  seconds.
- The other 15 suites pass: `loading-portal-check` and the interior's
  suites.
- Portrait (390×844) was captured: the walk turns the 9° of the portrait
  entry within the passage and hands over to it exactly.

**Open.**

- **The room through the doorway runs at about 30 fps in a visible window
  while the visitor is outside.** The room itself is the cost; inside it
  is 60.
- **The passage is dark.** The door lantern's patterned light falls on its
  walls.
- **Inside, the passage still ends in the oak door** (shut behind the
  visitor), while they came in through curtains.
- **The far view is lower** now that the body is to scale; its framing
  could be tuned.
- **The site's own buttons** (sound, arrows) show through the doorway
  from the passage on.
