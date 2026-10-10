/* First person in the study: looking all the way round, a centre sight, and
   two ways of moving that share one camera (scene-camera.js) and one room.

   Website mode (the default)
   - A drag on the room turns the view (mouse or touch). A press without a
     drag is still a click, so the smoke markers, the table, the chair and
     the nook take visitors where they lead.
   - Drags that start on the cloth, the portal's cards and pages, or any
     control keep doing what they did. While the portal is awake at the
     table the room does not turn at all.

   Game mode (optional, keyboard and mouse)
   - W A S D walk, camera-relative, easing in and out. The mouse looks
     round, under pointer lock.
   - The chamber's walls, columns, the table and the chair stop the
     visitor. The spiral stair climbs to the tower's upper floor and the
     gallery. Escape frees the mouse.
   - The sight takes the place of the pointer: the shelf's objects answer
     it, and E (or a click) at the table or the chair sits down.

   Also here: the hollow sight at the centre, the invitation to game mode
   once per visit, and the menu at the top right.

   Loaded by room-scene.js once the room exists; it reads the room's plan
   from studyRoom.walk. Scene coordinates (metres, the table at the origin)
   unless noted. */

const NAVIGABLE = ['ENTRY', 'SHELF_INSPECTION', 'FREE'];
// What a drag must not take over: the cloth, the portal's things and every
// control. The place buttons and the shelf's way back are not here: a drag
// on them turns the view, a click still goes.
const INTERACTIVE = 'a, input, textarea, select, [contenteditable], .table-cloth, .intro-indicator, .hand-card, .sub-card, .deck, .card, ' +
  '.desktop, .app-window, .theme-toggle, .wordmark-letter, .fp-ui, .dev-nav, .room-sound, ' +
  'button:not(.entry-target):not(.leave-shelf), [role="button"]:not(.entry-target), [role="dialog"]';
const TYPING = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

