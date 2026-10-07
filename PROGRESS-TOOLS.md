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

### Grimoire: written, not printed

**The writing.**
- A broad-nib pen is simulated on canvas. Each stroke is the nib's sweep at
  a fixed angle: thick across it, thin along it. It swells where the pen
  sets down and thins as it lifts. All sweeps are filled as one path, so
  overlaps never darken.
- The script is an invented cursive hand of 13 letters joined into words,
  with code's punctuation (`{ } ( ) = ; . / < >`) in the same hand.
- Each page is lines of code, nested by braces, with `//` comments in
  sepia between them and ragged right edges.
- Each dip of the quill starts dark and thins until the next.
- The left page opens with an illuminated initial: a blue brace on worn
  gold, with a red flourish down the margin.
- **Fixed:** the left page was mirrored before. Its writing read right to
  left.

**The parchment.**
- Warm in the middle, tanned toward every edge and shaded into the gutter.
- Fibres, foxing in clusters, a tide line, and the lower outer corner
  darkened by thumbs.
- Ruled by hand, faintly: margins and line guides that are never quite
  straight.
- The page block's edges are grimed toward the top and thumbed.
- The printed double-rule frame is gone.

**The leather.** The covers are worn blue leather:
- pebbled grain;
- wear that lightens and smooths toward the corners and outer edge (a
  roughness map);
- scuffs, and rubbed edges;
- a gilt fillet, broken where the gold has worn, just inside the edge.

**The binding.**
- The spine is open, as a book's back is when it lies open: a half round
  under the gutter that falls with it. The closed cylinder showed a lit
  disc toward the lamp.
- The sewing thread shows in the fold as four linen runs. Before, there
  were twelve dark dashes floating over the front of the gutter.

**Light and hover.**
- Idle, the ink breathes faintly along its lines.
- On hover it wakes in reading order, down the left page and then the
  right, with a bright crest at the line being read.
- The right page's fore-edge lifts a few millimetres, as if about to turn.
- Six words of the same hand lift from written spots, turn a little and
  fade (about 3.6 s each, one draw call). They are blended normally, so
  they stay blue over the nook's bright wall. Before, there were seven
  flat `<>` icons.
- The ink's glow is a deeper blue (`#3f93ff`). Under the lamp a pale glow
  had washed the writing out against the paper.

| Grimoire | Before | After |
| --- | --- | --- |
| Triangles | 2,439 | 2,307 |
| Draw calls | 7 | 7 |
| Owned resources | 20 | 21 (leather roughness map) |

**Verified:**
- Screenshots in `verification/tools-v2/`:
  - `grimoire-1` to `grimoire-6`, studio and room light;
  - `grimoire-4-motion` (the reading sweep and the lifted words, every
    0.3 s).
- `node tests/shelf-tools-check.mjs --round=grimoire-written` passes:
  - hover hits all three;
  - reduced motion is static, with no glyph points showing;
  - every resource is disposed once;
  - no lights, no console errors.

**Not verified:**
- The sweep and the lifting words in real time. I saw stills, not motion.
- The pen's look in browsers without canvas `filter`. Without it the
  ink's halo is simply absent.

**Weak points:**
- From the room's distance the writing is a blue texture, not text.
- The lifted words are small there.
- The parchment turns quite orange under both warm lights.

### Crystal: mist inside glass

**The mist.** The single sphere's shader is now marched as the room's orb
is (`portal-orb-material.js`), in its palette:
- teal `(.04,.34,.31)` and violet `(.24,.12,.50)` mist, with a teal-green
  heart `(.14,.82,.64)`;
- a teal↔violet glow gathered along the inner edge;
- dark teal glass.

**How it is marched.**
- The view refracts into the glass and crosses a mist sphere 10 %
  smaller than the ball, in ten steps.
- The mist's layers turn about the vertical at different rates. The mist
  absorbs light, while its veins (currents, only where a larger field lets
  them run), pockets and heart glow.
- What is near hides what is far, and the depth shifts with the eye: two
  views of the same instant from nearby angles differ inside, not only on
  the surface (`studio-closeup-a/-b`).
- Where the eye passes through glass alone, near the outline, the ball
  turns clear.
- The old shader was a surface pattern of three noise samples: a marble.

**Light.**
- The glints and the rim's wrap of light come from the scene's own lights
  (`lights: true`; point lights and hemisphere). The nook's lamp shows as a
  warm glint low on the lamp's side; the studio's key shows high on its
  side. The old glint was a fixed white blob.
- The interior is self-lit, so it looks the same under both lights.
  Checked at one instant in both (`crystal-ab`).
- Hover turns the mist three times as fast; the veins and the heart
  brighten.
- The unrolled light loop's body has a block of its own. three.js copies
  the body per light, and the first build failed on redefined locals.

**Cost.**
- Geometry is unchanged: 2,696 triangles, 4 draw calls.
- The fragment work is higher: ten steps of five noise lookups, only over
  the ball's pixels.
- The preview stays at 60 fps (see Phase 4).

**Verified:**
- Screenshots in `verification/tools-v2/`: `crystal-1`, `crystal-2` and
  `crystal-ab`, studio and room light, close-ups and the room's view.
- `node tests/shelf-tools-check.mjs --round=crystal-marched` passes.

**Not verified:**
- The swirl in real time. I saw stills.
- The full room's frame rate with the march.

**Weak points:**
- The base is unchanged and still a little busy with wires.
- At hover the heart can become one broad teal glow.

## Phase 4: Final verification

