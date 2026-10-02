import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import {createRitualCloth} from '../ritual-cloth.js';

const cloth=createRitualCloth(THREE),support={};
for(const [w,d] of [[1.8334,1.2472],[.894,.813],[2.3,1.565]]) {
  assert.equal(cloth.update(w,d),true);
  assert.equal(cloth.update(w,d),false,'No idle geometry rebuild');
  assert.ok(cloth.geometry.attributes.position.count<3900,'Same mesh budget as the old cloth');
  assert.equal(cloth.border.length,192);
  assert.deepEqual(cloth.supportAt(0,0,support),{x:0,z:0},'Centre remains flat');
  for(const [x,z] of cloth.outline) {
    cloth.supportAt(x,z,support);
    assert.ok(Math.hypot(support.x-x,support.z-z)<1e-7,'All six corners supported');
  }
  for(let j=0;j<cloth.border.length;j++) {
    const [x,z]=cloth.border[j];cloth.supportAt(x,z,support);
    assert.ok(Math.hypot(x-support.x,z-support.z)>.035,'Continuous hem beyond every table edge');
    const opposite=cloth.border[(j+cloth.border.length/2)%cloth.border.length];
    assert.ok(Math.hypot(x+opposite[0],z+opposite[1])<1e-6,'Balanced six-panel cut');
  }
  for(const n of cloth.geometry.attributes.uv.array) assert.ok(n>=-1e-6&&n<=1.000001,'Material UVs stay in the texture');
  const indices=cloth.geometry.index.array,flat=cloth.flat;
  let area=0;
  for(let j=0;j<indices.length;j+=3) {
    const [a,b,c]=[indices[j]*2,indices[j+1]*2,indices[j+2]*2];
    const cross=(flat[b+1]-flat[a+1])*(flat[c]-flat[a])-(flat[b]-flat[a])*(flat[c+1]-flat[a+1]);
    assert.ok(cross>0,'No inverted or degenerate pattern triangles');area+=cross/2;
  }
  assert.ok(area>w*d*.75,'The whole hex top is covered');
  // A point beyond the diagonal edge must wrap there, not hang from the
  // obsolete rectangle's far corner.
  cloth.supportAt(w*.46,d*.43,support);
  assert.ok(support.x<w*.46 && support.z<d*.43,'Diagonal support edge is active');
}
console.log('PASS: desktop/mobile pattern, six balanced scalloped panels, hex support, UVs, winding, coverage and mesh budget');
