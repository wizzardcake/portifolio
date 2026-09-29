/* The portal's surface: a living magical pond lying in the aperture, a little
   below the rim, so a band of the stone lining stays dry above it. One
   transparent WebGL plane (.portal-surface) between the abyss
   (portal-depth.js) and the impact layers just above the water:
   - one slope field for the whole liquid: broad slow swells and small
     drifting ripples, damped at the walls, plus rings raised by whatever
     enters the water (a dropped orb, the cloth's release, a card, the orb
     breaking the surface as it rises). The abyss is refracted through this
     same field (portal-depth-volume.js includes WATER), so the depths below
     sway, bend and part with the surface above them;
   - a Fresnel reflection of the room's actual light sources (the alcove's
     green window, the purple stair light, the tower's green lancets, the warm
     nook) and of the hovering orb, so coloured highlights travel over it;
   - fine, faster ripples that only the glints see: the shimmer;
   - the abyss's own light reaching the water from below, in a loose ring
     around the dark throat, caught by the wave faces; a few luminous wisps
     drifting just under the surface;
   - a slow irregular breathing, shared with the abyss's glow.
   It is dormant under the cloth, paused when hidden, and still for reduced
   motion.

   Tuning (live, every frame): window.portalSurface.params. 1 is the default
   look and 0 switches a part off; breathing is a fraction. The water level
   belongs to the well: portalDepth.configure({waterLevel}).
   Stir it by hand: portalSurface.splash(x, y, strength), in aperture
   fractions (x left to right, y back to front). */
