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

## Current status (read first)

**Stages.** All four stages of the resumed brief are built and committed.
Commits since `926adf8`, oldest first:

| Commit | Stage |
| --- | --- |
| `5d2ef0f` | Stage 1: map, baseline and plan |
| `ba0c0d6` | Stage A: the chamber |
| `0695809` | Columns, ribs and books merged |
| `af5a1fd` | Stage B: the gallery, the straighter entry and the shelf turn |
| `43951fb` | Stage C: lighting |
| `a7020ff` | Stage D: the smoke markers and navigation |

**The user's review answers (2026-10-10), all applied:**

1. **Gallery.** A gallery round the room with an open middle under the
   dome, reached from the spiral stair, left empty.
2. **Entry.** A straighter camera that shows more of the dome. The test is
   updated to match.
3. **Rug.** Quieter and more part of the floor, so the table is the focus.
4. **Shelf to chair.** A natural turn, not 150°. It is now 90°, from a shelf
   eye a step toward the window.

**Phase 3, first person** (website mode and game mode): built, reviewed
after Copilot's integration, and fixed. See "Phase 3" below. It is
committed after `71b78cb`.

**The stair tower** was enlarged outward after Phase 3, for climbing in
first person: see "The stair tower, enlarged outward".

**Ownership.** Codex Astra owns the exterior and the loading screen. None of
their files are touched (`loading-*`, `dev/exterior-*`, `assets/loading/`).

**Not merged, not pushed.** The user asked for a local preview, not a
merge or a publish.

**Preview:**

- `node <scratchpad>/serve.mjs <this worktree> 8765`, or any static server
  from this folder;
- open `http://127.0.0.1:8765/`;
- screenshots in `verification/interior/final/` (`sheet.png`).

**How to verify:**

- the 19 suite runs as before, plus `tests/navigation-check.mjs`;
- `tests/interior-check.mjs` for views, clearance and timing;
- see "Regression, final".

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

## Stage 2 (Stage A in the resumed brief): what is built

Uncommitted work at the time of the usage-limit stop, finished and verified
after resuming. Files:

