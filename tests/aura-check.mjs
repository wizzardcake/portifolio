// Local, isolated Chrome regression check. No packages or user browser profile.
import {createServer} from 'node:http';
import {readFile, mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const root = process.env.PORTFOLIO_TEST_ROOT || resolve(import.meta.dirname, '..');
const output = process.env.PORTFOLIO_TEST_ROOT ? resolve(root, 'checks') : resolve(import.meta.dirname, '..', '.qa');
await mkdir(output, {recursive: true});
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + sep)) {res.writeHead(403).end(); return;}
  try {
    const data = await readFile(file);
    res.setHeader('Content-Type', ({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch {res.writeHead(404).end();}
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
console.log('Local test server', port);
const profile = await mkdtemp(resolve(tmpdir(), 'portfolio-check-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--enable-unsafe-swiftshader', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
], {windowsHide: true, stdio: ['ignore','ignore','pipe']});
let ws;
try {
  const endpoint = await new Promise((done, fail) => {
    const timeout = setTimeout(() => fail(new Error('Chrome startup timed out')), 20000);
    let log = '';
    chrome.on('error', fail);
    chrome.stderr.on('data', chunk => {log += chunk; const m = log.match(/DevTools listening on (ws:\/\/\S+)/); if (m) {clearTimeout(timeout); done(m[1]);}});
  });
  console.log('Chrome ready');
  ws = new WebSocket(endpoint);
  await new Promise((done, fail) => {
    const timeout = setTimeout(() => fail(new Error('DevTools connection timed out')), 12000);
    ws.addEventListener('open', () => {clearTimeout(timeout); done();}, {once: true});
    ws.addEventListener('error', fail, {once: true});
  });
  let serial = 0, session;
  const pending = new Map(), errors = [];
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const {done, fail} = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? fail(new Error(JSON.stringify(msg.error))) : done(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args);
  });
  function cdp(method, params = {}, withSession = true) {
    return new Promise((done, fail) => {
      const timeout = setTimeout(() => fail(new Error('CDP timed out: ' + method)), 18000);
      const id = ++serial; pending.set(id, {done: result => {clearTimeout(timeout); done(result);}, fail: error => {clearTimeout(timeout); fail(error);}});
      ws.send(JSON.stringify({id, method, params, ...(withSession && session ? {sessionId: session} : {})}));
    });
  }
  const {targetInfos} = await cdp('Target.getTargets', {}, false);
  const {targetId} = targetInfos.find(target => target.type === 'page');
  session = (await cdp('Target.attachToTarget', {targetId, flatten: true}, false)).sessionId;
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Page.bringToFront');
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true});
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function until(expression, timeout = 60000) {
    const start = Date.now();
    while (!await evaluate(expression)) {
      if (Date.now() - start > timeout) throw new Error('Timed out: ' + expression + '\n' + JSON.stringify(await evaluate(`({state:document.readyState,hidden:document.hidden,body:document.body.className,aura:window.portalAura?.stats,errors:[...document.querySelectorAll('body>div')].filter(e=>e.textContent.startsWith('JS ERROR')).map(e=>e.textContent)})`)));
      await sleep(100);
    }
  }
  async function shot(name) {
    const {data} = await cdp('Page.captureScreenshot', {format:'png'});
    await writeFile(resolve(output, name + '.png'), Buffer.from(data, 'base64'));
  }
  async function bounds(selector) {
    return evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom}})()`);
  }
  async function click(selector) {
    const r = await bounds(selector);
    // Click an actual exposed point. The existing card hand can overlap the
    // middle of the retrieval pill; never dispatch to an unrelated element.
    const point = await evaluate(`(() => {
      const r=${JSON.stringify(r)}, selector=${JSON.stringify(selector)};
      for(const [u,v] of [[.5,.5],[.05,.5],[.95,.5],[.5,.2],[.5,.8]]) {
        const x=r.left+r.w*u,y=r.top+r.h*v;
        if(document.elementFromPoint(x,y)?.closest(selector)) return {x,y,center:u===.5&&v===.5};
      }
      // The rear cards expose a narrow rotated strip, not their centers.
      for(let y=Math.max(0,r.top)+4;y<Math.min(innerHeight,r.bottom)-4;y+=6) {
        for(let x=Math.max(0,r.left)+4;x<Math.min(innerWidth,r.right)-4;x+=6) {
          if(document.elementFromPoint(x,y)?.closest(selector)) return {x,y,center:false};
        }
      }
      return null;
    })()`);
    assert.ok(point, 'No exposed pointer target for ' + selector);
    if (!point.center) console.log('Using exposed edge of partially covered', selector);
    await cdp('Input.dispatchMouseEvent', {type:'mousePressed', x:point.x, y:point.y, button:'left',clickCount:1});
    await cdp('Input.dispatchMouseEvent', {type:'mouseReleased', x:point.x, y:point.y, button:'left',clickCount:1});
  }
  async function drag(selector, target) {
    const from = await bounds(selector);
    const hit = await evaluate(`document.elementFromPoint(${from.x},${from.y})?.closest('.sub-card')?.dataset.app`);
    assert.equal(hit, await evaluate(`document.querySelector(${JSON.stringify(selector)}).dataset.app`), 'Dragged card must be the visible pointer target');
    await cdp('Input.dispatchMouseEvent', {type:'mousePressed', x:from.x, y:from.y, button:'left',buttons:1,clickCount:1});
    for (let i=1;i<=18;i++) {
      await cdp('Input.dispatchMouseEvent', {type:'mouseMoved', x:from.x+(target.x-from.x)*i/18,y:from.y+(target.y-from.y)*i/18,buttons:1});
      await sleep(16);
    }
    // The front card is aimed with a spectral ghost (the card stays in the
    // hand); any other card is moved itself to re-sort the hand.
    const ghosted = await evaluate(`!!document.querySelector('.card-ghost')`);
    const atTarget = await bounds(ghosted ? '.card-ghost' : selector);
    assert.ok(Math.hypot(atTarget.x-target.x,atTarget.y-target.y)<12,
      'The dragged card (or its ghost) must follow the pointer without jumping out of the fan');
    await cdp('Input.dispatchMouseEvent', {type:'mouseReleased', x:target.x, y:target.y,button:'left',clickCount:1});
  }
  // Pull the cloth off the covered table: press on it and draw it toward the viewer.
  async function pullCloth(distance = 264) {
    const cloth = await bounds('#tableCloth');
    await cdp('Input.dispatchMouseEvent', {type:'mousePressed',x:cloth.x,y:cloth.y,button:'left',buttons:1,clickCount:1});
    for (let i=1;i<=12;i++) {
      await cdp('Input.dispatchMouseEvent', {type:'mouseMoved',x:cloth.x,y:cloth.y+distance*i/12,buttons:1});
      await sleep(25);
    }
    await cdp('Input.dispatchMouseEvent', {type:'mouseReleased',x:cloth.x,y:cloth.y+distance,button:'left',clickCount:1});
  }
  async function assertViewport() {
    const state = await evaluate(`(() => {
      const r=document.querySelector('#experience').getBoundingClientRect();
      return {w:innerWidth,h:innerHeight,root:[r.x,r.y,r.width,r.height],
        doc:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],
        body:[document.body.scrollWidth,document.body.scrollHeight],x:scrollX,y:scrollY};
    })()`);
    assert.deepEqual(state.root,[0,0,state.w,state.h],'The experience is exactly the visible viewport');
    assert.deepEqual(state.doc,[state.w,state.h],'The document has no overflow');
    assert.deepEqual(state.body,[state.w,state.h],'The hand/canvas cannot increase body size');
    assert.equal(state.x+state.y,0,'The scene never scrolls');
  }
  async function assertHeldHand() {
    const h=await evaluate(`innerHeight`), card=await bounds('.hand-card--prosjekter');
    assert.ok(card.top>h*.65 && card.top<h*.85 && card.bottom>h,'Cards emerge from below the viewport');
    assert.equal(await evaluate(`!!document.querySelector('#desktop').closest('#deviceTilt')`),false,'The hand is independent of the table camera');
    const origin=await bounds('.portal-origin');
    assert.ok(origin.y<card.top-40,'The held cards leave the portal center visible');
  }
  async function assertRemainingHand() {
    assert.equal(await evaluate(`[...document.querySelectorAll('.hand-card .sub-card')].filter(e=>getComputedStyle(e).visibility==='visible' && +getComputedStyle(e).opacity>0).length`),4,'Exactly the active card leaves the hand');
  }
  // Software-rendered room startup can exceed the old interaction test's 14s.
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await cdp('Page.navigate',{url:`http://127.0.0.1:${port}/`});
  await until(`!!window.portalAura && !!window.studyRoom && deviceTilt.dataset.approach==='ready'`);
  const dormant=await evaluate(`portalAura.stats`);
  assert.equal(dormant.active,false);assert.ok(dormant.lights.every(x=>x===0));
  await shot('aura-covered');
  const invariants=()=>evaluate(`JSON.stringify({camera:[sceneCamera.fov,sceneCamera.eyeHeight,sceneCamera.distance,sceneCamera.camera.pitch],table:[document.querySelector('.portal-table').clientWidth,document.querySelector('.portal-table').clientHeight],portal:[screen.clientWidth,screen.clientHeight],canvas:document.querySelectorAll('canvas').length})`.replace('screen.clientWidth','document.querySelector("#screen").clientWidth').replace('screen.clientHeight','document.querySelector("#screen").clientHeight'));
  const before=await invariants();
  await pullCloth(12);await sleep(600);
  assert.equal(await evaluate(`portalCloth.covered`),true,'Short cloth pull is unchanged');
  await pullCloth(180);
  await until(`document.body.classList.contains('intro-done') && !document.querySelector('.portal-flight')`);
  await until(`portalAura.stats.active && portalAura.stats.fade===1`);
  await assertViewport();await assertHeldHand();
  assert.equal(await invariants(),before,'Aura activation cannot change camera, tabletop, portal or canvas count');

  // Read two real room surfaces immediately after drawing, without relying on
  // screenshot brightness thresholds or DOM overlays over the table.
  const sample=()=>evaluate(`(() => {
    const r=studyRoom.renderer,c=studyRoom.camera,gl=r.getContext();c.layers.set(0);r.render(studyRoom.scene,c);
    return [[1.9,.005,-.7],[-1.9,.005,-.7],[1.9,.005,-1.2],[-1.9,.005,-1.2],[-2.38,.45,-.5],[0,2.43,-3.7]].map(q=>{
      const p=studyRoom.project(...q),pixel=new Uint8Array(4);
      gl.readPixels(Math.round(p.x*roomCanvas.width/innerWidth),Math.round((innerHeight-p.y)*roomCanvas.height/innerHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      return [...pixel];
    });
  })()`);
  await evaluate(`portalAura.setEnabled(false)`);await sleep(350);
  const dark=await sample();await shot('aura-before-1440');
  await evaluate(`portalAura.setEnabled(true)`);await sleep(350);
  const lit=await sample();await shot('aura-after-1440');
  console.log('Surface RGB before / after',JSON.stringify({dark,lit}));
  assert.ok(lit.slice(0,4).some((pixel,j)=>pixel.slice(0,3).some((n,i)=>n>dark[j][i]+2)),'Aura lights affect the nearby floor');
  assert.ok(lit[4].slice(0,3).some((n,i)=>n>dark[4][i]+2),'Aura lights affect nearby architecture');
  const farDelta=lit[5].slice(0,3).reduce((s,n,i)=>s+Math.abs(n-dark[5][i]),0);
  assert.ok(farDelta<8,'Distant architecture keeps its original lighting');
  const steady=await evaluate(`portalAura.stats`);await sleep(300);
  assert.equal((await evaluate(`portalAura.stats`)).frames,steady.frames,'Reduced motion freezes aura animation');
  if(!process.argv.includes('--preview-only')) {
    // Exercise all five existing drag/activation/return paths under the aura.
    for(const id of ['prosjekter','arbeidserfaring','kurs','verktoy','ommeg']) {
      await evaluate(`bringHandCardToFront('${id}')`);await sleep(400);
      await drag(`.hand-card--${id} .sub-card`,await bounds('.portal-origin'));
      await until(`document.querySelector('#app-${id}').classList.contains('active')`);
      await sleep(500);await assertRemainingHand();await assertViewport();
      await click('#portalRetrieve');await sleep(650);console.log('PASS: aura + drag/return',id);
    }
    await evaluate(`document.querySelector('.hand-card--prosjekter .sub-card').focus({preventScroll:true})`);
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    assert.equal(await evaluate(`handOrder[0]`),'prosjekter','First Enter brings the rear card forward');
    assert.equal(await evaluate(`!!document.querySelector('.app-view.active')`),false);
    await sleep(400);
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await until(`document.querySelector('#app-prosjekter').classList.contains('active')`);
    await sleep(400);await assertRemainingHand();await click('#portalRetrieve');await sleep(650);
  }
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  const moving=await evaluate(`portalAura.stats`);
  await until(`portalAura.stats.elapsed >= ${moving.elapsed+.8}`,30000);
  const moved=await evaluate(`portalAura.stats`);
  assert.ok(Math.abs(moving.pulse-moved.pulse)>.002,'The portal has a slow idle pulse');
  assert.ok(moved.frames-moving.frames<=Math.ceil((moved.elapsed-moving.elapsed)*24)+2 && moved.lightUpdates-moving.lightUpdates<=Math.ceil((moved.elapsed-moving.elapsed)*8)+2,'DOM and room-light updates stay capped');
  await shot('aura-moving-1440');console.log('Aura animation budget',moving,moved);
  await evaluate(`Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))`);
  const paused=await evaluate(`portalAura.stats.frames`);await sleep(250);
  assert.equal(await evaluate(`portalAura.stats.frames`),paused,'Hidden tabs stop aura work');
  await evaluate(`delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))`);
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const [width,height] of [[1920,910],[390,844]]) {
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await sleep(600);await assertViewport();await assertHeldHand();await shot('aura-after-'+width);
    assert.equal(await evaluate(`portalAura.stats.motes`),width<600?12:28);
  }
  await click('#introBack');await until(`document.body.classList.contains('table-covered')`);
  assert.equal((await evaluate(`portalAura.stats`)).active,false,'Reset extinguishes aura without touching the cloth');
  if(!process.argv.includes('--preview-only')) {
    await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.includes('webgl')?null:original.call(this,type,...args)}`});
    await cdp('Page.reload');await until(`!!window.portalAura && deviceTilt.dataset.approach==='ready'`);
    await click('#introForward');await until(`document.body.classList.contains('intro-done') && !document.querySelector('.portal-flight')`);
    await assertViewport();await shot('aura-fallback');
    assert.equal((await evaluate(`portalAura.stats`)).lights.length,0,'CSS aura survives unavailable WebGL');
    await drag('.hand-card--prosjekter .sub-card',await bounds('.portal-origin'));
    await until(`document.querySelector('#app-prosjekter').classList.contains('active')`);
    await sleep(650);await assertRemainingHand();
  }
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('PASS: aura light spill, contained atmosphere, unchanged framing, pulse, update budget, motion preference and interactions');
  await cdp('Browser.close',{},false);
} finally {ws?.close();chrome.kill();server.close();}