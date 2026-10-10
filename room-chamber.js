/* The study's chamber: a twelve-sided chapter house under a ribbed dome, the
   orb-glass building outside (loading-exterior-3d-worker.js) seen from within,
   laid out as the concept (docs/reference/interior-concept.png).
   - Twelve flat bays between clustered columns read as round under the dome,
     keep every opening planar, and give the ribs corners to spring from.
   - Each column runs on up into a rib. The ribs meet at a boss over the
     middle, a lantern hanging from it. Between them lie the vault's cells,
     and over each bay a wall rib (formeret), whose pointed arch the bay's
     wall rises into: walls and vault are one structure.
   - The bays hold the great window (straight behind the table), the tower's
     mouth (back right, where the tower stands outside), the door (opposite
     the window, the outside's pointed arch), the study nook (left), shelving
     niches and blind arches.

   Plan coordinates (room-scene.js's shell group): metres, the chamber's
   centre at the origin, +Y up, +Z toward the door. Bay k faces the centre
   from plan angle -90° + 30k (0° = +X, 90° = +Z).

   Geometry only. room-scene.js owns the materials, the tower and its stair,
   the lights and everything that moves. The pieces come grouped by material.
   One bay's columns, ribs and caps are built once and repeated round the
   room (frame.instances: one placement per corner). */

export const chamberTuning = {
  sides: 12, apothem: 4.0, wall: .35,
  spring: 3.9,     // the columns' capitals: where every rib springs
  formeret: 1.35,  // how far each bay's wall arch rises above the springing
  apex: 6.9,       // the vault's crown, under the boss
  boss: .34,       // radius of the ring the ribs meet in
  rib: .09, wallRib: .065,
  passage: 1.0,    // the dark passage behind the door
  // The gallery: a second floor round the chamber, the twelve-sided plan's
  // own outline, open in the middle under the dome. Its floor (top) is level
  // with the tower's upper floor, where the spiral stair arrives; depth from
  // the wall; slab thickness; the balustrade's height. It breaks off at the
  // great window, which rises through it.
  gallery: {floor: 2.85, depth: 1.0, slab: .15, rail: .95},
  // The lantern under the boss: how far below the crown it hangs, its glass.
  lantern: {drop: 1.6, height: .56, radius: .2},
};

// The bays, from the window round past the tower and the door to the nook.
const KINDS = ['window', 'blind', 'tower', 'shelves', 'blind', 'blind', 'door', 'shelves', 'shelves', 'nook', 'shelves', 'blind'];

