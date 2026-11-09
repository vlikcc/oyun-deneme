#!/usr/bin/env node
// Compatibility patches for SHARED files (owned by the main workflow) — see docs/research/compat-audit.md
// "PATCHES FOR SHARED FILES". Every patch is anchor-based (exact substring), idempotent (skipped when its marker is
// already present) and independent of the touch-controls work.
//
//   node tools/mobile/patches/apply.mjs                    # DRY RUN against the repo: reports which anchors match
//   node tools/mobile/patches/apply.mjs --root=<dir>       # dry run against another checkout / staged site
//   node tools/mobile/patches/apply.mjs --root=<dir> --write [--only=A,B]   # apply
//
// Verified 2026-11-09: applied with --write to a `git archive HEAD` copy of the live build, served locally and checked with
// tools/mobile-check.mjs (see the audit for the before/after table). The repo itself is never written without --write.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const ROOT = path.resolve(String(argv.root || path.join(HERE, '../../..')));
const WRITE = !!argv.write;
const ONLY = argv.only ? String(argv.only).split(',') : null;
const gate = fs.readFileSync(path.join(HERE, 'compat-gate.html'), 'utf8').trim();

export const PATCHES = [
  {
    id: 'A', file: 'index.html', why: 'unsupported-browser message (no import maps / no WebGL2 / boot error) instead of a blank page',
    marker: 'id="compatMsg"', anchor: '<link rel="stylesheet" href="src/ui/ui.css" />', where: 'after',
    code: gate,
  },
  {
    id: 'B', file: 'index.html', why: 'PWA / home-screen install: manifest, icons, iOS standalone (the only "fullscreen" an iPhone gets)',
    marker: 'rel="manifest"', anchor: '<link rel="stylesheet" href="src/ui/ui.css" />', where: 'before',
    code: `<link rel="manifest" href="assets/app.webmanifest" />
<link rel="icon" type="image/png" sizes="32x32" href="assets/icons/favicon-32.png" />
<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon-180.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Pıtır" />
<meta name="format-detection" content="telephone=no" />`,
  },
  {
    id: 'B2', file: 'index.html', why: 'theme-color (already in the working tree; only added when missing)',
    marker: 'name="theme-color"', anchor: '<link rel="stylesheet" href="src/ui/ui.css" />', where: 'before',
    code: '<meta name="theme-color" content="#8fd3ff" />',
  },
  {
    id: 'C', file: 'src/engine/core.js', why: 'tier detection: count RENDERED pixels (DPR is capped) so big tablets are not forced to "low"',
    marker: 'compat-audit C', anchor: `    const px = (devicePixelRatio || 1) * innerWidth * innerHeight;
    if (px > 2.5e6 || (navigator.hardwareConcurrency || 8) <= 4) return 'low';`, where: 'replace',
    code: `    // compat-audit C: pixels actually rendered at the medium DPR cap (1.25), not dpr×CSS px — an iPad Pro (2732×2048
    // physical) is ~3.3 Mpx at the cap and has a desktop-class GPU; old "dpr*w*h > 2.5e6" sent every big tablet to 'low'.
    const cap = Math.min(devicePixelRatio || 1, 1.25), px = innerWidth * innerHeight * cap * cap;
    const cores = navigator.hardwareConcurrency || 8, mem = navigator.deviceMemory || 8;   // deviceMemory: Chrome/Android only
    if (cores <= 4 || mem <= 3 || px > 4.2e6) return 'low';`,
  },
  {
    id: 'D1', file: 'src/engine/assets.js', why: 'track texture/HDRI loads so the game can wait for them (black island on slow 4G)',
    marker: 'compat-audit D', anchor: 'const texLoader = new THREE.TextureLoader();', where: 'replace',
    code: `// compat-audit D: one LoadingManager for textures + HDRIs → loadState / whenIdle() (main.js shows "Ada hazırlanıyor…").
export const loadState = { busy: false, loaded: 0, total: 0 };
const idleWaiters = [];
export const loadManager = new THREE.LoadingManager(
  () => { loadState.busy = false; idleWaiters.splice(0).forEach((f) => f(true)); },
  (url, loaded, total) => { loadState.loaded = loaded; loadState.total = total; },
);
loadManager.onStart = () => { loadState.busy = true; };
/** whenIdle(ms) → true when every queued texture/HDRI request finished, false on timeout. */
export function whenIdle(ms = 25000) {
  if (!loadState.busy) return Promise.resolve(true);
  return new Promise((r) => { idleWaiters.push(r); setTimeout(() => r(false), ms); });
}
const texLoader = new THREE.TextureLoader(loadManager);`,
  },
  {
    id: 'D2', file: 'src/engine/assets.js', why: 'HDRI requests counted by the same manager',
    marker: 'new HDRLoader(loadManager)', anchor: 'const loader = new HDRLoader();', where: 'replace',
    code: 'const loader = new HDRLoader(loadManager);',
  },
  {
    id: 'E1', file: 'src/main.js', why: 'import assets (for D3) in main.js',
    marker: "import * as assetsMod from './engine/assets.js';", anchor: "import * as save from './engine/save.js';", where: 'after',
    code: "import * as assetsMod from './engine/assets.js';",
  },
  {
    id: 'E2', file: 'src/main.js', why: 'loading gate: do not drop the player into an untextured (black) island; show "Ada hazırlanıyor…"',
    marker: 'compat-audit E', anchor: `export function startLevel(id) {
  const lv = loadLevel(id ?? PLAYABLE[0].id);`, where: 'replace',
    code: `// compat-audit E: on a slow connection the island's JPG/HDR textures arrive 10–70 s after the build; untextured PBR
// materials render black. Wait (≤ 25 s) behind a card, then start for real. Tests (?test=1) never wait.
let loadingCard = null;
function showLoading(on) {
  if (on && !loadingCard) {
    loadingCard = document.createElement('div'); loadingCard.className = 'overlay'; loadingCard.id = 'loadingCard';
    loadingCard.innerHTML = '<div class="card"><h2>Ada hazırlanıyor…</h2><p class="small" id="loadingPct"></p></div>';
    document.body.appendChild(loadingCard);
  } else if (!on && loadingCard) { loadingCard.remove(); loadingCard = null; }
}
export function startLevel(id, opts = {}) {
  id = id ?? PLAYABLE[0].id;
  if (!opts.loaded && !flags.test) {
    if (currentId !== id || !world.level) loadLevel(id);          // queues this island's textures + HDRI
    if (assetsMod.loadState.busy) {
      setState('loading'); screens.hide(); hud.setVisible(false); input.setEnabled(false); showLoading(true);
      const iv = setInterval(() => { const s = assetsMod.loadState, el = document.getElementById('loadingPct'); if (el) el.textContent = s.total ? Math.round((100 * s.loaded) / s.total) + ' %' : ''; }, 250);
      assetsMod.whenIdle(25000).then(() => { clearInterval(iv); showLoading(false); if (state === 'loading') startLevel(id, { loaded: true }); });
      return levelById(id);
    }
  }
  const lv = loadLevel(id);`,
  },
  {
    id: 'F', file: 'src/main.js', why: 'pause while the WebGL context is lost (the simulation kept running blind); three.js restores GL by itself',
    marker: 'webglcontextlost', anchor: "addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') setPaused(true); });", where: 'after',
    code: "renderer.domElement.addEventListener('webglcontextlost', () => { if (state === 'play') setPaused(true); });   // compat-audit F",
  },
  {
    id: 'G', file: 'src/main.js', why: 'Android/iPadOS: fullscreen + landscape lock on the first "Başla!" tap (needs the user gesture); iPhone has no API → PWA (patch B)',
    marker: 'compat-audit G', anchor: "  onStart: () => { audio.unlock(); showSelect(); },", where: 'replace',
    code: `  onStart: () => { audio.unlock(); goFullscreen(); showSelect(); },   // compat-audit G`,
    extra: {
      anchor: 'screens.init({', where: 'before',
      code: `// compat-audit G: fullscreen hides the browser bars on Android Chrome / iPadOS Safari; orientation.lock only works
// while fullscreen (Android). Must run inside the tap handler. No-op on desktop, iPhone and in installed PWAs.
function goFullscreen() {
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!flags.touch || flags.test || !req || document.fullscreenElement || document.webkitFullscreenElement) return;
  if (matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) return;
  try { Promise.resolve(req.call(el, { navigationUI: 'hide' })).then(() => screen.orientation?.lock?.('landscape')).catch(() => {}); } catch { /* ignore */ }
}
`,
    },
  },
  {
    id: 'H1', file: 'src/engine/assets.js', why: 'phones load 512 px textures (assets/tex/512/, made by tools/mobile/make-tex512.mjs): 9 MB → 0.5 MB for island 1, ~4× less GPU memory',
    marker: "settings.texDir", anchor: "  const url = BASE + 'tex/' + file;", where: 'replace',
    code: "  const url = BASE + 'tex/' + (settings.texDir || '') + file;   // compat-audit H: '512/' on medium/low",
  },
  {
    id: 'H2', file: 'src/engine/core.js', why: 'select the 512 px texture folder on the medium/low tiers (GDD §5.2 texture row)',
    marker: 'assets.settings.texDir', anchor: "assets.settings.hdriRes = quality.tier === 'high' ? '2k' : '1k';", where: 'after',
    code: "assets.settings.texDir = quality.tier === 'high' || params.get('tex') === '1k' ? '' : '512/';   // compat-audit H",
  },
];

