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
  Chrome. Check it in a real browser.
- **The brief Codex worked from** is not in the repository; the summary
  above is all there is. Visual choices beyond it (the tower's spire, the
  glass) are Claude's, for the user to review.
- **Inside the room**, the passage still ends in a closed oak door
  (`room-chamber.js` `doorLeaf`), while from outside the visitor comes in
  through curtains.
