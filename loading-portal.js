// A small, independent Canvas 2D artifact. No Three.js, WebGL, fetched assets,
// progress estimator, room readiness logic, or automatic reveal.
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;

function texture(size = 192) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'), image = ctx.createImageData(size, size);
  const hash = (x, y) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967295;
  };
  // Reuse the small noise lattice rather than hashing four corners for every
  // pixel and octave. These fields never sample outside [-8, 55].
  const lattice = new Float64Array(64 * 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) lattice[y * 64 + x] = hash(x - 8, y - 8);
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    let u = x - ix, v = y - iy; u *= u * (3 - 2 * u); v *= v * (3 - 2 * v);
    const at = (iy + 8) * 64 + ix + 8;
    return mix(mix(lattice[at], lattice[at + 1], u), mix(lattice[at + 64], lattice[at + 65], u), v);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = (x / size - .5) * 2, py = (y / size - .5) * 2;
    const angle = Math.hypot(px, py) * 3.3, c = Math.cos(angle), s = Math.sin(angle);
    const u = (px * c - py * s) * 3 + 8, v = (px * s + py * c) * 3 + 5;
    const n = noise(u, v), fine = noise(u * 2.8 + n * 1.7, v * 2.8 - n * 1.7);
    const vein = Math.pow(1 - Math.abs(fine * 2 - 1), 17) * clamp((n - .32) * 2);
    const density = .18 + n * .5 + fine * .2;
    const i = (y * size + x) * 4;
    image.data[i] = 105 * density + 135 * vein;
    image.data[i + 1] = 60 * density + 83 * vein;
    image.data[i + 2] = 27 * density + 38 * vein;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function radial(ctx, x, y, r, stops) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

// Every part of the edge moves together; the second wave prevents a visible
// short loop. The round phase draws inward, rather than simply rounding a box.
function skinPath(time, inset = 1, dx = 0, dy = 0) {
  const breath = .5 - .5 * Math.cos(time * TAU / 13.7);
  const power = mix(4.8, 2.35, breath), radius = mix(142, 132, breath) * inset;
  const path = new Path2D();
  for (let i = 0; i <= 160; i++) {
    const a = i / 160 * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const ripple = 1 + .026 * Math.sin(a * 3 + time * .19) + .017 * Math.sin(a * 7 - time * .27 + 1.1);
    const x = Math.sign(ca) * Math.abs(ca) ** (2 / power) * radius * ripple;
    const y = Math.sign(sa) * Math.abs(sa) ** (2 / power) * radius * ripple;
    if (i) path.lineTo(x + dx, y + dy); else path.moveTo(x + dx, y + dy);
  }
  path.closePath();return path;
}

function doorPath(time, scale = 1) {
  const sway = 2 * Math.sin(time * .21), breathe = 1 + .018 * Math.sin(time * .31);
  const p = new Path2D(), w = 49 * scale * breathe, top = -91 * scale, bottom = 86 * scale;
  p.moveTo(sway, top);
  p.bezierCurveTo(11 * scale + sway, -71 * scale, w * 1.09, -51 * scale, w, -13 * scale);
  p.bezierCurveTo(w * .98, 26 * scale, w * 1.12, 60 * scale, w * .86, bottom);
  p.bezierCurveTo(w * .4, bottom + 6 * scale, -w * .6, bottom + 4 * scale, -w * .9, bottom - 2 * scale);
  p.bezierCurveTo(-w * 1.12, 57 * scale, -w * .95, 19 * scale, -w, -13 * scale);
  p.bezierCurveTo(-w * 1.12, -52 * scale, -11 * scale + sway, -72 * scale, sway, top);
  p.closePath();return p;
}

/** Mount one artifact. The caller owns its placement and eventual room reveal.
 * reducedMotion: undefined follows the OS, or pass a boolean override.
 * autoplay: false makes render(seconds) the only animation driver.
 */
