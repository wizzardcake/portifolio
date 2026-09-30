/* One perspective definition for the architectural renderer and the existing
   CSS portal. World coordinates are metres: +Y up, +Z toward the seated viewer.
   CSS portal coordinates are pixels: +Y toward the viewer, +Z above the table. */
(() => {
  const screen = document.getElementById('screen');
  const table = screen.querySelector('.portal-table');
  const root = document.documentElement;
  const camera = {yaw: 0, pitch: 75};
  // Two camera states on one fixed downward tilt; `approach` blends them
  // (0 = wide, 1 = seated). Distances are from the table centre.
  const state = {camera, tableHeight: .46, fov: 72, approach: 1,
    // Intro / wide view: standing back at the room's open end, high enough to
    // see the chair in front of the table and floor behind it. The distance
    // fits the reference tabletop to `frame` of the viewport width, then steps
    // back by `retreat`.
    wide: {eye: 1.55, frame: {wide: .55, portrait: .94}, retreat: 1.1},
    // Final seated POV: the eye of someone sitting in the chair centred in
    // front of the table (seat 0.42 m; the table is knee height). Narrow
    // viewports back away until the real tabletop's front edge spans at most
    // `fit` of the viewport width.
    seated: {eye: 1.18, distance: 1.6, fit: {wide: .94, portrait: .8}}};
  function update() {
    const width = screen.clientWidth, height = screen.clientHeight;
    const units = Math.max(300, width / 2.06);
    const pitch = camera.pitch * Math.PI / 180;
    const tilt = Math.PI / 2 - pitch;
    const focal = innerHeight / (2 * Math.tan(state.fov * Math.PI / 360));
    const portrait = innerWidth < 900 && innerWidth < innerHeight;
    const {wide, seated} = state, format = portrait ? 'portrait' : 'wide';
    // Distance at which a tabletop front edge of `span` metres, `near` metres
    // in front of the table centre, fills `share` of the viewport width.
    const fitting = (span, near, share, eye) => near +
      (focal * span / (innerWidth * share) - (eye - state.tableHeight) * Math.sin(tilt)) / Math.cos(tilt);
    // The wide view fits a fixed reference footprint, the original 1.4 x 1.68
    // tabletop, so resizing the table in portal.css never moves it.
    const wideDistance = fitting(1.4 * width / units, (portrait ? 1.4 : .94) * height / units,
      wide.frame[format], wide.eye) + wide.retreat;
    const framing = window.portalTable?.framing;
    const seatedDistance = Math.max(seated.distance, fitting((framing?.width ?? table.clientWidth) / units,
      (framing?.front ?? (table.offsetTop + table.clientHeight - height / 2)) / units, seated.fit[format], seated.eye));
    const distance = wideDistance + (seatedDistance - wideDistance) * state.approach;
    const eyeHeight = wide.eye + (seated.eye - wide.eye) * state.approach;
    const elevation = eyeHeight - state.tableHeight;
    const viewY = (elevation * Math.cos(tilt) - distance * Math.sin(tilt)) * units;
    const viewDistance = (distance * Math.cos(tilt) + elevation * Math.sin(tilt)) * units;
    const anchorY = innerHeight * (portrait ? .60 : .54);
    const originY = anchorY - focal * viewY / viewDistance;
    Object.assign(state, {width, height, units, tilt, focal, eyeHeight, distance, wideDistance, seatedDistance, viewY, viewDistance, originY, anchorY, appliedPitch:camera.pitch,
      localEyeY: distance * units, localEyeZ: elevation * units});
    for (const [key,value] of Object.entries({
      '--scene-focal': focal, '--scene-origin-y': originY,
      '--table-view-y': viewY, '--table-view-z': focal - viewDistance,
      '--table-leg-length': state.tableHeight * units
    })) root.style.setProperty(key,value+'px');
    screen.style.setProperty('--view-pitch',camera.pitch+'deg');
    window.dispatchEvent(new Event('scene-camera-change'));
  }
  state.update = update;
  state.setApproach = progress => {
    state.approach = Math.max(0, Math.min(1, progress));
    update();
  };
  // Convert a desired reader-facing viewport rectangle back into portal-local
  // coordinates, so the orb morph and HTML reader continue to share one target.
  state.reader = () => {
    const depth = state.focal * .14, scale = state.focal / (state.focal - depth);
    const y = (innerHeight * .35 - state.originY) / scale - state.viewY;
    const z = depth - (state.focal - state.viewDistance);
    const p = camera.pitch * Math.PI / 180;
    return {width: Math.min(1000,innerWidth*.88)/scale,
      height: Math.min(620,innerHeight*.56)/scale,
      y: y*Math.cos(p)+z*Math.sin(p), z: -y*Math.sin(p)+z*Math.cos(p)};
  };
  window.sceneCamera = state;
  new ResizeObserver(update).observe(screen);
  addEventListener('resize',update);
  update();
})();
