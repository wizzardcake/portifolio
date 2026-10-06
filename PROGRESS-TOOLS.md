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
