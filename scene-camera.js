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
    // Entry: standing just inside the door of the round chamber
    // (room-scene.js, room-chamber.js), on the table's axis, about twice the
    // seat's distance from it and looking straight across the room at the
    // great window: the table is the large, central focal point, the study
    // nook on the left, the tower's mouth on the right and the vault
    // overhead. It looks only about five degrees down, so the columns stand
    // upright and the dome shows, as in the concept; the walk in then tilts
    // down to the chair and up into the seat's 15 degrees. `anchor` sets
    // where the table's centre sits in the frame (a share of the viewport's
    // height; the seat's is `anchorY`'s): lower here, so the vault shows.
    // Portrait views stand a little further back and turn nine degrees left,
    // so their narrow view holds both ways on: the shelf's marker and the
    // table with its chair.
    entry: {
      wide: {position: [0, 1.7, 3.4], lookAt: [0, 1.1, -3.7], anchor: .68},
      portrait: {position: [0, 1.75, 3.75], lookAt: [-1.16, 1, -3.61], anchor: .7},
    },
    // Final seated POV: the eye of someone sitting in the chair centred in
    // front of the table (seat 0.42 m; the table is knee height), looking
    // `tilt` degrees down along the table's axis. Narrow viewports back away
    // until the real tabletop's front edge spans at most `fit` of the
    // viewport width.
    seated: {eye: 1.18, distance: 1.6, tilt: 15, fit: {wide: .94, portrait: .8}},
    // Shelf: standing before the study nook in the chamber's left bay, a
    // step toward the window, looking into it at about 28 degrees (heading
    // 118) from a standing eye, a little down: the worktop seen from above,
    // the shelf with its objects, the arch with its columns, and the mist
    // gathered at its foot. Square in front of the nook the chair would stand
    // almost straight behind (the nook is level with the table); from here it
    // is a moderate turn to the left (`look`). The table is behind and to the
    // left. Portrait views are narrow; they stand further back along the same
    // line, to keep the shelf's three objects.
    shelf: {
      wide: {position: [-2.6, 1.8, -.75], lookAt: [-4.6, 1.1, .3]},
      portrait: {position: [-1.95, 1.8, -1.1], lookAt: [-4.6, 1.15, .3]},
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
      trunk: [[0, 5.3], [0, 4.75], [.02, 4.1], [.04, 3.55], [.02, 3.05], [-.2, 2.58], [-.62, 2.0],
        [-1.05, 1.45], [-1.5, .85], [-1.95, .2], [-2.3, -.35], [-2.6, -.75], [-3.05, -.62], [-3.45, -.25], [-3.7, .2]],
      fork: 5,
      // (It ends a step out from the chair, so its marker is in view from the entry.)
      branch: [[.12, 2.38], [.6, 2.05], [.98, 1.7], [1.3, 1.25]],
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
    // The visitor's own look (first-person.js turns it: a drag in website
    // mode, the mouse in game mode), on top of where a place or a walk looks:
    // all the way round, and up or down between `pitch` (the camera's pitch
    // in degrees: 90 is level, lower looks down). It eases toward where it is
    // turned over `ease` seconds, and walking somewhere lets it go.
    look: {pitch: [18, 150], ease: .06},
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
    // The share of the walking time at which the settle into the seat begins.
    const settleIndex = samples.findIndex(sample => sample[0] >= settleAt);
    const built = {length, settleAt: seat ? settleAt : length, marks,
      settleProgress: seat && settleIndex > 0 ? times[settleIndex] / total : 1,
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
  // ---- A walk from wherever the visitor stands free (game mode, or website
  // mode after it) to a place: straight, or round the table and its chair if
  // they are in the way, on the nearer side; turning from the way the eye
  // looked to the way the place looks. The same interface as way()'s.
  let freeRoute = null;
  function freeWay(from, end) {
    const a = [from.x, from.z], b = [end.position[0], end.position[2]], marks = [a];
    const c = [.35, .25], r = 1.5, ab = [b[0] - a[0], b[1] - a[1]], l2 = ab[0] ** 2 + ab[1] ** 2 || 1e-9;
    const f = Math.max(0, Math.min(1, ((c[0] - a[0]) * ab[0] + (c[1] - a[1]) * ab[1]) / l2));
    const near = [a[0] + ab[0] * f, a[1] + ab[1] * f], d = Math.hypot(near[0] - c[0], near[1] - c[1]);
    const inside = p => Math.hypot(p[0] - c[0], p[1] - c[1]) < r;
    if (d < r && f > 0 && f < 1 && !inside(a) && !inside(b)) {
      const out = d > 1e-3 ? [(near[0] - c[0]) / d, (near[1] - c[1]) / d] : [-ab[1] / Math.sqrt(l2), ab[0] / Math.sqrt(l2)];
      marks.push([c[0] + out[0] * (r + .2), c[1] + out[1] * (r + .2)]);
    }
    marks.push(b);
    const segments = [];
    let length = 0;
    for (let i = 1; i < marks.length; i++) {
      const s = Math.hypot(marks[i][0] - marks[i - 1][0], marks[i][1] - marks[i - 1][1]);
      segments.push({a: marks[i - 1], b: marks[i], from: length, length: s}); length += s;
    }
    const at = s => {
      const seg = segments.find(g => s <= g.from + g.length) ?? segments[segments.length - 1], u = seg.length ? Math.min(1, (s - seg.from) / seg.length) : 1;
      return {point: [seg.a[0] + (seg.b[0] - seg.a[0]) * u, seg.a[1] + (seg.b[1] - seg.a[1]) * u], dir: [seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]]};
    };
    const turn = Math.abs(wrap(end.yaw - from.yaw));
    return {length, marks, duration: Math.max(600, (length / state.pace.walk + turn / 150) * 1000), settleAt: length,
      at(progress) {
        const s = Math.max(0, Math.min(1, progress)) * length, {point: [x, z], dir} = at(s);
        const walking = Math.atan2(-dir[0], -dir[1]) / radians;
        const leave = 1 - smooth(0, Math.min(1.2, length * .4), s), arrive = smooth(length - Math.min(1.5, length * .5), length, s);
        const yaw = length < .1 ? turnToward(from.yaw, end.yaw, smooth(0, 1, progress)) : turnToward(turnToward(walking, from.yaw, leave), end.yaw, arrive);
        const k = smooth(0, 1, progress);
        return {position: [x, from.y + (end.position[1] - from.y) * k, z], yaw, tilt: from.tilt + (end.tilt - from.tilt) * k, settle: 0};
      }};
  }
  // The standing life (sway, lean, the visitor's own look), or what a walk
  // carries of it, applied on top of the path (see the driver). Metres and
  // degrees. `base`: the path's own heading and tilt before them.
  const offset = {x: 0, y: 0, yaw: 0, pitch: 0}, base = {yaw: 0, tilt: 0};
  // What update() last wrote on the page's elements.
  const published = {};
  // The visitor's look (degrees), and where it is being turned to.
  const gaze = {yaw: 0, pitch: 0, goalYaw: 0, goalPitch: 0};
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
    const pose = ({position, yaw: heading, tilt: down}, o = offset) => {
      const yawDeg = round(wrap(heading + o.yaw)), pitchDeg = round(90 - down + o.pitch);
      const yaw = yawDeg * radians, tilt = Math.PI / 2 - pitchDeg * Math.PI / 180;
      // The sway moves the eye along its own right and up.
      const x = position[0] + o.x * Math.cos(yaw);
      const eyeHeight = position[1] + o.y;
      const distance = position[2] - o.x * Math.sin(yaw);
      const dx = -x, dy = state.tableHeight - eyeHeight, dz = -distance;
      const sinY = Math.sin(yaw), cosY = Math.cos(yaw), sinT = Math.sin(tilt), cosT = Math.cos(tilt);
      return {yawDeg, pitchDeg, tilt, x, eyeHeight, distance,
        right: dx * cosY - dz * sinY, up: -dx * sinY * sinT + dy * cosT - dz * cosY * sinT,
        depth: -dx * sinY * cosT - dy * sinT - dz * cosY * cosT};
    };
    const anchorY = innerHeight * (portrait ? .60 : .54);
    // The lens's vertical shift. At the entry and the seat it keeps the table
    // centre at a set height on screen: the seat's `anchorY` (the original
    // composition), the entry's own `anchor`. The shelf, where the table is
    // out of view, takes no shift. A walk blends between its ends' shifts.
    const anchored = (p, at = anchorY) => at - focal * (-p.up * units) / (p.depth * units);
    const {leg} = state, t = leg.progress, name = leg.from + '>' + leg.to;
    for (const each of Object.keys(state.durations)) state.durations[each] = way(each, format).duration;
    // Standing free (game mode, or website mode after it): the eye's own pose.
    // Walking from there: the way built for that walk (go()).
    const free = state.free, route = leg.from === 'free' ? freeRoute : way(name, format);
    const walk = free ? {position: [free.x, free.y, free.z], yaw: free.yaw, tilt: free.tilt, settle: 0} : route.at(t);
    base.yaw = walk.yaw; base.tilt = walk.tilt;
    const now = pose(walk);
    // (Measured without the visitor's look, so turning never moves the lens.)
    const steady = {...offset, yaw: offset.yaw - gaze.yaw, pitch: offset.pitch - gaze.pitch};
    const lens = place => place === 'shelf' || place === 'free' ? innerHeight / 2
      : anchored(pose(aim(points[place]), steady), points[place].anchor ? innerHeight * points[place].anchor : anchorY);
    const originY = free ? innerHeight / 2 : lens(leg.from) + (lens(leg.to) - lens(leg.from)) * t;
    // Where the chair stands: pushed back and turned (see `paths`), drawn in
    // square to the table as the visitor settles into the seat.
    const [restX, restZ, restYaw] = state.paths.chair, k = walk.settle * walk.settle * (3 - 2 * walk.settle);
    state.chairPose = {x: restX * (1 - k), z: restZ + (seated.distance - .06 - restZ) * k, yaw: restYaw * (1 - k) * radians};
    camera.yaw = now.yawDeg; camera.pitch = now.pitchDeg;
    const {tilt, x, eyeHeight, distance, depth} = now;
    const viewX = now.right * units, viewY = -now.up * units, viewDistance = depth * units;
    // CSS cannot project a table behind the eye; it is out of view there anyway.
    // The portal's plane (the screen: width x height px at the table) reaches
    // nearer the eye than the table's centre. As a corner nears the eye's
    // plane its projection explodes (25 viewports at 0.15 m, tens of
    // thousands at 0), and drawing those layers stalled frames for seconds on
    // walks past the table. Wholly beside the view it is hidden too; that
    // reach covers the table, the risen orb and the aura's wisps (metres).
    const yawR = now.yawDeg * radians, cosT = Math.cos(tilt);
    const nearest = depth - Math.abs(width / units / 2 * Math.sin(yawR) * cosT) - Math.abs(height / units / 2 * Math.cos(yawR) * cosT);
    const tanH = innerWidth / 2 / focal, reach = 1.6;
    const beside = (Math.abs(now.right) - depth * tanH) / Math.hypot(1, tanH) > reach;
    const behind = depth < .4 || nearest < .15 || beside;
    Object.assign(state, {width, height, tableWidthPx, tableDepthPx, units, tilt, focal, x, eyeHeight, distance, seatedDistance, viewX, viewY, viewDistance,
      originY, anchorY, format, appliedPitch: camera.pitch, elevation: eyeHeight - state.tableHeight,
      localEyeX: x * units, localEyeY: distance * units, localEyeZ: (eyeHeight - state.tableHeight) * units});
    // The portal's plane (portal.css .screen) takes its place and turn on
    // itself: a variable changed on the root restyles every element of the
    // page, and while the eye moved that cost 8 to 11 ms a frame (a walk ran
    // at 31 fps); a transform on the plane restyles the plane alone. What its
    // own parts read (the pitch, the legs' length) is set only when it
    // changes. (portal.css keeps the same transform from the variables, as
    // the fallback before the first update.)
    const transform = `translate(-50%, -50%) perspective(${focal}px) translate3d(${viewX}px, ${viewY}px, ${focal - viewDistance}px) ` +
      `rotateX(${camera.pitch}deg) rotateZ(${camera.yaw}deg)`;
    if (published.transform !== transform) screen.style.transform = published.transform = transform;
    if (published.top !== originY) { screen.style.top = originY + 'px'; published.top = originY; }
    if (published.pitch !== camera.pitch) { screen.style.setProperty('--view-pitch', camera.pitch + 'deg'); published.pitch = camera.pitch; }
    const legLength = state.tableHeight * units;
    if (published.leg !== legLength) { root.style.setProperty('--table-leg-length', legLength + 'px'); published.leg = legLength; }
    screen.classList.toggle('is-behind', behind);
    window.dispatchEvent(new Event('scene-camera-change'));
  }
  state.update = update;
  state.points = points;
  // How far toward the seat: the leg's progress on the way there, 1 seated.
  // Standing free, or walking from there, the visitor is not settling yet.
  Object.defineProperty(state, 'approach', {enumerable: true, get() {
    const {from, to, progress} = state.leg;
    if (state.free || from === 'free') return 0;
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
  // the original walk in), the standing sway and lean, and the visitor's own look.
  // It runs only while something moves; the idle life redraws at its own
  // slower pace, a turning look every frame.
  let move = null, idling = false, raf = 0, last = 0, drawn = 0, weight = 0;
  const pointer = {x: 0, y: 0}, lean = {x: 0, y: 0};
  const wake = () => { if (!raf) raf = requestAnimationFrame(drive); };
  // Leave the standing life behind at once (a jump, or a walk setting off),
  // the visitor's look with it.
  const settle = () => { weight = 0; Object.assign(gaze, {yaw: 0, pitch: 0, goalYaw: 0, goalPitch: 0}); };
  function drive(now) {
    raf = 0;
    const dt = last ? Math.min(.1, (now - last) / 1000) : 0;
    last = now;
    // Not behind the loading gate either (loading-gate.js): unseen, it would
    // only take frames from the way in. There it stops at once, and fades in
    // as the gate thins.
    const veiled = !!window.loadingGate?.veiled;
    const live = idling && !still.matches && !document.hidden && !veiled;
    const {idle} = state, ease = response => 1 - Math.exp(-dt / response);
    // The idle life fades in where the visitor stands, and out once a walk starts.
    weight = veiled ? 0 : weight + ((live && !move ? 1 : 0) - weight) * ease(.6);
    lean.x += (pointer.x - lean.x) * ease(idle.response);
    lean.y += (pointer.y - lean.y) * ease(idle.response);
    // The visitor's look eases toward where it is turned (at once under
    // reduced motion).
    const k = still.matches ? 1 : ease(state.look.ease);
    gaze.yaw += (gaze.goalYaw - gaze.yaw) * k; gaze.pitch += (gaze.goalPitch - gaze.pitch) * k;
    const turning = Math.abs(gaze.goalYaw - gaze.yaw) + Math.abs(gaze.goalPitch - gaze.pitch) > .005;
    const s = now / 1000, wave = (period, phase = 0) => Math.sin(s * 2 * Math.PI / period + phase);
    const standing = {
      x: weight * (idle.sway[0] * wave(11) + idle.lean[0] * lean.x),
      y: weight * (idle.sway[1] * wave(6.5, 1) - idle.lean[1] * lean.y),
      yaw: weight * (idle.swayYaw * wave(13, 2) - idle.leanYaw * lean.x) + gaze.yaw,
      pitch: gaze.pitch,
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
      if (turning || now - drawn > (following ? idle.leanFrameMs : idle.frameMs)) { drawn = now; update(); }
    }
    if (move || live || weight > .002 || turning) wake();
    // At rest: the sway and lean gone, the visitor's look kept.
    else { weight = 0; Object.assign(offset, {x: 0, y: 0, yaw: gaze.yaw, pitch: gaze.pitch}); last = 0; update(); }
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
  // Turn the visitor's look by degrees (left and up positive), within the
  // pitch limits. Standing free, it turns the free pose itself. Not while
  // walking: the walk carries the look and lets it go.
  state.lookBy = (dYaw, dPitch) => {
    if (move) return;
    const [low, high] = state.look.pitch;
    if (state.free) {
      const f = state.free;
      state.setFree({...f, yaw: wrap(f.yaw + dYaw), tilt: Math.max(90 - high, Math.min(90 - low, f.tilt - dPitch))});
      return;
    }
    gaze.goalYaw += dYaw;
    // The camera's pitch is 90 - (the path's tilt) + the look's pitch.
    gaze.goalPitch = Math.max(low - 90 + base.tilt, Math.min(high - 90 + base.tilt, gaze.goalPitch + dPitch));
    wake();
  };
  // ---- Standing free: the eye's own pose ({x, y, z} metres, yaw and tilt
  // in degrees, tilt down positive), in place of a place's or a walk's.
  // enterFree() takes the current view as it is on screen (the lens's shift
  // turned into tilt), and the navigation state becomes FREE.
  state.free = null;
  state.setFree = pose => { state.free = pose; update(); };
  state.enterFree = () => {
    state.stop(); journey++;
    const pose = {x: state.x, y: state.eyeHeight, z: state.distance, yaw: camera.yaw,
      tilt: 90 - camera.pitch + Math.atan2(innerHeight / 2 - state.originY, state.focal) / radians};
    settle(); for (const key in offset) offset[key] = 0;
    state.free = pose; update(); announce('FREE');
    return pose;
  };
  // Turn the look back to where the place looks.
  state.resetLook = () => { gaze.goalYaw = gaze.goalPitch = 0; wake(); };
  Object.defineProperty(state, 'gaze', {get: () => ({yaw: gaze.yaw, pitch: gaze.pitch})});
  addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    pointer.x = event.clientX / innerWidth * 2 - 1; pointer.y = event.clientY / innerHeight * 2 - 1;
    if (idling) wake();
  }, {passive: true});
  root.addEventListener('pointerleave', () => { pointer.x = pointer.y = 0; });
  document.addEventListener('visibilitychange', wake);
  addEventListener('site-unveiling', wake);
  still.addEventListener('change', () => {
    // Reduced motion switched on: a walk arrives at once, a look is let go.
    if (still.matches && move) { const {to, resolve} = move; move = null; state.leg.progress = to; update(); resolve(true); }
    if (still.matches) settle();
    wake();
  });

  // ---- Where the visitor is: named states over the points and legs.
  //   FREE              standing free (first-person.js: game mode, or website
  //                     mode after it); ENTRY_APPROACH walking from there to
  //                     the entry
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
    // From standing free: a walk of its own to the place, or to beside the
    // chair, where sitting down goes on as from the entry.
    if (state.free) {
      const format = state.format, seat = target === 'seated', sit = seat ? way('entry>seated', format) : null;
      const settleAt = seat ? sit.settleProgress : 0, end = seat ? sit.at(settleAt) : aim(points[target]);
      const landing = () => target === 'shelf' ? state.setLeg('entry', 'shelf', 1) : state.setLeg('entry', 'seated', seat ? settleAt : 0);
      settle(); for (const key in offset) offset[key] = 0;
      if (instant || still.matches) {
        state.free = null; state.setLeg('entry', 'seated', seat ? 1 : 0);
        if (target === 'shelf') state.setLeg('entry', 'shelf', 1);
        announce(arrival[place]); return Promise.resolve(true);
      }
      freeRoute = freeWay(state.free, end);
      state.free = null; state.leg = {from: 'free', to: target, progress: 0}; update();
      announce(approaching[target] ?? 'ENTRY_APPROACH');
      return state.moveTo(1, freeRoute.duration).then(arrived => {
        if (!arrived || id !== journey) return false;
        landing();
        if (!seat) { announce(arrival[place]); return true; }
        return state.moveTo(1, sit.duration * (1 - settleAt)).then(sat => sat && id === journey && (announce('SEATED'), true));
      });
    }
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
