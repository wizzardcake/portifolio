import * as THREE from './vendor/three/three.module.js';
import {createRitualTable} from './table-model.js';
import {createRitualCloth} from './ritual-cloth.js';
import {createRoomArchitecture,architectureTuning} from './room-architecture.js';

// Architecture and physical furniture. Portal, orb and HTML reader stay in their
// own renderers; scene-camera.js gives both branches the same projection.
const host = document.getElementById('roomShell');
const canvas = document.getElementById('roomCanvas');
const view = window.sceneCamera;
const stage = document.getElementById('deviceTilt');
// Plan in metres, +Z toward the seated viewer. The main volume's back-right
// corner is replaced by a round tower, its back-left corner by a curve and a
// vaulted window alcove. Its open front lies behind every camera position,
// including the intro start on tall viewports, so the floor never ends in view.
const room = {left:-2.4, right:2.2, back:-2.6, front:7.2, height:2.45, wall:.30};
// The table (world origin) stands this far in front of the plan's origin, so
// the whole architecture is shifted back by it: clear floor behind the table.
const placement = {forward:1.3};
const corner = {x:-1.85, z:-2.05, r:.55};
// The turret continues above the room's ceiling; its stair leads up out of view.
const tower = {x:2.05, z:-2.0, r:1.35, height:4.3};
tower.mouthBack = -Math.PI + Math.asin((tower.z - room.back) / tower.r); // meets the back wall
tower.mouthRight = Math.acos((room.right - tower.x) / tower.r);          // meets the right wall
const alcove = {left:-1.65, right:-.35, back:-3.2, shoulder:1.65, peak:2.25};
alcove.x = (alcove.left + alcove.right) / 2; alcove.halfWidth = (alcove.right - alcove.left) / 2; alcove.sill = 0;
const aperture = {x:alcove.x, halfWidth:.42, sill:.50, shoulder:1.45, peak:2.0};
// Study nook: a wide, shallow basket-arched recess in the left wall with a
// built-in worktop and shelf; the warm, horizontal counterpart to the tower.
// back/front are plan Z; the arch springs at shoulder and rises by rise.
const nook = {back:-1.3, front:.8, depth:.45, shoulder:1.7, rise:.42, desk:.74, shelf:1.42};
// Spiral stair along the tower wall. Step i spans plan angles
// from - (i+1)*step .. from - i*step, so it starts on the right of the tower
// (as seen from the table) and climbs leftward across its back wall.
// soffit: depth of its smooth underside below the line through the nosings;
// cap/nosing: each nosing's thickness and how far it overhangs the riser.
const stair = {from:-12 * Math.PI / 180, step:10 * Math.PI / 180, rise:.19, inner:.62, count:14,
  soffit:.3, cap:.045, nosing:.028};
const tread = i => (i + 1) * stair.rise;
// Tall, narrow lancets stepped up with the stair: each sill clears the highest
// tread beneath its opening. They sit where the stair is still low, so its
// higher flight never covers them from the table.
const lancets = [-25, -50, -75].map(degrees => {
  const at = degrees * Math.PI / 180, halfWidth = .18;
  const sill = Math.round((tread(Math.floor((stair.from - at + halfWidth / tower.r) / stair.step)) + .18) * 100) / 100;
  return {at, halfWidth, sill, shoulder:sill + 1.5, peak:sill + 1.85};
});
const scene = new THREE.Scene();
scene.background = new THREE.Color('#16181d');
// Architecture and its lights, placed relative to the table. Pieces bound to
// the table itself (portal mask, contact shadow, under-table glow) stay in scene.
const shell = new THREE.Group();
shell.name = 'room shell'; shell.position.z = -placement.forward; scene.add(shell);
const camera = new THREE.PerspectiveCamera(view.fov,innerWidth/innerHeight,.035,24);
let renderer;
try {
  const options={antialias:true,alpha:false,powerPreference:'low-power'};
  const context=canvas.getContext('webgl2',options)||canvas.getContext('webgl',options);
  if(!context)throw new Error('WebGL unavailable');
  renderer = new THREE.WebGLRenderer({canvas,context,...options});
} catch {
  // A readable room silhouette also survives unavailable WebGL.
  host.classList.add('room-fallback');
}

