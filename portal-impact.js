/* The portal's reaction when something is drawn into it: a pond and a fire at
   once, and mostly a mouth. A ripple spreads over its surface from the point
   of contact, a short flare wells up, the depths pull inward while a ring
   closes on the contact point, a few embers rise and are swallowed, and a
   softer after-ripple settles it. Everything lies on the portal's own 3D
   plane, so the table rim and the shaft occlude it, and it is driven by
   requestAnimationFrame rather than CSS animations.

   window.portalImpact({x, y, strength}) -> Promise, resolved once settled.
     x, y      point of contact as fractions of the aperture (0..1; y grows
               toward the viewer)
     strength  0..1, scales every part of the reaction
   It also dispatches a 'portal-impact' event on window (same detail), which
   room-scene.js answers with a flare of the portal's light on the room.
   Used by the cloth when it is released (room-scene.js). A card thrown into
   the portal can call it the same way, at the point where it lands. */
(() => {
  const screen = document.getElementById('screen');
  if (!screen) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const EMBER_COLORS = ['#6fe3d0', '#7fd8ff', '#b995f5', '#e79bd6', '#6fe3d0', '#b995f5', '#ffc46b', '#ff8a4a'];
  let seed = 911, active = 0;
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const bell = (t, from, to) => t <= from || t >= to ? 0 : Math.sin(Math.PI * (t - from) / (to - from));
  const easeOut = (u, power) => 1 - (1 - Math.min(1, Math.max(0, u))) ** power;
  // Billboards face the viewer; everything else lies in the aperture plane.
  const FACE = 'rotateX(calc(var(--view-pitch) * -1))';
  const part = (parent, className) => {
    const e = document.createElement('i'); e.className = className; parent.appendChild(e); return e;
  };

  window.portalImpact = ({x = .5, y = .5, strength = 1} = {}) => {
    const W = screen.clientWidth, H = screen.clientHeight;
    const cx = x * W, cy = y * H, s = Math.max(0, Math.min(1, strength));
    window.dispatchEvent(new CustomEvent('portal-impact', {detail: {x, y, strength: s}}));
    const layer = part(screen, 'portal-impact'), surface = part(layer, 'portal-impact-surface');
    const pool = part(surface, 'portal-impact-pool');
    pool.style.background = `radial-gradient(ellipse 55% 70% at ${x * 100}% ${y * 100}%,
      #ffc46b80, #4fd6c25c 30%, #a06ee640 55%, transparent 78%)`;
    // Reduced motion: only the light, no waves, pull or embers.
    const still = reducedMotion.matches;
    const rings = still ? [] : ['wave', 'wave', 'pull', 'after'].map(kind => part(surface, 'portal-impact-ring portal-impact-ring--' + kind));
    const flare = still ? null : part(layer, 'portal-impact-flare');
    const embers = still ? [] : Array.from({length: Math.round(6 + 10 * s)}, () => {
      const e = part(layer, 'portal-impact-ember'), color = EMBER_COLORS[Math.floor(random() * EMBER_COLORS.length)];
      const size = 2.2 + random() * 2.4, angle = random() * Math.PI * 2, spread = H * (.04 + random() * .1);
      e.style.cssText = `width:${size}px;height:${size}px;background:${color};box-shadow:0 0 ${size * 2.5}px ${color}`;
      return {e, delay: random() * .22, life: 1.3 + random() * .8, phase: random() * 6,
        from: [cx + (random() - .5) * H * .05, cy + (random() - .5) * H * .05, 2],
        peak: [cx + Math.cos(angle) * spread, cy + Math.sin(angle) * spread, H * (.05 + random() * .12) * s],
        sink: [W / 2 + (random() - .5) * W * .12, H / 2 + (random() - .5) * H * .12, -H * (.2 + random() * .14)]};
    });
    const depths = still ? [] : [...screen.querySelectorAll('.portal-depth-layer')];
    const duration = still ? .7 : 2.6;
    const ring = (el, diameter, opacity) => {
      el.style.width = el.style.height = Math.max(1, diameter) + 'px';
      el.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      el.style.opacity = Math.max(0, opacity);
    };
    active++;
    return new Promise(resolve => {
      const start = performance.now();
      const frame = now => {
        const t = (now - start) / 1000;
        // Light welling up at the contact point. Gone within about a second:
        // an orb rising through this translucent plane would show a seam.
        pool.style.opacity = still ? s * .6 * bell(t, 0, duration)
          : s * .8 * smooth(t / .12) * (1 - smooth((t - .2) / .9));
        if (!still) {
          // Pond: the surface rings outward, twice.
          const u = t / 1.3, echo = (t - .14) / 1.36;
          ring(rings[0], H * (.08 + 1.9 * easeOut(u, 3)), u < 1 ? s * .9 * (1 - u) ** 1.6 * smooth(t / .05) : 0);
          ring(rings[1], H * (.05 + 1.5 * easeOut(echo, 3)), echo > 0 && echo < 1 ? s * .55 * (1 - echo) ** 1.8 : 0);
          // Mouth: a ring closes on the contact point and the depths draw in.
          const pull = (t - .3) / .7;
          ring(rings[2], H * (.03 + 1.6 * (1 - Math.min(1, Math.max(0, pull))) ** 2), s * .6 * bell(t, .3, 1));
          const scale = 1 - s * .1 * bell(t, .15, .75) + s * .03 * bell(t, .75, 1.4);
          for (const d of depths) d.style.scale = scale;
          // Settling: a soft, slow after-ripple.
          const after = (t - 1) / 1.5;
          ring(rings[3], H * (.1 + 1.3 * easeOut(after, 2)), s * .4 * bell(t, 1, 2.5));
          // Fire: a short flare rising a little off the surface.
          const f = t / .9;
          flare.style.opacity = f < 1 ? s * .95 * smooth(t / .07) * (1 - f) ** 2.2 : 0;
          const size = H * .7 * (.45 + .75 * easeOut(f, 2));
          flare.style.width = flare.style.height = size + 'px';
          flare.style.transform = `translate3d(${cx}px, ${cy}px, ${6 + 30 * Math.min(1, f)}px) translate(-50%, -50%) ${FACE}`;
          // Embers rise, hang, then fall faster and faster into the shaft.
          for (const ember of embers) {
            const v = (t - ember.delay) / ember.life, k = Math.min(1, Math.max(0, v)) ** 1.35;
            const at = i => (1 - k) ** 2 * ember.from[i] + 2 * k * (1 - k) * ember.peak[i] + k * k * ember.sink[i];
            ember.e.style.transform = `translate3d(${at(0)}px, ${at(1)}px, ${at(2)}px) translate(-50%, -50%) ${FACE}`;
            ember.e.style.opacity = v <= 0 || v >= 1 ? 0
              : smooth(v / .08) * (1 - smooth((v - .72) / .28)) * (.65 + .35 * Math.sin(t * 23 + ember.phase));
          }
        }
        if (t < duration) { requestAnimationFrame(frame); return; }
        layer.remove();
        if (--active === 0) for (const d of depths) d.style.scale = '';
        resolve();
      };
      requestAnimationFrame(frame);
    });
  };
})();
