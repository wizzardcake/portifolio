import * as THREE from './vendor/three/three.module.js';

// Metres, +Y up, +Z front. Every factory owns its resources, never its host's
// renderer, camera, lights or animation loop. time/delta are in seconds.
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;

function randomSource(seed) {
  return () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
}

function artifact(name, options) {
  const group = new THREE.Group();
  group.name = name;
  const resources = new Set();
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let hover = 0, target = 0, dead = false, elapsed = 0;
  const own = resource => (resources.add(resource), resource);
  const mesh = (geometry, material, parent = group) => {
    own(geometry); own(material);
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  };
  const material = settings => own(new THREE.MeshStandardMaterial(settings));
  const still = () => typeof options.reducedMotion === 'function' ? !!options.reducedMotion()
    : options.reducedMotion ?? media?.matches ?? false;
  return {
    group, own, mesh, material, still,
    step(time, delta) {
      if (dead) return null;
      const dt = Number.isFinite(delta) ? clamp(delta, 0, .1) : 0;
      const reduced = still();
      // Keep a local clock so changing OS motion preference does not jump phase.
      if (!reduced) elapsed += dt;
      hover += (target - hover) * (1 - Math.exp(-dt * (reduced ? 14 : 6)));
      if (Math.abs(target - hover) < .0001) hover = target;
      // awake: the hover as asked for, before easing (Figma times its own).
      return {t: elapsed, dt, hover, awake: target === 1, reduced};
    },
    setHover(value) { if (!dead) target = value ? 1 : 0; },
    dispose() {
      if (dead) return;
      dead = true;
      group.removeFromParent();
      resources.forEach(resource => resource.dispose());
      resources.clear();
      group.clear();
    },
  };
}

// Merge static details by material; the many bands, studs and feet cost one
// draw call per finish, not one per ornament. Takes ownership of inputs.
function merged(parts) {
  const arrays = {position: [], normal: [], uv: []};
  for (const original of parts) {
    const g = original.index ? original.toNonIndexed() : original;
    for (const key of Object.keys(arrays)) arrays[key].push(g.attributes[key].array);
    if (g !== original) g.dispose();
    original.dispose();
  }
  const result = new THREE.BufferGeometry();
  for (const [key, chunks] of Object.entries(arrays)) {
    const data = new Float32Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    result.setAttribute(key, new THREE.BufferAttribute(data, key === 'uv' ? 2 : 3));
  }
  result.computeBoundingSphere();
  return result;
}

function tube(points, radius = .002, segments = 12) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, radius, 5, false);
}

function roundedShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y); s.closePath();
  return s;
}

function bevel(shape, depth, amount = .003, bevelSegments = 3, curveSegments = 18) {
  return new THREE.ExtrudeGeometry(shape, {depth, steps: 1, bevelEnabled: true,
    bevelThickness: amount, bevelSize: amount, bevelSegments, curveSegments}).translate(0, 0, -depth / 2);
}

// A turned piece whose finishes change along its profile: one lathe, one
// material, one draw call. Each profile segment k (point k to k+1) gets the
// finish paint(k) returns; finish = {color, rough, metal, grain}: grain is
// 'speckle' (stone), 'turned' (fine lathe lines in metal) or none, and only
// grained finishes take bump, so flat ones stay clean where the lathe fans
// in to its centre. ticks: {segment, count, finish} adds short radial marks
// across that segment. A finish with glow (a colour) lights from within:
// from the glow the segment before ended on (or none) to that colour at its
// end, so glowing segments run on as one gradient.
// The lathe's v runs by point index, so the texture is laid out per segment.
function turned(a, profile, radial, paint, ticks) {
  const n = profile.length - 1, width = 512, row = 8, height = n * row;
  const color = document.createElement('canvas'), orm = document.createElement('canvas');
  color.width = orm.width = width; color.height = orm.height = height;
  const c = color.getContext('2d'), o = orm.getContext('2d'), rnd = randomSource(4271 + n);
  const fill = (ctx, style, x, y, w, h) => { ctx.fillStyle = style; ctx.fillRect(x, y, w, h); };
  // Canvas rows run top-down; texture v runs bottom-up (flipY).
  const rowOf = k => height - (k + 1) * row;
  let glow = null, lit = '#000';
  for (let k = 0; k < n; k++) {
    const f = paint(k), y = rowOf(k);
    if (f.glow) {
      if (!glow) {
        glow = document.createElement('canvas'); glow.width = 4; glow.height = height;
        fill(glow.getContext('2d'), '#000', 0, 0, 4, height);
      }
      const g = glow.getContext('2d'), rise = g.createLinearGradient(0, y + row, 0, y);
      rise.addColorStop(0, lit); rise.addColorStop(1, f.glow);
      fill(g, rise, 0, y, 4, row);
    }
    lit = f.glow || '#000';
    fill(c, f.color, 0, y, width, row);
    // roughness in G, metalness in B, as three.js reads them
    fill(o, `rgb(0,${Math.round(f.rough * 255)},${Math.round(f.metal * 255)})`, 0, y, width, row);
    if (f.grain === 'speckle') for (let i = 0; i < 1400; i++)
      fill(c, `rgba(${rnd() < .5 ? '20,18,14' : '235,228,214'},${.05 + rnd() * .12})`, rnd() * width, y + rnd() * row, 1, 1);
    if (f.grain === 'turned') for (let i = 0; i < 10; i++)
      fill(c, `rgba(${rnd() < .5 ? '40,26,12' : '255,226,170'},${.06 + rnd() * .1})`, 0, y + rnd() * row, width, 1);
  }
  if (ticks) {
    const y = rowOf(ticks.segment), f = ticks.finish;
    for (let i = 0; i < ticks.count; i++) {
      const x = (i + .5) / ticks.count * width - 1;
      fill(c, f.color, x, y + 1, 2, row - 2);
      fill(o, `rgb(0,${Math.round(f.rough * 255)},${Math.round(f.metal * 255)})`, x, y + 1, 2, row - 2);
    }
  }
  const map = a.own(new THREE.CanvasTexture(color)), ormMap = a.own(new THREE.CanvasTexture(orm));
  map.colorSpace = THREE.SRGBColorSpace;
  const emissiveMap = glow && a.own(new THREE.CanvasTexture(glow));
  if (emissiveMap) emissiveMap.colorSpace = THREE.SRGBColorSpace;
  const material = a.material({map, roughnessMap: ormMap, metalnessMap: ormMap, bumpMap: map, bumpScale: .0008,
    roughness: 1, metalness: 1, ...(emissiveMap ? {emissiveMap, emissive: '#ffffff'} : {})});
  return a.mesh(new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(...p)), radial), material);
}

