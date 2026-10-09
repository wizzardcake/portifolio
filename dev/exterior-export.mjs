// node dev/exterior-export.mjs [--preview=out.png --time=0 --layer=full --size=900 --samples=1]
// node dev/exterior-export.mjs --assets
// Renders dev/exterior-art.html in a local Chrome (GPU) and writes the
// loading screen's exterior layers to assets/loading/ (--assets), or one
// preview image. Prints the entrance's place in the image.
import {createServer} from 'node:http';
import {readFile, writeFile, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {resolve, extname, sep, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
// The layers the site uses: the building at three moments of its inner
// flow, crossfaded in turn by loading-exterior.css.
const ASSETS = [
  {file: 'assets/loading/exterior-a.webp', time: 3, layer: 'full'},
  {file: 'assets/loading/exterior-b.webp', time: 11, layer: 'full'},
  {file: 'assets/loading/exterior-c.webp', time: 19, layer: 'full'},
];
const SIZE = 1200, SAMPLES = 6, QUALITY = .86;

const server = createServer(async (req, res) => {
  const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { const data = await readFile(file); res.setHeader('Content-Type', {'.html': 'text/html', '.js': 'text/javascript'}[extname(file)] || 'application/octet-stream'); res.end(data); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const profile = await mkdtemp(resolve(tmpdir(), 'exterior-export-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-swiftshader', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], {windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
let ws;
try {
  const endpoint = await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error('Chrome startup timed out')), 20000); let log = '';
    chrome.stderr.on('data', chunk => { log += chunk; const m = log.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(timer); done(m[1]); } });
  });
  ws = new WebSocket(endpoint);
  await new Promise((done, fail) => { ws.addEventListener('open', done, {once: true}); ws.addEventListener('error', fail, {once: true}); });
  let serial = 0, session; const pending = new Map();
  ws.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.fail(new Error(JSON.stringify(m.error))) : p.done(m.result); }
    if (m.method === 'Runtime.exceptionThrown') console.error('Page error:', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });
  const cdp = (method, params = {}, attached = true) => new Promise((done, fail) => {
    const id = ++serial; pending.set(id, {done, fail});
    ws.send(JSON.stringify({id, method, params, ...(attached && session ? {sessionId: session} : {})}));
  });
  const {targetInfos} = await cdp('Target.getTargets', {}, false);
  session = (await cdp('Target.attachToTarget', {targetId: targetInfos.find(t => t.type === 'page').targetId, flatten: true}, false)).sessionId;
  await cdp('Runtime.enable'); await cdp('Page.enable');
  const evaluate = async expression => {
    const r = await cdp('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await cdp('Page.navigate', {url: `http://127.0.0.1:${server.address().port}/dev/exterior-art.html`});
  for (let i = 0; !(await evaluate("document.body?.dataset.ready === 'yes'").catch(() => false)); i++) {
    if (i > 200) throw new Error('The art page did not start'); await new Promise(r => setTimeout(r, 100));
  }
  const write = async (file, params, type) => {
    const data = await evaluate(`exteriorArt.render(${JSON.stringify(params)}).then(c => exteriorArt.encode(c, '${type}', ${QUALITY}))`);
    await mkdir(dirname(resolve(root, file)), {recursive: true});
    await writeFile(resolve(root, file), Buffer.from(data, 'base64'));
    console.log('wrote', file, Math.round(data.length * .75 / 1024) + ' KB');
  };
  if (process.argv.includes('--assets')) {
    for (const {file, time, layer} of ASSETS) await write(file, {size: SIZE, time, layer, samples: SAMPLES}, 'image/webp');
  } else {
    await write(arg('preview', 'verification/exterior-entry/art-preview.png'),
      {size: +arg('size', 900), time: +arg('time', 0), layer: arg('layer', 'full'), samples: +arg('samples', 1), background: arg('background', '#07060d')}, 'image/png');
  }
  console.log('door', JSON.stringify(await evaluate('exteriorArt.door')));
} finally {
  ws?.close(); server.close(); chrome.kill();
  await rm(profile, {recursive: true, force: true, maxRetries: 8, retryDelay: 250}).catch(() => {});
}
