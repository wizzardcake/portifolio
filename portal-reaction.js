/* Card-independent impact controller. Coordinates are aperture-local fractions:
   x: left -> right, y: back -> viewer. All timings below are in seconds.
   The original portalImpact() cloth response remains a separate API.
   Await triggerPortalImpact({x:.5,y:.5}, .85) before projecting a page if the
   caller wants to show the whole drop. Nothing here owns card or page state. */
(() => {
  const screen = document.getElementById('screen');
  if (!screen) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const DEFAULTS = Object.freeze({
    orbDropDistance: .46, // fraction of the orb diameter, along table normal: reaches the recessed water
    orbDropSpeed: 1,     // multiplier; default contact after 280 ms
    reboundStrength: .12,
    damping: 5,
    rippleRadius: 1.15, // maximum radius / aperture height
    rippleSpeed: .86,   // aperture heights per second
    rippleAmplitude: 1,
    rippleLifetime: 1.45,
    flareBrightness: .62,
    sparkCount: 9,
    suctionStrength: .65,
    duration: 2.2,
  });
  const limits = {
    orbDropDistance:[0,.7], orbDropSpeed:[.4,3], reboundStrength:[0,.3], damping:[3,12],
    rippleRadius:[.2,2], rippleSpeed:[.2,2], rippleAmplitude:[0,2], rippleLifetime:[.3,3],
    flareBrightness:[0,1.5], sparkCount:[0,18], suctionStrength:[0,1.5], duration:[1,4],
  };
  const settings = {...DEFAULTS};
  const clamp = (v, lo=0, hi=1) => Math.max(lo, Math.min(hi, v));
  const smooth = v => {v=clamp(v);return v*v*(3-2*v);};
  const pulse = (t, start, attack, decay) => smooth((t-start)/attack)*(1-smooth((t-start-attack)/decay));
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const FACE = 'rotateY(calc(var(--view-yaw) * -1)) rotateX(calc(var(--view-pitch) * -1))';
  const colors = ['#76e4d3','#ab90ef','#7fd8dd','#9cf1db','#ad86df','#edb975'];
  const layer = document.createElement('div');
  layer.className='portal-reaction';layer.hidden=true;layer.setAttribute('aria-hidden','true');
  const canvas=document.createElement('canvas');canvas.className='portal-reaction-surface';layer.append(canvas);
  const ctx=canvas.getContext('2d');screen.append(layer);
  let width=1,height=1,ratio=1,raf=0,serial=0,orbHit=null;
  const impacts=[];
  const empty=Object.freeze({orbOffset:0,orbInfluence:0,pull:0,wave:0,radius:0,x:.5,y:.5});
  function measure() {
    width=Math.max(1,screen.clientWidth);height=Math.max(1,screen.clientHeight);
    ratio=Math.min(devicePixelRatio||1,1.5,900/width);
    const w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  }
  new ResizeObserver(measure).observe(screen);measure();
  function element(name) {
    const el=document.createElement('i');el.className='portal-reaction-'+name;layer.append(el);return el;
  }
  function place(el,x,y,z,w,h=w) {
    el.style.width=w+'px';el.style.height=h+'px';
    el.style.transform=`translate3d(${x}px,${y}px,${z}px) translate(-50%,-50%) ${FACE}`;
  }
  function age(hit,now) {return Math.max(0,(now-hit.start)/1000);}
  function contact(hit) {return Math.min(.52,.28/hit.cfg.orbDropSpeed)*hit.cfg.duration/2.2;}
  function state(hit,now) {
    const t=age(hit,now),c=hit.cfg,d=hit.duration,land=contact(hit);
    if(t>=d||hit.still)return {...empty,x:hit.x,y:hit.y};
    const fade=1-smooth((t/d-.76)/.24);
    if(hit.dive)return diveState(hit,t,fade);
    const distance=c.orbDropDistance*(.72+.28*hit.strength);
    let offset;
    if(t<land) {
      // A ballistic fall: increasing velocity, then arrested by the surface.
      const u=t/land;offset=hit.from+(-distance-hit.from)*u*u;
    } else {
      // Damped recovery with zero upward velocity at contact. One restrained
      // overshoot, never a sequence of rubber-ball bounces.
      const u=clamp((t-land)/(d*.83-land));
      const omega=Math.PI+c.reboundStrength*5;
      const response=Math.exp(-c.damping*u)*(Math.cos(omega*u)+c.damping/omega*Math.sin(omega*u));
      offset=-distance*response*(1-smooth((u-.8)/.2));
    }
    const pull=c.suctionStrength*hit.strength*(.22*pulse(t,0,.06,.48)+.45*pulse(t,land*.7,.14,.85))*fade;
    const waveAge=Math.max(0,t-land*.65);
    return {orbOffset:offset,orbInfluence:smooth(t/.07)*(1-smooth((t/d-.65)/.35)),
      x:hit.x,y:hit.y,pull,wave:c.rippleAmplitude*.045*hit.strength*pulse(t,land*.65,.10,c.rippleLifetime)*fade,
      radius:Math.min(c.rippleRadius,waveAge*c.rippleSpeed)*2};
  }
  // A dive (the orb's answer to a card, portal-effects.js): the orb follows
  // its own path down through the surface and back out. The water answers
  // twice, where it goes in and where it bursts back out, and swells just
  // before it does. The orb reads `dive` for its clock; no offset is added.
  function diveState(hit,t,fade) {
    const c=hit.cfg,v=hit.dive,s=hit.strength;
    const pull=c.suctionStrength*s*(.55*pulse(t,v.entry-.04,.1,.4)-.4*pulse(t,v.gone,v.rise-v.gone,.2))*fade;
    const wave=c.rippleAmplitude*.045*s*(pulse(t,v.entry,.08,c.rippleLifetime*.7)+.85*pulse(t,v.rise,.08,c.rippleLifetime*.7))*fade;
    const since=Math.max(0,t<v.rise?t-v.entry:t-v.rise);
    return {orbOffset:0,orbInfluence:smooth(t/.07)*(1-smooth((t-v.settle)/Math.max(.05,hit.duration-v.settle))),
      x:hit.x,y:hit.y,pull,wave,radius:Math.min(c.rippleRadius,since*c.rippleSpeed)*2,
      dive:{...v,t,start:hit.start,strength:s}};
  }
  // Seconds from the start: entry (it meets the water), under (it is below
  // it), gone (lost in the depth), rise (it bursts back out), clear (it leaves
  // the water), settle (back at rest), end. Kept in order, at most 5 s.
  function timeline(v) {
    let last=0;const out={};
    for(const key of ['entry','under','gone','rise','clear','settle','end']) {
      last=Math.max(last,finite(Number(v[key]),last));out[key]=Math.min(5,last);
    }
    return out;
  }
  function sample(now=performance.now()) {
    return orbHit?state(orbHit,now):empty;
  }
  function radial(x,y,r,stops) {
    if(!ctx||r<=0)return;
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    for(const [at,color] of stops)g.addColorStop(at,color);
    ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  function wave(hit,t,delay,gain) {
    const c=hit.cfg,a=t-delay;
    const life=Math.min(c.rippleLifetime,hit.duration-delay);
    if(!ctx||a<=0||a>=life)return;
    const radius=height*(.035+c.rippleSpeed*a);
    if(radius>height*c.rippleRadius)return;
    const edge=1-smooth((radius/height/c.rippleRadius-.8)/.2);
    const alpha=hit.strength*c.rippleAmplitude*gain*smooth(a/.06)*Math.pow(1-a/life,1.1)*edge;
    if(alpha<.001)return;
    const x=hit.x*width,y=hit.y*height;
    const band=height*(.020+.006*a),outer=radius+band*2;
    // A dark trough followed by a broad refractive crest and a thin highlight.
    // This is a wave packet with depth, rather than a uniformly lit outline.
    ctx.globalAlpha=clamp(alpha);
    radial(x,y,outer,[[0,'#06122200'],[clamp((radius-band*2)/outer),'#06122200'],
      [clamp((radius-band)/outer),'#01051099'],[clamp(radius/outer),'#48c9b86b'],
      [clamp((radius+band*.65)/outer),'#b899e735'],[1,'#659ccb00']]);
    ctx.beginPath();
    for(let i=0;i<=120;i++) {
      const angle=i/120*Math.PI*2;
      const bend=Math.sin(angle*5-a*6+hit.id)*band*.09*c.rippleAmplitude;
      const px=x+Math.cos(angle)*(radius+bend),py=y+Math.sin(angle)*(radius+bend);
      if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    }
    const sheen=ctx.createLinearGradient(x-radius,y-radius,x+radius,y+radius);
    sheen.addColorStop(0,'#9aefdd');sheen.addColorStop(.45,'#52b3aa');sheen.addColorStop(1,'#a98ae0');
    // A live WebGL surface ripples the water itself (portal-surface.js); the
    // outline then only glints faintly on the crest instead of drawing it.
    const drawn=window.portalSurface?.water?.live;
    if(drawn)ctx.globalAlpha=clamp(alpha)*.28;
    ctx.strokeStyle=sheen;ctx.lineWidth=(drawn?.8:1.2)+Math.min(1.6,c.rippleAmplitude)*.9;ctx.stroke();
    ctx.globalAlpha=1;
  }
  function paint(hit,now) {
    const t=age(hit,now),c=hit.cfg,s=hit.strength,response=state(hit,now),v=hit.dive;
    // A dive goes in at `entry` and bursts back out at `rise`.
    const land=v?v.entry:contact(hit),burst=v?v.rise:land;
    const x=hit.x*width,y=hit.y*height,tail=1-smooth((t/hit.duration-.75)/.25);
    const flare=hit.still ? pulse(t,0,.09,.3)*s*c.flareBrightness
      : v ? (pulse(t,burst-.03,.09,.45)+.45*pulse(t,land,.07,.3))*s*c.flareBrightness*tail
      : pulse(t,land*.68,.09,.42)*s*c.flareBrightness*tail;
    if(ctx) {
      ctx.globalAlpha=1;
      // The opening briefly becomes a bowl: dark core, violet inner slope,
      // then a faint teal lip. It contracts as the energy is swallowed.
      if(!hit.still) {
        const pull=clamp(response.pull*2.3);
        ctx.globalAlpha=pull;
        const radius=height*(.22-.06*smooth((t-land)/.85));
        radial(x,y,radius,[[0,'#00020af2'],[.42,'#020816cf'],[.70,'#392b5e5c'],[.87,'#579a9540'],[1,'#456f7900']]);
        ctx.globalAlpha=1;
        if(v) {
          wave(hit,t,land-.02,.9);wave(hit,t,land+.2,.4); // going in
          wave(hit,t,burst,.8);wave(hit,t,burst+.22,.35); // bursting back out
        } else {
          wave(hit,t,.015,.40); // immediate disturbance from the arriving object
          wave(hit,t,land*.7,1); // main droplet reaction
          wave(hit,t,land+.18,.55);
          wave(hit,t,land+.47,.25);
        }
      }
      ctx.globalAlpha=clamp(flare*.48);
      radial(x,y,height*.25,[[0,'#83e9d6a3'],[.33,'#67d2c568'],[.65,'#a275db40'],[1,'#856ab200']]);
      ctx.globalAlpha=1;
    }
    if(hit.flare) {
      place(hit.flare,x,y,height*(.025+.04*smooth((t-burst)/.4)),height*.42,height*.29);
      hit.flare.style.opacity=String(clamp(flare));
    }
    for(const spark of hit.sparks) {
      const u=clamp((t-burst-spark.delay)/spark.life),v=Math.pow(u,1.12);
      const gather=c.suctionStrength*smooth((u-.25)/.6);
      const spread=height*spark.spread*Math.sin(Math.PI*v)*(1-gather*.55);
      const z=height*(.009+spark.lift*Math.sin(Math.PI*v)-.16*gather*v*v);
      const px=x+Math.cos(spark.angle)*spread,py=y+Math.sin(spark.angle)*spread;
      place(spark.el,px,py,z,spark.size);
      // Once below the plane the flecks disappear inside the opening, never
      // drawing over its outer rim or the table apron.
      const inside=px>4&&px<width-4&&py>4&&py<height-4;
      spark.el.style.opacity=inside?String(s*smooth(u/.12)*(1-smooth((u-.6)/.4))*(.8+.2*Math.sin(t*19+spark.angle))*tail):'0';
    }
  }
  function finish(hit,completed,reason) {
    if(orbHit===hit)orbHit=null;
    hit.flare?.remove();hit.sparks.forEach(spark=>spark.el.remove());
    hit.resolve({completed,...(reason?{reason}:{})});
  }
  function clear() {
    if(ctx){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);}
  }
  function tick(now) {
    raf=0;
    if(document.hidden){cancel('hidden');return;}
    if((!window.portalMatter?.canReact&&impacts.some(hit=>!hit.detached))||document.body.classList.contains('table-covered')){cancel('not-ready');return;}
    clear();if(ctx)ctx.setTransform(ratio,0,0,ratio,0,0);
    for(let i=impacts.length-1;i>=0;i--) {
      if(age(impacts[i],now)>=impacts[i].duration){finish(impacts[i],true);impacts.splice(i,1);}
    }
    for(const hit of impacts)paint(hit,now);
    layer.hidden=!impacts.length;
    if(impacts.length)raf=requestAnimationFrame(tick);
  }
  function cancel(reason='cancelled') {
    if(raf)cancelAnimationFrame(raf);raf=0;
    for(const hit of impacts)finish(hit,false,reason);
    impacts.length=0;clear();layer.hidden=true;
  }
  // options.dive: the orb's dive timeline (see timeline()). Without it the
  // orb dips to the water and recovers, as before.
  function trigger(position={x:.5,y:.5},intensity=1,options={}) {
    if(!window.portalMatter?.canReact||document.body.classList.contains('table-covered')||document.hidden)
      return Promise.resolve({completed:false,reason:'not-ready'});
    const strength=clamp(finite(intensity,1));
    if(strength===0)return Promise.resolve({completed:true});
    const now=performance.now(),from=sample(now).orbOffset;
    // Bounded overlap: never build an unbounded particle or animation queue.
    if(impacts.length===3)finish(impacts.shift(),false,'superseded');
    const hit={id:++serial,x:clamp(finite(position?.x,.5)),y:clamp(finite(position?.y,.5)),
      strength,start:now,from,cfg:{...settings},still:motion.matches,sparks:[]};
    hit.dive=!hit.still&&options?.dive?timeline(options.dive):null;
    hit.duration=hit.still ? .42 : hit.dive ? hit.dive.end : hit.cfg.duration;
    hit.flare=hit.still?null:element('flare');
    const count=hit.still?0:Math.round(hit.cfg.sparkCount*(.5+.5*strength));
    const burst=hit.dive?hit.dive.rise:contact(hit);
    // Stable distribution for tuning and repeatable captures, no asset loading.
    for(let i=0;i<count;i++) {
      const el=element('spark'),color=colors[i%colors.length],size=1.7+(i%3)*.55;
      el.style.background=color;el.style.boxShadow=`0 0 ${size*2.3}px ${color}`;
      hit.sparks.push({el,size,angle:i*2.39996+hit.id*.5,delay:(i%4)*.028,
        life:Math.min(1.05+(i%3)*.08,hit.duration-burst-.14),spread:.05+(i%4)*.024,lift:.035+(i%3)*.021});
    }
    const done=new Promise(resolve=>{hit.resolve=resolve;});impacts.push(hit);orbHit=hit;layer.hidden=false;measure();
    if(!raf)raf=requestAnimationFrame(tick);
    window.dispatchEvent(new CustomEvent('portal-reaction-start',{detail:{x:hit.x,y:hit.y,intensity:strength,duration:hit.duration,
      ...(hit.dive?{dive:{entry:hit.dive.entry,rise:hit.dive.rise}}:{})}}));
    return done;
  }
  motion.addEventListener('change',()=>cancel('motion-preference'));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel('hidden');});
  window.triggerPortalImpact=trigger;
  window.portalReaction={trigger,cancel,sample,defaults:DEFAULTS,
    // A lifted-off dive finishes its water/sparks after the orb starts opening.
    // Reset, restore, visibility and motion preference still cancel everything.
    releaseOrb() {
      if(!orbHit?.dive)return false;
      orbHit.detached=true;
      for(let i=impacts.length-1;i>=0;i--)if(impacts[i]!==orbHit){finish(impacts[i],false,'orb-transition');impacts.splice(i,1);}
      return true;
    },
    configure(values={}) {
      for(const [key,value] of Object.entries(values))if(limits[key]&&Number.isFinite(value))settings[key]=clamp(value,...limits[key]);
      settings.sparkCount=Math.round(settings.sparkCount);return {...settings};
    },
    get settings(){return {...settings};},
    get active(){return impacts.length>0;},
    get stats(){return {active:impacts.length,sparks:impacts.reduce((n,hit)=>n+hit.sparks.length,0),reducedMotion:motion.matches};},
  };
})();
