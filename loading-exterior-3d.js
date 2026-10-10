/* Exterior lifecycle bridge. The worker owns formation, geometry and camera.
   No room resources are imported or disposed here. Gate readiness is separate. */
export function createLoadingPortal(container,{reducedMotion,onPhase}={}){
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 let reduced=reducedMotion??media.matches,worker=null,canvas=null,fallback=null,disposed=false,live=false;
 let formResolve,readyResolve,flightResolve,observer,startupTimer,killTimer,override=reducedMotion;
 let snapshotResolve=null,drawing=null,phase='core',failed=null,cleanup={worker:false,observer:false,listeners:false};
 const ready=new Promise(r=>readyResolve=r),formation=new Promise(r=>formResolve=r);
 const element=document.createElement('div');
 element.className='loading-exterior loading-living is-shown';element.dataset.view='starting';
 element.dataset.reducedMotion=String(reduced);element.setAttribute('aria-hidden','true');
 element.innerHTML='<div class="loading-living__seed"></div>';
 container.querySelector('.loading-living__seed')?.remove();
 container.append(element);
 const host=container.closest('.loading-gate')||container;
 const emit=(name,detail)=>{onPhase?.(detail);dispatchEvent(new CustomEvent(name,{detail}));};
 const post=data=>worker?.postMessage(data);
 const setPhase=value=>{phase=value.phase;element.dataset.phase=phase;emit('loading-exterior-phase',value);};
 async function fail(reason){
  if(disposed||failed)return;
  failed=String(reason);clearTimeout(startupTimer);worker?.terminate();worker=null;canvas?.remove();canvas=null;live=false;
  element.dataset.view='fallback';
  try{const module=await import('./loading-exterior.js');if(disposed)return;fallback=module.createLoadingPortal(container,{reducedMotion:true});await fallback.ready;}
  catch{ /* The solar core remains if both worker and image delivery fail. */ }
  if(fallback)element.style.display='none';
  readyResolve(false);formResolve({fallback:true});flightResolve?.(false);
  emit('loading-exterior-fallback',{reason:failed});
 }
 function resize(){
  if(!canvas||disposed)return;const r=canvas.getBoundingClientRect();
  post({type:'resize',width:Math.max(1,r.width),height:Math.max(1,r.height),dpr:devicePixelRatio||1});
 }
 const onMedia=()=>{reduced=override??media.matches;element.dataset.reducedMotion=String(reduced);post({type:'still',value:reduced});if(reduced)formResolve({reduced:true});};
 const onVisibility=()=>post({type:document.hidden?'pause':'play'});
 media.addEventListener('change',onMedia);document.addEventListener('visibilitychange',onVisibility);
 const debug={
  get stats(){return{renderer:live?'webgl-worker':'fallback',drawing,phase,failed,disposed,cleanup:{...cleanup}};},
  setRate:value=>post({type:'rate',value}),seek:value=>post({type:'seek',value}),seekFlight:value=>post({type:'seekFlight',value}),
  snapshot:()=>new Promise(resolve=>{snapshotResolve=resolve;post({type:'snapshot'});}),
  pause:()=>post({type:'pause'}),play:()=>post({type:'play'})
 };
 window.loadingExterior3d=debug;
 const api={
  element,ready,formation,doorwayGrowth:0,
  get flies(){return live;},
  get opening(){const r=container.getBoundingClientRect();return fallback?.opening||{x:r.left+r.width/2,y:r.top+r.height*.6,width:r.width*.13,height:r.height*.22};},
  wake(){return ready;},
  fly(){
   if(!live)return Promise.resolve(false);
   return new Promise(resolve=>{flightResolve=resolve;post({type:'fly'});});
  },
  onAperture:null,
  setApproach(value){fallback?.setApproach(value);},
  pause(){post({type:'pause'});fallback?.pause();},
  play(){post({type:'play'});fallback?.play();},
  setReducedMotion(value){override=typeof value==='boolean'?value:undefined;onMedia();},
  get stats(){return debug.stats;},
  dispose(){
   if(disposed)return;disposed=true;clearTimeout(startupTimer);
   observer?.disconnect();cleanup.observer=true;
   media.removeEventListener('change',onMedia);document.removeEventListener('visibilitychange',onVisibility);cleanup.listeners=true;
   if(worker){
    post({type:'dispose'});
    // Termination is a bounded backstop if a stalled GPU cannot acknowledge.
    killTimer=setTimeout(()=>{worker?.terminate();worker=null;cleanup.worker=true;},250);
   }else cleanup.worker=true;
   fallback?.dispose();fallback=null;canvas?.remove();canvas=null;element.remove();
   readyResolve(false);formResolve({disposed:true});flightResolve?.(false);api.onAperture=null;
  }
 };
 try{
  if(typeof Worker!=='function'||typeof OffscreenCanvas!=='function'||!HTMLCanvasElement.prototype.transferControlToOffscreen)throw Error('OffscreenCanvas is unavailable');
  canvas=document.createElement('canvas');canvas.className='loading-exterior__live loading-living__canvas';canvas.setAttribute('aria-hidden','true');host.append(canvas);
  const r=canvas.getBoundingClientRect(),offscreen=canvas.transferControlToOffscreen();
  worker=new Worker(new URL('./loading-living-worker.js',import.meta.url));
  worker.onmessage=({data})=>{
   if(data.type==='disposed'){clearTimeout(killTimer);worker?.terminate();worker=null;cleanup.worker=true;return;}
   if(disposed)return;
   if(data.type==='drawn'){
    clearTimeout(startupTimer);live=true;element.dataset.view='live';element.classList.add('is-live');
    canvas?.classList.add('is-live');element.querySelector('.loading-living__seed')?.remove();readyResolve(true);
   }else if(data.type==='formed'){formResolve(data);}
   else if(data.type==='phase')setPhase(data);
   else if(data.type==='stats')drawing=data;
   else if(data.type==='aperture')api.onAperture?.(data);
   else if(data.type==='snapshot'){snapshotResolve?.(data.blob);snapshotResolve=null;}
   else if(data.type==='flown'){flightResolve?.(true);flightResolve=null;}
   else if(data.type==='failed')fail(data.message);
  };
  worker.onerror=event=>{event.preventDefault();fail(event.message||'Worker failed');};
  worker.postMessage({type:'init',canvas:offscreen,width:r.width,height:r.height,dpr:devicePixelRatio||1,reduced},[offscreen]);
  observer=new ResizeObserver(resize);observer.observe(canvas);
  startupTimer=setTimeout(()=>fail('Worker did not produce its first frame within 12 seconds'),12000);
 }catch(error){fail(error.message);}
 return api;
}

