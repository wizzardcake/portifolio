/* One perspective definition for the architectural renderer and the existing
   CSS portal. World coordinates are metres: +Y up, +Z toward the seated viewer,
   the table centre at the origin. CSS portal coordinates are pixels: +Y toward
   the viewer, +Z above the table.
   The camera stands at named points, each an eye `position` and the point it
   looks at (`lookAt`): entry, seated and shelf. The camera is always on a
   leg from the entry to one of the others ({from, to, progress 0..1}),
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
    // the stair, and ends walking straight up to the nook.
    via: {
      wide: {'entry>shelf': [2.7, 1.75, -1.7]},
      portrait: {'entry>shelf': [2.1, 1.78, 1]},
    },
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
  // The entry's sway and lean, applied on top of the path (see the driver).
  const offset = {x: 0, y: 0, yaw: 0};
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
    // A pose: where the eye is and how it is turned (the sway on top), and
    // the table centre in its frame: right, up and depth (metres).
    const pose = (p, q, t, c) => {
      const mix = (a, b) => a + (b - a) * t;
      // Through a control point: a quadratic curve for the eye's position.
      const along = c ? i => (1 - t) * (1 - t) * p.position[i] + 2 * (1 - t) * t * c[i] + t * t * q.position[i]
        : i => mix(p.position[i], q.position[i]);
      const yawDeg = round(mix(p.yaw, q.yaw) + offset.yaw), pitchDeg = round(90 - mix(p.tilt, q.tilt));
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
    const {leg} = state, ends = [aim(points[leg.from]), aim(points[leg.to])], t = leg.progress, via = state.via[format];
    const now = pose(ends[0], ends[1], t, via[leg.from + '>' + leg.to] ?? via[leg.to + '>' + leg.from]);
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
  // the original walk in) and the entry's sway and lean. It runs only while
  // something moves; the idle life redraws at its own slower pace.
  let move = null, idling = false, raf = 0, last = 0, drawn = 0, weight = 0;
  const pointer = {x: 0, y: 0}, lean = {x: 0, y: 0};
  const wake = () => { if (!raf) raf = requestAnimationFrame(drive); };
  function drive(now) {
    raf = 0;
    const dt = last ? Math.min(.1, (now - last) / 1000) : 0;
    last = now;
    const live = idling && !still.matches && !document.hidden;
    const {idle} = state, ease = response => 1 - Math.exp(-dt / response);
    // The idle life fades in at the entry and out once the walk starts.
    weight += ((live && !move ? 1 : 0) - weight) * ease(.6);
    lean.x += (pointer.x - lean.x) * ease(idle.response);
    lean.y += (pointer.y - lean.y) * ease(idle.response);
    const s = now / 1000, wave = (period, phase = 0) => Math.sin(s * 2 * Math.PI / period + phase);
    offset.x = weight * (idle.sway[0] * wave(11) + idle.lean[0] * lean.x);
    offset.y = weight * (idle.sway[1] * wave(6.5, 1) - idle.lean[1] * lean.y);
    offset.yaw = weight * (idle.swayYaw * wave(13, 2) - idle.leanYaw * lean.x);
    if (move) {
      if (move.start === null) move.start = now;
      const t = Math.min(1, (now - move.start) / move.duration);
      state.leg.progress = move.from + (move.to - move.from) * t * t * (3 - 2 * t);
      update();
      if (t >= 1) { const {resolve} = move; move = null; resolve(true); }
    } else {
      const following = Math.abs(pointer.x - lean.x) + Math.abs(pointer.y - lean.y) > .02;
      if (now - drawn > (following ? idle.leanFrameMs : idle.frameMs)) { drawn = now; update(); }
    }
    if (move || live || weight > .002) wake();
    else { weight = 0; offset.x = offset.y = offset.yaw = 0; last = 0; update(); }
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
    // Reduced motion switched on mid-walk: arrive at once.
    if (still.matches && move) { const {to, resolve} = move; move = null; state.leg.progress = to; update(); resolve(true); }
    wake();
  });

  // ---- Where the visitor is: five named states over the points and legs.
  //   ENTRY             standing at the room's entry
  //   CHAIR_APPROACH    on the leg between the entry and the chair
  //   SEATED            in the chair: the table and the portal
  //   SHELF_APPROACH    on the leg between the entry and the shelf
  //   SHELF_INSPECTION  standing at the shelf
  // go(place) walks to 'entry', 'chair' or 'shelf' along the legs (through
  // the entry if need be); at once under reduced motion or with {instant:
  // true}, and then the new state holds as soon as go() returns. It resolves
  // true on arrival, false if another go() took over. The idle life is on
  // where the visitor stands (entry, shelf). Each change is announced as a
  // 'room-navigation' event, detail {state, previous}.
  const arrival = {entry: 'ENTRY', chair: 'SEATED', shelf: 'SHELF_INSPECTION'};
  const walking = {seated: 'CHAIR_APPROACH', shelf: 'SHELF_APPROACH'};
  const legOf = {chair: 'seated', shelf: 'shelf'};
  // Walking times for a whole leg, ms (the walk in keeps its original pace).
  state.durations = {seated: 5400, shelf: 4600};
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
    const id = ++journey, target = legOf[place];
    state.stop();
    // The way there, as [leg, progress] steps: off the wrong leg first (back
    // to the entry), then out along the place's own leg.
    const steps = [];
    if (state.leg.progress > 0 && state.leg.to !== target) steps.push([state.leg.to, 0]);
    if (target) steps.push([target, 1]);
    const next = () => {
      if (id !== journey) return Promise.resolve(false);
      if (!steps.length) { announce(arrival[place]); return Promise.resolve(true); }
      const [to, progress] = steps.shift(), from = state.leg.to === to ? state.leg.progress : 0;
      const span = Math.abs(progress - from);
      if (instant || still.matches || span < 1e-6) {
        // A jump leaves the old place's sway behind (it fades in anew there).
        if (span >= 1e-6) { weight = 0; offset.x = offset.y = offset.yaw = 0; }
        state.setLeg('entry', to, progress);
        return next();
      }
      if (state.leg.to !== to) state.setLeg('entry', to, from);
      announce(walking[to]);
      return state.moveTo(progress, state.durations[to] * Math.max(.35, span)).then(arrived => arrived && next());
    };
    return next();
  };

  window.sceneCamera = state;
  new ResizeObserver(update).observe(screen);
  addEventListener('resize',update);
  update();
})();