if (renderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  let seed = 617;
  const random = () => ((seed = Math.imul(seed,1664525)+1013904223 >>> 0) / 4294967296);
  function texture(kind) {
    const image=document.createElement('canvas'); image.width=512; image.height=512;
    const ctx=image.getContext('2d');
    ctx.fillStyle=kind==='stone'?'#74716c':'#786047'; ctx.fillRect(0,0,512,512);
    if(kind==='stone') {
      for(let row=0;row<8;row++) for(let col=-1;col<5;col++) {
        const x=col*128+(row%2)*64, y=row*64;
        const v=102+Math.floor(random()*18);
        ctx.fillStyle=`rgb(${v+6},${v+4},${v})`; ctx.fillRect(x+2,y+2,124,60);
        ctx.fillStyle='#a09b8520';ctx.fillRect(x+3,y+3,121,2);
        ctx.fillStyle='#1c24252c';ctx.fillRect(x+3,y+59,121,3);
      }
      for(let i=0;i<21000;i++) {
        const x=random()*512,y=random()*512;
        ctx.fillStyle=random()>.5?'#ddd4be0b':'#0a111417';ctx.fillRect(x,y,1+random()*3,1+random()*2);
      }
    } else {
      for(let i=0;i<1800;i++) {
        const x=random()*512;
        ctx.strokeStyle=random()>.45?'#25190e24':'#e1ba8415';ctx.lineWidth=.3+random();
        ctx.beginPath();ctx.moveTo(x,0);ctx.bezierCurveTo(x+random()*10,140,x-random()*12,370,x,512);ctx.stroke();
      }
    }
    const map=new THREE.CanvasTexture(image);
    map.colorSpace=THREE.SRGBColorSpace; map.wrapS=map.wrapT=THREE.RepeatWrapping;
    map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    if(kind==='stone') map.repeat.set(.62,.62);
    return map;
  }
  const stoneMap=texture('stone'), woodMap=texture('wood');
  // Dressed stone for the spiral stair: the walls' tone and grain without their
  // coursing. It draws from its own seeded generator, so the shared one still
  // lays out the same planks, sky and cloth.
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
  const stone=new THREE.MeshStandardMaterial({color:'#c9c7c4',map:stoneMap,bumpMap:stoneMap,bumpScale:.012,roughness:1});
  const wood=new THREE.MeshStandardMaterial({color:'#a89980',map:woodMap,roughness:.94});
  const ceilingMaterial=new THREE.MeshStandardMaterial({color:'#7c756b',map:woodMap,roughness:1});
  const trim=new THREE.MeshStandardMaterial({color:'#969596',roughness:1});
  // The wood texture is itself dark; these tints are multiplied into it, so
  // they stay light enough for shadowed timber to read as wood, not black.
  const timber=new THREE.MeshStandardMaterial({color:'#a8876a',map:woodMap,roughness:.95});
  const stairStone=new THREE.MeshStandardMaterial({color:'#7f786e',roughness:.95});
  // The stair's own stone, as dark as the walls' once its texture is multiplied in.
  const stepStone=new THREE.MeshStandardMaterial({color:'#d6d1c8',map:dressedStone(),roughness:.9});
  const architecturalMetal=new THREE.MeshStandardMaterial({color:'#827354',metalness:.48,roughness:.58});
  const chairWood=new THREE.MeshStandardMaterial({color:'#8f6a4c',map:woodMap,roughness:.6});
  const velvet=new THREE.MeshStandardMaterial({color:'#23403a',roughness:.92});
  const materials=[stone,wood,ceilingMaterial,trim,timber,stairStone,chairWood,velvet,stepStone,architecturalMetal];
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

  const T=room.wall,H=room.height;
  const rightJoin=tower.z+Math.sqrt(tower.r**2-(room.right-tower.x)**2); // tower meets the right wall
  const backJoin=tower.x-Math.sqrt(tower.r**2-(room.back-tower.z)**2);   // tower meets the back wall
  // Floor extent along Z at plan position x: main room with its curved corner,
  // the alcove, and the tower circle.
  function footprint(x) {
    let back=Infinity,front=-Infinity;
    if(x>=room.left&&x<=room.right) {
      back=x<corner.x?corner.z-Math.sqrt(Math.max(0,corner.r**2-(x-corner.x)**2)):room.back;
      front=room.front;
    }
    if(x>=alcove.left&&x<=alcove.right) back=Math.min(back,alcove.back);
    if(x<room.left&&x>=room.left-nook.depth){back=Math.min(back,nook.back);front=Math.max(front,nook.front);}
    const dx=x-tower.x;
    if(Math.abs(dx)<=tower.r) {
      const s=Math.sqrt(tower.r**2-dx*dx);back=Math.min(back,tower.z-s);front=Math.max(front,tower.z+s);
    }
    return [back,front];
  }
  const east=tower.x+tower.r,west=room.left-nook.depth;
  mesh('floor substrate',block(east-west+T*2,.07,room.front-(tower.z-tower.r-T),
    (west+east)/2,-.06,(room.front+tower.z-tower.r-T)/2),
    new THREE.MeshStandardMaterial({color:'#151312',roughness:1}),false);
  // Each board runs to the outermost wall line across its width; the ragged
  // ends of curved rows disappear under the 30 cm walls.
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
  // Stone shell: straight left/right walls, a curved back-left corner, the
  // back wall with the alcove's pointed opening, the alcove vault, and the
  // round tower whose wall runs from the back wall around to the right wall.
  const alcoveOpening=shape=>{
    shape.lineTo(alcove.left,0);shape.lineTo(alcove.left,alcove.shoulder);
    shape.quadraticCurveTo(alcove.left,control(alcove),alcove.x,alcove.peak);
    shape.quadraticCurveTo(alcove.right,control(alcove),alcove.right,alcove.shoulder);
    shape.lineTo(alcove.right,0);return shape;
  };
  const backShape=alcoveOpening(new THREE.Shape().moveTo(corner.x,0));
  backShape.lineTo(backJoin,0);backShape.lineTo(backJoin,H);backShape.lineTo(corner.x,H);backShape.closePath();
  const vaultShape=alcoveOpening(new THREE.Shape().moveTo(alcove.left-T,0));
  vaultShape.lineTo(alcove.right+T,0);vaultShape.lineTo(alcove.right+T,alcove.peak+T);
  vaultShape.lineTo(alcove.left-T,alcove.peak+T);vaultShape.closePath();
  const extrude=(shape,depth,z,curveSegments=20)=>
    worldUV(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments}).translate(0,0,z));
  // The left wall is traced in (plan Z, height) and turned so its extrusion
  // runs outward (-X) from the inner face at x.
  const extrudeX=(shape,depth,x)=>worldUV(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:20})
    .rotateY(-Math.PI/2).translate(x,0,0));
  const nookOpening=shape=>{
    const rx=(nook.front-nook.back)/2;
    shape.lineTo(nook.back,0);shape.lineTo(nook.back,nook.shoulder);
    shape.absellipse(nook.back+rx,nook.shoulder,rx,nook.rise,Math.PI,0,true);
    shape.lineTo(nook.front,0);return shape;
  };
  const nookTop=nook.shoulder+nook.rise+T;
  const leftShape=nookOpening(new THREE.Shape().moveTo(corner.z,0));
  leftShape.lineTo(room.front,0);leftShape.lineTo(room.front,H);leftShape.lineTo(corner.z,H);leftShape.closePath();
  const nookShell=nookOpening(new THREE.Shape().moveTo(nook.back-T,0));
  nookShell.lineTo(nook.front+T,0);nookShell.lineTo(nook.front+T,nookTop);
  nookShell.lineTo(nook.back-T,nookTop);nookShell.closePath();
  const nookBack=new THREE.Shape().moveTo(nook.back-T,0);
  nookBack.lineTo(nook.front+T,0);nookBack.lineTo(nook.front+T,nookTop);
  nookBack.lineTo(nook.back-T,nookTop);nookBack.closePath();
  mesh('stone shell',merge([
    extrudeX(leftShape,T,room.left),
    extrudeX(nookShell,nook.depth-T,room.left-T),
    extrudeX(nookBack,T,room.left-nook.depth),
    worldUV(block(T,H,room.front-rightJoin,room.right+T/2,H/2,(room.front+rightJoin)/2)),
    arcWall({...corner,t:T,from:Math.PI,to:1.5*Math.PI,y1:H,steps:12}),
    extrude(backShape,T,room.back-T),
    extrude(vaultShape,room.back-T-alcove.back,alcove.back),
    arcWall({...tower,t:T,from:tower.mouthBack,to:tower.mouthRight,y1:tower.height,steps:56,openings:lancets}),
    // The tower rises above the main ceiling; this band closes it over the mouth.
    arcWall({...tower,t:T,from:tower.mouthRight,to:tower.mouthBack+2*Math.PI,y0:H,y1:tower.height,steps:20}),
    // Round piers mark both ends of the tower mouth.
    worldUV(new THREE.CylinderGeometry(.1,.12,H,20).translate(backJoin,H/2,room.back)),
    worldUV(new THREE.CylinderGeometry(.1,.12,H,20).translate(room.right,H/2,rightJoin)),
  ]),stone);
  // The alcove's end wall keeps the large pointed window.
  const windowShape=new THREE.Shape().moveTo(alcove.left-T,0);
  windowShape.lineTo(alcove.right+T,0);windowShape.lineTo(alcove.right+T,alcove.peak+T);
  windowShape.lineTo(alcove.left-T,alcove.peak+T);windowShape.closePath();
  windowShape.holes.push(arch(new THREE.Path(),aperture));
  mesh('back wall with through opening',extrude(windowShape,T,alcove.back-T,24),stone);

  // Shared carved profiles for the alcove, actual window reveals and curved
  // tower lancets. The same pointed tracery is carried into the stair rail.
  const radialAt=(at,rho)=>[tower.x+rho*Math.cos(at),tower.z+rho*Math.sin(at)];
  const architecture=createRoomArchitecture(THREE,{aperture,alcove,tower,lancets,stair,roomBack:room.back});
  mesh('stone trim',architecture.stone,trim);
  mesh('gothic bronze tracery',architecture.metal,architecturalMetal);

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
  const soffit=phi=>Math.max(0,pitch(phi)-stair.soffit);
  function step(i) {
    const {from:a,to:b}=stepAt(i),top=tread(i),lip=top-stair.cap,wall=tower.r+.05;
    const at=(phi,rho,y)=>new THREE.Vector3(tower.x+rho*Math.cos(phi),y,tower.z+rho*Math.sin(phi));
    // Toward the step below; the nosing stands a constant distance out that way.
    const front=new THREE.Vector3(-Math.sin(b),0,Math.cos(b)),nose=v=>v.addScaledVector(front,stair.nosing);
    const up=new THREE.Vector3(0,1,0),down=new THREE.Vector3(0,-1,0);
    // The soffit's own (helicoid) normal, so the underside shades as one surface.
    const lean=stair.rise/stair.step;
    const under=(phi,rho)=>soffit(phi)>0?new THREE.Vector3(lean*Math.sin(phi),-rho,-lean*Math.cos(phi)).normalize():down;
    const position=[],normal=[];
    // A quad wound to face `out`; flat-shaded unless given normals.
    const quad=(p,out,n)=>{
      const face=new THREE.Vector3().subVectors(p[1],p[0]).cross(new THREE.Vector3().subVectors(p[2],p[0]));
      if(face.dot(out)<0){p=[p[0],p[3],p[2],p[1]];n=n&&[n[0],n[3],n[2],n[1]];face.negate();}
      face.normalize();
      for(const k of [0,1,2,0,2,3]){const m=n?n[k]:face;position.push(p[k].x,p[k].y,p[k].z);normal.push(m.x,m.y,m.z);}
    };
    // The profile, from the back of the soffit round to the back of the tread.
    const profile=rho=>[at(a,rho,soffit(a)),at(b,rho,soffit(b)),at(b,rho,lip),nose(at(b,rho,lip)),nose(at(b,rho,top)),at(a,rho,top)];
    const [i0,i1,i2,i3,i4,i5]=profile(stair.inner),[w0,w1,w2,w3,w4,w5]=profile(wall);
    quad([i0,i1,w1,w0],down,[under(a,stair.inner),under(b,stair.inner),under(b,wall),under(a,wall)]);
    quad([i1,i2,w2,w1],front);quad([i2,i3,w3,w2],down);quad([i3,i4,w4,w3],front);quad([i4,i5,w5,w4],up);
    // The top step's back meets the landing; every other one hides under the next step.
    if(i===stair.count-1) quad([i5,i0,w0,w5],new THREE.Vector3(Math.sin(a),0,-Math.cos(a)));
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
  // Dressed stone: a low plinth where the other walls meet the floor.
  mesh('dressed stone',merge([
    arcWall({...corner,r:corner.r-proud,t:proud+.02,from:Math.PI,to:1.5*Math.PI,y1:plinth,steps:12}),
    block(proud,plinth,nook.back-corner.z,room.left+proud/2,plinth/2,(corner.z+nook.back)/2),
    block(proud,plinth,room.front-nook.front,room.left+proud/2,plinth/2,(nook.front+room.front)/2),
    block(alcove.left-corner.x,plinth,proud,(corner.x+alcove.left)/2,plinth/2,room.back+proud/2),
    block(backJoin-.12-alcove.right,plinth,proud,(alcove.right+backJoin-.12)/2,plinth/2,room.back+proud/2),
    block(proud,plinth,room.front-rightJoin-.12,room.right-proud/2,plinth/2,(rightJoin+.12+room.front)/2),
  ]),stairStone);

  // Dark timber: cross beams ending on a curved ring beam over the tower
  // mouth, radial tower rafters, the alcove mullion and the stair's handrail.
  const beamParts=[
    arcWall({...tower,r:tower.r-.1,t:.2,from:tower.mouthRight,to:tower.mouthBack+2*Math.PI,
      y0:H-.2,y1:H,bottom:true,steps:24}),
    new THREE.CylinderGeometry(.12,.12,.16,12).translate(tower.x,tower.height-.08,tower.z),
  ];
  // The nook's built-ins: a worktop at desk height with a thin apron, and
  // one shelf, both spanning between the arch's jambs.
  const nookZ=(nook.back+nook.front)/2,nookW=nook.front-nook.back-.02;
  beamParts.push(
    block(nook.depth+.07,.045,nookW,room.left-nook.depth/2+.035,nook.desk-.0225,nookZ),
    block(.03,.09,nookW,room.left+.055,nook.desk-.09,nookZ),
    block(.26,.035,nookW,room.left-nook.depth+.13,nook.shelf,nookZ));
  for(let z=-1.95;z<room.front-.2;z+=1.2) {
    const dz=z-tower.z,end=Math.abs(dz)<tower.r?tower.x-Math.sqrt(tower.r**2-dz*dz):room.right;
    beamParts.push(block(end-room.left+.1,.17,.16,(end+room.left-.1)/2,H-.085,z));
  }
  for(let i=0;i<6;i++) {
    const a=i*Math.PI/3+.3,[x,z]=radialAt(a,(tower.r+T/2)/2);
    beamParts.push(block(tower.r+T/2,.12,.1,x,tower.height-.06,z,-a));
  }
  // The warm handrail follows the same helix; its stone foot and open bronze
  // pointed bays are batched with the matching window dressings above.
  beamParts.push(architecture.handrail);
  // Upper floor inside the tower, one riser above the last step. Its stairwell
  // keeps headroom over the flight and clears the tall lancets, so the stair
  // visibly arrives at another level instead of ending in the wall.
  const well={from:stair.from-stair.count*stair.step,to:-40*Math.PI/180,inner:stair.inner-.06};
  const upper=new THREE.Shape().moveTo(tower.r*Math.cos(well.to),tower.r*Math.sin(well.to));
  upper.absarc(0,0,tower.r,well.to,well.from+2*Math.PI,false);
  upper.lineTo(well.inner*Math.cos(well.from),well.inner*Math.sin(well.from));
  upper.absarc(0,0,well.inner,well.from,well.to,false);
  upper.closePath();
  beamParts.push(new THREE.ExtrudeGeometry(upper,{depth:.12,bevelEnabled:false,curveSegments:24})
    .rotateX(Math.PI/2).translate(tower.x,tread(stair.count),tower.z));
  // Wall plates along both long walls carry the cross beams' ends.
  beamParts.push(block(.14,.14,room.front-corner.z,room.left+.07,H-.07,(room.front+corner.z)/2),
    block(.14,.14,room.front-rightJoin,room.right-.07,H-.07,(room.front+rightJoin)/2));
  mesh('timber beams',merge(beamParts),timber);

  // Ceilings: the main lid follows the room outline and stops at the tower
  // circle; the tower's own ceiling sits higher.
  const ceilingShape=new THREE.Shape().moveTo(room.left,room.front);
  ceilingShape.lineTo(room.right,room.front);ceilingShape.lineTo(room.right,rightJoin);
  ceilingShape.absarc(tower.x,tower.z,tower.r,tower.mouthRight,tower.mouthBack+2*Math.PI,false);
  ceilingShape.lineTo(corner.x,room.back);
  ceilingShape.absarc(corner.x,corner.z,corner.r,1.5*Math.PI,Math.PI,true);
  ceilingShape.closePath();
  mesh('ceiling',merge([
    new THREE.ShapeGeometry(ceilingShape,24).rotateX(Math.PI/2).translate(0,H,0),
    new THREE.CircleGeometry(tower.r+T,48).rotateX(Math.PI/2).translate(tower.x,tower.height,tower.z),
  ]),ceilingMaterial,false);

  // ---- The view out of the windows: a purple night sky painted on a wide
  // arc of a cylinder well outside the back wall and the tower, so each window
  // shows its own part of it, with real depth as the camera moves. The walls
  // hide it everywhere else. It is static: the room only redraws on change.
  // Heights are metres in the room; the horizon sits a little below the
  // seated eye, as seen from high up in a tower. Tunable:
  //   radius      metres from the room's centre to the painted sky
  //   horizon     height of the horizon on it (lower: more sky in the windows)
  //   brightness  multiplies the whole painted sky
  //   moon        [degrees around the room, metres high, disc radius in
  //               degrees]; from the chair the alcove window spans about
  //               186-197 degrees and -.4 to 3 m
  const sky={radius:12,horizon:.3,brightness:1,moon:[193,2.1,1.1],from:80,to:230,bottom:-6,top:10};
  function purpleSky() {
    const W=2048,Hc=1024,image=document.createElement('canvas');image.width=W;image.height=Hc;
    const g=image.getContext('2d');
    // Its own seeded random, so the room's other textures stay as they were.
    let seed=4217;const rnd=()=>(seed=seed*16807%2147483647)/2147483647;
    // Canvas x runs left to right as seen from inside; y from a height in metres.
    const yAt=h=>(sky.top-h)/(sky.top-sky.bottom)*Hc,xAt=degrees=>(sky.to-degrees)/(sky.to-sky.from)*W;
    const horizon=yAt(sky.horizon);
    const soft=(x,y,rx,ry,stops)=>{
      g.save();g.translate(x,y);g.scale(rx,ry);
      const glow=g.createRadialGradient(0,0,0,0,0,1);
      stops.forEach(([at,color])=>glow.addColorStop(at,color));
      g.fillStyle=glow;g.fillRect(-1,-1,2,2);g.restore();
    };
    // Night sky: deep indigo overhead, violet lower down, a lavender glow
    // along the horizon.
    const air=g.createLinearGradient(0,yAt(sky.top),0,horizon);
    air.addColorStop(0,'#08051a');air.addColorStop(.45,'#150b33');air.addColorStop(.72,'#2a1658');
    air.addColorStop(.9,'#4a2a86');air.addColorStop(1,'#7c52b4');
    g.fillStyle=air;g.fillRect(0,0,W,horizon+2);
    // Stars, thinning toward the horizon.
    for(let i=0;i<900;i++) {
      const y=rnd()*horizon*.92,fade=1-y/horizon,size=.6+rnd()*1.4*fade;
      g.fillStyle=`rgba(${220+rnd()*35|0},${210+rnd()*30|0},255,${(.15+rnd()*.6)*fade*fade})`;
      g.fillRect(rnd()*W,y,size,size);
    }
    // A faint aurora veil high up: teal thinning into violet.
    for(let i=0;i<46;i++) {
      const x=xAt(170)+(i/46)*(xAt(95)-xAt(170)),wave=Math.sin(i*.37)*38+Math.sin(i*.11+1)*60;
      soft(x,yAt(6.4)+wave,70,150,[[0,'#5fe6c02a'],[.5,'#5fbde01a'],[1,'#7d5fd000']]);
    }
    // Two or three vast, barely-there veils of colour, so the sky is not one
    // even gradient: a rose one low beside the moon, a blue one over the tower.
    soft(xAt(200),yAt(1.6),420,170,[[0,'rgba(214,110,200,.13)'],[1,'rgba(214,110,200,0)']]);
    soft(xAt(150),yAt(3.4),520,260,[[0,'rgba(90,120,240,.12)'],[1,'rgba(90,120,240,0)']]);
    soft(xAt(118),yAt(1.2),380,150,[[0,'rgba(170,90,230,.1)'],[1,'rgba(170,90,230,0)']]);
    // The moon, low in the upper left of the alcove window as seen from the
    // chair (tunable: sky.moon, in degrees around the room and metres high):
    // a wide soft glow, a faint halo ring, and the pale disc itself. It is
    // what shines in through that window.
    const moon={x:xAt(sky.moon[0]),y:yAt(sky.moon[1]),r:sky.moon[2]*W/(sky.to-sky.from)};
    soft(moon.x,moon.y,moon.r*16,moon.r*14,[[0,'#d8c4ff70'],[.25,'#a585e838'],[.6,'#7a55c416'],[1,'#5a3a9a00']]);
    soft(moon.x,moon.y,moon.r*5.2,moon.r*5.2,[[0,'#e6dcff00'],[.8,'#e6dcff00'],[.9,'#e6dcff1c'],[1,'#e6dcff00']]);
    soft(moon.x,moon.y,moon.r*2.4,moon.r*2.4,[[0,'#efe6ffb0'],[.42,'#d8c8ff60'],[1,'#b69cf000']]);
    soft(moon.x,moon.y,moon.r,moon.r,[[0,'#fbf7ff'],[.7,'#ece2ff'],[.9,'#dccdfff0'],[1,'#dccdff00']]);
    // A few soft grey-violet maria on its face.
    for(const [dx,dy,s] of [[-.3,-.2,.34],[.22,.15,.26],[.05,-.42,.2],[-.12,.38,.18]])
      soft(moon.x+dx*moon.r,moon.y+dy*moon.r,s*moon.r,s*moon.r,[[0,'rgba(150,130,190,.22)'],[1,'rgba(150,130,190,0)']]);
    // Cloud banks, each a cluster of soft puffs: dark violet bodies whose tops
    // catch the moonlight, brighter the nearer they drift to the moon. Kept
    // off the moon's own face so it reads clearly.
    for(let i=0;i<46;i++) {
      const cx=rnd()*W,h=sky.horizon+.4+rnd()*rnd()*4.6,cy=yAt(h),spread=60+rnd()*200,puffs=4+rnd()*5|0;
      if(Math.hypot(cx-moon.x,cy-moon.y)<moon.r*4) continue;
      for(let p=0;p<puffs;p++) {
        const x=cx+(rnd()-.5)*spread*2,y=cy+(rnd()-.5)*18,rx=34+rnd()*80,ry=rx*(.28+rnd()*.2);
        const lit=Math.max(0,1-Math.hypot(x-moon.x,(y-moon.y)*1.6)/(moon.r*26));
        soft(x,y,rx,ry,[[0,`rgba(24,12,48,${.4+rnd()*.25})`],[.65,'rgba(28,15,56,.18)'],[1,'rgba(28,15,56,0)']]);
        soft(x+rx*.06,y-ry*.5,rx*.72,ry*.5,[[0,`rgba(${150+lit*90|0},${118+lit*95|0},${215+lit*40|0},${.1+lit*.5})`],[1,'rgba(150,118,215,0)']]);
      }
    }
    // Haze where sky meets land.
    const haze=g.createLinearGradient(0,horizon-90,0,horizon+60);
    haze.addColorStop(0,'rgba(170,120,220,0)');haze.addColorStop(.6,'rgba(190,140,230,.32)');haze.addColorStop(1,'rgba(120,80,170,.1)');
    g.fillStyle=haze;g.fillRect(0,horizon-90,W,150);
    // Distant hills, paler with distance, mist between them, and a few tiny
    // warm lights far away.
    const ridge=(level,amplitude,phase,color)=>{
      g.beginPath();g.moveTo(0,Hc);
      for(let x=0;x<=W;x+=8) g.lineTo(x,yAt(level)-amplitude*(.55*Math.sin(x*.004+phase)+.3*Math.sin(x*.011+phase*2)+.15*Math.sin(x*.029+phase*3)));
      g.lineTo(W,Hc);g.closePath();g.fillStyle=color;g.fill();
    };
    ridge(sky.horizon-.05,34,1.3,'#2e1d4f');
    const mist=g.createLinearGradient(0,horizon,0,horizon+70);
    mist.addColorStop(0,'rgba(150,110,200,.16)');mist.addColorStop(1,'rgba(150,110,200,0)');
    g.fillStyle=mist;g.fillRect(0,horizon,W,70);
    ridge(sky.horizon-.35,26,4.1,'#1a1030');
    for(let i=0;i<9;i++) soft(xAt(150+rnd()*65),yAt(sky.horizon-.28-rnd()*.25),2.2,2.2,[[0,'#ffcf8ae0'],[1,'#ffb86000']]);
    ridge(sky.horizon-.9,20,2.2,'#0c0716');
    const map=new THREE.CanvasTexture(image);
    // Mirrored: the cylinder's inside is seen from its centre.
    map.colorSpace=THREE.SRGBColorSpace;map.wrapS=THREE.RepeatWrapping;map.repeat.x=-1;map.offset.x=1;
    map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    return map;
  }
  const outside=new THREE.Mesh(
    new THREE.CylinderGeometry(sky.radius,sky.radius,sky.top-sky.bottom,32,1,true,
      sky.from*Math.PI/180,(sky.to-sky.from)*Math.PI/180).translate(0,(sky.top+sky.bottom)/2,0),
    new THREE.MeshBasicMaterial({map:purpleSky(),side:THREE.BackSide,toneMapped:false,
      color:new THREE.Color().setScalar(sky.brightness)}));
  outside.name='sky outside the windows';shell.add(outside);

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

  // ---- Room lighting balance. The base fill stays low, so the lights below
  // shape the room: warm and close around the table and the study nook, cool
  // and further off at the window and the tower, the ceiling left to fall
  // into shadow. Intensities in three.js physical units; live-tunable with
  // studyRoom.lighting.configure({...}).
  const lighting={fill:.5,ambient:.06,lamp:11,front:1.2,table:9,tableAwake:.35};
  // A dim night sky from above and the warm floor's bounce from below.
  const hemisphere=new THREE.HemisphereLight('#8390c4','#4c3a2c',lighting.fill);scene.add(hemisphere);
  const ambient=new THREE.AmbientLight('#d8bc99',lighting.ambient);scene.add(ambient);
  // The study nook's lamp, hung inside the nook's mouth: the nook glows as a
  // warm pocket in the middle distance, and the wall nearest the viewer only
  // catches its light at a glance instead of being the brightest thing in view.
  const warm=new THREE.PointLight('#ffb468',lighting.lamp,7.5,2);warm.position.set(-2.1,1.5,-.1);shell.add(warm);
  // Moonlight still enters through the pointed window, now at the alcove's end.
  const moon=new THREE.SpotLight('#a0bcf4',28,9,.54,.75,1.7);
  moon.position.set(aperture.x,1.75,alcove.back-T/2);moon.target.position.set(-1.7,0,-1.4);
  moon.castShadow=true;moon.shadow.mapSize.set(1024,1024);moon.shadow.bias=-.001;moon.shadow.normalBias=.025;
  shell.add(moon,moon.target);
  const windowBounce=new THREE.PointLight('#91acd7',2.2,2.8,2);
  windowBounce.position.set(aperture.x,1.42,alcove.back+.24);shell.add(windowBounce);
  // The same cool window light inside the tower, so its lancets read at night.
  const towerBounce=new THREE.PointLight('#91acd7',2.2,3,2),[bounceX,bounceZ]=radialAt(lancets[1].at,.75);
  towerBounce.position.set(bounceX,lancets[1].sill+.3,bounceZ);shell.add(towerBounce);
  // A dim warm fill from the viewer's end of the room. Hemisphere and ambient
  // light are too weak alone there, which left the nearest beams pure black.
  // Hung well below the beams, so they fall off into shadow instead of
  // glowing orange at the top of the frame, and the chair's back still reads.
  const frontFill=new THREE.PointLight('#ffc58e',lighting.front,6,2);frontFill.position.set(0,1.55,4.3);shell.add(frontFill);
  const teal=new THREE.PointLight('#38bdae',4.4,3.5,2);teal.position.set(-.65,.23,.1);scene.add(teal);
  const purple=new THREE.PointLight('#8163b7',3,3.4,2);purple.position.set(.64,.24,.20);scene.add(purple);
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
  //   skyLight    the window light: lighter and bluer than the portal's violet,
  //               so sky, stair and portal each keep their own colour
  const upperGreen=architectureTuning.green,skyLight='#a79aff';
  // The window light is the sky's: the alcove's shadow-casting spot (its
  // window-shaped patch falls behind the table, toward the tower) and the
  // soft fills by each window.
  moon.color.set(skyLight);moon.intensity=24;moon.target.position.set(.35,0,-1.35);
  windowBounce.color.set('#b1a6f2');towerBounce.color.set('#b1a6f2');
  // Inside the tower the lancets' fill stays under the green from above, so
  // the stair is lit from its landing and the sky only tints its lower walls.
  towerBounce.intensity=1.5;
  // The upper floor's light falling through the stairwell: over the upper
  // flight, down the wall beneath it and softly onto the tower floor.
  const [wellX,wellZ]=radialAt(-66*Math.PI/180,.94),wellY=tread(stair.count);
  const presence=new THREE.SpotLight(upperGreen,architectureTuning.greenIntensity,5,architectureTuning.greenAngle,.68,2);presence.name='stairwell light';
  presence.position.set(wellX,wellY+.45,wellZ);presence.target.position.set(2.28,.28,-1.90);
  shell.add(presence,presence.target);
  // Its source, up in the tower room just above the well, stays out of view.
  // The seated eye sees it as the wall at the top of the stair: brightest just
  // under the landing, fading down the flight.
  const upstairs=new THREE.PointLight(upperGreen,architectureTuning.upperBounce,architectureTuning.upperReach,2),[upX,upZ]=radialAt(-118*Math.PI/180,.85);
  upstairs.name='upper floor glow';upstairs.position.set(upX,wellY+.23,upZ);shell.add(upstairs);
  // Shafts of light, from their source to where they fade out: open cones,
  // brightest along their axis as seen from any angle, fading at both ends.
  const inward=(w,down,length)=>{
    const [x,z]=radialAt(w.at,tower.r+.02),y=w.sill+1.05,d=new THREE.Vector3(-Math.cos(w.at),-down,-Math.sin(w.at)).normalize();
    return {from:[x,y,z],to:[x+d.x*length,y+d.y*length,z+d.z*length]};
  };
  const slant=(x,y,length)=>{
    const d=new THREE.Vector3(.95,-.62,1).normalize(),z=alcove.back+.02;
    return {from:[x,y,z],to:[x+d.x*length,y+d.y*length,z+d.z*length]};
  };
  // The upstairs shafts start in the tower room, above the well, so from the
  // room they emerge from behind the ring beam, brightest at the top. They fall
  // past the lower flight, the only part of the stair seen from above the
  // treads; over the upper flight's soffit they would read as pale columns.
  const fall=(degrees,rho,above,to)=>{const [x,z]=radialAt(degrees*Math.PI/180,rho);return {from:[x,wellY+above,z],to};};
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
    {...inward(lancets[1],.55,2.5),r0:.1,r1:.3,color:skyLight,strength:.26,motes:30},
    {...inward(lancets[0],.62,2.3),r0:.08,r1:.24,color:skyLight,strength:.17,motes:18},
    {...slant(aperture.x-.17,1.72,3.0),r0:.1,r1:.32,color:skyLight,strength:.22,motes:30},
    {...slant(aperture.x+.16,1.42,2.6),r0:.07,r1:.22,color:skyLight,strength:.13,motes:14},
  ];
  const lightInAir=new THREE.ShaderMaterial({
    vertexShader:`attribute vec3 tint;varying vec3 vTint,vNormal,vView,vWorld;varying float vAlong;
      void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=-mv.xyz;
        vAlong=uv.y;vTint=tint;vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying vec3 vTint,vNormal,vView,vWorld;varying float vAlong;
      void main(){
        float core=pow(abs(dot(normalize(vNormal),normalize(vView))),1.7);
        float ends=smoothstep(1.,.9,vAlong)*smoothstep(0.,.55,vAlong);
        float streaks=.78+.22*sin(vWorld.x*7.+vWorld.y*4.3+vWorld.z*6.1)*sin(vWorld.x*2.9-vWorld.z*3.7);
        gl_FragColor=vec4(vTint*core*ends*streaks,1.);
      }`,
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
  lightInAir.forceSinglePass=true;
  const shaftParts={position:[],normal:[],uv:[],tint:[]},q=new THREE.Quaternion(),a=new THREE.Vector3(),b=new THREE.Vector3();
  const dust={position:[],tint:[],size:[]};
  for(const beam of beams) {
    a.set(...beam.from);b.set(...beam.to);
    const length=a.distanceTo(b),axis=a.clone().sub(b).normalize();
    const g=new THREE.CylinderGeometry(beam.r0,beam.r1,length,16,1,true).toNonIndexed();
    q.setFromUnitVectors(new THREE.Vector3(0,1,0),axis);
    g.applyQuaternion(q).translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
    // Written straight to the display: sRGB values, scaled by the strength.
    const c=new THREE.Color(beam.color).convertLinearToSRGB();
    for(const key of ['position','normal','uv']) shaftParts[key].push(...g.attributes[key].array);
    for(let i=0;i<g.attributes.position.count;i++) shaftParts.tint.push(c.r*beam.strength,c.g*beam.strength,c.b*beam.strength);
    // Dust suspended in the shaft, denser toward its axis.
    const side=new THREE.Vector3().crossVectors(axis,Math.abs(axis.y)>.9?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0)).normalize();
    const other=new THREE.Vector3().crossVectors(axis,side);
    for(let i=0;i<beam.motes;i++) {
      const t=.08+random()*.84,radius=(beam.r0+(beam.r1-beam.r0)*t)*Math.sqrt(random())*.85,angle=random()*Math.PI*2;
      const p=a.clone().lerp(b,t).addScaledVector(side,Math.cos(angle)*radius).addScaledVector(other,Math.sin(angle)*radius);
      dust.position.push(p.x,p.y,p.z);
      const glow=(.5+random()*.5)*(1-t*.6)*(beam.dustGlow??1);dust.tint.push(c.r*glow,c.g*glow,c.b*glow);dust.size.push((.008+random()*.014)*(beam.dustSize??1));
    }
  }
  const shaftGeometry=new THREE.BufferGeometry();
  for(const [key,size] of [['position',3],['normal',3],['uv',2],['tint',3]])
    shaftGeometry.setAttribute(key,new THREE.Float32BufferAttribute(shaftParts[key],size));
  const shafts=new THREE.Mesh(shaftGeometry,lightInAir);shafts.name='light shafts';shafts.renderOrder=5;shell.add(shafts);
  const dustMaterial=new THREE.ShaderMaterial({uniforms:{uFocal:{value:600}},
    vertexShader:`attribute vec3 tint;attribute float size;uniform float uFocal;varying vec3 vTint;
      void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vTint=tint;gl_PointSize=max(1.5,size*uFocal/-mv.z);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying vec3 vTint;
      void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(vTint*smoothstep(.5,.05,d)*1.6,1.);}`,
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  const dustGeometry=new THREE.BufferGeometry();
  dustGeometry.setAttribute('position',new THREE.Float32BufferAttribute(dust.position,3));
  dustGeometry.setAttribute('tint',new THREE.Float32BufferAttribute(dust.tint,3));
  dustGeometry.setAttribute('size',new THREE.Float32BufferAttribute(dust.size,1));
  const motes=new THREE.Points(dustGeometry,dustMaterial);motes.name='dust in the light';motes.renderOrder=6;shell.add(motes);

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
    // Glow mask: the letters themselves, and a soft halo around them.
    const sharp=layer(),halo=layer(),h=halo.getContext('2d');
    letters(sharp.getContext('2d'),(c,line,x,y)=>{c.fillStyle='#fff';c.fillText(line,x,y);});
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
  // Walls the dragged cloth meets, in scene coordinates: the left wall (with
  // the nook's recess), the back wall (with the alcove), the right wall, and
  // the tower's round wall for everything behind its mouth. Fills `hit` with
  // the signed distance past the nearest wall (positive = beyond it), that
  // wall's inward normal, an id, and a coordinate along the wall.
  const shift=placement.forward,backZ=room.back-shift,mouthZ=rightJoin-shift,towerZ=tower.z-shift;
  const nookSpan=[nook.back-shift,nook.front-shift],alcoveZ=alcove.back-shift;
  function beyondWall(x,z,hit) {
    if(x>backJoin&&z<mouthZ) {
      // Behind the tower mouth: the round wall bounds whatever lies outside
      // the main room's rectangle.
      const dx=x-tower.x,dz=z-towerZ,d=Math.hypot(dx,dz)||1;
      hit.p=x<=room.right&&z>=backZ?Math.min(d-tower.r,Math.max(x-room.right,backZ-z)):d-tower.r;
      hit.nx=-dx/d;hit.nz=-dz/d;hit.id=3;hit.t=Math.atan2(dz,dx)*tower.r;
      return hit;
    }
    const left=z>nookSpan[0]&&z<nookSpan[1]?room.left-nook.depth:room.left;
    const back=x>alcove.left&&x<alcove.right?alcoveZ:backZ;
    hit.p=left-x;hit.nx=1;hit.nz=0;hit.id=0;hit.t=z;
    if(back-z>hit.p){hit.p=back-z;hit.nx=0;hit.nz=1;hit.id=1;hit.t=x;}
    if(z>mouthZ&&x-room.right>hit.p){hit.p=x-room.right;hit.nx=-1;hit.nz=0;hit.id=2;hit.t=z;}
    return hit;
  }
  const clothCount=clothGeometry.attributes.position.count;
  // Laid shape (lay), and what stirHem needs to bring its hanging folds to
  // life, per vertex: how much it hangs free toward the hem, its outward
  // direction, position along its edge, fold phase, fold depth and laid fold.
  const laid=new Float32Array(clothCount*3),hemWeight=new Float32Array(clothCount);
  const hemOut=new Float32Array(clothCount*2),hemAlong=new Float32Array(clothCount),hemPhase=new Float32Array(clothCount);
  const hemFold=new Float32Array(clothCount),hemLaidFold=new Float32Array(clothCount);
  const loose=new Float32Array(clothCount*3),reachP=new Float32Array(clothCount),reachT=new Float32Array(clothCount);
  const reachN=new Float32Array(clothCount*2),reachId=new Uint8Array(clothCount),hit={};
  const push=new Float32Array(4),spanMin=new Float32Array(4),spanMax=new Float32Array(4),support={x:0,z:0};
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
  const towerApproach=plan(1.7,1.15,-1);
  function stairRoute(start,heading) {
    const spiral=(degrees,rho,above)=>{
      const phi=degrees*Math.PI/180,line=((stair.from-phi)/stair.step+1)*stair.rise;
      return plan(tower.x+rho*Math.cos(phi),line+above,tower.z+rho*Math.sin(phi));
    };
    return new THREE.CatmullRomCurve3([start,start.clone().addScaledVector(heading,.8).add(new THREE.Vector3(0,.3,0)),
      towerApproach,...[-25,-50,-75,-100,-125,-150].map(d=>spiral(d,.95,.75)),
      spiral(-170,.8,.75),plan(tower.x,5.2,tower.z)],false,'centripetal');
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
    document.getElementById('screen').classList.add('has-table-model');
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
  scene.traverse(object=>{if(object.isLight)object.layers.enable(1);});
  frontCanvas.addEventListener('webglcontextlost',event=>{event.preventDefault();frontLost=true;frontHost.classList.remove('is-ready');});
  frontCanvas.addEventListener('webglcontextrestored',()=>{frontLost=false;invalidate();});
  let pending=false, lost=false, layoutKey='';
  const sizeKey=()=>[innerWidth,innerHeight,view.width,view.height,view.units,devicePixelRatio,
    ...Object.values(window.portalTable.geometry).slice(0,3)].join(':');
  function invalidate() {if(!pending&&!document.hidden&&!lost){pending=true;requestAnimationFrame(draw);}}
  function draw() {
    pending=false;if(document.hidden||lost)return;
    // The approach changes physical camera distance, never the room's scale.
    camera.fov=view.fov;
    camera.aspect=innerWidth/innerHeight;camera.position.set(0,view.eyeHeight,view.distance);
    camera.rotation.set(-view.tilt,0,0);
    camera.setViewOffset(innerWidth,innerHeight,0,innerHeight*.5-view.originY,innerWidth,innerHeight);
    camera.updateProjectionMatrix();camera.updateMatrixWorld();
    camera.layers.set(0);renderer.render(scene,camera);host.classList.add('is-ready');
    // The approach ends in this chair: the eye descends over its backrest into
    // the seat, and the chair slides out of frame on its own. Narrow viewports
    // must seat the camera further back to fit the table; there the chair
    // would stand in front of the seated eye, so it fades out on the way in.
    const behind=view.seatedDistance-view.seated.distance>.3;
    const presence=behind?Math.min(1,Math.max(0,(.8-view.approach)/.3)):1;
    chair.visible=presence>0;
    for(const m of [chairWood,velvet]) if(m.opacity!==presence) {
      m.transparent=presence<1;m.depthWrite=presence>=1;m.opacity=presence;m.needsUpdate=true;
    }
    renderFront();
  }
  function renderFront() {
    if(!front||frontLost) return;
    // Without the room's background colour, so only the chair and cloth are opaque.
    const background=scene.background;scene.background=null;camera.layers.set(1);
    front.render(scene,camera);
    scene.background=background;camera.layers.set(0);frontHost.classList.add('is-ready');
  }
  // The inscription's glow breathes and drifts, and the hem sways, while the
  // cloth lies on the table. Only the foreground layer redraws for it, at about
  // 30 fps; in its flight the cloth is redrawn with the room anyway (and moved
  // by the flight alone). Still for reduced motion.
  const stillMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let lastPulse=0;
  function pulse(now) {
    requestAnimationFrame(pulse);
    if(!cloth.visible||document.hidden||lost||stillMotion.matches||now-lastPulse<33) return;
    lastPulse=now;inscription.uTime.value=now/1000;
    if(!airborne&&!clothMotion) stirHem(now);
    if(cloth.layers.isEnabled(1)) renderFront();
  }
  requestAnimationFrame(pulse);
  function resize() {
    layoutKey=sizeKey();
    const ratio=Math.min(devicePixelRatio,1.5,Math.sqrt(2600000/(innerWidth*innerHeight)));
    renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight,false);
    if(front){front.setPixelRatio(ratio);front.setSize(innerWidth,innerHeight,false);}
    // Dust mote size in device pixels per metre at unit distance.
    dustMaterial.uniforms.uFocal.value=innerHeight*ratio/2/Math.tan(view.fov*Math.PI/360);
    refreshTable();invalidate();
  }
  // A dolly frame only changes the projection; geometry and canvas allocation
  // are refreshed only when the viewport or responsive table dimensions change.
  addEventListener('scene-camera-change',()=>{if(sizeKey()!==layoutKey)resize();else invalidate();});
  new MutationObserver(invalidate).observe(stage,{attributes:true,attributeFilter:['class','data-approach']});
  document.addEventListener('visibilitychange',invalidate);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;host.classList.remove('is-ready');document.getElementById('screen').classList.remove('has-table-model');});
  canvas.addEventListener('webglcontextrestored',()=>{lost=false;resize();});
  // Used by the local geometry/registration check and dev inspection.
  // hem: the cloth hem wave's parameters, live-tunable from the console.
  window.studyRoom={camera,scene,renderer,front,chair,shell,placement,hem,table:artifact,
    // Room extents in scene (table-relative) coordinates; the plan objects
    // after it (window, tower, alcove, corner) are in plan coordinates.
    dimensions:{...room,back:room.back-placement.forward,front:room.front-placement.forward},
    window:aperture,tower,alcove,corner,
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
    invalidate};
  resize();
}
