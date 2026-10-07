# Shelf tools verification

All visual work and checks use the isolated `feature/shelf-tools` worktree.
- No existing file was edited. Against `a89ed86`, the branch only adds
  files.
- `verification/` is gitignored.
- The full history is in `PROGRESS-TOOLS.md`. This file is the evidence.

## What was built

**Figma: champlevé enamel.**
- Five brass blanks hold fired glass in Figma's own five colours, deepened
  for the nook's lamp, with a little of each colour glowing from within.
- The shader works from each face's own (x, y): a brass lip, the meniscus,
  a shallow cabochon, thin pale glass by the lip, swell, orange peel,
  mottling and specks, all under one clear coat.
- Apart, the pieces float at their own depths.
- On hover they land row by row on damped springs, the blue eye last, and a
  gleam crosses the logo.
- They sit on a turned stone pedestal whose dial glows from within. An
  unseen hover volume holds hover between the pieces.

**Grimoire: written by a quill.**
- An invented cursive hand, drawn with a simulated broad nib, writes lines
  of code nested by braces, with sepia comments and an illuminated initial.
- The parchment is aged, foxed, thumbed and ruled by hand.
- The book is bound in worn blue leather with a broken gilt fillet, an open
  spine, and the thread in the fold, on a walnut lectern.
- On hover the ink wakes in reading order and six words of the hand lift
  and fade.

**Crystal: mist inside glass.**
- It is marched as the room's orb is, in its palette.
- The view refracts into a turning mist that absorbs, while its veins,
  pockets and teal heart glow.
- The glints and the rim's light come from the scene's own lights.
- The bronze base is unchanged.

No downloaded models, textures or fonts are used, and the factories add no
lights.

## History of the passes

1. **Codex:**
   - `verification/tools/attempt-1/` and `attempt-2/` are its first two
     passes.
   - Its own final pass, `final/`, was later overwritten by mistake: a
     check run used `--round=final`. It was regenerated unchanged from
     commit `a82af40` (its own code, preview and check) into
     `verification/tools/codex-a82af40/`. See `REGENERATED.txt` there.
2. **Assessment.** `verification/tools-v2/`, top level: Codex's state on
   arrival, from close and at room distance.
3. **Budget.** `verification/tools-v2/budget-*/` and `verification/tools/
   attempt-budget-*/`. The cost fell from 30,521 triangles and 32 draw
   calls to 8,151 and 17.
4. **Elevation.** Each object was shot under the studio lights and under
   the nook's own lamp (the preview's **Room light**):
   - `verification/tools-v2/room-baseline/`: before;
   - `figma-1` to `figma-5`, `figma-sweep`, `figma-palette-1` and the
     `figma-*-motion` frame strips;
   - `grimoire-1` to `grimoire-6`, and `grimoire-4-motion`;
   - `crystal-1`, `crystal-2` and `crystal-ab` (one instant under both
     lights).

   Each object's check run is in `verification/tools/attempt-figma-enamel/`,
   `attempt-grimoire-written/` and `attempt-crystal-marched/`.

## Final evidence

All paths are relative to this worktree, and local:
- `verification/tools/final/`: the final run of
  `node tests/shelf-tools-check.mjs`. It holds idle, hover and side views
  of all three, reduced motion, and `report.json`.
- `verification/tools-v2/perf-a82af40/`, `perf-4c306c9/` and `perf-final/`:
  the frames timed below.
- `verification/tools-v2/dispose/`: the leak check below.

**Syntax.** `node --check` passes for `tools-shelf.js`,
`tests/shelf-tools-check.mjs` and the preview's inline module.

**The final check run** compiles every shader with no browser errors or
warnings, and verifies:
- real mouse raycasts hit all three objects;
- shelf bounds;
- under the OS reduced-motion setting, no geometry or phase changes and no
  lifted words show;
- every owned GPU resource is disposed exactly once;
- no lights are added.

**Leaks.** After all three objects are disposed, twice, the renderer's
counts fall to the preview's own:
- geometries 22 → 4;
- textures 14 → 2;
- programs 22 → 5.

**Figma's float.** It was tested for interpenetration over 90 s idle, 6
hover cycles and 120 random hover toggles: 4,311 samples, 0 contacts.

## Measurements

**Setup.** 1440 × 1000, DPR 1, headless Chrome, Intel Iris Xe (ANGLE D3D11),
on mains power. The preview scene includes its shelf, wall, floor and one
shadow-casting key light.

**Frame rate.** At the 60 Hz display cap, the check's "all awake" view runs
at 60 fps. Codex's version ran at 56.3.

**Method for frame time.** Past the cap:
- 120 frames are rendered back to back, updating the objects each time;
- `gl.finish()` waits for the GPU;
- the median of three runs is taken, in milliseconds per frame.

| Scene | Codex `a82af40` | Budget `4c306c9` | Final |
| --- | --- | --- | --- |
| All three, studio, awake | 3.23 | 1.42 | 1.83 |
| Room view, nook's lamp, awake | 0.79 | 0.55 | 0.31 |
| Figma close, awake | 1.47 | 0.81 | 1.17 |
| Grimoire close, awake | 2.66 | 1.29 | 1.46 |
| Crystal filling the screen, awake | 1.86 | 0.99 | 0.85 |

Triangles and draw calls in that frame:

| | Codex | Final |
| --- | --- | --- |
| Triangles | 30,563 | 7,507 |
| Draw calls | 36 | 21 |
| Owned resources | 63 | 48 |

Run-to-run noise is about ±0.3 ms. These are local preview measurements,
not a whole-room or mobile benchmark.

## Sound

All sounds are Web Audio, built when they play; there are no files. The
icon in the top right corner turns them on and off; they start off.

**Offline.** Each sound, and each object's real event sequence, rendered
offline:
- WAV files and `sound-strips.png` (waveform over spectrogram) are in
  `verification/tools-v2/sound-2/`;
- peaks run from −16 to −34 dBFS;
- nothing clips.

**Live.** A real click turns the audio context on. Hovering all three
counts the expected cues, and a second click suspends the context. The
icon in both states is in `verification/tools-v2/sound-toggle/`.

**NOT audibly verified:** I cannot hear them.

## Limits

- **Room light.** The preview copies the nook's lamp, hemisphere and
  ambient, not the room itself. The objects have not been seen in the
  actual room.
- **Motion** was judged from frame strips, not watched in real time.
- **Room light.** Under the warm lamp Figma's purple reads pink-violet and
  its blue a pale cyan; the hues are Figma's own, the light is warm.
- **Room distance.**
  - The book's writing reads as a blue texture, not text.
  - Its lifted words are small.
- **The crystal's base** is still a little busy with wires.
