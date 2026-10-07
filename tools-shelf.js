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
  // Deepened, as fired glass is, so it keeps its colour under the nook's
  // bright lamp; a fifth of the full colour glows from within, which holds
  // the hue there and lifts it under dimmer light.
  const material = a.own(new THREE.MeshPhysicalMaterial({color: new THREE.Color(color).multiplyScalar(.3), emissive: color, emissiveIntensity: .2,
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

// Walnut grain for the lectern: long faint streaks, light and dark.
function woodTexture(a, seed, size = 256) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'), rnd = randomSource(seed);
  ctx.fillStyle = '#b8aea0'; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 3800; i++) {
    const value = Math.floor(50 + rnd() * 170);
    ctx.fillStyle = `rgba(${value},${value},${value},${.06 + rnd() * .2})`;
    ctx.fillRect(rnd() * size, rnd() * size, 22 + rnd() * 90, 1);
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
  // keep to alternate depths and never meet. Figma's own five colours.
  const specs = [
    ['left','#f24e1e',-.5,1,0,.02], ['right','#ff7262',.5,1,1,-.01],
    ['left','#a259ff',-.5,0,2,-.022], ['circle','#1abcfe',.5,0,4,.014], ['lower','#0acf83',-.5,-1,3,.022],
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

// A broad-nib pen on a 2D canvas. pts is a dense polyline of [x, y, weight];
// each step sweeps the nib (held at angle) from one point to the next, so
// strokes run thick across the nib and thin along it, as a quill writes. All
// sweeps are wound one way and filled as one path: overlaps never darken.
function nib(ctx, pts, width, angle = .7) {
  const hx = Math.cos(angle)*width/2, hy = -Math.sin(angle)*width/2;
  ctx.beginPath();
  for (let i = 1; i < pts.length; i++) {
    const [x0,y0,w0] = pts[i-1], [x1,y1,w1] = pts[i];
    const q = [[x0-hx*w0,y0-hy*w0],[x0+hx*w0,y0+hy*w0],[x1+hx*w1,y1+hy*w1],[x1-hx*w1,y1-hy*w1]];
    const area = (q[1][0]-q[0][0])*(q[2][1]-q[0][1])-(q[2][0]-q[0][0])*(q[1][1]-q[0][1]);
    if (area < 0) q.reverse();
    ctx.moveTo(...q[0]); for (let k = 1; k < 4; k++) ctx.lineTo(...q[k]); ctx.closePath();
  }
  ctx.fill();
}

// Catmull-Rom through control points, sampled about every half pixel; the
// weight swells from the pen's set-down and thins as it lifts.
function stroke(points, rnd) {
  const out = [], n = points.length, phase = rnd()*6;
  const P = i => points[Math.max(0, Math.min(n-1, i))];
  let travelled = 0, last = null;
  for (let i = 0; i < n-1; i++) {
    const [a,b,c,d] = [P(i-1),P(i),P(i+1),P(i+2)];
    const steps = Math.max(2, Math.ceil(Math.hypot(c[0]-b[0], c[1]-b[1])*2));
    for (let s = 0; s < steps; s++) {
      const t = s/steps, t2 = t*t, t3 = t2*t;
      const f = k => .5*((2*b[k]) + (-a[k]+c[k])*t + (2*a[k]-5*b[k]+4*c[k]-d[k])*t2 + (-a[k]+3*b[k]-3*c[k]+d[k])*t3);
      const x = f(0), y = f(1);
      if (last) travelled += Math.hypot(x-last[0], y-last[1]);
      last = [x,y]; out.push([x, y, travelled]);
    }
  }
  out.push([...points[n-1].slice(0,2), travelled + 1]);
  const total = travelled + 1;
  for (const p of out) {
    const k = p[2]/total;
    p[2] = Math.min(1, .55 + k*6) * Math.min(1, .5 + (1-k)*4) * (.86 + .14*Math.sin(p[2]*.09 + phase));
  }
  return out;
}

// One invented cursive hand. Letters are control points in x-heights from
// the letter's origin on the baseline (y up); a word joins them in one pen
// stroke. Crossbars and dots are lifts of their own.
const HAND = {
  n: {w: .92, p: [[.1,1],[.15,0],[.3,.8],[.55,1.02],[.7,.6],[.72,0],[.9,.35]]},
  u: {w: .86, p: [[.1,1],[.12,.15],[.3,0],[.55,.3],[.62,1],[.65,.1],[.85,.35]]},
  o: {w: .86, p: [[.55,1],[.2,.8],[.2,.15],[.5,0],[.72,.4],[.55,1],[.86,.9]]},
  e: {w: .76, p: [[.3,.35],[.7,.62],[.5,1],[.2,.6],[.3,.05],[.76,.25]]},
  l: {w: .58, p: [[.2,.6],[.56,1.9],[.4,2.02],[.25,1.2],[.3,.1],[.6,.3]]},
  t: {w: .62, p: [[.32,1.6],[.3,.1],[.58,.25]], extra: [[[.08,1.04],[.62,1]]]},
  g: {w: .88, p: [[.6,.9],[.3,1],[.15,.5],[.4,.2],[.65,.8],[.6,-.8],[.3,-1],[.15,-.6],[.82,.3]]},
  i: {w: .46, p: [[.15,1],[.2,.1],[.42,.3]], extra: [[[.22,1.42],[.25,1.46]]]},
  s: {w: .72, p: [[.2,.4],[.55,1],[.3,.7],[.6,.3],[.4,0],[.1,.2],[.72,.35]]},
  a: {w: .92, p: [[.6,.85],[.3,1],[.1,.5],[.35,0],[.62,.6],[.62,1],[.65,.1],[.88,.35]]},
  d: {w: .92, p: [[.6,.85],[.3,1],[.1,.5],[.35,0],[.62,.6],[.66,1.9],[.65,.1],[.88,.35]]},
  p: {w: .9, p: [[.2,1],[.15,-.9],[.2,.6],[.5,1],[.7,.5],[.4,0],[.15,.2],[.82,.35]]},
  r: {w: .7, p: [[.12,.9],[.2,0],[.3,.75],[.55,1],[.72,.85]]},
};
// Punctuation of code, in the same hand: each is its own lift of the pen.
const MARKS = {
  '{': {w: .7, s: [[[.62,1.6],[.36,1.4],[.42,.9],[.14,.62],[.42,.32],[.36,-.18],[.62,-.4]]]},
  '}': {w: .7, s: [[[.08,1.6],[.34,1.4],[.28,.9],[.56,.62],[.28,.32],[.34,-.18],[.08,-.4]]]},
  '(': {w: .55, s: [[[.5,1.5],[.22,.6],[.5,-.32]]]},
  ')': {w: .55, s: [[[.1,1.5],[.38,.6],[.1,-.32]]]},
  '=': {w: .85, s: [[[.08,.66],[.7,.7]],[[.08,.28],[.7,.32]]]},
  ';': {w: .4, s: [[[.2,.7],[.24,.74]],[[.24,.1],[.12,-.3]]]},
  '.': {w: .36, s: [[[.15,.05],[.19,.09]]]},
  '/': {w: .42, s: [[[.48,1.3],[.04,-.2]]]},
  '<': {w: .78, s: [[[.66,.95],[.12,.48],[.66,0]]]},
  '>': {w: .78, s: [[[.12,.95],[.66,.48],[.12,0]]]},
};
const LETTERS = 'nnuoeeltgisaadpr';

// Writes one token at (x, baseline) in x-height xh, slanted; returns the
// strokes (control points in canvas pixels) and the advance.
function token(rnd, text, x, y, xh, slant) {
  const strokes = [], jitter = () => (rnd()-.5)*.12;
  const place = (ox, [px,py]) => { const dx = px+jitter(), dy = py+jitter(); return [x+(ox+dx+dy*slant)*xh, y-dy*xh]; };
  let ox = 0;
  if (MARKS[text]) {
    for (const s of MARKS[text].s) strokes.push(s.map(p => place(0, p)));
    return {strokes, advance: MARKS[text].w*xh};
  }
  const word = [place(0, [-.18,.28])];
  for (const ch of text) {
    const letter = HAND[ch];
    for (const p of letter.p) word.push(place(ox, p));
    for (const e of letter.extra || []) strokes.push(e.map(p => place(ox, p)));
    ox += letter.w*(.92 + rnd()*.16);
  }
  strokes.unshift(word);
  return {strokes, advance: ox*xh};
}

// A leaf of the grimoire, 512 x 512 in the reader's orientation: the head at
// the top, the gutter on the right of a left-hand page and on the left of a
// right-hand one. The page is about .14 x .18 m, so the writing is laid out
// in a 512 x 670 space squeezed into the square, and stands upright on the
// curved leaf. paper: aged parchment and its ink; light: only the blue ink,
// with a soft halo, for the emissive map. spots: where words sit, in page
// (u from the gutter, v from the head), for glyphs to lift from.
function leafCanvases(seed, gutterRight, initial) {
  const W = 512, H = 670, rnd = randomSource(seed);
  const paper = document.createElement('canvas'), light = document.createElement('canvas'), ink = document.createElement('canvas');
  paper.width = paper.height = light.width = light.height = ink.width = ink.height = 512;
  const p = paper.getContext('2d'), l = light.getContext('2d'), k = ink.getContext('2d');
  for (const ctx of [p, l, k]) ctx.setTransform(1, 0, 0, 512/H, 0, 0);
  const gx = gutterRight ? W : 0, out = gutterRight ? -1 : 1, fx = W - gx;
  // Parchment: warm in the middle, tanned toward every edge, shaded into the gutter.
  const body = p.createRadialGradient(W*.5, H*.45, 40, W*.5, H*.5, 430);
  body.addColorStop(0, '#e2cfa4'); body.addColorStop(.7, '#d2b98a'); body.addColorStop(1, '#a98c5f');
  p.fillStyle = body; p.fillRect(0, 0, W, H);
  const gutter = p.createLinearGradient(gx, 0, gx + out*70, 0);
  gutter.addColorStop(0, 'rgba(70,48,26,.55)'); gutter.addColorStop(1, 'rgba(70,48,26,0)');
  p.fillStyle = gutter; p.fillRect(0, 0, W, H);
  // Fibres, then foxing in a few clusters, a tide line, and the lower outer
  // corner darkened by thumbs that turned the page.
  for (let i = 0; i < 2600; i++) {
    p.fillStyle = `rgba(${rnd() < .55 ? '96,68,38' : '246,234,206'},${.05 + rnd()*.12})`;
    p.fillRect(rnd()*W, rnd()*H, 1 + rnd()*5, .7);
  }
  for (let c = 0; c < 4; c++) {
    const cx = rnd()*W, cy = rnd()*H;
    for (let i = 0; i < 12; i++) {
      const x = cx + (rnd()-.5)*60, y = cy + (rnd()-.5)*60, r = .8 + rnd()*2.6;
      p.fillStyle = `rgba(128,72,30,${.15 + rnd()*.25})`; p.beginPath(); p.arc(x, y, r, 0, TAU); p.fill();
    }
  }
  {
    const x = W*(.3 + rnd()*.4), y = H*(.55 + rnd()*.3), r = 50 + rnd()*40;
    p.strokeStyle = 'rgba(112,78,40,.14)'; p.lineWidth = 3;
    p.beginPath(); p.arc(x, y, r, rnd()*TAU, rnd()*TAU + 4.4); p.stroke();
    p.fillStyle = 'rgba(150,118,72,.06)'; p.beginPath(); p.arc(x, y, r, 0, TAU); p.fill();
  }
  const thumb = p.createRadialGradient(fx, H, 0, fx, H, 95);
  thumb.addColorStop(0, 'rgba(60,44,30,.38)'); thumb.addColorStop(1, 'rgba(60,44,30,0)');
  p.fillStyle = thumb; p.fillRect(0, 0, W, H);
  const edge = (x0, y0, x1, y1) => { const g = p.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(92,60,30,.42)'); g.addColorStop(1, 'rgba(92,60,30,0)'); p.fillStyle = g; p.fillRect(0, 0, W, H); };
  edge(0, 0, 0, 22); edge(0, H, 0, H - 26); edge(fx, 0, fx - out*20, 0);
  // Ruled by hand: a faint margin at each side of the text and a guide under
  // each line, never quite straight.
  const left = gutterRight ? 40 : 56, right = W - (gutterRight ? 56 : 40), top = 76, lead = 30;
  p.strokeStyle = 'rgba(120,70,42,.22)'; p.lineWidth = 1;
  for (const x of [left - 8, right + 4]) {
    p.beginPath(); p.moveTo(x + (rnd()-.5)*2, 30); p.quadraticCurveTo(x + (rnd()-.5)*4, H/2, x + (rnd()-.5)*3, H - 34); p.stroke();
  }
  p.strokeStyle = 'rgba(120,80,48,.07)';
  for (let y = top; y < H - 60; y += lead) { p.beginPath(); p.moveTo(left - 4, y + 1); p.lineTo(right, y + (rnd()-.5)*2); p.stroke(); }

  // The text: lines of code in the hand, nested by braces, with comments in
  // sepia between. The blue ink is the luminous one; each dip of the quill
  // starts dark and thins until the next.
  const blue = level => `rgba(16,${52 + level*18},${112 + level*36},${.66 + level*.3})`;
  let indent = 0, dip = 1, line = 0;
  const spots = [];
  const write = (strokes, color, luminous, w = 2.9) => {
    for (const s of strokes) {
      const pts = stroke(s, rnd);
      p.fillStyle = color; nib(p, pts, w);
      if (luminous) { k.fillStyle = '#9fdcff'; nib(k, pts, w*1.1); }
    }
  };
  if (initial) {
    // An illuminated initial: a brace in blue on a square of worn gold, with
    // a flourish that runs down the margin.
    const x = left - 2, y = top - 22, s = 58;
    p.fillStyle = '#9c7a3c'; p.fillRect(x, y, s, s);
    for (let i = 0; i < 260; i++) { p.fillStyle = `rgba(${rnd() < .5 ? '232,200,120' : '90,62,26'},${.2 + rnd()*.3})`; p.fillRect(x + rnd()*s, y + rnd()*s, 1 + rnd()*2, 1); }
    p.strokeStyle = 'rgba(58,36,18,.8)'; p.lineWidth = 1.6; p.strokeRect(x, y, s, s);
    const {strokes} = token(rnd, '{', x + 14, y + s - 14, 26, .1);
    p.fillStyle = '#123e72'; for (const st of strokes) nib(p, stroke(st, rnd), 7);
    k.fillStyle = '#9fdcff'; for (const st of strokes) nib(k, stroke(st, rnd), 7.5);
    write([[[x + 4, y + s + 4], [x - 6, y + s + 40], [x + 6, y + s + 80], [x - 4, y + s + 120]]], 'rgba(150,40,30,.55)', false, 1.6);
  }
  for (; top + line*lead < H - 70; line++) {
    const y = top + line*lead + 20, xh = 8.4 + rnd()*1.1, slant = .2 + rnd()*.08;
    let x = left + indent*20 + (initial && line < 2 ? 66 : 0) + (rnd()-.5)*3;
    const kind = rnd(), words = [];
    if (kind < .12 && indent > 0) { indent--; x -= 20; words.push('}'); }
    else if (kind < .26) {
      // A comment: '//' and a few words, in sepia.
      for (let n = 0; n < 2; n++) {
        const slash = token(rnd, '/', x, y, xh, slant);
        write(slash.strokes, 'rgba(92,60,34,.78)', false, 2.4); x += slash.advance;
      }
      x += 6;
      for (let n = 2 + Math.floor(rnd()*4); n-- && x < right - 50;) {
        const t = token(rnd, Array.from({length: 2 + Math.floor(rnd()*5)}, () => LETTERS[Math.floor(rnd()*LETTERS.length)]).join(''), x, y, xh*.92, slant);
        write(t.strokes, 'rgba(92,60,34,.72)', false, 2.4); x += t.advance + 11;
      }
      continue;
    } else {
      const opens = kind > .82 && indent < 3, n = 2 + Math.floor(rnd()*4);
      for (let i = 0; i < n; i++) {
        words.push(Array.from({length: 2 + Math.floor(rnd()*6)}, () => LETTERS[Math.floor(rnd()*LETTERS.length)]).join(''));
        if (i === 0 && rnd() < .4) words.push('=');
        else if (i < n - 1 && rnd() < .3) words.push(rnd() < .5 ? '.' : '(');
      }
      if (words.includes('(')) words.push(')');
      words.push(opens ? '{' : ';');
      if (opens) indent++;
    }
    for (const w of words) {
      if (x > right - 30) break;
      const t = token(rnd, w, x, y, xh, slant);
      write(t.strokes, blue(dip), true);
      if (!MARKS[w] && rnd() < .5) spots.push([Math.abs(x + t.advance/2 - gx)/W, (y - xh)/H]);
      x += t.advance + (MARKS[w] ? 5 : 11);
      dip -= t.advance/260; if (dip < .35) dip = 1;
    }
  }
  // The light map: the blue ink alone, a soft halo under it, then the stroke.
  l.setTransform(1, 0, 0, 1, 0, 0); l.fillStyle = '#000'; l.fillRect(0, 0, 512, 512);
  l.filter = 'blur(3px)'; l.globalAlpha = .55; l.drawImage(ink, 0, 0);
  l.filter = 'none'; l.globalAlpha = 1; l.drawImage(ink, 0, 0);
  return {paper, light, spots};
}

// Eight words of the hand for the lifted glyphs, pale blue on black (they
// are drawn additively), four by two cells of 64 px, each word kept inside
// the cell's middle so it can turn without clipping.
function liftedWords(seed) {
  const atlas = document.createElement('canvas'); atlas.width = 256; atlas.height = 128;
  const ctx = atlas.getContext('2d'), rnd = randomSource(seed), ink = document.createElement('canvas');
  ink.width = 256; ink.height = 128; const k = ink.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 128);
  const words = ['{', 'nul', '=', 'si', '<', 'tag', '}', 'od'];
  words.forEach((w, i) => {
    const cx = (i % 4)*64, cy = Math.floor(i/4)*64, xh = MARKS[w] ? 15 : 10;
    const t = token(rnd, w, 0, 0, xh, .18), width = t.advance;
    k.fillStyle = '#d4f1ff';
    for (const s of t.strokes) nib(k, stroke(s.map(([x,y]) => [cx + 32 - width/2 + x, cy + 38 + y - (MARKS[w] ? 4 : 0)]), rnd), MARKS[w] ? 3.6 : 2.8);
  });
  ctx.filter = 'blur(4px)'; ctx.globalAlpha = .9; ctx.drawImage(ink, 0, 0);
  ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.drawImage(ink, 0, 0);
  return atlas;
}

// Worn blue leather for the boards and spine. The left half is a board's
// face (u out from the binding, v back to front): pebbled grain, a gilt
// fillet just inside the edge, scuffs, and wear that lightens toward the
// corners. The right half is the boards' edges, rubbed paler and smoother.
// color, and rough (roughness in G), as three.js reads them.
function leatherCanvases(seed) {
  const color = document.createElement('canvas'), rough = document.createElement('canvas');
  color.width = rough.width = color.height = rough.height = 512;
  const c = color.getContext('2d'), r = rough.getContext('2d'), rnd = randomSource(seed);
  c.fillStyle = '#1d2f45'; c.fillRect(0, 0, 512, 512);
  r.fillStyle = 'rgb(0,205,0)'; r.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const x = rnd()*512, y = rnd()*512, s = .8 + rnd()*1.8;
    c.fillStyle = `rgba(${rnd() < .5 ? '8,14,22' : '70,96,124'},${.12 + rnd()*.2})`;
    c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
  }
  // Wear on the face: paler and smoother toward the outer edge and corners.
  const worn = (ctx, color) => {
    const g = ctx.createLinearGradient(256, 0, 200, 0); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 512);
    for (const y of [0, 512]) {
      const v = ctx.createRadialGradient(256, y, 0, 256, y, 90); v.addColorStop(0, color); v.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, 256, 512);
    }
  };
  worn(c, 'rgba(112,128,140,.5)'); worn(r, 'rgba(0,120,0,.7)');
  for (let i = 0; i < 70; i++) {
    const x = rnd()*256, y = rnd()*512, a = rnd()*TAU, len = 6 + rnd()*26;
    c.strokeStyle = `rgba(150,160,166,${.08 + rnd()*.16})`; c.lineWidth = .6 + rnd();
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a)*len, y + Math.sin(a)*len); c.stroke();
  }
  // The gilt fillet, a little broken where the gold has worn off.
  c.strokeStyle = 'rgba(196,158,82,.85)'; c.lineWidth = 2.2; c.setLineDash([60, 3, 24, 2, 90, 4]);
  c.beginPath(); c.moveTo(0, 14); c.lineTo(242, 14); c.lineTo(242, 498); c.lineTo(0, 498); c.stroke();
  c.setLineDash([]);
  r.strokeStyle = 'rgb(0,90,0)'; r.lineWidth = 2.2; r.beginPath(); r.moveTo(0, 14); r.lineTo(242, 14); r.lineTo(242, 498); r.lineTo(0, 498); r.stroke();
  // The edges: rubbed paler, smoother, with the leather's turn-in showing.
  c.fillStyle = 'rgba(96,112,124,.45)'; c.fillRect(256, 0, 256, 512);
  for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(${rnd() < .5 ? '20,28,36' : '150,160,168'},${.1 + rnd()*.15})`; c.fillRect(256 + rnd()*256, rnd()*512, 1 + rnd()*3, 1); }
  r.fillStyle = 'rgb(0,140,0)'; r.fillRect(256, 0, 256, 512);
  return {color, rough};
}

/** Curved parchment leaves written by hand in a quill's blue ink, worn blue
 * leather boards, a walnut lectern. On hover the writing wakes line by line
 * and a few of its words lift from the page. */
export function createGrimoireObject(options = {}) {
  const a=artifact('VS Code / blue grimoire',options),{group,mesh,material}=a;
  const hide=leatherCanvases(193),woodMap=woodTexture(a,731);
  const leatherMap=a.own(new THREE.CanvasTexture(hide.color)),leatherRough=a.own(new THREE.CanvasTexture(hide.rough));
  leatherMap.colorSpace=THREE.SRGBColorSpace;
  const leather=material({map:leatherMap,bumpMap:leatherMap,bumpScale:.0009,roughnessMap:leatherRough,roughness:1});
  const wood=material({color:'#3b281b',map:woodMap,roughness:.69});
  const gold=material({color:'#a5824c',metalness:.65,roughness:.46});
  // The block's leaves are painted on its edges, not modelled: the right
  // half of this map, which the edge strips sample, is fine layers through
  // the thickness, grimed toward the top and thumbed; the left half (the
  // hidden top) is plain. A pale corner patch is the binding thread.
  const edge=document.createElement('canvas');edge.width=512;edge.height=256;
  {const e=edge.getContext('2d'),rnd=randomSource(5113);
    e.fillStyle='#bfa477';e.fillRect(0,0,512,256);
    for(let y=0;y<256;y+=3+Math.floor(rnd()*3)){e.fillStyle=`rgba(${rnd()<.6?'92,70,40':'240,226,190'},${.25+rnd()*.35})`;e.fillRect(256,y,256,1);}
    const grime=e.createLinearGradient(0,0,0,90);grime.addColorStop(0,'rgba(74,50,26,.5)');grime.addColorStop(1,'rgba(74,50,26,0)');
    e.fillStyle=grime;e.fillRect(256,0,256,256);
    for(let i=0;i<5;i++){const x=290+rnd()*190,g=e.createRadialGradient(x,60,0,x,60,40+rnd()*30);
      g.addColorStop(0,'rgba(70,52,34,.28)');g.addColorStop(1,'rgba(70,52,34,0)');e.fillStyle=g;e.fillRect(256,0,256,256);}
    for(let i=0;i<40;i++){e.fillStyle=`rgba(128,74,32,${.2+rnd()*.3})`;e.fillRect(256+rnd()*256,rnd()*256,1+rnd()*2,1+rnd()*2);}
    e.fillStyle='#d6c49c';e.fillRect(0,240,16,16);}
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
  // The spine shares the boards' leather: open, as a book's back is when it
  // lies open, a half round under the gutter that falls toward the front
  // with it, in the boards' dark, unworn grain. The sewing thread shows in
  // the fold as four runs between the stations, linen, sharing the block's
  // map (its corner patch).
  const fall=Math.atan(.027/.091);
  const spine=new THREE.CylinderGeometry(.013,.013,.2,10,1,true,-Math.PI/2,Math.PI).rotateX(Math.PI/2).rotateX(fall)
    .translate(0,pageHeight(0,0)-.04,0),su=spine.attributes.uv;
  for(let i=0;i<su.count;i++)su.setXY(i,.05+su.getX(i)*.3,.2+su.getY(i)*.6);
  mesh(merged([...covers,spine]),leather);
  const stitches=[];
  for(const z of [-.06,-.02,.02,.06]) {
    const s=new THREE.BoxGeometry(.0007,.0006,.03).rotateX(fall).translate(0,pageHeight(0,z/.091)-.0012,z),t=s.attributes.uv;
    for(let k=0;k<t.count;k++)t.setXY(k,.01,.02);
    stitches.push(s);
  }
  mesh(merged([...blocks,...stitches]),edges);
  mesh(merged(corners),gold);
  // Both leaves in one mesh and one material: parchment and ink side by side
  // in one atlas that runs out from the gutter, so the left leaf, written
  // with its gutter on the right, goes in mirrored.
  const L=leafCanvases(125,true,true),R=leafCanvases(256,false,false);
  const atlas=(l,r)=>{const c=document.createElement('canvas');c.width=1024;c.height=512;const x=c.getContext('2d');
    x.save();x.translate(512,0);x.scale(-1,1);x.drawImage(l,0,0);x.restore();x.drawImage(r,512,0);return c;};
  const map=a.own(new THREE.CanvasTexture(atlas(L.paper,R.paper))),emissiveMap=a.own(new THREE.CanvasTexture(atlas(L.light,R.light)));
  map.colorSpace=emissiveMap.colorSpace=THREE.SRGBColorSpace;
  const parchment=material({map,emissiveMap,color:'#e3d8c2',emissive:'#3f93ff',emissiveIntensity:1.2,roughness:.86,side:THREE.DoubleSide});
  // The ink's light: a slow breath running along the lines; on hover it
  // wakes in reading order, down the left leaf and then the right, a bright
  // crest at the line being read.
  const glow={uWake:{value:0},uRead:{value:0},uTime:{value:0}};
  parchment.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,glow);
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>','#include <common>\nuniform float uWake; uniform float uRead; uniform float uTime;')
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        float read=(step(.5,vEmissiveMapUv.x)+1.-vEmissiveMapUv.y)*.5;
        float woken=1.-smoothstep(uRead-.06,uRead,read),crest=exp(-pow((read-uRead)/.022,2.))*step(uRead,1.);
        totalEmissiveRadiance*=(1.+.07*sin(uTime*1.2-read*18.))*(.8+uWake*(.5+.7*woken+1.4*crest));`);
  };
  const leaves=mesh(mergedIndexed(leafGrids),parchment);leaves.name='curved illuminated pages';
  const resting=Float32Array.from(leaves.geometry.attributes.position.array);
  const silk=material({color:'#185f83',roughness:.65,metalness:.12,side:THREE.DoubleSide});
  const ribbon=new THREE.Shape();ribbon.moveTo(-.005,0);ribbon.lineTo(.005,0);ribbon.lineTo(.006,-.055);ribbon.lineTo(0,-.050);ribbon.lineTo(-.005,-.058);ribbon.closePath();
  mesh(new THREE.ShapeGeometry(ribbon).rotateX(.2).translate(.010,.098,.082),silk);

  // Six words of the hand that lift from the written lines, turn a little
  // and fade, in one draw call: each picks its word from an atlas (its ink
  // is the alpha) and its own spin; alpha carries the fade. Blended
  // normally, they stay blue over the nook's bright wall as over the dark.
  // size is in metres, at any lens.
  const words=a.own(new THREE.CanvasTexture(liftedWords(77)));
  const COUNT=6,lift=a.own(new THREE.BufferGeometry());
  for(const [name,size] of [['position',3],['color',4],['cell',1],['spin',1],['grow',1]])
    lift.setAttribute(name,new THREE.Float32BufferAttribute(new Float32Array(COUNT*size),size));
  const ink=a.own(new THREE.PointsMaterial({map:words,color:'#63b8ff',size:.032,vertexColors:true,transparent:true,depthWrite:false}));
  ink.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nattribute float cell; attribute float spin; attribute float grow; varying float vCell; varying float vSpin;')
      .replace('gl_PointSize = size;','vCell=cell;vSpin=spin;\n\tgl_PointSize=size*grow*projectionMatrix[1][1];');
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>','#include <common>\nvarying float vCell; varying float vSpin;')
      .replace('#include <map_particle_fragment>',`vec2 pc=mat2(cos(vSpin),-sin(vSpin),sin(vSpin),cos(vSpin))*(gl_PointCoord-.5)+.5;
        if(any(lessThan(pc,vec2(0.)))||any(greaterThan(pc,vec2(1.))))discard;
        float written=texture2D(map,vec2((mod(vCell,4.)+pc.x)/4.,1.-(floor(vCell/4.)+pc.y)/2.)).g;
        diffuseColor.rgb*=.7+.5*written;diffuseColor.a*=written;`);
  };
  const glyphs=new THREE.Points(lift,ink);
  glyphs.name='lifted blue glyphs';glyphs.visible=false;glyphs.frustumCulled=false;group.add(glyphs);
  const spots=[...L.spots.map(([u,v])=>[-1,u,v]),...R.spots.map(([u,v])=>[1,u,v])];
  const pick=n=>{const x=Math.sin(n)*43758.5453;return x-Math.floor(x);};
  let read=0;
  function update(time,delta) {
    const s=a.step(time,delta);if(!s)return;
    const {t,dt,hover:h,awake,reduced}=s;
    read=reduced?(awake?1.1:0):clamp(read+(awake?dt/2.4:-dt/1.2),0,1.1);
    glow.uWake.value=h;glow.uRead.value=read;glow.uTime.value=t;
    // The leaves stir at their fore-edges; awake, the right one lifts a
    // little, as if about to turn.
    const p=leaves.geometry.attributes.position;
    for(let i=0;i<p.count;i++) {
      const [u,v,side]=flutter[i];
      p.setY(i,resting[i*3+1]+(reduced?0:u*u*u*(.0018*Math.sin(t*1.7+v*4+side)+(side>0?h*.006*(.75+.25*Math.sin(t*1.1)):0))));
    }
    p.needsUpdate=true;
    glyphs.visible=!reduced&&h>.006;
    if(!glyphs.visible)return;
    const q=lift.attributes.position,tint=lift.attributes.color,cell=lift.attributes.cell,spin=lift.attributes.spin,grow=lift.attributes.grow;
    for(let i=0;i<COUNT;i++) {
      // Each word rises over about 3.6 s from a written spot, chosen afresh
      // every time round.
      const clock=t*.28+i/COUNT,round=Math.floor(clock),life=clock-round;
      const [side,u,v]=spots[Math.floor(pick(round*12.9898+i*78.233)*spots.length)],z=v*2-1;
      const fade=h*Math.sin(life*Math.PI)**2;
      q.setXYZ(i,side*(.003+u*.134)+.008*Math.sin(life*4.5+i),pageHeight(u,z)+.006+Math.pow(life,.75)*.11,z*.091+life*.025);
      tint.setXYZW(i,1,1,1,fade);
      cell.setX(i,Math.floor(pick(round*3.7+i*1.91)*8));
      spin.setX(i,(life-.5)*(pick(round+i*1.3)<.5?-.9:.9));
      grow.setX(i,.75+.4*life);
    }
    q.needsUpdate=tint.needsUpdate=cell.needsUpdate=spin.needsUpdate=grow.needsUpdate=true;
  }
  update(0,0);
  group.userData.footprint={width:.30,depth:.20,height:.17};
  return {group,update,setHover:a.setHover,dispose:a.dispose};
}

