/* Pure interior material/projection helpers. No ownership of the portal's
   liquid surface, orb, lights, camera, or interactions. Loaded after
   portal-surface.js, whose water slope field the depths are seen through,
   and before depth.js. */
(() => {
  const defaults=Object.freeze({wallDepth:.075,waterLevel:.36,fogDensity:.85,centralDarkness:.88,
    parallaxStrength:1,particleDepthSpeed:1,inwardPull:.35,swirlAmount:.25,deepGlowIntensity:.65});
  const limits=Object.freeze({wallDepth:[.025,.14],waterLevel:[0,.8],fogDensity:[0,1.8],centralDarkness:[0,1],
    parallaxStrength:[0,2],particleDepthSpeed:[0,3],inwardPull:[0,1],swirlAmount:[0,1],deepGlowIntensity:[0,1.5]});
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  // Lattice periods of the phases portal-depth.js wraps; the shader's noise
  // repeats on exactly these, so a wrapped phase never shows a seam.
  const periods=Object.freeze({flow:8,nearTurns:9,deepTurns:16});
  const MOTES=24;

  // One camera-facing plane lies just below the physical lining. The ray from
  // the eye through each (slightly bled) aperture corner meets it at least
  // `clearance` below the tabletop, and the plane is clipped to exactly those
  // rays. Clip it locally, never its preserve-3d parent. It does not move:
  // parallax and drift happen in the shader, so no frame restyles the DOM.
  function project(plane,width,height,camera,clearance,bleed,boundary) {
    const pitch=camera.camera.pitch*Math.PI/180,s=Math.sin(pitch),c=Math.cos(pitch);
    const ey=camera.localEyeY,ez=camera.localEyeZ,T=1+clearance/ez;
    const hw=width/2*(1+bleed),hh=height/2*(1+bleed),k=5*(1+bleed);
    // The back corners' rays meet a camera-facing plane highest; solve for them.
    const depth=(T*(s*(ey+hh)+c*ez)-s*ey-c*ez)*ez/(s*ey+c*ez);
    const cy=-depth*ey/ez,cz=-depth;
    const corners=boundary||[[-hw+k,-hh],[hw-k,-hh],[hw,-hh+k],[hw,hh-k],[hw-k,hh],[-hw+k,hh],[-hw,hh-k],[-hw,-hh+k]];
    let maxZ=-Infinity;
    const points=corners.map(([qx,qy])=>{
      const t=(s*(cy-ey)+c*(cz-ez))/(s*(qy-ey)-c*ez);
      const py=ey+t*(qy-ey)-cy,pz=ez*(1-t)-cz;
      maxZ=Math.max(maxZ,ez*(1-t));return [t*qx,py*c-pz*s];
    });
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    const left=Math.min(...xs)-1,top=Math.min(...ys)-1;
    const w=Math.ceil(Math.max(...xs)+1-left),h=Math.ceil(Math.max(...ys)+1-top);
    // Centre the element on the clip's bounding box, not on the ray axis.
    const ox=left+w/2,oy=top+h/2;
    Object.assign(plane,{width:w,height:h,depth,maxZ,s,c,cx:ox,cy:cy+oy*c,cz:cz-oy*s});
    const style=plane.element.style;
    style.width=w+'px';style.height=h+'px';
    style.clipPath='polygon('+points.map(([px,py])=>
      `${((px-left)/w*100).toFixed(3)}% ${((py-top)/h*100).toFixed(3)}%`).join(',')+')';
    style.setProperty('--layer-x',plane.cx+'px');
    style.setProperty('--layer-y',plane.cy+'px');
    style.setProperty('--layer-z',plane.cz+'px');
  }
  // Where the eye ray to a tunnel-space point crosses the plane, in the
  // plane's own (screen-aligned) coordinates.
  function toLocal(plane,camera,x,y,z) {
    const {s,c}=plane,ey=camera.localEyeY,ez=camera.localEyeZ;
    const t=(s*(plane.cy-ey)+c*(plane.cz-ez))/(s*(y-ey)+c*(z-ez));
    const px=t*x-plane.cx,py=ey+t*(y-ey)-plane.cy,pz=ez+t*(z-ez)-plane.cz;
    return [px,py*c-pz*s];
  }

  const vertex=`attribute vec2 position;varying vec2 uv;
    void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
  // The surface's slope field (waterSlope); without a surface the water is still.
  const water=window.portalSurface?.glsl||'vec2 waterSlope(vec2 p){return vec2(0.);}';
  // Six optical layers, back to front, in one opaque pass: an unlit throat,
  // two star fields, deep spiral energy with glow pockets, dark mist, motes
  // and the near mist lapping at the lining. Mist lies in horizontal sheets,
  // so it is foreshortened like the opening; points stay round on screen.
  // All of it is seen through the water: its slope displaces each layer in
  // proportion to that layer's depth.
  const fragment=`precision highp float;
    varying vec2 uv;
    uniform float time,fogDensity,centralDarkness,swirlAmount,deepGlowIntensity;
    uniform vec4 phase;
    uniform vec2 planeSize,apertureSize,eye,basis,impactPoint;
    uniform vec3 planeCenter;
    uniform vec2 offset[6];
    uniform vec4 starShift,apToLocal;
    uniform float pixel;
    uniform vec4 motes[${MOTES}];
    uniform float impactPull,impactWave,impactRadius;
    uniform float waterDepth,refraction,glowBreath;
    ${water}
    const float TAU=6.2831853;
    float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
    float pnoise(vec2 p,vec2 period){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      vec2 a=mod(i,period),b=mod(i+1.,period);
      return mix(mix(hash(a),hash(vec2(b.x,a.y)),f.x),mix(hash(vec2(a.x,b.y)),hash(b),f.x),f.y);}
    float pfbm(vec2 p,vec2 period){float n=0.,w=.5;
      for(int i=0;i<4;i++){n+=w*pnoise(p,period);p=p*2.+vec2(5.3,1.7);period*=2.;w*=.5;}
      return n*1.0667;}
    // Log-polar lattice around the throat: features drift inward along +x,
    // shrinking as they go, and twist into a faint spiral.
    vec2 spiral(vec2 s,float radial,float turns,float twist){
      float lr=log(max(length(s),.002));
      return vec2(lr*radial,atan(s.y,s.x+1e-6)*turns/TAU+twist*lr);}
    float stars(vec2 p,float cell,float density,float seed){
      vec2 id=floor(p/cell);float h=hash(id+seed);
      if(h>density)return 0.;
      vec2 d=(p-(id+.2+.6*vec2(hash(id+seed+1.7),hash(id+seed+4.3)))*cell)/pixel;
      return exp(-dot(d,d)*1.1)*(.3+.7*hash(id+seed+9.1))*(.6+.4*sin(time*(.35+h)+h*71.));}
    void main(){
      vec2 local=(vec2(uv.x,1.-uv.y)-.5)*planeSize;
      vec3 p3=planeCenter+vec3(local.x,local.y*basis.y,-local.y*basis.x);
      float ray=eye.y/max(.001,eye.y-p3.z);
      // -1..1 across the opening seen through this pixel; +y toward the viewer.
      vec2 ap=vec2(p3.x*ray,eye.x+(p3.y-eye.x)*ray)/apertureSize*2.;
      float aspect=apertureSize.x/apertureSize.y;
      // Seen through the moving water: where this pixel's ray crosses the
      // surface, the slope there displaces everything below it, each layer by
      // its depth (in aperture heights, eased so the far layers sway rather
      // than swim). The same field shades the surface (portal-surface.js).
      vec2 bend=vec2(0.);
      if(refraction>0.){
        float sw=(eye.y+waterDepth)/max(.001,eye.y-p3.z);
        vec2 s=waterSlope(vec2(p3.x*sw,-(eye.x+(p3.y-eye.x)*sw))/apertureSize.y);
        bend=vec2(2.*s.x/aspect,-2.*s.y)*refraction;
      }
      vec2 bendLocal=apToLocal.xy*bend.x+apToLocal.zw*bend.y;
      // A dropped orb bends and darkens the volume locally (portal-reaction.js),
      // measured alike along both axes so its rings stay round like the water's.
      vec2 delta=(ap-impactPoint)*vec2(aspect,1.);float hit=length(delta),crest=hit-impactRadius;
      ap+=delta/max(hit,.001)*(impactPull*.3*exp(-hit*hit*1.8)+sin(crest*24.)*exp(-crest*crest*8.)*impactWave*.6)/vec2(aspect,1.);
      // The throat follows the opening's shape; the front of the opening looks
      // steeply down into it, the back sees the mist below the lining.
      vec2 centre=vec2(0.,.08);
      float rT=length((ap+bend*2.06-centre-offset[0])*vec2(.92,1.));
      float back=smoothstep(.95,-1.,ap.y);
      vec3 col=mix(vec3(.0008,.0012,.004),vec3(.004,.009,.017),smoothstep(.2,1.25,rT));
      float hollow=smoothstep(.22,.7,rT);
      col+=vec3(.46,.54,.70)*stars(local+bendLocal*1.75-starShift.xy,pixel*24.,.11,3.)*.42*hollow;
      col+=vec3(.60,.68,.86)*stars(local+bendLocal*1.29-starShift.zw,pixel*40.,.1,11.)*.7*hollow;
      vec3 teal=vec3(.035,.20,.185),violet=vec3(.165,.065,.28);
      // Deep energy: tangential streaks that spiral slowly into the throat,
      // brightest in a loose ring around it. Hue follows the arms; the glow
      // pockets breathe with the water above them.
      vec2 sD=(ap+bend*.7-centre-offset[3])*vec2(aspect*.8,1.);
      vec2 lpD=spiral(sD,4.,16.,-.5-2.*swirlAmount)+phase.zw;
      float e=pfbm(lpD,vec2(8.,16.));
      float pockets=smoothstep(.58,.88,pnoise(lpD*.5+vec2(2.1*sin(time*.019),1.6*cos(time*.023)),vec2(4.,8.)));
      float energy=smoothstep(.44,.8,e)*smoothstep(.18,.48,rT)*(1.-.6*smoothstep(.6,1.25,rT));
      float arm=.5+.5*sin(lpD.y*TAU/16.*2.+ap.x*1.2);
      vec3 deepHue=mix(teal,violet,clamp(arm*.7+smoothstep(-1.,1.,ap.x)*.45-.1,0.,1.))*(.45+1.5*pockets*deepGlowIntensity*glowBreath);
      col=mix(col,deepHue,clamp(energy*.62*fogDensity,0.,.95));
      float dark=smoothstep(.36,.72,pfbm((ap+bend*.43-offset[4])*vec2(aspect,1.)*2.2+3.1,vec2(256.)));
      col*=1.-dark*.65*smoothstep(.25,.85,rT)*centralDarkness;
      for(int i=0;i<${MOTES};i++){
        vec4 m=motes[i];
        if(m.w<=0.)continue;
        vec2 d=local+bendLocal*.8-m.xy;float q=dot(d,d)/(m.z*m.z);
        if(q>40.)continue;
        col+=(m.z<0.?vec3(.52,.45,.86):vec3(.38,.80,.73))*m.w*(exp(-q)+.14*exp(-q*.12));
      }
      vec2 apN=ap+bend*.25;
      vec2 sN=(apN-centre-offset[5])*vec2(aspect*.9,1.);
      vec2 lpN=spiral(sN,2.4,9.,-.25-1.2*swirlAmount)+phase.xy;
      float n=pfbm(lpN,vec2(8.,9.));
      vec2 edge=abs(apN-offset[5]*.5);
      float lining=pow(pow(edge.x,5.)+pow(edge.y,5.),.2);
      float band=smoothstep(.5,1.02,lining)*mix(.3,1.,back)*(.4+.6*smoothstep(.45,1.,rT));
      float mist=smoothstep(.42,.84,n)*band;
      vec3 lit=mix(vec3(.065,.25,.235),vec3(.20,.105,.31),smoothstep(-.9,.9,ap.x+.5*sin(lpN.y*TAU/9.*2.)))*(.45+.4*n);
      col=mix(col,lit,clamp(mist*.5*fogDensity,0.,.9));
      float core=1.-smoothstep(.1,.8,rT);
      col*=1.-centralDarkness*.97*core*(2.-core);
      col*=1.-impactPull*.6*exp(-hit*hit*2.);
      vec3 exposed=1.-exp(-col*1.15);
      gl_FragColor=vec4(mix(exposed*12.92,1.055*pow(exposed,vec3(1./2.4))-.055,step(vec3(.0031308),exposed)),1.);
    }`;
  window.portalDepthVolume=Object.freeze({defaults,limits,clamp,periods,MOTES,project,toLocal,vertex,fragment});
})();
