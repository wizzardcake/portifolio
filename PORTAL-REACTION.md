# Portal impact and orb drop

This response is independent of card drag, throw and page activation. The existing
`portalImpact({x, y, strength})` in `portal-impact.js` remains the cloth-release
effect. The orb calls the new response itself when a card falls through the
surface (see below); card code does not call it.

## Public entry point

```js
const result = await window.triggerPortalImpact({x: .5, y: .5}, .85);
// Equivalent: window.portalReaction.trigger({x: .5, y: .5}, .85)
// result: {completed: true}, or {completed: false, reason: '...'}
```

Position uses fractions of the **untransformed aperture**, not viewport pixels:
`x=0` left, `x=1` right; `y=0` back, `y=1` toward the viewer. Values are clamped
to 0..1. Intensity is 0..1; zero is a no-op. Omitted arguments mean centre/full
strength. The orb falls vertically at its existing centre; the surface response
originates at the supplied contact point.

The hook returns `not-ready` if the orb is still emerging, covered, projecting,
or the document is hidden. Ordinary projection/restore interrupts it with
`orb-transition`; a card dive can instead release the orb while its water response
finishes (see below). Reset uses `reset`. Hiding the tab, changing the motion preference, and explicit
`portalReaction.cancel()` also settle all outstanding promises. Up to three
responses may overlap; an older fourth response is resolved as `superseded`.
A retrigger starts from the current drop displacement. It creates no input lock.

`portal-reaction-start` is an optional notification on window with
`{x, y, intensity, duration}`. It is emitted once for an accepted nonzero hit.
It is not the existing `portal-impact` event used by the cloth/room lights.

## Connecting the card branch

The card throw (`script.js`) dispatches `card-portal-arrival` on window with the
landing point in aperture fractions. The water rings there by itself
(`portal-surface.js`).

The orb answers it too (`portal-effects.js`, `PORTAL-ORB.md`). After `arrivalDelay`
it calls this module's `trigger` at its own footprint, with strength from the card's
speed and a **dive** timeline:

```js
portalReaction.trigger({x, y}, strength, {dive: {entry, under, gone, rise, clear, settle, end}});
// seconds from the start: it meets the water, is below it, is lost in the depth,
// bursts back out, leaves the water, is back at rest, and the response ends
```

For a dive this module draws no orb offset; `sample().dive` carries the clock, and the
orb draws its own path. The water answers at the same moments: rings, a flare and
suction at `entry`; a swell (negative `pull`) from `gone` to `rise`; then rings, the
flare and the sparks at `rise`. `portal-reaction-start` carries `dive: {entry, rise}`,
so the surface rings the water at both. The orb holds `portalMatter.project()` until
the rendered dive clock reaches the handoff and its liquid neck has cleared. The
page then starts opening during the upward rebound, before the apex, without
returning to an idle waypoint. Default timing is approximately 1.52 s after card
arrival, subject to frame timing and neck clearance. Projection carries the
displayed pose and droplet form, with the velocity of the droplet's own path, into
Hermite curves. The card throw and activation code in `script.js` is unchanged.
An arrival dispatched without a `detail` (or without its `velocity`) is accepted
and dives at the base strength.

`portalReaction.releaseOrb()` is the internal handoff used by `portal-effects.js`.
It returns `true` for the active dive and marks its visual response as detached
from the orb. Its water rings, flare, sparks and sampled water/depth effects then
continue to their normal end while the orb projects. Other overlapping responses
are cancelled with `orb-transition`. The detached dive's promise still resolves
at the end of its visuals. Reset, restore, a hidden tab, a motion-preference change,
or an explicit cancel still remove it. `releaseOrb()` returns `false` for a plain
impact; it is not a second way to project or activate a card.

The dive handoff and opening controls are on `portalOrb.configure`: `handoff`,
`pageDuration` and `formBlend` (see `PORTAL-ORB.md`). `handoff` adjusts
`clear + (.08 + handoff) / diveSpeed`, bounded to the rising part of the rebound;
it does not add a pause after settling. Optional reader-target overrides passed to
`portalMatter.project(appId, {target})` affect both the moving orb and the final
HTML reader.

Direct calls keep their contract. When a response was started by
`triggerPortalImpact()` rather than by a card, `project()` still cancels it at once
with `orb-transition`.

Anything else that should send the orb down (another object thrown in) has two
options. It can dispatch `card-portal-arrival` at the moment it actually arrives, not
on pointer release. Or it can call the hook once and await it before projecting. The
reaction does not choose, hide, drag, retrieve or activate cards.

