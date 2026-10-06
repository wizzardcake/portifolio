# Shelf tools integration

Built in the isolated `feature/shelf-tools` worktree from `a89ed86`. No existing
project files were edited. Instructions below are for the later room integration.

## Coordinates and contract

The room uses metres and local Three.js **0.160.0**. The shelf is **2.08 m along Z,
0.26 m along X, 0.035 m thick**. In `shell` coordinates it spans X **−2.85…−2.59**,
Z **−1.29…0.79**; its upper surface is **Y = 1.4375**. `shell.position.z = −1.3`
already applies the room's plan offset. The lower worktop is 2.08 × 0.52 m, top Y = .74.

Each factory returns `{group, update(time, delta), setHover(boolean), dispose()}`.
The base is at local Y = 0, front is +Z, width is X. Time and delta are seconds;
delta advances an internal clock, capped at .1 s to avoid jumps after inactivity.
`reducedMotion` accepts a boolean or getter; omitted, it reads the live OS media
query. With reduced motion the pieces stay assembled, pages and mist stop, and
particles are hidden. Hover brightness still eases. Pass `camera` for Figma's
camera-facing yaw (including when nested in a rotated parent).

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

World centres become Figma **(−2.72, 1.4375, −1.07)**, book **(−2.72, 1.4375,
−1.55)** and crystal **(−2.72, 1.4375, −2.03)**. Keep scale 1. All bases fit the
26 cm shelf depth; the book is 30 cm wide and the other bases about 21–22 cm.

## Update and raycast in the existing host loop

Add this alongside the setup above. Listening on `window` in capture phase
allows hover through the existing entry/shelf navigation overlay. It changes
no click behavior. Only physical meshes participate, so rising glyph sprites
do not hold hover after the pointer leaves the book.

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
`requestAnimationFrame(pulse)` and before its early-return conditions**. Do not
create another loop. The room otherwise redraws only the night-window scissor
and foreground; calling `update()` alone will leave the shelf visually frozen.
The host's existing `invalidate()` requests the required room render. Profile
the combined room after integration; preview FPS does not predict full-room FPS.

On host teardown: `shelfEvents.abort(); shelfTools.forEach(t => t.dispose());
shelfRoot.removeFromParent();`. Disposal is idempotent and does not touch the
host's renderer, camera, lights, or Three.js's shared sprite quad.

## Preview and verification

From this worktree run `node tests/shelf-tools-check.mjs --serve` and open the
printed localhost URL. Drag to orbit, wheel to zoom, hover over each artifact,
or use the inspection/hover/reduced-motion controls. No downloads are needed.
Run `node tests/shelf-tools-check.mjs` for automated Chrome/CDP screenshots and
checks. Override `CHROME_PATH` if Chrome is installed elsewhere. See
`TOOLS_VERIFICATION.md` for image paths, measurements and limitations.
