/* The study room's lamps. Every lit part of the room should have a source the
   visitor can see: a mushroom lantern by the door, a cluster of amber glass
   droplets at the study nook, and mosaic lamps gathered down the stair tower.
   The portal, the windows and the upper floor light the rest.

   What a lamp looks like and what it lights are kept apart. Lamp bodies glow
   (emissive) and carry a soft halo in the air; only a few real lights light
   the room:
   - the door lantern's patterned spot, its perforations cast as a gobo that
     is sharp close to the lamp and softens with distance (softGobo), and a
     weak warm glow round it;
   - one light inside the largest droplet;
   - one teal light among the tower's lowest lamps.
   The upper floor's existing green lights now hang inside two of its lamps.

   All of it costs four draw calls (glass, metal, the lantern's woven shade
   and the halos), whatever the number of lamps. Glass and halos breathe very
   slowly, each lamp at its own pace (glow = level, phase, rate, depth); the
   door lantern hardly at all, the tower's lamps the most. The glass is also
   on a layer of its own (breathLayer), so the room can redraw just the glass
   as it breathes; the halos follow the breath whenever the room is drawn.
   Plan coordinates (room-scene.js's shell group), metres, +Y up.

   Tuning: positions, hanging lengths, sizes, colours, brightness and breath
   are in lampTuning (edit and reload); light intensities and reaches can be
   changed live with studyRoom.lamps.configure({...}). */

// The palettes of the tower's mosaic glass (sRGB): a dominant colour, a
// deeper one, the pale tiles and a contrasting accent.
const palettes = {
  teal:   {base: '#22c4b0', deep: '#0d6d77', light: '#c8fff1', accent: '#2a5fb4'},
  green:  {base: '#3cd27c', deep: '#157a46', light: '#d8ffc0', accent: '#169e93'},
  jade:   {base: '#69dba1', deep: '#28876a', light: '#e8fff0', accent: '#39bfb6'},
  purple: {base: '#8467c4', deep: '#40327e', light: '#ddd2fb', accent: '#355fa6'},
  amber:  {base: '#f2a03a', deep: '#a4501b', light: '#ffe4ac', accent: '#c94a2a'},
};

