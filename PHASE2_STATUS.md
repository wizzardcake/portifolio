# Phase 2A — liquid loading portal: ready for visual review

## Start here

- Worktree: `C:\Users\ander\OneDrive\Skrivebord\Portifolio\verification\loading-portal-visual`
- Branch: `feature/loading-portal-visual`
- Base: `f024deed9e8e756cceecfbb914fad5d76352f899`. Its `HANDOFF.md` was read; all Phase 1 improvements are preserved.
- `86f9c5c`: first independent prototype and browser checks.
- `1c58729`: verified glass/doorway refinements, faster texture generation, responsive sizing, motion recording and lifecycle checks.
- Final HEAD is the documentation commit containing this updated file. Resolve with `git rev-parse HEAD`; list checkpoints with `git log --oneline f024dee..HEAD`.
- Working tree was clean after the implementation commit; only this handoff changed for the final documentation commit. Verification artifacts are ignored.
- No production files, `main`, or other agents' worktrees changed. No merge, push or deployment.

**Stop point:** visual prototype ready for user review. No readiness gate, preload system, room reveal or automatic transition was implemented. Continue from this branch's latest state, not the initial prototype commit.

## Preview and verification

Run from this worktree with Node and local Chrome installed:

```powershell
node tests/loading-portal-check.mjs --serve
```

Open the localhost URL printed by the command; Ctrl+C stops the server. The page is `loading-portal-preview.html`. No build or package installation. Any static HTTP server also works; `file://` does not support these module imports.

Controls: pause/resume, square/rounded phase, manual approach. `?time=0` or `?time=6.85` produces a deterministic paused pose; `&clean` hides the review controls/header. OS reduced motion keeps the artifact still.

```powershell
node --check loading-portal.js
node --check tests/loading-portal-check.mjs
node tests/loading-portal-check.mjs --out=review-final --record
git diff --check
```

All passed on 2026-10-09. The check creates and closes its own server and temporary Chrome profile. Set `CHROME_PATH` for a nonstandard Chrome installation.

Evidence: `verification/loading-portal/review-final/` (local, gitignored; regenerate with the command above).

- `square.png`, `round.png`, `square-flow.png`: silhouette and continuing flow.
- `approach.png`: manual layer scaling, not a completed reveal.
- `reduced-motion.png`, `mobile.png`, `landscape.png`.
- `idle-motion.webm`: 14.4 seconds covering a complete breathing cycle.
- `report.json`: measurements, resource list and console results.

Earlier design rounds are in sibling `design-1`, `design-2`, `design-3-final` and `review` folders. Use `review-final` for the handoff.

## Visual design and source reference

Before designing, inspected `portal-orb-material.js`, `portal-effects.js`, the orb checks, and Phase 1's `.qa/orb-idle.png` and `orb-neck.png`. The room orb has a dark translucent body, soft teal heart, violet/green grazing reflections, sparse curved currents, restrained warm highlights, buoyant motion and viscous neck formation.

The prototype carries these cues into an irregular amber/gold lens with muted teal in a recessed gothic opening. A 13.7-second breath contracts the square toward a rounded form. Asymmetric ripples, counter-moving texture fields and independent glow frequencies continue across breathing cycles without a clock reset. There is no fake percentage or minimum duration. The earlier approved square reference image was not available in this conversation context.

The first pass looked too much like an engraved plaque. Refinements softened the doorway into the skin, removed the hard decorative outline, smoothed the bevel reflections and reduced the surface linework.

## Files and layers

Only five new files relative to `f024dee`:

| File | Purpose |
| --- | --- |
| `loading-portal.js` | Reusable Canvas 2D component; procedural material and animation. |
| `loading-portal.css` | Scoped canvas layout and presentation transforms. |
| `loading-portal-preview.html` | Standalone review page; labels and controls are not production UI. |
| `tests/loading-portal-check.mjs` | Screenshots, recording, motion, responsive, isolation and cleanup checks. |
| `PHASE2_STATUS.md` | This handoff. |