## Plain impact phases (default 2.2 seconds)

- **0-280 ms:** downward acceleration, initial shallow depression and first ring.
- **200-650 ms:** contact near the surface, dominant circular wave, short teal /
  violet flare, restrained flecks with occasional warm accents.
- **450-1400 ms:** two weaker wave packets, dark inward pull, sparks rise briefly
  and sink into the opening. Existing fog is displaced and darkened locally.
- **280-2200 ms:** damped upward recovery overlaps the waves; small overshoot,
  then idle drift fades back in. Transient elements are removed at completion.

Reduced motion uses a 420 ms soft surface glow, with no drop, waves or sparks.

## Tuning

Permanent defaults are at the top of `portal-reaction.js`. Console changes apply
to subsequent hits; each active response retains its original configuration.

```js
portalReaction.configure({orbDropDistance: .46, orbDropSpeed: 1.1});
portalReaction.configure({rippleAmplitude: .85, sparkCount: 7, duration: 2.0});
portalReaction.configure(portalReaction.defaults); // restore defaults
portalReaction.settings; // copy of current settings
portalReaction.stats;    // active response / spark counts, motion preference
```

| Parameter | Default | Units / effect |
| --- | ---: | --- |
| `orbDropDistance` | .46 | Orb diameters along the table normal (0-.7); at full strength the orb dips just into the recessed water |
| `orbDropSpeed` | 1 | Multiplier; contact at 280 ms at default duration |
| `reboundStrength` | .12 | Small overshoot, 0-.3 |
| `damping` | 5 | Recovery damping, 3-12 |
| `rippleRadius` | 1.15 | Maximum radius in aperture heights |
| `rippleSpeed` | .86 | Aperture heights per second |
| `rippleAmplitude` | 1 | Crest/trough strength and fog deformation |
| `rippleLifetime` | 1.45 | Seconds per wave, capped by total duration |
| `flareBrightness` | .62 | Surface/billboard light multiplier |
| `sparkCount` | 9 | At full intensity; capped at 18 per hit |
| `suctionStrength` | .65 | Central depression, fog contraction, spark inward pull |
| `duration` | 2.2 | Total seconds, clamped to 1-4 |

## Files and rendering

- `portal-reaction.js`: controller, reusable API, transient canvas rings, central
  well, flare and bounded sparks. No extra WebGL context or idle animation loop.
  With a live WebGL surface the ring outlines only glint faintly on the crests:
  the water itself carries the waves.
- `portal-reaction.css`: contained surface and transient visuals. The layer sits at
  the waterline (`--water-depth`), so flare and sparks rise from the water.
- `portal-surface.js`: on `portal-reaction-start` rings the water from the contact
  point, timed with the canvas waves (main wave at .7 × contact, a weaker one after),
  and draws the surface down under the orb from `sample().pull`. The abyss is
  refracted through the same ripples.
- `portal-effects.js`: samples the additive vertical offset or dive clock and
  captures the rendered pose when a transition begins. It exposes `canReact`,
  detaches the water response for a rising card-dive handoff, and otherwise cancels
  on orb mode changes and reset. It drops the orb when a card arrives and carries
  its velocity into the page opening (`PORTAL-ORB.md`).
- `portal-depth.js`: optional transient uniforms bend/darken the existing fog.
  They return to exactly zero when the response ends.
- `index.html`: loads the response, preserving aura, and fetches the debug script
  only when the URL has `?impactDebug=1`.
- `dev/portal-impact.js`: opt-in manual controls, styles included; delete the file
  to remove the harness. The normal page never loads it.
- `tests/impact-check.mjs`: Chrome integration checks and phase screenshots,
  including the orb reaching the recessed water and the layer riding on it.

## Review

Run `node tests/impact-check.mjs --serve` from this worktree, then open
`http://127.0.0.1:4175/?impactDebug=1`. Uncover the portal (or use the existing
bottom-right forward button), wait for the orb to finish rising, then use
**Drop orb**. The controls support strength and centre/left/right contact.
The server only serves this worktree and can be stopped with Ctrl+C.

`node tests/impact-check.mjs` runs the automated checks. Screenshots go to the
ignored `.qa/impact-*.png`: contact, expanding waves, recovery, mobile, fallback.
The test uses an isolated headless Chrome profile and does not operate user tabs.
