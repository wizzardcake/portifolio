/* One continuous piece of matter: socket seal -> liquid -> projected page.
   Local coordinates keep it attached to the portal through camera movement. */
(() => {
  const screen = document.getElementById('screen');
  const matter = document.getElementById('portalMatter');
  const canvas = matter.querySelector('canvas');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  // Scripted poses only. Hover never changes the portal's orientation.
  // Lower pitch = the tabletop opens up more toward the viewer, i.e. the
  // camera sits higher above the table and looks further down onto it.
  const camera = window.sceneCamera.camera;

  const vertex = `attribute vec2 position; varying vec2 uv;
    void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
  const fragment = `precision highp float;
    varying vec2 uv;
    uniform float time, aspect, fluid, morph, charge, spin, viewYaw, viewPitch;
    uniform vec3 tint;
    float noise(vec3 p) {
      return sin(p.x*2.8+sin(p.y*2.1))*sin(p.y*2.4+sin(p.z*2.7))*sin(p.z*2.2+sin(p.x*2.3));
    }
    float shape(vec3 p) {
      float c=cos(spin), s=sin(spin);
      vec3 q=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);
      float liquid=noise(q*1.35+vec3(time*.3,time*-.21,time*.19))*.32;
      liquid+=sin(q.y*4.+time*.6)*.14;
      float sphere=length(p)-(.93+fluid*liquid);
      vec3 box=abs(p)-vec3(aspect*.9-.07,.83,.045);
      float panel=length(max(box,0.))+min(max(box.x,max(box.y,box.z)),0.)-.07;
      return mix(sphere,panel,morph);
    }
    vec3 cameraRay(vec3 p) {
      float yaw=-viewYaw*fluid*(1.-morph), pitch=-viewPitch*fluid*(1.-morph);
      p=vec3(p.x,cos(pitch)*p.y-sin(pitch)*p.z,sin(pitch)*p.y+cos(pitch)*p.z);
      return vec3(cos(yaw)*p.x+sin(yaw)*p.z,p.y,-sin(yaw)*p.x+cos(yaw)*p.z);
    }
    void main() {
      // Leave breathing room for the liquid lobes so they never hit a square canvas edge.
      vec2 xy=(uv*2.-1.)*vec2(aspect,1.)*(1.+fluid*(1.-morph)*.26);
      // Seated in the socket, the silhouette is a dome, not a sliced ball:
      // a circular top that meets the rim, and the rim is a horizontal
      // circle the camera sees edge-on-ish, so it reads as an ellipse.
      // Cutting the sphere against the tabletop instead gives a dead
      // straight edge, which looks like a flat two-tone disc. Opens back
      // out to the full sphere as the ball lifts free (fluid).
      float domeOpen=clamp(fluid*3.,0.,1.);
      float rimS=mix(cos(viewPitch),1.,domeOpen);
      // The y-radius blends smoothly across a thin band at y=0 instead of
      // hard-switching between the full circle (above) and the compressed
      // ellipse (below) — the two curves shared a tangent there already,
      // but not curvature, which read as a subtle pinch at the left/right
      // extremes. One unified distance field for the whole silhouette,
      // faded out with smoothstep instead of a jagged binary discard.
      float domeBandT=smoothstep(-.05,.05,xy.y);
      float domeRy=mix(.93*rimS,.93,domeBandT);
      float domeDist=length(vec2(xy.x/.93,xy.y/max(domeRy,.001)));
      float domeAlpha=1.-smoothstep(.965,1.02,domeDist);
      if(domeAlpha<=0.){gl_FragColor=vec4(0.);return;}
      vec3 origin=cameraRay(vec3(xy,3.));
      vec3 direction=cameraRay(vec3(0.,0.,-1.));
      float travel=0.; vec3 p=origin; vec3 n;
      if(fluid<.001 && morph<.001) {
        float depth=max(.93*.93-dot(xy,xy),0.);
        p=vec3(xy,sqrt(depth)); n=normalize(p);
      } else {
      for(int i=0;i<64;i++){
        p=origin+direction*travel;
        float d=shape(p);
        if(d<.0015||travel>5.) break;
        travel+=d*.78;
      }
      if(travel>5.){gl_FragColor=vec4(0.);return;}
      float e=.003;
      n=normalize(vec3(shape(p+vec3(e,0.,0.))-shape(p-vec3(e,0.,0.)),
        shape(p+vec3(0.,e,0.))-shape(p-vec3(0.,e,0.)),
        shape(p+vec3(0.,0.,e))-shape(p-vec3(0.,0.,e))));
      }
      vec3 light=normalize(vec3(-.6,.85,1.4));
      float diffuse=max(0.,dot(n,light));
      float rim=pow(1.-max(dot(n,-direction),0.),2.8);
      float spec=pow(max(dot(n,normalize(light-direction)),0.),38.);
      vec3 q=p+vec3(spin*.25,0.,time*.035);
      float grain=noise(q*26.)*.025;
      float vein=pow(1.-abs(sin(noise(q*2.7)*11.+q.y*3.)),16.);
      vec3 base=mix(vec3(.10,.17,.16),tint,.22+charge*.13);
      vec3 color=base*(.38+diffuse*.95)+grain;
      color+=vec3(.69,.76,.65)*spec*.66;
      color+=tint*(rim*.52+vein*(.06+charge*.13));
      color+=vec3(.40,.26,.11)*pow(max(0.,dot(n,normalize(vec3(1.,-.4,.3)))),7.)*.22;
      color*=1.-morph*.22;
      gl_FragColor=vec4(color,domeAlpha);
    }`;

  let gl, program, uniforms;
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
    program = gl.createProgram();
    const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    uniforms = Object.fromEntries(['time','aspect','fluid','morph','charge','spin','tint','viewYaw','viewPitch'].map(name => [name, gl.getUniformLocation(program, name)]));
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
    const reader = window.sceneCamera.reader();
    const pageWidth = reader.width, pageHeight = reader.height;
    const pageLift = reader.z, pageYOffset = reader.y;
    screen.style.setProperty('--page-width', pageWidth + 'px');
    screen.style.setProperty('--page-size', pageHeight + 'px');
    screen.style.setProperty('--page-lift', pageLift + 'px');
    screen.style.setProperty('--page-y-offset', pageYOffset + 'px');
    if (nextMode === 'page') return {x: w / 2, y: h / 2 + pageYOffset, z: pageLift, w: pageWidth, h: pageHeight};
    const d = Math.min(260, h * .68, innerHeight * .30);
    // Keep the footprint at the exact centre. Only world height changes:
    // the sphere rises along the normal of the horizontal tabletop.
    return {x: w / 2, y: h / 2, z: d * .75, w: d, h: d};
  }
  function transitionTo(nextMode, duration) {
    window.portalReaction?.cancel('orb-transition');
    if (transition) transition.resolve(false);
    matter.style.opacity = '1';
    const from = rect || targetRect(mode);
    const emerging = mode === 'locked' && nextMode !== 'locked';
    mode = nextMode;
    matter.dataset.state = mode;
    matter.classList.toggle('is-liquid', mode === 'idle');
    return new Promise(resolve => {
      transition = {from: {...from}, fluid, morph, emerging, start: performance.now(), duration: reducedMotion.matches ? 80 : duration, resolve};
    });
  }
  function animate(now) {
    requestAnimationFrame(animate);
    if (document.hidden || (now - lastTime < 32 && !transition && !window.portalReaction?.active)) return;
    if (window.sceneCamera.appliedPitch !== camera.pitch) window.sceneCamera.update();
    lastTime = now;
    // One fixed table plane before, during and after the intro. Neither
    // unlocking, projecting a page nor pointer movement tilts the portal.
    screen.style.setProperty('--view-yaw', camera.yaw + 'deg');
    screen.style.setProperty('--view-pitch', camera.pitch + 'deg');
    const target = targetRect(mode);
    let t = 1;
    if (transition) {
      t = Math.min(1, (now - transition.start) / transition.duration);
      const ease = t * t * (3 - 2 * t);
      rect = Object.fromEntries(Object.keys(target).map(key => [key, transition.from[key] + (target[key] - transition.from[key]) * ease]));
      fluid = transition.fluid + ((mode === 'locked' ? 0 : 1) - transition.fluid) * ease;
      morph = transition.morph + ((mode === 'page' ? 1 : 0) - transition.morph) * ease;
      if (mode === 'idle' && !reducedMotion.matches) {
        rect.z += Math.sin(t * Math.PI) * 12;
      }
    } else rect = target;
    // Dormant it is not drawn at all; emerging, it materialises in the shaft
    // during the first third of its rise.
    matter.style.visibility = mode === 'locked' && !transition ? 'hidden' : '';
    if (transition?.emerging) matter.style.opacity = String(Math.min(1, t / .35));
    const reaction = mode === 'idle' && !transition ? window.portalReaction?.sample(now) : null;
    const drift = mode === 'idle' && !transition && !reducedMotion.matches
      ? Math.sin(now * .0009) * 4 * (1 - (reaction?.orbInfluence || 0)) : 0;
    matter.style.left = rect.x + 'px'; matter.style.top = rect.y + 'px';
    matter.style.width = rect.w + 'px'; matter.style.height = rect.h + 'px';
    matter.style.setProperty('--matter-height', (rect.z + drift + (reaction?.orbOffset || 0) * rect.w) + 'px');
    // Keep the rendered sphere round even while it seals the socket.
    // The tabletop is foreshortened; the volume must never be flattened
    // into that plane. The ray marcher supplies the surface's actual depth.
    matter.style.setProperty('--matter-face-yaw', -camera.yaw + 'deg');
    matter.style.setProperty('--matter-face-pitch', -camera.pitch + 'deg');
    // Once fully morphed into a flat page, the shader's own liquid/dome
    // rendering (grain, rim light, tint) doesn't match the crisp .app-view
    // HTML it's supposed to give way to — left visible, it sits behind/
    // around the real content as a blurry, wrong-colored ghost. Hidden only
    // in WebGL mode: the CSS fallback (!gl) uses this same element's own
    // box (border-radius/background) AS the page visual, so it must stay.
    canvas.style.opacity = (gl && morph >= .985) ? '0' : '1';
    // Nothing shows while the dormant orb is hidden under the cloth, or once
    // it has settled into a page (hidden canvas): skip the ray march then.
    const unseen = matter.style.visibility === 'hidden' || (morph >= .985 && !transition);
    if (gl && !unseen && rect.w > 0 && rect.h > 0 && matter.style.opacity !== '0') {
      // Cap the pixel budget: the surface stays smooth without a full-screen raymarch.
      const ratio = Math.min(devicePixelRatio, 1.5, 640 / Math.max(rect.w, rect.h));
      const w = Math.max(1, Math.round(rect.w * ratio)), h = Math.max(1, Math.round(rect.h * ratio));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform1f(uniforms.time, reducedMotion.matches ? 0 : now * .001);
      gl.uniform1f(uniforms.aspect, rect.w / rect.h);
      gl.uniform1f(uniforms.fluid, fluid); gl.uniform1f(uniforms.morph, morph);
      gl.uniform1f(uniforms.charge, charge); gl.uniform1f(uniforms.spin, spin);
      gl.uniform1f(uniforms.viewYaw, camera.yaw * Math.PI / 180);
      gl.uniform1f(uniforms.viewPitch, camera.pitch * Math.PI / 180);
      gl.uniform3fv(uniforms.tint, tint);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else if (!gl) {
      matter.style.borderRadius = mode === 'page' ? '18px' : '';
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
    async project(appId) {
      tint = appId === 'ommeg' ? [.52,.21,.28] : ['prosjekter','arbeidserfaring'].includes(appId) ? [.57,.42,.21] : [.24,.56,.49];
      screen.classList.add('is-projecting');
      const complete = await transitionTo('page', 1250);
      if (complete) screen.classList.remove('is-projecting');
      return complete;
    },
    restore() { screen.classList.remove('is-projecting'); return transitionTo('idle', 950); },
    reset() {
      window.portalReaction?.cancel('reset');
      document.body.classList.remove('portal-unlocked'); screen.classList.remove('is-projecting');
      if (transition) transition.resolve(false);
      transition = null; mode = 'locked'; fluid = morph = charge = spin = 0; rect = targetRect(mode);
      tint = [.27,.55,.46]; matter.style.opacity = '1'; matter.dataset.state = mode;
      matter.classList.remove('is-liquid');
    },
    // Exposed by reference (not a getter/copy) so external code — currently
    // just the dev/arrange.js camera panel — can mutate pitch/yaw in place
    // and have animate()'s next frame pick it up, same as this module's own
    // internal reads of it.
    camera,
  };
})();