// One inlay's slab: flat faces and a rounded bevel. Normals are smoothed
// round the bevel and the curves but stay crisp at sharp corners, and the
// bevel's first ring keeps the face's own normal, so there is no seam.
// The attribute cap marks face triangles (1) apart from bevel and sides (0).
// A face's own (x, y) is its shape coordinate; the enamel shader works there.
function enamelGeometry(shape, depth = .012, edge = .004) {
  // Full arcs can end a few floating-point ulps from their first point.
  // Remove that microscopic edge before extrusion, or the bevel spikes at
  // the seam (especially visible on the blue disk in an oblique view).
  const contour=[];
  for(const point of shape.getPoints(8))if(!contour.length||point.distanceToSquared(contour[contour.length-1])>1e-14)contour.push(point);
  if(contour[0].distanceToSquared(contour[contour.length-1])<1e-14)contour.pop();
  shape=new THREE.Shape(contour);shape.closePath();
  const g=bevel(shape,depth,edge,2),p=g.attributes.position,face=depth/2+edge-1e-6;
  g.deleteAttribute('uv');
  const cap=new Float32Array(p.count);
  for(let i=0;i<p.count;i+=3)
    if(Math.abs(p.getZ(i))>face&&p.getZ(i)===p.getZ(i+1)&&p.getZ(i)===p.getZ(i+2))cap[i]=cap[i+1]=cap[i+2]=1;
  g.setAttribute('cap',new THREE.BufferAttribute(cap,1));
  // Non-indexed, so this gives every vertex its own face's normal. Then
  // average across faces that meet at a vertex within 60 degrees.
  g.computeVertexNormals();
  const n=g.attributes.normal,faces=Array.from({length:p.count},(_,i)=>new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)));
  const shared=new Map(),key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(',');
  for(let i=0;i<p.count;i++){const k=key(i);if(!shared.has(k))shared.set(k,[]);shared.get(k).push(i);}
  const sum=new THREE.Vector3();
  for(let i=0;i<p.count;i++){
    if(Math.abs(p.getZ(i))>face)sum.set(0,0,Math.sign(p.getZ(i)));
    else{sum.set(0,0,0);for(const j of shared.get(key(i)))if(faces[i].dot(faces[j])>.5)sum.add(faces[j]);sum.normalize();}
    n.setXYZ(i,sum.x,sum.y,sum.z);
  }
  return g;
}

