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
  async function until(expression, timeout = 14000) {
    const start = Date.now();
    while (!await evaluate(expression)) {
      if (Date.now() - start > timeout) throw new Error('Timed out: ' + expression + '\n' + JSON.stringify(await evaluate(`({state:document.readyState,hidden:document.hidden,body:document.body.className,errors:[...document.querySelectorAll('body>div')].filter(e=>e.textContent.startsWith('JS ERROR')).map(e=>e.textContent)})`)));
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
    const atTarget = await bounds(selector);
    assert.ok(Math.hypot(atTarget.x-target.x,atTarget.y-target.y)<12,
      'The dragged card must follow the pointer without jumping out of the fan');
    await cdp('Input.dispatchMouseEvent', {type:'mouseReleased', x:target.x, y:target.y,button:'left',clickCount:1});
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
  if (process.argv.includes('--foundation-only') || process.argv.includes('--controls-only')) {
    const sizes=process.argv.includes('--controls-only') ? [[844,390]] : [[1920,910],[1440,1000],[1366,768],[390,844],[844,390]];
    for (const [width,height] of sizes) {
      await cdp('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:false});
      await cdp('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await cdp('Page.navigate', {url:`http://127.0.0.1:${port}/`});
      await until(`document.querySelector('#deviceTilt').dataset.approach === 'ready'`);
      await click('#introForward');
      await until(`document.body.classList.contains('intro-done') && !document.querySelector('.portal-flight')`);
      await sleep(350);
      await assertViewport(); await assertHeldHand();
      const orb=await bounds('#portalMatter');
      assert.ok(orb.top>=0 && orb.bottom<height,'The orb remains within the viewport');
      await shot('foundation-' + width);
      if (width===1920) {
        await click('.hand-card--ommeg .sub-card'); await sleep(450);
        assert.equal(await evaluate(`handOrder[0]`),'ommeg','An exposed rear card can be brought forward');
        const front=await bounds('.hand-card--ommeg .sub-card');
        await drag('.hand-card--ommeg .sub-card',{x:front.x+60,y:front.y-30});
        await sleep(450);
        assert.equal(await evaluate(`handOrder[3]`),'ommeg','A throw outside the opening still reorders the fan');
        assert.equal(await evaluate(`!!document.querySelector('.app-view.active')`),false);
      }
        await evaluate(`document.querySelector('.hand-card--prosjekter .sub-card').focus({preventScroll:true})`);
        await cdp('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
        await cdp('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
        await until(`document.querySelector('#app-prosjekter').classList.contains('active')`);
        await sleep(350); await shot('foundation-page-' + width);
        await assertRemainingHand(); await assertViewport();
        const page=await bounds('.portal-page');
        assert.ok(page.top>0 && page.bottom<height && page.left>=0 && page.right<=width,'Reader fits at '+width+'x'+height);
        if (width===1920) {
          await click('.deck-card[data-project="motvind"] .project-title');
          assert.equal(await evaluate(`document.querySelector('[data-project-detail]').hidden`),false,'Project details still open');
          await click('[data-project-back]');
          assert.equal(await evaluate(`document.querySelector('[data-project-list]').hidden`),false,'Returning to the project deck still works');
        }
        await click('#portalRetrieve'); await sleep(650);
        assert.equal(await evaluate(`!!document.querySelector('.app-view.active')`),false);
      console.log('PASS: composition, retained hand, keyboard activation and retrieval at',width,height);
    }
    // Resize a running scene rather than only checking fresh page loads.
    await cdp('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:false});
    await sleep(400); await assertViewport(); await assertHeldHand();
    await evaluate(`document.querySelector('.hand-card--prosjekter .sub-card').focus()`);
    await assertViewport();
    const themeBefore=await evaluate(`document.documentElement.dataset.theme`);
    await click('#themeToggle');
    assert.notEqual(await evaluate(`document.documentElement.dataset.theme`),themeBefore,'Theme toggle remains interactive in the viewport header');
    const ball=await bounds('#themeToggle');
    await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:ball.x,y:ball.y,button:'left',buttons:1,clickCount:1});
    await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:ball.x-70,y:ball.y+90,buttons:1});
    await sleep(100);
    await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:ball.x-70,y:ball.y+90,button:'left',clickCount:1});
    const rolled=await bounds('#themeToggle');
    assert.ok(Math.hypot(rolled.x-ball.x+70,rolled.y-ball.y-90)<3,'Theme ball drag uses viewport coordinates: '+JSON.stringify({ball,rolled,style:await evaluate(`document.querySelector('#themeToggle').getAttribute('style')`)}));
    await assertViewport();
    assert.equal(errors.length,0, JSON.stringify(errors));
  } else if (process.argv.includes('--retrieval-only')) {
    await cdp('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await cdp('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await cdp('Page.navigate', {url:`http://127.0.0.1:${port}/`});
    await until(`document.querySelector('#deviceTilt').dataset.approach === 'ready'`);
    await sleep(300); await click('#introForward');
    await until(`document.body.classList.contains('intro-done') && !document.querySelector('.portal-flight')`);
    await sleep(300);
    await drag('.hand-card--prosjekter .sub-card',await bounds('#screen'));
    await until(`document.querySelector('#app-prosjekter').classList.contains('active')`);
    await sleep(700); await shot('retrieval-compare');
    const button=await bounds('#portalRetrieve');
    console.log('Retrieval center target',await evaluate(`document.elementFromPoint(${button.x},${button.y})?.className`));
    await click('#portalRetrieve'); await sleep(300);
    assert.equal(await evaluate(`!!document.querySelector('.app-view.active')`),false);
    console.log('PASS: retrieval through an exposed pointer target');
  } else if (process.argv.includes('--depth-only')) {
    await cdp('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await cdp('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await cdp('Page.navigate', {url:`http://127.0.0.1:${port}/`});
    await until(`!!window.portalMatter`);
    await until(`document.querySelector('#deviceTilt').dataset.approach === 'ready'`);
    await sleep(300);
    await click('#introForward');
    await until(`document.body.classList.contains('intro-done') && !document.querySelector('.portal-flight')`);
    await until(`document.querySelector('.screen-tunnel').classList.contains('has-depth')`);
    await sleep(300); await shot('depth-still');
    const construction = await evaluate(`(() => {
      const s=document.querySelector('#screen'),t=document.querySelector('.screen-tunnel');
      return {background:getComputedStyle(s).backgroundColor,shadow:getComputedStyle(s).boxShadow,
        tunnel:getComputedStyle(t).transform,style:getComputedStyle(t).transformStyle,
        cut:getComputedStyle(document.querySelector('.portal-table-top')).clipPath,
        depths:[...document.querySelectorAll('.portal-depth-layer')].map(e=>({name:e.className,z:parseFloat(e.style.getPropertyValue('--layer-z'))})),
        walls:[...document.querySelectorAll('.portal-wall')].map(e=>getComputedStyle(e).transform)};
    })()`);
    assert.equal(construction.background,'rgba(0, 0, 0, 0)','The opening has no surface fill');
    assert.equal(construction.shadow,'none','The opening has no panel bezel');
    assert.equal(construction.style,'preserve-3d');
    assert.ok(construction.cut.includes('evenodd'),'The tabletop has a physical cutout');
    assert.ok(construction.depths.every(d=>d.z < -80),'Every visual layer lies below the table');
    assert.equal(new Set(construction.depths.map(d=>d.z)).size,4,'Abyss, stars and both fog banks occupy separate depths');
    assert.ok(construction.walls.every(t=>t.startsWith('matrix3d')),'Walls are rotated 3D faces');
    // The geometry must still read as a hole with every cosmic visual hidden.
    await evaluate(`window.geometryOnly=document.createElement('style');geometryOnly.textContent='.portal-fog,.portal-stars,.portal-particles{visibility:hidden!important}';document.head.appendChild(geometryOnly)`);
    await shot('depth-geometry');
    await evaluate(`geometryOnly.remove()`);
    const table=await bounds('.portal-table');
    assert.ok(table.left<0 && table.right>1440 && table.bottom>=980,'The near table reaches the viewport edges');
    const pose=await evaluate(`getComputedStyle(document.querySelector('#screen')).transform`);
    await cdp('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:80,y:100,buttons:0});
    await sleep(1300); await shot('depth-left');
    const nearLeft=await bounds('.portal-fog--near'), farLeft=await bounds('.portal-stars');
    await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:1360,y:880,buttons:0});
    await sleep(1300); await shot('depth-right');
    const nearRight=await bounds('.portal-fog--near'), farRight=await bounds('.portal-stars');
    const nearShift=Math.abs(nearRight.x-nearLeft.x), farShift=Math.abs(farRight.x-farLeft.x);
    assert.ok(nearShift>30 && nearShift>farShift*5,'Near fog must move visibly more than distant stars');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#screen')).transform`),pose,'The rim remains fixed during internal parallax');
    const readFog=`new Promise(resolve=>requestAnimationFrame(()=>{
      const c=document.querySelector('.portal-depth'),gl=c.getContext('webgl');
      const p=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,p);
      let visible=0,transparent=0,maxAlpha=0;
      for(let i=3;i<p.length;i+=4){if(p[i]>8)visible++;if(p[i]<3)transparent++;maxAlpha=Math.max(maxAlpha,p[i]);}
      resolve({visible,transparent,maxAlpha,total:c.width*c.height,error:gl.getError()});
    }))`;
    let pixels;
    for(let i=0;i<12;i++){pixels=await evaluate(readFog);if(pixels.visible)break;await sleep(35);}
    assert.ok(pixels.visible>pixels.total*.05 && pixels.transparent>pixels.total*.25,'Fog has real transparent gaps, never an opaque surface');
    assert.equal(pixels.error,0);
    await cdp('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await sleep(150);
    await evaluate(`window.depthDraws=0;document.querySelectorAll('.portal-depth').forEach(c=>{const gl=c.getContext('webgl'),draw=gl.drawArrays.bind(gl);gl.drawArrays=(...args)=>{depthDraws++;return draw(...args)}})`);
    await sleep(250);
    assert.equal(await evaluate(`window.depthDraws`),0,'Reduced motion freezes both fog renderers');
    await cdp('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:2,mobile:false});
    await sleep(400); await shot('depth-retina');
    assert.ok(await evaluate(`depthDraws>0 && [...document.querySelectorAll('.portal-depth')].reduce((n,c)=>n+c.width*c.height,0)<=1800000`));
    await evaluate(`window.depthContextTest=document.querySelector('.portal-depth').getContext('webgl').getExtension('WEBGL_lose_context');depthContextTest.loseContext()`);
    await until(`!document.querySelector('.screen-tunnel').classList.contains('has-depth')`);
    await shot('depth-fallback');
    await evaluate(`depthContextTest.restoreContext()`);
    await until(`document.querySelector('.screen-tunnel').classList.contains('has-depth')`);
    await cdp('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:2,mobile:false});
    await sleep(500); await shot('depth-mobile');
    const mobileTable=await bounds('.portal-table');
    const mobileOpening=await bounds('#screen');
    assert.ok(mobileTable.bottom>800 && mobileOpening.left>=0 && mobileOpening.right<=390,'Mobile retains the opening while the near table fills the foreground');
    assert.ok(await evaluate(`[...document.querySelectorAll('.portal-depth')].reduce((n,c)=>n+c.width*c.height,0)<=550000`));
    assert.equal(errors.length,0,JSON.stringify(errors));
    console.log('PASS: cutout, recessed wall geometry, separate depth layers, camera framing, parallax, transparent fog, reduced motion, context recovery and mobile', {nearShift,farShift,pixels});
  } else {
  if (!process.argv.includes('--mobile-only')) {
  // Regression check at 1920x910 (run first, own fresh page load, so it's
  // unaffected by anything later in the 1440x1000 flow below): the emitted
  // page was clipping off the top of the viewport at this size (the page's
  // own lift-off-the-tilted-table offset, uncompensated, pushed it up
  // further than at 1440x1000), and #portalMatter's WebGL canvas was
  // staying visible as a blurry, wrong-colored ghost behind the real
  // .app-view content once fully morphed into a page.
  await cdp('Emulation.setDeviceMetricsOverride', {width:1920,height:910,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate', {url:`http://127.0.0.1:${port}/`});
  await until(`!!window.portalMatter`);
  await until(`document.querySelector('#deviceTilt').dataset.approach === 'ready'`);
  const wideSeal = await bounds('#introIndicator');
  await cdp('Input.dispatchMouseEvent', {type:'mousePressed',x:wideSeal.x,y:wideSeal.y,button:'left',buttons:1,clickCount:1});
  for (let i=0;i<40;i++) {
    await cdp('Input.dispatchMouseEvent', {type:'mouseMoved',x:wideSeal.x+(i%2 ? 48 : -48),y:wideSeal.y,buttons:1});
    await sleep(20);
  }
  await cdp('Input.dispatchMouseEvent', {type:'mouseReleased',x:wideSeal.x,y:wideSeal.y,button:'left',clickCount:1});
  await until(`document.body.classList.contains('portal-unlocked')`);
  await until(`document.body.classList.contains('intro-done') && !document.querySelector('.portal-flight')`, 20000);
  await sleep(300);
  await assertViewport(); await assertHeldHand(); await shot('foundation-wide-idle');
  await drag('.hand-card--prosjekter .sub-card', await bounds('#screen'));
  await until(`document.querySelector('#app-prosjekter').classList.contains('active')`, 8000);
  await sleep(900);
  await assertRemainingHand(); await assertViewport();
  await shot('10-widescreen-projected');
  const widePage = await bounds('.portal-page');
  assert.ok(widePage.top >= 0 && widePage.bottom <= 910,
    'The page must fit inside a 1920x910 viewport: top=' + widePage.top + ' bottom=' + widePage.bottom);
  assert.equal(
    await evaluate(`getComputedStyle(document.querySelector('#portalMatter canvas')).opacity`), '0',
    'The WebGL canvas must be hidden once fully morphed into a page');
  console.log('PASS: 1920x910 projected page fits the viewport, canvas hidden in page mode');

  await cdp('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate', {url:`http://127.0.0.1:${port}/`});
  await until(`!!window.portalMatter`);
  await sleep(700); await shot('00-approach'); // still across the room, first beat of the walk in
  const farPortal = await bounds('#screen');
  const tablePose = await evaluate(`getComputedStyle(document.querySelector('#screen')).transform`);
  assert.equal(await evaluate(`document.querySelector('#introIndicator').getAttribute('aria-disabled')`), 'true');
  await sleep(2000); await shot('00a-approach-mid');
  const middlePortal = await bounds('#screen');
  await sleep(900); await shot('00b-approach-near');
  await until(`document.querySelector('#deviceTilt').dataset.approach === 'ready'`);
  assert.equal(await evaluate(`document.querySelector('#introIndicator').tabIndex`), 0);
  const initial = await bounds('#screen');
  console.log('Intro bounds', JSON.stringify(initial));
  assert.ok(Math.abs(initial.x-720)<45, 'Intro portal must be centered');
  assert.ok(initial.top>20 && initial.bottom<980, 'Intro portal must fit vertically');
  assert.ok(farPortal.w < middlePortal.w && middlePortal.w <= initial.w, 'The walk must move progressively closer');
  assert.ok(initial.w / initial.h > 2.4, 'The portal must read as a horizontal landscape surface');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#screen')).transform`), tablePose, 'The tabletop must not rotate during the approach');
  console.log('Material', await evaluate(`document.getElementById('portalMatter').className`));
  await shot('01-locked');
  const seal = await bounds('#introIndicator');
  const sealedBall = await bounds('#portalMatter'), socket = await bounds('.intro-indicator-track');
  assert.ok(Math.abs(sealedBall.w / sealedBall.h - 1) < .03, 'The seated ball must remain round above the tilted tabletop');
  // Threshold lowered from 1.8: --view-pitch went from 60deg to 46deg in a
  // later pass (shallower camera angle, requested separately), which
  // foreshortens the socket less. Measured ~1.58 at the current pitch.
  assert.ok(socket.w / socket.h > 1.4 && sealedBall.y < socket.y, 'The ball must stand above a hole in the horizontal plane');
  assert.ok(await evaluate(`document.elementFromPoint(${sealedBall.x},${sealedBall.y - sealedBall.h * .25})?.closest('#introIndicator') !== null`), 'The raised upper half of the ball must be draggable');
  console.log('Seal hit test', seal, await evaluate(`(() => {const e=document.elementFromPoint(${seal.x},${seal.y});return {tag:e?.tagName,id:e?.id,classes:e?.className,pointer:getComputedStyle(document.querySelector('#introIndicator')).pointerEvents,body:document.body.className}})()`));
  await cdp('Input.dispatchMouseEvent', {type:'mousePressed',x:seal.x,y:seal.y,button:'left',buttons:1,clickCount:1});
  console.log('Seal dragging', await evaluate(`document.querySelector('#introIndicator').className`));
  // Swing amplitude must stay inside the ball's own radius: CDP's synthetic
  // input dispatches by hit-testing at each (x,y), and doesn't honor
  // setPointerCapture() the way a real OS-level drag does — so a swing that
  // wanders outside the element (this used to be 120px, back when the ball
  // was sized ~.84 of the portal instead of today's ~.52) lands on nothing,
  // and the drag silently stops accumulating. Measured radius here is
  // ~109px; 45px keeps a wide margin while still exercising the
  // back-and-forth/oscillating case (unsigned distance must not cancel).
  // 40 moves of alternating ±48px covers ~48+39*96=3792px of unsigned
  // distance, clearing the 3600px charge threshold with real margin
  // (45px landed at 99% — too tight to be a stable regression check).
  for (let i=0;i<40;i++) {
    await cdp('Input.dispatchMouseEvent', {type:'mouseMoved',x:seal.x+(i%2 ? 48 : -48),y:seal.y,buttons:1});
    await sleep(35);
  }
  await cdp('Input.dispatchMouseEvent', {type:'mouseReleased',x:seal.x,y:seal.y,button:'left',clickCount:1});
  assert.ok(await evaluate(`document.body.classList.contains('portal-unlocked')`), 'Spinning the real seal must unlock: ' + await evaluate(`document.querySelector('#introIndicator').getAttribute('aria-label')`));
  // Latch the very first letter's launch point from inside the page: polling
  // for it races the flight animation, which has already carried the ghost
  // most of the way to its slot by the time a poll can catch it.
  await evaluate(`(() => {window.letterOrigin = null; document.getElementById('wordmark').addEventListener('letterschanged', () => {
    if (window.letterOrigin !== null) return;
    const g = document.querySelector('.portal-flight')?.getBoundingClientRect();
    const c = document.querySelector('.portal-origin').getBoundingClientRect();
    if (g) window.letterOrigin = Math.hypot(g.x+g.width/2-c.x, g.y+g.height/2-c.y);
  }); return true})()`);
  await sleep(1500); await shot('02-lifting');
  await until(`document.body.classList.contains('intro-textreveal') || document.body.classList.contains('intro-done')`);
  if (!await evaluate(`document.body.classList.contains('intro-done')`)) {
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.hand-card')).visibility`), 'hidden');
  }
  await until(`window.letterOrigin !== null`);
  const sourceDistance = await evaluate(`window.letterOrigin`);
  assert.ok(sourceDistance < 8, 'Letters must originate at the portal center: distance=' + sourceDistance);
  await shot('03-text');
  await until(`document.body.classList.contains('intro-done') && !document.querySelector('.portal-flight')`);
  await sleep(300); await shot('04-idle');
  await assertViewport(); await assertHeldHand();
  await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',x:80,y:80,deltaX:0,deltaY:700});
  await sleep(100); await assertViewport();
  assert.equal(await evaluate(`document.querySelector('#portalMatter').dataset.state`), 'idle');
  assert.ok(await evaluate(`parseFloat(getComputedStyle(document.querySelector('#portalMatter')).getPropertyValue('--matter-height')) > 100`), 'The free material must stand above the aperture plane');
  const lifted = await bounds('#portalMatter'), aperture = await bounds('#screen');
  assert.ok(Math.abs(lifted.x - aperture.x) < 12, 'The sphere must hover over the horizontal centre');
  assert.ok(lifted.y < aperture.y && lifted.bottom > aperture.top, 'The sphere must hover over the aperture, not beyond its back edge');
  assert.ok(aperture.w / aperture.h > 2.4, 'The portal must stay lying down after unlocking');
  assert.ok(await evaluate(`(() => {const s=document.querySelector('#screen'), m=document.querySelector('#portalMatter');return Math.abs(parseFloat(m.style.left)-s.clientWidth/2)<1 && Math.abs(parseFloat(m.style.top)-s.clientHeight/2)<1})()`), 'The lift must keep its footprint at the portal centre');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#screen')).transform`), tablePose, 'Unlocking must not stand the portal up');
  const portalPose = () => evaluate(`getComputedStyle(document.querySelector('#screen')).transform`);
  await cdp('Input.dispatchMouseEvent', {type:'mouseMoved',x:80,y:80,buttons:0});
  await sleep(950); await shot('04a-side-left');
  const fromLeft = await portalPose();
  await cdp('Input.dispatchMouseEvent', {type:'mouseMoved',x:1360,y:920,buttons:0});
  await sleep(950); await shot('04b-side-right');
  assert.equal(await portalPose(), fromLeft, 'Hover must not aim or tilt the portal');
  await evaluate(`document.documentElement.dispatchEvent(new PointerEvent('pointerleave'))`);
  await sleep(300);
  assert.equal(await portalPose(), fromLeft, 'Leaving the viewport must not reorient the portal');
  console.log('PASS: raised volume and fixed portal orientation across pointer movement');
  await click('.hand-card--prosjekter .sub-card');
  assert.equal(await evaluate(`!!document.querySelector('.app-view.active')`), false, 'Click alone must not activate a card');
  await drag('.hand-card--prosjekter .sub-card', await bounds('#screen'));
  await sleep(850); await shot('05-forming');
  await until(`document.querySelector('#app-prosjekter').classList.contains('active')`);
  await sleep(650); await shot('06-projected');
  await assertRemainingHand(); await assertViewport();
  // Content alone scrolls; wheel events must not move the table or the hand.
  const reader=await bounds('.app-view.active .app-content');
  await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',x:reader.right-12,y:reader.y,deltaX:0,deltaY:700});
  await sleep(300);
  assert.ok(await evaluate(`document.querySelector('.app-view.active .app-content').scrollTop>0`),'Project content retains its own scroll');
  await assertViewport();
  const page = await bounds('.portal-page');
  assert.ok(page.top > 0 && page.bottom < 1000, 'The whole emitted page must fit in the viewport');
  assert.equal(await portalPose(), tablePose, 'Projecting content must leave the table lying down');
  await click('#portalRetrieve'); await sleep(1100);
  assert.equal(await evaluate(`!!document.querySelector('.app-view.active')`), false);
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.hand-card--prosjekter .sub-card')).visibility`), 'hidden');
  for (const id of ['arbeidserfaring','kurs','verktoy','ommeg']) {
    await evaluate(`bringHandCardToFront('${id}')`); await sleep(400);
    await drag(`.hand-card--${id} .sub-card`, await bounds('#screen'));
    await until(`document.querySelector('#app-${id}').classList.contains('active')`);
    // The header enters from below; wait for it to settle before aiming a
    // real pointer at its back button, as in the first projection above.
    await sleep(700);
    await assertRemainingHand();
    await click(`#app-${id} [data-close]`); await sleep(1050);
    assert.equal(await evaluate(`!!document.querySelector('.app-view.active')`), false, 'Back must close ' + id);
  }
  console.log('PASS: all five cards, projection, click rejection, and retrieval');
  await drag('.hand-card--ommeg .sub-card', await bounds('#screen'));
  await sleep(600); await click('#introBack'); await sleep(2000);
  assert.equal(await evaluate(`!!document.querySelector('.app-view.active')`), false);
  assert.equal(await evaluate(`document.querySelector('#portalMatter').dataset.state`), 'locked');
  assert.equal(await evaluate(`document.querySelectorAll('.portal-flight').length`), 0);
  console.log('PASS: reset during projection');
  }
  await cdp('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate', {url:`http://127.0.0.1:${port}/`}); await until(`!!window.portalMatter`);
  await until(`document.querySelector('#deviceTilt').dataset.approach === 'ready'`);
  await shot('07-mobile-locked');
  await click('#introForward');
  await until(`document.body.classList.contains('intro-done') && !document.querySelector('.portal-flight')`);
  await shot('08-mobile-idle');
  const mobileTable = await bounds('.portal-table');
  assert.ok(mobileTable.bottom>800,'The mobile table also reaches the foreground');
  await assertViewport(); await assertHeldHand();
  await drag('.hand-card--prosjekter .sub-card', await bounds('#screen'));
  await until(`document.querySelector('#app-prosjekter').classList.contains('active')`);
  await sleep(600); await shot('09-mobile-projected');
  await assertRemainingHand(); await assertViewport();
  const mobilePage = await bounds('.portal-page');
  assert.ok(mobilePage.top > 0 && mobilePage.bottom < 844, 'The mobile page must remain fully visible above the table');
  assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), 'No horizontal overflow');
  assert.equal(errors.length,0, JSON.stringify(errors));
  console.log('PASS: compact viewport and zero browser exceptions');
  await cdp('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await click('#portalRetrieve'); await sleep(200);
  await evaluate(`document.querySelector('.hand-card--prosjekter .sub-card').focus()`);
  await cdp('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await cdp('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await until(`document.querySelector('#app-prosjekter').classList.contains('active')`);
  await sleep(450); await assertRemainingHand();
  await click('#introBack'); await sleep(300);
  assert.equal(await evaluate(`document.querySelector('#portalMatter').dataset.state`), 'locked');
  // Verify the CSS material path independently of WebGL availability.
  await cdp('Page.addScriptToEvaluateOnNewDocument', {source:`const getContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:getContext.call(this,type,...args)}`});
  await cdp('Page.reload'); await until(`!!window.portalMatter && typeof window.bringHandCardToFront === 'function'`);
  assert.equal(await evaluate(`document.querySelector('#deviceTilt').dataset.approach`), 'ready', 'Reduced motion skips the camera journey');
  assert.equal(await evaluate(`document.querySelector('#portalMatter').classList.contains('webgl')`), false);
  assert.equal(await evaluate(`document.querySelector('.screen-tunnel').classList.contains('has-depth')`), false);
  assert.ok(await evaluate(`window.portalMatter.unlock().then(() => window.portalMatter.project('kurs'))`));
  assert.equal(errors.length,0, JSON.stringify(errors));
  console.log('PASS: keyboard, reduced motion and CSS fallback');
  }
  await cdp('Browser.close', {}, false);
} finally {
  ws?.close(); chrome.kill(); server.close();
}
