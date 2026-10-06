/* Magical smoke on the floor: soft, low trails that lead the visitor through
   the room. A trail is a few strands; each strand is a low arch of mist along
   a curve just above the boards. Its fragment shader breaks the mist into
   drifting wisps with a small tiling noise texture of its own; its vertex
   shader lets the strand wander a little, so nothing reads as a rigid tube or
   a line of particles. Brightest where the eye looks through the middle of an
   arch (like the room's light shafts), fading at its edges and where it
   meets the floor. It owns no loop: room-scene.js advances it with the
   foreground layer it is drawn on, and leaves it still under reduced motion.
   Coordinates are the room's: metres, the table centre at the origin. */
export function createRoomSmoke(THREE, {trails, anisotropy = 1}) {
  // A tiling value-noise texture: two independent octave sums in R and G.
  // Its own seeded generator: the room's shared one lays out the planks, the
  // sky and the cloth, and must not be advanced.
  function noiseTexture(size = 256) {
    let seed = 7919;
    const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
    const data = new Uint8Array(size * size * 4);
    for (const channel of [0, 1]) {
      const field = new Float32Array(size * size);
      for (let octave = 0, cells = 4, amplitude = .5; octave < 5; octave++, cells *= 2, amplitude /= 2) {
        const lattice = Float32Array.from({length: cells * cells}, random);
        const at = (i, j) => lattice[(j % cells) * cells + (i % cells)];
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          const fx = x / size * cells, fy = y / size * cells, i = Math.floor(fx), j = Math.floor(fy);
          const u = fx - i, v = fy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
          field[y * size + x] += amplitude * (at(i, j) * (1 - su) * (1 - sv) + at(i + 1, j) * su * (1 - sv)
            + at(i, j + 1) * (1 - su) * sv + at(i + 1, j + 1) * su * sv);
        }
      }
      for (let k = 0; k < field.length; k++) data[k * 4 + channel] = Math.round(Math.min(1, field[k] / .97) * 255);
    }
    for (let k = 0; k < size * size; k++) data[k * 4 + 3] = 255;
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true; texture.anisotropy = anisotropy; texture.needsUpdate = true;
    return texture;
  }

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uNoise: {value: noiseTexture()}, uTime: {value: 0}, uReveal: {value: 1e3}, uPresence: {value: 1},
      // Live tuning (see `tuning` below): gain into a soft saturation, the
      // extra density far off, how deep the thin stretches go, the veil's share.
      uGain: {value: 2.2}, uFar: {value: .5}, uThin: {value: .5}, uVeil: {value: 1},
      uBrightness: {value: .6}, uCool: {value: new THREE.Color('#86c3bd')}, uWarm: {value: new THREE.Color('#aaa5e6')},
    },
    vertexShader: `
      attribute vec3 lateral; attribute vec4 strand; attribute float fade;
      uniform float uTime;
      varying vec3 vNormal, vView; varying vec2 vPath; varying float vAcross, vFade, vDensity, vSeed, vFlat, vSpeed;
      void main() {
        float s = uv.x, t = uTime * strand.y + strand.x;
        // A slow wander sideways and a soft rise and fall: never two strands alike.
        float wander = .6 * sin(s * .85 + t * .21) + .4 * sin(s * 2.1 - t * .33 + strand.x * 1.7);
        float swell = .5 + .5 * sin(s * 1.6 + t * .27 + strand.x);
        vec3 p = position + lateral * wander * .07;
        p.y *= .8 + .45 * swell;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        vNormal = normalize(normalMatrix * normal); vView = -mv.xyz;
        vPath = vec2(s, uv.y); vAcross = uv.y; vFade = fade; vDensity = strand.z; vSeed = strand.x; vFlat = strand.w; vSpeed = strand.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uNoise; uniform float uTime, uReveal, uPresence, uBrightness, uGain, uFar, uThin, uVeil; uniform vec3 uCool, uWarm;
      varying vec3 vNormal, vView; varying vec2 vPath; varying float vAcross, vFade, vDensity, vSeed, vFlat, vSpeed;
      void main() {
        // An arch is thickest where the eye looks through its middle; a flat
        // veil is thickest seen at a glance, through more of it.
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float core = mix(pow(facing, 1.35), uVeil * min(1.2, .32 / max(facing, .27)), vFlat);
        // Wisps flowing along the trail, their pattern curled by a slower field.
        vec2 p = vec2(vPath.x * .42 - uTime * .035 * vSpeed, vPath.y * .9 + vSeed * .37);
        vec2 warp = texture2D(uNoise, p * .45 + vec2(uTime * .009, vSeed)).rg - .5;
        float broad = texture2D(uNoise, p + warp * 1.1).r;
        float fine = texture2D(uNoise, p * 2.6 + warp * 1.7 - vec2(uTime * .02, 0.)).g;
        float wisp = smoothstep(.3, .8, broad * .7 + fine * .42);
        // Thin where the arch meets the floor; soft where the trail begins and
        // ends; gone ahead of the reveal while the trail grows in.
        float edges = smoothstep(0., .3 + .25 * broad, vAcross) * smoothstep(1., .7 - .25 * fine, vAcross);
        // Thicker and thinner stretches drift slowly along the trail.
        float stretch = 1. - uThin + uThin * smoothstep(.3, .7, texture2D(uNoise, vec2(vPath.x * .07 - uTime * .004 * vSpeed, vSeed * .5)).g);
        float reveal = smoothstep(uReveal, uReveal - 1.4, vPath.x);
        // Far off it gathers a little, so the trail still reads where it ends.
        float far = clamp(length(vView) / 6., 0., 1.);
        float raw = core * wisp * edges * stretch * vFade * vDensity * (1. + uFar * far);
        // A soft saturation: faint mist still reads, thick mist never turns solid.
        float d = (1. - exp(-uGain * raw)) * reveal * uPresence;
        vec3 color = mix(uCool, uWarm, .35 * smoothstep(.45, .85, fine)) * uBrightness;
        // Premultiplied: mostly light, with a little veil over what lies behind.
        gl_FragColor = vec4(color * d, d * .22);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, premultipliedAlpha: true,
  });

  // One strand: a low arch swept along the curve, its width and height
  // varying along the way (fixed per strand, so the shape is calm). Its
  // sideways offset may drift from `offset` to `offsetEnd` over the first
  // half, so strands of two branches can cross where the branches part.
  function strand(curve, {offset = 0, offsetEnd = offset, width = .25, height = .12, phase = 0, speed = 1, density = 1, wobble = .35,
    fadeIn = 1.6, fadeOut = .9}) {
    const length = curve.getLength(), segments = Math.max(24, Math.round(length * 16)), sides = 8;
    const up = new THREE.Vector3(0, 1, 0), point = new THREE.Vector3(), tangent = new THREE.Vector3(), side = new THREE.Vector3();
    const position = [], normal = [], uv = [], lateral = [], params = [], fade = [], index = [];
    for (let i = 0; i <= segments; i++) {
      const u = i / segments, s = u * length;
      curve.getPointAt(u, point); curve.getTangentAt(u, tangent);
      side.crossVectors(up, tangent).normalize();
      // Smoothly varying width and height (sums of sines with this strand's phase).
      const vary = k => 1 + wobble * (.6 * Math.sin(s * k + phase) + .4 * Math.sin(s * k * 2.7 + phase * 1.9));
      const w = width * vary(1.3), h = height * vary(.9), shift = Math.min(1, u / .5);
      const across = offset + (offsetEnd - offset) * shift * shift * (3 - 2 * shift);
      // It gathers out of nothing over its first metres and thins away at its end.
      const ends = Math.min(1, s / fadeIn) * Math.min(1, (length - s) / fadeOut);
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * Math.PI, c = Math.cos(a), n = Math.sin(a);
        position.push(point.x + side.x * (across + w * c), point.y + h * n, point.z + side.z * (across + w * c));
        normal.push(side.x * c, n, side.z * c);
        uv.push(s, j / sides);
        lateral.push(side.x, 0, side.z);
        params.push(phase, speed, density, height > .005 ? 0 : 1);
        fade.push(ends * ends * (3 - 2 * ends));
      }
    }
    for (let i = 0; i < segments; i++) for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j, b = a + sides + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setAttribute('lateral', new THREE.Float32BufferAttribute(lateral, 3));
    geometry.setAttribute('strand', new THREE.Float32BufferAttribute(params, 4));
    geometry.setAttribute('fade', new THREE.Float32BufferAttribute(fade, 1));
    geometry.setIndex(index);
    return geometry;
  }

  const group = new THREE.Group();
  group.name = 'smoke on the floor';
  let triangles = 0, longest = 0;
  for (const trail of trails) {
    const curve = new THREE.CatmullRomCurve3(trail.points.map(([x, z]) => new THREE.Vector3(x, .012, z)), false, 'centripetal');
    longest = Math.max(longest, curve.getLength());
    for (const settings of trail.strands) {
      // A trail may set how far it takes to gather (fadeIn) and to thin away (fadeOut).
      const geometry = strand(curve, {fadeIn: trail.fadeIn ?? 1.6, fadeOut: trail.fadeOut ?? .9, ...settings});
      triangles += geometry.index.count / 3;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = trail.name + ' smoke'; mesh.frustumCulled = false; mesh.renderOrder = 4;
      group.add(mesh);
    }
  }
  return {
    group, material,
    // seconds: the animation clock; reveal: metres of trail grown in so far.
    update(seconds, reveal = longest + 2) {
      material.uniforms.uTime.value = seconds;
      material.uniforms.uReveal.value = reveal;
    },
    // Live tuning: gain, far, thin, veil, brightness (uniform values).
    tuning: Object.fromEntries(['Gain', 'Far', 'Thin', 'Veil', 'Brightness'].map(k => [k.toLowerCase(), material.uniforms['u' + k]])),
    set presence(value) { material.uniforms.uPresence.value = value; group.visible = value > .001; },
    get presence() { return material.uniforms.uPresence.value; },
    stats: {strands: group.children.length, triangles, longest},
  };
}
