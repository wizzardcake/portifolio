# Portal impact and orb drop

This response is independent of card drag, throw and page activation. The existing
`portalImpact({x, y, strength})` in `portal-impact.js` remains the cloth-release
effect. No card handlers call the new response yet.

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
or the document is hidden. Projection/restore interrupts it with `orb-transition`;
reset uses `reset`. Hiding the tab, changing the motion preference, and explicit
`portalReaction.cancel()` also settle all outstanding promises. Up to three
responses may overlap; an older fourth response is resolved as `superseded`.
A retrigger starts from the current drop displacement. It creates no input lock.

`portal-reaction-start` is an optional notification on window with
`{x, y, intensity, duration}`. It is emitted once for an accepted nonzero hit.
It is not the existing `portal-impact` event used by the cloth/room lights.

## Connecting the card branch

The card throw (`script.js`) now dispatches `card-portal-arrival` on window with
the landing point in aperture fractions. The water rings there by itself
(`portal-surface.js`); that ripple needs no orb and does not delay the page.
Nothing calls the orb drop on arrival yet: doing so means either waiting ~2.2 s
before the page opens or letting `project()` cut the drop short, which is a
timing decision for the card flow, not for this module.

To use the orb drop as well, at the instant the final card flight crosses the
portal plane, convert its contact point to aperture fractions and call the hook
**once**. The card branch owns that hit detection and conversion. Do not trigger
on pointer release unless that is also the actual arrival time.

If opening the card content morphs the same orb into a page, await the response
before calling `portalMatter.project(appId)`, and retain the card branch's own
cancellation/generation guard:

```js
// Inside the future card-arrival handler, not implemented in this branch:
const reaction = await window.triggerPortalImpact(aperturePoint, impactIntensity);
if (reaction.completed && arrivalStillCurrent()) {
  await window.portalMatter.project(appId);
}
```

`arrivalStillCurrent()` is illustrative: use the card implementation's actual
state guard. The reaction does not choose, hide, drag, retrieve or activate cards.
Calling `project()` immediately deliberately cancels the reaction to preserve
the existing page lifecycle.

## Phases (default 2.2 seconds)

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
- `portal-effects.js`: samples the additive vertical offset; exposes `canReact`
  and cancels the response on orb mode changes/reset. Idle shader is unchanged.
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
