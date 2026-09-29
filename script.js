// ==========================================================================
// INTRO SEQUENCE — power-on boot ritual
// ==========================================================================
// The portal lies on a table. We walk straight toward it without rotating
// the table or standing the portal up. At arm's reach the
// charge dial becomes interactive: a ball fills the ring and you spin
// it in place — drag any direction, anywhere — like turning a trackball,
// rather than dragging a dot around a circular path. Once fully charged
// the portal unlocks, its solid seal lifts into liquid matter and the
// camera eases back. Text flies from the center first, followed by cards.
(function () {
  const introScene = document.getElementById('introScene');
  const deviceTilt = document.getElementById('deviceTilt');
  const indicator = document.getElementById('introIndicator');
  const indicatorTrack = document.querySelector('.intro-indicator-track');
  const veil = document.getElementById('powerVeil');
  const flash = document.getElementById('powerFlash');
  const wordmark = document.getElementById('wordmark');
  const screenEl = document.getElementById('screen');
  const clothControl = document.getElementById('tableCloth');

  if (!introScene || !deviceTilt || !indicator || !indicatorTrack || !veil || !flash || !wordmark || !screenEl || !clothControl) return;

  // The five presets are now just the endpoints of one continuous ramp —
  // every degree you drag interpolates brightness/saturate/etc smoothly
  // between them, instead of only updating in four big, sparse jumps
  // every 220° (which read as "dead" for most of the drag).
  // Brightness/saturate now start at full (1/1) instead of a dim 0.2/0.22 —
  // that dimming was hiding the whole nebula/starfield behind the ball at
  // rest, not just dialing down a charge glow. The timing cues (pulse/spark
  // speeding up) still carry the "charging up" feel on their own.
  const LEVELS = [
    { brightness: 1, saturate: 1, pulseDur: 5.2, sparkDur: 9.5 },
    { brightness: 1.08, saturate: 1.05, pulseDur: 4.2, sparkDur: 7.6 },
    { brightness: 1.16, saturate: 1.1, pulseDur: 3.3, sparkDur: 5.8 },
    { brightness: 1.24, saturate: 1.16, pulseDur: 2.4, sparkDur: 4.2 },
    { brightness: 1.35, saturate: 1.25, pulseDur: 1.5, sparkDur: 2.6 },
  ];
  const TOTAL_DRAG_PX = 3600; // cumulative px of pointer movement to fully charge
  const SPIN_DEG_PER_PX = 0.5; // purely visual — how fast the wireframe ball turns
  const NORMAL_PULSE_DUR = 5; // matches the site's normal resting pulse speed
  const NORMAL_SPARK_DUR = 6; // matches the site's normal resting spark speed
  // Move only the camera distance. The same landscape tablet and its table
  // remain on one horizontal plane throughout the shot and after unlocking.
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const POSES = ['intro-pose', 'intro-pose-zoomed'];
  let approachAnimation = null;

  function setPose(pose) {
    deviceTilt.classList.remove(...POSES);
    if (pose) deviceTilt.classList.add(pose);
  }

  function cancelApproach() {
    approachAnimation?.cancel();
    approachAnimation = null;
    window.sceneCamera.setApproach(1);
    deviceTilt.classList.remove('intro-walking');
    deviceTilt.dataset.approach = 'ready';
    clothControl.removeAttribute('aria-disabled');
  }

  function runApproach() {
    cancelApproach();
    measureScreen();
    // Disable the CSS transition while setting either endpoint, including
    // reduced motion and replay. The dial stays still once the shot ends.
    deviceTilt.classList.add('intro-walking');
    if (reducedMotion.matches) {
      setPose('intro-pose-zoomed');
      void deviceTilt.offsetHeight;
      deviceTilt.classList.remove('intro-walking');
      clothControl.tabIndex = 0;
      return;
    }
    setPose('intro-pose');
    deviceTilt.dataset.approach = 'walking';
    clothControl.setAttribute('aria-disabled', 'true');
    clothControl.tabIndex = -1;
    // A real camera dolly shared by the room and CSS portal. Keep the eye
    // height, downward angle and FOV fixed instead of zooming a flat wrapper.
    let frame;
    const started = performance.now();
    const animation = {cancel: () => cancelAnimationFrame(frame)};
    approachAnimation = animation;
    const step = now => {
      if (approachAnimation !== animation) return;
      const t = Math.min(1, (now - started) / 5400);
      window.sceneCamera.setApproach(t * t * (3 - 2 * t));
      if (t < 1) frame = requestAnimationFrame(step);
      else {
        setPose('intro-pose-zoomed');
        cancelApproach();
        clothControl.tabIndex = 0;
      }
    };
    step(started);
  }
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches && approachAnimation) runApproach();
  });

  let finishing = false;
  let sequenceGen = 0; // bumped whenever the dev nav buttons force-jump state,
                        // so stale queued finishing-sequence timeouts bail out
  const flights = new Set();
  let dragging = false;
  let cumulativeDrag = 0; // 0..TOTAL_DRAG_PX — clamped charge progress, in dragged px
  let spinX = 0; // unclamped — the wireframe ball's live rotateX, in degrees
  let spinY = 0; // unclamped — the wireframe ball's live rotateY, in degrees
  let lastX = 0;
  let lastY = 0;
  let velX = 0; // deg/frame — smoothed recent spin speed, for coasting on release
  let velY = 0;
  let inertiaHandle = null;
  let pendingDX = 0; // raw drag movement queued since the last rendered frame
  let pendingDY = 0;
  let pendingDistance = 0;
  let moveRafHandle = null;
  const INERTIA_FRICTION = 0.94; // per frame — how fast the coast decays
  const INERTIA_MIN_VEL = 0.02; // deg/frame — below this, just stop

  function cancelInertia() {
    if (inertiaHandle) cancelAnimationFrame(inertiaHandle);
    inertiaHandle = null;
  }

  function startInertia() {
    cancelInertia();
    if (Math.abs(velX) < INERTIA_MIN_VEL && Math.abs(velY) < INERTIA_MIN_VEL) return;
    const step = () => {
      spinX += velX;
      spinY += velY;
      velX *= INERTIA_FRICTION;
      velY *= INERTIA_FRICTION;
      indicator.style.setProperty('--spin-x', spinX + 'deg');
      indicator.style.setProperty('--spin-y', spinY + 'deg');
      window.portalMatter?.charge(cumulativeDrag / TOTAL_DRAG_PX, spinY);
      if (Math.abs(velX) > INERTIA_MIN_VEL || Math.abs(velY) > INERTIA_MIN_VEL) {
        inertiaHandle = requestAnimationFrame(step);
      } else {
        inertiaHandle = null;
      }
    };
    inertiaHandle = requestAnimationFrame(step);
  }

  function applyProgress(amount) {
    const t = Math.max(0, Math.min(1, amount / TOTAL_DRAG_PX));
    const idx = t * (LEVELS.length - 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(LEVELS.length - 1, i0 + 1);
    const frac = idx - i0;
    const lerp = (a, b) => a + (b - a) * frac;
    const a = LEVELS[i0];
    const b = LEVELS[i1];
    deviceTilt.style.setProperty('--charge-brightness', lerp(a.brightness, b.brightness));
    deviceTilt.style.setProperty('--charge-saturate', lerp(a.saturate, b.saturate));
    deviceTilt.style.setProperty('--pulse-dur', lerp(a.pulseDur, b.pulseDur) + 's');
    deviceTilt.style.setProperty('--spark-dur', lerp(a.sparkDur, b.sparkDur) + 's');
    window.portalMatter?.charge(t, spinY);
    indicator.setAttribute('aria-label', `Åpne portalen: ${Math.round(t * 100)} prosent ladet. Drei kulen eller trykk Enter.`);
  }

  function onIndicatorDown(e) {
    if (finishing || approachAnimation || e.button !== 0) return;
    cancelInertia();
    if (moveRafHandle !== null) cancelAnimationFrame(moveRafHandle);
    moveRafHandle = null;
    pendingDX = 0;
    pendingDY = 0;
    pendingDistance = 0;
    velX = 0;
    velY = 0;
    dragging = true;
    indicator.classList.add('dragging');
    lastX = e.clientX;
    lastY = e.clientY;
    indicator.setPointerCapture(e.pointerId);
  }

  // Pointermove can fire far faster than the screen can repaint (well past
  // 60Hz on some mice/trackpads), and this scene has other continuous
  // animations of its own (the screen's glow breathe, the orbiting sparks)
  // competing for the same main thread. Doing real work — several style
  // writes, one of them onto a big ancestor — on every single raw event
  // was what actually made the spin read as choppy; queuing the movement
  // and only applying it once per rendered frame fixes that regardless of
  // how fast events arrive.
  function onIndicatorMove(e) {
    if (!dragging) return;
    pendingDistance += Math.hypot(e.clientX - lastX, e.clientY - lastY);
    pendingDX += e.clientX - lastX;
    pendingDY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (moveRafHandle === null) {
      moveRafHandle = requestAnimationFrame(flushPendingDrag);
    }
  }

  // Applies whatever movement has queued up since the last rendered frame.
  // Also called directly (not just from rAF) on release, so a drag that
  // ends before its last queued frame ever renders can't lose that final
  // motion — which would otherwise also mean starting the coast off a
  // stale velocity, undercutting the momentum this is meant to preserve.
  function flushPendingDrag() {
    if (moveRafHandle !== null) { cancelAnimationFrame(moveRafHandle); moveRafHandle = null; }
    const dx = pendingDX;
    const dy = pendingDY;
    const moved = pendingDistance;
    pendingDX = 0;
    pendingDY = 0;
    pendingDistance = 0;
    if (moved === 0) return;

    // Raw pointer movement, not an angle around the ball's center — a
    // straight-line drag through the middle has no well-defined angle, so
    // tracking rotation that way went dead exactly for that common case.
    // The wireframe ball is a genuine 3D object (see .ball-core/.ball-ring
    // in styles.css), so horizontal drag turns it around its vertical axis
    // and vertical drag tips it around its horizontal axis — two independent
    // rotations driven directly off dx/dy, never both zero at once for a
    // real drag, and no flat conic-gradient standing in for depth.
    const dSpinY = dx * SPIN_DEG_PER_PX;
    const dSpinX = -dy * SPIN_DEG_PER_PX;
    spinY += dSpinY;
    spinX += dSpinX;
    indicator.style.setProperty('--spin-x', spinX + 'deg');
    indicator.style.setProperty('--spin-y', spinY + 'deg');

    // Smoothed so a single noisy last sample right before release can't
    // dictate the whole coast — without this the ball had zero weight to
    // it and just stopped dead the instant you let go, instead of spinning
    // on like something with actual mass/momentum.
    velX = velX * 0.7 + dSpinX * 0.3;
    velY = velY * 0.7 + dSpinY * 0.3;

    // Progress still comes from unsigned distance moved, so it can never
    // cancel out regardless of drag shape — a signed accumulator (like the
    // spin above) would, e.g. a full circular drag's left/right and
    // up/down components sum back to zero.
    cumulativeDrag = Math.max(0, Math.min(TOTAL_DRAG_PX, cumulativeDrag + moved));
    applyProgress(cumulativeDrag);
    if (cumulativeDrag >= TOTAL_DRAG_PX && !finishing) {
      finishing = true;
      runFinishingSequence();
    }
  }

  function onIndicatorUp(e) {
    if (!dragging) return;
    dragging = false;
    flushPendingDrag();
    indicator.classList.remove('dragging');
    if (indicator.hasPointerCapture(e.pointerId)) indicator.releasePointerCapture(e.pointerId);
    if (!finishing) startInertia();
  }

  indicator.addEventListener('pointerdown', onIndicatorDown);
  indicator.addEventListener('pointermove', onIndicatorMove);
  indicator.addEventListener('pointerup', onIndicatorUp);
  indicator.addEventListener('pointercancel', onIndicatorUp);
  indicator.addEventListener('keydown', (event) => {
    if (finishing || approachAnimation || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    cumulativeDrag = TOTAL_DRAG_PX;
    applyProgress(cumulativeDrag);
    finishing = true;
    runFinishingSequence();
  });

  // ---- The covered table. Pull the cloth in any direction to draw it off,
  // or click it / press Enter; a short pull lets it settle back. Uncovering
  // wakes the portal, and the orb then rises out of it (runFinishingSequence).
  // The spin-to-unlock seal above is no longer reachable (hidden in CSS).
  let clothPull = null;
  const clothReady = () => !finishing && !approachAnimation && document.body.classList.contains('table-covered');

  function stripCloth(dx, dy, instant) {
    clothPull = null;
    clothControl.classList.remove('is-pulling');
    clothControl.classList.add('is-removed');
    clothControl.tabIndex = -1;
    clothControl.blur();
    const sliding = window.portalCloth
      ? window.portalCloth.slideOff(dx, dy, instant)
      : new Promise(done => window.setTimeout(done, instant || reducedMotion.matches ? 0 : 1200));
    // The portal's depths and glow return while the cloth slides away.
    document.body.classList.remove('table-covered');
    const myGen = sequenceGen;
    sliding.then(() => {
      if (sequenceGen === myGen) runFinishingSequence(instant ? 1800 : 3400);
    });
  }

  function uncoverTable(dx = 0, dy = 1) {
    if (finishing) return;
    finishing = true;
    stripCloth(dx, dy, false);
  }

  clothControl.addEventListener('pointerdown', (event) => {
    if (!clothReady() || event.button !== 0) return;
    event.preventDefault();
    const r = clothControl.getBoundingClientRect();
    clothPull = {x: event.clientX, y: event.clientY, w: r.width, h: r.height, fx: 0, fy: 0, moved: 0};
    clothControl.classList.add('is-pulling');
  });
  // On the window: a real pull leaves the cloth's footprint almost at once.
  window.addEventListener('pointermove', (event) => {
    if (!clothPull) return;
    const dx = event.clientX - clothPull.x, dy = event.clientY - clothPull.y;
    clothPull.moved = Math.max(clothPull.moved, Math.hypot(dx, dy));
    clothPull.fx = dx / clothPull.w;
    clothPull.fy = dy / clothPull.h;
    window.portalCloth?.pull(clothPull.fx, clothPull.fy);
  });
  function releaseCloth() {
    if (!clothPull) return;
    const {fx, fy, moved} = clothPull;
    clothPull = null;
    clothControl.classList.remove('is-pulling');
    // A click, or a decisive pull, takes the cloth off toward wherever it was
    // drawn (a click draws it toward the viewer); a hesitant one settles back.
    if (moved < 6) uncoverTable(0, 1);
    else if (Math.hypot(fx, fy) > .16) uncoverTable(fx, fy);
    else window.portalCloth?.settle();
  }
  window.addEventListener('pointerup', releaseCloth);
  window.addEventListener('pointercancel', releaseCloth);
  clothControl.addEventListener('keydown', (event) => {
    if (!clothReady() || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    uncoverTable(0, 1);
  });

  // ---- Keep the dial's own circle sized to fit inside the screen (not the
  // old, deliberately oversized tap-timing orbit) — re-measured each frame
  // so it tracks correctly through the pose transitions and any viewport
  // size, using the screen's own flattest edge as the reference so heavy
  // rotateX foreshortening (during the wide establishing pose) can't
  // inflate it.
  let syncHandle = null;
  function measureScreen() {
    // offsetWidth/Height (the element's own pre-transform layout box) —
    // getBoundingClientRect() would have been wrong here: it reports the
    // *post*-3D-transform bounding box, which a heavy rotateX inflates
    // well past the screen's actual visual size, blowing the ring up.
    const w = screenEl.offsetWidth;
    const h = screenEl.offsetHeight;
    screenEl.style.setProperty('--indicator-radius', (Math.min(w, h) * 0.4) + 'px');
  }
  function syncToScreen() {
    measureScreen();
    syncHandle = requestAnimationFrame(syncToScreen);
  }
  function startSync() {
    if (syncHandle === null) syncHandle = requestAnimationFrame(syncToScreen);
  }
  function stopSync() {
    if (syncHandle !== null) cancelAnimationFrame(syncHandle);
    syncHandle = null;
  }
  startSync();

  function portalCenter() {
    const origin = screenEl.querySelector('.portal-origin').getBoundingClientRect();
    if (screenEl.offsetWidth) return {x: origin.left, y: origin.top};
    const r = screenEl.getBoundingClientRect();
    // In compact mode the portal can still carry its "hidden" (display:
    // none) state at this point — its rect then collapses to all zeros,
    // which would send everything flying in from the viewport's top-left
    // corner instead of the portal. Fall back to the device's own center.
    if (r.width < 1 || r.height < 1) {
      const dr = deviceTilt.getBoundingClientRect();
      return { x: dr.left + dr.width / 2, y: dr.top + dr.height / 2 };
    }
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // Animate a temporary copy in viewport coordinates. The actual element
  // stays hidden until arrival, so nested rotations and moving parents
  // cannot displace its origin away from the center of the portal.
  function flyFromPortal(el, center, { dur = .9, delay = 0 } = {}) {
    const r = el.getBoundingClientRect();
    const dx = center.x - (r.left + r.width / 2);
    const dy = center.y - (r.top + r.height / 2);
    const ghost = el.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    ghost.classList.add('portal-flight');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    const style = getComputedStyle(el);
    Object.assign(ghost.style, {left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px',
      visibility: 'visible', font: style.font, color: style.color, opacity: '1', zIndex: '200'});
    ghost.style.setProperty('--card-glow-rgb', style.getPropertyValue('--card-glow-rgb'));
    document.body.appendChild(ghost);
    el.style.visibility = 'hidden';
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation = ghost.animate([
      {transform: `translate(${dx}px, ${dy}px) perspective(600px) rotateY(-48deg) scale(.015)`, opacity: 0, filter: 'blur(4px)'},
      {transform: `translate(${dx * .85}px, ${dy * .85}px) perspective(600px) rotateY(-25deg) scale(.55)`, opacity: 1, filter: 'blur(0)', offset: .3},
      {transform: 'translate(0, 0) perspective(600px) rotateY(0deg) scale(1)', opacity: 1, filter: 'blur(0)'}
    ], {duration: reduced ? 80 : dur * 1000, delay: reduced ? 0 : delay * 1000, easing: 'cubic-bezier(.16,.65,.3,1)', fill: 'both'});
    const flight = {animation, ghost, el};
    flights.add(flight);
    const cleanup = () => { ghost.remove(); el.style.visibility = ''; flights.delete(flight); };
    return animation.finished.then(cleanup, cleanup);
  }

  // ---- Wordmark: rebuilds it letter by letter, each one flying out of the
  // portal's center to its actual spot — used both for "ANNISJ" appearing
  // the first time and for every later line in the text-morph sequence.
  function setWordmarkText(str) {
    wordmark.innerHTML = '';
    wordmark.classList.toggle('is-long', str.length > 8);
    const letters = Array.from(str).map((ch) => {
      const span = document.createElement('span');
      span.className = 'wordmark-letter';
      span.textContent = ch === ' ' ? ' ' : ch;
      wordmark.appendChild(span);
      return span;
    });
    // Measure only after the entire line exists: an empty topbar changes
    // the portal's height and therefore shifts its actual center.
    const center = portalCenter();
    letters.forEach((span, i) => flyFromPortal(span, center, {dur: .75, delay: i * .04}));
    wordmark.dispatchEvent(new Event('letterschanged'));
  }

  function runTextSequence(done, myGen) {
    document.body.classList.add('intro-textreveal');
    setWordmarkText('ANNISJ');
    window.setTimeout(() => {
      if (sequenceGen !== myGen) return;
      setWordmarkText('Oisann');
      window.setTimeout(() => {
        if (sequenceGen !== myGen) return;
        setWordmarkText('Du fant min korte folio');
        window.setTimeout(() => {
          if (sequenceGen !== myGen) return;
          setWordmarkText('ANNISJ');
          window.setTimeout(() => {
            if (sequenceGen === myGen) done();
          }, 1100);
        }, 1900);
      }, 1100);
    }, 1000);
  }

  // Emit each card separately after all the text has arrived.
  async function revealScene() {
    document.body.classList.add('intro-done');
    const center = portalCenter();
    const arrivals = Array.from(document.querySelectorAll('.hand-card'), (hc, i) =>
      flyFromPortal(hc, center, {dur: 1, delay: i * .14}));
    arrivals.push(flyFromPortal(document.getElementById('themeToggle'), center, {dur: .85, delay: .75}));
    await Promise.all(arrivals);
    document.body.classList.remove('scene-interacting');
    document.getElementById('portalHint').textContent = 'Dra et kort inn i portalen';
  }

  // Runs once the portal is uncovered: summons the orb up out of it, lets it
  // settle, then sends the text and the cards out of the portal.
  function runFinishingSequence(riseDuration) {
    indicator.removeEventListener('pointerdown', onIndicatorDown);
    deviceTilt.style.setProperty('--charge-brightness', '1.15');

    const myGen = ++sequenceGen; // if a dev-nav button fires before this
                                  // finishes, these queued steps no-op instead
                                  // of clobbering the forced state.

    cancelInertia();
    cancelApproach();
    indicator.classList.remove('dragging');
    indicator.tabIndex = -1;
    document.body.classList.add('scene-interacting');
    const rise = window.portalMatter?.unlock(riseDuration) ?? Promise.resolve(true);
    deviceTilt.style.setProperty('--charge-brightness', '1');
    deviceTilt.style.setProperty('--charge-saturate', '1');
    deviceTilt.style.setProperty('--pulse-dur', NORMAL_PULSE_DUR + 's');
    deviceTilt.style.setProperty('--spark-dur', NORMAL_SPARK_DUR + 's');
    // All flights share a stationary viewport coordinate system, letters too.
    rise.then(() => {
      if (sequenceGen !== myGen) return;
      setPose(null);
      window.setTimeout(() => {
        if (sequenceGen !== myGen) return;
        document.body.classList.remove('intro-active');
        stopSync();
        runTextSequence(() => {
          if (sequenceGen !== myGen) return;
          document.body.classList.remove('intro-textreveal');
          revealScene();
        }, myGen);
      }, reducedMotion.matches ? 20 : 700);
    });
  }

  // --------------------------------------------------------------------
  // TEMPORARY dev-nav: jump back to the start of the boot ritual, or skip
  // straight past it to the fully powered-on end state.
  // --------------------------------------------------------------------
  function snapDeviceTilt(mutate) {
    // Dev-nav jumps are instant, not animated — briefly kill the transform
    // transition so flipping intro-pose (and, with it, .intro-scene's
    // perspective/position) can't corrupt an in-flight transition the way it
    // does if toggled mid-animation during the real finishing sequence.
    deviceTilt.style.transition = 'none';
    mutate();
    void deviceTilt.offsetHeight; // reflow
    requestAnimationFrame(() => {
      deviceTilt.style.transition = '';
    });
  }

  function jumpToTapPhase() {
    sequenceGen++; // invalidate any in-flight finishing sequence
    flights.forEach(({animation}) => animation.cancel());
    if (typeof retrieveParkedCard === 'function') retrieveParkedCard();
    window.portalMatter?.reset();
    document.body.classList.remove('scene-interacting');
    indicator.tabIndex = 0;
    document.getElementById('portalHint').textContent = '';
    // Cover the table again; the orb is back asleep below the aperture.
    document.body.classList.add('table-covered');
    clothControl.classList.remove('is-removed', 'is-pulling');
    clothPull = null;
    window.portalCloth?.reset();
    finishing = false;
    cumulativeDrag = 0;
    cancelInertia();
    if (moveRafHandle !== null) cancelAnimationFrame(moveRafHandle);
    moveRafHandle = null;
    pendingDX = 0;
    pendingDY = 0;
    pendingDistance = 0;
    velX = 0;
    velY = 0;
    spinX = 0;
    spinY = 0;
    dragging = false;
    flash.classList.remove('flash');
    veil.style.setProperty('--veil-hole', '150%');
    document.body.classList.remove('intro-textreveal');
    indicator.style.setProperty('--spin-x', '0deg');
    indicator.style.setProperty('--spin-y', '0deg');
    snapDeviceTilt(() => {
      document.body.classList.remove('intro-done');
      document.body.classList.add('intro-active');
      setPose(POSES[0]);
    });
    applyProgress(0);
    indicator.removeEventListener('pointerdown', onIndicatorDown);
    indicator.addEventListener('pointerdown', onIndicatorDown);
    startSync();
    runApproach();
  }

  function jumpToFinished() {
    if (finishing) return;
    finishing = true;
    cumulativeDrag = TOTAL_DRAG_PX;
    cancelInertia();
    if (moveRafHandle !== null) cancelAnimationFrame(moveRafHandle);
    moveRafHandle = null;
    pendingDX = 0;
    pendingDY = 0;
    pendingDistance = 0;
    velX = 0;
    velY = 0;
    dragging = false;
    indicator.removeEventListener('pointerdown', onIndicatorDown);
    flash.classList.remove('flash');
    veil.style.setProperty('--veil-hole', '150%');
    document.body.classList.remove('intro-textreveal');
    stopSync();
    deviceTilt.style.setProperty('--pulse-dur', NORMAL_PULSE_DUR + 's');
    deviceTilt.style.setProperty('--spark-dur', NORMAL_SPARK_DUR + 's');
    deviceTilt.style.setProperty('--charge-brightness', '1');
    deviceTilt.style.setProperty('--charge-saturate', '1');
    stripCloth(0, 1, true);
  }

  const introBackBtn = document.getElementById('introBack');
  const introForwardBtn = document.getElementById('introForward');
  if (introBackBtn) introBackBtn.addEventListener('click', jumpToTapPhase);
  if (introForwardBtn) introForwardBtn.addEventListener('click', jumpToFinished);

  applyProgress(0);
  runApproach();
})();

// ==========================================================================
// THEME TOGGLE (auto -> light -> dark -> auto)
// ==========================================================================
const themeToggle = document.getElementById('themeToggle');
const THEME_ORDER = ['auto', 'light', 'dark'];
const THEME_ICON = { auto: '◐', light: '☀', dark: '☾' };

function applyTheme(theme) {
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  themeToggle.textContent = THEME_ICON[theme];
}

let savedTheme = 'auto';
try {
  savedTheme = localStorage.getItem('annisj-theme') || 'auto';
} catch (e) {
  savedTheme = 'auto';
}
applyTheme(savedTheme);

themeToggle.addEventListener('click', () => {
  if (themeToggle.dataset.justDragged) {
    delete themeToggle.dataset.justDragged;
    return;
  }
  const next = THEME_ORDER[(THEME_ORDER.indexOf(savedTheme) + 1) % THEME_ORDER.length];
  savedTheme = next;
  applyTheme(next);
  try { localStorage.setItem('annisj-theme', next); } catch (e) { /* ignore */ }
});

// ==========================================================================
// THEME TOGGLE AS A ROLLING BALL — draggable anywhere on the screen, with
// elastic edges (same feel as the desktop cards) and a rotation tied to how
// far it's traveled, so it visually rolls instead of just sliding.
// ==========================================================================
(function () {
  const ball = themeToggle;
  // The header and hand share the viewport, outside the table's perspective.
  const boundsEl = document.getElementById('experience');
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;
  let baseRotation = 0;
  let bounds = null;

  ball.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;

    const ballRect = ball.getBoundingClientRect();
    const boundsRect = boundsEl.getBoundingClientRect();
    originLeft = ballRect.left - boundsRect.left;
    originTop = ballRect.top - boundsRect.top;
    bounds = {
      minLeft: 0,
      minTop: 0,
      maxLeft: boundsRect.width - ballRect.width,
      maxTop: boundsRect.height - ballRect.height,
      radius: ballRect.width / 2,
    };
    ball.style.transition = 'none';
    ball.setPointerCapture(e.pointerId);
  });

  ball.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      moved = true;
      ball.classList.add('rolling');
    }
    if (!moved) return;

    const left = clampElastic(originLeft + dx, bounds.minLeft, bounds.maxLeft);
    const top = clampElastic(originTop + dy, bounds.minTop, bounds.maxTop);
    // Roll proportionally to distance traveled, like a ball on a flat
    // surface (rotation in radians = distance / radius).
    const rolled = (Math.hypot(dx, dy) / bounds.radius) * (180 / Math.PI);
    const spinDir = dx < 0 ? -1 : 1;
    ball.style.left = left + 'px';
    ball.style.top = top + 'px';
    ball.style.rotate = (baseRotation + spinDir * rolled) + 'deg';
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    ball.releasePointerCapture(e.pointerId);
    ball.classList.remove('rolling');
    if (!moved) return;

    ball.dataset.justDragged = '1';
    baseRotation = parseFloat(ball.style.rotate) || 0;

    const curLeft = parseFloat(ball.style.left) || 0;
    const curTop = parseFloat(ball.style.top) || 0;
    const snappedLeft = Math.min(Math.max(curLeft, bounds.minLeft), bounds.maxLeft);
    const snappedTop = Math.min(Math.max(curTop, bounds.minTop), bounds.maxTop);

    if (snappedLeft !== curLeft || snappedTop !== curTop) {
      ball.style.transition =
        'left 0.55s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)';
      ball.style.left = snappedLeft + 'px';
      ball.style.top = snappedTop + 'px';
    }
  }

  ball.addEventListener('pointerup', endDrag);
  ball.addEventListener('pointercancel', endDrag);
})();

