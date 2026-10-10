import * as THREE from './vendor/three/three.module.js';
import {createRitualTable} from './table-model.js';
import {createRitualCloth} from './ritual-cloth.js';
import {createRoomArchitecture,architectureTuning} from './room-architecture.js';
import {createChamber,chamberTuning} from './room-chamber.js';
import {createNightSky} from './night-sky.js';
import {createRoomSmoke} from './room-smoke.js';
import {createRoomLamps,lampTuning} from './room-lamps.js';
import {createFigmaObject,createGrimoireObject,createCrystalBallObject} from './tools-shelf.js';
import {createShelfSound} from './tools-sound.js';
import {createFirstPerson} from './first-person.js';

// Architecture and physical furniture. Portal, orb and HTML reader stay in their
// own renderers; scene-camera.js gives both branches the same projection.
const host = document.getElementById('roomShell');
const canvas = document.getElementById('roomCanvas');
const view = window.sceneCamera;
const stage = document.getElementById('deviceTilt');
// Plan in metres, +Z toward the seated viewer, the chamber's centre at the
// origin: a twelve-sided chapter house under a ribbed dome (room-chamber.js),
// the orb-glass building outside seen from within. Its door (+Z) lies behind
// every camera position, the great window (-Z) straight behind the table, the
// study nook in the left wall, and the stair tower back right, standing
// outside the wall as the loading screen's tower does.
const {apothem, sides} = chamberTuning;
// The table (world origin) stands this far in front of the chamber's centre;
// negative, behind it toward the window, so more floor lies before the door.
// The whole architecture is shifted by it.
const placement = {forward:-.3};
// The stair tower: the circle through the two columns of the bay at -30
// degrees, so its wall begins behind them and the whole bay opens into it.
// It rises far above the vault's springing; its stair leads up out of view.
// Its stair, lamps and lights keep the design they had in the rectangular
// room's back corner (`was`), turned by `turn` degrees and scaled by `scale`
// about its axis (fromOld, turned).
const towerBay = -Math.PI / 6, bayHalf = apothem * Math.tan(Math.PI / sides);
const tower = {r:1.15, height:7, was:{x:2.05, z:-2.0, r:1.35}, turn:15};
const towerOut = apothem + Math.sqrt(tower.r ** 2 - bayHalf ** 2);
Object.assign(tower, {x:towerOut * Math.cos(towerBay), z:towerOut * Math.sin(towerBay), scale:tower.r / tower.was.r});
// Its wall runs from one of the bay's columns round the back to the other.
const mouthWidth = Math.atan2(bayHalf, towerOut - apothem), mouthDirection = towerBay + Math.PI;
tower.wallFrom = mouthDirection + mouthWidth; tower.wallTo = mouthDirection - mouthWidth + 2 * Math.PI;
const turned = degrees => (degrees + tower.turn) * Math.PI / 180;
function fromOld(x, z) {
  const a = tower.turn * Math.PI / 180, dx = (x - tower.was.x) * tower.scale, dz = (z - tower.was.z) * tower.scale;
  return [tower.x + dx * Math.cos(a) - dz * Math.sin(a), tower.z + dx * Math.sin(a) + dz * Math.cos(a)];
}
// Spiral stair along the tower wall. Step i spans plan angles
// from - (i+1)*step .. from - i*step, so it starts on the right of the tower
// (as seen from the table) and climbs leftward across its back wall.
// soffit: thickness of the flight under the line through the nosings, square
// to its slope; joint: how far each stone's underside is tucked up at the
// next one; cap/nosing: each nosing's thickness and how far it overhangs the riser.
const stair = {from:turned(-12), step:10 * Math.PI / 180, rise:.19, inner:.70 * tower.scale, count:14,
  soffit:.15, joint:.018, cap:.045, nosing:.028};
const tread = i => (i + 1) * stair.rise;
// Tall, narrow lancets stepped up with the stair: each sill clears the highest
// tread beneath its opening. They sit where the stair is still low, so its
// higher flight never covers them from the table.
const lancets = [-25, -50, -75].map(degrees => {
  const at = turned(degrees), halfWidth = .18;
  const sill = Math.round((tread(Math.floor((stair.from - at + halfWidth / tower.r) / stair.step)) + .18) * 100) / 100;
  return {at, halfWidth, sill, shoulder:sill + 1.5, peak:sill + 1.85};
});
const scene = new THREE.Scene();
scene.background = new THREE.Color('#16181d');
// Architecture and its lights, placed relative to the table. Pieces bound to
// the table itself (portal mask, contact shadow, under-table glow) stay in scene.
const shell = new THREE.Group();
shell.name = 'room shell'; shell.position.z = -placement.forward; scene.add(shell);
// Far enough for the night outside the windows (night-sky.js reaches 34 m).
const camera = new THREE.PerspectiveCamera(view.fov,innerWidth/innerHeight,.035,60);
let renderer;
try {
  // The drawing buffer is kept between frames: the night outside redraws
  // only the window, over the rest of the last full frame.
  const options={antialias:true,alpha:false,powerPreference:'low-power',preserveDrawingBuffer:true};
  const context=canvas.getContext('webgl2',options)||canvas.getContext('webgl',options);
  if(!context)throw new Error('WebGL unavailable');
  renderer = new THREE.WebGLRenderer({canvas,context,...options});
} catch {
  // A readable room silhouette also survives unavailable WebGL.
  host.classList.add('room-fallback');
  // The silhouette is all there is to wait for (site-ready.js).
  window.siteReadiness?.done('room','fallback');
}

