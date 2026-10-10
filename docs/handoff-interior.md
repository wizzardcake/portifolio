# Interior reconstruction: handoff

Session 1 of 3: Stage 1 (map the scene) and Stage 2 (rebuild the room's
architecture and layout). Lighting and smoke navigation are sessions 2 and 3.

## Where

| | |
| --- | --- |
| Worktree | `C:\Users\ander\OneDrive\Skrivebord\Portifolio\verification\interior-reconstruction` |
| Branch | `feature/interior-reconstruction` |
| Base | `926adf8` (see "Why this base") |
| Untouched baseline snapshot | `verification\interior-baseline` (detached worktree at `926adf8`, for A/B runs) |

Not merged, not pushed, not deployed. `main` is untouched. Commit after each
verified milestone; `git log --oneline 926adf8..HEAD` lists them.

### Why this base

`926adf8` is `main`, the published site, and the head of
`feature/exterior-entry-refinement`. It is the latest integration of all three
earlier lines of work:

- Phase 1 performance (`f024dee`): shader warm-up, shadow and layout fixes;
- the loading screen (Phase 2A/2B, `c91388a`): readiness gate, press to go on;
- the exterior (Phase 2C): the live 3D orb-glass building and the flight in.

No other branch or worktree holds newer integrated work: `feature/shelf-tools`
(`ea7c333`), `feature/chair-smoke` (`9f69b27`) and the older `Portifolio-*`
worktrees are all ancestors of `926adf8` or earlier side branches.

## References

The brief names `docs/reference/interior-concept.png` and
`docs/reference/interior-current.png`. They were not in the repository. The
user's screenshots folder had them, and they are copied into `docs/reference/`:

- `interior-current.png` (1919x913): `Screenshot 2026-10-10 052538.png`, the
  default entry view today.
- `interior-concept.png` (473x103): `Screenshot 2026-10-10 052803.png`, two
  views of the target room side by side, "Hovedrom – sett mot vindu og tårn"
  and "Sett fra motsatt vindu". **It is very small.** Layout, proportions and
  palette read clearly when enlarged; fine detail (tracery, mouldings) does
  not. A full-resolution copy would help the later sessions.

The brief also arrived cut off mid-sentence, at "Exterior consistency: the
interior must fit the building's footprint,". Its "Stop and report" section,
which lists the views to screenshot, was lost too. Until the user confirms, the
views are the ones in "Baseline" below.

### What the concept shows

View 1 (from near the door, toward the window):

- a wide, round chamber;
- a tall ribbed dome: dark ribs rising from the wall columns to a boss at the
  top, teal-green glass panels between them, and a lantern hanging from the
  centre;
- the walls in bays between dark columns, with pointed arches;
- a tall gothic window with tracery, centred behind a large round table (the
  focal point);
- on the left, a warm arched niche of shelves (bottles, books) above built-in
  cabinets;
- banners in some bays;
- on the right, a tall opening into a teal-lit round tower with a spiral stair
  and hanging mosaic lamps;
- a polished floor and a round rug.

View 2 (from the window, toward the door):

- a tall pointed doorway with warm light deep in it, opposite the window;
- the stair tower on the left;
- tall shelves on the right.

## Stage 1: the current scene, mapped

### Coordinates

- **Scene coordinates** (metres, `scene-camera.js`): the table centre is the
  origin, +Y is up and +Z points toward the seated viewer. The CSS portal and
  the WebGL room share this projection. The table never moves: the portal, orb
  and cards are tied to it.
- **Plan coordinates** (`room-scene.js`): the architecture lives in the
  `shell` group, shifted by `placement.forward = 1.3`, so plan z = scene z +
  1.3. Lamps (`room-lamps.js`), the sky (`night-sky.js`) and
  `room-architecture.js` use plan coordinates.

### Files