// ------------------------------------------------------------------ apply / dry run
let bad = 0;
const files = new Map();
const read = (f) => { if (!files.has(f)) { const p = path.join(ROOT, f); files.set(f, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null); } return files.get(f); };
const put = (text, anchor, where, code) => {
  const i = text.indexOf(anchor); if (i < 0) return null;
  if (where === 'before') return text.slice(0, i) + code + '\n' + text.slice(i);
  if (where === 'after') return text.slice(0, i + anchor.length) + '\n' + code + text.slice(i + anchor.length);
  return text.slice(0, i) + code + text.slice(i + anchor.length);
};
for (const p of PATCHES) {
  if (ONLY && !ONLY.includes(p.id) && !ONLY.includes(p.id.replace(/\d+$/, ''))) continue;
  let t = read(p.file);
  if (t == null) { console.log(`  MISSING-FILE ${p.id} ${p.file}`); bad++; continue; }
  if (t.includes(p.marker)) { console.log(`  already      ${p.id} ${p.file} — ${p.why}`); continue; }
  let n = put(t, p.anchor, p.where, p.code);
  if (n && p.extra) n = put(n, p.extra.anchor, p.extra.where, p.extra.code);
  if (!n) { console.log(`  NO-ANCHOR    ${p.id} ${p.file} — anchor not found: ${JSON.stringify(p.anchor.split('\n')[0])}`); bad++; continue; }
  files.set(p.file, n);
  console.log(`  ${WRITE ? 'applied ' : 'would apply'}  ${p.id} ${p.file} — ${p.why}`);
}
if (WRITE) for (const [f, t] of files) if (t != null) fs.writeFileSync(path.join(ROOT, f), t);
console.log(`${WRITE ? 'wrote' : 'dry run'} @ ${ROOT}${bad ? ` — ${bad} patch(es) need a manual merge` : ''}`);
process.exit(bad ? 1 : 0);
