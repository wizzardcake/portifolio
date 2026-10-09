// Fresh-profile Chrome/ANGLE audit: node tests/performance-check.mjs --out=baseline
// PORTFOLIO_TEST_ROOT selects an untouched source snapshot for A/B runs.
// Always hardware ANGLE; GPU identity and profiling overhead are in report.json.
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
const sourceRoot=resolve(process.env.PORTFOLIO_TEST_ROOT||root);
const name=process.argv.find(a=>a.startsWith('--out='))?.slice(6)||'relay-final';
assert.match(name,/^[a-z0-9-]+$/i);
const gpu=true;
const out=resolve(root,'verification/performance',name);await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
  const file=resolve(sourceRoot,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));
  if(!file.startsWith(sourceRoot+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const url=process.argv.includes("--live")?"https://wizzardcake.github.io/portifolio/":`http://127.0.0.1:${server.address().port}/`;
const prefix=resolve(tmpdir(),'portfolio-performance-'),profile=await mkdtemp(prefix);
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
  await cdp('Network.enable');await cdp('Network.setCacheDisabled',{cacheDisabled:true});await cdp('Performance.enable');
  const shot=async label=>{await sleep(200);const {data}=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(resolve(out,label+'.png'),Buffer.from(data,'base64'));shots.push(label);console.log('Captured',label);};
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await motion('no-preference');
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.__audit={longTasks:[],ready:null,table:null};
    new PerformanceObserver(list=>__audit.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,ms:e.duration})))).observe({type:'longtask',buffered:true});
    new MutationObserver(()=>{
      if(!__audit.table&&document.querySelector('.portal-table'))__audit.table=performance.now();
      if(!__audit.ready&&document.querySelector('#roomShell.is-ready'))__audit.ready=performance.now();
    }).observe(document,{subtree:true,attributes:true,childList:true});
  `});
  await cdp('Profiler.enable');await cdp('Profiler.start');
  console.log('Loading',url);await cdp('Page.navigate',{url});
  await until("!!window.studyRoom && document.querySelector('#roomShell.is-ready')");
  await writeFile(resolve(out,'startup.cpuprofile'),JSON.stringify((await cdp('Profiler.stop')).profile));
  const startup=await evaluate(`({...__audit,navigation:performance.getEntriesByType('navigation')[0].toJSON(),paint:performance.getEntriesByType('paint').map(e=>e.toJSON()),resources:performance.getEntriesByType('resource').map(e=>({name:e.name.split('/').pop(),ms:e.duration,transfer:e.transferSize,bytes:e.decodedBodySize})),heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null})`);
  const system=await cdp('SystemInfo.getInfo',{},false);await sleep(1500);
  await evaluate(`(()=>{window.__renders=[];for(const [name,r] of [['room',studyRoom.renderer],['front',studyRoom.front]]){if(!r)continue;const original=r.render;r.render=function(s,c){const start=performance.now(),shadow=this.shadowMap.needsUpdate,layer=c.layers.mask;original.call(this,s,c);__renders.push({name,ms:performance.now()-start,shadow,layer,calls:this.info.render.calls,triangles:this.info.render.triangles});};}return true;})()`);
  const metrics={},memory=[];
  for(const view of ['entry','chair','shelf']){
    await evaluate(`sceneCamera.go('${view}',{instant:true});sceneCamera.update();studyRoom.invalidate();true`);await sleep(1200);
    const beforeMetrics=(await cdp('Performance.getMetrics')).metrics;
    await cdp('Profiler.start');
    metrics[view]=await evaluate(`new Promise(resolve=>{__renders.length=0;const start=performance.now(),deltas=[];let last=start;function step(now){deltas.push(now-last);last=now;if(now-start<5000)requestAnimationFrame(step);else {const renders={};for(const r of __renders){const key=r.name+':'+r.layer+(r.shadow?':shadow':'');const a=renders[key]??={count:0,cpuMs:0,calls:0,triangles:0};a.count++;a.cpuMs+=r.ms;a.calls+=r.calls;a.triangles+=r.triangles;}deltas.sort((a,b)=>a-b);resolve({elapsedMs:now-start,fps:deltas.length*1000/(now-start),p50ms:deltas[Math.floor(deltas.length*.5)],p95ms:deltas[Math.floor(deltas.length*.95)],p99ms:deltas[Math.floor(deltas.length*.99)],renders});}}requestAnimationFrame(step);})`);
    await writeFile(resolve(out,view+'.cpuprofile'),JSON.stringify((await cdp('Profiler.stop')).profile));
    const afterMetrics=(await cdp('Performance.getMetrics')).metrics;
    metrics[view].browser=Object.fromEntries(afterMetrics.filter(m=>['LayoutCount','RecalcStyleCount','LayoutDuration','RecalcStyleDuration','ScriptDuration','TaskDuration'].includes(m.name)).map(m=>[m.name,m.value-beforeMetrics.find(b=>b.name===m.name).value]));
    console.log(view,JSON.stringify(metrics[view]));
    memory.push({view,...await evaluate(`({used:performance.memory?.usedJSHeapSize,room:{...studyRoom.renderer.info.memory},front:{...studyRoom.front.info.memory},programs:studyRoom.renderer.info.programs.length})`)});
  }
  await motion('reduce');
  await evaluate(`window.__nativeRAF=requestAnimationFrame;window.requestAnimationFrame=cb=>__nativeRAF(()=>cb(20000));true`);
  for(const view of ['entry','chair','shelf']){
    await evaluate(`sceneCamera.go('${view}',{instant:true});sceneCamera.update();studyRoom.invalidate();true`);await sleep(1500);await shot(view);
  }
  await evaluate('window.requestAnimationFrame=__nativeRAF;true');await motion('no-preference');
  for(let i=0;i<6;i++){
    await evaluate(`sceneCamera.go('${['entry','chair','shelf'][i%3]}',{instant:true});sceneCamera.update();true`);await sleep(5000);
    await cdp('HeapProfiler.collectGarbage');memory.push({soakSeconds:(i+1)*5,...await evaluate(`({used:performance.memory?.usedJSHeapSize,room:{...studyRoom.renderer.info.memory},front:{...studyRoom.front.info.memory},programs:studyRoom.renderer.info.programs.length})`)});
  }
  const audit=await evaluate(`(()=>{const lights=[],objects={meshes:0,transparent:0,shadowCasters:0};studyRoom.scene.traverse(o=>{if(o.isMesh){objects.meshes++;if(o.castShadow)objects.shadowCasters++;if([].concat(o.material).some(m=>m.transparent))objects.transparent++;}if(o.isLight)lights.push({type:o.type,name:o.name,shadow:o.castShadow,map:o.shadow?.mapSize.toArray()});});return {lights,objects,ratio:studyRoom.renderer.getPixelRatio(),programs:studyRoom.renderer.info.programs.length};})()`);
  const report={url,sourceRoot,conditions:{width:1440,height:900,dpr:1,motion:'normal during timing',gpu:'ANGLE D3D11',cache:'disabled; fresh Chrome profile',cpuProfiler:true,soakSeconds:30},startup,metrics,memory,audit,gpu:system.gpu,errors,warnings,shots};
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,readyMs:startup.ready,longTasks:startup.longTasks,errors},null,2));
  assert.deepEqual(errors,[],'Console/shader errors');await cdp('Browser.close',{},false).catch(()=>{});
}finally{ws?.close();chrome.kill();server.close();if(resolve(profile).startsWith(prefix))await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});}