export function createLoadingPortal(container, {reducedMotion, autoplay = true} = {}) {
  const setupStart = performance.now();
  if (!(container instanceof Element)) throw new TypeError('A mount element is required');
  const element = document.createElement('div');element.className = 'loading-portal';
  element.setAttribute('aria-hidden', 'true');
  const makeLayer = name => {
    const canvas = document.createElement('canvas');canvas.className = `loading-portal__${name}`;
    canvas.dataset.layer = name;element.append(canvas);return canvas;
  };
  const atmosphere = makeLayer('atmosphere'), depth = makeLayer('depth'), liquid = makeLayer('liquid');
  container.append(element);
  const contexts = [atmosphere, depth, liquid].map(c => c.getContext('2d', {alpha: true}));
  if (contexts.some(c => !c)) {element.remove();throw new Error('Canvas 2D is unavailable');}
  const textureStart = performance.now(), grain = texture(), textureMs = performance.now() - textureStart;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false, paused = !autoplay, frame = 0, last = null, clock = 0, paintedAt = -Infinity;
  let motionOverride = reducedMotion, scale = 1, reveal = 0, draws = 0, drawMs = 0, setupMs = 0;
  const isStill = () => motionOverride ?? media.matches;
  const clear = ctx => {ctx.setTransform(1, 0, 0, 1, 0, 0);ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);ctx.setTransform(scale, 0, 0, scale, ctx.canvas.width / 2, ctx.canvas.height / 2);};
  const draw = seconds => {
    if (disposed) return;
    const started = performance.now(), t = isStill() ? 0 : seconds;
    const [air, well, skin] = contexts;
    for (const ctx of contexts) clear(ctx);
    const outer = skinPath(t), door = doorPath(t);
    const pulse = 1 + .07 * Math.sin(t * .47) + .025 * Math.sin(t * .83 + 1.4);

    // A dim reflected halo, not a broad bloom around a luminous illustration.
    air.fillStyle = radial(air, -14, 14, 205, [[0, '#78552816'], [.58, '#7855280e'], [1, '#78552800']]);
    air.fillRect(-220, -220, 440, 440);
    air.save();air.translate(0, 176);air.scale(1, .12);
    air.fillStyle = radial(air, 0, 0, 126, [[0, '#ae77352c'], [.4, '#65452516'], [1, '#65452500']]);
    air.fillRect(-150, -150, 300, 300);air.restore();
    for (let i = 0; i < 14; i++) {
      const phase = i * 2.39996, r = 160 + 22 * Math.sin(i * 7.1);
      const x = Math.cos(phase + t * .008) * r, y = Math.sin(phase + t * .008) * r;
      air.globalAlpha = (.13 + .12 * Math.sin(t * .27 + phase) ** 2) * (i % 3 ? 1 : .5);
      air.fillStyle = i % 4 ? '#d4ac73' : '#81b7a6';air.beginPath();air.arc(x, y, i % 3 ? .65 : 1, 0, TAU);air.fill();
    }
    air.globalAlpha = 1;

    // A dark throat with refracted, offset currents. Kept on its own canvas
    // so a later transition can push toward it without scaling the whole UI.
    well.save();well.clip(doorPath(t, 1.09));
    well.fillStyle = '#03090b';well.fillRect(-100, -120, 200, 240);
    well.fillStyle = radial(well, -5, 16, 100, [[0, '#173831'], [.25, '#102522'], [.65, '#091216'], [1, '#070b0e']]);
    well.fillRect(-100, -120, 200, 240);
    for (let j = 0; j < 5; j++) {
      well.save();well.translate(-4, 22);well.rotate(t * .014 + j * .39);
      well.scale(.45 + j * .105, .6 + j * .08);
      well.globalAlpha = .06 + j * .012;well.globalCompositeOperation = 'screen';
      well.drawImage(grain, -115, -115, 230, 230);well.restore();
    }
    well.fillStyle = radial(well, -4, 18, 35, [[0, '#76b6a115'], [.35, '#4a9e8210'], [1, '#1b494500']]);
    well.fillRect(-80, -80, 160, 160);well.restore();

    // Back edge: a few millimetres of optically dense material, catching warm
    // light on one side and the room orb's muted teal on the other.
    const back = skinPath(t, 1.015, 1, 5);back.addPath(door);
    skin.fillStyle = '#191611';skin.fill(back, 'evenodd');
    skin.strokeStyle = '#78533465';skin.lineWidth = 1.3;skin.stroke(skinPath(t, 1.008, 1, 3));
    skin.save();skin.clip(outer);
    skin.fillStyle = radial(skin, -51, -80, 290, [[0, '#5c4c33'], [.27, '#302c23'], [.58, '#181a19'], [.86, '#121a1c'], [1, '#0a1014']]);
    skin.fillRect(-190, -190, 380, 380);
    skin.save();skin.rotate(.13 + t * .012);skin.globalCompositeOperation = 'screen';skin.globalAlpha = .42 * pulse;
    skin.drawImage(grain, -210, -210, 420, 420);skin.restore();
    skin.save();skin.rotate(-.28 - t * .009);skin.globalCompositeOperation = 'soft-light';skin.globalAlpha = .7;
    skin.drawImage(grain, -205, -205, 410, 410);skin.restore();
    skin.fillStyle = radial(skin, 44, 29, 119, [[0, '#03090ec9'], [.54, '#070d1055'], [1, '#0b101000']]);
    skin.fillRect(-190, -190, 380, 380);

    // Long flowing filaments, buried in the material. Their asymmetric drift
    // never rotates the artifact itself and never restarts at a loop boundary.
    for (let j = 0; j < 6; j++) {
      const p = new Path2D(), offset = j * 1.73;
      for (let k = 0; k <= 70; k++) {
        const a = k / 70 * 5.2 + offset + t * (j % 2 ? .016 : -.012);
        const r = 42 + j * 14 + 11 * Math.sin(a * 2.2 + offset + t * .09);
        const x = Math.cos(a) * r * 1.06, y = Math.sin(a) * r;
        if (k) p.lineTo(x, y);else p.moveTo(x, y);
      }
      skin.strokeStyle = j % 4 ? `rgba(219,159,73,${.018 + .013 * Math.sin(offset + t * .13) ** 2})` : '#78aaa614';
      skin.lineWidth = j % 3 ? .65 : 1.2;skin.stroke(p);
    }

    // The doorway is a depression in the glass: soft dark lip, reflected
    // amber on the inner left, a thin teal catch on the opposite surface.
    const shadowLip = skin.createLinearGradient(-40, -90, 39, 85);
    shadowLip.addColorStop(0, '#05090d77');shadowLip.addColorStop(.4, '#060b102f');shadowLip.addColorStop(1, '#05090d05');
    skin.strokeStyle = shadowLip;skin.lineWidth = 24;skin.stroke(door);
    const lip = skin.createLinearGradient(-60, -75, 59, 84);
    lip.addColorStop(0, '#e4bf8049');lip.addColorStop(.22, '#a873392d');lip.addColorStop(.48, '#221a1200');lip.addColorStop(.8, '#6eac9d29');lip.addColorStop(1, '#c6965609');
    skin.filter = 'blur(4px)';skin.globalAlpha = .45;
    skin.strokeStyle = lip;skin.lineWidth = 13;skin.stroke(doorPath(t, 1.065));
    skin.filter = 'none';skin.globalAlpha = .5;skin.lineWidth = 1.2;skin.stroke(doorPath(t, 1.045));
    skin.globalAlpha = 1;

    // The broad sheen and clean grazing rim follow the orb's material logic:
    // a dark body, one warm key, a teal edge, very little white.
    skin.fillStyle = radial(skin, -91, -89, 81, [[0, '#eed9b242'], [.12, '#d2b67d2b'], [.55, '#b9914310'], [1, '#927d5700']]);
    skin.fillRect(-190, -190, 380, 380);
    skin.fillStyle = radial(skin, 123, 54, 73, [[0, '#54938343'], [.36, '#426d6320'], [1, '#2a4d4a00']]);
    skin.fillRect(-190, -190, 380, 380);
    const rim = skin.createLinearGradient(-126, -120, 120, 112);
    rim.addColorStop(0, '#f2dfbdbf');rim.addColorStop(.23, '#cba97388');rim.addColorStop(.49, '#1c171300');rim.addColorStop(.75, '#65988788');rim.addColorStop(1, '#d2a65b66');
    skin.filter = 'blur(10px)';skin.globalAlpha = .37;skin.strokeStyle = rim;skin.lineWidth = 40;skin.stroke(outer);
    skin.filter = 'blur(3px)';skin.globalAlpha = .4;skin.lineWidth = 9;skin.stroke(outer);
    skin.filter = 'none';skin.globalAlpha = .85;skin.lineWidth = 2;skin.stroke(outer);
    skin.globalAlpha = 1;
    // A curved reflected window: tapered, discontinuous, attached to the skin.
    const glint = new Path2D();
    glint.moveTo(-127, -41);glint.bezierCurveTo(-130, -85, -118, -113, -82, -125);
    const highlight = skin.createLinearGradient(-125, -50, -90, -126);
    highlight.addColorStop(0, '#ead8b300');highlight.addColorStop(.35, '#ead8b32a');highlight.addColorStop(.65, '#fff0d978');highlight.addColorStop(1, '#ead8b300');
    skin.strokeStyle = highlight;skin.lineWidth = 3;skin.stroke(glint);
    skin.restore();
    // Refraction softens the opening into the same skin. No separate opaque
    // doorframe; the separate depth layer shows through this feathered mask.
    skin.save();skin.globalCompositeOperation = 'destination-out';skin.filter = 'blur(3px)';skin.fillStyle = '#000';skin.fill(door);skin.restore();
    draws++;drawMs += performance.now() - started;
  };
  function resize() {
    if (disposed) return;
    const size = Math.max(1, Math.min(element.clientWidth || 420, 560));
    const pixels = Math.round(size * Math.min(devicePixelRatio || 1, 1.5));
    for (const canvas of [atmosphere, depth, liquid]) canvas.width = canvas.height = pixels;
    scale = pixels / 440;draw(clock);
  }
  function tick(now) {
    frame = 0;if (disposed || paused || document.hidden) {last = null;return;}
    // Some browsers delay the media-query event. Stop immediately when the
    // preference itself changes, including the layer presentation state.
    if (isStill()) {syncMotion();return;}
    if (last !== null) clock += Math.min((now - last) / 1000, .1);
    last = now;
    if (now - paintedAt >= 1000 / 24) {paintedAt = now - ((now - paintedAt) % (1000 / 24) || 0);draw(clock);}
    frame = requestAnimationFrame(tick);
  }
  function syncMotion() {
    if (disposed) return;
    element.dataset.reducedMotion = String(isStill());
    element.style.setProperty('--portal-approach', isStill() ? 0 : reveal);
    cancelAnimationFrame(frame);frame = 0;last = null;
    draw(clock);if (!paused && !document.hidden && !isStill()) frame = requestAnimationFrame(tick);
  }
  const observer = new ResizeObserver(resize);observer.observe(element);
  media.addEventListener('change', syncMotion);document.addEventListener('visibilitychange', syncMotion);
  resize();syncMotion();setupMs = performance.now() - setupStart;
  return {
    element,
    layers: Object.freeze({atmosphere, depth, liquid}),
    // Render a deterministic instant, useful for an external animation clock.
    render(seconds) {if (Number.isFinite(seconds)) {clock = Math.max(0, seconds);draw(clock);}},
    pause() {paused = true;cancelAnimationFrame(frame);frame = 0;last = null;},
    play() {if (disposed) return;paused = false;syncMotion();},
    setReducedMotion(value) {motionOverride = typeof value === 'boolean' ? value : undefined;syncMotion();},
    // Presentation control only. No timer, room lookup, event, navigation or
    // dissolve: Claude can drive these layers after a real readiness signal.
    setApproach(value) {
      if (disposed || !Number.isFinite(value)) return;
      reveal = clamp(value);
      const amount = isStill() ? 0 : reveal;
      element.dataset.reducedMotion = String(isStill());
      element.style.setProperty('--portal-approach', amount);
    },
    get opening() {
      const r = liquid.getBoundingClientRect();
      return {x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width * 98 / 440, height: r.height * 177 / 440};
    },
    get stats() {return {renderer: 'canvas2d',draws,meanDrawMs: draws ? drawMs / draws : 0,setupMs,textureMs,seconds: clock,reducedMotion: isStill(),paused,approach: reveal,pixels: liquid.width,disposed};},
    dispose() {
      if (disposed) return;disposed = true;cancelAnimationFrame(frame);observer.disconnect();
      media.removeEventListener('change', syncMotion);document.removeEventListener('visibilitychange', syncMotion);
      element.remove();for (const c of [atmosphere, depth, liquid, grain]) c.width = c.height = 0;
    },
  };
}