export const lampTuning = {
  // How much every lamp breathes (multiplies each lamp's own depth).
  breath: 1,
  // The lantern by the door: hung from the ceiling (2.45 m) 1.2 m in front
  // of the front wall, just to the right of the doorway as seen from inside
  // the room, out of the way in. Its light is the room's most stable.
  // Where it hangs decides how the doorway reads (door A/B, PROGRESS.md):
  // close beside the door and near the wall, its light met the far jamb at a
  // glance from four times the distance, so only the near side lit up and
  // most of the pattern fell on the stone beside it. A little out from the
  // wall and nearer the door's middle, both jambs and the head are lit.
  door: {
    at: [.15, 6.0], hang: 2.45, rod: .27, shade: .31,
    color: '#ffb35e', glowColor: '#ffbe78',
    // The patterned spot: cd, range m, cone half-angle rad, where it aims:
    // at the doorway's middle, a little above half its height, so the head
    // catches it too.
    spot: 19, reach: 7, angle: 1.12, aim: [.8, 1.25, 7.2],
    // The weak, unpatterned glow below the shade (cd, range m): a downward
    // half-sphere, since the broad shade keeps the light off the ceiling.
    glow: 4, glowReach: 6.5,
    // The gobo: sharp within `sharp` m of the lamp; blur grows with
    // log2(distance / sharp) * spread (mip levels). Beyond flatFrom..flatTo m
    // the pattern evens out toward `mean` by up to `flatten`.
    pattern: {sharp: .7, spread: 2.1, mean: .3, flatFrom: 1.6, flatTo: 4.2, flatten: .6},
    // Emissive brightness of the perforations, the shade's inside and the halo.
    level: 1.6, shadeLevel: 1.7, halo: .22, haloSize: 1.0,
    // phase, rate (rad/s), depth: barely there.
    breath: [.4, .13, .012],
  },
  // The droplet cluster in front of the study nook, hung from the ceiling
  // (2.45 m): asymmetric, at different heights and depths. One holds the
  // light. bottom: height of the droplet's lower lip.
  shelf: {
    // The light: from inside the largest droplet, a downward half-sphere
    // strongest into the nook (cd, range m, cone half-angle rad, where its
    // axis points): the glass glows to the sides as well, but its cap and cord
    // keep the ceiling right above in shadow.
    color: '#ffa24c', light: 14, reach: 6.5, angle: Math.PI / 2, aim: [-2.75, .55, -.2],
    drops: [
      {at: [-2.10, -.12], bottom: 1.98, scale: 1.15, level: .85, light: true, breath: [0, .19, .04]},
      {at: [-2.31, -.63], bottom: 2.14, scale: .88, level: .62, breath: [2.1, .23, .045]},
      {at: [-1.96, .31], bottom: 2.17, scale: .82, level: .52, breath: [4.3, .16, .035]},
      {at: [-2.24, .64], bottom: 1.86, scale: 1.0, level: .7, breath: [1.2, .21, .04]},
    ],
    halo: .22, haloSize: .62,
  },
  // The stair tower: mosaic lamps hung from the underside of the upper floor
  // (slab), from the tower's ceiling down through the stairwell (ceiling),
  // from the handrail (rail: a post index) and from the ring beam over the
  // tower's mouth (beam). angle: plan degrees about the tower's axis
  // (0 = +X, 90 = toward the viewer); radius from the axis; top: height of
  // the lamp's cap. level: glass brightness. breath: phase, rate, depth.
  stair: {
    light: 2.4, reach: 2.2, lightColor: '#3fd3bf', lightAt: 0,
    halo: .24, haloSize: .46,
    lamps: [
      {hue: 'teal', shape: 'globe', anchor: 'slab', angle: 140, radius: .30, top: 1.62, scale: 1.14, level: 1.34, breath: [.3, .27, .1]},
      {hue: 'green', shape: 'onion', anchor: 'slab', angle: -20, radius: .42, top: 2.12, scale: 0.88, level: 1.19, breath: [1.9, .33, .11]},
      {hue: 'teal', shape: 'drop', anchor: 'slab', angle: 60, radius: .46, top: 2.42, scale: 0.75, level: 1.12, breath: [3.6, .41, .12]},
      {hue: 'jade', shape: 'globe', anchor: 'slab', angle: -110, radius: .35, top: 1.95, scale: 0.92, level: 1.27, breath: [5.2, .24, .09]},
      {hue: 'purple', shape: 'globe', anchor: 'slab', angle: 200, radius: .50, top: 2.55, scale: 0.69, level: 1, breath: [.8, .37, .13]},
      {hue: 'green', shape: 'drop', anchor: 'ceiling', angle: -75, radius: .67, top: 2.62, scale: 0.84, level: 1.19, breath: [2.7, .29, .1]},
      {hue: 'teal', shape: 'globe', anchor: 'ceiling', angle: -125, radius: .67, top: 2.86, scale: 0.7, level: 1.08, breath: [4.4, .35, .12]},
      {hue: 'purple', shape: 'onion', anchor: 'ceiling', angle: -95, radius: .66, top: 3.35, scale: 0.84, level: 0.97, breath: [1.4, .22, .1]},
      {hue: 'green', shape: 'globe', anchor: 'rail', post: 1, angle: -22, radius: .58, top: 1.1, scale: 0.62, level: 1.04, breath: [3.1, .43, .14]},
      {hue: 'teal', shape: 'drop', anchor: 'rail', post: 5, angle: -62, radius: .58, top: 1.84, scale: 0.7, level: 1.12, breath: [.2, .31, .12]},
      {hue: 'amber', shape: 'onion', anchor: 'rail', post: 8, angle: -92, radius: .58, top: 2.42, scale: 0.66, level: 1.04, breath: [5.9, .26, .08]},
      {hue: 'green', shape: 'onion', anchor: 'beam', angle: 128, radius: 1.30, top: 1.98, scale: 1.06, level: 1.15, breath: [2.4, .2, .09]},
      {hue: 'purple', shape: 'drop', anchor: 'beam', angle: 104, radius: 1.28, top: 2.08, scale: 0.84, level: 0.97, breath: [4.9, .34, .11]},
      // The upper floor's green source, the stairwell light's own lamp.
      {hue: 'jade', shape: 'globe', anchor: 'ceiling', angle: -66, radius: .94, top: 3.42, scale: 1.1, level: 1.42, breath: [.9, .18, .07]},
    ],
  },
};

// Lathe profiles, [radius, height] from the cap down, for a lamp of scale 1.
const shapes = {
  globe: [[0, 0], [.034, -.002], [.062, -.014], [.084, -.042], [.094, -.077], [.087, -.112], [.064, -.139], [.034, -.153], [0, -.156]],
  onion: [[0, 0], [.018, -.006], [.05, -.03], [.084, -.074], [.093, -.106], [.076, -.142], [.042, -.172], [.013, -.19], [0, -.195]],
  drop: [[0, 0], [.024, -.01], [.045, -.04], [.062, -.09], [.068, -.138], [.06, -.183], [.035, -.214], [0, -.224]],
};

