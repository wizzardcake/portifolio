/* Living orb architecture. Exterior-only OffscreenCanvas renderer.
   All geometry, currents and choreography run in this worker. No room imports.
   Time is visible animation time; formation finishes at 6.6 s before entry.
   CPU/GPU resources belong exclusively to this worker. */
'use strict';
const FORMATION = 6.6, ENTRY = {approach:2.6, arrival:2, curtains:1.4, walk:5};
const TAU = Math.PI*2;
// One scale for the whole building, that of the room inside it
// (room-chamber.js, room-tower.js): 0.246 to a metre, so the chamber's outer
// wall (4.35 m from its centre) is the body's widest, 1.07. The room's floor,
// the door's sill, is y -0.78 here.
const S = .246, FLOOR = -.78;
const at = metres => FLOOR + metres*S;
// The body is drawn 0.291 to a metre upward (its walls rise to the room's
// springing, 3.9 m, its dome to the vault's crown) and brought down to the one
// scale as it is placed (squash), so its formation keeps its shape and timing.
const K = S/.291, squash = y => FLOOR + (y-FLOOR)*K;
// The orb's core over the dome: as drawn, and where it stands.
const CORE = [-.06,1.72,.08], CORE_AT = [CORE[0],squash(CORE[1]),CORE[2]];
// The stair tower: its drum (1.70 m inside, a 0.35 m wall) stands 5.69 m from
// the chamber's centre, back right (-30 degrees), from below the floor up to
// its roof at 7 m; a tall, concave spire above.
const TOWER = [4.926*S, 0, -2.844*S], TOWER_R = 2.05*S, TOWER_BASE = FLOOR-.3, TOWER_ROOF = at(7), TOWER_TIP = at(11.7);
// The doorway: the room's own (room-chamber.js OPEN.door), 0.74 m either side
// of its axis, straight jambs to 1.26 m, then two quadratic curves to its
// peak at 2.54 m, drawn as the room draws it, so the two meet exactly. It is
// at the end of the room's passage (the wall, and a metre beyond it): 5.35 m
// from the chamber's centre (`plane`), the face of a porch grown out of the
// body (PORCH), whose passage runs back into the body to `back`.
const DOOR = {a:.74*S, sill:FLOOR, shoulder:at(1.26), peak:at(2.54), plane:5.35*S, back:3.7*S};
const PORCH = {a:1.18*S, sill:FLOOR, shoulder:at(1.8), peak:at(3.5)}, FRAME = {a:.86*S, sill:FLOOR, shoulder:at(1.26), peak:at(2.72)};
const control = w => w.shoulder + .6*(w.peak-w.shoulder);
// The landing, a tongue of glass before the door at the floor's level.
const PLATFORM = {z:DOOR.plane-.01, length:1.72, y:FLOOR-.04, thick:.04};
// The room's terms (scene-camera.js wayIn and entryView): x right, y up from
// the floor and z toward the door, in metres, with the table at the origin
// and the chamber's centre at z 0.3 (room-scene.js placement); yaw (left
// positive) and tilt (down positive) in degrees; lens, where the view's
// centre sits, a share of its height. The walk in starts on the landing
// (LANDING m before the door) and ends on the entry's own view, sent by the
// gate; the room's camera follows this one all the way.
const ROOM_Z = .3, DOOR_Z = 5.35 + ROOM_Z, LANDING = 2.6;
const world = (x,y,z) => [x*S, at(y), (z-ROOM_Z)*S];
let entry = {x:0, y:1.7, z:3.4, yaw:0, tilt:4.8, lens:.5, fov:72};
// GLSL literals.
// (Negative values in parentheses: "y--0.5" would read as a decrement.)
const f = v => (v<0?'('+(+v).toFixed(4)+')':(+v).toFixed(4)), v3 = a => 'vec3('+a.map(f).join(',')+')';
let gl, pg, meshes, canvas, width=1,height=1,screenW=1,screenH=1,dpr=1;
let disposed=false, paused=false, reduced=false, first=true, formed=false, flight=null, sentView='', lighter=false;
let time=0,last=null,rate=1,handle=0, lastDraw=-100,phase='',statsAt=0;
let metrics={frames:0,frameGaps:[],cpuMs:[],gpuMs:[],triangles:0,drawCalls:0}, query=null, ext=null;
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const add=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const norm=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const forward=(yaw,tilt)=>{const y=yaw*Math.PI/180,t=tilt*Math.PI/180;return[-Math.sin(y)*Math.cos(t),-Math.sin(t),-Math.cos(y)*Math.cos(t)];};
const send=(type,detail={})=>postMessage({type,...detail});
function setPhase(value){if(phase!==value){phase=value;send('phase',{phase,time});}}
function lathe(radius,top,bottom,rows,segments,center=[0,0,0]){
 const p=[],n=[],ix=[];
 for(let i=0;i<=rows;i++){
  const y=top+(bottom-top)*i/rows,r=Math.max(0,radius(y)),e=.002;
  const slope=(Math.max(0,radius(y+e))-Math.max(0,radius(y-e)))/(2*e);
  for(let j=0;j<=segments;j++){
   const a=j/segments*TAU,c=Math.cos(a),s=Math.sin(a),nn=norm([c,-slope,s]);
   p.push(center[0]+r*c,center[1]+y,center[2]+r*s);n.push(...nn);
  }
 }
 for(let i=0;i<rows;i++)for(let j=0;j<segments;j++){const a=i*(segments+1)+j,b=a+segments+1;ix.push(a,b,a+1,a+1,b,b+1);}
 return {p,n,ix};
}
function bodyRadius(y){
 if(y>.38)return 1.07*Math.sqrt(Math.max(0,1-((y-.38)/.91)**2));
 if(y>-.79){
  const belly=1.07-.12*((y-.38)/1.17)**2;
  const lip=.025*Math.exp(-(((y+.20)/.045)**2))+.035*Math.exp(-(((y+.77)/.05)**2));
  return belly+lip;
 }
 const u=clamp((-y-.79)/.5);
 return .95*Math.pow(1-u,.68);
}
function towerRadius(y){
 // The roof: a tall, concave spire flaring out over the drum at its eaves.
 if(y>TOWER_ROOF)return TOWER_R*1.13*Math.pow(clamp((TOWER_TIP-y)/(TOWER_TIP-TOWER_ROOF)),1.75)+.003;
 // Below the floor it rounds off underneath, as the body does.
 if(y<FLOOR)return TOWER_R*1.03*Math.pow(clamp((y-TOWER_BASE)/(FLOOR-TOWER_BASE)),.68);
 // The drum, narrowing a little as it rises, with a band where the upper
 // floor is inside (2.85 m) and a cornice under the eaves.
 const u=clamp((y-FLOOR)/(TOWER_ROOF-FLOOR));
 const band=.016*Math.exp(-(((y-at(2.85))/.018)**2)),cornice=.024*Math.exp(-(((y-TOWER_ROOF+.035)/.03)**2));
 return TOWER_R*(1.03-.07*u)+band+cornice;
}
// A pointed arch as the room draws it (room-chamber.js outline): from the
// sill's left end up the jamb, over the two quadratic curves and down.
function arch(w=DOOR,steps=18){
 const c=control(w),y=t=>w.shoulder*(1-t)**2+2*c*t*(1-t)+w.peak*t*t,pts=[[-w.a,w.sill],[-w.a,w.shoulder]];
 for(let i=1;i<=steps;i++){const t=i/steps;pts.push([-w.a*(1-t*t),y(t)]);}
 for(let i=steps-1;i>=0;i--){const t=i/steps;pts.push([w.a*(1-t*t),y(t)]);}
 pts.push([w.a,w.sill]);return pts;
}
// Its top at x from the axis.
function archTop(w,x){const t=Math.sqrt(Math.max(0,1-Math.abs(x)/w.a));return w.shoulder*(1-t)**2+2*control(w)*t*(1-t)+w.peak*t*t;}
// A strip of faces along an outline, from depth z0 to z1.
function extrude(pts,z0,z1,into,mesh={p:[],n:[],ix:[]}){
 const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cy=pts.reduce((s,p)=>s+p[1],0)/pts.length;
 for(let i=0;i<pts.length-1;i++){
  const [x,y]=pts[i],[xx,yy]=pts[i+1],b=mesh.p.length/3;let nn=norm([y-yy,xx-x,0]);
  if((nn[0]*((x+xx)/2-cx)+nn[1]*((y+yy)/2-cy)<0)!==into)nn=nn.map(v=>-v);
  mesh.p.push(x,y,z0,xx,yy,z0,x,y,z1,xx,yy,z1);for(let k=0;k<4;k++)mesh.n.push(...nn);mesh.ix.push(b,b+2,b+1,b+1,b+2,b+3);
 }
 return mesh;
}
// The porch: its outer surface from inside the body out to the door's face,
// and that face, a ring between its outline and the doorway's.
function porch(){
 const outer=arch(PORCH),inner=arch(DOOR),mesh=extrude(outer,DOOR.back,DOOR.plane,false);
 const b=mesh.p.length/3;
 for(let i=0;i<outer.length;i++){mesh.p.push(outer[i][0],outer[i][1],DOOR.plane,inner[i][0],inner[i][1],DOOR.plane);mesh.n.push(0,0,1,0,0,1);}
 for(let i=0;i<outer.length-1;i++){const a=b+2*i;mesh.ix.push(a,a+1,a+2,a+2,a+1,a+3);}
 return mesh;
}
// The passage through it: the doorway's outline back into the body, closed
// there in the same dark stone.
function passage(){
 const pts=arch(DOOR),mesh=extrude(pts,DOOR.plane,DOOR.back,true),b=mesh.p.length/3;
 mesh.p.push(0,(DOOR.sill+DOOR.shoulder)/2,DOOR.back);mesh.n.push(0,0,1);
 for(const [x,y] of pts){mesh.p.push(x,y,DOOR.back);mesh.n.push(0,0,1);}
 for(let i=0;i<pts.length;i++)mesh.ix.push(b,b+1+i,b+1+(i+1)%pts.length);
 return mesh;
}
// The doorway's frame: a round moulding standing on the porch's face.
function frame(){
 const pts=arch(FRAME),p=[],n=[],ix=[],rings=10,r=.021;
 pts.forEach(([x,y],i)=>{
  const b=pts[Math.max(0,i-1)],a=pts[Math.min(pts.length-1,i+1)],nn=norm([a[1]-b[1],b[0]-a[0],0]);
  for(let k=0;k<=rings;k++){const t=k/rings*TAU,c=Math.cos(t),s=Math.sin(t);p.push(x+nn[0]*r*c,y+nn[1]*r*c,DOOR.plane+.004+r*s);n.push(nn[0]*c,nn[1]*c,s);}
 });
 for(let i=0;i<pts.length-1;i++)for(let k=0;k<rings;k++){const a=i*(rings+1)+k,b=a+rings+1;ix.push(a,b,a+1,a+1,b,b+1);}
 return{p,n,ix};
}
function curtain(side){
 const p=[],n=[],ix=[],cols=36,rows=42;
 for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){
  const u=j/cols,x=side*DOOR.a*u,top=archTop(DOOR,x),v=i/rows;
  p.push(x,top+(DOOR.sill-top)*v,DOOR.plane-.02);n.push(0,0,1);
 }
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j,b=a+cols+1;ix.push(a,b,a+1,a+1,b,b+1);}
 return{p,n,ix};
}
function platform(){
 const p=[],n=[],ix=[],rows=40,cols=48,{z,length,y,thick}=PLATFORM;
 // Closed elliptical tongue with a convex top: genuine thickness at its lip.
 for(let i=0;i<=rows;i++){
  const v=i/rows,zz=z+length*v,w=.34+.22*Math.sin(v*Math.PI*.9);
  for(let j=0;j<=cols;j++){
   const a=j/cols*TAU,tip=Math.sqrt(Math.max(.001,1-v**6));
   p.push(w*Math.cos(a)*tip,y+thick*Math.sin(a)*tip,zz);n.push(Math.cos(a)*.2,Math.sin(a),v*.15);
  }
 }
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j,b=a+cols+1;ix.push(a,b,a+1,a+1,b,b+1);}
 return{p,n,ix};
}
const COMMON=`
float sat(float x){return clamp(x,0.,1.);}
float ease(float x){x=sat(x);return x*x*(3.-2.*x);}
float organic(vec3 p){return sin(p.x*2.8+sin(p.y*2.1))*sin(p.y*2.4+sin(p.z*2.7))*sin(p.z*2.2+sin(p.x*2.3));}
float archSDF(vec2 p,float a,float spring,float sill){
 float upper=max(max(length(p-vec2(a,spring))-2.*a,length(p-vec2(-a,spring))-2.*a),sill-p.y);
 vec2 d=abs(p-vec2(0.,(spring+sill)*.5))-vec2(a,(spring-sill)*.5);
 return min(upper,min(max(d.x,d.y),0.)+length(max(d,0.)));
}
// The doorway, as arch() draws it: negative inside.
float doorHalf(float y){
 if(y<=${f(DOOR.shoulder)})return ${f(DOOR.a)};
 if(y>=${f(DOOR.peak)})return 0.;
 float qa=${f(DOOR.shoulder-2*control(DOOR)+DOOR.peak)},qb=${f(2*(control(DOOR)-DOOR.shoulder))},qc=${f(DOOR.shoulder)}-y;
 float t=(-qb+sqrt(max(0.,qb*qb-4.*qa*qc)))/(2.*qa);
 return ${f(DOOR.a)}*(1.-t*t);
}
float doorway(vec2 p){return max(max(abs(p.x)-doorHalf(p.y),${f(DOOR.sill)}-p.y),p.y-${f(DOOR.peak)});}
`;
const VERTEX=`precision highp float;
attribute vec3 position,normal;
uniform mat4 vp;
uniform float time,age,part,curtains,stillness;
varying vec3 P,N,O;
${COMMON}
vec3 deform(vec3 p){
 float dome=ease((age-.65)/1.85),walls=ease((age-2.1)/1.9),tower=ease((age-3.05)/2.1),entry=ease((age-4.85)/.65),landing=ease((age-5.45)/1.15);
 float rhythm=pow(.5-.5*cos(time*.78),2.)*(1.-stillness);
 float life=.034*rhythm;
 if(part<.5){
  float roof=step(.38,p.y);
  p.xz*=max(.001,dome);
  p.y=mix(1.50,mix(.38,p.y,roof+(1.-roof)*walls),dome);
  float anchor=exp(-pow(position.x/.46,4.))*smoothstep(.5,.85,position.z)*(1.-smoothstep(.40,.70,abs(position.y+.2)));
  float bodyLife=life*(1.-anchor);
  float ripple=sin(position.y*5.-time*1.15+position.x*1.6)*.5+sin(position.z*3.+time*.64)*.5;
  p.xz*=1.+bodyLife*(.6+ripple);
  p.y+=bodyLife*.55*sin(position.x*2.4+time*.7)*smoothstep(-.78,.2,position.y);
  p.y=${f(FLOOR)}+(p.y-${f(FLOOR)})*${f(K)};
 }else if(part<1.5){
  vec3 q=p-${v3(TOWER)};
  float h=sat((q.y-${f(TOWER_BASE)})/${f(TOWER_TIP-TOWER_BASE)}),grow=ease(tower*1.3-h*.3);
  float twist=(1.-tower)*5.*h*h+life*7.*h+1.5*h;
  float c=cos(twist),s=sin(twist);
  q.xz=mat2(c,-s,s,c)*q.xz*vec2(1.08,.94)*max(.001,grow);
  q.xz+=vec2(sin(h*7.5+time*.25*rhythm),cos(h*7.5+time*.25*rhythm))*.085*h*h*tower;
  q.y=mix(-.35,q.y,tower);
  p=q+${v3(TOWER)};
 }else if(part<3.5||part>8.5){
  // The doorway, its passage and porch open out from the door's axis.
  p.x*=max(.001,entry);p.y=mix(${f(DOOR.sill)},p.y,entry);
 }else if(part<4.5){
  p.x*=max(.001,landing);p.z=mix(${f(PLATFORM.z)},p.z,landing);
  float tip=sat((position.z-${f(PLATFORM.z)})/${f(PLATFORM.length)});
  p.y+=(1.-landing)*sin(tip*3.14159)*.45+life*.35*sin(time*.8+tip*3.)*tip;
 }else if(part<5.5){
  float pulse=1.+.065*sin(time*1.5)*(1.-stillness);
  p=(p-${v3(CORE)})*pulse+${v3(CORE_AT)};
 }else if(part<7.5){
  float side=part<6.5?-1.:1.;
  float u=abs(p.x)/${f(DOOR.a)},v=sat((p.y-${f(DOOR.sill)})/${f(DOOR.peak-DOOR.sill)});
  // Gather each fitted panel toward its own jamb, with a slack scalloped edge.
  float opening=ease(curtains);
  p.x=side*mix(abs(p.x),${f(DOOR.a*.88)}+abs(p.x)*.21,opening);
  p.y+=opening*.075*(1.-u)*(1.-v);
  p.z+=.018*sin(u*17.+v*1.1)+.012*sin(time*1.5+u*8.+v*3.)*(1.-stillness)*(1.-v);
  p.x+=side*.007*sin(time*1.2+v*5.)*(1.-stillness)*(1.-u)*(1.-v);
 }else{
  float u=sat((position.y-1.22)/.38);
  p.x-=.06*u;
  p.y=mix(1.56,p.y,dome);
  p.xz*=.55+.45*(1.-ease((age-5.2)/1.4));
  p.y=${f(FLOOR)}+(p.y-${f(FLOOR)})*${f(K)};
 }
 return p;
}
void main(){
 O=position;P=deform(position);
 vec3 n=normalize(normal),t=normalize(cross(n,abs(n.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.))),b=cross(n,t);
 N=normalize(cross(deform(position+t*.003)-P,deform(position+b*.003)-P));
 gl_Position=vp*vec4(P,1.);
}
`;
const FRAGMENT=`#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec3 P,N,O;
uniform vec3 eye;
uniform float time,age,part,curtains,reveal,stillness;
${COMMON}
vec3 tonemap(vec3 c){return pow(1.-exp(-max(c,0.)*1.1),vec3(.4545));}
vec3 current(vec3 q,float layer){
 float spin=time*(.095-layer*.016)+q.y*.8+length(q)*.48;
 float c=cos(spin),s=sin(spin);q.xz=mat2(c,-s,s,c)*q.xz;
 float warp=organic(q*.83+vec3(0.,time*.035,layer*1.7));
 vec2 whorl=q.xy-vec2(-.18,.35);float radius=length(whorl);
 float angle=atan(whorl.y,whorl.x)+q.z*.55;
 float f=sin(angle*2.+radius*11.+warp*1.5-time*.23+layer*1.1);
 float ribbon=pow(1.-abs(f),12.);
 float broad=pow(1.-abs(f),3.);
 float cloud=.5+.5*organic(q*1.12+vec3(3.2,layer,time*.027));
 vec3 tint=mix(vec3(.025,.34,.28),vec3(.15,.07,.28),smoothstep(.3,.9,cloud)*.65);
 return tint*(ribbon*.95+broad*.08)*(.25+.75*cloud)+vec3(.009,.039,.034)*cloud*cloud;
}
void main(){
 float entrance=ease((age-4.85)/.65);
 // (All but the curtains and the core's translucent feed.)
 bool solid=part<5.5||part>8.5;
 // The doorway is cut through the body's front shell (its own coordinates
 // brought to the one scale), where the porch's passage runs through it.
 if(part<.5&&O.z>.20&&doorway(vec2(O.x/max(.001,entrance),${f(FLOOR)}+(O.y-${f(FLOOR)})*${f(K)}))<0.)discard;
 // Through the door, the visitor is inside: the room takes over the view.
 if(eye.z<${f(DOOR.plane)}&&solid)discard;
 // Once the curtains part, all that is seen through the doorway gives way to
 // the room (loading-gate.js cuts the same arch out of the gate's backdrop).
 if(reveal>.001&&solid){
  vec3 ray=P-eye;float t=(${f(DOOR.plane)}-eye.z)/ray.z;
  if(t>0.&&t<1.&&doorway((eye+ray*t).xy)<0.)discard;
 }
 if(part<1.5&&age<.651)discard;
 if(part>.5&&part<1.5&&age<3.06)discard;
 if(part>1.5&&part<3.5&&age<4.86)discard;
 if(part>8.5&&age<4.86)discard;
 if(part>3.5&&part<4.5&&age<5.46)discard;
 if(part>5.5&&part<7.5&&age<5.35)discard;
 if(part>7.5&&part<8.5&&age<.66)discard;
 vec3 V=normalize(eye-P),nn=normalize(N);
 if(dot(nn,V)<0.)nn=-nn;
 vec3 n=nn;
 float ndv=max(.0,dot(n,V)),fres=pow(1.-ndv,4.);
 if(part>5.5&&part<7.5){
  float u=abs(O.x)/${f(DOOR.a)},v=sat((O.y-${f(DOOR.sill)})/${f(DOOR.peak-DOOR.sill)});
  float pleat=.5+.5*sin(u*17.+v*1.1),rim=pow(1.-ndv,2.);
  float thread=.5+.5*sin(u*380.);
  vec3 silk=mix(vec3(.016,.024,.035),vec3(.052,.073,.082),pleat*.65);
  silk+=vec3(.16,.12,.065)*pow(pleat,10.)*.18+vec3(.14,.25,.24)*rim*.3;
  silk*=.96+.04*thread;
  float hem=1.-smoothstep(.0,.014,min(v,1.-v));
  silk+=vec3(.26,.24,.15)*hem*.24;
  float a=.88+pleat*.09;
  gl_FragColor=vec4(tonemap(silk)*a,a);return;
 }
 if(part>4.5&&part<5.5){
  vec3 q=(O-${v3(CORE)})*5.8;
  float field=organic(q+vec3(time*.22,-time*.16,0.));
  float veins=pow(1.-abs(sin(q.y*3.+field*2.8+time*.4)),4.);
  float soft=1.-.35*ease((age-5.)/1.6);
  vec3 gold=mix(vec3(.7,.16,.008),vec3(1.8,.95,.16),.45+.45*field);
  gold+=vec3(1.,.63,.13)*veins*.6;
  gold*=soft*(.65+.35*ndv);
  gl_FragColor=vec4(tonemap(gold),1.);return;
 }
 if(part>7.5&&part<8.5){
  float a=.28+.4*(1.-ease((age-5.)/1.6));
  vec3 c=mix(vec3(.04,.3,.23),vec3(.5,.3,.045),ease((O.y-1.22)/.32));
  gl_FragColor=vec4(tonemap(c)*a,a);return;
 }
 vec3 q=O;
 if(part>.5&&part<1.5)q=(O-${v3(TOWER)})*vec3(1.6,1.0,1.6);
 // The passage through the porch: dark stone, as the room's own door passage.
 if(part>2.5&&part<3.5){
  float grain=.5+.5*organic(O*14.);
  vec3 stone=vec3(.016,.017,.020)*(.75+.5*grain)+vec3(.05,.045,.034)*pow(1.-ndv,3.)*.5;
  gl_FragColor=vec4(tonemap(stone),1.);return;
 }
 if(part>3.5&&part<4.5)q=O*vec3(1.,2.,1.);
 vec3 rd=refract(-V,n,.76);
 // Refracted material layers, no per-pixel volume march: spread further
 // apart in depth, so the currents part as the eye moves (depth), the near
 // ones brighter.
 vec3 inner=current(q+rd*.05,0.)*.78+current(q+rd*.38,1.)*.34+current(q+rd*.86,2.)*.19;
 inner+=current(q+rd*1.32,3.)*.10+current(q+rd*1.85,4.)*.05;
 float pocket=.5+.5*organic(q*2.1+vec3(time*.02,3.2,0.));
 inner*=.30+1.15*pocket*pocket;
 inner+=vec3(.013,.07,.05)*exp(-dot(q-vec3(0.,.35,0.),q-vec3(0.,.35,0.))*1.7);
 // The glass is thick: where it is seen straight on, light gathers in its
 // depth; toward its edges it darkens before the rim catches the sky.
 inner+=vec3(.006,.030,.025)*pow(ndv,1.6);
 inner*=.72+.28*smoothstep(.05,.55,ndv);
 vec3 L=normalize(vec3(-.65,1.,1.)),H=normalize(L+V);
 float highlight=pow(max(dot(n,H),0.),260.)*.8+pow(max(dot(n,H),0.),48.)*.055;
 vec3 color=inner*(1.-fres*.75)+vec3(.0015,.004,.004);
 color+=vec3(.65,.76,.70)*highlight;
 color+=mix(vec3(.018,.17,.12),vec3(.13,.055,.22),smoothstep(-.6,.6,n.x))*fres*.95;
 color+=vec3(.15,.085,.014)*max(0.,dot(n,normalize(${v3(CORE_AT)}-P)))*.085;
 // A restrained band marks the two floors; windows are light beneath glass.
 if(part<.5){
  float band=exp(-pow((O.y+.20)/.02,2.));
  color+=vec3(.06,.16,.13)*band*.24;
  if(O.z>.7){
   float wx=abs(O.x)-.62;
   float slit=1.-smoothstep(-.007,.01,archSDF(vec2(wx,O.y),.045,.14,-.055));
   color+=vec3(.09,.21,.18)*slit*.75;
  }
 }
 // The tower's lancets, stepped up with the stair inside (room-tower.js).
 if(part>.5&&part<1.5&&O.z>${f(TOWER[2]+.12)}){
  for(int i=0;i<3;i++){
   float sill=${f(at(1.13))}+float(i)*${f((at(2.46)-at(1.13))/2)},dx=(float(i)-1.)*.13;
   float w=1.-smoothstep(-.007,.012,archSDF(vec2(O.x-${f(TOWER[0])}+dx,O.y),.042,sill+.36,sill));
   color+=mix(vec3(.07,.23,.18),vec3(.15,.07,.25),float(i)*.35)*w*.8;
  }
 }
 if(part>1.5&&part<2.5){
  color*=.95;
  color+=vec3(.19,.105,.035)*pow(1.-ndv,2.)*.32;
 }
 // Golden capillary at the active growth front, gone when settled.
 float front=age<2.5?1.50-(age-.65)/1.85*1.12:.38-(age-2.1)/1.9*1.66;
 front=${f(FLOOR)}+(front-${f(FLOOR)})*${f(K)};
 float feeding=(1.-ease((age-5.2)/1.1))*ease((age-.65)/.4);
 color+=vec3(.25,.19,.04)*exp(-pow((P.y-front)/${f(.055*K)},2.))*feeding*.25;
 gl_FragColor=vec4(tonemap(color),1.);
}
`;