// ==========================================================================
// WORDMARK LETTERS — each letter floats on its own, can be dragged off, and
// magnetically snaps back home when released close enough to its spot.
// ==========================================================================
(function () {
  const MAGNET_RADIUS = 46; // px — resistance kicks in inside this radius
  const MAGNET_SNAP = 16; // px — snaps fully home if released this close

  function magnetPull(dx, dy) {
    const dist = Math.hypot(dx, dy);
    if (dist < MAGNET_RADIUS) {
      const pull = Math.pow(dist / MAGNET_RADIUS, 2);
      return { x: dx * pull, y: dy * pull, dist };
    }
    return { x: dx, y: dy, dist };
  }

  function wireLetters() {
  document.querySelectorAll('.wordmark-letter').forEach((letter) => {
    if (letter.dataset.wired) return;
    letter.dataset.wired = 'true';
    let dragging = false;
    let startX = 0;
    let startY = 0;

    letter.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      letter.classList.add('dragging');
      letter.style.transition = 'none';
      letter.setPointerCapture(e.pointerId);
    });

    letter.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const m = magnetPull(dx, dy);
      letter.style.translate = `${m.x}px ${m.y}px`;
    });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      letter.releasePointerCapture(e.pointerId);
      letter.classList.remove('dragging');

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const dist = Math.hypot(dx, dy);

      letter.style.transition = 'translate 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
      if (dist < MAGNET_SNAP) {
        letter.style.translate = '0px 0px';
      } else {
        const m = magnetPull(dx, dy);
        letter.style.translate = `${m.x}px ${m.y}px`;
      }
      window.setTimeout(() => { letter.style.transition = ''; }, 420);
    }

    letter.addEventListener('pointerup', endDrag);
    letter.addEventListener('pointercancel', endDrag);
  });
  }
  wireLetters();
  document.getElementById('wordmark').addEventListener('letterschanged', wireLetters);
})();

