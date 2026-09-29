/* Opt-in test controls for the orb drop (portal-reaction.js). index.html loads
   this file only with ?impactDebug=1; its styles live here too, so nothing of
   it reaches the normal page. Delete this file to remove the harness. */
(() => {
  if (new URLSearchParams(location.search).get('impactDebug') !== '1') return;
  const style = document.createElement('style');
  style.textContent = `
    .impact-debug {
      position: fixed; top: 64px; right: 16px; z-index: 9999;
      display: grid; gap: 9px; width: min(230px, calc(100vw - 32px)); padding: 14px;
      border: 1px solid #92d6c94d; border-radius: 10px;
      background: #101d20ed; color: #d4e9e2; font: 12px/1.4 system-ui, sans-serif;
      box-shadow: 0 8px 28px #0006;
    }
    .impact-debug label { display: grid; gap: 4px; }
    .impact-debug input { width: 100%; accent-color: #83dac6; }
    .impact-debug select, .impact-debug button {
      padding: 7px; color: inherit; background: #203638; border: 1px solid #92d6c960;
      border-radius: 5px; font: inherit;
    }
    .impact-debug button { cursor: pointer; }
    .impact-debug :focus-visible { outline: 2px solid #b9f5df; outline-offset: 3px; }
    .impact-debug output { min-height: 2.8em; color: #a8c3bd; }
    @media (max-width: 600px) {
      .impact-debug { top: 54px; right: 8px; width: 172px; padding: 10px; gap: 6px; font-size: 11px; }
    }`;
  document.head.append(style);
  const panel = document.createElement('section');
  panel.className = 'impact-debug'; panel.setAttribute('aria-label', 'Portal impact preview');
  panel.innerHTML = `<strong>Portal impact preview</strong>
    <label>Intensity <input type="range" min="0.2" max="1" step="0.05" value="0.85"></label>
    <label>Impact point <select><option value="center">Centre</option><option value="left">Left</option><option value="right">Right</option></select></label>
    <button type="button">Drop orb</button>
    <output aria-live="polite">Uncover the portal, then drop the orb.</output>`;
  document.body.append(panel);
  let serial = 0;
  panel.querySelector('button').addEventListener('click', async () => {
    const mine = ++serial, point = panel.querySelector('select').value;
    const position = point === 'left' ? {x:.28,y:.58} : point === 'right' ? {x:.72,y:.42} : {x:.5,y:.5};
    const output = panel.querySelector('output');
    output.value = 'Drop / ripple / suction / recovery';
    const result = await window.triggerPortalImpact(position, Number(panel.querySelector('input').value));
    if (mine === serial) output.value = result.completed ? 'Settled. Ready for another impact.'
      : result.reason === 'not-ready' ? 'Uncover the portal and let the orb settle first.' : `Stopped: ${result.reason}`;
  });
})();
