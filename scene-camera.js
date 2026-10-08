/* One perspective definition for the architectural renderer and the existing
   CSS portal. World coordinates are metres: +Y up, +Z toward the seated viewer,
   the table centre at the origin. CSS portal coordinates are pixels: +Y toward
   the viewer, +Z above the table.
   The camera stands at named points, each an eye `position` and the point it
   looks at (`lookAt`): entry, seated and shelf. The camera is always on a
   leg between two of them ({from, to, progress 0..1}: the share of the
   leg's walking time; see `durations`), walking the ways the smoke draws on
   the floor (`paths`). `approach` is derived from it: how far toward the
   seat (1 seated, 0 at the entry). `chairPose` is where the chair stands.
   Where the visitor is, by name, is the navigation state at the end of this
   file. */
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
    // The ways through the room, which the smoke on the floor draws
    // (room-scene.js) and the camera walks. [x, z], metres.
    // - `trunk`: one trail from inside the doorway behind the entry (seen only
    //   by turning round), past the entry, down the table's left side to where
    //   the visitor stands at the shelf, and on into the nook. Past the fork
    //   it runs on almost straight and only then bends, gradually, round the
    //   table: the main flow.
    // - `fork`: the trunk point where a branch leaves for the chair. The
    //   branch peels off to the right in a widening curve, not a Y, and ends
    //   (`branch`) where the visitor stands beside the chair.
    // - `chair`: [x, z, heading in degrees]. It stands beside the table, at
    //   its side toward the door and the right, turned to face it: set for
    //   someone to sit at the table (the user's layout drawing).
    // Sitting down draws it round to the middle of the table's front, square
    // to it, while the eye comes over it through `sit` into the seat.
    paths: {
      trunk: [[.8, 6.9], [.78, 5.7], [.72, 4.6], [.66, 3.95], [.55, 3.45], [.43, 2.9], [.26, 2.32], [-.1, 1.78],
        [-.66, 1.2], [-1.18, .62], [-1.45, -.3], [-1.1, -1.1], [-.62, -1.48], [-1.15, -1.66], [-1.75, -1.62], [-2.15, -1.55]],
      fork: 4,
      branch: [[.55, 3.08], [.78, 2.6], [1.05, 2.05], [1.18, 1.5]],
      sit: [.55, 1.92],
      chair: [1.14, .64, 56],
    },
    // Walking pace along the ways, and the slower settling into the seat,
    // metres a second; how far ahead along the way the eye looks while
    // walking, and over how many metres it turns from the view it set off
    // with (`leave`) and into the view it arrives at (`arrive`); `drawn`:
    // per leg, from how many metres before the walk's end to how many the eye
    // turns toward where it is going (from the shelf a little sooner, along
    // the trunk's way back); `down`: how many degrees further down it
    // looks at the chair as it reaches it.
    pace: {walk: 1.1, sit: .6, ahead: 1.1, leave: 1.2, arrive: 2.2, drawn: {'entry>shelf': [3.5, 1], 'entry>seated': [3.5, 1], 'shelf>seated': [6.5, 3.5]}, down: 24},
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
  // A heading in (-180, 180], so the seat's is exactly 0 however it was reached.
  const wrap = degrees => degrees - 360 * Math.round(degrees / 360);
  const smooth = (from, to, v) => { const t = Math.min(1, Math.max(0, (v - from) / (to - from))); return t * t * (3 - 2 * t); };
  // From heading a toward b, the short way round, by w.
  const turnToward = (a, b, w) => a + wrap(b - a) * w;

  // ---- A leg's way: a smooth curve from one point's eye along the trails
  // (`paths`) to the other's. It takes the trunk's points between them; to
  // the seat, it takes the trunk to the fork, the branch, and the settle into
  // the seat. Built once for everything it is made from: the leg, the
  // format, both ends' points, the paths and the pace, so a point tuned live
  // (sceneCamera.shelf.wide = ...) takes effect. at(progress) gives the eye
  // and its heading and tilt:
  // - the eye stays at standing height until the settle, then sinks into
  //   the seat;
  // - the eye looks `ahead` along the way, turning from the view it set off
  //   with, and into the one it arrives at, over the pace's distances;
  // - the chair is drawn in during the settle (`settle` 0..1).
  const ways = new Map();
  function way(name, format) {
    const [from, to] = name.split('>');
    const key = name + ':' + format + ':' + JSON.stringify([points[from], points[to], state.paths, state.pace]);
    if (ways.has(key)) return ways.get(key);
    if (ways.size > 12) ways.clear();
    const {trunk, fork, branch, sit} = state.paths, {pace} = state;
    const start = aim(points[from]), end = aim(points[to]), xz = p => [p.position[0], p.position[2]];
    // Where a point lies along the trunk: segment index plus fraction.
    const along = ([x, z]) => {
      let best = Infinity, at = 0;
      for (let i = 0; i < trunk.length - 1; i++) {
        const [ax, az] = trunk[i], dx = trunk[i + 1][0] - ax, dz = trunk[i + 1][1] - az;
        const f = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
        const d = Math.hypot(x - ax - f * dx, z - az - f * dz);
        if (d < best) { best = d; at = i + f; }
      }
      return at;
    };
    // The trunk's points strictly between two places along it, in walking order.
    const between = (a, b) => {
      const out = [];
      if (a < b) for (let i = Math.floor(a) + 1; i < b; i++) out.push(trunk[i]);
      else for (let i = Math.ceil(a) - 1; i > b; i--) out.push(trunk[i]);
      return out;
    };
    const seat = to === 'seated';
    // What the walk is drawn to at the end: the chair where it stands, or
    // what the place looks at.
    const focus = seat ? state.paths.chair.slice(0, 2) : [points[to].lookAt[0], points[to].lookAt[2]];
    const marks = seat ? [xz(start), ...between(along(xz(start)), fork), trunk[fork], ...branch, sit, xz(end)]
      : [xz(start), ...between(along(xz(start)), along(xz(end))), xz(end)];
    // Centripetal Catmull-Rom through the marks, sampled densely: arc length
    // to [x, z].
    const samples = [[0, ...marks[0]]];
    let length = 0, settleAt = 0;
    for (let i = 0; i < marks.length - 1; i++) {
      const p0 = marks[Math.max(0, i - 1)], p1 = marks[i], p2 = marks[i + 1], p3 = marks[Math.min(marks.length - 1, i + 2)];
      const knot = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
      const t1 = knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
      for (let k = 1; k <= 32; k++) {
        const u = t1 + (t2 - t1) * k / 32;
        const point = [0, 1].map(j => {
          const a1 = (t1 - u) / t1 * p0[j] + u / t1 * p1[j], a2 = (t2 - u) / (t2 - t1) * p1[j] + (u - t1) / (t2 - t1) * p2[j];
          const a3 = (t3 - u) / (t3 - t2) * p2[j] + (u - t2) / (t3 - t2) * p3[j];
          const b1 = (t2 - u) / t2 * a1 + u / t2 * a2, b2 = (t3 - u) / (t3 - t1) * a2 + (u - t1) / (t3 - t1) * a3;
          return (t2 - u) / (t2 - t1) * b1 + (u - t1) / (t2 - t1) * b2;
        });
        const last = samples[samples.length - 1];
        length += Math.hypot(point[0] - last[1], point[1] - last[2]);
        samples.push([length, ...point]);
      }
      // The settle begins where the branch ends, beside the chair.
      if (seat && i + 1 === marks.length - 3) settleAt = length;
    }
    const place = s => {
      let lo = 0, hi = samples.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid][0] < s) lo = mid; else hi = mid; }
      const [s0, x0, z0] = samples[lo], [s1, x1, z1] = samples[hi], f = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
      return [x0 + (x1 - x0) * f, z0 + (z1 - z0) * f];
    };
    // Walking time to each sample: the walking pace, easing into the slower
    // settle round the chair. A leg's progress is its share of that time.
    const speed = s => seat ? pace.walk + (pace.sit - pace.walk) * smooth(settleAt - .5, settleAt + .3, s) : pace.walk;
    const times = [0];
    for (let i = 1; i < samples.length; i++)
      times.push(times[i - 1] + (samples[i][0] - samples[i - 1][0]) / speed((samples[i][0] + samples[i - 1][0]) / 2));
    const total = times[times.length - 1];
    const distanceAt = progress => {
      const time = Math.max(0, Math.min(1, progress)) * total;
      let lo = 0, hi = times.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] < time) lo = mid; else hi = mid; }
      const f = times[hi] > times[lo] ? (time - times[lo]) / (times[hi] - times[lo]) : 0;
      return samples[lo][0] + (samples[hi][0] - samples[lo][0]) * f;
    };
    const built = {length, settleAt: seat ? settleAt : length, marks,
      // The leg's whole walking time, ms.
      duration: total * 1000,
      at(progress) {
        const s = distanceAt(progress), [x, z] = place(s);
        // Ahead along the way; near its end the last heading that still had one.
        let ahead = place(Math.min(length, s + pace.ahead)), reach = pace.ahead;
        while (Math.hypot(ahead[0] - x, ahead[1] - z) < .25 && reach > .05) { reach /= 2; ahead = place(Math.max(0, s - reach)); ahead = [2 * x - ahead[0], 2 * z - ahead[1]]; }
        // Walking, the eye looks along the way, and over its last metres is
        // drawn to where it is going: the nook's back wall, or the chair
        // (let go as the visitor settles, and when right over it).
        const settle = seat ? smooth(settleAt, length, s) : 0, walkEnd = seat ? settleAt : length;
        const walking = Math.atan2(x - ahead[0], z - ahead[1]) / radians;
        const near = Math.hypot(x - focus[0], z - focus[1]);
        const drawn = smooth(walkEnd - pace.drawn[name][0], walkEnd - pace.drawn[name][1], s) * (1 - settle) * smooth(.3, .8, near);
        const going = turnToward(walking, Math.atan2(x - focus[0], z - focus[1]) / radians, drawn);
        const leave = 1 - smooth(0, pace.leave, s), arrive = smooth(length - pace.arrive, length, s);
        const yaw = turnToward(turnToward(going, start.yaw, leave), end.yaw, arrive);
        // Coming up to the chair the eye looks down at it, and stays on it
        // while drawing it in; it lifts again as the visitor sits.
        const down = seat ? pace.down * smooth(settleAt - 1.4, settleAt - .1, s) * (1 - smooth(settleAt + .35 * (length - settleAt), length, s)) : 0;
        const tilt = start.tilt + (end.tilt - start.tilt) * smooth(0, length, s) + down;
        const standing = start.position[1] + (end.position[1] - start.position[1]) * smooth(0, length, s);
        const y = seat ? start.position[1] + (end.position[1] - start.position[1]) * settle * settle * (3 - 2 * settle) : standing;
        return {position: [x, y, z], yaw, tilt, settle};
      },
    };
    ways.set(key, built);
    return built;
  }
  // The standing life (sway, lean, the shelf's look), or what a walk carries
  // of it, applied on top of the path (see the driver). Metres and degrees.
  const offset = {x: 0, y: 0, yaw: 0, pitch: 0};
  function update() {
    const width = screen.clientWidth, height = screen.clientHeight;
    // Read layout before publishing camera styles. Navigation hit targets use
    // these same integer dimensions without forcing a second layout afterward.
    const tableWidthPx = table.clientWidth, tableDepthPx = table.clientHeight;
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
    // A pose: where the eye is and how it is turned (the standing life on
    // top), and the table centre in its frame: right, up and depth (metres).
    const pose = ({position, yaw: heading, tilt: down}) => {
      const yawDeg = round(wrap(heading + offset.yaw)), pitchDeg = round(90 - down + offset.pitch);
      const yaw = yawDeg * radians, tilt = Math.PI / 2 - pitchDeg * Math.PI / 180;
      // The sway moves the eye along its own right and up.
      const x = position[0] + offset.x * Math.cos(yaw);
      const eyeHeight = position[1] + offset.y;
      const distance = position[2] - offset.x * Math.sin(yaw);
      const dx = -x, dy = state.tableHeight - eyeHeight, dz = -distance;
      const sinY = Math.sin(yaw), cosY = Math.cos(yaw), sinT = Math.sin(tilt), cosT = Math.cos(tilt);
      return {yawDeg, pitchDeg, tilt, x, eyeHeight, distance,
        right: dx * cosY - dz * sinY, up: -dx * sinY * sinT + dy * cosT - dz * cosY * sinT,
        depth: -dx * sinY * cosT - dy * sinT - dz * cosY * cosT};
    };
    const anchorY = innerHeight * (portrait ? .60 : .54);
    // The lens's vertical shift. At the entry and the seat it keeps the table
    // centre at one height on screen (the original composition). The shelf,
    // where the table is out of view, takes no shift. A walk blends between
    // its ends' shifts.
    const anchored = p => anchorY - focal * (-p.up * units) / (p.depth * units);
    const {leg} = state, t = leg.progress, name = leg.from + '>' + leg.to, route = way(name, format);
    for (const each of Object.keys(state.durations)) state.durations[each] = way(each, format).duration;
    const walk = route.at(t), now = pose(walk);
    const lens = place => place === 'shelf' ? innerHeight / 2 : anchored(pose(aim(points[place])));
    const originY = lens(leg.from) + (lens(leg.to) - lens(leg.from)) * t;
    // Where the chair stands: pushed back and turned (see `paths`), drawn in
    // square to the table as the visitor settles into the seat.
    const [restX, restZ, restYaw] = state.paths.chair, k = walk.settle * walk.settle * (3 - 2 * walk.settle);
    state.chairPose = {x: restX * (1 - k), z: restZ + (seated.distance - .06 - restZ) * k, yaw: restYaw * (1 - k) * radians};
    camera.yaw = now.yawDeg; camera.pitch = now.pitchDeg;
    const {tilt, x, eyeHeight, distance, depth} = now;
    const viewX = now.right * units, viewY = -now.up * units, viewDistance = depth * units;
    // CSS cannot project a table behind the eye; it is out of view there anyway.
    const behind = depth < .4;
    Object.assign(state, {width, height, tableWidthPx, tableDepthPx, units, tilt, focal, x, eyeHeight, distance, seatedDistance, viewX, viewY, viewDistance,
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
      // go along the way. It sets off and comes to rest over about 0.8 s
      // each, at an even pace between.
      if (move.start === null) { move.start = now; move.carry = {...offset}; settle(); }
      const t = Math.min(1, (now - move.start) / move.duration), {leg} = state;
      const a = Math.min(.3, 800 / move.duration), top = 1 / (1 - a);
      const eased = t < a ? top * t * t / (2 * a) : t > 1 - a ? 1 - top * (1 - t) * (1 - t) / (2 * a) : top * (t - a / 2);
      leg.progress = move.from + (move.to - move.from) * eased;
      for (const key in offset) offset[key] = move.carry[key] * (1 - eased);
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
  // leg, ms: measured along each leg's way at the pace (see `way`), kept
  // here up to date by update().
  state.durations = {'entry>seated': 5000, 'entry>shelf': 6600, 'shelf>seated': 8000};
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
