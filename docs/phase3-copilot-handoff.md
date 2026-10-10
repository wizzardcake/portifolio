# Phase 3: Copilot integration audit

Audit date: 2026-10-10

> **Reviewed by Claude (2026-10-10).** The review's findings and fixes, and
> the current behaviour, are in `docs/handoff-interior.md`, "Phase 3". One
> line below no longer holds: leaving game mode now keeps the visitor where
> they stand (`FREE`), with the places' marks shown, instead of returning
> to `ENTRY`.

> **Continuation update:** This section supersedes the pre-integration status and recommendations below. The original audit is retained as historical context.

## Current implementation and verification

- Worktree: `verification/interior-reconstruction`
- Branch: `feature/interior-reconstruction`
- No branch switch, commit, merge, push, or deploy was performed.
- Claude's free-camera work in `scene-camera.js` and the existing `first-person.js` controller were retained.
- `room-scene.js` now initializes the controller after the room APIs exist and exposes its walk plan, shelf-hover state, and centre-aim switch. The table collision radius uses the shared `sceneCamera` view dimensions; an integrated test exposed and verified a prior `NaN` caused by reading those dimensions from the Three.js camera.
- `index.html` loads `first-person.css`; the stylesheet supplies the controller's menu, invitation, sight, and hint UI.
- Game-to-Website switching leaves `FREE` and returns to `ENTRY`, restoring the existing navigation targets.
- `tests/first-person-check.mjs` is a standalone Chrome DevTools Protocol browser test; it does not require installing dependencies.

### Verification results

| Check | Result | Coverage / limitation |
| --- | --- | --- |
| `node --check scene-camera.js`, `first-person.js`, `room-scene.js`, and `tests/first-person-check.mjs` | PASS | JavaScript syntax |
| `PORTFOLIO_HEADLESS=0 node tests/first-person-check.mjs` | PASS | Visible Chrome; controller/CSS integration, invitation dismissal and mode menu, Website drag-look, pointer lock, WASD displacement, safe-floor and table/wall/column collision samples, actual stair climb to the upper landing, Escape, Game-to-Website return/navigation targets, game-mode walking and E-to-sit, centre-sight shelf acquisition in Game Mode, tablecloth drag, and live Website-mode shelf hover. Browser console errors and warnings were empty. |
| `node tests/navigation-check.mjs --out=phase3-final` | PASS | Existing shelf/chair navigation in wide and portrait layouts. All reachable-destination checks passed; some individual object points are occluded at particular viewports. |
| `node tests/cloth-check.mjs` | PASS | Existing cloth geometry/support, UV, winding, coverage, and mesh-budget regression checks; the browser test also dragged the cloth to reveal the portal. |

On Windows PowerShell, set the visible-Chrome option with `$env:PORTFOLIO_HEADLESS='0'` before running `node tests/first-person-check.mjs`. The test defaults to headless mode, where pointer lock is unavailable.

### Continuation checklist

- [x] Integrate the retained controller and room contract.
- [x] Restore working Website navigation after leaving `FREE`.
- [x] Verify Website drag-look, Game Mode WASD, collision boundaries, stair support, pointer lock, cloth dragging, shelf hover, and existing navigation.
- [x] Verify a full stair climb to the upper landing and test Game Mode shelf aiming and sit/use with pointer lock.

## 1. Current status

The following describes the worktree **at the time of the original audit**, before the integration continuation above.

- Worktree: `verification/interior-reconstruction`
- Branch: `feature/interior-reconstruction`
- HEAD: `71b78cb` (the commit supplied for this handoff)
- Before this audit, the only worktree changes were a modified `scene-camera.js` and an untracked `first-person.js`.
- Production JavaScript, HTML, and CSS were not changed during this audit. The original changes remain uncommitted and untouched.

The page currently loads the existing website-navigation experience. Phase 3 is not yet connected to it, so a passing existing-site test is not evidence that the first-person controller works.

