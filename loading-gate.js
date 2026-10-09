/* The loading gate. From the first paint the exterior (the building of orb
   glass the room is inside) floats in the void over everything (index.html's
   #loadingGate, loading-gate.css), and the page beneath is inert, so nothing
   half-built is seen or touched. When the room is genuinely ready
   (window.siteReady, site-ready.js) the building gathers energy, its entrance
   becomes the focus, and the view accelerates toward and through it; once
   the entrance fills the screen the gate thins away over the finished room,
   and the room's own entry carries on. Under reduced motion the gate simply
   fades. No input reaches the room until the gate is gone.

   This module runs as soon as it arrives (async, right after the gate's
   markup), so the exterior starts before the rest of the page is parsed; what
   needs the whole page (the inert page, the ready signal) waits for it.

   While the gate hides the room completely (loadingGate.veiled), the room's
   idle life waits: unseen, it would only take frames from the way in.
   Events on window: 'site-entering' as the way in begins (the room takes its
   smoke back, to grow it in again from the visitor's feet), 'site-unveiling'
   just before the gate starts to thin (the idle life resumes), 'site-entered'
   once the gate is gone and the page is no longer inert (also
   <html data-site-entered="yes">).

   What stands in the gate is the module the mount names (data-portal), with
   createLoadingPortal(): loading-exterior.js (opening, the entrance's place
   on screen; doorwayGrowth; setApproach; dispose), or Codex's
   loading-portal.js, which keeps the same contract. Without it, or if it
   fails, a CSS orb stands in and the way in centres on that. The gate's
   own motion is Web Animations, run by the compositor, so it keeps its pace
   even when the page's main thread is busy.

   Should the room be unusually slow, the visitor is offered to go in anyway.

   window.loadingGate: state ('loading', 'entering', 'entered'), the way in
   ('through' or 'fade'), timings, and the frame intervals during it, for
   checks (tests/loading-gate-check.mjs). */
const SLOW_MS = 12000;
const gate = document.getElementById('loadingGate');
const still = matchMedia('(prefers-reduced-motion: reduce)');
const stats = {state: 'loading', portal: null, way: null, veiled: true, portalAt: null, readyAt: null, unveiledAt: null, enteredAt: null, ready: null, frames: []};
// The rest of the page: inert from when it is parsed until it may be seen.
let others = [];
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
  stats.unveiledAt = Math.round(performance.now());
  dispatchEvent(new Event('site-unveiling'));
}
function entered(detail) {
  unveil();
  // Only now may the page be used: no input reaches the room during the way in.
  others.forEach(element => {element.inert = false;});
  stats.state = 'entered';
  stats.enteredAt = Math.round(performance.now());
  document.documentElement.dataset.siteEntered = 'yes';
  dispatchEvent(new CustomEvent('site-entered', {detail: {...detail, enteredAt: stats.enteredAt}}));
}
// The parser is done (not DOMContentLoaded, which also waits for the room's
// module scripts to run).
const parsed = () => document.readyState !== 'loading' ? Promise.resolve()
  : new Promise(done => document.addEventListener('readystatechange', done, {once: true}));

if (!gate) entered({state: 'no-gate'});
else {
  const mount = gate.querySelector('.loading-gate__portal');
  const status = gate.querySelector('.loading-gate__status');
  const anyway = gate.querySelector('.loading-gate__enter');
  let portal = null, detail = {state: 'unknown'};
  const open = () => {
    gate.remove();
    try {portal?.dispose();} catch {}
    entered(detail);
  };
  try {
    // The dark gate is painted first; the portal (its texture takes a moment
    // to make) starts in the frame after, and emerges from it.
    await new Promise(done => requestAnimationFrame(() => setTimeout(done)));
    if (mount.dataset.portal) {
      try {
        const {createLoadingPortal} = await import(new URL(mount.dataset.portal, document.baseURI).href);
        portal = createLoadingPortal(mount);
      } catch (error) {
        console.warn('Loading: the portal could not start; the orb stands in:', error?.message || error);
      }
    }
    if (!portal && !mount.querySelector('.loading-gate__orb')) {
      const orb = document.createElement('div');orb.className = 'loading-gate__orb';orb.setAttribute('aria-hidden', 'true');mount.append(orb);
    }
    stats.portal = portal ? 'loading-portal' : 'orb';
    stats.portalAt = Math.round(performance.now());

    const slow = setTimeout(() => {if (anyway) anyway.hidden = false;}, SLOW_MS);
    const chosen = new Promise(done => anyway?.addEventListener('click', () => done({state: 'chosen'}), {once: true}));
    await parsed();
    others = [...document.body.children].filter(element => element !== gate && element.tagName !== 'SCRIPT');
    if (stats.veiled) others.forEach(element => {element.inert = true;});
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
        // 1. It answers: its energy rises, a little (the exterior's glass
        // should stay dark; its entrance brightens through setApproach).
        await mount.animate([{filter: 'brightness(1) saturate(1)'}, {filter: 'brightness(1.14) saturate(1.1)'}],
          {duration: 380, easing: 'ease-out', fill: 'forwards'}).finished;
        // 2. The doorway becomes the focus: the portal scales about it (the
        // dark around it stays; scaling that too would only cost raster) ...
        const box = mount.getBoundingClientRect();
        const opening = portal?.opening || {x: box.left + box.width / 2, y: box.top + box.height / 2, width: box.width * .4, height: box.height * .6};
        mount.style.transformOrigin = `${opening.x - box.left}px ${opening.y - box.top}px`;
        // ... and the view accelerates through it. The doorway's size grows in
        // equal steps of log scale, at an easing-in rate, and fills the screen
        // at COVERED of the way. What the doorway grows by itself as the view
        // nears (setApproach) the mount's scale leaves out.
        const COVERED = .8, steps = 16, duration = 1100;
        const cover = Math.max(innerWidth / Math.max(1, opening.width), innerHeight / Math.max(1, opening.height)) * 1.1;
        const approach = t => portal ? Math.min(1, t * t) : 0;
        // How much the doorway grows by itself at approach 1 (Codex's
        // loading-portal.js: its depth layer, 1 + 2.8p; the exterior: none).
        const growth = portal?.doorwayGrowth ?? (portal ? 2.8 : 0);
        const doorway = t => cover ** ((t / COVERED) ** 2);
        const zoom = mount.animate(Array.from({length: steps + 1}, (_, i) => {
          const t = i / steps;
          return {transform: `scale(${Math.max(1, doorway(t) / (1 + growth * approach(t)))})`};
        }), {duration, easing: 'linear', fill: 'forwards'});
        // 3-4. Through the doorway, the gate thins over the room.
        const thin = gate.animate([{opacity: 1}, {opacity: 0}], {duration: duration * .3, delay: duration * .7, easing: 'ease-in-out', fill: 'forwards'});
        // The room's life resumes a few frames before it can be seen.
        (function watch() {
          if ((zoom.currentTime ?? 0) >= duration * .6 || zoom.playState === 'finished') unveil();
          else requestAnimationFrame(watch);
        })();
        // The portal's layers follow the zoom's own clock, so they keep in
        // step with it even when a frame of the page's comes late.
        if (portal) (function lean() {
          const t = zoom.playState === 'finished' ? 1 : Math.min(1, (zoom.currentTime ?? 0) / duration);
          portal.setApproach(approach(t));
          if (t < 1 && stats.state === 'entering') requestAnimationFrame(lean);
        })();
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
