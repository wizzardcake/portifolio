// node tests/tools-check.mjs — isolated Chrome checks; screenshots/traces in .qa.
import {createServer} from 'node:http';
import {readFile, mkdir, mkdtemp, writeFile, rm} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..'), output = resolve(root, '.qa');
await mkdir(output, {recursive: true});
const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    res.setHeader('Content-Type', ({'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml'})[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
const url = `http://127.0.0.1:${server.address().port}/`;
const profile = await mkdtemp(resolve(tmpdir(), 'portfolio-tools-check-'));
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
  const pending = new Map(), errors = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id); pending.delete(message.id);
      message.error ? request.fail(new Error(JSON.stringify(message.error))) : request.done(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args);
  });
  const cdp = (method, params = {}, attached = true) => new Promise((done, fail) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); fail(new Error('CDP timeout: ' + method)); }, 30000);
    pending.set(id, {done: result => { clearTimeout(timer); done(result); }, fail: error => { clearTimeout(timer); fail(error); }});
    ws.send(JSON.stringify({id, method, params, ...(attached && session ? {sessionId: session} : {})}));
  });
  const {targetInfos} = await cdp('Target.getTargets', {}, false);
  session = (await cdp('Target.attachToTarget', {targetId: targetInfos.find(target => target.type === 'page').targetId, flatten: true}, false)).sessionId;
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const sleep = ms => new Promise(done => setTimeout(done, ms));
  async function until(expression, timeout = 45000) {
    const start = Date.now();
    while (!await evaluate(expression)) {
      if (Date.now() - start > timeout) throw new Error('Timed out: ' + expression + '\n' + JSON.stringify(await evaluate(`({
        hidden: document.hidden, body: document.body.className, tools: window.toolsPage?.stats,
        orb: window.portalOrb?.stats.mode, ready: document.querySelector('#deviceTilt')?.dataset.approach
      })`)));
      await sleep(80);
    }
  }
  const motion = value => cdp('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value}]});
  const viewport = (width, height) => cdp('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: width < 900});
  const shot = async name => {
    const {data} = await cdp('Page.captureScreenshot', {format: 'png'});
    await writeFile(resolve(output, `tools-${name}.png`), Buffer.from(data, 'base64'));
  };
  async function reveal() {
    await until("!!window.toolsPage && document.querySelector('#deviceTilt').dataset.approach === 'ready'");
    await evaluate("document.querySelector('#introForward').click(); true");
    await until("document.body.classList.contains('intro-done') && !document.querySelector('.portal-flight') && portalMatter.canReact");
  }
  const activeAnimations = `document.getAnimations().filter(a => a.playState === 'running' &&
    a.effect?.target?.closest?.('#app-verktoy, .tools-field')).length`;
  const clean = `!toolsPage.stats.active && !document.querySelector('#app-verktoy').classList.contains('is-forming')`;
  async function project(appId = 'verktoy') {
    assert.equal(await evaluate(`portalMatter.project(${JSON.stringify(appId)}).then(ok => { if (ok) openApp(${JSON.stringify(appId)}); return ok; })`), true);
  }

  await viewport(1440, 900); await motion('reduce');
  await cdp('Page.navigate', {url}); await reveal();
  const canvases = await evaluate("document.querySelectorAll('canvas').length");
  assert.ok(await evaluate("!!document.querySelector('.portal-page .tools-field')"), 'The field uses the existing reader plane');
  assert.equal(await evaluate('toolsPage.stats.active'), false, 'Tools does no work before activation');
  await motion('no-preference');
  await until('!portalReaction.stats.reducedMotion');

  // Use the real keyboard throw, including card arrival, dive and rendered handoff.
  await evaluate(`(() => {
    window.__toolsTrace = []; window.__toolsTracing = true; window.__toolsArrival = 0;
    addEventListener('card-portal-arrival', () => { __toolsArrival = performance.now(); }, {once: true});
    (function read() {
      if (!__toolsTracing) return;
      const s = toolsPage.stats, app = document.querySelector('#app-verktoy'), field = document.querySelector('.tools-field');
      const fs = getComputedStyle(field), as = getComputedStyle(app), r = field.getBoundingClientRect();
      // Each flung logo and its slot's own logo: never both showing at once.
      const clones = [...document.querySelectorAll('.tools-seeds .tools-seed')];
      const slots = [...app.querySelectorAll('[data-tool-seed] .tool-logo')];
      const doubles = clones.filter((clone, i) => clone.style.display !== 'none' && Number(getComputedStyle(clone).opacity) > .05 &&
        slots[i] && Number(getComputedStyle(slots[i]).opacity) > .05).length;
      __toolsTrace.push({time: performance.now(), active: s.active, progress: s.progress, settled: s.settled,
        forming: app.classList.contains('is-forming'), fieldVisible: fs.display !== 'none' && fs.visibility !== 'hidden' && Number(fs.opacity) > .01,
        appVisible: as.display !== 'none' && as.visibility !== 'hidden' && Number(as.opacity) > .01,
        x: r.x, y: r.y, w: r.width, h: r.height, transform: fs.transform, pose: portalOrb.stats.pose,
        fieldPose:s.pose, offset:s.offset, morph: portalOrb.stats.morph, doubles,
        flying: clones.filter(clone => Number(getComputedStyle(clone).opacity) > .05).length});
      if (__toolsTrace.length < 1000) requestAnimationFrame(read);
    })();
    bringHandCardToFront('verktoy');
    document.querySelector('.hand-card--verktoy .sub-card').focus(); return true;
  })()`);
  await cdp('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13});
  await cdp('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13});
  await until('toolsPage.stats.active && !toolsPage.stats.settled');
  await until('toolsPage.stats.progress > .3');
  await shot('forming');
  await until("toolsPage.stats.settled && document.querySelector('#app-verktoy').classList.contains('active')");
  await sleep(650);
  const trace = await evaluate('window.__toolsTracing = false; __toolsTrace');
  await writeFile(resolve(output, 'tools-formation-trace.json'), JSON.stringify(trace, null, 2));
  assert.ok(await evaluate('__toolsArrival > 0'), 'The keyboard card really arrives through the throw lifecycle');
  const forming = trace.filter(f => f.active && f.progress > .02 && f.progress < .98);
  assert.ok(forming.some(f => f.fieldVisible && f.forming), 'Energy is visible during the orb morph');
  assert.ok(forming.some(f => f.appVisible && f.morph < 1), 'The interface forms before the orb finishes');
  assert.ok(forming.length > 2, 'Multiple formation frames are sampled');
  assert.ok(forming.every((f, i) => i === 0 || f.progress >= forming[i - 1].progress), 'Formation advances continuously');
  assert.ok(forming.every(f => ['x', 'y', 'z', 'w', 'h'].every(key => Math.abs(f.fieldPose[key] - f.pose[key]) < .01)),
    'The field samples the actual moving orb pose on the same frame');
  const fieldPoses = new Set(forming.filter(f => f.fieldVisible).map(f => [f.transform, Math.round(f.x), Math.round(f.y), Math.round(f.w)].join('|')));
  assert.ok(fieldPoses.size > 1, 'The energy field grows/moves with the projection');
  assert.ok(forming.some(f => f.flying > 0), 'Logos are flung out of the orb during formation');
  assert.ok(trace.every(f => f.doubles === 0), 'A flung logo and its slot are never both showing: ' +
    JSON.stringify(trace.filter(f => f.doubles).map(f => [Math.round(f.progress * 100) / 100, f.doubles])));
  // The card's retrieval button keeps clear of the tools, and on an ordinary
  // desktop every group shows without scrolling.
  const clearance = await evaluate(`(() => {
    const button = document.querySelector('#portalRetrieve'), b = button.getBoundingClientRect(), content = document.querySelector('#app-verktoy .tools-content');
    const groups = [...document.querySelectorAll('#app-verktoy .tool-group')].map(g => g.getBoundingClientRect());
    return {shown: !button.hidden, overlap: groups.some(g => b.left < g.right && b.right > g.left && b.top < g.bottom && b.bottom > g.top),
      scroll: content.scrollHeight - content.clientHeight};
  })()`);
  assert.ok(clearance.shown && !clearance.overlap, 'The retrieval button does not cover the tools: ' + JSON.stringify(clearance));
  assert.ok(clearance.scroll <= 2, 'Every group fits without scrolling at 1440 x 900: ' + JSON.stringify(clearance));
  const settled = await evaluate(`(() => {
    const app = document.querySelector('#app-verktoy');
    return {stats: toolsPage.stats, headings: [...app.querySelectorAll('.tool-group h3')].map(el => el.textContent.trim()),
      seeds: app.querySelectorAll('[data-tool-seed]').length,
      logos: [...app.querySelectorAll('img')].map(img => ({local: new URL(img.src).origin === location.origin, loaded: img.complete && img.naturalWidth > 0,
        named: img.hasAttribute('alt') && (img.alt || img.closest('.tool-item')?.querySelector('.tool-name')?.textContent.trim())})),
      canvases: document.querySelectorAll('canvas').length};
  })()`);
  assert.equal(settled.headings.length, 4, 'Four clear tool categories');
  assert.deepEqual(settled.headings.map(s => s.toLocaleLowerCase('nb')), ['design', 'seo & analyse', 'web & utvikling', 'ai & produktivitet']);
  assert.equal(settled.seeds, 4, 'Only four selected logos take the longer emergence paths');
  assert.ok(settled.logos.length >= 8 && settled.logos.every(img => img.local && img.loaded && img.named), 'Recognizable local logos load with accessible names');
  assert.equal(settled.canvases, canvases, 'No additional canvas/WebGL context is needed');
  await shot('desktop');
  console.log('PASS: keyboard throw, continuous forming field, early interface reveal, categories and local logos, no extra canvas');

  // A real background tab exercises visibilitychange, rather than faking a
  // browser visibility property. Only this disposable test browser is touched.
  const background = await cdp('Target.createTarget', {url: 'about:blank', background: false}, false);
  await cdp('Target.activateTarget', {targetId: background.targetId}, false);
  try {
    await until('document.hidden && toolsPage.stats.paused', 10000);
    assert.equal(await evaluate(activeAnimations), 0, 'A hidden Tools page pauses its ambient animations');
  } finally {
    await cdp('Target.closeTarget', {targetId: background.targetId}, false);
    await cdp('Page.bringToFront');
  }
  await until('!document.hidden && !toolsPage.stats.paused');
  console.log('PASS: ambient animation pauses in a hidden tab and resumes when visible');

  // Back uses the existing parked-card retrieval and stops Tools effects.
  await evaluate("document.querySelector('#app-verktoy [data-close]').click(); true");
  await until(`portalMatter.canReact && ${clean}`);
  assert.equal(await evaluate(activeAnimations), 0, 'Closed Tools has no running CSS animations');
  assert.equal(await evaluate("!!document.querySelector('.card-throw')"), false, 'No flying card is left behind');

  // Cancel a partially formed page; its awaited projection must also settle.
  await evaluate("window.__cancelledTools = portalMatter.project('verktoy'); true");
  await until('toolsPage.stats.active && toolsPage.stats.progress > .1 && !toolsPage.stats.settled');
  await evaluate('portalMatter.reset(); true');
  assert.equal(await evaluate('__cancelledTools'), false, 'Reset cancels the pending page promise');
  assert.ok(await evaluate(clean), 'Reset clears the presentation state');
  assert.equal(await evaluate(activeAnimations), 0, 'Reset stops presentation animations');
  await evaluate('portalMatter.unlock(80)');
  await project(); await until('toolsPage.stats.settled');
  assert.equal(await evaluate("document.querySelectorAll('.tools-field').length"), 1, 'Reopening reuses its single field');
  await evaluate('closeApp(); true'); await until(`portalMatter.canReact && ${clean}`);
  await project('kurs');
  assert.ok(await evaluate("document.querySelector('#app-kurs').classList.contains('active') && !toolsPage.stats.active"), 'Another page keeps its ordinary projection');
  await evaluate('closeApp(); true'); await until('portalMatter.canReact');
  console.log('PASS: retrieval cleanup, reset during formation, reopen without duplicates, unaffected ordinary page');

  // Reduced motion makes the full interface readable with no ambient animation.
  await motion('reduce'); await project(); await until('toolsPage.stats.settled');
  await sleep(150);
  assert.equal(await evaluate(activeAnimations), 0, 'Reduced motion has no active Tools animation');
  await shot('reduced-motion');
  await evaluate('closeApp(); true'); await until('portalMatter.canReact');
  // A smaller laptop screen lays the groups side by side; still no scrolling.
  await viewport(1366, 768); await sleep(200); await project(); await until('toolsPage.stats.settled');
  assert.ok(await evaluate("(c => c.scrollHeight - c.clientHeight <= 2)(document.querySelector('#app-verktoy .tools-content'))"),
    'Every group fits without scrolling at 1366 x 768');
  await shot('laptop');
  await evaluate('closeApp(); true'); await until('portalMatter.canReact');
  for (const [width, height, name] of [[390, 844, 'mobile'], [844, 390, 'landscape']]) {
    await viewport(width, height); await sleep(200); await project();
    await until('toolsPage.stats.settled');
    const layout = await evaluate(`(() => {
      const app = document.querySelector('#app-verktoy'), content = app.querySelector('.app-content'), r = app.getBoundingClientRect();
      content.scrollTop = content.scrollHeight;
      return {left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:innerWidth, height:innerHeight,
        contentWidth:content.clientWidth, scrollWidth:content.scrollWidth, contentHeight:content.clientHeight,
        scrollHeight:content.scrollHeight, scrollTop:content.scrollTop, overflow:getComputedStyle(content).overflowY};
    })()`);
    assert.ok(layout.left >= -2 && layout.right <= layout.width + 2, `${name}: reader stays within horizontal viewport: ${JSON.stringify(layout)}`);
    assert.ok(layout.top >= -2 && layout.bottom <= layout.height + 2, `${name}: reader stays within vertical viewport`);
    assert.ok(layout.contentWidth > 100 && layout.contentHeight > 50, `${name}: useful reading area`);
    assert.ok(layout.scrollWidth <= layout.contentWidth + 2, `${name}: no horizontal content overflow`);
    assert.ok(layout.scrollHeight <= layout.contentHeight + 2 || (layout.scrollTop > 0 && ['auto', 'scroll'].includes(layout.overflow)), `${name}: longer content scrolls internally`);
    await shot(name);
    await evaluate('closeApp(); true'); await until('portalMatter.canReact');
  }
  console.log('PASS: reduced motion, portrait and short-landscape containment and internal scrolling');

  // Loss of the orb WebGL context must leave the Tools surface readable and
  // release the old rectangular fallback material when the interface is ready.
  await cdp('Page.addScriptToEvaluateOnNewDocument', {source: `
    const context = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return type.includes('webgl') && this.parentElement?.id === 'portalMatter' ? null : context.call(this, type, ...args);
    };`});
  await viewport(1440, 900); await cdp('Page.reload'); await reveal();
  assert.equal(await evaluate("document.querySelector('#portalMatter').classList.contains('webgl')"), false);
  await project(); await until('toolsPage.stats.settled'); await sleep(200);
  assert.ok(await evaluate("getComputedStyle(document.querySelector('#app-verktoy')).opacity > .9"), 'CSS fallback still shows the readable Tools page');
  assert.ok(await evaluate("Number(getComputedStyle(document.querySelector('#portalMatter')).opacity) < .1 || getComputedStyle(document.querySelector('#portalMatter')).visibility === 'hidden'"), 'Fallback orb material hands off to Tools');
  await shot('fallback');
  await evaluate('closeApp(); true'); await until('portalMatter.canReact');
  assert.ok(await evaluate("Number(getComputedStyle(document.querySelector('#portalMatter')).opacity) > .9"), 'Closing restores the CSS orb');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log('PASS: CSS fallback handover/retrieval; no browser errors');
  await cdp('Browser.close', {}, false);
} finally {
  ws?.close(); server.close();
  // The throwaway browser profile goes with it, once Chrome has let go of it.
  const exited = new Promise(done => chrome.exitCode !== null ? done() : chrome.once('exit', done));
  chrome.kill(); await Promise.race([exited, new Promise(done => setTimeout(done, 5000))]);
  await rm(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 200}).catch(() => {});
}
