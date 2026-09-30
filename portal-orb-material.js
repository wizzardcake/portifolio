/* The orb's material and tuning table. Pure: no DOM, no pose, no state.
   portal-effects.js owns the orb (its pose, transitions and reactions) and
   draws it with this shader. Loaded before portal-effects.js. */
(() => {
  const defaults = Object.freeze({
    // Look
    innerGlow: 1,     // light inside: the heart, energy currents and glow pockets
    mist: 1,          // density of the inner mist: its darker, deeper regions
    swirlSpeed: 1,    // turning of the inner layers (they turn at different rates)
    rimLight: 1,      // Fresnel edge light and the room's colour caught at the edge
    highlight: 1,     // the main specular highlight and its soft bloom
    roomLight: 1,     // how strongly the room's green, violet and warm light register
    wobble: .2,       // liquid undulation of the skin; the silhouette stays round
    breathing: 1,     // swell of the heart's glow (and of the water answering it)
    // Idle motion
    bob: 1,           // slow float, about 5 px at 1
    drift: 1,         // slow wander over the water, about 3 px at 1
    // Contact with the water
    contactGlow: 1,   // the orb's light pooled on the water beneath it
    contactShadow: 1, // the water darkened under it
    dimple: 1,        // the water drawn gently up toward it, breathing
    pulseRipple: .12, // faint rings from the heartbeat (0 = none)
    // Reaction to a card falling through the surface: the orb dives through
    // the water as a drop, is lost in the depth, and bursts back out of the
    // surface as a droplet that gathers itself back into the orb.
    squash: 1,        // how strongly it stretches and squashes on the way
    teardrop: .45,    // how far it narrows into a drop's tail (0 = stays round)
    neck: 1,          // thickness of the liquid neck tying the rising drop to the water
    diveSpeed: 1,     // tempo of the whole dive (2 = twice as fast)
    diveDepth: 2.6,   // orb radii it sinks below the surface while it fades
    beat: .2,         // s unseen below the surface before it bursts back out
    emergeSize: .7,   // its size as it breaks back out; it grows to full size
    reboundStretch: .42, // how elongated it shoots back out
    rebound: .6,      // overshoot as it springs back to rest (0 = none)
    arrivalDrop: 1,   // strength of the dive when a card arrives (0 = none)
    arrivalDelay: .12,// s from the card's splash to the orb's fall
    handoff: 0,       // s offset from clear + .08/diveSpeed; bounded before rebound apex
    pageDuration: 1.25, // s travelling/opening into the page (80 ms under reduced motion)
    formBlend: .32,   // s blending the rising droplet's residual shape into the opening
    pageLens: 1,      // how far it spreads into a lens facing the reader as the page opens
  });
  const limits = Object.freeze({
    innerGlow: [0, 2], mist: [0, 2], swirlSpeed: [0, 3], rimLight: [0, 2], highlight: [0, 2],
    roomLight: [0, 2], wobble: [0, 1], breathing: [0, 2], bob: [0, 3], drift: [0, 3],
    contactGlow: [0, 2], contactShadow: [0, 2], dimple: [0, 3], pulseRipple: [0, .5],
    squash: [0, 2], teardrop: [0, .8], neck: [0, 2], diveSpeed: [.5, 2], diveDepth: [1, 5], beat: [0, .8],
    emergeSize: [.4, 1], reboundStretch: [0, .8], rebound: [0, 1.5],
    arrivalDrop: [0, 1], arrivalDelay: [0, .6], handoff: [-.8, 1.5],
    pageDuration: [.6, 2], formBlend: [.15, .5], pageLens: [0, 1],
  });
  const LIGHTS = 7;

  const vertex = `attribute vec2 position; varying vec2 uv;
    void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
  // Shape space is the old liquid frame (cameraRay), so the lobes, the socket
  // dome and the page morph are unchanged. Light is computed in canvas space,
  // where the camera looks down -z; the room's lights arrive there from
  // portal-effects.js. Everything is linear until the final tone map.
  const fragment = `precision highp float;
    varying vec2 uv;
    uniform float time, aspect, fluid, morph, charge, spin, viewYaw, viewPitch;
    uniform vec3 tint;
    uniform float stretch, breath, awake, swirl;
    // A drop's form and its water: tail (+ up, - down), the neck to the water,
    // its size, how much of it is there at all, and where the water stands
    // (along world up from its centre, in the same units as its radius .93).
    uniform float taper, neck, grow, presence, waterline;
    // Opening into a page (0..1): it spreads into a lens facing the reader
    // before the page's corners form.
    uniform float open;
    uniform vec4 look; // inner glow, mist, rim light, highlight
    uniform vec4 feel; // room light, wobble, breathing
    uniform vec3 lightDir[${LIGHTS}], lightCol[${LIGHTS}];
    vec3 viewS, upS;   // toward the eye and world up, in shape space
    vec3 xS, yS, lens; // the canvas's x and y in shape space; the lens's scale

    float noise(vec3 p) {
      return sin(p.x*2.8+sin(p.y*2.1))*sin(p.y*2.4+sin(p.z*2.7))*sin(p.z*2.2+sin(p.x*2.3));
    }
    vec3 cameraRay(vec3 p) {
      float yaw=-viewYaw*fluid*(1.-morph), pitch=-viewPitch*fluid*(1.-morph);
      p=vec3(p.x,cos(pitch)*p.y-sin(pitch)*p.z,sin(pitch)*p.y+cos(pitch)*p.z);
      return vec3(cos(yaw)*p.x+sin(yaw)*p.z,p.y,-sin(yaw)*p.x+cos(yaw)*p.z);
    }
    // Shape space back to canvas space: cameraRay undone.
    vec3 toCanvas(vec3 v) {
      float yaw=-viewYaw*fluid*(1.-morph), pitch=-viewPitch*fluid*(1.-morph);
      v=vec3(cos(yaw)*v.x-sin(yaw)*v.z,v.y,sin(yaw)*v.x+cos(yaw)*v.z);
      return vec3(v.x,cos(pitch)*v.y+sin(pitch)*v.z,-sin(pitch)*v.y+cos(pitch)*v.z);
    }
    // Squash and stretch along world up, keeping the volume.
    vec3 deform(vec3 p) {
      float along=dot(p,upS);
      return (p-upS*along)*sqrt(1.+stretch)+upS*along/(1.+stretch);
    }
    float smin(float a, float b, float k) {
      float h=clamp(.5+.5*(b-a)/k,0.,1.);
      return mix(b,a,h)-k*h*(1.-h);
    }
    float shape(vec3 p) {
      // Where the canvas is: the page faces the reader, and so does the lens
      // the drop spreads into as it opens (wider, a little shorter, flatter).
      vec3 at=vec3(0.), o=p;
      if(open>0.||morph>0.) at=vec3(dot(p,xS),dot(p,yS),dot(p,viewS));
      if(open>0.) o=xS*(at.x/lens.x)+yS*(at.y/lens.y)+viewS*(at.z/lens.z);
      vec3 d=deform(o/grow);
      float c=cos(spin), s=sin(spin);
      vec3 q=vec3(c*d.x+s*d.z,d.y,-s*d.x+c*d.z);
      float liquid=noise(q*1.35+vec3(time*.3,time*-.21,time*.19))*.32;
      liquid+=sin(q.y*4.+time*.6)*.14;
      // The skin undulates where it faces the viewer; the silhouette stays a
      // clean sphere, so no lobe is ever cut by the edge.
      float facing=smoothstep(.2,.65,dot(normalize(d+1e-5),viewS));
      // A drop's form: it narrows upward into a tail while it falls (taper > 0)
      // and downward, toward the water, as it bursts back out (taper < 0).
      float z=dot(d,upS);
      float w=max(.25,1.-abs(taper)*smoothstep(-.35,.93,taper>0.?z:-z));
      float k=min(1./sqrt(1.+abs(stretch)),1.-min(abs(stretch),.6)*.8)*w*min(lens.y,lens.z);
      float sphere=(length((d-upS*z)/w+upS*z)-(.93+fluid*liquid*feel.y*facing))*k*grow;
      // The liquid neck that still ties a rising drop to the water, spread at
      // its foot where the surface is drawn up after it.
      if(neck>.01) {
        float h=dot(p,upS), r=length(p-upS*h);
        float rad=neck*(.07+.2*exp(-(h-waterline)*7.));
        sphere=smin(sphere,max(r-rad,max(waterline-h,h+.25*grow)),.2*neck);
      }
      if(morph<=0.) return sphere;
      vec3 box=abs(at)-vec3(aspect*.9-.07,.83,.045);
      float panel=length(max(box,0.))+min(max(box.x,max(box.y,box.z)),0.)-.07;
      return mix(sphere,panel,morph);
    }
    vec3 spinAbout(vec3 q, vec3 axis, float angle) {
      float c=cos(angle), s=sin(angle);
      return q*c+cross(axis,q)*s+axis*dot(axis,q)*(1.-c);
    }
    // Smooth 3D value noise for the inside, 0..1: its ridges are thin, curved
    // filaments rather than the lattice of planes a product of sines gives.
    float hash3(vec3 p) {
      p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33);
      return fract((p.x+p.y)*p.z);
    }
    float vnoise(vec3 p) {
      vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(mix(hash3(i),hash3(i+vec3(1.,0.,0.)),f.x),mix(hash3(i+vec3(0.,1.,0.)),hash3(i+vec3(1.,1.,0.)),f.x),f.y),
        mix(mix(hash3(i+vec3(0.,0.,1.)),hash3(i+vec3(1.,0.,1.)),f.x),mix(hash3(i+vec3(0.,1.,1.)),hash3(i+vec3(1.,1.,1.)),f.x),f.y),f.z);
    }
    // The room as the orb's skin mirrors it: dark walls, a little warmth
    // overhead, and its lights as soft and sharp lobes.
    vec3 room(vec3 R, vec3 up) {
      vec3 c=mix(vec3(.001,.0012,.002),vec3(.006,.005,.0035),smoothstep(-.2,.8,dot(R,up)));
      for(int i=0;i<5;i++) {
        float d=dot(R,lightDir[i]);
        c+=lightCol[i]*(exp((d-1.)*9.)*.025+exp((d-1.)*120.)*.2);
      }
      return c*feel.x;
    }
    vec3 display(vec3 c) {
      c=1.-exp(-c*1.15);
      return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));
    }

    void main() {
      // Leave breathing room for the liquid lobes so they never hit a square canvas edge.
      vec2 xy=(uv*2.-1.)*vec2(aspect,1.)*(1.+fluid*(1.-morph)*.26);
      // Seated in the socket the silhouette is a dome: a circular top meeting
      // an elliptical rim (the rim is a horizontal circle seen edge-on-ish).
      // It opens out to the full sphere as the ball lifts free (fluid). One
      // smooth distance field, faded out with smoothstep, for clean edges.
      // Free, it follows the squash and stretch of a drop.
      float s=stretch*(1.-morph);
      vec2 m=vec2(xy.x*sqrt(1.+s),xy.y/(1.+s));
      float domeOpen=clamp(fluid*3.,0.,1.);
      float rimS=mix(cos(viewPitch),1.,domeOpen);
      float domeBandT=smoothstep(-.05,.05,m.y);
      float domeRy=mix(.93*rimS,.93,domeBandT);
      float domeDist=length(vec2(m.x/.93,m.y/max(domeRy,.001)));
      float domeAlpha=1.-smoothstep(.965,1.02,domeDist);
      // Free, it may take any form (a tail, a neck, a squash): its own
      // silhouette is traced instead of the socket's dome.
      bool free=fluid>.999;
      if(!free&&domeAlpha<=0.){gl_FragColor=vec4(0.);return;}
      viewS=cameraRay(vec3(0.,0.,1.));
      vec3 up=vec3(0.,sin(viewPitch),cos(viewPitch)); // world up, canvas space
      upS=cameraRay(up);
      xS=cameraRay(vec3(1.,0.,0.)); yS=cameraRay(vec3(0.,1.,0.));
      // Opening, it spreads to .95 of its canvas's width, a little shorter and
      // flatter toward the reader.
      float widest=max(1.,.95*aspect*(1.+fluid*(1.-morph)*.26)/.93);
      lens=vec3(mix(1.,widest,open),1.-.12*open,1.-.35*open);
      vec3 origin=cameraRay(vec3(xy,3.)), direction=-viewS;
      float travel=0., closest=1e3; vec3 p=origin, graze=origin; vec3 n;
      if(fluid<.001 && morph<.001) {
        float depth=max(.93*.93-dot(xy,xy),0.);
        p=vec3(xy,sqrt(depth)); n=normalize(p);
      } else {
        for(int i=0;i<64;i++){
          p=origin+direction*travel;
          float d=shape(p);
          if(d<closest){closest=d;graze=p;}
          if(d<.0015||travel>5.) break;
          travel+=d*.78;
        }
        if(travel>5.){
          // A ray that only grazed a free form keeps a soft one-pixel edge.
          if(!free||closest>.016){gl_FragColor=vec4(0.);return;}
          p=graze;
        }
        float e=.003;
        n=normalize(vec3(shape(p+vec3(e,0.,0.))-shape(p-vec3(e,0.,0.)),
          shape(p+vec3(0.,e,0.))-shape(p-vec3(0.,e,0.)),
          shape(p+vec3(0.,0.,e))-shape(p-vec3(0.,0.,e))));
      }
      vec3 N=toCanvas(n), P=toCanvas(p), V=vec3(0.,0.,1.);
      // Clamped: a face turned exactly to the eye (the page) may round a hair
      // past 1, and pow() of a negative edge is undefined.
      float ndv=clamp(dot(N,V),0.,1.), edge=1.-ndv;
      float fresnel=.04+.96*pow(edge,5.);
      float life=.25+.75*awake;

      // Inside: the view refracts in and crosses a thick, slowly turning
      // volume. Layers turn about world up at different rates; mist absorbs,
      // the heart, the currents and a few glow pockets emit.
      vec3 rd=refract(-V,N,.76);
      if(dot(rd,rd)<.01) rd=-V;
      float b=dot(P,rd), c=dot(P,P)-.93*.93*grow*grow;
      float span=clamp(-b+sqrt(max(b*b-c,0.)),.05,1.9*grow), dt=span/10.;
      vec3 hueA=mix(vec3(.04,.34,.31),tint*.62,.2), hueB=vec3(.24,.12,.50);
      vec3 inner=vec3(0.); float T=1.;
      for(int i=0;i<10;i++){
        vec3 q=P+rd*(float(i)+.5)*dt;
        float r=length(q)/grow;
        vec3 a=spinAbout(q,up,swirl*(1.35-r*.6)+r*1.6);
        vec3 w=spinAbout(q,up,-swirl*.55+2.1);
        float mist=vnoise(a*2.2+vec3(0.,0.,time*.05))*.65+vnoise(w*4.1-vec3(time*.04,0.,0.))*.35;
        float dens=smoothstep(.35,.75,mist)*look.y;
        // Currents run only where a slow, larger field lets them.
        float current=smoothstep(.4,.75,vnoise(w*.9+vec3(-time*.02,.6,time*.015)));
        float vein=pow(1.-abs(vnoise(a*2.4+vec3(1.7,-time*.035,.4))*2.-1.),12.)*current;
        float pocket=smoothstep(.62,.9,vnoise(w*1.25+vec3(time*.03,1.1,-time*.02)));
        float heart=exp(-r*r*7.)*(1.+.6*(breath-.5)*feel.z);
        vec3 hue=mix(hueA,hueB,smoothstep(-.55,.55,a.x+.35*a.y));
        vec3 glow=hue*(dens*.02+vein*.42+pocket*.16)+vec3(.14,.82,.64)*heart*.62;
        inner+=T*glow*dt*look.x*life*(1.+charge*.5);
        T*=exp(-(.5+dens*3.)*dt);
      }
      // What little of the room shows through, refracted and inverted.
      vec3 exitN=normalize(P+rd*span);
      vec3 exitR=refract(rd,-exitN,1.32);
      if(dot(exitR,exitR)<.01) exitR=reflect(rd,-exitN);
      inner+=T*room(exitR,up)*.5;

      // The skin: wrapped diffuse for a soft terminator (the mist just under it
      // scatters the room's light), a sharp highlight with a soft bloom, the
      // room mirrored at grazing angles, and light wrapping around the edge
      // from behind: green from the window side, violet from the stair side.
      vec3 diffuse=vec3(0.), specular=vec3(0.), wrap=vec3(0.);
      // Highlights follow the ball's broad form, not every ripple of its skin,
      // so the main one stays a clean glassy shape.
      vec3 Ns=normalize(mix(N,normalize(P),.65));
      for(int i=0;i<${LIGHTS};i++){
        vec3 L=lightDir[i], C=lightCol[i]*feel.x;
        float wr=max(0.,(dot(N,L)+.4)/1.4);
        diffuse+=C*wr*wr;
        float nh=max(dot(Ns,normalize(L+V)),0.);
        // Highlights keep a little of their light's colour, mostly white. The
        // lamp and the lights behind give a crisp core and a soft halo; the
        // broad fill, the sky and the portal's glow only a soft sheen.
        float crisp=(i==1||i==4||i>4)?0.:1.;
        specular+=mix(C,vec3(dot(C,vec3(.333))),.55)
          *(crisp*(pow(nh,520.)*1.6+pow(nh,70.)*.2)+pow(nh,16.)*(.01+.03*(1.-crisp)));
        // Light from behind wraps only the edge on its own side.
        wrap+=C*pow(edge,4.5)*smoothstep(-.1,.6,dot(N,L))*max(0.,.5-.5*dot(L,V));
      }
      vec3 skin=diffuse*vec3(.002,.0035,.0035)+specular*look.w+room(reflect(-V,N),up)*fresnel+wrap*.55*look.z;
      // The heart's light gathers along the inner edge.
      skin+=mix(vec3(.006,.05,.042),vec3(.035,.016,.075),smoothstep(-.6,.6,N.x))*pow(edge,4.)*look.z*life;
      vec3 orb=display(inner*(1.-fresnel)+skin);

      // The page it becomes keeps the old flat material, which settles into
      // dark glass like the reader's own (portal.css .app-view) as the morph
      // completes, lit along its rim: the HTML page then takes over from
      // something that already looks like it.
      vec3 key=normalize(vec3(-.6,.85,1.4));
      float diffuseOld=max(0.,dot(N,key)), rimOld=pow(edge,2.8);
      float specOld=pow(max(dot(N,normalize(key+V)),0.),38.);
      vec3 qo=p+vec3(spin*.25,0.,time*.035);
      float grain=noise(qo*26.)*.025, veinOld=pow(1.-abs(sin(noise(qo*2.7)*11.+qo.y*3.)),16.);
      vec3 base=mix(vec3(.10,.17,.16),tint,.22+charge*.13);
      vec3 panel=base*(.38+diffuseOld*.95)+grain+vec3(.69,.76,.65)*specOld*.66
        +tint*(rimOld*.52+veinOld*(.06+charge*.13))+vec3(.40,.26,.11)*pow(max(0.,dot(N,normalize(vec3(1.,-.4,.3)))),7.)*.22;
      panel*=1.-morph*.22;
      float glassy=smoothstep(.3,.95,morph);
      vec3 glass=mix(vec3(.055,.085,.082),tint*.22,.25)*(.75+.45*diffuseOld)+grain*.5
        +tint*rimOld*.3+vec3(.69,.76,.65)*specOld*.12;
      panel=mix(panel,glass,glassy);
      // The orb's own light stays with it well into the unfolding.
      vec3 color=mix(orb,panel,smoothstep(.2,.9,morph));
      float alpha=free?1.-smoothstep(.002,.016,closest):domeAlpha;
      alpha*=1.-.25*glassy*(1.-rimOld);
      // Below the waterline it is seen through the water: dimmer and bluer,
      // keeping some of its own glow, fading with depth as the drop sinks
      // into the abyss or rises from it.
      float under=waterline-dot(P,up);
      if(under>0.){
        color=mix(color,color*vec3(.3,.62,.68)+vec3(.004,.02,.026),1.-exp(-under*2.2));
        alpha*=exp(-under*.8);
      }
      gl_FragColor=vec4(color,alpha*presence);
    }`;
  window.portalOrbMaterial = Object.freeze({defaults, limits, LIGHTS, vertex, fragment});
})();
