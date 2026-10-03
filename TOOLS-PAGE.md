# Verktøy page

When the Verktøy card is thrown into the portal, its page is born out of the
orb instead of opening as a flat page. `tools-page.js` registers a page
presentation with the orb (`portalMatter.registerPresentation`, see
`PORTAL-ORB.md`): the card throw, the dive and the rebound are the ordinary ones,
and the formation follows the orb's flight into the page frame by frame.

## How it forms

Times are fractions of the page transition (`pageDuration`, 1.25 s):

- **The orb opens (0–0.5).** As the orb rises out of its rebound and spreads into
  a lens, its glass dissolves while six filaments of energy stream out of its
  heart, a bright head running along each, and curl round the reading surface.
  Sparks burst out of the heart and drift to where they will float.
- **The interface is drawn (0.26–0.85).** Light runs round each tool group's edge,
  starting at the corner that faces the orb and spreading both ways. The group's
  dark glass then fills in from that corner, and its tools rise into place,
  nearest first, each with a brief glint. The groups nearest the orb go first.
  The heading and the footer fade in last.
- **Logos flung out (0.16–0.9).** Four logos (Figma, Google Analytics, VS Code,
  ChatGPT; two on phones) fly out of the heart, swing past the interface's edge
  on their own side and land exactly on their slots. A slot's own logo stays
  hidden until its flung copy lands, so a logo is never shown twice.
- **Settled.** Only slow ambient motion remains: a current running along the
  filaments, the sparks drifting, the nebula breathing. It pauses while the tab
  is hidden and stops when the page closes.

The energy field follows the orb's own shape; the interface grows with it
uniformly, so its text is never squashed. Under reduced motion the page appears
complete, with no formation and no ambient motion.

## Layout

Four groups (Design, SEO & Analyse, Web & Utvikling, AI & Produktivitet) of dark
glass over the nebula, two by two. On wide but short screens (1100 px or wider,
860 px or lower) they sit side by side, so every group shows without scrolling
down to about 1280 × 720. On phones they stack and scroll inside the page. The
card's retrieval button sits at the right end of the footer line, clear of the
tools.

The logos are local SVGs; sources and licences are in `assets/tools/README.md`.

## Tuning

```js
toolsPage.configure({burstEnd: .5, logoReach: .2});
toolsPage.configure(toolsPage.defaults); // restore
toolsPage.settings; // copy of the current settings
toolsPage.stats;    // active, progress, settled, seedCount, pose, target, offset, materialOpacity, paused
```

| Parameter | Default | Range | Effect |
| --- | ---: | --- | --- |
| `fieldStart` | .04 | 0–.2 | The energy field appearing |
| `handoverStart`, `handoverEnd` | .14, .5 | .05–.4, .3–.9 | The orb's glass dissolving into it |
| `burstStart`, `burstEnd` | .08, .42 | 0–.3, .2–.6 | Filaments streaming out of the heart |
| `traceStart`, `traceEnd` | .26, .56 | .1–.5, .3–.8 | Light running round each group's edge |
| `fillStart`, `fillEnd` | .36, .72 | .2–.6, .5–.95 | Each group's glass filling in |
| `groupStagger` | .05 | 0–.08 | Between groups, nearest the orb first |
| `structureStart`, `structureEnd` | .44, .84 | .2–.7, .6–.95 | The heading and the footer |
| `logoStart`, `logoEnd` | .16, .9 | .05–.45, .7–1 | The flung logos' flight |
| `logoStagger` | .03 | 0–.06 | Between flung logos |
| `logoReach` | .14 | 0–.3 | How far past the interface they swing, of its size |
| `ribbonOpacity` | .7 | 0–1 | The filaments |
| `glowOpacity` | .65 | 0–1 | The nebula behind the glass |
| `ambientDuration` | 12 s | 6–30 | One cycle of the settled current and breathing |
| `widthScale`, `heightScale` | 1.06, 1.08 | .95–1.07, 1–1.12 | The page's size relative to the ordinary reader |

## Files

- `tools-page.js`: the presentation: the field (nebula, filaments, sparks), the
  flung logos, each group's glass and ring, and `window.toolsPage`.
- `tools-page.css`: the page's layout and glass, the field and its ambient motion.
- `index.html`: the page's markup, and loads both files.
- `portal-effects.js`: `registerPresentation` and the backing-store steps
  (`PORTAL-ORB.md`).
- `assets/tools/`: the logos and their licences.
- `tests/tools-check.mjs`: the checks below.

## Runtime

- No extra canvas or WebGL context: HTML, CSS and one SVG.
- While forming, each frame writes only what changed, directly onto the element
  it styles; layout is read once per formation (and when the viewport changes),
  never every frame.
- Settled, only CSS animations run (the filaments' current is the one that repaints);
  they pause in a hidden tab, and nothing runs once the page has closed.

## Verification

`node tests/tools-check.mjs` checks, in an isolated headless Chrome:

- a real keyboard card throw: the field is visible and the interface forms while
  the orb is still morphing, continuously, following the orb's pose on the same
  frame; logos are flung out, and a flung logo and its slot are never both shown;
- four categories and local, loaded, named logos; no extra canvas;
- the retrieval button clears the tools, and every group fits without scrolling at
  1440 × 900 and 1366 × 768;
- ambient animation pauses in a hidden tab;
- retrieval, a reset during formation and reopening clean up, and another page
  opens as before;
- reduced motion, phone portrait and short landscape (internal scrolling);
- the CSS fallback without WebGL, and no browser errors.

Screenshots go to `.qa/tools-*.png`. To look at it, serve the worktree (for
example `node tests/orb-check.mjs --serve`, then `http://127.0.0.1:4177/`) and
throw the Verktøy card.
