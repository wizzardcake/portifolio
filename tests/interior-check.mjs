// Interior reconstruction: fixed views of the room, and load and frame pacing
// before and after entry, in a fresh-profile Chrome on the GPU (ANGLE D3D11).
//   node tests/interior-check.mjs --out=name [--runs=3] [--shots-only] [--timing-only]
// PORTFOLIO_TEST_ROOT serves another checkout (an untouched baseline) for A/B;
// results always land in this checkout's verification/interior/<name>/.
// Same CDP approach as the other suites: local Chrome, no npm install.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'..');
const sourceRoot=resolve(process.env.PORTFOLIO_TEST_ROOT||root);
const arg=(key,fallback)=>process.argv.find(a=>a.startsWith(`--${key}=`))?.split('=')[1]??fallback;
const name=arg('out','interior');assert.match(name,/^[a-z0-9-]+$/i);
const runs=Number(arg('runs',3));
const out=resolve(root,'verification/interior',name);await mkdir(out,{recursive:true});
// As GitHub Pages serves it: cached for ten minutes. Every load uses a fresh
// profile, so every load is cold.
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'};
const server=createServer(async(req,res)=>{
  const file=resolve(sourceRoot,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));
  if(!file.startsWith(sourceRoot+sep)){res.writeHead(403).end();return;}
  try{const data=await readFile(file);res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','max-age=600');res.end(data);}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const sleep=ms=>new Promise(done=>setTimeout(done,ms));

// One Chrome with a fresh profile; returns helpers bound to its page.
async function browser() {
  const prefix=resolve(tmpdir(),'portfolio-interior-'),profile=await mkdtemp(prefix);
  const chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
    '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
    '--use-angle=d3d11','--enable-gpu','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank',
  ],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  const endpoint=await new Promise((done,fail)=>{let log='';const timer=setTimeout(()=>fail(new Error('Chrome startup timeout')),20000);
    chrome.once('error',fail);chrome.stderr.on('data',c=>{log+=c;const m=log.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);done(m[1]);}});});
  const ws=new WebSocket(endpoint);await new Promise((done,fail)=>{ws.addEventListener('open',done,{once:true});ws.addEventListener('error',fail,{once:true});});
  let serial=0,session;const pending=new Map(),errors=[],warnings=[];
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);
    if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.fail(new Error(JSON.stringify(m.error))):p.done(m.result);}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
    if(m.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(m.params.type))(m.params.type==='error'?errors:warnings).push(m.params.args.map(a=>a.value||a.description).join(' '));
  });
  const cdp=(method,params={},attached=true)=>new Promise((done,fail)=>{const id=++serial,t=setTimeout(()=>{pending.delete(id);fail(new Error('Timeout '+method+' '+(params.expression||'').slice(0,100)));},90000);
    pending.set(id,{done:r=>{clearTimeout(t);done(r);},fail:e=>{clearTimeout(t);fail(e);}});ws.send(JSON.stringify({id,method,params,...(attached&&session?{sessionId:session}:{})}));});
  const {targetInfos}=await cdp('Target.getTargets',{},false);
  session=(await cdp('Target.attachToTarget',{targetId:targetInfos.find(t=>t.type==='page').targetId,flatten:true},false)).sessionId;
  await cdp('Page.enable');await cdp('Runtime.enable');
  const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  async function until(expression,timeout=60000){const at=Date.now();while(!await evaluate(expression)){if(Date.now()-at>timeout)throw new Error('Timed out '+expression);await sleep(100);}}
  const close=async()=>{await cdp('Browser.close',{},false).catch(()=>{});ws.close();chrome.kill();
    if(resolve(profile).startsWith(prefix))await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});};
  return {cdp,evaluate,until,close,errors,warnings};
}
const size=(cdp,width,height,mobile=false)=>cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
const motion=(cdp,value)=>cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value}]});
// rAF intervals over a stretch: frames, fps, p50/p95/p99 and the longest gap.
const pacing=ms=>`new Promise(resolve=>{const start=performance.now(),d=[];let last=start;
  function step(now){d.push(now-last);last=now;if(now-start<${ms})requestAnimationFrame(step);else{const s=[...d].sort((a,b)=>a-b),q=f=>+s[Math.min(s.length-1,Math.floor(s.length*f))].toFixed(1);
    resolve({frames:d.length,fps:+(d.length*1000/(now-start)).toFixed(1),p50:q(.5),p95:q(.95),p99:q(.99),longest:+s[s.length-1].toFixed(1),over50:d.filter(x=>x>50).length});}}
  requestAnimationFrame(step);})`;

