# Portal aura

The aura is a separate presentation layer in `portal-aura.js` and `portal-aura.css`.
`index.html` loads it after the room module. It only observes the existing intro/body
state and `scene-camera-change` event. It does not change cloth, entry, cards,
portal structure, orb, camera or room geometry.

## Tuning

Permanent defaults are at the top of `portal-aura.js` (`AURA_DEFAULTS`).
For temporary tuning in the browser console:

```js
portalAura.configure({ intensity: 1, rim: .62, light: 1 });
portalAura.configure({ haze: .30, particles: .65, moteCount: 28 });
portalAura.configure({ pulseAmount: .075, pulseSeconds: 14, refraction: 1.4 });
portalAura.setEnabled(false); // before/after comparison
portalAura.setEnabled(true);
```

- `intensity`: overall multiplier (0–2).
- `rim`: soft light over the tabletop edge (0–1); also controls apron spill.
- `light`: multiplier for two additional room point lights (0–2). Their base
  intensities are 6.8 jade and 5.4 violet, with 4.0 m / 3.8 m falloff radii.
  Existing cloth-reveal and impact lights are untouched.
- `haze`: opacity of three separated wisps (default .30; max .60). Heights are
  approximately 0.10, 0.20 and 0.34 m above the opening, with slow vertical drift.
- `particles`: mote opacity (0–1). `moteCount`: 0–32, capped at 12 below 600 px.
- `pulseAmount`: relative brightness variation (default ±7.5%, max ±15%).
  `pulseSeconds`: full breathing cycle (14 seconds by default).
- `refraction`: displacement in CSS pixels (0–2). Only two small patches use it;
  it is disabled below 900 px and for reduced motion. Set 0 to disable it.

Colour and spatial falloff of the rim are in `portal-aura.css`; light colours and
positions are in `portal-aura.js`. The centre of the opening stays empty.

## Runtime limits

28 motes on desktop / 12 below 600 px; three haze billboards sharing one static
256×128 alpha mask. DOM animation is capped at 24 updates/s, room-light refresh
at 8/s. Two point lights, no added shadow maps, meshes or WebGL contexts.
The aura stays dormant until the intro is finished, fades in over 2.2 seconds,
and extinguishes on reset. Animation pauses in hidden tabs. Reduced motion
keeps a static aura with no continuous aura-driven room renders. A cheap frame
callback only checks the motion preference, so a delayed browser notification
cannot leave animation permanently stopped after the preference changes.

## Verification

Run `node tests/aura-check.mjs` for covered/revealed states, A/B screenshots,
actual floor/wall light samples, camera/size invariants, five-card drag/return,
keyboard activation, pulse/update budgets, phone layout and WebGL fallback.
Screenshots are written to `.qa/aura-*.png` (Git ignored).