// ==========================================================================
// DESKTOP <-> APP NAVIGATION
// ==========================================================================
const desktop = document.getElementById('desktop');
const screenEl = document.getElementById('screen');
const icons = document.querySelectorAll('[data-app]');
const appViews = document.querySelectorAll('[data-app-view]');

// Desktop mode (wide viewports): the table+portal layout. Mobile layout for
// that same idea is a separate, later pass — below this width everything
// stays exactly as the plain click-based nav always was.
const DESKTOP_MODE = window.matchMedia('(min-width: 900px)');

// Set by the portal mechanic below, so the "← Tilbake" button can retrieve
// whichever card is inside the portal instead of leaving its state stuck
// out of sync with a view it closed some other way.
let retrieveParkedCard = null;

function openApp(appId) {
  const target = document.getElementById(`app-${appId}`);
  if (!target) return;
  // In desktop mode the table+portal are both always-visible, separate
  // objects — only compact mode swaps which of table/screen fills the view.
  if (!DESKTOP_MODE.matches) {
    desktop.classList.add('hidden');
    screenEl.classList.remove('hidden');
  }
  appViews.forEach((view) => view.classList.remove('active'));
  target.classList.add('active');
}

function closeApp() {
  appViews.forEach((view) => view.classList.remove('active'));
  desktop.classList.remove('hidden');
  screenEl.classList.add('hidden');
  window.portalMatter?.restore();
}