## 2. Work already present

- `scene-camera.js` adds a free camera pose, free-look handling, `enterFree()` / `setFree()`, and navigation from the free pose to the existing named destinations. Relevant additions are around `scene-camera.js:474-606`.
- `first-person.js` exports `createFirstPerson()` and contains website drag-to-look, a keyboard walker and floor checks, pointer-lock handling, sight/aim logic, a mode menu, and an invitation popup. It also refers to a `first-person.css` stylesheet.
- The controller comments describe the expected room integration API, but the module has not been initialized by the page.

## 3. Integration blockers and verified problems

### Confirmed blockers

1. **The controller is not imported or initialized.** The page loads the classic camera script and the `room-scene.js` module, but neither the HTML nor the scene module loads `first-person.js`. See `index.html:442-453`. Consequently, none of the new controls, UI, or first-person behavior is active.

2. **The room API expected by the controller is not exposed.** `createFirstPerson()` immediately reads `room.walk` (`first-person.js:96`), and later calls `room.shelfHover()` and `room.aimCentre()` (`first-person.js:217,254,274`). The current `window.studyRoom` object is assembled at `room-scene.js:1668` without those members. The shelf hover index exists only as a local variable (`room-scene.js:1505`); the raycaster uses the pointer position (`room-scene.js:1504-1532`). Passing the current `window.studyRoom` directly would fail when the controller reads the missing walk plan, and the aim-related calls would also fail once reached.

3. **The stylesheet is missing.** `first-person.js:40` requests `first-person.css`, but no such file exists in the worktree. This would not itself stop JavaScript execution, but the menu, popup, sight, and hints would lack their intended styling.

### Confirmed navigation integration risk; runtime behavior not yet tested

The existing `script.js` only maps `ENTRY`, `SEATED`, and `SHELF_INSPECTION` to named page poses; every other state, including the new `FREE`, becomes `"walking"` (`script.js:68-76`). It shows the existing navigation targets only for `ENTRY` and `SHELF_INSPECTION` (`script.js:128-133`). Meanwhile, the new controller's “Nettsidemodus” action changes its own mode but does not move the camera out of `FREE` (`first-person.js:263-279`). After switching from game to website mode, the existing destination controls can therefore remain hidden while the camera stays at a free pose. Define and implement the intended return/navigation behavior before enabling this toggle.

### Risks to verify during integration

- **Pointer lock and shelf aiming:** the existing shelf ray follows pointer coordinates, while the new controller expects `aimCentre()` to redirect it to the screen centre under pointer lock. Until those APIs share the same raycast/hover state, shelf targeting in game mode is unverified.
- **Existing navigation and smoke markers:** `script.js` owns the entry/shelf/chair destination buttons and reacts to `room-navigation`; the camera now also emits `FREE`. Preserve the current destination-state behavior and test both marker clicks and transitions out of `FREE`.
- **Tablecloth drag:** the controller explicitly excludes `.table-cloth` from its drag-to-look handler (`first-person.js:18-20,59-63`), which is the intended protection. Actual coexistence has not been tested because the controller is not wired in.
- **Pointer/click interaction:** the new controller uses capture-phase pointer handlers and suppresses the click after a drag. Smoke-target clicks, menu controls, pointer-lock exit, and the existing cloth/shelf interactions need an integrated browser test.
- **Camera ownership:** the room renderer and existing page navigation both observe `scene-camera-change` / `room-navigation`, while the walker would update the shared camera every frame. Verify that free movement, mode changes, and existing `camera.go()` transitions do not leave stale UI or competing camera updates.

No current website-load failure was reproduced. The new module is not loaded by the page, and its JavaScript syntax checks pass; its runtime integration remains unverified.

## 4. Checks run

