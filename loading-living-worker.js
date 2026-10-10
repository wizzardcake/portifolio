/* Living orb architecture. Exterior-only OffscreenCanvas renderer.
   All geometry, currents and choreography run in this worker. No room imports.
   Time is visible animation time; formation finishes at 6.6 s before entry.
   CPU/GPU resources belong exclusively to this worker. */
'use strict';
const FORMATION = 6.6, ENTRY = {approach:2.6, arrival:2, curtains:1.4, walk:2.6};
const TAU = Math.PI*2, CORE = [-.06,1.72,.08];
// The building at the scale of the room inside it (room-chamber.js,
// room-tower.js). Across, 0.246 a metre: the chamber's outer wall (4.35 m
// from its centre) is the body's widest, 1.07. Up, 0.291 a metre from the
// door's sill, which is the room's floor.
const SCALE = {across:.246, up:.291, floor:-.78};
const at = metres => SCALE.floor + metres*SCALE.up;
// The stair tower: its drum (1.70 m inside, a 0.35 m wall) stands 5.69 m from
// the chamber's centre, back right (-30 degrees), and rises to its roof at
// 7 m; a tall conical roof above.
const TOWER = [4.926*SCALE.across, 0, -2.844*SCALE.across], TOWER_R = 2.05*SCALE.across, TOWER_BASE = -.5, TOWER_ROOF = at(7), TOWER_TIP = 2.62;
// The doorway: the room's own pointed door (jambs 1.7 half-widths high, an
// equilateral arch), a little wider than the room's 0.74 m, through a
// passage as deep as the room's (the wall and the dark passage, 1.35 m).
// Its aperture is projected at plane z.
const DOOR = {a:.20, sill:SCALE.floor, plane:.90, back:.62};
DOOR.spring = DOOR.sill + 1.7*DOOR.a; DOOR.peak = DOOR.spring + Math.sqrt(3)*DOOR.a;
// Eye height walking in: the room's (1.7 m), so the walk meets its entry view.
const EYE = at(1.7);
// GLSL literals.
// (Negative values in parentheses: "y--0.5" would read as a decrement.)
const f = v => (v<0?'('+(+v).toFixed(4)+')':(+v).toFixed(4)), v3 = a => 'vec3('+a.map(f).join(',')+')';
let gl, pg, meshes, canvas, width=1,height=1,screenW=1,screenH=1,dpr=1;
let disposed=false, paused=false, reduced=false, first=true, formed=false, flight=null;
let time=0,last=null,rate=1,handle=0, lastDraw=-100,phase='',statsAt=0;
let metrics={frames:0,frameGaps:[],cpuMs:[],gpuMs:[],triangles:0,drawCalls:0}, query=null, ext=null;
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const norm=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
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
 // The drum, narrowing a little as it rises, with a band where the upper
 // floor is inside (2.85 m) and a cornice under the eaves.
 const u=clamp((y-TOWER_BASE)/(TOWER_ROOF-TOWER_BASE));
 const band=.016*Math.exp(-(((y-at(2.85))/.018)**2)),cornice=.024*Math.exp(-(((y-TOWER_ROOF+.035)/.03)**2));
 return TOWER_R*(1.03-.07*u)+band+cornice;
}
function arch(a=DOOR.a,spring=DOOR.spring,sill=DOOR.sill,steps=32){
 const pts=[[-a,sill],[-a,spring]];
 for(let i=1;i<=steps;i++){const t=Math.PI-i/steps*Math.PI/3;pts.push([a+2*a*Math.cos(t),spring+2*a*Math.sin(t)]);}
 for(let i=1;i<=steps;i++){const t=Math.PI/3-i/steps*Math.PI/3;pts.push([-a+2*a*Math.cos(t),spring+2*a*Math.sin(t)]);}
 pts.push([a,sill]);return pts;
}
function archMesh(frame=false){
 const pts=arch(frame?DOOR.a+.035:DOOR.a),p=[],n=[],ix=[];
 if(frame){
  const rings=10,r=.021;
  pts.forEach(([x,y],i)=>{
   const b=pts[Math.max(0,i-1)],a=pts[Math.min(pts.length-1,i+1)],nn=norm([a[1]-b[1],b[0]-a[0],0]);
   for(let k=0;k<=rings;k++){const t=k/rings*TAU,c=Math.cos(t),s=Math.sin(t);p.push(x+nn[0]*r*c,y+nn[1]*r*c,Math.sqrt(Math.max(.01,bodyRadius(y)**2-x*x))+.035+r*s);n.push(nn[0]*c,nn[1]*c,s);}
  });
  for(let i=0;i<pts.length-1;i++)for(let k=0;k<rings;k++){const a=i*(rings+1)+k,b=a+rings+1;ix.push(a,b,a+1,a+1,b,b+1);}
 }else{
  pts.push(pts[0]);
  for(let i=0;i<pts.length-1;i++){
   const [x,y]=pts[i],[xx,yy]=pts[i+1],b=p.length/3,nn=norm([y-yy,xx-x,0]);
   p.push(x,y,Math.sqrt(Math.max(.01,bodyRadius(y)**2-x*x))+.01,xx,yy,Math.sqrt(Math.max(.01,bodyRadius(yy)**2-xx*xx))+.01,x,y,DOOR.back,xx,yy,DOOR.back);for(let k=0;k<4;k++)n.push(...nn);ix.push(b,b+2,b+1,b+1,b+2,b+3);
  }
 }
 return{p,n,ix};
}
function curtain(side){
 const p=[],n=[],ix=[],cols=36,rows=42;
 for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){
  const u=j/cols,x=side*DOOR.a*u,top=DOOR.spring+Math.sqrt(Math.max(0,4*DOOR.a**2-(Math.abs(x)+DOOR.a)**2)),v=i/rows;
  p.push(x,top+(DOOR.sill-top)*v,.88);n.push(0,0,1);
 }
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j,b=a+cols+1;ix.push(a,b,a+1,a+1,b,b+1);}
 return{p,n,ix};
}
function platform(){
 const p=[],n=[],ix=[],rows=40,cols=48;
 // Closed elliptical tongue with a convex top: genuine thickness at its lip.
 for(let i=0;i<=rows;i++){
  const v=i/rows,z=.84+1.72*v,w=.34+.22*Math.sin(v*Math.PI*.9);
  for(let j=0;j<=cols;j++){
   const a=j/cols*TAU,tip=Math.sqrt(Math.max(.001,1-v**6));
   p.push(w*Math.cos(a)*tip,-.81+.055*Math.sin(a)*tip,z);n.push(Math.cos(a)*.2,Math.sin(a),v*.15);
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
 }else if(part<1.5){
  vec3 q=p-${v3(TOWER)};
  float h=sat((q.y-${f(TOWER_BASE)})/${f(TOWER_TIP-TOWER_BASE)}),grow=ease(tower*1.3-h*.3);
  float twist=(1.-tower)*5.*h*h+life*7.*h+1.5*h;
  float c=cos(twist),s=sin(twist);
  q.xz=mat2(c,-s,s,c)*q.xz*vec2(1.08,.94)*max(.001,grow);
  q.xz+=vec2(sin(h*7.5+time*.25*rhythm),cos(h*7.5+time*.25*rhythm))*.085*h*h*tower;
  q.y=mix(-.35,q.y,tower);
  p=q+${v3(TOWER)};
 }else if(part<3.5){
  p.x*=max(.001,entry);p.y=mix(${f(DOOR.sill)},p.y,entry);
 }else if(part<4.5){
  p.x*=max(.001,landing);p.z=mix(.84,p.z,landing);
  float tip=sat((position.z-.84)/1.72);
  p.y+=(1.-landing)*sin(tip*3.14159)*.45+life*.35*sin(time*.8+tip*3.)*tip;
 }else if(part<5.5){
  float pulse=1.+.065*sin(time*1.5)*(1.-stillness);
  p=(p-vec3(-.06,1.72,.08))*pulse+vec3(-.06,1.72,.08);
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
 // The doorway is cut through the body's front shell. Once it opens, all
 // that is seen through it (its passage, the shell behind, the tower) gives
 // way to the room (loading-gate.js cuts the same arch out of the gate).
 if(part<.5&&O.z>.20&&archSDF(vec2(O.x/max(.001,entrance),O.y),${f(DOOR.a)},${f(DOOR.spring)},${f(DOOR.sill)})<0.)discard;
 // Through the door, the visitor is inside: the room takes over the view.
 if(eye.z<${f(DOOR.plane)}&&part<3.5)discard;
 if(reveal>.001&&part<3.5&&(part<1.5||part>2.5)){
  vec3 ray=P-eye;float t=(${f(DOOR.plane)}-eye.z)/ray.z;
  if(t>0.&&archSDF((eye+ray*t).xy,${f(DOOR.a)},${f(DOOR.spring)},${f(DOOR.sill)})<0.)discard;
 }
 if(part<1.5&&age<.651)discard;
 if(part>.5&&part<1.5&&age<3.06)discard;
 if(part>1.5&&part<3.5&&age<4.86)discard;
 if(part>3.5&&part<4.5&&age<5.46)discard;
 if(part>5.5&&part<7.5&&age<5.35)discard;
 if(part>7.5&&age<.66)discard;
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
  vec3 q=(P-vec3(-.06,1.72,.08))*5.8;
  float field=organic(q+vec3(time*.22,-time*.16,0.));
  float veins=pow(1.-abs(sin(q.y*3.+field*2.8+time*.4)),4.);
  float soft=1.-.35*ease((age-5.)/1.6);
  vec3 gold=mix(vec3(.7,.16,.008),vec3(1.8,.95,.16),.45+.45*field);
  gold+=vec3(1.,.63,.13)*veins*.6;
  gold*=soft*(.65+.35*ndv);
  gl_FragColor=vec4(tonemap(gold),1.);return;
 }
 if(part>7.5){
  float a=.28+.4*(1.-ease((age-5.)/1.6));
  vec3 c=mix(vec3(.04,.3,.23),vec3(.5,.3,.045),ease((P.y-1.22)/.32));
  gl_FragColor=vec4(tonemap(c)*a,a);return;
 }
 vec3 q=O;
 if(part>.5&&part<1.5)q=(O-${v3(TOWER)})*vec3(1.6,1.0,1.6);
 // The passage through the wall: dark stone, as the room's own door passage.
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
 color+=vec3(.15,.085,.014)*max(0.,dot(n,normalize(vec3(-.06,1.72,.08)-P)))*.085;
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
 if(part>1.5&&part<3.5){
  color*=part<2.5?.95:.38;
  color+=vec3(.19,.105,.035)*pow(1.-ndv,2.)*.32;
 }
 // Golden capillary at the active growth front, gone when settled.
 float front=age<2.5?1.50-(age-.65)/1.85*1.12:.38-(age-2.1)/1.9*1.66;
 float feeding=(1.-ease((age-5.2)/1.1))*ease((age-.65)/.4);
 color+=vec3(.25,.19,.04)*exp(-pow((P.y-front)/.055,2.))*feeding*.25;
 gl_FragColor=vec4(tonemap(color),1.);
}
`;


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
 const k=Math.min(dpr,1.5,Math.sqrt(1600000/(screenW*screenH)));
 width=canvas.width=Math.round(screenW*k);height=canvas.height=Math.round(screenH*k);
 send('size',{width,height,cssWidth:screenW,cssHeight:screenH,scale:k});
}
function matrix(eye,target,fov){
 const f=norm(sub(target,eye)),r=norm(cross(f,[0,1,0])),u=cross(r,f),t=1/Math.tan(fov/2),near=.015,far=40;
 const view=[r[0],u[0],-f[0],0,r[1],u[1],-f[1],0,r[2],u[2],-f[2],0,
 -r.reduce((s,v,i)=>s+v*eye[i],0),-u.reduce((s,v,i)=>s+v*eye[i],0),f.reduce((s,v,i)=>s+v*eye[i],0),1];
 const proj=[t/(width/height),0,0,0,0,t,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0],m=new Float32Array(16);
 for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)m[c*4+row]+=proj[k*4+row]*view[c*4+k];
 return m;
}
function project(p,m){
 const c=[0,0,0,0];for(let i=0;i<4;i++)for(let j=0;j<4;j++)c[i]+=m[j*4+i]*(j===3?1:p[j]);
 return[(c[0]/c[3]*.5+.5)*screenW,(.5-c[1]/c[3]*.5)*screenH,c[3]];
}
function pose(){
 const rhythm=reduced?0:Math.pow(.5-.5*Math.cos(time*.78),2),settled=reduced?0:1;
 // (Framed on the body and the tower together.)
 const far=[-.02+Math.sin(time*.21)*.10*rhythm,.56+Math.sin(time*.35)*.055*rhythm,6.7],look=[.28,.56,0];
 const fov=Math.max(.68,2*Math.atan(1.86/(screenW/screenH*6.7)));
 if(!flight)return{eye:far,target:look,fov,curtain:0,reveal:0,fade:0};
 const t=time-flight.start,A=ENTRY.approach,B=A+ENTRY.arrival,C=B+ENTRY.curtains,D=C+ENTRY.walk;
 const landing=[0,EYE,2.18],toward=[0,EYE-.005,.1];
 let eye,target,opening=0,fade=0,reveal=0;
 if(t<A){setPhase('approach');const u=smooth(t/A);eye=lerp(flight.eye,landing,u);target=lerp(flight.target,toward,u);}
 else if(t<B){setPhase('arrival');eye=landing;target=toward;}
 else if(t<C){setPhase('curtains');eye=landing;target=toward;opening=smooth((t-B)/ENTRY.curtains);reveal=1;}
 else{
  setPhase('walk');const u=clamp((t-C)/ENTRY.walk),travel=smooth(u);
  const bob=Math.sin(u*Math.PI)*Math.sin(u*TAU*2.2)*.007;
  eye=[Math.sin(u*TAU*1.1)*.002*Math.sin(u*Math.PI),EYE+bob,2.18-1.84*travel];target=[0,EYE-.005+bob*.6,-1];
  opening=1;reveal=1;fade=smooth((u-.82)/.18);
  if(t>=D&&!flight.done){flight.done=true;send('flown',{time});}
 }
 return{eye,target,fov:fov+(.92-fov)*smooth(t/A),curtain:opening,reveal,fade};
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
 const camera=pose(),m=matrix(camera.eye,camera.target,camera.fov);
 if(ext&&query&&ext.getQueryObjectEXT(query,ext.QUERY_RESULT_AVAILABLE_EXT)){
  if(!gl.getParameter(ext.GPU_DISJOINT_EXT)){metrics.gpuMs.push(ext.getQueryObjectEXT(query,ext.QUERY_RESULT_EXT)/1e6);if(metrics.gpuMs.length>120)metrics.gpuMs.shift();}
  ext.deleteQueryEXT(query);query=null;
 }
 const measured=ext&&!query&&metrics.frames%30===0;
 if(measured){query=ext.createQueryEXT();ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,query);}
 gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);
 const g=pg.glass;gl.useProgram(g.p);gl.uniformMatrix4fv(g.u.vp,false,m);
 gl.uniform3fv(g.u.eye,camera.eye);gl.uniform1f(g.u.time,reduced?8:time);gl.uniform1f(g.u.age,age);
 gl.uniform1f(g.u.curtains,camera.curtain);gl.uniform1f(g.u.reveal,camera.reveal);gl.uniform1f(g.u.stillness,reduced?1:0);
 metrics.drawCalls=0;
 // Lathe triangles wind inward: cull their front-facing (inside) surfaces.
 gl.enable(gl.CULL_FACE);gl.cullFace(gl.FRONT);
 part(meshes.body,0);part(meshes.tower,1);part(meshes.core,5);
 gl.disable(gl.CULL_FACE);
 part(meshes.frame,2);part(meshes.tunnel,3);part(meshes.platform,4);
 gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
 part(meshes.left,6);part(meshes.right,7);part(meshes.feed,8);
 gl.disable(gl.DEPTH_TEST);gl.blendFunc(gl.ONE,gl.ONE);
 const s=pg.halo,c=project(CORE,m),r=70*(screenH/900)/(flight?1+camera.fade*10:1);
 gl.useProgram(s.p);gl.bindBuffer(gl.ARRAY_BUFFER,meshes.quad);gl.enableVertexAttribArray(s.pos);gl.vertexAttribPointer(s.pos,2,gl.FLOAT,false,0,0);
 gl.uniform2f(s.u.center,c[0]/screenW*2-1,1-c[1]/screenH*2);
 gl.uniform2f(s.u.size,r/screenW*2,r/screenH*2);
 gl.uniform1f(s.u.strength,(.26+.025*Math.sin(time*1.5))*(1-.5*smooth((age-5)/1.6)));gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
 gl.depthMask(true);gl.disable(gl.BLEND);
 if(measured)ext.endQueryEXT(ext.TIME_ELAPSED_EXT);
 if(camera.reveal){
  const points=arch().map(([x,y])=>project([x,y,DOOR.plane],m));
  const covered=camera.eye[2]<1.00;
  // Coordinates in CSS pixels, keeping the real room visible through this exact arch.
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
onmessage=({data:d})=>{
 try{
  if(d.type==='init'){
   canvas=d.canvas;screenW=d.width;screenH=d.height;dpr=d.dpr||1;reduced=!!d.reduced;
   gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true,depth:true,powerPreference:'low-power'});
   if(!gl||!gl.getExtension('OES_standard_derivatives'))throw Error('Worker WebGL with derivatives unavailable');
   ext=gl.getExtension('EXT_disjoint_timer_query');resize();
   pg={glass:program(VERTEX,FRAGMENT),halo:program(HALO_VS,HALO_FS)};
   meshes={body:upload(lathe(bodyRadius,1.289,-1.288,144,128)),tower:upload(lathe(towerRadius,TOWER_TIP,TOWER_BASE,132,96,TOWER)),
    core:upload(lathe(y=>Math.sqrt(Math.max(0,.17**2-y*y)),.17,-.17,40,64,CORE)),
    feed:upload(lathe(y=>.006+.014*Math.sin((y-1.22)/.38*Math.PI),1.60,1.22,28,24)),
    frame:upload(archMesh(true)),tunnel:upload(archMesh()),platform:upload(platform()),left:upload(curtain(-1)),right:upload(curtain(1))};
   meshes.quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,meshes.quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
   render();schedule();
  }else if(d.type==='resize'){screenW=d.width;screenH=d.height;dpr=d.dpr||1;resize();if(paused||reduced)render();}
  else if(d.type==='fly'){
   const p=pose();flight={start:time,eye:p.eye,target:p.target};paused=false;last=null;cancelAnimationFrame(handle);schedule();
  }else if(d.type==='pause'){paused=true;cancelAnimationFrame(handle);last=null;report();}
  else if(d.type==='play'){if(paused){paused=false;last=null;lastDraw=-100;schedule();}}
  else if(d.type==='still'){reduced=!!d.value;last=null;cancelAnimationFrame(handle);render();schedule();}
  else if(d.type==='seek'){paused=true;cancelAnimationFrame(handle);time=Math.max(0,d.value);last=null;render();report();}
  else if(d.type==='seekFlight'&&flight){paused=true;cancelAnimationFrame(handle);time=flight.start+Math.max(0,d.value);last=null;lastDraw=-100;render();report();}
  else if(d.type==='rate'){rate=clamp(+d.value||1,.01,8);}
  else if(d.type==='snapshot'){render();canvas.convertToBlob({type:'image/webp',quality:.93}).then(blob=>send('snapshot',{blob}));}
  else if(d.type==='dispose')stop();
 }catch(error){send('failed',{message:error?.message||String(error)});cancelAnimationFrame(handle);}
};