icons.forEach((icon) => {
  icon.addEventListener('click', () => {
    if (icon.dataset.justDragged) {
      delete icon.dataset.justDragged;
      return;
    }
    // A peeking (non-front) card in the hand just comes to the front on a
    // tap — same as tapping a background card in the Prosjekter deck — it
    // takes a second tap once it's front to actually act on it.
    if (icon.closest('.hand-card') && handOrder[0] !== icon.dataset.app) {
      bringHandCardToFront(icon.dataset.app);
      return;
    }
    // In desktop mode a leaf card only activates the screen by being
    // thrown into the portal — a plain click no longer opens it directly.
    // Pointer activation always goes through the throw, on touch screens too.
    return;
  });
});

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => {
    // Desktop mode: the only way out is retrieving the card from the
    // portal, so the back button does that rather than leaving the
    // portal stuck "active" for a view that just closed some other way.
    if (retrieveParkedCard && retrieveParkedCard()) return;
    closeApp();
  });
});

// ==========================================================================
// DRAG HELPERS — shared elastic-edge math (used by the rolling theme-toggle
// ball; the hand's own cards use a simpler unclamped translate, see below).
// ==========================================================================
const DRAG_THRESHOLD = 6; // px before a pointerdown counts as a real drag
const ELASTIC_MAX = 70; // px of visible stretch, however far you pull

