// node tests/orb-check.mjs: Chrome/CDP checks of the portal orb + screenshots in .qa.
// node tests/orb-check.mjs --serve: keep this worktree available on port 4177.
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
    res.setHeader('Content-Type', {'.html':'text/html', '.css':'text/css', '.js':'text/javascript',
      '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json'}[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((done, fail) => { server.once('error', fail); server.listen(serveOnly ? Number(process.env.PORTFOLIO_PREVIEW_PORT || 4177) : 0, '127.0.0.1', done); });
const url = 'http://127.0.0.1:' + server.address().port + '/';
console.log('Portal orb preview:', url);
if (!serveOnly) await check();

async function check() {
  await mkdir(output, {recursive:true});
  const profile = await mkdtemp(resolve(tmpdir(), 'portal-orb-check-'));
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
    await new Promise((done, fail) => { ws.addEventListener('open', done, {once:true}); ws.addEventListener('error', fail, {once:true}); });
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
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'warning') {
        const warning = message.params.args.map(arg => arg.value ?? arg.description ?? '').join(' ');
        if (/ERROR:|shader.*(?:error|fail)|compile.*(?:error|fail)|CSS material/i.test(warning)) errors.push(warning);
      }
    });
    const cdp = (method, params = {}, attached = true) => new Promise((done, fail) => {
      const id = ++serial;
      const timer = setTimeout(() => {pending.delete(id); fail(new Error('CDP timeout: ' + method));}, 30000);
      pending.set(id, {done: result => {clearTimeout(timer); done(result);}, fail: error => {clearTimeout(timer); fail(error);}});
      ws.send(JSON.stringify({id, method, params, ...(attached && session ? {sessionId:session} : {})}));
    });
    const {targetInfos} = await cdp('Target.getTargets', {}, false);
    session = (await cdp('Target.attachToTarget', {targetId:targetInfos.find(target => target.type === 'page').targetId, flatten:true}, false)).sessionId;
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Page.addScriptToEvaluateOnNewDocument', {source:`
      const realNow=performance.now.bind(performance), realRaf=requestAnimationFrame.bind(window);
      performance.now=()=>window.__orbClock ?? realNow();
      window.requestAnimationFrame=fn=>realRaf(t=>fn(window.__orbClock ?? t));`});
    const sleep = ms => new Promise(done => setTimeout(done, ms));
    async function evaluate(expression) {
      const result = await cdp('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true});
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    }
    async function until(expression, timeout = 60000) {
      const start = Date.now();
      while (!await evaluate(expression)) {
        if (Date.now() - start > timeout) throw new Error('Timed out: ' + expression);
        await sleep(100);
      }
    }
    const motion = value => cdp('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion', value}]});
    const shot = async name => {
      const {data} = await cdp('Page.captureScreenshot', {format:'png'});
      await writeFile(resolve(output, 'orb-' + name + '.png'), Buffer.from(data, 'base64'));
    };
    // Mean colour of screen boxes, decoded in the page from a screenshot.
    async function colours(boxes) {
      const {data} = await cdp('Page.captureScreenshot', {format:'png'});
      return evaluate(`new Promise(done => { const image = new Image(); image.onload = () => {
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
        done(${JSON.stringify(boxes)}.map(([x, y, w, h]) => { const p = context.getImageData(Math.round(x), Math.round(y), w, h).data;
          const c = [0, 0, 0]; for (let i = 0; i < p.length; i += 4) { c[0] += p[i]; c[1] += p[i + 1]; c[2] += p[i + 2]; }
          return c.map(v => v / (p.length / 4)); })); }; image.src = 'data:image/png;base64,${data}'; })`);
    }
    const luma = ([r, g, b]) => .2126 * r + .7152 * g + .0722 * b;
    // The drawn sphere: .369 of its element's width around the element's centre.
    const sphere = () => evaluate(`(() => { const r = document.querySelector('#portalMatter').getBoundingClientRect();
      return {x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width * .369}; })()`);
    async function reveal() {
      await until("!!window.portalOrb && document.querySelector('#deviceTilt').dataset.approach === 'ready'");
      await evaluate("document.querySelector('#introForward').click(); true");
      await until("document.body.classList.contains('intro-done') && !document.querySelector('.portal-flight') && portalMatter.canReact");
      await sleep(600);
    }
    const heights = (ms, every = 60) => evaluate(`new Promise(done => { const out = []; const t0 = performance.now();
      (function read() { out.push(portalOrb.contact.height); if (performance.now() - t0 < ${ms}) setTimeout(read, ${every}); else done(out); })(); })`);

    await cdp('Emulation.setDeviceMetricsOverride', {width:1440, height:900, deviceScaleFactor:1, mobile:false});
    await motion('reduce');
    await cdp('Page.navigate', {url});
    await until('!!window.portalOrb');
    assert.equal(await evaluate("document.querySelector('#portalMatter').dataset.state"), 'locked', 'The orb sleeps under the cloth');
    assert.equal(await evaluate('portalOrb.stats.awake'), 0, 'Its heart is dark before the reveal');
    await reveal();
    await shot('still');

    // Tuning: bounded, copied, restorable.
    assert.equal(await evaluate('Object.isFrozen(portalOrb.defaults)'), true);
    await evaluate('portalOrb.configure(Object.fromEntries(Object.keys(portalOrb.defaults).map(key => [key, Infinity]))); true');
    assert.ok(Object.values(await evaluate('portalOrb.settings')).every(Number.isFinite), 'Invalid tuning cannot propagate Infinity');
    await evaluate('portalOrb.configure(Object.fromEntries(Object.keys(portalOrb.defaults).map(key => [key, -5]))); true');
    assert.ok(await evaluate('Object.entries(portalOrb.settings).every(([key, value]) => value === portalOrbMaterial.limits[key][0])'),
      'Out-of-range tuning is clamped to its published limits');
    await evaluate('portalOrb.configure(portalOrb.defaults); const copy = portalOrb.settings; copy.innerGlow = 99; true');
    assert.deepEqual(await evaluate('portalOrb.settings'), await evaluate('({...portalOrb.defaults})'), 'Defaults restore; settings is a copy');

    // Volume: a lit heart, a darker upper body, colour that differs by side.
    await sleep(400);
    const s = await sphere(), box = 14;
    const [centre, top, left, right] = await colours([
      [s.x - box / 2, s.y - box / 2, box, box], [s.x - box / 2, s.y - s.r * .72, box, box],
      [s.x - s.r * .9, s.y - box / 2, box / 2, box], [s.x + s.r * .9 - box / 2, s.y - box / 2, box / 2, box]]);
    assert.ok(luma(centre) > luma(top) + 12, `The heart glows inside a darker body (${centre} vs ${top})`);
    assert.ok(centre[1] > centre[0] + 12, 'The heart is teal');
    assert.ok(left[1] - left[2] > right[1] - right[2] + 6, `The window side is greener than the stair side (${left} / ${right})`);
    assert.ok(right[2] - right[1] > left[2] - left[1] + 6, 'The stair side is more violet than the window side');
    const tilted = await evaluate(`(() => { const m = document.querySelector('#portalMatter'), s = document.querySelector('#screen');
      return Math.abs(parseFloat(m.style.left) - s.clientWidth / 2) < 1 && Math.abs(parseFloat(m.style.top) - s.clientHeight / 2) < 1; })()`);
    assert.ok(tilted, 'The footprint stays at the portal centre');
    const still = await heights(900);
    assert.ok(Math.max(...still) - Math.min(...still) < .01 && await evaluate('portalOrb.stats.stretch') === 0, 'Reduced motion keeps the orb still');

    // The orb's light pools on the water beneath it (the surface redraws on resize).
    const footprint = await evaluate(`(() => { const p = document.createElement('i');
      p.style.cssText = 'position:absolute;width:0;height:0;left:50%;top:50%;transform:translateZ(calc(var(--water-depth) * -1))';
      document.querySelector('#screen').append(p); const r = p.getBoundingClientRect(); p.remove(); return [r.left, r.top]; })()`);
    const underOrb = [footprint[0] - 40, footprint[1] - 14, 80, 28];
    const pooled = async glow => {
      await evaluate(`portalOrb.configure({contactGlow: ${glow}}); true`); await sleep(250);
      await evaluate("dispatchEvent(new Event('resize')); true"); await sleep(500);
      return (await colours([underOrb]))[0];
    };
    const dark = await pooled(0), lit = await pooled(1);
    assert.ok(lit[1] > dark[1] + 3, `The orb's light pools on the water beneath it (${lit} vs ${dark})`);
    await evaluate('portalOrb.configure(portalOrb.defaults); true');
    console.log('PASS: dormant heart, bounded tuning, lit volume, room colour by side, centred footprint, still under reduced motion, light on the water');
    console.log(JSON.stringify({centre, top, left, right, underOrb: {dark, lit}}, (key, value) => typeof value === 'number' ? Math.round(value) : value));

    // Idle life.
    await motion('no-preference');
    await until('!portalReaction.stats.reducedMotion');
    await sleep(2500);
    const float = await heights(3200, 80);
    const range = Math.max(...float) - Math.min(...float);
    assert.ok(range > 1.5 && range < 24, 'The orb floats gently: ' + range.toFixed(2) + ' px');
    const [breathA, driftA] = await evaluate('[portalOrb.stats.breath, portalOrb.stats.drift]');
    await sleep(1500);
    const [breathB, driftB] = await evaluate('[portalOrb.stats.breath, portalOrb.stats.drift]');
    assert.ok(Math.abs(breathA - breathB) > .02, 'It breathes');
    assert.ok(Math.hypot(driftA.x - driftB.x, driftA.y - driftB.y) > .05, 'It wanders a little over the water');
    assert.ok(await evaluate('portalSurface.water.pull[2] < 0'), 'The water is drawn gently up toward it');
    await shot('idle');

    // A card falls through the surface: the orb dives after it as a drop, is
    // lost in the depth, bursts back out as a droplet tied to the water by a
    // neck, then opens into a page without stopping at the idle orb position.
    const diameter = await evaluate("parseFloat(document.querySelector('#portalMatter').style.width)");
    const radius = diameter * .369, water = -await evaluate("parseFloat(document.querySelector('#screen').style.getPropertyValue('--water-depth'))");
    await evaluate(`(() => { window.__trace = []; addEventListener('card-portal-arrival', () => { window.__arrived = performance.now(); }, {once: true});
      (function read(t) { const m = document.querySelector('#portalMatter'), stats = portalOrb.stats, d = stats.dive, p = stats.pose;
        // No pose between a reset and its next frame.
        if (p) __trace.push({t:stats.timestamp, h: portalOrb.contact.height, s: portalOrb.stats.stretch, state: m.dataset.state, vz:stats.velocity.z,
          presence:p.presence, neck:p.neck, taper:p.taper, grow:p.grow, diving:!!d, morph:stats.morph,
          width:p.w, x:p.x, y:p.y, water:portalReaction.active, canvas:Number(m.querySelector('canvas').style.opacity || 1),
          html:!!document.querySelector('.app-view.active')});
        if (__trace.length < 900) requestAnimationFrame(read); })(performance.now());
      const card = document.querySelector('.hand-card--prosjekter .sub-card'); card.focus();
      card.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true})); return true; })()`);
    await until('!!window.__arrived');
    await sleep(420); await shot('dive');
    await until("document.querySelector('#app-prosjekter').classList.contains('active')");
    const arrived = await evaluate('__arrived');
    const frames = (await evaluate('__trace.filter(e => e.t >= __arrived - 20)')).map(e => ({...e, t: e.t - arrived}));
    await writeFile(resolve(output, 'orb-transition-trace.json'), JSON.stringify(frames, null, 2));
    const dive = frames.filter(e => e.diving), unseen = dive.findIndex(e => e.presence === 0);
    assert.ok(Math.min(...dive.map(e => e.h)) < water - radius, 'The drop goes all the way through the surface');
    assert.ok(unseen > 0, 'Below the surface it is lost in the depth');
    const falling = dive.slice(0, unseen), rising = dive.slice(unseen).filter(e => e.presence > 0);
    assert.ok(Math.max(...falling.map(e => e.taper)) > .2 && Math.max(...falling.map(e => e.s)) > .05, 'It falls as a stretched teardrop, tail up');
    assert.ok(rising.some(e => e.taper < -.2 && e.grow < .9 && e.s > .1), 'It bursts back out as a smaller, stretched droplet, tail down');
    // The neck shows above the water for under 0.1 s: its exact shape is
    // checked on the frozen clock below, where no frame is missed.
    assert.ok(rising.some(e => e.neck > .3), 'A neck ties it to the water as it rises');
    const handoff = frames.findIndex(e => e.state === 'page'), before = frames[handoff - 1];
    assert.ok(handoff > 0 && before.taper < -.1 && before.neck < .01, 'It opens after pinch-off, still a rising droplet: ' + JSON.stringify(before));
    assert.ok(frames[handoff].t < 1850, 'No wait for the old settle-at-hover waypoint');
    const around = frames.slice(handoff - 4, handoff + 6), steps = around.slice(1).map((e, i) => Math.abs(e.h - around[i].h) / Math.max(8, e.t - around[i].t));
    assert.ok(Math.max(...steps) < 1.2, 'The page forms from where the orb is, without a jump: ' + JSON.stringify(around.map(e => [Math.round(e.t), +e.h.toFixed(1)])));
    // Still rising on both sides of the handoff: no stop and no restart from
    // rest. (Exact speed matching is checked on the frozen clock below; here
    // the frame rate is whatever this machine manages.)
    const after = frames.slice(handoff + 1).find(e => e.t > before.t + 40);
    assert.ok(before.vz > 40 && after && (after.h - before.h) / (after.t - before.t) > .04,
      'It keeps rising through the handoff: ' + JSON.stringify({vz: before.vz, before: before.h, after: after && [after.t - before.t, after.h]}));
    for (const key of ['grow', 'taper', 's']) {
      const next = frames[handoff + 1];
      assert.ok(Math.abs(next[key] - before[key]) / Math.max(16, next.t - before.t) < .0025, 'Continuous drop form: ' + key);
    }
    const overlap = frames.filter(e => e.state === 'page' && e.t < frames[handoff].t + 300);
    assert.ok(overlap.some(e => e.morph > .02 && e.h > before.h + 15 && e.width > diameter + 5 && e.water),
      'Translation, scale, morph and the remaining water response overlap');
    assert.ok(frames.every(e => e.morph >= 1 || e.canvas > 0), 'The material stays visible until the page is ready');
    await writeFile(resolve(output, 'orb-transition-trace.json'), JSON.stringify(frames, null, 2));
    assert.equal(await evaluate('portalOrb.stats.waitingForDrop'), false);
    await sleep(400); await shot('page');
    console.log('PASS: float, breath, wander, water drawn up, card dive through the surface, droplet rebound with a neck, seamless hand-off to the page');
    console.log(JSON.stringify({pageFormsAt: Math.round(frames[handoff].t), risingAt: Math.round(before.vz), lostAt: Math.round(dive[unseen].t), lowest: Math.round(Math.min(...dive.map(e => e.h)))}));

    // Reset while the page waits for the drop: no page, promises settled.
    await evaluate("document.querySelector('#portalRetrieve').click(); true");
    await until("portalMatter.canReact && !document.querySelector('.app-view.active')");
    await sleep(900);
    await evaluate(`(() => { window.__arrived = 0; addEventListener('card-portal-arrival', () => { window.__arrived = performance.now(); }, {once: true});
      const card = document.querySelector('.hand-card--kurs .sub-card') || document.querySelector('.hand-card .sub-card');
      bringHandCardToFront(card.dataset.app); return true; })()`);
    await sleep(700);
    await evaluate(`(() => { const card = document.querySelector('.hand-card--kurs .sub-card'); card.focus();
      card.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true})); return true; })()`);
    await until('!!window.__arrived');
    await sleep(500);
    assert.equal(await evaluate('portalOrb.stats.waitingForDrop'), true, 'The page is waiting on the drop');
    await evaluate("document.querySelector('#introBack').click(); true");
    await until("document.querySelector('#portalMatter').dataset.state === 'locked'");
    await sleep(1600);
    assert.equal(await evaluate("!!document.querySelector('.app-view.active')"), false, 'A reset during the drop opens no page');
    assert.equal(await evaluate('portalOrb.stats.waitingForDrop'), false);
    console.log('PASS: reset during the drop settles it and opens no page');
    assert.equal(errors.length, 0, JSON.stringify(errors));

    // The same flow on a frozen clock, drawn frame by frame at 60 fps, so the
    // checks and stage screenshots do not depend on how fast this machine
    // renders: the page takes over the droplet's speed and form, opens while
    // it moves, never stops or passes through a plain orb, and hands its glass
    // over to the HTML reader without a frame showing neither.
    await motion('reduce'); await reveal();
    await motion('no-preference'); await until('!portalReaction.stats.reducedMotion');
    await evaluate(`(() => { dispatchEvent(new CustomEvent('card-portal-arrival', {detail: {}}));
      window.__flight = portalMatter.project('prosjekter').then(ok => { if (ok) openApp('prosjekter'); return ok; }); return true; })()`);
    await until('!!portalReaction.sample().dive');
    // Frames sit on an exact 60 fps grid counted from the dive's start (no
    // accumulated or clamped steps), and each stage is shot at the last frame
    // before its time.
    await evaluate(`(() => { window.__orbStart = portalReaction.sample().dive.start;
      window.__frameNo = null; window.__frames = []; window.__face = null;
      window.__film = async ms => {
        // The grid starts after the last live frame, so the clock never runs back.
        if (__frameNo === null) __frameNo = Math.ceil((performance.now() - __orbStart) * .06);
        while ((__frameNo + 1) / .06 <= ms) { __frameNo++; __orbClock = __orbStart + __frameNo / .06; await new Promise(requestAnimationFrame);
          const s = portalOrb.stats, p = s.pose, m = document.querySelector('#portalMatter'), c = m.querySelector('canvas');
          // The drawn page's face at its centre, just before it settles.
          if (s.morph > .99 && s.morph < 1 && !__face) { const gl = c.getContext('webgl'), px = new Uint8Array(4);
            gl.readPixels(c.width >> 1, c.height >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); __face = [...px]; }
          __frames.push({t: __orbClock - __orbStart, state: s.mode, x: p.x, y: p.y, z: p.z, w: p.w, h: p.h, grow: p.grow, taper: p.taper,
            neck: p.neck, s: p.stretch, presence: p.presence, open: s.open, morph: s.morph, vz: s.velocity.z,
            canvas: Number(c.style.opacity || 1), html: !!document.querySelector('.app-view.active')}); }
        return true; }; return true; })()`);
    for (const [ms, name] of [[1140, 'rebound'], [1300, 'neck'], [1480, 'lift'], [1800, 'lens'], [2100, 'unfolding'], [2450, 'glass'], [3300, 'reader']]) {
      await evaluate(`__film(${ms})`); await shot(name);
    }
    const flight = await evaluate('__frames'), face = await evaluate('__face');
    await writeFile(resolve(output, 'orb-flight-frames.json'), JSON.stringify(flight, null, 2));
    const lift = flight.findIndex(e => e.state === 'page'), at = flight[lift];
    const settled = flight.findIndex(e => e.state === 'page' && e.morph >= 1);
    assert.ok(lift > 2 && settled > lift, 'The page takes over during the frozen flight');
    const reborn = flight.slice(0, lift).filter(e => e.t > 900 && e.presence > 0);
    assert.ok(reborn.some(e => e.neck > .3 && e.z - radius * e.grow * (1 + e.s) > water), 'A neck ties the rising droplet to the water above the surface');
    assert.ok(at.neck < .01 && at.taper < -.1 && at.s > .12 && at.vz > 100, 'The page takes over a rising, drawn-out droplet: ' + JSON.stringify(at));
    // Its speed carries straight into the page's flight.
    const speed = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / ((b.t - a.t) / 1000);
    const into = speed(flight[lift - 1], at), out = speed(at, flight[lift + 1]);
    assert.ok(Math.abs(out - into) < .12 * into, `Its speed carries into the page: ${into.toFixed(0)} -> ${out.toFixed(0)} px/s`);
    // From the burst out of the water until the page has nearly formed, every
    // frame moves or grows it (at least 30 px/s): no stop, no dead frame.
    const risen = flight.findIndex(e => e.t >= 1000), nearly = flight.findIndex(e => e.morph >= .9);
    assert.ok(flight.slice(1).every((e, i) => Math.abs(e.t - flight[i].t - 1000 / 60) < .01), 'The frozen frames are an even 60 fps');
    for (let i = risen + 1; i < nearly; i++) {
      const a = flight[i - 1], b = flight[i];
      const moved = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) + Math.abs(b.w - a.w) + Math.abs(b.h - a.h);
      assert.ok(moved / (b.t - a.t) > .03, `No stop at ${Math.round(b.t)} ms: ${moved.toFixed(2)} px`);
    }
    // It never passes through a plain orb: until its corners have formed it is
    // drawn out, tailed or spread into a lens.
    for (const e of flight.filter(e => e.state === 'page' && e.morph < .3))
      assert.ok(Math.abs(e.s) > .01 || Math.abs(e.taper) > .01 || e.open > .05, 'No plain-orb frame: ' + JSON.stringify(e));
    // No snap in its form or size from one frame to the next.
    for (let i = lift; i < flight.length; i++) {
      const a = flight[i - 1], b = flight[i];
      for (const key of ['grow', 'taper', 'neck', 's', 'open', 'morph']) {
        // The lens shapes only the orb's part of the form, which is gone once
        // the morph is complete: it is reset then, unseen.
        if (key === 'open' && a.morph >= 1) continue;
        assert.ok(Math.abs(b[key] - a[key]) < .08, `No snap in ${key} at ${Math.round(b.t)} ms: ${a[key]} -> ${b[key]}`);
      }
      assert.ok(Math.abs(b.w - a.w) < 16 && Math.abs(b.h - a.h) < 8, `No size jump at ${Math.round(b.t)} ms`);
    }
    // The drawn glass stays until the page has formed, is solid then, and
    // fades out over the open HTML reader rather than at once.
    assert.ok(flight.slice(0, settled).every(e => e.canvas === 1), 'The glass stays fully drawn until the page has formed');
    assert.ok(face && face[3] > 150, 'The forming page has a solid face: ' + face);
    const handover = flight.slice(settled), fading = handover.findIndex(e => e.canvas < 1), gone = handover.findIndex(e => e.canvas === 0);
    assert.ok(fading > 0 && handover[fading].html, 'The HTML reader is open before the glass fades');
    assert.ok(gone - fading >= 10, `The glass fades out over the reader, not at once (frames ${fading} to ${gone})`);
    assert.equal(await evaluate('__flight'), true);
    console.log('PASS: frozen-clock flight: speed carried into the page, no stop, no plain-orb frame, no snap, glass handed over to the reader');
    console.log(JSON.stringify({liftAt: Math.round(at.t), into: Math.round(into), out: Math.round(out), formedAt: Math.round(flight[settled].t), face}));
    await evaluate('portalMatter.reset(); window.__orbClock = undefined; true');

    // Without WebGL the CSS stand-in follows the same flow and keeps its shadow.
    await cdp('Page.addScriptToEvaluateOnNewDocument', {source:
      "const context=HTMLCanvasElement.prototype.getContext;" +
      "HTMLCanvasElement.prototype.getContext=function(type,...args){return type.includes('webgl') && this.parentElement?.id==='portalMatter' ? null : context.call(this,type,...args)};"});
    await motion('reduce');
    await cdp('Page.reload');
    errors.length = 0; // the fallback's own notice is expected here
    await reveal();
    assert.equal(await evaluate("document.querySelector('#portalMatter').classList.contains('webgl')"), false);
    assert.notEqual(await evaluate("getComputedStyle(document.querySelector('#portalMatter')).filter"), 'none', 'The CSS orb keeps its flat shadow');
    assert.ok(await evaluate('portalOrb.contact.strength > 0'), 'The CSS orb still stands over the water');
    await shot('fallback');
    // The same continuous flight works without WebGL, and a future page can
    // supply a responsive target without changing the card implementation.
    await motion('no-preference');
    await until('!portalReaction.stats.reducedMotion');
    await evaluate(`(() => { dispatchEvent(new CustomEvent('card-portal-arrival'));
      window.__fallbackProject = portalMatter.project('kurs', {target: base => ({...base, x:24, z:base.z+12})}); return true; })()`);
    assert.equal(await evaluate('__fallbackProject'), true);
    assert.equal(await evaluate("document.querySelector('#screen').style.getPropertyValue('--page-x-offset')"), '24px');
    assert.ok(await evaluate('Math.abs(portalOrb.stats.pose.z - sceneCamera.reader().z - 12) < .1'));
    await evaluate('portalMatter.restore()');
    assert.equal(errors.filter(e => !/CSS material/.test(JSON.stringify(e))).length, 0, JSON.stringify(errors));
    console.log('PASS: CSS fallback and no browser or shader errors');
    await cdp('Browser.close', {}, false);
  } finally {
    ws?.close();
    chrome.kill();
    server.close();
  }
}
