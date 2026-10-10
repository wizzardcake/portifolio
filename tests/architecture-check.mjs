import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import {createRoomArchitecture,architectureTuning} from '../room-architecture.js';
import {chamberTuning} from '../room-chamber.js';
import {towerLayout} from '../room-tower.js';

// The chamber's plan (room-scene.js, room-chamber.js): the great window on
// its back bay's plane, the door opposite; the stair tower back right, its
// stair and lancets as room-scene.js builds them (room-tower.js).
const {tower,stair,lancets}=towerLayout(chamberTuning);
const back={z:-4};
const aperture={x:0,halfWidth:.82,sill:.8,shoulder:3.6,peak:4.9};
const door={x:0,halfWidth:.74,sill:0,shoulder:1.26,peak:2.54};

// The tower's own plan: wider than its bay, grown outward. It reaches no
// further into the chamber than the bay's plane, and its stair is one a
// visitor can climb: a metre-wide tread round an open shaft, an ordinary
// pitch at the walking line, the narrowest walked part still a full step.
{
  const A=chamberTuning.apothem,out=Math.hypot(tower.x,tower.z);
  assert.ok(out-tower.r>A-.05,'The tower stays outside the chamber: it reaches '+(A-(out-tower.r)).toFixed(3)+' m into it');
  assert.ok(tower.r>=1.6,'The tower is wide enough to climb in: radius '+tower.r);
  assert.ok(tower.r-stair.inner>=.95,'The treads are about a metre wide');
  const going=rho=>rho*Math.abs(stair.step),walk=(stair.inner+tower.r)/2;
  assert.ok(going(walk)>=.25&&going(walk)<=.32,'At the walking line each step is 0.25 to 0.32 m deep: '+going(walk).toFixed(3));
  assert.ok(2*stair.rise+going(walk)>=.6&&2*stair.rise+going(walk)<=.68,'Rise and going make an ordinary stair (2R+G about 0.63 m)');
  assert.ok(going(stair.inner+.03+.26)>=.2,'Beside the handrail a step is still 0.2 m deep');
  assert.equal(Math.round((stair.count+1)*stair.rise*100),285,'The flight arrives at the gallery\'s level');
}
// Planar maps for the two flat bays: u to the right as seen from the room,
// depth toward it.
const windowMap=(u,y,depth)=>new THREE.Vector3(aperture.x+u,y,back.z+depth);
const doorMap=(u,y,depth)=>new THREE.Vector3(door.x-u,y,4-depth);
const input={stair,tower,aperture,windowMap,door,doorMap,lancets},before=JSON.stringify(input);
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
for(let i=0;i<p.count;i++) if(Math.abs(p.getZ(i)-(back.z-architectureTuning.revealDepth))<1e-5) {
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
for(const x of [-.6,-.25,.25,.6]) {
  ray.set(new THREE.Vector3(aperture.x+x,1.15,back.z+.25),new THREE.Vector3(0,0,-1));ray.far=.65;
  assert.equal(ray.intersectObject(mesh).length,0,'Main window stays a real clear opening');
}
for(const w of lancets) {
  ray.set(new THREE.Vector3(tower.x,w.shoulder-.2,tower.z),new THREE.Vector3(Math.cos(w.at),0,Math.sin(w.at)));ray.far=tower.r+.55;
  assert.equal(ray.intersectObject(mesh).length,0,'Tower frames do not fill the lancets');
}
assert.ok(architectureTuning.greenAngle<.4&&architectureTuning.upperReach<1.6,'Green spill remains local and directional');
console.log('PASS: unchanged plan, four clear openings, true arch/reveal registration, seven rail bays, finite buffers, detail budget',model.stats);
