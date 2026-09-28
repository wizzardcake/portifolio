/* A cut tabletop and a CSS 3D shaft. There is no drawable surface at Z=0.
   Only two transparent fog billboards use WebGL. Walls, stars and motes
   are separate geometry below the table, sharing its camera perspective. */
(() => {
  const screen = document.getElementById('screen');
  const aperture = screen.querySelector('.screen-tunnel');
  const table = screen.querySelector('.portal-table');
  const tabletop = table.querySelector('.portal-table-top');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const abyss = aperture.querySelector('.portal-abyss');
  const stars = aperture.querySelector('.portal-stars');
  const fogs = [...aperture.querySelectorAll('.portal-fog')];
  let seed = 73;
  const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 86; i++) {
    const star = document.createElement('i');
    star.style.cssText = `left:${random() * 100}%;top:${random() * 100}%;--star-size:${1 + random() * 1.9}px;--star-alpha:${.25 + random() * .6}`;
    stars.appendChild(star);
  }
  const motes = Array.from({length: 20}, () => {
    const element = document.createElement('i'); element.className = 'portal-mote';
    element.style.cssText = `--mote-size:${1.7 + random() * 1.7}px;--mote-color:${random() > .55 ? '#86bcb0' : '#9c89bc'}`;
    aperture.querySelector('.portal-particles').appendChild(element);
    return {element, x: (random() - .5) * .82, y: random() * .5 - .4, phase: random(), period: 42 + random() * 35};
  });
  const vertex = `attribute vec2 position; varying vec2 uv;
    void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
  // Reuse the existing cloud treatment. No shaft, rim, floor or stars are
  // painted here: each canvas contains transparent wisps at its own depth.
  const fragment = `precision highp float;
    varying vec2 uv;
    uniform float time, aspect, layer;
    float hash(vec2 p) {
      vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
      q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z);
    }
    float noise(vec2 p) {
      vec2 i=floor(p), f=fract(p); f=f*f*f*(f*(f*6.-15.)+10.);
      return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);
    }
    float cloud(vec2 p, float z) {
      p+=vec2(sin(p.y*1.8+z+time*.025),cos(p.x*1.4-z-time*.02))*.32;
      mat2 turn=mat2(.8,-.6,.6,.8); vec2 q=p*3.2;
      float value=noise(q+z)*.55;
      q=turn*q*2.03; value+=noise(q-z)*.25;
      q=turn*q*2.01; value+=noise(q+z)*.13;
      q=turn*q*2.07; value+=noise(q-z)*.07; return value;
    }
    void main() {
      vec2 p=(uv*2.-1.)*vec2(aspect,1.);
      float left=exp(-dot((p-vec2(-aspect*.43,.03))*vec2(.85,1.9),(p-vec2(-aspect*.43,.03))*vec2(.85,1.9)));
      float right=exp(-dot((p-vec2(aspect*.43,-.07))*vec2(.85,1.9),(p-vec2(aspect*.43,-.07))*vec2(.85,1.9)));
      float n=cloud(p+vec2(layer*.13,time*.016),layer-time*.045);
      float wisps=smoothstep(.38,.66,n)*(.65+sin(p.y*6.+layer*3.-time*.09)*.35);
      float edge=(1.-smoothstep(.76,1.,abs(p.x/aspect)))*(1.-smoothstep(.6,1.,abs(p.y)));
      float alpha=wisps*(left+right)*edge*.64;
      vec3 color=mix(vec3(.085,.36,.34),vec3(.23,.10,.36),right/(left+right+.001));
      vec3 exposed=1.-exp(-color*1.15);
      vec3 displayColor=mix(exposed*12.92,1.055*pow(exposed,vec3(1./2.4))-.055,step(vec3(.0031308),exposed));
      gl_FragColor=vec4(displayColor,alpha);
    }`;

  let width = 1, height = 1, pitch = 46 * Math.PI / 180;
  let dirty = true, visible = true, last = 0, elapsed = 0, measured = -1000, sampledDpr = 0;
  const pointer = {x: 0, y: 0}, view = {x: 0, y: 0};
  const renderers = fogs.map((element, i) => ({element, canvas: element.querySelector('canvas'), layer: i === 0 ? 3.2 : 1.1, gl: null}));
  function initialize(renderer) {
    const {canvas, element} = renderer;
    try {
      const gl = canvas.getContext('webgl', {alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false});
      if (!gl) throw new Error('WebGL unavailable');
      const compile = (type, source) => {
        const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {const reason = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(reason);}
        return shader;
      };
      const program = gl.createProgram(), vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
      gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const pos = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
      Object.assign(renderer, {gl, program, buffer, uniforms: Object.fromEntries(['time','aspect','layer'].map(key => [key, gl.getUniformLocation(program, key)]))});
      element.classList.add('webgl');
    } catch (error) {
      console.warn('Portal fog uses CSS fallback:', error.message);
      renderer.gl = null; element.classList.remove('webgl');
    }
    aperture.classList.toggle('has-depth', renderers.every(r => r.gl)); dirty = true;
  }
  renderers.forEach(renderer => {
    renderer.canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); renderer.gl = null;
      renderer.element.classList.remove('webgl'); aperture.classList.remove('has-depth'); dirty = true;
    });
    renderer.canvas.addEventListener('webglcontextrestored', () => initialize(renderer));
    initialize(renderer);
  });
  function measure() {
    width = screen.clientWidth; height = screen.clientHeight;
    pitch = (parseFloat(getComputedStyle(screen).getPropertyValue('--view-pitch')) || 46) * Math.PI / 180;
    const wellDepth = height * .48;
    screen.style.setProperty('--well-depth', wellDepth + 'px');
    // Clip each side face to the front sightline so its lower corner cannot
    // leak out below the table apron. The top ring handles rim occlusion.
    const {localEyeZ: cameraZ, localEyeY: cameraY} = window.sceneCamera;
    const frontCut = Math.max(.1, 1 - wellDepth * (cameraY - height / 2) / cameraZ / height - .03);
    screen.style.setProperty('--wall-front-cut', frontCut * 100 + '%');
    const x = -table.offsetLeft, y = -table.offsetTop, w = table.clientWidth, h = table.clientHeight, c = 5;
    tabletop.style.clipPath = `path(evenodd, "M0 0 H${w} V${h} H0 Z M${x+c} ${y} H${x+width-c} L${x+width} ${y+c} V${y+height-c} L${x+width-c} ${y+height} H${x+c} L${x} ${y+height-c} V${y+c} Z")`;
    sampledDpr = devicePixelRatio || 1;
  }
  function place(element, depth, x, y) {
    element.style.setProperty('--layer-z', -depth + 'px');
    element.style.setProperty('--layer-x', x + 'px');
    element.style.setProperty('--layer-y', y + 'px');
  }
  function geometry() {
    // Deep space lies beyond the end of the physical shaft. Its location
    // compensates for the downward view, so it remains visible in the hole.
    const slope = window.sceneCamera.localEyeY / window.sceneCamera.localEyeZ;
    place(abyss, height * 1.9, 0, -height * 1.9 * slope);
    place(stars, height * 1.6, view.x * width * .008, height * (-1.6 * slope + .1) + view.y * height * .008);
    place(fogs[0], height * (.98 + Math.sin(elapsed * .10) * .025), view.x * width * .04, height * (-.98 * slope + .12) + view.y * height * .025);
    place(fogs[1], height * (.58 + Math.sin(elapsed * .14) * .035), view.x * width * .085, height * (-.58 * slope + .32) + view.y * height * .06);
    const {localEyeZ: cameraZ, localEyeY: cameraY} = window.sceneCamera;
    for (const mote of motes) {
      const cycle = (mote.phase + elapsed / mote.period) % 1;
      const depth = height * (.98 - cycle * .89);
      const x = mote.x * width + view.x * width * .055 / (1 + depth / height);
      const y = mote.y * height + view.y * height * .04;
      const surfaceX = x * cameraZ / (cameraZ + depth);
      const surfaceY = (y * cameraZ + cameraY * depth) / (cameraZ + depth);
      const inside = Math.abs(surfaceX) < width * .475 && Math.abs(surfaceY) < height * .46;
      mote.element.style.setProperty('--mote-x', x + 'px');
      mote.element.style.setProperty('--mote-y', y + 'px');
      mote.element.style.setProperty('--mote-z', -depth + 'px');
      mote.element.style.opacity = inside ? String(Math.min(1, cycle * 8, (1 - cycle) * 6) * .8) : '0';
    }
  }
  new ResizeObserver(() => {dirty = true;}).observe(screen);
  addEventListener('scene-camera-change', () => {dirty = true;});
  new IntersectionObserver(entries => {visible = entries[0].isIntersecting; dirty = true;}).observe(screen);
  document.addEventListener('pointermove', event => {
    if (!finePointer.matches || reducedMotion.matches || event.buttons) return;
    pointer.x = Math.max(-1, Math.min(1, event.clientX / innerWidth * 2 - 1));
    pointer.y = Math.max(-1, Math.min(1, event.clientY / innerHeight * 2 - 1));
  }, {passive: true});
  document.documentElement.addEventListener('pointerleave', () => {pointer.x = pointer.y = 0;});
  reducedMotion.addEventListener('change', () => {pointer.x = pointer.y = view.x = view.y = 0; dirty = true;});
  function render(now) {
    requestAnimationFrame(render);
    if (document.hidden || !visible) {last = now; return;}
    if (now - last < 33) return;
    const dt = Math.min((now - last) / 1000, .1); last = now;
    if (sampledDpr !== devicePixelRatio) dirty = true;
    if (reducedMotion.matches && !dirty) return;
    if (dirty || now - measured > 180) {measure(); measured = now;}
    if (width < 2 || height < 2) return;
    if (!reducedMotion.matches) elapsed += dt;
    const ease = 1 - Math.exp(-dt * 3);
    view.x += (pointer.x - view.x) * ease; view.y += (pointer.y - view.y) * ease;
    geometry();
    for (const renderer of renderers) {
      const {gl, canvas, element, uniforms} = renderer;
      if (!gl) continue;
      const r = element.getBoundingClientRect();
      const budget = innerWidth < 600 ? 275000 : 900000;
      const ratio = Math.min(sampledDpr * 1.15, 2, Math.sqrt(budget / Math.max(1, r.width * r.height)), 2400 / Math.max(1, r.width));
      const w = Math.max(1, Math.floor(r.width * ratio)), h = Math.max(1, Math.floor(r.height * ratio));
      if (canvas.width !== w || canvas.height !== h) {canvas.width = w; canvas.height = h;}
      gl.viewport(0, 0, w, h);
      gl.uniform1f(uniforms.time, reducedMotion.matches ? 0 : elapsed);
      gl.uniform1f(uniforms.aspect, element.clientWidth / element.clientHeight);
      gl.uniform1f(uniforms.layer, renderer.layer); gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    dirty = false;
  }
  measure(); geometry(); requestAnimationFrame(render);
})();