// Champlevé: a bronze blank whose face holds a cell of fired glass, worked
// out in the shader from the face's own (x, y). The distance to the outline
// gives the bronze lip, the meniscus where the glass meets it, a slight
// dome, and the colour's depth (thin glass by the lip is paler). Noise gives
// orange peel, a little mottling and the odd fired-in speck. settings: kind
// (0 circle, 1 left, 2 right, 3 lower), seed, slot (where the piece sits in
// the logo); shared: gleam (-1 off, 0..1 a light crossing the logo), bronze.
const ENAMEL = `#define LIP .0013
uniform float uKind; uniform float uSeed; uniform vec2 uSlot; uniform float uGleam; uniform vec3 uBronze;
varying float vCap; varying vec2 vFace; varying vec3 vAxisX; varying vec3 vAxisY;
float enHash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float enNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(enHash(i),enHash(i+vec2(1,0)),f.x),mix(enHash(i+vec2(0,1)),enHash(i+vec2(1,1)),f.x),f.y);}
// Inside, a soft maximum rounds the cell's inner corners, as an etched cell's
// are, and keeps a crease off the diagonals.
float enBox(vec2 p,vec2 c,vec2 h){vec2 d=abs(p-c)-h;
  return length(max(d,0.))+min(.0018*log(exp(d.x/.0018)+exp(d.y/.0018)),0.);}
// Signed distance to the piece's outline, metres: a disc, unioned with the
// square that makes it a D (flat side right or left) or the lower piece.
float enOutline(vec2 p){
  float r=.031,disc=length(p)-r;
  if(uKind<.5)return disc;
  if(uKind<1.5)return min(disc,enBox(p,vec2(r*.5,0.),vec2(r*.5,r)));
  if(uKind<2.5)return min(disc,enBox(p,vec2(-r*.5,0.),vec2(r*.5,r)));
  return min(disc,enBox(p,vec2(0.,r*.5),vec2(r,r*.5)));
}
// The glass's height over the lip, metres: it rounds up from the lip, then
// rises in a shallow cabochon about the disc's centre (one smooth bowl, where
// a dome from the outline would crease along the shape's inner ridges), so
// a lamp shows as a highlight, not a whole bright face. A slow swell and
// fine orange peel break the highlights up.
float enSurface(vec2 p){
  float inset=-enOutline(p),bowl=-2.*dot(p,p);
  if(inset<LIP)return bowl;
  float rise=.0011*smoothstep(LIP,LIP+.006,inset);
  float meniscus=-.00022*exp(-pow((inset-LIP-.0006)/.0005,2.));
  float swell=.0002*(enNoise(p*60.+uSeed)-.5);
  float peel=.00002*(enNoise(p*1400.+uSeed)-.5)+.000016*(enNoise(p*520.-uSeed)-.5);
  return bowl+rise+meniscus+(swell+peel)*smoothstep(LIP,LIP+.0006,inset);
}`;
function enamelMaterial(a, color, settings, shared) {
  // Deepened, as fired glass is; the full colour glows a very little.
  const material = a.own(new THREE.MeshPhysicalMaterial({color: new THREE.Color(color).multiplyScalar(.24), emissive: color, emissiveIntensity: .09,
    roughness: .2, metalness: 0, clearcoat: 1, clearcoatRoughness: .06}));
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {uKind: {value: settings.kind}, uSeed: {value: settings.seed},
      uSlot: {value: settings.slot}, uGleam: shared.gleam, uBronze: shared.bronze});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float cap; varying float vCap; varying vec2 vFace; varying vec3 vAxisX; varying vec3 vAxisY;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCap=cap; vFace=position.xy;
        vAxisX=normalize(normalMatrix*vec3(1.,0.,0.)); vAxisY=normalize(normalMatrix*vec3(0.,1.,0.));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${ENAMEL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float inset=-enOutline(vFace),blur=max(fwidth(inset),1e-5);
        float bronze=vCap>.5?1.-smoothstep(LIP-blur,LIP+blur,inset):1.;
        float body=smoothstep(LIP,.02,inset),mottle=enNoise(vFace*170.+uSeed);
        vec3 glass=diffuseColor.rgb*mix(1.3,.88,body)*(.92+.16*mottle);
        // A speck fades out before it is smaller than a couple of pixels.
        float cells=fwidth(vFace.x)*1700.;
        float speck=step(.993,enHash(floor(vFace*1700.)+uSeed))*smoothstep(.42,.15,length(fract(vFace*1700.)-.5));
        glass*=1.-.45*speck*(1.-smoothstep(.35,.7,cells))*step(LIP+.001,inset);
        diffuseColor.rgb=mix(glass,uBronze,bronze);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor=bronze*.85;
        roughnessFactor=mix(.16+.1*mottle,.3,bronze);`)
      .replace('#include <clearcoat_normal_fragment_maps>', `#include <clearcoat_normal_fragment_maps>
        if(vCap>.5){
          vec2 e=vec2(.00015,0.);
          float hx=(enSurface(vFace+e.xy)-enSurface(vFace-e.xy))/(2.*e.x);
          float hy=(enSurface(vFace+e.yx)-enSurface(vFace-e.yx))/(2.*e.x);
          normal=normalize(normal-hx*vAxisX-hy*vAxisY);clearcoatNormal=normal;
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // The gleam: a narrow band of light running down the logo's
        // diagonal, caught mostly by the brass, faintly by the glass.
        float sweep=dot(vFace+uSlot,vec2(.8,-.6))/.12;
        float gleam=uGleam<0.?0.:exp(-pow((sweep-mix(-1.4,1.4,uGleam))/.075,2.))*sin(3.14159*uGleam);
        totalEmissiveRadiance=totalEmissiveRadiance*(1.-bronze)+gleam*mix(vec3(.09,.08,.065),vec3(1.1,.78,.4),bronze);`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        // The glass's one gloss is its fired surface (the clear coat); the
        // coloured body under it is matte, or a lamp blooms across the face.
        material.specularColor*=bronze;material.specularF90*=bronze;
        material.clearcoat*=1.-bronze;
        material.clearcoatRoughness=min(.055+.05*mottle+geometryRoughness,1.);`);
  };
  return material;
}

function grainTexture(a, type, seed, size = 256) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'), rnd = randomSource(seed);
  ctx.fillStyle = type === 'leather' ? '#786052' : '#b8aea0'; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 3800; i++) {
    const value = Math.floor(50 + rnd() * 170);
    ctx.fillStyle = `rgba(${value},${value},${value},${.06 + rnd() * .2})`;
    const x = rnd() * size, y = rnd() * size;
    ctx.fillRect(x, y, type === 'wood' ? 22 + rnd() * 90 : 1 + rnd() * 2, 1);
  }
  if (type === 'leather') {
    ctx.strokeStyle = 'rgba(225,202,149,.35)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 90; i++) {
      const x = rnd() * size, y = rnd() < .5 ? rnd() * 24 : size - rnd() * 24;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rnd() * 14, y + rnd() * 3); ctx.stroke();
    }
  }
  const map = a.own(new THREE.CanvasTexture(canvas)); map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/** Five champlevé enamel pieces floating over a turned stone pedestal.
 * options: { reducedMotion?: boolean|()=>boolean, camera?: THREE.Camera }
 * Pass the host camera to face the assembled logo toward it in local yaw.
 */
