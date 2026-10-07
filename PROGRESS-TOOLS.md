# Shelf tools: takeover log

Worktree `verification/shelf-tools-worktree` (inside the main checkout's ignored
`verification/`), branch `feature/shelf-tools`, branched from `a89ed86`.

## Phase 1: What Codex left, and how good it is

### State on arrival

- **Nothing was committed.** `git status` shows five untracked files and no
  changes to tracked files:
  - `tools-shelf.js` (493 lines)
  - `tools-preview.html`
  - `TOOLS_INTEGRATION.md`
  - `TOOLS_VERIFICATION.md`
  - `tests/shelf-tools-check.mjs`
- **Codex's last edit was applied.** The file was last written at 00:09:41.
  Codex's "final" screenshots (00:09:53–00:10:17) and `report.json` (00:10:23)
  came after it, and the docs at 00:11. Both fixes it describes are in the
  code:
  - Duplicate arc endpoints are removed before extrusion (`enamelGeometry`).
  - The book's triangular corner guards point inward from the cover's
    corners.
- **Checks:** `node --check` passes for `tools-shelf.js`, the check script and
  the preview's inline module. `node tests/shelf-tools-check.mjs --round=v2check`
  passes in 19 s:
  - real mouse hover hits all three objects;
  - nothing moves under reduced motion, and no glyph sprites show;
  - every owned resource is disposed exactly once, and objects are detached;
  - no lights are created;
  - there are no console errors or warnings.

  Its output went to `verification/tools/attempt-v2check/`, so Codex's own
  `final/` was kept.
- **My verification:**
  - **The bevel seams** in oblique close-ups (`figma-closeup-oblique`) show no
    spikes, the blue disk included.
  - **The corner guards** in `grimoire-closeup-corner` lie on the cover and
    do not stick out.
  - **Shadow acne:** dark jagged bands on the tops of the blue and green
    pieces come from the preview's point-light shadow, not from the geometry.

### Screenshots (`verification/tools-v2/`, local and gitignored)

- All three: `all-idle`, `all-hover`.
- Each object: `figma-idle/-hover`, `grimoire-idle/-hover`,
  `crystal-idle/-hover`.
- Close-ups: `figma-closeup-oblique`, `figma-closeup-assembled`,
  `grimoire-closeup-corner`, `crystal-closeup`.
- Shelf height: `all-shelf-height`, the eye about 0.22 m above the target, at
  the preview's 38° FOV.
- Room-like: `all-room-fov` and `all-room-fov-hover`, at the room's 72° FOV
  and about 2.1 m, as from the frontal shelf view.

### Critique, per object

**Figma: real volume, but plastic, not enamel.**
- The pieces are properly 3D: crowned caps, smooth bevels, visible thickness
  from the side.
- They assemble on hover into an unmistakable Figma logo
  (`figma-closeup-assembled`).
- But every face has the same saturated colour and the same soft gloss. With
  no edge or depth variation they read as glossy toy plastic or candy, not
  fired enamel. **Codex's "too flat/glossy" is confirmed.**
- The stone and bronze pedestal is fine, but plain.

**Grimoire: believable, but too new and too printed.**
- The shape is good: thick boards, a solid page block, pages that rise from
  the gutter and fall to the fore-edge, layered page edges, a lectern and a
  bookmark.
- But the parchment is clean and the leather hardly shows. The glyphs are
  uniform, evenly spaced rows of identical strokes, like a symbol font: they
  read as printed, not written.
- The hover glyphs are seven flat `<>` chevron icons. Over the bright page
  some turn almost white. They look like UI icons, not magic.
- **Codex's "too pristine" is confirmed.**

**Crystal: marbled ball, not mist inside glass.**
- The mist sits on the sphere's surface as soft teal and violet patches,
  evenly sharp everywhere. There is no sense of depth or parallax, so it
  reads as a marble, as Codex noted.
- The glass shell is a barely visible ring, and the fresnel rim is weak. The
  highlight is a soft white blob. Inner glow is hardly present.
- The bronze base is crafted, but busy with wires.

**At room scale** (`all-room-fov`) each object is only about 70–100 px tall:
- bevels, parchment wear and bronze ornament disappear;
- the saturated Figma colours dominate, and the book and the ball sit quieter.

The detail is spent where it cannot be seen.

### Against the original brief