function rubberBand(over) {
  return ELASTIC_MAX * (1 - Math.exp(-over / ELASTIC_MAX));
}

function clampElastic(pos, min, max) {
  if (pos < min) return min - rubberBand(min - pos);
  if (pos > max) return max + rubberBand(pos - max);
  return pos;
}

// ==========================================================================
// HAND STACK — the five cards sit directly on top of each other like a
// hand held up in front of you: only the front card reads fully, the rest
// peek out behind it. Hovering a peeking card shows an enlarged readable
// copy; tapping one brings it to the front (same pattern as the Prosjekter
// deck's own stack, further below).
// ==========================================================================
let handOrder = ['prosjekter', 'arbeidserfaring', 'kurs', 'verktoy', 'ommeg'];
const HAND_CAN_HOVER = window.matchMedia('(hover: hover)').matches;

function layoutHand() {
  handOrder.forEach((id, i) => {
    const handCard = document.querySelector(`.hand-card--${id}`);
    if (!handCard) return;
    handCard.style.setProperty('--stack-i', i);
    handCard.style.zIndex = String(handOrder.length - i);
  });
}

function bringHandCardToFront(id) {
  if (handOrder[0] === id) return;
  handOrder = [id, ...handOrder.filter((x) => x !== id)];
  layoutHand();
}

// Moves `id` to `index` in the stack (0 = front), shifting the rest —
// used by the drag-to-reorder gesture below, which can drop a card
// anywhere in the order rather than only ever jumping to the front.
function moveHandCardTo(id, index) {
  const rest = handOrder.filter((x) => x !== id);
  const clamped = Math.max(0, Math.min(index, rest.length));
  rest.splice(clamped, 0, id);
  handOrder = rest;
  layoutHand();
}

layoutHand();

(function () {
  const cardPeek = document.createElement('div');
  cardPeek.id = 'cardPeek';
  cardPeek.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cardPeek);

  function showPeek(subCard) {
    const handCard = subCard.closest('.hand-card');
    const glow = getComputedStyle(handCard).getPropertyValue('--card-glow-rgb');
    cardPeek.className = 'card-peek sub-card is-visible' +
      (subCard.classList.contains('sub-card--ommeg') ? ' sub-card--ommeg' : '');
    cardPeek.style.setProperty('--card-glow-rgb', glow);
    cardPeek.innerHTML = subCard.innerHTML;
    const r = subCard.getBoundingClientRect();
    cardPeek.style.left = (r.left + r.width / 2) + 'px';
    cardPeek.style.top = (r.top + r.height / 2 - 30) + 'px';
    cardPeek.style.transform = 'translate(-50%, -100%)';
  }

  function hidePeek() {
    cardPeek.classList.remove('is-visible');
  }

  document.querySelectorAll('.sub-card[data-app]').forEach((subCard) => {
    if (HAND_CAN_HOVER) {
      subCard.addEventListener('pointerenter', (e) => {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        if (handOrder[0] === subCard.dataset.app) return; // front card is already fully readable
        showPeek(subCard);
      });
      subCard.addEventListener('pointerleave', hidePeek);
    }
  });
})();

