/* The table is a single room-lit artifact, not a second renderer. Geometry
   follows the CSS aperture's local pixels; its four supports leave the void
   open. No animation loop, lights, textures or WebGL contexts are added. */
export function createRitualTable(THREE, woodMap) {
  const group = new THREE.Group();
  group.name = 'hexagonal ritual table';
  const materials = [
    new THREE.MeshStandardMaterial({color: '#30261c', map: woodMap, roughness: .94,
      emissive: '#392a1c', emissiveIntensity: .28}),
    new THREE.MeshStandardMaterial({color: '#655237', metalness: .65, roughness: .73}),
    new THREE.MeshStandardMaterial({color: '#201e1b', metalness: .25, roughness: .83}),
    new THREE.MeshStandardMaterial({color: '#367d75', emissive: '#1a5b52', emissiveIntensity: .24,
      metalness: .35, roughness: .53}),
  ];
  const names = ['carved walnut body and buttresses', 'aged bronze rim and clasps',
    'recessed engraving and footstones', 'quiet jade inlay'];
  const stats = {meshes: 0, triangles: 0, builds: 0, width: 0, depth: 0, apertureDiameter: 0};
  let signature = '';
  const TAU = Math.PI * 2;

  // One mesh per material: keeping each little inlay as a Mesh would add
  // unnecessary draw calls. Source geometry is discarded after combining.
  function merge(parts) {
    const arrays = {position: [], normal: [], uv: []};
    for (const source of parts) {
      const geometry = source.index ? source.toNonIndexed() : source;
      for (const name of Object.keys(arrays)) arrays[name].push(geometry.attributes[name].array);
      if (geometry !== source) geometry.dispose();
      source.dispose();
    }
    const result = new THREE.BufferGeometry();
    for (const [name, chunks] of Object.entries(arrays)) {
      const data = new Float32Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {data.set(chunk, offset); offset += chunk.length;}
      result.setAttribute(name, new THREE.BufferAttribute(data, name === 'uv' ? 2 : 3));
    }
    result.computeBoundingSphere();
    return result;
  }
  function polygon(points) {
    const path = new THREE.Shape();
    points.forEach(([x, z], i) => i ? path.lineTo(x, -z) : path.moveTo(x, -z));
    path.closePath();
    return path;
  }
  function ring(outer, inner) {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outer, 0, TAU, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, inner, 0, TAU, true);
    shape.holes.push(hole);
    return shape;
  }
  // The extrusion ends at `top`, including the bevel. Its 2D coordinates
  // become world X/Z; the table stays exactly at the existing knee height.
  function horizontal(shape, top, thickness, bevel = 0, segments = 32) {
    const geometry = new THREE.ExtrudeGeometry(shape, {depth: thickness - bevel * 2,
      bevelEnabled: bevel > 0, bevelSegments: 1, bevelSize: bevel,
      bevelThickness: bevel, steps: 1, curveSegments: segments});
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, top - thickness + bevel, 0);
    return geometry;
  }
  function box(w, h, d, x, y, z, angle = 0) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.rotateY(-angle);
    geometry.translate(x, y, z);
    return geometry;
  }

  function update(shape, view) {
    if (!shape?.outline?.length || !view?.units) return;
    const next = [view.units, view.tableHeight, shape.width, shape.height, shape.radius,
      ...shape.outline.flat()].join(':');
    if (next === signature) return;
    signature = next;
    const units = view.units, top = view.tableHeight;
    const points = shape.outline.map(([x, z]) => [x / units, z / units]);
    const width = shape.width / units, depth = shape.height / units, radius = shape.radius / units;
    const parts = [[], [], [], []];
    // The aperture is a true hole all the way through: neither a slab nor a
    // support spans it. Small bevels catch the room's actual grazing light.
    const body = polygon(points), hole = new THREE.Path();
    hole.absarc(0, 0, radius + .014, 0, TAU, true);body.holes.push(hole);
    parts[0].push(horizontal(body, top - .009, .077, .008, 28));

    const outer = polygon(points);
    const inner = polygon(points.map(([x, z]) => [x * .976, z * .976]));
    outer.holes.push(new THREE.Path(inner.getPoints()));
    parts[1].push(horizontal(outer, top + .001, .019, 0, 1));
    parts[1].push(horizontal(ring(radius + .042, radius), top, .028, .003, 28));
    // The fine dark channel interrupts the collar's reflected highlight.
    parts[2].push(horizontal(ring(radius + .030, radius + .026), top + .0006, .001, 0, 28));

    for (let i = 0; i < 6; i++) {
      const [vx, vz] = points[i], angle = Math.atan2(vz, vx);
      const radial = Math.hypot(vx, vz), c = Math.cos(angle), s = Math.sin(angle);
      const point = (r, tangent = 0) => [c * r - s * tangent, s * r + c * tangent];
      // Short clasp at each corner; not a glowing line around the whole top.
      parts[1].push(horizontal(polygon([
        point(radial - .095, -.015), point(radial - .017, -.011),
        point(radial - .010, 0), point(radial - .017, .011), point(radial - .095, .015),
      ]), top + .002, .006, 0, 1));
      // Six small incised chevrons articulate the collar without lettering
      // textures or repeated large symbols competing with the portal.
      const r = radius + .018;
      parts[2].push(horizontal(polygon([
        point(r - .007, -.010), point(r + .006, 0), point(r - .007, .010),
        point(r - .002, 0),
      ]), top + .001, .001, 0, 1));
      const distance = radius + .067;
      if (distance + .045 < radial) {
        parts[3].push(horizontal(polygon([
          point(distance, -.0025), point(distance + .032, -.0025),
          point(distance + .039, 0), point(distance + .032, .0025), point(distance, .0025),
        ]), top - .005, .003, 0, 1));
      }
    }

    // Four carved, splayed buttresses support the corner facets. A wider
    // shoulder gathers under the rim; a quiet stone shoe anchors each foot.
    // Their curved-looking polygon profile keeps the centre entirely open.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const ax = sx * width * .335, az = sz * depth * .235;
      const angle = Math.atan2(az, ax), c = Math.cos(angle), s = Math.sin(angle);
      // Fit the shoulder inside its actual facet, including on the narrower
      // portrait table. Fixed-width shoulders otherwise float beside the top.
      const outer = Math.min(...points.map((a,i) => {
        const b=points[(i+1)%points.length], den=c*(b[1]-a[1])-s*(b[0]-a[0]);
        const r=(a[0]*b[1]-a[1]*b[0])/den;return r>0?r:Infinity;
      }));
      const shoulder = (radius + outer) / 2;
      const detail = Math.min(1, width/1.55, (outer-radius)/.17);
      const breadth = Math.max(.8,detail); // retain carved mass on portrait screens
      const foot = shoulder + .035*detail;
      const profile = new THREE.Shape();
      const outline = [[shoulder - .045*detail, top - .063], [shoulder + .076*detail, top - .070],
        [shoulder + .059*detail, top - .145], [foot + .043*detail, .115], [foot + .066*detail, .052],
        [foot - .061*detail, .052], [foot - .046*detail, .135], [shoulder - .032*detail, top - .175]];
      outline.forEach(([r, y], i) => i ? profile.lineTo(r, y) : profile.moveTo(r, y));
      profile.closePath();
      const support = new THREE.ExtrudeGeometry(profile, {depth: .102*breadth, bevelEnabled: true,
        bevelSize: .006*detail, bevelThickness: .006*detail, bevelSegments: 1, steps: 1, curveSegments: 1});
      support.translate(0, 0, -.051*breadth);support.rotateY(-angle);parts[0].push(support);
      parts[2].push(box(.184*detail, .043, .161*breadth, c * foot, .024, s * foot, angle));
      parts[1].push(box(.144*detail, .022, .121*breadth, c * foot, .065, s * foot, angle));
      parts[1].push(box(.117*detail, .023, .119*breadth, c * shoulder, top - .091, s * shoulder, angle));
    }

    for (const child of [...group.children]) {child.geometry.dispose();group.remove(child);}
    stats.triangles = 0;
    parts.forEach((geometries, i) => {
      if (!geometries.length) return;
      const geometry = merge(geometries), mesh = new THREE.Mesh(geometry, materials[i]);
      mesh.name = names[i];mesh.castShadow = i !== 3;mesh.receiveShadow = true;
      stats.triangles += geometry.attributes.position.count / 3;
      group.add(mesh);
    });
    Object.assign(stats, {meshes: group.children.length, builds: stats.builds + 1,
      width, depth, apertureDiameter: radius * 2});
  }
  return {group, update, stats};
}
