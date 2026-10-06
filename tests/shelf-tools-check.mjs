// node tests/shelf-tools-check.mjs [--round=1] [--serve]
// Uses the locally installed Chrome through CDP; no npm install or downloads.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'..');
const round=process.argv.find(a=>a.startsWith('--round='))?.split('=')[1]||'final';
assert.match(round,/^[a-z0-9-]+$/i);
const output=resolve(root,'verification','tools',round==='final'?'final':`attempt-${round}`);
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/tools-preview.html'));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(data);}
  catch{res.writeHead(404).end();}
});
await new Promise((done,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',done);});
const url=`http://127.0.0.1:${server.address().port}/tools-preview.html`;
console.log('Preview:',url);
if(process.argv.includes('--serve'))await new Promise(()=>{});
const prefix=resolve(tmpdir(),'portfolio-shelf-tools-');
const profile=await mkdtemp(prefix);
const chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
  '--enable-unsafe-swiftshader','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank',
],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let ws;
try{
  const endpoint=await new Promise((done,fail)=>{
    const timer=setTimeout(()=>fail(new Error('Chrome startup timed out')),20000);let log='';
    chrome.once('error',e=>{clearTimeout(timer);fail(e);});
    chrome.stderr.on('data',chunk=>{log+=chunk;const match=log.match(/DevTools listening on (ws:\/\/\S+)/);if(match){clearTimeout(timer);done(match[1]);}});
  });
  ws=new WebSocket(endpoint);await new Promise((done,fail)=>{ws.addEventListener('open',done,{once:true});ws.addEventListener('error',fail,{once:true});});
  let serial=0,session;const pending=new Map(),errors=[],warnings=[];
  ws.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.fail(new Error(JSON.stringify(m.error))):p.done(m.result);}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
    if(m.method==='Runtime.consoleAPICalled'){
      const message=m.params.args.map(a=>a.value||a.description).join(' ');
      if(m.params.type==='error')errors.push(message);if(m.params.type==='warning')warnings.push(message);
    }
    if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push(m.params.entry.text);
  });
  const cdp=(method,params={},attached=true)=>new Promise((done,fail)=>{
    const id=++serial,timer=setTimeout(()=>{pending.delete(id);fail(new Error('CDP timeout: '+method));},30000);
    pending.set(id,{done:r=>{clearTimeout(timer);done(r);},fail:e=>{clearTimeout(timer);fail(e);}});
    ws.send(JSON.stringify({id,method,params,...(attached&&session?{sessionId:session}:{})}));
  });
  const {targetInfos}=await cdp('Target.getTargets',{},false);
  session=(await cdp('Target.attachToTarget',{targetId:targetInfos.find(t=>t.type==='page').targetId,flatten:true},false)).sessionId;
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Log.enable');
  const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const sleep=ms=>new Promise(done=>setTimeout(done,ms));
  async function until(expression){const start=Date.now();while(!await evaluate(expression)){if(Date.now()-start>25000)throw new Error('Timed out: '+expression);await sleep(100);}}
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate',{url});await until('!!window.toolsPreview');await sleep(1200);
  const shot=async name=>{const {data}=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(resolve(output,name+'.png'),Buffer.from(data,'base64'));};
  await evaluate("toolsPreview.setHover(-1);toolsPreview.advance(2);toolsPreview.setPaused(true)");
  await shot('all-idle');
  for(const [i,name] of ['figma','grimoire','crystal'].entries()){
    await evaluate(`toolsPreview.focus('${name}');toolsPreview.setHover(-1);toolsPreview.advance(2)`);await sleep(180);await shot(name+'-idle');
    await evaluate(`toolsPreview.setHover(${i});toolsPreview.advance(2)`);await sleep(180);await shot(name+'-hover');
    await evaluate('toolsPreview.orbit(.85,1.12)');await sleep(150);await shot(name+'-side');
  }
  await evaluate("toolsPreview.focus('all');toolsPreview.setHover('all');toolsPreview.advance(1)");await sleep(150);await shot('all-hover');
  const bounds=await evaluate('toolsPreview.bounds()');
  for(const b of bounds){assert.ok(b.min[1]>=-.001,`${b.name}: base penetrates shelf`);assert.ok(b.size[2]<=.26,`${b.name}: too deep for shelf`);assert.ok(b.size[0]<=.32,`${b.name}: too wide`);}
  // Real mouse raycast, including the object under the cursor after camera orbit.
  const hoverHits=[];
  for(let i=0;i<3;i++){
    await evaluate(`toolsPreview.setHover(null);toolsPreview.focus('${['figma','grimoire','crystal'][i]}')`);
    const point=await evaluate(`toolsPreview.point(${i})`);
    await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});await sleep(200);
    hoverHits.push(await evaluate('toolsPreview.stats.hovered'));
  }
  assert.deepEqual(hoverHits,[0,1,2],'Mouse hover raycasting');
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:980});
  // OS preference is reused; phase and geometry stop changing after transition.
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await sleep(100);
  assert.equal(await evaluate('toolsPreview.stats.reducedMotion'),true);
  const reduced=await evaluate(`(()=>{
    toolsPreview.setHover(-1);toolsPreview.advance(2);
    const snapshot=()=>toolsPreview.objects.map(o=>{const nodes=[];o.group.traverse(n=>{
      nodes.push([n.position.toArray(),n.rotation.toArray(),n.material?.uniforms?.uTime?.value,n.material?.opacity,n.material?.emissiveIntensity,
        n.name.includes('curved illuminated')?Array.from(n.geometry.attributes.position.array):null]);});return JSON.stringify(nodes);});
    const before=snapshot();toolsPreview.advance(10);return {static:JSON.stringify(before)===JSON.stringify(snapshot()),sprites:toolsPreview.objects[1].group.children.filter(n=>n.isSprite&&n.visible).length};})()`);
  assert.ok(reduced.static,'Reduced motion must stop autonomous animation');assert.equal(reduced.sprites,0);
  await evaluate("toolsPreview.focus('all')");await shot('reduced-motion');
  // Each newly allocated GPU resource must be disposed exactly once; second
  // dispose/update calls are harmless. No factory may create real-time lights.
  const lifecycle=await evaluate(`(async()=>{
    const mod=await import('./tools-shelf.js');const result=[];
    for(const factory of Object.values(mod)){
      const o=factory({reducedMotion:true}),owned=new Set();let lights=0;
      // THREE.Sprite uses a library-owned shared quad: disposing it here
      // would invalidate other sprites. Only factory-owned geometry counts.
      o.group.traverse(n=>{if(n.isLight)lights++;if(n.geometry&&!n.isSprite)owned.add(n.geometry);if(n.material){owned.add(n.material);for(const v of Object.values(n.material))if(v?.isTexture)owned.add(v);}});
      const count=new Map();owned.forEach(r=>{count.set(r,0);r.addEventListener('dispose',()=>count.set(r,count.get(r)+1));});
      o.setHover(true);o.update(1,.016);o.dispose();o.dispose();o.update(2,.016);o.setHover(false);
      result.push({resources:owned.size,disposedOnce:[...count.values()].every(n=>n===1),detached:o.group.children.length===0,lights});
    }return result;})()`);
  for(const result of lifecycle){assert.ok(result.disposedOnce&&result.detached,'Factory resource disposal: '+JSON.stringify(lifecycle));assert.equal(result.lights,0);}
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await evaluate("toolsPreview.setPaused(false);toolsPreview.setHover('all');toolsPreview.focus('all')");
  await sleep(5500);
  const stats=await evaluate('toolsPreview.stats');
  const gpu=await evaluate(`(()=>{const g=toolsPreview.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER);})()`);
  const fps=stats.fps.slice(-5);const report={url,viewport:[1440,1000],gpu,fps:{samples:fps,mean:fps.reduce((a,b)=>a+b,0)/fps.length},stats,bounds,hoverHits,reduced,lifecycle,errors,warnings};
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));assert.deepEqual(errors,[],'Browser console and shader errors');
  await cdp('Browser.close',{},false).catch(()=>{});
}finally{
  ws?.close();chrome.kill();server.close();
  if(resolve(profile).startsWith(prefix))await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});
}
