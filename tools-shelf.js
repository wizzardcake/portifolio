import * as THREE from './vendor/three/three.module.js';

// Metres, +Y up, +Z front. Every factory owns its resources, never its host's
// renderer, camera, lights or animation loop. time/delta are in seconds.
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;

function randomSource(seed) {
  return () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
}

function artifact(name, options) {
  const group = new THREE.Group();
  group.name = name;
  const resources = new Set();
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let hover = 0, target = 0, dead = false, elapsed = 0;
  const own = resource => (resources.add(resource), resource);
  const mesh = (geometry, material, parent = group) => {
    own(geometry); own(material);
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  };
  const material = settings => own(new THREE.MeshStandardMaterial(settings));
  const still = () => typeof options.reducedMotion === 'function' ? !!options.reducedMotion()
    : options.reducedMotion ?? media?.matches ?? false;
  return {
    group, own, mesh, material, still,
    step(time, delta) {
      if (dead) return null;
      const dt = Number.isFinite(delta) ? clamp(delta, 0, .1) : 0;
      const reduced = still();
      // Keep a local clock so changing OS motion preference does not jump phase.
      if (!reduced) elapsed += dt;
      hover += (target - hover) * (1 - Math.exp(-dt * (reduced ? 14 : 6)));
      if (Math.abs(target - hover) < .0001) hover = target;
      return {t: elapsed, dt, hover, reduced};
    },
    setHover(value) { if (!dead) target = value ? 1 : 0; },
    dispose() {
      if (dead) return;
      dead = true;
      group.removeFromParent();
      resources.forEach(resource => resource.dispose());
      resources.clear();
      group.clear();
    },
  };
}

// Merge static details by material; the many bands, studs and feet cost one
// draw call per finish, not one per ornament. Takes ownership of inputs.
function merged(parts) {
  const arrays = {position: [], normal: [], uv: []};
  for (const original of parts) {
    const g = original.index ? original.toNonIndexed() : original;
    for (const key of Object.keys(arrays)) arrays[key].push(g.attributes[key].array);
    if (g !== original) g.dispose();
    original.dispose();
  }
  const result = new THREE.BufferGeometry();
  for (const [key, chunks] of Object.entries(arrays)) {
    const data = new Float32Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    result.setAttribute(key, new THREE.BufferAttribute(data, key === 'uv' ? 2 : 3));
  }
  result.computeBoundingSphere();
  return result;
}

function tube(points, radius = .002, segments = 12) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, radius, 5, false);
}

function ring(radius, width, y) {
  return new THREE.TorusGeometry(radius, width, 5, 40).rotateX(Math.PI / 2).translate(0, y, 0);
}

function roundedShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y); s.closePath();
  return s;
}

function bevel(shape, depth, amount = .003, bevelSegments = 3, curveSegments = 18) {
  return new THREE.ExtrudeGeometry(shape, {depth, steps: 1, bevelEnabled: true,
    bevelThickness: amount, bevelSize: amount, bevelSegments, curveSegments}).translate(0, 0, -depth / 2);
}

