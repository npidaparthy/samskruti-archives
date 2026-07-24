/*
 * render.js — turn a payload into a PNG buffer using headless Chrome.
 *
 * We assemble a self-contained HTML page (renderer.js + every module in
 * sections/, auto-discovered + the payload + a tiny bootstrap) and screenshot it
 * with the system Chrome/Chromium. Same engine Puppeteer drives, but with no npm
 * dependency and no Node-version constraints — the section set is discovered from
 * the directory, so dropping in a new section file needs no change here.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync, execSync } = require('child_process');

const SRC_DIR = path.resolve(__dirname, '..');
const SECTIONS_DIR = path.join(SRC_DIR, 'sections');

function findChrome(explicit) {
  const candidates = [
    explicit,
    process.env.DAILY_CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch (e) { /* ignore */ }
  }
  // Last resort: rely on PATH.
  return 'google-chrome';
}

// Discover section modules in load order (underscore-prefixed helpers first).
function sectionSources() {
  return fs.readdirSync(SECTIONS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort()
    .map(f => fs.readFileSync(path.join(SECTIONS_DIR, f), 'utf8'));
}

function buildHtml(payload) {
  const rendererJs = fs.readFileSync(path.join(SRC_DIR, 'renderer.js'), 'utf8');
  const sections = sectionSources();
  const S = payload.size || 1080;
  const scriptTags = [rendererJs].concat(sections)
    .map(s => `<script>\n${s}\n</script>`).join('\n');

  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;background:#1a1208;}
  #card{display:block;width:${S}px;height:${S}px;}
</style>
${scriptTags}
</head>
<body>
<canvas id="card" width="${S}" height="${S}"></canvas>
<script>
  // Draw synchronously at parse time (system Indic fonts are local, so
  // measureText is accurate immediately). Chrome's screenshot is taken after the
  // load event, by which point the canvas is fully painted. A logo, if any, is
  // decoded and re-drawn once it loads.
  window.__PAYLOAD__ = ${JSON.stringify(payload)};
  (function(){
    var p = window.__PAYLOAD__;
    window.render(p);
    if (p.logo && p.logo.imageSrc) {
      var img = new Image();
      img.onload = function(){ p.logo.image = img; window.render(p); };
      img.src = p.logo.imageSrc;
    }
  })();
</script>
</body></html>`;
}

// Render `payload` to a PNG buffer. opts: { chrome, size, timeoutMs }.
function renderToPng(payload, opts) {
  opts = opts || {};
  const S = payload.size || opts.size || 1080;
  const chrome = findChrome(opts.chrome);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-card-'));
  const htmlPath = path.join(tmp, 'card.html');
  const pngPath = path.join(tmp, 'card.png');
  fs.writeFileSync(htmlPath, buildHtml(payload));

  const profile = path.join(tmp, 'profile');
  const args = [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage', // CI runners have a tiny /dev/shm → Chromium crashes without this
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    // Keep Chrome from lingering after the shot: no updater/GCM/telemetry/sync.
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-breakpad',
    '--disable-domain-reliability',
    '--disable-client-side-phishing-detection',
    '--metrics-recording-only',
    '--no-pings',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    `--user-data-dir=${profile}`,
    '--force-device-scale-factor=1',
    `--window-size=${S},${S}`,
    `--screenshot=${pngPath}`,
    'file://' + htmlPath,
  ];
  // The screenshot lands in a couple of seconds, but some Chrome builds (notably
  // macOS, which spawns GoogleUpdater) never exit on their own. So we launch
  // detached, poll for the PNG to appear and stop growing, then kill the process
  // group — fast everywhere, without waiting out a timeout.
  const child = spawn(chrome, args, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '', exited = null;
  child.stderr.on('data', d => { stderr += d.toString(); });
  child.on('error', e => { stderr += `\nspawn error: ${e.message}`; });
  child.on('exit', (code, sig) => { exited = sig ? `signal ${sig}` : `code ${code}`; });

  const deadline = Date.now() + (opts.timeoutMs || 30000);
  const stableFor = 400; // ms the file size must hold steady
  let lastSize = -1, sinceStable = 0;
  while (Date.now() < deadline) {
    execSync('sleep 0.15');
    let size = -1;
    try { size = fs.statSync(pngPath).size; } catch (e) { size = -1; }
    if (size > 0 && size === lastSize) {
      sinceStable += 150;
      if (sinceStable >= stableFor) break;
    } else {
      sinceStable = 0; lastSize = size;
    }
    // If Chrome exited before writing anything, stop waiting out the timeout.
    if (exited && size < 0 && Date.now() - (deadline - (opts.timeoutMs || 30000)) > 1500) break;
  }

  // Kill the browser (and its process group), then read the result.
  try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { /* ignore */ }
  try { process.kill(child.pid, 'SIGKILL'); } catch (e) { /* ignore */ }

  if (!fs.existsSync(pngPath)) {
    const tail = stderr.trim().split('\n').slice(-8).join('\n') || '(no stderr)';
    throw new Error(
      `chrome produced no screenshot (${chrome}); exit=${exited || 'still running'}.\n--- chrome stderr ---\n${tail}`);
  }
  const buf = fs.readFileSync(pngPath);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  return buf;
}

module.exports = { renderToPng, buildHtml, findChrome, SRC_DIR, SECTIONS_DIR };
