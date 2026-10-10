// Integrated browser checks for the first-person controller.
// node tests/first-person-check.mjs
import {createServer} from 'node:http';
import {readFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'..');
const output=resolve(root,'verification','first-person','phase3');
// Headless Chrome grants no pointer lock: there the checks that need it are
// skipped (and said so); PORTFOLIO_HEADLESS=0 runs them in a visible window.
const headless=process.env.PORTFOLIO_HEADLESS!=='0';
await mkdir(output,{recursive:true});
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'};
const server=createServer(async(req,res)=>{
  if(new URL(req.url,'http://localhost').pathname==='/favicon.ico'){res.writeHead(204).end();return;}
  const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{const data=await readFile(file);res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(data);}
  catch{res.writeHead(404).end();}
});
await new Promise((done,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',done);});
const url=`http://127.0.0.1:${server.address().port}/`;
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const prefix=resolve(tmpdir(),'portfolio-first-person-'),profile=await mkdtemp(prefix);
const chromeArgs=[
  ...(process.env.PORTFOLIO_HEADLESS==='0'?[]:['--headless=new']),
  '--no-first-run','--no-default-browser-check','--disable-background-networking',
  '--use-angle=d3d11','--enable-gpu','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank',
];
const chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',chromeArgs,
  {windowsHide:process.env.PORTFOLIO_HEADLESS!=='0',stdio:['ignore','ignore','pipe']});
let ws;
const errors=[],warnings=[],checks={};
try{
  const endpoint=await new Promise((done,fail)=>{
    const timer=setTimeout(()=>fail(new Error('Chrome startup timeout')),20000);let log='';
    chrome.once('error',fail);
    chrome.stderr.on('data',chunk=>{log+=chunk;const match=log.match(/DevTools listening on (ws:\/\/\S+)/);if(match){clearTimeout(timer);done(match[1]);}});
  });
  ws=new WebSocket(endpoint);
  await new Promise((done,fail)=>{ws.addEventListener('open',done,{once:true});ws.addEventListener('error',fail,{once:true});});
  let serial=0,session;const pending=new Map();
  ws.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id&&pending.has(message.id)){
      const p=pending.get(message.id);pending.delete(message.id);
      message.error?p.fail(new Error(JSON.stringify(message.error))):p.done(message.result);
    }
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
    if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')
      errors.push(message.params.args.map(a=>a.value||a.description).join(' '));
    if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='warning')
      warnings.push(message.params.args.map(a=>a.value||a.description).join(' '));
    if(message.method==='Log.entryAdded'&&message.params.entry.level==='error')errors.push(message.params.entry.text);
  });
  const cdp=(method,params={},attached=true)=>new Promise((done,fail)=>{
    const id=++serial,timer=setTimeout(()=>{pending.delete(id);fail(new Error('CDP timeout: '+method));},90000);
    pending.set(id,{done:r=>{clearTimeout(timer);done(r);},fail:e=>{clearTimeout(timer);fail(e);}});
    ws.send(JSON.stringify({id,method,params,...(attached&&session?{sessionId:session}:{})}));
  });
  const {targetInfos}=await cdp('Target.getTargets',{},false);
  session=(await cdp('Target.attachToTarget',{targetId:targetInfos.find(t=>t.type==='page').targetId,flatten:true},false)).sessionId;
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Log.enable');
  await cdp('Page.bringToFront');
  const evaluate=async expression=>{
    const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  async function until(expression,timeout=60000){
    const at=Date.now();
    while(!await evaluate(expression)){if(Date.now()-at>timeout)throw new Error('Timed out: '+expression);await sleep(100);}
  }
  const rect=selector=>evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}})()`);
  const click=async(x,y)=>{
    await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
    await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
    await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
  };
  const clickSelector=async selector=>{const r=await rect(selector);await click(r.x,r.y);};
  const key=async(code,down)=>{
    const names={KeyW:['w',87],KeyS:['s',83],KeyA:['a',65],KeyD:['d',68],KeyE:['e',69],Escape:['Escape',27]};
    const [keyName,keyCode]=names[code];
    await cdp('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',key:keyName,code,windowsVirtualKeyCode:keyCode,nativeVirtualKeyCode:keyCode});
  };

  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await cdp('Page.navigate',{url});
  await until("!!window.firstPerson && !!window.studyRoom?.walk && !!window.studyRoom?.shelfHover && !!window.studyRoom?.aimCentre");
  await until("(document.querySelector('.loading-gate__continue:not([hidden])')?.click(), document.documentElement?.dataset.siteEntered==='yes' && sceneCamera.navigation==='ENTRY')");
  await until("!!document.querySelector('.fp-invite__no')",8000);
  await evaluate("document.querySelector('.fp-invite__no').click()");
  await until("!document.querySelector('.fp-invite')");
  const integrated=await evaluate(`({
    mode:firstPerson.mode,nav:sceneCamera.navigation,menu:!!document.querySelector('#fpMenuButton'),
    css:[...document.styleSheets].some(s=>s.href?.endsWith('/first-person.css')),
    bays:studyRoom.walk.bays.length,columns:studyRoom.walk.columns.length,
    shelfApi:typeof studyRoom.shelfHover,aimApi:typeof studyRoom.aimCentre,
    initial:document.querySelector('#fpMenuButton').hidden,invitationDismissed:!document.querySelector('.fp-invite')
  })`);
  assert.equal(integrated.mode,'website');assert.equal(integrated.nav,'ENTRY');
  assert.ok(integrated.css&&integrated.menu&&!integrated.initial&&integrated.invitationDismissed);
  assert.equal(integrated.bays,12);assert.equal(integrated.columns,12);
  checks.integration=integrated;

  const beforeLook=await evaluate('sceneCamera.camera.yaw');
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:700,y:330});
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:700,y:330,button:'left',buttons:1,clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:760,y:330,buttons:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:760,y:330,button:'left',clickCount:1});
  await sleep(250);
  const afterLook=await evaluate('sceneCamera.camera.yaw');
  assert.ok(Math.abs(afterLook-beforeLook)>.5,'Website-mode drag turns the shared camera');
  assert.equal(await evaluate('sceneCamera.navigation'),'ENTRY','A camera drag does not trigger a navigation click');
  checks.websiteDrag={before:beforeLook,after:afterLook};

  await clickSelector('#fpMenuButton');
  await until("!document.querySelector('#fpMenu').hidden");
  await evaluate(`addEventListener('click',event=>{
    if(event.target.closest?.('.fp-mode'))window.__modeClick={trusted:event.isTrusted,active:navigator.userActivation?.isActive};
  },true)`);
  await clickSelector('.fp-mode:nth-child(2)');
  await until("firstPerson.mode==='game' && sceneCamera.navigation==='FREE'");
  let pointerLockDeferred=false;
  try{
    await until("document.pointerLockElement===document.getElementById('roomCanvas')",headless?3000:12000);
  }catch(error){
    if(headless)console.log('Pointer lock: unavailable headless; its checks are skipped');else{
    console.error('Pointer-lock diagnostic',await evaluate(`({
      mode:firstPerson.mode,nav:sceneCamera.navigation,active:navigator.userActivation?.isActive,
      hint:document.querySelector('.fp-hint')?.textContent,hidden:document.querySelector('.fp-hint')?.hidden,
      support:typeof document.getElementById('roomShell').requestPointerLock,
      lock:document.pointerLockElement?.id||null,click:window.__modeClick,
      target:{connected:document.getElementById('roomCanvas').isConnected,owner:document.getElementById('roomCanvas').ownerDocument===document,
        url:document.URL,active:document.defaultView===window,focused:document.hasFocus(),visibility:document.visibilityState},
      errors:${JSON.stringify(errors)},warnings:${JSON.stringify(warnings)}
    })`));
    if(await evaluate('document.querySelector(".fp-hint").hidden'))throw error;
    pointerLockDeferred=true;
    await clickSelector('#roomCanvas');
    await until("document.pointerLockElement===document.getElementById('roomCanvas')",12000);
    }
  }
  checks.pointerLock=await evaluate(`({
    locked:document.pointerLockElement===document.getElementById('roomCanvas'),
    centered:document.body.classList.contains('fp-locked'),
    aimAtCentre:studyRoom.aimCentre instanceof Function
  })`).then(result=>({...result,deferred:pointerLockDeferred}));
  // Headless, the lock may not come: then the visitor is told how to look,
  // and can still walk.
  if(!headless||checks.pointerLock.locked)assert.ok(checks.pointerLock.locked,'Game mode obtains pointer lock from a user gesture');
  else assert.equal(await evaluate('document.querySelector(".fp-hint").hidden'),false,'Without pointer lock a hint says how to look');

  const entry=await evaluate('firstPerson.walker');
  await key('KeyW',true);await sleep(2700);await key('KeyW',false);await sleep(180);
  const walked=await evaluate('firstPerson.walker');
  assert.ok(Math.hypot(walked.x-entry.x,walked.z-entry.z)>.35,'W moves the first-person walker');
  assert.ok(walked.z<entry.z-.3,'The initial forward direction follows the camera');
  checks.wasd={start:entry,end:walked};

  const collision=await evaluate(`(()=>{
    const w=studyRoom.walk,c=firstPerson.walker,col=w.columns[0];
    const d=.08*w.stair.step,phi=w.stair.from-d,r=(w.stair.inner+w.tower.r)/2;
    const x=w.tower.x+r*Math.cos(phi),z=w.tower.z+r*Math.sin(phi)-w.forward;
    const height=(d/w.stair.step+1)*w.stair.rise;
    return {
      safeFloor:firstPerson.floorAt(0,3.4,0),
      table:firstPerson.floorAt(0,0,0),
      wall:firstPerson.floorAt(0,7,0),
      column:firstPerson.floorAt(col[0],col[1]-w.forward,0),
      stair:firstPerson.floorAt(x,z,0),
      stairHeight:height,
      stairPoint:{x,z,y:1.7,yaw:-phi*180/Math.PI,tilt:0}
    };
  })()`);
  assert.equal(collision.safeFloor,0);assert.equal(collision.table,null);
  assert.equal(collision.wall,null);assert.equal(collision.column,null);
  assert.ok(Math.abs(collision.stair-collision.stairHeight)<1e-6,'The walk plan registers the real stair treads');
  // The walk plan against what is drawn: the window's wall and the nook's
  // wall stop a visitor a body's width from their faces, and the stair the
  // walker climbs is the stair on screen (a ray down onto its treads).
  const drawn=await evaluate(`(async()=>{
    const THREE=await import('./vendor/three/three.module.js'),d=studyRoom.dimensions,w=studyRoom.walk;
    const stairMesh=studyRoom.shell.getObjectByName('spiral stair'),ray=new THREE.Raycaster(),out=[];
    studyRoom.scene.updateMatrixWorld(true);
    for(const k of [.5,3.5,7.5,11.5]){
      const phi=w.stair.from-k*w.stair.step,rho=(w.stair.inner+w.tower.r)/2;
      const x=w.tower.x+rho*Math.cos(phi),z=w.tower.z+rho*Math.sin(phi)-w.forward;
      ray.set(new THREE.Vector3(x,4,z),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObject(stairMesh)[0];
      const expected=(k+1)*w.stair.rise;
      out.push({k,drawn:hit?+hit.point.y.toFixed(3):null,walk:firstPerson.floorAt(x,z,expected)});
    }
    return {backWall:firstPerson.floorAt(0,d.back+.1,0),backFloor:firstPerson.floorAt(0,d.back+.4,0),
      nookWall:firstPerson.floorAt(d.left+.15,.3,0),nookFloor:firstPerson.floorAt(d.left+.4,.3,0),stair:out};})()`);
  assert.equal(drawn.backWall,null,'The window wall stops the walker at its face');assert.equal(drawn.backFloor,0);
  assert.equal(drawn.nookWall,null,'The nook wall stops the walker at its face');assert.equal(drawn.nookFloor,0);
  for(const s of drawn.stair)assert.ok(s.drawn!==null&&s.walk!==null&&Math.abs(s.drawn-s.walk)<.13,'The walked stair is the drawn stair: '+JSON.stringify(s));
  checks.registration=drawn;
  checks.collision={safeFloor:collision.safeFloor,tableBlocked:collision.table===null,wallBlocked:collision.wall===null,
    columnBlocked:collision.column===null,stair:collision.stair};

  await key('Escape',true);await key('Escape',false);
  await until('!document.pointerLockElement');
  assert.equal(await evaluate('firstPerson.mode'),'game','Escape releases the pointer without leaving Game Mode');
  // (pointerlockchange, which shows the hint, follows the release a moment later.)
  await until('!document.querySelector(".fp-hint").hidden',3000).catch(()=>{});
  assert.equal(await evaluate('document.querySelector(".fp-hint").hidden'),false,'With the mouse free, a hint says how to take it again');
  await clickSelector('#fpMenuButton');
  await until("!document.querySelector('#fpMenu').hidden");
  await clickSelector('.fp-mode:nth-child(1)');
  // Back in website mode the visitor stays where they stood, free, with the
  // places' markers to go on from; the entry's marker takes them back there.
  await until("firstPerson.mode==='website' && sceneCamera.navigation==='FREE'",20000);
  assert.equal(await evaluate("document.querySelector('#entryTargets').hidden"),false,'Website navigation targets return after leaving Game Mode');
  const stayed=await evaluate('({x:sceneCamera.x,z:sceneCamera.distance})');
  assert.ok(Math.hypot(stayed.x-walked.x,stayed.z-walked.z)<.05,'Leaving game mode keeps the visitor where they stand');
  // Turned toward the entry, its marker takes a click and leads there.
  await evaluate(`(()=>{const e=sceneCamera.points.entry.position,dx=e[0]-sceneCamera.x,dz=e[2]-sceneCamera.distance;
    const yaw=Math.atan2(-dx,-dz)*180/Math.PI;sceneCamera.lookBy(((yaw-sceneCamera.camera.yaw+540)%360)-180,-25);return true;})()`);
  await until("!document.querySelector('#goEntry').hidden");
  const mark=await evaluate(`(()=>{const e=sceneCamera.points.entry.position,p=sceneCamera.project(e[0],0,e[2]);return {x:Math.round(p.x),y:Math.round(p.y),
    under:document.elementFromPoint(p.x,p.y)?.id};})()`);
  assert.equal(mark.under,'goEntry','Standing free, the entry marker is a place to go: '+JSON.stringify(mark));
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:mark.x,y:mark.y,button:'left',buttons:1,clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:mark.x,y:mark.y,button:'left',clickCount:1});
  await until("sceneCamera.navigation==='ENTRY'",20000);
  checks.modeSwitch={mode:await evaluate('firstPerson.mode'),stayed,thenEntry:true};

  const stairPoint=collision.stairPoint;
  await evaluate(`sceneCamera.enterFree();sceneCamera.setFree(${JSON.stringify(stairPoint)});true`);
  await clickSelector('#fpMenuButton');
  await until("!document.querySelector('#fpMenu').hidden");
  await clickSelector('.fp-mode:nth-child(2)');
  await until("firstPerson.mode==='game' && sceneCamera.navigation==='FREE'");
  if(!headless)await until("document.pointerLockElement===document.getElementById('roomCanvas')",12000);
  const beforeStair=await evaluate('firstPerson.walker.floor');
  await key('KeyW',true);
  for(let i=0;i<18;i++){
    const walker=await evaluate('firstPerson.walker');
    const targetYaw=await evaluate(`(()=>{const w=studyRoom.walk,p=firstPerson.walker;
      return -Math.atan2(p.z+w.forward-w.tower.z,p.x-w.tower.x)*180/Math.PI;})()`);
    const delta=((targetYaw-walker.yaw+540)%360)-180;
    await evaluate(`sceneCamera.lookBy(${delta},0)`);
    await sleep(160);
    if(await evaluate('firstPerson.walker.floor>=studyRoom.walk.stair.count*studyRoom.walk.stair.rise-.1'))break;
  }
  await key('KeyW',false);await sleep(180);
  const afterStair=await evaluate('firstPerson.walker');
  assert.ok(afterStair.floor>beforeStair,'W traversal climbs the stair');
  assert.ok(afterStair.floor>=await evaluate('studyRoom.walk.stair.count*studyRoom.walk.stair.rise-.1'),
    'W traversal reaches the upper stair landing');
  checks.stairs={before:beforeStair,after:afterStair.floor,position:{x:afterStair.x,z:afterStair.z}};
  // From the landing out through the tower's mouth onto the gallery, toward
  // the chamber's middle: the balustrade stops the walker on the gallery.
  // (First toward the middle of the mouth, round the column by the landing.)
  const aimAt=(x,z)=>evaluate(`(()=>{const p=firstPerson.walker,yaw=Math.atan2(p.x-(${x}),p.z-(${z}))*180/Math.PI;
    sceneCamera.lookBy(((yaw-p.yaw+540)%360)-180,0);return true;})()`);
  const mouth=await evaluate(`(()=>{const w=studyRoom.walk,b=w.bays.find(b=>b.kind==='tower');return {x:b.cos*(w.apothem-.1),z:b.sin*(w.apothem-.1)-w.forward};})()`);
  await key('KeyW',true);
  for(let i=0;i<14;i++){await aimAt(mouth.x,mouth.z);await sleep(150);}
  for(let i=0;i<16;i++){await aimAt(0,-await evaluate('studyRoom.walk.forward'));await sleep(150);}
  await key('KeyW',false);await sleep(200);
  const gallery=await evaluate(`(()=>{const p=firstPerson.walker,w=studyRoom.walk,px=p.x,pz=p.z+w.forward;
    const along=Math.max(...w.bays.map(b=>px*b.cos+pz*b.sin)),tower=Math.hypot(px-w.tower.x,pz-w.tower.z);
    // (The tower's circle bulges into the chamber before its mouth; inside
    // the tower is only beyond the mouth's plane.)
    return {floor:p.floor,along:+along.toFixed(3),inTower:tower<w.tower.r&&along>w.apothem,eye:p.eye};})()`);
  assert.ok(Math.abs(gallery.floor-2.85)<.01&&!gallery.inTower,'From the landing the walker reaches the gallery: '+JSON.stringify(gallery));
  assert.ok(gallery.along>=4-1+.05+.26-.02,'The balustrade keeps the walker on the gallery: '+JSON.stringify(gallery));
  checks.gallery=gallery;

  await key('Escape',true);await key('Escape',false);await until('!document.pointerLockElement');
  await clickSelector('#fpMenuButton');
  await until("!document.querySelector('#fpMenu').hidden");
  await clickSelector('.fp-mode:nth-child(1)');
  // Up there, back in website mode, the visitor stays on the landing; the
  // entry is reached by the veil of mist, never a walk through the floor.
  await until("firstPerson.mode==='website' && sceneCamera.navigation==='FREE'",20000);
  assert.ok(await evaluate('sceneCamera.eyeHeight')>3,'Leaving game mode upstairs keeps the visitor upstairs');
  await evaluate("window.__veil=false;new MutationObserver(()=>{if(document.querySelector('.fp-veil').classList.contains('is-on'))window.__veil=true;}).observe(document.querySelector('.fp-veil'),{attributes:true});true");
  await evaluate("sceneCamera.go('entry')");
  await until("sceneCamera.navigation==='ENTRY'",20000);
  assert.ok(await evaluate('window.__veil'),'From upstairs the visitor is carried down by the veil');
  await until("!document.querySelector('.fp-veil').classList.contains('is-on')");
  checks.upstairs={veil:true,nav:'ENTRY'};
  await clickSelector('#fpMenuButton');
  await until("!document.querySelector('#fpMenu').hidden");
  await clickSelector('.fp-mode:nth-child(2)');
  await until("firstPerson.mode==='game'");
  if(!headless)try{await until("document.pointerLockElement===document.getElementById('roomCanvas')",12000);}
  catch{await clickSelector('#roomCanvas');await until("document.pointerLockElement===document.getElementById('roomCanvas')",12000);}
  await key('KeyW',true);
  for(let i=0;i<12;i++){
    const walker=await evaluate('firstPerson.walker');
    const target=await evaluate(`(()=>{const p=firstPerson.walker;
      const yaw=Math.atan2(-sceneCamera.chairPose.x+p.x,-sceneCamera.chairPose.z+p.z)*180/Math.PI;
      const dx=sceneCamera.chairPose.x-p.x,dz=sceneCamera.chairPose.z-p.z;
      const tilt=-Math.atan2(sceneCamera.tableHeight-p.eye,Math.hypot(dx,dz))*180/Math.PI;
      return {yaw,tilt};})()`);
    await evaluate(`sceneCamera.lookBy(${((target.yaw-walker.yaw+540)%360)-180},${walker.tilt-target.tilt})`);
    await sleep(150);
  }
  await key('KeyW',false);await sleep(160);
  const tableAim=await evaluate(`(()=>{const p=firstPerson.walker,dx=sceneCamera.chairPose.x-p.x,dz=sceneCamera.chairPose.z-p.z;
    const yaw=Math.atan2(-dx,-dz)*180/Math.PI,tilt=-Math.atan2(sceneCamera.tableHeight-p.eye,Math.hypot(dx,dz))*180/Math.PI;
    sceneCamera.lookBy(((yaw-p.yaw+540)%360)-180,p.tilt-tilt);return {walker:p,yaw,tilt};})()`);
  await until("firstPerson.aim==='sit'",8000);
  await key('KeyE',true);await key('KeyE',false);
  await until("sceneCamera.navigation==='SEATED'",15000);
  assert.equal(await evaluate('firstPerson.mode'),'website','Using E returns to Website Mode after sitting');
  checks.gameSit={aim:'sit',walker:tableAim.walker,mode:await evaluate('firstPerson.mode'),nav:await evaluate('sceneCamera.navigation')};
  await until("getComputedStyle(document.querySelector('#tableCloth')).pointerEvents==='auto'");
  assert.equal(await evaluate('portalCloth.covered'),true);
  const cloth=await rect('#tableCloth');
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:cloth.x,y:cloth.y,button:'left',buttons:1,clickCount:1});
  for(let i=1;i<=12;i++){
    await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:cloth.x,y:cloth.y+145*i/12,buttons:1});
    await sleep(20);
  }
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:cloth.x,y:cloth.y+145,button:'left',clickCount:1});
  await until("!portalCloth.covered",20000);
  // While the portal wakes the visitor stays seated and game mode waits.
  await clickSelector('#fpMenuButton');
  await until("!document.querySelector('#fpMenu').hidden");
  const waking=await evaluate("({waking:!document.body.classList.contains('intro-done'),disabled:document.querySelector('.fp-mode:nth-child(2)').disabled,note:document.querySelector('.fp-menu__note')?.textContent})");
  if(waking.waking)assert.ok(waking.disabled&&/portalen/.test(waking.note),'Game mode waits while the portal wakes: '+JSON.stringify(waking));
  await until("document.body.classList.contains('intro-done')",30000);
  await until("!document.querySelector('.fp-mode:nth-child(2)').disabled",3000);
  await evaluate("firstPerson.openMenu(false),true");
  checks.portalWaking=waking;
  checks.clothDrag={covered:await evaluate('portalCloth.covered'),bodyDone:await evaluate("document.body.classList.contains('intro-done')")};
  assert.equal(checks.clothDrag.covered,false,'Cloth drag still reveals the portal in Website Mode');

  await evaluate("sceneCamera.go('shelf',{instant:true})");
  await until("sceneCamera.navigation==='SHELF_INSPECTION'");
  // (The room's own camera follows on its next frame; projected before
  // that, the shelf lands where it was seen from the chair.)
  await until("Math.abs(studyRoom.camera.position.x-sceneCamera.x)<.01 && Math.abs(studyRoom.camera.position.z-sceneCamera.distance)<.01",5000);
  const shelfScreens=await evaluate(`(()=>{const root=studyRoom.scene.getObjectByName('physical shelf tools');
    return root.children.map(tool=>{const p=tool.position.clone();tool.getWorldPosition(p);p.y+=.35;return studyRoom.project(p.x,p.y,p.z);});})()`);
  for(const shelfScreen of shelfScreens){
    await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:shelfScreen.x,y:shelfScreen.y});
    await sleep(180);
    if(await evaluate('studyRoom.shelfHover()>=0'))break;
  }
  await until('studyRoom.shelfHover()>=0',10000).catch(async error=>{
    console.error('DIAG shelf',JSON.stringify(await evaluate(`({nav:sceneCamera.navigation,mode:firstPerson.mode,hover:studyRoom.shelfHover(),
      body:document.body.className,lock:!!document.pointerLockElement,ready:document.getElementById('roomShell').classList.contains('is-ready'),
      lost:studyRoom.renderer.getContext().isContextLost(),under:${JSON.stringify(shelfScreens)}.map(p=>document.elementFromPoint(p.x,p.y)?.id)})`)),JSON.stringify(shelfScreens));
    throw error;});
  checks.shelfWebsite={hover:await evaluate('studyRoom.shelfHover()'),screens:shelfScreens};
  await clickSelector('#fpMenuButton');
  await until("!document.querySelector('#fpMenu').hidden");
  await clickSelector('.fp-mode:nth-child(2)');
  await until("firstPerson.mode==='game'",8000).catch(async error=>{console.error('DIAG',JSON.stringify(await evaluate("({mode:firstPerson.mode,nav:sceneCamera.navigation,menu:document.querySelector('#fpMenu').hidden,active:document.activeElement?.className,pressed:[...document.querySelectorAll('.fp-mode')].map(b=>b.getAttribute('aria-pressed')),body:document.body.className})")),JSON.stringify(errors));throw error;});
  if(!headless)try{await until("document.pointerLockElement===document.getElementById('roomCanvas')",12000);}
  catch{await clickSelector('#roomCanvas');await until("document.pointerLockElement===document.getElementById('roomCanvas')",12000);}
  for(let i=0;i<3;i++){
    const target=await evaluate(`(()=>{const root=studyRoom.scene.getObjectByName('physical shelf tools'),tool=root.children[${i}],point=tool.position.clone();
      tool.getWorldPosition(point);point.y+=.35;const w=firstPerson.walker,dx=point.x-w.x,dz=point.z-w.z;
      const yaw=Math.atan2(-dx,-dz)*180/Math.PI,tilt=-Math.atan2(point.y-w.eye,Math.hypot(dx,dz))*180/Math.PI;
      sceneCamera.lookBy(((yaw-w.yaw+540)%360)-180,w.tilt-tilt);return {yaw,tilt};})()`);
    await sleep(220);
    if(await evaluate('studyRoom.shelfHover()>=0')){checks.shelfGame={hover:await evaluate('studyRoom.shelfHover()'),target};break;}
  }
  assert.ok(checks.shelfGame,'The Game Mode centre sight acquires a shelf tool after aiming');

  // Game mode from the chair: the visitor stands up beside it, on floor
  // they can stand on (not in the table), and can walk away.
  await evaluate("firstPerson.setMode('website'),sceneCamera.go('chair',{instant:true}),true");
  await until("sceneCamera.navigation==='SEATED'",15000);
  await evaluate("window.__navLog=[];addEventListener('room-navigation',e=>__navLog.push([Math.round(performance.now()),e.detail.state]));addEventListener('first-person-mode',e=>__navLog.push([Math.round(performance.now()),'mode:'+e.detail.mode]));true");
  await clickSelector('#fpMenuButton');
  await until("!document.querySelector('#fpMenu').hidden");
  await clickSelector('.fp-mode:nth-child(2)');
  await until("firstPerson.mode==='game' && sceneCamera.navigation==='FREE'");
  const stood=await evaluate('(()=>{const p=firstPerson.walker;return {x:p.x,z:p.z,floor:firstPerson.floorAt(p.x,p.z,0),table:Math.hypot(p.x,p.z)};})()');
  assert.equal(stood.floor,0,'From the chair game mode stands the visitor on the floor: '+JSON.stringify(stood));
  assert.ok(stood.table>await evaluate('studyRoom.walk.table'),'Standing up from the chair is not in the table: '+JSON.stringify(stood));
  const state=()=>evaluate("({mode:firstPerson.mode,nav:sceneCamera.navigation,keys:[...firstPerson.keys].join(''),active:document.activeElement?.tagName,menu:!document.querySelector('#fpMenu').hidden,lock:!!document.pointerLockElement})");
  const before=await state();
  await key('KeyS',true);await sleep(450);const during=await state();await sleep(450);await key('KeyS',false);await sleep(200);
  const away=await evaluate('firstPerson.walker');
  assert.ok(Math.hypot(away.x-stood.x,away.z-stood.z)>.2,'Having stood up, the visitor can walk: '+JSON.stringify({stood,away,before,during,events:await evaluate('window.__navLog')}));
  checks.standFromSeat={stood,away:{x:away.x,z:away.z}};

  // A new visit: choosing a place past the invitation closes it (website
  // mode), and it does not come back.
  await evaluate("firstPerson.setMode('website'),sessionStorage.removeItem('fp-invited'),true");
  await cdp('Page.reload');
  await until("!!window.firstPerson && document.documentElement?.dataset.siteEntered!=='yes'||true");
  await until("(document.querySelector('.loading-gate__continue:not([hidden])')?.click(), document.documentElement?.dataset.siteEntered==='yes' && window.sceneCamera?.navigation==='ENTRY')");
  await until("!!document.querySelector('.fp-invite.is-shown')",10000);
  // The shelf's mark on the floor (its box's middle lies under the card).
  const shelfMark=await evaluate(`(()=>{const e=sceneCamera.points.shelf.position,p=sceneCamera.project(e[0],0,e[2]);
    return {x:Math.round(p.x),y:Math.round(p.y),hit:document.elementFromPoint(p.x,p.y)?.id};})()`);
  assert.equal(shelfMark.hit,'goShelf','The shelf mark takes the click beside the invitation: '+JSON.stringify(shelfMark));
  await click(shelfMark.x,shelfMark.y);
  await until("sceneCamera.navigation!=='ENTRY'",8000);
  await until("!document.querySelector('.fp-invite')",3000);
  assert.equal(await evaluate('firstPerson.mode'),'website','Choosing a place past the invitation keeps website mode');
  await until("sceneCamera.navigation==='SHELF_INSPECTION'",20000);await sleep(2500);
  assert.equal(await evaluate("!!document.querySelector('.fp-invite')"),false,'The invitation does not come back after a place is chosen');
  checks.inviteClosedByPlace=true;

  assert.deepEqual(errors,[],'Browser console and runtime errors');
  const report={url,viewport:[1440,900],checks,errors,warnings};
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  console.log('PASS: first-person modes, popup, pointer lock, movement/collisions, stair climb, shelf aim, sitting, navigation, and cloth interaction');
}finally{
  ws?.close();chrome.kill();server.close();
  if(resolve(profile).startsWith(prefix))await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});
}
