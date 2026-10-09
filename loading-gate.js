/* The loading gate. From the first paint the loading portal floats in
   darkness over everything (index.html's #loadingGate, loading-gate.css),
   and the page beneath is inert, so nothing half-built is seen or touched.
   When the room is genuinely ready (window.siteReady, site-ready.js) the
   portal gathers energy, its doorway becomes the focus, and the view
   accelerates toward and through it; as the doorway fills the screen the
   gate thins away over the finished room, and the room's own entry carries
   on. Under reduced motion the gate simply fades.

   While the gate hides the room completely (loadingGate.veiled), the room's
   idle life waits: unseen, it would only take frames from the way in.
   Events on window: 'site-entering' as the way in begins (the room takes its
   smoke back, to grow it in again from the visitor's feet), 'site-unveiling'
   just before the gate starts to thin (the idle life resumes, the page is no
   longer inert), 'site-entered' once the gate is gone (also
   <html data-site-entered="yes">).

   The portal is the module the mount names (data-portal; Codex's
   loading-portal.js: createLoadingPortal, setApproach, opening, dispose).
   Without one, or if it fails, the CSS orb stands in and the way in centres
   on it. Every motion of the gate itself is a Web Animation, so it runs on
   the compositor and stays smooth while the room is still being built.

   Should the room be unusually slow, the visitor is offered to go in anyway.

   window.loadingGate: state ('loading', 'entering', 'entered'), the way in
   ('through' or 'fade'), timings, and the frame intervals during it, for
   checks (tests/loading-gate-check.mjs). */
const SLOW_MS = 12000;
const gate = document.getElementById('loadingGate');
// The rest of the page: inert until the room may be seen (unveil).
const others = gate ? [...document.body.children].filter(element => element !== gate && element.tagName !== 'SCRIPT') : [];
const still = matchMedia('(prefers-reduced-motion: reduce)');
const stats = {state: 'loading', portal: null, way: null, veiled: true, readyAt: null, unveiledAt: null, enteredAt: null, ready: null, frames: []};
window.loadingGate = {
  get state() {return stats.state;},
  // True while the gate hides the room completely: its idle life waits.
  get veiled() {return stats.veiled;},
  get stats() {return {...stats, frames: [...stats.frames]};},
};

// The room may show again: the gate begins to thin ('site-unveiling').
function unveil() {
  if (!stats.veiled) return;
  stats.veiled = false;
  // The page may be used again; its restyling is paid for while the gate
  // still hides it, not as the room appears.
  others.forEach(element => {element.inert = false;});
  stats.unveiledAt = Math.round(performance.now());
  dispatchEvent(new Event('site-unveiling'));
}
function entered(detail) {
  unveil();
  stats.state = 'entered';
  stats.enteredAt = Math.round(performance.now());
  document.documentElement.dataset.siteEntered = 'yes';
  dispatchEvent(new CustomEvent('site-entered', {detail: {...detail, enteredAt: stats.enteredAt}}));
}

if (!gate) entered({state: 'no-gate'});
else {
  const mount = gate.querySelector('.loading-gate__portal');
  const status = gate.querySelector('.loading-gate__status');
  const anyway = gate.querySelector('.loading-gate__enter');
  others.forEach(element => {element.inert = true;});
  let portal = null, detail = {state: 'unknown'};
  const open = () => {
    gate.remove();
    try {portal?.dispose();} catch {}
    entered(detail);
  };
  try {
    if (mount.dataset.portal) {
      try {
        const {createLoadingPortal} = await import(new URL(mount.dataset.portal, document.baseURI).href);
        portal = createLoadingPortal(mount);
        mount.querySelector('.loading-gate__orb')?.remove();
      } catch (error) {
        console.warn('Loading: the portal could not start; the orb stands in:', error?.message || error);
      }
    }
    if (!portal && !mount.querySelector('.loading-gate__orb')) {
      const orb = document.createElement('div');orb.className = 'loading-gate__orb';mount.append(orb);
    }
    stats.portal = portal ? 'loading-portal' : 'orb';

    const slow = setTimeout(() => {if (anyway) anyway.hidden = false;}, SLOW_MS);
    const chosen = new Promise(done => anyway?.addEventListener('click', () => done({state: 'chosen'}), {once: true}));
    const ready = window.siteReady || new Promise(done => addEventListener('load', () => done({state: 'unknown'}), {once: true}));
    detail = await Promise.race([ready, chosen]);
    clearTimeout(slow);
    if (anyway) anyway.hidden = true;
    stats.ready = detail.state;
    stats.readyAt = Math.round(performance.now());
    stats.state = 'entering';
    if (status) status.textContent = 'Rommet er klart';
    gate.setAttribute('aria-busy', 'false');
    // The portal finishes emerging before it answers (only on a very fast load).
    await mount.getAnimations().find(animation => animation.animationName === 'gate-appear')?.finished;
    dispatchEvent(new CustomEvent('site-entering', {detail}));

    // Frame intervals while the gate moves.
    let recording = true;
    (function record(last) {
      requestAnimationFrame(now => {
        if (last !== undefined) stats.frames.push(+(now - last).toFixed(1));
        if (recording) record(now);
      });
    })();
    try {
      stats.way = still.matches ? 'fade' : 'through';
      if (still.matches) {
        unveil();
        await gate.animate([{opacity: 1}, {opacity: 0}], {duration: 450, easing: 'ease-in-out', fill: 'forwards'}).finished;
      } else {
        // 1. The portal answers: its energy rises.
        await mount.animate([{filter: 'brightness(1) saturate(1)'}, {filter: 'brightness(1.4) saturate(1.3)'}],
          {duration: 380, easing: 'ease-out', fill: 'forwards'}).finished;
        // 2. The doorway becomes the focus: the portal scales about it (the
        // dark around it stays; scaling it too would only cost raster) ...
        const box = mount.getBoundingClientRect();
        const opening = portal?.opening || {x: box.left + box.width / 2, y: box.top + box.height / 2, width: box.width * .4, height: box.height * .6};
        mount.style.transformOrigin = `${opening.x - box.left}px ${opening.y - box.top}px`;
        // ... until it covers the screen. Equal steps in log scale feel like
        // equal speed, so the exponent eases in: the view accelerates.
        const cover = Math.max(innerWidth / Math.max(1, opening.width), innerHeight / Math.max(1, opening.height)) * 1.2;
        const steps = 12, duration = 1100;
        const zoom = mount.animate(Array.from({length: steps + 1}, (_, i) => ({transform: `scale(${cover ** ((i / steps) ** 2)})`})),
          {duration, easing: 'linear', fill: 'forwards'});
        // 3-4. Through the doorway the gate thins over the room.
        const thin = gate.animate([{opacity: 1}, {opacity: 0}], {duration: duration * .32, delay: duration * .68, easing: 'ease-in-out', fill: 'forwards'});
        // The room's life resumes a few frames before it can be seen.
        (function watch() {
          if ((zoom.currentTime ?? 0) >= duration * .6 || zoom.playState === 'finished') unveil();
          else requestAnimationFrame(watch);
        })();
        // The portal's own layers lean into the approach (main thread; the
        // gate's motion above does not depend on it).
        if (portal) {
          const start = performance.now();
          (function lean() {
            const t = Math.min(1, (performance.now() - start) / duration);
            portal.setApproach(t * t);
            if (t < 1 && stats.state === 'entering') requestAnimationFrame(lean);
          })();
        }
        await Promise.all([zoom.finished, thin.finished]);
      }
    } finally {
      recording = false;
    }
  } catch (error) {
    console.warn('Loading: the way in failed; entering directly:', error?.message || error);
  }
  open();
}