export function createRoomLamps(THREE, {tower, stair, height, slab, ringBeam, anisotropy = 1}, tuning = lampTuning) {
  const group = new THREE.Group();
  group.name = 'hanging lamps';
  const breath = {value: 0};
  const tread = i => (i + 1) * stair.rise;
  const around = (degrees, radius, y) => {
    const a = degrees * Math.PI / 180;
    return new THREE.Vector3(tower.x + radius * Math.cos(a), y, tower.z + radius * Math.sin(a));
  };
  const srgb = hex => new THREE.Color(hex).convertLinearToSRGB();
  // A lamp's glow attribute: its level and its breath (depth scaled by the global breath).
  const pulse = (level, [phase, rate, depth]) => [level, phase, rate, depth * tuning.breath];

  // ---- Batches: every part of a kind goes into one non-indexed geometry, so
  // all the lamps cost one draw call per material. Extra per-vertex
  // attributes ride along (the glass's glow).
  function batch(extra = {}) {
    const arrays = {position: [], normal: [], uv: []}, sizes = {position: 3, normal: 3, uv: 2};
    for (const [name, size] of Object.entries(extra)) { arrays[name] = []; sizes[name] = size; }
    return {
      add(geometry, values = {}) {
        const g = geometry.index ? geometry.toNonIndexed() : geometry;
        if (!g.attributes.normal) g.computeVertexNormals();
        const count = g.attributes.position.count;
        for (const name of ['position', 'normal', 'uv']) {
          if (g.attributes[name]) arrays[name].push(...g.attributes[name].array);
          else arrays[name].push(...new Array(count * sizes[name]).fill(0));
        }
        for (const name of Object.keys(extra)) for (let i = 0; i < count; i++) arrays[name].push(...values[name]);
        if (g !== geometry) g.dispose();
        geometry.dispose();
      },
      build() {
        const geometry = new THREE.BufferGeometry();
        for (const [name, data] of Object.entries(arrays))
          geometry.setAttribute(name, new THREE.Float32BufferAttribute(data, sizes[name]));
        geometry.computeBoundingSphere();
        return geometry;
      },
    };
  }
  const glassParts = batch({glow: 4}), metalParts = batch(), shadeParts = batch();
  const halos = {position: [], tint: [], size: [], glow: []};
  const addHalo = (p, hex, strength, size, glow) => {
    const c = srgb(hex);
    halos.position.push(p.x, p.y, p.z); halos.tint.push(c.r * strength, c.g * strength, c.b * strength);
    halos.size.push(size); halos.glow.push(...glow);
  };
  // A thin rod from a to b (chains, cords, the lantern's stem).
  const rod = (a, b, radius = .0035, sides = 4) => {
    const length = a.distanceTo(b), g = new THREE.CylinderGeometry(radius, radius, length, sides, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  };
  // A lathe from a profile, optionally fluted: ribs pushed out by `depth`,
  // most where the profile is widest.
  // Profiles are written from the cap down; the lathe is built from the
  // bottom up, so its faces and normals point outward (a light inside the
  // lamp must not light the glass we see). Its v runs from the bottom (0)
  // to the cap (1).
  function lathe(profile, scale, segments, {ribs = 0, depth = 0} = {}) {
    const points = profile.map(([r, y]) => new THREE.Vector2(Math.max(r * scale, 1e-4), y * scale)).reverse();
    const g = new THREE.LatheGeometry(points, segments);
    if (ribs) {
      const p = g.attributes.position, widest = Math.max(...profile.map(([r]) => r)) * scale;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
        if (r < 1e-5) continue;
        const k = 1 + depth * (r / widest) ** 2 * Math.cos(ribs * Math.atan2(z, x));
        p.setX(i, x * k); p.setZ(i, z * k);
      }
      g.computeVertexNormals();
    }
    return g;
  }

  // ---- One texture for all the glass: a 4 x 4 atlas of 256 px cells. The
  // tower's lamps each get a mosaic cell of their own; one cell is the
  // droplets' amber glass and one the lantern's perforated brass. It is both
  // the glass's colour and its glow.
  const atlas = document.createElement('canvas'); atlas.width = atlas.height = 1024;
  const ctx = atlas.getContext('2d'), CELL = 256, PAD = 10;
  let seed = 9173;
  const rnd = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  const cellAt = index => [index % 4, Math.floor(index / 4)];
  // A lathe's uv into its cell (inside the padding, so mip levels do not mix
  // neighbouring cells). Canvas rows run top-down; texture v runs bottom-up.
  const intoCell = (g, index) => {
    const [cx, cy] = cellAt(index), uv = g.attributes.uv, inner = (CELL - 2 * PAD) / 1024;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, (cx * CELL + PAD) / 1024 + uv.getX(i) * inner, 1 - (cy * CELL + PAD) / 1024 - (1 - uv.getY(i)) * inner);
    return g;
  };
  const mix = (a, b, t) => { const p = new THREE.Color(a), q = new THREE.Color(b); return '#' + p.lerp(q, t).getHexString(); };
  // Mosaic: small glass tiles in the lamp's palette set in dark lead, with
  // stars or rosettes round the lamp and bands of bright dots, like the
  // pierced-and-tiled lamps in the references; each cell drawn from its own
  // seed and one of three motifs.
  function paintMosaic(index, palette, motif) {
    const [cx, cy] = cellAt(index), x0 = cx * CELL, y0 = cy * CELL;
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, CELL, CELL); ctx.clip();
    ctx.fillStyle = mix(palette.deep, '#000000', .78); ctx.fillRect(x0, y0, CELL, CELL);
    // The field: small tiles, mostly the dominant colour.
    const tile = 7;
    for (let y = 0; y < CELL; y += tile) for (let x = 0; x < CELL; x += tile) {
      const r = rnd(), c = r < .58 ? palette.base : r < .95 ? palette.deep : palette.light;
      ctx.fillStyle = mix(c, '#000000', rnd() * .28);
      ctx.fillRect(x0 + x + .8, y0 + y + .8, tile - 1.6 + (rnd() - .5), tile - 1.6 + (rnd() - .5));
    }
    // The motifs, in rows round the lamp (u is the angle, so 4 per row wrap).
    const rows = [.34, .55, .76], per = 4;
    rows.forEach((v, row) => {
      for (let k = 0; k < per; k++) {
        const x = x0 + (k + (row % 2) * .5 + .25) / per * CELL, y = y0 + v * CELL, s = 17 + rnd() * 4;
        ctx.fillStyle = mix(palette.deep, '#000000', .7);
        ctx.beginPath(); ctx.arc(x, y, s + 3, 0, Math.PI * 2); ctx.fill();
        if (motif === 0) { // an eight-point star
          for (const turn of [0, Math.PI / 4]) {
            ctx.save(); ctx.translate(x, y); ctx.rotate(turn); ctx.fillStyle = mix(palette.light, palette.base, .45);
            ctx.fillRect(-s * .62, -s * .62, s * 1.24, s * 1.24); ctx.restore();
          }
          ctx.fillStyle = palette.accent; ctx.beginPath(); ctx.arc(x, y, s * .38, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = palette.base; ctx.beginPath(); ctx.arc(x, y, s * .16, 0, Math.PI * 2); ctx.fill();
        } else if (motif === 1) { // a rosette of petals
          for (let p = 0; p < 8; p++) {
            const a = p * Math.PI / 4, px = x + Math.cos(a) * s * .55, py = y + Math.sin(a) * s * .55;
            ctx.fillStyle = p % 2 ? palette.light : palette.accent;
            ctx.beginPath(); ctx.ellipse(px, py, s * .36, s * .2, a, 0, Math.PI * 2); ctx.fill();
          }
          ctx.fillStyle = palette.light; ctx.beginPath(); ctx.arc(x, y, s * .22, 0, Math.PI * 2); ctx.fill();
        } else { // nested diamonds
          for (const [k2, c] of [[1, palette.light], [.66, palette.accent], [.34, palette.light]]) {
            ctx.fillStyle = c; ctx.beginPath();
            ctx.moveTo(x, y - s * k2); ctx.lineTo(x + s * k2 * .8, y); ctx.lineTo(x, y + s * k2); ctx.lineTo(x - s * k2 * .8, y); ctx.closePath(); ctx.fill();
          }
        }
      }
    });
    // Bands of bright dots near the cap and the lower lip.
    for (const v of [.16, .9]) for (let k = 0; k < 18; k++) {
      ctx.fillStyle = k % 3 ? palette.light : palette.accent;
      ctx.beginPath(); ctx.arc(x0 + (k + .5) / 18 * CELL, y0 + v * CELL, 3.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  // Amber glass: dim at the top, bright toward the open lower lip where the
  // bulb is, with lighter ridges down each flute (12 round the drop).
  function paintDroplet(index) {
    const [cx, cy] = cellAt(index), x0 = cx * CELL, y0 = cy * CELL;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + CELL);
    g.addColorStop(0, '#3a1504'); g.addColorStop(.45, '#9a3e0a'); g.addColorStop(.8, '#e5761c'); g.addColorStop(1, '#ffb357');
    ctx.fillStyle = g; ctx.fillRect(x0, y0, CELL, CELL);
    for (let k = 0; k < 12; k++) {
      const x = x0 + (k + .5) / 12 * CELL, ridge = ctx.createLinearGradient(x - 10, 0, x + 10, 0);
      ridge.addColorStop(0, 'rgba(255,170,90,0)'); ridge.addColorStop(.5, 'rgba(255,170,90,.26)'); ridge.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.fillStyle = ridge; ctx.fillRect(x - 10, y0, 20, CELL);
    }
    // Small seeds and streaks in the hand-blown glass.
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(255,${200 + rnd() * 40 | 0},140,${.08 + rnd() * .18})`;
      ctx.fillRect(x0 + rnd() * CELL, y0 + rnd() * CELL, 1 + rnd() * 2, 1 + rnd() * 6);
    }
  }
  // Pierced brass: dark metal in eight panels, each with a column of rosettes
  // of small holes; the holes glow with the bulb inside.
  function paintLantern(index) {
    const [cx, cy] = cellAt(index), x0 = cx * CELL, y0 = cy * CELL;
    ctx.fillStyle = '#2b1d10'; ctx.fillRect(x0, y0, CELL, CELL);
    for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(${rnd() < .5 ? '140,104,58' : '20,12,6'},${.08 + rnd() * .14})`; ctx.fillRect(x0 + rnd() * CELL, y0 + rnd() * CELL, 1 + rnd() * 3, 1); }
    const hole = (x, y, r) => {
      const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
      halo.addColorStop(0, '#fff3d6'); halo.addColorStop(.42, '#ffcf86'); halo.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, Math.PI * 2); ctx.fill();
    };
    for (let panel = 0; panel < 8; panel++) {
      const x = x0 + (panel + .5) / 8 * CELL;
      ctx.fillStyle = '#16100a'; ctx.fillRect(x0 + panel / 8 * CELL - 1, y0, 2.5, CELL);
      for (const v of [.3, .5, .7]) {
        const y = y0 + v * CELL;
        hole(x, y, 2.4);
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; hole(x + Math.cos(a) * 8, y + Math.sin(a) * 9, 1.3); }
      }
      for (const v of [.4, .6]) hole(x0 + panel / 8 * CELL, y0 + v * CELL, 1.2);
      for (let k = 0; k < 5; k++) hole(x, y0 + (.12 + k * .02) * CELL, .9), hole(x, y0 + (.84 + k * .02) * CELL, .9);
    }
  }
  const stairLamps = tuning.stair.lamps;
  stairLamps.forEach((lamp, i) => paintMosaic(i, palettes[lamp.hue], i % 3));
  const DROPLET = 14, LANTERN = 15;
  paintDroplet(DROPLET); paintLantern(LANTERN);
  const glassMap = new THREE.CanvasTexture(atlas);
  glassMap.colorSpace = THREE.SRGBColorSpace; glassMap.anisotropy = anisotropy;

  // Its colour is dimmed: lit from inside, the glass is mostly its own glow,
  // and the room's lights only add a sheen.
  const glass = new THREE.MeshStandardMaterial({map: glassMap, color: '#3c3c3c', emissiveMap: glassMap, emissive: '#ffffff', emissiveIntensity: 1,
    roughness: .32, metalness: 0});
  glass.onBeforeCompile = shader => {
    shader.uniforms.uBreath = breath;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 glow;\nvarying vec4 vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uBreath;\nvarying vec4 vGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // Each lamp's slow breath: two unrelated swells, long and longer.
        float swell = uBreath * vGlow.z + vGlow.y;
        totalEmissiveRadiance *= vGlow.x * (1. + vGlow.w * (.62 * sin(swell) + .38 * sin(swell * .383 + vGlow.y * 1.7)));`);
  };
  const metal = new THREE.MeshStandardMaterial({color: '#6b5332', metalness: .62, roughness: .48});

  // ---- The door lantern.
  const door = tuning.door, doorTop = door.hang - door.rod;
  const [dx, dz] = door.at;
  metalParts.add(new THREE.CylinderGeometry(.05, .05, .016, 12).translate(dx, door.hang - .008, dz));
  metalParts.add(rod(new THREE.Vector3(dx, door.hang, dz), new THREE.Vector3(dx, doorTop - .01, dz), .008, 6));
  // The shade: a broad woven cap like a mushroom's, its rim gently waved and
  // a little uneven, darker natural fibre striped with black.
  const shadeProfile = [[.014, 0], [.06, -.012], [.13, -.041], [.2, -.074], [.26, -.102], [.297, -.118], [.312, -.112]]
    .map(([r, y]) => [r * door.shade / .312, y]);
  const shade = new THREE.LatheGeometry(shadeProfile.map(([r, y]) => new THREE.Vector2(r, y)), 56);
  {
    const p = shade.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), a = Math.atan2(z, x), out = (r / door.shade) ** 2;
      p.setY(i, p.getY(i) + out * (.017 * Math.sin(7 * a + .6) + .008 * Math.sin(3 * a + 2.1)));
      const k = 1 + out * .03 * Math.sin(5 * a + 1.3);
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    shade.computeVertexNormals();
  }
  shadeParts.add(shade.translate(dx, doorTop, dz));
  metalParts.add(new THREE.CylinderGeometry(.022, .03, .03, 10).translate(dx, doorTop - .012, dz));
  // The lantern below it: an onion of pierced brass.
  const orbTop = doorTop - .045;
  const orbProfile = [[0, 0], [.018, 0], [.03, -.02], [.05, -.05], [.085, -.1], [.104, -.148], [.099, -.19], [.074, -.234], [.04, -.268], [.018, -.288], [0, -.29]];
  const orb = intoCell(lathe(orbProfile, 1, 32), LANTERN).translate(dx, orbTop, dz);
  glassParts.add(orb, {glow: pulse(door.level, door.breath)});
  metalParts.add(new THREE.CylinderGeometry(.016, .02, .05, 10).translate(dx, orbTop + .02, dz));
  metalParts.add(new THREE.ConeGeometry(.02, .06, 8).rotateX(Math.PI).translate(dx, orbTop - .32, dz));
  metalParts.add(new THREE.SphereGeometry(.011, 8, 6).translate(dx, orbTop - .356, dz));
  const lanternCenter = new THREE.Vector3(dx, orbTop - .15, dz);
  addHalo(lanternCenter, door.color, door.halo, door.haloSize, pulse(door.level, door.breath));

  // Its light: the patterned spot, and the glow. The pattern is the
  // lantern's piercing as the bulb sees it: rings of motifs round the
  // lantern's upright, in panels whose seams run down to the solid cap
  // straight below. Each motif is placed by its direction from the bulb (how
  // far from straight down, how far round) and drawn where the spot casts
  // that direction, at the size it has there. So the rings stay level round
  // the lamp whatever the aim: on the floor they circle its foot, on the
  // walls they arc, and the cap's shadow falls right under it.
  const gobo = (() => {
    const size = 512, c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#0b0b0b'; g.fillRect(0, 0, size, size);
    g.fillStyle = '#ffffff';
    // The spot's view, as three.js frames it: toward the aim, the room's up.
    const forward = new THREE.Vector3(...door.aim).sub(lanternCenter).normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward);
    const scale = size / 2 / Math.tan(door.angle), d = new THREE.Vector3(), deg = Math.PI / 180;
    // Where the spot casts the direction `fall` from straight down, `round`
    // about the upright (canvas px), if it is in front of the light.
    const cast = (fall, round) => {
      d.set(Math.sin(fall) * Math.cos(round), -Math.cos(fall), Math.sin(fall) * Math.sin(round));
      const z = d.dot(forward);
      return z > .2 ? [size / 2 + d.dot(right) / z * scale, size / 2 - d.dot(up) / z * scale] : null;
    };
    // Draws in the direction's own angles (radians): x down the lantern
    // (away from the cap), y round it.
    const at = (fall, round, draw) => {
      const p = cast(fall, round), f = cast(fall + .01, round), r = cast(fall, round + .01 / Math.sin(fall));
      if (!p || !f || !r) return;
      g.setTransform((f[0] - p[0]) / .01, (f[1] - p[1]) / .01, (r[0] - p[0]) / .01, (r[1] - p[1]) / .01, p[0], p[1]);
      draw(); g.setTransform(1, 0, 0, 1, 0, 0);
    };
    const blob = (x, y, rx, ry, a) => { g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2); g.fill(); };
    const motifs = {
      dots: s => blob(0, 0, s / 2, s / 2, 0),
      rosette: s => {
        blob(0, 0, s * .26, s * .26, 0);
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; blob(Math.cos(a) * s * .56, Math.sin(a) * s * .56, s * .26, s * .13, a); }
      },
      star: s => {
        g.beginPath();
        for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, r = k % 2 ? s * .22 : s * .52; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        g.closePath(); g.fill();
      },
      petal: s => blob(0, 0, s * .5, s * .2, 0),
    };
    // How far apart each kind sits round its ring, in motif sizes.
    const spacing = {dots: 3.2, rosette: 1.9, star: 2, petal: 1.47};
    // The rings: degrees from straight down, the motif, its size (degrees).
    const rings = [[20, 'dots', 2], [29, 'rosette', 7.5], [38, 'dots', 2.2], [47, 'star', 10], [57, 'petal', 9],
      [67, 'rosette', 8], [77, 'dots', 2.4], [86, 'star', 10], [95, 'petal', 9], [105, 'rosette', 8],
      [115, 'dots', 2.4], [124, 'star', 10], [133, 'petal', 9], [143, 'rosette', 8]];
    rings.forEach(([fall, kind, sizeDeg], i) => {
      const count = Math.max(6, Math.round(Math.PI * 2 * Math.sin(fall * deg) / (spacing[kind] * sizeDeg * deg)));
      for (let k = 0; k < count; k++) at(fall * deg, (k + (i % 2) * .5) / count * Math.PI * 2 + .2, () => motifs[kind](sizeDeg * deg));
    });
    // The panel seams, down to the solid cap, and the cap itself.
    g.fillStyle = '#0b0b0b';
    for (let k = 0; k < 8; k++) {
      const round = k * Math.PI / 4 + .2 + Math.PI / 8;
      for (let fall = 12; fall < 150; fall += 3) at(fall * deg, round, () => { g.fillRect(0, -1.3 * deg, 3.2 * deg, 2.6 * deg); });
    }
    g.beginPath();
    for (let k = 0; k <= 64; k++) { const p = cast(14 * deg, k / 64 * Math.PI * 2); if (p) g.lineTo(...p); }
    g.closePath(); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const spot = new THREE.SpotLight(door.color, door.spot, door.reach, door.angle, .55, 2);
  spot.name = 'door lantern'; spot.position.copy(lanternCenter); spot.target.position.set(...door.aim);
  spot.map = gobo; spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -.0008; spot.shadow.normalBias = .02; spot.shadow.camera.near = .12;
  const glow = new THREE.SpotLight(door.glowColor, door.glow, door.glowReach, Math.PI / 2, .35, 2);
  glow.name = 'door lantern glow'; glow.position.copy(lanternCenter); glow.target.position.copy(lanternCenter).y -= 1;

  // ---- The droplets.
  const shelf = tuning.shelf;
  // A teardrop: a slim neck swelling to a round belly, closing in again to
  // a small open lip where the bulb shows.
  const dropProfile = [[.009, 0], [.013, -.02], [.022, -.06], [.04, -.12], [.06, -.18], [.072, -.225], [.072, -.255], [.06, -.28], [.04, -.293], [.026, -.296]];
  let shelfLight = null;
  for (const drop of shelf.drops) {
    const s = drop.scale, h = .29 * s, [x, z] = drop.at, top = drop.bottom + h;
    const body = intoCell(lathe(dropProfile, s, 20, {ribs: 12, depth: .07}), DROPLET).translate(x, top, z);
    glassParts.add(body, {glow: pulse(drop.level, drop.breath)});
    // The bulb, showing through the open lip from below and from the side.
    const lip = new THREE.SphereGeometry(.021 * s, 10, 6).translate(x, drop.bottom + .008, z);
    const uv = lip.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, .5, .02);
    glassParts.add(intoCell(lip, DROPLET), {glow: pulse(drop.level * 1.4, drop.breath)});
    metalParts.add(new THREE.CylinderGeometry(.014 * s, .011 * s, .03, 8).translate(x, top + .012, z));
    metalParts.add(rod(new THREE.Vector3(x, height, z), new THREE.Vector3(x, top + .02, z), .0028));
    metalParts.add(new THREE.CylinderGeometry(.028, .028, .012, 10).translate(x, height - .006, z));
    const center = new THREE.Vector3(x, drop.bottom + h * .38, z);
    addHalo(center, shelf.color, shelf.halo * drop.level, shelf.haloSize * s, pulse(drop.level, drop.breath));
    if (drop.light && !shelfLight) {
      shelfLight = new THREE.SpotLight(shelf.color, shelf.light, shelf.reach, shelf.angle, .35, 2);
      shelfLight.name = 'droplet lamp'; shelfLight.position.set(x, drop.bottom + .07, z); shelfLight.target.position.set(...shelf.aim);
    }
  }

  // ---- The tower's mosaic lamps.
  const st = tuning.stair, stairCenters = [];
  const railAt = post => around(stair.from * 180 / Math.PI - post * stair.step * 180 / Math.PI, stair.inner + .03, tread(post) + .86);
  stairLamps.forEach((lamp, i) => {
    const profile = shapes[lamp.shape], s = lamp.scale, depth = -profile[profile.length - 1][1] * s;
    const top = around(lamp.angle, lamp.radius, lamp.top);
    const body = intoCell(lathe(profile, s, 14), i).translate(top.x, top.y - .012 * s, top.z);
    glassParts.add(body, {glow: pulse(lamp.level, lamp.breath)});
    // Brass: a domed cap with a collar, a drop finial below.
    metalParts.add(new THREE.CylinderGeometry(.012 * s, .036 * s, .028 * s, 8).translate(top.x, top.y + .002, top.z));
    metalParts.add(new THREE.ConeGeometry(.016 * s, .045 * s, 6).rotateX(Math.PI).translate(top.x, top.y - .012 * s - depth - .02 * s, top.z));
    // What it hangs from.
    const anchor = lamp.anchor === 'slab' ? new THREE.Vector3(top.x, slab, top.z)
      : lamp.anchor === 'ceiling' ? new THREE.Vector3(top.x, tower.height, top.z)
      : lamp.anchor === 'beam' ? new THREE.Vector3(top.x, ringBeam, top.z) : railAt(lamp.post);
    metalParts.add(rod(anchor, new THREE.Vector3(top.x, top.y + .014 * s, top.z), .0032));
    if (lamp.anchor !== 'rail') metalParts.add(new THREE.CylinderGeometry(.02, .02, .01, 8).translate(anchor.x, anchor.y - .005, anchor.z));
    const center = new THREE.Vector3(top.x, top.y - .012 * s - depth * .48, top.z);
    stairCenters.push(center);
    addHalo(center, palettes[lamp.hue].base, st.halo * lamp.level, st.haloSize * s, pulse(lamp.level, lamp.breath));
  });
  const stairLight = new THREE.PointLight(st.lightColor, st.light, st.reach, 2);
  stairLight.name = 'tower lamp glow'; stairLight.position.copy(stairCenters[st.lightAt]);

  // ---- The woven shade's material: unlit (it is lit by its own lantern from
  // just below, which a real light that close would blow out), glowing on
  // its inside, brightest round the lantern and dimmer toward the rim; its
  // top is in shadow. Open weave toward the rim, where the light shows through.
  const weave = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 256);
    // Spokes (u is the angle round the cap): groups of natural and black fibre.
    for (let k = 0; k < 96; k++) {
      const x = k / 96 * 512, dark = Math.floor(k / 6) % 2 === 1;
      g.fillStyle = dark ? '#2a1d14' : '#b8915c';
      g.fillRect(x, 0, 512 / 96 * .62, 256);
    }
    // The weft: rings of natural fibre (v runs from the centre to the rim;
    // the canvas is upside down to it), dense near the centre.
    for (let y = 0; y < 256; y += 5 + y / 18) { g.fillStyle = 'rgba(196,158,104,.95)'; g.fillRect(0, 256 - y - 2, 512, 2.2); }
    g.fillStyle = 'rgba(196,158,104,1)'; g.fillRect(0, 256 - 48, 512, 48);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy;
    return t;
  })();
  const shadeMaterial = new THREE.MeshBasicMaterial({map: weave, alphaTest: .45, side: THREE.DoubleSide});
  shadeMaterial.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb *= gl_FrontFacing ? ${door.shadeLevel.toFixed(3)} * mix(1., .28, smoothstep(.12, 1., vMapUv.y)) : .07;`);
  };

  // ---- Halos: soft glows in the air round each lamp, additive, one draw
  // call; they breathe with their lamps. Written straight to the display
  // (sRGB), like the room's light shafts.
  const haloMaterial = new THREE.ShaderMaterial({
    uniforms: {uBreath: breath, uFocal: {value: 600}},
    vertexShader: `attribute vec3 tint; attribute float size; attribute vec4 glow;
      uniform float uBreath, uFocal; varying vec3 vTint;
      void main() {
        float swell = uBreath * glow.z + glow.y;
        vTint = tint * (1. + glow.w * 1.5 * (.62 * sin(swell) + .38 * sin(swell * .383 + glow.y * 1.7)));
        vec4 mv = modelViewMatrix * vec4(position, 1.);
        gl_PointSize = min(size * uFocal / -mv.z, 900.);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying vec3 vTint;
      void main() {
        float d = length(gl_PointCoord - .5) * 2.;
        gl_FragColor = vec4(vTint * exp(-d * d * 4.2) * (1. - smoothstep(.7, 1., d)), 1.);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const haloGeometry = new THREE.BufferGeometry();
  haloGeometry.setAttribute('position', new THREE.Float32BufferAttribute(halos.position, 3));
  haloGeometry.setAttribute('tint', new THREE.Float32BufferAttribute(halos.tint, 3));
  haloGeometry.setAttribute('size', new THREE.Float32BufferAttribute(halos.size, 1));
  haloGeometry.setAttribute('glow', new THREE.Float32BufferAttribute(halos.glow, 4));

  const meshes = [
    ['lamp glass', glassParts.build(), glass],
    ['lamp brass', metalParts.build(), metal],
    ['woven lantern shade', shadeParts.build(), shadeMaterial],
  ].map(([name, geometry, material]) => {
    const m = new THREE.Mesh(geometry, material); m.name = name;
    // Lamps neither block their own light nor anyone else's.
    m.castShadow = false; m.receiveShadow = false; group.add(m);
    return m;
  });
  const BREATH_LAYER = 2;
  meshes[0].layers.enable(BREATH_LAYER);
  const haloPoints = new THREE.Points(haloGeometry, haloMaterial);
  haloPoints.name = 'lamp halos'; haloPoints.renderOrder = 6; group.add(haloPoints);

  // ---- The gobo's softening, for the room's materials: the spot's pattern
  // is sampled blurrier (a higher mip level) the further the lit surface is
  // from the lamp, and evens out toward its mean beyond a few metres.
  const pattern = door.pattern;
  const sampled = 'spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );';
  const soft = `float goboFar = length( spotLight.position - geometryPosition );
      spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy,
        clamp( log2( max( goboFar, 1e-3 ) / ${pattern.sharp.toFixed(3)} ) * ${pattern.spread.toFixed(3)}, 0., 6. ) );
      spotColor.rgb = mix( spotColor.rgb, vec3( ${pattern.mean.toFixed(3)} ),
        smoothstep( ${pattern.flatFrom.toFixed(3)}, ${pattern.flatTo.toFixed(3)}, goboFar ) * ${pattern.flatten.toFixed(3)} );`;
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  if (!chunk.includes(sampled)) console.warn('room-lamps: spot map sampling not found; the door pattern stays sharp');
  const softChunk = chunk.replace(sampled, soft);
  const softGobo = shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', softChunk); };

  // Screen regions for the breathing redraw: each cluster's lamps and halos.
  const clusters = [
    {name: 'door', points: [lanternCenter.clone().setY(door.hang), lanternCenter.clone().setY(orbTop - .4)], pad: door.haloSize / 2 + door.shade},
    {name: 'shelf', points: shelf.drops.flatMap(d => [new THREE.Vector3(d.at[0], height, d.at[1]), new THREE.Vector3(d.at[0], d.bottom, d.at[1])]), pad: shelf.haloSize / 2 + .1},
    {name: 'stair', points: stairCenters.map(c => c.clone()), pad: st.haloSize / 2 + .12},
  ];
  // The lights each cluster lends the smoke on the floor (room-smoke.js).
  const smokeLights = [
    {at: lanternCenter.toArray(), color: door.color, reach: 1.8, strength: 1.1},
    {at: shelfLight.position.toArray(), color: shelf.color, reach: 1.5, strength: .6},
  ];

  const lights = {door: spot, glow, shelf: shelfLight, stair: stairLight};
  const triangles = meshes.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0);
  return {
    group, lights, targets: [spot.target, glow.target, shelfLight.target], clusters, smokeLights, softGobo,
    breathLayer: BREATH_LAYER,
    // Advances the breath (seconds); 0 holds every lamp at its rest level.
    update(seconds) { breath.value = seconds; },
    setFocal(focal) { haloMaterial.uniforms.uFocal.value = focal; },
    stats: {lamps: 1 + shelf.drops.length + stairLamps.length, drawCalls: 4, triangles: Math.round(triangles),
      lights: Object.keys(lights).length, halos: halos.size.length},
  };
}
