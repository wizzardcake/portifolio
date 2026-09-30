/* One continuous piece of matter: socket seal -> liquid -> projected page.
   Local coordinates keep it attached to the portal through camera movement.
   Free, it is the portal's heart: it wakes as it rises out of the water,
   floats and breathes above it, lights and shades the water beneath, and
   drops like a heavy droplet when a card falls through the surface.
   portal-orb-material.js holds its shader and tuning table; this module
   owns its pose, its motion and its reactions. */
(() => {
  const screen = document.getElementById('screen');
  const matter = document.getElementById('portalMatter');
  const canvas = matter.querySelector('canvas');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  // Scripted poses only. Hover never changes the portal's orientation.
  // Lower pitch = the tabletop opens up more toward the viewer, i.e. the
  // camera sits higher above the table and looks further down onto it.
  const camera = window.sceneCamera.camera;
  const material = window.portalOrbMaterial;
  const settings = {...material.defaults};
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };

  // The room's light on the orb, in scene metres (x right, y up, z toward the
  // viewer, table centre at the origin): the warm lamp by the nook and the
  // warm fill from the viewer's end (room-scene.js); the green window and the
  // violet stair where the water mirrors them (portal-surface.js); the dim
  // cool sky of the room above; and the portal's own teal and violet from
  // below. Colours are linear, multiplied by how strongly each registers.
  // The order matters to the shader: which give crisp highlights.
  const ROOM = [
    {at: [-1.7, 1.45, -.2], color: [1, .5, .17], power: .55},
    {at: [0, 2.1, 3], color: [1, .62, .32], power: .32},
    {name: 'window', at: [-1, 1.25, -4.5], color: [.06, .74, .40], power: .95},
    {name: 'stair', at: [1.8, 1.4, -3.1], color: [.26, .07, 1], power: 1.05},
    {dir: [0, 1, .25], color: [.32, .38, .55], power: .3},
    {dir: [-.55, -1, .15], color: [.04, .51, .42], power: .5},
    {dir: [.55, -1, .15], color: [.22, .12, .47], power: .45},
  ];
  const lightDir = new Float32Array(material.LIGHTS * 3), lightCol = new Float32Array(material.LIGHTS * 3);
  ROOM.forEach((light, i) => lightCol.set(light.color.map(value => value * light.power), i * 3));
  // Directions from the orb to each light, in canvas space (x right, y up on
  // screen, z toward the camera), where the shader lights it.
  function lights(height, drift) {
    const units = window.sceneCamera.units || 475, table = window.sceneCamera.tableHeight || .46;
    const pitch = camera.pitch * Math.PI / 180, c = Math.cos(pitch), s = Math.sin(pitch);
    const orb = [drift.x / units, table + height / units, drift.y / units];
    ROOM.forEach((light, i) => {
      const at = window.portalSurface?.lights?.[light.name] || light.at;
      const d = light.dir || [at[0] - orb[0], at[1] - orb[1], at[2] - orb[2]];
      const length = Math.hypot(...d) || 1;
      lightDir.set([d[0] / length, (s * d[1] - c * d[2]) / length, (c * d[1] + s * d[2]) / length], i * 3);
    });
  }

  let gl, uniforms;
  try {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true });
    if (!gl) throw new Error('WebGL unavailable');
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const reason = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(reason);
      }
      return shader;
    };
    const program = gl.createProgram();
    const vs = compile(gl.VERTEX_SHADER, material.vertex), fs = compile(gl.FRAGMENT_SHADER, material.fragment);
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    uniforms = Object.fromEntries(['time','aspect','fluid','morph','charge','spin','tint','viewYaw','viewPitch',
      'stretch','breath','awake','swirl','taper','neck','grow','presence','waterline','open','look','feel','lightDir','lightCol']
      .map(name => [name, gl.getUniformLocation(program, name)]));
    matter.classList.add('webgl');
  } catch (error) {
    // The CSS material follows the same trajectory when WebGL is unavailable.
    console.warn('Portal uses CSS material:', error.message);
    gl = null;
  }
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); gl = null; matter.classList.remove('webgl');
  });

  let mode = 'locked', charge = 0, spin = 0, fluid = 0, morph = 0;
  matter.dataset.state = mode;
  let transition = null, rect = null, lastTime = 0;
  let tint = [.27, .55, .46];
  // Idle life is eased in only while the orb floats free. A transition takes
  // over from the pose last drawn, float and wander included, so every move
  // starts from where the float left it.
  let idle = 0, clock = 0, swirl = 0, awake = 0, deform = 0, deformRate = 0, beat = 0;
  // The dive and the pose last drawn (every transition starts from that pose,
  // so nothing snaps back), how fast the pose is changing, a page's optional
  // target, when a page settled (formed: its glass then hands over to the
  // reader) and how far a page has opened into a lens (opened).
  let lastDive = null, frame = null, velocity = {}, pageTarget = null, formed = 0, opened = 0;
  const neutral = Object.freeze({taper: 0, neck: 0, grow: 1, presence: 1});
  const drift = {x: 0, y: 0};
  // Where the orb is over the water and the light it gives it, for the
  // surface (portal-surface.js). Live and read-only for other layers.
  const contact = {x: .5, y: .5, height: 0, radius: 0, strength: 0, glow: [0, 0, 0],
    breath: .5, dimple: 0, lightPool: 1, shadow: 1};
  let arrival = null; // a card's drop that the page waits for

  function targetRect(nextMode) {
    const w = screen.clientWidth, h = screen.clientHeight;
    if (nextMode === 'locked') {
      // Dormant: the orb waits unseen inside the shaft, below the aperture,
      // until the cloth comes off. unlock() then raises it into its hover.
      const idle = targetRect('idle');
      return {...idle, z: -idle.w * .9};
    }
    // Reserve an upper viewport reader above the held cards. Invert the
    // table rotation at a modest camera-space depth; the same coordinates
    // drive both the orb's morph target and the HTML page. This replaces
    // the old fixed 600px lift, which depended on a heavily zoomed-out stage.
    const base = window.sceneCamera.reader();
    const supplied = typeof pageTarget === 'function' ? pageTarget({...base}) : pageTarget;
    const reader = {...base, x: 0};
    for (const key of ['width', 'height', 'x', 'y', 'z']) {
      if (Number.isFinite(supplied?.[key]) && (!['width', 'height'].includes(key) || supplied[key] > 0)) reader[key] = supplied[key];
    }
    const pageWidth = reader.width, pageHeight = reader.height;
    const pageLift = reader.z, pageYOffset = reader.y;
    screen.style.setProperty('--page-width', pageWidth + 'px');
    screen.style.setProperty('--page-size', pageHeight + 'px');
    screen.style.setProperty('--page-lift', pageLift + 'px');
    screen.style.setProperty('--page-y-offset', pageYOffset + 'px');
    screen.style.setProperty('--page-x-offset', reader.x + 'px');
    if (nextMode === 'page') return {x: w / 2 + reader.x, y: h / 2 + pageYOffset, z: pageLift, w: pageWidth, h: pageHeight};
    const d = Math.min(260, h * .68, innerHeight * .30);
    // Keep the footprint at the exact centre. Only world height changes:
    // the sphere rises along the normal of the horizontal tabletop.
    return {x: w / 2, y: h / 2, z: d * .75, w: d, h: d};
  }
  function transitionTo(nextMode, duration, flight = false, nextTint = tint) {
    // Only a lifted-off dive leaves its water response behind. Ordinary
    // impacts retain their cancel-on-projection contract.
    if (!flight || !window.portalReaction?.releaseOrb()) window.portalReaction?.cancel('orb-transition');
    if (transition) transition.resolve(false);
    matter.style.opacity = '1';
    const from = frame ? {...frame.pose} : {...(rect || targetRect(mode)), ...neutral, stretch: 0};
    const emerging = mode === 'locked' && nextMode !== 'locked';
    mode = nextMode;
    matter.dataset.state = mode;
    matter.classList.toggle('is-liquid', mode === 'idle');
    return new Promise(resolve => {
      transition = {from, velocity: flight ? {...velocity} : {}, fluid, morph, emerging,
        tint: [...tint], nextTint, start: frame?.now ?? performance.now(), duration: reducedMotion.matches ? 80 : duration, resolve};
    });
  }
  // A card falling through the surface sends the heart after it: it dives
  // through the water as a drop, is lost in the depth, and bursts back out of
  // the surface as a droplet. A requested page takes over just after neck
  // pinch-off, while the droplet is still rising, without an idle waypoint.
  // The moments, in seconds from the fall; the reaction (portal-reaction.js)
  // rings and swells the water at the same ones.
  function diveTimeline() {
    const k = 1 / settings.diveSpeed, rise = .78 * k + settings.beat;
    return {entry: .28 * k, under: .42 * k, gone: .78 * k, rise, clear: rise + .34 * k, settle: rise + .98 * k, end: rise + 1.38 * k};
  }
  function settleArrival() {
    if (!arrival) return;
    const pending = arrival; arrival = null;
    clearTimeout(pending.fall); pending.release();
  }
  addEventListener('card-portal-arrival', ({detail}) => {
    settleArrival();
    if (reducedMotion.matches || !(settings.arrivalDrop > 0) || mode !== 'idle' || transition) return;
    // Anything may announce an arrival, with or without the card's speed.
    const velocity = detail?.velocity, speed = velocity ? Math.hypot(velocity.x, velocity.y) || 0 : 0;
    const strength = Math.min(1, .6 + speed / 5000) * settings.arrivalDrop, dive = diveTimeline();
    const drop = {};
    drop.ready = new Promise(resolve => { drop.release = resolve; });
    drop.fall = setTimeout(() => {
      if (arrival !== drop) return;
      const at = {x: .5 + drift.x / (screen.clientWidth || 1), y: .5 + drift.y / (screen.clientHeight || 1)};
      const result = window.portalReaction?.trigger(at, strength, {dive});
      // Normal handoff uses the rendered dive clock, not a competing timer.
      // Completion/cancellation also unblocks a pending projection.
      if (result) result.then(() => { if (arrival === drop) drop.release(); });
      else drop.release();
    }, settings.arrivalDelay * 1000);
    arrival = drop;
  });

  const pulse = (u, start, attack, decay) => smooth((u - start) / attack) * (1 - smooth((u - start - attack) / decay));
  // From a to b over u = 0..1, leaving at velocity va and arriving at vb.
  const hermite = (a, b, va, vb, u) => {
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * va + (-2 * u3 + 3 * u2) * b + (u3 - u2) * vb;
  };
  // Where the diving drop is and what form it takes at the reaction's clock:
  // its centre's height above the tabletop and how far it has moved away from
  // the viewer, in px; its stretch, tail, neck, size and presence. Bound for a
  // page, the droplet stays drawn out along its rise instead of gathering
  // itself back into the orb.
  function divePose(v, hover, bound = false) {
    const R = .369 * rect.w, water = -(parseFloat(screen.style.getPropertyValue('--water-depth')) || 16);
    const touch = water + R, fall = hover - touch, t = v.t;
    const pose = {height: hover, back: 0, stretch: 0, ...neutral};
    if (t < v.entry) {
      // 1. It falls, gathering speed, and draws out into a drop, tail up.
      const u = t / v.entry;
      pose.height = hover - fall * u * u;
      pose.stretch = .16 * u * u;
      pose.taper = settings.teardrop * smooth(u / .7);
    } else if (t < v.gone) {
      // 2. Through the surface and on into the depth, slowing as the water
      // takes it. It sinks along the line of sight, into the abyss's throat,
      // rather than straight down behind the front of the rim.
      const span = v.gone - v.entry, u = (t - v.entry) / span, speed = 2 * fall / v.entry * span;
      pose.height = hermite(touch, water - R * settings.diveDepth, -speed, -speed * .15, u);
      pose.back = Math.max(0, water - pose.height) * window.sceneCamera.localEyeY / window.sceneCamera.localEyeZ * .75;
      pose.stretch = .05 + .11 * (1 - smooth(u / .5));
      pose.taper = settings.teardrop * (1 - .5 * u);
      pose.presence = 1 - smooth((t - v.under) / (v.gone - v.under));
    } else if (t < v.rise) {
      // 3. Unseen below the surface, while the water swells over it.
      pose.height = water - R * 2; pose.presence = 0;
    } else {
      // 4. It bursts back out of the same water: a stretched droplet, tail
      // down, tied to the surface by a neck until it pinches free. It shoots
      // up fast and eases into a small overshoot, gathering into the orb.
      const u = clamp((t - v.rise) / (v.settle - v.rise)), c = settings.rebound;
      const start = water - R * settings.emergeSize * (1 + settings.reboundStretch * settings.squash);
      pose.height = start + (hover - start) * (1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2);
      pose.grow = settings.emergeSize + (1 - settings.emergeSize) * smooth(u / .55);
      pose.stretch = settings.reboundStretch * (1 - u) ** (bound ? 1.2 : 2.2) - .06 * pulse(u, .5, .12, .3);
      pose.taper = -settings.teardrop * 1.2 * (1 - u) ** 1.6;
      // The neck holds while the drop's foot is still near the water and
      // pinches free as the gap opens (about half a radius), or by `clear`.
      const gap = (pose.height - R * pose.grow * (1 + pose.stretch * settings.squash) - water) / R;
      pose.neck = settings.neck * (1 - smooth((gap - .08) / .5)) * (1 - smooth((t - v.clear) / .12));
    }
    pose.stretch *= settings.squash;
    return pose;
  }
  // A page opening out of it, at progress t of the transition: it is still
  // drawn out along its rise at first (stretch), and spreads into a lens facing
  // the reader (open, portal-orb-material.js) as it slows, which the morph
  // then unfolds into the page. The two cross quickly, so it is never a plain
  // round orb for long.
  const rising = t => .14 * settings.squash * (1 - smooth((t - .06) / .14));
  const opening = t => settings.pageLens * smooth((t - .03) / .32);

  function animate(now) {
    requestAnimationFrame(animate);
    if (document.hidden || (now - lastTime < 32 && !transition && !window.portalReaction?.active)) return;
    if (window.sceneCamera.appliedPitch !== camera.pitch) window.sceneCamera.update();
    const dt = lastTime ? Math.min(.1, (now - lastTime) / 1000) : 0;
    lastTime = now;
    const still = reducedMotion.matches;
    // One fixed table plane before, during and after the intro. Neither
    // unlocking, projecting a page nor pointer movement tilts the portal.
    screen.style.setProperty('--view-yaw', camera.yaw + 'deg');
    screen.style.setProperty('--view-pitch', camera.pitch + 'deg');
    const target = targetRect(mode);
    let t = 1;
    if (transition) {
      t = Math.min(1, (now - transition.start) / transition.duration);
      const ease = t * t * (3 - 2 * t);
      const seconds = transition.duration / 1000;
      rect = Object.fromEntries(Object.keys(target).map(key => [key,
        hermite(transition.from[key], target[key], (transition.velocity[key] || 0) * seconds, 0, t)]));
      fluid = transition.fluid + ((mode === 'locked' ? 0 : 1) - transition.fluid) * ease;
      morph = transition.morph + ((mode === 'page' ? 1 : 0) - transition.morph) * ease;
      tint = transition.tint.map((value, i) => value + (transition.nextTint[i] - value) * ease);
      if (mode === 'idle' && !still) {
        rect.z += Math.sin(t * Math.PI) * 12;
      }
    } else rect = target;
    // Dormant it is not drawn at all; emerging, it materialises in the shaft
    // during the first third of its rise, and its heart wakes as it rises.
    matter.style.visibility = mode === 'locked' && !transition ? 'hidden' : '';
    if (transition?.emerging) matter.style.opacity = String(Math.min(1, t / .35));
    awake = mode === 'locked' && !transition ? 0 : transition?.emerging ? smooth((t - .1) / .85) : Math.min(1, awake + dt);

    // Idle life: a slow float on two unrelated periods, a small wander over
    // the water, a breath, and the inner layers turning. A drop takes over
    // the float while it lasts.
    const reaction = mode === 'idle' && !transition ? window.portalReaction?.sample(now) : null;
    const free = mode === 'idle' && !transition && !still;
    idle = still || transition ? 0 : idle + ((free ? 1 : 0) - idle) * (1 - Math.exp(-dt * 2.2));
    if (!still) { clock += dt; swirl += dt * .09 * settings.swirlSpeed; }
    const breath = still ? .5 : .5 + .5 * Math.sin(clock * 2 * Math.PI / 5.8);
    const calm = idle * (1 - (reaction?.orbInfluence || 0));
    const float = settings.bob * (4.2 * Math.sin(clock * 2 * Math.PI / 6.4) + 1.6 * Math.sin(clock * 2 * Math.PI / 10.3 + 1.2));
    const wander = [settings.drift * (2.6 * Math.sin(clock * .37 + .8) + Math.sin(clock * .83 + 2.1)),
      settings.drift * (1.8 * Math.sin(clock * .29 + 2.4) + .7 * Math.sin(clock * .71))];
    // A dive keeps the float going beneath it, so it leaves from, and comes
    // back to, exactly where the float is.
    const hover = rect.z + idle * float;
    // Whether a page waits on the drop is settled before it bursts back out,
    // so its rebound never changes course midway.
    if (arrival && reaction?.dive && reaction.dive.t < reaction.dive.rise) arrival.bound = !!arrival.page;
    const bound = !!arrival?.bound;
    const dive = reaction?.dive ? divePose(reaction.dive, hover, bound) : null;
    const carry = dive ? idle : calm;
    let form = dive || neutral;
    // A page opening out of it takes its form over from wherever it is, at the
    // rate it was changing (a rising droplet's tail, size and stretch), and
    // never passes through a plain orb on the way.
    const opens = !!transition && mode === 'page' && !still;
    opened = opens ? opening(t) : 0;
    if (opens) {
      const u = clamp((now - transition.start) / (settings.formBlend * 1000));
      form = {};
      for (const [key, end] of Object.entries({...neutral, stretch: rising(t)}))
        form[key] = hermite(transition.from[key], end, (transition.velocity[key] || 0) * settings.formBlend, 0, u);
    }
    drift.x = carry * wander[0];
    drift.y = carry * wander[1] - (dive?.back || 0);
    // Squash and stretch. A dive or an opening page shapes it directly. For a
    // plain drop a stiff spring chases the fall's speed: it stretches the orb
    // as it drops, and when the water stops it, overshoots into one squash.
    let stretchTo = 0;
    if (dive || opens) stretchTo = form.stretch;
    else if (reaction?.orbInfluence && !still) {
      const fall = (window.portalReaction.sample(now - 20).orbOffset - reaction.orbOffset) / .02;
      stretchTo = clamp(Math.max(0, fall) * .028 * settings.squash, 0, .14);
    }
    if (still) deform = deformRate = 0;
    else if (dive || opens) { deform = stretchTo; deformRate = 0; }
    else for (let left = dt; left > 1e-4; left -= .016) {
      const h = Math.min(.016, left);
      deformRate += (420 * (stretchTo - deform) - 13 * deformRate) * h;
      deform = clamp(deform + deformRate * h, -.14, .16);
    }
    const height = dive ? dive.height : rect.z + calm * float + (reaction?.orbOffset || 0) * rect.w;
    const pose = {x:rect.x + drift.x, y:rect.y + drift.y, z:height, w:rect.w, h:rect.h,
      grow:form.grow, taper:form.taper, neck:form.neck, presence:form.presence, stretch:deform};
    // How fast the drawn pose changes, per second. A dive's comes from its own
    // path, so a page takes over at its true speed whatever the frame rate.
    if (dive) {
      const at = offset => divePose({...reaction.dive, t: reaction.dive.t + offset}, hover, bound);
      const ahead = at(.004), behind = at(-.004), rate = key => (ahead[key] - behind[key]) / .008;
      velocity = {x: 0, y: -rate('back'), z: rate('height'), w: 0, h: 0, grow: rate('grow'),
        taper: rate('taper'), neck: rate('neck'), presence: rate('presence'), stretch: rate('stretch')};
    } else if (frame && now > frame.now) {
      const seconds = (now - frame.now) / 1000;
      velocity = Object.fromEntries(Object.keys(pose).map(key => [key, (pose[key] - frame.pose[key]) / seconds]));
    }
    frame = {now, pose};
    if (arrival && reaction?.dive && dive?.neck < .01) {
      const v = reaction.dive;
      // Always clear the neck and leave before the rebound apex. Large timing
      // adjustments cannot accidentally bring back the stop-at-idle waypoint.
      const apex = 1 - 2 * settings.rebound / (3 * (settings.rebound + 1));
      const handoff = Math.min(v.clear + (.08 + settings.handoff) / settings.diveSpeed,
        v.rise + (v.settle - v.rise) * apex * .78);
      if (v.t >= Math.max(v.clear, handoff)) arrival.release();
    }
    // The water, along world up from its centre, in the shader's units. The
    // sphere is sized by the element's height once a page widens it.
    const radius = .369 * Math.min(rect.w, rect.h), water = -(parseFloat(screen.style.getPropertyValue('--water-depth')) || 16);
    const waterline = (water - height) / (radius / .93);
    if (!gl) { if (dive) matter.style.opacity = String(dive.presence); else if (lastDive) matter.style.opacity = '1'; }
    lastDive = dive;
    matter.style.left = rect.x + 'px'; matter.style.top = rect.y + 'px';
    matter.style.width = rect.w + 'px'; matter.style.height = rect.h + 'px';
    matter.style.setProperty('--matter-height', height + 'px');
    matter.style.setProperty('--matter-drift-x', drift.x + 'px');
    matter.style.setProperty('--matter-drift-y', drift.y + 'px');
    // Keep the rendered sphere round even while it seals the socket.
    // The tabletop is foreshortened; the volume must never be flattened
    // into that plane. The ray marcher supplies the surface's actual depth.
    matter.style.setProperty('--matter-face-yaw', -camera.yaw + 'deg');
    matter.style.setProperty('--matter-face-pitch', -camera.pitch + 'deg');

    // What the water below needs of it. The drawn sphere's radius is .369 of
    // its element's width (.93 of a canvas widened 1.26 times for the lobes).
    const glow = settings.innerGlow * awake * (.72 + .28 * breath * settings.breathing);
    const footprint = {x: rect.x - screen.clientWidth / 2 + drift.x, y: rect.y - screen.clientHeight / 2 + drift.y};
    Object.assign(contact, {
      x: .5 + footprint.x / (screen.clientWidth || 1), y: .5 + footprint.y / (screen.clientHeight || 1),
      height, radius: radius * form.grow, breath,
      // Fades out as it becomes a page, and back in as it returns; gone while
      // it is lost in the depth.
      strength: matter.style.visibility === 'hidden' ? 0 : Number(matter.style.opacity || 1) * (1 - morph) * form.presence,
      glow: [.30 * glow, .85 * glow, .75 * glow],
      // The water drawn gently up toward it, rising and falling with its breath.
      dimple: -settings.dimple * calm * (.0016 + .0014 * (breath - .5) * settings.breathing),
      lightPool: settings.contactGlow, shadow: settings.contactShadow,
    });
    // A faint ring answers the heartbeat, stronger on some beats than others.
    const beatNow = Math.floor(clock / 5.8 - .25);
    if (beatNow !== beat) {
      beat = beatNow;
      if (calm > .9 && !reaction?.orbInfluence && settings.pulseRipple > 0)
        window.portalSurface?.splash(contact.x, contact.y, settings.pulseRipple * (.45 + .55 * Math.sin(beatNow * 2.4) ** 2));
    }

    // Once it has settled into a page, its drawn glass hands over to the crisp
    // .app-view HTML: it fades out while that fades in over it (portal.css),
    // so there is no frame with neither. Left visible, it would sit behind the
    // real content as a blurry ghost. Only in WebGL mode: the CSS fallback
    // (!gl) uses this element's own box as the page visual, so it must stay.
    if (transition || mode !== 'page') formed = 0;
    else if (!formed) formed = now;
    const handover = gl && formed ? (still ? 0 : 1 - smooth((now - formed - 80) / 420)) : 1;
    canvas.style.opacity = String(handover);
    // Nothing shows while the dormant orb is hidden under the cloth, or once
    // the page has taken over from it: skip the ray march then.
    const unseen = matter.style.visibility === 'hidden' || handover === 0;
    if (gl && !unseen && rect.w > 0 && rect.h > 0 && matter.style.opacity !== '0') {
      // Cap the pixel budget: the surface stays smooth without a full-screen raymarch.
      const ratio = Math.min(devicePixelRatio, 1.5, 640 / Math.max(rect.w, rect.h));
      const w = Math.max(1, Math.round(rect.w * ratio)), h = Math.max(1, Math.round(rect.h * ratio));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
      lights(height, footprint);
      gl.uniform1f(uniforms.time, still ? 0 : now * .001);
      gl.uniform1f(uniforms.aspect, rect.w / rect.h);
      gl.uniform1f(uniforms.fluid, fluid); gl.uniform1f(uniforms.morph, morph);
      gl.uniform1f(uniforms.charge, charge); gl.uniform1f(uniforms.spin, spin);
      gl.uniform1f(uniforms.viewYaw, camera.yaw * Math.PI / 180);
      gl.uniform1f(uniforms.viewPitch, camera.pitch * Math.PI / 180);
      gl.uniform3fv(uniforms.tint, tint);
      gl.uniform1f(uniforms.stretch, deform); gl.uniform1f(uniforms.breath, breath);
      gl.uniform1f(uniforms.awake, awake); gl.uniform1f(uniforms.swirl, swirl);
      gl.uniform4f(uniforms.look, settings.innerGlow, settings.mist, settings.rimLight, settings.highlight);
      gl.uniform4f(uniforms.feel, settings.roomLight, settings.wobble, settings.breathing, 0);
      gl.uniform3fv(uniforms.lightDir, lightDir); gl.uniform3fv(uniforms.lightCol, lightCol);
      gl.uniform1f(uniforms.taper, form.taper); gl.uniform1f(uniforms.neck, form.neck);
      gl.uniform1f(uniforms.grow, form.grow); gl.uniform1f(uniforms.presence, form.presence);
      gl.uniform1f(uniforms.waterline, waterline); gl.uniform1f(uniforms.open, opened);
      // Lost in the depth there is nothing to march: clear what was shown.
      if (form.presence > 0) gl.drawArrays(gl.TRIANGLES, 0, 6);
      else { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    } else if (!gl) {
      // The CSS stand-in rounds off into the page's corners as it morphs.
      const round = Math.min(rect.w, rect.h) / 2;
      matter.style.borderRadius = morph > 0 ? round + (18 - round) * morph + 'px' : '';
    }
    if (transition && t === 1) {
      const done = transition.resolve; transition = null;
      done(true);
    }
  }
  requestAnimationFrame(animate);
  window.portalMatter = {
    // Reaction offsets are sampled additively; no second owner of the orb pose.
    get canReact() { return mode === 'idle' && !transition; },
    charge(value, rotation = 0) { charge = value; spin = rotation * Math.PI / 180; },
    // Summons the orb up out of the uncovered portal into its idle hover.
    unlock(duration = 3400) { document.body.classList.add('portal-unlocked'); return transitionTo('idle', duration); },
    async project(appId, {target = null} = {}) {
      // A card's drop hands off while rising, with its rendered momentum.
      let flight = false;
      if (arrival) {
        const drop = arrival;
        drop.page = true;
        await drop.ready;
        if (arrival !== drop) return false; // reset or restored meanwhile
        flight = !!lastDive && lastDive.presence > 0 && !reducedMotion.matches;
        arrival = null;
      }
      pageTarget = target;
      const nextTint = appId === 'ommeg' ? [.52,.21,.28] : ['prosjekter','arbeidserfaring'].includes(appId) ? [.57,.42,.21] : [.24,.56,.49];
      screen.classList.add('is-projecting');
      const complete = await transitionTo('page', settings.pageDuration * 1000, flight, nextTint);
      if (complete) screen.classList.remove('is-projecting');
      return complete;
    },
    restore() { settleArrival(); screen.classList.remove('is-projecting'); return transitionTo('idle', 950); },
    reset() {
      settleArrival();
      window.portalReaction?.cancel('reset');
      document.body.classList.remove('portal-unlocked'); screen.classList.remove('is-projecting');
      if (transition) transition.resolve(false);
      transition = null; mode = 'locked'; fluid = morph = charge = spin = 0; rect = targetRect(mode);
      frame = null; velocity = {}; lastDive = null; pageTarget = null; formed = opened = 0;
      awake = idle = deform = deformRate = 0;
      tint = [.27,.55,.46]; matter.style.opacity = '1'; matter.dataset.state = mode;
      matter.classList.remove('is-liquid');
    },
    // Exposed by reference (not a getter/copy) so external code — currently
    // just the dev/arrange.js camera panel — can mutate pitch/yaw in place
    // and have animate()'s next frame pick it up, same as this module's own
    // internal reads of it.
    camera,
  };
  // Tuning (portal-orb-material.js lists every parameter and its range).
  window.portalOrb = {
    defaults: material.defaults,
    configure(values = {}) {
      for (const [key, value] of Object.entries(values))
        if (material.limits[key] && Number.isFinite(value)) settings[key] = clamp(value, ...material.limits[key]);
      return {...settings};
    },
    get settings() { return {...settings}; },
    contact,
    get stats() {
      return {mode, awake, idle, stretch: deform, breath: contact.breath, height: contact.height, drift: {...drift},
        dive: lastDive && {...lastDive}, pose:frame && {...frame.pose}, velocity:{...velocity}, timestamp:frame?.now, morph, open: opened,
        waitingForDrop: !!arrival, renderPixels: gl ? canvas.width * canvas.height : 0};
    },
  };
})();
