// ==========================================================================
// CRYSTAL ORB + INTRO TABLE — Three.js prototypes
// ==========================================================================
// Two exports:
//   createCrystalOrbScene(container)  — just the orb, floating alone.
//   createIntroTableScene(container)  — the orb sitting in a portal panel
//                                        on a table, the fuller boot-ritual
//                                        composition.
// Both share the same orb: at rest it's solid and even, with only a slow
// float/spin. As spinIntensity rises, its surface stops being rigid: a
// vertex shader displaces it with flowing simplex noise (amplitude tied
// directly to spinIntensity), so it goes from a calm, held shape to
// something loose and half-liquid the faster it turns. A muted amber/cyan
// emissive glow lives inside it, reacting to the same noise field.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Ashima Arts' classic GLSL simplex noise (3D) — the standard, widely-reused
// implementation. Returns roughly [-1, 1].
const SIMPLEX_GLSL = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

// Builds the orb mesh + its shader-driven material — shared by the
// orb-only view and the full table/portal scene so the deformation logic
// only lives in one place. Returns { mesh, material } — caller adds it to
// whatever scene and drives material.userData.shader.uniforms per frame.
function createOrbMesh(radius = 1) {
  const geometry = new THREE.SphereGeometry(radius, 64, 64);

  const material = new THREE.MeshStandardMaterial({
    color: 0x2a3330, // worn, desaturated stone/patina base — not a bright plastic color
    roughness: 0.8,  // high roughness — matte, no glossy specular
    metalness: 0.05,
    emissive: 0x000000,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uNoiseAmp = { value: 0 }; // 0 at rest — this is what makes idle "solid"
    shader.uniforms.uNoiseFreq = { value: 1.6 };
    shader.uniforms.uNoiseSpeed = { value: 0.3 };
    shader.uniforms.uGrainAmp = { value: 0.006 }; // tiny, always-on — the worn/patinated micro-texture
    shader.uniforms.uGrainFreq = { value: 7.0 };
    shader.uniforms.uColorAmber = { value: new THREE.Color(0xb5763a) };
    shader.uniforms.uColorCyan = { value: new THREE.Color(0x2f8f86) };
    shader.uniforms.uGlowIntensity = { value: 0.65 };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uNoiseAmp;
        uniform float uNoiseFreq;
        uniform float uNoiseSpeed;
        uniform float uGrainAmp;
        uniform float uGrainFreq;
        varying float vDisplace;
        ${SIMPLEX_GLSL}
        // Big organic wobble (driven by spin) plus a small always-on grain
        // (the "worn surface" — present even at rest, when uNoiseAmp is 0).
        float surfaceDisplacement(vec3 p) {
          float big = snoise(p * uNoiseFreq + uTime * uNoiseSpeed) * uNoiseAmp;
          float grain = snoise(p * uGrainFreq + uTime * 0.05) * uGrainAmp;
          return big + grain;
        }`
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        // Perturb the lighting normal to match the displacement below —
        // sampled via two nearby points instead of an analytic derivative,
        // cheap and good enough for this. Without this the surface would
        // still shade like a smooth sphere even while visibly deformed.
        vec3 crystalOrigNormal = objectNormal;
        float crystalEps = 0.02;
        vec3 crystalT1 = normalize(abs(crystalOrigNormal.y) < 0.99
          ? cross(crystalOrigNormal, vec3(0.0, 1.0, 0.0))
          : cross(crystalOrigNormal, vec3(1.0, 0.0, 0.0)));
        vec3 crystalT2 = normalize(cross(crystalOrigNormal, crystalT1));

        float crystalN0 = surfaceDisplacement(position);
        float crystalN1 = surfaceDisplacement(position + crystalT1 * crystalEps);
        float crystalN2 = surfaceDisplacement(position + crystalT2 * crystalEps);

        vec3 crystalDP0 = position + crystalOrigNormal * crystalN0;
        vec3 crystalDP1 = (position + crystalT1 * crystalEps) + crystalOrigNormal * crystalN1;
        vec3 crystalDP2 = (position + crystalT2 * crystalEps) + crystalOrigNormal * crystalN2;

        vec3 crystalNewNormal = normalize(cross(crystalDP1 - crystalDP0, crystalDP2 - crystalDP0));
        if (dot(crystalNewNormal, crystalOrigNormal) < 0.0) crystalNewNormal = -crystalNewNormal;
        objectNormal = crystalNewNormal;
        vDisplace = crystalN0;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed = crystalDP0;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uColorAmber;
        uniform vec3 uColorCyan;
        uniform float uGlowIntensity;
        varying float vDisplace;`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // The inner glow leans amber where the surface bulges out and
          // cyan where it dips in — ties the "living" light to the same
          // field that's deforming the shape, instead of a flat color.
          float glowMix = smoothstep(-0.5, 0.5, vDisplace);
          vec3 crystalGlow = mix(uColorAmber, uColorCyan, glowMix);
          totalEmissiveRadiance = crystalGlow * (0.3 + abs(vDisplace) * 3.0) * uGlowIntensity;
        }`
      );

    material.userData.shader = shader;
  };

  const mesh = new THREE.Mesh(geometry, material);
  return { mesh, material, geometry };
}

// Per-frame orb update shared by both scenes: advances the shader's time
// uniform and eases the noise amplitude toward whatever spinIntensity (or
// its override) currently targets. Returns the live rotation speed / noise
// amplitude so callers can publish them into their own status object.
function stepOrb(orb, material, state, t, dt) {
  orb.rotation.x = Math.sin(t * 0.35) * 0.05;
  const baseSpinSpeed = 0.08;
  const activeSpinSpeed = 1.7;
  const rotSpeed = state.rotationSpeedOverride !== null
    ? state.rotationSpeedOverride
    : baseSpinSpeed + activeSpinSpeed * state.spinIntensity;
  orb.rotation.y += rotSpeed * dt;

  let noiseAmp = 0;
  const shader = material.userData.shader;
  if (shader) {
    shader.uniforms.uTime.value = t;
    const targetAmp = state.noiseAmpOverride !== null
      ? state.noiseAmpOverride
      : state.spinIntensity * 0.22;
    shader.uniforms.uNoiseAmp.value +=
      (targetAmp - shader.uniforms.uNoiseAmp.value) * Math.min(1, dt * 4);
    noiseAmp = shader.uniforms.uNoiseAmp.value;
  }
  return { rotSpeed, noiseAmp };
}

// Wires a basic "drag to spin it up" interaction onto a DOM element: drag
// speed feeds state.spinIntensity, which decays back toward 0 on its own
// once you let go — the same lever the boot-ritual charge dial uses, minus
// the charge-to-unlock bookkeeping (that belongs to whatever integrates
// this into the actual site flow, not to this prototype).
function wireDragToSpin(el, state) {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function onDown(e) {
    if (e.button !== 0) return;
    dragging = true;
    el.classList.add('dragging');
    lastX = e.clientX;
    lastY = e.clientY;
    el.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    const moved = Math.hypot(dx, dy);
    state.spinIntensity = Math.max(0, Math.min(1, state.spinIntensity + moved * 0.02));
  }
  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    el.releasePointerCapture(e.pointerId);
  }

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);

  return {
    isDragging: () => dragging,
    dispose() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    },
  };
}

// container: a DOM element the canvas gets appended into (sized by CSS).
export function createCrystalOrbScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(
    42,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  // Off to one side and slightly below center, looking up/across at the
  // orb — an oblique, first-person angle rather than a top-down bird's-eye
  // view.
  camera.position.set(1.5, -0.55, 3.3);
  camera.lookAt(0, 0.15, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  // Minimal lighting: a dim ambient fill plus one point light to carve out
  // form and catch the glow — no other lights, nothing glossy.
  const ambient = new THREE.AmbientLight(0x18201c, 0.55);
  scene.add(ambient);

  const pointLight = new THREE.PointLight(0xffbf80, 3.2, 12, 2);
  pointLight.position.set(1.8, 1.6, 2.1);
  scene.add(pointLight);

  const { mesh: orb, material, geometry } = createOrbMesh(1);
  scene.add(orb);

  // The one thing meant to be driven from outside: 0 = at rest (solid,
  // even, slow float/spin), 1 = fully agitated (loose, noisy, fast). Set
  // state.spinIntensity directly, or use setSpinIntensity() to have it
  // clamped for you. The two overrides are for testing rotation speed and
  // "fluidity" (noise amplitude) independently of each other — leave them
  // null for normal use, where both are derived from spinIntensity together.
  const state = {
    spinIntensity: 0,
    rotationSpeedOverride: null,
    noiseAmpOverride: null,
  };
  const status = { rotationSpeed: 0, noiseAmp: 0 }; // read-only, updated every frame

  const clock = new THREE.Clock();
  let rafHandle = null;

  function animate() {
    rafHandle = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;

    // Idle float runs continuously regardless of state; spinIntensity only
    // changes how FAST the rotation is and how agitated the surface gets,
    // so there's never a dead, fully-still resting frame.
    orb.position.y = Math.sin(t * 0.6) * 0.12;
    const { rotSpeed, noiseAmp } = stepOrb(orb, material, state, t, dt);
    status.rotationSpeed = rotSpeed;
    status.noiseAmp = noiseAmp;

    renderer.render(scene, camera);
  }

  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  animate();

  return {
    scene,
    camera,
    renderer,
    orb,
    material,
    state,
    status,
    setSpinIntensity(v) {
      state.spinIntensity = Math.max(0, Math.min(1, v));
    },
    setRotationSpeedOverride(v) {
      state.rotationSpeedOverride = v;
    },
    setNoiseAmpOverride(v) {
      state.noiseAmpOverride = v;
    },
    dispose() {
      cancelAnimationFrame(rafHandle);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}

// The fuller composition: a table, a portal panel resting on it, and the
// orb sitting at the panel's edge — the actual boot-ritual "diorama"
// instead of the orb in isolation. Scope note: this builds the SCENE
// (geometry/materials/camera/lighting) and a basic drag-to-spin-up
// interaction on the orb; it does not reimplement the site's full
// charge-to-unlock sequence (that's a separate integration step).
export function createIntroTableScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(
    38,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  // Elevated and pulled back enough to see the tabletop, angled down at it
  // rather than a flat, straight-on view — matches looking at a table from
  // just above/in front of it, not a drone shot from directly overhead.
  camera.position.set(0, 2.3, 4.6);
  camera.lookAt(0, 0.5, -0.2);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0x1c2420, 1.1);
  scene.add(ambient);

  const pointLight = new THREE.PointLight(0xffbf80, 14, 14, 2);
  pointLight.position.set(1.6, 2.6, 1.8);
  pointLight.castShadow = true;
  pointLight.shadow.mapSize.set(1024, 1024);
  pointLight.shadow.bias = -0.002;
  scene.add(pointLight);

  // A dim, cool fill from the opposite side so the shadowed half of the
  // table/orb doesn't drop to pure black — still minimal, still moody.
  const fillLight = new THREE.PointLight(0x3a5a55, 0.8, 14, 2);
  fillLight.position.set(-2.2, 1.4, -1.0);
  scene.add(fillLight);

  // ---- Table ----
  const tableGroup = new THREE.Group();
  scene.add(tableGroup);

  const woodMaterial = new THREE.MeshStandardMaterial({
    color: 0x3c3222,
    roughness: 0.85,
    metalness: 0.02,
  });

  const TABLE_W = 4.2;
  const TABLE_D = 2.6;
  const TABLE_THICK = 0.14;
  const tabletop = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE_W, TABLE_THICK, TABLE_D),
    woodMaterial
  );
  tabletop.position.y = 0;
  tabletop.receiveShadow = true;
  tableGroup.add(tabletop);

  const legGeometry = new THREE.CylinderGeometry(0.055, 0.045, 1.2, 12);
  const legInsetX = TABLE_W / 2 - 0.2;
  const legInsetZ = TABLE_D / 2 - 0.2;
  [
    [-legInsetX, -legInsetZ],
    [legInsetX, -legInsetZ],
    [-legInsetX, legInsetZ],
    [legInsetX, legInsetZ],
  ].forEach(([x, z]) => {
    const leg = new THREE.Mesh(legGeometry, woodMaterial);
    leg.position.set(x, -TABLE_THICK / 2 - 0.6, z);
    leg.castShadow = true;
    tableGroup.add(leg);
  });

  // ---- Portal panel ----
  const PANEL_W = 2.3;
  const PANEL_D = 1.6;
  const PANEL_THICK = 0.06;
  const panel = new THREE.Mesh(
    new RoundedBoxGeometry(PANEL_W, PANEL_THICK, PANEL_D, 4, 0.1),
    new THREE.MeshStandardMaterial({
      color: 0x0a0f0e,
      roughness: 0.5,
      metalness: 0.1,
    })
  );
  const panelTopY = TABLE_THICK / 2 + PANEL_THICK / 2;
  panel.position.set(0, panelTopY, -0.1);
  panel.castShadow = true;
  panel.receiveShadow = true;
  tableGroup.add(panel);

  // A thin emissive rim just under the panel's edge, echoing the site's
  // teal portal glow — the one deliberate accent color besides the orb.
  const rim = new THREE.Mesh(
    new RoundedBoxGeometry(PANEL_W + 0.04, PANEL_THICK * 0.6, PANEL_D + 0.04, 4, 0.11),
    new THREE.MeshStandardMaterial({
      color: 0x0a0f0e,
      emissive: 0x1e7a6f,
      emissiveIntensity: 0.9,
      roughness: 0.6,
    })
  );
  rim.position.set(0, panelTopY - PANEL_THICK * 0.3, -0.1);
  tableGroup.add(rim);

  // ---- Orb, sitting at the panel's near-top edge ----
  const ORB_RADIUS = 0.5;
  const { mesh: orb, material: orbMaterial, geometry: orbGeometry } = createOrbMesh(ORB_RADIUS);
  orb.position.set(0, panelTopY + ORB_RADIUS * 0.55, panel.position.z + PANEL_D / 2 - 0.35);
  orb.castShadow = true;
  scene.add(orb);

  const state = {
    spinIntensity: 0,
    rotationSpeedOverride: null,
    noiseAmpOverride: null,
  };
  const status = { rotationSpeed: 0, noiseAmp: 0 };

  const drag = wireDragToSpin(renderer.domElement, state);
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.cursor = 'grab';

  // ---- "Drei kulen for å åpne" label ----
  // Plain HTML over the canvas (crisp at any resolution, no font-loading
  // machinery) positioned each frame by projecting a point on the panel
  // into screen space.
  container.style.position = container.style.position || 'relative';
  const label = document.createElement('div');
  label.textContent = 'Drei kulen for å åpne';
  label.style.cssText = `
    position: absolute; left: 0; top: 0; z-index: 5;
    color: rgba(220, 235, 230, 0.75);
    font: 500 13px/1.4 system-ui, sans-serif;
    letter-spacing: 0.02em;
    pointer-events: none;
    white-space: nowrap;
    text-shadow: 0 1px 3px rgba(0,0,0,0.8);
  `;
  container.appendChild(label);
  // Front edge of the panel — closer to the camera than the orb sits, so
  // it projects below the ball on screen instead of behind/through it
  // (a plain HTML overlay has no concept of 3D occlusion, so world-space
  // placement is what keeps it clear of the ball).
  const labelPoint = new THREE.Vector3(0, panelTopY + 0.02, panel.position.z + PANEL_D / 2 - 0.05);

  const clock = new THREE.Clock();
  let rafHandle = null;

  function animate() {
    rafHandle = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;

    // Dragging ramps spinIntensity up (see wireDragToSpin); releasing lets
    // it decay back to a calm rest on its own, same as the site's ball.
    if (!drag.isDragging()) {
      state.spinIntensity = Math.max(0, state.spinIntensity - dt * 0.35);
    }
    renderer.domElement.classList.toggle('dragging', drag.isDragging());

    orb.position.y = panelTopY + ORB_RADIUS * 0.55 + Math.sin(t * 0.6) * 0.03;
    const { rotSpeed, noiseAmp } = stepOrb(orb, orbMaterial, state, t, dt);
    status.rotationSpeed = rotSpeed;
    status.noiseAmp = noiseAmp;

    const proj = labelPoint.clone().project(camera);
    label.style.transform =
      `translate(${(proj.x * 0.5 + 0.5) * container.clientWidth}px, ` +
      `${(-proj.y * 0.5 + 0.5) * container.clientHeight}px) translate(-50%, -50%)`;

    renderer.render(scene, camera);
  }

  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  animate();

  return {
    scene,
    camera,
    renderer,
    orb,
    material: orbMaterial,
    state,
    status,
    setSpinIntensity(v) {
      state.spinIntensity = Math.max(0, Math.min(1, v));
    },
    setRotationSpeedOverride(v) {
      state.rotationSpeedOverride = v;
    },
    setNoiseAmpOverride(v) {
      state.noiseAmpOverride = v;
    },
    dispose() {
      cancelAnimationFrame(rafHandle);
      window.removeEventListener('resize', onResize);
      drag.dispose();
      renderer.dispose();
      orbGeometry.dispose();
      orbMaterial.dispose();
      if (label.parentNode === container) container.removeChild(label);
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
