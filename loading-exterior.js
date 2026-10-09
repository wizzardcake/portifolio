/* The loading screen's exterior: one floating building grown from the portal
   orb's material, seen from the void, with its single entrance the way in.
   The art is rendered offline (dev/exterior-art.html, exported to
   assets/loading/ by dev/exterior-export.mjs) at three moments of the
   glass's inner flow; here they are layered and crossfaded, the building
   floats and its halo and entrance breathe. Every motion is a CSS animation
   on the compositor (loading-exterior.css): the page's main thread is busy
   building the room meanwhile, and anything drawn there would stall.
   Reduced motion: one still image.

   The same contract as loading-portal.js, for loading-gate.js:
   createLoadingPortal(container) -> {element, opening, doorwayGrowth,
   setApproach, pause, play, setReducedMotion, stats, dispose}. */
const LAYERS = ['assets/loading/exterior-a.webp', 'assets/loading/exterior-b.webp', 'assets/loading/exterior-c.webp'];
// The entrance on the image, in fractions (dev/exterior-export.mjs prints it).
const DOOR = {x: .5204, y: .6191, width: .0882, height: .1548};

export function createLoadingPortal(container, {reducedMotion} = {}) {
  if (!(container instanceof Element)) throw new TypeError('A mount element is required');
  const started = performance.now();
  const element = document.createElement('div');
  element.className = 'loading-exterior';
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = '<div class="loading-exterior__building"><div class="loading-exterior__halo"></div>'
    + LAYERS.map((src, i) => `<img class="loading-exterior__layer loading-exterior__layer--${'abc'[i]}" src="${new URL(src, document.baseURI).href}" alt="" decoding="async" draggable="false">`).join('')
    + '<div class="loading-exterior__door"></div></div>';
  container.append(element);
  const building = element.querySelector('.loading-exterior__building');
  const base = element.querySelector('.loading-exterior__layer--a');
  let disposed = false, approach = 0, decodedAt = null;
  // Shown once the base layer is decoded, so it never draws in half-loaded.
  const shown = base.decode().then(() => {
    if (disposed) return;
    decodedAt = performance.now();
    element.classList.add('is-shown');
  });
  shown.catch(() => {});
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const sync = override => {
    const still = override ?? media.matches;
    element.dataset.reducedMotion = String(still);
  };
  let override = reducedMotion;
  sync(override);
  const onMedia = () => sync(override);
  media.addEventListener('change', onMedia);
  return {
    element,
    // Resolves once the art is on screen (rejects if it cannot load).
    ready: shown,
    // The entrance does not grow by itself as the view nears: the gate's
    // zoom does all of the approach.
    doorwayGrowth: 0,
    get opening() {
      const r = building.getBoundingClientRect();
      return {x: r.left + r.width * DOOR.x, y: r.top + r.height * DOOR.y, width: r.width * DOOR.width, height: r.height * DOOR.height};
    },
    // The approach brightens the light inside the entrance and lets the halo go.
    setApproach(value) {
      if (disposed || !Number.isFinite(value)) return;
      approach = Math.min(1, Math.max(0, value));
      element.style.setProperty('--exterior-approach', approach.toFixed(3));
    },
    pause() { element.classList.add('is-paused'); },
    play() { element.classList.remove('is-paused'); },
    setReducedMotion(value) { override = typeof value === 'boolean' ? value : undefined; sync(override); },
    get stats() {
      return {renderer: 'css', layers: LAYERS.length, decodedMs: decodedAt === null ? null : Math.round(decodedAt - started),
        approach, reducedMotion: element.dataset.reducedMotion === 'true', disposed};
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      media.removeEventListener('change', onMedia);
      element.remove();
    },
  };
}
