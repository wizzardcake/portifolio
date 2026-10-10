// The places to go, clicked where the visitor sees them: each smoke marker on
// the floor and each object (the chair with the table, the study nook), at the
// entry and at the shelf, wide and portrait. Each click must lead to its own
// place, never to another's.
//   node tests/navigation-check.mjs [--out=name]
// PORTFOLIO_TEST_ROOT serves another checkout (an untouched baseline).
// Same CDP approach as the other suites: local Chrome, no npm install.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'..');
const sourceRoot=resolve(process.env.PORTFOLIO_TEST_ROOT||root);
const name=process.argv.find(a=>a.startsWith('--out='))?.slice(6)||'navigation';assert.match(name,/^[a-z0-9-]+$/i);
const out=resolve(root,'verification/navigation',name);await mkdir(out,{recursive:true});
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'};
const server=createServer(async(req,res)=>{
  const file=resolve(sourceRoot,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));
  if(!file.startsWith(sourceRoot+sep)){res.writeHead(403).end();return;}
  try{const data=await readFile(file);res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const prefix=resolve(tmpdir(),'portfolio-navigation-'),profile=await mkdtemp(prefix);
const chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
  '--use-angle=d3d11','--enable-gpu','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank',
],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let ws;const results=[],errors=[];
try{
  const endpoint=await new Promise((done,fail)=>{let log='';const timer=setTimeout(()=>fail(new Error('Chrome startup timeout')),20000);
    chrome.once('error',fail);chrome.stderr.on('data',c=>{log+=c;const m=log.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);done(m[1]);}});});
  ws=new WebSocket(endpoint);await new Promise((done,fail)=>{ws.addEventListener('open',done,{once:true});ws.addEventListener('error',fail,{once:true});});
  let serial=0,session;const pending=new Map();
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);
    if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.fail(new Error(JSON.stringify(m.error))):p.done(m.result);}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
    if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description).join(' '));
  });
  const cdp=(method,params={},attached=true)=>new Promise((done,fail)=>{const id=++serial,t=setTimeout(()=>{pending.delete(id);fail(new Error('Timeout '+method));},90000);
    pending.set(id,{done:r=>{clearTimeout(t);done(r);},fail:e=>{clearTimeout(t);fail(e);}});ws.send(JSON.stringify({id,method,params,...(attached&&session?{sessionId:session}:{})}));});
  const {targetInfos}=await cdp('Target.getTargets',{},false);
  session=(await cdp('Target.attachToTarget',{targetId:targetInfos.find(t=>t.type==='page').targetId,flatten:true},false)).sessionId;
  await cdp('Page.enable');await cdp('Runtime.enable');
  const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  async function until(expression,timeout=60000){const at=Date.now();while(!await evaluate(expression)){if(Date.now()-at>timeout)throw new Error('Timed out '+expression);await sleep(100);}}
  const click=async(x,y)=>{for(const type of ['mousePressed','mouseReleased'])await cdp('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});};
  // Each place's marker and object, as world points (scene metres).
  const places=`(()=>{const c=sceneCamera,b=c.paths.branch,s=c.points.shelf.position,e=c.points.entry.position,n=studyRoom.nook??{x:-2.4,z0:-2.6,z1:-.5,top:2.12};
    return {shelfMark:[s[0],0,s[2]],chairMark:[b[b.length-1][0],0,b[b.length-1][1]],entryMark:[e[0],0,e[2]],
      chair:[c.chairPose.x,.45,c.chairPose.z],table:[0,c.tableHeight,0],nook:[n.x,1.2,(n.z0+n.z1)/2]};})()`;
  // What is under a world point on screen, and where.
  const under=point=>evaluate(`(()=>{const p=sceneCamera.project(...${JSON.stringify(point)});
    if(p.depth<.1||p.x<2||p.y<2||p.x>innerWidth-2||p.y>innerHeight-2)return null;
    const el=document.elementFromPoint(p.x,p.y);return {x:Math.round(p.x),y:Math.round(p.y),id:el?.id||el?.className||el?.tagName};})()`);
  const goes={goShelf:'SHELF_APPROACH',goChair:'CHAIR_APPROACH',leaveShelf:'SHELF_APPROACH'};
  async function at(place){await evaluate(`sceneCamera.go('${place}',{instant:true});sceneCamera.update();studyRoom.invalidate();true`);await sleep(400);}
  async function tryClick(label,where,point,expect){
    const hit=await under(point);
    if(!hit){results.push({label,where,visible:false});return;}
    const before=await evaluate('sceneCamera.navigation');
    await click(hit.x,hit.y);await sleep(250);
    const after=await evaluate('sceneCamera.navigation');
    results.push({label,where,at:[hit.x,hit.y],under:hit.id,before,after,ok:after===expect});
    await evaluate(`sceneCamera.stop();true`);
  }
  for(const [format,w,h,mobile] of [['wide',1440,900,false],['portrait',390,844,true]]){
    await cdp('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile});
    await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    await cdp('Page.navigate',{url});
    await until("(document.querySelector('.loading-gate__continue:not([hidden])')?.click(), document.documentElement.dataset.siteEntered === 'yes') && sceneCamera.navigation === 'ENTRY'");
    await sleep(1200);
    const p=await evaluate(places);
    // At the entry: the shelf's and the chair's marker, then the nook and the chair.
    for(const [label,point,expect] of [['shelf marker',p.shelfMark,'SHELF_APPROACH'],['chair marker',p.chairMark,'CHAIR_APPROACH'],
      ['study nook',p.nook,'SHELF_APPROACH'],['chair',p.chair,'CHAIR_APPROACH'],['table',p.table,'CHAIR_APPROACH']]) {
      await at('entry');await tryClick(label,format+' entry',point,expect);
    }
    // At the shelf: the entry's marker, and the floor before the nook (a
    // click anywhere there walks back to the entry).
    await at('shelf');await tryClick('entry marker',format+' shelf',p.entryMark,'SHELF_APPROACH');
    {
      await at('shelf');const x=Math.round(w/2),y=Math.round(h*.9),before=await evaluate('sceneCamera.navigation');
      const under=await evaluate(`document.elementFromPoint(${x},${y})?.id`);await click(x,y);await sleep(250);
      const after=await evaluate('sceneCamera.navigation');
      results.push({label:'anywhere (back)',where:format+' shelf',at:[x,y],under,before,after,ok:after==='SHELF_APPROACH'});await evaluate('sceneCamera.stop();true');
    }
    // Every destination can be reached from the entry by something in view.
    for(const [goal,labels] of [['shelf',['shelf marker','study nook']],['chair',['chair marker','chair','table']]])
      results.push({label:goal+' reachable',where:format+' entry',ok:results.some(r=>r.where===format+' entry'&&labels.includes(r.label)&&r.ok)});
    await at('entry');
    const {data}=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(resolve(out,format+'-entry.png'),Buffer.from(data,'base64'));
  }
  await writeFile(resolve(out,'report.json'),JSON.stringify({sourceRoot,results,errors},null,2));
  for(const r of results)console.log(JSON.stringify(r));
  const wrong=results.filter(r=>r.visible!==false&&!r.ok);
  assert.deepEqual(errors,[],'Console errors');
  assert.deepEqual(wrong,[],'Every place clicked leads there');
  console.log('PASS: every marker and object leads to its own place');
}finally{ws?.close();chrome.kill();server.close();if(resolve(profile).startsWith(prefix))await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});}
