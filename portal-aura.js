import * as THREE from './vendor/three/three.module.js';

// Presentation only: observe the completed intro, never drive cloth or cards.
// No new WebGL context, room geometry, shadow map or full-screen postprocess.
const screen = document.getElementById('screen');
const view = window.sceneCamera;
const room = window.studyRoom;
const motion = matchMedia('(prefers-reduced-motion: reduce)');
export const AURA_DEFAULTS = Object.freeze({
  intensity: 1, rim: .62, haze: .30, particles: .65, light: 1,
  pulseAmount: .075, pulseSeconds: 14, moteCount: 28, refraction: 1.4
});
const settings = {...AURA_DEFAULTS};
const bounds = {intensity:[0,2],rim:[0,1],haze:[0,.6],particles:[0,1],light:[0,2],
  pulseAmount:[0,.15],pulseSeconds:[8,40],moteCount:[0,32],refraction:[0,2]};
const layer = document.createElement('div');
layer.className = 'portal-aura'; layer.setAttribute('aria-hidden','true');
screen.appendChild(layer);
const part = (className, parent = layer) => {
  const el = document.createElement('i'); el.className = className; parent.appendChild(el); return el;
};
for (const side of ['left','right','back','front']) part('aura-rim aura-rim--'+side);
const apron = part('portal-aura-apron', screen.querySelector('.portal-table'));
apron.setAttribute('aria-hidden','true');

// A static noise field displaces only two narrow patches of near air. The
// patches drift through it; the room never becomes a full-screen filter.
const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
svg.setAttribute('width','0'); svg.setAttribute('height','0');
svg.setAttribute('aria-hidden','true'); svg.style.position='absolute';
svg.innerHTML = `<defs><filter id="portal-aura-refraction" x="-10%" y="-15%" width="120%" height="130%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency=".012 .027" numOctaves="1" seed="17" result="air"/>
  <feDisplacementMap in="SourceGraphic" in2="air" scale="1.4" xChannelSelector="R" yChannelSelector="G"/>
</filter></defs>`;
layer.appendChild(svg);
const displacement = svg.querySelector('feDisplacementMap');
const shimmers = [part('aura-shimmer'),part('aura-shimmer')];

// One 256x128 alpha texture shared by three separated billboards. Volume comes
// from their actual CSS heights and drift, not animated noise rendering.
function hazeMask() {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
  const ctx=canvas.getContext('2d'), pixels=ctx.createImageData(256,128);
  const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
  const mix=(a,b,t)=>a+(b-a)*t;
  const noise=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y);let u=x-ix,v=y-iy;u=u*u*(3-2*u);v=v*v*(3-2*v);
    return mix(mix(hash(ix,iy),hash(ix+1,iy),u),mix(hash(ix,iy+1),hash(ix+1,iy+1),u),v);};
  for(let y=0;y<128;y++)for(let x=0;x<256;x++) {
    const px=x/256*2-1,py=y/128*2-1;
    const n=noise(x*.025,y*.038)*.58+noise(x*.067,y*.083)*.29+noise(x*.15,y*.17)*.13;
    const ribbon=Math.exp(-Math.pow(py-.24*Math.sin(px*6+n*3),2)*7);
    const fade=Math.pow(Math.max(0,1-px*px),1.8)*Math.pow(Math.max(0,1-py*py),2);
    const i=(y*256+x)*4;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;
    pixels.data[i+3]=255*fade*ribbon*Math.max(0,(n-.26)/.55);
  }
  ctx.putImageData(pixels,0,0);return `url("${canvas.toDataURL()}")`;
}
layer.style.setProperty('--aura-haze-mask',hazeMask());
const wisps = [
  {el:part('aura-wisp aura-wisp--teal'),x:-.25,y:-.20,z:.10,w:.59,h:.22,phase:0},
  {el:part('aura-wisp aura-wisp--purple'),x:.27,y:.12,z:.20,w:.46,h:.24,phase:2.1},
  {el:part('aura-wisp aura-wisp--green'),x:-.23,y:.23,z:.34,w:.34,h:.22,phase:4.4}
];
let seed=187;
const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const colors=['#83dcbf','#59c9c4','#a38ace','#88bea9'];
const motes=Array.from({length:32},(_,i)=>{
  const el=part('aura-mote');el.style.background=colors[i%colors.length];
  const size=1.6+random()*1.8;el.style.width=el.style.height=size+'px';
  return {el,phase:random(),period:36+random()*30,angle:random()*Math.PI*2,radius:.24+random()*.22,lift:.13+random()*.26};
});