| File | Change |
| --- | --- |
| `room-chamber.js` (new) | The chamber. Twelve bays at apothem 4.0 m (walls 0.35 m), each a flat wall from the floor into its pointed wall rib, with its opening or niche; a ribbed dome (springing 3.3 m, wall ribs rising 1.35 m, crown 6.4 m) of twelve glass cells; a boss and a hanging lantern; one bay's clustered column, diagonal rib and wall rib built once and repeated round the twelve corners, merged (two draw calls, timber and bronze; see "Instancing" below); cornice, plinth, the nook's and shelving niches' built-ins; the floor's footprint, the cloth's walls (`beyond`), the vault's height (`ceilingAt`) and furnishing placements. |
| `room-scene.js` | Builds the chamber in place of the box. The tower moves outside the bay at -30° (r 1.15, its circle through that bay's two columns); its stair, lancets, upper floor, lamps, green lights and shafts keep their design, turned 15° and scaled 0.85 about the axis (`fromOld`, `turned`). The window's moon spot, bounce, haze, shafts and redraw rectangle follow the great window. Cloth collision uses the chamber's walls; the cloth's flight goes in front of the new mouth and up the turned stair. The sky is turned 9.3° about the chair's eye so its composition centres on the new window. New: the vault's mosaic glass, the lantern glass, books (one merged mesh, coloured from a small palette texture), banners and a round rug under the table. Walls lose the brick coursing (dressed stone). |
| `room-architecture.js` | Takes the window's and the door's plane mappings (`windowMap`, `doorMap`) instead of the alcove; frames the door with the alcove's old profile; a wide window gets two more mullions and four small heads (four lights and an eye). |
| `room-lamps.js` | `place` overrides: the door lantern's spot and aim, the droplets' shift, the tower lamps' turn and scale, what 'beam' lamps hang from, and rods that reach the vault (`ceilingAt`). Defaults unchanged. |
| `scene-camera.js` | Entry on the table's axis just inside the door (wide 0, 1.7, 3.4; portrait 0, 1.75, 3.75), looking at the window, with its own lens anchor (the table lower in frame, so the vault shows). Shelf eye in front of the new nook. New trunk and branch. The shelf's look-round reaches 150° (the chair is now about 175° round from the nook), at up to 80°/s. |
| `script.js` | The nook's click box comes from `studyRoom.nook`. |
| `tests/architecture-check.mjs` | The new plan and mappings. |
| `tests/portal-check.mjs` | Re-based: the room budget (see below), and "the window rises from above the tabletop out of the top of the seated frame" in place of "the ceiling/wall junction is in frame". |
| `tests/lighting-check.mjs` | Its poses and the door's luminance boxes follow `studyRoom.door` and the tower. |
| `tests/interior-check.mjs` | Adds a clearance check: the nearest solid triangle to the eye on every walk, both formats. |

### Layout (scene coordinates; the chamber's centre is at z 0.3)

| Element | Where |
| --- | --- |
| Table | origin (unchanged) |
| Great window | back bay, plane z -3.7; half-width 0.82, sill 0.8, peak 4.3 (above the springing) |
| Door | front bay, plane z 4.3; the exterior's equilateral pointed arch, half-width 0.8, peak 2.75; a 1 m passage behind |
| Study nook | left bay, face x -4.0, back -4.6, z -0.68..1.28; worktop 0.74, tool shelf 1.42 (top 1.4375), two shelves above |
| Tower | axis (3.83, -1.91), r 1.15, 7 m; mouth = the whole -30° bay, arch peak 4.25 |
| Shelving niches | bays 0°, 120°, 150°, 210°; blind arches with banners at -60°, 30°, 60°, 240° |
| Entry eye | (0, 1.7, 3.4), 3.4 m from the table |
| Seated eye | unchanged |
| Shelf eye | (-2.25, 1.8, 0.3), looking at the nook's back (heading 90°) |
| Chair at rest | unchanged (1.14, 0.64, 56°) |

### Exterior fit (for Codex, not changed here)

*Since Stage B the vault springs at 3.9 m and crowns at 6.9 m, about the exterior dome's height at 4.35 m per unit. The inner walls now run vertical higher than the exterior's ellipsoid allows near its springing: about 0.3–0.6 m outside it there. Codex could give the dome a fuller shoulder, or the scale could grow. Noted only.*

- The plan fits the drum: the chamber's outer apothem (4.35 m) corresponds to
  the drum's radius 1.0 at about 4.35 m per unit.
- The door matches the exterior's equilateral arch and faces +Z. The tower
  stands back right, as outside.
- **Mismatches for Codex** (the exterior is theirs, so nothing was changed):
  - **Tower.** The interior tower is wider and stands further out than the
    exterior's: outer radius about 1.45 m against 0.27 units (about 1.2 m),
    with its axis 4.42 m out against 0.99 units (about 4.3 m). Widening the
    exterior tower's foot to about 0.33 units, and moving it out to about
    1.02 units, would match.
  - **Vault.** The interior vault's crown (6.4 m) matches the exterior dome's
    height. Near its springing the vault stands about 0.1–0.4 m outside the
    exterior's ellipsoid, where the inner walls run vertical to 3.3 m.

### Measured

**Clearance** (`interior-check`):

- the eye never comes within 0.42 m of anything solid on any walk, in either
  format;
- the nearest thing is the door lantern, just behind the entry;
- walls, columns, the vault and the stair are further away.

**Room renders** (calls and triangles, room canvas, lamps and shelf objects
included):

| View | Calls | Triangles |
| --- | --- | --- |
| Entry | 34 (baseline 45) | 37.9 k (24.7 k) |
| Seated | 34 (45) | 37.9 k (24.7 k) |
| Shelf | 33 (33) | 41.6 k (21.6 k) |

**Seated, without lamps and shelf objects** (`portal-check`'s budget): 31
calls, 34.3 k triangles at 1920 before the furnishing. The budget is now
under 40 calls and 50 k triangles.

### Decisions made in this pass (open for the user's review)

*Superseded by the user's review: see "Current status" and the Stage B section.*

- **Entry tilt.** The entry looks 15.03° down, a hair over the seat's 15°.
  That keeps `portal-check`'s rule that the walk in tilts down once and up
  once (a first try at about 6°, with straighter columns and more vault,
  failed it). With 15° the columns lean slightly outward at the top.
- **Shelf look-round.** It now reaches 150° at the very edge (it was 75°).
  The nook stands level with the table, so the chair is about 175° round.
  `portal-check` now measures the turn from the nook's heading, since the
  wrapped yaw reads −120° at 240°.
- **Door lantern.** It hangs 0.65 m in front of the door (it was 1.2 m), to
  stay behind the entry eye. Its spot now lights the passage's end wall, so
  `lighting-check`'s "jambs brighter than the opening" fails. This is for
  the lighting pass.

## Regression (2026-10-10, mains power, this worktree)

16 of the 19 suite runs passed in the full run. Of the other three:

- `aura-check` failed on a point that no longer exists. Its "nearby
  architecture" was the old left wall at x -2.38, which the aura's lights
  (reach about 2.7 m) could light. The chamber's walls are 4 m away. It now
  samples the table's own rim, with the far reference on the floor before the
  window (the window itself shows the moving sky). Passed on rerun.
- `lighting-check` fails on "From the shelf the doorway reads": the lantern
  now lights the passage behind the door (see above). This is for Stage C.
- `loading-gate-check` fails at its first wait for "waiting": a click the
  check makes while loading is taken as the answer (`continuedBy:
  pointerdown`). **The untouched baseline `926adf8` fails the same way**
  (`verification/interior-baseline`), so this predates this branch. It is a
  race in the loading screen's check, which is Codex's: documented, not
  changed.

Passed:

- `architecture`, `table`, `cloth`;
- `portal-check` in all six modes (default, environment, foundation, cloth,
  retrieval, depth);
- `depth`, `impact`, `orb`, `tools`, `shelf-tools`;
- `exterior-entry`, `loading-portal`.

## Known failures and why

- `lighting-check`: "From the shelf the doorway reads". This is lighting
  (above), for Stage C.
- `loading-gate-check`: a pre-existing race, also on the baseline (above).
  For Codex.

## The smoke markers' click bug (for Stage D)

The user reports that clicking the left smoke marker goes to the chair.

**Cause, from the code:**

- `script.js` `placeEntryTargets()` lays two invisible buttons over the
  screen's bounding rectangles of world points:
  - `#goChair`: the table and the posed chair, plus a ring at the branch's
    end;
  - `#goShelf`: the nook, plus a ring round the shelf eye.
- `#goChair` is on top (`room.css`, z-index 1).
- In the old room the shelf eye (-0.55, -1.55) lay just behind the table as
  seen from the entry, so its marker fell inside the chair button's rectangle.
  The click went to the chair.
- In the chamber the shelf marker (-2.25, 0.3) stands well left of the table,
  so the rectangles probably no longer overlap. This is not yet verified by
  clicking.

**Fix in Stage D:**

- hit-test the marker rings (ellipses on screen) before the rectangles, or
  make the buttons non-overlapping;
- check each by a real click on each marker, in both formats.

## Next (from the resumed brief)

*Done since: see "Current status".*

1. **The user's visual review of this architecture.**
   - Preview: run `node <scratchpad>/serve.mjs <worktree> 8765`, or any
     static server from the worktree, and open `http://127.0.0.1:8765/`.
   - Screenshots: `verification/interior/review-1/` (`sheet.png` shows them all).
2. **Stage B: the vertical structure.** The brief asks for two main floors
   with matching footprints, a taller tower and the spiral stair connecting
   them. This needs the user's choice, because a full second floor over the
   chamber would hide the tall dome they asked for. Proposed: a gallery ring
   at the springing (about 3.3 m) round the chamber, its floor matching the
   twelve-sided footprint, open in the middle under the dome, reached from
   the tower's stair (its landing raised to meet it); the second floor
   otherwise empty.
3. **Stage C: lighting.**
   - Warm lamps at the shelves and walls.
   - The vault's lantern lit.
   - The window's light, and readable architecture.
   - The door lantern re-aimed, so `lighting-check` passes.
4. **Stage D: smoke markers and navigation**, as above.
5. **Full regression and a performance A/B** against `../interior-baseline`.

## Performance A/B (after the merge below)

**Conditions:**

- `interior-check --timing-only`, interleaved: the baseline snapshot, then
  this branch, four rounds;
- a cold load each, on mains power, 1440x900, ANGLE D3D11.

| | Baseline 926adf8 (n=4) | Chamber (n=4) |
| --- | --- | --- |
| First paint | 0.87 s (0.76–0.88) | 0.98 s (0.78–1.06) |
| Room shown | 12.8 s (8.7–13.1) | 10.5 s (10.2–11.6) |
| Site ready | 12.9 s (8.7–13.1) | 10.5 s (10.2–11.7) |
| In, after pressing on | 15.4 s (11.5–15.9) | 13.2 s (12.9–14.5) |
| While loading: main-thread fps, longest gap | 1.8; 4.7 s | 2.3; 4.5 s |
| Entry: fps, p95 | 60.2, 17.2 ms | 59.5, 18.6 ms |
| Chair: fps, p95 | 60.2, 17.1 ms | 60.1, 16.9 ms |
| Shelf: fps, p95 | 60.2, 17.1 ms | 60.1, 17.2 ms |
| Room draw calls, entry | 45 | 34 |
| Triangles, entry | 24.7 k | 37.9 k |
| Shader programs | 27 | 28 (the vault's glass) |
| Geometries, textures | 46, 26 | 51, 29 |

Loading is no slower; the ranges overlap and the medians favour the chamber,
which no longer draws the brick texture. After entry everything holds the
display's 60 fps. An earlier A/B (the machine loaded, about 18 s to ready)
showed the same picture, the chair view then 39 fps on the baseline against
60 on the chamber.

### Instancing

The brief asked for the ribs and columns to be instanced.
- **Measured.** Instanced (one `InstancedMesh` each for timber and bronze),
  they needed three more shader programs: instanced timber, instanced bronze,
  and the instanced shadows' depth. Books with instanced colour needed a
  fourth. That is 32 programs against the baseline's 27. Loading was about a
  second slower.
- **Now.** The one bay's frame is built once and repeated round the twelve
  corners into one merged geometry per material: the same single draw call,
  using the room's existing programs. The books are one merged mesh that
  takes its colours from an 8x4 palette texture, so it uses the timber's
  program.
- **Result.** 28 programs, as in the table above.

## Stage B: the gallery (`af5a1fd`)

`room-chamber.js` `tuning.gallery`:

| Setting | Value |
| --- | --- |
| floor (top) | 2.85 m, level with the tower's upper floor, where the spiral stair arrives |
| depth | 1.0 m from the wall |
| slab | 0.15 m |
| balustrade | 0.95 m |

**What it is:**

- It covers every bay but the window's, which rises through it.
- Its floor follows the twelve-sided outline, so neighbouring bays meet
  on the corner lines.
- A fascia runs under its open edge, and a balustrade of slim balusters
  between two rails, with a bronze strip on the top rail.
- The balustrade turns back to the wall either side of the window.
- A beam under it at each column is part of the repeated frame.
- Across the tower's mouth it is the bridge to the tower's upper floor. That
  floor already stops at the mouth's plane, so the two are continuous.

**Proportions changed for it:**

| | Before | Now |
| --- | --- | --- |
| Springing | 3.3 m | 3.9 m |
| Crown | 6.4 m | 6.9 m |
| Window | shoulder 3.05, peak 4.3 | shoulder 3.6, peak 4.9 |
| Tower mouth | shoulder 3.0, peak 4.25 | shoulder 3.6, peak 4.85 |
| Door | half-width 0.8, peak 2.75 | half-width 0.74, peak 2.54 (still the equilateral arch) |
| Nook, shelving and blind niches | peaks about 3.0 | peaks 2.6, all under the slab |

`ceilingAt` returns the gallery's underside within its band. So the door
lantern, the nook's droplets and the tower's two mouth lamps hang from it on
short rods.

**The second floor is empty**, as the user asked. Its walls are plain up to
the wall ribs.

## Entry, shelf, rug (`af5a1fd`)

- **Entry.**
  - Wide: eye (0, 1.7, 3.4), looking at (0, 1.1, -3.7), about 5° down,
    anchor 0.68.
  - Portrait: (0, 1.75, 3.75), turned 9° left (`a7020ff`), anchor 0.70.
  - `portal-check`'s tilt rule is now: the entry's pitch is in [75, 90), the
    tilt dips once to the chair and rises once into the seat's 75°, and the
    lowest point lies inside the walk.
- **Shelf.**
  - Eye (-2.6, 1.8, -0.75), looking at (-4.6, 1.1, 0.3): the nook at about
    28°, heading 118. Portrait (-1.95, 1.8, -1.1).
  - `look.yaw` 90 (it was 150, and 75 in the old room).
  - The chair is about 130° round from the nook's heading, so a 90° turn
    plus half the field of view brings it in. The `shelf-turned` view in
    `interior-check` shows it.
  - **Why not square on.** Square in front of any left-wall nook, the
    chair (right of the table) is 165–175° behind the visitor.
- **Trunk.** It runs on to the new shelf eye. The fork is index 5, at
  (-0.2, 2.58). The branch ends at (1.3, 1.25), so its marker is in view
  from the entry. The trunk's start runs straight, past the door lantern.
- **Rug.** Darker plum, faint gilt and teal, its edge fading toward the
  boards, radius 1.9.

## Stage C: lighting (`43951fb`)

**Sources the visitor can see.** None casts a shadow.

| Light | Source | Values |
| --- | --- | --- |
| `vault lantern` | the lantern under the boss | 24 cd, reach 11 m, `#ffb468` |
| `sconce left`, `sconce right` | two of the six brass column sconces (corners 8 and 4) | 7 cd, reach 4.5 m, `#ffad5c` |

- **Tuning.** `studyRoom.chamberLight.configure({lantern, sconces})`.
- **The other sconces** (corners 0, 1, 5 and 11) and the candles (on the
  shelving cabinets and the nook's worktop) are glowing glass and flame
  only. They share one draw call with the lantern's glass
  (`lamp and candle glass`). The wax shares the books' mesh and palette.
- **Window.** `windowBounce` is 3.4 cd with a 4.2 m reach, for the taller
  window.
- **Door.**
  - The lantern hangs 1.2 m out and 0.65 m right of the doorway (as seen
    from inside), as in the old room, aimed at the doorway's foot.
  - The passage beyond the wall is dark slate, its walls and floor merged
    into the floor substrate. It ends in a dark, ironbound oak door
    (`outer door`).
  - So the doorway reads from the shelf, and the lantern's pattern lies on
    the threshold. `lighting-check` passes again. Its threshold ratio is
    about 0.51 against the required 0.5: close.
- **Unchanged:** the hemisphere and ambient fill, the table's key light
  and the portal's lights. `portal-check`'s light-balance assertion is
  untouched.

## Stage D: smoke markers and navigation (`a7020ff`)

**The bug.**

- The user reported that clicking the left smoke marker went to the chair.
- **Confirmed on `926adf8`** by `tests/navigation-check.mjs`: at the wide
  entry, the shelf marker's centre (751, 485) lay under `#goChair` and
  walked to the chair.
- **Cause.** The place buttons were screen rectangles, and `#goChair` (the
  table and chair box, on top) covered the shelf marker behind the table.

**The fix** (`script.js` `cover()`):

- Each button's box still spans its things.
- A `clip-path` limits clicks to each thing's own outline: the convex hull
  on screen of the table, the chair, the nook, and each marker's ring,
  grown 12 px.
- `room.css` drops the clip for `:focus-visible`, so the keyboard's focus
  ring still shows.

**Markers.**

- All three standing marks share the same sign (`room-smoke.js`): a fine
  circle of twelve arcs just outside the mist ring, and eight points
  turning inside it.
- The sign breathes, and brightens on hover.
- The mist ring is unchanged.

**Reach.** `navigation-check` clicks every marker and object in view.

- **Wide, from the entry:** shelf marker, chair marker, chair, table.
- **Portrait, from the entry:** shelf marker, table.
- **At the shelf:** a click anywhere walks back.

Each must lead to its own place, and every place must be reachable from the
entry. All pass.

## Regression, final (`a7020ff`, mains power)

In the full run, 19 of 20 runs passed: the 19 earlier suite runs plus
`navigation-check`.

- **`impact-check`** failed with `reason: 'motion-preference'`. Run twice
  more: once failed, once passed. This is the race HANDOFF.md (phase 1)
  already records as failing now and then, on the baseline too. The
  interior does not touch the impact.
- **`loading-gate-check`** passed this time. It is still the race seen on
  the baseline (above), which belongs to Codex.

## Performance A/B, final (`a7020ff`)

**Conditions:** interleaved, four cold loads each, mains power, 1440x900,
ANGLE D3D11.

| | Baseline 926adf8 | Chamber |
| --- | --- | --- |
| Site ready | 13.8 s (10.6–14.3) | 13.2 s (11.9–13.5) |
| In, after pressing on | 16.8 s (13.5–17.0) | 15.9 s (14.6–16.2) |
| While loading: main-thread fps, longest gap | 2.0; 4.7 s | 3.2; 4.8 s |
| Entry: fps, p95 | 60.0, 17.1 ms | 58.4, 17.6 ms |
| Chair: fps, p95 | 60.2, 17.1 ms | 60.2, 17.1 ms |
| Shelf: fps, p95 | 60.2, 17.0 ms | 60.0, 17.1 ms |
| Room draw calls, triangles (entry) | 45, 24.7 k | 36, 41.8 k |
| Shader programs | 27 | 28 |
| Geometries, textures | 46, 26 | 53, 30 |

Loading is no slower, and after entry every view holds about 60 fps with
the new lights. The entry's 58.4 fps, against 60.0, is within these runs'
spread (55.8–59.9).

**Clearance:** the eye never comes within 0.44 m of anything solid on any
walk, in either format. The nearest thing is the door lantern by the
entry.

**Screenshots:** `verification/interior/final/`, with `sheet.png`.

## Phase 3: first person (website mode and game mode)

**Who built what.**

- **Claude, first pass:** the free pose and the user's look in
  `scene-camera.js`, and the controller in `first-person.js`.
- **Copilot:** the integration.
  - The controller is started in `room-scene.js`, which now exposes
    `studyRoom.walk`, `shelfHover()` and `aimCentre()`.
  - `first-person.css` is linked from `index.html`.
  - The first stylesheet.
  - `tests/first-person-check.mjs`.
  - Its audit, `docs/phase3-copilot-handoff.md`. Its "returns to ENTRY" line
    is superseded below.
- **Claude, this pass:** the review and the fixes below.

### What the visitor gets

- **Website mode (the default).**
  - A drag turns the view, with pitch limits.
  - A click goes to a place, as before.
  - A hollow ring sits at the screen's centre and brightens over a place.
- **Game mode.**
  - W A S D or the arrow keys walk relative to the view, easing in about
    0.15 s and out about 0.12 s, at 1.5 m/s. The mouse looks around under
    pointer lock.
  - Escape frees the mouse and stays in game mode. A hint says how to take
    the mouse again.
  - Aim at the table or the chair and press E (or click) to sit, labelled
    "Sett deg · E".
  - The shelf objects wake under the sight.
  - The visitor collides with the walls, the columns, the table and the
    chair.
  - The spiral stair climbs to the tower's upper floor. Through the
    tower's mouth lies the gallery, which ends at the balustrade.
  - Head bob of 2.2 cm per 1.5 m stride, off under reduced motion.
- **The invitation.**
  - Shown once per visit (sessionStorage `fp-invited`), 1.4 s after entry.
  - It waits while the visitor is on the move.
  - Never on touch-only devices.
- **The menu.**
  - At the top right, beside the sound toggle (`right: 116px`).
  - The mode switch, the current mode and the help text.
  - Game mode is disabled on touch, and the text says why.
- **Leaving game mode keeps the visitor where they stand** (`FREE`).
  - The three marks are shown: chair, shelf, and the entry (`#goEntry`,
    new, in `script.js`).
  - On the chamber floor, a mark walks the visitor there, round the table.
  - From the stair, the tower or the gallery, a walk would pass through
    floors. Instead a short veil of mist (`.fp-veil`, about 0.3 s) closes
    and opens at the place.

### Review: what was wrong, and the fix

1. **The walk plan was offset by 0.6 m.**
   - The cause: `studyRoom.walk.forward` had the wrong sign
     (`-placement.forward`). Walls, columns and the stair all sat 0.6 m
     from where they are drawn.
   - The test missed it because it converted both ways with the same sign.
   - Fixed. The test now also checks registration against the drawn
     meshes: the window wall, the nook wall, and a ray against the
     "spiral stair" mesh within 0.13 m.
2. **The stairwell was open over the whole tower.** `walk.well` began at 0.
   It now begins where the well does.
3. **Game mode to website mode walked to the entry.**
   - From upstairs, that walk went through the floor.
   - Now the visitor stays where they are, as described above.
4. **`touch-action` was set too late.** The browser decides when a touch
   begins, so a drag scrolled the page. It is now set ahead, with
   `body.fp-room`.
5. **The stylesheet was generic.**
   - Rewritten in the room's idiom: dark violet glass, a gilt hairline,
     Cinzel titles, the keys as engraved stones.
   - The sight is a 16 px ring that warms over what can be used.
6. **Pointer lock in headless Chrome** may come or not.
   - The test accepts either outcome.
   - The controller shows the hint after 1.2 s if the lock neither comes
     nor is refused.
7. **The gallery could not be reached.**
   - The tower mouth's arch was lower than a person on the gallery. In
     `room-chamber.js`, OPEN.tower is now shoulder 4.5 and peak 5.2 (was 3.6
     and 4.85).
   - The walk plan let the walker through the balustrade in the tower's
     bay. It is rewritten as `throughMouth`: the gallery runs to the mouth's
     plane, and the tower's floor begins beyond it.
8. **The walker stuck on round columns.**
   - A blocked step is now tried turned ±0.5 rad, then ±1 rad (shortened),
     before the two axis halves.
   - The velocity follows the step that was taken.
9. **Shelf aim without pointer lock followed the mouse.** In game mode the
   sight is now always the aim (`aimCentre(true)` on entering game mode).
10. **"On the chamber floor"**, which decides between a walk and the veil,
    counted the tower circle's bulge in front of the mouth as the tower.
    It now needs to be beyond the mouth's plane.
11. **Polish.**
    - The invitation is 420 px wide, so each choice fits on one line.
    - The veil sits under the top-right controls (z-index 998, under the
      999 controls).
    - The hint hides while the menu is open.
    - The help text says "Trykk" on touch.

12. **Game mode from the chair put the visitor in the table.**
    - `spawn()` stepped toward the chamber's middle to find floor, and the
      middle is the table.
    - It now takes the nearest free spot, away from the table first, so the
      visitor stands up beside the chair.
    - Tested: "game mode from the chair" in `first-person-check`.

13. **Choosing a place past the invitation left it hanging** over the
    moving view. Choosing a place now closes it, which counts as choosing
    website mode, and it does not return. This is tested.

14. **Game mode while the portal woke pulled the visitor back to the
    chair.**
    - The portal's opening sequence (`script.js`
      `runFinishingSequence`) starts when the cloth has finished sliding,
      and it seats the visitor first (`cancelApproach`).
    - Game mode opened in between was undone a moment later.
    - Game mode now waits while the portal wakes: from the cloth drawn off
      (`table-covered` gone) until `intro-done`. The menu says
      "Spillmodus venter til portalen har våknet."
    - This is tested. The test also waits for `intro-done` before going on,
      which was the race behind an intermittent failure.
15. **Walking in game mode ran at about 45 fps.**
    - On every update, `scene-camera.js` wrote six variables on
      `<html>` (`--table-view-*`, `--scene-focal`, `--scene-origin-y`,
      `--table-leg-length`). That restyled every element on the page while
      the eye moved, 8 to 11 ms a frame.
    - Their only reader is the portal plane's own transform and top
      (`portal.css` `.screen`).
    - Now `update()` writes that transform and top on `#screen`
      directly. `--view-pitch` and `--table-leg-length` are set only when
      they change. `--view-yaw` is gone, since only that transform used it.
    - `portal.css` still has the same transform built from the variables,
      as the fallback before the first update.

    | Headless, mains power | Before | After |
    | --- | --- | --- |
    | Game: walking and turning | 45 fps | 59.7 fps |
    | Game: walking straight | 48 fps | 56.6 fps |
    | Game: turning only | 59 fps | 60 fps |
    | Website walk, entry → chair | 31 fps | 33–36 fps |

**Changed on purpose in Phase 3:** at the shelf the view no longer follows
the pointer (the old `look: {yaw: 90, …}`, up to 90° at the screen's edge).
The visitor's own drag-look replaces it everywhere, so they drag round to
the chair.

- `portal-check`'s shelf-to-chair step now drags (1040 px to the right,
  about 75°) instead of moving the pointer to the edge.
- `interior-check`'s "shelf-turned" view turns a fixed 75°. It used to
  read the removed `sceneCamera.look.yaw`.

**Other test changes:**

- `interior-check` and `navigation-check` mark the invitation as seen
  (`Page.addScriptToEvaluateOnNewDocument`), so their views compare like
  for like.
- `interior-check`, `navigation-check` and `first-person-check` read
  `document.documentElement?.dataset`. The element is null for a moment
  while the page is replaced, and that race now and then stopped a run.
- `first-person-check` waits for the hint after Escape
  (`pointerlockchange` follows the release a moment later).
- `first-person-check` clicks the shelf's mark on the floor beside the
  invitation, not its box's middle, which lies under the card.
- `first-person-check` waits, after the instant jump to the shelf, for the
  room's camera to follow before projecting the shelf.
- `first-person-check` reports the state when the shelf hover or the walk
  after standing up fails.
- The entry's slight lean toward the pointer (0.4°) is kept.

**Shared-file overlap:** `index.html`, one `<link>` line for
`first-person.css` (Copilot's). No loading screen or exterior file is
touched.

### Tests

`tests/first-person-check.mjs`, headless by default. It covers:

- the integration;
- the invitation;
- website drag-look (a drag turns the view and is not a click);
- the menu;
- game mode and pointer lock (asserted in a visible window; headless, the
  hint is asserted instead);
- WASD movement;
- collisions, and registration against the meshes;
- the stair climb to the landing;
- the gallery through the tower's mouth, ending at the balustrade;
- Escape, with the hint;
- staying `FREE` on leaving game mode;
- the entry mark from `FREE`;
- the veil from upstairs;
- E to sit;
- centre aim on the shelf;
- the cloth drag;
- website shelf hover;
- game mode from the chair (stands up beside it, can walk);
- game mode waiting while the portal wakes;
- a new visit where a place is chosen past the invitation (it closes and
  does not return).

Run it with `$env:PORTFOLIO_HEADLESS='0'` for the pointer-lock path in a
visible Chrome.

**Headless, 2026-10-10, the final code:** passed 3 of 3 runs in a row.

- Chrome logs one warning: "Pointer lock cannot be acquired immediately
  after the user has exited the lock".
- That is a re-lock attempted right after Escape. The hint shows, and a
  click locks again.

**Screenshots:** `verification/first-person/phase3/shots/`, with
`sheet.html`. They show:

- the invitation;
- the website entry with the sight;
- both menus;
- game mode at the entry;
- the table aim;
- the shelf;
- the tower's mouth;
- the gallery, two ways;
- the dome;
- standing free in website mode with the marks;
- the veil;
- a phone, at entry and with the menu.

### Regression (2026-10-10, mains power, the final code)

The full set was run: 22 runs.

- `portal-check` ran in all six modes.
- `interior-check`, `navigation-check` and `first-person-check` were
  included.
- So were all the other suites, Codex's included.

On the first pass, 20 of 22 passed. The other two:

- **`impact-check`** failed with `reason: 'motion-preference'`. This is
  the known race, which also fails now and then on the baseline. It passed
  2 of 2 when run again.
- **`first-person-check`** failed with a race in the test itself.
  - Projected straight after an instant jump to the shelf, the shelf lands
    where it was seen from the chair. The room's own camera follows on its
    next frame.
  - The test now waits for it, and then passed 3 of 3 in a row.
  - A visitor never sees that frame.

Earlier passes during the review stopped on races that are now fixed in
the tests (see "Other test changes" above):

- the page briefly having no `<html>` element during navigation;
- the hint after Escape;
- the click under the invitation;
- the portal's opening sequence.

Two more stops came from the laptop going to sleep on battery in the
middle of a run.

`loading-gate-check` passed. It is Codex's race, which also shows on the
baseline.

**Clearance:** unchanged. On every walk the eye stays at least 0.44 m from
anything solid.

### Performance A/B (mains power, Phase 3 included)

**Conditions:** interleaved cold loads, four per side, 1440x900, ANGLE
D3D11. Baseline `926adf8` against this branch. Medians, with ranges.

| | Baseline 926adf8 | This branch |
| --- | --- | --- |
| Site ready, mean of 4 | 11.67 s (9.8–13.1) | 11.62 s (9.5–13.1) |
| In after pressing on, mean of 4 | 14.31 s (12.5–15.8) | 14.37 s (12.3–15.9) |
| Entry: fps, p95 | 60.0, 17.2 ms | 60.1, 18.0 ms |
| Chair: fps, p95 | 60.1, 19.4 ms | 60.3, 17.1 ms |
| Shelf: fps, p95 | 60.2, 19.0 ms | 60.1, 16.9 ms |
| Website walk, entry → chair: fps | 38.1 (30–41.7) | 41.7 (30–41.9) |
| Game mode, standing: fps, p95 | – | 60.2, 17.0 ms |
| Game mode, walking (W held, turning): fps, p95 | – | 59.0 (53.9–60.2), 33.3 ms |
| Room draw calls, triangles (entry) | 45, 24.7 k | 36, 41.8 k |
| Shader programs | 27 | 28 |
| Geometries, textures | 46, 26 | 54, 30 |

- Loading is as before: the means are within 0.1 s.
- Every standing view holds 60 fps.
- Game mode walks at about 59 fps. Before fix 15 it was 45.
- Phase 3 adds no shader program.
- The website walk is no slower than on the baseline. It is slow on both
  sides (see "Open, Phase 3").
- The A/B is `ab.sh` with `ab-summary.cjs` (scratchpad).
  `interior-check` now also measures the website walk and game mode
  (`walk-chair`, `game-idle`, `game-walk`).
- The earlier A/B's reports are in `verification/interior/previous-ab-a7020ff/`.

### Open, Phase 3

- **Website-mode walks** ran at about 35–42 fps headless, on the published
  baseline as well. This is fixed after the tower; see "Website walks,
  smoother".
- **The floor's smoke marks stay visible in game mode, but do nothing**
  there (the sight replaces them). Should they fade while walking? For the
  user.
- **Movement feel is not yet tried by a person** with a real mouse and
  keyboard. The current values:
  - speed 1.5 m/s;
  - look 0.12° per pixel;
  - look up to 60° and down to 70°;
  - eye 1.7 m.
- **The door lantern's chain** hangs just inside the balustrade above the
  door. From the gallery it passes close by.

## The stair tower, enlarged outward (after Phase 3)

**Why.** The stair was too cramped to walk in first person.

- Its treads were 0.55 m wide, from 0.60 m from the axis to the wall at
  1.15 m.
- At 10° a step, each step was 0.10 to 0.20 m deep: nearly a ladder.

The user asked for the tower and the stair to grow outward, away from the
hall, and for the zone around them to be set right so it looks intended.

### Geometry

**`room-tower.js` (new).** It holds the tower's plan: the drum, the stair,
the stairwell and the lancets. `room-scene.js` builds the tower from it, the
walk plan keeps to it, and `architecture-check` tests it. The old corner's
coordinates (`turned`, `fromOld`, `tower.was/turn/scale`) are gone.

**The drum.**

- The inside radius is 1.70 m (was 1.15).
- The circle meets the chamber 0.1 m beyond the bay's outer corners (before,
  it ran through the bay's columns).
- Its centre moves out from 4.42 to 5.69 m from the hall's centre.
- It reaches 0.01 m into the hall (before: 0.73 m). The far wall stands
  7.7 m out (was 5.9).
- The wall stays clear of the bookshelf niche at 0° and the blind arch at
  −60° on either side. Both are recessed almost through their walls.

**The stair.**

| | Before | Now |
| --- | --- | --- |
| Tread width | 0.55 m | 1.0 m (0.70 m from the axis to the wall) |
| Angle per step | 10° | 13° |
| Step depth at the walking line (1.2 m out) | 0.10–0.20 m | 0.27 m |
| Step depth beside the handrail | – | 0.23 m |
| Sweep | 140° | 182° |
| Steps, rise | 14 × 0.19 m | unchanged (2.85 m, the gallery's floor) |

- With 2R + G at 0.65 m, it is an ordinary staircase's pitch.
- **It climbs as it always has.** It starts just inside the mouth on the
  right (as seen from the hall) and climbs clockwise round the back wall.
  - A mirrored version was tried, so that from the entry the middle of the
    flight would rise across the mouth. The user had it turned back
    (2026-10-10). In this direction the entry sees the top of the flight
    through the mouth.
  - The code takes either direction: a negative step mirrors it, and the
    step faces, the skirting, the upper floor's ring, the walk plan
    (`turn`) and the checks follow.
  - Walked again in this direction: up in 3.6 s, down in 3.4 s, the camera
    at least 0.25 m from anything solid; `first-person-check` passes.

**The upper floor.**

- It is now a ring round an open shaft (before: a floor with a hole over
  the flight).
- It runs from the landing round past the mouth, where it meets the gallery
  across the bay's wall, and on over the first three steps.
- It is open over the flight from the fourth step, which leaves 0.27 m over
  the eye under its edge, and over the shaft.
- A balustrade in the gallery's language runs along the shaft's edge and
  across the stairwell's edge: top and bottom rail, slim balusters, a
  bronze cap, a fascia under the edge. It is merged into the existing
  meshes, so it adds no draw call.

**The rest of the zone.**

- **The lancets.** The same three, over steps 4.2, 7.4 and 10.6; their
  sills step up with the treads.
- **The floor.** The substrate reaches the tower's far side.
- **The lamps.** The same 14 mosaic lamps, with the same glass, colours,
  shapes and pulse, hung anew:
  - eight down the open shaft from the roof, a slow spiral from 2.25 to
    5.75 m;
  - three from the handrail's posts 8, 10 and 12, just inside the rail;
  - two in the mouth under the gallery, at 2.35 and 2.45 m;
  - the jade source by the shaft over the top of the flight.
  - Wherever a visitor can walk beneath one, its foot hangs at least 0.3 m
    above their eye.
- **The lights.**
  - The tower's light hangs in the third lamp, halfway up the shaft. Its
    reach grows from 2.2 to 3.6 m and its intensity from 2.4 to 3.4.
  - The lancets' fill goes from 1.5 to 2.2, its reach from 3 to 4.4 m.
  - The green stairwell spot shines from beside the jade lamp onto the floor
    just inside the mouth (`portal-check`'s "above the landing, into the
    stairwell" still holds).
  - The upper floor's glow sits on the ring by the landing. The floor
    bounce lights the flight's middle from below. The green shafts fall
    from the jade lamp to the floor in the mouth.
- **The cloth's flight** follows the new spiral over its walking line, then
  rises up the shaft.
- **`chamber.beyond`** (the cloth's wall reaction) now covers the whole
  drum, not only the bay's width.

### Navigation and collision

**`studyRoom.walk`:**

- `tower` gains `shaft` (0.64 m) and `mouth` (`half` 0.93, `depth` 0.35).
- `stair` gains `turn` (+1: it climbs clockwise in plan, as now; −1 the
  other way) and `rail` (0.73).
  `step` is exported positive.
- `newel` is the carved post at the foot of the handrail.

**`first-person.js`:**

- **The tower.** It is the whole drum plus the passage through the mouth.
  Before, it was limited to the bay's width, which in the new drum would
  have blocked everything wider than the mouth.
- **On the flight.** A body keeps 0.26 m from the handrail and from the
  wall. Between them and either it is blocked, so a visitor never crosses
  the rail into the shaft, never walks into the wall, and never steps off
  the edge.
- **Below.** Never under the flight.
- **Above.** The ring, which also runs over the first steps; never over the
  stairwell or the shaft.
- **The newel post** is an obstacle.
- **The climb direction** comes from `turn`. `first-person-check` reads it
  too: it climbs looking 25° ahead along the walking line, and walks from
  the landing round the ring to the mouth.

### Verification

**A walking harness in game mode** (scratchpad `stairwalk.mjs`):

| Stretch | Result |
| --- | --- |
| Hall → foot of the stair | 2.9 s |
| Up to the landing | 4.0 s; the height rises evenly 0 → 2.85 m; no stops |
| Landing → round the ring → mouth → gallery | arrives on the gallery and stops at its balustrade |
| Back and down | 3.5 s |

**The camera's clearance** to anything solid was measured by rays in 17
directions from the eye, against every opaque mesh:

- at least 0.21 m, at the stairwell's edge under the ring;
- more than 0.3 m everywhere else.

That first point was 0.13 m until the stairwell was opened from the
fourth step instead of 3.6 steps.

**`first-person-check`** passes with the new tower, in the regression and
alone. It climbs from 0.2 to 2.81 m, then walks round the ring to the
gallery. The walked stair registers against the drawn treads within
0.1 m.

**`architecture-check`** passes, with new assertions that the stair is
climbable:

- the tower is outside the chamber;
- its radius is at least 1.6 m;
- the treads are about a metre wide;
- each step is 0.25–0.32 m deep at the walking line;
- 2R + G is 0.60–0.68 m;
- each step is at least 0.20 m deep beside the rail;
- the flight arrives at 2.85 m.

**Regression** (2026-10-10, mains power, 22 runs). 20 passed on the first
pass. The other two:

- **`lighting-check`** failed on the door's threshold (0.499 against 0.5).
  - The cause was not the light: the opening, the jambs and the reveal
    read the same to the last digit.
  - The floorboards' random tints came from one shared sequence, drawn after
    all the boards' lengths. The tower's larger floor has more boards, so
    every board's tint shifted, the threshold's too.
  - Each board's tint now follows from where it lies, so a change in one
    part of the floor never reshuffles the rest.
  - It then read 0.506 and passed. That is still close to the bar, as noted
    before.
- **`loading-gate-check`** hit Codex's known race (`continuedBy:
  pointerdown`). Alone it passed 1 run of 2.

**Performance.** The machine was slower than earlier in the day (it was
charging from 1 %); both versions walked at 46–49 fps in game mode, against
59 earlier. So the comparison that counts is within one run: before and
after the tower, interleaved, three cold loads each.

| | Before the tower (`7e83b86`) | After |
| --- | --- | --- |
| Entry | 57.2 fps | 58.1 fps |
| Chair | 60.3 fps | 60.2 fps |
| Shelf | 59.7 fps | 59.9 fps |
| Website walk, entry → chair | 27.1 fps | 30.7 fps |
| Game mode, standing | 60.2 fps | 60.2 fps |
| Game mode, walking | 46.1 fps | 48.6 fps |
| Room draw calls, triangles (entry) | 36, 41.8 k | 37, 43.4 k |
| Shader programs | 28 | 28 |

- The tower costs nothing measurable.
- The extra draw call is a part of the tower now in view from the entry.
  Its new parts are merged into existing meshes.
- In the four-round A/B against the published baseline, run the same
  evening, the site was ready at 13.5 s on this branch against 13.8 s on the
  baseline.

**Screenshots:** `verification/tower/shots/` with `sheet.html`. They show:

- from the entry;
- before the mouth;
- the foot of the stair;
- halfway up, twice;
- the landing;
- the ring and the shaft;
- toward the gallery;
- up the shaft;
- from the gallery into the tower.

### Exterior

The exterior's tower no longer matches the interior's. The interior's drum
is wider (1.70 m inside, plus a 0.35 m wall), and its centre stands 5.69 m
out from the chamber's centre, at −30°. Codex is not continuing: the
exterior is now Claude's to bring into line (2026-10-10).

### For visual review

- The view through the mouth from the entry, where the top of the flight
  shows.
- The open shaft with its spiral of lamps, from below and from the ring.
- The ring's balustrade, from the gallery.
- How dark the drum is at the bottom by the foot, as against the green-lit
  flight.

## Website walks, smoother (after the tower)

**The problem.** On every walk in website mode the main thread was full,
and style recalculation alone took about 60 % of it. The published baseline
behaved the same.

**The cause.** Variables that follow the eye were written on the portal's
plane (`#screen`), and each change restyled all 382 elements below it:

- `--view-pitch` and `--view-yaw`, from `portal-effects.js` on every
  frame as well as from `scene-camera.js`;
- five `--page-*`, on every frame;
- `--wall-front-cut`.

Only a few elements read them: the abyss, the aura's wisps, the reaction's
sparks, the impact's flares, the page and the well's two side walls.

**The fix.** Each variable is written where it is read, and only when it
changes:

- **`sceneCamera.facesEye(element[, on])`** (`scene-camera.js`).
  Whatever turns back to face the eye enrols itself, and the camera writes
  the pitch and yaw on it alone:
  - the abyss (`portal-depth.js`);
  - the reaction's layer and the impact's layers;
  - the aura's layer, only while it shows. Hidden, its 46 elements were
    still restyled.
- **The page** (`.portal-page`, 237 elements) is placed on itself
  (`portal-effects.js` `placePage`): its size, and a transform with its
  offset, lift and pitch. As variables on the plane, every frame restyled
  all of it.
- **The well's walls.** `--wall-front-cut` goes on the two side walls;
  `--well-depth` and `--water-depth` stay on the plane, set only when they
  change.
- **`portal.css`** keeps the same rules from the variables, as fallbacks
  before the first update.

**Measured headless, the same evening and the same machine state:**

| | Before | After |
| --- | --- | --- |
| Website walk, entry → chair | 24–34 fps | 42–50 fps |
| Website walk, entry → shelf | 33–40 fps | 50–53 fps |
| Style recalculation during a walk | 460–590 ms/s | 170–190 ms/s |
| Game mode, turning: style per frame | 5.2 ms | 2.6 ms |
| Game mode, walking straight: style per frame | 7.7 ms | 2.1 ms |

Script (the room's drawing and the portal's effects) now takes the most
time.

**Tests.**

- `orb-check` checked the old mechanism: that a page target's x landed as
  `--page-x-offset` on the plane. It now checks the page's own transform.
- The regression (22 runs) passed after that, `loading-gate-check`
  included.
- The page, the orb, the aura and the abyss look as before in
  `orb-check`'s screenshots (`.qa/orb-page.png`, `.qa/orb-idle.png`).

## Open, for the user or later

- **Exterior fit (now Claude's; Codex is not continuing).** The vault is taller near its springing
  than the exterior shows (see "Exterior fit"). The stair tower is now
  much wider and further out: inside radius 1.70 m, its centre 5.69 m from
  the chamber's centre at −30° (see "The stair tower, enlarged outward").
- **`lighting-check`'s threshold ratio** passes at about 0.51 against 0.5.
  A later lighting change near the door could tip it.
- **The second floor** (the gallery) is empty, as asked. Its walls above
  the gallery are plain.
- **Not seen on a real phone.** Portrait is emulated (390x844).
