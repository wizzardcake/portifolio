/* Verktøy's presentation: the interface is born out of the orb. The portal
   supplies every formation frame (portal-effects.js, registerPresentation);
   this module owns only SVG/HTML decoration, never a camera, flight or
   renderer. As the orb opens into the page (progress 0..1):
   - its glass dissolves while filaments of energy stream out of its heart and
     curl round the reading surface;
   - light runs round each tool group's edge, starting at the corner that
     faces the orb, and the group's glass fills in from there; its tools rise
     into place, nearest first;
   - four logos are flung the long way, out past the interface, and settle
     into their own slots;
   - sparks burst out of the heart and drift to where they will float.
   Once settled only slow ambient currents remain, paused while hidden.
   Each frame writes only what changed, straight onto the element it styles,
   so nothing cascades through the page while it forms. */
(() => {
  const view = document.getElementById('app-verktoy');
  const reader = view.closest('.portal-page');
  const content = view.querySelector('.tools-content');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 600px)');
  // Moments in the formation's progress (0..1), unless noted.
  const defaults = Object.freeze({
    fieldStart: .04,                        // the energy field appearing
    handoverStart: .14, handoverEnd: .5,    // the orb's glass dissolving into it
    burstStart: .08, burstEnd: .42,         // filaments streaming out of the heart
    traceStart: .26, traceEnd: .56,         // light running round each group's edge
    fillStart: .36, fillEnd: .72,           // each group's glass filling in
    groupStagger: .05,                      // between groups, nearest the orb first
    structureStart: .44, structureEnd: .84, // the heading and the footer
    logoStart: .16, logoEnd: .9, logoStagger: .03, // the flung logos' flight
    logoReach: .14,                         // how far past the interface they swing, of its size
    ribbonOpacity: .7, glowOpacity: .65, ambientDuration: 12,
    widthScale: 1.06, heightScale: 1.08,
  });
  const limits = {fieldStart:[0,.2], handoverStart:[.05,.4], handoverEnd:[.3,.9],
    burstStart:[0,.3], burstEnd:[.2,.6], traceStart:[.1,.5], traceEnd:[.3,.8],
    fillStart:[.2,.6], fillEnd:[.5,.95], groupStagger:[0,.08], structureStart:[.2,.7], structureEnd:[.6,.95],
    logoStart:[.05,.45], logoEnd:[.7,1], logoStagger:[0,.06], logoReach:[0,.3],
    ribbonOpacity:[0,1], glowOpacity:[0,1], ambientDuration:[6,30], widthScale:[.95,1.07], heightScale:[1,1.12]};
  const settings = {...defaults};
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = v => {v = clamp(v); return v * v * (3 - 2 * v);};
  const phase = (p, start, end) => smooth((p - start) / (end - start));
  // Up to 1 and back to 0 across a phase: a flash as something arrives.
  const flash = (p, start, end) => Math.sin(Math.PI * clamp((p - start) / (end - start)));

  const field = document.createElement('div');
  field.className = 'tools-field';
  field.hidden = true;
  field.setAttribute('aria-hidden', 'true');
  field.innerHTML = `
    <div class="tools-nebula"></div>
    <svg class="tools-ribbons" preserveAspectRatio="none" focusable="false">
      <defs>
        <linearGradient id="tools-current" x1=".05" y1="1" x2=".9" y2="0">
          <stop stop-color="#8dffea"/><stop offset=".45" stop-color="#52d8ea"/>
          <stop offset="1" stop-color="#b893ff"/>
        </linearGradient>
        <radialGradient id="tools-heart"><stop stop-color="#eafffb"/><stop offset=".16" stop-color="#7cf0dc" stop-opacity=".75"/>
          <stop offset="1" stop-color="#5be8cf" stop-opacity="0"/></radialGradient>
      </defs>
      <g class="tools-ribbon-bed" fill="none" stroke="url(#tools-current)"></g>
      <g class="tools-ribbon-core" fill="none" stroke="url(#tools-current)"></g>
      <g class="tools-ribbon-flow" fill="none"></g>
      <ellipse class="tools-source" fill="url(#tools-heart)"/>
    </svg>
    <div class="tools-motes"></div>`;
  reader.prepend(field);
  // Flung logos fly in front of the glass, in the interface's own frame, so
  // each lands exactly on its slot.
  const seedLayer = document.createElement('div');
  seedLayer.className = 'tools-seeds';
  seedLayer.hidden = true;
  seedLayer.setAttribute('aria-hidden', 'true');
  reader.append(seedLayer);
  const svg = field.querySelector('.tools-ribbons');
  const source = field.querySelector('.tools-source');
  // Six currents, in fractions of the page: out of the heart (its centre)
  // they fan out, curl round the reading surface and thin out along its
  // edges. Each is [first control (y from the heart), second control, point,
  // reflected control, end].
  const CURRENTS = [
    [[.36, .04], [-.048, .75], [.074, .347], [.188, .003], [.395, .066]],
    [[.62, .056], [1.06, .766], [.931, .428], [.902, .084], [.694, .044]],
    [[.29, -.055], [.112, .93], [.051, .639], [.055, .163], [.252, .125]],
    [[.67, -.091], [.831, 1.002], [.947, .72], [.976, .209], [.788, .173]],
    [[.458, -.164], [.127, .861], [.117, .511], [.38, .183], [.478, .042]],
    [[.543, -.164], [1.007, .889], [.892, .606], [.585, .231], [.592, .089]],
  ];
  const ribbons = CURRENTS.map((shape, i) => {
    const layers = ['bed', 'core', 'flow'].map(name => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('pathLength', '100');
      path.style.setProperty('--ribbon-i', i);
      field.querySelector('.tools-ribbon-' + name).append(path);
      return path;
    });
    return {shape, bed: layers[0], core: layers[1], flow: layers[2]};
  });
  const moteBox = field.querySelector('.tools-motes');
  const motes = Array.from({length: 12}, (_, i) => {
    const el = document.createElement('i'), x = 8 + (i * 37 % 85), y = 6 + (i * 23 % 85);
    el.style.cssText = `left:${x}%;top:${y}%;--mote-i:${i}`;
    moteBox.append(el);
    return {el, x: x / 100, y: y / 100, i};
  });
  // Each group's glass and the ring of light round its edge (tools-page.css
  // .tool-glass, .tool-trace), styled directly while it forms.
  for (const group of view.querySelectorAll('.tool-group')) {
    for (const name of ['tool-trace', 'tool-glass']) {
      const layer = document.createElement('i');
      layer.className = name; layer.setAttribute('aria-hidden', 'true');
      group.prepend(layer);
    }
  }

  let active = false, progress = 0, settled = false, seeds = [], signature = '', geometry = null;
  let lastPose = null, lastTarget = null, offset = {x:0,y:0,z:0}, materialOpacity = 1;
  // What was last written, so a frame writes only what changed.
  let written = new WeakMap();
  const touched = new Set();
  function put(el, prop, value) {
    let cache = written.get(el);
    if (!cache) {written.set(el, cache = {}); touched.add(el);}
    if (cache[prop] === value) return;
    cache[prop] = value;
    if (prop[0] === '@') el.setAttribute(prop.slice(1), value);
    else if (prop[0] === '-') el.style.setProperty(prop, value);
    else el.style[prop] = value;
  }
  function tune() {
    reader.style.setProperty('--tools-ribbon-opacity', settings.ribbonOpacity);
    reader.style.setProperty('--tools-glow-opacity', settings.glowOpacity);
    reader.style.setProperty('--tools-ambient-duration', settings.ambientDuration + 's');
    signature = '';
  }
  function visibility() {
    reader.classList.toggle('tools-paused', document.hidden || motion.matches);
    signature = '';
  }
  document.addEventListener('visibilitychange', visibility);
  motion.addEventListener('change', visibility);
  compact.addEventListener('change', () => {signature = ''; geometry = null;});

  // Where things are inside the interface, in its own untransformed px. Read
  // once per layout (sizes change with the viewport), never every frame.
  const within = element => {
    let x = 0, y = 0;
    for (let el = element; el && el !== view; el = el.offsetParent) {x += el.offsetLeft; y += el.offsetTop;}
    return {x, y: y - (element !== content && content.contains(element) ? content.scrollTop : 0)};
  };
  function measure() {
    const W = view.offsetWidth, H = view.offsetHeight, heart = {x: W / 2, y: H / 2};
    const groups = [...view.querySelectorAll('.tool-group')].map(el => {
      const at = within(el), w = el.offsetWidth, h = el.offsetHeight;
      // The group's point nearest the heart: its light and its glass start there.
      const near = {x: clamp(heart.x, at.x, at.x + w), y: clamp(heart.y, at.y, at.y + h)};
      const centre = {x: at.x + w / 2, y: at.y + h / 2};
      const items = [...el.querySelectorAll('.tool-item')].map(item => {
        const logo = item.querySelector('.tool-logo'), c = within(logo);
        const point = {x: c.x + logo.offsetWidth / 2, y: c.y + logo.offsetHeight / 2};
        return {item, logo, point, size: [logo.offsetWidth, logo.offsetHeight], distance: Math.hypot(point.x - near.x, point.y - near.y)};
      });
      return {el, at, w, h, near, items, reach: Math.max(1, ...items.map(it => it.distance)),
        glass: el.querySelector('.tool-glass'), trace: el.querySelector('.tool-trace'),
        text: [...el.querySelectorAll('h3, .tool-group-description')],
        angle: Math.atan2(near.x - centre.x, centre.y - near.y) * 180 / Math.PI,
        origin: `${((near.x - at.x) / w * 100).toFixed(1)}% ${((near.y - at.y) / h * 100).toFixed(1)}%`,
        distance: Math.hypot(near.x - heart.x, near.y - heart.y)};
    });
    // Nearest the heart first.
    groups.slice().sort((a, b) => a.distance - b.distance).forEach((g, rank) => {g.rank = rank;});
    // The currents are drawn in the interface's own px, once per layout.
    svg.setAttribute('viewBox', `${-.04 * W} ${-.04 * H} ${1.08 * W} ${1.08 * H}`);
    const X = v => (v * W).toFixed(1), Y = v => (v * H).toFixed(1);
    for (const {shape: [c1, c2, p, s, e], bed, core, flow} of ribbons) {
      const d = `M${X(.5)} ${Y(.5)} C${X(c1[0])} ${Y(.5 + c1[1])} ${X(c2[0])} ${Y(c2[1])} ${X(p[0])} ${Y(p[1])} S${X(s[0])} ${Y(s[1])} ${X(e[0])} ${Y(e[1])}`;
      for (const path of [bed, core, flow]) path.setAttribute('d', d);
    }
    source.setAttribute('cx', W / 2); source.setAttribute('cy', H / 2);
    return {W, H, heart, groups, visibleBottom: content.offsetTop + content.clientHeight - 10};
  }
  function begin() {
    active = true; progress = 0; settled = false; signature = ''; geometry = null;
    reader.classList.add('has-tools');
    view.classList.add('is-forming');
    view.inert = true;
    view.setAttribute('aria-hidden', 'true');
    content.scrollTop = 0;
    field.hidden = false;
    seedLayer.hidden = false;
    tune(); visibility();
    seeds = [...view.querySelectorAll('[data-tool-seed]')].slice(0, compact.matches ? 2 : 4).map((item, i) => {
      const logo = item.querySelector('.tool-logo');
      const clone = logo.cloneNode(true);
      clone.classList.add('tools-seed');
      seedLayer.append(clone);
      return {item, logo, clone, i};
    });
  }
  function sample({progress:p, pose, target, reducedMotion, settled:done}) {
    if (!active) return 1;
    progress = reducedMotion ? 1 : p;
    settled = done || reducedMotion;
    lastPose = {...pose}; lastTarget = {...target};
    // Inverse reader rotation: delta from the target back to the SAME orb
    // pose, including depth. The energy follows the orb's own shape; the
    // interface grows uniformly with it, so its type is never squashed.
    const angle = window.sceneCamera.camera.pitch * Math.PI / 180;
    const dy = pose.y - target.y, dz = pose.z - target.z;
    offset = reducedMotion ? {x:0,y:0,z:0} : {
      x:pose.x-target.x, y:Math.cos(angle)*dy-Math.sin(angle)*dz,
      z:Math.sin(angle)*dy+Math.cos(angle)*dz,
    };
    const sx = reducedMotion ? 1 : pose.w / target.w, sy = reducedMotion ? 1 : pose.h / target.h;
    const next = [progress, target.w, target.h, offset.x, offset.y, offset.z, reducedMotion].join(':');
    if (next === signature) return materialOpacity;
    if (!geometry || geometry.target !== `${target.w}:${target.h}`) {
      geometry = measure(); geometry.target = `${target.w}:${target.h}`;
    }
    signature = next;
    const {W, H, heart, groups, visibleBottom} = geometry, P = progress, S = settings;
    const move = `translate3d(${offset.x}px,${offset.y}px,${offset.z}px)`;
    put(reader, '--tools-pose', `${move} scale(${sx},${sy})`);
    put(reader, '--tools-content-pose', `${move} scale(${Math.sqrt(sx * sy)})`);
    put(reader, '--tools-field-alpha', String(phase(P, S.fieldStart, .3)));
    put(reader, '--tools-structure', String(phase(P, S.structureStart, S.structureEnd)));
    reader.classList.toggle('tools-settled', settled);

    // The heart flares as it bursts, then glows softly behind the glass.
    const burst = flash(P, S.burstStart - .04, S.burstEnd + .12);
    put(source, '@rx', (W * (.07 + .09 * burst)).toFixed(1));
    put(source, '@ry', (H * (.07 + .07 * burst)).toFixed(1));
    put(source, 'opacity', (.55 + .45 * burst).toFixed(3));
    ribbons.forEach((ribbon, i) => {
      // Drawn out of the heart, a bright head running ahead along it; once
      // settled the ambient current (tools-page.css) takes over.
      const start = S.burstStart + i * .02, drawn = settled ? 1 : phase(P, start, S.burstEnd + i * .02);
      const head = clamp((P - start) / (S.burstEnd + .22 - start));
      for (const path of [ribbon.bed, ribbon.core]) {
        put(path, 'strokeDasharray', settled ? '' : '100 100');
        put(path, 'strokeDashoffset', settled ? '' : (100 * (1 - drawn)).toFixed(2));
      }
      put(ribbon.flow, 'strokeDasharray', settled ? '' : '8 92');
      put(ribbon.flow, 'strokeDashoffset', settled ? '' : (8 - 108 * head).toFixed(2));
    });
    motes.forEach(({el, x, y, i}) => {
      // Sparks fly out of the heart to where they will drift.
      const q = phase(P, S.burstStart + .02 + i * .012, S.burstEnd + .2 + i * .012);
      put(el, 'transform', settled ? '' : `translate(${((.5 - x) * W * (1 - q)).toFixed(1)}px,${((.5 - y) * H * (1 - q)).toFixed(1)}px)`);
      put(el, 'opacity', settled ? '' : (q > 0 ? .25 + .75 * flash(q, 0, 1) : 0).toFixed(3));
    });

    // Each group: light runs round its edge from the corner facing the heart,
    // then its glass fills in from there and its tools rise into place.
    groups.forEach(g => {
      const lag = g.rank * S.groupStagger;
      const trace = phase(P, S.traceStart + lag, S.traceEnd + lag);
      const fill = phase(P, S.fillStart + lag, S.fillEnd + lag), half = trace * 180;
      // Both ends of the light run away from the corner, brightest at their heads.
      put(g.trace, 'background', trace >= 1 ? '' : `conic-gradient(from ${(g.angle - half).toFixed(1)}deg, #eafff9 0deg, ` +
        `#6fe9d8 ${(half * .35).toFixed(1)}deg, #56cfe6 ${half.toFixed(1)}deg, #a98cff ${(half * 1.65).toFixed(1)}deg, ` +
        `#efe6ff ${(half * 2).toFixed(1)}deg, transparent 0)`);
      // Bright while it runs, settling to a quiet edge once the glass is in.
      put(g.trace, 'opacity', (trace > 0 ? .3 + .7 * (1 - fill) : 0).toFixed(3));
      put(g.glass, 'clipPath', fill >= 1 ? '' : `circle(${(fill * 145).toFixed(1)}% at ${g.origin})`);
      put(g.glass, 'opacity', fill.toFixed(3));
      const text = phase(fill, .15, .6).toFixed(3);
      for (const el of g.text) put(el, 'opacity', text);
      g.items.forEach(({item, distance}) => {
        const delay = .12 + .45 * distance / g.reach, q = phase(fill, delay, delay + .4);
        put(item, '--item-in', q.toFixed(3));
        put(item, '--item-glint', flash(fill, delay + .2, delay + .7).toFixed(3));
      });
    });

    // The flung logos: out of the heart, past the interface's edge on their
    // own side, then back in to land exactly on their slots. The slot's own
    // logo stays hidden until it lands, so there is never a double.
    seeds.forEach(({item, logo, clone, i}) => {
      const g = groups.find(group => group.el.contains(item)), slot = g.items.find(it => it.item === item);
      const end = slot.point, visible = end.y < visibleBottom;
      const q = phase(P, S.logoStart + i * S.logoStagger, S.logoEnd);
      const dir = {x: end.x - heart.x, y: end.y - heart.y}, length = Math.hypot(dir.x, dir.y) || 1;
      dir.x /= length; dir.y /= length;
      // Distance from the heart to the interface's edge along that direction.
      const edge = Math.min(Math.abs(W / 2 / (dir.x || 1e-6)), Math.abs(H / 2 / (dir.y || 1e-6)));
      const out = edge * (1 + S.logoReach * 2.4), side = i % 2 ? 1 : -1;
      const c1 = {x: heart.x + dir.x * out * .9 - dir.y * side * edge * .35, y: heart.y + dir.y * out * .9 + dir.x * side * edge * .35};
      const c2 = {x: end.x + dir.x * edge * (.35 + S.logoReach), y: end.y + dir.y * edge * (.35 + S.logoReach)};
      const u = 1 - q, a = u * u * u, b = 3 * u * u * q, c = 3 * u * q * q, e = q * q * q;
      const x = a * heart.x + b * c1.x + c * c2.x + e * end.x, y = a * heart.y + b * c1.y + c * c2.y + e * end.y;
      const scale = .2 + .95 * phase(q, 0, .4) - .15 * phase(q, .7, 1);
      put(clone, 'width', slot.size[0] + 'px'); put(clone, 'height', slot.size[1] + 'px');
      put(clone, 'transform', `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) scale(${scale.toFixed(3)}) rotate(${((i % 2 ? 1 : -1) * 24 * u * u).toFixed(1)}deg)`);
      const landed = q >= 1;
      put(clone, 'opacity', visible && !reducedMotion && !landed ? phase(q, 0, .1).toFixed(3) : '0');
      put(logo, 'opacity', !visible || reducedMotion || landed ? '1' : '0');
      // A glint as it lands.
      put(item, '--item-glint', (visible && !reducedMotion ? flash(P, S.logoEnd - .02, Math.min(1, S.logoEnd + .12)) : 0).toFixed(3));
    });

    materialOpacity = 1 - phase(P, S.handoverStart, S.handoverEnd);
    if (settled) {
      view.inert = false;
      view.removeAttribute('aria-hidden');
      seeds.forEach(({logo, clone}) => {put(logo, 'opacity', ''); put(clone, 'display', 'none');});
    }
    return materialOpacity;
  }
  function end() {
    active = false; progress = 0; settled = false; signature = ''; geometry = null;
    reader.classList.remove('has-tools', 'tools-settled', 'tools-paused');
    view.classList.remove('is-forming');
    view.inert = false; view.removeAttribute('aria-hidden');
    field.hidden = true;
    seedLayer.hidden = true;
    seeds.forEach(({clone}) => clone.remove());
    seeds = [];
    // Everything the formation styled goes back to the stylesheet.
    for (const el of touched) {
      for (const prop of Object.keys(written.get(el) || {})) {
        if (prop[0] === '@') continue;
        if (prop[0] === '-') el.style.removeProperty(prop); else el.style[prop] = '';
      }
    }
    touched.clear(); written = new WeakMap();
  }
  window.portalMatter.registerPresentation('verktoy', {
    target: base => ({...base, width:base.width*settings.widthScale, height:base.height*settings.heightScale}),
    begin, sample, end,
  });
  window.toolsPage = {
    defaults,
    configure(values = {}) {
      for (const [key,value] of Object.entries(values)) {
        if (limits[key] && Number.isFinite(value)) settings[key] = clamp(value, ...limits[key]);
      }
      tune(); return {...settings};
    },
    get settings() {return {...settings};},
    get stats() {return {active,progress,settled,seedCount:seeds.length,pose:lastPose,target:lastTarget,
      offset:{...offset},materialOpacity,paused:document.hidden || motion.matches};},
  };
})();
