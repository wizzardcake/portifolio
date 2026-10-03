// The night outside the windows: a moonlit purple sky over a misty valley,
// built as layers at real distances, so they slide past one another as the
// view moves, with a little life in it: cloud drifting over the moon, mist
// moving in the valleys, the moon's path glittering on the lake, fireflies
// over the trees. Plan coordinates (the room shell's): each layer is an arc
// of a cylinder around the plan origin, seen through the windows only.
// It is composed in degrees as seen from the chair, where the alcove window
// spans azimuth 185.4-193.1 (its mullion at 189.3) and elevation -6.2 to +7.5.
// Pure presentation: room-scene.js places it, lights the room from it and
// redraws the window as it moves.
export const nightSkyTuning = {
  // In the alcove window's left light, under the fork of its tracery and
  // above the lake that carries its path.
  moon: [191.0, 1.8, 1.1], // azimuth, elevation and radius, degrees from the chair
  glow: 1,       // the moon's bloom, corona and halo ring (0-2)
  clouds: 1,     // the cloud drifting over the moon (0-2)
  mist: 1,       // mist in the valleys and haze along the horizon (0-2)
  nebula: 1,     // the band of stars and coloured dust above the tower (0-2)
  fireflies: 1,  // the little lights over the trees (0-2)
  drift: 1,      // how fast what moves outside moves (0 = still)
  brightness: 1, // the whole view
};

