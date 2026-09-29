/* Shallow physical lining, then an optically deep interior. One opaque
   billboard just below the lining composites every depth layer in a single
   shader pass; depth-volume.js owns its material and projection. The well
   also sets the waterline (--water-depth): the liquid surface lies that far
   below the rim, and the interior is refracted through its slope field
   (portalSurface.water, read-only). Orb, lights and interactions remain
   independent. */
(() => {
  const screen=document.getElementById('screen'),volume=window.portalDepthVolume;
  if(!screen||!volume)return;
  const aperture=screen.querySelector('.screen-tunnel'),table=screen.querySelector('.portal-table');
  const tabletop=table.querySelector('.portal-table-top'),camera=window.sceneCamera;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer=matchMedia('(hover: hover) and (pointer: fine)');
  const settings={...volume.defaults},clamp=volume.clamp,TAU=Math.PI*2,FRAME=1000/30;
  // Lateral shift of a layer seen through the water, per unit slope and
  // aperture height of depth: roughly 1 - 1/n for water.
  const REFRACTION=.2;
  aperture.classList.add('portal-interior');
  // The short lining no longer screens the space under the back rim. The back
  // legs are only ever seen through the opening, so portal-depth.css hides them.
  screen.classList.add('has-portal-interior');
  const abyss=aperture.querySelector('.portal-abyss'),canvas=abyss.querySelector('canvas');
  const plane={element:abyss};
  // Optical depths in aperture heights. Seen through a fixed opening, a layer
  // slides with the pointer in proportion to depth/(eye height + depth).
  const layers=[
    {name:'throat',d:4.2,drift:0,phase:0},
    {name:'far-stars',d:3.1,drift:.004,phase:3.4},
    {name:'stars',d:1.9,drift:.006,phase:1.8},
    {name:'deep-energy',d:.86,drift:.014,phase:2.9},
    {name:'dark-mist',d:.48,drift:.018,phase:4.7},
    {name:'near-mist',d:.27,drift:.012,phase:.6},
  ].map(layer=>({...layer,x:0,y:0}));
  const PARALLAX=.05; // aperture half-widths an infinitely deep layer slides
  let seed=73;
  const random=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
  const motes=Array.from({length:volume.MOTES},()=>({angle:random()*TAU,radius:.27+random()*.2,
    phase:random(),period:34+random()*30,size:1.1+random()*1.1,violet:random()>.55}));
  const moteData=new Float32Array(volume.MOTES*4),offsets=new Float32Array(12),shifts=new Float32Array(4);
  const phases={nearFlow:0,nearTurn:0,deepFlow:0,deepTurn:0};
  let gl=null,uniforms=null,width=1,height=1,dirty=true,visible=true,active=false,raf=0,last=0;
  let elapsed=0,particleTime=0,sampledDpr=0,frames=0,wallDepthPx=0,waterDepthPx=0,pixel=1,jx=[1,0],jy=[0,1];
  const pointer={x:0,y:0},view={x:0,y:0};
  const moteCount=()=>gl?(innerWidth<600?12:volume.MOTES):0;
  function initialize() {
    try {
      gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,depth:false,stencil:false});
      if(!gl)throw new Error('WebGL unavailable');
      const compile=(type,source)=>{
        const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error(message);}
        return shader;
      };
      const program=gl.createProgram(),vs=compile(gl.VERTEX_SHADER,volume.vertex),fs=compile(gl.FRAGMENT_SHADER,volume.fragment);
      gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
      const keys=['time','fogDensity','centralDarkness','swirlAmount','deepGlowIntensity','phase',
        'planeSize','apertureSize','eye','basis','planeCenter','offset','starShift','apToLocal','pixel','motes',
        'impactPoint','impactPull','impactWave','impactRadius',
        'waterDepth','refraction','glowBreath','uWater','uRipples','uPull'];
      uniforms=Object.fromEntries(keys.map(key=>[key,gl.getUniformLocation(program,key)]));
      abyss.classList.add('webgl');
    } catch(error) {console.warn('Portal interior uses CSS fallback:',error.message);gl=null;abyss.classList.remove('webgl');}
    aperture.classList.toggle('has-depth',!!gl);invalidate();
  }
  function measure() {
    width=screen.clientWidth;height=screen.clientHeight;sampledDpr=devicePixelRatio||1;
    wallDepthPx=Math.min(48,Math.max(8,height*settings.wallDepth));
    screen.style.setProperty('--well-depth',wallDepthPx+'px');
    // The water stands this far below the rim, leaving a dry band of lining.
    waterDepthPx=wallDepthPx*settings.waterLevel;
    screen.style.setProperty('--water-depth',waterDepthPx+'px');
    const {localEyeZ:ez,localEyeY:ey}=camera;
    const frontCut=Math.max(.1,1-wallDepthPx*(ey-height/2)/ez/height-.03);
    screen.style.setProperty('--wall-front-cut',frontCut*100+'%');
    // Preserve the existing table cut exactly; only its inner lining shortens.
    const x=-table.offsetLeft,y=-table.offsetTop,w=table.clientWidth,h=table.clientHeight,c=5;
    tabletop.style.clipPath=`path(evenodd, "M0 0 H${w} V${h} H0 Z M${x+c} ${y} H${x+width-c} L${x+width} ${y+c} V${y+height-c} L${x+width-c} ${y+height} H${x+c} L${x} ${y+height-c} V${y+c} Z")`;
    // The billboard starts where the lining ends; it bleeds 3% under the rim.
    volume.project(plane,width,height,camera,wallDepthPx+Math.max(6,height*.02),.03);
    const box=abyss.getBoundingClientRect();
    pixel=box.width>0?plane.width/box.width:1;
    // How one aperture unit maps into the plane, for the screen-aligned stars.
    const at=(ax,ay)=>volume.toLocal(plane,camera,ax*width/2,ay*height/2,0);
    const [r,l,f,b]=[at(.05,0),at(-.05,0),at(0,.05),at(0,-.05)];
    jx=[(r[0]-l[0])*10,(r[1]-l[1])*10];jy=[(f[0]-b[0])*10,(f[1]-b[1])*10];
    const budget=innerWidth<600?180000:600000;
    const ratio=Math.min(sampledDpr,Math.sqrt(budget/Math.max(1,box.width*box.height)));
    const cw=Math.max(1,Math.floor(box.width*ratio)),ch=Math.max(1,Math.floor(box.height*ratio));
    if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
  }
  function geometry() {
    const {localEyeZ:ez,localEyeY:ey}=camera,still=motion.matches,strength=PARALLAX*settings.parallaxStrength;
    layers.forEach((layer,i)=>{
      const t=elapsed*(layer.name==='near-mist'?.083:.047),drift=still?0:layer.drift,depth=layer.d*height;
      const reach=strength*depth/(ez+depth);
      layer.x=view.x*reach+Math.sin(t+layer.phase)*drift;
      layer.y=view.y*reach*.6+Math.cos(t*.73+layer.phase)*drift*.6;
      offsets[i*2]=layer.x;offsets[i*2+1]=layer.y;
    });
    for(const [k,i] of [[0,1],[2,2]]) {
      const {x,y}=layers[i];shifts[k]=jx[0]*x+jy[0]*y;shifts[k+1]=jx[1]*x+jy[1]*y;
    }
    // Motes sink and gather toward the throat's axis, fading as they go.
    const slope=ey/ez,count=moteCount();
    for(let i=0;i<motes.length;i++) {
      const mote=motes[i],o=i*4;
      if(i>=count){moteData[o+3]=0;continue;}
      const f=(mote.phase+particleTime/mote.period)%1;
      const depth=height*(.10+f*2.4),t=ez/(ez+depth),gather=1-settings.inwardPull*f*.85;
      const angle=mote.angle+(f*.45+elapsed*.004)*settings.swirlAmount,reach=strength*depth/ez;
      const x=Math.cos(angle)*width*mote.radius*gather+view.x*reach*width/2;
      const y=Math.sin(angle)*height*mote.radius*.78*gather-depth*slope+view.y*reach*.6*height/2;
      const sx=x*t,sy=y*t+ey*(1-t);
      const edge=clamp((.48-Math.abs(sx/width))/.07)*clamp((.46-Math.abs(sy/height))/.07);
      // Brightest just below the lining; gone into the dark long before the axis.
      const life=clamp(f/.13)*clamp((1-f)/.25)*clamp((t-.14)/.5)**1.3;
      const [lx,ly]=volume.toLocal(plane,camera,x,y,-depth);
      moteData[o]=lx;moteData[o+1]=ly;
      moteData[o+2]=(mote.violet?-1:1)*mote.size*(.5+.5*t)*pixel;
      moteData[o+3]=edge*life*.9;
    }
  }
  function draw(now) {
    if(!gl)return;
    const impact=window.portalReaction?.sample(now); // read-only optional adapter
    const u=uniforms;
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.uniform1f(u.time,motion.matches?0:elapsed);
    for(const key of ['fogDensity','centralDarkness','swirlAmount','deepGlowIntensity'])gl.uniform1f(u[key],settings[key]);
    gl.uniform4f(u.phase,phases.nearFlow,phases.nearTurn,phases.deepFlow,phases.deepTurn);
    gl.uniform2f(u.planeSize,plane.width,plane.height);gl.uniform2f(u.apertureSize,width,height);
    gl.uniform2f(u.eye,camera.localEyeY,camera.localEyeZ);gl.uniform2f(u.basis,plane.s,plane.c);
    gl.uniform3f(u.planeCenter,plane.cx,plane.cy,plane.cz);
    gl.uniform2fv(u.offset,offsets);gl.uniform4fv(u.starShift,shifts);gl.uniform1f(u.pixel,pixel);
    gl.uniform4f(u.apToLocal,jx[0],jx[1],jy[0],jy[1]);
    gl.uniform4fv(u.motes,moteData);
    gl.uniform2f(u.impactPoint,(impact?.x??.5)*2-1,(impact?.y??.5)*2-1);
    gl.uniform1f(u.impactPull,impact?.pull||0);gl.uniform1f(u.impactWave,impact?.wave||0);gl.uniform1f(u.impactRadius,impact?.radius||0);
    // The water above (read-only): its slope bends the view, its breathing the glow.
    const water=window.portalSurface?.water,live=!!water?.live;
    gl.uniform1f(u.waterDepth,waterDepthPx);
    gl.uniform1f(u.refraction,live?REFRACTION*water.refraction:0);
    gl.uniform1f(u.glowBreath,live?water.uniform[3]:1);
    if(live){gl.uniform4fv(u.uWater,water.uniform);gl.uniform4fv(u.uRipples,water.ripples);gl.uniform3fv(u.uPull,water.pull);}
    gl.drawArrays(gl.TRIANGLES,0,6);
  }
  function advance(dt) {
    // Phases wrap on the shader's noise periods, so hours of idle stay seamless.
    const {flow,nearTurns,deepTurns}=volume.periods;
    elapsed+=dt;particleTime+=dt*settings.particleDepthSpeed;
    phases.nearFlow=(phases.nearFlow+dt*.077*settings.inwardPull)%flow;
    phases.deepFlow=(phases.deepFlow+dt*.2*settings.inwardPull)%flow;
    phases.nearTurn=(phases.nearTurn+dt*.086*settings.swirlAmount)%nearTurns;
    phases.deepTurn=(phases.deepTurn+dt*.26*settings.swirlAmount)%deepTurns;
  }
  function render(now) {
    raf=0;if(!active)return;
    if(now-last<FRAME-3&&!dirty){schedule();return;}
    const dt=last?Math.min(.1,(now-last)/1000):0;last=now;
    if(sampledDpr!==(devicePixelRatio||1))dirty=true;
    if(dirty)measure();if(width<2||height<2)return;
    if(!motion.matches)advance(dt);
    const ease=1-Math.exp(-dt*3);
    view.x+=(pointer.x-view.x)*ease;view.y+=(pointer.y-view.y)*ease;
    geometry();draw(now);frames++;dirty=false;
    // The CSS fallback is static; only the shader has continuous life.
    if(!motion.matches&&gl)schedule();
  }
  function schedule(){if(!raf&&active)raf=requestAnimationFrame(render);}
  function invalidate(){dirty=true;schedule();}
  function sync() {
    active=!document.hidden&&visible&&!document.body.classList.contains('table-covered');
    if(raf)cancelAnimationFrame(raf);raf=0;last=0;
    if(motion.matches)pointer.x=pointer.y=view.x=view.y=0;
    invalidate();
  }
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();gl=null;abyss.classList.remove('webgl');aperture.classList.remove('has-depth');invalidate();
  });
  canvas.addEventListener('webglcontextrestored',initialize);
  initialize();
  new ResizeObserver(invalidate).observe(screen);
  addEventListener('scene-camera-change',invalidate);
  // A pixel-ratio change need not resize anything (another monitor), and a
  // static reduced-motion frame has no loop to notice it.
  (function watchPixelRatio() {
    matchMedia(`(resolution: ${devicePixelRatio||1}dppx)`).addEventListener('change',()=>{invalidate();watchPixelRatio();},{once:true});
  })();
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();}).observe(screen);
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',sync);motion.addEventListener('change',sync);
  document.addEventListener('pointermove',event=>{
    if(!finePointer.matches||motion.matches||event.buttons)return;
    pointer.x=clamp(event.clientX/innerWidth*2-1,-1,1);pointer.y=clamp(event.clientY/innerHeight*2-1,-1,1);
  },{passive:true});
  document.documentElement.addEventListener('pointerleave',()=>{pointer.x=pointer.y=0;});
  window.portalDepth={defaults:volume.defaults,
    // Live layer offsets in aperture units (x,y per layer, throat first): the
    // surface lights the water around the throat where the abyss shows it.
    offsets,
    configure(values={}) {
      for(const [key,value] of Object.entries(values))if(volume.limits[key]&&Number.isFinite(value))settings[key]=clamp(value,...volume.limits[key]);
      invalidate();return {...settings};
    },
    get settings(){return {...settings};},
    get stats(){return {frames,active,reducedMotion:motion.matches,wallDepthPx,waterDepthPx,
      refraction:gl&&window.portalSurface?.water?.live?REFRACTION*window.portalSurface.water.refraction:0,
      particles:moteCount(),visibleParticles:gl?motes.filter((_,i)=>moteData[i*4+3]>.05).length:0,
      glContexts:gl?1:0,renderPixels:gl?canvas.width*canvas.height:0,
      plane:{depth:plane.depth,maxZ:plane.maxZ,width:plane.width,height:plane.height},
      layers:layers.map(l=>({name:l.name,depth:l.d*height,x:l.x*width/2,y:l.y*height/2}))};},
  };
  measure();geometry();sync();
})();
