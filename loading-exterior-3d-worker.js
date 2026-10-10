/* The exterior in real 3D, drawn in a worker on an OffscreenCanvas
   (loading-exterior-3d.js), so it keeps moving while the page's main thread
   builds the room. The same building as dev/exterior-art.html, as geometry:
   the body (crown, dome, drum, lips, bowl, neck and bead) and the tower
   (foot, shaft, swell, spire) are each one turned profile; five drips hang
   from the lower lip; the entrance is a real pointed tunnel through the
   drum with the room's light at its end. Shaded live with the portal orb's
   material (portal-orb-material.js): the inside turning in layers, the teal
   heart (and its glow sunk into the drop), sparse currents, mist, a Fresnel
   skin with a thin film, light wrapping the edges, thin glass letting light
   through. The camera drifts slowly round it; now and then a drop leaves
   the bead and falls; the spire's tip glints. On 'fly' the view goes in
   through the entrance.

   Messages in: init {canvas, width, height, still}, resize {width, height},
   fly {duration}, still {value}, pause, play. Out: drawn (first frame),
   flown, failed {message}. */
'use strict';
let gl, programs, meshes, width = 1, height = 1, square = null, still = false, paused = false, start = 0, flight = null, drawnSent = false;
// Its own clock, which a check may slow down (rate) to film the way in.
let rate = 1, clock = 0, lastReal = null, debugView = 0;
const tick = real => { if (lastReal !== null) clock += (real - lastReal) * rate; lastReal = real; return clock; };
// While the room is still being built the view is lighter (the GPU is
// shared with the room's start-up): fewer pixels, fewer steps through the
// glass, fewer frames. For the way in, full quality.
const LIGHT = {scale: .7, steps: 12, frameMs: 1000 / 15}, FULL = {scale: 1, steps: 16, frameMs: 1000 / 30};
let quality = LIGHT, cssWidth = 1, cssHeight = 1, cssSquare = null;

// ---- The building's shapes (as dev/exterior-art.html) ----------------------
const TOWER = [.84, 0, -.52];
const DOOR = {a: .2, spring: -.1, sill: -.44, back: .42};
const BEAD = [0, -1.45, 0];
const CAMERA = {target: [.1, .42, 0], distance: 12.4, yaw: -.2, pitch: -.07, fov: .405};

const smaxR = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * .25; };
const ell = (y, c, rx, ry) => Math.abs(y - c) < ry ? rx * Math.sqrt(1 - ((y - c) / ry) ** 2) : -1;
const cone = (y, y0, r0, y1, r1, power = 1) => y >= Math.min(y0, y1) && y <= Math.max(y0, y1) ? r0 + (r1 - r0) * Math.pow((y - y0) / (y1 - y0), power) : -1;
// The body's radius at height y.
function bodyRadius(y) {
  // A fuller, rounder mass: the dome an orb's upper half, the drum swelling
  // a little between its lips as the orb's own curve continues.
  let r = ell(y, .14, 1.07, .98);
  r = smaxR(r, cone(y, .96, .15, 1.44, .0, 1.25), .1);
  const drum = y <= .1 && y >= -.5 ? 1.0 + .03 * (1 - ((y + .2) / .3) ** 2) - .02 * Math.max(0, (Math.abs(y + .2) - .26) / .04) : -1;
  r = smaxR(r, drum, .05);
  r = smaxR(r, y > .02 && y < .18 ? 1.02 + .035 * Math.sqrt(Math.max(0, 1 - ((y - .1) / .06) ** 2)) : -1, .02);
  r = smaxR(r, y > -.58 && y < -.42 ? .995 + .045 * Math.sqrt(Math.max(0, 1 - ((y + .5) / .07) ** 2)) : -1, .02);
  r = smaxR(r, ell(y, -.52, .94, .36), .12);
  r = smaxR(r, cone(y, -1.38, .018, -.56, .66, 2.2), .22);
  r = smaxR(r, ell(y, BEAD[1], .082, .092), .035);
  return Math.max(r, 0);
}
// The tower's radius at height y (about its own axis).
function towerRadius(y) {
  let r = ell(y, -1.13, .03, .03);
  r = smaxR(r, cone(y, -1.12, .016, -.68, .24), .04);
  r = smaxR(r, cone(y, -.7, .27, 1.34, .2), .1);
  r = smaxR(r, ell(y, 1.36, .215, .3), .1);
  r = smaxR(r, cone(y, 1.42, .18, 2.7, .003, 1.15), .12);
  return Math.max(r, 0);
}
function dripRadius(len, bead) {
  return y => { // y from 0 (the lip) down to -len
    let r = cone(y, 0, .05, -len, .014, .8);
    if (bead) r = smaxR(r, ell(y, -len - .006, .032, .032), .025);
    return Math.max(r, 0);
  };
}

