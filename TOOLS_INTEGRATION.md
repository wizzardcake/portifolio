# Shelf tools integration

These notes are for the later room integration. The objects were built in the
isolated `feature/shelf-tools` worktree, branched from `a89ed86`:
- Codex built the first version.
- It was then assessed, cut to a budget and elevated; see
  `PROGRESS-TOOLS.md`.

No existing project file is edited. The objects are a preview only, not yet
in the room.

## Coordinates and contract

**The room.** It uses metres and local Three.js **0.160.0**.

**The shelf.** `room-scene.js` builds the nook's one shelf as
`block(.26,.035,nookW,room.left-nook.depth+.13,nook.shelf,nookZ)`:
- **2.08 m along Z, 0.26 m along X, 0.035 m thick.**
- In `shell` coordinates it spans X **−2.85…−2.59** and Z **−1.29…0.79**.
- Its upper surface is **Y = 1.4375**.
- `shell.position.z = −1.3` already applies the room's plan offset.
- The nook's arch leaves about **0.6 m** above the shelf where the objects
  stand.

**The contract.** Each factory returns
`{group, update(time, delta), setHover(boolean), dispose()}`.
- The base is at local Y = 0, front is +Z and width is X.
- Time and delta are in seconds. Delta advances an internal clock, capped at
  0.1 s so there is no jump after inactivity.
- No factory creates a light, a renderer, a camera or a loop.

**Options:** `{reducedMotion, camera}`.
- `reducedMotion` takes a boolean or a getter. Omitted, it reads the live OS
  media query.
- With reduced motion:
  - Figma's pieces stay assembled, with no gleam;
  - the pages stop and no words lift;
  - the mist stops.

  Hover still brightens: the pedestal's glow, the ink's light and the
  crystal's heart.
- Pass `camera` so Figma's assembled logo turns its face toward it in local
  yaw. This works when nested in a rotated parent too.

## Instantiate and place

Add this import to `room-scene.js` when integrating:

```js
import {createFigmaObject, createGrimoireObject, createCrystalBallObject} from './tools-shelf.js';
```

Inside `if (renderer)`, **after the existing `stillMotion` declaration and before
`pulse()`**, instantiate once:

```js
const shelfRoot = new THREE.Group();
shelfRoot.name = 'physical shelf tools';
shelfRoot.position.set(-2.72, 1.4375, -.25);
shelfRoot.rotation.y = Math.PI / 2; // local +Z faces into the room (+X)
shell.add(shelfRoot);             // do not subtract placement.forward again
const toolOptions = {camera, reducedMotion: () => stillMotion.matches};
const shelfTools = [createFigmaObject(toolOptions),
  createGrimoireObject(toolOptions), createCrystalBallObject(toolOptions)];
shelfTools.forEach((tool, i) => {
  tool.group.position.x = (i - 1) * .48;
  tool.group.userData.shelfToolIndex = i;
  shelfRoot.add(tool.group);
});
```

**Where they end up.**
- World centres:
  - Figma **(−2.72, 1.4375, −1.07)**;
  - the book **(−2.72, 1.4375, −1.55)**;
  - the crystal **(−2.72, 1.4375, −2.03)**.
- Keep scale 1.
- `group.userData.footprint` gives each object's measured envelope:

| Object | Width × depth × height | Notes |
| --- | --- | --- |
| Figma | 0.24 × 0.22 × 0.37 m | Pedestal 0.216 m across. The floating pieces reach 0.363 m and ±0.108 m (90 s of float and 120 random hovers, measured). |
| Grimoire | 0.30 × 0.20 × 0.17 m | Lifted words rise to about 0.26 m above the shelf; they are points, not meshes. |
| Crystal | 0.23 × 0.23 × 0.316 m | Feet reach 0.106 m from the centre. |

All bases fit the 26 cm shelf depth.

## Update and raycast in the existing host loop

Add this alongside the setup above.
- Listening on `window` in the capture phase allows hover through the
  existing entry/shelf navigation overlay. It changes no click behaviour.
- Only meshes take part, so the book's lifted words (points) never hold
  hover after the pointer leaves the book.
- Figma has an unseen hover volume round its floating pieces. Its material
  is not drawn (`visible: false` on the material, not the mesh), so it costs
  no draw call and casts no shadow, but this raycast still meets it. Hover
  then holds between the pieces as they drift.