/** Bronze-mounted glass holding a turning mist, marched as the room's orb is. */
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

  // One sphere is the glass and the mist inside it, marched as the room's
  // orb is (portal-orb-material.js), in its palette: refracted in, the eye
  // crosses a mist sphere 10% smaller than the ball in ten steps. Layers
  // turn about the vertical at different rates; the mist absorbs, its veins,
  // pockets and teal heart glow, so what is near hides what is far and the
  // depth moves as the eye does. The glints and the rim's wrap of light come
  // from the scene's own lights, so the nook's lamp shows in the glass;
  // where the eye passes through glass alone, the ball turns clear.
  const mist=a.own(new THREE.ShaderMaterial({
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.lights,{uTime:{value:0},uSwirl:{value:0},uHover:{value:0}}]),
    lights:true,transparent:true,
    vertexShader:`varying vec3 vLocal; varying vec3 vEye; varying vec3 vViewPosition; varying vec3 vViewNormal;
      void main(){
        vLocal=position/.105; vec4 w=modelMatrix*vec4(position,1.);
        vec3 eye=cameraPosition-w.xyz;
        vEye=vec3(dot(eye,modelMatrix[0].xyz),dot(eye,modelMatrix[1].xyz),dot(eye,modelMatrix[2].xyz));
        vec4 mv=viewMatrix*w; vViewPosition=-mv.xyz; vViewNormal=normalize(normalMatrix*normal);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`#include <common>
      #include <lights_pars_begin>
      uniform float uTime; uniform float uSwirl; uniform float uHover;
      varying vec3 vLocal; varying vec3 vEye; varying vec3 vViewPosition; varying vec3 vViewNormal;
      float hash(vec3 p){p=fract(p*vec3(.1031,.103,.0973));p+=dot(p,p.yxz+33.33);return fract((p.x+p.y)*p.z);}
      float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
        mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      vec3 spin(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}
      void main(){
        vec3 P=vLocal,N=normalize(P),V=normalize(vEye);
        float ndv=clamp(dot(N,V),0.,1.),edge=1.-ndv,fresnel=.04+.96*pow(edge,5.);
        vec3 rd=refract(-V,N,.72); if(dot(rd,rd)<.01) rd=-V;
        float b=dot(P,rd),disc=b*b-(dot(P,P)-.81);
        vec3 hueA=vec3(.04,.34,.31),hueB=vec3(.24,.12,.50),heartColor=vec3(.14,.82,.64);
        vec3 inner=vec3(0.); float T=1.;
        if(disc>0.){
          float root=sqrt(disc),s0=-b-root,dt=root*.2;
          for(int i=0;i<10;i++){
            vec3 q=(P+rd*(s0+(float(i)+.5)*dt))/.9;
            float r=length(q);
            vec3 a=spin(q,uSwirl*(1.35-r*.6)+r*1.6),w=spin(q,-uSwirl*.55+2.1);
            float cloud=noise3(a*2.2+vec3(0.,0.,uTime*.05))*.65+noise3(w*4.1-vec3(uTime*.04,0.,0.))*.35;
            float dens=smoothstep(.35,.75,cloud);
            // Currents run only where a slow, larger field lets them.
            float current=smoothstep(.4,.75,noise3(w*.9+vec3(-uTime*.02,.6,uTime*.015)));
            float vein=pow(1.-abs(noise3(a*2.4+vec3(1.7,-uTime*.035,.4))*2.-1.),12.)*current;
            float pocket=smoothstep(.62,.9,noise3(w*1.25+vec3(uTime*.03,1.1,-uTime*.02)));
            float heart=exp(-r*r*7.);
            vec3 hue=mix(hueA,hueB,smoothstep(-.55,.55,a.x+.35*a.y));
            vec3 glow=hue*(dens*.02+vein*(.55+.3*uHover)+pocket*.16)+heartColor*heart*(.5+.5*uHover);
            inner+=T*glow*dt*2.2;
            T*=exp(-(.5+dens*3.)*dt);
          }
        }
        // Past the mist, the far side of the glass: dark, a little warm below.
        inner+=T*mix(vec3(.006,.008,.009),vec3(.016,.012,.008),smoothstep(.3,-.6,rd.y));
        float filled=smoothstep(0.,.04,disc);
        // The skin, in view space.
        vec3 Nv=normalize(vViewNormal),Vv=normalize(vViewPosition),R=reflect(-Vv,Nv);
        vec3 glints=vec3(0.),wrap=vec3(0.),sky=vec3(.006,.007,.009);
        #if NUM_POINT_LIGHTS > 0
        PointLight lamp;
        // three.js unrolls this loop by copying its body; the inner block
        // keeps each copy's locals to itself.
        #pragma unroll_loop_start
        for(int i=0;i<NUM_POINT_LIGHTS;i++){{
          lamp=pointLights[ i ];
          vec3 toLight=lamp.position+vViewPosition;float d=length(toLight);vec3 L=toLight/d;
          vec3 C=lamp.color*getDistanceAttenuation(d,lamp.distance,lamp.decay);
          float nh=max(dot(Nv,normalize(L+Vv)),0.);
          glints+=mix(C,vec3(dot(C,vec3(.333))),.55)*(pow(nh,1200.)*2.2+pow(nh,90.)*.12+pow(nh,16.)*.003);
          wrap+=C*pow(edge,4.5)*smoothstep(-.1,.6,dot(Nv,L))*max(0.,.5-.5*dot(L,Vv));
        }}
        #pragma unroll_loop_end
        #endif
        #if NUM_HEMI_LIGHTS > 0
        #pragma unroll_loop_start
        for(int i=0;i<NUM_HEMI_LIGHTS;i++){
          sky+=mix(hemisphereLights[ i ].groundColor,hemisphereLights[ i ].skyColor,dot(R,hemisphereLights[ i ].direction)*.5+.5)*.25;
        }
        #pragma unroll_loop_end
        #endif
        vec3 skin=glints*.06+sky*fresnel+wrap*.02;
        // The heart's light gathers along the inner edge: teal one side, violet the other.
        skin+=mix(vec3(.006,.05,.042),vec3(.035,.016,.075),smoothstep(-.6,.6,N.x))*pow(edge,4.)*(2.2+1.4*uHover);
        vec3 color=mix(vec3(.055,.085,.082)*.35,inner,filled)*(1.-fresnel)+skin;
        gl_FragColor=vec4(color,mix(.42,1.,filled));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const center=.211;
  const globe=mesh(new THREE.SphereGeometry(.105,32,18),mist);globe.position.y=center;globe.name='glass and mist';
  // The mist turns slowly about the vertical, three times as fast awake;
  // its drift runs on its own clock.
  let swirl=0,drift=0;
  function update(time,delta) {
    const s=a.step(time,delta);if(!s)return;
    if(!s.reduced){swirl+=s.dt*(.16+.34*s.hover);drift+=s.dt*(1+s.hover*2.1);}
    mist.uniforms.uSwirl.value=swirl;mist.uniforms.uTime.value=drift;mist.uniforms.uHover.value=s.hover;
  }
  update(0,0);
  group.userData.footprint={width:.23,depth:.23,height:.316};
  return {group,update,setHover:a.setHover,dispose:a.dispose};
}
