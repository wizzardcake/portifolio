# Soft ritual hex cloth

Cloth-only change on `feature/hex-table`. The table footprint/height, round
portal, orb, room, camera, stairs, card code and reveal sequence are unchanged.

## Design and motion

- Rounded hex core with six broad, side-centred panels. Each end has three
  shallow scallops; short curved shoulders bridge the panels. No pointed star cut.
- Dark plum velvet, double bronze hem following the actual cut, a band of
  stitched glyphs, six quiet medallions and the existing glowing inscription.
- At rest, the material wraps the real six table edges, not a bounding rectangle.
  The hanging panels sway slowly; the centre stays flat over the round portal.
- On drag, the centre follows the hand while the outer panels lag by a small,
  bounded amount. Short pulls use the existing settle-back interaction.
- On release, the existing portal tug and staircase route remain. UV-based
  transport retains the cut, with independent soft hem flutter. Less gathering
  keeps the broad silhouette visible instead of turning it into a thin ribbon.
- Reduced motion keeps a static drape and removes the cloth immediately.
  Reset cancels flight through the existing cancellation token.

## Files and integration

- `ritual-cloth.js`: isolated pattern mesh, flat material coordinates, hex support
  projection and shape/motion defaults. No scene or DOM mutations.
- `room-scene.js`: cloth-only integration, contour embroidery, drape and flight.
- `tests/cloth-check.mjs`: desktop/mobile pattern geometry and support tests.
- `tests/portal-check.mjs --cloth-only`: browser screenshots and regression checks.
- `CLOTH-DESIGN.md`: this guide.

`portalCloth.pull`, `settle`, `slideOff`, `reset` and `covered` keep their existing
contracts. `portalCloth.design` returns a read-only snapshot of the design values.
There are no new production renderers, assets, event listeners or animation loops.
The cloth has 3,841 vertices / 7,488 triangles (old: 3,869 / 7,488). Geometry and
embroidery rebuild only on table-size changes/font load; motion reuses buffers.
The existing HTML button, keyboard access and simple no-WebGL fallback remain.

## Tuning

Edit `ritualClothTuning` at the top of `ritual-cloth.js`, then reload:

| Control | Default | Effect |
| --- | ---: | --- |
| `shoulder` | .065 m | Minimum overhang between panels |
| `flare` | .25 m | Extra panel length |
| `scallop` | .032 m | End-wave depth |
| `lobeBreadth` | 1.7 | Higher = broader/less pointed panel ends |
| `dragTrail` | .14 | Outer panel drag lag; displacement capped at .09 m |
| `flightTrail` | .065 | Panel delay as a fraction of flight length |
| `flutter` | .035 m | Outer-panel flutter amplitude |
| `gather` | .28 | Gathering during lift-off |
| `furlWidth` | .32 | Additional width reduction approaching the stair |

Overhang scales down automatically on small tables. The existing live
`studyRoom.hem` controls idle amplitude, wavelength, speed, droop and damping;
its defaults are now slower and softer so the six-panel silhouette dominates.

## Preview and verification

From this worktree in PowerShell:

```powershell
$env:PORTFOLIO_PREVIEW_PORT='4183'
node tests/orb-check.mjs --serve
```

Open http://127.0.0.1:4183/ and refresh. Wait for the seated view, try a short
diagonal drag and release, then click or pull farther to watch lift-off. The
bottom-left back control restarts the intro. If port 4183 is already occupied,
choose a free port rather than stopping another worktree's server.

```powershell
node tests/cloth-check.mjs
node tests/table-check.mjs
node tests/portal-check.mjs --cloth-only
node tests/portal-check.mjs --foundation-only
node tests/portal-check.mjs
```

Screenshots are written under ignored `.qa/`: `cloth-pattern.png`,
`cloth-rest-*`, `cloth-drag-*`, `cloth-release-*`, `cloth-flight-*` and
`cloth-revealed-*`. Inspect rest, drag and flight together, including portrait.
