// Local Chrome/CDP visual relay: node tests/lighting-check.mjs [--out=name] [--gpu]
// --gpu renders on the GPU (ANGLE D3D11); without it Chrome falls back to
// SwiftShader, whose frame rates mean nothing, so fps is only measured with --gpu.
// Door readability: mean luminance round the doorway from the shelf (report.json, door).
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
// The loading gate (loading-gate.js) covers the page until the room is ready;
// every wait below begins once it has let the visitor in.
const GATE_OPEN = "(document.readyState !== 'loading' && (!document.getElementById('loadingGate') || document.documentElement.dataset.siteEntered === 'yes'))";

const root=resolve(import.meta.dirname,'..');
const name=process.argv.find(a=>a.startsWith('--out='))?.slice(6)||'relay-final';
assert.match(name,/^[a-z0-9-]+$/i);
const gpu=process.argv.includes('--gpu');
const out=resolve(root,'verification/lighting',name);await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
  const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const url=`http://127.0.0.1:${server.address().port}/`;
const prefix=resolve(tmpdir(),'portfolio-lighting-relay-'),profile=await mkdtemp(prefix);
const chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
  '--enable-unsafe-swiftshader',...(gpu?['--use-angle=d3d11','--enable-gpu']:[]),'--remote-debugging-port=0','--user-data-dir='+profile,'about:blank',
],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let ws;
try{
  const endpoint=await new Promise((done,fail)=>{let log='';const timer=setTimeout(()=>fail(new Error('Chrome startup timeout')),20000);
    chrome.once('error',fail);chrome.stderr.on('data',c=>{log+=c;const m=log.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);done(m[1]);}});});
  ws=new WebSocket(endpoint);await new Promise((done,fail)=>{ws.addEventListener('open',done,{once:true});ws.addEventListener('error',fail,{once:true});});
  let serial=0,session;const pending=new Map(),errors=[],warnings=[];
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);
    if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.fail(new Error(JSON.stringify(m.error))):p.done(m.result);}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
    if(m.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(m.params.type))(m.params.type==='error'?errors:warnings).push(m.params.args.map(a=>a.value||a.description).join(' '));
  });
  const cdp=(method,params={},attached=true)=>new Promise((done,fail)=>{const id=++serial,t=setTimeout(()=>{pending.delete(id);fail(new Error('Timeout '+method+' '+(params.expression||'').slice(0,100)));},90000);
    pending.set(id,{done:r=>{clearTimeout(t);done(r);},fail:e=>{clearTimeout(t);fail(e);}});ws.send(JSON.stringify({id,method,params,...(attached&&session?{sessionId:session}:{})}));});
  const {targetInfos}=await cdp('Target.getTargets',{},false);session=(await cdp('Target.attachToTarget',{targetId:targetInfos.find(t=>t.type==='page').targetId,flatten:true},false)).sessionId;
  await cdp('Page.enable');await cdp('Runtime.enable');
  const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const sleep=ms=>new Promise(done=>setTimeout(done,ms));
  async function until(expression){const at=Date.now();while(!await evaluate(GATE_OPEN + ' && (' + expression + ')')){if(Date.now()-at>45000)throw new Error('Timed out '+expression);await sleep(100);}}
  const motion=async value=>cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value}]});
  const shots=[];
  const shot=async label=>{await sleep(200);const {data}=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(resolve(out,label+'.png'),Buffer.from(data,'base64'));shots.push(label);console.log('Captured',label);};
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await motion('reduce');
  console.log('Loading',url);await cdp('Page.navigate',{url});await until("!!window.studyRoom?.lamps && document.querySelector('#roomShell').classList.contains('is-ready')");console.log('Room ready');await evaluate('Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,1500))]).then(()=>true)');await sleep(1000);
  await evaluate("window.__shelfPose=structuredClone(sceneCamera.shelf);true");
  // Review poses stand in for the shelf point (scene-camera.js rebuilds its
  // ways when a point changes). update(): already at the shelf, go() does
  // not move, but the new pose must apply.
  async function pose(which,position,lookAt){
    await evaluate(`sceneCamera.shelf=structuredClone(__shelfPose);true`);
    if(position)await evaluate(`sceneCamera.shelf.wide={position:${JSON.stringify(position)},lookAt:${JSON.stringify(lookAt)}};sceneCamera.shelf.portrait=sceneCamera.shelf.wide;true`);
    await evaluate(`sceneCamera.go('${position?'shelf':which}',{instant:true});sceneCamera.update();studyRoom.invalidate();true`);await sleep(300);
  }
  const views=[['entry','entry'],['seated','chair'],['shelf','shelf'],
    ['door-from-shelf','shelf',[-.55,1.8,-1.55],[.8,1.1,5.9]],
    ['door-near','shelf',[1.3,1.7,3.8],[.1,1.25,5.9]],
    ['threshold','shelf',[.8,1.55,4.2],[.8,.15,6.1]],
    ['stair-close','shelf',[1.10,1.8,-1.85],[2.10,2.65,-3.2]],
    ['stair-up','shelf',[1.10,1.6,-1.85],[2.25,3.2,-2.8]]];
  for(const [label,...args] of views){await pose(...args);await shot(label);}
  // Door readability from the shelf (and at the threshold): mean linear
  // luminance in the opening, both jambs, the head, the threshold, the
  // passage's far reveal and the stone beside the lamp, read back from the
  // room canvas. The door reads when its jambs and head stand clear of the
  // dark opening; see PROGRESS.md (door A/B) for the comparisons.
  const luminance=`(()=>{const z=5.9,q=(x0,x1,y0,y1)=>[[x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z]];
    const boxes={opening:q(.36,1.24,.2,1.9),nearJamb:q(.02,.22,.2,1.9),farJamb:q(1.38,1.58,.2,1.9),head:q(.3,1.3,2.13,2.38),
      threshold:[[.3,0,5.35],[1.3,0,5.35],[1.3,0,5.85],[.3,0,5.85]],farReveal:[[1.35,.2,5.93],[1.35,.2,6.55],[1.35,1.9,6.55],[1.35,1.9,5.93]],lampStone:q(-1.1,-.5,.4,1.6)};
    const R=studyRoom,gl=R.renderer.getContext(),ratio=R.renderer.getPixelRatio(),H=gl.drawingBufferHeight,result={};
    const lin=c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};
    for(const [name,pts] of Object.entries(boxes)){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9,behind=false;
      for(const p of pts){const s=sceneCamera.project(...p);if(s.depth<.05)behind=true;x0=Math.min(x0,s.x);x1=Math.max(x1,s.x);y0=Math.min(y0,s.y);y1=Math.max(y1,s.y);}
      x0=Math.max(0,Math.round(x0*ratio));x1=Math.min(gl.drawingBufferWidth,Math.round(x1*ratio));y0=Math.max(0,Math.round(y0*ratio));y1=Math.min(H,Math.round(y1*ratio));
      if(behind||x1-x0<2||y1-y0<2){result[name]=null;continue;}
      const w=x1-x0,h=y1-y0,buf=new Uint8Array(w*h*4);gl.readPixels(x0,H-y1,w,h,gl.RGBA,gl.UNSIGNED_BYTE,buf);
      let sum=0;for(let i=0;i<buf.length;i+=4)sum+=.2126*lin(buf[i])+.7152*lin(buf[i+1])+.0722*lin(buf[i+2]);result[name]=+(sum/(w*h)).toFixed(5);}
    return result;})()`;
  const door={};
  for(const [view,...args] of views.filter(v=>['door-from-shelf','threshold'].includes(v[0]))){await pose(...args);door[view]=await evaluate(luminance);}
  const seen=door['door-from-shelf'];
  assert.ok(seen.nearJamb>seen.opening*3&&seen.farJamb>seen.opening*2&&seen.head>seen.opening*1.5,'From the shelf the doorway reads: both jambs and the head stand clear of the dark opening');
  // The lantern's pattern reaches the floor before the door. While the gobo's
  // rings were drawn round a fixed point in the image, a new aim put the
  // shadow of the lantern's solid cap on the threshold (0.33x the opening).
  const near=door.threshold;
  assert.ok(near.threshold>near.opening*.5,'At the threshold the floor before the door catches the pattern: '+JSON.stringify(near));
  const audit=await evaluate(`(()=>{
    const lights=[];studyRoom.scene.traverse(o=>{if(o.isLight)lights.push({name:o.name,type:o.type,at:o.position.toArray(),intensity:o.intensity,shadow:o.castShadow,penumbra:o.penumbra});});
    return {stats:studyRoom.lamps.stats,values:studyRoom.lamps.values,lights,source:studyRoom.architecture.source,render:{...studyRoom.renderer.info.render},memory:{...studyRoom.renderer.info.memory}};})()`);
  assert.equal(audit.stats.lamps,19);assert.equal(audit.stats.drawCalls,4);assert.equal(audit.stats.lights,4);
  assert.equal(audit.lights.filter(l=>l.name.startsWith('door lantern')&&l.shadow).length,1);
  // Measure actual rAF cadence in entry and seated modes, retaining all host work.
  const fps={};await motion('no-preference');
  for(const view of gpu?['entry','chair','shelf']:[]){
    await pose(view);await sleep(500);
    fps[view]=await evaluate(`new Promise(resolve=>{const start=performance.now(),deltas=[];let last=start;function step(now){deltas.push(now-last);last=now;if(now-start<2500)requestAnimationFrame(step);else resolve({fps:deltas.length*1000/(now-start),p95ms:deltas.sort((a,b)=>a-b)[Math.floor(deltas.length*.95)]});}requestAnimationFrame(step);})`);
  }
  // Capture that the threshold smoke and lamp breath stay visible in normal motion.
  await pose(...views[3].slice(1));await sleep(1200);await shot('door-live-smoke');
  await motion('reduce');await sleep(200);
  const readBreath=`studyRoom.lamps.group.getObjectByName('lamp halos').material.uniforms.uBreath.value`;
  const frozen=await evaluate(readBreath);await sleep(300);assert.equal(await evaluate(readBreath),frozen,'Reduced motion freezes lamp breathing');
  // Portrait overview checks the new lamp cluster within the normal camera view.
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await pose('entry');await shot('entry-portrait');await pose('shelf');await shot('shelf-portrait');
  const report={checkpoint:name,audit,door,fps:gpu?fps:'not measured (software rendering; pass --gpu)',reducedMotionFrozen:true,errors,warnings,shots};
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));
  // Same local HTML contact-sheet workflow Claude left in compare-3/4.
  const sheet='<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#111;color:white;font:15px system-ui}.grid{display:grid;grid-template-columns:repeat(2,720px);gap:4px;padding:4px}.cell{position:relative}img{display:block;width:720px;height:450px;object-fit:contain;background:#080808}b{position:absolute;top:6px;left:8px;background:#000b;padding:3px 7px}</style><div class="grid">'+shots.map(s=>`<div class="cell"><img src="${s}.png"><b>${s}</b></div>`).join('')+'</div>';
  await writeFile(resolve(out,'sheet.html'),sheet);
  await cdp('Emulation.setDeviceMetricsOverride',{width:1452,height:Math.ceil(shots.length/2)*454+8,deviceScaleFactor:1,mobile:false});
  // Wait until every image in the sheet has loaded before capturing it.
  await cdp('Page.navigate',{url:url+'verification/lighting/'+name+'/sheet.html'});
  await until("[...document.images].every(i=>i.complete&&i.naturalWidth>0)");await sleep(200);
  const {data}=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(resolve(out,'sheet.png'),Buffer.from(data,'base64'));
  console.log(JSON.stringify({out,door,fps:report.fps,errors,warnings},null,2));assert.deepEqual(errors,[],'Console/shader errors');
  await cdp('Browser.close',{},false).catch(()=>{});
}finally{ws?.close();chrome.kill();server.close();if(resolve(profile).startsWith(prefix))await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});}