**Syntax.** `node --check` passes for `tools-shelf.js`, the check script and
the preview's inline module.

**The branch.** Against `a89ed86` it only adds files:
- the module;
- the preview;
- the check;
- the three docs.

The room's own checks were not rerun; nothing they test has changed.

**The check.** `node tests/shelf-tools-check.mjs` (into
`verification/tools/final/`) passes:
- real mouse hover hits all three;
- bounds fit the shelf;
- reduced motion is static, with no lifted words;
- every owned resource is disposed once;
- no lights are added;
- there are no browser errors or warnings.

**Leaks.**
- After all three are disposed, twice, the renderer drops from 22
  geometries, 14 textures and 22 programs to 4, 2 and 5.
- That is exactly what the preview's own shelf, wall and floor need
  (`verification/tools-v2/dispose/`).

**Frame time.** Milliseconds per frame past the 60 Hz cap: 120 frames with
`gl.finish()`, median of three runs, 1440 × 1000, Iris Xe.

| Scene | Codex `a82af40` | Budget `4c306c9` | Final |
| --- | --- | --- | --- |
| All three, studio, awake | 3.23 | 1.42 | 1.83 |
| Room view, nook's lamp, awake | 0.79 | 0.55 | 0.31 |
| Figma close | 1.47 | 0.81 | 1.17 |
| Grimoire close | 2.66 | 1.29 | 1.46 |
| Crystal filling the screen | 1.86 | 0.99 | 0.85 |

**Cost, Codex → final:**
- triangles in the frame, 30,563 → 7,507;
- draw calls, 36 → 21;
- owned resources, 63 → 48;
- the check's frame rate, 56.3 → 60 fps (the display's cap).

**A slip, repaired.**
- `--round=final` is the check's name for `verification/tools/final/`.
  My final run overwrote Codex's own final screenshots there; they were
  local and gitignored.
- I regenerated them unchanged from `a82af40` (its own code, preview and
  check) into `verification/tools/codex-a82af40/`, with a note.
- `final/` now holds the final verification. OneDrive's version history may
  still have the originals.

**Docs.** `TOOLS_INTEGRATION.md` and `TOOLS_VERIFICATION.md` now match the
final API, placement, footprints, lighting notes and costs. The placement
was re-checked against `room-scene.js`.

## After the report: Figma's own colours

The user asked for Figma's colours to come closer to the official ones.
- The pieces now use Figma's own five hexes (`#f24e1e`, `#ff7262`,
  `#a259ff`, `#1abcfe`, `#0acf83`).
- They are deepened to ×0.30. Before it was ×0.24, with the purple and blue
  shifted bluer.
- A fifth of each colour now glows from within (it was 9 %). That carries
  the hue under the warm lamp and lifts it under the studio lights.
- Two sweeps (`verification/tools-v2/figma-official/`, `figma-official-2/`)
  compared ×0.32 to ×0.55 and the glow mixes. ×0.42 and above wash out to
  pastel under the lamp.
- Result: `verification/tools-v2/figma-6-official/`.
- `node tests/shelf-tools-check.mjs --round=figma-official` passes.

## After the report: sound, with a corner toggle

The user said yes to sound, on one condition: a clear on/off icon in the
top right.

**The module.** `tools-sound.js` builds every sound with Web Audio; there
are no files. The factories take it as `options.sound`:

| Object | Sounds |
| --- | --- |
| Figma | Each piece rings a small glass tink as it lands: a rising pentatonic, G6 to E7, with the blue eye highest. A soft chord with the gleam. A breath of air when the pieces part. |
| Grimoire | A page stirs as it wakes and settles when it is let go: crinkled noise with crackles, each stir a little different. |
| Crystal | A low hum (a root, its fifth and a slightly sharp octave, on a slow tremolo, with moving air) swells and fades with hover. |

Under reduced motion, nothing that moves sounds.

**The toggle.** The preview has a round speaker icon in the top right
corner:
- off by default;
- `aria-pressed` and a state-and-action label;
- the choice remembered.

Audio starts only from a click. A remembered "on" waits for the first one.

**Verification.** I cannot hear, so:
1. **Offline.** Each sound and each real event sequence was rendered
   offline, from fresh copies of the objects with a recording stand-in for
   the engine, so the times are their own: tinks at 0.50, 0.60, 0.68, 0.75
   and 0.83 s, the gleam at 0.92 s.
2. **Levels.** Peaks run from −16 to −34 dBFS, with nothing clipped.
3. **The first rustle was too regular.** It was evenly spaced grains, a
   zipper rather than paper; it was rebuilt as crinkled noise. The two
   quietest cues (−40 and −52 dB) were lifted to about −31 and −34 dB.
4. **Live.** A real click on the icon gives a running context. Hovering
   gives 5 tinks, the chord, a part, a wake and a settle. A second click
   suspends the context.
5. **Clean.** The icon does not collide with anything at 390 px. There are
   no console errors or warnings. `node tests/shelf-tools-check.mjs
   --round=sound` passes.

**The evidence:**
- WAV files to listen to in `verification/tools-v2/sound-2/`, with
  `sound-strips.png` (waveform over spectrogram);
- the icon in `verification/tools-v2/sound-toggle/`.

**NOT audibly verified.** How the sounds actually sound, and how loud they
feel, is for the user's ears.

**On battery.** The laptop was on battery for this check: 49.5 fps, and
frame times roughly doubled in every scene, sound off. It is a power cap,
not the change; all scenes stay under 4 ms.
