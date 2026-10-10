// Focused before/after loading and doorway evidence. --prepare-asset converts the source PNG to WebP.
import {createServer} from 'node:http';
import {readFile, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..'), label=process.argv.find(a=>a.startsWith('--out='))?.slice(6)||'after', output = resolve(root, 'verification/living-exterior',label);
await mkdir(output, {recursive: true});
// Paths the server answers with 404, or holds until released.
const missing = new Set(), held = new Map();
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = resolve(root, '.' + path.replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + sep) || missing.has(path)) { res.writeHead(404).end(); return; }
  if (held.has(path)) await held.get(path);
  try {
    const data = await readFile(file);
    res.setHeader('Content-Type', ({'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png':'image/png', '.webp':'image/webp'})[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
const url = `http://127.0.0.1:${server.address().port}/`;
const profile = await mkdtemp(resolve(tmpdir(), 'portfolio-gate-check-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--enable-unsafe-swiftshader', '--use-angle=d3d11', '--enable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], {windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
let ws;
try {
  const endpoint = await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error('Chrome startup timed out')), 20000);
    let log = '';
    chrome.once('error', error => { clearTimeout(timer); fail(error); });
    chrome.stderr.on('data', chunk => {
      log += chunk;
      const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); done(match[1]); }
    });
  });
  ws = new WebSocket(endpoint);
  await new Promise((done, fail) => { ws.addEventListener('open', done, {once: true}); ws.addEventListener('error', fail, {once: true}); });
  let serial = 0, session;
  const pending = new Map(), errors = [], warnings = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id); pending.delete(message.id);
      message.error ? request.fail(new Error(JSON.stringify(message.error))) : request.done(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'warning') warnings.push(message.params.args.map(a => a.value ?? a.description).join(' '));
  });
  const cdp = (method, params = {}, attached = true) => new Promise((done, fail) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); fail(new Error('CDP timeout: ' + method)); }, 90000);
    pending.set(id, {done: result => { clearTimeout(timer); done(result); }, fail: error => { clearTimeout(timer); fail(error); }});
    ws.send(JSON.stringify({id, method, params, ...(attached && session ? {sessionId: session} : {})}));
  });
  const {targetInfos} = await cdp('Target.getTargets', {}, false);
  session = (await cdp('Target.attachToTarget', {targetId: targetInfos.find(target => target.type === 'page').targetId, flatten: true}, false)).sessionId;
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Page.bringToFront');
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const sleep = ms => new Promise(done => setTimeout(done, ms));
  async function until(expression, timeout = 90000) {
    const start = Date.now();
    while (!await evaluate(expression)) {
      if (Date.now() - start > timeout) throw new Error('Timed out: ' + expression);
      await sleep(100);
    }
  }
  async function shot(name) {
    const {data} = await cdp('Page.captureScreenshot', {format: 'png'});
    await writeFile(resolve(output, 'gate-' + name + '.png'), Buffer.from(data, 'base64'));
  }
  async function click(x, y) {
    await cdp('Input.dispatchMouseEvent', {type: 'mouseMoved', x, y, buttons: 0});
    await cdp('Input.dispatchMouseEvent', {type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1});
    await cdp('Input.dispatchMouseEvent', {type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1});
  }
  async function viewport(width, height, motion = 'no-preference') {
    await cdp('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
    await cdp('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: motion}]});
  }
  // From the very start of each page: what the first paint holds, and when
  // ready / entering / entered happen.
  await cdp('Page.addScriptToEvaluateOnNewDocument', {source: `window.__gate = {events: {}, paint: null};
    new PerformanceObserver(list => { for (const entry of list.getEntries()) if (entry.name === 'first-contentful-paint' && !__gate.paint)
      __gate.paint = {at: entry.startTime, gate: !!document.getElementById('loadingGate')}; }).observe({type: 'paint', buffered: true});
    for (const name of ['site-ready', 'site-entering', 'site-entered']) addEventListener(name, event => { __gate.events[name] = {at: performance.now(), detail: event.detail}; });`});
  const loaded = "document.readyState !== 'loading' && !!document.getElementById('loadingGate')";
  const entered = "document.documentElement.dataset.siteEntered === 'yes'";
  const goChair = `(() => { const r = document.querySelector('#goChair').getBoundingClientRect(); return [Math.round(r.x + r.width / 2) || innerWidth / 2, Math.round(r.y + r.height / 2) || innerHeight / 2]; })()`;
  // After entry: the gate is gone, nothing is inert, and the page is on top.
  async function assertEntered(label) {
    assert.ok(await evaluate("!document.getElementById('loadingGate') && !document.querySelector('[inert]')"), label + ': the gate is gone and nothing is inert');
    assert.ok(await evaluate("!document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('.loading-gate')"), label + ': the page is on top');
    assert.ok(await evaluate("!!__gate.events['site-entered'] && __gate.events['site-entered'].at >= (__gate.events['site-ready']?.at ?? 0)"), label + ': entered after ready');
  }



  await viewport(1440,900);
  await cdp('Page.navigate',{url:url+'dev/living-exterior-preview.html'});
  await until("window.previewPortal && document.querySelector('.loading-living').dataset.view!=='starting'");
  await sleep(300);
  console.log('renderer',await evaluate('loadingExterior3d.stats.renderer'));
  assert.equal(await evaluate("loadingExterior3d.stats.renderer"),'webgl-worker','The worker compiled and drew');
  await evaluate("document.querySelector('.review').hidden=true");
  for(const [name,t] of [['core',.4],['dome',1.8],['walls',3.1],['tower',4.5],['formed',6.7],['breathing',10.6]]){
   await evaluate('loadingExterior3d.seek('+t+')');await sleep(250);await shot(name);
  }
  await evaluate('loadingExterior3d.play()');await sleep(2300);
  const preview=await evaluate('loadingExterior3d.stats');
  await writeFile(resolve(output,'preview.json'),JSON.stringify({preview,errors,warnings},null,2));
  assert.equal(errors.length,0,JSON.stringify(errors));
  if(!process.argv.includes('--preview-only')){
   await cdp('Network.enable');await cdp('Network.clearBrowserCache');await cdp('Network.setCacheDisabled',{cacheDisabled:true});
   await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`window.__guard=[];window.__phases=[];window.__longTasks=[];new PerformanceObserver(l=>__longTasks.push(...l.getEntries().map(e=>({at:e.startTime,ms:e.duration})))).observe({type:'longtask',buffered:true});addEventListener('loading-exterior-phase',e=>__phases.push({...e.detail,at:performance.now()}));(function sample(){const g=window.loadingGate,p=document.querySelector('#experience');if(g&&p&&document.readyState!=='loading')__guard.push({at:performance.now(),state:g.state,inert:p.inert,room:!!document.querySelector('#roomShell.is-ready,#roomShell.room-fallback')});if(!document.documentElement?.dataset.siteEntered)requestAnimationFrame(sample);})();`});
   await cdp('Page.navigate',{url});
   await until("window.loadingExterior3d?.stats.phase==='waiting'||window.loadingGate?.state==='entering'");
   await shot('ready');
   if(process.argv.includes('--sequence')){
    await until("loadingGate.state==='entering'");
    await evaluate('loadingExterior3d.pause()');await sleep(200);
    // Along the flight's own timeline (the worker's ENTRY): up to the door,
    // the curtains, and the walk in, through the doorway and the passage to
    // the entry, where the room's camera (following it) must be at its place.
    const E=await evaluate('loadingExterior3d.stats.drawing.entry'),A=E.approach,B=A+E.arrival,C=B+E.curtains,D=C+E.walk;
    const room="({x:sceneCamera.x,y:sceneCamera.eyeHeight,z:sceneCamera.distance,yaw:sceneCamera.camera.yaw,originY:sceneCamera.originY,wayIn:sceneCamera.wayIn})";
    const walk=[];
    for(const [name,t] of [['approach',A/2],['arrival',A+E.arrival/2],['curtains',B+E.curtains*.6],['walk',C+E.walk*.25],['doorway',C+E.walk*.45],['passage',C+E.walk*.58],['inside',C+E.walk*.75],['handoff',D-.02]]){
     await evaluate('loadingExterior3d.seekFlight('+t+')');await sleep(300);await shot(name);
     walk.push({name,t,room:await evaluate(room)});
    }
    console.log(JSON.stringify(walk.map(({name,room})=>[name,room.z?.toFixed?.(2),room.wayIn&&room.wayIn.z.toFixed(2)])));
    await writeFile(resolve(output,'walk.json'),JSON.stringify(walk,null,2));
    await evaluate('loadingExterior3d.seekFlight('+(D+.05)+')');
   }
   await until(entered);await sleep(500);await shot('entered');await assertEntered('Desktop');
   // The way in handed the room's camera back at its entry, the outer door
   // shut behind the visitor.
   const home=await evaluate("({wayIn:sceneCamera.wayIn,nav:sceneCamera.navigation,x:sceneCamera.x,y:sceneCamera.eyeHeight,z:sceneCamera.distance,entry:sceneCamera.entryView,door:studyRoom.scene.getObjectByName('outer door').visible&&studyRoom.scene.getObjectByName('outer door straps').visible})");
   assert.equal(home.wayIn,null,'The way in lets the camera go');
   assert.equal(home.nav,'ENTRY');assert.equal(home.door,true,'The outer door is shut behind the visitor');
   assert.ok(Math.hypot(home.x-home.entry.x,home.y-home.entry.y,home.z-home.entry.z)<.05,'The camera stands at the entry: '+JSON.stringify(home));
   const report=await evaluate('({gate:loadingGate.stats,events:__gate.events,guard:__guard,phases:__phases,longTasks:__longTasks,exterior:loadingExterior3d.stats})');
   assert.ok(report.guard.filter(f=>f.state!=='entered').every(f=>f.inert),'Input stays blocked until entry completes');
   assert.ok(report.gate.readyAt<report.gate.enteredAt,'Actual readiness precedes entry');
   assert.ok(report.gate.formationAt<report.gate.enteredAt,'Formation precedes entry');
   assert.equal(report.exterior.disposed,true);assert.deepEqual(report.exterior.cleanup,{worker:true,observer:true,listeners:true});
   assert.equal(report.gate.way,'flight','Real 3D entry, not silent fallback');
   await writeFile(resolve(output,'report.json'),JSON.stringify({...report,errors,warnings},null,2));
   console.log(JSON.stringify({ready:report.gate.readyAt,formation:report.gate.formationAt,entered:report.gate.enteredAt,frames:report.gate.frames.length,maxFrame:Math.max(...report.gate.frames),errors,warnings}));
  }
  assert.equal(errors.length,0,JSON.stringify(errors));
  await cdp('Browser.close',{},false).catch(()=>{});
}finally{
 ws?.close();server.close();chrome.kill();
 await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});
}