// ==========================================================================
// PORTALEN — dragging a card close to the portal escalates its own glow
// continuously; throwing a card in sends it flying into the portal's
// center and shows its content on the screen. The only way back out is
// the temporary "Få tilbake kort" button (no more drag-back-out, no
// separate basseng — the portal is the screen itself).
// The same throw/project/retrieve lifecycle also serves the compact layout.
// ==========================================================================
(function () {
  const screenEl = document.getElementById('screen');
  const tunnel = document.querySelector('.screen-tunnel');
  const retrieveBtn = document.getElementById('portalRetrieve');
  if (!screenEl || !tunnel || !retrieveBtn) return;

  const APPROACH_RADIUS = 320; // px — glow starts escalating within this distance
  const ACTIVATE_RADIUS = 140; // px — release within this distance = thrown in
  const CARD_GLOW = {
    prosjekter: 'var(--relic-gold-rgb)',
    arbeidserfaring: 'var(--relic-gold-rgb)',
    kurs: 'var(--relic-teal-rgb)',
    verktoy: 'var(--relic-teal-rgb)',
    ommeg: 'var(--relic-burgundy-rgb)',
  };

  let activeCard = null; // whichever card is currently inside the portal
  let activationGen = 0;

  function portalCenter() {
    const r = screenEl.querySelector('.portal-origin').getBoundingClientRect();
    return { x: r.left, y: r.top };
  }

  function setIntensity(dist) {
    const t = 1 - Math.min(1, Math.max(0, (dist - ACTIVATE_RADIUS) / (APPROACH_RADIUS - ACTIVATE_RADIUS)));
    screenEl.style.setProperty('--portal-intensity', String(t));
    tunnel.classList.toggle('approach', t > 0.02);
  }

  function resetIntensity() {
    screenEl.style.setProperty('--portal-intensity', '0');
    tunnel.classList.remove('approach');
  }

  // Only one card can be inside the portal at a time — refuses if
  // something else is already in there (it must be retrieved first). A card
  // in flight has already claimed the portal (claimPortal) and is let in.
  function activate(appId, cardEl, glowVar) {
    if (activeCard && activeCard !== cardEl) return false;
    activeCard = cardEl;
    const generation = ++activationGen;
    screenEl.classList.add('portal-active');
    screenEl.classList.add('is-projecting');
    screenEl.style.setProperty('--portal-glow-rgb', glowVar || 'var(--relic-teal-rgb)');
    // The card is consumed before the free material starts becoming a page.
    window.setTimeout(async () => {
      if (generation !== activationGen) return;
      const complete = await window.portalMatter.project(appId);
      if (!complete || generation !== activationGen) return;
      openApp(appId);
      retrieveBtn.hidden = false;
      document.body.classList.remove('scene-interacting');
    }, 420);
    return true;
  }

  // A committed throw reserves the portal at release, so nothing else can be
  // thrown while the card is in the air; it only activates on arrival.
  function claimPortal(cardEl) {
    if (activeCard) return false;
    activeCard = cardEl;
    activationGen++;
    return true;
  }

  function deactivate() {
    activationGen++;
    activeCard = null;
    screenEl.classList.remove('portal-active');
    screenEl.style.removeProperty('--portal-glow-rgb');
    retrieveBtn.hidden = true;
    resetIntensity();
    closeApp();
    document.body.classList.remove('scene-interacting');
  }

  // ---- The throw: an invisible hand's magical flick. The front card is
  // aimed with a spectral ghost that follows the pointer while the real card
  // stays in the hand, lifting and leaning as if weighed for a throw. A valid
  // release commits it: the real card rises and draws back toward the
  // viewer, cocks and gathers itself, is flicked off by an invisible thumb,
  // arcs up over the table and drops into the portal. Only then does the
  // portal take it (activate), and 'card-portal-arrival' goes out on window
  // for the portal's own reaction. Seconds, viewport px and degrees:
  const THROW = {
    prepareDuration: .42,   // rise, draw back and cock before the flick
    pullBack: .1,           // drawn toward the viewer: extra size at full pull
    prepareLift: 46,        // px the card rises while preparing
    cock: 18,               // degrees it tips back into the throwing angle
    flickAcceleration: 1.2, // extra speed at the flick (0 = an even pace)
    arcHeight: 170,         // px the apex rises above the higher end of the path
    flightDuration: .95,    // from the flick to reaching the portal
    spinAmount: 150,        // degrees of flick spin over the flight
    spinSpeed: 2.4,         // how early the spin is spent (1 = evenly)
    landingScale: .3,       // size on reaching the portal, relative to the hand
    targetOffset: {x: 0, y: 14}, // px from the portal centre where it lands
    aimLift: 22,            // px the real card lifts while its ghost is aimed
  };
  const throwSmooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const setThrowState = state => {
    if (state) document.body.dataset.cardThrow = state; else delete document.body.dataset.cardThrow;
  };

  // A fixed-position copy of a hand card at its exact place on screen: the
  // spectral ghost while aiming, or the real card itself in flight (the one
  // in the hand is hidden meanwhile, so it is the same card to the eye).
  function detachedCard(subCard, className) {
    const handCard = subCard.closest('.hand-card');
    const r = subCard.getBoundingClientRect(), w = subCard.offsetWidth, h = subCard.offsetHeight;
    const turn = element => parseFloat(element && getComputedStyle(element).rotate) || 0;
    const copy = subCard.cloneNode(true);
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    copy.classList.add(className);
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    const style = getComputedStyle(subCard);
    copy.style.setProperty('--card-glow-rgb', getComputedStyle(handCard || subCard).getPropertyValue('--card-glow-rgb'));
    // Padding is a percentage of the containing block: resolved here, or the
    // viewport-fixed copy would take 10% of the whole viewport.
    Object.assign(copy.style, {width: w + 'px', height: h + 'px', padding: style.padding, font: style.font, color: style.color,
      left: (r.left + r.width / 2 - w / 2) + 'px', top: (r.top + r.height / 2 - h / 2) + 'px'});
    document.body.appendChild(copy);
    return {el: copy, x: r.left + r.width / 2, y: r.top + r.height / 2, rotation: turn(handCard) + turn(subCard)};
  }

  // Prepare, flick and arc the card from where it lies to the portal. Resolves
  // true on arrival, or false if the throw was cancelled (retrieval, reset).
  function flickIntoPortal(subCard) {
    const card = detachedCard(subCard, 'card-throw');
    subCard.style.visibility = 'hidden';
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const prepare = reduced ? 0 : THROW.prepareDuration, flight = reduced ? .25 : THROW.flightDuration;
    const c = portalCenter(), target = {x: c.x + THROW.targetOffset.x, y: c.y + THROW.targetOffset.y};
    // Wound up leaning away from the throw, a quarter of the way to its heading.
    const heading = Math.atan2(target.x - card.x, card.y - target.y) * 180 / Math.PI;
    const windUp = card.rotation - .25 * heading;
    const lifted = {x: card.x, y: card.y - (reduced ? 0 : THROW.prepareLift)};
    // Quadratic arc from the lifted card to the portal; its apex is arcHeight
    // above the higher of the two ends.
    const control = {x: (lifted.x + target.x) / 2, y: Math.min(lifted.y, target.y) - 2 * (reduced ? 0 : THROW.arcHeight)};
    const along = (u, key) => (1 - u) ** 2 * lifted[key] + 2 * u * (1 - u) * control[key] + u * u * target[key];
    const slope = (u, key) => 2 * (1 - u) * (control[key] - lifted[key]) + 2 * u * (target[key] - control[key]);
    const place = (x, y, scale, rotateZ, rotateX, rotateY, opacity) => {
      card.el.style.transform = `translate(${x - card.x}px, ${y - card.y}px) perspective(900px) ` +
        `rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg) scale(${scale})`;
      card.el.style.opacity = opacity;
    };
    place(card.x, card.y, 1, card.rotation, 0, 0, 1);
    setThrowState('prepare');
    return new Promise(resolve => {
      const begin = performance.now();
      const step = now => {
        if (!card.el.isConnected) { resolve(false); return; } // cancelled
        const t = (now - begin) / 1000;
        if (t < prepare) {
          // Rise, draw back toward the viewer and cock; tension gathers in a
          // faint tremor just before the flick.
          const p = t / prepare, e = throwSmooth(p), tremor = p > .7 ? Math.sin(p * 46) * 1.2 * (p - .7) / .3 : 0;
          place(card.x, card.y - THROW.prepareLift * e + 6 * Math.sin(Math.PI * e), 1 + THROW.pullBack * e,
            card.rotation + (windUp - card.rotation) * e + tremor, -THROW.cock * e, 0, 1);
          requestAnimationFrame(step);
          return;
        }
        setThrowState('flight');
        const q = Math.min(1, (t - prepare) / flight);
        // The flick: launched faster than the flight's average pace, easing
        // into it by the apex.
        const u = Math.min(1, q + THROW.flickAcceleration * q * (1 - q) ** 2);
        const x = along(u, 'x'), y = along(u, 'y');
        // Spin spent mostly early (the thumb's impulse), plus a lean into the
        // direction of travel; the card tips flat as it drops into the opening.
        const spin = THROW.spinAmount * (1 - (1 - q) ** THROW.spinSpeed);
        const travel = Math.atan2(slope(u, 'x'), -slope(u, 'y')) * 180 / Math.PI;
        const rotateZ = windUp * (1 - q) + spin + .12 * travel * Math.sin(Math.PI * q);
        const rotateX = -THROW.cock * (1 - throwSmooth(q / .3)) + 64 * throwSmooth((q - .55) / .45);
        const scale = (1 + THROW.pullBack) + (THROW.landingScale - 1 - THROW.pullBack) * u ** .85;
        place(x, y, scale, rotateZ, rotateX, 10 * Math.sin(Math.PI * q), 1 - throwSmooth((q - .86) / .14));
        if (q < 1) { requestAnimationFrame(step); return; }
        const dt = .016 / flight;
        card.velocity = {x: (along(1, 'x') - along(1 - dt, 'x')) / .016, y: (along(1, 'y') - along(1 - dt, 'y')) / .016};
        card.el.remove();
        resolve(card);
      };
      requestAnimationFrame(step);
    }).then(result => {
      if (!result) return false;
      // The hook for the portal's reaction: where and how fast it arrived,
      // also as a fraction of the portal's on-screen bounds (approximate).
      const bounds = screenEl.getBoundingClientRect();
      window.dispatchEvent(new CustomEvent('card-portal-arrival', {detail: {
        appId: subCard.dataset.app, card: subCard,
        screen: {x: target.x, y: target.y}, velocity: result.velocity,
        aperture: {x: (target.x - bounds.left) / bounds.width, y: (target.y - bounds.top) / bounds.height},
      }}));
      setThrowState(null);
      return true;
    });
  }

  // ---- The hand's cards (Prosjekter / Arbeidserfaring / Kurs & Fag /
  // Verktøy / Om meg): translate-based drag, same idea as the wordmark
  // letters. Any card can be picked up and dragged — only the current
  // front card can be thrown into the portal to open it; dragging any
  // other card (or the front card released short of the portal) re-sorts
  // the stack instead, landing on whichever slot the drag distance
  // actually reaches (see endDrag below).
  document.querySelectorAll('.sub-card[data-app]').forEach((subCard) => {
    const glowVar = CARD_GLOW[subCard.dataset.app] || null;
    // The stack's rotate/scale live on this wrapper. Dragging sets
    // `translate` on the card in viewport pixels — inside a rotated/scaled
    // ancestor that translate would be composed *after* those and come out
    // skewed, so the wrapper's own rotate/scale are neutralized for as
    // long as the card is picked up, and restored if it's released free.
    const handCard = subCard.closest('.hand-card');

    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let baseY = 0;
    let dragScale = 1;
    let grabbedCenter = null;
    let pickupX = 0;
    let pickupY = 0;
    let pointerId = null;
    let ghost = null;   // the spectral aim of the front card (see THROW above)
    let aiming = false; // this drag aims a ghost rather than moving the card

    // The real card's response while its ghost is aimed: it lifts, more as
    // the ghost nears the portal, and leans toward it.
    function weigh(dx, t) {
      subCard.style.transition = 'translate .25s ease-out, rotate .25s ease-out';
      subCard.style.translate = `0px ${-THROW.aimLift * (.45 + .55 * t)}px`;
      subCard.style.rotate = `${Math.max(-7, Math.min(7, dx * .03))}deg`;
    }
    function settleCard() {
      subCard.style.transition = 'translate .35s ease, rotate .35s ease';
      subCard.style.translate = `${baseX}px ${baseY}px`;
      subCard.style.rotate = '';
      subCard.style.animation = '';
    }

    // Normally 1 for the viewport hand; measuring also supports arrange mode.
    function viewportScale() {
      const host = handCard || subCard;
      return host.getBoundingClientRect().width / host.offsetWidth || 1;
    }

    subCard.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !document.body.classList.contains('intro-done')) return;
      if (activeCard) return; // something is already inside the portal
      dragging = true;
      moved = false;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      // Only the front card can be thrown: it is aimed with a ghost. Any
      // other card is picked up and moved itself, to re-sort the hand.
      aiming = handOrder[0] === subCard.dataset.app;
      if (aiming) dragScale = 1; // the ghost moves in plain viewport pixels
      const grabbed = subCard.getBoundingClientRect();
      grabbedCenter = {x: grabbed.left + grabbed.width / 2, y: grabbed.top + grabbed.height / 2};
      subCard.style.transition = 'none';
      subCard.setPointerCapture(e.pointerId);
      document.body.classList.add('scene-interacting');
    });

    // On the window: an aimed ghost leaves the card's own footprint at once.
    window.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (aiming) {
        if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          moved = true;
          subCard.style.animation = 'none';
          ghost = detachedCard(subCard, 'card-ghost');
          setThrowState('aim');
        }
        if (!moved) return;
        // The ghost's centre follows the pointer, straightening as it leaves
        // the fan and shrinking a little as it nears the portal.
        const c = portalCenter(), gx = ghost.x + dx, gy = ghost.y + dy;
        const dist = Math.hypot(gx - c.x, gy - c.y);
        setIntensity(dist);
        const t = 1 - Math.min(1, Math.max(0, (dist - ACTIVATE_RADIUS) / (APPROACH_RADIUS - ACTIVATE_RADIUS)));
        ghost.el.style.transform = `translate(${dx}px, ${dy}px) rotate(${ghost.rotation * (1 - Math.min(1, Math.hypot(dx, dy) / 120))}deg) scale(${1 - .14 * t})`;
        ghost.el.classList.toggle('is-aimed', dist <= ACTIVATE_RADIUS);
        weigh(dx, t);
        return;
      }
      if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        moved = true;
        // The idle float keyframes drive this same `translate` property —
        // pausing them isn't enough (a paused animation still wins the
        // cascade over an inline style), so drop the animation outright
        // for as long as JS owns the card's position.
        subCard.style.animation = 'none';
        if (handCard) {
          handCard.style.transition = 'none';
          handCard.style.rotate = '0deg';
          handCard.style.scale = '1';
        }
        dragScale = viewportScale();
        // Neutralizing the fan must not jump the card away from the grip.
        const straight = subCard.getBoundingClientRect();
        pickupX = (grabbedCenter.x - straight.left - straight.width / 2) / dragScale;
        pickupY = (grabbedCenter.y - straight.top - straight.height / 2) / dragScale;
      }
      if (!moved) return;
      subCard.style.translate = `${baseX + pickupX + dx / dragScale}px ${baseY + pickupY + dy / dragScale}px`;
      // Only the front card's approach toward the portal lights it up —
      // a peeking card being dragged is re-sorting the hand, not aiming
      // for the portal.
      if (handOrder[0] === subCard.dataset.app) {
        const r = subCard.getBoundingClientRect();
        const c = portalCenter();
        setIntensity(Math.hypot(r.left + r.width / 2 - c.x, r.top + r.height / 2 - c.y));
      }
    });

    // Reverses the throw — used when the "Få tilbake kort" button
    // retrieves the card that's currently inside the portal.
    subCard._retrieveFromPortal = function () {
      // A throw still in the air is called off: its flying card vanishes.
      document.querySelectorAll('.card-throw').forEach(el => el.remove());
      setThrowState(null);
      subCard.style.visibility = '';
      baseX = 0;
      baseY = 0;
      subCard.style.transition =
        'translate 0.55s cubic-bezier(0.22, 1, 0.36, 1), scale 0.55s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease';
      subCard.style.translate = '0px 0px';
      subCard.style.rotate = '';
      subCard.style.scale = '';
      subCard.style.opacity = '';
      window.setTimeout(() => { if (!dragging && activeCard !== subCard) subCard.style.animation = ''; }, 570);
      if (handCard) {
        handCard.style.transition = 'rotate 0.4s ease, scale 0.4s ease';
        handCard.style.rotate = '';
        handCard.style.scale = '';
        handCard.classList.remove('is-thrown');
      }
    };

    // Commits the throw: the card claims the portal now, is flicked in, and
    // only activates it on arrival (unless retrieved or reset meanwhile).
    function throwIn() {
      if (!claimPortal(subCard)) return false;
      const generation = activationGen;
      subCard.style.animation = 'none';
      if (handCard) handCard.classList.add('is-thrown');
      flickIntoPortal(subCard).then(arrived => {
        if (arrived && activeCard === subCard && activationGen === generation) activate(subCard.dataset.app, subCard, glowVar);
      });
      return true;
    }

    function endDrag(e) {
      if (!dragging || e.pointerId !== pointerId) return;
      dragging = false;
      if (subCard.hasPointerCapture(e.pointerId)) subCard.releasePointerCapture(e.pointerId);
      if (!moved) { document.body.classList.remove('scene-interacting'); return; }
      subCard.dataset.justDragged = '1';

      const id = subCard.dataset.app;
      const isFront = handOrder[0] === id;
      let nearPortal = false;
      if (aiming && ghost) {
        const c = portalCenter();
        nearPortal = Math.hypot(ghost.x + e.clientX - startX - c.x, ghost.y + e.clientY - startY - c.y) <= ACTIVATE_RADIUS;
      }

      if (aiming && ghost) {
        const aimed = ghost.el, homeRotation = ghost.rotation;
        ghost = null;
        if (e.type !== 'pointercancel' && isFront && nearPortal && throwIn()) {
          // The aim is spent: the ghost dissolves where it was released.
          aimed.animate([{opacity: aimed.style.opacity || .7}, {opacity: 0, filter: 'blur(6px) brightness(2)'}],
            {duration: 260, easing: 'ease-out', fill: 'forwards'}).finished.then(() => aimed.remove(), () => aimed.remove());
          return;
        }
        // Not a valid throw: the ghost is drawn back into its card.
        setThrowState(null);
        aimed.animate([{transform: aimed.style.transform, opacity: .6},
          {transform: `translate(0px, ${-THROW.aimLift * .45}px) rotate(${homeRotation}deg) scale(1)`, opacity: 0}],
          {duration: 300, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards'}).finished.then(() => aimed.remove(), () => aimed.remove());
        settleCard();
      }

      {
        // Not thrown (missed the portal, one was already occupied, or this
        // wasn't the front card to begin with) — re-sort the stack instead.
        // Project the drag onto the stack's own offset axis (16px right,
        // 12px up per step — see .hand-card in styles.css) so pulling a
        // card "out" toward you brings it forward and pushing it "in"
        // sends it back, landing on whichever slot the drag distance
        // actually reaches rather than only ever front/back.
        const STEP_X = 16;
        const STEP_Y = -12;
        const stepLenSq = STEP_X * STEP_X + STEP_Y * STEP_Y;
        const dx = (e.clientX - startX) / dragScale;
        const dy = (e.clientY - startY) / dragScale;
        const slotsMoved = (dx * STEP_X + dy * STEP_Y) / stepLenSq;
        const currentIndex = handOrder.indexOf(id);
        if (e.type !== 'pointercancel') moveHandCardTo(id, Math.round(currentIndex + slotsMoved));

        subCard.style.transition = 'translate 0.35s ease, rotate 0.35s ease';
        subCard.style.translate = `${baseX}px ${baseY}px`;
        subCard.style.animation = '';
        resetIntensity();
        document.body.classList.remove('scene-interacting');
        if (handCard) {
          handCard.style.transition = 'rotate 0.4s ease, scale 0.4s ease';
          handCard.style.rotate = '';
          handCard.style.scale = '';
        }
      }
    }

    // On the window too (a captured pointer's events still bubble here once).
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    // Keyboard users throw the front card the same way, without the aim.
    subCard.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key) || activeCard || !document.body.classList.contains('intro-done')) return;
      event.preventDefault();
      if (handOrder[0] !== subCard.dataset.app) { bringHandCardToFront(subCard.dataset.app); return; }
      throwIn();
    });
  });

  retrieveBtn.addEventListener('click', () => {
    if (!activeCard) return;
    if (activeCard._retrieveFromPortal) activeCard._retrieveFromPortal();
    deactivate();
  });

  retrieveParkedCard = function () {
    if (!activeCard) return false;
    if (activeCard._retrieveFromPortal) activeCard._retrieveFromPortal();
    deactivate();
    return true;
  };
})();