export function createFigmaObject(options = {}) {
  const a = artifact('Figma / floating enamel', options), {group, mesh} = a;
  // The turned stone pedestal with two bronze bands, a dark dial ring of
  // twenty bronze ticks and, at its heart, pale stone lit from within that
  // the pieces float over: one lathe, its finishes painted along the profile.
  // The light reaches out across the dial, as the nook's lamp, hung level
  // with the shelf, never lights the top.
  const stone = {color: '#696a61', rough: .82, metal: 0, grain: 'speckle'};
  const bronze = {color: '#9d7849', rough: .38, metal: .72, grain: 'turned'};
  const dark = {color: '#3a3b37', rough: .8, metal: 0, glow: '#17130d'}, dial = {...dark, glow: '#3b3123'};
  const heart = {color: '#4a4740', rough: .6, metal: 0, glow: '#85704f'};
  const base = turned(a, [[.086,0],[.102,.006],[.108,.016],[.108,.025],[.097,.0305],[.094,.0335],[.086,.047],[.096,.051],
    [.098,.0555],[.098,.0585],[.091,.066],[.075,.066],[.073,.0685],[.062,.0685],[.056,.0685],[0,.0685]], 24,
    k => k === 4 || k === 8 ? bronze : k === 14 ? heart : k === 13 ? dial : k === 12 ? dark : k === 11 ? {...dark, glow: null} : stone,
    {segment: 13, count: 20, finish: bronze});
  const cloud = new THREE.Group(); group.add(cloud);
  // An unseen volume round the floating pieces catches the pointer between
  // them, so hover holds while they drift. Its material is not drawn (no
  // draw call, no shadow), but a raycast still meets the mesh.
  const reach = new THREE.Mesh(a.own(new THREE.CylinderGeometry(.112,.112,.29,12)),
    a.own(new THREE.MeshBasicMaterial({visible: false})));
  reach.position.y = .075 + .145; reach.name = 'Figma hover volume'; group.add(reach);
  const r = .031, unit = .071, lift = .232;
  function logoShape(kind) {
    const s = new THREE.Shape();
    // Two half arcs, so the disc is sampled as finely as the D's curve.
    if (kind === 'circle') { s.absarc(0,0,r,0,Math.PI,false); s.absarc(0,0,r,Math.PI,TAU,false); }
    else if (kind === 'lower') {
      s.moveTo(-r,r); s.lineTo(r,r); s.lineTo(r,0); s.absarc(0,0,r,0,-Math.PI,true); s.lineTo(-r,r);
    } else {
      s.moveTo(r,r); s.lineTo(0,r); s.absarc(0,0,r,Math.PI/2,Math.PI*1.5,false); s.lineTo(r,-r); s.lineTo(r,r);
      if (kind === 'right') {
        // Mirror the left D without a negative mesh scale (correct normals).
        const points = s.getPoints(28).map(p => new THREE.Vector2(-p.x,p.y)).reverse();
        return new THREE.Shape(points);
      }
    }
    s.closePath(); return s;
  }
  const shared = {gleam: {value: -1}, bronze: {value: new THREE.Color('#a99060')}};
  const kinds = {circle: 0, left: 1, right: 2, lower: 3};
  // [shape, colour, slot x, slot y, landing order, depth apart]: they land
  // row by row from the top, the blue eye last. Apart, each column's pieces
  // keep to alternate depths and never meet. Figma's colours, but the purple (#a259ff) and the blue
  // (#1abcfe) lean bluer, or the nook's warm lamp turns them pink and teal.
  const specs = [
    ['left','#f24e1e',-.5,1,0,.02], ['right','#ff7262',.5,1,1,-.01],
    ['left','#8a4dff',-.5,0,2,-.022], ['circle','#1a8cff',.5,0,4,.014], ['lower','#0acf83',-.5,-1,3,.022],
  ];
  const pieces = specs.map(([kind,color,x,y,order,depth],i) => {
    const slot = new THREE.Vector2(x*unit, y*unit);
    const finish = enamelMaterial(a, color, {kind: kinds[kind], seed: 3.7 + i*17.31, slot}, shared);
    const piece = mesh(enamelGeometry(logoShape(kind)), finish, cloud);
    piece.name = `Figma inlay ${i + 1}`;
    return {piece, slot, order, depth, phase: i*1.61, s: 0, v: 0};
  });
  const cameraPosition = new THREE.Vector3();
  let facing = 0, since = 0, wasAwake = false, gleam = -1;
  function update(time, delta) {
    const s = a.step(time,delta); if (!s) return;
    const {t,dt,hover:h,awake,reduced} = s;
    if (awake !== wasAwake) { wasAwake = awake; since = 0; } else since += dt;
    if (options.camera) {
      options.camera.getWorldPosition(cameraPosition);
      group.updateWorldMatrix(true,false); group.worldToLocal(cameraPosition);
      const desired = Math.atan2(cameraPosition.x,cameraPosition.z);
      const shortest = Math.atan2(Math.sin(desired-facing),Math.cos(desired-facing));
      if(reduced||Math.abs(shortest)<.0001)facing=desired;
      else facing += shortest * (1-Math.exp(-dt*5));
    }
    const drift = reduced ? 0 : 1;
    cloud.rotation.y = facing + drift*.16*Math.sin(t*.36)*(1-h);
    cloud.rotation.z = drift*.035*Math.sin(t*.43)*(1-h);
    cloud.position.y = lift + drift*(.0045-.0025*h)*Math.sin(t*.9);
    let home = true;
    for (const p of pieces) {
      // Each piece is a damped spring toward its slot, a little under
      // critical so it overshoots once and settles: the snap. On hover they
      // start one after another; let go, they leave almost together.
      const goal = awake ? +(since >= p.order*.085) : +(since < (4-p.order)*.03);
      if (reduced) { p.s = 1; p.v = 0; }
      else for (let left = dt; left > 1e-6; left -= 1/120) {
        const step = Math.min(left, 1/120);
        p.v += (110*(goal-p.s) - 14*p.v)*step; p.s += p.v*step;
      }
      const q = clamp(p.s,0,1), apart = 1-q, loose = apart*apart, seat = p.s-q, {x,y} = p.slot, k = p.phase;
      // Apart, each drifts on two slow, unrelated swells per axis, a little
      // below its place. Coming in, it rises into its slot and squares up
      // well before it arrives (loose falls faster than apart), so it never
      // grazes a neighbour already home; the overshoot past the slot tips it
      // back a little as it seats.
      p.piece.position.set(
        x*(1+apart*.62) + loose*(.008*Math.sin(t*.54+k) + .003*Math.sin(t*1.27+k*2)),
        y*(1+apart*.32) - apart*.012 + loose*(.0045*Math.sin(t*.75+k) + .0015*Math.sin(t*1.61+k)),
        apart*p.depth + loose*.004*Math.cos(t*.46+k) + seat*.05);
      p.piece.rotation.set(loose*.14*Math.sin(t*.43+k) - seat*1.6, loose*.3*Math.sin(t*.39+k+1),
        loose*.12*Math.sin(t*.47+k));
      if (p.s < .985 || Math.abs(p.v) > .3) home = false;
    }
    // The click: once the last piece is home, a gleam crosses the logo.
    if (!awake || reduced) gleam = -1;
    else if (gleam < 0 && home) gleam = 0;
    else if (gleam >= 0 && gleam < 1) gleam = Math.min(1, gleam + dt/.75);
    shared.gleam.value = gleam >= 0 && gleam < 1 ? gleam : -1;
    base.material.emissiveIntensity = 1 + .6*h;
  }
  update(0,0);
  // Measured over 90 s of float and 120 random hovers: the pieces reach
  // .363 m and .108 m to either side; the pedestal is .216 m across.
  group.userData.footprint = {width:.24,depth:.22,height:.37};
  return {group,update,setHover:a.setHover,dispose:a.dispose};
}

