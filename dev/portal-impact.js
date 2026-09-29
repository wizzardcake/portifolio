/* Opt-in test controls. Remove this script tag to remove the entire harness. */
(() => {
  if (new URLSearchParams(location.search).get('impactDebug') !== '1') return;
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