(() => {
  const screen = document.getElementById('screen');
  const matter = document.getElementById('portalMatter');
  if (!screen) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const params = {
    rippleAmplitude: 1, // slope of the idle swells and small ripples
    rippleSpeed: 1,     // pace of the swells, the drift and the shimmer
    shimmer: 1,         // fine travelling glints of the room's light
    refraction: 1,      // how strongly the ripples bend the view beneath, abyss included
    cloudSpeed: 1,      // drift of the wisps under the surface
    glow: 1,            // the abyss's light caught by the water, and the wisps
    splash: 1,          // rings raised by things entering the water
    breathing: .18,     // slow swell of glow and ripple strength (fraction)
  };
  // The room's light sources the surface reflects, in scene metres with the
  // table centre at the origin, +y up and +z toward the viewer (room-scene.js).
  const LIGHTS = {
    window: [-1, 1.25, -4.5],   // the alcove's pointed window: green sky
    stair: [1.8, 1.4, -3.1],    // purple light down the spiral stair
    lancet: [2.9, 2, -4.3],     // the tower's green lancets
    nook: [-2.6, 1.1, -1.55],   // the warm study nook
  };
  // Rings: at most RINGS at once, running outward at RING_SPEED aperture
  // heights per second (portal-reaction.js's default), gone after RING_LIFE s.
  const RINGS = 6, RING_SPEED = .86, RING_LIFE = 3.2;

  const layer = document.createElement('div');
  layer.className = 'portal-surface';
  layer.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  layer.append(canvas);
  const tunnel = screen.querySelector('.screen-tunnel');
  if (tunnel) tunnel.after(layer); else screen.prepend(layer);

  // The water's slope field, shared with the abyss. Plane coordinates in
  // aperture heights: x right, y away from the viewer, z up; the aperture
  // centre at the origin.
  const WATER = `
    uniform vec4 uWater;           // swell clock, idle slope, aperture aspect, energy
    uniform vec4 uRipples[${RINGS}]; // centre, front radius, strength
    uniform vec3 uPull;            // centre, depth of the draw toward a dropped orb
    float wHash(vec2 p) {
      vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
      q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z);
    }
    // Value noise with its gradient (quintic), for surface slopes.
    vec3 wNoised(vec2 p) {
      vec2 i=floor(p), f=fract(p);
      vec2 u=f*f*f*(f*(f*6.-15.)+10.), du=30.*f*f*(f*(f-2.)+1.);
      float a=wHash(i), b=wHash(i+vec2(1.,0.)), c=wHash(i+vec2(0.,1.)), d=wHash(i+vec2(1.,1.));
      float k1=b-a, k2=c-a, k4=a-b-c+d;
      return vec3(a+k1*u.x+k2*u.y+k4*u.x*u.y, du*(vec2(k1,k2)+k4*u.yx));
    }
    // The idle surface: broad swells travelling in four directions at
    // unrelated speeds, and two layers of drifting noise, so it never repeats.
    vec2 idleSlope(vec2 p, float t) {
      vec2 d1=vec2(.83,.56), d2=vec2(-.64,.77), d3=vec2(.19,-.98), d4=vec2(-.96,-.28);
      vec2 g=.50*5.3*d1*cos(dot(p,d1)*5.3-t*.62+1.3);
      g+=.34*7.9*d2*cos(dot(p,d2)*7.9-t*.83+4.1);
      g+=.24*11.3*d3*cos(dot(p,d3)*11.3-t*1.07+2.2);
      g+=.16*15.1*d4*cos(dot(p,d4)*15.1-t*1.31+5.);
      g+=wNoised(p*5.+vec2(t*.21,-t*.16)).yz*5.*.55;
      g+=wNoised(p*10.3+vec2(-t*.29,t*.24)+5.2).yz*10.3*.25;
      return g;
    }
    // Rings raised by whatever enters the water: a short train of crests
    // (wavelength .06) around a front running outward, widening and fading
    // as it spreads; and the smooth dip drawn toward a dropped orb.
    vec2 ringSlope(vec2 p) {
      vec2 g=vec2(0.);
      for(int i=0;i<${RINGS};i++){
        vec4 h=uRipples[i];
        if(h.w<=0.) continue;
        vec2 d=p-h.xy; float r=length(d)+1e-4;
        float x=r-h.z, s=.03+.052*h.z, e=exp(-x*x/(s*s));
        if(e<.003) continue;
        float k=104.7, a=h.w*.0036/sqrt(1.+r*6.);
        g+=d/r*a*e*(k*cos(k*x)-2.*x/(s*s)*sin(k*x));
      }
      vec2 d=p-uPull.xy;
      return g+d*uPull.z*247.*exp(-dot(d,d)*123.5);
    }
    vec2 waterSlope(vec2 p) {
      float wall=min(.5*uWater.z-abs(p.x),.5-abs(p.y));
      return (idleSlope(p,uWater.x)*uWater.y+ringSlope(p))*smoothstep(0.,.07,wall);
    }`;

  const vertex = `attribute vec2 position; varying vec2 uv;
    void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
  // Output is premultiplied: alpha is what the pond hides of the depths, rgb
  // what it adds as light.
  const fragment = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    varying vec2 uv;
    uniform float uAspect, uTime;
    uniform float uRippleSpeed, uShimmer, uRefraction, uCloudSpeed, uGlow;
    uniform vec2 uThroat; // the abyss's throat, shifted by parallax (aperture units)
    uniform vec3 uEye, uWindow, uStair, uLancet, uNook;
    uniform vec3 uOrb; // the orb's centre height, radius, strength (0: absent)
    ${WATER}

    float noise(vec2 p) {
      vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(wHash(i),wHash(i+vec2(1.,0.)),f.x),mix(wHash(i+vec2(0.,1.)),wHash(i+vec2(1.,1.)),f.x),f.y);
    }
    float fbm(vec2 p) {
      float v=0., a=.5;
      for(int i=0;i<4;i++){v+=a*noise(p);p=mat2(1.6,1.2,-1.2,1.6)*p;a*=.5;}
      return v;
    }
    vec2 turn(vec2 p, float a) {float c=cos(a), s=sin(a); return mat2(c,s,-s,c)*p;}

    float lobe(vec3 P, vec3 R, vec3 S, float k) {return exp((dot(R,normalize(S-P))-1.)*k);}
    // What the pond mirrors: a dark room, a little warm overhead, and its lights.
    vec3 room(vec3 P, vec3 R) {
      vec3 c=mix(vec3(.010,.012,.018),vec3(.034,.026,.020),smoothstep(-.1,.6,R.z));
      // Upper walls faintly lit by the window's green (left) and the stair's
      // purple (right): what the steeper reflections near the viewer see.
      c+=mix(vec3(.10,.30,.24),vec3(.24,.14,.40),smoothstep(-.4,.4,R.x))*.12*smoothstep(.25,.75,R.z);
      // The lit back wall around the window: a broad, soft sheen on the far
      // water that the ripples break up.
      c+=vec3(.12,.46,.36)*lobe(P,R,uWindow,14.)*.2;
      c+=vec3(.18,.80,.60)*lobe(P,R,uWindow,110.)*.75;
      c+=vec3(.55,.28,1.)*lobe(P,R,uStair,22.)*.75;
      c+=vec3(.28,.90,.66)*lobe(P,R,uLancet,90.)*.55;
      c+=vec3(1.,.62,.30)*lobe(P,R,uNook,16.)*.35;
      return c;
    }
    vec3 glints(vec3 P, vec3 R) {
      return vec3(.55,1.,.85)*lobe(P,R,uWindow,900.)+vec3(.8,.62,1.)*lobe(P,R,uStair,420.)
        +vec3(.6,1.,.8)*lobe(P,R,uLancet,900.);
    }
    // The hovering orb above the centre, mirrored.
    vec3 orb(vec3 P, vec3 R) {
      if(uOrb.z<=0.) return vec3(0.);
      vec3 C=vec3(0.,0.,uOrb.x)-P;
      float along=dot(C,R);
      if(along<=0.) return vec3(0.);
      float miss=length(C-R*along), r=uOrb.y;
      float body=1.-smoothstep(r*.7,r*1.05,miss);
      return (vec3(.20,.46,.40)*body+vec3(.25,.75,.65)*exp(-miss*miss/(r*r*4.))*.3)*uOrb.z;
    }

    void main() {
      vec2 p=vec2((uv.x-.5)*uAspect,uv.y-.5);
      float t=uTime, energy=uWater.w;
      float wall=min(.5*uAspect-abs(p.x),.5-abs(p.y));
      float calm=smoothstep(0.,.07,wall);
      // waterSlope(p), with the rings kept apart for their own faint light.
      vec2 rings=ringSlope(p)*calm;
      vec2 slope=idleSlope(p,uWater.x)*uWater.y*calm+rings;
      vec3 P=vec3(p,0.), V=normalize(uEye-P);
      vec3 N=normalize(vec3(-slope,1.));
      float facing=max(dot(N,V),0.);
      float fresnel=.02+.98*pow(1.-facing,5.);
      vec3 R=reflect(-V,N);
      // Fine, faster ripples that only the glints see.
      vec2 fine=wNoised(p*23.+vec2(t*.9,-t*.7)*uRippleSpeed).yz*23.*.0022*uShimmer*calm;
      vec3 Rf=reflect(-V,normalize(vec3(-(slope+fine),1.)));
      vec3 mirrored=(room(P,R)*2.3+orb(P,R)*2.
        +glints(P,Rf)*uShimmer*1.3*(1.+.5*(energy-1.)))*fresnel;

      // The abyss's light reaching the water from below: a loose ring around
      // the dark throat, teal toward the left and violet toward the right as
      // in the depths themselves. Wave faces turned toward the viewer catch
      // most of it, so it travels with the water; the throat stays dark.
      vec2 ap=vec2(2.*p.x/uAspect,-2.*p.y);
      float rT=length((ap-vec2(0.,.08)-uThroat)*vec2(.92,1.));
      float ring=smoothstep(.22,.55,rT)*(1.-.55*smoothstep(.65,1.25,rT));
      vec3 depthLight=mix(vec3(.10,.55,.50),vec3(.42,.22,.78),smoothstep(-.8,.8,ap.x+.2*sin(t*.05+ap.y*2.2)));
      float face=smoothstep(-.02,.1,slope.y+fine.y*.6);
      // Wisps: thin luminous streaks just under the surface, few at a time,
      // turning slowly the same way as the abyss's spiral.
      vec3 T=refract(-V,normalize(vec3(-slope*uRefraction*1.8,1.)),.75);
      vec2 qw=p+T.xy/max(-T.z,.3)*.06;
      float ts=t*uCloudSpeed;
      vec2 s=turn(qw,-ts*.03);
      vec2 streak=vec2(s.x*.8,s.y*2.4);
      float n=fbm(streak*1.9+vec2(ts*.06,ts*.02)+fbm(s*1.2-ts*.035)*1.2);
      float wisp=pow(1.-abs(n*2.-1.),6.)*smoothstep(.5,.78,noise(s*.8+vec2(-ts*.035,1.7)))*smoothstep(.3,.65,rT);
      vec3 light=(depthLight*ring*(.3+.7*face)*.09+vec3(.5,.92,.88)*wisp*.12)*uGlow*energy*(1.-fresnel);
      // Disturbed water glows faintly along its crests, so a ring stays
      // legible even where it crosses the dark throat.
      light+=vec3(.30,.78,.70)*smoothstep(.03,.22,length(rings))*.06*uGlow*(1.-fresnel);
      light/=1.+light*.6;

      // The water itself dims the depths, more where it is seen edge-on;
      // a faint bright line where it meets the stone.
      float body=mix(.08,.28,1.-facing);
      vec3 meniscus=vec3(.16,.42,.40)*exp(-wall*140.)*.25;
      float alpha=1.-(1.-body)*(1.-fresnel);
      gl_FragColor=vec4(vec3(.004,.016,.022)*body+light+mirrored+meniscus,min(alpha,.9));
    }`;

  // What the other layers read of the water each frame (portal-depth.js).
  const water = {
    live: false,                          // a WebGL surface is showing
    uniform: new Float32Array([0, 0, 1.6, 1]),
    ripples: new Float32Array(RINGS * 4),
    pull: new Float32Array(3),
    refraction: params.refraction,
  };
  const rings = [];

  let gl = null, program = null, uniforms = {};
  function initialize() {
    try {
      gl = canvas.getContext('webgl', {alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false});
      if (!gl) throw new Error('WebGL unavailable');
      const compile = (type, source) => {
        const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {const reason = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(reason);}
        return shader;
      };
      program = gl.createProgram();
      const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
      gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      uniforms = Object.fromEntries(['uAspect','uTime','uWater','uRipples','uPull','uRippleSpeed','uShimmer','uRefraction',
        'uCloudSpeed','uGlow','uThroat','uEye','uWindow','uStair','uLancet','uNook','uOrb'].map(key => [key, gl.getUniformLocation(program, key)]));
      gl.clearColor(0, 0, 0, 0);
      layer.classList.add('webgl');
    } catch (error) {
      console.warn('Portal surface uses a CSS fallback:', error.message);
      gl = null; layer.classList.remove('webgl');
    }
    water.live = !!gl;
    invalidate();
  }

  let clock = 0, last = 0, measured = -1e9, dirty = true, visible = true, active = false, raf = 0, frames = 0;
  let width = 1, height = 1, level = 3, orbCentre = null, orbUniform = [0, 0, 0];
  function resize() {
    width = screen.clientWidth || 1; height = screen.clientHeight || 1;
    const r = layer.getBoundingClientRect();
    const budget = innerWidth < 700 ? 110000 : 260000;
    const ratio = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(budget / Math.max(1, r.width * r.height)));
    const w = Math.max(2, Math.round(r.width * ratio)), h = Math.max(2, Math.round(r.height * ratio));
    if (canvas.width !== w || canvas.height !== h) {canvas.width = w; canvas.height = h;}
    // How far below the rim the water lies (portal-depth.js owns the well).
    const depth = parseFloat(screen.style.getPropertyValue('--water-depth'));
    level = Number.isFinite(depth) ? depth : 3;
  }
  // Scene metres (x right, y up, z toward the viewer) to water plane units
  // (x right, y away, z up above the water, in aperture heights).
  const toPlane = ([x, y, z], scale, table, lift) => [x * scale, -z * scale, (y - table) * scale + lift];
  // The orb's centre above the water, its radius and how much of it shows.
  function orb(height, lift) {
    if (!matter || matter.dataset.state !== 'idle' || matter.style.visibility === 'hidden') return null;
    const centre = (parseFloat(matter.style.getPropertyValue('--matter-height')) || 0) / height + lift;
    // The drawn sphere's radius is .369 of its element's width.
    const radius = .369 * (parseFloat(matter.style.width) || 0) / height;
    const shown = parseFloat(matter.style.opacity || '1') * Math.min(1, Math.max(0, (centre - radius * .3) / radius));
    return [centre, radius, shown > .001 ? shown : 0];
  }
  // Rings on the water from a point of entry, in aperture fractions.
  function splash(x = .5, y = .5, strength = 1, delay = 0, speed = RING_SPEED) {
    if (!gl || reducedMotion.matches || !(strength > 0)) return false;
    const aspect = (screen.clientWidth || 1) / (screen.clientHeight || 1);
    const at = v => Math.min(1, Math.max(0, Number.isFinite(v) ? v : .5));
    if (rings.length === RINGS) rings.shift();
    rings.push({x: (at(x) - .5) * aspect, y: .5 - at(y), start: clock + delay, speed, strength: Math.min(1.2, strength)});
    schedule();
    return true;
  }
  // The shared water state for this frame.
  function update(now) {
    const aspect = width / height, lift = level / height;
    // Slow, irregular breathing: two unrelated periods, never a clean pulse.
    const breath = .62 * Math.sin(clock * 2 * Math.PI / 10.7) + .38 * Math.sin(clock * 2 * Math.PI / 17.3 + 1.1);
    const energy = 1 + params.breathing * breath;
    water.uniform[0] = (clock * params.rippleSpeed) % 3600;
    water.uniform[1] = params.rippleAmplitude * .012 * (1 + .6 * (energy - 1));
    water.uniform[2] = aspect;
    water.uniform[3] = energy;
    water.refraction = params.refraction;
    for (let i = rings.length - 1; i >= 0; i--) if (clock - rings[i].start > RING_LIFE) rings.splice(i, 1);
    water.ripples.fill(0);
    rings.forEach((ring, i) => {
      const age = clock - ring.start;
      if (age < 0) return;
      water.ripples.set([ring.x, ring.y, .035 + ring.speed * age,
        ring.strength * params.splash * Math.exp(-1.1 * age) * Math.min(1, age / .06)], i * 4);
    });
    // A dropped orb draws the water down under it (portal-reaction.js).
    const drop = window.portalReaction?.sample(now);
    water.pull[0] = ((drop?.x ?? .5) - .5) * aspect;
    water.pull[1] = .5 - (drop?.y ?? .5);
    water.pull[2] = (drop?.pull || 0) * .065 * params.splash;
    // The orb breaks the surface as it rises out of the portal.
    const o = orb(height, lift);
    if (o && orbCentre !== null && orbCentre < 0 && o[0] >= 0) splash(.5, .5, .6);
    orbCentre = o ? o[0] : null;
    orbUniform = o || [0, 0, 0];
  }
  function draw() {
    const camera = window.sceneCamera, scale = camera.units / height, lift = level / height;
    const offsets = window.portalDepth?.offsets;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uniforms.uAspect, width / height);
    gl.uniform1f(uniforms.uTime, clock % 3600);
    gl.uniform4fv(uniforms.uWater, water.uniform);
    gl.uniform4fv(uniforms.uRipples, water.ripples);
    gl.uniform3fv(uniforms.uPull, water.pull);
    gl.uniform1f(uniforms.uRippleSpeed, params.rippleSpeed);
    gl.uniform1f(uniforms.uShimmer, params.shimmer);
    gl.uniform1f(uniforms.uRefraction, params.refraction);
    gl.uniform1f(uniforms.uCloudSpeed, params.cloudSpeed);
    gl.uniform1f(uniforms.uGlow, params.glow);
    gl.uniform2f(uniforms.uThroat, offsets ? offsets[0] : 0, offsets ? offsets[1] : 0);
    gl.uniform3f(uniforms.uEye, 0, -camera.localEyeY / height, camera.localEyeZ / height + lift);
    for (const key of ['window', 'stair', 'lancet', 'nook'])
      gl.uniform3fv(uniforms['u' + key[0].toUpperCase() + key.slice(1)], toPlane(LIGHTS[key], scale, camera.tableHeight, lift));
    gl.uniform3fv(uniforms.uOrb, orbUniform);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    frames++;
  }
  // About 30 fps, and only while the pond is uncovered, on screen and in a
  // visible tab. Reduced motion draws single still frames.
  function frame(now) {
    raf = 0;
    if (!active || !gl) return;
    if (now - last < 30 && !dirty) {schedule(); return;}
    const dt = last ? Math.min(.1, (now - last) / 1000) : 0; last = now;
    const still = reducedMotion.matches;
    if (!still) clock += dt;
    // Layout is read only here, at most twice a second or after a change.
    if (dirty || now - measured > 500) {resize(); measured = now;}
    update(now);
    draw();
    dirty = false;
    if (!still) schedule();
  }
  function schedule() {if (!raf && active && gl) raf = requestAnimationFrame(frame);}
  function invalidate() {dirty = true; schedule();}
  function sync() {
    active = !document.hidden && visible && !document.body.classList.contains('table-covered');
    if (raf) cancelAnimationFrame(raf);
    raf = 0; last = 0;
    invalidate();
  }
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); gl = null; water.live = false; layer.classList.remove('webgl');
  });
  canvas.addEventListener('webglcontextrestored', initialize);
  new IntersectionObserver(entries => {visible = entries[0].isIntersecting; sync();}).observe(layer);
  new MutationObserver(sync).observe(document.body, {attributes: true, attributeFilter: ['class']});
  document.addEventListener('visibilitychange', sync);
  reducedMotion.addEventListener('change', sync);
  addEventListener('resize', invalidate);
  addEventListener('scene-camera-change', invalidate);
  // Whatever enters the water rings it. The orb drop's rings start where the
  // reaction's own waves do (portal-reaction.js: contact, then .7 of it).
  addEventListener('portal-reaction-start', ({detail = {}}) => {
    const cfg = window.portalReaction?.settings || {};
    const contact = Math.min(.52, .28 / (cfg.orbDropSpeed || 1)) * (detail.duration || 2.2) / 2.2;
    const strength = (detail.intensity ?? 1) * (cfg.rippleAmplitude ?? 1), speed = cfg.rippleSpeed || RING_SPEED;
    splash(detail.x, detail.y, strength, contact * .7, speed);
    splash(detail.x, detail.y, strength * .4, contact + .34, speed);
  });
  // The cloth's release (portal-impact.js) and a card dropping in (script.js).
  addEventListener('portal-impact', ({detail = {}}) => splash(detail.x, detail.y, .9 * (detail.strength ?? 1)));
  addEventListener('card-portal-arrival', ({detail = {}}) => {
    const v = detail.velocity, speed = v ? Math.hypot(v.x, v.y) : 0;
    splash(detail.aperture?.x, detail.aperture?.y, Math.min(1, .7 + speed / 5000));
  });
  initialize();
  sync();
  window.portalSurface = {params, layer, water, splash, glsl: WATER,
    get stats() {return {frames, active, live: !!gl, level, rings: rings.length,
      renderPixels: gl ? canvas.width * canvas.height : 0};}};
})();
