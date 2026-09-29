// Dedicated real-browser contract and visual checks, no card implementation.
// node tests/impact-check.mjs --serve also provides the manual review URL.
import {createServer} from 'node:http';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),output=resolve(root,'.qa');
const serveOnly=process.argv.includes('--serve');
const server=createServer(async(req,res)=>{
  const file=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try {const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[extname(file)]||'application/octet-stream');res.end(data);}
  catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(serveOnly?4175:0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/?impactDebug=1`;
console.log('Portal impact preview:',url);
if(!serveOnly)await check();
async function check(){
  await mkdir(output,{recursive:true});
  const profile=await mkdtemp(resolve(tmpdir(),'portal-impact-check-'));
  const chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
    '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
    '--enable-unsafe-swiftshader','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'
  ],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let ws;
  try {
    const endpoint=await new Promise((done,fail)=>{
      const timeout=setTimeout(()=>fail(new Error('Chrome startup timed out')),20000);let log='';
      chrome.on('error',fail);chrome.stderr.on('data',chunk=>{log+=chunk;const m=log.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timeout);done(m[1]);}});
    });
    ws=new WebSocket(endpoint);await new Promise((done,fail)=>{ws.addEventListener('open',done,{once:true});ws.addEventListener('error',fail,{once:true});});
    let id=0,session;const pending=new Map(),errors=[];
    ws.addEventListener('message',event=>{
      const msg=JSON.parse(event.data);
      if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.fail(new Error(JSON.stringify(msg.error))):p.done(msg.result);}
      if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails);
      if(msg.method==='Runtime.consoleAPICalled'&&msg.params.type==='error')errors.push(msg.params.args);
    });
    function cdp(method,params={},attached=true){return new Promise((done,fail)=>{
      const serial=++id,timer=setTimeout(()=>{pending.delete(serial);fail(new Error('CDP timeout: '+method));},20000);
      pending.set(serial,{done:r=>{clearTimeout(timer);done(r);},fail:e=>{clearTimeout(timer);fail(e);}});
      ws.send(JSON.stringify({id:serial,method,params,...(attached&&session?{sessionId:session}:{})}));
    });}
    const {targetInfos}=await cdp('Target.getTargets',{},false);
    session=(await cdp('Target.attachToTarget',{targetId:targetInfos.find(t=>t.type==='page').targetId,flatten:true},false)).sessionId;
    await cdp('Page.enable');await cdp('Runtime.enable');
    const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    async function until(expression){const start=Date.now();while(!await evaluate(expression)){if(Date.now()-start>60000)throw new Error('Timed out: '+expression);await sleep(120);}}
    async function shot(name){const {data}=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(resolve(output,'impact-'+name+'.png'),Buffer.from(data,'base64'));}
    await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`
      const realNow=performance.now.bind(performance),raf=requestAnimationFrame.bind(window);
      performance.now=()=>window.__impactClock??realNow();
      window.requestAnimationFrame=fn=>raf(t=>fn(window.__impactClock??t));`});
    await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await cdp('Page.navigate',{url});
    await until(`!!window.portalReaction&&deviceTilt.dataset.approach==='ready'`);
    assert.deepEqual(await evaluate(`triggerPortalImpact()`),{completed:false,reason:'not-ready'});
    await evaluate(`document.querySelector('#introForward').click();true`);
    await until(`document.body.classList.contains('intro-done')&&portalMatter.canReact&&!document.querySelector('.portal-flight')`);
    await sleep(800);
    await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    await until(`!portalReaction.stats.reducedMotion`);await sleep(400);
    const invariant=`JSON.stringify({cards:[...document.querySelectorAll('.hand-card')].map(e=>[e.className,e.getAttribute('style')]),
      camera:sceneCamera.camera,table:document.querySelector('.portal-table').getBoundingClientRect().toJSON(),
      cloth:document.querySelector('#tableCloth').getAttribute('style'),body:document.body.className})`;
    const before=await evaluate(invariant);
    await evaluate(`window.__impactClock=performance.now();window.__start=__impactClock;true`);
    await shot('idle');
    await evaluate(`window.__done=triggerPortalImpact({x:.5,y:.5},1);true`);
    async function at(ms){await evaluate(`window.__impactClock=window.__start+${ms};new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);}
    const states=[];
    for(const ms of [70,140,280,580,1100,1800,2250]) {
      await at(ms);states.push(await evaluate(`({ms:${ms},...portalReaction.sample(),height:parseFloat(document.querySelector('#portalMatter').style.getPropertyValue('--matter-height')),stats:portalReaction.stats})`));
      if([140,280,580,1100,2250].includes(ms))await shot(String(ms));
    }
    assert.ok(Math.abs(states[1].orbOffset)>Math.abs(states[0].orbOffset)*3,'Orb accelerates during its fall');
    assert.ok(states[2].orbOffset<-.35,'Orb reaches the surface');
    assert.ok(states[3].orbOffset>states[2].orbOffset,'Orb recovers after contact');
    assert.ok(states[2].pull>0&&states[3].wave>0,'Suction and traveling wave overlap');
    assert.equal(states.at(-1).orbOffset,0,'No residual displacement');
    assert.deepEqual(await evaluate(`__done`),{completed:true});
    assert.deepEqual(await evaluate(invariant),before,'Cards, cloth, camera and table are unchanged');
    assert.equal(await evaluate(`document.querySelectorAll('.portal-reaction-spark').length`),0);
    assert.ok(await evaluate(`document.querySelector('.portal-reaction').hidden`));
    console.log('PASS: accelerating drop, ripple, suction, smooth recovery, unchanged scene');
    console.log(JSON.stringify(states,null,2));
    // Unequal durations and bursts must not revive an older orb displacement.
    await evaluate(`window.__start=__impactClock;portalReaction.configure({duration:4});window.__older=triggerPortalImpact({x:.2,y:.7},.6);true`);
    await at(150);
    await evaluate(`portalReaction.configure({duration:1});window.__newer=triggerPortalImpact({x:.75,y:.4},.85);true`);
    await at(1200);
    assert.equal(await evaluate(`portalReaction.sample().orbOffset`),0,'Expired newest hit cannot resume the older orb path');
    await evaluate(`portalReaction.cancel();portalReaction.configure(portalReaction.defaults);window.__burst=Array.from({length:8},()=>triggerPortalImpact());true`);
    assert.equal((await evaluate(`portalReaction.stats`)).active,3);
    assert.ok((await evaluate(`portalReaction.stats`)).sparks<=54);
    await evaluate(`portalMatter.reset();true`);
    assert.equal((await evaluate(`portalReaction.stats`)).active,0);
    assert.equal(await evaluate(`Promise.all(__burst).then(results=>results.filter(r=>!r.completed).length)`),8,'All interrupted promises resolve');
    await evaluate(`window.__impactClock=undefined;true`);
    await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await evaluate(`portalMatter.unlock(80)`);
    await evaluate(`window.__reduced=triggerPortalImpact({x:.1,y:.9},.8);true`);
    assert.equal((await evaluate(`portalReaction.stats`)).sparks,0);
    assert.equal(await evaluate(`portalReaction.sample().orbOffset`),0);
    assert.deepEqual(await evaluate(`__reduced`),{completed:true});
    console.log('PASS: bounded overlap, interruption, reset and reduced motion');
    // Projection interruption uses the orb API, without modifying card code.
    await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    await until(`!portalReaction.stats.reducedMotion`);
    await evaluate(`window.__interrupted=triggerPortalImpact();window.__projected=portalMatter.project('kurs');true`);
    assert.deepEqual(await evaluate(`__interrupted`),{completed:false,reason:'orb-transition'});
    await evaluate(`__projected`);await evaluate(`portalMatter.restore()`);
    // Mobile: real elapsed time, no frozen clock. Surface must remain contained.
    await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await sleep(500);
    await evaluate(`window.__start=performance.now();window.__impactClock=__start;window.__mobile=triggerPortalImpact({x:.68,y:.42},.8);true`);
    await at(430);await shot('mobile');
    assert.equal(await evaluate(`document.documentElement.scrollWidth`),390);
    await at(2300);assert.deepEqual(await evaluate(`__mobile`),{completed:true});
    // CSS orb and fog fallbacks still share the same response timeline.
    await evaluate(`window.__impactClock=undefined;true`);
    await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`const getContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.includes('webgl')?null:getContext.call(this,type,...args)}`});
    await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await cdp('Page.reload');await until(`!!window.portalReaction&&deviceTilt.dataset.approach==='ready'`);
    await evaluate(`document.querySelector('#introForward').click();true`);
    await until(`portalMatter.canReact&&document.body.classList.contains('intro-done')&&!document.querySelector('.portal-flight')`);
    await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    await until(`!portalReaction.stats.reducedMotion`);
    await evaluate(`window.__start=performance.now();window.__impactClock=__start;window.__fallback=triggerPortalImpact();true`);
    await at(500);await shot('fallback');await at(2300);
    assert.deepEqual(await evaluate(`__fallback`),{completed:true});
    assert.equal(errors.length,0,JSON.stringify(errors));
    console.log('PASS: projection interruption, mobile containment, WebGL fallback, no browser errors');
    await cdp('Browser.close',{},false);
  } finally {ws?.close();chrome.kill();server.close();}
}
