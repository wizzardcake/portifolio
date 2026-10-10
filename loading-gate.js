/* Loading gate: room readiness AND completed exterior formation.
   The interior is inert until entry finishes. The exterior never determines
   readiness, and failures/timeouts never expose an unpainted room.
   Existing site-entering / site-unveiling / site-entered events are preserved. */
const gate=document.getElementById('loadingGate'),media=matchMedia('(prefers-reduced-motion: reduce)');
const stats={state:'loading',portal:null,way:null,veiled:true,portalAt:null,readyAt:null,formationAt:null,unveiledAt:null,enteredAt:null,ready:null,frames:[],phases:[]};
let siblings=[],portal=null,canEnter=false,slow,recording=false;
const blockedEvents=['pointerdown','pointerup','pointermove','click','wheel','keydown'];
function blockRoomInput(event){
 if(event.target?.closest?.('.loading-gate__enter'))return;
 event.stopImmediatePropagation();
 if(!(event.type==='keydown'&&event.key==='Tab')&&event.cancelable)event.preventDefault();
}
if(gate)blockedEvents.forEach(type=>addEventListener(type,blockRoomInput,{capture:true,passive:false}));

window.loadingGate={get state(){return stats.state;},get veiled(){return stats.veiled;},get stats(){return{...stats,frames:[...stats.frames],phases:[...stats.phases]};}};
const parsed=()=>document.readyState==='loading'?new Promise(r=>document.addEventListener('readystatechange',r,{once:true})):Promise.resolve();
const painted=()=>!!document.querySelector('#roomShell.is-ready,#roomShell.room-fallback');
async function awaitPaintedRoom(){
 if(!painted())await new Promise(resolve=>{
  const observer=new MutationObserver(()=>{if(painted()){observer.disconnect();resolve();}});
  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
 });
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
}
function unveil(){
 if(!stats.veiled)return;stats.veiled=false;stats.unveiledAt=Math.round(performance.now());dispatchEvent(new Event('site-unveiling'));
}
function open(detail){
 if(!canEnter)return;
 blockedEvents.forEach(type=>removeEventListener(type,blockRoomInput,true));
 unveil();stats.exterior=portal?.stats;portal?.dispose();gate?.remove();
 siblings.forEach(([el,inert])=>{el.inert=inert;});
 // The main is statically inert to protect the first parsed frame.
 const experience=document.getElementById('experience');if(experience)experience.inert=false;
 stats.state='entered';stats.enteredAt=Math.round(performance.now());document.documentElement.dataset.siteEntered='yes';
 dispatchEvent(new CustomEvent('site-entered',{detail:{...detail,enteredAt:stats.enteredAt}}));
}
function notePhase(event){
 stats.phases.push({phase:event.detail.phase,at:Math.round(performance.now())});
 if(stats.phases.length>30)stats.phases.shift();
 if(event.detail.phase==='curtains')unveil();
}
if(gate){
 const mount=gate.querySelector('.loading-gate__portal'),status=gate.querySelector('.loading-gate__status'),retry=gate.querySelector('.loading-gate__enter');
 const retryLoading=()=>location.reload();
 retry?.addEventListener('click',retryLoading);
 const offer=(message='Rommet bruker litt ekstra tid. Du kan vente eller prøve igjen.')=>{
  if(retry){retry.textContent='Prøv igjen';retry.hidden=false;}
  if(status){status.textContent=message;status.classList.add('is-visible');}
 };
 const backdrop=document.createElement('div');backdrop.className='loading-gate__backdrop';gate.prepend(backdrop);
 addEventListener('loading-exterior-phase',notePhase);
 let detail;
 try{
  slow=setTimeout(()=>offer(),16000);
  await new Promise(r=>requestAnimationFrame(()=>setTimeout(r)));
  try{
   const module=await import(new URL(mount.dataset.portal,document.baseURI));
   portal=module.createLoadingPortal(mount);
  }catch(error){
   const seed=document.createElement('div');seed.className='loading-living__seed';mount.append(seed);
   stats.portalFailure=error.message;
  }
  stats.portal=portal?'loading-portal':'orb';stats.portalAt=Math.round(performance.now());
  const formed=Promise.resolve(portal?.formation).then(()=>{stats.formationAt=Math.round(performance.now());});
  await parsed();
  siblings=[...document.body.children].filter(el=>el!==gate&&el.tagName!=='SCRIPT').map(el=>[el,el.inert]);
  siblings.forEach(([el])=>{el.inert=true;});
  const room=(async()=>{
   if(!window.siteReady)throw Error('The readiness coordinator is unavailable');
   const result=await window.siteReady;
   // siteReady can be degraded by an unrelated error. Still require a drawn room.
   await awaitPaintedRoom();
   stats.ready=result.state;stats.readyAt=Math.round(performance.now());
   return result;
  })();
  [detail]=await Promise.all([room,formed]);
  clearTimeout(slow);canEnter=true;
  retry.hidden=true;status?.classList.remove('is-visible');
  gate.setAttribute('aria-busy','false');gate.classList.add('is-going','is-ready');
  if(status)status.textContent='Rommet er klart. Vi går inn.';
  stats.state='entering';
  dispatchEvent(new CustomEvent('site-entering',{detail}));
  recording=true;
  let previous;
  function sample(now){if(!recording)return;if(previous!==undefined&&stats.frames.length<1500)stats.frames.push(+(now-previous).toFixed(1));previous=now;requestAnimationFrame(sample);}
  requestAnimationFrame(sample);
  const fade=async(duration)=>{unveil();await gate.animate([{opacity:1},{opacity:0}],{duration,easing:'ease-in-out',fill:'forwards'}).finished;};
  if(media.matches){
   stats.way='fade';await fade(450);
  }else if(portal?.flies){
   stats.way='flight';
   portal.onAperture=({points,covered,fade:amount})=>{
    unveil();gate.classList.add('is-revealing');
    // An even-odd cut in the original background, aligned to the real 3D arch.
    // The unchanged, prepared room is behind it; curtains are still drawn in front.
    const outer='M 0 0 H '+innerWidth+' V '+innerHeight+' H 0 Z ';
    const hole=points?'M '+points.map(p=>p.join(' ')).join(' L ')+' Z':'';
    gate.style.setProperty('--gate-aperture',covered?'inset(100%)':'path(evenodd, "'+outer+hole+'")');
    if(amount>0)gate.style.opacity=String(1-amount);
   };
   const change=()=>{if(media.matches){portal.setReducedMotion(true);portal.dispose();}};
   media.addEventListener('change',change);
   let flown;
   try{flown=await portal.fly();}finally{media.removeEventListener('change',change);}
   if(!flown||media.matches)await fade(450);
  }else{
   stats.way='fade-fallback';await fade(700);
  }
 }catch(error){
  stats.failure=error?.message||String(error);
  if(canEnter){unveil();await gate.animate([{opacity:1},{opacity:0}],{duration:450,fill:'forwards'}).finished;}
  else offer('Rommet kunne ikke klargjøres. Prøv å laste siden på nytt.');
 }finally{
  recording=false;clearTimeout(slow);removeEventListener('loading-exterior-phase',notePhase);
  if(canEnter){retry?.removeEventListener('click',retryLoading);open(detail);}
 }
}

