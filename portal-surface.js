/* The portal's surface: a living magical pond lying in the aperture, just
   below the rim. One transparent WebGL plane (.portal-surface) between the
   shaft's depths (portal-depth.js) and the impact layers above it (-1px):
   - an idle height field of broad slow swells and small drifting ripples,
     damped at the walls; its slope drives everything else;
   - a Fresnel reflection of the room's actual light sources (the alcove's
     green window, the purple stair light, the tower's green lancets, the warm
     nook) and of the hovering orb, so coloured highlights travel over it;
   - fine, faster ripples that only the glints see: the shimmer;
   - faint luminous forms and dark clouds at two depths beneath it, seen
     through the surface along refracted rays, so the ripples bend them;
   - a slow irregular breathing of glow and ripple strength.
   It is dormant under the cloth, paused when hidden, and still for reduced
   motion.

   Tuning (live, every frame): window.portalSurface.params. 1 is the default
   look and 0 switches a part off; breathing is a fraction.

   Impact support: every shading term is derived from the slope returned by
   idleSlope() in the shader. A future impact ripple adds its own slope there
   (a uniform list of hits: centre, start time, strength), and the reflections,
   shimmer and refraction all respond to it at once. Short-lived effects can
   also stir the pond by raising params (e.g. rippleAmplitude, glow) briefly. */
