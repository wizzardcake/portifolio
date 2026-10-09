/* When the room is genuinely ready, for the loading portal to wait on.
   Loaded first, in <head>. The parts it waits for:
   - room:  the room's shaders compiled, its first full frame (room and
            foreground together) drawn, and two more frames after it, so
            nothing the first frame leaves behind lands after entry
            (room-scene.js);
   - water, depth, orb: the portal's own layers, their shaders linked or
            fallen back to CSS, so nothing compiles when the cloth comes off
            (portal-surface.js, portal-depth.js, portal-effects.js);
   - font:  Cinzel, the cloth's inscription, settled (loaded or failed); it
            is repainted when it arrives, a visible swap and a stall if late.
   window.siteReady resolves with {state, ms, parts}: state 'ready'; or
   'fallback' when the room has no WebGL and shows its silhouette; or
   'degraded' when a script failed to load or threw while starting, in which
   case the page shows what it has instead of waiting forever. The same
   detail goes out as a 'site-ready' event on window. Nothing here is a
   timer or a guess: every part settles on what actually happened. */
(() => {
  const started = performance.now(), parts = new Map();
  let settle, state = 'ready', settled = false;
  window.siteReady = new Promise(resolve => { settle = resolve; });
  const finish = () => {
    if (settled || [...parts.values()].some(part => !part.done)) return;
    settled = true;
    const detail = {state, ms: Math.round(performance.now() - started),
      parts: Object.fromEntries([...parts].map(([name, part]) => [name, part.result]))};
    document.documentElement.dataset.siteReady = state;
    settle(detail);
    dispatchEvent(new CustomEvent('site-ready', {detail}));
  };
  const mark = (name, result) => {
    const part = parts.get(name);
    if (!part || part.done) return;
    part.done = true; part.result = result; part.at = Math.round(performance.now() - started);
    finish();
  };
  for (const name of ['room', 'water', 'depth', 'orb', 'font']) parts.set(name, {done: false});
  window.siteReadiness = {
    // A part is ready (result: 'ready', 'css' for a CSS stand-in, 'fallback').
    done(name, result = 'ready') { if (result === 'fallback') state = state === 'degraded' ? state : 'fallback'; mark(name, result); },
    // A part can never be ready: show the page with what there is.
    fail(name, error) { state = 'degraded'; console.warn('Loading: ' + name + ' failed:', error?.message || error); mark(name, 'failed'); },
    // Settles a part from a promise (resolved: ready; rejected: failed).
    track(name, promise) { Promise.resolve(promise).then(result => this.done(name, result), error => this.fail(name, error)); },
    get parts() { return Object.fromEntries([...parts].map(([name, part]) => [name, {...part}])); },
  };
  // An uncaught error before the room is ready means a part may never
  // report: everything still waiting is given up, and the page shows.
  const broken = event => {
    if (settled) return;
    for (const [name, part] of parts) if (!part.done) window.siteReadiness.fail(name, event.error || event.reason || event.message);
  };
  addEventListener('error', broken);
  addEventListener('unhandledrejection', broken);
  // The cloth's inscription font (index.html's Google Fonts link). Asked for
  // once the document is parsed: the body's scripts wait for the head's
  // stylesheets, so its @font-face is known by then.
  const loadFont = () => {
    const font = document.fonts?.load('600 64px Cinzel');
    if (font) font.then(faces => window.siteReadiness.done('font', faces.length ? 'ready' : 'missing'), () => window.siteReadiness.done('font', 'missing'));
    else window.siteReadiness.done('font', 'missing');
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', loadFont, {once: true});
  else loadFont();
})();