| File | Owns |
| --- | --- |
| `room-scene.js` | The plan constants, all room geometry, floor, walls, ceiling, stair, beams, materials, lights, light shafts and dust, cloth (drape, wall collision, flight up the stair), chair, smoke trails, shelf objects, the partial redraws, the warm-up, `window.studyRoom`. |
| `room-architecture.js` | Window and lancet frames, tracery, the stair's handrail and fascia. Parametric on the plan objects. |
| `room-lamps.js` | The door lantern, the nook's droplets, the tower's mosaic lamps, and their four lights. Positions are in `lampTuning`, in plan coordinates. |
| `room-smoke.js` | The smoke strands and standing marks. Trails come from `scene-camera.js` `paths` plus fixed points in `room-scene.js`. |
| `night-sky.js` | The sky's layers, as cylinders round the plan origin. Composed in azimuth from the chair, with the window at 189.3°. |
| `scene-camera.js` | The points (entry, seated, shelf), the paths (trunk, fork, branch, sit, chair pose), the walk, the lens shift (`anchorY`), and the navigation states. |
| `script.js` | The invisible entry buttons over the chair and the nook (`placeEntryTargets`; the nook's box is hard-coded), and walk/sit/leave. |
| `table-model.js`, `ritual-cloth.js`, `portal-*.js` | The table, cloth and portal. Table-centred, so unaffected by the room. |
| `loading-exterior-3d-worker.js` | The exterior building (Phase 2C). |

### Key positions today (scene coordinates unless noted)

| Element | Where | Notes |
| --- | --- | --- |
| Room | x -2.4..2.2, z -3.9..5.9, ceiling 2.45 m flat | A 4.6 m x 9.8 m box seen lengthwise: the corridor. |
| Table | origin, top 0.46 m; about 1.83 x 1.25 m at 1440x900 | Size follows the viewport (`portal-table.js`). |
| Entry eye | wide (0.75, 1.7, 4.3), looking at (-0.95, 0, -1.8); portrait (0.7, 1.75, 5.0) | Turned toward the nook; tilt about 15°. |
| Seated eye | (0, 1.18, 1.665) at 1440x900; z 2.53 at 390x844 | 15° down; z grows on narrow screens (`seatedDistance`). |
| Shelf eye | wide (-0.55, 1.8, -1.55), looking at (-2.85, 1.1, -1.55); portrait x 1.0 | Heading 90°. |
| Chair at rest | (1.14, 0.64), turned 56° | Drawn to (0, `seated.distance` - 0.06) as the visitor sits. |
| Nook | left wall x -2.4, recess to -2.85, z -2.6..-0.5; worktop 0.74, shelf 1.42 | Shelf objects stand on the shelf. |
| Window | x -1.0, z -4.5 (alcove end); sill 0.5, peak 2.0, half-width 0.42 | In the back-left alcove. |
| Tower | axis (2.05, -3.3), r 1.35, wall to 4.3 m; stair 14 steps from -12°, 10° each | Opens on the room through a cut-off corner. |
| Door | front wall z 5.9, x 0.25..1.35, 2.1 m high, flat-topped | Not the exterior's pointed arch (a known gap). |
| Door lantern | plan (0.15, 6.0) | Casts the patterned shadowed spot. |

### What depends on what

- **Camera targets.** The entry and shelf points, `paths` (trunk, fork,
  branch, sit, chair), and `look` (shelf look-round) in `scene-camera.js`. The
  walk durations are measured from the paths.
- **Click regions** (`script.js`):
  - the chair button covers the table and the chair's posed box;
  - the nook button covers a hard-coded box (x -2.4, z -2.6..-0.5, 2.12 m)
    and a ring round the shelf eye;
  - the chair is reached from the shelf by turning left 75°
    (`portal-check` expects yaw > 150° and the chair button shown).
- **Smoke.** The trunk and branch come from `paths`. "Gathering at the nook"
  and "gathering at the door" are fixed points in `room-scene.js`. The marks
  sit at the entry, shelf and chair points.
- **Cloth.**
  - `beyondWall()` folds a dragged cloth against the left wall (with the
    nook), the back wall (with the alcove), the right wall and the tower.
  - The flight route (`stairRoute`, `towerApproach`) runs to the tower and up
    the stair at fixed angles.
- **Shadows.** Three shadow-casting spots:
  - the door lantern's patterned spot;
  - the moon through the window;
  - the table's key light.

  The window wall must cast, so that the moonlight takes the window's shape.
  The shelf objects never fall in a shadow frustum; this is checked as they
  move.
- **Lights tied to architecture.**
  - The window: the moon spot, its bounce, the haze and the moon's shafts.
  - The tower: the green stairwell spot, the upstairs glow, the floor bounce,
    the green shafts and the lancets' shafts. Several of these have
    hard-coded plan points.
  - The nook: the droplets' light.
  - The door: the lantern's spot and glow.
- **Partial redraws.**
  - The window's scissor rectangle comes from the window and its beams.
  - The lamps' breath comes from their clusters.
  - The shelf's 30 Hz motion runs within 4.5 m of the shelf.
- **The sky** is composed for a window at azimuth 189.3° from the chair, its
  live layers spanning 168–212°.
- **Seeded randomness.** One shared generator lays out the planks, then the
  cloth's mottle and the dust. A different floor changes the cloth's mottle
  slightly; the textures before it are unchanged.
- **Tests that read the room.**
  - `architecture-check` passes a fixed plan into `room-architecture.js`.
  - `portal-check`:
    - the room budget, seated: under 30 draw calls and 10,000 triangles,
      without lamps and shelf objects;
    - "the ceiling/wall junction is in frame";
    - a mesh named `back wall with through opening` with one hole;
    - the shelf walk and the chair seen from the shelf.
  - `lighting-check`: the door's luminance boxes are fixed at z 5.9, and 19
    lamps.

### The exterior

`loading-exterior-3d-worker.js`, in its own units:

- **The body.** A drum of radius 1.0 (y -0.5..0.1), under an orb-like dome
  (an ellipse of radii 1.07 x 0.98, centred at y 0.14), crown at 1.44.
- **The door.**
  - It is on the drum facing +Z: one equilateral pointed arch.
  - Half-width 0.2, sill -0.44, spring -0.1, peak about 0.25.
  - So: jamb height 1.7 x the half-width, then two arcs of radius 2 x the
    half-width.
- **The tower.** Axis at (0.84, -0.52): on the drum's wall, 58° right of
  straight back. Radius 0.27 at its foot.

**What that means inside:**

- **Orientation.** The door is behind the entry (+Z). The window is
  opposite, behind the table (-Z). The tower stands back-right, about 60° from
  the window's axis. Today the tower and the window are roughly there, but the
  room is a box.
- **Scale.** There is no human reference outside, so a scale is chosen: one
  unit = about 4.35 m.
  - A drum radius of 1.0 gives a 4.35 m outer radius: an inner chamber about
    8 m across.
  - The ellipsoid dome allows vertical inner walls to about 4 m and a vault
    to about 6.4 m.
  - The door comes out about 1.75 m wide and 3 m high.
- **Door shape.** The room's door should become the exterior's equilateral
  pointed arch. That also closes the deferred "inside door ≠ outside arch"
  item.

## Baseline (`926adf8`)

**Method:** `tests/interior-check.mjs` (new, the same CDP approach as the
other suites; no Playwright in this repo).

- **Conditions:**
  - a fresh Chrome profile per load, on the GPU (ANGLE D3D11);
  - 1440x900 DPR 1;
  - served with `max-age=600`, so every load is cold.
- **Load and frames:**
  - first paint, room shown, site-ready, and the visitor in after pressing on;
  - main-thread frames while the gate is up;
  - then 4 s each at the entry, the chair and the shelf.
- **Views:** reduced motion and a frozen clock, with the camera on fixed
  poses.

```powershell
$env:PORTFOLIO_TEST_ROOT='..\interior-baseline'; node tests/interior-check.mjs --out=baseline --runs=3
node tests/interior-check.mjs --out=<name> --runs=3      # this branch
```

**Output:** `verification/interior/<name>/` (gitignored), with `report.json`,
`views.json`, the PNGs and `sheet.html`.

**Views:**

- `entry`, `seated`, `shelf`;
- `toward-window` (concept view 1) and `toward-door` (concept view 2);
- `stair-tower`, `vault`;
- `entry-portrait`, `seated-portrait` (390x844).

**Machine:** mains power (`BatteryStatus` 2). OneDrive was syncing and was the
top CPU user throughout, so absolute times run slower than in earlier
handoffs. Compare A/B only within one session.

| Baseline, 3 cold loads | Median (range) |
| --- | --- |
| First paint | 0.90 s (0.90–0.94) |
| Room's first frame | 13.3 s (12.9–15.1) |
| Site ready | 13.3 s (13.0–15.2) |
| Visitor in (after pressing on) | 16.2 s (15.5–18.0) |
| Main-thread frames while loading | 1.5 fps; longest gap 4.2 s (3.6–7.1) |
| After entry, entry view | 45.9 fps, p95 34.9 ms, longest 66 ms |
| After entry, chair | 46.4 fps, p95 49.4 ms |
| After entry, shelf | 53.9 fps, p95 33.3 ms |

**Room renders** (calls and triangles, room canvas, lamps and shelf objects
included):

| View | Calls | Triangles |
| --- | --- | --- |
| Entry | 45 | 24.7 k |
| Seated | 45 | 24.7 k |
| Shelf | 33 | 21.6 k |

**Memory:** 46 geometries, 26 textures, 27 programs.

`tests/performance-check.mjs --out=interior-baseline-1`, the same session:

- ready 16.2 s (with the CPU profiler and the cache off);
- entry 39.5 fps;
- chair 28.1 fps;
- shelf 53.2 fps.

The main thread was busy during that run.

## Plan (Stage 2)

**The shape: a twelve-sided chapter house.** Flat bays between columns read
as round, especially under a dome. They keep every opening planar (reusing
the existing arch, extrusion and frame code), and they give the dome's ribs
corners to spring from. Twelve bays put one bay on each axis the concept
needs:

| Bay (plan angle) | Use |
| --- | --- |
| -90° (back) | the great window, rising into the vault |
| -30° | the tower mouth: the whole bay open between two columns into the round tower |
| 90° (front) | the door: the exterior's pointed arch, with a short passage |
| 180° (left) | the study nook: deep arched recess, worktop, the real shelf with Figma, the grimoire and the crystal |
| 120°, 150°, 210°, 0° | built-in shelving niches, floor to high up |
| others | blind pointed arches |

**Dimensions (first pass, all parametric):**

- inner apothem 4.0 m;
- chamber centre 0.3 m in front of the table (the window 3.7 m behind it);
- columns 3.8 m to the springing;
- each bay's wall rising to a pointed arch about 1.3 m higher;
- the ribbed dome's apex about 6.4 m, with a boss and a hanging lantern
  (glass only: lighting is session 2);
- the tower: its axis outside the bay, the circle through the two flanking
  columns.

**What moves, and what follows it:**

1. **New module `room-chamber.js`.** It builds the chamber's geometry:
   - bay walls with openings and niches, the columns (instanced), the ribs
     and wall ribs (instanced), the vault cells, cornice, plinth and floor
     footprint, the tower wall and its cap, and the door passage;
   - it returns the plan landmarks (window, door, nook, tower) for the rest.

   `room-scene.js` keeps its materials and systems and replaces the old box
   with it.
2. **The window.** It is wider and taller and centred behind the table.
   `room-architecture.js` frames it as before (the same `aperture`/`alcove`
   contract, now on the window bay's plane). The moon spot, bounce, haze,
   shafts and the window's redraw rectangle follow it.
3. **The tower** moves as one rigid piece, turned and scaled about its axis.
   With it go:
   - the stair, lancets, upper floor and stairwell;
   - its lamps, and the green lights and shafts with their hard-coded points;
   - the cloth's flight route.
4. **The nook** moves into the 180° bay. With it go:
   - the shelf objects, the droplet lamps and the nook's smoke;
   - the shelf eye and the click box (`script.js` reads it from
     `studyRoom.nook` instead of hard-coding).
5. **The door** moves into the 90° bay. With it go its lantern and the
   door's smoke, the trunk's start, and `lighting-check`'s boxes (read from
   `studyRoom.door`).
6. **The camera:**
   - the entry stands centred, about 3.4 m from the table and looking toward
     the window, with the table lower in frame (a per-point lens anchor), so
     the vault shows;
   - the seated POV is unchanged;
   - the shelf eye and the paths are refitted to the new nook, chair and
     door.
7. **Cloth collision.** `beyondWall()` against the twelve bay planes (with
   the nook's recess) and the tower.
8. **The sky** is turned about the chair so its composition centres on the
   new window.
9. **Tests:**
   - `architecture-check`'s fixed plan follows the new window and tower;
   - `portal-check`'s room budget is re-based on the measured new geometry
     (it was written for a flat-ceilinged box);
   - `interior-check` gets a clearance check: every camera position on every
     walk keeps a margin from all room geometry.

**Risks:**

- **Draw calls and triangles.**
  - The dome, columns and niches add geometry. Mitigation: one mesh per
    material, instancing for columns and ribs, and no new shadow casters
    except where a light needs them.
  - Measured A/B against the snapshot.
- **The shader count.** A new material adds a program to the warm-up. At
  most one or two new materials (the vault's cells, and perhaps the wall
  stone).
- **The seated portal composition** must stay as it is: the table, seat and
  lens anchor do not change.
- **Lighting will look wrong in places.** The room gets far bigger and taller
  with the same lights, so the vault and far bays will be dark. Re-lighting
  is session 2; this session only moves lights with their sources.
- **Smoke** is refitted to the new paths but not designed (session 3).
- **The exterior tower is slimmer** than the interior's stair needs (0.27
  units ≈ 1.2 m against about 1.45 m). Noted, not changed: the exterior is
  published and settled.