// ==========================================================================
// PROSJEKTER: detail view
// ==========================================================================
const PROJECT_DETAILS = {
  motvind: {
    meta: 'RVK · Posisjoneringsstrategi',
    title: 'Motvind Norge',
    tagline: 'Strategi bygget på Cialdini og Bourdieu — skrevet alene, fra feltarbeid til ferdig levering.',
  },
  husflid: {
    meta: 'Skoleprosjekt',
    title: 'Norges Husflidslag',
    tagline: 'Et konsept om å stå tett sammen, bygget på broderi-metaforen.',
  },
  dukkehjem: {
    meta: 'RVK-Team',
    title: 'Et dukkehjem × sosiale medier',
    tagline: 'Fasade vs. virkelighet — en Ibsen-kampanje for unge voksne.',
  },
  aleneforeldre: {
    meta: 'Figma · Mitt første kreative case',
    title: 'Aleneforeldre-app',
    tagline: '',
  },
  webprosjekt: {
    meta: 'HTML/CSS',
    title: 'Kreativt webprosjekt',
    tagline: '',
  },
};

const projectListEl = document.querySelector('[data-project-list]');
const projectDetailEl = document.querySelector('[data-project-detail]');
const detailContentEl = document.getElementById('detailContent');

function showProjectDetail(id) {
  const data = PROJECT_DETAILS[id];
  if (!data) return;
  detailContentEl.innerHTML = `
    <span class="project-meta">${data.meta}</span>
    <h3>${data.title}</h3>
    ${data.tagline ? `<p>${data.tagline}</p>` : ''}
    <p class="detail-placeholder">Mer om prosessen kommer her.</p>
  `;
  projectListEl.hidden = true;
  projectDetailEl.hidden = false;
}