Three transparent canvases, back to front:

1. `layers.atmosphere`: dim halo, reflected light below, sparse drifting motes.
2. `layers.depth`: dark pointed opening, offset internal currents and teal heart.
3. `layers.liquid`: breathing silhouette, amber mist/veins, broad sheen, narrow rim highlight and feathered opening through the skin.

A procedural 192×192 material atlas is generated once and reused. No WebGL context, Three.js, external images, fonts, models or network dependencies. Internal rendering is capped at 24 draws/second and canvas DPR at 1.5. Hidden documents stop the loop. Reduced motion draws a fixed pose and stops scheduling.

## Integration API for Claude

Include `loading-portal.css`, create a mount element, then:

```js
import {createLoadingPortal} from './loading-portal.js';
const artifact = createLoadingPortal(document.querySelector('#loading-artifact'));
```

| API | Contract |
| --- | --- |
| `element` | Wrapper. Host owns placement, clipping, overall opacity and removal timing. |
| `layers.atmosphere/depth/liquid` | Individual canvases for future transition choreography. |
| `pause()` / `play()` | Pause/resume without resetting the clock. |
| `render(seconds)` | Deterministic pose. Use `{autoplay:false}` for a host clock; avoid redundant calls under reduced motion. |
| `setReducedMotion(boolean)` | Override the OS preference; `undefined` follows the OS again. |
| `setApproach(0..1)` | Immediate presentation parameter, no timeline/readiness assumptions. Skin scales `1+4p`, depth `1+2.8p`, atmosphere fades slightly. Suppressed under reduced motion. |
| `opening` | Approximate viewport rectangle of the liquid opening, including approach scaling; not a precise contour mask. |
| `stats` | Draw count, average CPU submission time, setup/texture time, motion and lifecycle state. |
| `dispose()` | Cancels RAF, removes listeners/observer and DOM, releases backing canvases; idempotent. |

The component is `aria-hidden`; the host owns an accessible loading announcement. Never infer room readiness from its clock. After visual approval, mount it before expensive room work, connect a real ready signal as described in Phase 1's handoff, and design the zoom/dissolve. The slider only demonstrates separately controllable layers; it does not reveal the room.

## Measured results and limits

Latest run: Windows laptop, headless Chrome/ANGLE D3D11, 1440×900 DPR 1. Power checked immediately afterward: battery, 75%. Mobile tests emulate viewports, not physical devices.

- 59.96 rAF fps; 16.9 ms p95 over five seconds.
- 1.39 ms average CPU draw-submission time per component frame; not GPU time.
- Setup 222 ms, including 163 ms procedural texture generation; one 226 ms startup long task. Earlier same-design run measured 59 ms setup. Cold setup varies materially with machine conditions.
- Chrome reported first paint at 1496 ms, with paint work at 465 ms. CPU setup time is not total visitor load time.
- Component JS + CSS: 15,934 decoded bytes. No room or Three.js resources.
- No page/console errors. Pause, OS reduced motion, approach bounds, portrait 390×844 DPR 2, landscape 844×390, and idempotent disposal passed.
- Syntax checks and `git diff --check` passed. Production room suites were not rerun because no production source/imports changed.

## Remaining work after visual review

- Depth is simulated in 2D, not volumetric refraction. Large approach scales expose raster softness. Choreograph the final handoff before excessive enlargement, or revisit resolution for that shot.
- Palette is temporary, in the component's texture and gradient colors. It has not been approved against the missing reference.
- Canvas animation shares the main JS thread and can pause during a long room initialization task. Independence means no room renderer/readiness dependency; uninterrupted integrated animation has not been tested.
- Only Chrome was verified. Other browsers, a physical phone, long sessions and simultaneous room warm-up need integration testing.
- Claude owns readiness/preloading, final zoom/reveal, keyboard/focus handling and production loading announcements. Do not merge or deploy without the user's next instruction.

---

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