// The gate's void (loading-gate.css: its three gradients, its two layers of
// stars), drawn here from the flight on where nothing else is, so the
// doorway can open through it to the room: the page then needs no cut of its
// own, which it would repaint whole with every step.
const SKY_VS=`precision highp float;attribute vec2 pos;void main(){gl_Position=vec4(pos,1.,1.);}`;
const SKY_FS=`precision highp float;
uniform vec2 screen;uniform float scale,time,alpha;
float ring(vec2 p,vec2 at,vec2 r){return length((p-at)/r);}
float star(vec2 p,vec2 tile,vec2 at,float r){vec2 q=mod(p,tile)-tile*at;return max(0.,1.-length(q)/r);}
void main(){
 vec2 p=vec2(gl_FragCoord.x/scale,screen.y-gl_FragCoord.y/scale);
 float d=ring(p,screen*vec2(.5,.52),screen*vec2(.7,.62));
 vec3 c=d<.52?mix(vec3(.0706,.0471,.1333),vec3(.0314,.0235,.0588),d/.52):mix(vec3(.0314,.0235,.0588),vec3(.0118,.0078,.0235),min(1.,(d-.52)/.48));
 c=mix(c,vec3(.2,.098,.3216),.0784*max(0.,1.-ring(p,screen*vec2(.72,.66),screen*vec2(.44,.36))/.7));
 c=mix(c,vec3(.102,.2275,.2275),.1098*max(0.,1.-ring(p,screen*vec2(.3,.34),screen*vec2(.38,.3))/.7));
 vec2 a=vec2(420.,380.),b=vec2(260.,290.);
 float near=.55+.45*(.5-.5*cos(time*6.2832/11.)),far=.55+.45*(.5-.5*cos((time+6.)*6.2832/15.));
 vec3 s=vec3(.847,.91,1.)*.8*star(p,a,vec2(.12,.18),1.)+vec3(.784,.941,1.)*.667*star(p,a,vec2(.67,.09),1.)
  +vec3(.902,.847,1.)*.733*star(p,a,vec2(.38,.72),1.4)+vec3(1.)*.6*star(p,a,vec2(.84,.46),1.)
  +vec3(.749,.961,.902)*.667*star(p,a,vec2(.23,.58),1.)+vec3(1.)*.667*star(p,a,vec2(.54,.33),1.2);
 vec3 t=vec3(1.)*.4*star(p,b,vec2(.08,.64),1.)+vec3(.839,.784,1.)*.4*star(p,b,vec2(.46,.12),1.)
  +vec3(.784,1.,.941)*.4*star(p,b,vec2(.77,.81),1.)+vec3(1.)*.333*star(p,b,vec2(.91,.23),1.);
 c=mix(c,min(vec3(1.),c+s),near);c=mix(c,min(vec3(1.),c+t),far);
 gl_FragColor=vec4(c*alpha,alpha);
}`;
// The doorway's opening, cleared through to the room behind once the curtains part.
const HOLE_VS=`precision highp float;attribute vec3 position;uniform mat4 vp;void main(){gl_Position=vp*vec4(position,1.);}`;
const HOLE_FS=`precision highp float;void main(){gl_FragColor=vec4(0.);}`;
function hole(){
 const pts=arch(DOOR),p=[0,(DOOR.sill+DOOR.peak)/2,DOOR.plane],ix=[];
 for(const [x,y] of pts)p.push(x,y,DOOR.plane);
 for(let i=0;i<pts.length;i++)ix.push(0,1+i,1+(i+1)%pts.length);
 return{p,n:p.map(()=>0),ix};
}
const HALO_VS=`precision highp float;attribute vec2 pos;varying vec2 uv;uniform vec2 center,size;void main(){uv=pos;gl_Position=vec4(center+pos*size,0.,1.);}`;
const HALO_FS=`precision highp float;varying vec2 uv;uniform float strength;void main(){float r=dot(uv,uv);float a=exp(-r*5.)*smoothstep(1.,.7,sqrt(r))*strength;gl_FragColor=vec4(vec3(.9,.46,.045)*a,0.);}`;
function shader(kind,src){const s=gl.createShader(kind);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
function program(v,f){
 const p=gl.createProgram(),vs=shader(gl.VERTEX_SHADER,v),fs=shader(gl.FRAGMENT_SHADER,f);
 gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);
 if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
 const u={};for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++){const n=gl.getActiveUniform(p,i).name;u[n]=gl.getUniformLocation(p,n);}
 return{p,u,a:gl.getAttribLocation(p,'position'),n:gl.getAttribLocation(p,'normal'),pos:gl.getAttribLocation(p,'pos')};
}
function upload(data){
 const buffer=(target,value)=>{const b=gl.createBuffer();gl.bindBuffer(target,b);gl.bufferData(target,value,gl.STATIC_DRAW);return b;};
 metrics.triangles+=data.ix.length/3;
 return{p:buffer(gl.ARRAY_BUFFER,new Float32Array(data.p)),n:buffer(gl.ARRAY_BUFFER,new Float32Array(data.n)),ix:buffer(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(data.ix)),count:data.ix.length};
}
function resize(){
 // Crisp silhouettes at CSS resolution; moderate supersampling on high-DPR displays.
 // On the way in the room draws behind the doorway too, and the two share
 // the GPU: the glass, soft and close by then, is drawn at 70 % (from the
 // middle of the approach, where the eye moves fastest).
 const k=Math.min(dpr,1.5,Math.sqrt(1600000/(screenW*screenH)))*(lighter?.7:1);
 width=canvas.width=Math.round(screenW*k);height=canvas.height=Math.round(screenH*k);
 send('size',{width,height,cssWidth:screenW,cssHeight:screenH,scale:k});
}
// A view (vertical fov) whose centre sits at `lens` of its height from the
// top: the room's lens shift (scene-camera.js), so the two frames agree.
function matrix(eye,target,fov,lens=.5){
 const f=norm(sub(target,eye)),r=norm(cross(f,[0,1,0])),u=cross(r,f),t=1/Math.tan(fov/2),near=.015,far=40;
 const view=[r[0],u[0],-f[0],0,r[1],u[1],-f[1],0,r[2],u[2],-f[2],0,
 -r.reduce((s,v,i)=>s+v*eye[i],0),-u.reduce((s,v,i)=>s+v*eye[i],0),f.reduce((s,v,i)=>s+v*eye[i],0),1];
 const proj=[t/(width/height),0,0,0,0,t,0,0,0,2*lens-1,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0],m=new Float32Array(16);
 for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)m[c*4+row]+=proj[k*4+row]*view[c*4+k];
 return m;
}
function project(p,m){
 const c=[0,0,0,0];for(let i=0;i<4;i++)for(let j=0;j<4;j++)c[i]+=m[j*4+i]*(j===3?1:p[j]);
 return[(c[0]/c[3]*.5+.5)*screenW,(.5-c[1]/c[3]*.5)*screenH,c[3]];
}
function inside(points,x,y){
 let c=false;
 for(let i=0,j=points.length-1;i<points.length;j=i++){const [xi,yi]=points[i],[xj,yj]=points[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;}
 return c;
}
// The share of the way walked at share u of the walk's time: setting off
// over its first `a`, coming to rest over its last `b`, an even pace between,
// as the room's own walks go (scene-camera.js).
function walked(u,a=.2,b=.3){
 const rise=x=>x*x*x-x*x*x*x/2;u=clamp(u);
 const d=u<a?a*rise(u/a):u<=1-b?a/2+u-a:1-b-a/2+b*(.5-rise((1-u)/b));
 return d/(1-a/2-b/2);
}
// The landing before the door, at the entry's eye height, looking as the entry does.
const landing=()=>({x:0,y:entry.y,z:DOOR_Z+LANDING,yaw:0,tilt:entry.tilt,lens:.5});
function pose(){
 const rhythm=reduced?0:Math.pow(.5-.5*Math.cos(time*.78),2);
 // (Framed on the body and the tower together.)
 const far=[-.02+Math.sin(time*.21)*.10*rhythm,.40+Math.sin(time*.35)*.055*rhythm,6.7],look=[.28,.40,0];
 const fov=Math.max(.68,2*Math.atan(1.86/(screenW/screenH*6.7)));
 if(!flight)return{eye:far,target:look,fov,lens:.5,curtain:0,reveal:0,fade:0,sky:0,view:null};
 const t=time-flight.start,sky=smooth(t/.6),A=ENTRY.approach,B=A+ENTRY.arrival,C=B+ENTRY.curtains,D=C+ENTRY.walk,lens=entry.fov*Math.PI/180;
 // A view in the room's terms, here (looking on to the doorway from outside).
 const seen=v=>{const eye=world(v.x,v.y,v.z);return{eye,target:add(eye,forward(v.yaw,v.tilt),Math.max(.5,v.z-DOOR_Z+.5)*S),fov:lens,lens:v.lens};};
 const start=landing();
 if(t<A){
  setPhase('approach');const u=smooth(t/A),end=seen(start);
  if(!lighter&&t>A/2){lighter=true;resize();}
  // The room's camera already waits on the landing, unseen: its first view
  // from outside (with all it has never drawn from its entry) is drawn now,
  // while the building flies on in this thread, not as the curtains part.
  return{eye:lerp(flight.eye,end.eye,u),target:lerp(flight.target,end.target,u),fov:flight.fov+(lens-flight.fov)*u,lens:.5,curtain:0,reveal:0,fade:0,sky,view:start,waiting:true};
 }
 let view=start,opening=0,reveal=0;
 if(t<B)setPhase('arrival');
 else if(t<C){setPhase('curtains');opening=smooth((t-B)/ENTRY.curtains);reveal=1;}
 else{
  // Through the doorway and the passage to the entry: the room's own view at
  // the end, turned and framed as the entry is.
  setPhase('walk');opening=1;reveal=1;
  const s=walked((t-C)/ENTRY.walk),k=smooth(s);
  view={x:start.x+(entry.x-start.x)*s,y:start.y+(entry.y-start.y)*s,z:start.z+(entry.z-start.z)*s,
   yaw:start.yaw+(entry.yaw-start.yaw)*k,tilt:start.tilt+(entry.tilt-start.tilt)*k,lens:start.lens+(entry.lens-start.lens)*k};
  if(t>=D&&!flight.done){flight.done=true;send('flown',{time});}
 }
 return{...seen(view),curtain:opening,reveal,fade:view.z<DOOR_Z?1:0,sky,view};
}
function part(mesh,id){
 const g=pg.glass;gl.uniform1f(g.u.part,id);
 gl.bindBuffer(gl.ARRAY_BUFFER,mesh.p);gl.enableVertexAttribArray(g.a);gl.vertexAttribPointer(g.a,3,gl.FLOAT,false,0,0);
 gl.bindBuffer(gl.ARRAY_BUFFER,mesh.n);gl.enableVertexAttribArray(g.n);gl.vertexAttribPointer(g.n,3,gl.FLOAT,false,0,0);
 gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.ix);gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_SHORT,0);metrics.drawCalls++;
}
function report(){send('stats',{...metrics,phase,time,width,height,reduced,paused,formation:FORMATION,entry:ENTRY});}
function render(){
 const begun=performance.now(),age=reduced?FORMATION:time;
 if(!flight){
  setPhase(age<.65?'core':age<2.5?'dome':age<3.65?'walls':age<5.15?'tower':age<5.5?'entrance':age<FORMATION?'landing':'waiting');
 }
 const camera=pose(),m=matrix(camera.eye,camera.target,camera.fov,camera.lens);
 // The doorway on screen (CSS pixels), where the room is seen. Covered: it
 // fills the view (or the eye is through it).
 let points=null,covered=false;
 if(camera.view){
  points=arch().map(([x,y])=>project([x,y,DOOR.plane],m));
  covered=camera.fade>=1||!points.every(p=>p[2]>.001)||[[0,0],[screenW,0],[0,screenH],[screenW,screenH]].every(([x,y])=>inside(points,x,y));
 }
 // The room's camera follows this one from the landing on (scene-camera.js
 // wayIn; it waits there through the approach), so the room is seen through
 // the doorway from where the visitor is; until the doorway fills the view,
 // the room need only draw within it (clip).
 if(camera.view){
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.max(0,Math.floor(Math.min(...xs))-2),y=Math.max(0,Math.floor(Math.min(...ys))-2);
  const clip=covered||camera.waiting?null:{x,y,width:Math.max(0,Math.min(screenW,Math.ceil(Math.max(...xs))+2)-x),height:Math.max(0,Math.min(screenH,Math.ceil(Math.max(...ys))+2)-y)};
  const view={...camera.view,clip},key=JSON.stringify(view);
  if(key!==sentView){sentView=key;send('view',{view});}
 }
 if(ext&&query&&ext.getQueryObjectEXT(query,ext.QUERY_RESULT_AVAILABLE_EXT)){
  if(!gl.getParameter(ext.GPU_DISJOINT_EXT)){metrics.gpuMs.push(ext.getQueryObjectEXT(query,ext.QUERY_RESULT_EXT)/1e6);if(metrics.gpuMs.length>120)metrics.gpuMs.shift();}
  ext.deleteQueryEXT(query);query=null;
 }
 // Past the door the room is the whole view: nothing of the building is left
 // to draw, and the gate is transparent (loading-gate.js). The canvas is then
 // left alone: a new frame each time, even an empty one, would only take the
 // room's.
 const through=camera.fade>=1;
 if(!through){gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);}
 metrics.drawCalls=0;
 const measured=!through&&ext&&!query&&metrics.frames%30===0;
 if(measured){query=ext.createQueryEXT();ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,query);}
 if(!through){
  gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);
  const g=pg.glass;gl.useProgram(g.p);gl.uniformMatrix4fv(g.u.vp,false,m);
  gl.uniform3fv(g.u.eye,camera.eye);gl.uniform1f(g.u.time,reduced?8:time);gl.uniform1f(g.u.age,age);
  gl.uniform1f(g.u.curtains,camera.curtain);gl.uniform1f(g.u.reveal,camera.reveal);gl.uniform1f(g.u.stillness,reduced?1:0);
  // Lathe triangles wind inward: cull their front-facing (inside) surfaces.
  gl.enable(gl.CULL_FACE);gl.cullFace(gl.FRONT);
  part(meshes.body,0);part(meshes.tower,1);part(meshes.core,5);
  gl.disable(gl.CULL_FACE);
  part(meshes.porch,9);part(meshes.frame,2);part(meshes.tunnel,3);part(meshes.platform,4);
  gl.disableVertexAttribArray(g.n);
  if(camera.sky>0){
   // The void, behind all of it; then, while the doorway is open, the
   // doorway cleared (what stands before its plane stays: its frame, and the
   // curtains drawn next).
   const s=pg.sky;gl.useProgram(s.p);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);
   if(camera.sky<1){gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);}
   gl.bindBuffer(gl.ARRAY_BUFFER,meshes.quad);gl.enableVertexAttribArray(s.pos);gl.vertexAttribPointer(s.pos,2,gl.FLOAT,false,0,0);
   gl.uniform2f(s.u.screen,screenW,screenH);gl.uniform1f(s.u.scale,width/screenW);gl.uniform1f(s.u.time,time);gl.uniform1f(s.u.alpha,camera.sky);
   gl.drawArrays(gl.TRIANGLE_STRIP,0,4);metrics.drawCalls++;gl.disable(gl.BLEND);gl.disableVertexAttribArray(s.pos);
   if(camera.reveal){
    const h=pg.hole;gl.useProgram(h.p);gl.uniformMatrix4fv(h.u.vp,false,m);gl.depthFunc(gl.LESS);
    gl.bindBuffer(gl.ARRAY_BUFFER,meshes.hole.p);gl.enableVertexAttribArray(h.a);gl.vertexAttribPointer(h.a,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,meshes.hole.ix);gl.drawElements(gl.TRIANGLES,meshes.hole.count,gl.UNSIGNED_SHORT,0);metrics.drawCalls++;
    gl.disableVertexAttribArray(h.a);
   }
   gl.depthFunc(gl.LESS);gl.depthMask(true);gl.useProgram(g.p);
  }
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
  part(meshes.left,6);part(meshes.right,7);part(meshes.feed,8);
  gl.disable(gl.DEPTH_TEST);gl.blendFunc(gl.ONE,gl.ONE);
  const c=project(CORE_AT,m);
  if(c[2]>0){
   const s=pg.halo,r=70*(screenH/900);
   gl.useProgram(s.p);gl.bindBuffer(gl.ARRAY_BUFFER,meshes.quad);gl.enableVertexAttribArray(s.pos);gl.vertexAttribPointer(s.pos,2,gl.FLOAT,false,0,0);
   gl.uniform2f(s.u.center,c[0]/screenW*2-1,1-c[1]/screenH*2);
   gl.uniform2f(s.u.size,r/screenW*2,r/screenH*2);
   gl.uniform1f(s.u.strength,(.26+.025*Math.sin(time*1.5))*(1-.5*smooth((age-5)/1.6)));gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }
  gl.depthMask(true);gl.disable(gl.BLEND);
 }
 if(measured)ext.endQueryEXT(ext.TIME_ELAPSED_EXT);
 if(camera.reveal){
  // The doorway on screen (CSS pixels): the gate's own void gives way to this
  // one, and is transparent once the eye is through (fade).
  send('aperture',{points:covered?null:points.map(p=>[+p[0].toFixed(2),+p[1].toFixed(2)]),covered,fade:camera.fade,phase});
 }
 metrics.frames++;metrics.cpuMs.push(performance.now()-begun);if(metrics.cpuMs.length>300)metrics.cpuMs.shift();
 if(first){first=false;send('drawn');}
 if(age>=FORMATION&&!formed){formed=true;send('formed',{seconds:age});}
 if(time-statsAt>1){statsAt=time;report();}
}
function schedule(){if(disposed||paused||(reduced&&!first&&!flight))return;handle=requestAnimationFrame(loop);}
function loop(now){
 if(disposed||paused)return;
 const dt=last===null?0:(now-last)/1000;last=now;time+=Math.min(dt,.08)*rate;
 const interval=flight?1000/60:1000/30;
 if(now-lastDraw>=interval-2){
  if(lastDraw>0){metrics.frameGaps.push(now-lastDraw);if(metrics.frameGaps.length>300)metrics.frameGaps.shift();}
  lastDraw=now;render();
 }
 schedule();
}
function stop(){disposed=true;cancelAnimationFrame(handle);if(gl){for(const m of Object.values(meshes||{}))if(m?.p){gl.deleteBuffer(m.p);gl.deleteBuffer(m.n);gl.deleteBuffer(m.ix);}gl.deleteBuffer(meshes?.quad);for(const p of Object.values(pg||{}))gl.deleteProgram(p.p);if(query)ext?.deleteQueryEXT(query);gl.getExtension('WEBGL_lose_context')?.loseContext();}send('disposed');close();}
// The entry's view (scene-camera.js entryView), where the walk in ends.
function setEntry(view){if(view&&['x','y','z','yaw','tilt','lens'].every(k=>Number.isFinite(view[k])))entry={...entry,...view};}
onmessage=({data:d})=>{
 try{
  if(d.type==='init'){
   canvas=d.canvas;screenW=d.width;screenH=d.height;dpr=d.dpr||1;reduced=!!d.reduced;
   gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true,depth:true,powerPreference:'low-power'});
   if(!gl||!gl.getExtension('OES_standard_derivatives'))throw Error('Worker WebGL with derivatives unavailable');
   ext=gl.getExtension('EXT_disjoint_timer_query');resize();
   pg={glass:program(VERTEX,FRAGMENT),halo:program(HALO_VS,HALO_FS),sky:program(SKY_VS,SKY_FS),hole:program(HOLE_VS,HOLE_FS)};
   meshes={body:upload(lathe(bodyRadius,1.289,-1.288,144,128)),tower:upload(lathe(towerRadius,TOWER_TIP,TOWER_BASE,140,96,TOWER)),
    core:upload(lathe(y=>Math.sqrt(Math.max(0,.17**2-y*y)),.17,-.17,40,64,CORE)),
    feed:upload(lathe(y=>.006+.014*Math.sin((y-1.22)/.38*Math.PI),1.60,1.22,28,24)),
    porch:upload(porch()),frame:upload(frame()),tunnel:upload(passage()),platform:upload(platform()),left:upload(curtain(-1)),right:upload(curtain(1)),hole:upload(hole())};
   meshes.quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,meshes.quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
   render();schedule();
  }else if(d.type==='resize'){screenW=d.width;screenH=d.height;dpr=d.dpr||1;resize();if(paused||reduced)render();}
  else if(d.type==='fly'){
   setEntry(d.entry);
   const p=pose();flight={start:time,eye:p.eye,target:p.target,fov:p.fov};paused=false;last=null;cancelAnimationFrame(handle);schedule();
  }else if(d.type==='entry')setEntry(d.entry);
  else if(d.type==='pause'){paused=true;cancelAnimationFrame(handle);last=null;report();}
  else if(d.type==='play'){if(paused){paused=false;last=null;lastDraw=-100;schedule();}}
  else if(d.type==='still'){reduced=!!d.value;last=null;cancelAnimationFrame(handle);render();schedule();}
  else if(d.type==='seek'){paused=true;cancelAnimationFrame(handle);time=Math.max(0,d.value);last=null;render();report();}
  else if(d.type==='seekFlight'&&flight){paused=true;cancelAnimationFrame(handle);time=flight.start+Math.max(0,d.value);last=null;lastDraw=-100;render();report();}
  else if(d.type==='rate'){rate=clamp(+d.value||1,.01,8);}
  else if(d.type==='snapshot'){render();canvas.convertToBlob({type:'image/webp',quality:.93}).then(blob=>send('snapshot',{blob}));}
  else if(d.type==='dispose')stop();
 }catch(error){send('failed',{message:error?.message||String(error)});cancelAnimationFrame(handle);}
};