```js
const shelfEvents = new AbortController();
const shelfPointer = new THREE.Vector2(4, 4), shelfRay = new THREE.Raycaster();
let shelfAt = 0, shelfShadowAt = 0, shelfAwakeUntil = 0, shelfHover = -1;
const wakeShelf = () => { shelfAwakeUntil = performance.now() + 1200; };
const clearShelfPointer = () => { shelfPointer.set(4, 4); wakeShelf(); };
addEventListener('pointermove', event => {
  const r = canvas.getBoundingClientRect();
  shelfPointer.set((event.clientX-r.left)/r.width*2-1,
    -(event.clientY-r.top)/r.height*2+1);
  wakeShelf();
}, {capture:true, signal:shelfEvents.signal});
addEventListener('blur', clearShelfPointer, {signal:shelfEvents.signal});
document.documentElement.addEventListener('pointerleave', clearShelfPointer,
  {signal:shelfEvents.signal});
addEventListener('scene-camera-change', wakeShelf, {signal:shelfEvents.signal});
stillMotion.addEventListener('change', wakeShelf, {signal:shelfEvents.signal});

function tickShelfTools(now) {
  if (document.hidden || lost || !host.classList.contains('is-ready')) {
    shelfAt = now; return;
  }
  if (now-shelfAt < 33) return;
  const dt = shelfAt ? Math.min((now-shelfAt)/1000, .1) : 1/30;
  shelfAt = now;
  shell.updateWorldMatrix(true, true);
  camera.updateWorldMatrix(true, false);
  shelfRay.setFromCamera(shelfPointer, camera);
  const hit = shelfRay.intersectObject(shelfRoot, true)
    .find(hit => hit.object.isMesh && hit.object.visible);
  let node = hit?.object;
  while (node && node.userData.shelfToolIndex === undefined) node = node.parent;
  const index = node?.userData.shelfToolIndex ?? -1;
  if (index !== shelfHover) {
    shelfHover = index;
    shelfTools.forEach((tool, i) => tool.setHover(i === index));
    wakeShelf();
  }
  if (stillMotion.matches && now > shelfAwakeUntil) return;
  shelfTools.forEach(tool => tool.update(now/1000, dt));
  const refreshShadows = now-shelfShadowAt > 125;
  if (refreshShadows) shelfShadowAt = now;
  invalidate(!refreshShadows); // full room redraw; shadow refresh capped at 8 Hz
}
```

Call **`tickShelfTools(now)` inside the existing `pulse(now)`, directly after its
`requestAnimationFrame(pulse)` and before its early-return conditions**.
- Do not create another loop.
- The room otherwise redraws only the night-window scissor and foreground.
  Calling `update()` alone will leave the shelf visually frozen. The host's
  existing `invalidate()` requests the required room render.

**Figma's timing needs a steady tick.** Its assembly runs on springs: each
piece lands about 85 ms after the last, and then a gleam crosses the logo.
At the 30 Hz tick above, the springs are stepped in 1/120 s substeps, so
they behave the same at any rate.

On host teardown:

```js
shelfEvents.abort();
shelfTools.forEach(t => t.dispose());
shelfRoot.removeFromParent();
```

- Disposal is idempotent. It does not touch the host's renderer, camera,
  lights, or Three.js's shared sprite quad.
- After disposing all three, the renderer's geometry, texture and program
  counts fall back to the host's own (checked in the preview).

## Lighting and materials

**Tuned for the nook's lamp.** The objects are tuned under the nook's own
lamp: `#ffb468`, 11 cd, 7.5 m, hung about 0.62 m in front of the shelf and
6 cm above it. The lamp is strong at that distance, and it never lights a
top face.
- Figma's enamel colours are deepened to hold their saturation there. Its
  purple and blue lean bluer, or the warm light turns them pink and teal.
- Its pedestal's dial glows from within, since the lamp cannot reach it.

**Figma's enamel** is a `MeshPhysicalMaterial` with a clear coat, extended
through `onBeforeCompile`. All five pieces share one compiled program.

**The crystal** is a `ShaderMaterial` with `lights: true`.
- Its glints and rim light come from the scene's own **point and
  hemisphere** lights, so the nook's lamp shows in the glass. Spot and
  directional lights do not glint on it.
- Its mist is self-lit.
- The lights' loop is unrolled per light by Three.js, so its cost grows a
  little with the room's point-light count.

## Cost

| | Triangles | Draw calls |
| --- | --- | --- |
| Figma | 2,476 | 6 |
| Grimoire | 2,307 | 7 (one is the lifted words) |
| Crystal | 2,696 | 4 |
| **Total** | **7,479** | **17** |

The figures exclude Figma's hover volume, which is never drawn. The room's
own budget, 30 calls and 10,000 triangles, is untouched.

**The crystal's shader** marches ten steps through the mist, but only over
the ball's pixels.

**Measured in the preview** (1440 × 1000, Iris Xe):
- All three awake: about 1.8 ms per frame.
- The crystal filling the screen: about 0.9 ms per frame.

Profile the combined room after integration. Preview timings do not predict
full-room FPS.

## Preview and verification

**Running the preview.** From this worktree, run
`node tests/shelf-tools-check.mjs --serve` and open the printed localhost
URL.
- Drag to orbit and use the wheel to zoom.
- Hover over each object, or use the controls:
  - inspection views;
  - **Hover all**;
  - **Room light**: the nook's lamp, the room's hemisphere and ambient, and
    the frontal shelf view at 72°;
  - **Reduce motion**.
- No downloads are needed.

**Running the checks.** `node tests/shelf-tools-check.mjs` runs the
automated Chrome/CDP screenshots and checks.
- Its default round writes to `verification/tools/final/`. Name other runs
  with `--round=<name>`.
- Override `CHROME_PATH` if Chrome is installed elsewhere.

See `TOOLS_VERIFICATION.md` for image paths, measurements and limitations.
