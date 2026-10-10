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