| Check | Result | Scope / limitation |
| --- | --- | --- |
| `node --check scene-camera.js` | PASS | Syntax only |
| `node --check first-person.js` | PASS | Syntax only; does not execute the unintegrated module |
| `node --check room-scene.js` | PASS | Syntax only |
| `node tests/navigation-check.mjs --out=copilot-prep` | PASS | Existing smoke/destination navigation in wide and portrait layouts; browser console errors were empty. It does not exercise first-person movement or pointer lock. |
| `node tests/cloth-check.mjs` | PASS | Cloth geometry/support checks |
| `node tests/table-check.mjs` | PASS | Table geometry checks |
| `node tests/architecture-check.mjs` | PASS | Room geometry/opening checks |
| `node tests/shelf-tools-check.mjs --round=copilot-prep` | PASS | Isolated `tools-preview.html` hover, geometry, lifecycle, and reduced-motion checks; not room-shelf interaction |
| First-person camera movement, floor/collision boundaries, stair traversal, pointer lock, and mode transitions | NOT RUN | Controller is not integrated and required room APIs are missing |
| Browser cloth-drag regression (`portal-check.mjs --cloth-only`) | NOT RUN | The test writes screenshot names into the pre-existing `.qa` directory; avoided overwriting its existing evidence |

No dependencies were installed.

## 5. Recommended implementation order

1. Define the room/controller contract first: expose the walk-plan data and the shelf-hover / centre-aim operations, or adjust the controller to use an existing shared API. Keep the walk geometry consistent with the renderer's scene coordinates and placement.
2. Import and initialize the controller exactly once after the room and camera APIs are ready. Handle the no-WebGL/fallback path explicitly.
3. Add the referenced stylesheet and make its UI controls work with the page's existing stacking, pointer-event, and responsive CSS.
4. Resolve `FREE` navigation and the game-to-website transition so the current smoke/destination controls remain reachable.
5. Exercise pointer-lock acquisition/exit, W/A/S/D movement, camera drag, click-versus-drag suppression, tablecloth dragging, shelf raycasting, and smoke navigation in the integrated page.
6. Add focused automated checks for floor/collision/stair boundaries and mode/navigation transitions, then rerun the existing navigation and cloth browser regressions.

## 6. Original audit's Claude continuation checklist (historical)

- [ ] Inspect this report and the retained uncommitted changes before editing.
- [ ] Agree the `room.walk`, `aimCentre`, and `shelfHover` integration contract.
- [ ] Wire controller initialization and provide `first-person.css`.
- [ ] Make switching back to website mode leave a usable camera/navigation state.
- [ ] Verify pointer-lock, camera movement/collision, smoke markers, shelf targeting, and cloth dragging in a browser.
- [ ] Run focused tests and confirm no page-load or console errors.

## 7. Files created during the original audit

Documentation:

- `docs/phase3-copilot-handoff.md` (this report)

Test evidence created by the commands above:

- `verification/navigation/copilot-prep/report.json`
- `verification/navigation/copilot-prep/wide-entry.png`
- `verification/navigation/copilot-prep/portrait-entry.png`
- `verification/tools/attempt-copilot-prep/report.json`
- `verification/tools/attempt-copilot-prep/all-hover.png`
- `verification/tools/attempt-copilot-prep/all-idle.png`
- `verification/tools/attempt-copilot-prep/crystal-hover.png`
- `verification/tools/attempt-copilot-prep/crystal-idle.png`
- `verification/tools/attempt-copilot-prep/crystal-side.png`
- `verification/tools/attempt-copilot-prep/figma-hover.png`
- `verification/tools/attempt-copilot-prep/figma-idle.png`
- `verification/tools/attempt-copilot-prep/figma-side.png`
- `verification/tools/attempt-copilot-prep/grimoire-hover.png`
- `verification/tools/attempt-copilot-prep/grimoire-idle.png`
- `verification/tools/attempt-copilot-prep/grimoire-side.png`
- `verification/tools/attempt-copilot-prep/reduced-motion.png`

No existing production files or Claude-authored changes were modified.