// A turned piece whose finishes change along its profile: one lathe, one
// material, one draw call. Each profile segment k (point k to k+1) gets the
// finish paint(k) returns; finish = {color, rough, metal, grain}: grain is
// 'speckle' (stone), 'turned' (fine lathe lines in metal) or none, and only
// grained finishes take bump, so flat ones stay clean where the lathe fans
// in to its centre. ticks: {segment, count, finish} adds short radial marks
// across that segment. The lathe's v runs by point index, so the texture is
// laid out per segment.
function turned(a, profile, radial, paint, ticks) {
  const n = profile.length - 1, width = 512, row = 8, height = n * row;
  const color = document.createElement('canvas'), orm = document.createElement('canvas');
  color.width = orm.width = width; color.height = orm.height = height;
  const c = color.getContext('2d'), o = orm.getContext('2d'), rnd = randomSource(4271 + n);
  const fill = (ctx, style, x, y, w, h) => { ctx.fillStyle = style; ctx.fillRect(x, y, w, h); };
  // Canvas rows run top-down; texture v runs bottom-up (flipY).
  const rowOf = k => height - (k + 1) * row;
  for (let k = 0; k < n; k++) {
    const f = paint(k), y = rowOf(k);
    fill(c, f.color, 0, y, width, row);
    // roughness in G, metalness in B, as three.js reads them
    fill(o, `rgb(0,${Math.round(f.rough * 255)},${Math.round(f.metal * 255)})`, 0, y, width, row);
    if (f.grain === 'speckle') for (let i = 0; i < 1400; i++)
      fill(c, `rgba(${rnd() < .5 ? '20,18,14' : '235,228,214'},${.05 + rnd() * .12})`, rnd() * width, y + rnd() * row, 1, 1);
    if (f.grain === 'turned') for (let i = 0; i < 10; i++)
      fill(c, `rgba(${rnd() < .5 ? '40,26,12' : '255,226,170'},${.06 + rnd() * .1})`, 0, y + rnd() * row, width, 1);
  }
  if (ticks) {
    const y = rowOf(ticks.segment), f = ticks.finish;
    for (let i = 0; i < ticks.count; i++) {
      const x = (i + .5) / ticks.count * width - 1;
      fill(c, f.color, x, y + 1, 2, row - 2);
      fill(o, `rgb(0,${Math.round(f.rough * 255)},${Math.round(f.metal * 255)})`, x, y + 1, 2, row - 2);
    }
  }
  const map = a.own(new THREE.CanvasTexture(color)), ormMap = a.own(new THREE.CanvasTexture(orm));
  map.colorSpace = THREE.SRGBColorSpace;
  const material = a.material({map, roughnessMap: ormMap, metalnessMap: ormMap, bumpMap: map, bumpScale: .0008,
    roughness: 1, metalness: 1});
  return a.mesh(new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(...p)), radial), material);
}

// Gently convex enamel faces, with welded smooth normals around the bevel.
// Subdivide only cap triangles; side-wall poly counts stay unchanged.
function enamelGeometry(shape) {
  // Full arcs can end a few floating-point ulps from their first point.
  // Remove that microscopic edge before extrusion, or the bevel spikes at
  // the seam (especially visible on the blue disk in an oblique view).
  const contour=[];
  for(const point of shape.getPoints(9))if(!contour.length||point.distanceToSquared(contour[contour.length-1])>1e-14)contour.push(point);
  if(contour[0].distanceToSquared(contour[contour.length-1])<1e-14)contour.pop();
  shape=new THREE.Shape(contour);shape.closePath();
  const source=bevel(shape,.028,.004,2),p=source.attributes.position,uv=source.attributes.uv;
  const boundary=shape.getPoints(40),positions=[],texcoords=[],capNormals=[];
  function emit(a,b,c) {
    for(const v of [a,b,c]) {
      let distance=Infinity,dxNear=0,dyNear=0;
      for(let i=0;i<boundary.length-1;i++) {
        const A=boundary[i],B=boundary[i+1],dx=B.x-A.x,dy=B.y-A.y;
        const t=clamp(((v[0]-A.x)*dx+(v[1]-A.y)*dy)/(dx*dx+dy*dy||1),0,1);
        const ex=v[0]-A.x-t*dx,ey=v[1]-A.y-t*dy,d=Math.hypot(ex,ey);
        if(d<distance){distance=d;dxNear=ex;dyNear=ey;}
      }
      const cap=Math.abs(v[2])>.0179,d=clamp(distance/.031,0,1);
      const crown=cap?.003*Math.sin(d*Math.PI/2)**2:0;
      const slope=.003*Math.PI/(2*.031)*Math.sin(d*Math.PI);
      capNormals.push(cap?new THREE.Vector3(-dxNear/(distance||1)*slope,-dyNear/(distance||1)*slope,Math.sign(v[2])).normalize():null);
      positions.push(v[0],v[1],v[2]+Math.sign(v[2])*crown);texcoords.push(v[3],v[4]);
    }
  }
  const read=i=>[p.getX(i),p.getY(i),p.getZ(i),uv.getX(i),uv.getY(i)];
  const mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
  for(let i=0;i<p.count;i+=3) {
    const a=read(i),b=read(i+1),c=read(i+2);
    if(Math.abs(a[2]-b[2])<1e-7&&Math.abs(a[2]-c[2])<1e-7) {
      const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
      emit(a,ab,ca);emit(ab,b,bc);emit(ca,bc,c);emit(ab,bc,ca);
    }else emit(a,b,c);
  }
  source.dispose();
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(texcoords,2));g.computeVertexNormals();
  const sums=new Map(),keys=[],n=g.attributes.normal;
  for(let i=0;i<positions.length;i+=3) {
    const key=positions.slice(i,i+3).map(v=>Math.round(v*1e6)).join(',');keys.push(key);
    const sum=sums.get(key)||new THREE.Vector3();sum.add(new THREE.Vector3(n.getX(i/3),n.getY(i/3),n.getZ(i/3)));sums.set(key,sum);
  }
  sums.forEach(v=>v.normalize());keys.forEach((key,i)=>{const v=capNormals[i]||sums.get(key);n.setXYZ(i,v.x,v.y,v.z);});
  return g;
}