(() => {
  const screen = document.getElementById('screen');
  const matter = document.getElementById('portalMatter');
  if (!screen) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const params = {
    rippleAmplitude: 1, // slope of the idle swells and small ripples
    rippleSpeed: 1,     // pace of the swells, the drift and the shimmer
    shimmer: 1,         // fine travelling glints of the room's light
    refraction: 1,      // how strongly the ripples bend the view beneath
    cloudSpeed: 1,      // drift and slow turn of the forms beneath
    glow: 1,            // brightness of the forms beneath
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

  const layer = document.createElement('div');
  layer.className = 'portal-surface';
  layer.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  layer.append(canvas);
  const tunnel = screen.querySelector('.screen-tunnel');
  if (tunnel) tunnel.after(layer); else screen.prepend(layer);

  const vertex = `attribute vec2 position; varying vec2 uv;
    void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
  // Aperture plane coordinates in aperture heights: x right, y away from the
  // viewer, z up; the aperture centre at the origin. Output is premultiplied:
  // alpha is what the pond hides of the depths, rgb what it adds as light.
  const fragment = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    varying vec2 uv;
    uniform float uAspect, uTime, uEnergy;
    uniform float uRipple, uRippleSpeed, uShimmer, uRefraction, uCloudSpeed, uGlow;
    uniform vec3 uEye, uWindow, uStair, uLancet, uNook;
    uniform vec3 uOrb; // the orb's centre height, radius, strength (0: absent)

    float hash(vec2 p) {
      vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
      q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z);
    }
    // Value noise with its gradient (quintic), for surface slopes.
    vec3 noised(vec2 p) {
      vec2 i=floor(p), f=fract(p);
      vec2 u=f*f*f*(f*(f*6.-15.)+10.), du=30.*f*f*(f*(f-2.)+1.);
      float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
      float k1=b-a, k2=c-a, k4=a-b-c+d;
      return vec3(a+k1*u.x+k2*u.y+k4*u.x*u.y, du*(vec2(k1,k2)+k4*u.yx));
    }
    float noise(vec2 p) {
      vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
    }
    float fbm(vec2 p) {
      float v=0., a=.5;
      for(int i=0;i<4;i++){v+=a*noise(p);p=mat2(1.6,1.2,-1.2,1.6)*p;a*=.5;}
      return v;
    }
    vec2 turn(vec2 p, float a) {float c=cos(a), s=sin(a); return mat2(c,s,-s,c)*p;}

    // The idle surface's slope: broad swells travelling in four directions at
    // unrelated speeds, and two layers of drifting noise, so it never repeats.
    // Impact ripples add their own slope here.
    vec2 idleSlope(vec2 p, float t) {
      vec2 d1=vec2(.83,.56), d2=vec2(-.64,.77), d3=vec2(.19,-.98), d4=vec2(-.96,-.28);
      vec2 g=.50*5.3*d1*cos(dot(p,d1)*5.3-t*.62+1.3);
      g+=.34*7.9*d2*cos(dot(p,d2)*7.9-t*.83+4.1);
      g+=.24*11.3*d3*cos(dot(p,d3)*11.3-t*1.07+2.2);
      g+=.16*15.1*d4*cos(dot(p,d4)*15.1-t*1.31+5.);
      g+=noised(p*5.+vec2(t*.21,-t*.16)).yz*5.*.55;
      g+=noised(p*10.3+vec2(-t*.29,t*.24)+5.2).yz*10.3*.25;
      return g;
    }

    float lobe(vec3 P, vec3 R, vec3 S, float k) {return exp((dot(R,normalize(S-P))-1.)*k);}
    // What the pond mirrors: a dark room, a little warm overhead, and its lights.
    vec3 room(vec3 P, vec3 R) {
      vec3 c=mix(vec3(.010,.012,.018),vec3(.034,.026,.020),smoothstep(-.1,.6,R.z));
      // Upper walls faintly lit by the window's green (left) and the stair's
      // purple (right): what the steeper reflections near the viewer see.
      c+=mix(vec3(.10,.30,.24),vec3(.24,.14,.40),smoothstep(-.4,.4,R.x))*.12*smoothstep(.25,.75,R.z);
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
      float t=uTime;
      float wall=min(.5*uAspect-abs(p.x),.5-abs(p.y));
      float calm=smoothstep(0.,.07,wall);
      float strength=uRipple*.012*(1.+.6*(uEnergy-1.))*calm;
      vec2 slope=idleSlope(p,t*uRippleSpeed)*strength;
      vec3 P=vec3(p,0.), V=normalize(uEye-P);
      vec3 N=normalize(vec3(-slope,1.));
      float fresnel=.02+.98*pow(1.-max(dot(N,V),0.),5.);
      vec3 R=reflect(-V,N);
      // Fine, faster ripples that only the glints see.
      vec2 fine=noised(p*23.+vec2(t*.9,-t*.7)*uRippleSpeed).yz*23.*.0022*uShimmer*calm;
      vec3 Rf=reflect(-V,normalize(vec3(-(slope+fine),1.)));
      vec3 mirrored=(room(P,R)*1.9+orb(P,R)*2.
        +glints(P,Rf)*uShimmer*(1.+.5*(uEnergy-1.)))*fresnel;

      // Beneath the surface, along the refracted ray: wisps just under it,
      // the glowing masses and dark clouds deeper down.
      vec3 T=refract(-V,normalize(vec3(-slope*uRefraction*1.8,1.)),.75);
      vec2 lateral=T.xy/max(-T.z,.3);
      vec2 qw=p+lateral*.06, qc=p+lateral*.2;
      float ts=t*uCloudSpeed;
      // Glowing masses: sparse, slowly turning and warping; mostly teal and
      // violet, now and then green or blue.
      vec2 c=turn(qc,ts*.02);
      vec2 w=vec2(fbm(c*1.7+vec2(ts*.05,-ts*.03)),fbm(c*1.7+vec2(-ts*.04,ts*.05)+4.7));
      float mass=fbm(c*2.3+(w-.5)*2.+vec2(0.,-ts*.025));
      float hue=fbm(c*.9-(w-.5)*1.4+vec2(ts*.012,9.1));
      float rare=smoothstep(.66,.8,noise(c*.8+vec2(-ts*.03,3.3)));
      vec3 energy=mix(vec3(.07,.52,.48),vec3(.38,.19,.72),smoothstep(.42,.6,hue));
      energy=mix(energy,mix(vec3(.2,.66,.34),vec3(.16,.34,.8),smoothstep(.3,.7,noise(c*1.3+7.7))),rare*.6);
      float centre=.45+.55*(1.-smoothstep(.25,1.05,length(vec2(p.x/(.5*uAspect),p.y/.5))));
      float glow=smoothstep(.5,.84,mass)*centre;
      // Wisps: thin luminous streaks drawn out along the aperture, few at a time.
      vec2 s=turn(qw,-ts*.03);
      vec2 streak=vec2(s.x*.8,s.y*2.4);
      float n=fbm(streak*1.9+vec2(ts*.06,ts*.02)+fbm(s*1.2-ts*.035)*1.2);
      float wisp=pow(1.-abs(n*2.-1.),6.)*smoothstep(.5,.78,noise(s*.8+vec2(-ts*.035,1.7)));
      float shade=smoothstep(.5,.74,fbm(turn(qc,-ts*.012)*1.3+vec2(ts*.02,-ts*.035)+11.))*.3;
      vec3 light=(energy*glow*.38+vec3(.5,.92,.88)*wisp*.16)*uGlow*uEnergy*(1.-fresnel)*(1.-shade*.8);
      light/=1.+light*.6;

      // The water itself dims the depths, more where it is seen edge-on;
      // a faint bright line where it meets the stone.
      float body=mix(.08,.28,1.-max(dot(N,V),0.));
      vec3 meniscus=vec3(.16,.42,.40)*exp(-wall*140.)*.25;
      float alpha=1.-(1.-body)*(1.-fresnel)*(1.-shade);
      gl_FragColor=vec4(vec3(.004,.016,.022)*body+light+mirrored+meniscus,min(alpha,.9));
    }`;

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
      uniforms = Object.fromEntries(['uAspect','uTime','uEnergy','uRipple','uRippleSpeed','uShimmer','uRefraction',
        'uCloudSpeed','uGlow','uEye','uWindow','uStair','uLancet','uNook','uOrb'].map(key => [key, gl.getUniformLocation(program, key)]));
      gl.clearColor(0, 0, 0, 0);
      layer.classList.add('webgl');
    } catch (error) {
      console.warn('Portal surface uses a CSS fallback:', error.message);
      gl = null; layer.classList.remove('webgl');
    }
    dirty = true;
  }

  let clock = 0, last = 0, measured = -1e9, dirty = true, visible = true, covered = null;
  function resize() {
    const r = layer.getBoundingClientRect();
    const budget = innerWidth < 700 ? 110000 : 260000;
    const ratio = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(budget / Math.max(1, r.width * r.height)));
    const w = Math.max(2, Math.round(r.width * ratio)), h = Math.max(2, Math.round(r.height * ratio));
    if (canvas.width !== w || canvas.height !== h) {canvas.width = w; canvas.height = h;}
  }
  // Scene metres (x right, y up, z toward the viewer) to aperture plane
  // units (x right, y away, z up, in aperture heights).
  const toPlane = ([x, y, z], scale, table) => [x * scale, -z * scale, (y - table) * scale];
  // The orb, mirrored while it hovers above the surface (portal-effects.js).
  function orb(height) {
    if (!matter || matter.dataset.state !== 'idle' || matter.style.visibility === 'hidden') return [0, 0, 0];
    const lift = (parseFloat(matter.style.getPropertyValue('--matter-height')) || 0) / height;
    // The drawn sphere's radius is .369 of its element's width.
    const radius = .369 * (parseFloat(matter.style.width) || 0) / height;
    const shown = parseFloat(matter.style.opacity || '1') * Math.min(1, Math.max(0, (lift - radius * .3) / radius));
    return [lift, radius, shown > .001 ? shown : 0];
  }
  function draw() {
    const width = screen.clientWidth || 1, height = screen.clientHeight || 1, camera = window.sceneCamera;
    const scale = camera.units / height;
    // Slow, irregular breathing: two unrelated periods, never a clean pulse.
    const breath = .62 * Math.sin(clock * 2 * Math.PI / 10.7) + .38 * Math.sin(clock * 2 * Math.PI / 17.3 + 1.1);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uniforms.uAspect, width / height);
    gl.uniform1f(uniforms.uTime, clock % 3600);
    gl.uniform1f(uniforms.uEnergy, 1 + params.breathing * breath);
    gl.uniform1f(uniforms.uRipple, params.rippleAmplitude);
    gl.uniform1f(uniforms.uRippleSpeed, params.rippleSpeed);
    gl.uniform1f(uniforms.uShimmer, params.shimmer);
    gl.uniform1f(uniforms.uRefraction, params.refraction);
    gl.uniform1f(uniforms.uCloudSpeed, params.cloudSpeed);
    gl.uniform1f(uniforms.uGlow, params.glow);
    gl.uniform3f(uniforms.uEye, 0, -camera.localEyeY / height, camera.localEyeZ / height);
    for (const key of ['window', 'stair', 'lancet', 'nook'])
      gl.uniform3fv(uniforms['u' + key[0].toUpperCase() + key.slice(1)], toPlane(LIGHTS[key], scale, camera.tableHeight));
    gl.uniform3fv(uniforms.uOrb, orb(height));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  // About 30 fps while the pond is uncovered and on screen.
  function frame(now) {
    requestAnimationFrame(frame);
    const isCovered = document.body.classList.contains('table-covered');
    if (isCovered !== covered) {covered = isCovered; dirty = true;}
    if (!gl || covered || document.hidden || !visible) {last = now; return;}
    if (now - last < 33) return;
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    const still = reducedMotion.matches;
    if (still && !dirty) return;
    if (!still) clock += dt;
    if (dirty || now - measured > 500) {resize(); measured = now;}
    draw();
    dirty = false;
  }
  canvas.addEventListener('webglcontextlost', event => {event.preventDefault(); gl = null; layer.classList.remove('webgl');});
  canvas.addEventListener('webglcontextrestored', initialize);
  new IntersectionObserver(entries => {visible = entries[0].isIntersecting; dirty = true;}).observe(layer);
  addEventListener('resize', () => {dirty = true;});
  addEventListener('scene-camera-change', () => {dirty = true;});
  reducedMotion.addEventListener('change', () => {dirty = true;});
  initialize();
  requestAnimationFrame(frame);
  window.portalSurface = {params, layer};
})();