// A closed, curved slab (a board, or the block of leaves): top and bottom
// follow pageHeight, and the four edges are strips with vertices of their
// own, so the corners stay crisp. Top and bottom map the left half of the
// texture (u out from the binding, v back to front); every edge maps the
// right half, along the edge and up through the thickness (0 bottom, 1 top),
// so the block's leaves can be painted on its edges instead of modelled.
function pageHeight(u,v) { return .110 + .027*Math.sin(u*Math.PI*.93) + .010*u - v*.027; }
function pageVolume(side,width,depth,offset,thickness,nu = 12,nv = 4) {
  const pos=[],uv=[],idx=[],P=k=>new THREE.Vector3(pos[k*3],pos[k*3+1],pos[k*3+2]);
  const at=(u,v,lower)=>[side*(.003+u*width),pageHeight(u,v)+offset-(lower?thickness:0),v*depth/2];
  // A cols × rows grid of quads from f(s, t) -> [position, uv], wound to face outward.
  function grid(cols,rows,f,outward) {
    const base=pos.length/3;
    for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){const [p,t]=f(i/cols,j/rows);pos.push(...p);uv.push(...t);}
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++) {
      const a=base+j*(cols+1)+i,b=a+1,c=a+cols+2,d=a+cols+1;
      const n=new THREE.Vector3().subVectors(P(b),P(a)).cross(new THREE.Vector3().subVectors(P(d),P(a)));
      if(n.dot(outward)>=0)idx.push(a,b,c,a,c,d);else idx.push(a,c,b,a,d,c);
    }
  }
  const up=new THREE.Vector3(0,1,0),out=new THREE.Vector3(side,0,0);
  grid(nu,nv,(s,t)=>[at(s,t*2-1,false),[s*.5,t]],up);
  grid(nu,nv,(s,t)=>[at(s,t*2-1,true),[s*.5,t]],up.clone().negate());
  grid(nv,1,(s,t)=>[at(1,s*2-1,t<.5),[.5+s*.5,t]],out);
  grid(nv,1,(s,t)=>[at(0,s*2-1,t<.5),[.5+s*.5,t]],out.clone().negate());
  for(const v of [-1,1]) grid(nu,1,(s,t)=>[at(s,v,t<.5),[.5+s*.5,t]],new THREE.Vector3(0,0,v));
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
  return g;
}

// Indexed parts into one indexed geometry (position, uv), so smooth normals
// stay within each part. Takes ownership of the parts.
function mergedIndexed(parts) {
  const pos=[],uv=[],idx=[];let offset=0;
  for(const g of parts) {
    pos.push(...g.attributes.position.array);uv.push(...g.attributes.uv.array);
    for(let i=0;i<g.index.count;i++)idx.push(g.index.getX(i)+offset);
    offset+=g.attributes.position.count;g.dispose();
  }
  const r=new THREE.BufferGeometry();r.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  r.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));r.setIndex(idx);r.computeVertexNormals();
  return r;
}