export function createFirstPerson({camera, room, reducedMotion}) {
  const doc = document, body = doc.body, root = doc.documentElement;
  const touchOnly = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const el = (tag, props = {}, children = []) => { const e = Object.assign(doc.createElement(tag), props); e.append(...children); return e; };
  const entered = () => !doc.getElementById('loadingGate') || root.dataset.siteEntered === 'yes';
  // While the portal wakes (script.js: from the cloth drawn off, table-covered
  // gone, until the orb has risen and the cards are out, intro-done) the
  // visitor stays in the seat, so game mode waits.
  const portalWaking = () => !body.classList.contains('table-covered') && !body.classList.contains('intro-done');
  let mode = 'website';

  // ---- The sight: a thin hollow ring at the centre, a word under it when
  // what it rests on can be used.
  const sightLabel = el('span', {className: 'fp-sight__label'});
  const sight = el('div', {className: 'fp-ui fp-sight', ariaHidden: 'true'}, [el('span', {className: 'fp-sight__ring'}), sightLabel]);
  body.append(sight);
  function setSight(active, label = '') {
    sight.classList.toggle('is-active', active);
    if (sightLabel.textContent !== label) sightLabel.textContent = label;
  }
  function showSight() {
    const on = entered() && (mode === 'game' || NAVIGABLE.includes(camera.navigation));
    sight.classList.toggle('is-shown', on);
  }
  function showControls() {
    menuButton.hidden = !entered();
  }

  // ---- Website mode: drag to look. A press on the room arms a drag; past a
  // few pixels it turns the view and swallows the click that would follow.
  const drag = {id: null, x: 0, y: 0, moved: false, swallow: false};
  const degreesPerPixel = () => camera.fov / innerHeight;
  const canLook = () => entered() && !camera.moving &&
    (NAVIGABLE.includes(camera.navigation) || (camera.navigation === 'SEATED' && body.classList.contains('table-covered')));
  addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag.id !== null || doc.pointerLockElement || !canLook()) return;
    if (event.target.closest?.(INTERACTIVE)) return;
    Object.assign(drag, {id: event.pointerId, x: event.clientX, y: event.clientY, moved: false});
  }, true);
  addEventListener('pointermove', event => {
    if (event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) { drag.moved = true; body.classList.add('fp-looking'); }
    drag.x = event.clientX; drag.y = event.clientY;
    // The room follows the hand: drag right and the view turns left.
    const k = degreesPerPixel();
    camera.lookBy(dx * k, dy * k);
  }, true);
  const endDrag = event => {
    if (event.pointerId !== drag.id) return;
    drag.swallow = drag.moved; drag.id = null;
    body.classList.remove('fp-looking');
    // The click that ends a drag is no click.
    if (drag.swallow) setTimeout(() => { drag.swallow = false; }, 0);
  };
  addEventListener('pointerup', endDrag, true);
  addEventListener('pointercancel', endDrag, true);
  addEventListener('click', event => { if (drag.swallow) { event.preventDefault(); event.stopPropagation(); drag.swallow = false; } }, true);

  // ---- Where the visitor may stand: the chamber's floor, the door's
  // passage, the tower's floor, the spiral stair, the tower's upper floor
  // and the gallery. floorAt(x, z, y) gives the floor's height there for a
  // visitor whose feet are at y, or null where they cannot be.
  const W = room.walk, R = .26, EYE = 1.7, step = .4;
  const toPlan = (x, z) => [x, z + W.forward];
  const wrap = a => a - 2 * Math.PI * Math.floor(a / (2 * Math.PI));
  // The flight: its height under a point (the line through its nosings, a
  // smooth ramp), or null off it. On it a body keeps clear of the handrail
  // and of the wall (BLOCKED between them and either): never across the rail
  // into the shaft, never into the wall, never off the edge.
  const BLOCKED = -1;
  // How far round the flight a plan angle lies from its foot, the way it climbs.
  const fromFoot = a => wrap((W.stair.turn ?? 1) * (W.stair.from - a));
  function stairAt(px, pz) {
    const qx = px - W.tower.x, qz = pz - W.tower.z, rho = Math.hypot(qx, qz);
    if (rho < W.stair.inner - .05 || rho > W.tower.r + .05) return null;
    const d = fromFoot(Math.atan2(qz, qx));
    if (d > W.stair.count * W.stair.step) return null;
    if (rho < W.stair.rail + R || rho > W.tower.r - R) return BLOCKED;
    return (d / W.stair.step + 1) * W.stair.rise;
  }
  // The tower: its round drum beyond the bay's inner face, and the passage
  // through the bay's wall (its mouth), a body's width (margin) from their
  // walls. Across the bay: along, out from the chamber's centre; u, across it.
  const towerBay = W.bays.find(b => b.kind === 'tower');
  const throughMouth = (px, pz) => {
    const along = px * towerBay.cos + pz * towerBay.sin, u = -px * towerBay.sin + pz * towerBay.cos;
    return {along, u, inMouth: Math.abs(u) < W.bayHalf};
  };
  const inDrum = (px, pz, margin) => Math.hypot(px - W.tower.x, pz - W.tower.z) < W.tower.r - margin;
  function inTower(px, pz, margin) {
    const {along, u} = throughMouth(px, pz);
    if (along < W.apothem - .05) return false;
    return inDrum(px, pz, margin) || (along < W.apothem + W.tower.mouth.depth + .15 && Math.abs(u) < W.tower.mouth.half - margin);
  }
  // Past the bay's inner face, within the bay or the drum: the tower's to decide.
  const towerZone = (px, pz) => {
    const {along, u} = throughMouth(px, pz);
    return along > W.apothem + .05 && (Math.abs(u) < W.bayHalf || inDrum(px, pz, -.4));
  };
  const clearOfColumns = (px, pz) => W.columns.every(([cx, cz]) => Math.hypot(px - cx, pz - cz) > W.column + R);
  function bayOf(px, pz) {
    let best = null, score = -Infinity;
    for (const b of W.bays) { const along = px * b.cos + pz * b.sin; if (along > score) { score = along; best = b; } }
    return best;
  }
  function ground(x, z) {
    const [px, pz] = toPlan(x, z);
    if (!clearOfColumns(px, pz)) return false;
    // The tower's floor, round the carved post at the foot of the handrail.
    if (towerZone(px, pz)) return inTower(px, pz, R) && Math.hypot(px - W.newel[0], pz - W.newel[1]) > .09 + R;
    for (const b of W.bays) {
      const along = px * b.cos + pz * b.sin, u = -px * b.sin + pz * b.cos;
      let limit = W.apothem - R;
      if (b.kind === 'door' && Math.abs(u) < b.halfWidth - R) limit = W.apothem + b.depth - .12;
      if (b.kind === 'tower' && Math.abs(u) < W.tower.mouth.half - R) limit = W.apothem + .05;
      if (along > limit) return false;
    }
    // The table, and the chair where it stands.
    if (Math.hypot(x, z) < W.table + R) return false;
    const chair = camera.chairPose;
    return Math.hypot(x - chair.x, z - chair.z) > .38 + R;
  }
  function upper(x, z) {
    const [px, pz] = toPlan(x, z), G = W.gallery;
    if (!clearOfColumns(px, pz)) return false;
    const {u: uTower} = throughMouth(px, pz);
    if (towerZone(px, pz)) {
      // The tower's upper floor: a ring round the open shaft (its balustrade
      // at the shaft's edge), not over the stairwell; open where the stair
      // arrives at its top.
      if (!inTower(px, pz, R)) return false;
      const qx = px - W.tower.x, qz = pz - W.tower.z, rho = Math.hypot(qx, qz), d = fromFoot(Math.atan2(qz, qx));
      if (rho < W.tower.shaft + R) return false;
      return !(d > W.well[0] - R / rho && d < W.well[1]);
    }
    // The gallery: from its balustrade to the wall, or in the tower's bay
    // on to the mouth's plane, where the tower's floor meets it.
    const b = bayOf(px, pz), along = px * b.cos + pz * b.sin;
    if (b.kind === 'window') return false;
    const outer = b.kind === 'tower' && Math.abs(uTower) < W.tower.mouth.half - R ? W.apothem + .05 : W.apothem - R;
    return along >= W.apothem - G.depth + .05 + R && along <= outer;
  }
  // On the flight its own height, if within a step of the feet. Below, the
  // floor, but never under the flight; above, the upper floor, which runs on
  // over the flight's first steps.
  function floorAt(x, z, y) {
    const [px, pz] = toPlan(x, z), stair = stairAt(px, pz);
    if (stair !== null && stair !== BLOCKED && Math.abs(stair - y) <= step) return stair;
    if (y < 1.4) return stair === null && ground(x, z) ? 0 : null;
    return upper(x, z) ? W.gallery.floor : null;
  }

  // ---- Game mode: the walker. Its own pose; each frame it moves, collides,
  // climbs, and hands the camera a free pose.
  const walker = {x: 0, z: 0, floor: 0, eye: EYE, yaw: 0, tilt: 0, vx: 0, vz: 0, phase: 0};
  const keys = new Set(), speed = 1.5;
  let loop = 0, last = 0, aim = null;
  function spawn() {
    const pose = camera.free ?? camera.enterFree();
    Object.assign(walker, {x: pose.x, z: pose.z, yaw: pose.yaw, tilt: Math.max(-60, Math.min(70, pose.tilt)), vx: 0, vz: 0, phase: 0});
    // On a floor the visitor can stand on: from the seat they stand up
    // beside the chair; anywhere no one could stand, they take the nearest
    // spot that is free, away from the table first (the chamber's middle
    // is the table, so never toward it).
    walker.floor = pose.y - EYE > 1.4 ? W.gallery.floor : 0;
    if (floorAt(walker.x, walker.z, walker.floor) === null) {
      const away = Math.atan2(walker.z, walker.x);
      search: for (let r = .1; r <= 2.01; r += .1) {
        for (let i = 0; i < 16; i++) {
          const a = away + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI / 8;
          const x = walker.x + r * Math.cos(a), z = walker.z + r * Math.sin(a);
          if (floorAt(x, z, walker.floor) !== null) { walker.x = x; walker.z = z; break search; }
        }
      }
    }
    walker.eye = walker.floor + EYE;
    camera.setFree({x: walker.x, y: walker.eye, z: walker.z, yaw: walker.yaw, tilt: walker.tilt});
  }
  function tick(now) {
    loop = requestAnimationFrame(tick);
    const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60;
    last = now;
    advance(dt);
  }
  // One step of the walker (exposed for the checks: firstPerson.advance).
  function advance(dt) {
    const typing = doc.activeElement?.closest?.(TYPING), paused = typing || menuOpen || popupOpen;
    const forward = paused ? 0 : (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
    const strafe = paused ? 0 : (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    const yaw = walker.yaw * Math.PI / 180, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let wx = forward * fx + strafe * rx, wz = forward * fz + strafe * rz;
    const length = Math.hypot(wx, wz);
    if (length > 0) { wx /= length; wz /= length; }
    // Easing in (about 0.15 s) and out (about 0.12 s).
    const k = 1 - Math.exp(-dt * (length > 0 ? 7 : 9));
    walker.vx += (wx * speed - walker.vx) * k; walker.vz += (wz * speed - walker.vz) * k;
    if (Math.hypot(walker.vx, walker.vz) < .01 && !length) walker.vx = walker.vz = 0;
    const nx = walker.x + walker.vx * dt, nz = walker.z + walker.vz * dt;
    // Slide along what stops it: the whole step, else the step turned a
    // little either way (along a round column or a slanting wall, shorter
    // the more it turns), else either half of it.
    const steps = [[nx, nz]], sx = walker.vx * dt, sz = walker.vz * dt;
    for (const turn of [.5, -.5, 1, -1]) {
      const c = Math.cos(turn), s = Math.sin(turn);
      steps.push([walker.x + (sx * c - sz * s) * c, walker.z + (sx * s + sz * c) * c]);
    }
    steps.push([nx, walker.z], [walker.x, nz]);
    for (const [x, z] of steps) {
      const floor = floorAt(x, z, walker.floor);
      if (floor === null) continue;
      const moved = Math.hypot(x - walker.x, z - walker.z);
      // Momentum follows the way it actually went.
      if (x !== nx || z !== nz) { const v = moved / dt; const l = moved || 1; walker.vx = (x - walker.x) / l * v; walker.vz = (z - walker.z) / l * v; }
      walker.x = x; walker.z = z; walker.floor = floor; walker.phase += moved;
      break;
    }
    // The eye follows the floor smoothly (the stair's steps, the landing);
    // walking, it rises and falls a little with each step.
    const moving = Math.hypot(walker.vx, walker.vz);
    const bob = reducedMotion() ? 0 : .022 * Math.min(1, moving / speed) * Math.sin(walker.phase * Math.PI * 2 / 1.5);
    walker.eye += (walker.floor + EYE - walker.eye) * (1 - Math.exp(-dt * 14));
    // The camera (and so the room) is redrawn only when the view changed.
    const pose = {x: walker.x, y: walker.eye + bob, z: walker.z, yaw: walker.yaw, tilt: walker.tilt}, f = camera.free;
    if (!f || Math.abs(f.x - pose.x) + Math.abs(f.y - pose.y) + Math.abs(f.z - pose.z) > 1e-4 || Math.abs(f.yaw - pose.yaw) + Math.abs(f.tilt - pose.tilt) > 1e-3)
      camera.setFree(pose);
    findAim();
  }
  // What the sight rests on: the table or the chair, near enough to sit at;
  // or one of the shelf's objects (room-scene.js raycasts from the centre).
  function findAim() {
    const yaw = walker.yaw * Math.PI / 180, tilt = walker.tilt * Math.PI / 180;
    const dir = [-Math.sin(yaw) * Math.cos(tilt), -Math.sin(tilt), -Math.cos(yaw) * Math.cos(tilt)];
    const eye = [walker.x, walker.eye, walker.z];
    const near = (point, radius, reach) => {
      const v = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]], along = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
      if (along < 0 || along > reach) return false;
      return Math.hypot(v[0] - dir[0] * along, v[1] - dir[1] * along, v[2] - dir[2] * along) < radius;
    };
    const chair = camera.chairPose;
    aim = walker.floor < 1 && (near([0, camera.tableHeight, 0], W.table, 3.2) || near([chair.x, .5, chair.z], .5, 3)) ? 'sit'
      : room.shelfHover() >= 0 ? 'shelf' : null;
    setSight(!!aim, aim === 'sit' ? 'Sett deg · E' : '');
  }
  function use() {
    if (mode !== 'game' || aim !== 'sit') return;
    setMode('website');
    camera.go('chair');
  }
  addEventListener('keydown', event => {
    if (mode !== 'game' || menuOpen || popupOpen || event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.(TYPING)) return;
    const key = {arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd'}[event.key.toLowerCase()] ?? event.key.toLowerCase();
    if ('wasd'.includes(key) && key.length === 1) { keys.add(key); event.preventDefault(); }
    if (key === 'e' && !event.repeat) use();
  });
  addEventListener('keyup', event => {
    const key = {arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd'}[event.key.toLowerCase()] ?? event.key.toLowerCase();
    keys.delete(key);
  });
  addEventListener('blur', () => keys.clear());
  // The mouse, under pointer lock: right turns right, up looks up.
  const lockTarget = doc.getElementById('roomCanvas') ?? body;
  addEventListener('mousemove', event => {
    if (mode !== 'game' || doc.pointerLockElement !== lockTarget) return;
    const k = .12;
    walker.yaw = ((walker.yaw - event.movementX * k) % 360 + 540) % 360 - 180;
    walker.tilt = Math.max(-60, Math.min(70, walker.tilt + event.movementY * k));
  });
  // Without pointer lock (refused, or Escape pressed) a drag still looks.
  // If the lock neither comes nor is refused (some browsers, or a headless
  // one), the hint shows after a moment all the same.
  let lockWait = 0;
  const lock = () => {
    if (mode !== 'game' || touchOnly) return;
    clearTimeout(lockWait);
    lockWait = setTimeout(() => { if (mode === 'game' && doc.pointerLockElement !== lockTarget && !menuOpen) hint.hidden = false; }, 1200);
    try {
      const result = lockTarget.requestPointerLock?.();
      result?.catch?.(error => {
        console.warn('First-person pointer lock request failed:', error);
        hint.textContent = 'Nettleseren tillot ikke musekontroll. Dra i rommet for å se deg rundt.';
        hint.hidden = false;
      });
    } catch (error) {
      console.warn('First-person pointer lock request failed:', error);
      hint.textContent = 'Nettleseren tillot ikke musekontroll. Dra i rommet for å se deg rundt.';
      hint.hidden = false;
    }
  };
  addEventListener('pointerdown', event => {
    if (mode !== 'game' || event.button !== 0 || event.target.closest?.(INTERACTIVE)) return;
    if (aim === 'sit') { use(); return; }
    if (doc.pointerLockElement === lockTarget) return;
    lock();
  });
  doc.addEventListener('pointerlockerror', () => {
    if (mode !== 'game') return;
    hint.textContent = 'Nettleseren tillot ikke musekontroll. Dra i rommet for å se deg rundt.';
    hint.hidden = false;
  });
  doc.addEventListener('pointerlockchange', () => {
    const locked = doc.pointerLockElement === lockTarget;
    body.classList.toggle('fp-locked', locked);
    hint.hidden = mode !== 'game' || locked || menuOpen;
  });
  // In game mode without the lock, the drag turns the walker's own view.
  const lookWalker = (dYaw, dPitch) => {
    walker.yaw = ((walker.yaw + dYaw) % 360 + 540) % 360 - 180;
    walker.tilt = Math.max(-60, Math.min(70, walker.tilt - dPitch));
  };

  // Switching keeps the visitor where they stand: into game mode from where
  // the view is; back to website mode standing free (FREE) right there, the
  // places' markers in view to go on from (script.js).
  function setMode(next) {
    if (next === mode) return;
    if (next === 'game' && (touchOnly || portalWaking())) return;
    mode = next;
    body.classList.toggle('game-mode', mode === 'game');
    if (mode === 'game') {
      spawn(); keys.clear(); last = 0; cancelAnimationFrame(loop); loop = requestAnimationFrame(tick);
      // The sight is the aim, with the mouse locked or not.
      room.aimCentre(true);
      lock();
    } else {
      cancelAnimationFrame(loop); loop = 0; keys.clear(); aim = null; setSight(false);
      if (doc.pointerLockElement) doc.exitPointerLock();
      room.aimCentre(false);
      hint.hidden = true;
      hint.textContent = 'Klikk i rommet for å styre med musa · Esc frigjør den';
    }
    showSight(); renderMenu();
    dispatchEvent(new CustomEvent('first-person-mode', {detail: {mode}}));
  }
  // In game mode a drag turns the walker, not the website mode's look.
  const lookBy = camera.lookBy;
  camera.lookBy = (dYaw, dPitch) => mode === 'game' ? lookWalker(dYaw, dPitch) : lookBy(dYaw, dPitch);

  // ---- From a free stand to a place. On the chamber's floor the visitor
  // walks there (scene-camera.js goes round the table). From the stair, the
  // tower or the gallery a walk would pass through floors and walls, so the
  // room's own magic carries them: a brief veil of mist, and they are there.
  const veil = el('div', {className: 'fp-veil', ariaHidden: 'true'});
  body.append(veil);
  const onChamberFloor = () => {
    const f = camera.free;
    if (!f) return true;
    // (In the tower: its drum or the passage through the mouth.)
    const [px, pz] = toPlan(f.x, f.z);
    return f.y < 2.5 && !towerZone(px, pz) && stairAt(px, pz) === null;
  };
  const go = camera.go;
  camera.go = (place, options = {}) => {
    if (!camera.free || options.instant || onChamberFloor()) return go(place, options);
    return new Promise(resolve => {
      veil.classList.add('is-on');
      setTimeout(() => go(place, {instant: true}).then(arrived => {
        requestAnimationFrame(() => veil.classList.remove('is-on'));
        resolve(arrived);
      }), reducedMotion() ? 60 : 280);
    });
  };

  // While the mouse is free in game mode: how to take it again.
  const hint = el('p', {className: 'fp-ui fp-hint', hidden: true, textContent: 'Klikk i rommet for å styre med musa · Esc frigjør den'});
  body.append(hint);

  // ---- The menu, top right beside the sound: the mode, and how to move.
  let menuOpen = false;
  const menuButton = el('button', {type: 'button', id: 'fpMenuButton', className: 'fp-ui fp-menu-button', ariaLabel: 'Meny: utforskning og styring', title: 'Meny'},
    [el('span', {className: 'fp-menu-button__glyph', ariaHidden: 'true'})]);
  menuButton.setAttribute('aria-haspopup', 'dialog'); menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-controls', 'fpMenu');
  const modeWebsite = el('button', {type: 'button', className: 'fp-mode', textContent: 'Nettsidemodus'});
  const modeGame = el('button', {type: 'button', className: 'fp-mode', textContent: 'Spillmodus'});
  const current = el('p', {className: 'fp-menu__current'});
  const help = el('div', {className: 'fp-menu__help'});
  const menu = el('div', {className: 'fp-ui fp-menu', id: 'fpMenu', hidden: true}, [
    el('h2', {className: 'fp-menu__title', id: 'fpMenuTitle', textContent: 'Utforsk rommet'}),
    el('div', {className: 'fp-modes', role: 'group', ariaLabel: 'Modus'}, [modeWebsite, modeGame]), current, help]);
  menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-labelledby', 'fpMenuTitle');
  body.append(menuButton, menu);
  const keycaps = () => el('span', {className: 'fp-keys', ariaHidden: 'true'}, [
    el('kbd', {textContent: 'W'}), el('span', {className: 'fp-keys__row'}, ['A', 'S', 'D'].map(k => el('kbd', {textContent: k})))]);
  function renderMenu() {
    modeWebsite.setAttribute('aria-pressed', String(mode === 'website'));
    modeGame.setAttribute('aria-pressed', String(mode === 'game'));
    modeGame.disabled = touchOnly || portalWaking();
    current.textContent = 'Aktiv: ' + (mode === 'game' ? 'spillmodus' : 'nettsidemodus');
    help.replaceChildren(...(mode === 'game' ? [
      el('div', {className: 'fp-menu__keys'}, [keycaps(), el('p', {textContent: 'Gå med W A S D, se deg rundt med musa.'})]),
      el('p', {textContent: 'Sikt på bordet og trykk E (eller klikk) for å sette deg. Esc frigjør musa.'})] : [
      el('p', {textContent: touchOnly ? 'Dra med fingeren for å se deg rundt.' : 'Dra i rommet for å se deg rundt.'}),
      el('p', {textContent: (touchOnly ? 'Trykk' : 'Klikk') + ' på de magiske røykmerkene, bordet eller hylla for å gå dit.'}),
      ...(touchOnly ? [el('p', {className: 'fp-menu__note', textContent: 'Spillmodus krever tastatur og mus.'})]
        : portalWaking() ? [el('p', {className: 'fp-menu__note', textContent: 'Spillmodus venter til portalen har våknet.'})] : [])]));
  }
  function openMenu(open) {
    menuOpen = open;
    menu.hidden = !open; menuButton.setAttribute('aria-expanded', String(open));
    // The hint gives way to the menu, and returns with the mouse still free.
    hint.hidden = open || mode !== 'game' || doc.pointerLockElement === lockTarget;
    if (open) { if (doc.pointerLockElement) doc.exitPointerLock(); renderMenu(); (mode === 'game' ? modeGame : modeWebsite).focus({preventScroll: true}); }
  }
  menuButton.addEventListener('click', () => openMenu(menu.hidden));
  modeWebsite.addEventListener('click', () => { setMode('website'); openMenu(false); menuButton.focus({preventScroll: true}); });
  modeGame.addEventListener('click', () => { openMenu(false); setMode('game'); });
  addEventListener('keydown', event => { if (event.key === 'Escape' && menuOpen) { openMenu(false); menuButton.focus({preventScroll: true}); } });
  addEventListener('pointerdown', event => { if (menuOpen && !event.target.closest('.fp-menu, .fp-menu-button')) openMenu(false); }, true);

  // ---- The invitation, once per visit, a moment after the visitor is in
  // (never over the loading gate or the way in). Not on touch-only devices,
  // which have no keys to walk with.
  let popupOpen = false, closeInvite = null;
  const seen = () => { try { return sessionStorage.getItem('fp-invited') === 'yes'; } catch { return false; } };
  function invite() {
    if (touchOnly || seen() || mode !== 'website' || !NAVIGABLE.includes(camera.navigation)) return;
    try { sessionStorage.setItem('fp-invited', 'yes'); } catch {}
    const yes = el('button', {type: 'button', className: 'fp-invite__yes', textContent: 'Aktiver spillmodus'});
    const no = el('button', {type: 'button', className: 'fp-invite__no', textContent: 'Fortsett i nettsidemodus'});
    const card = el('div', {className: 'fp-ui fp-invite'}, [
      el('h2', {className: 'fp-invite__title', id: 'fpInviteTitle', textContent: 'Vil du utforske fritt?'}),
      el('p', {className: 'fp-invite__text', id: 'fpInviteText', textContent: 'Aktiver spillmodus for å bevege deg rundt i rommet med tastaturet og musen.'}),
      keycaps(), el('div', {className: 'fp-invite__choices'}, [yes, no])]);
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-labelledby', 'fpInviteTitle'); card.setAttribute('aria-describedby', 'fpInviteText');
    const before = doc.activeElement;
    const close = choice => {
      popupOpen = false; closeInvite = null; card.classList.remove('is-shown');
      setTimeout(() => card.remove(), reducedMotion() ? 0 : 320);
      if (choice === 'game') setMode('game'); else before?.focus?.({preventScroll: true});
    };
    yes.addEventListener('click', () => close('game'));
    no.addEventListener('click', () => close('website'));
    card.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close('website'); } });
    body.append(card); popupOpen = true; closeInvite = close;
    requestAnimationFrame(() => { card.classList.add('is-shown'); yes.focus({preventScroll: true}); });
    firstPerson.invitation = card;
  }
  // If the visitor is on the move then, it waits until they stand still.
  let invitePending = false;
  const afterEntry = () => setTimeout(() => { invitePending = true; invite(); if (popupOpen || seen()) invitePending = false; }, 1400);
  if (entered()) afterEntry(); else addEventListener('site-entered', afterEntry, {once: true});

  // ---- Keeping the sight and the look in step with the room.
  addEventListener('room-navigation', ({detail: {state}}) => {
    showSight(); roomClass();
    if (invitePending && NAVIGABLE.includes(state)) setTimeout(() => { invite(); if (popupOpen || seen()) invitePending = false; }, 700);
    // Choosing a place past the invitation is choosing website mode.
    if (popupOpen && !NAVIGABLE.includes(state)) closeInvite?.('website');
    if (mode === 'website') setSight(false);
    // Leaving FREE by a walk ends game mode's hold on the camera.
    if (mode === 'game' && state !== 'FREE') setMode('website');
  });
  addEventListener('site-entered', showSight);
  addEventListener('site-entered', showControls);
  // Where the room can be turned by touch, the browser must not take the
  // gesture for a scroll: decided when the touch begins, so it is set ahead
  // (first-person.css: body.fp-room). Not while the portal is awake.
  const roomClass = () => { const on = canLook() || mode === 'game'; if (body.classList.contains('fp-room') !== on) body.classList.toggle('fp-room', on); };
  addEventListener('site-entered', roomClass);
  new MutationObserver(() => {
    roomClass();
    // The menu, if open, follows the portal waking and done.
    if (menuOpen && modeGame.disabled !== (touchOnly || portalWaking())) renderMenu();
  }).observe(body, {attributes: true, attributeFilter: ['class']});
  // In website mode the sight brightens over a place it would take the visitor to.
  addEventListener('scene-camera-change', () => {
    if (mode !== 'website' || !sight.classList.contains('is-shown')) return;
    const under = doc.elementsFromPoint(innerWidth / 2, innerHeight / 2).find(e => e.matches?.('.entry-target, .leave-shelf'));
    setSight(!!under && under.id !== 'leaveShelf');
  });
  showSight(); renderMenu();
  showControls(); roomClass();

  const firstPerson = {
    get mode() { return mode; }, setMode, floorAt, advance, keys,
    get walker() { return {...walker}; }, get aim() { return aim; }, invitation: null,
    openMenu, menu, menuButton,
  };
  window.firstPerson = firstPerson;
  return firstPerson;
}
