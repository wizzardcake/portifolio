# Phase 2A — liquid loading portal

## Worktree and scope

- Worktree: `C:\Users\ander\OneDrive\Skrivebord\Portifolio\verification\loading-portal-visual`
- Branch: `feature/loading-portal-visual`
- Base: `f024deed9e8e756cceecfbb914fad5d76352f899` (Phase 1 handoff read).
- Production and other worktrees were clean at inspection and are untouched.
- No merge, push, deployment, readiness gate, room integration, or automatic reveal.
- This file is updated at each verified design checkpoint. Use this branch's latest HEAD, not an earlier session.

## Checkpoint 1

Independent Canvas 2D prototype with three canvases: atmosphere, doorway depth,
and liquid skin. Procedural texture, no external assets or Three.js. A 13.7 s
square-to-round breath mixes with slower, unrelated flow frequencies. The
clock never loops or resets. OS reduced motion draws a still frame and stops
scheduling animation. Pause, play, external time, layer access, manual approach,
opening bounds and disposal are exposed by `createLoadingPortal()`.

Read `portal-orb-material.js`, `portal-effects.js`, and the orb regression
checks. Inspected the Phase 1 `orb-idle.png` and `orb-neck.png`: dark translucent
body, teal heart, violet/green grazing reflections, sparse curved currents,
restrained warm specular highlights; buoyant motion and viscous neck formation.
The earlier approved square reference is not attached in this context.

### Files

- `loading-portal.js`: reusable procedural component.
- `loading-portal.css`: scoped layer layout and approach transforms.
- `loading-portal-preview.html`: independent review page and manual controls.
- `tests/loading-portal-check.mjs`: local Chrome/CDP visual, motion, layout,
  isolation and lifecycle checks. No package install required.

### Verification and critique

`node --check loading-portal.js`

`node tests/loading-portal-check.mjs --out=design-1`

Passed: no console errors; desktop and 390×844 mobile; reduced motion stops
redraws and approach scaling; no room/Three.js resource; disposal is idempotent.
1440×900, DPR 1, isolated Chrome/ANGLE: 60.09 rAF fps, 16.8 ms p95,
1.25 ms average component draw submission. These are local measurements, not
mobile-device results or evidence during room compilation. One 372 ms startup
long task needs investigation. Screenshots/report are ignored local files under
`verification/loading-portal/design-1/`.

**Not yet ready for review:** the first image reads too much like an engraved
amber plaque. The doorway has a hard frame and the surface needs stronger glass
depth. Next checkpoint softens that lip and revises the reflections.

## Preview / continuation

From this worktree, use any static HTTP server and open
`/loading-portal-preview.html`. No bundler or build step. The automated check
starts and closes its own server and fresh browser profile.

The component is intentionally not imported by `index.html`. Integration,
preloading/readiness, focus/accessible loading announcements, and the final
room reveal belong to Claude after visual approval.