// The parchment and its glow (two canvases): aged leaves with illuminated,
// abstract editor-like marks drawn on both, so only the marks glow.
function glyphCanvases(seed) {
  const paper=document.createElement('canvas'),light=document.createElement('canvas');
  paper.width=light.width=512;paper.height=light.height=512;
  const p=paper.getContext('2d'),l=light.getContext('2d'),rnd=randomSource(seed);
  p.fillStyle='#c8b283';p.fillRect(0,0,512,512);l.fillStyle='#000';l.fillRect(0,0,512,512);
  const shade=p.createLinearGradient(0,0,512,0);shade.addColorStop(0,'#66503a');shade.addColorStop(.12,'#bda572');shade.addColorStop(.55,'#e6d1a3');shade.addColorStop(1,'#b79c70');
  p.fillStyle=shade;p.fillRect(0,0,512,512);
  for(let i=0;i<6500;i++) {p.fillStyle=`rgba(75,46,22,${rnd()*.18})`;p.fillRect(rnd()*512,rnd()*512,1+rnd()*3,1);}
  for(let i=0;i<32;i++) {
    const x=rnd()*512,y=rnd()*512,r=12+rnd()*47;
    const stain=p.createRadialGradient(x,y,0,x,y,r);stain.addColorStop(0,'rgba(104,66,27,.10)');stain.addColorStop(1,'rgba(104,66,27,0)');
    p.fillStyle=stain;p.fillRect(x-r,y-r,r*2,r*2);
  }
  for(let i=0;i<250;i++) {p.fillStyle='rgba(77,43,18,.22)';const x=rnd()*512,y=rnd()<.5?rnd()*18:512-rnd()*18;p.fillRect(x,y,1+rnd()*3,1+rnd()*4);}
  p.strokeStyle='#90754b';p.lineWidth=2;p.strokeRect(34,28,450,456);p.strokeRect(40,34,438,444);
  // Illuminated, abstract editor-like marks: no font or source code involved.
  function mark(ctx,x,y,w,hue) {
    ctx.strokeStyle=hue;ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();
    if(rnd()<.3) {ctx.moveTo(x+6,y-5);ctx.lineTo(x,y);ctx.lineTo(x+6,y+5);ctx.moveTo(x+w-6,y-5);ctx.lineTo(x+w,y);ctx.lineTo(x+w-6,y+5);}
    else {ctx.moveTo(x,y);ctx.lineTo(x+w*.7,y);ctx.lineTo(x+w*.7,y-4);ctx.moveTo(x+w*.85,y+2);ctx.lineTo(x+w,y+2);}
    ctx.stroke();
  }
  for(let row=0;row<15;row++) {
    let x=64+(row%5===2?24:0),y=122+row*21;
    while(x<398) {
      const width=12+Math.floor(rnd()*5)*6;
      const state=rnd()<.65?'#007acc':'#587883';
      // Draw identical marks on both maps using saved PRNG state via path copy.
      const temp=document.createElement('canvas');temp.width=70;temp.height=18;
      mark(temp.getContext('2d'),4,9,width,state);
      p.drawImage(temp,x,y-9);l.drawImage(temp,x,y-9);x+=width+12+rnd()*16;
      if(rnd()<.08)break;
    }
  }
  for(const ctx of [p,l]) {
    ctx.strokeStyle='#159cda';ctx.lineWidth=3;ctx.beginPath();
    ctx.moveTo(172,67);ctx.lineTo(193,83);ctx.lineTo(172,99);ctx.moveTo(226,67);ctx.lineTo(205,83);ctx.lineTo(226,99);ctx.stroke();
    ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(252,83);ctx.lineTo(431,83);ctx.stroke();
  }
  return {paper,light};
}

