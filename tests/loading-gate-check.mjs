// node tests/loading-gate-check.mjs — the loading gate (loading-gate.js,
// site-ready.js) in an isolated Chrome; screenshots in .qa.
// The gate covers the page from its first paint and keeps it inert until the
// room is genuinely ready, then lets the visitor in and is gone. Also: the
// way in on a phone, under reduced motion, without WebGL, with a part that
// fails to load, without the exterior's module or the gate's own script, and
// when the room is so slow that the visitor is offered to go in anyway.
import {createServer} from 'node:http';
import {readFile, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..'), output = resolve(root, '.qa');
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
    res.setHeader('Content-Type', ({'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml'})[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
const url = `http://127.0.0.1:${server.address().port}/`;
const profile = await mkdtemp(resolve(tmpdir(), 'portfolio-gate-check-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--enable-unsafe-swiftshader', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
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
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); fail(new Error('CDP timeout: ' + method)); }, 30000);
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

  // 1. Desktop: the gate from the first paint until the room is ready.
  await viewport(1440, 900);
  await cdp('Page.navigate', {url});
  await until(loaded);
  assert.ok(await evaluate(`(() => { const r = document.getElementById('loadingGate').getBoundingClientRect(); return r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight; })()`), 'The gate covers the viewport');
  assert.equal(await evaluate("document.querySelector('#experience').inert"), true, 'The page beneath is inert while loading');
  await until("!!document.querySelector('.loading-gate .loading-exterior.is-shown')");
  await shot('loading');
  const [x, y] = await evaluate(goChair);
  await click(x, y);
  await sleep(300);
  assert.equal(await evaluate("document.querySelector('#deviceTilt').dataset.approach"), 'entry', 'A click while loading reaches nothing beneath');
  await until("!!__gate.events['site-ready']");
  const ready = await evaluate("({state: siteReadiness && document.documentElement.dataset.siteReady, parts: Object.fromEntries(Object.entries(siteReadiness.parts).map(([k, v]) => [k, v.result])), roomShown: document.querySelector('#roomShell').classList.contains('is-ready'), stillGate: !!document.getElementById('loadingGate'), first: __gate.paint})");
  assert.equal(ready.state, 'ready', 'The room is ready: ' + JSON.stringify(ready));
  assert.deepEqual(ready.parts, {room: 'ready', water: 'ready', depth: 'ready', orb: 'ready', font: ready.parts.font}, 'Every part is ready');
  assert.ok(ready.roomShown, 'The room has drawn by the time it is ready');
  assert.ok(ready.stillGate, 'The gate was still there when the room became ready');
  assert.ok(ready.first?.gate, 'The first paint already holds the gate: ' + JSON.stringify(ready.first));
  await until(entered);
  await assertEntered('Desktop');
  const desk = await evaluate('loadingGate.stats');
  assert.equal(desk.portal, 'loading-portal', 'The exterior (loading-exterior.js) is what the gate shows');
  assert.ok(await evaluate("!document.querySelector('.loading-exterior') && !document.querySelector('.loading-exterior__live')"), 'The exterior and its 3D view are disposed with the gate');
  // The real 3D view flies in through the entrance; where it could not come
  // up in time (a software GPU), the still exterior zooms through it.
  assert.ok(['flight', 'through'].includes(desk.way), 'The way in goes through the doorway: ' + desk.way);
  assert.ok(desk.frames.length > 10, 'The way in is animated over frames');
  await sleep(600); await shot('entered');
  await click(x, y);
  await until("document.querySelector('#deviceTilt').dataset.approach !== 'entry'");
  console.log('PASS: the gate from the first paint, inert page, ready parts, the way in, a usable room (ready ' + Math.round(desk.readyAt) + ' ms, in ' + Math.round(desk.enteredAt) + ' ms)');

  // 2. A phone, and reduced motion.
  await viewport(390, 844);
  await cdp('Page.navigate', {url});
  await until(loaded);
  await shot('mobile-loading');
  assert.ok(await evaluate("(() => { const r = document.querySelector('.loading-gate__portal').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })()"), 'The portal fits the phone');
  await until(entered);
  await assertEntered('Mobile');
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, 'No sideways scroll after entry');
  await viewport(1440, 900, 'reduce');
  await cdp('Page.navigate', {url});
  await until(loaded);
  await until("!!document.querySelector('.loading-gate .loading-exterior')");
  assert.equal(await evaluate("document.querySelector('.loading-exterior').dataset.reducedMotion"), 'true', 'Reduced motion: the exterior knows');
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.loading-exterior__building, .loading-exterior__layer--b')].map(e => getComputedStyle(e).animationName + ':' + getComputedStyle(e).opacity)"), ['none:1', 'none:0'], 'Reduced motion: one still image, nothing moving');
  await until(entered);
  await assertEntered('Reduced motion');
  assert.equal(await evaluate('loadingGate.stats.way'), 'fade', 'Reduced motion: the gate fades instead of flying through');
  console.log('PASS: phone fit, reduced motion fade');

  // 3. Without WebGL, the room's silhouette; the gate still lets the visitor in.
  const noWebgl = await cdp('Page.addScriptToEvaluateOnNewDocument', {source: `const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type.includes('webgl') ? null : original.call(this, type, ...args); };`});
  await viewport(1440, 900);
  await cdp('Page.navigate', {url});
  await until(entered);
  await assertEntered('No WebGL');
  assert.equal(await evaluate('document.documentElement.dataset.siteReady'), 'fallback', 'No WebGL: ready with the fallback');
  assert.ok(await evaluate("!!document.querySelector('.room-fallback')"), 'No WebGL: the silhouette shows');
  await shot('no-webgl');
  await cdp('Page.removeScriptToEvaluateOnNewDocument', {identifier: noWebgl.identifier});

  // 4. A part that fails to load: the page shows what it has.
  missing.add('/portal-effects.js');
  errors.length = 0;
  await cdp('Page.navigate', {url});
  await until(entered);
  await assertEntered('Missing part');
  assert.equal(await evaluate('document.documentElement.dataset.siteReady'), 'degraded', 'A missing part: degraded, not stuck');
  assert.equal(await evaluate("siteReadiness.parts.orb.result"), 'failed');
  missing.delete('/portal-effects.js');
  errors.length = 0; // the missing script's own consequences are expected here

  // Without the exterior's module, the CSS orb stands in and the way in still works.
  missing.add('/loading-exterior.js');
  await cdp('Page.navigate', {url});
  await until(loaded);
  await until("!!window.loadingGate?.stats.portal");
  assert.equal(await evaluate('loadingGate.stats.portal'), 'orb', 'No exterior module: the orb stands in');
  assert.ok(await evaluate("!!document.querySelector('.loading-gate__orb')"), 'The stand-in orb is shown');
  await until(entered);
  await assertEntered('No exterior module');
  missing.delete('/loading-exterior.js');
  errors.length = 0;

  // 5. Without the gate's own script, there is no gate in the way.
  missing.add('/loading-gate.js');
  await cdp('Page.navigate', {url});
  await until(`document.readyState === 'complete' && ${entered}`);
  assert.ok(await evaluate("!document.getElementById('loadingGate') && !document.querySelector('[inert]')"), 'No gate script: no gate');
  missing.delete('/loading-gate.js');
  errors.length = 0;
  console.log('PASS: no WebGL, a missing part, a missing exterior module, a missing gate script');

  // 6. A room that never gets ready: after a while the visitor may go in.
  let release;
  held.set('/room-scene.js', new Promise(done => { release = done; }));
  await cdp('Page.navigate', {url});
  await until(loaded);
  await sleep(2000);
  assert.equal(await evaluate("document.querySelector('.loading-gate__enter').hidden"), true, 'The offer waits');
  await until("!document.querySelector('.loading-gate__enter').hidden", 30000);
  await shot('slow-offer');
  const offer = await evaluate("(() => { const r = document.querySelector('.loading-gate__enter').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()");
  await click(offer[0], offer[1]);
  await until(entered);
  assert.equal(await evaluate('loadingGate.stats.ready'), 'chosen', 'The visitor chose to go in');
  assert.ok(await evaluate("!document.getElementById('loadingGate') && !document.querySelector('[inert]')"), 'Gone in anyway: nothing in the way');
  held.delete('/room-scene.js'); release();
  console.log('PASS: the offer to go in when the room is unusually slow');

  assert.equal(errors.length, 0, JSON.stringify(errors));
  await cdp('Browser.close', {}, false).catch(() => {});
} finally {
  ws?.close(); server.close();
  const exited = new Promise(done => chrome.exitCode !== null ? done() : chrome.once('exit', done));
  chrome.kill(); await Promise.race([exited, new Promise(done => setTimeout(done, 5000))]);
  await rm(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 200}).catch(() => {});
}