// Existing reveal/impact lights remain under room-scene.js's control. Extra
// spill starts at the opening, falls off locally, and uses room layer 0 only
// (never the cloth/chair overlay's layer 1). No extra shadow maps.
const lights = room ? [
  new THREE.PointLight('#45d9b3',0,4.0,2),
  new THREE.PointLight('#9560d8',0,3.8,2)
] : [];
lights.forEach((light,i)=>{light.name='portal aura '+(i?'violet':'jade');room.scene.add(light);});
let width=1,height=1,units=1,elapsed=0,fade=0,pulse=1;
let enabled=true,active=false,raf=0,last=0,lastPaint=0,lastLight=-Infinity;
let frames=0,lightUpdates=0,geometryKey='',wasReduced=motion.matches;
const FACE='rotateX(calc(var(--view-pitch) * -1))';
function place(el,x,y,z) {
  el.style.transform=`translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,${z.toFixed(2)}px) translate(-50%,-50%) ${FACE}`;
}
function resize() {
  const key=[screen.clientWidth,screen.clientHeight,view.units].join(':');
  if(key===geometryKey)return;geometryKey=key;
  width=screen.clientWidth;height=screen.clientHeight;units=view.units;
  for(const w of wisps){w.el.style.width=width*w.w+'px';w.el.style.height=units*w.h+'px';}
  for(const el of shimmers){el.style.width=width*.13+'px';el.style.height=units*.13+'px';}
  lights.forEach((light,i)=>light.position.set((i?1:-1)*width/units*.36,view.tableHeight+.10,-height/units*.04));
  paint(true);schedule();
}
function updateLights(gain,force=false) {
  if(!room||room.renderer.getContext().isContextLost())return;
  if(!force&&elapsed-lastLight<.125)return; // at most 8 light updates/s
  lastLight=elapsed;
  lights.forEach((light,i)=>{light.intensity=(i?5.4:6.8)*gain*settings.light;});
  lightUpdates++;room.invalidate();
}
function paint(force=false) {
  frames++;
  const t=motion.matches?0:elapsed;
  pulse=motion.matches?1:1+settings.pulseAmount*Math.sin(t*2*Math.PI/settings.pulseSeconds);
  const gain=active?settings.intensity*fade*pulse:0;
  layer.style.visibility=gain>0?'visible':'hidden';
  layer.style.setProperty('--aura-rim-alpha',Math.min(1,gain*settings.rim));
  apron.style.opacity=Math.min(1,gain*settings.rim*.75);
  wisps.forEach(w=>{
    const sway=Math.sin(t*.11+w.phase);
    place(w.el,width*w.x+units*.025*sway,height*w.y+units*.012*Math.cos(t*.09+w.phase),units*(w.z+.022*Math.sin(t*.15+w.phase)));
    w.el.style.opacity=Math.min(.6,gain*settings.haze*(.83+.17*sway));
  });
  shimmers.forEach((el,i)=>{
    place(el,width*(i?.38:-.38)+Math.sin(t*.12+i)*units*.012,height*(i?.06:-.08),units*(.025+.004*Math.sin(t*.13)));
    el.style.visibility=gain>.01&&!motion.matches&&settings.refraction>0&&innerWidth>=900?'visible':'hidden';
    el.style.opacity=Math.min(1,gain*.45);
  });
  const count=Math.min(innerWidth<600?12:32,Math.round(settings.moteCount));
  motes.forEach((m,i)=>{
    m.el.style.display=i<count?'block':'none';
    if(i>=count)return;
    const f=(m.phase+t/m.period)%1,angle=m.angle+t*.018;
    const radius=m.radius*(1-f*.38),z=.015+m.lift*Math.sin(f*Math.PI);
    place(m.el,Math.cos(angle)*width*radius,Math.sin(angle)*height*radius*.72,units*z);
    m.el.style.opacity=gain*settings.particles*Math.pow(Math.sin(f*Math.PI),1.5)*.8;
  });
  updateLights(gain,force);
}
function tick(now) {
  raf=0;if(document.hidden||!active)return;
  // Some browsers delay MQL change events after focus changes. A cheap guard
  // keeps resume reliable; reduced motion still makes no DOM or light updates.
  if(wasReduced!==motion.matches) {
    wasReduced=motion.matches;last=0;
    if(wasReduced){fade=1;paint(true);}
  }
  if(motion.matches){schedule();return;}
  if(now-lastPaint>=1000/24) {
    const dt=last?Math.min(.1,(now-last)/1000):0;
    elapsed+=dt;fade=Math.min(1,fade+dt/2.2);last=now;lastPaint=now;
    paint();
  }
  schedule();
}
function schedule() {
  if(!raf&&active&&!document.hidden)raf=requestAnimationFrame(tick);
}
function sync() {
  wasReduced=motion.matches;const next=enabled&&document.body.classList.contains('intro-done')&&!document.body.classList.contains('table-covered');
  if(next!==active){active=next;fade=active?(motion.matches?1:0):0;}
  if(raf){cancelAnimationFrame(raf);raf=0;}
  last=0;
  if(motion.matches&&active)fade=1;
  if(!document.hidden)paint(true);
  schedule();
}
new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
addEventListener('scene-camera-change',resize);
motion.addEventListener('change',sync);
document.addEventListener('visibilitychange',sync);
document.getElementById('roomCanvas').addEventListener('webglcontextrestored',()=>{lastLight=-Infinity;paint(true);});
window.portalAura={
  settings,
  configure(values={}) {
    for(const [key,value] of Object.entries(values))if(bounds[key]&&Number.isFinite(value)) {
      settings[key]=Math.max(bounds[key][0],Math.min(bounds[key][1],value));
    }
    displacement.setAttribute('scale',settings.refraction);
    paint(true);schedule();
  },
  setEnabled(value){enabled=Boolean(value);sync();},
  get stats(){return {active,fade,pulse,elapsed,frames,lightUpdates,lights:lights.map(l=>l.intensity),motes:Math.min(innerWidth<600?12:32,Math.round(settings.moteCount)),reducedMotion:motion.matches};}
};
resize();sync();