/** Curved parchment leaves, thick leather boards, walnut lectern, blue glyphs. */
export function createGrimoireObject(options = {}) {
  const a=artifact('VS Code / blue grimoire',options),{group,mesh,material}=a;
  const leatherMap=grainTexture(a,'leather',193),woodMap=grainTexture(a,'wood',731);
  const leather=material({color:'#4b2921',map:leatherMap,bumpMap:leatherMap,bumpScale:.0012,roughness:.82});
  const wood=material({color:'#3b281b',map:woodMap,roughness:.69});
  const gold=material({color:'#a5824c',metalness:.65,roughness:.46});
  // The block's leaves are painted on its edges, not modelled: the right
  // half of this map, which the edge strips sample, is fine layers through
  // the thickness; the left half (the hidden top) is plain. A dark corner
  // stands in for the binding thread.
  const edge=document.createElement('canvas');edge.width=512;edge.height=256;
  {const e=edge.getContext('2d'),rnd=randomSource(5113);
    e.fillStyle='#bfa477';e.fillRect(0,0,512,256);
    for(let y=0;y<256;y+=3+Math.floor(rnd()*3)){e.fillStyle=`rgba(${rnd()<.6?'92,70,40':'240,226,190'},${.25+rnd()*.35})`;e.fillRect(256,y,256,1);}
    e.fillStyle='#4a3a26';e.fillRect(0,240,16,16);}
  const edgeMap=a.own(new THREE.CanvasTexture(edge));edgeMap.colorSpace=THREE.SRGBColorSpace;
  const edges=material({map:edgeMap,roughness:.95});
  const stand=[];
  for(const x of [-.075,.075]) {
    stand.push(bevel(roundedShape(.032,.176,.009),.009,.002,1,4).rotateX(-Math.PI/2).translate(x,.0065,0));
    stand.push(tube([[x,.015,-.065],[x,.061,-.039],[x,.082,-.050]],.009,5));
    stand.push(tube([[x,.015,.066],[x,.042,.030],[x,.059,.053]],.009,5));
    stand.push(tube([[x,.071,-.075],[x,.056,0],[x,.040,.080]],.008,5));
  }
  stand.push(new THREE.CylinderGeometry(.007,.007,.18,10).rotateZ(Math.PI/2).translate(0,.032,0));
  mesh(merged(stand),wood);
  const covers=[],blocks=[],corners=[],leafGrids=[],flutter=[];
  for(const side of [-1,1]) {
    covers.push(pageVolume(side,.147,.202,-.028,.012));
    blocks.push(pageVolume(side,.134,.182,-.004,.023));
    for(const v of [-1,1]) {
      const x=side*.147,y=pageHeight(1,v)-.025,z=v*.101;
      const guard=new THREE.Shape();guard.moveTo(0,0);guard.lineTo(-side*.024,0);guard.lineTo(0,v*.022);guard.closePath();
      corners.push(new THREE.ExtrudeGeometry(guard,{depth:.002,bevelEnabled:false}).rotateX(-Math.PI/2).translate(x,y,z));
      corners.push(new THREE.SphereGeometry(.0032,6,4).translate(x-side*.008,y+.003,z-v*.004));
    }
    // A leaf: u out from the binding, v back to front; uv into its half of the atlas.
    const g=new THREE.PlaneGeometry(1,1,16,6),p=g.attributes.position,uv=g.attributes.uv;
    for(let i=0;i<p.count;i++) {
      const u=uv.getX(i),v=uv.getY(i)*2-1;
      p.setXYZ(i,side*(.003+u*.134),pageHeight(u,v),v*.091);
      flutter.push([u,1-uv.getY(i),side]);
      uv.setXY(i,(side<0?0:.5)+u*.5,1-uv.getY(i));
    }
    // Plane indices point down on the right; turn those to keep lit tops.
    if(side>0) {const ix=g.index;for(let i=0;i<ix.count;i+=3){const k=ix.getX(i+1);ix.setX(i+1,ix.getX(i+2));ix.setX(i+2,k);}}
    leafGrids.push(g);
  }
  // The round spine shares the boards' leather; twelve stitches share the
  // block's map (its dark corner).
  mesh(merged([...covers,new THREE.CylinderGeometry(.013,.013,.203,14).rotateX(Math.PI/2).translate(0,.077,0)]),leather);
  const stitches=[];
  for(let i=0;i<12;i++) {
    const s=new THREE.BoxGeometry(.006,.0007,.0008).translate(0,.111-i*.00015,-.079+i*.014),t=s.attributes.uv;
    for(let k=0;k<t.count;k++)t.setXY(k,.01,.02);
    stitches.push(s);
  }
  mesh(merged([...blocks,...stitches]),edges);
  mesh(merged(corners),gold);
  // Both leaves in one mesh and one material: their parchment and glyphs
  // side by side in one atlas.
  const L=glyphCanvases(125),R=glyphCanvases(256);
  const atlas=(l,r)=>{const c=document.createElement('canvas');c.width=1024;c.height=512;const x=c.getContext('2d');x.drawImage(l,0,0);x.drawImage(r,512,0);return c;};
  const map=a.own(new THREE.CanvasTexture(atlas(L.paper,R.paper))),emissiveMap=a.own(new THREE.CanvasTexture(atlas(L.light,R.light)));
  map.colorSpace=emissiveMap.colorSpace=THREE.SRGBColorSpace;
  const parchment=material({map,emissiveMap,color:'#fff2d5',emissive:'#72c9ff',emissiveIntensity:1.1,roughness:.88,side:THREE.DoubleSide});
  const leaves=mesh(mergedIndexed(leafGrids),parchment);leaves.name='curved illuminated pages';
  const resting=Float32Array.from(leaves.geometry.attributes.position.array);
  const silk=material({color:'#185f83',roughness:.65,metalness:.12,side:THREE.DoubleSide});
  const ribbon=new THREE.Shape();ribbon.moveTo(-.005,0);ribbon.lineTo(.005,0);ribbon.lineTo(.006,-.055);ribbon.lineTo(0,-.050);ribbon.lineTo(-.005,-.058);ribbon.closePath();
  mesh(new THREE.ShapeGeometry(ribbon).rotateX(.2).translate(.010,.098,.082),silk);

  const symbol=document.createElement('canvas');symbol.width=symbol.height=64;
  const c=symbol.getContext('2d');c.strokeStyle='#7fdaff';c.lineWidth=4;c.lineCap='round';
  c.shadowColor='#007acc';c.shadowBlur=8;c.beginPath();c.moveTo(23,19);c.lineTo(12,31);c.lineTo(23,43);c.moveTo(41,19);c.lineTo(52,31);c.lineTo(41,43);c.stroke();
  const glyphMap=a.own(new THREE.CanvasTexture(symbol));glyphMap.colorSpace=THREE.SRGBColorSpace;
  // Seven glyphs that rise from the leaves and fade, in one draw call: their
  // colour carries the fade (additive, so darker is fainter).
  const lift=a.own(new THREE.BufferGeometry());
  lift.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(21),3));
  lift.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(21),3));
  const glyphs=new THREE.Points(lift,a.own(new THREE.PointsMaterial({map:glyphMap,size:.05,vertexColors:true,
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})));
  glyphs.name='lifted blue glyphs';glyphs.visible=false;glyphs.frustumCulled=false;group.add(glyphs);
  const blue=new THREE.Color('#49baff');
  function update(time,delta) {
    const s=a.step(time,delta);if(!s)return;
    const {t,hover:h,reduced}=s;
    parchment.emissiveIntensity=1.05+h*1.8+(reduced?0:.14*Math.sin(t*1.5));
    const p=leaves.geometry.attributes.position;
    for(let i=0;i<p.count;i++) {
      const [u,v,side]=flutter[i];
      p.setY(i,resting[i*3+1]+(reduced?0:Math.pow(u,3)*.0018*Math.sin(t*1.7+v*4+side)));
    }
    p.needsUpdate=true;
    glyphs.visible=!reduced&&h>.006;
    if(!glyphs.visible)return;
    const q=lift.attributes.position,tint=lift.attributes.color;
    for(let i=0;i<7;i++) {
      const life=(t*.23+i/7)%1,fade=h*Math.sin(life*Math.PI)**2*.78;
      q.setXYZ(i,Math.sin(i*2.4)*.092+Math.sin(t*.5+i)*.013,.125+life*.16,Math.cos(i*2.7)*.054);
      tint.setXYZ(i,blue.r*fade,blue.g*fade,blue.b*fade);
    }
    q.needsUpdate=tint.needsUpdate=true;
  }
  update(0,0);
  group.userData.footprint={width:.30,depth:.20,height:.17};
  return {group,update,setHover:a.setHover,dispose:a.dispose};
}