function grainTexture(a, type, seed, size = 256) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'), rnd = randomSource(seed);
  ctx.fillStyle = type === 'leather' ? '#786052' : '#b8aea0'; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 3800; i++) {
    const value = Math.floor(50 + rnd() * 170);
    ctx.fillStyle = `rgba(${value},${value},${value},${.06 + rnd() * .2})`;
    const x = rnd() * size, y = rnd() * size;
    ctx.fillRect(x, y, type === 'wood' ? 22 + rnd() * 90 : 1 + rnd() * 2, 1);
  }
  if (type === 'leather') {
    ctx.strokeStyle = 'rgba(225,202,149,.35)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 90; i++) {
      const x = rnd() * size, y = rnd() < .5 ? rnd() * 24 : size - rnd() * 24;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rnd() * 14, y + rnd() * 3); ctx.stroke();
    }
  }
  const map = a.own(new THREE.CanvasTexture(canvas)); map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/** Five independent enamel inlays over a turned stone pedestal.
 * options: { reducedMotion?: boolean|()=>boolean, camera?: THREE.Camera }
 * Pass the host camera to face the assembled logo toward it in local yaw.
 */
export function createFigmaObject(options = {}) {
  const a = artifact('Figma / floating enamel', options), {group, mesh} = a;
  // The turned stone pedestal with two bronze bands and a dark dial ring of
  // twenty bronze ticks: one lathe, its finishes painted along the profile.
  const stone = {color: '#696a61', rough: .82, metal: 0, grain: 'speckle'};
  const bronze = {color: '#9d7849', rough: .38, metal: .72, grain: 'turned'}, dark = {color: '#272a28', rough: .85, metal: 0};
  turned(a, [[.086,0],[.102,.006],[.108,.016],[.108,.025],[.097,.0305],[.094,.0335],[.086,.047],[.096,.051],
    [.098,.0555],[.098,.0585],[.091,.066],[.075,.066],[.073,.0685],[.062,.0685],[.056,.0685],[0,.0685]], 28,
    k => k === 4 || k === 8 ? bronze : k >= 11 ? dark : stone, {segment: 13, count: 20, finish: bronze});
  const cloud = new THREE.Group(); cloud.position.y = .228; group.add(cloud);
  const r = .031, unit = .066;
  function logoShape(kind) {
    const s = new THREE.Shape();
    if (kind === 'circle') { s.absarc(0,0,r,0,TAU,false); }
    else if (kind === 'lower') {
      s.moveTo(-r,r); s.lineTo(r,r); s.lineTo(r,0); s.absarc(0,0,r,0,-Math.PI,true); s.lineTo(-r,r);
    } else {
      s.moveTo(r,r); s.lineTo(0,r); s.absarc(0,0,r,Math.PI/2,Math.PI*1.5,false); s.lineTo(r,-r); s.lineTo(r,r);
      if (kind === 'right') {
        // Mirror the left D without a negative mesh scale (correct normals).
        const points = s.getPoints(28).map(p => new THREE.Vector2(-p.x,p.y)).reverse();
        return new THREE.Shape(points);
      }
    }
    s.closePath(); return s;
  }
  const specs = [
    ['left','#f24e1e',-.5,1], ['right','#ff7262',.5,1],
    ['left','#a259ff',-.5,0], ['circle','#1abcfe',.5,0], ['lower','#0acf83',-.5,-1],
  ];
  const pieces = specs.map(([kind,color,x,y],i) => {
    const finish = a.own(new THREE.MeshPhysicalMaterial({color, metalness: .42, roughness: .34,
      clearcoat: .38, clearcoatRoughness: .28, emissive: color, emissiveIntensity: .05}));
    const piece = mesh(enamelGeometry(logoShape(kind)), finish, cloud);
    piece.name = `Figma inlay ${i + 1}`;
    return {piece, x:x*unit, y:y*unit, phase:i*1.61};
  });
  const cameraPosition = new THREE.Vector3();
  let facing = 0;
  function update(time, delta) {
    const s = a.step(time,delta); if (!s) return;
    const {t,dt,hover:h,reduced} = s;
    if (options.camera) {
      options.camera.getWorldPosition(cameraPosition);
      group.updateWorldMatrix(true,false); group.worldToLocal(cameraPosition);
      const desired = Math.atan2(cameraPosition.x,cameraPosition.z);
      const shortest = Math.atan2(Math.sin(desired-facing),Math.cos(desired-facing));
      if(reduced||Math.abs(shortest)<.0001)facing=desired;
      else facing += shortest * (1-Math.exp(-dt*5));
    }
    cloud.rotation.y = facing + (reduced ? 0 : .16*Math.sin(t*.36))*(1-h);
    cloud.rotation.z = reduced ? 0 : .035*Math.sin(t*.43)*(1-h);
    for (const {piece,x,y,phase} of pieces) {
      const spread = reduced ? 0 : 1-h;
      piece.position.set(x*(1+spread*.62)+spread*.008*Math.sin(t*.54+phase),
        y*(1+spread*.24)+spread*.009*Math.sin(t*.75+phase),
        spread*(.014*Math.cos(t*.46+phase)));
      piece.rotation.set(spread*.18*Math.sin(t*.43+phase), spread*.34*Math.sin(t*.39+phase+1),
        spread*.15*Math.sin(t*.47+phase));
    }
  }
  update(0,0);
  group.userData.footprint = {width:.24,depth:.22,height:.35};
  return {group,update,setHover:a.setHover,dispose:a.dispose};
}

