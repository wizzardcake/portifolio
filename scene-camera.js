/* One perspective definition for the architectural renderer and the existing
   CSS portal. World coordinates are metres: +Y up, +Z toward the seated viewer,
   the table centre at the origin. CSS portal coordinates are pixels: +Y toward
   the viewer, +Z above the table.
   The camera stands at named points, each an eye `position` and the point it
   looks at (`lookAt`): entry, seated and shelf. The camera is always on a
   leg between two of them ({from, to, progress 0..1}; see `durations`),
   straight unless it passes a control point (`via`). `approach` is derived
   from it: how far toward the seat (1 seated, 0 at the entry). Where the
   visitor is, by name, is the navigation state at the end of this file. */
(() => {
  const screen = document.getElementById('screen');
  const table = screen.querySelector('.portal-table');
  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const camera = {yaw: 0, pitch: 75};
  const radians = Math.PI / 180;
  const state = {camera, tableHeight: .46, fov: 72,
    leg: {from: 'entry', to: 'seated', progress: 1},
    // Entry: standing far back in the room, over two and a half times the
    // seat's distance from the table, a little right of its axis and turned
    // toward the study nook in the left wall: the chair and table anchor the
    // middle, the nook reads on the left, the window and the stair tower
    // beyond, the beams and walls receding overhead. It looks at the floor
    // between the table and the nook, a hair over the seat's 15 degrees down,
    // so the walk in only ever tilts toward the seat's view.
    // Portrait views are narrow, so they stand further back and turn further.
    entry: {
      wide: {position: [.75, 1.7, 4.3], lookAt: [-.95, 0, -1.8]},
      portrait: {position: [.7, 1.75, 5], lookAt: [-1.3, 0, -1.2]},
    },
    // Final seated POV: the eye of someone sitting in the chair centred in
    // front of the table (seat 0.42 m; the table is knee height), looking
    // `tilt` degrees down along the table's axis. Narrow viewports back away
    // until the real tabletop's front edge spans at most `fit` of the
    // viewport width.
    seated: {eye: 1.18, distance: 1.6, tilt: 15, fit: {wide: .94, portrait: .8}},
    // Shelf: standing square in front of the study nook, centred on it and
    // looking straight at its back wall (heading 90 degrees) from a standing
    // eye, a little down: the whole worktop seen from above, the shelf, the
    // arch with the walls and beams around it, and the mist gathered at its
    // foot. The table and the chair are behind and to the left. Portrait views
    // are narrow, so they stand further back to keep the nook's whole width.
    shelf: {
      wide: {position: [-.55, 1.8, -1.55], lookAt: [-2.85, 1.1, -1.55]},
      portrait: {position: [1, 1.8, -1.55], lookAt: [-2.85, 1.15, -1.55]},
    },
    // A leg that must go round something passes a control point: the eye is
    // drawn toward it on a smooth curve, while its heading blends between the
    // ends. Entry to shelf goes round the table's right, past the window and
    // the stair, and ends walking straight up to the nook. Shelf to seat goes
    // round the table toward the chair (its left in landscape, its right in
    // portrait, where the seat is behind the chair).
    via: {
      wide: {'entry>shelf': [2.7, 1.75, -1.7], 'shelf>seated': [-2.6, 1.5, .2]},
      portrait: {'entry>shelf': [2.1, 1.78, 1], 'shelf>seated': [2, 1.5, 1.2]},
    },
    // How a leg turns: its heading and tilt (and a look carried from the
    // start) follow its progress raised to the power `ease` (evenly along the
    // way unless set here), and `left` turns it the long way round, to the
    // left. From the shelf the eye keeps facing the chair as it walks round
    // the table toward it, then turns on, across the chair, into the seat's
    // view as it sits down, never faster than about 60 degrees a second: to
    // the left round the table's left in landscape, to the right round its
    // right in portrait.
    turn: {
      wide: {'shelf>seated': {ease: 1.5, left: true}},
      portrait: {'shelf>seated': {ease: 1.8}},
    },
    // At the shelf the view follows the pointer: a slight look round the
    // nook near the middle, turning progressively further toward either edge,
    // up to `yaw` degrees at the very edge (landscape needs about 75 to bring
    // the chair, about 100 degrees round from the nook, well into view), and
    // `pitch` degrees up or down. It follows like a spring (`stiffness`, per
    // second) that never turns faster than `speed` degrees a second, and goes
    // back to the nook when the pointer does. None under reduced motion or on
    // touch, like the rest of the standing life.
    look: {yaw: 75, slight: 4, from: .3, to: .95, pitch: 3, stiffness: 2.8, speed: 55},
    // The entry's quiet life, so the view never stands dead still: the
    // standing eye sways a little and leans toward the pointer. Metres and
    // degrees; none under reduced motion or on touch. The slow sway is
    // redrawn every frameMs (each step well under a pixel), a lean that is
    // still following the pointer every leanFrameMs.
    idle: {sway: [.02, .012], swayYaw: .3, lean: [.05, .025], leanYaw: .4, response: .45, frameMs: 66, leanFrameMs: 33},
  };
  const points = {};
  // A point's heading and tilt (degrees, rounded so a point on an exact
  // 15-degree line keeps exactly the portal's 75-degree pitch).
  const round = v => Math.round(v * 1e6) / 1e6;
  function aim({position: [x, y, z], lookAt: [tx, ty, tz]}) {
    const run = Math.hypot(tx - x, tz - z);
    return {position: [x, y, z], yaw: round(Math.atan2(x - tx, z - tz) / radians), tilt: round(Math.atan2(y - ty, run) / radians)};
  }
  // How far a leg's heading has turned at a progress (see `turn`).
  const heading = (name, progress, format) => {
    const turn = state.turn[format][name];
    return turn ? Math.pow(progress, turn.ease) : progress;
  };
  // A heading in (-180, 180], so the seat's is exactly 0 however it was reached.
  const wrap = degrees => degrees - 360 * Math.round(degrees / 360);
  // The standing life (sway, lean, the shelf's look), or what a walk carries
  // of it, applied on top of the path (see the driver). Metres and degrees.
  const offset = {x: 0, y: 0, yaw: 0, pitch: 0};
  function update() {
    const width = screen.clientWidth, height = screen.clientHeight;
    const units = Math.max(300, width / 2.06);
    const focal = innerHeight / (2 * Math.tan(state.fov * Math.PI / 360));
    const portrait = innerWidth < 900 && innerWidth < innerHeight;
    const format = portrait ? 'portrait' : 'wide', {seated} = state;
    const seatTilt = seated.tilt * radians;
    // Distance at which a tabletop front edge of `span` metres, `near` metres
    // in front of the table centre, fills `share` of the viewport width.
    const fitting = (span, near, share, eye) => near +
      (focal * span / (innerWidth * share) - (eye - state.tableHeight) * Math.sin(seatTilt)) / Math.cos(seatTilt);
    const framing = window.portalTable?.framing;
    const seatedDistance = Math.max(seated.distance, fitting((framing?.width ?? table.clientWidth) / units,
      (framing?.front ?? (table.offsetTop + table.clientHeight - height / 2)) / units, seated.fit[format], seated.eye));
    points.entry = state.entry[format]; points.shelf = state.shelf[format];
    // The seat looks along the table's axis, at the tabletop's height.
    points.seated = {position: [0, seated.eye, seatedDistance],
      lookAt: [0, state.tableHeight, seatedDistance - (seated.eye - state.tableHeight) / Math.tan(seatTilt)]};
    // A pose: where the eye is and how it is turned (k: how far the heading
    // has turned; the standing life on top), and the table centre in its
    // frame: right, up and depth (metres).
    const pose = (p, q, t, c, k = t) => {
      const mix = (a, b, w = t) => a + (b - a) * w;
      // Through a control point: a quadratic curve for the eye's position.
      const along = c ? i => (1 - t) * (1 - t) * p.position[i] + 2 * (1 - t) * t * c[i] + t * t * q.position[i]
        : i => mix(p.position[i], q.position[i]);
      const yawDeg = round(wrap(mix(p.yaw, q.yaw, k) + offset.yaw)), pitchDeg = round(90 - mix(p.tilt, q.tilt, k) + offset.pitch);
      const yaw = yawDeg * radians, tilt = Math.PI / 2 - pitchDeg * Math.PI / 180;
      // The sway moves the eye along its own right and up.
      const x = along(0) + offset.x * Math.cos(yaw);
      const eyeHeight = along(1) + offset.y;
      const distance = along(2) - offset.x * Math.sin(yaw);
      const dx = -x, dy = state.tableHeight - eyeHeight, dz = -distance;
      const sinY = Math.sin(yaw), cosY = Math.cos(yaw), sinT = Math.sin(tilt), cosT = Math.cos(tilt);
      return {yawDeg, pitchDeg, tilt, x, eyeHeight, distance,
        right: dx * cosY - dz * sinY, up: -dx * sinY * sinT + dy * cosT - dz * cosY * sinT,
        depth: -dx * sinY * cosT - dy * sinT - dz * cosY * cosT};
    };
    const anchorY = innerHeight * (portrait ? .60 : .54);
    // The lens's vertical shift. At the entry and the seat it keeps the table
    // centre at one height on screen (the original composition, also all the
    // way along the walk between them). The shelf, where the table is out of
    // view, takes no shift; legs to or from it blend the two.
    const anchored = p => anchorY - focal * (-p.up * units) / (p.depth * units);
    const {leg} = state, ends = [aim(points[leg.from]), aim(points[leg.to])], t = leg.progress, name = leg.from + '>' + leg.to;
    if (state.turn[format][name]?.left && ends[1].yaw < ends[0].yaw) ends[1].yaw += 360;
    const now = pose(ends[0], ends[1], t, state.via[format][name], heading(name, t, format));
    const lens = (name, end) => name === 'shelf' ? innerHeight / 2 : anchored(pose(end, end, 0));
    const originY = leg.from !== 'shelf' && leg.to !== 'shelf' ? anchored(now)
      : lens(leg.from, ends[0]) + (lens(leg.to, ends[1]) - lens(leg.from, ends[0])) * t;
    camera.yaw = now.yawDeg; camera.pitch = now.pitchDeg;
    const {tilt, x, eyeHeight, distance, depth} = now;
    const viewX = now.right * units, viewY = -now.up * units, viewDistance = depth * units;
    // CSS cannot project a table behind the eye; it is out of view there anyway.
    const behind = depth < .4;
    Object.assign(state, {width, height, units, tilt, focal, x, eyeHeight, distance, seatedDistance, viewX, viewY, viewDistance,
      originY, anchorY, format, appliedPitch: camera.pitch, elevation: eyeHeight - state.tableHeight,
      localEyeX: x * units, localEyeY: distance * units, localEyeZ: (eyeHeight - state.tableHeight) * units});
    for (const [key, value] of Object.entries({
      '--scene-focal': focal, '--scene-origin-y': originY,
      '--table-view-x': viewX, '--table-view-y': viewY, '--table-view-z': focal - viewDistance,
      '--table-leg-length': state.tableHeight * units
    })) root.style.setProperty(key, value + 'px');
    screen.style.setProperty('--view-pitch', camera.pitch + 'deg');
    screen.style.setProperty('--view-yaw', camera.yaw + 'deg');
    screen.classList.toggle('is-behind', behind);
    window.dispatchEvent(new Event('scene-camera-change'));
  }
  state.update = update;
  state.points = points;
  // How far toward the seat: the leg's progress on the way there, 1 seated.
  Object.defineProperty(state, 'approach', {enumerable: true, get() {
    const {from, to, progress} = state.leg;
    return to === 'seated' ? (from === 'seated' ? 1 : progress) : from === 'seated' ? 1 - progress : 0;
  }});
  state.setApproach = progress => state.setLeg('entry', 'seated', progress);
  state.setLeg = (from, to, progress = 0) => {
    state.leg = {from, to, progress: Math.max(0, Math.min(1, progress))};
    update();
  };
  // Where a world point (metres) lands in the viewport, in CSS pixels: the
  // same projection as the room's renderer and the CSS portal.
  state.project = (px, py, pz) => {
    const yaw = camera.yaw * radians, tilt = state.tilt;
    const dx = px - state.x, dy = py - state.eyeHeight, dz = pz - state.distance;
    const sinY = Math.sin(yaw), cosY = Math.cos(yaw), sinT = Math.sin(tilt), cosT = Math.cos(tilt);
    const right = dx * cosY - dz * sinY;
    const up = -dx * sinY * sinT + dy * cosT - dz * cosY * sinT;
    const depth = -dx * sinY * cosT - dy * sinT - dz * cosY * cosT;
    return {x: innerWidth / 2 + state.focal * right / depth, y: state.originY - state.focal * up / depth, depth};
  };
  // Convert a desired reader-facing viewport rectangle back into portal-local
  // coordinates, so the orb morph and HTML reader continue to share one target.
  state.reader = () => {
    const depth = state.focal * .14, scale = state.focal / (state.focal - depth);
    const y = (innerHeight * .35 - state.originY) / scale - state.viewY;
    const z = depth - (state.focal - state.viewDistance);
    const p = camera.pitch * Math.PI / 180;
    return {width: Math.min(1000,innerWidth*.88)/scale,
      height: Math.min(620,innerHeight*.56)/scale,
      y: y*Math.cos(p)+z*Math.sin(p), z: -y*Math.sin(p)+z*Math.cos(p)};
  };

  // ---- One driver for every camera movement: walking a path (smoothstep, as
  // the original walk in), the standing sway and lean, and the shelf's look.
  // It runs only while something moves; the idle life redraws at its own
  // slower pace, a turning look every frame.
  let move = null, idling = false, raf = 0, last = 0, drawn = 0, weight = 0;
  const pointer = {x: 0, y: 0}, lean = {x: 0, y: 0};
  // The shelf's look: degrees, and degrees a second.
  const look = {yaw: 0, pitch: 0, yawSpeed: 0, pitchSpeed: 0};
  const wake = () => { if (!raf) raf = requestAnimationFrame(drive); };
  // Leave the standing life behind at once (a jump, or a walk setting off).
  const settle = () => { weight = 0; Object.assign(look, {yaw: 0, pitch: 0, yawSpeed: 0, pitchSpeed: 0}); };
  // A critically damped spring toward goal, its speed capped.
  function follow(value, speed, goal, dt) {
    const {stiffness: w, speed: cap} = state.look;
    look[speed] = Math.max(-cap, Math.min(cap, look[speed] + (w * w * (goal - look[value]) - 2 * w * look[speed]) * dt));
    look[value] += look[speed] * dt;
  }
  function drive(now) {
    raf = 0;
    const dt = last ? Math.min(.1, (now - last) / 1000) : 0;
    last = now;
    const live = idling && !still.matches && !document.hidden;
    const {idle} = state, ease = response => 1 - Math.exp(-dt / response);
    // The idle life fades in where the visitor stands, and out once a walk starts.
    weight += ((live && !move ? 1 : 0) - weight) * ease(.6);
    lean.x += (pointer.x - lean.x) * ease(idle.response);
    lean.y += (pointer.y - lean.y) * ease(idle.response);
    // At the shelf the view turns toward the side the pointer is on (left is
    // a positive yaw), and a little up or down with it.
    const shelf = state.look, looking = live && !move && navigation === 'SHELF_INSPECTION';
    const side = Math.min(1, Math.abs(pointer.x)), v = Math.min(1, Math.max(0, (side - shelf.from) / (shelf.to - shelf.from)));
    const goal = looking ? -Math.sign(pointer.x) * (shelf.slight * side + (shelf.yaw - shelf.slight) * v * v * (3 - 2 * v)) : 0;
    follow('yaw', 'yawSpeed', goal, dt);
    follow('pitch', 'pitchSpeed', looking ? -shelf.pitch * pointer.y : 0, dt);
    const s = now / 1000, wave = (period, phase = 0) => Math.sin(s * 2 * Math.PI / period + phase);
    const standing = {
      x: weight * (idle.sway[0] * wave(11) + idle.lean[0] * lean.x),
      y: weight * (idle.sway[1] * wave(6.5, 1) - idle.lean[1] * lean.y),
      yaw: weight * (idle.swayYaw * wave(13, 2) - idle.leanYaw * lean.x) + look.yaw,
      pitch: look.pitch,
    };
    if (move) {
      // A walk takes the eye's offset along from where it set off, and lets it
      // go as the leg's heading turns toward the end's.
      if (move.start === null) { move.start = now; move.carry = {...offset}; settle(); }
      const t = Math.min(1, (now - move.start) / move.duration);
      const {leg} = state, name = leg.from + '>' + leg.to;
      leg.progress = move.from + (move.to - move.from) * t * t * (3 - 2 * t);
      const k = progress => heading(name, progress, state.format), k0 = k(move.from), k1 = k(move.to);
      const share = Math.abs(k0 - k1) > 1e-6 ? (k(leg.progress) - k1) / (k0 - k1) : 1 - t;
      for (const key in offset) offset[key] = move.carry[key] * share;
      update();
      if (t >= 1) { const {resolve} = move; move = null; resolve(true); }
    } else {
      Object.assign(offset, standing);
      const following = Math.abs(pointer.x - lean.x) + Math.abs(pointer.y - lean.y) > .02;
      const turning = Math.abs(look.yawSpeed) + Math.abs(look.pitchSpeed) > .05;
      if (turning || now - drawn > (following ? idle.leanFrameMs : idle.frameMs)) { drawn = now; update(); }
    }
    if (move || live || weight > .002 || Math.abs(look.yaw) + Math.abs(look.pitch) > .01) wake();
    else { settle(); for (const key in offset) offset[key] = 0; last = 0; update(); }
  }
  // Walk the current leg to `progress` (1 = its end) over `duration` ms;
  // resolves true on arrival, false if stopped or replaced.
  state.moveTo = (progress, duration) => new Promise(resolve => {
    move?.resolve(false);
    move = {from: state.leg.progress, to: Math.max(0, Math.min(1, progress)), start: null, duration, resolve};
    wake();
  });
  state.stop = () => { const stopped = move; move = null; stopped?.resolve(false); };
  Object.defineProperty(state, 'moving', {get: () => !!move});
  addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    pointer.x = event.clientX / innerWidth * 2 - 1; pointer.y = event.clientY / innerHeight * 2 - 1;
    if (idling) wake();
  }, {passive: true});
  root.addEventListener('pointerleave', () => { pointer.x = pointer.y = 0; });
  document.addEventListener('visibilitychange', wake);
  still.addEventListener('change', () => {
    // Reduced motion switched on: a walk arrives at once, a look is let go.
    if (still.matches && move) { const {to, resolve} = move; move = null; state.leg.progress = to; update(); resolve(true); }
    if (still.matches) settle();
    wake();
  });

  // ---- Where the visitor is: five named states over the points and legs.
  //   ENTRY             standing at the room's entry
  //   CHAIR_APPROACH    walking to the chair (from the entry or the shelf),
  //                     or from it back to the entry
  //   SEATED            in the chair: the table and the portal
  //   SHELF_APPROACH    walking to the shelf, or from it back to the entry
  //   SHELF_INSPECTION  standing at the shelf
  // go(place) walks to 'entry', 'chair' or 'shelf' along the legs; at once
  // under reduced motion or with {instant: true}, and then the new state
  // holds as soon as go() returns. It resolves true on arrival, false if
  // another go() took over. The idle life is on where the visitor stands
  // (entry, shelf). Each change is announced as a 'room-navigation' event,
  // detail {state, previous}.
  const arrival = {entry: 'ENTRY', chair: 'SEATED', shelf: 'SHELF_INSPECTION'};
  const pointOf = {entry: 'entry', chair: 'seated', shelf: 'shelf'};
  const approaching = {seated: 'CHAIR_APPROACH', shelf: 'SHELF_APPROACH'};
  // The legs, each walked either way, and their walking times for the whole
  // leg, ms: the walk in to the table keeps its original, slow pace; the
  // longer walks to and from the shelf (about 7 and 4 m) go at about a metre
  // a second.
  state.durations = {'entry>seated': 5400, 'entry>shelf': 6600, 'shelf>seated': 5200};
  // The leg between two points, as [from, to, the progress that reaches b].
  const between = (a, b) => state.durations[a + '>' + b] ? [a, b, 1] : state.durations[b + '>' + a] ? [b, a, 0] : null;
  let navigation = 'SEATED', journey = 0;
  function announce(next) {
    if (next === navigation) return;
    const previous = navigation;
    navigation = next;
    idling = next === 'ENTRY' || next === 'SHELF_INSPECTION';
    wake();
    dispatchEvent(new CustomEvent('room-navigation', {detail: {state: next, previous}}));
  }
  Object.defineProperty(state, 'navigation', {enumerable: true, get: () => navigation});
  state.go = (place, {instant = false} = {}) => {
    if (!Object.hasOwn(arrival, place)) throw new TypeError('sceneCamera.go: no place called ' + place);
    const id = ++journey, target = pointOf[place];
    state.stop();
    // The way there, as legs walked to one end ([from, to, progress]): from
    // mid-leg on to its end if that is the place, else back where it came
    // from; then straight there, or through the entry if no leg leads there.
    const {from, to, progress} = state.leg, steps = [];
    let here = progress >= 1 ? to : progress <= 0 ? from : null;
    if (!here) {
      const end = to === target ? 1 : 0;
      steps.push([from, to, end]);
      here = end ? to : from;
    }
    if (here !== target) steps.push(...(between(here, target) ? [between(here, target)] : [between(here, 'entry'), between('entry', target)]));
    const next = () => {
      if (id !== journey) return Promise.resolve(false);
      if (!steps.length) { announce(arrival[place]); return Promise.resolve(true); }
      const [a, b, end] = steps.shift(), on = state.leg.from === a && state.leg.to === b;
      const start = on ? state.leg.progress : 1 - end, span = Math.abs(end - start);
      if (instant || still.matches || span < 1e-6) {
        // A jump leaves the old place's sway and look behind (they fade in anew there).
        if (span >= 1e-6) { settle(); for (const key in offset) offset[key] = 0; }
        state.setLeg(a, b, end);
        return next();
      }
      if (!on) state.setLeg(a, b, start);
      // Named for where it leads, or, back to the entry, for where it comes from.
      const destination = end ? b : a;
      announce(approaching[destination] ?? approaching[destination === a ? b : a]);
      return state.moveTo(end, state.durations[a + '>' + b] * Math.max(.35, span)).then(arrived => arrived && next());
    };
    return next();
  };

  window.sceneCamera = state;
  new ResizeObserver(update).observe(screen);
  addEventListener('resize',update);
  update();
})();
