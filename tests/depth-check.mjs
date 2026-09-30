// node tests/depth-check.mjs: Chrome/CDP contracts + review screenshots in .qa.
// node tests/depth-check.mjs --serve: keep this worktree available on port 4176.
import {createServer} from 'node:http';
import {readFile, mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '.qa');
const serveOnly = process.argv.includes('--serve');
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = resolve(root, '.' + pathname.replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    res.setHeader('Content-Type', {
      '.html':'text/html', '.css':'text/css', '.js':'text/javascript',
      '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json'
    }[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((done, fail) => {
  server.once('error', fail);
  server.listen(serveOnly ? 4176 : 0, '127.0.0.1', done);
});
const url = 'http://127.0.0.1:' + server.address().port + '/';
console.log('Portal interior preview:', url);
if (!serveOnly) await check();

async function check() {
  await mkdir(output, {recursive:true});
  const profile = await mkdtemp(resolve(tmpdir(), 'portal-depth-check-'));
  const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--enable-unsafe-swiftshader', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
  ], {windowsHide:true, stdio:['ignore', 'ignore', 'pipe']});
  let ws;
  try {
    const endpoint = await new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error('Chrome startup timed out')), 20000);
      let log = '';
      chrome.once('error', error => {clearTimeout(timer); fail(error);});
      chrome.stderr.on('data', chunk => {
        log += chunk;
        const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) {clearTimeout(timer); done(match[1]);}
      });
    });
    ws = new WebSocket(endpoint);
    await new Promise((done, fail) => {
      ws.addEventListener('open', done, {once:true});
      ws.addEventListener('error', fail, {once:true});
    });
    let serial = 0, session;
    const pending = new Map(), errors = [];
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const request = pending.get(message.id);
        pending.delete(message.id);
        message.error ? request.fail(new Error(JSON.stringify(message.error))) : request.done(message.result);
      }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'warning') {
        const warning = message.params.args.map(arg => arg.value ?? arg.description ?? '').join(' ');
        if (/ERROR:|shader.*(?:error|fail)|compile.*(?:error|fail)/i.test(warning)) errors.push(warning);
      }
    });
    function cdp(method, params = {}, attached = true) {
      return new Promise((done, fail) => {
        const id = ++serial;
        const timer = setTimeout(() => {pending.delete(id); fail(new Error('CDP timeout: ' + method));}, 20000);
        pending.set(id, {
          done: result => {clearTimeout(timer); done(result);},
          fail: error => {clearTimeout(timer); fail(error);}
        });
        ws.send(JSON.stringify({id, method, params, ...(attached && session ? {sessionId:session} : {})}));
      });
    }
    const {targetInfos} = await cdp('Target.getTargets', {}, false);
    session = (await cdp('Target.attachToTarget', {
      targetId:targetInfos.find(target => target.type === 'page').targetId, flatten:true
    }, false)).sessionId;
    await cdp('Page.enable');
    await cdp('Runtime.enable');
    const sleep = ms => new Promise(done => setTimeout(done, ms));
    async function evaluate(expression) {
      const result = await cdp('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true});
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    }
    async function until(expression) {
      const start = Date.now();
      while (!await evaluate(expression)) {
        if (Date.now() - start > 60000) throw new Error('Timed out: ' + expression);
        await sleep(100);
      }
    }
    const motion = value => cdp('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion', value}]});
    async function viewport(width, height, deviceScaleFactor = 1) {
      await cdp('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor, mobile:false});
    }
    async function shot(name) {
      const {data} = await cdp('Page.captureScreenshot', {format:'png'});
      await writeFile(resolve(output, 'depth-' + name + '.png'), Buffer.from(data, 'base64'));
    }
    async function reveal() {
      await until("!!window.portalDepth && document.querySelector('#deviceTilt').dataset.approach === 'ready'");
      await evaluate("document.querySelector('#introForward').click(); true");
      await until("document.body.classList.contains('intro-done') && !document.querySelector('.portal-flight') && !document.body.classList.contains('table-covered')");
      await sleep(500);
    }
    async function expectFrozen(reason) {
      await sleep(300); // Allow a pending dirty/reveal/resize frame.
      const frames = await evaluate('portalDepth.stats.frames');
      await sleep(350);
      assert.equal(await evaluate('portalDepth.stats.frames'), frames, reason);
    }
    function checkLayers(stats, particles = true) {
      assert.ok(stats.layers.length >= 4, 'At least four independent depth layers');
      assert.ok(stats.layers.every(layer => layer.depth > 0 && [layer.depth, layer.x, layer.y].every(Number.isFinite)), 'Every layer is finite and below the surface');
      assert.ok(new Set(stats.layers.map(layer => Math.round(layer.depth))).size >= 4, 'Layers have distinct optical depths');
      if (particles) assert.ok(stats.particles > 0 && stats.particles <= 64, 'The interior uses a bounded number of motes');
      assert.ok(stats.plane.maxZ < -stats.wallDepthPx, 'The deep billboard lies wholly below the physical lining');
    }
    // Mean luminance of screen boxes, decoded in the page from a screenshot.
    async function luminance(boxes) {
      const {data} = await cdp('Page.captureScreenshot', {format:'png'});
      return evaluate(`new Promise(done => { const image = new Image(); image.onload = () => {
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
        done(${JSON.stringify(boxes)}.map(([x, y, w, h]) => { const p = context.getImageData(x, y, w, h).data; let sum = 0;
          for (let i = 0; i < p.length; i += 4) sum += .2126 * p[i] + .7152 * p[i + 1] + .0722 * p[i + 2];
          return sum / (p.length / 4); })); }; image.src = 'data:image/png;base64,${data}'; })`);
    }
    // Screen position of a point in the aperture plane (-1..1, +y toward the viewer).
    const aperturePoint = (x, y) => evaluate(`(() => { const probe = document.createElement('i');
      probe.style.cssText = 'position:absolute;width:0;height:0;left:${50 + x * 50}%;top:${50 + y * 50}%';
      document.querySelector('#screen').append(probe); const r = probe.getBoundingClientRect(); probe.remove();
      return [Math.round(r.left), Math.round(r.top)]; })()`);
    // Where the eye looks into the water: the surface's live state and plane.
    async function water() {
      return evaluate(`(() => { const m = getComputedStyle(document.querySelector('.portal-surface')).transform.match(/matrix3d\\((.+)\\)/);
        return {depth: portalDepth.stats.waterDepthPx, wall: portalDepth.stats.wallDepthPx, refraction: portalDepth.stats.refraction,
          plane: m ? +m[1].split(',')[14] : 0, ...portalSurface.stats}; })()`);
    }
    // A still depth frame, sampled in the frame that draws it (before the
    // drawing buffer is presented and cleared).
    const abyssSample = `new Promise(resolve => { portalDepth.configure({}); requestAnimationFrame(() => {
      const c = document.querySelector('.portal-depth'), gl = c.getContext('webgl'), p = new Uint8Array(c.width * c.height * 4);
      gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, p);
      resolve(Array.from({length: 4000}, (_, i) => p[Math.floor(i * p.length / 16000) * 4 + 1])); }); })`;
    await viewport(1440, 900);
    await motion('reduce');
    await cdp('Page.navigate', {url});
    await until('!!window.portalDepth && !!window.portalSurface');
    assert.ok(await evaluate("document.body.classList.contains('table-covered')"));
    await expectFrozen('Covered interior does not continuously render');
    const coveredSurface = await evaluate('portalSurface.stats.frames');
    await sleep(350);
    assert.equal(await evaluate('portalSurface.stats.frames'), coveredSurface, 'The surface is dormant under the cloth');
    await reveal();
    await shot('desktop-still');
    await expectFrozen('Reduced motion preserves a static interior');
    checkLayers(await evaluate('portalDepth.stats'));
    const wallRatio = await evaluate("portalDepth.stats.wallDepthPx / document.querySelector('#screen').clientHeight");
    assert.ok(wallRatio > 0 && wallRatio < .15, 'Only a short physical wall remains near the rim');
    const still = await water();
    assert.ok(still.depth > 2 && still.depth < still.wall, 'The water stands below the rim, within the lining: ' + JSON.stringify(still));
    assert.ok(Math.abs(still.plane + still.depth) < .5, 'The surface plane lies at the waterline: ' + JSON.stringify(still));
    assert.ok(still.live && still.refraction > 0, 'The depths are seen through a live WebGL surface');
    // The same water slope that shades the surface displaces the depths.
    const flat = await evaluate(`portalSurface.params.refraction = 0; dispatchEvent(new Event('resize'));
      new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))).then(() => ${abyssSample})`);
    const bent = await evaluate(`portalSurface.params.refraction = 3; dispatchEvent(new Event('resize'));
      new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))).then(() => ${abyssSample})`);
    await evaluate(`portalSurface.params.refraction = 1; dispatchEvent(new Event('resize')); true`);
    assert.ok(flat.filter(Boolean).length > flat.length * .2 && bent.filter(Boolean).length > bent.length * .2, 'Both abyss frames were read back');
    const moved = flat.filter((value, i) => Math.abs(value - bent[i]) > 2).length;
    assert.ok(moved > flat.length * .05, `The surface refracts the abyss (${moved} of ${flat.length} samples moved)`);
    assert.ok(await evaluate("document.querySelectorAll('.table-circular-lining i').length === 48 && [...document.querySelectorAll('.table-leg')].every(e=>getComputedStyle(e).display==='none')"),
      'The circular lining and physical table replace the old leg proxies');
    const [throatX, throatY] = await aperturePoint(0, .08), [x0, y0] = await aperturePoint(-.8, -.8), [x1, y1] = await aperturePoint(.8, .8);
    const [throat, opening] = await luminance([[throatX - 20, throatY - 7, 40, 14], [x0, y0, x1 - x0, y1 - y0]]);
    assert.ok(throat < opening * .6, `The central throat is darker than the opening around it (${throat.toFixed(1)} vs ${opening.toFixed(1)})`);

    // Comparing in one task makes independent idle room/orb animation irrelevant.
    const invariants = await evaluate("(function () {" +
      "function snapshot() { const lights=[]; window.studyRoom?.scene?.traverse(e=>{if(e.isLight)lights.push([e.uuid,e.intensity,e.color.getHex()])});" +
      "return {cards:[...document.querySelectorAll('.hand-card')].map(e=>[e.className,e.getAttribute('style')])," +
      "camera:JSON.stringify(sceneCamera),table:document.querySelector('.portal-table').getBoundingClientRect().toJSON()," +
      "cloth:document.querySelector('#tableCloth').getAttribute('style'),orb:document.querySelector('#portalMatter').getAttribute('style')," +
      "surface:[...document.querySelectorAll('.portal-impact-surface,.portal-reaction')].map(e=>[e.className,e.getAttribute('style')]),lights};}" +
      "const before=snapshot(); portalDepth.configure({fogDensity:.6,centralDarkness:.92,parallaxStrength:.8,wallDepth:.065,particleDepthSpeed:.75,inwardPull:.3,swirlAmount:.2,deepGlowIntensity:.5});" +
      "return {before,after:snapshot(),settings:portalDepth.settings};})()");
    assert.deepEqual(invariants.after, invariants.before, 'Depth tuning leaves cards, camera, table, cloth, orb, surface and room lights unchanged');
    assert.equal(invariants.settings.fogDensity, .6);
    await evaluate('portalDepth.configure(Object.fromEntries(Object.keys(portalDepth.defaults).map(key=>[key,Infinity]))); true');
    assert.ok(Object.values(await evaluate('portalDepth.settings')).every(Number.isFinite), 'Invalid tuning cannot propagate Infinity');
    await evaluate('portalDepth.configure(Object.fromEntries(Object.keys(portalDepth.defaults).map(key=>[key,-100]))); true');
    assert.ok(Object.values(await evaluate('portalDepth.settings')).every(value => Number.isFinite(value) && value >= 0), 'Negative controls are clamped');
    await evaluate('portalDepth.configure(portalDepth.defaults); const copy=portalDepth.settings; copy.fogDensity=-999; true');
    assert.ok(await evaluate('portalDepth.settings.fogDensity >= 0'), 'The settings getter exposes a copy');
    await motion('no-preference');
    await until('!portalDepth.stats.reducedMotion && portalDepth.stats.active');
    await sleep(900);
    // Whatever enters the water rings it: here a card arriving (script.js's hook).
    await evaluate(`dispatchEvent(new CustomEvent('card-portal-arrival', {detail: {aperture: {x: .4, y: .55}, velocity: {x: 0, y: 900}}})); true`);
    assert.equal((await water()).rings, 1, 'A card arriving rings the water');
    await until('portalSurface.stats.rings === 0');
    const desktop = await evaluate('portalDepth.stats');
    assert.ok(desktop.renderPixels > 0 && desktop.renderPixels <= 700000, 'Desktop fog respects its aggregate pixel budget');
    assert.ok(desktop.glContexts > 0 && desktop.glContexts <= 3, 'Fog WebGL contexts remain bounded');
    assert.ok(desktop.visibleParticles >= 3, 'Sinking motes are visible, not sub-pixel');
    // Parallax, drift and motes live in the shader: a live frame restyles nothing
    // the depth module owns (other systems animate elsewhere under #screen).
    const churn = await evaluate("new Promise(done => { let writes = 0; const from = portalDepth.stats.frames;" +
      "const watch = new MutationObserver(list => writes += list.length), owned = {attributes:true, subtree:true, attributeFilter:['style','class']};" +
      "watch.observe(document.querySelector('.screen-tunnel'), owned); watch.observe(document.querySelector('.portal-table-top'), owned);" +
      "setTimeout(() => { watch.disconnect(); done({writes, frames: portalDepth.stats.frames - from}); }, 1200); })");
    assert.ok(churn.frames > 0 && churn.writes === 0, 'Live depth frames make no DOM style writes: ' + JSON.stringify(churn));
    await shot('desktop-live');
    await cdp('Input.dispatchMouseEvent', {type:'mouseMoved', x:100, y:120, buttons:0});
    await sleep(1100);
    const left = await evaluate('portalDepth.stats');
    await cdp('Input.dispatchMouseEvent', {type:'mouseMoved', x:1340, y:800, buttons:0});
    await sleep(1300);
    const right = await evaluate('portalDepth.stats');
    checkLayers(right);
    assert.ok(right.frames > left.frames, 'Uncovered interior is continuously alive');
    const shifts = right.layers.map((layer, i) => Math.hypot(layer.x-left.layers[i].x, layer.y-left.layers[i].y));
    assert.ok(Math.max(...shifts) > .5, 'Interior responds to pointer parallax');
    assert.ok(Math.max(...shifts) - Math.min(...shifts) > .25, 'Depth layers move at different rates');
    const shiftOf = name => shifts[right.layers.findIndex(layer => layer.name === name)];
    assert.ok(shiftOf('stars') > shiftOf('near-mist'), 'Seen past the fixed rim, deeper layers slide further');
    await shot('desktop-parallax');
    await sleep(1400);
    const later = await evaluate('portalDepth.stats');
    assert.ok(later.layers.some((layer, i) => Math.abs(layer.depth-right.layers[i].depth) + Math.abs(layer.x-right.layers[i].x) + Math.abs(layer.y-right.layers[i].y) > .01), 'The idle volume has independent drift');
    await shot('desktop-later');
    console.log('PASS: circular lining, recessed water, refraction through the surface, splash rings, replaced leg proxies, dark throat, tuning isolation, visible motes, no DOM churn, continuous depth and rim-anchored parallax');

    await motion('reduce');
    await until('portalDepth.stats.reducedMotion');
    await expectFrozen('Switching reduced motion on stops continuous depth work');
    await viewport(390, 844, 2);
    await sleep(650);
    const mobile = await evaluate('portalDepth.stats');
    assert.ok(mobile.renderPixels > 0 && mobile.renderPixels <= 240000, 'Mobile fog respects its aggregate pixel budget');
    assert.ok(mobile.waterDepthPx > 2 && mobile.waterDepthPx < mobile.wallDepthPx, 'The water is recessed on mobile too');
    assert.equal(await evaluate('document.documentElement.scrollWidth'), 390, 'No horizontal overflow');
    checkLayers(mobile);
    await shot('mobile');
    await motion('no-preference');
    await evaluate("document.querySelector('#introBack').click(); true");
    await until("document.body.classList.contains('table-covered') && !portalDepth.stats.active");
    await expectFrozen('Resetting and covering the portal stop the depth renderer');
    console.log('PASS: mobile budget, containment, reduced motion and covered reset');

    // A context is blocked only for portal fog; the independent room and orb
    // render normally, so unrelated fallback behavior cannot mask depth errors.
    await cdp('Page.addScriptToEvaluateOnNewDocument', {source:
      "const context=HTMLCanvasElement.prototype.getContext;" +
      "HTMLCanvasElement.prototype.getContext=function(type,...args){" +
      "return type.includes('webgl') && this.classList.contains('portal-depth') ? null : context.call(this,type,...args)};"
    });
    await viewport(1440, 900);
    await motion('reduce');
    await cdp('Page.reload');
    await reveal();
    const fallback = await evaluate('portalDepth.stats');
    assert.equal(fallback.glContexts, 0, 'The no-WebGL interior uses the CSS fallback');
    assert.equal(fallback.particles, 0, 'The static CSS fallback draws no motes');
    assert.equal(fallback.refraction, 0, 'Nothing refracts a static CSS interior');
    checkLayers(fallback, false);
    await shot('fallback');
    await expectFrozen('Fallback respects reduced motion');
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log('PASS: fog fallback and no browser/shader errors');
    console.log(JSON.stringify({desktop, mobile, fallback}, null, 2));
    await cdp('Browser.close', {}, false);
  } finally {
    ws?.close();
    chrome.kill();
    server.close();
  }
}