if (renderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Shadow maps are redrawn only when something in the room changed, not for
  // a frame in which only the camera moved (see invalidate()).
  renderer.shadowMap.autoUpdate = false;

  let seed = 617;
  const random = () => ((seed = Math.imul(seed,1664525)+1013904223 >>> 0) / 4294967296);
  // Wood grain for the floor, the timber and the chair.
  function woodTexture() {
    const image=document.createElement('canvas'); image.width=512; image.height=512;
    const ctx=image.getContext('2d');
    ctx.fillStyle='#786047'; ctx.fillRect(0,0,512,512);
    for(let i=0;i<1800;i++) {
      const x=random()*512;
      ctx.strokeStyle=random()>.45?'#25190e24':'#e1ba8415';ctx.lineWidth=.3+random();
      ctx.beginPath();ctx.moveTo(x,0);ctx.bezierCurveTo(x+random()*10,140,x-random()*12,370,x,512);ctx.stroke();
    }
    const map=new THREE.CanvasTexture(image);
    map.colorSpace=THREE.SRGBColorSpace; map.wrapS=map.wrapT=THREE.RepeatWrapping;
    map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    return map;
  }
  const woodMap=woodTexture();
  // Dressed stone for the walls and the spiral stair: tone and grain, no
  // coursing (the chamber's bays, columns and ribs give the walls their
  // order now). It draws from its own seeded generator.
  function dressedStone() {
    let s=4057;const draw=()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);
    const image=document.createElement('canvas');image.width=image.height=256;
    const g=image.getContext('2d');g.fillStyle='#716e69';g.fillRect(0,0,256,256);
    // Soft clouding, each patch drawn at every wrap so the tile repeats seamlessly.
    for(let i=0;i<34;i++) {
      const x=draw()*256,y=draw()*256,r=14+draw()*42,tone=draw()>.5?'#857f75':'#5d5a55';
      for(const dx of [-256,0,256]) for(const dy of [-256,0,256]) {
        const cloud=g.createRadialGradient(x+dx,y+dy,0,x+dx,y+dy,r);
        cloud.addColorStop(0,tone+'38');cloud.addColorStop(1,tone+'00');
        g.fillStyle=cloud;g.fillRect(x+dx-r,y+dy-r,2*r,2*r);
      }
    }
    for(let i=0;i<9000;i++){g.fillStyle=draw()>.5?'#ddd4be0b':'#0a111417';g.fillRect(draw()*256,draw()*256,1+draw()*2,1+draw()*1.5);}
    const map=new THREE.CanvasTexture(image);
    map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;
    map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());map.repeat.set(1.3,1.3);
    return map;
  }
  const stoneMap=dressedStone();
  const stone=new THREE.MeshStandardMaterial({color:'#b8ab9a',map:stoneMap,bumpMap:stoneMap,bumpScale:.006,roughness:.96});
  const wood=new THREE.MeshStandardMaterial({color:'#a89980',map:woodMap,roughness:.94});
  const ceilingMaterial=new THREE.MeshStandardMaterial({color:'#7c756b',map:woodMap,roughness:1});
  const trim=new THREE.MeshStandardMaterial({color:'#969596',roughness:1});
  // The wood texture is itself dark; these tints are multiplied into it, so
  // they stay light enough for shadowed timber to read as wood, not black.
  const timber=new THREE.MeshStandardMaterial({color:'#a8876a',map:woodMap,roughness:.95});
  const stairStone=new THREE.MeshStandardMaterial({color:'#7f786e',roughness:.95});
  // The stair's own stone, as dark as the walls' once its texture is multiplied in.
  const stepStone=new THREE.MeshStandardMaterial({color:'#d6d1c8',map:stoneMap,roughness:.9});
  const architecturalMetal=new THREE.MeshStandardMaterial({color:'#827354',metalness:.48,roughness:.58});
  const chairWood=new THREE.MeshStandardMaterial({color:'#8f6a4c',map:woodMap,roughness:.6});
  const velvet=new THREE.MeshStandardMaterial({color:'#23403a',roughness:.92});
  // The vault's cells: dark glass in teal, green and a little violet, held in
  // dark leading, faintly lit from within as if by the night beyond (the
  // concept's dome). Drawn once, seeded, and stretched over every cell.
  function mosaic() {
    let s=271;const draw=()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);
    const image=document.createElement('canvas');image.width=image.height=256;
    const g=image.getContext('2d');g.fillStyle='#050b0a';g.fillRect(0,0,256,256);
    // Leaded panes in courses that rise with the cell to the boss, each pane
    // its own glass: mostly teal and green, now and then a deeper blue or
    // violet, a little brighter at its heart where the light comes through.
    const tones=['#1d6b5f','#1a5e57','#236f5c','#185a63','#1f6150','#1c4f66','#2f3f6e'];
    const across=5,up=7,w=256/across,h=256/up;
    for(let j=0;j<up;j++) for(let i=0;i<across;i++) {
      const tone=tones[Math.floor(draw()**1.6*tones.length)],x=i*w,y=j*h;
      const heart=g.createRadialGradient(x+w/2,y+h/2,2,x+w/2,y+h/2,Math.max(w,h)*.7);
      heart.addColorStop(0,tone);heart.addColorStop(1,'#0b1d1b');
      g.fillStyle=heart;g.fillRect(x+2,y+2,w-4,h-4);
    }
    // A fine gilded line where the cell meets its ribs and its wall.
    g.strokeStyle='#7a5a2a';g.lineWidth=3;g.strokeRect(1.5,1.5,253,253);
    const map=new THREE.CanvasTexture(image);
    map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    return map;
  }
  const vaultMap=mosaic();
  const vaultGlass=new THREE.MeshStandardMaterial({color:'#9fb5ad',map:vaultMap,emissive:'#7fe0cc',emissiveMap:vaultMap,emissiveIntensity:.55,roughness:.42,metalness:.15});
  // The lantern under the boss: warm glass, glowing on its own (its light on
  // the room is the lighting pass's to add).
  const lanternGlass=new THREE.MeshStandardMaterial({color:'#ffcf8f',emissive:'#ff8a32',emissiveIntensity:1.25,roughness:.35});
  const materials=[stone,wood,ceilingMaterial,trim,timber,stairStone,chairWood,velvet,stepStone,architecturalMetal,vaultGlass];
  const textured = materials.map(m=>({map:m.map,color:m.color.clone()}));
  // Pieces sharing a material are merged into one mesh, which keeps the
  // curved shell inside the room's draw-call budget. Stone courses use world
  // coordinates, so they continue across separate straight pieces.
  function worldUV(geometry) {
    const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
    for(let i=0;i<p.count;i++) {
      const up=Math.abs(n.getY(i))>.5,side=Math.abs(n.getX(i))>Math.abs(n.getZ(i));
      uv.setXY(i,side&&!up?p.getZ(i):p.getX(i),up?p.getZ(i):p.getY(i));
    }
    return geometry;
  }
  function block(w,h,d,x,y,z,turn=0) {
    const geometry=new THREE.BoxGeometry(w,h,d);geometry.rotateY(turn);return geometry.translate(x,y,z);
  }
  function merge(list) {
    const flat=list.map(g=>g.index?g.toNonIndexed():g),geometry=new THREE.BufferGeometry();
    for(const [key,size] of [['position',3],['normal',3],['uv',2]]) {
      const data=new Float32Array(flat.reduce((n,g)=>n+g.attributes[key].array.length,0));
      let offset=0;
      for(const g of flat){data.set(g.attributes[key].array,offset);offset+=g.attributes[key].array.length;}
      geometry.setAttribute(key,new THREE.BufferAttribute(data,size));
    }
    return geometry;
  }
  function mesh(name,geometry,material,cast=true) {
    const m=new THREE.Mesh(geometry,material);
    m.name=name;m.castShadow=cast;m.receiveShadow=true;shell.add(m);return m;
  }

  // Pointed arch: straight jambs to the shoulder, then two quadratic curves to
  // the peak. archTop is the height of that same curve at offset u from its axis.
  const control=w=>w.shoulder+.6*(w.peak-w.shoulder);
  function archTop(w,u) {
    const t=Math.sqrt(Math.max(0,1-Math.abs(u)/w.halfWidth));
    return w.shoulder*(1-t)**2+control(w)*2*t*(1-t)+w.peak*t*t;
  }
  function arch(path,w,x=w.x??0,pad=0) {
    const r=w.halfWidth+pad,c=control(w);
    path.moveTo(x-r,w.sill-pad);path.lineTo(x-r,w.shoulder);
    path.quadraticCurveTo(x-r,c,x,w.peak+pad);
    path.quadraticCurveTo(x+r,c,x+r,w.shoulder);
    path.lineTo(x+r,w.sill-pad);path.closePath();return path;
  }
  // A wall (or beam) curving around a vertical axis at plan angle phi, where
  // phi=0 points to +X and phi=PI/2 toward the viewer. Pointed openings are
  // cut radially through the full thickness, so the curve continues around them.
  function arcWall({x:cx,z:cz,r,t,from,to,y0=0,y1,openings=[],bottom=false,steps=32}) {
    const position=[],normal=[],uv=[];
    const vertex=(phi,rho,y,n,u,v)=>({p:[cx+rho*Math.cos(phi),y,cz+rho*Math.sin(phi)],n,uv:[u,v]});
    const radial=(phi,sign)=>[sign*Math.cos(phi),0,sign*Math.sin(phi)];
    const tangent=(phi,sign)=>[-sign*Math.sin(phi),0,sign*Math.cos(phi)];
    function quad(a,b,c,d) {
      // Wind each face toward its intended normal, whatever order it was listed in.
      const cross=(o,p,q)=>{const e=p.p.map((v,i)=>v-o.p[i]),f=q.p.map((v,i)=>v-o.p[i]);
        return [e[1]*f[2]-e[2]*f[1],e[2]*f[0]-e[0]*f[2],e[0]*f[1]-e[1]*f[0]];};
      const g=cross(a,b,c).map((v,i)=>v+cross(a,c,d)[i]),n=a.n.map((v,i)=>v+c.n[i]);
      const order=g[0]*n[0]+g[1]*n[1]+g[2]*n[2]<0?[a,d,c,a,c,b]:[a,b,c,a,c,d];
      for(const q of order){position.push(...q.p);normal.push(...q.n);uv.push(...q.uv);}
    }
    const skins=(pa,pb,loA,loB,hiA,hiB)=>{
      for(const [rho,sign] of [[r,-1],[r+t,1]]) quad(
        vertex(pa,rho,loA,radial(pa,sign),pa*rho,loA),vertex(pb,rho,loB,radial(pb,sign),pb*rho,loB),
        vertex(pb,rho,hiB,radial(pb,sign),pb*rho,hiB),vertex(pa,rho,hiA,radial(pa,sign),pa*rho,hiA));
    };
    const band=(pa,pb,ya,yb,up)=>quad(
      vertex(pa,r,ya,[0,up,0],pa*r,0),vertex(pb,r,yb,[0,up,0],pb*r,0),
      vertex(pb,r+t,yb,[0,up,0],pb*r,t),vertex(pa,r+t,ya,[0,up,0],pa*r,t));
    const cap=(phi,sign,lo,hi)=>{const n=tangent(phi,sign);quad(
      vertex(phi,r,lo,n,r,lo),vertex(phi,r+t,lo,n,r+t,lo),vertex(phi,r+t,hi,n,r+t,hi),vertex(phi,r,hi,n,r,hi));};
    const cuts=openings.map(o=>({...o,a:o.halfWidth/r}));
    const phis=[];
    for(let i=0;i<=steps;i++) phis.push(from+(to-from)*i/steps);
    // Denser near the jambs, where the arch rises steeply from its shoulder.
    for(const o of cuts) for(let i=0;i<=8;i++){const u=o.halfWidth*(1-(i/8)**2);phis.push(o.at-u/r,o.at+u/r);}
    phis.sort((a,b)=>a-b);
    const edges=phis.filter((p,i)=>p>=from-1e-9&&p<=to+1e-9&&(i===0||p-phis[i-1]>1e-6));
    for(let i=1;i<edges.length;i++) {
      const pa=edges[i-1],pb=edges[i],o=cuts.find(o=>Math.abs((pa+pb)/2-o.at)<o.a);
      band(pa,pb,y1,y1,1);
      if(!o){skins(pa,pb,y0,y0,y1,y1);if(bottom)band(pa,pb,y0,y0,-1);continue;}
      const ha=archTop(o,(pa-o.at)*r),hb=archTop(o,(pb-o.at)*r);
      skins(pa,pb,y0,y0,o.sill,o.sill);skins(pa,pb,ha,hb,y1,y1);
      band(pa,pb,o.sill,o.sill,1);band(pa,pb,ha,hb,-1);
    }
    for(const o of cuts){cap(o.at-o.a,1,o.sill,o.shoulder);cap(o.at+o.a,-1,o.sill,o.shoulder);}
    cap(from,-1,y0,y1);cap(to,1,y0,y1);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    return geometry;
  }

  const T=chamberTuning.wall,H=chamberTuning.spring;
  // The chamber (room-chamber.js): its twelve bays, their openings and
  // niches, the vault, and the columns and ribs that carry it.
  const chamber=createChamber(THREE,{towerTop:tower.height});
  const aperture=chamber.window,nook=chamber.nook,door=chamber.door;
  // Floor extent along Z at plan position x: the chamber with its recesses
  // and the door's passage, and the tower's circle.
  const footprint=x=>chamber.footprint(x,tower);
  const east=tower.x+tower.r+T,west=nook.back-T,south=-apothem-T,north=door.z+door.depth+.05;
  // Beneath the boards; in the door's passage it is the floor and the walls
  // themselves, dark slate.
  mesh('floor substrate',merge([block(east-west+T*2,.07,north-south+T*2,(west+east)/2,-.06,(north+south)/2),chamber.passageFloor,...chamber.passage]),
    new THREE.MeshStandardMaterial({color:'#151312',roughness:1}),false);
  // Each board runs to the outermost wall line across its width; the ragged
  // ends of the round chamber's rows disappear under its walls.
  const planks=[],board=.22;
  for(let x=west;x<east-.01;x+=board) {
    let back=Infinity,front=-Infinity;
    for(const s of [x,x+board/2,x+board,Math.min(Math.max(tower.x,x),x+board)]) {
      const [b,f]=footprint(s);back=Math.min(back,b);front=Math.max(front,f);
    }
    let z=back;
    while(z<front-.01) {
      const length=Math.min(.85+random()*.9,front-z);
      planks.push({x:x+.109,z:z+length/2,w:.216,length:length-.005});
      z+=length;
    }
  }
  // Only each board's top face is drawn; the dark substrate shows in the gaps,
  // which is all the board sides ever contributed from standing height.
  const boards=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),wood,planks.length);
  boards.name='wooden plank floor';boards.receiveShadow=true;
  const dummy=new THREE.Object3D();
  planks.forEach((p,i)=>{
    dummy.position.set(p.x,0,p.z);dummy.scale.set(p.w,1,p.length);dummy.updateMatrix();
    boards.setMatrixAt(i,dummy.matrix);boards.setColorAt(i,new THREE.Color().setScalar(.70+random()*.28));
  });
  boards.instanceMatrix.needsUpdate=true;shell.add(boards);
  // Stone shell: the chamber's bays, and the tower's round wall from one of
  // its mouth's columns round the back to the other, with its lancets.
  mesh('stone shell',merge([
    ...chamber.parts.walls,
    arcWall({...tower,t:T,from:tower.wallFrom,to:tower.wallTo,y1:tower.height,steps:56,
      openings:lancets.map(w=>({...w,at:w.at<tower.wallFrom?w.at+2*Math.PI:w.at}))}),
  ]),stone);
  // The great window's bay keeps its one through opening.
  mesh('back wall with through opening',chamber.parts.windowWall,stone);

  // Shared carved profiles for the door, the window's reveals and the
  // curved tower lancets. The same pointed tracery is carried into the stair
  // rail; the chamber's boss and lantern share the bronze.
  const radialAt=(at,rho)=>[tower.x+rho*Math.cos(at),tower.z+rho*Math.sin(at)];
  const architecture=createRoomArchitecture(THREE,{aperture,windowMap:aperture.map,door,doorMap:door.map,tower,lancets,stair});
  mesh('stone trim',architecture.stone,trim);
  mesh('gothic bronze tracery',merge([architecture.metal,...chamber.parts.metal]),architecturalMetal);

  // The spiral stair, in its own dressed stone. Each step is one solid from the
  // stair's open inner edge into the wall, its profile carrying a nosing that
  // overhangs the riser below, so every step draws a fine shadow line. Beneath,
  // the steps share one smooth helical soffit, landing on the floor at the
  // foot, instead of a sawtooth of separate slabs: the flight reads as a single
  // carved spiral. A stepped skirting ties each step into the curved wall.
  // 14 triangles a step: the room's triangle budget is nearly spent.
  const stepAt=i=>({from:stair.from-(i+1)*stair.step,to:stair.from-i*stair.step});
  const plinth=.14,proud=.035;
  // Height of the line through every nosing at plan angle phi, and of the soffit.
  const pitch=phi=>((stair.from-phi)/stair.step+1)*stair.rise;
  // The underside keeps one slab thickness measured square to the flight, so
  // it runs parallel to the steps at every radius: deeper in height along the
  // steep inner edge, shallower where the flight is gentle against the wall.
  // A constant vertical depth made it thickest at the wall, where it read as a
  // heavy, twisted sail from the room.
  const flightLean=stair.rise/stair.step,wallRadius=tower.r+.05;
  const depth=rho=>stair.soffit*Math.hypot(1,flightLean/rho);
  const soffit=(phi,rho)=>Math.max(0,pitch(phi)-depth(rho));
  // Across the flight the underside rises toward the wall by this much per metre.
  const across=(depth(stair.inner)-depth(wallRadius))/(wallRadius-stair.inner);
  function step(i) {
    const {from:a,to:b}=stepAt(i),top=tread(i),lip=top-stair.cap,wall=wallRadius;
    const at=(phi,rho,y)=>new THREE.Vector3(tower.x+rho*Math.cos(phi),y,tower.z+rho*Math.sin(phi));
    // Toward the step below; the nosing stands a constant distance out that way.
    const front=new THREE.Vector3(-Math.sin(b),0,Math.cos(b)),nose=v=>v.addScaledVector(front,stair.nosing);
    const up=new THREE.Vector3(0,1,0),down=new THREE.Vector3(0,-1,0);
    // The soffit's own (helicoid) normal, so the underside shades as one surface.
    const under=(phi,rho)=>soffit(phi,rho)>0?new THREE.Vector3(flightLean*Math.sin(phi)+rho*across*Math.cos(phi),-rho,
      rho*across*Math.sin(phi)-flightLean*Math.cos(phi)).normalize():down;
    // Each stone's underside is tucked up a little at its front edge, so the
    // joints between steps draw a fine stepped line along the sweep: the
    // underside reads as separate stones winding up, not one warped surface.
    const tuck=(phi,rho)=>soffit(phi,rho)>0?stair.joint:0;
    const position=[],normal=[];
    // A quad wound to face `out`; flat-shaded unless given normals.
    const quad=(p,out,n)=>{
      const face=new THREE.Vector3().subVectors(p[1],p[0]).cross(new THREE.Vector3().subVectors(p[2],p[0]));
      if(face.dot(out)<0){p=[p[0],p[3],p[2],p[1]];n=n&&[n[0],n[3],n[2],n[1]];face.negate();}
      face.normalize();
      for(const k of [0,1,2,0,2,3]){const m=n?n[k]:face;position.push(p[k].x,p[k].y,p[k].z);normal.push(m.x,m.y,m.z);}
    };
    // The profile, from the back of the soffit round to the back of the tread.
    const profile=rho=>[at(a,rho,soffit(a,rho)),at(b,rho,soffit(b,rho)+tuck(b,rho)),at(b,rho,lip),nose(at(b,rho,lip)),nose(at(b,rho,top)),at(a,rho,top)];
    const [i0,i1,i2,i3,i4,i5]=profile(stair.inner),[w0,w1,w2,w3,w4,w5]=profile(wall);
    quad([i0,i1,w1,w0],down,[under(a,stair.inner),under(b,stair.inner),under(b,wall),under(a,wall)]);
    quad([i1,i2,w2,w1],front);quad([i2,i3,w3,w2],down);quad([i3,i4,w4,w3],front);quad([i4,i5,w5,w4],up);
    // The top step's back meets the landing; every other one hides under the
    // next step except for the thin strip its tucked joint leaves showing.
    const back=new THREE.Vector3(Math.sin(a),0,-Math.cos(a));
    if(i===stair.count-1) quad([i5,i0,w0,w5],back);
    else if(tuck(a,stair.inner)>0) quad([i0,at(a,stair.inner,i0.y+tuck(a,stair.inner)),at(a,wall,w0.y+tuck(a,wall)),w0],back);
    // The open edge: the step's face and its nosing lip. The wall end stays buried.
    const edge=new THREE.Vector3(-Math.cos((a+b)/2),0,-Math.sin((a+b)/2)),corner=at(b,stair.inner,top);
    quad([i0,i1,corner,i5],edge);quad([i2,i3,i4,corner],edge);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(position.length/3*2),2));
    return worldUV(geometry);
  }
  mesh('spiral stair',merge([
    ...Array.from({length:stair.count},(_,i)=>step(i)),
    ...Array.from({length:stair.count},(_,i)=>arcWall({...tower,...stepAt(i),r:tower.r-proud,
      t:proud+.02,y0:tread(i),y1:tread(i)+plinth,steps:1})),
  ]),stepStone);
  // Dressed stone: a low plinth where the chamber's walls meet the floor.
  mesh('dressed stone',merge(chamber.parts.plinth),stairStone);

  // Dark timber: the chamber's cornice and the built-ins of the nook and the
  // shelving niches (room-chamber.js), radial rafters under the tower's roof,
  // the stair's handrail and the tower's upper floor.
  const beamParts=[...chamber.parts.timber,
    new THREE.CylinderGeometry(.12,.12,.16,12).translate(tower.x,tower.height-.08,tower.z)];
  for(let i=0;i<6;i++) {
    const a=i*Math.PI/3+.3,[x,z]=radialAt(a,(tower.r+T/2)/2);
    beamParts.push(block(tower.r+T/2,.12,.1,x,tower.height-.06,z,-a));
  }
  // The warm handrail follows the same helix; its stone foot and open bronze
  // pointed bays are batched with the matching window dressings above.
  beamParts.push(architecture.handrail);
  // Upper floor inside the tower, one riser above the last step. Its stairwell
  // keeps headroom over the flight and clears the tall lancets, so the stair
  // visibly arrives at another level instead of ending in the wall. It stops
  // at the mouth's plane, so it never reaches out into the chamber.
  const well={from:stair.from-stair.count*stair.step,to:turned(-40),inner:stair.inner-.06};
  const upper=new THREE.Shape().moveTo(tower.r*Math.cos(well.to),tower.r*Math.sin(well.to));
  upper.absarc(0,0,tower.r,well.to,tower.wallTo,false);
  upper.lineTo(tower.r*Math.cos(tower.wallFrom),tower.r*Math.sin(tower.wallFrom));
  upper.absarc(0,0,tower.r,tower.wallFrom,well.from+2*Math.PI,false);
  upper.lineTo(well.inner*Math.cos(well.from),well.inner*Math.sin(well.from));
  upper.absarc(0,0,well.inner,well.from,well.to,false);
  upper.closePath();
  beamParts.push(new THREE.ExtrudeGeometry(upper,{depth:.12,bevelEnabled:false,curveSegments:24})
    .rotateX(Math.PI/2).translate(tower.x,tread(stair.count),tower.z));
  mesh('timber beams',merge(beamParts),timber);
  // The outer door at the end of the passage: old, dark, ironbound oak.
  mesh('outer door',merge([chamber.parts.doorLeaf]),new THREE.MeshStandardMaterial({color:'#4c3828',map:woodMap,roughness:.9}),false);

  // The tower's roof, far above the vault's springing (the part over the
  // chamber hides above its vault).
  mesh('ceiling',new THREE.CircleGeometry(tower.r+T,48).rotateX(Math.PI/2).translate(tower.x,tower.height,tower.z),ceilingMaterial,false);
  // The vault's cells: one draw call. They look down on everything, so
  // they cast no shadow.
  mesh('vault',chamber.parts.vault,vaultGlass,false);
  // Columns and ribs: one bay's frame in timber, its capitals and bases in
  // bronze, repeated round the twelve corners and merged, one draw call
  // apiece. (Instanced, they drew in the same single call but needed three
  // more shader programs, instanced and their shadows' depth: about a second
  // more loading, measured. Merged they share the room's own programs.)
  for(const [name,parts,material] of [['columns and ribs',chamber.frame.geometry,timber],['capitals and bases',chamber.frame.caps,architecturalMetal]]) {
    const one=merge(parts);
    mesh(name,merge(chamber.frame.instances.map(matrix=>one.clone().applyMatrix4(matrix))),material);
  }
  // Warm glass that glows on its own: the vault's lantern, the sconces'
  // chimneys and the candles' flames (room-chamber.js), one draw call.
  mesh('lamp and candle glass',merge([chamber.parts.lanternGlass,...chamber.parts.glow]),lanternGlass,false);
  // ---- Furnishing, simplified: books on the shelving niches' shelves (one
  // merged mesh), a banner in each blind arch, and a round rug under the
  // table, as in the concept. Its own seeded generator, so the room's shared
  // one lays out the cloth as before.
  {
    let s=9173;const draw=()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);
    const {books,banners}=chamber.furnish(draw);
    const canvas=(w,h,paint)=>{const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'),w,h);
      const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());return map;};
    // Each book is a box whose texture coordinates all point at one cell of
    // a small palette (colour across, shade down), so the shelves share the
    // timber's shader instead of needing instanced colour.
    // The candles' wax takes a last, ivory column.
    const {colours,shades}=chamber.bookPalette,cells=colours.length+1;
    const palette=canvas(cells,shades,(g)=>{colours.forEach((c,i)=>{for(let j=0;j<shades;j++){
      g.fillStyle='#'+new THREE.Color(c).multiplyScalar(.7+.5*j/(shades-1)).getHexString();g.fillRect(i,j,1,1);}});
      g.fillStyle='#d9ccb0';g.fillRect(colours.length,0,1,shades);});
    palette.magFilter=palette.minFilter=THREE.NearestFilter;palette.generateMipmaps=false;
    const cell=(g,u,v)=>{const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,u,v);return g;};
    mesh('books and candles',merge([...books.map(book=>cell(new THREE.BoxGeometry(1,1,1),(book.colour+.5)/cells,1-(book.shade+.5)/shades).applyMatrix4(book.matrix)),
      ...chamber.parts.wax.map(g=>cell(g,(cells-.5)/cells,.5))]),new THREE.MeshStandardMaterial({map:palette,roughness:.78}),false);
    // Deep violet cloth, a gilt border and a crescent over a small star.
    const bannerMap=canvas(128,320,(g,w,h)=>{
      const cloth=g.createLinearGradient(0,0,0,h);cloth.addColorStop(0,'#2c1840');cloth.addColorStop(1,'#1c0f2a');
      g.fillStyle=cloth;g.fillRect(0,0,w,h);
      g.strokeStyle='#a07a3a';g.lineWidth=4;g.strokeRect(9,9,w-18,h-18);g.lineWidth=1.5;g.strokeRect(16,16,w-32,h-32);
      g.fillStyle='#b8904a';g.beginPath();g.arc(w/2,h*.38,26,0,Math.PI*2);g.fill();
      g.fillStyle='#24133a';g.beginPath();g.arc(w/2+11,h*.38-6,23,0,Math.PI*2);g.fill();
      g.fillStyle='#b8904a';g.beginPath();
      for(let k=0;k<8;k++){const a=k*Math.PI/4,r=k%2?4:11;g.lineTo(w/2+Math.cos(a)*r,h*.62+Math.sin(a)*r);}g.fill();
      for(let x=12;x<w-8;x+=8){g.fillStyle='#8a6830';g.fillRect(x,h-10,3,10);}
    });
    mesh('banners',merge(banners.map(b=>new THREE.PlaneGeometry(b.width,b.height).rotateY(Math.PI).applyMatrix4(b.matrix))),
      new THREE.MeshStandardMaterial({map:bannerMap,roughness:.92}),false);
    // The rug: a worn, dark plum ground whose edge fades toward the boards'
    // brown, faint gilt and teal rings and small motifs: it frames the table
    // without competing with it.
    const rugMap=canvas(512,512,(g,w)=>{
      const c=w/2,ring=(r,width,colour)=>{g.strokeStyle=colour;g.lineWidth=width;g.beginPath();g.arc(c,c,r,0,Math.PI*2);g.stroke();};
      const ground=g.createRadialGradient(c,c,20,c,c,c);ground.addColorStop(0,'#2a1620');ground.addColorStop(.8,'#21121a');ground.addColorStop(.97,'#251812');ground.addColorStop(1,'#2a1c12');
      g.fillStyle='#2a1c12';g.fillRect(0,0,w,w);g.fillStyle=ground;g.beginPath();g.arc(c,c,c-1,0,Math.PI*2);g.fill();
      ring(c-12,5,'#4f3e26');ring(c-24,2,'#173431');ring(c-34,1.5,'#4f3e26');ring(c*.55,2,'#4f3e26');ring(c*.3,1.5,'#173431');
      for(const [r,n,size,colour] of [[c-29,48,3,'#5a4729'],[c*.75,32,5,'#183c38'],[c*.42,16,6,'#5a4729']])
        for(let k=0;k<n;k++){const a=k/n*Math.PI*2;g.save();g.translate(c+Math.cos(a)*r,c+Math.sin(a)*r);g.rotate(a);
          g.fillStyle=colour;g.beginPath();g.moveTo(-size,0);g.lineTo(0,-size*.6);g.lineTo(size,0);g.lineTo(0,size*.6);g.fill();g.restore();}
    });
    const rug=new THREE.Mesh(new THREE.CircleGeometry(1.9,64).rotateX(-Math.PI/2),
      new THREE.MeshStandardMaterial({map:rugMap,roughness:.98,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
    rug.name='rug';rug.position.y=.004;rug.receiveShadow=true;scene.add(rug);
  }

  // ---- The view out of the windows (night-sky.js): a moonlit purple night
  // over a misty valley, in layers at real distances behind the walls, which
  // hide it everywhere but the windows. It is composed as seen from the chair,
  // and part of it moves (see "The night outside is alive" below).
  const night=createNightSky(THREE,{eye:{x:0,y:view.seated.eye,z:view.seated.distance+placement.forward},
    anisotropy:Math.min(4,renderer.capabilities.getMaxAnisotropy())});
  // It was composed for the old window, 9.3 degrees left of the chair's axis
  // (azimuth 189.3); the great window is on the axis, so the whole view is
  // turned about the chair's eye to bring the composition round to it.
  {
    const eye=new THREE.Vector3(0,0,view.seated.distance+placement.forward),turn=-9.3*Math.PI/180;
    night.group.rotation.y=turn;night.group.position.copy(eye).sub(eye.clone().applyAxisAngle(new THREE.Vector3(0,1,0),turn));
  }
  shell.add(night.group);

  // The armchair the seated camera sits in: centred in front of the table and
  // facing it, placed so the seated eye (scene-camera.js) is just in front of
  // its backrest. Seat top 0.42 m for the knee-height (0.46 m) table; the seat
  // front ends about half a metre from the table edge. It belongs to the table,
  // not the architecture. Local frame: the sitter faces -Z, the back leans +Z.
  const chair=new THREE.Group();chair.name='armchair';
  chair.position.set(0,0,view.seated.distance-.06);scene.add(chair);
  const lean=8*Math.PI/180,post=.7,leaning=(g,s,x)=>g.rotateX(lean)
    .translate(x,.3+s*Math.cos(lean),.23+s*Math.sin(lean));
  // Gothic-revival character: a pointed-arch velvet back like the windows,
  // turned finials on the back posts and arms that curve down to the front.
  const topY=.3+post*Math.cos(lean),topZ=.23+post*Math.sin(lean);
  const frameParts=[block(.56,.06,.52,0,.33,0)];
  for(const side of [-1,1]) frameParts.push(
    new THREE.CylinderGeometry(.022,.026,.62,8).translate(side*.26,.31,-.22), // front leg into arm post
    new THREE.CylinderGeometry(.022,.026,.3,8).translate(side*.26,.15,.23),
    leaning(new THREE.BoxGeometry(.04,post,.04),post/2,side*.26),
    new THREE.SphereGeometry(.032,8,6).translate(side*.26,topY+.025,topZ),
    new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(side*.27,.6,.26),
      new THREE.Vector3(side*.28,.68,0),new THREE.Vector3(side*.27,.62,-.28)),10,.024,5,false));
  const chairBack=arch(new THREE.Shape(),{halfWidth:.21,sill:0,shoulder:.3,peak:.5});
  for(const [name,geometry,material] of [['armchair frame',merge(frameParts),chairWood],
    ['armchair upholstery',merge([block(.5,.06,.46,0,.39,-.01),
      new THREE.ExtrudeGeometry(chairBack,{depth:.045,bevelEnabled:false,curveSegments:8})
        .translate(0,0,-.0225).rotateX(lean).translate(0,.42,.245)]),velvet]]) {
    // Layer 1 only: it renders in the foreground canvas, never the room canvas.
    const m=new THREE.Mesh(geometry,material);m.name=name;m.layers.set(1);chair.add(m);
  }

  // ---- The lamps (room-lamps.js): a mushroom lantern by the door, amber
  // glass droplets at the study nook and mosaic lamps down the stair tower.
  // They carry the room's own lights (the lantern's patterned spot and its
  // glow, the droplets' light, the tower's lamp glow; the upper floor's green
  // now hangs in two of the tower's lamps). Every lit surface samples the
  // lantern's pattern softer the further it is from it.
  // In the chamber the door's lantern hangs as it did, 0.65 m to the right of
  // the doorway (seen from inside) and a little behind the entry; the
  // droplets as far in front of the nook as before; the tower's lamps turned
  // and scaled with the tower. Their rods reach up to the vault.
  const lamps=createRoomLamps(THREE,{tower,stair,height:H,slab:tread(stair.count)-.12,ringBeam:H-.2,
    anisotropy:Math.min(4,renderer.capabilities.getMaxAnisotropy()),place:{
      door:{at:[door.x-.65,door.z-1.2],aim:[door.x,.8,door.z-.15]},
      shelf:{shift:[nook.x+2.4,nook.z+.25]},
      stair:{turn:tower.turn,scale:tower.scale},
      mouth:top=>new THREE.Vector3(top.x,chamber.ceilingAt(top.x,top.z)+.04,top.z),
      ceilingAt:chamber.ceilingAt}});
  shell.add(lamps.group,...Object.values(lamps.lights),...lamps.targets);

  // ---- Smoke on the floor (room-smoke.js): low mist along the ways the
  // camera walks (scene-camera.js, `paths`).
  // - One trail comes in at the doorway behind the entry and passes under
  //   the visitor's feet there. It runs down the table's left side to where
  //   they stand at the shelf, and curls on into the nook.
  // - The chair's trail shares it as far as the fork. Then it peels off to
  //   the right for the chair beside the table, and curls in under its seat.
  // Strands of each bundle start on the other's side and cross as they
  // separate. It lives on the foreground layer with the chair and the cloth,
  // so it costs the room's own canvas nothing; the cloth's pulse below keeps
  // it moving. Table-centred [x, z], metres.
  const {trunk:way,fork,branch,chair:[restX,restZ]}=view.paths;
  // Where the visitor can stand gets a mark of its own (placed with the camera's points, below).
  // The lamps light it too: amber under the door lantern, warm under the droplets.
  const smoke=createRoomSmoke(THREE,{anisotropy:Math.min(4,renderer.capabilities.getMaxAnisotropy()),
    lights:lamps.smokeLights.map(light=>({...light,at:[light.at[0],light.at[1],light.at[2]-placement.forward]})),
    marks:[{name:'entry',at:[0,0]},{name:'shelf',at:[0,0]},{name:'chair',at:branch[branch.length-1]}],trails:[
    // It comes in from the dark passage behind the doorway, where it pools
    // (below), and ends running into the nook, where it gathers.
    {name:'to the study nook',points:way,fadeIn:.9,
      // A flat veil on the boards, two low drifts over it and one wisp that rises a little.
      strands:[{offset:0,width:.26,height:0,phase:1.3,speed:.7,density:.34,wobble:.6},
        {offset:-.12,offsetEnd:-.06,width:.17,height:.05,phase:0,speed:1,density:.75,wobble:.45},
        {offset:-.04,offsetEnd:.05,width:.21,height:.085,phase:2.1,speed:.8,density:.6,wobble:.45},
        {offset:.09,width:.12,height:.13,phase:4.3,speed:1.25,density:.45,wobble:.45}]},
    // At the nook the mist gathers and rises a little along the worktop's
    // front, staying well below its top (0.74 m) and the things that will
    // stand there.
    {name:'gathering at the nook',fadeIn:.5,fadeOut:.55,points:[[.28,1.05],[.21,.55],[.2,.05],[.26,-.5]]
      .map(([x,z])=>[nook.x+x,nook.z-placement.forward+z]),
      strands:[{offset:0,width:.21,height:.22,phase:2.6,speed:.6,density:.62,wobble:.5},
        {offset:.04,width:.13,height:.36,phase:5.1,speed:.8,density:.45,wobble:.55},
        {offset:-.03,width:.28,height:0,phase:3.3,speed:.5,density:.3,wobble:.6}]},
    // At the doorway the mist pools across the threshold and spills out of
    // the passage, rising a little under the lantern: where it begins, and
    // where it will lead back to.
    {name:'gathering at the door',fadeIn:.35,fadeOut:.5,points:[[-.44,.4],[-.14,.12],[.18,-.04],[.48,-.32]]
      .map(([x,z])=>[door.x+x,door.z-placement.forward+z]),
      strands:[{offset:0,width:.24,height:.2,phase:1.7,speed:.55,density:.55,wobble:.5},
        {offset:-.05,width:.14,height:.32,phase:4.6,speed:.75,density:.4,wobble:.55},
        {offset:.04,width:.3,height:0,phase:2.9,speed:.5,density:.32,wobble:.6}]},
    // The chair's share is thinner: it is near and short, and must not outweigh the long trail.
    // It is short, so it gathers sooner and thins away under the seat.
    // From where the visitor stands it runs on up to the chair and in under
    // the seat from behind it.
    {name:'into the chair',fadeIn:1.1,fadeOut:.45,points:[...way.slice(0,fork+1),...branch,[restX+.1,restZ+.42],[restX+.02,restZ+.05]],
      strands:[{offset:.02,width:.18,height:0,phase:3.7,speed:.75,density:.4,wobble:.6},
        {offset:.12,offsetEnd:.04,width:.13,height:.05,phase:5.2,speed:1.1,density:.78,wobble:.45},
        {offset:.06,offsetEnd:-.04,width:.09,height:.1,phase:.9,speed:1.3,density:.55,wobble:.45}]},
  ]});
  smoke.group.traverse(object=>object.layers.set(1));scene.add(smoke.group);

  // ---- Room lighting balance. The base fill stays low, so the lights below
  // shape the room: warm and close around the table and the study nook, cool
  // and further off at the window and the tower, the ceiling left to fall
  // into shadow. Intensities in three.js physical units; live-tunable with
  // studyRoom.lighting.configure({...}).
  //   lamp   the light in the largest of the study nook's droplets
  //   front  the door lantern's unpatterned glow round itself
  const lighting={fill:.5,ambient:.06,lamp:lampTuning.shelf.light,front:lampTuning.door.glow,table:9,tableAwake:.35};
  // A dim night sky from above and the warm floor's bounce from below.
  const hemisphere=new THREE.HemisphereLight('#8390c4','#4c3a2c',lighting.fill);scene.add(hemisphere);
  const ambient=new THREE.AmbientLight('#d8bc99',lighting.ambient);scene.add(ambient);
  // The study nook's light hangs in its droplet lamps (room-lamps.js): the
  // nook glows as a warm pocket in the middle distance, now lit from above
  // its shelf instead of from an unseen point level with it.
  const warm=lamps.lights.shelf;
  // Moonlight still enters through the pointed window, now at the alcove's end.
  const moon=new THREE.SpotLight('#a0bcf4',28,9,.54,.75,1.7);
  moon.position.set(aperture.x,2.4,aperture.z-T/2);moon.target.position.set(-1.7,0,-1.4);
  moon.castShadow=true;moon.shadow.mapSize.set(1024,1024);moon.shadow.bias=-.001;moon.shadow.normalBias=.025;
  shell.add(moon,moon.target);
  // (Wider in the chamber: the great window is twice the old one's height.)
  const windowBounce=new THREE.PointLight('#91acd7',3.4,4.2,2);
  windowBounce.position.set(aperture.x,aperture.sill+.62,aperture.z+.24);shell.add(windowBounce);
  // The same cool window light inside the tower, so its lancets read at night.
  const towerBounce=new THREE.PointLight('#91acd7',2.2,3,2),[bounceX,bounceZ]=radialAt(lancets[1].at,.75*tower.scale);
  towerBounce.position.set(bounceX,lancets[1].sill+.3,bounceZ);shell.add(towerBounce);
  // The viewer's end of the room takes its light from the lantern by the
  // door (room-lamps.js): its patterned spot on the doorway, the wall and the
  // floor round it, and a weak glow that keeps the nearest beams and the
  // chair's back from going pure black. It replaces an unseen warm fill.
  const frontFill=lamps.lights.glow;
  // The chamber's own warm light (room-chamber.js), each from a lamp the
  // visitor can see: the lantern under the boss lights the vault's ribs, the
  // gallery's rail and the floor round the table from above; two of the
  // column sconces wash the walls on either side, the shelving niches and
  // the banners, in amber. None casts a shadow; the room stays dark at its
  // edges and high in the vault. Live-tunable with studyRoom.chamberLight.
  const chamberLight={lantern:24,sconces:7};
  const vaultLight=new THREE.PointLight('#ffb468',chamberLight.lantern,11,2);
  vaultLight.name='vault lantern';vaultLight.position.copy(chamber.parts.lanternAt);shell.add(vaultLight);
  const sconceLights=[8,4].map(k=>{
    const at=chamber.sconces[k],light=new THREE.PointLight('#ffad5c',chamberLight.sconces,4.5,2);
    light.name='sconce '+(at.x<0?'left':'right');light.position.copy(at).multiplyScalar(.93).setY(at.y);shell.add(light);return light;
  });
  // The portal's own light gathers round the table and the floor beside it;
  // it reaches no further than the floor's middle, so the side walls stay in
  // the room's shadow and the open portal remains the brightest thing in view.
  const teal=new THREE.PointLight('#38bdae',4.4,2.4,2);teal.position.set(-.65,.23,.1);scene.add(teal);
  const purple=new THREE.PointLight('#8163b7',3,2.4,2);purple.position.set(.64,.24,.20);scene.add(purple);
  // The table's own light: a soft, warm pool from just under the beams, a
  // little toward the viewer, so the cloth and the floor around the table are
  // the brightest part of the room and the table stands on its own shadow.
  // Once the portal wakes it gives way to the portal's glow (applyGlow).
  const tableKey=new THREE.SpotLight('#ffd3a0',lighting.table,5.5,.72,.8,2);
  tableKey.position.set(0,2.2,.9);tableKey.target.position.set(0,.2,-.15);
  tableKey.castShadow=true;tableKey.shadow.mapSize.set(1024,1024);tableKey.shadow.bias=-.0008;tableKey.shadow.normalBias=.02;
  scene.add(tableKey,tableKey.target);

  // ---- Convergence lighting: two magical light systems meet in the room. A
  // green glow on the tower's upper floor spills down through the stairwell;
  // the moonlit purple sky outside sends a cooler lavender light in through
  // the windows. Spot lights put the colour on surfaces; soft additive shafts
  // and a little suspended dust show it in the air, where the two cross inside
  // the tower and near its mouth. All in plan coordinates (the shell group).
  //   upperGreen  the upper floor's light, the scene's one saturated green
  //   skyLight    the window light: the moon's cool, bluish lavender, lighter
  //               and bluer than the portal's violet, so sky, stair and portal
  //               each keep their own colour
  const upperGreen=architectureTuning.green,skyLight='#acb0ff';
  // The window light is the moon's: the alcove's shadow-casting spot (its
  // patch falls behind the table, toward the tower), its beams in the air
  // (below) and the soft fills by each window. Live-tunable with
  // studyRoom.windowLight.configure({...}):
  //   intensity  the spot that lays the moonlight on the floor
  //   shafts     the sky's beams in the air and the dust in them (multiplier)
  //   haze       the glow of the air just inside the alcove window (multiplier)
  const windowLight={intensity:22,shafts:1,haze:1};
  moon.color.set(skyLight);moon.intensity=windowLight.intensity;moon.penumbra=.92;moon.target.position.set(.4,0,-1.9);
  windowBounce.color.set('#b6b4f6');towerBounce.color.set('#b6b4f6');
  // Inside the tower the lancets' fill stays under the green from above, so
  // the stair is lit from its landing and the sky only tints its lower walls.
  towerBounce.intensity=1.5;
  // The upper floor's light falling through the stairwell: over the upper
  // flight, down the wall beneath it and softly onto the tower floor.
  const [wellX,wellZ]=radialAt(turned(-66),.94*tower.scale),wellY=tread(stair.count);
  const presence=new THREE.SpotLight(upperGreen,architectureTuning.greenIntensity,5,architectureTuning.greenAngle,.68,2);presence.name='stairwell light';
  // Aimed a little toward the tower's mouth: its pool lands where the chair
  // can see it, on the floor just inside the opening.
  presence.position.set(wellX,wellY+.45,wellZ);{const [x,z]=fromOld(2.02,-1.5);presence.target.position.set(x,.1,z);}
  shell.add(presence,presence.target);
  // Its source, up in the tower room just above the well, stays out of view.
  // The seated eye sees it as the wall at the top of the stair: brightest just
  // under the landing, fading down the flight.
  const upstairs=new THREE.PointLight(upperGreen,architectureTuning.upperBounce,architectureTuning.upperReach,2),[upX,upZ]=radialAt(turned(-118),.85*tower.scale);
  upstairs.name='upper floor glow';upstairs.position.set(upX,wellY+.23,upZ);shell.add(upstairs);
  // Where the green lands on the tower floor it gives a little back: a faint
  // fill from the floor that only shines upward, onto the middle of the
  // flight's underside, so the sweep shades as one curved surface instead of
  // a flat black silhouette. The floor and the newel stay out of its cone.
  const [underX,underZ]=radialAt(turned(-100),tower.scale);
  const floorBounce=new THREE.SpotLight(upperGreen,5,3.4,.85,1,2);floorBounce.name='stairwell floor bounce';
  {const [x,z]=fromOld(2.18,-1.96);floorBounce.position.set(x,.04,z);}floorBounce.target.position.set(underX,1.9,underZ);
  shell.add(floorBounce,floorBounce.target);
  // Shafts of light, from their source to where they fade out: open cones,
  // brightest along their axis as seen from any angle, fading at both ends.
  const inward=(w,down,length)=>{
    const [x,z]=radialAt(w.at,tower.r+.02),y=w.sill+1.05,d=new THREE.Vector3(-Math.cos(w.at),-down,-Math.sin(w.at)).normalize();
    return {from:[x,y,z],to:[x+d.x*length,y+d.y*length,z+d.z*length]};
  };
  // The alcove window's beams leave both its lights (either side of the
  // mullion) at several heights and run parallel to land on the spot's patch
  // on the floor: one soft sheet of moonlight per light, so the light in the
  // air and the light on the floor are the same light.
  const windowMiddle=(aperture.sill+aperture.peak)/2;
  const moonWay=moon.target.position.clone().sub(new THREE.Vector3(aperture.x,windowMiddle,aperture.z)).normalize();
  const fromWindow=(dx,y,r0,r1,strength,motes)=>{
    const from=new THREE.Vector3(aperture.x+dx,y,aperture.z+.03);
    const to=from.clone().addScaledVector(moonWay,(y-.04)/-moonWay.y);
    return {from:from.toArray(),to:to.toArray(),r0,r1,color:skyLight,strength,motes,moonlit:true,veiled:true};
  };
  // The upstairs shafts start in the tower room, above the well, so from the
  // room they emerge from behind the ring beam, brightest at the top. They fall
  // past the lower flight, the only part of the stair seen from above the
  // treads; over the upper flight's soffit they would read as pale columns.
  // (Angles, radii and landing points as designed in the old corner: fromOld.)
  const fall=(degrees,rho,above,to)=>{const [x,z]=radialAt(turned(degrees),rho*tower.scale),[tx,tz]=fromOld(to[0],to[2]);
    return {from:[x,wellY+above,z],to:[tx,to[1],tz]};};
  // Slit-like shafts emerge together from the upper well, not from the
  // windows. Shorter/finer falloff keeps their mint core distinct from the
  // untouched lavender moonlight. Reuse the existing batch and dust count.
  const greenShaft=(degrees,rho,to,r0,r1,strength,motes)=>({
    ...fall(degrees,rho,.45,to),r0:r0*architectureTuning.shaftWidth,r1:r1*architectureTuning.shaftWidth,
    color:upperGreen,strength:strength*architectureTuning.shaftStrength,motes,dustGlow:.32,dustSize:.65});
  const beams=[
    greenShaft(-66,.94,[2.28,.18,-1.90],.027,.14,.21,70),
    greenShaft(-57,1.02,[2.46,.40,-1.78],.019,.085,.13,22),
    greenShaft(-77,.84,[2.08,.85,-2.02],.015,.060,.08,14),
    // The lancets face away from the moon: only the sky's softer glow comes
    // in there, wide and faint.
    {...inward(lancets[1],.55,2.5),r0:.1,r1:.34,color:skyLight,strength:.18,motes:30,moonlit:true},
    {...inward(lancets[0],.62,2.3),r0:.08,r1:.28,color:skyLight,strength:.12,motes:18,moonlit:true},
    ...[-.5,.5].flatMap(side=>[.2,.38,.56].map(f=>fromWindow(side*aperture.halfWidth,aperture.sill+f*(aperture.peak-aperture.sill),.1,.24,.13,14))),
    // And the haze between them: one wide, faint veil from the whole window.
    fromWindow(0,windowMiddle,.6,1,.06,0),
  ];
  const lightInAir=new THREE.ShaderMaterial({
    // uMoonlight: how much of the moon is clear of cloud, for the alcove
    // window's own beams (veiled).
    uniforms:{uMoonlight:{value:1}},
    vertexShader:`attribute vec3 tint;attribute float veiled;varying vec3 vTint,vNormal,vView,vWorld;varying float vAlong,vVeiled;
      void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=-mv.xyz;
        vAlong=uv.y;vTint=tint;vVeiled=veiled;vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`uniform float uMoonlight;varying vec3 vTint,vNormal,vView,vWorld;varying float vAlong,vVeiled;
      void main(){
        float core=pow(abs(dot(normalize(vNormal),normalize(vView))),1.7);
        float ends=smoothstep(1.,.9,vAlong)*smoothstep(0.,.55,vAlong);
        float streaks=.78+.22*sin(vWorld.x*7.+vWorld.y*4.3+vWorld.z*6.1)*sin(vWorld.x*2.9-vWorld.z*3.7);
        gl_FragColor=vec4(vTint*core*ends*streaks*mix(1.,uMoonlight,vVeiled),1.);
      }`,
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
  lightInAir.forceSinglePass=true;
  const shaftParts={position:[],normal:[],uv:[],tint:[],veiled:[]},q=new THREE.Quaternion(),a=new THREE.Vector3(),b=new THREE.Vector3();
  const dust={position:[],tint:[],size:[],drift:[],phase:[]};
  // Vertex ranges of the sky's beams and of their dust, for windowLight.shafts.
  const moonShafts=[],moonDust=[];
  for(const beam of beams) {
    const first=shaftParts.tint.length/3,firstMote=dust.tint.length/3;
    a.set(...beam.from);b.set(...beam.to);
    const length=a.distanceTo(b),axis=a.clone().sub(b).normalize();
    // Additive and soft-edged: fine shafts need few sides, broad ones a few more.
    const g=new THREE.CylinderGeometry(beam.r0,beam.r1,length,beam.r1<.15?8:12,1,true).toNonIndexed();
    q.setFromUnitVectors(new THREE.Vector3(0,1,0),axis);
    g.applyQuaternion(q).translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
    // Written straight to the display: sRGB values, scaled by the strength.
    const c=new THREE.Color(beam.color).convertLinearToSRGB();
    for(const key of ['position','normal','uv']) shaftParts[key].push(...g.attributes[key].array);
    for(let i=0;i<g.attributes.position.count;i++){shaftParts.tint.push(c.r*beam.strength,c.g*beam.strength,c.b*beam.strength);shaftParts.veiled.push(beam.veiled?1:0);}
    // Dust suspended in the shaft, denser toward its axis.
    const side=new THREE.Vector3().crossVectors(axis,Math.abs(axis.y)>.9?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0)).normalize();
    const other=new THREE.Vector3().crossVectors(axis,side);
    for(let i=0;i<beam.motes;i++) {
      const t=.08+random()*.84,radius=(beam.r0+(beam.r1-beam.r0)*t)*Math.sqrt(random())*.85,angle=random()*Math.PI*2;
      const p=a.clone().lerp(b,t).addScaledVector(side,Math.cos(angle)*radius).addScaledVector(other,Math.sin(angle)*radius);
      dust.position.push(p.x,p.y,p.z);
      const glow=(.5+random()*.5)*(1-t*.6)*(beam.dustGlow??1);dust.tint.push(c.r*glow,c.g*glow,c.b*glow);dust.size.push((.008+random()*.014)*(beam.dustSize??1));
      // The alcove window's dust drifts (see the dust's shader); a hashed
      // phase, so the room's seeded random stays as it was.
      const n=dust.drift.length,h=Math.sin(n*12.9898)*43758.5453;dust.drift.push(beam.veiled?1:0);dust.phase.push((h-Math.floor(h))*100);
    }
    if(beam.moonlit){moonShafts.push([first,shaftParts.tint.length/3]);moonDust.push([firstMote,dust.tint.length/3]);}
  }
  const shaftGeometry=new THREE.BufferGeometry();
  for(const [key,size] of [['position',3],['normal',3],['uv',2],['tint',3],['veiled',1]])
    shaftGeometry.setAttribute(key,new THREE.Float32BufferAttribute(shaftParts[key],size));
  const shafts=new THREE.Mesh(shaftGeometry,lightInAir);shafts.name='light shafts';shafts.renderOrder=5;shell.add(shafts);
  // Dust in the alcove window's moonlight (drift) floats in a slow, small
  // wander and shimmers, dimming with the moonlight; the rest stays still.
  const dustMaterial=new THREE.ShaderMaterial({uniforms:{uFocal:{value:600},uTime:{value:0},uMoonlight:{value:1}},
    vertexShader:`attribute vec3 tint;attribute float size,drift,phase;uniform float uFocal,uTime,uMoonlight;varying vec3 vTint;
      void main(){float t=uTime+phase;
        vec3 p=position+drift*vec3(sin(t*.31)*.035,sin(t*.23+1.7)*.03,cos(t*.27)*.035);
        vec4 mv=modelViewMatrix*vec4(p,1.);vTint=tint*mix(1.,uMoonlight*(.72+.28*sin(t*1.3)),drift);
        gl_PointSize=max(1.5,size*uFocal/-mv.z);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying vec3 vTint;
      void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(vTint*smoothstep(.5,.05,d)*1.6,1.);}`,
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  const dustGeometry=new THREE.BufferGeometry();
  dustGeometry.setAttribute('position',new THREE.Float32BufferAttribute(dust.position,3));
  dustGeometry.setAttribute('tint',new THREE.Float32BufferAttribute(dust.tint,3));
  dustGeometry.setAttribute('size',new THREE.Float32BufferAttribute(dust.size,1));
  dustGeometry.setAttribute('drift',new THREE.Float32BufferAttribute(dust.drift,1));
  dustGeometry.setAttribute('phase',new THREE.Float32BufferAttribute(dust.phase,1));
  const motes=new THREE.Points(dustGeometry,dustMaterial);motes.name='dust in the light';motes.renderOrder=6;shell.add(motes);
  const shaftTint=shaftGeometry.attributes.tint.array.slice(),dustTint=dustGeometry.attributes.tint.array.slice();
  // The air just inside the alcove window glows faintly where the moonlight
  // enters, so the window breathes its light into the room.
  const hazeMap=(()=>{
    const c=document.createElement('canvas');c.width=c.height=128;
    const x=c.getContext('2d'),r=x.createRadialGradient(64,64,0,64,64,64);
    r.addColorStop(0,'#fff');r.addColorStop(.35,'rgba(255,255,255,.4)');r.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=r;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);
  })();
  const windowHaze=new THREE.Sprite(new THREE.SpriteMaterial({map:hazeMap,color:skyLight,transparent:true,depthWrite:false,
    blending:THREE.AdditiveBlending,opacity:.065*windowLight.haze}));
  windowHaze.name='moonlit air at the window';windowHaze.scale.set(aperture.halfWidth*3.3,(aperture.peak-aperture.sill)*.7,1);
  windowHaze.position.set(aperture.x,windowMiddle,aperture.z+.3);windowHaze.renderOrder=5;shell.add(windowHaze);

  // ---- The cloth over the table until the viewer pulls it off: a heavy, dark
  // velvet with an embroidered hem, on the foreground layer so it truly covers
  // the CSS portal. Its drape is recomputed from where it lies: fabric over
  // the tabletop stays flat, the rest rolls over the edge, hangs in soft folds
  // and pools on the floor. Pulling slides the whole cloth, so it pours off
  // whichever edge it is drawn toward.
  // hang: fabric beyond each tabletop edge; edge: radius it rolls over.
  const hang=.3,edge=.02,drape={hx:1,hz:1,x:0,z:0,ox:0,oz:0};
  const ritualCloth=createRitualCloth(THREE);
  ritualCloth.update(2,2);
  // Painted at the cloth's own proportions (Wm x Dm metres) so the hem,
  // sigils and inscription keep their size on any table. Returns the colour
  // texture and the inscription's glow mask (red: letters, green: halo).
  function paintCloth(Wm,Dm) {
    const W=1024,H=Math.round(W*Dm/Wm),ppm=W/Wm,m=v=>v*ppm,sc=ppm/352;
    const layer=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;return c;};
    const image=layer(),g=image.getContext('2d');
    // Dark, calm velvet, so the inscription carries the eye.
    const base=g.createRadialGradient(W/2,H/2,m(.1),W/2,H/2,Math.max(W,H)*.65);
    base.addColorStop(0,'#2b1d34');base.addColorStop(.7,'#1d1325');base.addColorStop(1,'#160e1c');
    g.fillStyle=base;g.fillRect(0,0,W,H);
    // Velvet pile: a fine mottle and a few paler, worn streaks.
    for(let i=0;i<W*H/26;i++){g.fillStyle=random()>.5?'#ffffff05':'#00000012';g.fillRect(random()*W,random()*H,1+random()*2,1+random()*2);}
    for(let i=0;i<12;i++) {
      const x=random()*W,y=random()*H;g.strokeStyle='#d8c9ee08';g.lineWidth=(6+random()*18)*sc;
      g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+(random()*160-80)*sc,y+(random()*120-60)*sc,x+(random()*300-150)*sc,y+(random()*200-100)*sc);g.stroke();
    }
    // Bronze hem threads with a band of small stitched glyphs between them;
    // it lands on the fabric hanging over the table edge.
    const thread='#b8955e';
    const frame=(scale,width,alpha)=>{
      g.strokeStyle=thread+alpha;g.lineWidth=width;g.beginPath();
      ritualCloth.border.forEach(([x,z],i)=>{const px=W/2+m(x)*scale,py=H/2+m(z)*scale;i?g.lineTo(px,py):g.moveTo(px,py);});
      g.closePath();g.stroke();
    };
    // Nested embroidered contours follow the actual six-lobed cut, including
    // its wave-ended hem. A muted inner seam ties the six panels to the core.
    frame(.963,2,'bb');frame(.925,1,'88');frame(.80,1,'44');
    g.strokeStyle=thread+'99';g.fillStyle=thread+'88';g.lineWidth=1.6;
    const glyphs=[
      (x,y,s)=>{g.beginPath();g.moveTo(x-8*s,y);g.lineTo(x+8*s,y);g.moveTo(x,y-8*s);g.lineTo(x,y+8*s);g.moveTo(x-3*s,y-3*s);g.lineTo(x+3*s,y+3*s);g.moveTo(x+3*s,y-3*s);g.lineTo(x-3*s,y+3*s);g.stroke();},
      (x,y,s)=>{g.beginPath();g.arc(x,y,7*s,.7,5.6);g.stroke();g.beginPath();g.arc(x+3*s,y,5*s,1.2,5.1);g.stroke();},
      (x,y,s)=>{g.beginPath();g.arc(x,y,6*s,0,Math.PI*2);g.stroke();g.beginPath();g.arc(x,y,1.6*s,0,Math.PI*2);g.fill();},
      (x,y,s)=>{g.beginPath();g.moveTo(x,y-8*s);g.lineTo(x,y+8*s);g.moveTo(x,y-2*s);g.lineTo(x+6*s,y-8*s);g.moveTo(x,y+3*s);g.lineTo(x-6*s,y-3*s);g.stroke();},
    ];
    for(let k=0;k<36;k++) {
      const j=Math.round(k*ritualCloth.border.length/36);
      const [x,z]=ritualCloth.border[j];
      g.save();g.translate(W/2+m(x)*.869,H/2+m(z)*.869);g.rotate(Math.atan2(z,x)+Math.PI/2);
      glyphs[k%4](0,0,sc*.57);g.restore();
    }
    // One restrained medallion per broad panel, not four rectangular corners.
    for(let k=0;k<6;k++) {
      const j=Math.round((k+.5)*ritualCloth.border.length/6);
      const [px,pz]=ritualCloth.border[j],x=W/2+m(px)*.71,y=H/2+m(pz)*.71;
      g.strokeStyle=thread+'66';g.lineWidth=1.3;
      g.beginPath();g.arc(x,y,15*sc,0,Math.PI*2);g.stroke();
      glyphs[k%4](x,y,sc);
    }
    // The call to action, embroidered at the centre in the page's Cinzel
    // capitals: bronze-gold satin stitch over a sunken edge, stretched along
    // the table's depth so it reads upright from the chair.
    const lines=['IKKE DRA','I TEPPET'],stretch=1.3,top=m(drape.hx*2);
    const font=size=>`600 ${size}px Cinzel, Georgia, serif`;
    g.font=font(100);
    const widest=Math.max(...lines.map(line=>g.measureText(line).width));
    const size=Math.floor(Math.min(top*.145,100*top*.7/widest));
    const letters=(c,paint)=>{
      c.save();c.translate(W/2,H/2);c.scale(1,stretch);c.font=font(size);c.textAlign='center';c.textBaseline='middle';
      lines.forEach((line,i)=>paint(c,line,0,(i-.5)*size*1.18));c.restore();
    };
    letters(g,(c,line,x,y)=>{c.lineJoin='round';c.lineWidth=size*.07;c.strokeStyle='#0a060ecc';c.strokeText(line,x,y);});
    const stitch=layer(),s=stitch.getContext('2d');
    letters(s,(c,line,x,y)=>{
      const gold=c.createLinearGradient(0,y-size*.5,0,y+size*.5);
      // Deep bronze thread: the glow, not the lamp light, gives it its colour.
      gold.addColorStop(0,'#9c7640');gold.addColorStop(.55,'#6b4a24');gold.addColorStop(1,'#43301a');
      c.fillStyle=gold;c.fillText(line,x,y);
    });
    s.globalCompositeOperation='source-atop';s.lineWidth=1.3;
    for(let i=-H,n=0;i<W;i+=3,n++){s.strokeStyle=n%2?'#ffffff1e':'#0000002e';s.beginPath();s.moveTo(i,0);s.lineTo(i+H*.55,H);s.stroke();}
    g.drawImage(stitch,0,0);
    // Glow mask: the letters themselves, and a soft halo around them. Both are
    // read back below, so they are CPU canvases: a GPU canvas's read-back
    // waits behind whatever the GPU is doing while the page loads.
    const sharp=layer(),halo=layer(),h=halo.getContext('2d',{willReadFrequently:true});
    letters(sharp.getContext('2d',{willReadFrequently:true}),(c,line,x,y)=>{c.fillStyle='#fff';c.fillText(line,x,y);});
    h.filter=`blur(${Math.round(size*.16)}px)`;h.drawImage(sharp,0,0);
    const mask=sharp.getContext('2d').getImageData(0,0,W,H),soft=h.getImageData(0,0,W,H);
    for(let i=0;i<mask.data.length;i+=4){mask.data[i+1]=Math.min(255,soft.data[i+3]*1.6);mask.data[i+2]=0;mask.data[i]=mask.data[i+3];mask.data[i+3]=255;}
    sharp.getContext('2d').putImageData(mask,0,0);
    const map=new THREE.CanvasTexture(image),glow=new THREE.CanvasTexture(sharp);
    map.colorSpace=THREE.SRGBColorSpace;
    map.anisotropy=glow.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    return {map,glow};
  }
  const clothGeometry=ritualCloth.geometry;
  const clothMaterial=new THREE.MeshPhysicalMaterial({roughness:.8,sheen:.75,
    sheenRoughness:.45,sheenColor:new THREE.Color('#6f5a86'),side:THREE.DoubleSide,transparent:true});
  // The inscription glows from within the fabric: its colour flows across the
  // letters through green, purple, light blue, pink and gold and drifts
  // slowly, breathing, with a soft shimmer travelling through the stitches.
  // Part of the cloth's own surface, so it folds and flies with it.
  const inscription={uInscription:{value:null},uTime:{value:0}};
  clothMaterial.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,inscription);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      uniform sampler2D uInscription;
      uniform float uTime;
      vec3 inscriptionHue(float t) {
        vec3 green=vec3(.12,.9,.42),purple=vec3(.56,.22,1.),blue=vec3(.28,.7,1.),pink=vec3(1.,.28,.68),gold=vec3(1.,.68,.16);
        t=fract(t)*5.;float f=smoothstep(0.,1.,fract(t));
        if(t<1.) return mix(green,purple,f);
        if(t<2.) return mix(purple,blue,f);
        if(t<3.) return mix(blue,pink,f);
        if(t<4.) return mix(pink,gold,f);
        return mix(gold,green,f);
      }`).replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      {
        vec4 ins=texture2D(uInscription,vMapUv);
        vec3 hue=inscriptionHue(vMapUv.x*.85+vMapUv.y*.3-uTime*.04);
        float breathe=.7+.3*sin(uTime*1.1);
        float shimmer=pow(.5+.5*sin((vMapUv.x*2.3-vMapUv.y*.9)*16.-uTime*1.5),8.);
        totalEmissiveRadiance+=hue*(ins.r*(.22+.42*shimmer)+ins.g*.3)*breathe;
      }`);
  };
  const cloth=new THREE.Mesh(clothGeometry,clothMaterial);
  cloth.name='table cloth';cloth.layers.set(1);cloth.frustumCulled=false;scene.add(cloth);
  document.getElementById('tableCloth')?.classList.add('is-webgl');
  // Repainted whenever the cloth's proportions change with the viewport, and
  // once the Cinzel web font has loaded.
  let clothAspect=0;
  function repaintCloth() {
    const [Wm,Dm]=clothSize(),{map,glow}=paintCloth(Wm,Dm);
    clothAspect=Wm/Dm;clothMaterial.map?.dispose();inscription.uInscription.value?.dispose();
    clothMaterial.map=map;inscription.uInscription.value=glow;clothMaterial.needsUpdate=true;invalidate();
  }
  document.fonts?.load('600 64px Cinzel').then(()=>{if(clothAspect)repaintCloth();},()=>{});
  const clothSize=()=>ritualCloth.size;
  // Walls the dragged cloth meets, in scene coordinates: the chamber's twelve
  // bays (with the recesses that come down to the floor) and the tower's
  // round wall behind its mouth (room-chamber.js). Fills `hit` with the
  // signed distance past the nearest wall (positive = beyond it), that wall's
  // inward normal, an id (the bay, or 12 for the tower), and a coordinate
  // along the wall.
  const beyondWall=(x,z,hit)=>chamber.beyond(x,z+placement.forward,hit,tower);
  const walls=sides+1;
  const clothCount=clothGeometry.attributes.position.count;
  // Laid shape (lay), and what stirHem needs to bring its hanging folds to
  // life, per vertex: how much it hangs free toward the hem, its outward
  // direction, position along its edge, fold phase, fold depth and laid fold.
  const laid=new Float32Array(clothCount*3),hemWeight=new Float32Array(clothCount);
  const hemOut=new Float32Array(clothCount*2),hemAlong=new Float32Array(clothCount),hemPhase=new Float32Array(clothCount);
  const hemFold=new Float32Array(clothCount),hemLaidFold=new Float32Array(clothCount);
  const loose=new Float32Array(clothCount*3),reachP=new Float32Array(clothCount),reachT=new Float32Array(clothCount);
  const reachN=new Float32Array(clothCount*2),reachId=new Uint8Array(clothCount),hit={};
  const push=new Float32Array(walls),spanMin=new Float32Array(walls),spanMax=new Float32Array(walls),support={x:0,z:0};
  function lay() {
    const {x:cx,z:cz,ox,oz}=drape,top=view.tableHeight+.004;
    const p=clothGeometry.attributes.position;
    push.fill(0);spanMin.fill(Infinity);spanMax.fill(-Infinity);
    for(let i=0;i<p.count;i++) {
      // Flat position on the cloth; its top edge (v=1) lies at the table's back.
      const fx=ritualCloth.flat[i*2],fz=ritualCloth.flat[i*2+1];
      // The centre follows the hand, while each soft outer panel yields a
      // little. Bounded spatial lag preserves the cut even on a long pull.
      const lag=ritualCloth.free[i]*ritualCloth.tuning.dragTrail*(.8+.2*Math.sin(ritualCloth.phase[i]));
      const pull=Math.hypot(ox,oz),trail=pull?Math.min(.09,pull*lag)/pull:0;
      let x=cx+ox*(1-trail)+fx,z=cz+oz*(1-trail)+fz,y=top+.0015*Math.sin(fx*11+fz*7);
      ritualCloth.supportAt(x-cx,z-cz,support);
      const ex=cx+support.x,ez=cz+support.z;
      const d=Math.hypot(x-ex,z-ez);
      hemWeight[i]=hemFold[i]=hemLaidFold[i]=0;
      if(d>1e-6) {
        const nx=(x-ex)/d,nz=(z-ez)/d,bend=edge*Math.PI/2;
        let out,drop;
        if(d<=bend){out=edge*Math.sin(d/edge);drop=edge*(1-Math.cos(d/edge));}
        else {
          // Hangs, flaring a little, in folds that deepen toward the hem;
          // whatever reaches the floor lies on it.
          const hanging=d-bend,fall=Math.min(hanging,top-edge-.006),pool=hanging-fall;
          const along=fx*(-nz)+fz*nx,phase=ritualCloth.phase[i],depth=Math.min(1,fall/.12);
          const fold=Math.sin(along*30+phase)*.016*depth;
          out=edge+fall*.08+fold+pool;
          drop=edge+fall;
          // The hanging folds come alive in stirHem; still where it lies on the floor.
          hemWeight[i]=Math.min(1,fall/hang)**1.4*Math.max(0,1-pool/.06);
          hemFold[i]=depth*Math.max(0,1-pool/.06);hemLaidFold[i]=fold;
          hemOut[i*2]=nx;hemOut[i*2+1]=nz;hemAlong[i]=along;hemPhase[i]=phase;
        }
        x=ex+nx*out;z=ez+nz*out;y=top-drop;
      }
      loose[i*3]=x;loose[i*3+1]=y;loose[i*3+2]=z;
      beyondWall(x,z,hit);
      reachP[i]=hit.p;reachT[i]=hit.t;reachId[i]=hit.id;reachN[i*2]=hit.nx;reachN[i*2+1]=hit.nz;
      if(hit.p>0) {
        push[hit.id]=Math.max(push[hit.id],hit.p);
        spanMin[hit.id]=Math.min(spanMin[hit.id],hit.t);spanMax[hit.id]=Math.max(spanMax[hit.id],hit.t);
      }
    }
    // Wall reaction, a visual fake rather than a simulation. Fabric that
    // would pass a wall is folded back against it: the excess length climbs a
    // little way up the wall in accordion folds that stand out from it and
    // crumple along it, more the harder it is pushed. Fabric just in front of
    // the contact buckles up, only along the stretch of wall being touched.
    for(let i=0;i<p.count;i++) {
      let x=loose[i*3],y=loose[i*3+1],z=loose[i*3+2];
      const k=reachP[i],id=reachId[i],nx=reachN[i*2],nz=reachN[i*2+1],t=reachT[i];
      if(k>0) {
        // Wavelengths span several vertices (the mesh is ~4 cm), so the folds
        // read as soft ridges rather than aliasing into spikes.
        const fold=.07*Math.min(1,k/.2)*(.5-.5*Math.cos(k/.3*Math.PI*2))+.03*Math.min(1,k/.6);
        const crumple=.025*Math.min(1,k/.25)*Math.sin(t*6.5+k*8);
        x+=nx*(k+.012+fold)-nz*crumple;z+=nz*(k+.012+fold)+nx*crumple;
        y=Math.min(H-.15,y+.5*(1-Math.exp(-k/.45)));
      } else if(push[id]>0&&k>-.3) {
        const beside=Math.max(0,Math.max(spanMin[id]-t,t-spanMax[id]));
        const near=(1+k/.3)**2*Math.max(0,1-beside/.3)*Math.min(1,push[id]/.3);
        y+=near*(.09+.02*Math.sin(t*9));
      }
      // Fabric pressed against or bunched near a wall keeps its laid folds.
      if(k>-.08) hemWeight[i]=hemFold[i]=0;
      laid[i*3]=x;laid[i*3+1]=y;laid[i*3+2]=z;
    }
    stirHem(performance.now());
  }
  // ---- The hanging hem's idle life: its scalloped folds are a living wave.
  // The laid folds (lay: one in/out fold every ~21 cm) are replaced by the
  // same folds in motion: the pattern travels along each edge, each section's
  // folds swell and flatten in turn, and a slowly drifting phase lets
  // neighbouring sections run a little ahead or behind, so the pattern
  // stretches and bunches as it goes. Crests swell out and hang lower while
  // troughs tuck in and lift, and each point circles a little along the edge,
  // so the silhouette itself changes shape. (From the chair the hem is seen
  // from above: out-and-up motion would run along the line of sight and
  // vanish; out-and-down crosses it.) The tabletop never moves.
  // Applied on top of the laid shape, so dragging, settling and the flight's
  // starting shape all carry it without a jump; while dragged it eases back
  // to the laid folds.
  //   amplitude     metres of in/out fold depth (the laid folds are .016)
  //   wavelength    metres from one scallop to the next
  //   speed         metres per second the pattern travels along the hem
  //   irregularity  0 = one even wave; 1 = sections clearly out of step
  //   swell         0..1, how much each section's folds deepen and flatten
  //   droop         metres the hem drops per metre of outward fold
  //   sideways      metres of along-the-edge travel per metre of fold
  //   fadeOut / fadeIn  how fast it yields to a drag and returns (per second)
  const hem={amplitude:.028,wavelength:.30,speed:.11,irregularity:.7,swell:.35,droop:.6,sideways:.35,fadeOut:4,fadeIn:1.2};
  const hemStill=matchMedia('(prefers-reduced-motion: reduce)');
  let hemGain=1,hemClock=0,hemHeld=false;
  function stirHem(now) {
    const dt=hemClock?Math.min(.1,(now-hemClock)/1000):0;hemClock=now;
    // Yields while the cloth is being dragged, and rests for reduced motion.
    const target=hemHeld||hemStill.matches?0:1;
    if(hemStill.matches) hemGain=0;
    else hemGain+=(target-hemGain)*Math.min(1,dt*(target<hemGain?hem.fadeOut:hem.fadeIn));
    const p=clothGeometry.attributes.position,t=now/1000,k=2*Math.PI/hem.wavelength;
    for(let i=0;i<p.count;i++) {
      let x=laid[i*3],y=laid[i*3+1],z=laid[i*3+2];
      if(hemFold[i]>0&&hemGain>0) {
        const s=hemAlong[i],phase=hemPhase[i],nx=hemOut[i*2],nz=hemOut[i*2+1];
        const drift=hem.irregularity*(1.2*Math.sin(s*2.1+.37*t+phase)+.7*Math.sin(s*5.3-.23*t));
        const depth=1-hem.swell+hem.swell*Math.sin(s*3.7+.5*t+phase*1.3);
        const angle=k*(s-hem.speed*t)+phase+drift,size=hem.amplitude*hemFold[i]*depth;
        const fold=size*Math.sin(angle),change=(fold-hemLaidFold[i])*hemGain;
        const along=hem.sideways*size*Math.cos(angle)*hemGain*hemWeight[i];
        x+=nx*change-nz*along;z+=nz*change+nx*along;y-=hem.droop*fold*hemGain*hemWeight[i];
      }
      p.setXYZ(i,x,y,z);
    }
    p.needsUpdate=true;clothGeometry.computeVertexNormals();
  }
  // The under-table teal and purple glow belongs to the awake portal: dark
  // while the table is covered, rising as the cloth comes off.
  const smooth=x=>{x=Math.min(1,Math.max(0,x));return x*x*(3-2*x);};
  let glow=0,flare=0,clothMotion=null,airborne=false;
  const applyGlow=()=>{teal.intensity=4.4*(glow+flare);purple.intensity=3*(glow+flare);
    tableKey.intensity=lighting.table*(1-(1-lighting.tableAwake)*glow);};
  const setGlow=value=>{glow=value;applyGlow();};
  setGlow(0);
  // A portal impact (portal-impact.js) flares the portal's light on the room:
  // a quick surge, then a softer after-glow.
  let flareStart=0;
  addEventListener('portal-impact',event=>{
    const strength=event.detail?.strength??1,begin=performance.now(),mine=flareStart=begin;
    const step=now=>{
      if(flareStart!==mine) return;
      const t=(now-begin)/1000,after=t>1&&t<2.4?Math.sin(Math.PI*(t-1)/1.4):0;
      flare=strength*(1.6*smooth(t/.08)*(1-smooth((t-.1)/.9))+.35*after);
      applyGlow();invalidate();
      if(t<2.4) requestAnimationFrame(step); else {flare=0;applyGlow();invalidate();}
    };
    requestAnimationFrame(step);
  });
  // Lit inside the fabric's dip when the waking portal tugs at the cloth.
  const tugLight=new THREE.PointLight('#6fe3d0',0,.75,2);scene.add(tugLight);
  function animateCloth(duration,frame) {
    return new Promise(resolve=>{
      const start=performance.now(),motion={};clothMotion=motion;
      const step=now=>{
        if(clothMotion!==motion) return resolve(false);
        const t=Math.min(1,(now-start)/duration);frame(t);lay();invalidate();
        if(t<1) requestAnimationFrame(step); else {clothMotion=null;resolve(true);}
      };
      requestAnimationFrame(step);
    });
  }

  // ---- Release: the enchanted cloth settles with a ripple, lifts off the
  // table, turns toward the spiral stair and flies up along it. The broad
  // panels remain legible until the tower hides it on the upper floor.
  const UP=new THREE.Vector3(0,1,0);
  const towerAxis=new THREE.Vector3(tower.x,0,tower.z-placement.forward);
  // Route of the cloth's leading edge, in scene coordinates: from where it
  // lies, back over the table to just in front of the right side of the
  // tower mouth, to the foot of the stair, then up the spiral about 0.75 m
  // above the nosing line (low enough to stay in view across the back of the
  // tower) and out through the stairwell.
  const plan=(x,y,z)=>new THREE.Vector3(x,y,z-placement.forward);
  // In the chamber: in front of the tower's mouth, then up the turned stair
  // (its angles and radii as designed in the old corner).
  const out=chamber.mouth.out,towerApproach=plan(out.x*(apothem-.9),1.15,out.z*(apothem-.9));
  function stairRoute(start,heading) {
    const spiral=(degrees,rho,above)=>{
      const phi=turned(degrees),line=((stair.from-phi)/stair.step+1)*stair.rise;
      return plan(tower.x+rho*tower.scale*Math.cos(phi),line+above,tower.z+rho*tower.scale*Math.sin(phi));
    };
    return new THREE.CatmullRomCurve3([start,start.clone().addScaledVector(heading,.8).add(new THREE.Vector3(0,.3,0)),
      towerApproach,...[-25,-50,-75,-100,-125,-150].map(d=>spiral(d,.95,.75)),
      spiral(-170,.8,.75),plan(tower.x,5.6,tower.z)],false,'centripetal');
  }
  // The waking portal's grip on the cloth, as release begins. The fabric lying
  // over the opening is drawn down into it (tug.depth at the centre of the
  // overlap) and gathered toward the point of contact, with a flickering
  // light inside the dip, until the portal loses its hold at tug.release:
  // the fabric snaps free and the portal reacts (portalImpact).
  const tug={depth:.26,gather:.1,release:.5};
  const tugHold=t=>smooth(t/.28)*(1-smooth((t-.42)/.2));
  const tugWarm=new THREE.Color('#ffb05e'),tugCool=new THREE.Color('#6fe3d0');
  function flyAway(fromGlow) {
    // Shape at release. Its right edge becomes the leading edge, turned to
    // head for the tower: blending from the rest shape swivels the cloth
    // round toward the stair as it lifts.
    lay();
    const rest=Float32Array.from(clothGeometry.attributes.position.array);
    const [W,D]=clothSize(),centre={x:drape.x+drape.ox,z:drape.z+drape.oz};
    const T0=new THREE.Vector3(towerApproach.x-centre.x,0,towerApproach.z-centre.z).normalize();
    const start=new THREE.Vector3(centre.x,view.tableHeight+.004,centre.z).addScaledVector(T0,W/2);
    const route=stairRoute(start,T0),length=route.getLength();
    const columns=73,frames=Array.from({length:columns},()=>({p:new THREE.Vector3(),b:new THREE.Vector3(),n:new THREE.Vector3(),wave:0,lift:0}));
    const P=new THREE.Vector3(),T=new THREE.Vector3(),inward=new THREE.Vector3(),probe=new THREE.Vector3();
    // Leaves the table-covering layer for the room canvas (so the tower's
    // walls and ceiling can hide it) once no part of it is over the table on screen.
    const corner=(x,z)=>probe.set(x,view.tableHeight,z).project(camera);
    // Where the flat fabric lies over the aperture (centred on the scene
    // origin), and the weighted centre of that overlap: the point of contact.
    const ax=view.width/view.units/2,az=view.height/view.units/2,top=view.tableHeight+.004;
    const grip=new Float32Array(rest.length/3);let weight=0,gripX=0,gripZ=0;
    for(let i=0;i<grip.length;i++) {
      const rx=rest[i*3],rz=rest[i*3+2];
      if(Math.abs(rest[i*3+1]-top)>.01) continue;
      grip[i]=Math.max(0,1-(rx/ax)**2)*Math.max(0,1-(rz/az)**2);
      weight+=grip[i];gripX+=grip[i]*rx;gripZ+=grip[i]*rz;
    }
    // Pulled clear of the opening before release, the cloth is out of reach:
    // no tug, and a softer reaction at the edge nearest to it.
    const within=weight>0,strength=within?1:.6;
    if(within){gripX/=weight;gripZ/=weight;}
    else{gripX=Math.max(-ax*.8,Math.min(ax*.8,centre.x));gripZ=Math.max(-az*.8,Math.min(az*.8,centre.z));}
    tugLight.position.set(gripX,top-tug.depth*.72,gripZ);
    // The contact point must be uncovered on screen for the portal's reaction
    // to be seen: it fires once no fabric hides it (after the grip releases).
    const contact=new THREE.Vector3(gripX,top,gripZ).project(camera);
    const around=[new THREE.Vector3(ax,top,0).project(camera).x-new THREE.Vector3(-ax,top,0).project(camera).x,
      new THREE.Vector3(0,top,az).project(camera).y-new THREE.Vector3(0,top,-az).project(camera).y].map(v=>Math.abs(v)*.14);
    airborne=true;
    return new Promise(resolve=>{
      const begin=performance.now(),motion={};clothMotion=motion;let released=false,struck=false;
      const step=now=>{
        if(clothMotion!==motion){if(!released)resolve(false);return;}
        const t=(now-begin)/1000;
        const ripple=Math.max(0,1-t/.6);          // the release settles through the fabric
        const b=smooth((t-.35)/1.0);              // rest shape → flying textile
        // Gathers pace off the table, then cruises up the stair.
        const tau=Math.max(0,t-.45),acc=1.4,cruise=2,reach=cruise/acc;
        const sigma=tau<reach?acc*tau*tau/2:acc*reach*reach/2+cruise*(tau-reach);
        // As it lifts it gathers itself in toward its leading edge, then
        // narrows and curls further on its way to the stair.
        const gather=smooth((t-.35)/1.1),furl=smooth((sigma-.3)/3.5);
        const Lc=W*(1-ritualCloth.tuning.gather*gather)*(1-.2*furl);
        const Dc=D*(1-ritualCloth.tuning.gather*gather)*(1-ritualCloth.tuning.furlWidth*furl),curl=.3*gather+.45*furl;
        setGlow(fromGlow+(1-fromGlow)*Math.min(1,t/1.6));
        const hold=within?tugHold(t):0;
        tugLight.intensity=2.6*hold*(.8+.2*Math.sin(t*37)+.1*Math.sin(t*61));
        tugLight.color.copy(tugCool).lerp(tugWarm,hold*(.55+.3*Math.sin(t*23)));
        const watching=!struck&&t>tug.release;
        let hidden=false;
        let previousB=null;
        for(let ix=0;ix<columns;ix++) {
          const f=frames[ix],s=(1-ix/(columns-1))*Lc,along=sigma-s;
          // Every column of fabric follows the leading edge down the same
          // route; behind the start it still lies on the table's line.
          if(along<=0){P.copy(start).addScaledVector(T0,along);T.copy(T0);}
          else if(along>=length){route.getPointAt(1,P);route.getTangentAt(1,T);P.addScaledVector(T,along-length);}
          else {route.getPointAt(along/length,P);route.getTangentAt(along/length,T);}
          f.b.crossVectors(T,UP);
          if(f.b.lengthSq()<.01&&previousB) f.b.copy(previousB); else f.b.normalize();
          f.n.crossVectors(f.b,T);
          // Bank toward the tower axis while spiralling, with a slow twist
          // travelling down the cloth.
          const inside=1-smooth((Math.hypot(P.x-towerAxis.x,P.z-towerAxis.z)-1)/1);
          inward.set(towerAxis.x-P.x,0,towerAxis.z-P.z).normalize();
          inward.addScaledVector(T,-inward.dot(T));
          f.n.addScaledVector(inward,.6*inside).normalize().applyAxisAngle(T,.3*Math.sin(1.2*along-1.6*t)*b);
          f.b.crossVectors(T,f.n).normalize();previousB=f.b;
          f.p.copy(P);
          f.wave=(.045+.085*s/Lc)*b*Math.sin(5.2*s-6.4*t);
          f.lift=.3*b*(1-smooth(along/2.5));
        }
        const p=clothGeometry.attributes.position;
        const far=corner(0,-drape.hz+drape.z).y,right=corner(drape.hx+drape.x,drape.hz+drape.z).x;
        let overTable=false;
        for(let i=0;i<p.count;i++) {
          // Material UVs, not grid-row indices: the actual scalloped outline
          // is transported along the route. Smooth frame interpolation avoids
          // quantised strips in the radial mesh. Each hem section trails softly.
          const uv=clothGeometry.attributes.uv,free=ritualCloth.free[i],phase=ritualCloth.phase[i];
          const lag=ritualCloth.tuning.flightTrail*free*b*(.6+.4*Math.sin(phase-t*2));
          const column=(uv.getX(i)-lag)*(columns-1);
          // Extrapolate the last few centimetres instead of clamping the
          // trailing hem into one strip at the route's rear sample.
          const a=Math.max(0,Math.min(columns-2,Math.floor(column))),f=frames[a],next=frames[a+1],mix=column-a;
          const w=(.5-uv.getY(i))*Dc;
          const offset=f.wave+(next.wave-f.wave)*mix+curl*w*w+
            ritualCloth.tuning.flutter*free*Math.sin(phase+4.3*t+3.1*w)*b;
          const fx=f.p.x+(next.p.x-f.p.x)*mix+(f.b.x+(next.b.x-f.b.x)*mix)*w+(f.n.x+(next.n.x-f.n.x)*mix)*offset;
          const fy=f.p.y+(next.p.y-f.p.y)*mix+(f.b.y+(next.b.y-f.b.y)*mix)*w+(f.n.y+(next.n.y-f.n.y)*mix)*offset+f.lift+(next.lift-f.lift)*mix;
          const fz=f.p.z+(next.p.z-f.p.z)*mix+(f.b.z+(next.b.z-f.b.z)*mix)*w+(f.n.z+(next.n.z-f.n.z)*mix)*offset;
          const pulled=grip[i]*hold;
          const rx=rest[i*3]+(gripX-rest[i*3])*tug.gather*pulled,rz=rest[i*3+2]+(gripZ-rest[i*3+2])*tug.gather*pulled;
          const ry=rest[i*3+1]+.022*ripple*Math.sin(10*Math.hypot(rx-centre.x,rz-centre.z)-16*t)-tug.depth*pulled;
          const x=rx+(fx-rx)*b,y=ry+(fy-ry)*b,z=rz+(fz-rz)*b;
          p.setXYZ(i,x,y,z);
          if((!overTable&&cloth.layers.isEnabled(1))||(watching&&!hidden)) {
            probe.set(x,y,z).project(camera);
            overTable||=probe.y<far&&probe.x<right;
            hidden||=Math.abs(probe.x-contact.x)<around[0]&&Math.abs(probe.y-contact.y)<around[1];
          }
        }
        p.needsUpdate=true;clothGeometry.computeVertexNormals();
        // The portal loses its grip, and reacts where the cloth left it.
        if(watching&&(!hidden||t>1.6)) {
          struck=true;window.portalImpact?.({x:gripX/(2*ax)+.5,y:gripZ/(2*az)+.5,strength});
        }
        if(cloth.layers.isEnabled(1)&&b>.95&&!overTable) cloth.layers.set(0);
        if(!released&&t>1.4){released=true;resolve(true);}
        if(sigma-Lc>length+.5) {
          clothMotion=null;airborne=false;cloth.visible=false;cloth.layers.set(1);invalidate();
          if(!released) resolve(true);
          return;
        }
        invalidate();requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  window.portalCloth={
    get design(){return {...ritualCloth.tuning};},
    // Still lying on the table (neither flown off nor put away).
    get covered(){return cloth.visible&&!airborne;},
    // Drag offset as fractions of the cloth's on-screen size.
    pull(fx,fz) {
      if(clothMotion||!cloth.visible) return;
      hemHeld=true;
      const [W,D]=clothSize();drape.ox=fx*W;drape.oz=fz*D;lay();invalidate();
    },
    // A short pull lets the heavy cloth settle back where it lay.
    settle() {
      hemHeld=false;
      const fromX=drape.ox,fromZ=drape.oz;
      return animateCloth(420,t=>{const e=1-(1-t)**3;drape.ox=fromX*(1-e);drape.oz=fromZ*(1-e);});
    },
    // Releases the cloth from wherever it was pulled to: it flies off up the
    // stair (flyAway). Resolves once it has lifted clear of the table, while
    // the flight goes on, so the portal can wake meanwhile.
    slideOff(dx=0,dz=1,instant=false) {
      hemHeld=false;
      if(instant||matchMedia('(prefers-reduced-motion: reduce)').matches) {
        clothMotion=null;cloth.visible=false;setGlow(1);invalidate();return Promise.resolve(true);
      }
      return flyAway(glow);
    },
    reset() {
      clothMotion=null;airborne=false;hemHeld=false;drape.ox=drape.oz=0;cloth.visible=true;cloth.layers.set(1);
      clothMaterial.opacity=1;tugLight.intensity=0;setGlow(0);lay();invalidate();
    },
  };
  // This module loads late; the intro may already have uncovered the table.
  if(!document.body.classList.contains('table-covered')){cloth.visible=false;setGlow(1);}

  // The crafted table shares the room's lights and shadow map. Its actual
  // geometry replaces the old invisible rectangular slab/thin-leg proxies.
  const artifact=createRitualTable(THREE,woodMap);scene.add(artifact.group);
  const voidMask=new THREE.Mesh(new THREE.CircleGeometry(1,64),new THREE.MeshBasicMaterial({color:'#010207',side:THREE.DoubleSide}));
  voidMask.name='portal room-occlusion mask';voidMask.rotation.x=-Math.PI/2;
  voidMask.position.y=view.tableHeight-.002;voidMask.renderOrder=10;scene.add(voidMask);
  function refreshTable() {
    const table=document.querySelector('.portal-table');
    const u=view.units,w=table.clientWidth/u,d=table.clientHeight/u;
    // The architecture must never show its floor through the magical opening.
    // This featureless mask only excludes the room behind the aperture; all
    // visible walls, fog, stars and parallax remain in the existing CSS volume.
    const shape=window.portalTable.geometry;
    voidMask.scale.setScalar(shape.radius/u);
    const x=(table.offsetLeft+table.clientWidth/2-view.width/2)/u;
    const z=(table.offsetTop+table.clientHeight/2-view.height/2)/u;
    artifact.update(shape,view);
    teal.position.x=-view.width/u*.44;purple.position.x=view.width/u*.44;
    Object.assign(drape,{hx:w/2,hz:d/2,x,z});
    const changed=ritualCloth.update(w,d);lay();
    if(changed||!clothAspect) repaintCloth();
  }
  // The CSS table always paints over the room canvas, so furniture between the
  // viewer and the table (layer 1) renders into a transparent canvas stacked
  // above the table and below the held cards. It shares the camera and every
  // light, without a shadow map of its own.
  const frontHost=document.getElementById('roomFront'),frontCanvas=document.getElementById('roomFrontCanvas');
  let front=null,frontLost=false;
  try {
    front=new THREE.WebGLRenderer({canvas:frontCanvas,alpha:true,antialias:true,powerPreference:'low-power'});
    front.outputColorSpace=THREE.SRGBColorSpace;
    front.toneMapping=THREE.ACESFilmicToneMapping;front.toneMappingExposure=renderer.toneMappingExposure;
    front.setClearColor(0x000000,0);
  } catch {front=null;}
  // Every light also lights the foreground layer and the lamps' breathing glass.
  scene.traverse(object=>{if(object.isLight){object.layers.enable(1);object.layers.enable(lamps.breathLayer);}});
  // Register the aura's dormant lights before the first render. Adding them
  // later changes NUM_POINT_LIGHTS and recompiles every lit room material.
  // They light the room and the lamps' glass pass (redrawn alone as it
  // breathes, with the same lights as the full frame, so it shares the
  // glass's program instead of compiling a second one just after the room
  // appears), never the foreground layer.
  const auraLights=[new THREE.PointLight('#45d9b3',0,2.7,2),new THREE.PointLight('#9560d8',0,2.6,2)];
  auraLights.forEach((light,i)=>{light.name='portal aura '+(i?'violet':'jade');light.layers.enable(lamps.breathLayer);scene.add(light);});
  frontCanvas.addEventListener('webglcontextlost',event=>{event.preventDefault();frontLost=true;frontHost.classList.remove('is-ready');});
  frontCanvas.addEventListener('webglcontextrestored',()=>{frontLost=false;invalidate();});
  let pending=false, lost=false, layoutKey='', shadowsStale=true;
  // Nothing is drawn until the warm-up (end of this block) has compiled the
  // shaders: the room and its foreground appear together, whole.
  let warmed=false,shown=false;
  const sizeKey=()=>[innerWidth,innerHeight,view.width,view.height,view.units,devicePixelRatio,
    ...Object.values(window.portalTable.geometry).slice(0,3)].join(':');
  // cameraOnly: nothing in the room moved, so the shadow maps stay as they are.
  function invalidate(cameraOnly=false) {
    if(!cameraOnly) shadowsStale=true;
    if(!pending&&!document.hidden&&!lost){pending=true;requestAnimationFrame(draw);}
  }
  function draw() {
    pending=false;if(document.hidden||lost||!warmed)return;
    // The camera moves physically (scene-camera.js), never the room's scale.
    camera.fov=view.fov;
    camera.aspect=innerWidth/innerHeight;camera.position.set(view.x,view.eyeHeight,view.distance);
    camera.rotation.set(-view.tilt,view.camera.yaw*Math.PI/180,0,'YXZ');
    renderer.shadowMap.needsUpdate=shadowsStale;shadowsStale=false;
    camera.setViewOffset(innerWidth,innerHeight,0,innerHeight*.5-view.originY,innerWidth,innerHeight);
    camera.updateProjectionMatrix();camera.updateMatrixWorld();
    camera.layers.set(0);renderer.render(scene,camera);host.classList.add('is-ready');
    // The table model now stands in the drawn room: the CSS table's top and
    // feet step aside (until then they stand in for it, whole).
    const screenEl=document.getElementById('screen');
    if(!screenEl.classList.contains('has-table-model')) screenEl.classList.add('has-table-model');
    // The approach ends in this chair: the eye descends over its backrest into
    // the seat, and the chair slides out of frame on its own. Narrow viewports
    // must seat the camera further back to fit the table; there the chair
    // would stand in front of the seated eye, so it fades out on the way in.
    const behind=view.seatedDistance-view.seated.distance>.3;
    const presence=behind?Math.min(1,Math.max(0,(.8-view.approach)/.3)):1;
    chair.visible=presence>0;
    // Where it stands (scene-camera.js): pushed back and turned, until the
    // visitor draws it in to sit.
    const pose=view.chairPose;chair.position.set(pose.x,0,pose.z);chair.rotation.y=pose.yaw;
    for(const m of [chairWood,velvet]) if(m.opacity!==presence) {
      m.transparent=presence<1;m.depthWrite=presence>=1;m.opacity=presence;m.needsUpdate=true;
    }
    // The trails a walk follows stay to lead it; the one it turns away from
    // thins. The chair's thins away as the visitor sits down.
    // - From the entry to the shelf, the chair's thins at once and the
    //   nook's stays, only a little quieter once they stand there.
    // - From the entry to the chair, the nook's thins.
    // - From the shelf, the chair's gathers again as they set off back along
    //   the trunk, and the nook's thins once they have left it.
    const eased=(v,from,to)=>{const t=Math.min(1,Math.max(0,(v-from)/(to-from)));return t*t*(3-2*t);};
    const {from:legFrom,to:legTo,progress:p}=view.leg;
    const [nook,chairWay]=legTo==='shelf'?[1-.15*eased(p,.6,1),1-eased(p,.05,.4)]
      :legFrom==='shelf'?[1-eased(p,.55,.75),eased(p,0,.2)*(1-eased(p,.85,.98))]
      :[1-eased(p,.05,.4),1-eased(p,.75,.95)];
    smoke.setPresence('to the study nook',nook);smoke.setPresence('gathering at the nook',nook);
    // At the door the mist stays while either trail leaves from it.
    smoke.setPresence('gathering at the door',Math.max(nook,chairWay));
    smoke.setPresence('into the chair',chairWay);
    // The places to stand: the entry's and the shelf's eyes, and beside the
    // chair at the branch's end. Each mark is hidden underfoot and as the
    // visitor sits down, and clear where they can go.
    const eye=[view.x,view.distance],sitting=1-eased(view.approach,.5,.85);
    for(const [name,at] of [['entry',[view.points.entry.position[0],view.points.entry.position[2]]],
      ['shelf',[view.points.shelf.position[0],view.points.shelf.position[2]]],['chair',branch[branch.length-1]]])
      smoke.setMark(name,{at,presence:eased(Math.hypot(eye[0]-at[0],eye[1]-at[1]),.5,1.4)*sitting});
    if(!smoke.group.visible) smokeShown=false;
    if(stillMotion.matches) smoke.update(0);
    renderFront();
    // Ready (site-ready.js) two frames after the first full one, so nothing
    // that frame leaves behind lands after the visitor is in.
    if(!shown){shown=true;requestAnimationFrame(()=>requestAnimationFrame(()=>window.siteReadiness?.done('room')));}
  }
  function renderFront() {
    if(!front||frontLost||!warmed) return;
    // Without the room's background colour, so only the chair and cloth are opaque.
    const background=scene.background;scene.background=null;camera.layers.set(1);
    front.render(scene,camera);
    scene.background=background;camera.layers.set(0);frontHost.classList.add('is-ready');
  }
  // The inscription's glow breathes and drifts, and the hem sways, while the
  // cloth lies on the table. Only the foreground layer redraws for it, at about
  // 30 fps; in its flight the cloth is redrawn with the room anyway (and moved
  // by the flight alone). Still for reduced motion.
  // The smoke drifts in the same pulse, and grows in from the visitor's feet
  // whenever it appears after being gone: on arriving, and back at the entry
  // after sitting down (whole at once under reduced motion).
  const stillMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let lastPulse=0,smokeShown=false,smokeSince=0;
  function smokeReveal(now) {
    if(!smokeShown){smokeShown=true;smokeSince=now;}
    return Math.max(0,(now-smokeSince-600)/1000*1.6);
  }
  // Behind the loading gate it has long grown in; it grows in again as the
  // visitor comes through (loading-gate.js). Taken back while the gate is
  // still opaque, so the room shows without it when the gate thins.
  addEventListener('site-entering',()=>{
    smokeShown=false;
    if(smoke.group.visible&&!stillMotion.matches&&!lost){smoke.update(performance.now()/1000,0);renderFront();}
  });
  // A mark lights up while its place is pointed at or focused (script.js),
  // easing in over about a quarter of a second; at once for reduced motion.
  const markHover={entry:{now:0,want:0},shelf:{now:0,want:0},chair:{now:0,want:0}};
  function hoverMark(name,on){
    const mark=markHover[name];if(!mark)return;
    mark.want=on?1:0;
    if(stillMotion.matches){mark.now=mark.want;smoke.setMark(name,{hover:mark.now});invalidate(true);}
  }
  // A new place, or a walk setting off: nothing stays lit from before.
  addEventListener('room-navigation',()=>{for(const name in markHover) hoverMark(name,false);});
  // ---- The shelf's objects (tools-shelf.js, TOOLS_INTEGRATION.md): Figma in
  // enamel, the grimoire and the crystal ball, standing on the nook's shelf
  // (its top at 1.4375 m), facing into the room. They answer the pointer and
  // move on the pulse below at 30 Hz, but only while the eye is near enough
  // to see them (`shelfNear` m); further off they hold still and the room
  // stays drawn on demand. Their sound is off until the corner toggle.
  const shelfRoot=new THREE.Group();shelfRoot.name='physical shelf tools';
  shelfRoot.position.set(nook.back+.13,nook.shelf+.0175,nook.z);
  shelfRoot.rotation.y=Math.PI/2;shell.add(shelfRoot);
  const shelfSound=createShelfSound(),toolOptions={camera,reducedMotion:()=>stillMotion.matches,sound:shelfSound};
  const shelfTools=[createFigmaObject(toolOptions),createGrimoireObject(toolOptions),createCrystalBallObject(toolOptions)];
  shelfTools.forEach((tool,i)=>{tool.group.position.x=(i-1)*.48;tool.group.userData.shelfToolIndex=i;shelfRoot.add(tool.group);});
  const shelfPointer=new THREE.Vector2(4,4),shelfRay=new THREE.Raycaster(),shelfCentre=new THREE.Vector3(),shelfNear=4.5;
  let shelfAt=0,shelfShadowAt=0,shelfAwakeUntil=0,shelfHover=-1;
  const wakeShelf=()=>{shelfAwakeUntil=performance.now()+1200;};
  addEventListener('pointermove',event=>{if(aimAtCentre){shelfPointer.set(0,0);wakeShelf();return;}
    const r=canvas.getBoundingClientRect();
    shelfPointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);wakeShelf();},{capture:true});
  addEventListener('blur',()=>{shelfPointer.set(4,4);wakeShelf();});
  document.documentElement.addEventListener('pointerleave',()=>{shelfPointer.set(4,4);wakeShelf();});
  addEventListener('scene-camera-change',wakeShelf);stillMotion.addEventListener('change',wakeShelf);
  // Their moving shadows only matter to a light whose shadow camera can see
  // them. None can where they stand (the door's, the moon's and the table's
  // all look elsewhere), so their motion leaves the shadow maps alone;
  // checked as they move, should a light or the shelf be moved.
  const shadowLights=[],shelfCasters=[];
  scene.traverse(o=>{if(o.isLight&&o.castShadow)shadowLights.push(o);});
  shelfRoot.traverse(o=>{if(o.isMesh&&o.castShadow)shelfCasters.push(o);});
  const shelfCastsShadow=()=>shadowLights.some(light=>{light.shadow.updateMatrices(light);
    const frustum=light.shadow.getFrustum();return shelfCasters.some(mesh=>frustum.intersectsObject(mesh));});
  function tickShelfTools(now) {
    if(document.hidden||lost||!host.classList.contains('is-ready')){shelfAt=now;return;}
    if(now-shelfAt<33) return;
    const dt=shelfAt?Math.min((now-shelfAt)/1000,.1):1/30;shelfAt=now;
    shelfRoot.getWorldPosition(shelfCentre);
    if(camera.position.distanceTo(shelfCentre)>shelfNear&&shelfHover<0) return;
    shell.updateWorldMatrix(true,true);camera.updateWorldMatrix(true,false);
    shelfRay.setFromCamera(shelfPointer,camera);
    const hit=shelfRay.intersectObject(shelfRoot,true).find(hit=>hit.object.isMesh&&hit.object.visible);
    let node=hit?.object;while(node&&node.userData.shelfToolIndex===undefined) node=node.parent;
    const index=node?.userData.shelfToolIndex??-1;
    if(index!==shelfHover){shelfHover=index;shelfTools.forEach((tool,i)=>tool.setHover(i===index));wakeShelf();}
    if(stillMotion.matches&&now>shelfAwakeUntil) return;
    shelfTools.forEach(tool=>tool.update(now/1000,dt));
    // A full room redraw; the shadow maps refreshed, at most 8 times a
    // second, only if a shadow camera can see the objects.
    const refreshShadows=now-shelfShadowAt>125&&shelfCastsShadow();if(refreshShadows) shelfShadowAt=now;
    invalidate(!refreshShadows);
  }
  // The sound toggle (index.html, top right): off by default, the choice
  // remembered; audio starts only from a click, as browsers require.
  const soundButton=document.getElementById('roomSound');let soundOn=false;
  try{soundOn=localStorage.getItem('shelf-tools-sound')==='on';}catch{}
  const showSound=()=>{soundButton.setAttribute('aria-pressed',String(soundOn));
    soundButton.setAttribute('aria-label',soundOn?'Lyd er på. Slå av lyd':'Lyd er av. Slå på lyd');soundButton.title=soundOn?'Lyd på':'Lyd av';};
  if(soundButton){
    soundButton.hidden=false;showSound();
    soundButton.addEventListener('click',()=>{soundOn=!soundOn;shelfSound.setEnabled(soundOn);showSound();
      try{localStorage.setItem('shelf-tools-sound',soundOn?'on':'off');}catch{}});
    if(soundOn) addEventListener('pointerdown',()=>{if(soundOn&&!shelfSound.enabled) shelfSound.setEnabled(true);},{once:true});
  }
  function pulse(now) {
    requestAnimationFrame(pulse);
    tickShelfTools(now);
    const smoking=smoke.group.visible;
    // Unseen behind the loading gate, the drift waits (loading-gate.js).
    if((!cloth.visible&&!smoking)||document.hidden||lost||stillMotion.matches||window.loadingGate?.veiled||now-lastPulse<33) return;
    const dt=Math.min(.1,(now-lastPulse)/1000);
    lastPulse=now;
    for(const [name,mark] of Object.entries(markHover)) if(mark.now!==mark.want) {
      mark.now+=(mark.want-mark.now)*(1-Math.exp(-dt/.08));
      if(Math.abs(mark.want-mark.now)<.002) mark.now=mark.want;
      smoke.setMark(name,{hover:mark.now});
    }
    if(cloth.visible){inscription.uTime.value=now/1000;if(!airborne&&!clothMotion) stirHem(now);}
    if(smoking) smoke.update(now/1000,smokeReveal(now));
    if(cloth.layers.isEnabled(1)||smoking) renderFront();
  }
  requestAnimationFrame(pulse);
  // ---- The night outside is alive: cloud drifting over the moon, mist in
  // the valleys, the lake's glitter, fireflies, and the moonlight coming in
  // dimming a little whenever cloud crosses the moon. Only the part of the
  // room that changes is redrawn for it, about 24 times a second: the alcove
  // window and the moonbeam it sends in, with the shadow maps left as they
  // are; the rest of the canvas keeps its last full frame. Still for reduced
  // motion.
  const windowPoints=(()=>{
    const points=[],add=(x,y,z)=>points.push(new THREE.Vector3(x,y,z));
    for(const x of [aperture.x-aperture.halfWidth-.12,aperture.x+aperture.halfWidth+.12])
      for(const y of [aperture.sill-.12,aperture.peak+.12]) for(const z of [aperture.z-T,aperture.z+.35]) add(x,y,z);
    // The glow inside the window, and the beams down to the floor.
    for(const x of [-.7,.7]) for(const y of [-1.1,1.1]) add(windowHaze.position.x+x,windowHaze.position.y+y,windowHaze.position.z);
    for(const beam of beams) if(beam.veiled) for(const end of [beam.from,beam.to]) for(const d of [-beam.r1,beam.r1])
      add(end[0]+d,end[1]+d,end[2]+d);
    return points;
  })();
  const windowCorner=new THREE.Vector3();
  // The window's part of the canvas, in CSS px from the lower left; null off screen.
  function windowRect() {
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(const point of windowPoints) {
      windowCorner.copy(point);shell.localToWorld(windowCorner).project(camera);
      if(windowCorner.z<-1||windowCorner.z>1) continue;
      const x=(windowCorner.x+1)*innerWidth/2,y=(1-windowCorner.y)*innerHeight/2;
      x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
    }
    x0=Math.max(0,Math.floor(x0)-8);y0=Math.max(0,Math.floor(y0)-8);
    x1=Math.min(innerWidth,Math.ceil(x1)+8);y1=Math.min(innerHeight,Math.ceil(y1)+8);
    return x1>x0&&y1>y0?[x0,innerHeight-y1,x1-x0,y1-y0]:null;
  }
  let outsideAt=0;
  function liveOutside(now) {
    requestAnimationFrame(liveOutside);
    if(document.hidden||lost||pending||!host.classList.contains('is-ready')||stillMotion.matches||window.loadingGate?.veiled||now-outsideAt<40) return;
    outsideAt=now;night.update(now/1000);
    const light=1-.42*night.veil();
    lightInAir.uniforms.uMoonlight.value=dustMaterial.uniforms.uMoonlight.value=light;
    dustMaterial.uniforms.uTime.value=now/1000;windowHaze.material.opacity=.065*windowLight.haze*light;
    const rect=windowRect();if(!rect) return;
    renderer.setScissorTest(true);renderer.setScissor(...rect);
    camera.layers.set(0);renderer.render(scene,camera);
    renderer.setScissorTest(false);
  }
  requestAnimationFrame(liveOutside);
  // ---- The lamps breathe: very slow, irregular swells of their glass, each
  // at its own pace (room-lamps.js). Their light on the room stays still, so
  // about 12 times a second only the glass is drawn again, over the kept
  // frame and tested against its kept depth (the canvas keeps both): one
  // draw call, no clearing, nothing else redrawn. The halos are additive
  // and would pile up, so they follow the breath whenever the room is drawn
  // in full. Nothing is drawn while no lamp is on screen. Still for reduced
  // motion.
  const lampCorner=new THREE.Vector3(),lampOffsets=[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>[x,y,z])));
  function lampRect({points,pad}) {
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(const point of points) for(const [ox,oy,oz] of lampOffsets) {
      lampCorner.set(point.x+ox*pad,point.y+oy*pad,point.z+oz*pad);shell.localToWorld(lampCorner).project(camera);
      if(lampCorner.z<-1||lampCorner.z>1) continue;
      const x=(lampCorner.x+1)*innerWidth/2,y=(1-lampCorner.y)*innerHeight/2;
      x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
    }
    x0=Math.max(0,Math.floor(x0)-4);y0=Math.max(0,Math.floor(y0)-4);
    x1=Math.min(innerWidth,Math.ceil(x1)+4);y1=Math.min(innerHeight,Math.ceil(y1)+4);
    return x1>x0&&y1>y0?[x0,innerHeight-y1,x1-x0,y1-y0]:null;
  }
  let lampsAt=0;
  function liveLamps(now) {
    requestAnimationFrame(liveLamps);
    if(document.hidden||lost||pending||!host.classList.contains('is-ready')||stillMotion.matches||window.loadingGate?.veiled||now-lampsAt<80) return;
    lampsAt=now;
    if(!lamps.clusters.some(cluster=>lampRect(cluster))) return;
    lamps.update(now/1000);
    // A colour background would clear the canvas even without autoClear.
    const background=scene.background;scene.background=null;renderer.autoClear=false;
    camera.layers.set(lamps.breathLayer);renderer.render(scene,camera);
    camera.layers.set(0);renderer.autoClear=true;scene.background=background;
  }
  requestAnimationFrame(liveLamps);
  function resize() {
    layoutKey=sizeKey();
    const ratio=Math.min(devicePixelRatio,1.5,Math.sqrt(2600000/(innerWidth*innerHeight)));
    renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight,false);
    if(front){front.setPixelRatio(ratio);front.setSize(innerWidth,innerHeight,false);}
    // Dust mote size in device pixels per metre at unit distance.
    dustMaterial.uniforms.uFocal.value=innerHeight*ratio/2/Math.tan(view.fov*Math.PI/360);night.setFocal(dustMaterial.uniforms.uFocal.value);
    lamps.setFocal(dustMaterial.uniforms.uFocal.value);
    refreshTable();invalidate();
  }
  // A dolly frame only changes the projection; geometry and canvas allocation
  // are refreshed only when the viewport or responsive table dimensions change.
  addEventListener('scene-camera-change',()=>{if(sizeKey()!==layoutKey)resize();else invalidate(true);});
  new MutationObserver(()=>invalidate()).observe(stage,{attributes:true,attributeFilter:['class','data-approach']});
  document.addEventListener('visibilitychange',()=>invalidate());
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;host.classList.remove('is-ready');document.getElementById('screen').classList.remove('has-table-model');});
  canvas.addEventListener('webglcontextrestored',()=>{lost=false;resize();});
  // Used by the local geometry/registration check and dev inspection.
  // hem: the cloth hem wave's parameters, live-tunable from the console.
  let aimAtCentre=false;
  // The plan the first-person walker keeps to (first-person.js): plan
  // coordinates are the scene's with z + placement.forward (the shell sits at
  // -placement.forward). well: the stair's angles (from its foot, radians)
  // over which the tower's upper floor is open to the flight below.
  const fromFoot=a=>((stair.from-a)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
  const walk={forward:placement.forward,apothem,bayHalf:chamber.hw,
    bays:chamber.bays.map(({kind,theta,open})=>({kind,cos:Math.cos(theta),sin:Math.sin(theta),
      halfWidth:open.halfWidth,depth:open.depth??0})),
    tower:{x:tower.x,z:tower.z,r:tower.r},
    stair:{from:stair.from,step:stair.step,rise:stair.rise,inner:stair.inner,count:stair.count},
    columns:Array.from({length:sides},(_,i)=>{
      const at=chamberTuning.apothem/Math.cos(Math.PI/sides)-.07,angle=-Math.PI/2-Math.PI/sides+i*2*Math.PI/sides;
      return [at*Math.cos(angle),at*Math.sin(angle)];
    }),
    column:.23,table:Math.max(view.tableWidthPx,view.tableDepthPx)/(2*view.units),
    gallery:chamberTuning.gallery,well:[fromFoot(well.to),stair.count*stair.step]};
  window.studyRoom={camera,scene,renderer,front,chair,shell,placement,hem,table:artifact,smoke,hoverMark,auraLights,walk,
    shelfHover:()=>shelfHover,
    aimCentre(enabled){
      aimAtCentre=enabled;
      if(enabled)shelfPointer.set(0,0);else shelfPointer.set(4,4);
      wakeShelf();
    },
    // The chamber's extents in scene (table-relative) coordinates: height is
    // the vault's springing, back the window's wall, front the door's. The
    // door and the nook (scene) place their targets and checks; the plan
    // objects after them (window, tower, chamber) are in plan coordinates.
    dimensions:{apothem,sides,wall:T,height:H,apex:chamberTuning.apex,
      back:aperture.z-placement.forward,front:door.z-placement.forward,left:nook.x,right:-nook.x},
    door:{x:door.x,z:door.z-placement.forward,halfWidth:door.halfWidth,shoulder:door.shoulder,peak:door.peak},
    nook:{x:nook.x,back:nook.back,z0:nook.z-nook.halfWidth-placement.forward,z1:nook.z+nook.halfWidth-placement.forward,top:nook.peak,shelf:nook.shelf},
    window:aperture,tower,chamber:{stats:chamber.stats,tuning:chamberTuning},
    architecture:{get tuning(){return {...architectureTuning};},stats:architecture.stats,
      source:{position:presence.position.toArray(),target:presence.target.position.toArray(),wellHeight:wellY}},
    project(x,y,z){const p=new THREE.Vector3(x,y,z).project(camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};},
    clay(enabled){materials.forEach((m,i)=>{m.map=enabled?null:textured[i].map;if(m===stone)m.bumpMap=enabled?null:stoneMap;m.color.copy(enabled?new THREE.Color('#686460'):textured[i].color);m.needsUpdate=true;});boards.material=wood;invalidate();},
    // The room's light balance ("Room lighting balance"), read or tuned live.
    lighting:{get values(){return {...lighting};},configure(values={}) {
      for(const [key,value] of Object.entries(values)) if(Object.hasOwn(lighting,key)&&Number.isFinite(value))
        lighting[key]=Math.max(0,key==='tableAwake'?Math.min(1,value):value);
      hemisphere.intensity=lighting.fill;ambient.intensity=lighting.ambient;warm.intensity=lighting.lamp;
      frontFill.intensity=lighting.front;applyGlow();invalidate();return {...lighting};}},
    // The chamber's warm lamps ("The chamber's own warm light"), read or tuned
    // live: lantern and sconces, in candela.
    chamberLight:{get values(){return {...chamberLight};},configure(values={}) {
      for(const [key,value] of Object.entries(values)) if(Object.hasOwn(chamberLight,key)&&Number.isFinite(value)) chamberLight[key]=Math.max(0,value);
      vaultLight.intensity=chamberLight.lantern;sconceLights.forEach(light=>light.intensity=chamberLight.sconces);invalidate();return {...chamberLight};}},
    // The painted sky ("The view out of the windows"), repainted live, and the
    // moonlight it sends in through the windows ("windowLight").
    sky:{get values(){return night.values;},configure(values={}){const result=night.configure(values);invalidate();return result;}},
    windowLight:{get values(){return {...windowLight};},configure(values={}) {
      for(const [key,value] of Object.entries(values)) if(Object.hasOwn(windowLight,key)&&Number.isFinite(value)) windowLight[key]=Math.max(0,value);
      moon.intensity=windowLight.intensity;windowHaze.material.opacity=.065*windowLight.haze;
      for(const [tint,base,ranges] of [[shaftGeometry.attributes.tint,shaftTint,moonShafts],[dustGeometry.attributes.tint,dustTint,moonDust]]) {
        for(const [from,to] of ranges) for(let i=from*3;i<to*3;i++) tint.array[i]=base[i]*windowLight.shafts;
        tint.needsUpdate=true;
      }
      invalidate();return {...windowLight};}},
    // The lamps (room-lamps.js): their lights, live-tunable with
    // studyRoom.lamps.configure({door:{intensity,distance,angle}, glow:{...},
    // shelf:{...}, stair:{...}}); shapes, places and colours are in lampTuning.
    lamps:{group:lamps.group,stats:lamps.stats,lights:lamps.lights,
      get values(){return Object.fromEntries(Object.entries(lamps.lights).map(([name,light])=>[name,
        {intensity:light.intensity,distance:light.distance,...(light.isSpotLight?{angle:light.angle,penumbra:light.penumbra}:{})}]));},
      configure(values={}) {
        for(const [name,settings] of Object.entries(values)) {
          const light=lamps.lights[name];if(!light) continue;
          for(const key of ['intensity','distance','angle','penumbra']) if(key in light&&Number.isFinite(settings[key])) light[key]=Math.max(0,settings[key]);
        }
        lighting.lamp=warm.intensity;lighting.front=frontFill.intensity;invalidate();return this.values;}},
    invalidate};
  window.firstPerson=createFirstPerson({camera:view,room:window.studyRoom,
    reducedMotion:()=>matchMedia('(prefers-reduced-motion: reduce)').matches});
  resize();
  // ---- Warm-up. Every shader the room and its foreground draw is compiled
  // before their first frame, off the main thread where the browser allows
  // it (KHR_parallel_shader_compile): the page keeps running meanwhile
  // instead of freezing for seconds inside the first frame, and the
  // foreground (cloth, chair, smoke) never shows over an empty room. Each
  // renderer compiles what it draws: the objects on its layer, lit by the
  // lights its frames see. Without the extension three.js cannot tell when
  // a program is ready, so the first frame compiles them itself, as before;
  // after 30 s the room shows regardless.
  const onLayer=n=>({traverse:fn=>scene.traverse(o=>{if(o.layers.isEnabled(n))fn(o);}),traverseVisible(){}});
  const warmUp=(target,n)=>{camera.layers.set(n);try{return target.compileAsync(onLayer(n),camera,scene);}finally{camera.layers.set(0);}};
  const parallel=renderer.extensions.has('KHR_parallel_shader_compile');
  Promise.race([parallel?Promise.all([warmUp(renderer,0),front&&warmUp(front,1)]):null,new Promise(done=>setTimeout(done,30000))])
    .catch(()=>{}).then(()=>{warmed=true;invalidate();});
}