| Brief | Status |
| --- | --- |
| Figma pieces assemble on hover | Yes |
| Grimoire: curved pages | Yes |
| Grimoire: VS Code blue glyphs | Yes (`#007acc`) |
| Grimoire: rising glyphs on hover | Yes (7 sprites) |
| Crystal: mist | Yes, but reads as marbling |
| Crystal: fresnel rim | Yes, but weak |
| Crystal: faster swirl on hover | Yes (×3.1) |
| Returns `{group, update, setHover, dispose}` | Yes |
| No render loop of its own | Yes |
| Reduced motion respected | Yes (checked) |
| Fully procedural | Yes (geometry and canvas textures, no assets) |

### Cost, measured in the preview

Intrinsic geometry, independent of the preview's own lights:

| Object | Meshes | Draw calls | Triangles | Where they go |
| --- | --- | --- | --- | --- |
| Figma | 9 | 9 | 6,856 | 5 enamel pieces 4,936; bronze rings 800; 20 tick boxes 240 |
| Grimoire | 10 + 7 sprites | 17 | 11,935 | Page-edge hairline tubes 5,320; stand 2,764; boards 1,168; block 1,168 |
| Crystal | 6 | 6 | 11,730 | Bronze wire ornament 5,000; mist sphere 2,160; glass shell 2,160; 27 star spheres 810 |
| **Total** | | **32** | **30,521** | |

Other costs:
- **Materials:** 30. The grimoire alone has 16, seven of them sprite
  materials.
- **Textures:** four 512² canvas maps, among others.
- **Frame rate:** the preview runs at 57.7 fps with all three hovering
  (1440×1000, Iris Xe).
- **Room comparison:** the room draws 26 calls and 9,971 triangles. Its
  budget is 30 calls and 10,000 triangles.

## Phase 2: Performance budget

**Decided before polishing: at most about 8,200 triangles and 17 draw calls
for all three objects together.**

- **Why that size:** on the shelf in the room each object is 70–100 px tall.
  Detail below a few pixels cannot be seen, so it moves from geometry into
  textures and shaders.
- **The room's own budget is untouched.** That is 30 calls and 10,000
  triangles, with 9,971 used. With the objects, a frame that shows the shelf
  draws about 18k triangles and 43 calls.
- **Shadows:** every remaining mesh still casts, as before. The mist sphere
  casts one solid disc, as the old glass shell did.

| Object | Triangles before | Triangles after | Draw calls before | Draw calls after | Owned resources before | Owned resources after |
| --- | --- | --- | --- | --- | --- | --- |
| Figma | 6,856 | 3,016 | 9 | 6 | 18 | 14 |
| Grimoire | 11,935 | 2,439 | 17 | 7 | 33 | 20 |
| Crystal | 11,730 | 2,696 | 6 | 4 | 12 | 10 |
| **Total** | **30,521** | **8,151** | **32** | **17** | **63** | **44** |

Preview frame with all three hovering (Iris Xe, 1440×1000): 8,179 triangles
and 21 calls including the shelf and wall, at 60 fps. Before: 30,563
triangles, 36 calls and 57.7 fps.

### How

**Turned pieces (`turned()`).** A lathe whose finishes are painted along its
profile: colour, roughness and metalness maps, and bump only where there is
grain.
- **Figma's pedestal:** stone, two bronze bands, a dark dial and its twenty
  ticks were four meshes and are now one.
- **The crystal's base:** the patina, four bronze bands and twelve studs went
  from five meshes to one.

**Figma:**
- arcs are sampled at 11.25° steps instead of 4.5°;
- two bevel segments instead of three;
- 24 segments round instead of 40.

**Grimoire:**
- **Page edges as texture:** the 42 hairline tubes on the page edges (5,320
  triangles) are gone. Boards and block got edge strips with UVs of their
  own, and the leaves are painted on the block's edges as fine layers. This
  is finer and better than the tubes.
- **Fewer meshes:**
  - The two pages are one mesh with one material and a parchment atlas.
  - The spine joins the boards, and the stitches join the block.
  - The seven glyph sprites (seven draws) are one `Points` draw.

**Crystal:**
- **One sphere instead of two:**
  - The mist and the glass shell are now one sphere with one shader. The
    glass holds back a little of the mist and adds a faint veil.
  - Near the outline, where the eye would only pass through glass, the ball
    turns clear. That keeps the shell's thickness.
- **27 tiny "star" spheres** became pinpricks in the shader.
- **Half the swept wires,** and simpler claws and feet.

### Tradeoffs

- **Close-up silhouettes are a little polygonal:** Figma's arcs and the 32×18
  sphere. They are invisible at shelf distance and visible only in the
  preview's 0.4 m close-ups.