// ---- Timing: cold loads, the gate's frames while the room builds, and the
// room's frames after entry at the entry, the chair and the shelf.
const timing=[];
if(!process.argv.includes('--shots-only')) for(let run=0;run<runs;run++) {
  const b=await browser();
  try {
    await size(b.cdp,1440,900);await motion(b.cdp,'no-preference');
    await b.cdp('Page.addScriptToEvaluateOnNewDocument',{source:`
      window.__interior={events:{},gaps:[],longTasks:[]};
      for(const name of ['site-ready','site-entering','site-entered'])addEventListener(name,()=>{__interior.events[name]=performance.now();});
      new PerformanceObserver(l=>__interior.longTasks.push(...l.getEntries().map(e=>({start:Math.round(e.startTime),ms:Math.round(e.duration)})))).observe({type:'longtask',buffered:true});
      (()=>{let last=0;const step=now=>{if(last)__interior.gaps.push([now,now-last]);last=now;if(!__interior.events['site-ready'])requestAnimationFrame(step);};requestAnimationFrame(step);})();
      new MutationObserver(()=>{if(!__interior.roomShown&&document.querySelector('#roomShell.is-ready'))__interior.roomShown=performance.now();}).observe(document,{subtree:true,attributes:true,childList:true});`});
    await b.cdp('Page.navigate',{url});
    await b.until("!!window.__interior?.events['site-ready']");
    const before=await b.evaluate(`(()=>{const g=__interior.gaps.map(x=>x[1]),ready=__interior.events['site-ready'];
      const paint=performance.getEntriesByType('paint').find(e=>e.name==='first-contentful-paint')?.startTime;
      return {firstPaint:Math.round(paint),roomShown:Math.round(__interior.roomShown),ready:Math.round(ready),frames:g.length,
        fps:+(g.length*1000/(ready-(__interior.gaps[0]?.[0]??0))).toFixed(1),longestGap:Math.round(Math.max(...g)),over100:g.filter(x=>x>100).length,
        longTasks:[...__interior.longTasks].sort((a,b)=>b.ms-a.ms).slice(0,6)};})()`);
    await b.until("!!document.querySelector('.loading-gate__continue:not([hidden])') && performance.now() >= (loadingGate.stats.listeningAt ?? 0)");
    await b.evaluate("document.querySelector('.loading-gate__continue').click(),true");
    await b.until("document.documentElement.dataset.siteEntered === 'yes'");
    const entered=await b.evaluate("Math.round(__interior.events['site-entered'])");
    await sleep(1500);
    const after={};
    for(const view of ['entry','chair','shelf']) {
      await b.evaluate(`sceneCamera.go('${view}',{instant:true});sceneCamera.update();studyRoom.invalidate();true`);await sleep(1200);
      after[view]=await b.evaluate(pacing(4000));
    }
    await b.evaluate(`sceneCamera.go('entry',{instant:true});sceneCamera.update();studyRoom.invalidate();true`);await sleep(400);
    const stats=await b.evaluate(`(()=>{const R=studyRoom,r=R.renderer;
      r.info.autoReset=false;r.info.reset();R.camera.layers.set(0);r.render(R.scene,R.camera);const room={calls:r.info.render.calls,triangles:r.info.render.triangles};r.info.autoReset=true;
      return {room,memory:{...r.info.memory},programs:r.info.programs.length,programKeys:r.info.programs.map(p=>p.name+" "+p.cacheKey)};})()`);
    timing.push({run,before,entered,after,stats,errors:[...b.errors]});
    console.log('run',run,JSON.stringify({ready:before.ready,roomShown:before.roomShown,entered,gateFps:before.fps,gateLongest:before.longestGap,entry:after.entry,stats}));
  } finally {await b.close();}
}

