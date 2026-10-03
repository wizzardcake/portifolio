import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import {createRoomArchitecture,architectureTuning} from '../room-architecture.js';

const stair={from:-12*Math.PI/180,step:10*Math.PI/180,rise:.19,inner:.70,count:14};
const tower={x:2.05,z:-2,r:1.35};
const alcove={x:-1,halfWidth:.65,sill:0,shoulder:1.65,peak:2.25,back:-3.2};
const aperture={x:-1,halfWidth:.42,sill:.5,shoulder:1.45,peak:2};
const lancets=[-25,-50,-75].map(degrees=>{
  const at=degrees*Math.PI/180,halfWidth=.18;
  const sill=Math.round(((Math.floor((stair.from-at+halfWidth/tower.r)/stair.step)+1)*stair.rise+.18)*100)/100;
  return {at,halfWidth,sill,shoulder:sill+1.5,peak:sill+1.85};
});
const input={stair,tower,alcove,aperture,lancets,roomBack:-2.6},before=JSON.stringify(input);
const model=createRoomArchitecture(THREE,input);
assert.equal(JSON.stringify(input),before,'Architecture dressings never mutate the plan or flight dimensions');
assert.ok(model.stats.triangles<2700,'Bounded detail budget');
assert.equal(model.stats.profiles,5);assert.equal(model.stats.windows,4);assert.equal(model.stats.railBays,7);
for(const key of ['stone','metal','handrail']) for(const name of ['position','normal','uv']) {
  assert.ok(Array.from(model[key].attributes[name].array).every(Number.isFinite),key+' has finite '+name);
}
// Deepest back reveal must match the wall's actual pointed quadratic. This
// catches a subtly different arch curve that would put a moulding in the sky.
const p=model.stone.attributes.position;let revealPoints=0;
for(let i=0;i<p.count;i++) if(Math.abs(p.getZ(i)-(alcove.back-architectureTuning.revealDepth))<1e-5) {
  const x=Math.abs(p.getX(i)-aperture.x),y=p.getY(i);
  assert.ok(x<=aperture.halfWidth+1e-5);
  if(y>aperture.shoulder+1e-5) {
    const t=Math.sqrt(Math.max(0,1-x/aperture.halfWidth)),c=aperture.shoulder+.6*(aperture.peak-aperture.shoulder);
    const expected=aperture.shoulder*(1-t)**2+2*c*t*(1-t)+aperture.peak*t*t;
    assert.ok(Math.abs(y-expected)<1e-5,'Reveal and wall share exactly the same arch');
  }
  revealPoints++;
}
assert.ok(revealPoints>20);
const mesh=new THREE.Mesh(model.stone,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();
const ray=new THREE.Raycaster();
for(const x of [-.25,0,.25]) {
  ray.set(new THREE.Vector3(aperture.x+x,1.15,-2.95),new THREE.Vector3(0,0,-1));ray.far=.65;
  assert.equal(ray.intersectObject(mesh).length,0,'Main window stays a real clear opening');
}
for(const w of lancets) {
  ray.set(new THREE.Vector3(tower.x,w.shoulder-.2,tower.z),new THREE.Vector3(Math.cos(w.at),0,Math.sin(w.at)));ray.far=1.7;
  assert.equal(ray.intersectObject(mesh).length,0,'Tower frames do not fill the lancets');
}
assert.ok(architectureTuning.greenAngle<.4&&architectureTuning.upperReach<1.6,'Green spill remains local and directional');
console.log('PASS: unchanged plan, four clear openings, true arch/reveal registration, seven rail bays, finite buffers, detail budget',model.stats);
