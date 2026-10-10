// Focused before/after loading and doorway evidence. --prepare-asset converts the source PNG to WebP.
import {createServer} from 'node:http';
import {readFile, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const project = resolve(import.meta.dirname, '..'), root=process.env.PORTFOLIO_TEST_ROOT || project, label=process.argv.find(a=>a.startsWith('--out='))?.slice(6)||'after', output = resolve(project, 'verification/living-exterior',label);
await mkdir(output, {recursive: true});
// Paths the server answers with 404, or holds until released.
const missing = new Set(), held = new Map();
const server = createServer(async (req, res) => {

  if(req.url.startsWith('/_gate-fixture.html')){
   const index=await readFile(resolve(project,'index.html'),'utf8');
   const begin=index.indexOf('<div class="loading-gate"');
   const end=index.indexOf('</script>',begin)+9;
   const gate=index.slice(begin,end);
   res.setHeader('Content-Type','text/html');
   res.end('<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="loading-gate.css"><link rel="stylesheet" href="loading-exterior.css"><body>'+gate+'<main id="experience" inert style="position:fixed;inset:0;background:#121b22;color:white"><div id="roomShell"></div><button id="probe" onclick="window.__clicks++">Fixture interaction</button></main><script>window.__clicks=0;window.__keys=0;addEventListener("keydown",()=>__keys++);let complete;window.siteReady=new Promise(r=>complete=r);window.__paint=()=>document.querySelector("#roomShell").classList.add("is-ready");window.__ready=(paint=true)=>{if(paint)__paint();const detail={state:paint?"ready":"degraded",parts:{room:paint?"ready":"failed"}};complete(detail);dispatchEvent(new CustomEvent("site-ready",{detail}));};</script></body></html>');
   return;
  }
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
  // (While a page is being replaced its globals come and go: an expression
  // that throws then counts as not yet, and the last error is reported.)
  async function until(expression, timeout = 90000) {
    const start = Date.now();let failure = '';
    while (!await evaluate(expression).catch(error => { failure = error.message; return false; })) {
      if (Date.now() - start > timeout) throw new Error('Timed out: ' + expression + (failure ? ' | last error: ' + failure.slice(0, 300) : ''));
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




  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`window.__longTasks=[];new PerformanceObserver(l=>__longTasks.push(...l.getEntries().map(e=>({at:e.startTime,ms:e.duration})))).observe({type:'longtask',buffered:true});window.__guard=[];(function frame(){const g=window.loadingGate,p=document.querySelector('#experience');if(g&&p&&document.readyState!=='loading')__guard.push({at:performance.now(),state:g.state,inert:p.inert,room:!!document.querySelector('#roomShell.is-ready,#roomShell.room-fallback')});if(!document.documentElement?.dataset.siteEntered)requestAnimationFrame(frame);})();`});
  const results=[],baseline=process.argv.includes('--baseline');
  async function key(){await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});}
  async function saveCase(name,extra={}){
   const data=await evaluate('({gate:window.loadingGate?.stats,events:__gate.events,guard:__guard,longTasks:__longTasks,exterior:window.loadingExterior3d?.stats||window.loadingExterior3d?.drawing})');
   data.name=name;data.errors=[...errors];data.warnings=[...warnings];Object.assign(data,extra);
   results.push(data);await writeFile(resolve(output,name+'.json'),JSON.stringify(data,null,2));
   const q=(a,p)=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))]??null;
   console.log(JSON.stringify({name,ready:data.gate?.readyAt,formation:data.gate?.formationAt,entered:data.gate?.enteredAt,frameP95:q(data.gate?.frames||[],.95),maxFrame:q(data.gate?.frames||[],1),maxLongTask:q(data.longTasks.map(t=>t.ms),1),errors:errors.length}));
   return data;
  }
  if(!process.argv.includes('--fixtures-only')){
   await cdp('Network.enable');await viewport(1440,900);
   for(const temperature of ['cold','warm']){
    if(temperature==='cold')await cdp('Network.clearBrowserCache');
    await cdp('Network.setCacheDisabled',{cacheDisabled:temperature==='cold'});
    errors.length=0;warnings.length=0;
    await cdp('Page.navigate',{url});
    if(baseline){await until("loadingGate.state==='waiting'");await until("performance.now()>loadingGate.stats.listeningAt+100");await key();}
    await until(entered);await sleep(350);await assertEntered(temperature);
    const r=await saveCase((baseline?'before-':'after-')+temperature);
    assert.equal(errors.length,0,JSON.stringify(errors));
    if(!baseline){
     assert.ok(r.guard.filter(f=>f.state!=='entered').every(f=>f.inert),'Input blocked throughout');
     assert.equal(r.exterior.disposed,true);assert.deepEqual(r.exterior.cleanup,{worker:true,observer:true,listeners:true});
     assert.ok(r.gate.readyAt<=r.gate.enteredAt&&r.gate.formationAt<=r.gate.enteredAt);
     const phases=r.gate.phases;
     const at=p=>phases.find(x=>x.phase===p)?.at;
     assert.ok(at('curtains')-at('arrival')>=1900,'Two-second stationary arrival');
     assert.ok(at('arrival')-at('approach')>=2400,'Dreamy approach lasts at least 2.4 s');
    }
   }
   if(!baseline){
    await viewport(390,844,'reduce');await cdp('Page.navigate',{url});
    await until(entered);await sleep(350);await assertEntered('Mobile reduced');
    const mobile=await saveCase('mobile-reduced');
    assert.equal(mobile.gate.way,'fade');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    await shot('mobile-entered');
   }
  }
  if(!baseline&&!process.argv.includes('--actual-only')){
   const fixture=url+'_gate-fixture.html';
   // Fast, genuinely settled fixture: formation still has to finish.
   await viewport(1440,900);await cdp('Page.navigate',{url:fixture});
   await until("typeof __ready==='function' && !!window.loadingGate && !!window.loadingExterior3d");
   await evaluate('__ready()');await sleep(700);
   assert.equal(await evaluate('loadingGate.state'),'loading','Fast readiness cannot skip formation');
   await key();await click(40,18);
   assert.equal(await evaluate('__clicks+__keys'),0,'Input capture blocks global handlers too');
   await until(entered);await sleep(350);await assertEntered('Fast fixture');
   const fast=await saveCase('fast-ready-fixture');
   assert.ok(fast.gate.formationAt>fast.gate.readyAt+4000);
   await click(40,18);assert.equal(await evaluate('__clicks'),1,'Input works after cleanup');
   // Slow room stays covered after complete formation; retry never grants entry.
   await cdp('Page.navigate',{url:fixture});await until("!!window.loadingExterior3d");
   await until("!!loadingGate.stats.formationAt");
   const a=await evaluate('loadingExterior3d.stats.drawing.frames');
   await sleep(1200);const b=await evaluate('loadingExterior3d.stats.drawing.frames');
   assert.ok(b>a,'Waiting building remains alive');
   assert.equal(await evaluate('loadingExterior3d.stats.phase'),'waiting');
   await until("!document.querySelector('.loading-gate__enter').hidden",30000);await shot('slow-wait');
   assert.equal(await evaluate('loadingGate.veiled'),true);
   const r=await evaluate("(()=>{const r=document.querySelector('.loading-gate__enter').getBoundingClientRect();return[r.x+r.width/2,r.y+r.height/2]})()");
   await click(...r);await until("!!window.__ready && !!window.loadingGate && !loadingGate.stats.formationAt");
   assert.equal(await evaluate("document.querySelector('#experience').inert"),true,'Retry reloads without unlocking');
   await until("!!window.loadingExterior3d");await evaluate('__ready(false)');await sleep(900);
   assert.equal(await evaluate('loadingGate.veiled'),true,'A degraded ready promise without a drawn room stays covered');
   await evaluate('__paint()');await until(entered);await sleep(350);await assertEntered('Recovered fixture');
   await saveCase('slow-recovered-fixture');
   // Full-motion mobile and resize, while readiness is held.
   await viewport(390,844);await cdp('Page.navigate',{url:fixture});await until("window.loadingExterior3d?.stats.phase==='waiting'");
   await shot('mobile-formed');
   assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
   await viewport(844,390);await sleep(500);await shot('landscape-resized');
   assert.equal(await evaluate('loadingExterior3d.stats.drawing.cssWidth || document.querySelector(".loading-living__canvas").clientWidth'),844);
   await viewport(390,844);await sleep(400);await evaluate('__ready()');await until(entered);await sleep(350);await assertEntered('Mobile resized');await saveCase('mobile-resize-fixture');
   // Reduced motion must draw one settled frame and stop, then fade after readiness.
   await viewport(1440,900,'reduce');await cdp('Page.navigate',{url:fixture});
   await until("!!loadingGate.stats.formationAt");await sleep(200);await shot('reduced-formed');
   assert.equal(await evaluate("document.querySelector('.loading-living').dataset.reducedMotion"),'true');
   await evaluate('__ready()');await until(entered);await sleep(350);const reduced=await saveCase('reduced-fixture');assert.equal(reduced.gate.way,'fade');
   // Missing OffscreenCanvas takes the static fallback, still respecting readiness.
   const absent=await cdp('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'OffscreenCanvas',{value:undefined,configurable:true});"});
   await viewport(1440,900);await cdp('Page.navigate',{url:fixture});await until("!!loadingGate.stats.formationAt");
   assert.equal(await evaluate('loadingGate.veiled'),true);await shot('static-fallback');await evaluate('__ready()');await until(entered);await sleep(350);
   const fallback=await saveCase('no-offscreen-fixture');assert.equal(fallback.gate.way,'fade-fallback');await assertEntered('Static fallback');
   await cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:absent.identifier});
   // Missing gate script fails closed with an accessible retry, not a half-loaded room.
   missing.add('/loading-gate.js');await cdp('Page.navigate',{url:fixture});
   await until("!!document.querySelector('.loading-gate__status.is-visible')");
   assert.equal(await evaluate("document.querySelector('#experience').inert"),true);
   assert.ok(await evaluate("!!document.getElementById('loadingGate') && !document.querySelector('.loading-gate__enter').hidden"));
   missing.delete('/loading-gate.js');errors.length=0;
   console.log('PASS: fast/slow readiness, retry, degraded guard, mobile resize, reduced motion, static fallback, missing gate');
  }
  if(!baseline){
   // The real site's own fallbacks (carried over from loading-gate-check,
   // which asked the visitor to press; this way in goes by itself).
   // Without WebGL the room shows its silhouette, and the gate still lets in.
   const noWebgl=await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){return type.includes('webgl')?null:original.call(this,type,...args);};`});
   await viewport(1440,900);await cdp('Page.navigate',{url});
   await until(entered,120000);await sleep(350);await assertEntered('No WebGL');
   assert.equal(await evaluate('document.documentElement.dataset.siteReady'),'fallback','No WebGL: ready with the fallback');
   assert.ok(await evaluate("!!document.querySelector('.room-fallback')"),'No WebGL: the silhouette shows');
   await shot('no-webgl');await saveCase('no-webgl');
   await cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:noWebgl.identifier});
   // A part that fails to load: the site is degraded, not stuck, once the room has drawn.
   missing.add('/portal-effects.js');errors.length=0;
   await cdp('Page.navigate',{url});await until(entered,120000);await sleep(350);await assertEntered('Missing part');
   assert.equal(await evaluate('document.documentElement.dataset.siteReady'),'degraded','A missing part: degraded, not stuck');
   assert.equal(await evaluate('siteReadiness.parts.orb.result'),'failed');
   missing.delete('/portal-effects.js');errors.length=0;
   // Without the exterior's module the solar core stands in, and the way in still works.
   missing.add('/loading-exterior-3d.js');
   await cdp('Page.navigate',{url});await until("!!window.loadingGate?.stats.portal");
   assert.equal(await evaluate('loadingGate.stats.portal'),'orb','No exterior module: the core stands in');
   assert.ok(await evaluate("!!document.querySelector('.loading-gate .loading-living__seed')"),'The stand-in core is shown');
   await until(entered,120000);await sleep(350);await assertEntered('No exterior module');
   assert.equal(await evaluate('loadingGate.stats.way'),'fade-fallback');
   missing.delete('/loading-exterior-3d.js');errors.length=0;
   console.log('PASS: no WebGL, a missing part, a missing exterior module');
  }
  await writeFile(resolve(output,'lifecycle-summary.json'),JSON.stringify(results.map(r=>({name:r.name,gate:r.gate,errors:r.errors})),null,2));
  assert.equal(errors.length,0,JSON.stringify(errors));await cdp('Browser.close',{},false).catch(()=>{});
}finally{
 ws?.close();server.close();chrome.kill();
 await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});
}

