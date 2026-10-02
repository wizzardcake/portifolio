// Local architectural dressings only. Opening sizes, stair route and room
// placement are supplied by room-scene.js; sky and interactions are untouched.
export const architectureTuning = {
  frameWidth: .115, frameProjection: .085, revealDepth: .24,
  sillProjection: .16, traceryRadius: .012,
  railRadius: .030, railHeight: .86, fasciaDepth: .14,
  green: '#69dba1', greenIntensity: 11, greenAngle: .32,
  upperBounce: 6, upperReach: 1.55, shaftWidth: 1, shaftStrength: 1,
};

export function createRoomArchitecture(THREE,{aperture,alcove,tower,lancets,stair,roomBack},tuning=architectureTuning) {
  const stone=[],metal=[];
  const at=(phi,r,y)=>new THREE.Vector3(tower.x+r*Math.cos(phi),y,tower.z+r*Math.sin(phi));
  const tread=i=>(i+1)*stair.rise;
  const box=(w,h,d,x,y,z)=>new THREE.BoxGeometry(w,h,d).translate(x,y,z);
  const combine=parts=>{
    const result=new THREE.BufferGeometry(),flat=parts.map(g=>g.index?g.toNonIndexed():g);
    for(const [name,size] of [['position',3],['normal',3],['uv',2]]) {
      const values=new Float32Array(flat.reduce((n,g)=>n+g.attributes[name].array.length,0));
      let offset=0;for(const g of flat){values.set(g.attributes[name].array,offset);offset+=g.attributes[name].array.length;}
      result.setAttribute(name,new THREE.BufferAttribute(values,size));
    }
    return result;
  };
  // Same pointed quadratic used for the actual through-holes, with sampled
  // nested profiles instead of costly bevelled solid extrusions.
  function contour(w,pad=0,steps=w.halfWidth<.3?6:7) {
    const r=w.halfWidth+pad,c=w.shoulder+.6*(w.peak-w.shoulder);
    const points=[[-r,w.sill-pad],[-r,w.shoulder]];
    for(let i=1;i<=steps;i++) {
      const t=i/steps;points.push([-r*(1-t*t),w.shoulder*(1-t)**2+2*c*t*(1-t)+(w.peak+pad)*t*t]);
    }
    for(let i=steps-1;i>=0;i--) {
      const t=i/steps;points.push([r*(1-t*t),w.shoulder*(1-t)**2+2*c*t*(1-t)+(w.peak+pad)*t*t]);
    }
    points.push([r,w.sill-pad]);return points;
  }
  const planar=(x,z)=>(u,y,depth)=>new THREE.Vector3(x+u,y,z+depth);
  const radial=w=>(u,y,depth)=>at(w.at+u/tower.r,tower.r-depth,y);
  function ribbon(w,profile,map) {
    const rows=profile.map(([pad,depth])=>contour(w,pad).map(([u,y])=>map(u,y,depth)));
    const data=[];
    for(let row=0;row<rows.length-1;row++) for(let j=0;j<rows[0].length;j++) {
      const k=(j+1)%rows[0].length,a=rows[row][j],b=rows[row][k],c=rows[row+1][k],d=rows[row+1][j];
      for(const v of [a,d,c,a,c,b])data.push(v.x,v.y,v.z);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(data,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(data.length/3*2),2));
    geometry.computeVertexNormals();return geometry;
  }
  function mappedBox(w,h,d,u,y,depth,map) {
    const g=box(w,h,d,u,y,depth),p=g.attributes.position;
    for(let i=0;i<p.count;i++){const v=map(p.getX(i),p.getY(i),p.getZ(i));p.setXYZ(i,v.x,v.y,v.z);}
    g.computeVertexNormals();return g;
  }
  function rod(points,r=.012,segments=8) {
    const path=new THREE.CatmullRomCurve3(points,false,'centripetal');
    return new THREE.TubeGeometry(path,segments,r*tuning.traceryRadius/.012,4,false);
  }
  function frame(w,map,scale=1,deep=true) {
    const width=tuning.frameWidth*scale,proud=tuning.frameProjection*scale;
    stone.push(ribbon(w,[[width,.008],[width*.86,proud],[width*.56,proud],
      [width*.43,proud*.40],[width*.24,proud*.55],[0,deep?-tuning.revealDepth:.004]],map));
    // A projecting weathered sill over a narrower apron; not a single block.
    if(w.sill>0) {
      stone.push(mappedBox(w.halfWidth*2+width*2,.065,.30+tuning.sillProjection,0,w.sill-.045,-.10,map),
        mappedBox(w.halfWidth*2+width,.065,.14,0,w.sill-.108,.005,map));
    }
    // Impost stones articulate the spring of every arch. Small bronze keys
    // at the crown link the tall lancets and the broader alcove.
    for(const side of [-1,1]) stone.push(mappedBox(width*1.10,.05,proud+ .035,
      side*(w.halfWidth+width*.50),w.shoulder,.035,map));
    const key=new THREE.OctahedronGeometry(.04*scale,0);key.scale(.7,1.7,.32);
    const p=key.attributes.position;
    for(let i=0;i<p.count;i++){const v=map(p.getX(i),p.getY(i)+w.peak+width*.46,p.getZ(i)+proud+.004);p.setXYZ(i,v.x,v.y,v.z);}
    key.computeVertexNormals();metal.push(key);
  }
  frame(alcove,planar(alcove.x,roomBack),1.18,false);
  const back=planar(aperture.x,alcove.back);
  frame(aperture,back);
  lancets.forEach(w=>frame(w,radial(w),.65));
  // Forked tracery in the large opening, with a small pointed eye. It lives
  // behind the front moulding, leaving most of the sky/moon unobstructed.
  const join=aperture.shoulder-.19,eyeY=aperture.peak-.22;
  const spring=.36,branchX=aperture.halfWidth*(1-spring*spring);
  const branchY=aperture.shoulder*(1-spring)**2+2*(aperture.shoulder+.6*(aperture.peak-aperture.shoulder))*spring*(1-spring)+aperture.peak*spring*spring;
  metal.push(rod([back(0,aperture.sill,-.105),back(0,join,-.105)],.016,1));
  for(const sign of [-1,1]) metal.push(rod([
    back(0,join,-.105),back(sign*.22,join+.16,-.105),back(sign*branchX,branchY,-.105)],.012,5));
  metal.push(rod([back(0,eyeY+.10,-.105),back(.057,eyeY,-.105),back(0,eyeY-.10,-.105),
    back(-.057,eyeY,-.105),back(0,eyeY+.10,-.105)],.011,12));
  metal.push(rod([back(0,eyeY+.10,-.105),back(0,aperture.peak-.008,-.105)],.008,1));
  // A small matching eye high in each slim lancet, never a grille across its view.
  for(const w of lancets) {
    const map=radial(w),y=w.shoulder+.14;
    metal.push(rod([map(0,y+.10,-.07),map(.038,y,-.07),map(0,y-.07,-.07),map(-.038,y,-.07),map(0,y+.10,-.07)],.008,6));
    metal.push(rod([map(0,y+.10,-.07),map(0,w.peak-.008,-.07)],.006,1));
  }
  // The open stair edge gets a continuous carved fascia. It follows the
  // existing helical nosing line, never changing a tread or the flight path.
  const railAt=i=>at(stair.from-i*stair.step,stair.inner+.03,tread(i)+tuning.railHeight);
  const helix=new THREE.Curve();helix.getPoint=(t,target=new THREE.Vector3())=>target.copy(railAt(t*stair.count));
  const handrail=new THREE.TubeGeometry(helix,32,tuning.railRadius,6,false);
  const fascia=[];
  for(let j=0;j<stair.count*2;j++) {
    const a=j/2,b=(j+1)/2;
    const row=(i,offset,drop)=>at(stair.from-i*stair.step,stair.inner-offset,Math.max(.018,tread(i)-drop));
    const p=[row(a,.006,.055),row(b,.006,.055),row(b,.036,.10),row(a,.036,.10),
      row(a,.036,.10),row(b,.036,.10),row(b,.014,.055+tuning.fasciaDepth),row(a,.014,.055+tuning.fasciaDepth)];
    for(let k=0;k<8;k+=4)for(const index of [0,1,2,0,2,3]){const v=p[k+index];fascia.push(v.x,v.y,v.z);}
  }
  const fasciaGeometry=new THREE.BufferGeometry();fasciaGeometry.setAttribute('position',new THREE.Float32BufferAttribute(fascia,3));
  fasciaGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(fascia.length/3*2),2));
  fasciaGeometry.computeVertexNormals();stone.push(fasciaGeometry);
  // Open, pointed two-step bays replace the close-spaced generic bars. The
  // bronze tracery shares its pointed-eye language with the window details.
  for(let i=0;i<=stair.count;i+=2) {
    const p=railAt(i),base=i===0?0:tread(i-1),height=p.y-base;
    metal.push(new THREE.CylinderGeometry(.012,.018,height,6).translate(p.x,base+height/2,p.z));
    stone.push(box(.068,.05,.068,p.x,base+.035,p.z));
    if(i<stair.count) {
      const points=Array.from({length:9},(_,j)=>{
        const t=j/8,v=railAt(i+t*2);v.y-=.36-.24*Math.sin(t*Math.PI);return v;
      });
      metal.push(rod(points,.010,6));
    }
  }
  // A carved starting pedestal anchors the spiral instead of a thin pole.
  const foot=railAt(0);
  stone.push(box(.15,.10,.15,foot.x,.05,foot.z),box(.105,.70,.105,foot.x,.45,foot.z),
    box(.14,.07,.14,foot.x,.835,foot.z));
  const finial=new THREE.OctahedronGeometry(.045,0);finial.scale(1,1.6,1);finial.translate(foot.x,foot.y+.035,foot.z);metal.push(finial);
  // Fine worn-metal nosing inlays catch light on alternating treads only.
  for(let i=0;i<stair.count;i+=2) {
    const angle=stair.from-i*stair.step,p=at(angle,(stair.inner+tower.r)/2,tread(i)+.002);
    metal.push(new THREE.BoxGeometry(tower.r-stair.inner-.10,.006,.012).rotateY(-angle).translate(p.x,p.y,p.z));
  }
  const stoneGeometry=combine(stone),metalGeometry=combine(metal);
  return {stone:stoneGeometry,metal:metalGeometry,handrail,tuning,
    stats:{windows:1+lancets.length,profiles:2+lancets.length,railBays:stair.count/2,
      triangles:(stoneGeometry.attributes.position.count+metalGeometry.attributes.position.count)/3+handrail.index.count/3}};
}
