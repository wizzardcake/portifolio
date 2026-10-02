# Stair and window architecture pass

Worktree: `Portifolio-stair-window-arch`; branch: `feature/stair-window-arch`.
This is local architectural detailing, not a new room layout or global light grade.

## Design

- The existing stone spiral keeps its 14 treads, rise, radii, nosings, soffit,
  upper landing and route. A continuous carved inner fascia, substantial stone
  starting pedestal, warmer thicker handrail and seven open pointed bronze
  rail bays make it read as a crafted assembly. Alternating treads have thin,
  non-emissive worn-metal inlays that catch the existing light.
- The alcove and all four windows share nested stone mouldings, recessed
  reveals, spring blocks, bronze crown keys and layered sills. Tower dressings
  follow the actual cylindrical wall instead of floating in tangent planes.
  The large window has forked tracery; small pointed eyes hang from the crowns
  of all four openings. Openings remain genuinely open to the existing sky.
- The green source sits 45 cm above the upper landing, over the actual
  stairwell void. Three fine shafts fall into the well from that level. The
  spot's cone is tighter, its upper bounce has a shorter reach and the colour
  is jade/mint rather than saturated neon. Suspended green dust is smaller and
  dimmer, so it does not obscure the new rail silhouette.

Sky painting, moon, window moonlight, room fill/lamp/table lights, room footprint,
camera, table, portal, orb, cloth, card code and interactions are unchanged.
The new geometry consumes no random numbers; the shaft particle count and RNG
consumption are preserved, so the procedural cloth texture is unchanged too.

## Files

- `room-architecture.js`: isolated geometry generator and tuning defaults.
- `room-scene.js`: replaces old trim/railing, integrates two detail batches and
  adjusts only the upstairs green source/shafts.
- `tests/architecture-check.mjs`: pure geometry, arch matching, raycast opening,
  dimension preservation and budget checks.
- `tests/portal-check.mjs`: adds architecture/source/global-light invariants to
  the existing environment suite.
- `STAIR-WINDOW-DESIGN.md`: this guide.

No additional canvas, WebGL context, animation loop or shadow map. Room draw
calls increase from 17 to 18. The room renders 9,935 triangles (baseline: 9,585),
below the existing 10,000-triangle limit. It still stops redrawing when settled;
shafts and dust are static.

## Tuning

Change `architectureTuning` at the top of `room-architecture.js` and reload.
`studyRoom.architecture.tuning` exposes a read-only snapshot for inspection.

| Setting | Default | Meaning |
| --- | ---: | --- |
| `frameWidth` | .115 m | Main surround width; lancets use 65%, alcove 118% |
| `frameProjection` | .085 m | Raised moulding depth into the room |
| `revealDepth` | .24 m | Recess into the existing .30 m walls |
| `sillProjection` | .16 m | Added sill block depth |
| `traceryRadius` | .012 m | Default metal rod radius |
| `railRadius` | .030 m | Timber handrail radius |
| `railHeight` | .86 m | Height above the existing helical nosing line |
| `fasciaDepth` | .14 m | Carved band below the inner stair edge |
| `green` | #69dba1 | Upper-floor jade light colour |
| `greenIntensity` | 11 | Directional source intensity |
| `greenAngle` | .32 rad | Spot half-angle |
| `upperBounce` / `upperReach` | 6 / 1.55 m | Local glow around the upper landing |
| `shaftWidth` / `shaftStrength` | 1 / 1 | Multipliers for green shafts only |

Source aim and the three shaft endpoints are beside `greenShaft` in
`room-scene.js`. Keep their origins above the landing and within the stairwell
cutout. The isolated helper does not change stair dimensions; those remain in
the existing `stair` definition. Wider/deeper frames may require new opening
clearance checks. Stay within the wall thickness when increasing reveal depth.

## Preview

Run in this worktree (use a different free port if 4186 is occupied):

```powershell
$env:PORTFOLIO_PREVIEW_PORT='4186'
node tests/orb-check.mjs --serve
```

Open http://127.0.0.1:4186/ . Inspect both covered and revealed states, desktop
and portrait. The room renderer's inspection mode `studyRoom.clay(true)` shows
profiles without textures; `studyRoom.clay(false)` restores materials.

```powershell
node tests/architecture-check.mjs
node tests/table-check.mjs
node tests/cloth-check.mjs
node tests/portal-check.mjs --environment-only
node tests/portal-check.mjs --cloth-only
node tests/portal-check.mjs --foundation-only
```

Browser screenshots are written to ignored `.qa/`. Nothing needs a production
debug script. Commit locally on this branch only; do not merge or push as part
of this pass.