// Closed curved page/cover volume: top, bottom and edge faces all have real
// thickness. Width parameter u runs out from the binding; v runs back to front.
function pageHeight(u,v) { return .110 + .027*Math.sin(u*Math.PI*.93) + .010*u - v*.027; }
function pageVolume(side,width,depth,offset,thickness,nu = 20,nv = 6) {
  const pos=[],uv=[],idx=[];
  const add = (u,v,lower) => { pos.push(side*(.003+u*width),pageHeight(u,v)+offset-(lower?thickness:0),v*depth/2);uv.push(u,(v+1)/2); };
  for (let lower = 0; lower < 2; lower++) for(let j=0;j<=nv;j++) for(let i=0;i<=nu;i++) add(i/nu,j/nv*2-1,lower);
  const layer=(nu+1)*(nv+1);
  const quad=(a,b,c,d,flip=false)=> { if(flip) idx.push(a,c,b,a,d,c); else idx.push(a,b,c,a,c,d); };
  for(let j=0;j<nv;j++) for(let i=0;i<nu;i++) {
    const k=j*(nu+1)+i;
    quad(k,k+nu+1,k+nu+2,k+1,side<0);
    quad(k+layer,k+1+layer,k+nu+2+layer,k+nu+1+layer,side<0);
  }
  for(let j=0;j<nv;j++) {
    let k=j*(nu+1); quad(k,k+layer,k+nu+1+layer,k+nu+1,side<0);
    k+=nu;quad(k,k+nu+1,k+nu+1+layer,k+layer,side<0);
  }
  for(let i=0;i<nu;i++) {
    quad(i,i+1,i+1+layer,i+layer,side<0);
    const k=nv*(nu+1)+i;quad(k,k+layer,k+1+layer,k+1,side<0);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
  return g;
}

function glyphMaps(a,seed) {
  const paper=document.createElement('canvas'),light=document.createElement('canvas');
  paper.width=light.width=512;paper.height=light.height=512;
  const p=paper.getContext('2d'),l=light.getContext('2d'),rnd=randomSource(seed);
  p.fillStyle='#c8b283';p.fillRect(0,0,512,512);l.fillStyle='#000';l.fillRect(0,0,512,512);
  const shade=p.createLinearGradient(0,0,512,0);shade.addColorStop(0,'#66503a');shade.addColorStop(.12,'#bda572');shade.addColorStop(.55,'#e6d1a3');shade.addColorStop(1,'#b79c70');
  p.fillStyle=shade;p.fillRect(0,0,512,512);
  for(let i=0;i<6500;i++) {p.fillStyle=`rgba(75,46,22,${rnd()*.18})`;p.fillRect(rnd()*512,rnd()*512,1+rnd()*3,1);}
  for(let i=0;i<32;i++) {
    const x=rnd()*512,y=rnd()*512,r=12+rnd()*47;
    const stain=p.createRadialGradient(x,y,0,x,y,r);stain.addColorStop(0,'rgba(104,66,27,.10)');stain.addColorStop(1,'rgba(104,66,27,0)');
    p.fillStyle=stain;p.fillRect(x-r,y-r,r*2,r*2);
  }
  for(let i=0;i<250;i++) {p.fillStyle='rgba(77,43,18,.22)';const x=rnd()*512,y=rnd()<.5?rnd()*18:512-rnd()*18;p.fillRect(x,y,1+rnd()*3,1+rnd()*4);}
  p.strokeStyle='#90754b';p.lineWidth=2;p.strokeRect(34,28,450,456);p.strokeRect(40,34,438,444);
  // Illuminated, abstract editor-like marks: no font or source code involved.
  function mark(ctx,x,y,w,hue) {
    ctx.strokeStyle=hue;ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();
    if(rnd()<.3) {ctx.moveTo(x+6,y-5);ctx.lineTo(x,y);ctx.lineTo(x+6,y+5);ctx.moveTo(x+w-6,y-5);ctx.lineTo(x+w,y);ctx.lineTo(x+w-6,y+5);}
    else {ctx.moveTo(x,y);ctx.lineTo(x+w*.7,y);ctx.lineTo(x+w*.7,y-4);ctx.moveTo(x+w*.85,y+2);ctx.lineTo(x+w,y+2);}
    ctx.stroke();
  }
  for(let row=0;row<15;row++) {
    let x=64+(row%5===2?24:0),y=122+row*21;
    while(x<398) {
      const width=12+Math.floor(rnd()*5)*6;
      const state=rnd()<.65?'#007acc':'#587883';
      // Draw identical marks on both maps using saved PRNG state via path copy.
      const temp=document.createElement('canvas');temp.width=70;temp.height=18;
      mark(temp.getContext('2d'),4,9,width,state);
      p.drawImage(temp,x,y-9);l.drawImage(temp,x,y-9);x+=width+12+rnd()*16;
      if(rnd()<.08)break;
    }
  }
  for(const ctx of [p,l]) {
    ctx.strokeStyle='#159cda';ctx.lineWidth=3;ctx.beginPath();
    ctx.moveTo(172,67);ctx.lineTo(193,83);ctx.lineTo(172,99);ctx.moveTo(226,67);ctx.lineTo(205,83);ctx.lineTo(226,99);ctx.stroke();
    ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(252,83);ctx.lineTo(431,83);ctx.stroke();
  }
  const map=a.own(new THREE.CanvasTexture(paper)),emissiveMap=a.own(new THREE.CanvasTexture(light));
  map.colorSpace=emissiveMap.colorSpace=THREE.SRGBColorSpace;
  return {map,emissiveMap};
}

/** Curved parchment leaves, thick leather boards, walnut lectern, blue glyphs. */
export function createGrimoireObject(options = {}) {
  const a=artifact('VS Code / blue grimoire',options),{group,mesh,material}=a;
  const leatherMap=grainTexture(a,'leather',193),woodMap=grainTexture(a,'wood',731);
  const leather=material({color:'#4b2921',map:leatherMap,bumpMap:leatherMap,bumpScale:.0012,roughness:.82});
  const wood=material({color:'#3b281b',map:woodMap,roughness:.69});
  const gold=material({color:'#a5824c',metalness:.65,roughness:.46});
  const edges=material({color:'#bfa477',roughness:.95});
  const strata=material({color:'#6b5637',roughness:1});
  const stand=[];
  for(const x of [-.075,.075]) {
    stand.push(bevel(roundedShape(.032,.176,.009),.009,.002).rotateX(-Math.PI/2).translate(x,.0065,0));
    stand.push(tube([[x,.015,-.065],[x,.061,-.039],[x,.082,-.050]],.009,5));
    stand.push(tube([[x,.015,.066],[x,.042,.030],[x,.059,.053]],.009,5));
    stand.push(tube([[x,.071,-.075],[x,.056,0],[x,.040,.080]],.008,5));
  }
  stand.push(new THREE.CylinderGeometry(.007,.007,.18,10).rotateZ(Math.PI/2).translate(0,.032,0));
  mesh(merged(stand),wood);
  const covers=[],blocks=[],lines=[],corners=[];
  const pages=[];
  for(const side of [-1,1]) {
    covers.push(pageVolume(side,.147,.202,-.028,.012));
    blocks.push(pageVolume(side,.134,.182,-.004,.023));
    // Seven irregular, continuous cut-paper edges at both ends and fore-edge.
    for(let layer=0;layer<7;layer++) {
      const offset=-.005-layer*.0031;
      for(const v of [-1,1]) {
        const pts=Array.from({length:17},(_,i)=>{const u=i/16;return [side*(.003+u*.134),pageHeight(u,v)+offset,v*.091];});
        lines.push(tube(pts,.00038,16));
      }
      lines.push(tube(Array.from({length:7},(_,i)=>{const v=i/3-1;return [side*.137,pageHeight(1,v)+offset,v*.091];}),.00035,6));
    }
    for(const v of [-1,1]) {
      const x=side*.147,y=pageHeight(1,v)-.025,z=v*.101;
      const guard=new THREE.Shape();guard.moveTo(0,0);guard.lineTo(-side*.024,0);guard.lineTo(0,v*.022);guard.closePath();
      corners.push(new THREE.ExtrudeGeometry(guard,{depth:.002,bevelEnabled:false}).rotateX(-Math.PI/2).translate(x,y,z));
      corners.push(new THREE.SphereGeometry(.0032,8,6).translate(x-side*.008,y+.003,z-v*.004));
    }
    const maps=glyphMaps(a,side<0?125:256);
    const mat=material({...maps,color:'#fff2d5',emissive:'#72c9ff',emissiveIntensity:1.1,roughness:.88,side:THREE.DoubleSide});
    const g=new THREE.PlaneGeometry(1,1,24,10),p=g.attributes.position,uv=g.attributes.uv;
    for(let i=0;i<p.count;i++) {const u=uv.getX(i),v=uv.getY(i)*2-1;p.setXYZ(i,side*(.003+u*.134),pageHeight(u,v),v*.091);uv.setY(i,1-uv.getY(i));}
    // Plane indices point down on the right; turn those to retain lit tops.
    if(side>0) {const ix=g.index;for(let i=0;i<ix.count;i+=3){const k=ix.getX(i+1);ix.setX(i+1,ix.getX(i+2));ix.setX(i+2,k);}}
    g.computeVertexNormals();
    const page=mesh(g,mat);page.name=side<0?'left curved illuminated page':'right curved illuminated page';
    pages.push({g,mat,base:Float32Array.from(p.array),side});
  }
  mesh(merged(covers),leather);mesh(merged(blocks),edges);mesh(merged(lines),strata);mesh(merged(corners),gold);
  // The round bound spine, stitched bands, and a silk bookmark show even at a
  // shallow shelf viewing angle. No extra light is used for the writing.
  mesh(new THREE.CylinderGeometry(.013,.013,.203,14).rotateX(Math.PI/2).translate(0,.077,0),leather);
  const stitches=[];
  for(let i=0;i<12;i++)stitches.push(new THREE.BoxGeometry(.006,.0007,.0008).translate(0,.111-i*.00015,-.079+i*.014));
  mesh(merged(stitches),material({color:'#5d482f',roughness:.95}));
  const silk=material({color:'#185f83',roughness:.65,metalness:.12,side:THREE.DoubleSide});
  const ribbon=new THREE.Shape();ribbon.moveTo(-.005,0);ribbon.lineTo(.005,0);ribbon.lineTo(.006,-.055);ribbon.lineTo(0,-.050);ribbon.lineTo(-.005,-.058);ribbon.closePath();
  mesh(new THREE.ShapeGeometry(ribbon).rotateX(.2).translate(.010,.098,.082),silk);

  const symbol=document.createElement('canvas');symbol.width=symbol.height=64;
  const c=symbol.getContext('2d');c.strokeStyle='#7fdaff';c.lineWidth=4;c.lineCap='round';
  c.shadowColor='#007acc';c.shadowBlur=8;c.beginPath();c.moveTo(23,19);c.lineTo(12,31);c.lineTo(23,43);c.moveTo(41,19);c.lineTo(52,31);c.lineTo(41,43);c.stroke();
  const glyphMap=a.own(new THREE.CanvasTexture(symbol));glyphMap.colorSpace=THREE.SRGBColorSpace;
  const sprites=[];
  for(let i=0;i<7;i++) {
    const mat=a.own(new THREE.SpriteMaterial({map:glyphMap,color:'#49baff',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
    const sprite=new THREE.Sprite(mat);sprite.scale.setScalar(.021+(i%3)*.003);sprite.visible=false;sprite.name='lifted blue glyph';group.add(sprite);sprites.push(sprite);
  }
  function update(time,delta) {
    const s=a.step(time,delta);if(!s)return;
    const {t,hover:h,reduced}=s;
    for(const page of pages) {
      page.mat.emissiveIntensity=1.05+h*1.8+(reduced?0:.14*Math.sin(t*1.5));
      const p=page.g.attributes.position,uv=page.g.attributes.uv;
      for(let i=0;i<p.count;i++) {
        const u=uv.getX(i),v=uv.getY(i);
        p.setY(i,page.base[i*3+1]+(reduced?0:Math.pow(u,3)*.0018*Math.sin(t*1.7+v*4+page.side)));
      }
      p.needsUpdate=true;page.g.computeVertexNormals();
    }
    sprites.forEach((sprite,i)=>{
      const life=(t*.23+i/7)%1,fade=Math.sin(life*Math.PI)**2;
      sprite.visible=!reduced&&h>.006;
      sprite.material.opacity=reduced?0:h*fade*.78;
      sprite.position.set(Math.sin(i*2.4)*.092+Math.sin(t*.5+i)*.013,.125+life*.16,Math.cos(i*2.7)*.054);
      sprite.material.rotation=.08*Math.sin(t+i);
    });
  }
  update(0,0);
  group.userData.footprint={width:.30,depth:.20,height:.17};
  return {group,update,setHover:a.setHover,dispose:a.dispose};
}

/** Bronze-mounted glass with one small analytic mist shader, no raymarch. */
export function createCrystalBallObject(options = {}) {
  const a=artifact('AI / nebula crystal',options),{group,mesh,material}=a;
  const bronze=material({color:'#80613e',metalness:.76,roughness:.36});
  const shadowBronze=material({color:'#2c3933',metalness:.67,roughness:.55});
  const inlay=material({color:'#276f68',metalness:.3,roughness:.3,emissive:'#15574f',emissiveIntensity:.4});
  const baseProfile=[[.077,0],[.088,.006],[.091,.015],[.089,.023],[.072,.030],[.056,.040],[.041,.051],[.039,.065],[.050,.079],[.062,.087],[.066,.098],[.061,.107],[.052,.110],[0,.110]];
  mesh(new THREE.LatheGeometry(baseProfile.map(p=>new THREE.Vector2(...p)),40),shadowBronze);
  const ornament=[ring(.087,.003,.017),ring(.072,.002,.032),ring(.042,.002,.055),ring(.064,.0024,.096)];
  const gems=[];
  for(let i=0;i<12;i++) {
    const angle=i/12*TAU;
    ornament.push(tube([[.066,.033,0],[.055,.045,.003],[.043,.067,0],[.057,.087,-.003]],.0019,9).rotateY(angle));
    ornament.push(new THREE.SphereGeometry(.003,8,6).translate(.084,.025,0).rotateY(angle));
  }
  // Four swept claws cradle the glass; the wider feet stay within .22 m depth.
  for(let i=0;i<4;i++) {
    const angle=Math.PI/4+i*TAU/4;
    ornament.push(tube([[.073,.023,0],[.104,.016,0],[.106,.008,0]],.005,8).rotateY(angle));
    ornament.push(tube([[.051,.081,0],[.080,.098,0],[.088,.126,0],[.090,.149,0]],.004,12).rotateY(angle));
    ornament.push(new THREE.SphereGeometry(.0055,10,8).translate(.090,.149,0).rotateY(angle));
    gems.push(new THREE.SphereGeometry(.006,10,8).scale(1,.7,.6).translate(.073,.032,0).rotateY(angle));
  }
  mesh(merged(ornament),bronze);mesh(merged(gems),inlay);

  const mist=a.own(new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uHover:{value:0}},
    vertexShader:`varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormal; varying vec3 vEye;
      void main(){vLocal=position/.099; vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;
      vec3 eye=cameraPosition-w.xyz;vEye=vec3(dot(eye,modelMatrix[0].xyz),dot(eye,modelMatrix[1].xyz),dot(eye,modelMatrix[2].xyz));
      vNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`precision highp float;
      uniform float uTime; uniform float uHover; varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormal; varying vec3 vEye;
      float hash(vec3 p){p=fract(p*vec3(.1031,.103,.0973));p+=dot(p,p.yxz+33.33);return fract((p.x+p.y)*p.z);}
      float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
        mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      mat2 turn(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
      void main(){
        vec3 N=normalize(vNormal),V=normalize(cameraPosition-vWorld);
        float ndv=clamp(dot(N,V),0.,1.),rim=pow(1.-ndv,3.7);
        vec3 p=vLocal-normalize(vEye)*ndv*.68; p.xz=turn(uTime*.16+p.y*.8)*p.xz;
        // Three warped noise fields sampled once each, projected through a
        // curved lens. This is an impression of depth, not a volume marcher.
        float broad=noise3(p*2.7+vec3(0.,uTime*.07,0.));
        vec3 q=p*4.4+vec3(broad*1.8,-uTime*.12,broad);
        float fine=noise3(q);
        float distant=noise3(p*5.7+vec3(2.,uTime*.035,1.));
        float cloud=smoothstep(.28,.79,broad*.62+fine*.38);
        float filament=pow(1.-abs(fine*2.-1.),10.)*smoothstep(.32,.75,broad);
        float core=pow(ndv,4.)*.24;
        vec3 teal=vec3(.018,.28,.24),violet=vec3(.16,.035,.30);
        vec3 hue=mix(teal,violet,smoothstep(-.5,.6,p.x+p.y*.45+broad*.4));
        vec3 color=vec3(.004,.012,.017)+hue*(cloud*.58+filament*.16+core+distant*.11)*smoothstep(0.,.6,ndv)*(1.+uHover*.38);
        color+=vec3(.08,.39,.31)*core+mix(teal,violet,.55)*rim*.31;
        float glint=pow(max(dot(reflect(-V,N),normalize(vec3(-.5,.8,1.))),0.),190.);
        color+=vec3(1.,.82,.61)*glint*.6;
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const center=.211;
  const core=mesh(new THREE.SphereGeometry(.099,40,28),mist);core.position.y=center;core.castShadow=false;
  const glass=a.own(new THREE.MeshPhysicalMaterial({color:'#b7d5cf',metalness:.08,roughness:.11,
    transparent:true,opacity:.20,depthWrite:false,clearcoat:1,clearcoatRoughness:.09,side:THREE.FrontSide}));
  const globe=mesh(new THREE.SphereGeometry(.105,40,28),glass);globe.position.y=center;globe.renderOrder=2;
  // A sparse set of pinpricks over the inner glass, not billboards around it.
  const stars=[],rnd=randomSource(947);
  for(let i=0;i<27;i++) {
    const y=rnd()*2-1,angle=rnd()*TAU,r=.102;
    stars.push(new THREE.SphereGeometry(i%7===0?.00085:.00045,5,4).translate(Math.sqrt(1-y*y)*Math.cos(angle)*r,center+y*r,Math.sqrt(1-y*y)*Math.sin(angle)*r));
  }
  const sparks=material({color:'#8cdbcf',emissive:'#64c5b8',emissiveIntensity:.9,roughness:.4});
  mesh(merged(stars),sparks).castShadow=false;
  let swirl=0;
  function update(time,delta) {
    const s=a.step(time,delta);if(!s)return;
    if(!s.reduced)swirl+=s.dt*(1+s.hover*2.1);
    mist.uniforms.uTime.value=swirl;mist.uniforms.uHover.value=s.hover;
    sparks.emissiveIntensity=.75+s.hover*.3+(s.reduced?0:.08*Math.sin(s.t*1.2));
  }
  update(0,0);
  group.userData.footprint={width:.23,depth:.23,height:.316};
  return {group,update,setHover:a.setHover,dispose:a.dispose};
}