// A surface turned about a vertical axis from a radius profile r(y), from
// yTop down to yBottom; normals from the profile's slope.
function lathe(profile, yTop, yBottom, rows, segments, at = [0, 0, 0]) {
  const pos = [], nor = [], idx = [];
  for (let i = 0; i <= rows; i++) {
    // (A profile is negative outside its shape: never a negative radius.)
    const R = y => Math.max(0, profile(y));
    const y = yTop + (yBottom - yTop) * i / rows, r = R(y);
    const dy = (yBottom - yTop) / rows * .5, dr = (R(y + dy) - R(y - dy)) / (2 * dy);
    for (let j = 0; j <= segments; j++) {
      const a = j / segments * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      pos.push(at[0] + r * c, at[1] + y, at[2] + r * s);
      const n = [c, -dr, s], l = Math.hypot(...n);
      nor.push(n[0] / l, n[1] / l, n[2] / l);
    }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < segments; j++) {
    const a = i * (segments + 1) + j, b = a + segments + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return {pos, nor, idx};
}
// The entrance's outline (a pointed arch), counter-clockwise from the sill's
// left end, in the drum's front plane.
function archOutline(a, y0, ys, steps = 20) {
  const pts = [[-a, ys], [-a, y0]];
  for (let i = 1; i <= steps; i++) { const t = Math.PI - i / steps * Math.PI / 3; pts.push([a + 2 * a * Math.cos(t), y0 + 2 * a * Math.sin(t)]); }
  for (let i = 1; i <= steps; i++) { const t = Math.PI / 3 - i / steps * Math.PI / 3; pts.push([-a + 2 * a * Math.cos(t), y0 + 2 * a * Math.sin(t)]); }
  pts.push([a, ys]);
  return pts;
}
// The tunnel through the drum: walls from the drum's surface back to the far
// wall, normals facing in.
function tunnel() {
  const pts = archOutline(DOOR.a, DOOR.spring, DOOR.sill);
  pts.push(pts[0]);
  const pos = [], nor = [], idx = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const zf0 = Math.sqrt(Math.max(0, 1 - x0 * x0)) + .01, zf1 = Math.sqrt(Math.max(0, 1 - x1 * x1)) + .01;
    // Inward normal: the outline runs counter-clockwise, so in is to the left.
    const ex = x1 - x0, ey = y1 - y0, l = Math.hypot(ex, ey) || 1, n = [-ey / l, ex / l, 0];
    const base = pos.length / 3;
    pos.push(x0, y0, zf0, x1, y1, zf1, x0, y0, DOOR.back, x1, y1, DOOR.back);
    for (let k = 0; k < 4; k++) nor.push(...n);
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  return {pos, nor, idx};
}
// The far wall: the arch filled, at the tunnel's end.
function farWall() {
  const pts = archOutline(DOOR.a, DOOR.spring, DOOR.sill);
  const pos = [0, (DOOR.sill + DOOR.spring) / 2, DOOR.back], nor = [0, 0, 1], idx = [];
  for (const [x, y] of pts) { pos.push(x, y, DOOR.back); nor.push(0, 0, 1); }
  for (let i = 1; i < pts.length; i++) idx.push(0, i, i + 1 <= pts.length ? i + 1 : 1);
  idx.push(0, pts.length, 1);
  return {pos, nor, idx};
}
// A thin round frame along the entrance's outline, standing on the drum.
function doorFrame() {
  const pts = archOutline(DOOR.a + .03, DOOR.spring, DOOR.sill - .02, 28);
  const pos = [], nor = [], idx = [], ring = 10, rad = .022;
  pts.forEach(([x, y], i) => {
    const [nx, ny] = pts[Math.min(i + 1, pts.length - 1)], [px, py] = pts[Math.max(i - 1, 0)];
    const tx = nx - px, ty = ny - py, tl = Math.hypot(tx, ty) || 1;
    const side = [ty / tl, -tx / tl, 0], z = Math.sqrt(Math.max(0, 1 - x * x)) + .005;
    for (let k = 0; k <= ring; k++) {
      const a = k / ring * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const n = [side[0] * c, side[1] * c, s];
      pos.push(x + n[0] * rad, y + n[1] * rad, z + n[2] * rad); nor.push(...n);
    }
  });
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < ring; k++) {
    const a = i * (ring + 1) + k, b = a + ring + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return {pos, nor, idx};
}
const DRIPS = [[.42, .24, 0], [1.12, .44, 1], [1.98, .14, 0], [2.46, .52, 1], [2.92, .3, 0]];
// A drip: a tube that leaves the lower lip, runs down the bowl's curve just
// proud of its surface and, below the bowl's widest reach, hangs free; it
// thins as it goes and may end in a bead.
function drip(angle, length, bead) {
  const pos = [], nor = [], idx = [], rows = 36, ring = 14;
  const c = Math.cos(angle), s = Math.sin(angle);
  const path = [];
  for (let i = 0; i <= rows; i++) {
    const u = i / rows, y = -.5 - length * u;
    // Thin where it leaves the lip, gathering as it runs, narrowing at its end.
    const thick = .014 + .026 * Math.sin(Math.PI * Math.min(1, u * .8 + .1)) * (1 - .35 * u);
    // It runs down the body's own surface, half sunk in it, toward the neck.
    const r = Math.max(bodyRadius(y) + thick * .3, .05);
    path.push({y, r: i === 0 ? 1.0 : r, thick});
  }
  path.forEach((p, i) => {
    const prev = path[Math.max(0, i - 1)], next = path[Math.min(rows, i + 1)];
    const tangent = normz([(next.r - prev.r) * c, next.y - prev.y, (next.r - prev.r) * s]);
    const radial = [c, 0, s], side = normz(cross(tangent, radial)), out = normz(cross(side, tangent));
    for (let k = 0; k <= ring; k++) {
      const a = k / ring * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const n = add(scale(out, ca), scale(side, sa));
      pos.push(p.r * c + n[0] * p.thick, p.y + n[1] * p.thick, p.r * s + n[2] * p.thick); nor.push(...n);
    }
  });
  for (let i = 0; i < rows; i++) for (let k = 0; k < ring; k++) {
    const a = i * (ring + 1) + k, b = a + ring + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // The end: a bead, or a rounded tip.
  const end = path[rows], tipR = bead ? .03 : .014, base = pos.length / 3, centre = [end.r * c, end.y - (bead ? .018 : .004), end.r * s];
  const tip = lathe(y => ell(y, 0, tipR, tipR), tipR, -tipR, 10, 14, centre);
  for (let i = 0; i < tip.pos.length; i++) { pos.push(tip.pos[i]); nor.push(tip.nor[i]); }
  for (const i of tip.idx) idx.push(base + i);
  return {pos, nor, idx};
}

// ---- Shaders ----------------------------------------------------------------
const NOISE = `
float hash3(vec3 p) { p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1., 0., 0.)), f.x), mix(hash3(i + vec3(0., 1., 0.)), hash3(i + vec3(1., 1., 0.)), f.x), f.y),
    mix(mix(hash3(i + vec3(0., 0., 1.)), hash3(i + vec3(1., 0., 1.)), f.x), mix(hash3(i + vec3(0., 1., 1.)), hash3(i + vec3(1., 1., 1.)), f.x), f.y), f.z);
}`;
const GLASS_VERTEX = `precision highp float;
attribute vec3 position, normal;
uniform mat4 viewProj;
uniform vec3 offset;
uniform vec2 stretch;   // the falling drop: scale across, along
uniform float molten;
varying vec3 vPos, vNormal, vObj;
${NOISE}
void main() {
  vObj = position;
  vec3 p = position;
  // Molten: the glass is never machine-perfect.
  p += normal * ((vnoise(p * 2.6 + 3.1) - .5) * .02 + (vnoise(p * 7.3 + 1.7) - .5) * .006) * molten;
  p = vec3(p.x * stretch.x, p.y * stretch.y, p.z * stretch.x) + offset;
  vPos = p; vNormal = normal;
  gl_Position = viewProj * vec4(p, 1.);
}`;
const GLASS_FRAGMENT = `precision highp float;
varying vec3 vPos, vNormal, vObj;
uniform vec3 camPos;
uniform float time, part, alpha, approach, steps, debugView;
const vec3 DOME = vec3(0., .14, 0.);
const vec3 TOWER = vec3(${TOWER.join(', ')});
${NOISE}
vec3 spinAbout(vec3 p, float angle) { float c = cos(angle), s = sin(angle); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
float sdArch(vec2 p, float a, float y0, float ys) {
  float upper = max(max(length(p - vec2(a, y0)) - 2. * a, length(p - vec2(-a, y0)) - 2. * a), ys - p.y);
  vec2 d = abs(p - vec2(0., (y0 + ys) * .5)) - vec2(a, (y0 - ys) * .5);
  return min(upper, min(max(d.x, d.y), 0.) + length(max(d, 0.)));
}
vec3 lightDir(int i) {
  if (i == 0) return normalize(vec3(-.55, .8, .55));
  if (i == 1) return normalize(vec3(-.95, .15, -.55));
  if (i == 2) return normalize(vec3(.9, .35, -.6));
  if (i == 3) return normalize(vec3(.15, -.7, .75));
  return normalize(vec3(.2, 1., .2));
}
vec3 lightCol(int i) {
  if (i == 0) return vec3(.62, .68, .74);
  if (i == 1) return vec3(.12, .62, .46);
  if (i == 2) return vec3(.46, .22, .78);
  if (i == 3) return vec3(.42, .26, .12) * .5;
  return vec3(.08, .1, .14);
}
vec3 voidLight(vec3 R) {
  vec3 c = mix(vec3(.002, .002, .004), vec3(.012, .01, .02), smoothstep(-.3, .9, R.y));
  c += vec3(.02, .05, .045) * pow(max(0., -R.x * .7 + .3), 3.) + vec3(.04, .02, .06) * pow(max(0., R.x * .7 + .2), 3.);
  for (int i = 0; i < 5; i++) { float d = dot(R, lightDir(i)); c += lightCol(i) * (exp((d - 1.) * 9.) * .025 + exp((d - 1.) * 120.) * .2); }
  return c;
}
vec3 display(vec3 c) { c = 1. - exp(-c * 1.15); return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(vec3(.0031308), c)); }
// Whether a point is inside the glass (a cheap stand-in for the shape).
float inGlass(vec3 q) {
  vec3 d = (q - DOME) / vec3(1.07, .98, 1.07);
  float r = length(q.xz);
  float body = max(step(dot(d, d), 1.), step(r, 1.02) * step(-.5, q.y) * step(q.y, .1));
  vec3 b = (q - vec3(0., -.52, 0.)) / vec3(.94, .36, .94);
  body = max(body, step(dot(b, b), 1.));
  body = max(body, step(r, mix(.018, .56, clamp((q.y + 1.38) / .84, 0., 1.))) * step(-1.4, q.y) * step(q.y, -.5));
  vec3 t = q - TOWER;
  float tower = step(length(t.xz), mix(.27, .2, clamp((t.y + .7) / 2.04, 0., 1.))) * step(-.9, t.y) * step(t.y, 2.4);
  return max(body, tower);
}
float fbm3(vec3 p) { return vnoise(p) * .55 + vnoise(p * 2.07 + 3.1) * .3 + vnoise(p * 4.13 + 7.7) * .15; }
// The inside, as the orb's, enlarged into the building's mass. Layers turn
// about the body's axis, each at its own rate and twisting with height;
// the flow folds on itself (warped), and through it wind broad marbled
// ribbons of teal and aqua (violet where the field turns), with bright
// cores; a cloudy mist makes darker and brighter zones; the teal heart
// glows deep inside, and sunk into the drop. The view goes nearly two
// units into the glass: currents near the surface read crisp, deeper ones
// dimmer and softer, so they hang inside rather than lie on top. Up the
// tower a current also spirals toward the spire.
vec3 inside(vec3 P, vec3 rd, out float T) {
  vec3 inner = vec3(0.); T = 1.;
  float stepLen = 1.8 / steps;
  for (int i = 0; i < 16; i++) {
    if (float(i) >= steps) break;
    vec3 q = P + rd * (float(i) + .5) * stepLen;
    if (inGlass(q) < .5) break;
    bool inTower = length((q - TOWER).xz) < .34 && q.y > -.2;
    vec3 c = inTower ? vec3(TOWER.x, clamp(q.y, .1, 1.7), TOWER.z) : DOME;
    vec3 lq = (q - c) / (inTower ? .36 : 1.);
    float r = length(lq);
    vec3 a = spinAbout(lq, time * .11 * (1.4 - r * .6) + lq.y * 1.3 + r * 1.1);
    vec3 fold = vec3(vnoise(a * 1.2 + vec3(0., time * .03, 0.)), vnoise(a * 1.2 + vec3(5.2, -time * .025, 1.3)), vnoise(a * 1.2 + vec3(2.7, 0., 8.1)));
    vec3 wq = a + (fold - .5) * 1.15;
    float band = 1. - abs(sin(wq.y * 1.45 + fbm3(wq * .8) * 4.6 + r * 1.7));
    float broad = pow(band, 5.), core = pow(band, 16.);
    // Large zones where the currents gather, and others nearly empty.
    float zone = smoothstep(.32, .72, vnoise(a * .62 + vec3(9.1, time * .02, 3.3)));
    float dens = smoothstep(.32, .72, fbm3(a * 2.3 + vec3(1.3, time * .04, 0.)));
    float turn = smoothstep(.38, .72, vnoise(wq * .7 + 4.));
    vec3 ribbon = mix(vec3(.05, .44, .4), vec3(.28, .15, .58), turn * .75);
    vec3 glow = ribbon * (broad * 1.1 + core * 3.6) * (.35 + 1.1 * dens) * (.05 + 1.4 * zone) + vec3(.003, .014, .016) * dens * dens;
    // Soft luminous clouds where the currents gather: the brighter zones.
    glow += mix(vec3(.03, .2, .19), vec3(.12, .07, .24), turn) * dens * zone * zone * .55;
    float heart = exp(-r * r * (inTower ? 4. : 6.5)) * (inTower ? .14 : .3) * (1. + .3 * sin(time * .46));
    if (!inTower) { vec3 s = q - vec3(0., -.86, 0.); heart += exp(-dot(s, s) * 9.) * .3 * (1. + .3 * sin(time * .46 + 1.4)); }
    glow += vec3(.14, .82, .64) * heart * .6;
    if (inTower) {
      vec3 tq = q - TOWER;
      float helix = pow(max(0., cos(atan(tq.z, tq.x) * 2. - tq.y * 6.2 + time * .5)), 30.) * smoothstep(.08, .2, length(tq.xz));
      glow += mix(vec3(.08, .62, .52), vec3(.42, .2, .74), smoothstep(.2, 2.2, tq.y)) * helix * .9;
    }
    inner += T * glow * stepLen * 2.;
    T *= exp(-(.85 + dens * 3.4) * stepLen);
  }
  return inner;
}
vec3 roomThrough(vec3 p) {
  vec2 u = vec2(p.x / .2, (p.y + .44) / (-.1 + .2 * 1.732 + .44));
  vec3 warm = vec3(1., .55, .24) * exp(-pow(u.x / .55, 2.)) * exp(-pow((u.y - .1) / .22, 2.)) * 1.1
    + vec3(.9, .5, .22) * exp(-pow(u.x / .3, 2.)) * exp(-pow((u.y - .42) / .18, 2.)) * .35;
  vec3 sides = mix(vec3(.04, .36, .28), vec3(.3, .13, .52), smoothstep(-1., 1., u.x)) * .32 * smoothstep(.3, 1., abs(u.x));
  vec3 deep = mix(vec3(.03, .035, .04), vec3(.006, .014, .018), smoothstep(.15, .85, u.y));
  return (warm + sides + deep) * (1. - .55 * smoothstep(.55, 1., abs(u.x)));
}
vec3 windowLight(vec3 P) {
  vec3 c = vec3(0.);
  if (P.z > .55) for (int i = 0; i < 2; i++) {
    float side = i == 0 ? -1. : 1.;
    float w = sdArch(vec2(P.x - side * .6, P.y), .03, -.06, -.26);
    c += vec3(.16, .4, .5) * (smoothstep(.006, -.012, w) * .9 + smoothstep(.06, -.01, w) * .18);
  }
  vec3 tf = P - TOWER;
  if (tf.z > .04) for (int i = 0; i < 2; i++) {
    float y0 = i == 0 ? .9 : 1.24;
    float w = sdArch(vec2(tf.x + .02, tf.y), .032, y0, y0 - .18);
    c += mix(vec3(.08, .5, .44), vec3(.4, .2, .7), float(i)) * (smoothstep(.006, -.012, w) * .9 + smoothstep(.06, -.01, w) * .18);
  }
  return c;
}
void main() {
  // part: 0 body (with the entrance cut through it), 1 tower, drips and
  // the falling drop, 2 the entrance's walls and frame, 3 the far wall.
  if (part < .5 && vObj.z > .4 && sdArch(vObj.xy, .2, -.1, -.44) < 0.) discard;
  if (part > 2.5) { gl_FragColor = vec4(display(roomThrough(vPos) * (1. + approach * .6)), 1.); return; }
  vec3 N = normalize(vNormal), V = normalize(camPos - vPos);
  if (dot(N, V) < 0. && part > 1.5) N = -N;
  // A slow liquid undulation in the skin, so its reflections never sit still.
  if (part < 1.5) {
    vec3 lp = vPos * 2.4 + vec3(0., time * .07, time * .05);
    vec3 g = vec3(vnoise(lp + vec3(.05, 0., 0.)) - vnoise(lp - vec3(.05, 0., 0.)), vnoise(lp + vec3(0., .05, 0.)) - vnoise(lp - vec3(0., .05, 0.)), vnoise(lp + vec3(0., 0., .05)) - vnoise(lp - vec3(0., 0., .05)));
    N = normalize(N - g * .35);
  }
  float ndv = clamp(dot(N, V), 0., 1.), edge = 1. - ndv;
  float fresnel = .04 + .96 * pow(edge, 5.);
  vec3 rd = refract(-V, N, .76);
  if (dot(rd, rd) < .01) rd = -V;
  float T;
  vec3 inner = inside(vPos, rd, T);
  vec3 diffuse = vec3(0.), specular = vec3(0.), wrap = vec3(0.);
  for (int i = 0; i < 5; i++) {
    vec3 L = lightDir(i), C = lightCol(i);
    float wr = max(0., (dot(N, L) + .4) / 1.4);
    diffuse += C * wr * wr;
    float nh = max(dot(N, normalize(L + V)), 0.);
    float crisp = i == 0 || i == 3 ? 1. : 0.;
    // Highlights as the orb's: a crisp core with a small soft halo; no broad
    // sheen (that greys the whole shell and makes it read as plastic).
    specular += mix(C, vec3(dot(C, vec3(.333))), .55) * (crisp * (pow(nh, 420.) * 1.2 + pow(nh, 80.) * .12) + pow(nh, 30.) * .012 * (1. - crisp));
    wrap += C * pow(edge, 4.5) * smoothstep(-.1, .6, dot(N, L)) * max(0., .5 - .5 * dot(L, V));
  }
  // The shell itself stays dark and clear: what light it has is its
  // highlights, the void mirrored at grazing angles, and its edges.
  vec3 skin = specular + voidLight(reflect(-V, N)) * fresnel * .8 + wrap * .5;
  skin += mix(vec3(.006, .05, .042), vec3(.035, .016, .075), smoothstep(-.6, .6, N.x)) * pow(edge, 4.);
  vec3 film = .5 + .5 * cos(6.2832 * (edge * 1.5 + vec3(0., .33, .67)) + 1.2);
  skin += film * vec3(.14, .13, .2) * pow(edge, 2.6) * .38;
  // The room's light spills out of the entrance onto the glass round it.
  vec3 toL = vec3(0., -.22, 1.18) - vPos;
  float dist = length(toL);
  skin += vec3(.9, .5, .22) * max(0., dot(N, toL / dist)) * exp(-dist * dist * 9.) * .32 * (1. + approach);
  skin += windowLight(vPos);
  if (part > 1.5) {
    // The entrance's walls: darker glass, warm toward the far end.
    float back = smoothstep(.95, .45, vPos.z);
    skin = skin * .4 + roomThrough(vec3(vPos.x * .7, vPos.y, vPos.z)) * .17 * back * (1. + approach);
    inner *= .22;
  }
  vec3 body = vec3(.002, .007, .008) * (.6 + .4 * ndv);
  vec3 through = mix(vec3(.03, .12, .11), vec3(.08, .045, .13), smoothstep(-1.4, 2.4, vPos.y)) * T * T;
  // (For tuning: 1 shows only the inside, 2 only the skin.)
  if (debugView > 2.5) { gl_FragColor = vec4(vec3(T), 1.); return; }
  if (debugView > .5) { gl_FragColor = vec4(display(debugView < 1.5 ? inner * (1. - fresnel) : skin + body + through), 1.); return; }
  gl_FragColor = vec4(display(inner * (1. - fresnel) + skin + body + through) * alpha, alpha);
}`;
// Soft lights drawn over everything (additive): the spire's glint and the
// glow round the entrance.
const SPRITE_VERTEX = `precision highp float;
attribute vec2 corner;
uniform mat4 viewProj;
uniform vec3 center;
uniform vec2 size;      // in clip-space units
varying vec2 vUv;
void main() { vUv = corner; vec4 c = viewProj * vec4(center, 1.); gl_Position = c + vec4(corner * size * c.w, 0., 0.); }`;
const SPRITE_FRAGMENT = `precision highp float;
varying vec2 vUv;
uniform vec3 color;
uniform float star, strength;
void main() {
  float r = length(vUv);
  float core = exp(-r * r * 9.);
  float rays = star * (exp(-abs(vUv.x) * 40.) * exp(-abs(vUv.y) * 2.5) + exp(-abs(vUv.y) * 40.) * exp(-abs(vUv.x) * 2.5));
  float a = (core + rays * .6) * strength * smoothstep(1., .6, r);
  gl_FragColor = vec4(color * a, 0.);
}`;

// ---- GL plumbing -----------------------------------------------------------
function compile(type, source) {
  const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
  return {p, u, position: gl.getAttribLocation(p, 'position'), normal: gl.getAttribLocation(p, 'normal'), corner: gl.getAttribLocation(p, 'corner')};
}
function mesh({pos, nor, idx}) {
  const b = n => { const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(n), gl.STATIC_DRAW); return buf; };
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
  return {pos: b(pos), nor: b(nor), ib, count: idx.length};
}

// ---- Camera -----------------------------------------------------------------
const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, s) => a.map(v => v * s);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normz = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
// The still art's square in the canvas (centre and side, in pixels): the
// view is framed so the building lands there as in the still.
function applySize() {
  width = gl.canvas.width = Math.max(1, Math.round(cssWidth * quality.scale));
  height = gl.canvas.height = Math.max(1, Math.round(cssHeight * quality.scale));
  square = cssSquare && {cx: cssSquare.cx * quality.scale, cy: cssSquare.cy * quality.scale, side: cssSquare.side * quality.scale};
}
function viewProj(eye, target, fov, aspect, near = .02, far = 40) {
  const f = normz(sub(target, eye)), r = normz(cross(f, [0, 1, 0])), u = cross(r, f);
  const view = [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0,
    -(r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2]), -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]), f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2], 1];
  const t = 1 / Math.tan(fov / 2), q = square || {cx: width / 2, cy: height / 2, side: Math.min(width, height)};
  const sx = t * q.side / width, sy = t * q.side / height, ox = q.cx / width * 2 - 1, oy = 1 - q.cy / height * 2;
  const proj = [sx, 0, 0, 0, 0, sy, 0, 0, -ox, -oy, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0];
  const m = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) {
    let s = 0; for (let k = 0; k < 4; k++) s += proj[k * 4 + rr] * view[c * 4 + k];
    m[c * 4 + rr] = s;
  }
  return m;
}
// The drifting camera: a slow sway round the building and a breath up and
// down, about the view the still art was rendered from.
function driftingEye(t) {
  const sway = still ? 0 : 1;
  const yaw = CAMERA.yaw + sway * (.11 * Math.sin(t * 2 * Math.PI / 17) + .03 * Math.sin(t * 2 * Math.PI / 7.3));
  const pitch = CAMERA.pitch + sway * .025 * Math.sin(t * 2 * Math.PI / 11.5 + 1);
  const target = add(CAMERA.target, [0, sway * .04 * Math.sin(t * 2 * Math.PI / 7.4), 0]);
  const d = CAMERA.distance;
  return {eye: add(target, [d * Math.sin(yaw) * Math.cos(pitch), d * Math.sin(pitch), d * Math.cos(yaw) * Math.cos(pitch)]), target};
}