// ---- Views: still frames, reduced motion and a fixed clock, so before and
// after compare like for like. Named poses stand in for the shelf point
// (scene-camera.js rebuilds its ways when a point changes; the shelf takes no
// lens shift, so verticals stay true).
const shots=[];
if(!process.argv.includes('--timing-only')) {
  const b=await browser();
  try {
    await size(b.cdp,1440,900);await motion(b.cdp,'reduce');
    await b.cdp('Page.navigate',{url});
    await b.until("(document.querySelector('.loading-gate__continue:not([hidden])')?.click(), document.documentElement.dataset.siteEntered === 'yes') && document.querySelector('#roomShell').classList.contains('is-ready')");
    await b.evaluate('Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,1500))]).then(()=>true)');await sleep(800);
    await b.evaluate(`window.__shelfPose=structuredClone(sceneCamera.shelf);window.__nativeRAF=requestAnimationFrame;window.requestAnimationFrame=cb=>__nativeRAF(()=>cb(20000));true`);
    // The room's landmarks, from what the page exposes (scene coordinates).
    const room=await b.evaluate(`(()=>{const R=studyRoom,f=R.placement.forward,d=R.dimensions;
      const door=R.door?{x:R.door.x,z:R.door.z}:{x:.8,z:d.front};
      const tower=R.tower?{x:R.tower.x,z:R.tower.z-f}:null,win=R.window?{x:R.window.x,z:R.alcove?R.alcove.back-f:d.back}:null;
      return {dimensions:d,door,tower,window:win,table:{w:sceneCamera.tableWidthPx/sceneCamera.units,d:sceneCamera.tableDepthPx/sceneCamera.units}};})()`);
    console.log('room',JSON.stringify(room));
    const {door,tower,window:win,dimensions:d}=room;
    const free=(position,lookAt)=>({position,lookAt});
    const views=[
      ['entry'],['seated','chair'],['shelf'],
      // Concept view 1: the whole room toward the window, from just inside the door.
      ['toward-window',free([0,1.6,door.z-.45],[0,1.45,win?win.z:d.back])],
      // Concept view 2: from in front of the window back toward the door.
      ['toward-door',free([0,1.6,(win?win.z:d.back)+.9],[door.x,1.3,door.z])],
      ['stair-tower',tower&&free([tower.x-2.4,1.6,tower.z+2.0],[tower.x,1.5,tower.z])],
      ['vault',free([0,1.6,door.z-.6],[0,4.5,(win?win.z:d.back)*.4])],
    ];
    const stats={};
    const shot=async label=>{await sleep(350);const {data}=await b.cdp('Page.captureScreenshot',{format:'png'});await writeFile(resolve(out,label+'.png'),Buffer.from(data,'base64'));shots.push(label);console.log('Captured',label);};
    async function pose(label,place,view) {
      await b.evaluate(`sceneCamera.shelf=structuredClone(__shelfPose);true`);
      if(view)await b.evaluate(`sceneCamera.shelf.wide=${JSON.stringify(view)};sceneCamera.shelf.portrait=sceneCamera.shelf.wide;true`);
      await b.evaluate(`sceneCamera.go('${view?'shelf':place}',{instant:true});sceneCamera.update();studyRoom.invalidate();true`);
      await sleep(300);
      stats[label]=await b.evaluate(`(()=>{const R=studyRoom,r=R.renderer;r.info.autoReset=false;r.info.reset();R.camera.layers.set(0);r.render(R.scene,R.camera);
        const s={calls:r.info.render.calls,triangles:r.info.render.triangles,eye:[+sceneCamera.x.toFixed(3),+sceneCamera.eyeHeight.toFixed(3),+sceneCamera.distance.toFixed(3)],seatedDistance:+sceneCamera.seatedDistance.toFixed(3)};r.info.autoReset=true;R.invalidate();return s;})()`);
    }
    for(const [label,place=label,view] of views) {
      if(typeof place==='object'||place===null){if(!place)continue;await pose(label,'shelf',place);}
      else await pose(label,place);
      await shot(label);
    }
    await size(b.cdp,390,844,true);
    for(const [label,place] of [['entry-portrait','entry'],['seated-portrait','chair']]){await pose(label,place);await shot(label);}
    // Clearance: on every walk, at both formats, how near the eye comes to
    // anything solid in the room (walls, columns, vault, stair, lamps, the
    // table): the nearest triangle to each eye position, every 2% of each
    // leg. (Books stand in their niches and the floor lies below; both left out.)
    const clearance={};
    for(const [format,w,h,mobile] of [['wide',1440,900,false],['portrait',390,844,true]]) {
      await size(b.cdp,w,h,mobile);await sleep(300);
      clearance[format]=await b.evaluate(`(async()=>{
        const THREE=await import('./vendor/three/three.module.js'),R=studyRoom,cam=sceneCamera;
        cam.shelf=structuredClone(__shelfPose);R.scene.updateMatrixWorld(true);
        const tris=[],m=new THREE.Matrix4(),im=new THREE.Matrix4(),v=new THREE.Vector3();
        R.scene.traverse(o=>{
          if(!(o.isMesh&&o.layers.isEnabled(0)&&o.visible)||['books','wooden plank floor'].includes(o.name)||(o.material.transparent&&!o.material.depthWrite))return;
          const p=o.geometry.attributes.position,index=o.geometry.index,n=index?index.count:p.count;
          for(let k=0;k<(o.isInstancedMesh?o.count:1);k++){
            m.copy(o.matrixWorld);if(o.isInstancedMesh){o.getMatrixAt(k,im);m.multiply(im);}
            for(let i=0;i<n;i+=3){const t=new THREE.Triangle();
              for(const [j,c] of [[0,t.a],[1,t.b],[2,t.c]])c.fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(m);
              const centre=t.getMidpoint(new THREE.Vector3());
              tris.push({t,centre,r:Math.max(centre.distanceTo(t.a),centre.distanceTo(t.b),centre.distanceTo(t.c)),name:o.name});}
          }
        });
        const eye=new THREE.Vector3(),near=new THREE.Vector3(),legs={};
        for(const leg of ['entry>seated','entry>shelf','shelf>seated']) {
          const [from,to]=leg.split('>');let worst={d:Infinity};
          for(let p=0;p<=1.0001;p+=.02) {
            cam.setLeg(from,to,p);eye.set(cam.x,cam.eyeHeight,cam.distance);
            for(const x of tris){if(x.centre.distanceTo(eye)-x.r>Math.min(worst.d,1.2))continue;
              const d=x.t.closestPointToPoint(eye,near).distanceTo(eye);
              if(d<worst.d)worst={d:+d.toFixed(3),p:+p.toFixed(2),eye:eye.toArray().map(v=>+v.toFixed(2)),what:x.name};}
          }
          legs[leg]=worst;
        }
        cam.go('entry',{instant:true});cam.update();R.invalidate();
        return {triangles:tris.length,...legs};})()`);
    }
    console.log('clearance',JSON.stringify(clearance));
    await writeFile(resolve(out,'views.json'),JSON.stringify({room,stats,clearance,errors:b.errors,warnings:b.warnings},null,2));
    assert.deepEqual(b.errors,[],'Console/shader errors');
  } finally {await b.close();}
  // A contact sheet of every view.
  const sheet='<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#111;color:#fff;font:15px system-ui}.g{display:grid;grid-template-columns:repeat(3,480px);gap:4px;padding:4px}div{position:relative}img{display:block;width:480px;height:300px;object-fit:contain;background:#080808}b{position:absolute;top:6px;left:8px;background:#000b;padding:3px 7px}</style><div class="g">'+shots.map(s=>`<div><img src="${s}.png"><b>${s}</b></div>`).join('')+'</div>';
  await writeFile(resolve(out,'sheet.html'),sheet);
}
const summary=list=>{if(!list.length)return null;const m=k=>{const v=list.map(k).sort((a,b)=>a-b);return {median:v[Math.floor(v.length/2)],min:v[0],max:v[v.length-1]};};
  return {ready:m(t=>t.before.ready),roomShown:m(t=>t.before.roomShown),entered:m(t=>t.entered),firstPaint:m(t=>t.before.firstPaint),
    gate:{fps:m(t=>t.before.fps),longestGap:m(t=>t.before.longestGap)},
    ...Object.fromEntries(['entry','chair','shelf'].map(v=>[v,{fps:m(t=>t.after[v].fps),p95:m(t=>t.after[v].p95),p99:m(t=>t.after[v].p99),longest:m(t=>t.after[v].longest)}])),
    room:list[0].stats};};
const report={sourceRoot,conditions:{viewport:'1440x900 DPR 1',gpu:'ANGLE D3D11',cache:'max-age=600, fresh profile per load (cold)',runs},summary:summary(timing),timing,shots};
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({out,summary:report.summary},null,2));
server.close();
