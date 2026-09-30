// Fast geometric checks; browser composition is covered by portal-check.
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import {createRitualTable} from '../table-model.js';

const table=createRitualTable(THREE,null), view={units:480,tableHeight:.46};
// Sample baked triangle geometry directly, independent of browser/raycaster.
function surfacesAt(x,z) {
  const heights=[];
  for(const mesh of table.group.children) {
    const p=mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i+=3) {
      const ax=p.getX(i),az=p.getZ(i),bx=p.getX(i+1),bz=p.getZ(i+1),cx=p.getX(i+2),cz=p.getZ(i+2);
      const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
      if(Math.abs(den)<1e-10)continue;
      const a=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den;
      const b=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den,c=1-a-b;
      if(Math.min(a,b,c)>=-1e-6)heights.push(a*p.getY(i)+b*p.getY(i+1)+c*p.getY(i+2));
    }
  }
  return heights;
}
for(const [width,aspect] of [[880,1.47],[270,1.10],[1100,1.47]]) {
  const height=width/aspect,radius=Math.min(width,height)*.41;
  const shape={width,height,radius,outline:[[-width/4,-height/2],[width/4,-height/2],[width/2,0],
    [width/4,height/2],[-width/4,height/2],[-width/2,0]]};
  view.units=width<300?300:480;
  table.update(shape,view); table.group.updateMatrixWorld(true);
  const builds=table.stats.builds;
  table.update(shape,view);assert.equal(table.stats.builds,builds,'Idle/camera draws do not rebuild the table');
  assert.equal(table.stats.meshes,4);assert.ok(table.stats.triangles<2800);
  for(const mesh of table.group.children) {
    assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite),'Finite geometry');
    assert.ok([...mesh.geometry.attributes.normal.array].every(Number.isFinite),'Finite lighting normals');
  }
  assert.equal(surfacesAt(0,0).length,0,'The portal is a real through-hole, with no slab or support underneath');
  const collar=Math.max(...surfacesAt(radius/view.units+.018,0));
  assert.ok(Math.abs(collar-view.tableHeight)<.005,'The crafted collar remains at knee height');
  const box=new THREE.Box3().setFromObject(table.group);
  assert.ok(box.min.y>=0 && box.max.y<.47,'The artifact sits on the floor, never changing table height');
}
console.log('PASS: desktop/portrait geometry, real circular hole, collar height, finite normals, four-mesh budget and cached rebuilds');
