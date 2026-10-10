/* The loading screen's exterior in real 3D. The building of orb glass is
   drawn live (loading-exterior-3d-worker.js) on a canvas handed to a worker,
   so it keeps moving while the page's main thread builds the room: the
   camera drifts slowly round it, its inside turns as the orb's does, drops
   fall from its neck. The way in is a real flight through its entrance.

   Until the first 3D frame is ready, and wherever 3D cannot run (no
   OffscreenCanvas, no worker, no WebGL there), the pre-rendered exterior
   (loading-exterior.js) shows instead; the 3D view fades in over it.

   When it comes alive is the mount's choice (data-live): 'loading' (the
   default) draws it while the room is built, which on the machine it was
   measured on delayed the room's readiness by about 0.4 s (median of 8
   interleaved cold loads), since its frames share the GPU with the room's
   start-up; 'ready' keeps the still art up while the room is built and
   wakes the 3D view once it is ready, for the drift and the flight in, at
   no measurable cost to the loading.

   The contract of loading-portal.js for loading-gate.js, plus:
   wake() (resolves once the 3D view is drawing, or false), flies (true
   once it is up) and fly(duration), which resolves when the view has gone
   in through the entrance. */
import {createLoadingPortal as createStillExterior} from './loading-exterior.js';

export function createLoadingPortal(container, options = {}) {
  const base = createStillExterior(container, options);
  const element = base.element;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let worker = null, canvas = null, live = false, flown = null, failed = null, drawing = null, woken = null;
  const lazy = container.dataset.live === 'ready';
  // <div class="loading-exterior" data-view="…">: still, starting, live, or failed.
  element.dataset.view = 'still';
  const stop = reason => {
    if (reason) { failed = reason; element.dataset.view = 'failed'; }
    worker?.terminate(); worker = null;
    canvas?.remove(); canvas = null;
    element.classList.remove('is-live');
    live = false;
    flown?.();
  };
  const supported = typeof Worker === 'function' && typeof OffscreenCanvas === 'function'
    && 'transferControlToOffscreen' in HTMLCanvasElement.prototype;
  if (supported) {
    try {
      canvas = document.createElement('canvas');
      canvas.className = 'loading-exterior__live';
      canvas.setAttribute('aria-hidden', 'true');
      // Over the whole gate (outside the mount, whose filter would otherwise
      // hold it), so the flight can fill the screen.
      (container.closest('.loading-gate') || element).append(canvas);
      const square = element.querySelector('.loading-exterior__building');
      // The canvas's pixels, and where the still art's square sits in them:
      // the worker frames the building there exactly.
      const pixels = () => {
        const r = canvas.getBoundingClientRect(), q = square.getBoundingClientRect();
        const k = Math.min(Math.min(devicePixelRatio || 1, 1.5), 1600 / Math.max(1, r.width, r.height));
        return {width: Math.max(1, Math.round(r.width * k)), height: Math.max(1, Math.round(r.height * k)),
          square: {cx: (q.left + q.width / 2 - r.left) * k, cy: (q.top + q.height / 2 - r.top) * k, side: q.height * k}};
      };
      const offscreen = canvas.transferControlToOffscreen();
      worker = new Worker(new URL('./loading-exterior-3d-worker.js', import.meta.url));
      worker.onmessage = ({data}) => {
        if (data.type === 'drawn') {
          woken?.(true);
          live = true; element.classList.add('is-live'); canvas.classList.add('is-live'); element.dataset.view = 'live';
          setTimeout(() => element.classList.add('is-settled'), 1300);
        }
        else if (data.type === 'flown') flown?.();
        else if (data.type === 'stats') { drawing = data; if (window.loadingExterior3d) window.loadingExterior3d.drawing = data; }
        else if (data.type === 'failed') { console.warn('Loading: the 3D exterior could not run; the still one stays:', data.message); stop(data.message); woken?.(false); }
      };
      worker.onerror = event => { event.preventDefault?.(); console.warn('Loading: the 3D exterior failed; the still one stays:', event.message); stop(event.message || 'worker error'); };
      element.dataset.view = 'starting';
      // For checks: slow its clock to film the way in (with the gate's own
      // animations slowed alike).
      window.loadingExterior3d = {setRate: value => worker?.postMessage({type: 'rate', value}), debug: view => worker?.postMessage({type: 'debug', view})};
      worker.postMessage({type: 'init', canvas: offscreen, ...pixels(), still: options.reducedMotion ?? still.matches, paused: lazy}, [offscreen]);
      const observer = new ResizeObserver(() => worker?.postMessage({type: 'resize', ...pixels()}));
      observer.observe(canvas); observer.observe(element);
      still.addEventListener('change', () => worker?.postMessage({type: 'still', value: still.matches}));
      document.addEventListener('visibilitychange', () => { if (live || !lazy) worker?.postMessage({type: document.hidden ? 'pause' : 'play'}); });
    } catch (error) {
      console.warn('Loading: the 3D exterior could not start; the still one stays:', error?.message || error);
      stop(error?.message || 'start failed');
    }
  }
  return {
    element,
    ready: base.ready,
    get doorwayGrowth() { return base.doorwayGrowth; },
    get opening() { return base.opening; },
    // Wakes a view kept asleep while the room was built (data-live="ready").
    wake() {
      if (live || !worker) return Promise.resolve(live);
      return new Promise(resolve => { woken = value => { woken = null; resolve(value); }; worker.postMessage({type: 'play'}); });
    },
    // True once the 3D view is up: the gate then lets it fly in itself.
    get flies() { return live; },
    fly(duration) {
      if (!live || !worker) return Promise.resolve(false);
      return new Promise(resolve => {
        flown = () => { flown = null; resolve(true); };
        worker.postMessage({type: 'fly', duration});
      });
    },
    setApproach(value) { base.setApproach(value); },
    pause() { base.pause(); if (live) worker?.postMessage({type: 'pause'}); },
    play() { base.play(); if (live) worker?.postMessage({type: 'play'}); },
    setReducedMotion(value) { base.setReducedMotion(value); worker?.postMessage({type: 'still', value: value ?? still.matches}); },
    get stats() { return {...base.stats, renderer: live ? 'webgl-worker' : 'still', failed, drawing}; },
    dispose() { stop(); base.dispose(); },
  };
}
