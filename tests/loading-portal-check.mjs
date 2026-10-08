// node tests/loading-portal-check.mjs --out=design-1
// Local Chrome/CDP check; fresh profile, no package dependencies.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'..');
const name=process.argv.find(a=>a.startsWith('--out='))?.slice(6)||'relay-final';
assert.match(name,/^[a-z0-9-]+$/i);
const gpu=true;
const out=resolve(root,'verification/loading-portal',name);await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
  const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const url=`http://127.0.0.1:${server.address().port}/`;
const prefix=resolve(tmpdir(),'portfolio-loading-portal-'),profile=await mkdtemp(prefix);
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
  async function until(expression){const at=Date.now();while(!await evaluate(expression)){if(Date.now()-at>45000)throw new Error('Timed out '+expression);await sleep(100);}}
  const motion=async value=>cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value}]});
  const shots=[];
  const shot=async label=>{await sleep(200);const {data}=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(resolve(out,label+'.png'),Buffer.from(data,'base64'));shots.push(label);console.log('Captured',label);};
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await motion('no-preference');
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`window.__long=[];new PerformanceObserver(l=>__long.push(...l.getEntries().map(e=>({start:e.startTime,ms:e.duration})))).observe({type:'longtask',buffered:true});`});
  await cdp('Page.navigate',{url:url+'loading-portal-preview.html?time=0'});await until('!!window.loadingPortal');
  await sleep(300);await shot('square');
  await evaluate('loadingPortal.render(6.85);true');await shot('round');
  await evaluate('loadingPortal.render(13.7);true');await shot('square-flow');
  await evaluate('loadingPortal.render(2.7);loadingPortal.setApproach(.35);true');await shot('approach');
  await evaluate('loadingPortal.setApproach(0);loadingPortal.play();true');
  const live=await evaluate(`new Promise(resolve=>{const start=performance.now(),d=[];let last=start;function step(now){d.push(now-last);last=now;if(now-start<5000)requestAnimationFrame(step);else resolve({fps:d.length*1000/(now-start),p95:d.sort((a,b)=>a-b)[Math.floor(d.length*.95)],stats:loadingPortal.stats});}requestAnimationFrame(step);})`);
  await motion('reduce');await sleep(300);
  const before=await evaluate('loadingPortal.stats');await sleep(500);
  const after=await evaluate('loadingPortal.stats');assert.equal(after.draws,before.draws,'Reduced motion schedules no redraws');
  await evaluate('loadingPortal.setApproach(.8);true');
  assert.equal(await evaluate("getComputedStyle(loadingPortal.layers.liquid).transform"),'none','Reduced motion suppresses approach scaling');
  await evaluate('loadingPortal.setApproach(0);true');await shot('reduced-motion');
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await sleep(250);await shot('mobile');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'No mobile horizontal overflow');
  const audit=await evaluate(`({stats:loadingPortal.stats,opening:loadingPortal.opening,longTasks:__long,paint:performance.getEntriesByType('paint').map(e=>e.toJSON()),resources:performance.getEntriesByType('resource').map(e=>({name:e.name.split('/').pop(),bytes:e.decodedBodySize})),canvasCount:document.querySelectorAll('canvas').length})`);
  assert.equal(audit.canvasCount,3);assert.ok(!audit.resources.some(r=>/three|room-scene/.test(r.name)),'Independent of room and Three.js');
  await evaluate('loadingPortal.dispose();loadingPortal.dispose();true');
  assert.equal(await evaluate("document.querySelectorAll('.loading-portal').length"),0,'Dispose removes the component');
  assert.equal(await evaluate('loadingPortal.stats.disposed'),true);
  await writeFile(resolve(out,'report.json'),JSON.stringify({live,audit,errors,warnings,shots},null,2));
  console.log(JSON.stringify({out,live,audit,errors},null,2));assert.deepEqual(errors,[]);
  await cdp('Browser.close',{},false).catch(()=>{});
}finally{ws?.close();chrome.kill();server.close();if(resolve(profile).startsWith(prefix))await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});}
