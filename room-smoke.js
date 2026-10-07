/* Magical smoke on the floor: soft, low trails that lead the visitor through
   the room. A trail is a few strands; each strand is a low arch of mist along
   a curve just above the boards. Its fragment shader breaks the mist into
   drifting wisps with a small tiling noise texture of its own; its vertex
   shader lets the strand wander a little, so nothing reads as a rigid tube or
   a line of particles. Slow surges travel along each strand, widening,
   thickening and slowing it a little as they pass, so the trail flows rather
   than lies painted on. Brightest where the eye looks through the middle of an
   arch (like the room's light shafts), fading at its edges and where it
   meets the floor. It owns no loop: room-scene.js advances it with the
   foreground layer it is drawn on, and leaves it still under reduced motion.
   Coordinates are the room's: metres, the table centre at the origin. */
export function createRoomSmoke(THREE, {trails, marks = [], lights = [], anisotropy = 1}) {
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
      // How strongly slow surges travel along the trails (0: none): where one
      // passes the mist widens, thickens and slows a little, and narrows and
      // quickens behind it, so the trail flows rather than lies painted.
      uFlow: {value: 1},
      uBrightness: {value: .6}, uCool: {value: new THREE.Color('#86c3bd')}, uWarm: {value: new THREE.Color('#aaa5e6')},
      // Up to four lamps whose light the mist catches: where (scene metres),
      // their colour times strength, and how far it carries (half at reach).
      uLampAt: {value: Array.from({length: 4}, (_, i) => new THREE.Vector3(...(lights[i]?.at ?? [0, -99, 0])))},
      uLampTint: {value: Array.from({length: 4}, (_, i) => lights[i] ? new THREE.Color(lights[i].color).multiplyScalar(lights[i].strength) : new THREE.Color(0, 0, 0))},
      uLampReach: {value: Array.from({length: 4}, (_, i) => lights[i]?.reach ?? 1)},
    },
    vertexShader: `
      attribute vec3 lateral; attribute vec4 strand; attribute float fade, spread;
      uniform float uTime, uFlow; uniform vec3 uLampAt[4]; uniform vec3 uLampTint[4]; uniform float uLampReach[4];
      varying vec3 vNormal, vView, vLamp; varying vec2 vPath; varying float vAcross, vFade, vDensity, vSeed, vFlat, vSpeed, vSurge;
      void main() {
        float s = uv.x, t = uTime * strand.y + strand.x;
        // A slow wander sideways and a soft rise and fall: never two strands alike.
        float wander = .6 * sin(s * .85 + t * .21) + .4 * sin(s * 2.1 - t * .33 + strand.x * 1.7);
        float swell = .5 + .5 * sin(s * 1.6 + t * .27 + strand.x);
        // A surge travelling along the trail, away from where it begins, some
        // stronger than others: the arch widens and billows a little as it passes.
        float surge = sin(s * .55 - uTime * .23 * strand.y + strand.x * 2.3) * (.65 + .35 * sin(s * .19 + uTime * .05 + strand.x));
        vec3 p = position + lateral * (wander * .08 + spread * uFlow * .16 * surge);
        p.y *= (.8 + .45 * swell) * (1. + uFlow * .12 * surge);
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        vNormal = normalize(normalMatrix * normal); vView = -mv.xyz;
        vPath = vec2(s, uv.y); vAcross = uv.y; vFade = fade; vDensity = strand.z; vSeed = strand.x; vFlat = strand.w; vSpeed = strand.y; vSurge = surge;
        // The lamps' light on the mist, falling off with distance.
        vec3 world = (modelMatrix * vec4(p, 1.)).xyz; vLamp = vec3(0.);
        for (int i = 0; i < 4; i++) { vec3 d = world - uLampAt[i]; float r2 = uLampReach[i] * uLampReach[i]; vLamp += uLampTint[i] * r2 / (r2 + dot(d, d)); }
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uNoise; uniform float uTime, uReveal, uPresence, uBrightness, uGain, uFar, uThin, uVeil, uFlow; uniform vec3 uCool, uWarm;
      varying vec3 vNormal, vView, vLamp; varying vec2 vPath; varying float vAcross, vFade, vDensity, vSeed, vFlat, vSpeed, vSurge;
      void main() {
        // An arch is thickest where the eye looks through its middle; a flat
        // veil is thickest seen at a glance, through more of it.
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float core = mix(pow(facing, 1.35), uVeil * min(1.2, .32 / max(facing, .27)), vFlat);
        // Wisps flowing along the trail, their pattern curled by a slower field;
        // about as long as the strands are wide, so a narrow trail is no ribbon.
        // They flow a quarter slower where a surge widens the trail and as much
        // faster where it narrows: the clock they flow by leads and lags with
        // the surge, by a bounded amount, so the pattern never smears.
        float surgeAt = vPath.x * .55 - uTime * .23 * vSpeed + vSeed * 2.3;
        float flowTime = uTime - uFlow * 1.09 / max(vSpeed, .3) * cos(surgeAt);
        vec2 p = vec2(vPath.x * .7 - flowTime * .058 * vSpeed, vPath.y * .9 + vSeed * .37);
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
        float raw = core * wisp * edges * stretch * vFade * vDensity * (1. + uFar * far) * (1. + uFlow * .2 * vSurge);
        // A soft saturation: faint mist still reads, thick mist never turns solid.
        float d = (1. - exp(-uGain * raw)) * reveal * uPresence;
        // Under a lamp the mist takes its colour: the cool palette gives way as the lamp's light grows.
        vec3 color = mix(uCool, uWarm, .35 * smoothstep(.45, .85, fine)) * uBrightness;
        color = color * (1. - .75 * clamp(max(vLamp.r, max(vLamp.g, vLamp.b)) * 1.8, 0., 1.)) + vLamp * 1.3;
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
    const position = [], normal = [], uv = [], lateral = [], spread = [], params = [], fade = [], index = [];
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
        // How far this vertex lies across the arch from its middle: what a surge widens.
        spread.push(w * c);
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
    geometry.setAttribute('spread', new THREE.Float32BufferAttribute(spread, 1));
    geometry.setAttribute('strand', new THREE.Float32BufferAttribute(params, 4));
    geometry.setAttribute('fade', new THREE.Float32BufferAttribute(fade, 1));
    geometry.setIndex(index);
    return geometry;
  }

  const group = new THREE.Group();
  group.name = 'smoke on the floor';
  // Each trail has its own material, so it can thin away on its own; all of
  // them share every other uniform (time, growth, tuning) and one program.
  const shared = {...material.uniforms};
  delete shared.uPresence;
  const presences = new Map();
  let triangles = 0, longest = 0;
  for (const trail of trails) {
    const curve = new THREE.CatmullRomCurve3(trail.points.map(([x, z]) => new THREE.Vector3(x, .012, z)), false, 'centripetal');
    longest = Math.max(longest, curve.getLength());
    const own = material.clone();
    own.uniforms = {...shared, uPresence: {value: 1}};
    const meshes = [];
    for (const settings of trail.strands) {
      // A trail may set how far it takes to gather (fadeIn) and to thin away (fadeOut).
      const geometry = strand(curve, {fadeIn: trail.fadeIn ?? 1.6, fadeOut: trail.fadeOut ?? .9, ...settings});
      triangles += geometry.index.count / 3;
      const mesh = new THREE.Mesh(geometry, own);
      mesh.name = trail.name + ' smoke'; mesh.frustumCulled = false; mesh.renderOrder = 4;
      group.add(mesh); meshes.push(mesh);
    }
    presences.set(trail.name, {uniform: own.uniforms.uPresence, meshes});
  }
  // ---- Where the visitor can stand: a slow ring of the same mist on the
  // floor at each place, `marks` [{name, at: [x, z]}]. Its wisps are drawn
  // round the circle (the noise sampled along a circle, so it has no seam)
  // and drift round it; a faint veil lies inside. Hovered, it brightens,
  // draws in a little and turns faster. It shares the trails' clock, noise
  // and colours.
  const markMaterial = new THREE.ShaderMaterial({
    uniforms: {uNoise: shared.uNoise, uTime: shared.uTime, uBrightness: shared.uBrightness, uCool: shared.uCool, uWarm: shared.uWarm,
      uPresence: {value: 1}, uHover: {value: 0}},
    vertexShader: `
      varying vec2 vAt;
      void main() { vAt = position.xz / .5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      uniform sampler2D uNoise; uniform float uTime, uBrightness, uPresence, uHover; uniform vec3 uCool, uWarm;
      varying vec2 vAt;
      void main() {
        // The mist as it lies on the floor, turned slowly about the mark's
        // centre (two layers at different speeds): seamless, and it swirls.
        float r = length(vAt), spin = uTime * (.11 + .2 * uHover);
        vec2 slow = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * vAt;
        vec2 quick = mat2(cos(spin * 1.7), sin(spin * 1.7), -sin(spin * 1.7), cos(spin * 1.7)) * vAt;
        float wisp = texture2D(uNoise, slow * .42 + vec2(.17, .29)).r;
        float fine = texture2D(uNoise, quick * 1.05 + vec2(.53, .11)).g;
        float radius = .64 - .07 * uHover;
        float ring = exp(-pow((r - radius - (wisp - .5) * .14) / (.1 + .05 * fine), 2.));
        float veil = (1. - smoothstep(0., radius, r)) * .22 * wisp;
        float raw = (ring * smoothstep(.25, .75, wisp * .75 + fine * .35) + veil) * (1. + 1.3 * uHover);
        float d = (1. - exp(-1.8 * raw)) * uPresence * smoothstep(1., .9, r);
        vec3 color = mix(uCool, uWarm, .35 * smoothstep(.45, .85, fine)) * uBrightness;
        gl_FragColor = vec4(color * d, d * .22);
      }`,
    transparent: true, depthWrite: false, premultipliedAlpha: true,
  });
  const standing = new Map(), disc = new THREE.CircleGeometry(.5, 48).rotateX(-Math.PI / 2);
  for (const {name, at: [x, z]} of marks) {
    const own = markMaterial.clone();
    own.uniforms = {...markMaterial.uniforms, uPresence: {value: 0}, uHover: {value: 0}};
    const mesh = new THREE.Mesh(disc, own);
    mesh.name = name + ' standing mark'; mesh.position.set(x, .014, z); mesh.renderOrder = 4; mesh.visible = false;
    group.add(mesh); standing.set(name, {mesh, own});
    triangles += disc.index ? disc.index.count / 3 : disc.attributes.position.count / 3;
  }
  const refresh = () => { group.visible = [...presences.values()].some(p => p.uniform.value > .001)
    || [...standing.values()].some(m => m.mesh.visible); };
  return {
    group, material,
    // seconds: the animation clock; reveal: metres of trail grown in so far.
    update(seconds, reveal = longest + 2) {
      shared.uTime.value = seconds;
      shared.uReveal.value = reveal;
    },
    // Live tuning: gain, far, thin, veil, brightness, flow (uniform values).
    tuning: Object.fromEntries(['Gain', 'Far', 'Thin', 'Veil', 'Brightness', 'Flow'].map(k => [k.toLowerCase(), shared['u' + k]])),
    // How present one trail is (0..1), or all of them at once.
    setPresence(name, value) {
      const trail = presences.get(name);
      trail.uniform.value = value;
      for (const mesh of trail.meshes) mesh.visible = value > .001;
      refresh();
    },
    set presence(value) { for (const name of presences.keys()) this.setPresence(name, value); },
    get presence() { return Math.max(...[...presences.values()].map(p => p.uniform.value)); },
    presenceOf: name => presences.get(name).uniform.value,
    // One standing mark: where ([x, z]), how present (0..1) and how hovered (0..1).
    setMark(name, {at, presence, hover}) {
      const mark = standing.get(name);
      if (at) mark.mesh.position.set(at[0], .014, at[1]);
      if (presence !== undefined) { mark.own.uniforms.uPresence.value = presence; mark.mesh.visible = presence > .001; }
      if (hover !== undefined) mark.own.uniforms.uHover.value = hover;
      refresh();
    },
    markOf: name => ({presence: standing.get(name).own.uniforms.uPresence.value, hover: standing.get(name).own.uniforms.uHover.value}),
    stats: {strands: group.children.length - standing.size, triangles, longest, trails: [...presences.keys()], marks: [...standing.keys()]},
  };
}
