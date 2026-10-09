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

# Phase 2B — readiness, preloading and the way in (Claude)

## Start here

- Same worktree and branch as Phase 2A above:
  `C:\Users\ander\OneDrive\Skrivebord\Portifolio\verification\loading-portal-visual`,
  `feature/loading-portal-visual`. Taken over from Codex at `7e5ba05` after the
  user's explicit handoff.
- Phase 2B commits: `0b0e3a1`, `77ce863` (made before the handoff, merged in
  `9cb9c80` with `240a387`), then `518ebbe`, `fab71f7`, `0b76126` and the
  commit containing this section. `git log --oneline f024dee..HEAD` lists
  them.
- Phase 1 (`f024dee`) is preserved: no warm-up, shadow or loading change of
  it was reverted, and every Phase 1 suite still passes.
- Codex's portal design (`loading-portal.js`, `.css`) is used unchanged.
  Only its host (the gate) drives it, through its public API.
- Not merged, pushed or deployed. `main` (the published site) is unchanged.

**Stop point:** a working loading experience for visual review. Two things
need the user's eye: the portal's look (Codex's, not yet approved) and the
way in (mine, described below).

## Preview

From this worktree:

```powershell
node tests/loading-portal-check.mjs --serve
```

The command prints a URL ending in `loading-portal-preview.html`. Open the
same address without that file name (just `/`) for the site with the gate.
Reload to see the gate again. Any static server from this folder works too;
`file://` does not.

To review:

1. The portal over the dark from the very first paint, while the room loads.
2. The way in once the room is ready: about 1.5 s.
3. The same with the OS set to reduce motion: a 0.45 s fade.
4. A phone-sized window.

## What happens when the page loads

1. **First paint:** the gate (`#loadingGate`, first in `<body>`, styled by
   `loading-gate.css` in `<head>`) covers everything with the dark backdrop.
   `loading-gate.js` runs as soon as it arrives (async, preloaded). It lets
   that frame paint, then starts Codex's portal, which fades in.
2. **While the room builds**, the page beneath is inert (keyboard and pointer
   cannot reach it). The room's idle life waits, because it is unseen:
   - the camera's sway;
   - the smoke and cloth pulse;
   - the window and lamp redraws;
   - the orb's frame loop.

   Only what readiness needs is drawn.
3. **Ready** (`window.siteReady`, `site-ready.js`, below). Then the way in:
   1. The portal's energy rises (brightness and saturation, 0.38 s).
   2. The portal scales about its doorway (`opening` from the portal API).
      The doorway grows in equal steps of log scale at an easing-in rate, so
      the view accelerates. It fills the screen at 0.8 of the 1.1 s zoom.
      Codex's own layer parallax (`setApproach`) runs from the same clock.
   3. From 0.6 of the zoom the room's idle life resumes and the page is no
      longer inert. From 0.7 the gate thins: the room appears through the
      doorway's teal light.
   4. The gate is removed, the portal disposed, and `site-entered` fires.
      The room's entry carries on as before: the smoke grows in from the
      visitor's feet, and the visitor chooses the chair or the shelf.

   All of the gate's motion is Web Animations (compositor). Reduced motion
   gets a plain fade, with the portal still.
4. **If the room is unusually slow**, a quiet "Gå inn" button appears after
   12 s, so the visitor can go in anyway. It is an offer, not a guess at
   readiness, and there is no progress figure.

Events on `window`: `site-ready`, `site-entering`, `site-unveiling`,
`site-entered`. `<html data-site-ready>` and `data-site-entered` mirror them,
and `window.loadingGate` has state, timings and frame intervals.

## What "ready" means (`site-ready.js`)

`window.siteReady` resolves once every critical part has settled on what
actually happened. There are no timers and no estimates.

| Part | Ready when | Reported by |
|------|------------|-------------|
| `room` | All shaders are compiled (Phase 1's warm-up), the first full frame (room and foreground) is drawn, and two more frames have passed, so the first frame's texture uploads land behind the gate. | `room-scene.js` |
| `water`, `depth`, `orb` | The portal's three WebGL layers have linked their programs, off the main thread (`gl-link.js`), or fallen back to CSS. | `portal-surface.js`, `portal-depth.js`, `portal-effects.js` |
| `font` | Cinzel (the cloth's inscription) has loaded or failed. It repaints the cloth when it arrives. | `site-ready.js` |

States:
- `ready`;
- `fallback`: no WebGL, so the room's silhouette is shown;
- `degraded`: a part's script failed to load, or an uncaught error came
  before ready. The page then shows what it has instead of waiting forever.

**Not waited for:**
- Sound: synthesised, and its AudioContext starts only when the visitor turns
  sound on.
- The shelf's objects and the tools page: built with the room, first drawn
  when looked at.
- The aura: CSS until the cloth comes off.

After `ready`, no shader program is linked during any of the first
interactions (checked).

## Initialization pipeline, as investigated

- **Shader compilation.** Phase 1 already compiles the room's programs off
  the main thread. The portal's three layers asked for compile and link
  status synchronously, about 1 s each. They now link asynchronously
  (`77ce863`).
- **GPU read-backs.** Textures drawn on canvases and read back (the aura's
  haze mask, 2.2 s; the cloth's glow mask) waited behind the room's
  compilation. They now use CPU canvases (`77ce863`).
- **Multiple renderers.** The room, the foreground, the water, the depth and
  the orb each have their own WebGL context; the 2D canvases are separate.
  Each reports its own readiness.
- **First frame.** Its texture uploads still take about 0.8 s, now behind
  the gate (see "first 3 s" below).
- **Camera and entry.** Initialised at the entry and paused behind the gate.
  The entry's smoke reveal restarts at `site-entering`.
- **After entry** (`0b0e3a1`). Walking past the awake portal to the shelf
  caused 1–5.6 s freezes: the portal's plane projected to enormous sizes near
  the eye. The portal is now treated as behind the view in those positions.

## Tests

All on mains power. `tests/` passes on this branch:

- **Phase 1's suites.** All 16 suite runs pass, the eight checks in
  architecture, table, cloth, portal (all five modes), depth, impact, aura,
  orb, tools, shelf-tools and lighting. They now wait for the gate to let
  them in.
  - `depth-check` failed once in a full run (5 rings counted instead of 1).
    It counted rings in a second call while the orb dives 0.12 s after a
    card, so it now counts in the same task (`fab71f7`).
- **New `tests/loading-gate-check.mjs`** checks that:
  - the first paint holds the gate, the page is inert while loading, and a
    click there reaches nothing;
  - every part is ready, and the gate was still up at ready;
  - the way in goes through the doorway, and the room is usable afterwards;
  - it fits a phone (390×844), and reduced motion gives a still portal and a
    fade;
  - recovery works: no WebGL (fallback), a missing portal-effects.js
    (degraded), a missing loading-portal.js (the CSS orb stands in), a
    missing loading-gate.js (no gate), and a room that never loads (the
    offer appears and works).
- **Codex's `tests/loading-portal-check.mjs`** passes.

## Measurements (compared with Phase 1, `f024dee`)

**Setup:**
- Hardware: this Windows laptop on mains power, headless Chrome with ANGLE
  D3D11 on the GPU.
- Loading: a local server sending `Cache-Control: max-age=600`, as GitHub
  Pages does. Each cold load uses a fresh profile, so the HTTP and shader
  caches are empty. Each warm load uses the same profile after a blank page.
- Viewport: 1440×900 unless stated.
- Runs were interleaved between the two versions. Values are medians, with
  ranges in brackets.

**Phase 1 behaviour:** the room canvas appears at its first frame, with a CSS
table before that.

| | Phase 1 | Phase 2B |
|---|---|---|
| First paint, cold (4 each) | 0.82 s (0.41–2.23) | 0.63 s (0.56–0.74): the gate |
| Room's first full frame, cold, no throttling (6 each) | 9.1 s (8.7–10.7) | 7.8 s (7.5–8.4) |
| Visitor in the finished room, cold, no throttling | 9.1 s, then the freeze below | 9.3 s (9.1–10.0), after the way in |
| Room's first full frame, cold, 4G (170 ms RTT, 9 Mbps; 3 each) | 10.2 s (9.7–10.5) | 8.7 s (8.4–9.1) |
| Visitor in, cold, 4G | 10.2 s, then the freeze | 10.2 s (9.9–10.6) |
| Room's first full frame, warm (3 each) | 4.5 s (3.7–5.0) | 3.4 s (3.35–3.39) |
| Visitor in, warm | 4.5 s, then the freeze | 4.9 s (4.9–5.3) |
| Phone 390×844, room's first frame, cold (2 each) | 6.6 / 7.7 s | 6.7 / 8.0 s |
| Phone, visitor in | — | 8.2 / 9.5 s |
| First 3 s in the room: longest frame (3 each) | 833–883 ms, 2–4 frames over 50 ms | 17–34 ms, none over 50 ms |
| First use, walk to the shelf: longest task (2 each) | 1.25 s, 2.16 s | 67 ms, 129 ms |
| First use, hovering the shelf objects | 33.9 s and 2.6 s freezes in one run; 67 ms in the other | 0 and 53 ms |
| First use: chair walk, cloth off and portal waking, card impact | longest 51–72 ms | longest 53–98 ms |
| Shader programs linked after ready | 0 | 0 |

**The way in itself** was traced per vsync:

| | Vsyncs dropped | Longest display gap |
|---|---|---|
| Desktop, 5 loads | 0 of 455 | 23–32 ms |
| Phone, 3 loads | 0 of 273 | 25–28 ms |
| Reduced motion | — | 0.45 s fade |

**Development steps of the way in.** Five traced loads each:

| Step | Vsyncs dropped |
|---|---|
| Room left running behind the gate | 18 of 466 |
| Room's idle life paused behind the gate | 17 of 452 |
| Portal scaled instead of the whole gate | 9 of 452 |
| With Codex's canvas portal | 0 |

In short: the room is ready 1.1–1.5 s sooner than in Phase 1. The visitor
enters at about the same moment Phase 1 first showed its room, but into a
finished room: Phase 1's 0.8–0.9 s freeze after the room appears, and its
multi-second freezes on first use, are gone.

## Known limitations

1. **The loading portal pauses while the room builds.**
   - Between first paint and ready, the page's main thread is busy 83–89 % of
     the time, in stretches of up to 1.7–2.3 s. In one traced load the
     longest were a 1.5 s timer callback, a 1.1 s animation frame and 0.9 s
     of parsing and script evaluation.
   - Codex's portal is drawn on that thread. Over 5.9–7.1 s it presented
     76–93 frames, with gaps up to 0.9–1.6 s.
   - Its clock caps each step, so after a pause it continues where it was
     rather than jumping. With its slow motion the pauses read as hesitations.
   - A compositor-animated CSS orb did better (191–231 frames) but still
     paused up to 0.9–1.1 s. Moving the portal off the main thread would
     therefore only help partly.
   - The lasting fix is to break up the room's initialization itself. That
     is a separate piece of work; the three stretches above are where to
     start.
2. **Visual approval.**
   - Codex's palette and look are unapproved.
   - The way in (zoom, timings, the teal crossfade) is a first proposal.
   - In slow motion the last frames of the zoom show the canvas's raster
     softness, as Codex foresaw. At normal speed it is inside the dark of
     the doorway and the fade.
3. **Measured only here.** Headless Chrome on one laptop; phone sizes are
   emulated, not a physical phone; 4G is emulated; no Firefox or Safari.
4. **Readiness edge cases.**
   - The font is part of readiness, so a very slow font server holds the
     gate (up to the 12 s offer).
   - An unrelated uncaught error before ready opens the gate early, in
     `degraded`.
5. **Tests.** Every `until()` in the room suites first waits for the gate
   to have let the visitor in (`data-site-entered`). Checks that must see the
   page before entry, such as `tests/loading-gate-check.mjs`, use their own
   waits.
