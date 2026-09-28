/* Dev-only visual editor: open the site with ?arrange in the URL.
   Not part of the normal experience — a throwaway aid for deciding where
   things should sit, not something the real page ever runs. Everything in
   this file is gated behind the ?arrange check below and touches nothing
   on the normal page. Safe to delete this whole dev/ folder (and its one
   reference in index.html) once layouts are decided and baked back into
   styles.css.

   Generic element selection + move + resize + rotate, a layer panel
   (drag to reorder z-index), multi-select grouping, and undo/redo. */
(() => {
  if (!new URLSearchParams(location.search).has('arrange')) return;

  const DRAG_THRESHOLD = 4;
  let nextZ = 1000; // comfortably above the site's own z-indexes
  let idCounter = 0;
  let groupIdCounter = 0;
  const registry = new Map(); // el -> record
  const selection = new Set(); // selected els, insertion order preserved
  let groups = new Map(); // groupId -> Set<el>
  let elGroup = new Map(); // el -> groupId
  let history = [], future = []; // undo / redo stacks of commands

  function isEditorUI(el) {
    return !!(el && el.closest && el.closest('[data-arrange-ui]'));
  }

  function parseDeg(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }

  // Convert any element (whatever its current CSS position scheme is) into
  // an absolutely-positioned box the editor fully owns, without changing
  // how it currently looks. Uses the rotated bounding box's centre (which
  // rotation never moves) plus the element's own unrotated intrinsic size
  // (offsetWidth/Height ignore transforms) so elements that already had a
  // stylesheet-driven rotation (e.g. the fanned hand-cards) don't jump or
  // stretch the moment they're picked up.
  function takeOver(el) {
    if (registry.has(el)) return registry.get(el);
    const parent = el.offsetParent || document.body;
    const parentRect = parent.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const w = Math.max(1, el.offsetWidth), h = Math.max(1, el.offsetHeight);
    const cx = rect.left + rect.width / 2 - parentRect.left + parent.scrollLeft;
    const cy = rect.top + rect.height / 2 - parentRect.top + parent.scrollTop;
    const rot = parseDeg(getComputedStyle(el).rotate);
    Object.assign(el.style, {
      position: 'absolute',
      left: (cx - w / 2) + 'px', top: (cy - h / 2) + 'px',
      width: w + 'px', height: h + 'px',
      right: 'auto', bottom: 'auto', margin: '0',
      boxSizing: 'border-box',
      translate: 'none', scale: 'none', rotate: rot + 'deg',
      transformOrigin: '50% 50%',
      transition: 'none',
    });
    if (getComputedStyle(el).zIndex === 'auto') el.style.zIndex = String(nextZ++);
    const rec = {el, id: 'a' + (idCounter++), parent};
    registry.set(el, rec);
    el.dataset.arrangeId = rec.id;
    return rec;
  }

  function currentBox(el) {
    return {
      left: parseFloat(el.style.left) || 0,
      top: parseFloat(el.style.top) || 0,
      width: parseFloat(el.style.width) || el.offsetWidth,
      height: parseFloat(el.style.height) || el.offsetHeight,
      rot: parseDeg(el.style.rotate),
      z: parseInt(el.style.zIndex, 10) || 0,
    };
  }

  function applyBox(el, box) {
    el.style.left = box.left + 'px';
    el.style.top = box.top + 'px';
    el.style.width = box.width + 'px';
    el.style.height = box.height + 'px';
    el.style.rotate = box.rot + 'deg';
    el.style.zIndex = String(box.z);
  }

  // ---------------------------------------------------------------------
  // Grouping — clicking any grouped member (without shift) selects the
  // whole group, so a drag on one member moves all of them together.
  // ---------------------------------------------------------------------
  function groupSelected() {
    if (selection.size < 2) return;
    const before = snapshotGroups();
    const gid = 'g' + (groupIdCounter++);
    selection.forEach(el => {
      const old = elGroup.get(el);
      if (old) {
        groups.get(old)?.delete(el);
        if (groups.get(old)?.size === 0) groups.delete(old);
      }
      elGroup.set(el, gid);
    });
    groups.set(gid, new Set(selection));
    commit({type: 'group', before, after: snapshotGroups()});
  }
  function ungroupSelected() {
    const touched = new Set();
    selection.forEach(el => { const g = elGroup.get(el); if (g) touched.add(g); });
    if (!touched.size) return;
    const before = snapshotGroups();
    touched.forEach(gid => {
      groups.get(gid)?.forEach(el => elGroup.delete(el));
      groups.delete(gid);
    });
    commit({type: 'group', before, after: snapshotGroups()});
  }
  function snapshotGroups() {
    return {elGroup: new Map(elGroup), groups: new Map([...groups].map(([id, set]) => [id, new Set(set)]))};
  }
  function restoreGroups(snap) {
    elGroup = new Map(snap.elGroup);
    groups = new Map([...snap.groups].map(([id, set]) => [id, new Set(set)]));
  }

  // ---------------------------------------------------------------------
  // Undo / redo — a command is either {type:'box', entries:[{el,before,after}]}
  // or {type:'group', before, after} (a snapshot pair from snapshotGroups()).
  // ---------------------------------------------------------------------
  function commit(cmd) {
    history.push(cmd);
    future = [];
    refreshHud();
  }
  function commitBoxChange(entries) {
    const changed = entries.filter(({before, after}) => JSON.stringify(before) !== JSON.stringify(after));
    if (changed.length) commit({type: 'box', entries: changed});
  }
  function undo() {
    const cmd = history.pop();
    if (!cmd) return;
    if (cmd.type === 'box') cmd.entries.forEach(({el, before}) => applyBox(el, before));
    else if (cmd.type === 'group') restoreGroups(cmd.before);
    future.push(cmd);
    refreshHud();
  }
  function redo() {
    const cmd = future.pop();
    if (!cmd) return;
    if (cmd.type === 'box') cmd.entries.forEach(({el, after}) => applyBox(el, after));
    else if (cmd.type === 'group') restoreGroups(cmd.after);
    history.push(cmd);
    refreshHud();
  }

  // A click's literal target is often a leaf that visually IS its parent
  // (e.g. a full-bleed button inside a card wrapper). Climb up while the
  // parent's rendered box is essentially the same size as the child's, so
  // selecting "whatever's under the cursor" picks the meaningful outer
  // unit instead of an inner filler element — generic, no class names.
  const BARE_CONTENT_TAGS = new Set(['SPAN', 'I', 'EM', 'STRONG', 'B', 'SVG', 'PATH', 'USE', 'SMALL', 'LABEL']);
  function resolveTarget(target) {
    let el = target;
    while (el.parentElement && el.parentElement !== document.body && !isEditorUI(el.parentElement)) {
      const parent = el.parentElement;
      const pr = parent.getBoundingClientRect(), er = el.getBoundingClientRect();
      const sameSize = Math.abs(pr.width - er.width) <= 6 && Math.abs(pr.height - er.height) <= 6;
      // A bare span/icon/label with no children of its own is never worth
      // selecting on its own merits — always defer to its container, even
      // when it doesn't fill that container's box (e.g. short text inside
      // a much larger button).
      const bareContent = BARE_CONTENT_TAGS.has(el.tagName) && el.children.length === 0;
      if (!sameSize && !bareContent) break;
      el = parent;
    }
    return el;
  }

  function labelFor(el) {
    const cls = [...el.classList].find(c => c && c !== 'is-arrange-selected') || '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : cls ? '.' + cls : '');
  }

  // ---------------------------------------------------------------------
  // Outline + resize handles overlay. Positioned in viewport space every
  // animation frame while a selection exists, so it tracks live drags and
  // (eventually) anything else moving the element around.
  // ---------------------------------------------------------------------
  const HANDLE_KINDS = [
    ['nw', -1, -1], ['n', 0, -1], ['ne', 1, -1],
    ['w', -1, 0], ['e', 1, 0],
    ['sw', -1, 1], ['s', 0, 1], ['se', 1, 1],
  ];
  const CURSORS = {nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize'};

  const overlayRoot = document.createElement('div');
  overlayRoot.setAttribute('data-arrange-ui', '');
  overlayRoot.style.cssText = 'position:fixed; inset:0; pointer-events:none; z-index:2147483000;';
  document.body.appendChild(overlayRoot);

  const outlines = new Map(); // el -> outline div
  const handleEls = new Map(); // 'nw' etc -> div (only for single selection)
  HANDLE_KINDS.forEach(([kind]) => {
    const h = document.createElement('div');
    h.setAttribute('data-arrange-ui', '');
    h.dataset.handle = kind;
    h.style.cssText = `position:fixed; width:10px; height:10px; margin:-5px 0 0 -5px;
      background:#fff; border:2px solid #2dd4bf; border-radius:2px; cursor:${CURSORS[kind]};
      pointer-events:auto; display:none; z-index:2147483001;`;
    overlayRoot.appendChild(h);
    handleEls.set(kind, h);
  });

  function ensureOutline(el) {
    let o = outlines.get(el);
    if (!o) {
      o = document.createElement('div');
      o.setAttribute('data-arrange-ui', '');
      o.style.cssText = 'position:fixed; border:2px solid #2dd4bf; pointer-events:none; box-shadow:0 0 0 1px #000a;';
      overlayRoot.appendChild(o);
      outlines.set(el, o);
    }
    return o;
  }
  function pruneOutlines() {
    for (const [el, o] of outlines) {
      if (!selection.has(el)) { o.remove(); outlines.delete(el); }
    }
  }

  function refreshOverlay() {
    pruneOutlines();
    for (const el of selection) {
      const o = ensureOutline(el);
      const r = el.getBoundingClientRect();
      Object.assign(o.style, {left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px'});
    }
    const single = selection.size === 1 ? [...selection][0] : null;
    if (single) {
      const r = single.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const w = single.offsetWidth, h = single.offsetHeight;
      const rot = parseDeg(single.style.rotate) * Math.PI / 180;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      HANDLE_KINDS.forEach(([kind, sx, sy]) => {
        const lx = sx * w / 2, ly = sy * h / 2;
        const x = cx + lx * cos - ly * sin, y = cy + lx * sin + ly * cos;
        const handle = handleEls.get(kind);
        handle.style.display = 'block';
        handle.style.left = x + 'px'; handle.style.top = y + 'px';
      });
    } else {
      handleEls.forEach(h => { h.style.display = 'none'; });
    }
    requestAnimationFrame(refreshOverlay);
  }

  // ---------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------
  const hud = document.createElement('div');
  hud.setAttribute('data-arrange-ui', '');
  hud.style.cssText = `
    position: fixed; top: 10px; right: 10px; z-index: 2147483002;
    background: #000c; color: #9f9; font: 12px/1.5 monospace;
    padding: 10px 12px; border-radius: 8px;
    max-width: 320px; pointer-events: auto;
  `;
  const hint = document.createElement('div');
  hint.style.cssText = 'opacity:.7; margin-bottom:6px;';
  hint.textContent = 'Click any element to select it. Drag to move, drag a handle to resize, shift+scroll to rotate. Shift-click to multi-select.';
  // white-space:pre only here (not on the whole hud) — the multi-line
  // readout needs it to keep its layout, but it also disables normal
  // wrapping for inline-block content, which broke the button rows below.
  const readout = document.createElement('div');
  readout.style.cssText = 'white-space: pre;';
  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy positions';
  copyBtn.style.cssText = 'margin-top:8px;font:12px monospace;cursor:pointer;display:block;width:100%;box-sizing:border-box;';
  const halfBtnCss = 'margin-top:6px;font:12px monospace;cursor:pointer;display:inline-block;width:48%;box-sizing:border-box;';
  const groupBtn = document.createElement('button');
  groupBtn.textContent = 'Group';
  groupBtn.style.cssText = halfBtnCss + 'margin-right:4%;';
  groupBtn.addEventListener('click', groupSelected);
  const ungroupBtn = document.createElement('button');
  ungroupBtn.textContent = 'Ungroup';
  ungroupBtn.style.cssText = halfBtnCss;
  ungroupBtn.addEventListener('click', ungroupSelected);
  const undoBtn = document.createElement('button');
  undoBtn.textContent = '↶ Undo';
  undoBtn.style.cssText = halfBtnCss + 'margin-right:4%;';
  undoBtn.addEventListener('click', undo);
  const redoBtn = document.createElement('button');
  redoBtn.textContent = '↷ Redo';
  redoBtn.style.cssText = halfBtnCss;
  redoBtn.addEventListener('click', redo);
  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset';
  resetBtn.style.cssText = 'margin-top:6px;font:12px monospace;cursor:pointer;display:block;width:100%;box-sizing:border-box;';
  resetBtn.addEventListener('click', () => location.reload());
  hud.append(hint, readout, copyBtn, groupBtn, ungroupBtn, undoBtn, redoBtn, resetBtn);
  document.body.appendChild(hud);

  function describeSelection() {
    const els = selection.size ? [...selection] : [...registry.keys()];
    if (!els.length) return '(nothing selected yet)';
    return els.map(el => {
      const b = currentBox(el);
      const gid = elGroup.get(el);
      return `${labelFor(el)}${gid ? '  [' + gid + ']' : ''}\n  left ${b.left.toFixed(0)}px  top ${b.top.toFixed(0)}px\n  w ${b.width.toFixed(0)}px  h ${b.height.toFixed(0)}px  rot ${b.rot.toFixed(0)}deg  z ${b.z}`;
    }).join('\n');
  }
  function refreshHud() {
    readout.textContent = describeSelection();
    renderLayerPanel();
  }
  copyBtn.addEventListener('click', () => {
    navigator.clipboard?.writeText(describeSelection()).catch(() => {});
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy positions'; }, 900);
  });

  function setSelection(els) {
    selection.clear();
    els.forEach(el => selection.add(el));
    refreshHud();
  }
  function addToSelection(el) { selection.add(el); refreshHud(); }
  function clearSelection() { selection.clear(); refreshHud(); }

  // ---------------------------------------------------------------------
  // Move + rotate on the element itself
  // ---------------------------------------------------------------------
  function beginMove(startEvent, primary) {
    const startX = startEvent.clientX, startY = startEvent.clientY;
    const targets = [...selection];
    const starts = targets.map(el => currentBox(el));
    let moved = false;
    // Listening on window (not the dragged element) rather than relying on
    // setPointerCapture: CDP's synthetic input hit-tests at each (x,y) and
    // doesn't honour real pointer capture the way an actual OS-level drag
    // does (see tests/portal-check.mjs), and a reordering drag in the layer
    // panel below doesn't move its element to stay under the cursor at all,
    // so it needs this to work correctly for real users too, not just tests.
    function onMove(event) {
      const dx = event.clientX - startX, dy = event.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true;
      targets.forEach((el, i) => {
        el.style.left = (starts[i].left + dx) + 'px';
        el.style.top = (starts[i].top + dy) + 'px';
      });
      refreshHud();
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved) {
        const afters = targets.map(el => currentBox(el));
        commitBoxChange(targets.map((el, i) => ({el, before: starts[i], after: afters[i]})));
      }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function beginResize(startEvent, el, kind) {
    event0(startEvent);
    const [, sx, sy] = HANDLE_KINDS.find(h => h[0] === kind);
    const start = currentBox(el);
    const rot = start.rot * Math.PI / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const startX = startEvent.clientX, startY = startEvent.clientY;
    const startCx = start.left + start.width / 2, startCy = start.top + start.height / 2;
    function onMove(event) {
      const dx = event.clientX - startX, dy = event.clientY - startY;
      // Undo the element's own rotation so handle drags follow its local axes.
      const localDx = dx * cos + dy * sin;
      const localDy = -dx * sin + dy * cos;
      const width = Math.max(12, start.width + sx * localDx);
      const height = Math.max(12, start.height + sy * localDy);
      const shiftXLocal = sx !== 0 ? (width - start.width) / 2 * sx : 0;
      const shiftYLocal = sy !== 0 ? (height - start.height) / 2 * sy : 0;
      const shiftX = shiftXLocal * cos - shiftYLocal * sin;
      const shiftY = shiftXLocal * sin + shiftYLocal * cos;
      const cx = startCx + shiftX, cy = startCy + shiftY;
      el.style.width = width + 'px';
      el.style.height = height + 'px';
      el.style.left = (cx - width / 2) + 'px';
      el.style.top = (cy - height / 2) + 'px';
      refreshHud();
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      commitBoxChange([{el, before: start, after: currentBox(el)}]);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  function event0(e) { e.preventDefault(); e.stopPropagation(); }

  handleEls.forEach((handle, kind) => {
    handle.addEventListener('pointerdown', event => {
      event0(event);
      const el = [...selection][0];
      if (!el) return;
      handle.setPointerCapture(event.pointerId);
      beginResize(event, el, kind);
    });
  });

  // Shift+scroll rotates every selected element by the same increment.
  // Rapid wheel ticks are one continuous gesture, not one undo step each —
  // commit only after a short pause, capturing the box from before the
  // very first tick of the burst.
  const rotateSessions = new Map(); // el -> {before, timer}
  document.addEventListener('wheel', event => {
    if (!event.shiftKey || !selection.size) return;
    if (isEditorUI(event.target)) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? 3 : -3;
    selection.forEach(el => {
      if (!rotateSessions.has(el)) rotateSessions.set(el, {before: currentBox(el), timer: null});
      const session = rotateSessions.get(el);
      clearTimeout(session.timer);
      const next = parseDeg(el.style.rotate) + delta;
      el.style.rotate = next + 'deg';
      session.timer = setTimeout(() => {
        rotateSessions.delete(el);
        commitBoxChange([{el, before: session.before, after: currentBox(el)}]);
      }, 500);
    });
    refreshHud();
  }, {capture: true, passive: false});

  // ---------------------------------------------------------------------
  // Global click/select interception — takes over from the site's own
  // interactions entirely while in arrange mode.
  // ---------------------------------------------------------------------
  document.addEventListener('click', event => {
    if (isEditorUI(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  }, {capture: true});

  document.addEventListener('pointerdown', event => {
    if (isEditorUI(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const el = resolveTarget(event.target);
    if (el === document.body || el === document.documentElement) {
      clearSelection();
      return;
    }
    takeOver(el);
    const gid = elGroup.get(el);
    if (event.shiftKey) {
      if (selection.has(el)) selection.delete(el); else addToSelection(el);
    } else {
      // Always recompute rather than only when el isn't already selected —
      // otherwise a leftover multi-selection from before an Ungroup (or from
      // an earlier shift-click) keeps dragging elements that are no longer
      // meant to move together.
      const intended = gid ? new Set(groups.get(gid)) : new Set([el]);
      const same = intended.size === selection.size && [...intended].every(e => selection.has(e));
      if (!same) setSelection([...intended]);
    }
    refreshHud();
    if (selection.has(el)) beginMove(event, el);
  }, {capture: true});

  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && event.shiftKey) { event.preventDefault(); redo(); }
    else if (key === 'z') { event.preventDefault(); undo(); }
    else if (key === 'y') { event.preventDefault(); redo(); }
  }, {capture: true});

  // ---------------------------------------------------------------------
  // Layer panel — lists every element the editor has touched, topmost
  // z-index first. Drag a row to reorder; that reorder becomes each
  // element's new z-index.
  // ---------------------------------------------------------------------
  const layerPanel = document.createElement('div');
  layerPanel.setAttribute('data-arrange-ui', '');
  layerPanel.style.cssText = `
    position: fixed; top: 10px; left: 10px; z-index: 2147483002;
    background: #000c; color: #ccc; font: 12px/1.5 monospace;
    padding: 8px; border-radius: 8px; width: 220px; max-height: 70vh;
    overflow-y: auto; pointer-events: auto;
  `;
  const layerTitle = document.createElement('div');
  layerTitle.textContent = 'Layers (drag to reorder)';
  layerTitle.style.cssText = 'opacity:.7; margin-bottom:6px;';
  const layerList = document.createElement('div');
  layerPanel.append(layerTitle, layerList);
  document.body.appendChild(layerPanel);

  function orderedRegistry() {
    return [...registry.values()].sort((a, b) => (parseInt(b.el.style.zIndex, 10) || 0) - (parseInt(a.el.style.zIndex, 10) || 0));
  }
  function recordById(id) { return [...registry.values()].find(r => r.id === id); }

  function renderLayerPanel() {
    layerList.innerHTML = '';
    orderedRegistry().forEach(rec => {
      const row = document.createElement('div');
      row.setAttribute('data-arrange-ui', '');
      row.dataset.arrangeId = rec.id;
      const selected = selection.has(rec.el);
      const gid = elGroup.get(rec.el);
      row.textContent = labelFor(rec.el) + '  z' + (parseInt(rec.el.style.zIndex, 10) || 0) + (gid ? '  [' + gid + ']' : '');
      row.style.cssText = `
        padding: 4px 6px; margin-bottom: 2px; border-radius: 4px; cursor: grab; user-select: none;
        background: ${selected ? '#2dd4bf33' : 'transparent'};
        border: 1px solid ${selected ? '#2dd4bf' : 'transparent'};
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      `;
      row.addEventListener('click', () => {
        const g = elGroup.get(rec.el);
        setSelection(g ? [...groups.get(g)] : [rec.el]);
      });
      row.addEventListener('pointerdown', event => {
        event.stopPropagation();
        startRowDrag(event, row);
      });
      layerList.appendChild(row);
    });
  }

  function startRowDrag(startEvent, row) {
    const startBoxes = orderedRegistry().map(rec => ({el: rec.el, before: currentBox(rec.el)}));
    row.style.cursor = 'grabbing';
    function onMove(event) {
      const siblings = [...layerList.children].filter(r => r !== row);
      let insertBefore = null;
      for (const sib of siblings) {
        const r = sib.getBoundingClientRect();
        if (event.clientY < r.top + r.height / 2) { insertBefore = sib; break; }
      }
      if (insertBefore) layerList.insertBefore(row, insertBefore);
      else layerList.appendChild(row);
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const order = [...layerList.children];
      const n = order.length;
      order.forEach((r, i) => {
        const rec = recordById(r.dataset.arrangeId);
        if (rec) rec.el.style.zIndex = String(1000 + (n - i));
      });
      commitBoxChange(startBoxes.map(({el, before}) => ({el, before, after: currentBox(el)})));
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // ---------------------------------------------------------------------
  // Camera panel — pan (horizontal/vertical) via --camera-pan-x/y on
  // #deviceTilt (added in portal.css, defaults to 0px so it's a no-op
  // outside this tool), and pitch/yaw via the SAME `camera` object
  // portal-effects.js's own render loop reads every frame (exposed as
  // window.portalMatter.camera by reference) — anything else would get
  // overwritten a frame later by that loop's own screen.style.setProperty.
  // ---------------------------------------------------------------------
  const cameraPanel = document.createElement('div');
  cameraPanel.setAttribute('data-arrange-ui', '');
  cameraPanel.style.cssText = `
    position: fixed; left: 50%; bottom: 10px; transform: translateX(-50%);
    z-index: 2147483002; background: #000c; color: #9cf; font: 12px/1.5 monospace;
    padding: 10px 12px; border-radius: 8px; pointer-events: auto;
    display: grid; grid-template-columns: auto 1fr auto; gap: 4px 8px; align-items: center;
  `;
  const deviceTilt = document.getElementById('deviceTilt');
  const CAMERA_FIELDS = [
    // The pan offset is applied deep inside two compounded 3D perspective
    // layers (the scene's own, then #screen's separate one), which
    // attenuates it a lot — a ±3000px range lands in a visually useful
    // ~25-190px on-screen shift, empirically measured, not a typo.
    {label: 'Pan X', min: -3000, max: 3000, step: 25, get: () => parseFloat(deviceTilt.style.getPropertyValue('--camera-pan-x')) || 0,
      set: v => deviceTilt.style.setProperty('--camera-pan-x', v + 'px')},
    {label: 'Pan Y', min: -3000, max: 3000, step: 25, get: () => parseFloat(deviceTilt.style.getPropertyValue('--camera-pan-y')) || 0,
      set: v => deviceTilt.style.setProperty('--camera-pan-y', v + 'px')},
    {label: 'Pitch', min: 5, max: 85, step: 1, get: () => window.portalMatter?.camera.pitch ?? 46,
      set: v => { if (window.portalMatter) window.portalMatter.camera.pitch = v; }},
    {label: 'Yaw', min: -60, max: 60, step: 1, get: () => window.portalMatter?.camera.yaw ?? 0,
      set: v => { if (window.portalMatter) window.portalMatter.camera.yaw = v; }},
  ];
  const cameraTitle = document.createElement('div');
  cameraTitle.textContent = 'Camera';
  cameraTitle.style.cssText = 'grid-column: 1 / -1; opacity: .7;';
  cameraPanel.appendChild(cameraTitle);
  CAMERA_FIELDS.forEach(field => {
    const label = document.createElement('span');
    label.textContent = field.label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = field.min; input.max = field.max; input.step = field.step;
    input.value = field.get();
    input.style.width = '160px';
    const value = document.createElement('span');
    value.textContent = field.get().toFixed(0);
    value.style.cssText = 'width: 3em; text-align: right;';
    input.addEventListener('input', () => {
      field.set(parseFloat(input.value));
      value.textContent = parseFloat(input.value).toFixed(0);
    });
    field.input = input;
    cameraPanel.append(label, input, value);
  });
  const cameraResetBtn = document.createElement('button');
  cameraResetBtn.textContent = 'Reset camera';
  cameraResetBtn.style.cssText = 'grid-column: 1 / -1; margin-top: 4px; font: 12px monospace; cursor: pointer;';
  cameraResetBtn.addEventListener('click', () => {
    const defaults = {'Pan X': 0, 'Pan Y': 0, Pitch: 46, Yaw: 0};
    CAMERA_FIELDS.forEach(field => {
      field.set(defaults[field.label]);
      field.input.value = defaults[field.label];
      field.input.nextSibling.textContent = defaults[field.label].toFixed(0);
    });
  });
  cameraPanel.appendChild(cameraResetBtn);
  document.body.appendChild(cameraPanel);

  function init() {
    document.body.classList.remove('intro-active');
    document.body.classList.add('intro-done', 'portal-unlocked');
    // The real approach flow (runApproach()/cancelApproach() in script.js)
    // is what normally strips these pose classes off #deviceTilt as it
    // settles into the resting state; skipping straight to "unlocked" here
    // never runs that, so intro-pose (present in the raw HTML markup) was
    // silently overriding the base .device-tilt rule this whole time —
    // higher specificity beats it regardless of which values that rule
    // computes, which is why the camera pan had almost no visible effect.
    deviceTilt.classList.remove('intro-pose', 'intro-pose-zoomed', 'intro-walking');
    // script.js also autoplays the approach as a Web Animation on load; a
    // WAAPI effect keeps applying its own computed transform regardless of
    // class changes, so the class removal above isn't enough on its own —
    // cancel any animation actually running on the element too.
    deviceTilt.getAnimations().forEach(anim => anim.cancel());
    window.portalMatter?.unlock?.();
    refreshHud();
    requestAnimationFrame(refreshOverlay);
  }
  if (document.readyState === 'complete') setTimeout(init, 400);
  else window.addEventListener('load', () => setTimeout(init, 400));
})();