// ---- Drawing ----------------------------------------------------------------
function drawMesh(prog, m) {
  gl.bindBuffer(gl.ARRAY_BUFFER, m.pos); gl.enableVertexAttribArray(prog.position); gl.vertexAttribPointer(prog.position, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, m.nor); gl.enableVertexAttribArray(prog.normal); gl.vertexAttribPointer(prog.normal, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
}
function frame(now) {
  const t = (now - start) / 1000;
  let {eye, target} = driftingEye(still ? 0 : t);
  let approach = 0;
  if (flight) {
    // The way in: the distance to the entrance shrinks in equal steps of
    // its logarithm, at an easing-in rate (the view accelerates); the path
    // swings round to come in straight; at COVERED the entrance fills the
    // screen, and the view goes on through it to the room's light.
    const u = Math.min(1, (now - flight.start) / flight.duration), COVERED = .8;
    const door = [0, -.1, 1], d0 = Math.hypot(...sub(flight.eye, door));
    const dir = normz(lerp(normz(sub(flight.eye, door)), [0, 0, 1], Math.min(1, Math.max(0, (u - .15) / .6)) ** 2));
    const v = Math.min(1, u / COVERED);
    const dist = u <= COVERED ? d0 * Math.pow(.9 / d0, v * v) : .9 + (-.52 - .9) * Math.pow((u - COVERED) / (1 - COVERED), 1.4);
    eye = add(door, scale(dir, dist));
    target = sub(door, scale(dir, 3));
    approach = u;
    if (u >= 1 && !flight.done) { flight.done = true; postMessage({type: 'flown'}); }
  }
  const vp = viewProj(eye, target, CAMERA.fov, width / height);
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  const g = programs.glass;
  gl.useProgram(g.p);
  gl.uniformMatrix4fv(g.u.viewProj, false, vp);
  gl.uniform3fv(g.u.camPos, eye);
  gl.uniform1f(g.u.time, still ? 4 : t + 4);
  gl.uniform1f(g.u.approach, approach);
  gl.uniform1f(g.u.steps, quality.steps);
  gl.uniform1f(g.u.debugView, debugView);
  gl.uniform1f(g.u.alpha, 1);
  gl.uniform3fv(g.u.offset, [0, 0, 0]); gl.uniform2fv(g.u.stretch, [1, 1]); gl.uniform1f(g.u.molten, 1);
  gl.uniform1f(g.u.part, 0); drawMesh(g, meshes.body);
  gl.uniform1f(g.u.part, 1); drawMesh(g, meshes.tower); for (const d of meshes.drips) drawMesh(g, d);
  gl.uniform1f(g.u.molten, 0);
  gl.uniform1f(g.u.part, 1); drawMesh(g, meshes.frame);
  gl.uniform1f(g.u.part, 2); drawMesh(g, meshes.tunnel);
  gl.uniform1f(g.u.part, 3); drawMesh(g, meshes.far);
  // Now and then a drop leaves the bead: it swells as it parts, then falls,
  // faster and faster, and is gone.
  if (!still && !flight) {
    const p = ((t - 2.4) % 7.8 + 7.8) % 7.8 / 7.8;
    if (p > .5) {
      const k = (p - .5) / .5, fall = Math.max(0, k - .15) / .85;
      const y = BEAD[1] - .02 - 2.6 * fall * fall;
      const a = Math.min(1, k / .12) * (1 - Math.max(0, (fall - .7) / .3));
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(g.u.part, 1); gl.uniform1f(g.u.alpha, a);
      gl.uniform3fv(g.u.offset, [BEAD[0], y, BEAD[2]]);
      gl.uniform2fv(g.u.stretch, [.95 - .12 * fall, 1.08 + .25 * Math.min(1, fall * 3)]);
      drawMesh(g, meshes.drop);
      gl.disable(gl.BLEND);
    }
  }
  // Soft lights: the glow round the entrance, the spire's glint.
  const s = programs.sprite;
  gl.useProgram(s.p);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.disable(gl.DEPTH_TEST);
  gl.uniformMatrix4fv(s.u.viewProj, false, vp);
  gl.bindBuffer(gl.ARRAY_BUFFER, meshes.quad); gl.enableVertexAttribArray(s.corner); gl.vertexAttribPointer(s.corner, 2, gl.FLOAT, false, 0, 0);
  const aspect = width / height, zoom = (square ? square.side : Math.min(width, height)) / height;
  gl.uniform3fv(s.u.center, [0, -.2, 1.05]); gl.uniform2fv(s.u.size, [.11 / aspect * 1.6 * zoom, .11 * 1.3 * zoom]);
  gl.uniform3fv(s.u.color, [.55, .3, .12]); gl.uniform1f(s.u.star, 0);
  gl.uniform1f(s.u.strength, (.45 + .08 * Math.sin(t * 2 * Math.PI / 5.3)) * (1 + approach * 2) * (flight ? 1 - approach * .8 : 1));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  for (const [x, y, z, r, g, b] of [[-.6, -.16, .82, .2, .5, .6], [.6, -.16, .82, .2, .5, .6], [TOWER[0] - .02, .82, TOWER[2] + .2, .2, .55, .5], [TOWER[0] - .02, 1.16, TOWER[2] + .19, .45, .25, .7]]) {
    gl.uniform3fv(s.u.center, [x, y, z]); gl.uniform2fv(s.u.size, [.035 / aspect * zoom, .045 * zoom]);
    gl.uniform3fv(s.u.color, [r, g, b]); gl.uniform1f(s.u.star, 0); gl.uniform1f(s.u.strength, .35 * (flight ? 1 - approach : 1));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  if (!still && !flight) {
    const q = ((t - 1.2) % 6.4 + 6.4) % 6.4 / 6.4;
    const glint = q > .7 ? Math.sin((q - .7) / .3 * Math.PI) : 0;
    if (glint > 0) {
      gl.uniform3fv(s.u.center, [TOWER[0], 2.69, TOWER[2]]); gl.uniform2fv(s.u.size, [.05 / aspect * zoom, .05 * zoom]);
      gl.uniform3fv(s.u.color, [.85, 1, .95]); gl.uniform1f(s.u.star, 1); gl.uniform1f(s.u.strength, glint);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }
  gl.disable(gl.BLEND);
}

// Polite to the room: while it is being built, each frame's cost (waiting
// for the GPU to finish it, which grows when the GPU is busy with the room)
// sets the gap before the next, so the view keeps to about a quarter of the
// GPU's time and yields when the room needs more. On the way in (the room
// is ready) it draws every frame it can.
let last = 0, timer = 0, gap = 0, frames = 0;
function loop(now) {
  schedule();
  if (paused || now - last < Math.max(quality.frameMs, gap) - 2) return;
  last = now;
  frame(tick(now));
  frames++;
  if (quality === LIGHT) {
    const begun = performance.now();
    gl.finish();
    const cost = performance.now() - begun;
    gap = Math.min(400, gap * .6 + cost * 4 * .4);
  } else gap = 0;
  if (!drawnSent) { drawnSent = true; postMessage({type: 'drawn'}); }
}
function schedule() {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(loop);
  else timer = setTimeout(() => loop(performance.now()), quality.frameMs);
}

onmessage = ({data}) => {
  try {
    if (data.type === 'init') {
      const canvas = data.canvas;
      cssWidth = data.width; cssHeight = data.height; cssSquare = data.square;
      still = !!data.still; paused = !!data.paused;
      gl = canvas.getContext('webgl', {alpha: true, premultipliedAlpha: true, antialias: true});
      if (!gl) throw new Error('WebGL is unavailable in the worker');
      if (!gl.getExtension('OES_element_index_uint')) throw new Error('32-bit indices are unavailable');
      applySize();
      programs = {glass: program(GLASS_VERTEX, GLASS_FRAGMENT), sprite: program(SPRITE_VERTEX, SPRITE_FRAGMENT)};
      meshes = {
        body: mesh(lathe(bodyRadius, 1.32, -1.545, 260, 120)),
        tower: mesh(lathe(towerRadius, 2.7, -1.162, 220, 64, TOWER)),
        drips: DRIPS.map(([a, len, bead]) => mesh(drip(a, len, bead))),
        drop: mesh(lathe(y => Math.max(0, smaxR(ell(y, -.02, .085, .095), cone(y, .02, .06, .15, .004), .05)), .15, -.115, 40, 24)),
        tunnel: mesh(tunnel()), frame: mesh(doorFrame()), far: mesh(farWall()),
      };
      meshes.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, meshes.quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      tick(performance.now()); start = clock;
      schedule();
    } else if (data.type === 'resize') {
      cssWidth = data.width; cssHeight = data.height; cssSquare = data.square; applySize();
    } else if (data.type === 'fly') {
      const now = tick(performance.now()), t = (now - start) / 1000, {eye, target} = driftingEye(still ? 0 : t);
      flight = {start: now, duration: data.duration, eye, target, done: false};
      postMessage({type: 'stats', framesWhileLoading: frames, seconds: Math.round(now - start) / 1000});
      quality = FULL; applySize();
    } else if (data.type === 'still') still = !!data.value;
    else if (data.type === 'debug') debugView = +data.view || 0;
    else if (data.type === 'rate') { tick(performance.now()); rate = Math.max(.01, +data.value || 1); }
    else if (data.type === 'pause') paused = true;
    else if (data.type === 'play') paused = false;
  } catch (error) {
    postMessage({type: 'failed', message: error?.message || String(error)});
  }
};