// The two "for the curious" extras stay simple teaser cards, unchanged —
// only the deck below gets the stack/tag/drag treatment.
document.querySelectorAll('.more-projects [data-project]').forEach((card) => {
  card.addEventListener('click', () => showProjectDetail(card.dataset.project));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      showProjectDetail(card.dataset.project);
    }
  });
});

// --------------------------------------------------------------------
// Prosjekter deck: Motvind + two more, shown one-at-a-time in a fanned
// stack. Tags below jump straight to a project; dragging the front card
// sideways cycles it to the back, bringing the next one forward. Tapping
// the front card zooms into the existing detail view; tapping a card
// further back in the stack just brings it to the front first.
// --------------------------------------------------------------------
const DECK_IDS = ['motvind', 'husflid', 'dukkehjem'];
let deckOrder = DECK_IDS.slice();

const deckEl = document.getElementById('prosjekterDeck');
const deckTagsEl = document.getElementById('prosjekterTags');

function layoutDeck() {
  deckOrder.forEach((id, i) => {
    const card = deckEl.querySelector(`[data-project="${id}"]`);
    if (!card) return;
    card.style.setProperty('--stack-i', i);
    card.style.zIndex = String(deckOrder.length - i);
  });
}

function updateTagsActive() {
  deckTagsEl.querySelectorAll('.deck-tag').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.project === deckOrder[0]);
  });
}

function bringToFront(id) {
  if (deckOrder[0] === id) return;
  deckOrder = [id, ...deckOrder.filter((x) => x !== id)];
  layoutDeck();
  updateTagsActive();
}

function cycleFrontToBack() {
  deckOrder = [...deckOrder.slice(1), deckOrder[0]];
  layoutDeck();
  updateTagsActive();
}

function buildDeck() {
  if (!deckEl || !deckTagsEl) return;

  DECK_IDS.forEach((id) => {
    const data = PROJECT_DETAILS[id];
    const card = document.createElement('article');
    card.className = 'deck-card';
    card.dataset.project = id;
    card.tabIndex = 0;
    card.innerHTML = `
      <span class="project-meta">${data.meta}</span>
      <h3 class="project-title">${data.title}</h3>
      <div class="deck-card-image" aria-hidden="true"></div>
      <ul class="deck-card-bullets">
        <li>${data.tagline}</li>
        <li class="detail-placeholder">Mer om prosessen kommer her.</li>
      </ul>
    `;
    card.addEventListener('click', () => {
      if (card.dataset.justDragged) {
        delete card.dataset.justDragged;
        return;
      }
      if (deckOrder[0] !== id) {
        bringToFront(id);
        return;
      }
      showProjectDetail(id);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (deckOrder[0] === id) showProjectDetail(id);
      else bringToFront(id);
    });
    deckEl.appendChild(card);

    const tag = document.createElement('button');
    tag.type = 'button';
    tag.className = 'deck-tag';
    tag.textContent = data.title;
    tag.dataset.project = id;
    tag.addEventListener('click', () => bringToFront(id));
    deckTagsEl.appendChild(tag);
  });

  layoutDeck();
  updateTagsActive();

  // Drag the front card sideways to cycle it to the back of the stack.
  let dragging = false;
  let moved = false;
  let startX = 0;
  let activeCard = null;

  deckEl.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.deck-card');
    if (!card || card.dataset.project !== deckOrder[0]) return;
    dragging = true;
    moved = false;
    activeCard = card;
    startX = e.clientX;
    card.style.transition = 'none';
    card.setPointerCapture(e.pointerId);
  });

  deckEl.addEventListener('pointermove', (e) => {
    if (!dragging || !activeCard) return;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) > 6) moved = true;
    if (!moved) return;
    activeCard.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`;
  });

  function endDrag(e) {
    if (!dragging || !activeCard) return;
    dragging = false;
    activeCard.releasePointerCapture(e.pointerId);
    const dx = e.clientX - startX;
    activeCard.style.transition = '';
    activeCard.style.transform = '';
    if (moved) {
      activeCard.dataset.justDragged = '1';
      if (Math.abs(dx) > 70) cycleFrontToBack();
    }
    activeCard = null;
  }

  deckEl.addEventListener('pointerup', endDrag);
  deckEl.addEventListener('pointercancel', endDrag);
}

buildDeck();

document.querySelector('[data-project-back]').addEventListener('click', () => {
  projectDetailEl.hidden = true;
  projectListEl.hidden = false;
});

const moreLink = document.getElementById('moreLink');
const moreProjects = document.getElementById('moreProjects');
moreLink.addEventListener('click', () => {
  const isHidden = moreProjects.hidden;
  moreProjects.hidden = !isHidden;
  moreLink.textContent = isHidden ? 'Mer, for de nysgjerrige ↑' : 'Mer, for de nysgjerrige ↓';
});

// ==========================================================================
// CHIP GROUPS (Kurs & Fag / Om meg) — generic placeholder behavior
// ==========================================================================
function wireChipGroup(groupEl, placeholderEl) {
  if (!groupEl || !placeholderEl) return;
  groupEl.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      groupEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      placeholderEl.textContent = `"${chip.textContent}" — innhold kommer snart.`;
    });
  });
}

wireChipGroup(
  document.querySelector('#app-kurs [data-chip-group]'),
  document.getElementById('kursPlaceholder')
);
wireChipGroup(
  document.querySelector('#app-ommeg [data-chip-group]'),
  document.getElementById('ommegPlaceholder')
);