export function createNightSky(THREE, {eye, anisotropy = 4}) {
  const tuning = {...nightSkyTuning, moon: [...nightSkyTuning.moon]};
  const group = new THREE.Group(); group.name = 'the night outside';
  const rad = d => d * Math.PI / 180, clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  // The whole view, and the part of it that moves: only what the alcove
  // window can show, so the tower's lancets never see it change.
  const ARC = [80, 230], LIVE = [168, 212], WINDOW = 189.3;
  const canvasOf = (W, H) => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };

  // A layer's surface: radius R, heights bottom..top (m), canvas W x H over
  // the arc. at(azimuth, elevation) is where the chair's line of sight meets
  // it, in canvas px; hAt(elevation) the height it meets in the window's
  // direction; st() the same point in texture space (x left to right as
  // seen from inside, y up).
  function surface(R, bottom, top, W, H, arc = ARC) {
    const span = arc[1] - arc[0];
    const meet = azimuth => {
      const dx = Math.sin(rad(azimuth)), dz = Math.cos(rad(azimuth)), b = eye.x * dx + eye.z * dz;
      const t = -b + Math.sqrt(b * b - (eye.x ** 2 + eye.z ** 2) + R * R);
      return {t, theta: (Math.atan2(eye.x + t * dx, eye.z + t * dz) * 180 / Math.PI + 360) % 360};
    };
    const st = (azimuth, elevation) => {
      const {t, theta} = meet(azimuth), h = eye.y + t * Math.tan(rad(elevation));
      return [(arc[1] - theta) / span, (h - bottom) / (top - bottom)];
    };
    const at = (azimuth, elevation) => { const [x, y] = st(azimuth, elevation); return [x * W, (1 - y) * H]; };
    const t0 = meet(WINDOW).t, hAt = elevation => eye.y + t0 * Math.tan(rad(elevation));
    const yAt = h => (top - h) / (top - bottom) * H, xOf = theta => (arc[1] - theta) / span * W;
    // Canvas px per degree seen from the chair, near a direction.
    const scale = (azimuth, elevation) => {
      const [x0, y0] = at(azimuth - .5, elevation - .5), [x1, y1] = at(azimuth + .5, elevation + .5);
      return [Math.abs(x1 - x0), Math.abs(y1 - y0)];
    };
    return {R, bottom, top, W, H, arc, at, st, hAt, yAt, xOf, scale};
  }
  // About four degrees a facet: flat enough at these distances, and within
  // the room's triangle budget.
  function cylinder(s, material, order) {
    const facets = Math.max(8, Math.ceil((s.arc[1] - s.arc[0]) / 4));
    const geometry = new THREE.CylinderGeometry(s.R, s.R, s.top - s.bottom, facets, 1, true,
      rad(s.arc[0]), rad(s.arc[1] - s.arc[0])).translate(0, (s.top + s.bottom) / 2, 0);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = order; group.add(mesh); return mesh;
  }
  // A painted layer: canvas colours straight to the display, as painted. A
  // plain material sees the cylinder from inside, so its map is mirrored; the
  // shader layers mirror for themselves (raw values, st.x = 1 - uv.x).
  function painted(canvas, raw = false) {
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = raw ? THREE.NoColorSpace : THREE.SRGBColorSpace; map.anisotropy = anisotropy;
    if (!raw) { map.wrapS = THREE.RepeatWrapping; map.repeat.x = -1; map.offset.x = 1; }
    return map;
  }
  const soft = (g, x, y, rx, ry, stops) => {
    g.save(); g.translate(x, y); g.scale(rx, ry);
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    stops.forEach(([at, color]) => glow.addColorStop(at, color));
    g.fillStyle = glow; g.fillRect(-1, -1, 2, 2); g.restore();
  };

  // Tileable value noise (fbm, 0..1): the density of the moving cloud and
  // mist. Kept in memory too, so the moonlight in the room can follow how
  // much cloud is over the moon.
  const NOISE = {W: 512, H: 128};
  const density = (() => {
    const {W, H} = NOISE, out = new Float32Array(W * H);
    const hash = (x, y, o) => {
      let h = (x * 374761393 + y * 668265263 + o * 2246822519) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    };
    const fade = t => t * t * (3 - 2 * t);
    const value = (x, y, nx, ny, o) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = fade(x - xi), fy = fade(y - yi);
      const v = (i, j) => hash(((i % nx) + nx) % nx, ((j % ny) + ny) % ny, o);
      const a = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * fx, b = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * fx;
      return a + (b - a) * fy;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let sum = 0, amp = .5, total = 0;
      for (let o = 0; o < 5; o++) {
        const nx = 6 << o, ny = 2 << o;
        sum += amp * value(x / W * nx, y / H * ny, nx, ny, o + 7); total += amp; amp *= .5;
      }
      out[y * W + x] = sum / total;
    }
    return out;
  })();
  const densityMap = (() => {
    const c = canvasOf(NOISE.W, NOISE.H), g = c.getContext('2d'), img = g.createImageData(NOISE.W, NOISE.H);
    for (let i = 0; i < density.length; i++) { img.data.set([255, 255, 255, density[i] * 255], i * 4); }
    g.putImageData(img, 0, 0);
    const map = painted(c, true); map.wrapS = map.wrapT = THREE.RepeatWrapping; return map;
  })();
  // Bilinear, wrapping: the same value the shaders sample.
  const sample = (u, v) => {
    const x = (((u % 1) + 1) % 1) * NOISE.W - .5, y = (1 - (((v % 1) + 1) % 1)) * NOISE.H - .5;
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const d = (i, j) => density[(((j % NOISE.H) + NOISE.H) % NOISE.H) * NOISE.W + (((i % NOISE.W) + NOISE.W) % NOISE.W)];
    const a = d(xi, yi) + (d(xi + 1, yi) - d(xi, yi)) * fx, b = d(xi, yi + 1) + (d(xi + 1, yi + 1) - d(xi, yi + 1)) * fx;
    return a + (b - a) * fy;
  };
  const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

  // ---- 1. The sky itself, far away (34 m): night air from deep indigo to a
  // lilac horizon, paler and bluer round the moon; a band of stars and
  // coloured dust over the tower; stars; and the moon: a wide bloom, a soft
  // corona, a thin halo ring and the disc.
  const far = surface(34, -4, 26, 2048, 1024);
  const farMaterial = new THREE.MeshBasicMaterial({side: THREE.BackSide, toneMapped: false});
  cylinder(far, farMaterial, -9);
  function paintSky() {
    const {W, H} = far, c = canvasOf(W, H), g = c.getContext('2d');
    let seed = 4217; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    const [ma, me, mr] = tuning.moon, G = tuning.glow, N = tuning.nebula;
    const [mx, my] = far.at(ma, me), [sx, sy] = far.scale(ma, me);
    const fromMoon = (x, y) => Math.hypot((x - mx) / sx, (y - my) / sy) / mr; // in moon radii
    const air = g.createLinearGradient(0, far.yAt(far.hAt(32)), 0, far.yAt(far.hAt(-2.6)));
    air.addColorStop(0, '#05030f'); air.addColorStop(.5, '#0e0826'); air.addColorStop(.78, '#1c1040');
    air.addColorStop(.9, '#2e1a5c'); air.addColorStop(.96, '#4a2f85'); air.addColorStop(1, '#6f52a8');
    g.fillStyle = air; g.fillRect(0, 0, W, H);
    // The air near the moon: paler, bluer, a wide soft brightening.
    soft(g, mx, my, sx * 7, sy * 6, [[0, `rgba(196,188,255,${.42 * G})`], [.28, `rgba(160,142,242,${.18 * G})`], [1, 'rgba(120,100,210,0)']]);
    // The band over the tower: violet, rose and a little teal, darker lanes,
    // and many fine stars, washed out near the moon.
    const band = t => [far.xOf(176 - 78 * t), far.yAt(far.hAt(22 - 20 * t))];
    const hues = ['150,110,255', '214,120,210', '90,200,214'];
    for (let i = 0; i < 170; i++) {
      const [x, y] = band(rnd()), s = rnd() - .5, wash = clamp(fromMoon(x, y) / 24);
      const hue = hues[i % 3], a = (.035 + rnd() * .05) * N * wash;
      soft(g, x, y + s * Math.abs(s) * 260, 50 + rnd() * 110, 30 + rnd() * 60, [[0, `rgba(${hue},${a})`], [1, `rgba(${hue},0)`]]);
    }
    for (let i = 0; i < 44; i++) {
      const [x, y] = band(rnd());
      soft(g, x + (rnd() - .5) * 70, y + (rnd() - .5) * 34, 60 + rnd() * 80, 6 + rnd() * 11, [[0, `rgba(6,3,18,${.2 * N})`], [1, 'rgba(6,3,18,0)']]);
    }
    const star = (x, y, size, alpha) => {
      g.fillStyle = `rgba(${232 + rnd() * 23 | 0},${226 + rnd() * 24 | 0},255,${alpha})`; g.fillRect(x - size / 2, y - size / 2, size, size);
    };
    const horizon = far.yAt(far.hAt(-2.6));
    for (let i = 0; i < 1000; i++) {
      const [x, y] = band(rnd()), s = (rnd() + rnd() + rnd() - 1.5) * 100;
      if (y + s < horizon) star(x + (rnd() - .5) * 34, y + s, .6 + rnd() * .9, (.2 + rnd() * .5) * N * clamp(fromMoon(x, y) / 24));
    }
    for (let i = 0; i < 1700; i++) {
      const x = rnd() * W, y = rnd() * horizon, fade = (1 - y / horizon) ** .6 * clamp(fromMoon(x, y) / 9);
      star(x, y, .6 + rnd() * 1.2 * fade, (.15 + rnd() * .6) * fade);
    }
    const bright = (x, y, glint) => {
      const f = clamp(fromMoon(x, y) / 7) * (1 - y / horizon * .4); if (f < .2) return;
      soft(g, x, y, 6, 6, [[0, `rgba(225,220,255,${.5 * f})`], [1, 'rgba(225,220,255,0)']]); star(x, y, 1.8, .95 * f);
      if (glint) for (const [w, h] of [[26, 1.1], [1.1, 26]]) soft(g, x, y, w, h, [[0, `rgba(236,232,255,${.55 * f})`], [1, 'rgba(236,232,255,0)']]);
    };
    for (let i = 0; i < 40; i++) bright(rnd() * W, rnd() * horizon * .9, i % 6 === 0);
    // Two for the alcove window, right of the mullion and clear of the moon.
    bright(...far.at(187.6, 5.4), true); bright(...far.at(188.4, 2.1), false);
    // The moon. Its rays and haze first, then the disc: pale silver-lavender,
    // cooler at the limb, with grey-violet maria.
    soft(g, mx, my, sx * mr * 5, sy * mr * 4.6, [[0, `rgba(226,216,255,${.55 * G})`], [.18, `rgba(188,168,250,${.28 * G})`], [.5, `rgba(140,112,220,${.09 * G})`], [1, 'rgba(120,96,200,0)']]);
    soft(g, mx, my, sx * mr * 2.6, sy * mr * 2.6, [[0, `rgba(248,244,255,${.8 * G})`], [.3, `rgba(230,222,255,${.45 * G})`], [.7, `rgba(202,188,255,${.13 * G})`], [1, 'rgba(190,175,255,0)']]);
    soft(g, mx, my, sx * mr * 4.6, sy * mr * 4.6, [[0, 'rgba(255,190,235,0)'], [.8, 'rgba(255,190,235,0)'], [.86, `rgba(255,190,235,${.055 * G})`],
      [.91, `rgba(200,205,255,${.06 * G})`], [.96, `rgba(150,235,230,${.04 * G})`], [1, 'rgba(150,235,230,0)']]);
    const r = mr * Math.min(sx, sy), disc = g.createRadialGradient(mx - r * .2, my - r * .22, 0, mx, my, r);
    disc.addColorStop(0, '#fefcff'); disc.addColorStop(.55, '#f4f0ff'); disc.addColorStop(.86, '#e2dafc'); disc.addColorStop(1, '#ccc1f4');
    g.save(); g.translate(mx, my); g.scale(sx / Math.min(sx, sy), sy / Math.min(sx, sy)); g.translate(-mx, -my);
    g.beginPath(); g.arc(mx, my, r, 0, Math.PI * 2); g.fillStyle = disc; g.fill(); g.clip();
    for (const [dx, dy, s, a] of [[-.32, -.18, .42, .24], [.2, .12, .32, .2], [.02, -.46, .24, .16], [-.18, .36, .26, .18], [.38, -.28, .18, .14], [-.05, .05, .2, .1]])
      soft(g, mx + dx * r, my + dy * r, s * r, s * r * .85, [[0, `rgba(146,132,196,${a})`], [1, 'rgba(146,132,196,0)']]);
    g.restore();
    // The horizon's glow under it all, brightest beneath the moon.
    const low = g.createLinearGradient(0, far.yAt(far.hAt(1)), 0, horizon);
    low.addColorStop(0, 'rgba(180,140,235,0)'); low.addColorStop(1, `rgba(214,186,250,${.3 * tuning.mist})`);
    g.fillStyle = low; g.fillRect(0, far.yAt(far.hAt(1)), W, horizon - far.yAt(far.hAt(1)));
    g.fillStyle = '#6f52a8'; g.fillRect(0, horizon, W, H - horizon);
    soft(g, mx, horizon, sx * 14, sy * 2.4, [[0, `rgba(228,210,255,${.32 * tuning.mist * G})`], [1, 'rgba(228,210,255,0)']]);
    farMaterial.map?.dispose(); farMaterial.map = painted(c); farMaterial.needsUpdate = true;
  }

  // ---- 2. Cloud drifting over the moon (30 m), thin and slow: dark violet,
  // its edges silvered where they face the moon.
  const cloud = surface(30, -1, 11, 1, 1, LIVE);
  const live = {uTime: {value: 0}, uBright: {value: 1}};
  const cloudUniforms = {...live, uDensity: {value: densityMap}, uAmount: {value: 1}, uMoon: {value: new THREE.Vector2()}, uScale: {value: new THREE.Vector2()}};
  const cloudDensity = `
    float density(vec2 st) {
      vec2 q=vec2(st.x+uTime*.0052,st.y*3.), r=vec2(st.x*1.7+uTime*.0085+.37,st.y*4.6+.21);
      float d=texture2D(uDensity,q).a*.62+texture2D(uDensity,r).a*.38;
      float band=smoothstep(.12,.42,st.y)*smoothstep(1.,.72,st.y), ends=smoothstep(0.,.16,st.x)*smoothstep(1.,.84,st.x);
      return smoothstep(.47,.8,d)*band*ends*uAmount;
    }`;
  const vertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
  cylinder(cloud, new THREE.ShaderMaterial({uniforms: cloudUniforms, vertexShader: vertex, side: THREE.BackSide,
    transparent: true, depthWrite: false, fragmentShader: `
    varying vec2 vUv;uniform sampler2D uDensity;uniform float uTime,uAmount,uBright;uniform vec2 uMoon,uScale;
    ${cloudDensity}
    void main(){
      vec2 st=vec2(1.-vUv.x,vUv.y);
      float d=density(st);
      if(d<.003) discard;
      vec2 deg=(st-uMoon)*uScale;                     // degrees from the moon
      float near=exp(-dot(deg,deg)/98.);              // within about seven degrees
      vec2 toward=-normalize(deg+1e-4)/uScale*.6;     // .6 degree toward the moon
      float edge=clamp(d-density(st+toward),0.,1.);   // the cloud thins toward the moon there
      // Lit from behind by the moon: silver and thin over and around it, dark
      // violet further off, its edges toward the moon brightest.
      float lit=sqrt(near);
      vec3 body=mix(vec3(.1,.065,.2),vec3(.7,.66,.92),lit*.85);
      vec3 color=body+vec3(.9,.87,1.)*edge*2.6*near;
      gl_FragColor=vec4(color*uBright,min(1.,d*.85)*(1.-.5*near));
    }`}), -8);

  // ---- 3. The land, nearer and darker layer by layer, with mist between.
  // A ridge across a layer: its top at height base + profile, filled down.
  // Its shape is in degrees, so it is the same whatever the layer's arc.
  function ridge(g, s, base, height, phase, sharp, fill, rim, mx) {
    const perDegree = s.W / (s.arc[1] - s.arc[0]);
    const top = x => {
      const d = x / perDegree, r = (f, p) => 1 - Math.abs(Math.sin(d * f + phase * p));
      return base + height * (.55 * r(.0423, 1) ** sharp + .3 * r(.113, 1.9) ** (sharp * 1.4) + .15 * (.5 + .5 * Math.sin(d * .369 + phase * 3.3)));
    };
    g.beginPath(); g.moveTo(0, s.H);
    for (let x = 0; x <= s.W; x += 2) g.lineTo(x, s.yAt(top(x)));
    g.lineTo(s.W, s.H); g.closePath(); g.fillStyle = fill; g.fill();
    g.beginPath(); for (let x = 0; x <= s.W; x += 2) x ? g.lineTo(x, s.yAt(top(x))) : g.moveTo(x, s.yAt(top(x)));
    const edge = g.createLinearGradient(mx - s.W * .35, 0, mx + s.W * .35, 0);
    edge.addColorStop(0, 'rgba(220,205,255,0)'); edge.addColorStop(.5, rim); edge.addColorStop(1, 'rgba(220,205,255,0)');
    g.strokeStyle = edge; g.lineWidth = 1.4; g.stroke();
    return top;
  }
  // The far range and a castle on it (22 m): slender spires, a few lit
  // windows and a pale teal light at the tallest; another tower in a wider world.
  const range = surface(22, -1.4, 2.6, 1024, 256, LIVE);
  const rangeMaterial = new THREE.MeshBasicMaterial({side: THREE.BackSide, toneMapped: false, transparent: true, depthWrite: false});
  cylinder(range, rangeMaterial, -7);
  function paintRange() {
    const s = range, c = canvasOf(s.W, s.H), g = c.getContext('2d'), [mx] = s.at(tuning.moon[0], tuning.moon[1]);
    const top = ridge(g, s, s.hAt(-2.75), s.hAt(-1.15) - s.hAt(-2.75), 1.3, 1.6, '#4f3a84', 'rgba(226,210,255,.55)', mx);
    // In degrees seen from the chair: the curtain wall, then each spire's
    // [offset, width, height] from its foot; then lit windows [offset, height].
    const [cx] = s.at(187.25, -2), [kx, ky] = s.scale(187.25, -2), base = s.yAt(top(cx)) + 2;
    g.fillStyle = '#2b1d4d';
    g.fillRect(cx - .7 * kx, base - .36 * ky, 1.55 * kx, .36 * ky + 3);
    for (const [dx, w, h] of [[-.65, .14, .75], [-.36, .2, 1.1], [0, .24, 1.55], [.3, .16, 1], [.54, .13, .68], [.74, .1, .52]]) {
      const x = cx + dx * kx, topY = base - h * ky;
      g.fillRect(x - w * kx / 2, topY, w * kx, h * ky + 2);
      g.beginPath(); g.moveTo(x - w * kx * .62, topY + 1); g.lineTo(x, topY - w * ky * 2.3); g.lineTo(x + w * kx * .62, topY + 1); g.closePath(); g.fill();
    }
    for (const [dx, h] of [[-.36, .8], [0, 1.08], [0, .72], [.3, .72], [-.65, .52], [.54, .46]])
      soft(g, cx + dx * kx, base - h * ky, 2.4, 2.4, [[0, 'rgba(255,214,150,.95)'], [1, 'rgba(255,190,110,0)']]);
    soft(g, cx, base - (1.55 + .24 * 2.3 * .55) * ky, 5, 5, [[0, 'rgba(150,250,228,.95)'], [1, 'rgba(110,230,210,0)']]);
    rangeMaterial.map?.dispose(); rangeMaterial.map = painted(c); rangeMaterial.needsUpdate = true;
  }
  // Mist that moves: a band at a layer's elevations, drifting sideways, its
  // colour brighter toward the moon's side.
  function mistLayer(R, from, to, speed, alpha, order) {
    const s = surface(R, eye.y + (R + 3) * Math.tan(rad(from - 1.2)), eye.y + (R + 3) * Math.tan(rad(to + 1.2)), 1, 1, LIVE);
    const [, b0] = s.st(189, from), [, b1] = s.st(189, to);
    const uniforms = {...live, uDensity: {value: densityMap}, uAmount: {value: 1}, uMoonX: {value: 0},
      uBand: {value: new THREE.Vector2(b0, b1)}, uSpeed: {value: speed}, uAlpha: {value: alpha}};
    const mesh = cylinder(s, new THREE.ShaderMaterial({uniforms, vertexShader: vertex, side: THREE.BackSide,
      transparent: true, depthWrite: false, fragmentShader: `
      varying vec2 vUv;uniform sampler2D uDensity;uniform float uTime,uAmount,uBright,uMoonX,uSpeed,uAlpha;uniform vec2 uBand;
      void main(){
        vec2 st=vec2(1.-vUv.x,vUv.y);
        float y=(st.y-uBand.x)/(uBand.y-uBand.x);
        float band=smoothstep(-.2,.35,y)*smoothstep(1.2,.55,y)*smoothstep(0.,.14,st.x)*smoothstep(1.,.86,st.x);
        float d=texture2D(uDensity,vec2(st.x*1.3+uTime*uSpeed,y*.35+.6)).a*.6+texture2D(uDensity,vec2(st.x*2.4-uTime*uSpeed*.6,y*.5+.15)).a*.4;
        float a=smoothstep(.28,.7,d)*band*uAlpha*uAmount;
        if(a<.003) discard;
        float lit=exp(-pow((st.x-uMoonX)*7.,2.));
        gl_FragColor=vec4(mix(vec3(.62,.52,.86),vec3(.86,.82,1.),lit)*uBright,a);
      }`}), order);
    return {mesh, s, uniforms};
  }
  const farMist = mistLayer(19, -3.3, -1.5, .0042, .5, -6);
  // The lake and its far shore (14 m): the moon's path of glints on the
  // water, glittering as the water moves.
  const lake = surface(14, -1.2, 1.4, 1024, 256, LIVE);
  const lakeUniforms = {...live, uMap: {value: null}, uGlint: {value: null}, uDensity: {value: densityMap}};
  cylinder(lake, new THREE.ShaderMaterial({uniforms: lakeUniforms, vertexShader: vertex, side: THREE.BackSide,
    transparent: true, depthWrite: false, fragmentShader: `
    varying vec2 vUv;uniform sampler2D uMap,uGlint,uDensity;uniform float uTime,uBright;
    void main(){
      vec2 st=vec2(1.-vUv.x,vUv.y);
      vec4 c=texture2D(uMap,st);
      float g=texture2D(uGlint,st).r;
      float twinkle=.3+.7*smoothstep(.42,.86,texture2D(uDensity,vec2(st.x*26.+uTime*.012,st.y*9.-uTime*.02)).a);
      float a=max(c.a,g*twinkle);
      if(a<.003) discard;
      gl_FragColor=vec4((c.rgb*c.a+vec3(.93,.9,1.)*g*twinkle)/max(a,.001)*uBright,a);
    }`}), -5);
  function paintLake() {
    const s = lake, c = canvasOf(s.W, s.H), g = c.getContext('2d'), glint = canvasOf(s.W, s.H), gg = glint.getContext('2d');
    const [mx] = s.at(tuning.moon[0], tuning.moon[1]), [kx] = s.scale(tuning.moon[0], -4);
    ridge(g, s, s.hAt(-2.95), s.hAt(-2.35) - s.hAt(-2.95), 4.1, 1.2, '#2c1c51', 'rgba(214,196,255,.42)', mx);
    const shore = s.yAt(s.hAt(-3.0)), near = s.yAt(s.hAt(-6.4));
    const water = g.createLinearGradient(0, shore, 0, near);
    water.addColorStop(0, '#4a3580'); water.addColorStop(.35, '#2a1a52'); water.addColorStop(1, '#150b2a');
    g.fillStyle = water; g.fillRect(0, shore, s.W, near - shore + 2);
    soft(g, mx, shore + 4, kx * 2.4, 6, [[0, `rgba(225,215,255,${.32 * tuning.glow})`], [1, 'rgba(225,215,255,0)']]);
    let seed = 991; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    for (let i = 0; i < 140; i++) {
      const t = rnd() ** 1.3, y = shore + 3 + t * (near - shore - 3), spread = kx * (.5 + t * 2.4);
      const x = mx + (rnd() - .5) * spread, length = kx * (.25 + rnd() * .8) * (.6 + t);
      soft(gg, x, y, length, 1.3 + t * 1.2, [[0, `rgba(255,255,255,${(.75 - .4 * t) * (.4 + rnd() * .6)})`], [1, 'rgba(255,255,255,0)']]);
    }
    lakeUniforms.uMap.value?.dispose(); lakeUniforms.uGlint.value?.dispose();
    lakeUniforms.uMap.value = painted(c, true); lakeUniforms.uGlint.value = painted(glint, true);
  }
  const lakeMist = mistLayer(12, -5, -3.3, -.0031, .55, -4);
  // Fireflies over the water and the trees, drifting in slow loops.
  const flies = (() => {
    const count = 22, position = [], phase = [], tint = [];
    let seed = 313; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    for (let i = 0; i < count; i++) {
      const azimuth = 185.4 + rnd() * 7.8, elevation = -5.4 + rnd() * 2.6, R = 9.5 + rnd() * 4;
      const dx = Math.sin(rad(azimuth)), dz = Math.cos(rad(azimuth)), b = eye.x * dx + eye.z * dz;
      const t = -b + Math.sqrt(b * b - (eye.x ** 2 + eye.z ** 2) + R * R);
      position.push(eye.x + t * dx, eye.y + t * Math.tan(rad(elevation)), eye.z + t * dz);
      phase.push(rnd() * 100);
      tint.push(...(i % 3 ? [.62, 1, .84] : [1, .86, .6]));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phase, 1));
    geometry.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 3));
    const uniforms = {...live, uAmount: {value: 1}, uFocal: {value: 600}};
    const points = new THREE.Points(geometry, new THREE.ShaderMaterial({uniforms, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexShader: `
      attribute float phase;attribute vec3 tint;uniform float uTime,uFocal,uAmount;varying vec3 vTint;
      void main(){
        float t=uTime*.6+phase;
        vec3 p=position+vec3(sin(t*.53)*.35,sin(t*.71+1.3)*.12,cos(t*.47)*.35);
        float on=pow(.5+.5*sin(t*1.7+phase*3.1),3.);
        vTint=tint*on*uAmount;
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=max(1.5,.075*uFocal/-mv.z);gl_Position=projectionMatrix*mv;
      }`, fragmentShader: `
      varying vec3 vTint;uniform float uBright;
      void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(vTint*smoothstep(.5,0.,d)*uBright,1.);}`}));
    points.renderOrder = -3; points.frustumCulled = false; group.add(points);
    return {points, uniforms};
  })();
  // The nearest trees (8 m): dark pine tops along the bottom of the view, two
  // taller at the window's sides like stage wings, their edges faintly lit.
  const forest = surface(8, -1.2, 1.6, 1024, 256, LIVE);
  const forestMaterial = new THREE.MeshBasicMaterial({side: THREE.BackSide, toneMapped: false, transparent: true, depthWrite: false});
  cylinder(forest, forestMaterial, -2);
  function paintForest() {
    const s = forest, c = canvasOf(s.W, s.H), g = c.getContext('2d');
    let seed = 177; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    const [kx, ky] = s.scale(189, -5);
    const pine = (x, y, h, w, fill) => {
      g.beginPath(); g.moveTo(x - w * .08, y + 2); const n = 8;
      for (let i = 0; i < n; i++) { const a = i / n, b = (i + .55) / n; g.lineTo(x - w * (1 - a) * .5, y - h * a * .9); g.lineTo(x - w * (1 - b) * .2, y - h * b * .9); }
      g.lineTo(x, y - h);
      for (let i = n - 1; i >= 0; i--) { const a = i / n, b = (i + .55) / n; g.lineTo(x + w * (1 - b) * .2, y - h * b * .9); g.lineTo(x + w * (1 - a) * .5, y - h * a * .9); }
      g.lineTo(x + w * .08, y + 2); g.closePath(); g.fillStyle = fill; g.fill();
    };
    const ground = s.yAt(s.hAt(-6.2));
    for (let x = -kx; x < s.W + kx; x += (.45 + rnd() * .7) * kx) {
      const degrees = 1.2 + rnd() * 1.6;
      pine(x, ground + rnd() * ky * .6, degrees * ky, degrees * (.42 + rnd() * .14) * kx, rnd() > .5 ? '#0d0819' : '#120b22');
    }
    for (const [azimuth, height] of [[192.7, 2.7], [193.4, 2.2], [186, 2.4], [185.4, 1.9]]) {
      const [x] = s.at(azimuth, -5);
      pine(x, ground + ky * .3, height * ky, height * kx * .42, '#0a0614');
    }
    g.fillStyle = '#0a0614'; g.fillRect(0, ground + ky * .5, s.W, s.H - ground);
    forestMaterial.map?.dispose(); forestMaterial.map = painted(c); forestMaterial.needsUpdate = true;
  }

  // Where the moon is on the moving layers, for their light.
  function place() {
    const [ma, me] = tuning.moon, [ux, uy] = cloud.st(ma, me), [ax] = cloud.st(ma + .5, me), [, by] = cloud.st(ma, me + .5);
    cloudUniforms.uMoon.value.set(ux, uy);
    cloudUniforms.uScale.value.set(1 / Math.abs(ux - ax) * .5, 1 / Math.abs(by - uy) * .5);
    for (const m of [farMist, lakeMist]) m.uniforms.uMoonX.value = m.s.st(ma, me)[0];
  }
  function paint() { paintSky(); paintRange(); paintLake(); paintForest(); place(); }
  paint();

  // How much cloud is over the moon now (0..1), from the same density the
  // cloud layer draws: the moonlight in the room follows it.
  let clock = 0, last = null;
  function veil() {
    const time = clock, [ux, uy] = cloudUniforms.uMoon.value.toArray();
    const at = (x, y) => {
      const d = sample(x + time * .0052, y * 3) * .62 + sample(x * 1.7 + time * .0085 + .37, y * 4.6 + .21) * .38;
      const band = smoothstep(.12, .42, y) * (1 - smoothstep(.72, 1, y)), ends = smoothstep(0, .16, x) * (1 - smoothstep(.84, 1, x));
      return smoothstep(.47, .8, d) * band * ends * tuning.clouds;
    };
    const kx = tuning.moon[2] / cloudUniforms.uScale.value.x, ky = tuning.moon[2] / cloudUniforms.uScale.value.y;
    return clamp((at(ux, uy) * 2 + at(ux - kx, uy) + at(ux + kx, uy) + at(ux, uy - ky) + at(ux, uy + ky)) / 6 * .85);
  }
  // Advances what moves outside; paused time (a hidden tab) does not jump.
  function update(seconds) {
    if (last !== null) clock += clamp(seconds - last, 0, .1) * tuning.drift;
    last = seconds; live.uTime.value = clock;
  }
  function apply() {
    live.uBright.value = tuning.brightness; farMaterial.color.setScalar(tuning.brightness);
    rangeMaterial.color.setScalar(tuning.brightness); forestMaterial.color.setScalar(tuning.brightness);
    cloudUniforms.uAmount.value = tuning.clouds; farMist.uniforms.uAmount.value = lakeMist.uniforms.uAmount.value = tuning.mist;
    flies.uniforms.uAmount.value = tuning.fireflies;
  }
  apply();
  return {
    group, update, veil,
    setFocal(value) { flies.uniforms.uFocal.value = value; },
    get values() { return {...tuning, moon: [...tuning.moon]}; },
    configure(values = {}) {
      let repaint = false;
      for (const [key, value] of Object.entries(values)) {
        if (key === 'moon') {
          if (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)) { tuning.moon = [...value]; repaint = true; }
        } else if (Object.hasOwn(tuning, key) && Number.isFinite(value)) {
          tuning[key] = Math.max(0, value); if (['glow', 'nebula', 'mist'].includes(key)) repaint = true;
        }
      }
      if (repaint) paint();
      apply(); return this.values;
    },
  };
}