/** Bronze-mounted glass with one small analytic mist shader, no raymarch. */
export function createCrystalBallObject(options = {}) {
  const a=artifact('AI / nebula crystal',options),{group,mesh,material}=a;
  const bronze=material({color:'#80613e',metalness:.76,roughness:.36});
  const inlay=material({color:'#276f68',metalness:.3,roughness:.3,emissive:'#15574f',emissiveIntensity:.4});
  // The patinated base, its four bright bronze bands and twelve studs: one
  // lathe, its finishes painted along the profile.
  const patina={color:'#2c3933',rough:.55,metal:.67,grain:'turned'},bright={color:'#80613e',rough:.36,metal:.76,grain:'turned'};
  turned(a,[[.077,0],[.088,.006],[.091,.015],[.0905,.019],[.089,.023],[.072,.030],[.0665,.0335],[.056,.040],
    [.041,.051],[.0402,.057],[.039,.065],[.050,.079],[.062,.087],[.066,.0945],[.066,.0985],[.061,.107],[.052,.110],[0,.110]],20,
    k=>k===2||k===5||k===8||k===13?bright:patina,{segment:3,count:12,finish:bright});
  const ornament=[],gems=[];
  // Six swept wires climb the waist; four claws cradle the glass, and four
  // feet keep the wider base within .22 m.
  for(let i=0;i<6;i++)
    ornament.push(tube([[.066,.033,0],[.055,.045,.003],[.043,.067,0],[.057,.087,-.003]],.0019,4).rotateY(i/6*TAU+TAU/24));
  for(let i=0;i<4;i++) {
    const angle=Math.PI/4+i*TAU/4;
    ornament.push(tube([[.073,.023,0],[.104,.016,0],[.106,.008,0]],.005,4).rotateY(angle));
    ornament.push(tube([[.051,.081,0],[.080,.098,0],[.088,.126,0],[.090,.149,0]],.004,6).rotateY(angle));
    ornament.push(new THREE.SphereGeometry(.0055,6,4).translate(.090,.149,0).rotateY(angle));
    gems.push(new THREE.SphereGeometry(.006,6,4).scale(1,.7,.6).translate(.073,.032,0).rotateY(angle));
  }
  mesh(merged(ornament),bronze);mesh(merged(gems),inlay);

  // One sphere is both the glass and the mist inside it: the shell's veil,
  // rim and glint, and a sparse scatter of pinpricks, are part of the same
  // shader rather than a transparent second sphere and 27 tiny ones.
  const mist=a.own(new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uHover:{value:0},uSpark:{value:0}},
    vertexShader:`varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormal; varying vec3 vEye;
      void main(){vLocal=position/.105; vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;
      vec3 eye=cameraPosition-w.xyz;vEye=vec3(dot(eye,modelMatrix[0].xyz),dot(eye,modelMatrix[1].xyz),dot(eye,modelMatrix[2].xyz));
      vNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`precision highp float;
      uniform float uTime; uniform float uHover; uniform float uSpark; varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormal; varying vec3 vEye;
      float hash(vec3 p){p=fract(p*vec3(.1031,.103,.0973));p+=dot(p,p.yxz+33.33);return fract((p.x+p.y)*p.z);}
      float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
        mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      mat2 turn(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
      void main(){
        vec3 N=normalize(vNormal),V=normalize(cameraPosition-vWorld);
        float ndv=clamp(dot(N,V),0.,1.),rim=pow(1.-ndv,3.7);
        vec3 p=vLocal-normalize(vEye)*ndv*.68; p.xz=turn(uTime*.16+p.y*.8)*p.xz;
        // Three warped noise fields sampled once each, projected through a
        // curved lens. This is an impression of depth, not a volume marcher.
        float broad=noise3(p*2.7+vec3(0.,uTime*.07,0.));
        vec3 q=p*4.4+vec3(broad*1.8,-uTime*.12,broad);
        float fine=noise3(q);
        float distant=noise3(p*5.7+vec3(2.,uTime*.035,1.));
        float cloud=smoothstep(.28,.79,broad*.62+fine*.38);
        float filament=pow(1.-abs(fine*2.-1.),10.)*smoothstep(.32,.75,broad);
        float core=pow(ndv,4.)*.24;
        vec3 teal=vec3(.018,.28,.24),violet=vec3(.16,.035,.30);
        vec3 hue=mix(teal,violet,smoothstep(-.5,.6,p.x+p.y*.45+broad*.4));
        vec3 color=vec3(.004,.012,.017)+hue*(cloud*.58+filament*.16+core+distant*.11)*smoothstep(0.,.6,ndv)*(1.+uHover*.38);
        color+=vec3(.08,.39,.31)*core+mix(teal,violet,.55)*rim*.31;
        // The glass over it holds back a little of the mist and adds a faint
        // pale veil. The mist fills a sphere 6% smaller than the glass, so
        // near the outline the eye sees through glass alone: there the ball
        // turns clear (cos 0.33 = the inner sphere grazed), the thickness of the shell.
        float filled=smoothstep(.28,.38,ndv);
        color=mix(vec3(.05,.08,.08)+rim*vec3(.30,.40,.38),color*.82+vec3(.72,.84,.81)*.008,filled);
        float glint=pow(max(dot(reflect(-V,N),normalize(vec3(-.5,.8,1.))),0.),190.);
        color+=vec3(1.,.82,.61)*glint*.6;
        // Pinpricks on the inner glass, twinkling a little.
        vec3 cell=floor(vLocal*9.),f=fract(vLocal*9.)-.5;float h=hash(cell+7.);
        color+=vec3(.55,.86,.81)*step(.93,h)*smoothstep(.16,0.,length(f))*(.75+.25*sin(uSpark+h*40.));
        gl_FragColor=vec4(color,mix(.24,1.,filled));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent:true,
  }));
  const center=.211;
  const globe=mesh(new THREE.SphereGeometry(.105,32,18),mist);globe.position.y=center;globe.name='glass and mist';
  let swirl=0;
  function update(time,delta) {
    const s=a.step(time,delta);if(!s)return;
    if(!s.reduced)swirl+=s.dt*(1+s.hover*2.1);
    mist.uniforms.uTime.value=swirl;mist.uniforms.uHover.value=s.hover;
    mist.uniforms.uSpark.value=s.reduced?0:s.t*1.2;
  }
  update(0,0);
  group.userData.footprint={width:.23,depth:.23,height:.316};
  return {group,update,setHover:a.setHover,dispose:a.dispose};
}
