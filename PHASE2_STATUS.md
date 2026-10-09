# Phase 2B — readiness and the way in (Claude)

Phase 2A (Codex, `feature/loading-portal-visual`) designs the loading portal
itself; its section of this file lives on that branch and is merged in above
this one at integration. This section covers the loading architecture: what
"ready" means, the gate that holds the portal over the page until then, the
way in through the portal's doorway, and what was done so the room is smooth
from the first moment.

- Worktree: `C:\Users\ander\OneDrive\Skrivebord\Portifolio-orb-loading`
- Branch: `feature/orb-loading`, from `f024dee` (Phase 1 handoff), which is
  preserved. Not merged, pushed or deployed.
- Codex's files (`loading-portal.*`, its preview and check) are untouched
  here. Until Codex hands over, the gate shows a quiet CSS orb in the
  portal's place (see Integration).

## Status

_Filled in below as each part is verified._

## What "ready" means (site-ready.js)

`window.siteReady` resolves, and a `site-ready` event fires, once every
critical part has settled on what actually happened (no timers, no guessed
progress):

| part  | ready when | reported by |
|-------|------------|-------------|
| room  | the room's shaders are compiled (Phase 1 warm-up), its first full frame (room and foreground together) is drawn, and two more frames have passed | `room-scene.js` |
| water, depth, orb | the portal's own WebGL layers have linked their shaders, or fallen back to their CSS stand-ins | `portal-surface.js`, `portal-depth.js`, `portal-effects.js` |
| font  | Cinzel (the cloth's inscription) has loaded or failed; it repaints the cloth when it arrives | `site-ready.js` |

States: `ready`; `fallback` (no WebGL: the room's silhouette); `degraded` (a
part's script failed to load, or an uncaught error came before ready — the
page then shows what it has instead of waiting forever).

Not waited for (noncritical, first used later and already warmed or cheap):
the shelf's objects, sound, the tools page, the aura (CSS until the cloth
comes off).

## The gate (loading-gate.js, loading-gate.css, index.html)

_To be completed with the measurements._

## Measurements

_To be completed._

## Limitations

_To be completed._

## Preview

_To be completed._