// towerTop: how high the tower's bay wall rises behind the vault (the tower's roof).
export function createChamber(THREE, {towerTop = 7} = {}, tuning = chamberTuning) {
  const {sides, apothem: A, wall: T, spring: Hs, formeret: F, apex: Ha, boss: rb} = tuning;
  const step = 2 * Math.PI / sides, half = step / 2;
  const hw = A * Math.tan(half);                 // a bay's half-width at the wall's face
  const Rc = A / Math.cos(half);                 // where two bays meet
  const angleOf = k => -Math.PI / 2 + k * step;  // the plan angle bay k faces from
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---- Pointed arches: straight jambs to the shoulder, then two quadratic
  // curves to the peak (room-scene.js's arch, so frames register exactly).
  const control = w => w.shoulder + .6 * (w.peak - w.shoulder);
  const archTop = (w, u) => {
    const t = Math.sqrt(Math.max(0, 1 - Math.abs(u) / w.halfWidth));
    return w.shoulder * (1 - t) ** 2 + control(w) * 2 * t * (1 - t) + w.peak * t * t;
  };
  // Its outline, from the sill's left end up, over and down: a convex polygon.
  function outline(w, steps = 10) {
    const r = w.halfWidth, c = control(w), points = [[-r, w.sill], [-r, w.shoulder]];
    for (let i = 1; i <= steps; i++) { const t = i / steps; points.push([-r * (1 - t * t), w.shoulder * (1 - t) ** 2 + 2 * c * t * (1 - t) + w.peak * t * t]); }
    for (let i = steps - 1; i >= 0; i--) { const t = i / steps; points.push([r * (1 - t * t), w.shoulder * (1 - t) ** 2 + 2 * c * t * (1 - t) + w.peak * t * t]); }
    points.push([r, w.sill]);
    return points;
  }
  // How far either side of its axis an arch reaches at height y.
  function archHalfAt(w, y) {
    if (y <= w.shoulder) return w.halfWidth;
    if (y >= w.peak) return 0;
    let lo = 0, hi = w.halfWidth;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (archTop(w, mid) > y) lo = mid; else hi = mid; }
    return lo;
  }
  const archPath = (path, w) => {
    const r = w.halfWidth, c = control(w);
    path.moveTo(-r, w.sill); path.lineTo(-r, w.shoulder);
    path.quadraticCurveTo(-r, c, 0, w.peak); path.quadraticCurveTo(r, c, r, w.shoulder);
    path.lineTo(r, w.sill); path.closePath(); return path;
  };
  // The wall rib over every bay, corner to corner.
  const formeret = {halfWidth: hw, sill: 0, shoulder: Hs, peak: Hs + F};

  // ---- The bays. Each has its own frame: local x across it (symmetric, so
  // its sign never matters), y up, z out through the wall (0 at the room's
  // face, T at the outside). map(u, y, depth) is room-architecture.js's
  // convention: u to the right as seen from the room, depth toward it.
  const OPEN = {
    window: {halfWidth: .82, sill: .8, shoulder: 3.6, peak: 4.9},
    // The whole bay open between its columns, into the tower, up almost to
    // its wall rib: high enough over the gallery's bridge to walk from the
    // gallery to the tower's upper floor, where the stair arrives.
    tower: {halfWidth: hw - .14, sill: 0, shoulder: 4.5, peak: 5.2},
    // The outside's entrance: an equilateral pointed arch, its jambs 1.7
    // half-widths high, its rise 1.73 (DOOR in the exterior's worker).
    // (Its crown and frame stay under the gallery's slab.)
    door: {halfWidth: .74, sill: 0, shoulder: 1.26, peak: 1.26 + 1.28, depth: T + tuning.passage},
    // The niches stay under the gallery too.
    nook: {halfWidth: .98, sill: 0, shoulder: 2.0, peak: 2.6, depth: .6},
    shelves: {halfWidth: .86, sill: 0, shoulder: 1.95, peak: 2.6, depth: .3},
    blind: {halfWidth: .8, sill: .62, shoulder: 1.95, peak: 2.6, depth: .07},
  };
  const bays = KINDS.map((kind, k) => {
    const theta = angleOf(k), c = Math.cos(theta), s = Math.sin(theta);
    const out = v3(c, 0, s), right = v3(-s, 0, c), centre = v3(A * c, 0, A * s);
    // Right-handed: local x is -right, so the outward z keeps the winding.
    const matrix = new THREE.Matrix4().makeBasis(right.clone().negate(), v3(0, 1, 0), out).setPosition(centre);
    const map = (u, y, depth) => v3(-u, y, -depth).applyMatrix4(matrix);
    return {k, kind, theta, out, right, centre, matrix, map, open: {...OPEN[kind]}};
  });
  const bay = kind => bays.find(b => b.kind === kind);

  const walls = [], plinth = [], timber = [], metal = [];
  const place = (geometry, b) => geometry.applyMatrix4(b.matrix);
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  // A strip of faces along an outline from local depth z0 to z1, facing in.
  function reveal(points, z0, z1, closed) {
    const cx = points.reduce((n, p) => n + p[0], 0) / points.length, cy = points.reduce((n, p) => n + p[1], 0) / points.length;
    const position = [], normal = [];
    const n = closed ? points.length : points.length - 1;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length];
      let nx = -(by - ay), ny = bx - ax; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if (nx * (cx - (ax + bx) / 2) + ny * (cy - (ay + by) / 2) < 0) { nx = -nx; ny = -ny; }
      const quad = [[ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1]];
      // Wound to face the normal.
      const e = [bx - ax, by - ay, 0], f = [0, 0, z1 - z0];
      const facing = (e[1] * f[2] - e[2] * f[1]) * nx + (e[2] * f[0] - e[0] * f[2]) * ny;
      for (const j of facing > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) { position.push(...quad[j]); normal.push(nx, ny, 0); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(position.length / 3 * 2), 2));
    return g;
  }
  // A flat face filling an arch at local depth z, facing the room.
  const panel = (w, z) => new THREE.ShapeGeometry(archPath(new THREE.Shape(), w), 10).rotateY(Math.PI).translate(0, 0, z);

  // ---- Each bay's wall: from the floor up into its wall rib (in the tower's
  // bay, on up to the tower's roof), with its opening cut through or into it.
  let windowWall = null, doorLeaf = null;
  // (The outer door's straps are its own: the way in opens the door, leaf and
  // straps together; room-scene.js.)
  const doorStraps = [];
  const passage = [];
  function wallShape(b, top) {
    const w = b.open, shape = new THREE.Shape().moveTo(-hw, 0);
    if (w.sill === 0) {
      // Opening from the floor: a notch in the outline, not a hole.
      const r = w.halfWidth, c = control(w);
      shape.lineTo(-r, 0); shape.lineTo(-r, w.shoulder);
      shape.quadraticCurveTo(-r, c, 0, w.peak); shape.quadraticCurveTo(r, c, r, w.shoulder); shape.lineTo(r, 0);
    }
    shape.lineTo(hw, 0); shape.lineTo(hw, Hs);
    if (top) { shape.lineTo(hw, top); shape.lineTo(-hw, top); }
    else { shape.quadraticCurveTo(hw, control(formeret), 0, Hs + F); shape.quadraticCurveTo(-hw, control(formeret), -hw, Hs); }
    shape.closePath();
    if (w.sill > 0) shape.holes.push(archPath(new THREE.Path(), w));
    return shape;
  }
  for (const b of bays) {
    const w = b.open, wallGeometry = place(new THREE.ExtrudeGeometry(wallShape(b, b.kind === 'tower' ? towerTop : 0),
      {depth: T, bevelEnabled: false, curveSegments: 14}), b);
    // The window's wall stays one extrusion with one hole (portal-check).
    if (b.kind === 'window') windowWall = wallGeometry; else walls.push(wallGeometry);
    const depth = w.depth ?? (b.kind === 'window' || b.kind === 'tower' ? T : null);
    if (b.kind === 'window' || b.kind === 'tower') continue;
    // Deeper than the wall: its reveals run on behind it.
    // (The door's passage is dark slate beyond the wall, like its floor.)
    if (depth > T) (b.kind === 'door' ? passage : walls).push(place(reveal(outline(w), T, depth, w.sill > 0), b));
    // Shallower: a back closes it inside the wall.
    // At the door's passage the far end is the outer door: dark oak
    // (doorLeaf, its own darker timber), with three iron straps. Elsewhere
    // the back of the niche, in stone.
    if (b.kind === 'door') {
      doorLeaf = place(panel(w, depth), b);
      for (const y of [.35, 1.0, 1.65]) doorStraps.push(place(box(2 * archHalfAt(w, y + .03) - .04, .035, .012, 0, y, depth - .008), b));
    } else walls.push(place(panel(w, depth), b));
  }

  // ---- What the bays hold.
  // The study nook: a worktop at desk height with a thin apron, the shelf the
  // tools stand on (its top at 1.4375 m, as before) and one more above.
  const nook = bay('nook'), nookOpen = nook.open, nookWidth = 2 * nookOpen.halfWidth - .02;
  const nookDesk = .74, nookShelf = 1.42;
  timber.push(
    place(box(nookWidth, .045, nookOpen.depth + .07, 0, nookDesk - .0225, nookOpen.depth / 2 - .035), nook),
    place(box(nookWidth, .09, .03, 0, nookDesk - .09, -.055), nook),
    place(box(nookWidth, .035, .26, 0, nookShelf, nookOpen.depth - .13), nook),
    place(box(2 * archHalfAt(nookOpen, 2.02) - .03, .035, .24, 0, 1.98, nookOpen.depth - .12), nook));
  // Shelving niches: a closed cabinet below, open shelves up into the arch.
  for (const b of bays.filter(b => b.kind === 'shelves')) {
    const w = b.open, width = 2 * w.halfWidth - .02;
    timber.push(place(box(width, .86, .03, 0, .43, .045), b), place(box(width, .04, w.depth - .02, 0, .88, w.depth / 2), b));
    for (const y of [1.34, 1.8]) timber.push(place(box(width, .035, w.depth - .03, 0, y, w.depth / 2 + .01), b));
    // The top shelf meets the arch where it narrows.
    const y = 2.22;
    timber.push(place(box(2 * archHalfAt(w, y + .04) - .03, .035, w.depth - .03, 0, y, w.depth / 2 + .01), b));
  }

  // ---- Trim. A cornice runs round at the springing, broken only where the
  // window and the tower's mouth rise through it; a stone plinth runs round
  // the floor, broken by every opening that comes down to it.
  for (const b of bays) {
    const w = b.open, rising = w.peak > Hs - .1, gap = rising ? w.halfWidth + .2 : 0;
    const pieces = rising ? [[-hw, -gap], [gap, hw]] : [[-hw, hw]];
    if (b.kind !== 'tower') for (const [a, z] of pieces) if (z - a > .05)
      timber.push(place(box(z - a, .13, .1, (a + z) / 2, Hs - .065, -.05), b), place(box(z - a, .05, .06, (a + z) / 2, Hs - .155, -.03), b));
    const floorGap = w.sill === 0 ? w.halfWidth : 0;
    for (const [a, z] of floorGap ? [[-hw, -floorGap], [floorGap, hw]] : [[-hw, hw]]) if (z - a > .05)
      plinth.push(place(box(z - a, .14, .035, (a + z) / 2, .07, -.0175), b));
  }

  // ---- The gallery. Over every bay but the window's: a timber floor from
  // the wall to the inner outline (its sides on the lines to the corners, so
  // neighbouring bays meet), a fascia, and a balustrade of slim balusters
  // between rails along its open edge, returning to the wall either side of
  // the window. Beams under it at every column belong to the frame below.
  const G = tuning.gallery, inner = A - G.depth, innerHalf = hw - G.depth * Math.tan(half);
  // The floor's outline in a bay, across (x) and in from the wall (d).
  const galleryFloor = () => {
    const shape = new THREE.Shape().moveTo(-hw, 0);
    shape.lineTo(hw, 0); shape.lineTo(innerHalf, G.depth); shape.lineTo(-innerHalf, G.depth); shape.closePath();
    // Shape (x, d) extruded upward: d runs into the room (local -z).
    return new THREE.ExtrudeGeometry(shape, {depth: G.slab, bevelEnabled: false})
      .applyMatrix4(new THREE.Matrix4().makeBasis(v3(1, 0, 0), v3(0, 0, -1), v3(0, 1, 0))).translate(0, G.floor - G.slab, 0);
  };
  const rail = (length, height, y, d) => box(length, height, .07, 0, y, -d);
  for (const b of bays) {
    if (b.kind === 'window') continue;
    timber.push(place(galleryFloor(), b));
    // Along the open edge: the fascia under it, the rails and balusters on it.
    timber.push(place(rail(2 * innerHalf, .2, G.floor - G.slab - .02, G.depth - .02), b),
      place(rail(2 * innerHalf + .02, .06, G.floor + G.rail - .03, G.depth - .05), b),
      place(rail(2 * innerHalf, .05, G.floor + .1, G.depth - .05), b));
    const posts = Math.max(3, Math.round(2 * innerHalf / .22));
    for (let i = 0; i <= posts; i++) {
      const x = -innerHalf + 2 * innerHalf * i / posts;
      timber.push(place(new THREE.CylinderGeometry(.018, .022, G.rail - .14, 6).translate(x, G.floor + .07 + (G.rail - .14) / 2, -(G.depth - .05)), b));
    }
    metal.push(place(box(2 * innerHalf + .02, .012, .075, 0, G.floor + G.rail + .006, -(G.depth - .05)), b));
    // Beside the window the balustrade turns back to the wall.
    const next = bays[(b.k + 1) % sides], previous = bays[(b.k + sides - 1) % sides];
    for (const [side, neighbour] of [[-1, next], [1, previous]]) if (neighbour.kind === 'window') {
      // Along the corner line, from the open edge to the wall.
      const from = v3(side * innerHalf, 0, -(G.depth - .05)), to = v3(side * hw, 0, 0), length = from.distanceTo(to);
      const angle = Math.atan2(to.x - from.x, to.z - from.z), mid = from.clone().add(to).multiplyScalar(.5);
      for (const [height, y] of [[.06, G.floor + G.rail - .03], [.05, G.floor + .1]])
        timber.push(place(new THREE.BoxGeometry(.07, height, length).rotateY(angle).translate(mid.x, y, mid.z), b));
      for (let i = 1; i < 5; i++) {
        const p = from.clone().lerp(to, i / 5);
        timber.push(place(new THREE.CylinderGeometry(.018, .022, G.rail - .14, 6).translate(p.x, G.floor + .07 + (G.rail - .14) / 2, p.z), b));
      }
    }
  }

  // ---- One bay's frame, repeated round the room: the clustered column at
  // its corner, running up into the diagonal rib to the boss, and the bay's
  // wall rib. Bay 0's corner is the one at angle -105°.
  const cornerAngle = angleOf(0) - half, cc = Math.cos(cornerAngle), cs = Math.sin(cornerAngle);
  const radial = v3(cc, 0, cs), tangent = v3(-cs, 0, cc);
  const columnAt = (r, along) => radial.clone().multiplyScalar(r).addScaledVector(tangent, along);
  const base = .28, capital = Hs - .26;
  const frame = [], caps = [];
  const shaft = (r, at, top = capital) => new THREE.CylinderGeometry(r, r, top - base, 10).translate(at.x, (top + base) / 2, at.z);
  frame.push(shaft(.12, columnAt(Rc - .08, 0)), shaft(.055, columnAt(Rc - .05, .15)), shaft(.055, columnAt(Rc - .05, -.15)));
  {
    const at = columnAt(Rc - .07, 0);
    caps.push(new THREE.CylinderGeometry(.2, .23, base, 8).translate(at.x, base / 2, at.z),
      new THREE.CylinderGeometry(.21, .13, .2, 10).translate(at.x, capital + .1, at.z),
      new THREE.BoxGeometry(.46, .06, .46).rotateY(-cornerAngle).translate(at.x, capital + .23, at.z));
  }
  // The diagonal rib, from the capital to the boss: vertical where it springs,
  // level where it meets the crown.
  const ribPoint = (s, r0 = Rc) => {
    const c = Math.cos(s * Math.PI / 2), radius = rb + (r0 - rb) * c;
    return v3(cc * radius, Hs + (Ha - Hs) * Math.sin(s * Math.PI / 2), cs * radius);
  };
  const ribCurve = new THREE.CatmullRomCurve3(Array.from({length: 17}, (_, i) => ribPoint(i / 16, Rc - .07)));
  frame.push(new THREE.TubeGeometry(ribCurve, 28, tuning.rib, 6, false));
  // Bay 0's wall rib, a little proud of the wall, along the arch its wall rises into.
  const b0 = bays[0];
  const wallRib = new THREE.CatmullRomCurve3(Array.from({length: 21}, (_, i) => {
    const u = -hw + 2 * hw * i / 20;
    return b0.map(u, archTop(formeret, u), .04);
  }));
  frame.push(new THREE.TubeGeometry(wallRib, 24, tuning.wallRib, 5, false));
  // The beam under the gallery at this corner, from the wall to its open
  // edge, along the line between the bays.
  {
    const along = Rc - (Rc - inner / Math.cos(half)) / 2, length = Rc - inner / Math.cos(half);
    frame.push(new THREE.BoxGeometry(.16, .22, length).rotateY(Math.atan2(cc, cs))
      .translate(cc * along, G.floor - G.slab - .11, cs * along));
  }
  const instances = Array.from({length: sides}, (_, k) => new THREE.Matrix4().makeRotationY(-k * step));

  // ---- The vault: one cell over each bay, from its wall rib up to the boss.
  // t runs across the bay (-1..1, corner to corner), s from the wall rib (0)
  // to the boss (1). Across, each cell keeps its wall rib's rise, fading to
  // nothing at the boss, so the cells vault up between the ribs.
  const lift = t => archTop(formeret, t * hw) - Hs;
  function cellPoint(b, t, s) {
    const wx = b.centre.x + t * hw * b.right.x, wz = b.centre.z + t * hw * b.right.z;
    const a = b.theta + t * half, bx = rb * Math.cos(a), bz = rb * Math.sin(a);
    const c = Math.cos(s * Math.PI / 2), y = Hs + (Ha - Hs) * Math.sin(s * Math.PI / 2) + lift(t) * (1 - s) ** 2;
    return v3(bx + (wx - bx) * c, y, bz + (wz - bz) * c);
  }
  const vault = (() => {
    const nt = 14, ns = 14, position = [], normal = [], uv = [];
    for (const b of bays) {
      const grid = [];
      for (let i = 0; i <= ns; i++) for (let j = 0; j <= nt; j++) {
        const t = -1 + 2 * j / nt, s = i / ns * .995, p = cellPoint(b, t, s);
        const e = .002, dt = cellPoint(b, Math.min(1, t + e), s).sub(cellPoint(b, Math.max(-1, t - e), s));
        const ds = cellPoint(b, t, Math.min(1, s + e)).sub(cellPoint(b, t, Math.max(0, s - e)));
        const n = new THREE.Vector3().crossVectors(dt, ds).normalize();
        // Facing the room: toward the dome's centre at the springing.
        if (n.x * -p.x + n.y * (Hs - p.y) + n.z * -p.z < 0) n.negate();
        grid.push({p, n, uv: [j / nt, i / ns]});
      }
      for (let i = 0; i < ns; i++) for (let j = 0; j < nt; j++) {
        const a = grid[i * (nt + 1) + j], bq = grid[i * (nt + 1) + j + 1], c = grid[(i + 1) * (nt + 1) + j + 1], d = grid[(i + 1) * (nt + 1) + j];
        const face = new THREE.Vector3().subVectors(bq.p, a.p).cross(new THREE.Vector3().subVectors(d.p, a.p));
        const order = face.dot(a.n) > 0 ? [a, bq, c, a, c, d] : [a, c, bq, a, d, c];
        for (const q of order) { position.push(q.p.x, q.p.y, q.p.z); normal.push(q.n.x, q.n.y, q.n.z); uv.push(...q.uv); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  })();
  // The boss: a ring where the ribs meet, a cap over its eye, and a pendant.
  metal.push(new THREE.TorusGeometry(rb, .07, 6, 24).rotateX(Math.PI / 2).translate(0, Ha + .01, 0),
    new THREE.CircleGeometry(rb + .02, 24).rotateX(Math.PI / 2).translate(0, Ha + .06, 0),
    new THREE.ConeGeometry(.09, .3, 8).rotateX(Math.PI).translate(0, Ha - .12, 0));
  // The lantern hanging from it: a rod, a cap, a glass cage and a finial.
  const L = tuning.lantern, lanternTop = Ha - L.drop;
  metal.push(new THREE.CylinderGeometry(.012, .012, L.drop - .2, 5).translate(0, lanternTop + (L.drop - .2) / 2 + .03, 0),
    new THREE.ConeGeometry(L.radius * 1.15, .16, 8).translate(0, lanternTop - .02, 0),
    new THREE.ConeGeometry(.05, .2, 8).rotateX(Math.PI).translate(0, lanternTop - L.height - .12, 0),
    new THREE.CylinderGeometry(L.radius * .75, L.radius * .75, .03, 8).translate(0, lanternTop - L.height - .015, 0));
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    metal.push(new THREE.BoxGeometry(.018, L.height, .018).translate(Math.cos(a) * L.radius * .98, lanternTop - .08 - L.height / 2, Math.sin(a) * L.radius * .98));
  }
  // Its profile from the bottom up, so the faces turn outward.
  const lanternGlass = new THREE.LatheGeometry([[.001, -L.height + .01], [L.radius * .6, -L.height + .02], [L.radius * .96, -L.height + .12], [L.radius * .96, -.12], [L.radius * .7, -.03], [.001, 0]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 8).translate(0, lanternTop - .08, 0);

  // ---- Stone texture coordinates: along the room for faces turned to it,
  // through the wall for reveals, plan x and z for level faces.
  function wallUV(g) {
    const p = g.attributes.position, n = g.attributes.normal;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z) || 1;
      const ny = n.getY(i), facing = Math.abs((n.getX(i) * x + n.getZ(i) * z) / r);
      if (Math.abs(ny) > .7) { uv[i * 2] = x; uv[i * 2 + 1] = z; }
      else if (facing > .5) { uv[i * 2] = Math.atan2(z, x) * A; uv[i * 2 + 1] = y; }
      else { uv[i * 2] = r; uv[i * 2 + 1] = y; }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }
  walls.forEach(wallUV); wallUV(windowWall); plinth.forEach(wallUV);

  // ---- Where things are, for the rest of the room. Signed distance past the
  // walls (positive = beyond), per bay plane; an opening that comes down to
  // the floor lets its recess (or the door's passage) count as room.
  function beyond(x, z, hit, tower) {
    hit.p = -Infinity;
    // Within a recess that comes down to the floor, only its own back and
    // sides bound it; elsewhere the nearest of the twelve planes.
    for (const b of bays) {
      const u = x * b.right.x + z * b.right.z, along = x * b.out.x + z * b.out.z, w = b.open;
      if (w.sill > 0 || !(w.depth > 0) || along < A - .02 || Math.abs(u) > w.halfWidth) continue;
      const back = along - A - w.depth, side = Math.abs(u) - w.halfWidth;
      if (back > side) { hit.p = back; hit.nx = -b.out.x; hit.nz = -b.out.z; hit.t = u; }
      else { const sign = Math.sign(u) || 1; hit.p = side; hit.nx = -sign * b.right.x; hit.nz = -sign * b.right.z; hit.t = along; }
      hit.id = b.k;
      return hit;
    }
    for (const b of bays) {
      const u = x * b.right.x + z * b.right.z, along = x * b.out.x + z * b.out.z;
      const p = along - (b.kind === 'tower' && Math.abs(u) < b.open.halfWidth ? Infinity : A);
      if (p > hit.p) { hit.p = p; hit.nx = -b.out.x; hit.nz = -b.out.z; hit.id = b.k; hit.t = u; }
    }
    if (tower) {
      // In the tower: its round wall, wherever it lies beyond the mouth.
      const b = bay('tower'), along = x * b.out.x + z * b.out.z, u = x * b.right.x + z * b.right.z;
      if (along > A - .02 && Math.abs(u) < Math.max(hw + .3, tower.r)) {
        const dx = x - tower.x, dz = z - tower.z, d = Math.hypot(dx, dz) || 1;
        hit.p = d - tower.r; hit.nx = -dx / d; hit.nz = -dz / d; hit.id = sides; hit.t = Math.atan2(dz, dx) * tower.r;
      }
    }
    return hit;
  }
  // The floor's extent along z at plan x: the chamber, the openings' floors
  // and (given) the tower's circle. Boards run on under the walls a little.
  function footprint(x, tower) {
    let back = -Infinity, front = Infinity;
    for (const b of bays) {
      const c = b.out.x, s = b.out.z, reach = A + T / 2;
      if (Math.abs(s) < 1e-6) { if (x * c > reach) { back = Infinity; front = -Infinity; } continue; }
      const z = (reach - x * c) / s;
      if (s > 0) front = Math.min(front, z); else back = Math.max(back, z);
    }
    if (back > front) { back = Infinity; front = -Infinity; }
    for (const b of bays) {
      const w = b.open;
      // (The door's passage has its own floor of dark slate: passageFloor.)
      if (w.sill > 0 || !(w.depth > T) || b.kind === 'door') continue;
      // The recess, as a box in plan: across ±halfWidth, out to its depth.
      const corners = [[-w.halfWidth, 0], [w.halfWidth, 0], [w.halfWidth, w.depth], [-w.halfWidth, w.depth]]
        .map(([u, d]) => b.map(u, 0, -d));
      const xs = corners.map(p => p.x), zs = corners.map(p => p.z);
      if (x >= Math.min(...xs) - 1e-6 && x <= Math.max(...xs) + 1e-6) { back = Math.min(back, Math.min(...zs)); front = Math.max(front, Math.max(...zs)); }
    }
    if (tower && Math.abs(x - tower.x) <= tower.r + T / 2) {
      const s = Math.sqrt((tower.r + T / 2) ** 2 - (x - tower.x) ** 2);
      back = Math.min(back, tower.z - s); front = Math.max(front, tower.z + s);
    }
    return [back, front];
  }
  // What is overhead at a plan point (near enough to hang lamps from): the
  // gallery's underside within its band, else the vault.
  function ceilingAt(x, z) {
    const angle = Math.atan2(z, x), k = ((Math.round((angle - angleOf(0)) / step) % sides) + sides) % sides, b = bays[k];
    const off = Math.atan2(Math.sin(angle - b.theta), Math.cos(angle - b.theta)), t = Math.tan(off) / Math.tan(half);
    const wallR = A / Math.cos(off), r = Math.hypot(x, z);
    if (b.kind !== 'window' && x * b.out.x + z * b.out.z >= inner) return G.floor - G.slab;
    if (r >= wallR) return Hs + lift(t);
    const c = Math.min(1, Math.max(0, (r - rb) / (wallR - rb))), s = Math.acos(c) * 2 / Math.PI;
    return Hs + (Ha - Hs) * Math.sin(s * Math.PI / 2) + lift(t) * (1 - s) ** 2;
  }

  // ---- Furnishing, simplified (the concept's bottles and props are left
  // out): books standing along the shelving niches' open shelves, and a
  // banner hung in each blind arch. Placements only; room-scene.js draws
  // the books and the banners as one mesh each.
  // Books: a colour and one of a few shades each (bookPalette: room-scene.js
  // paints them into a small texture).
  const BOOK_COLOURS = ['#5e1f24', '#2f4a2c', '#23385a', '#5a3a1e', '#7a5a22', '#45264f', '#3b3b33', '#6b2c1a'], SHADES = 4;
  function furnish(random) {
    const books = [], banners = [];
    const colours = BOOK_COLOURS;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), z = new THREE.Vector3(0, 0, 1);
    for (const b of bays.filter(b => b.kind === 'shelves')) {
      const w = b.open;
      for (const [y, room] of [[1.3575, .42], [1.8175, .38], [2.2375, .3]]) {
        const half = archHalfAt(w, y + .25) - .05;
        let x = -half;
        while (x < half) {
          if (random() < .12) { x += .06 + random() * .2; continue; }
          const width = .024 + random() * .036, height = Math.min(room - .03, .17 + random() * .13), depth = .14 + random() * .07;
          if (x + width > half) break;
          const lean = random() < .07 ? (random() - .5) * .5 : 0;
          p.set(x + width / 2, y + height / 2 * Math.cos(lean), w.depth - depth / 2 - .02).applyMatrix4(b.matrix);
          q.setFromRotationMatrix(new THREE.Matrix4().extractRotation(b.matrix)).multiply(new THREE.Quaternion().setFromAxisAngle(z, lean));
          books.push({matrix: m.compose(p, q, s.set(width, height, depth)).clone(),
            colour: Math.floor(random() * colours.length), shade: Math.round(random() * (SHADES - 1))});
          x += width + .003;
        }
      }
    }
    for (const b of bays.filter(b => b.kind === 'blind')) {
      const w = b.open, top = w.peak - .3, bottom = w.sill + .5;
      banners.push({width: .64, height: top - bottom, matrix: new THREE.Matrix4().makeTranslation(0, (top + bottom) / 2, w.depth - .025).premultiply(b.matrix)});
    }
    return {books, banners};
  }

  // ---- Lamps and candles: the room's warm light, as things you can see.
  // A brass sconce with a glass chimney on the room's face of six columns
  // (either side of the window, two on the right wall, two on the left), and
  // a few candles on the shelving niches' cabinets and at the ends of the
  // nook's worktop. Glass and flames glow (room-scene.js puts them with the
  // lantern's glass); wax and brass go with the books and the bronze.
  const glow = [], wax = [], sconces = [];
  const SCONCES = [0, 1, 4, 5, 8, 11];
  {
    const parts = {brass: [], glass: []}, at = Rc - .26, y = 2.05;
    const p = (x, yy, z) => [cc * x - cs * z, yy, cs * x + cc * z];
    const put = (g, [x, yy, z]) => g.translate(x, yy, z);
    // Built at corner 0 (along +radial from the axis), then turned to each.
    parts.brass.push(new THREE.BoxGeometry(.2, .035, .035).rotateY(-cornerAngle).translate(cc * (at + .1), y - .04, cs * (at + .1)),
      put(new THREE.CylinderGeometry(.055, .035, .05, 8), p(at, y, 0)),
      put(new THREE.ConeGeometry(.05, .06, 8), p(at, y + .2, 0)));
    parts.glass.push(put(new THREE.CylinderGeometry(.034, .04, .15, 8), p(at, y + .1, 0)));
    for (const k of SCONCES) {
      const turn = new THREE.Matrix4().makeRotationY(-k * step);
      metal.push(...parts.brass.map(g => g.clone().applyMatrix4(turn)));
      glow.push(...parts.glass.map(g => g.clone().applyMatrix4(turn)));
      sconces.push(v3(cc * at, y + .1, cs * at).applyMatrix4(turn));
    }
  }
  const candle = (b, x, top, z, height) => {
    wax.push(place(new THREE.CylinderGeometry(.021, .024, height, 8).translate(x, top + height / 2, z), b));
    glow.push(place(new THREE.ConeGeometry(.011, .038, 6).translate(x, top + height + .024, z), b));
  };
  for (const b of bays.filter(b => b.kind === 'shelves'))
    [[-.55, .16], [-.12, .11], [.47, .2]].forEach(([x, h]) => candle(b, x, .9, b.open.depth * .45, h));
  for (const x of [-.82, .82]) candle(nook, x, nookDesk, nookOpen.depth * .55, .14);

  const door = bay('door'), win = bay('window'), mouth = bay('tower');
  return {
    tuning, bays, hw, corner: Rc, archTop, outline,
    window: {...win.open, x: 0, z: win.centre.z, map: win.map},
    door: {...door.open, x: 0, z: door.centre.z, map: door.map},
    nook: {...nook.open, x: nook.centre.x, z: 0, desk: nookDesk, shelf: nookShelf, back: nook.centre.x - nook.open.depth, map: nook.map},
    mouth: {...mouth.open, theta: mouth.theta, out: mouth.out, centre: mouth.centre, map: mouth.map},
    // The door's passage floor, from mid-wall to the outer door.
    passageFloor: place(new THREE.PlaneGeometry(2 * door.open.halfWidth, door.open.depth - T / 2).rotateX(-Math.PI / 2)
      .translate(0, .0015, T / 4 + door.open.depth / 2), door),
    passage,
    parts: {walls, windowWall, doorLeaf, doorStraps, plinth, timber, metal, vault, lanternGlass, lanternAt: v3(0, lanternTop - .08 - L.height / 2, 0), glow, wax},
    // Where each sconce's glass is (plan), by corner (SCONCES).
    sconces: Object.fromEntries(SCONCES.map((k, i) => [k, sconces[i]])),
    frame: {geometry: frame, caps, instances},
    beyond, footprint, ceilingAt, furnish, bookPalette: {colours: BOOK_COLOURS, shades: SHADES},
    stats: {bays: sides, cells: sides, instances: sides},
  };
}