- **The crystal's mist** samples the same field at its new radius. It is the
  same kind of cloud, but its colours depend on how long it has swirled, so
  before and after shots taken at different moments differ in hue.
- **The glyph points** are sized from half the canvas height, not the camera
  lens. Their size in the room was not checked; Phase 3 redesigns them.

## Phase 3: Elevate, one object at a time

### Testing under the room's light

The preview got a **Room light** mode (`setLighting('room')`, `roomView()`):
- the nook's lamp exactly as `room-scene.js` hangs it: `#ffb468`, 11 cd,
  7.5 m, no shadow, about 0.62 m in front of the shelf and 6 cm above it;
- the room's own hemisphere and ambient;
- the nook's pale back wall close behind the shelf;
- the room's frontal shelf camera (72°).

What it showed (`verification/tools-v2/room-baseline/`):
- The lamp is strong at that distance. Saturated colours wash out to
  pastel.
- It hangs level with the shelf, so it never lights a top face. The
  Figma pedestal's dial went pitch black.

### Figma: champlevé enamel

**Enamel.** Each piece is now a brass blank whose face holds a cell of fired
glass. All of it is worked out in the shader from the face's own (x, y), so
it does not depend on tessellation:
- the distance to the outline gives a 1.3 mm brass lip and a meniscus
  groove where the glass meets it;
- the glass rises from the lip into a shallow cabochon (one smooth bowl,
  with no creases from the shape's inner ridges);
- thin glass by the lip is paler and the middle deeper;
- noise adds a slow swell, fine orange peel, light mottling and the odd
  fired-in speck;
- the glass's only gloss is its clear coat. A rough body gloss bloomed into
  a white face under the lamp.

**Colour.** Figma's colours are deepened (×0.24) to hold their saturation
under the lamp. Purple and blue lean bluer (`#8a4dff`, `#1a8cff`), or the
warm light turns them pink and teal. In studio light they read as deep jewel
tones.

**Geometry.**
- Slabs are thinner: 2.0 cm instead of 3.6 cm.
- Faces are flat. The cap is no longer subdivided; the shader gives the
  relief.
- The disc is sampled as finely as the D curves.
- Normals are smoothed round the bevel and the curves but stay crisp at
  sharp corners.
- The bevel's first ring keeps the face's normal, so there is no seam.

**Assembly.**
- Each piece is a damped spring, a little under critical (one 6 %
  overshoot). The overshoot tips the piece back a hair as it seats.
- On hover the pieces land row by row from the top, 85 ms apart, with the
  blue eye last.
- When the last is home, a narrow gleam runs down the logo's diagonal,
  mostly on the brass.
- Let go, they leave almost together.

**Float.**
- Apart, each piece drifts on two unrelated swells per axis, at its own
  depth, a little below its slot.
- Coming in, it squares up before it arrives and rises into place.
- A numeric test in the preview checks for interpenetration: 90 s idle, 6
  hover cycles and 120 random hover toggles, 4,311 samples, **0 contacts**.
  The first version grazed 2 mm, then 0.7 mm.

**Pedestal.** The nook's lamp cannot reach the top, so the dial lights from
within: a warm glow rising toward the centre, brighter on hover.

**Hover volume.** An unseen cylinder round the pieces (material not drawn:
no draw call, no shadow) catches the pointer between them. Before, pointing
at the cloud's middle missed, and the check's real-mouse test failed on it.

| Figma | Before | After |
| --- | --- | --- |
| Triangles drawn | 3,016 | 2,476 |
| Draw calls | 6 | 6 |
| Owned resources | 14 | 17 (glow map, hover volume) |

The hover volume's 48 triangles are never drawn.

**Verified:**
- Screenshots in `verification/tools-v2/`, all in both lights:
  - `figma-1` to `figma-5`;
  - `figma-sweep` and `figma-palette-1` (colour depth);
  - `figma-3-motion` and `figma-4-motion-studio` (assembly frames every
    0.15 s, gleam, release).
- The collision test passes.
- `node tests/shelf-tools-check.mjs --round=figma-enamel` passes:
  - hover hits all three;
  - reduced motion is static (the logo assembled, no gleam);
  - every resource is disposed once;
  - no lights, no console errors.

**Not verified:**
- How the motion feels in real time. I saw stills, not motion.
- How it looks in the actual room (only the preview's copy of its light).

**Weak points:**
- In studio light the purple and blue are dark.
- In the room the blue reads teal-blue, not Figma's cyan.
- The glowing dial is an invention: it is there because the room's lamp
  cannot light it.
