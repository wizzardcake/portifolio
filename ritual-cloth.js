// Cloth-only pattern and support math. No portal, camera or table mutations.
// Metres except the unitless shaping / motion controls.
export const ritualClothTuning = {
  shoulder: .065, flare: .25, scallop: .032, lobeBreadth: 1.7,
  dragTrail: .14, flightTrail: .065, flutter: .035,
  gather: .28, furlWidth: .32,
};

export function createRitualCloth(THREE, tuning = ritualClothTuning) {
  const segments=192, rings=20, count=1+segments*rings;
  const geometry=new THREE.BufferGeometry();
  const positions=new Float32Array(count*3),uv=new Float32Array(count*2);
  const flat=new Float32Array(count*2), free=new Float32Array(count),phase=new Float32Array(count);
  const indices=[];
  for(let j=0;j<segments;j++) indices.push(0,1+(j+1)%segments,1+j);
  for(let ring=1;ring<rings;ring++) for(let j=0;j<segments;j++) {
    const a=1+(ring-1)*segments+j,b=1+(ring-1)*segments+(j+1)%segments;
    const c=a+segments,d=b+segments;
    indices.push(a,b,c,b,d,c);
  }
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geometry.setIndex(indices);
  let width=0,depth=0,size=[0,0],outline=[];
  const border=[];
  function update(w,d) {
    if(w===width&&d===depth) return false;
    width=w;depth=d;
    outline=[[-w/4,-d/2],[w/4,-d/2],[w/2,0],[w/4,d/2],[-w/4,d/2],[-w/2,0]];
    border.length=0;
    let halfW=0,halfD=0;
    // A rounded hex shoulder covers every table corner. Broad, side-centred
    // lobes grow from it; three shallow wavelets soften each outer end.
    // Unlike a star, there are no straight flanks or pointed tips.
    const scale=Math.min(1,Math.min(w,d)/1.1);
    for(let j=0;j<segments;j++) {
      const theta=j/segments*Math.PI*2,side=theta-Math.PI/6;
      const lobe=1-(.5-.5*Math.cos(6*side))**tuning.lobeBreadth;
      const roundHex=.94+.06*Math.cos(6*theta);
      const x=w/2*Math.cos(theta)*roundHex,z=d/2*Math.sin(theta)/Math.sin(Math.PI/3)*roundHex;
      const radius=Math.hypot(x,z),overhang=scale*(tuning.shoulder+tuning.flare*lobe+tuning.scallop*lobe*Math.cos(18*side));
      const point=[x*(1+overhang/radius),z*(1+overhang/radius)];
      border.push(point);halfW=Math.max(halfW,Math.abs(point[0]));halfD=Math.max(halfD,Math.abs(point[1]));
    }
    size=[halfW*2,halfD*2];uv[0]=uv[1]=.5;
    for(let ring=1;ring<=rings;ring++) for(let j=0;j<segments;j++) {
      // Concentrate samples on the curved/hanging panels; the flat core
      // needs fewer. Denser edge sampling without a larger vertex budget.
      const i=1+(ring-1)*segments+j,r=Math.sin(ring/rings*Math.PI/2);
      flat[i*2]=border[j][0]*r;flat[i*2+1]=border[j][1]*r;
      uv[i*2]=.5+flat[i*2]/size[0];uv[i*2+1]=.5-flat[i*2+1]/size[1];
      const outer=Math.max(0,(r-.55)/.45);
      free[i]=outer*outer*(3-2*outer);
      phase[i]=j/segments*Math.PI*4+.45*Math.sin(j/segments*Math.PI*6);
    }
    geometry.attributes.uv.needsUpdate=true;
    return true;
  }
  // Nearest point on the real convex hex top. Flat within; wraps around all
  // six edges outside it (including corners and arbitrary drag directions).
  function supportAt(x,z,result) {
    let inside=true,best=Infinity,bx=x,bz=z;
    for(let j=0;j<6;j++) {
      const [ax,az]=outline[j],[cx,cz]=outline[(j+1)%6],dx=cx-ax,dz=cz-az;
      if(dx*(z-az)-dz*(x-ax)<-1e-8) inside=false;
      const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
      const px=ax+t*dx,pz=az+t*dz,dist=(x-px)**2+(z-pz)**2;
      if(dist<best){best=dist;bx=px;bz=pz;}
    }
    result.x=inside?x:bx;result.z=inside?z:bz;
    return result;
  }
  return {geometry,flat,free,phase,border,tuning,update,supportAt,
    get size(){return size;},get outline(){return outline;}};
}
