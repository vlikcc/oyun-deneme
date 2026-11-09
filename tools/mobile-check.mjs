#!/usr/bin/env node
// Cross-browser / mobile compatibility check for Pıtır'ın Kristal Adaları (Playwright: Chromium, WebKit, Firefox).
//
// Runs the REAL player flow (no ?test=1): load → title screen → tap/click "Başla!" → level select → tap island 1 + "Başla!" →
// state 'play' → frame loop / input / resize / visibility / WebGL context-loss probes → report. One row per
// browser/device profile (tools/mobile/profiles.mjs), screenshots in tools/out/mobile/, JSON in tools/out/mobile/report.json.
//
// Usage (from the repo root):
//   node tools/mobile-check.mjs                                   # default: live site, every default profile
//   node tools/mobile-check.mjs --url=http://localhost:8765/      # local dev server
//   node tools/mobile-check.mjs --only=iphone-portrait,webkit-desktop
//   node tools/mobile-check.mjs --only=android-slow4g             # opt-in profiles are only run when named
//   node tools/mobile-check.mjs --only=gate-no-importmap,gate-no-webgl2   # unsupported browser must show a message
//   node tools/mobile-check.mjs --skip=chrome-desktop,edge-desktop --jobs=2 --headed --require-touch
// Options: --url, --only, --skip, --jobs=N (parallel profiles, default 1), --headed, --require-touch (missing on-screen
//   touch controls = FAIL instead of WARN), --level=<id> (card to tap, default first unlocked), --timeout=<s> (per step,
//   default 90), --no-shots, --out=<dir> (default tools/out/mobile), --gl=gpu|swiftshader (Chromium WebGL backend; default gpu on macOS = ANGLE Metal, which
//   gives real frame rates headless; swiftshader elsewhere / in CI).
// Exit code: 1 if any profile FAILs (page error, console error, failed/4xx request, no WebGL, no 'play' state, frame
//   loop stalled, start button unreachable, desktop keyboard/gamepad not moving the player). WARNs do not fail the run.
//
// Setup once:  cd tools && npm i && npx playwright install chromium webkit firefox
import { chromium, webkit, firefox } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILES, NET } from './mobile/profiles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const BASE = String(argv.url || 'https://vlikcc.github.io/oyun-deneme/');
const OUT = path.resolve(ROOT, String(argv.out || 'tools/out/mobile')); fs.mkdirSync(OUT, { recursive: true });
const STEP_TIMEOUT = Number(argv.timeout || 90) * 1000;
const JOBS = Math.max(1, Number(argv.jobs || 1));
const SHOTS = !argv['no-shots'];
const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : null);
const ONLY = list(argv.only), SKIP = list(argv.skip) || [];
const ENGINES = { chromium, webkit, firefox };
const GL = argv.gl ? String(argv.gl) : process.platform === 'darwin' ? 'gpu' : 'swiftshader';
const CHROMIUM_ARGS = GL === 'gpu'
  ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'];

const profiles = PROFILES.filter((p) => (ONLY ? ONLY.includes(p.name) : !p.optIn) && !SKIP.includes(p.name));
if (!profiles.length) { console.error('no profiles selected; known:', PROFILES.map((p) => p.name).join(', ')); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ignorableUrl = (u) => /favicon\.ico(\?|$)/.test(u);

// ------------------------------------------------------------------ in-page probes (plain functions, serialised)
function probeEnv() {
  const g = window.__game, core = g.core, r = core.renderer, gl = r.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.getAttribute('content') ?? null;
  const link = (rel) => document.querySelector(`link[rel="${rel}"]`)?.getAttribute('href') ?? null;
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(d); const dcs = getComputedStyle(d);
  const safeArea = [dcs.paddingTop, dcs.paddingRight, dcs.paddingBottom, dcs.paddingLeft].join(' '); d.remove();
  const bcs = getComputedStyle(document.body), ccs = getComputedStyle(r.domElement);
  const isGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  let storage = false; try { localStorage.setItem('__mc', '1'); localStorage.removeItem('__mc'); storage = true; } catch { /* private mode */ }
  return {
    ua: navigator.userAgent,
    webgl2: isGL2, glVersion: gl.getParameter(gl.VERSION), gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE), maxRenderbuffer: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), maxSamples: isGL2 ? gl.getParameter(gl.MAX_SAMPLES) : null,
    ext: {
      colorBufferFloat: !!gl.getExtension('EXT_color_buffer_float'), colorBufferHalfFloat: !!gl.getExtension('EXT_color_buffer_half_float'),
      floatLinear: !!gl.getExtension('OES_texture_float_linear'), anisotropic: !!gl.getExtension('EXT_texture_filter_anisotropic'),
      loseContext: !!gl.getExtension('WEBGL_lose_context'), astc: !!gl.getExtension('WEBGL_compressed_texture_astc'), etc: !!gl.getExtension('WEBGL_compressed_texture_etc'), s3tc: !!gl.getExtension('WEBGL_compressed_texture_s3tc'),
    },
    antialias: gl.getContextAttributes()?.antialias ?? null,
    tier: core.quality.tier, tierPixelRatio: core.quality.pixelRatio, shadowMap: core.quality.shadowMapSize, reflection: core.quality.reflection,
    dpr: devicePixelRatio, pixelRatio: r.getPixelRatio(), inner: [innerWidth, innerHeight],
    canvasCss: [r.domElement.clientWidth, r.domElement.clientHeight], buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    touchFlag: !!core.flags.touch, maxTouchPoints: navigator.maxTouchPoints, coarse: matchMedia('(pointer: coarse)').matches, hover: matchMedia('(hover: hover)').matches,
    hwConcurrency: navigator.hardwareConcurrency ?? null, deviceMemory: navigator.deviceMemory ?? null,
    viewportMeta: meta('viewport'), themeColor: meta('theme-color'), appleCapable: meta('apple-mobile-web-app-capable'), mobileCapable: meta('mobile-web-app-capable'),
    manifest: link('manifest'), appleTouchIcon: link('apple-touch-icon'),
    css: {
      bodyTouchAction: bcs.touchAction, canvasTouchAction: ccs.touchAction, overscroll: bcs.overscrollBehaviorY || bcs.overscrollBehavior || null,
      userSelect: bcs.userSelect || bcs.webkitUserSelect || null, touchCallout: bcs.webkitTouchCallout ?? null, tapHighlight: bcs.webkitTapHighlightColor ?? null,
      dvh: CSS.supports('height', '100dvh'), canvasHeightPx: ccs.height,
    },
    safeArea,
    fullscreen: { std: document.fullscreenEnabled ?? null, webkit: document.webkitFullscreenEnabled ?? null, canvasApi: typeof r.domElement.requestFullscreen === 'function' || typeof r.domElement.webkitRequestFullscreen === 'function' },
    orientationLock: typeof screen.orientation?.lock === 'function', orientation: screen.orientation?.type ?? null,
    importMap: typeof HTMLScriptElement.supports === 'function' ? HTMLScriptElement.supports('importmap') : null,
    pointerLock: typeof r.domElement.requestPointerLock === 'function', gamepadApi: typeof navigator.getGamepads === 'function',
    audioApi: !!(window.AudioContext || window.webkitAudioContext), storage,
  };
}

function probeTextures() {
  const g = window.__game, core = g.core, scene = core.scene, r = core.renderer;
  const seen = new Set();
  const add = (t) => { if (t && t.isTexture) seen.add(t); };
  const scanMat = (m) => { if (!m) return; for (const k in m) { const v = m[k]; if (v && v.isTexture) add(v); } if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture) add(u.value); };
  scene.traverse((o) => { (Array.isArray(o.material) ? o.material : [o.material]).forEach(scanMat); });
  add(scene.background); add(scene.environment);
  const bppOf = (t) => (t.type === 1015 ? 16 : t.type === 1016 ? 8 : 4);   // FloatType RGBA32F, HalfFloatType RGBA16F, else RGBA8
  let bytes = 0, maxDim = 0; const big = [];
  for (const t of seen) {
    const img = t.image; const w = img?.width || img?.videoWidth || 0, h = img?.height || img?.videoHeight || 0;
    if (!w || !h) continue;
    maxDim = Math.max(maxDim, w, h);
    const mip = t.generateMipmaps !== false && t.minFilter !== 1006 && t.minFilter !== 1003 ? 4 / 3 : 1;
    const b = w * h * bppOf(t) * mip; bytes += b;
    const src = img?.currentSrc || img?.src || t.name || (t.isDataTexture ? 'DataTexture' : t.isRenderTargetTexture ? 'RenderTarget' : 'texture');
    big.push({ src: String(src).split('/').pop().slice(0, 60), w, h, mb: +(b / 1048576).toFixed(1) });
  }
  big.sort((a, b) => b.mb - a.mb);
  const q = core.quality;
  const shadowMB = (q.shadowMapSize ** 2 * 4) / 1048576, waterMB = q.reflection ? (q.waterTex ** 2 * 4 * 2) / 1048576 : 0;
  const gl = r.getContext(), fbMB = (gl.drawingBufferWidth * gl.drawingBufferHeight * (4 + 4) * ((gl.getContextAttributes()?.antialias) ? 4 : 1) + gl.drawingBufferWidth * gl.drawingBufferHeight * 4) / 1048576;
  return {
    textures: seen.size, gpuTextures: r.info.memory.textures, programs: r.info.programs?.length ?? null, maxDim,
    estTextureMB: +(bytes / 1048576).toFixed(1), shadowMB: +shadowMB.toFixed(1), waterMB: +waterMB.toFixed(1), framebufferMB: +fbMB.toFixed(1),
    hdriType: scene.background?.isDataTexture ? (scene.background.type === 1016 ? 'half-float' : scene.background.type === 1015 ? 'float' : 'ubyte') : (scene.background?.isTexture ? 'canvas-gradient' : null),
    top: big.slice(0, 6),
  };
}

async function sampleFrames(ms) {
  const c = window.__game.core; const t0 = c.time.now, start = performance.now(); let n = 0;
  await new Promise((res) => { const f = () => { n++; if (performance.now() - start < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  const secs = (performance.now() - start) / 1000;
  return { frames: n, fps: +(n / secs).toFixed(1), simAdvance: +(c.time.now - t0).toFixed(2), draws: c.stats().calls, state: window.__game.state };
}

// ------------------------------------------------------------------ one profile
async function runProfile(p) {
  const res = { profile: p.name, engine: p.channel || p.engine, kind: p.kind, net: p.net ? NET[p.net].label : null, note: p.note || null, status: 'PASS', fails: [], warns: [], timings: {}, checks: {} };
  const fail = (m) => { res.fails.push(m); res.status = 'FAIL'; };
  const warn = (m) => res.warns.push(m);
  const shot = async (page, name) => { if (!SHOTS) return; try { await page.screenshot({ path: path.join(OUT, `${p.name}-${name}.png`), timeout: 20000 }); } catch (e) { warn(`screenshot ${name}: ${e.message.split('\n')[0]}`); } };

  let browser;
  try {
    browser = await ENGINES[p.engine].launch({ headless: !argv.headed, channel: p.channel, args: p.engine === 'chromium' ? CHROMIUM_ARGS : [], firefoxUserPrefs: p.engine === 'firefox' ? { 'webgl.force-enabled': true, 'media.autoplay.default': 0 } : undefined });
  } catch (e) { res.status = 'SKIP'; res.fails.push(`launch: ${e.message.split('\n')[0]}`); return res; }
  const context = await browser.newContext({ ...p.ctx, locale: 'tr-TR', bypassCSP: false });
  // Gamepad stub: navigator.getGamepads() returns window.__fakePad while it is set (desktop gamepad check).
  await context.addInitScript(() => {
    const orig = Navigator.prototype.getGamepads;
    Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, writable: true, value: function () { return window.__fakePad ? [window.__fakePad] : orig ? orig.call(this) : []; } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(STEP_TIMEOUT);

  // ---- network accounting
  const reqs = []; let t0 = 0, inflight = 0, lastNet = Date.now();
  page.on('request', () => { inflight++; lastNet = Date.now(); });
  page.on('requestfinished', async (rq) => {
    inflight--; lastNet = Date.now();
    const at = Date.now() - t0; let bytes = 0;
    try { const s = await rq.sizes(); bytes = s.responseBodySize + s.responseHeadersSize; } catch { try { bytes = Number((await rq.response())?.headers()['content-length'] || 0); } catch { /* ignore */ } }
    reqs.push({ url: rq.url(), type: rq.resourceType(), bytes, at });
  });
  page.on('requestfailed', (rq) => {
    inflight--; lastNet = Date.now(); if (ignorableUrl(rq.url())) return;
    const t = `requestfailed ${rq.url().replace(BASE, '/')} ${rq.failure()?.errorText || ''}`;
    // a local python http.server drops connections under parallel load: a dev-server flake, not a game failure
    (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(rq.url()) && /CONNECTION_RESET|SOCKET_NOT_CONNECTED|EMPTY_RESPONSE/.test(t) ? warn : fail)(t);
  });
  page.on('response', (r) => { if (r.status() >= 400 && !ignorableUrl(r.url())) fail(`http ${r.status()} ${r.url().replace(BASE, '/')}`); });
  page.on('pageerror', (e) => fail(`pageerror: ${String(e?.message || e).slice(0, 200)}`));
  const consoleWarn = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/.test(t)) fail(`console.error: ${t.slice(0, 200)}`);
    else if (m.type() === 'warning' && consoleWarn.length < 8) consoleWarn.push(t.slice(0, 160));
  });

  if (p.net) {
    if (p.engine !== 'chromium') { warn('network throttling is Chromium-only; ignored'); }
    else {
      const cdp = await context.newCDPSession(page); const n = NET[p.net];
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: n.latencyMs, downloadThroughput: (n.downKbps * 1000) / 8, uploadThroughput: (n.upKbps * 1000) / 8 });
    }
  }
  if (p.gate) {
    // unsupported-browser gate: errors are expected; the page must show a readable message instead of a blank screen
    if (p.gate === 'importmap') await page.route((u) => u.href.split(/[?#]/)[0] === new URL(BASE).href, async (r) => { const rs = await r.fetch(); r.fulfill({ response: rs, body: (await rs.text()).replace(/<script type="importmap">[\s\S]*?<\/script>/, '') }); });
    if (p.gate === 'webgl2') await context.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return t === 'webgl2' ? null : g.call(this, t, ...a); }; });
    try {
      t0 = Date.now(); await page.goto(BASE, { waitUntil: 'load', timeout: STEP_TIMEOUT }); await sleep(5000);
      res.checks.gateMessage = await page.evaluate(() => document.body.innerText.trim().slice(0, 160));
      await shot(page, '01-gate');
    } catch (e) { res.checks.gateError = e.message.split('\n')[0]; }
    const errs = res.fails.slice(); res.fails = []; res.status = 'PASS'; res.checks.expectedErrors = errs;
    if (!res.checks.gateMessage || res.checks.gateMessage.length < 10) fail(`no unsupported-browser message (blank page); errors: ${errs.join(' | ').slice(0, 200)}`);
    res.timings = {}; res.net = { requests: reqs.length, mb: +(reqs.reduce((s, r) => s + r.bytes, 0) / 1048576).toFixed(2) };
    await context.close().catch(() => {}); await browser.close().catch(() => {});
    return res;
  }
  const touch = !!p.ctx.hasTouch;
  const press = async (sel) => { const l = page.locator(sel).first(); if (touch) await l.tap(); else await l.click(); };
  const bigTimeout = p.net ? Math.max(STEP_TIMEOUT, 300000) : STEP_TIMEOUT;

  try {
    // ---------------- load → title
    t0 = Date.now();
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: bigTimeout });
    res.timings.dcl = Date.now() - t0;
    await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: bigTimeout, polling: 100 });
    res.timings.ready = Date.now() - t0;
    await page.locator('#startBtn').waitFor({ state: 'visible', timeout: bigTimeout });
    res.timings.menu = Date.now() - t0;
    res.bytesAtMenu = reqs.reduce((s, r) => s + r.bytes, 0);
    res.env = await page.evaluate(probeEnv);
    // GDD §5.1: a phone held in portrait gets a full-screen "Telefonu yan çevir" prompt that blocks the menu by design.
    // Record it, then turn the phone to landscape (as a player would) and run the rest of the flow there.
    { const v = page.viewportSize();
      if (touch && v.height > v.width && Math.min(v.width, v.height) < 600) {
        res.checks.rotatePrompt = await page.evaluate(() => { const r = document.querySelector('#rotate'); return !!r && !r.hidden && r.getBoundingClientRect().height > innerHeight * 0.5; });
        if (!res.checks.rotatePrompt) warn('portrait phone: no "Telefonu yan çevir" rotate prompt (GDD §5.1)');
        await page.setViewportSize({ width: v.height, height: v.width }); await sleep(700);
        await page.locator('#startBtn').waitFor({ state: 'visible', timeout: bigTimeout });
      } }
    if (!res.env.glVersion) fail('no WebGL context');
    if (p.kind === 'mobile') {
      const miss = [!res.env.manifest && 'link[rel=manifest]', !res.env.themeColor && 'meta[name=theme-color]', !res.env.appleTouchIcon && 'link[rel=apple-touch-icon]'].filter(Boolean);
      if (miss.length) warn(`PWA/install tags missing: ${miss.join(', ')}`);
    }
    // the start button must be reachable without scrolling (a landscape phone is only ~390 px tall)
    res.checks.startBtnInView = await page.evaluate(() => {
      const b = document.querySelector('#startBtn').getBoundingClientRect();
      const inView = b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth;
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { inView, onTop: !!hit && (hit.id === 'startBtn' || !!hit.closest?.('#startBtn')), rect: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] };
    });
    await shot(page, '01-title');
    if (!res.checks.startBtnInView.inView) {
      warn(`#startBtn outside the first screen (rect ${res.checks.startBtnInView.rect}) — the card must be scrolled`);
      // Can a finger actually scroll the card? (Playwright's tap() scrolls programmatically, a player cannot.)
      // Chromium only: CDP synthesizes a real touch scroll gesture that honours touch-action.
      if (p.engine === 'chromium' && touch) {
        const scrollPos = () => page.evaluate(() => { const c = document.querySelector('#startScreen .card'), o = document.querySelector('#startScreen'); return c.scrollTop + o.scrollTop; });
        const cdp = await context.newCDPSession(page); const vp = page.viewportSize();
        const before = await scrollPos();
        await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(vp.width / 2), y: Math.round(vp.height * 0.7), yDistance: -260, gestureSourceType: 'touch', speed: 900 });
        await sleep(500);
        const after = await scrollPos();
        res.checks.touchScroll = { before, after, scrolled: after > before };
        await page.evaluate(() => { document.querySelector('#startScreen .card').scrollTop = 0; document.querySelector('#startScreen').scrollTop = 0; });
        if (!res.checks.touchScroll.scrolled) fail('start card overflows the screen and a touch swipe cannot scroll it (body { touch-action: none }) — a player cannot reach "Başla!"');
      }
    }

    // ---------------- title → select (real tap/click)
    res.checks.audioBefore = await page.evaluate(() => (window.__game.audio.audio || window.__game.audio.default || window.__game.audio).context?.state ?? 'none');
    await press('#startBtn');
    await page.waitForFunction(() => window.__game.state === 'select', null, { timeout: 15000 });
    res.checks.fullscreenAfterTap = await page.evaluate(() => !!(document.fullscreenElement || document.webkitFullscreenElement));
    res.checks.audioAfterTap = await page.evaluate(() => (window.__game.audio.audio || window.__game.audio.default || window.__game.audio).context?.state ?? 'none');
    await shot(page, '02-select');

    // ---------------- select → play (tap island 1, or --level)
    const card = argv.level ? `li.level-card[data-id="${argv.level}"]` : 'li.level-card[data-locked="0"]';
    res.checks.firstCardInView = await page.evaluate((sel) => { const b = document.querySelector(sel)?.getBoundingClientRect(); return !!b && b.top >= 0 && b.bottom <= innerHeight; }, card);
    const tSel = Date.now();
    await press(card);
    // The Harita selects a badge on the first tap and shows #levelDetail; "Başla!" (#playBtn) or a second tap starts it.
    await page.waitForFunction(() => { const b = document.querySelector('#playBtn'); return window.__game.state === 'play' || (b && b.offsetParent !== null); }, null, { timeout: 15000 });
    if (await page.evaluate(() => window.__game.state !== 'play')) await press('#playBtn');
    await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 30000 });
    res.timings.play = Date.now() - t0; res.timings.selectToPlay = Date.now() - tSel;
    res.level = await page.evaluate(() => window.__game.level?.id);
    res.checks.audioInPlay = await page.evaluate(() => (window.__game.audio.audio || window.__game.audio.default || window.__game.audio).context?.state ?? 'none');
    if (p.net) { await sleep(1500); await shot(page, "03a-play-early"); res.bytesAtPlayShot = reqs.reduce((s, r) => s + r.bytes, 0); }
    if (res.checks.audioInPlay !== 'running') warn(`AudioContext '${res.checks.audioInPlay}' after two taps`);

    // ---------------- island assets: async props + HDRI
    const ready = await page.evaluate((ms) => Promise.race([window.__game.test.ready().then(() => 'ok'), new Promise((r) => setTimeout(() => r('timeout'), ms))]), bigTimeout);
    res.timings.worldReady = Date.now() - t0; if (ready !== 'ok') warn('world.whenReady() timed out');
    try { await page.waitForFunction(() => !!window.__game.core.scene.background?.isDataTexture, null, { timeout: bigTimeout, polling: 250 }); res.timings.hdri = Date.now() - t0; }
    catch { warn('HDRI sky never replaced the gradient fallback'); }
    if (p.net) { // wait for the network to go quiet (textures stream after the level is "ready")
      const tq = Date.now();
      while (Date.now() - tq < bigTimeout && !(inflight <= 0 && Date.now() - lastNet > 4000)) await sleep(250);
      res.timings.netIdle = lastNet - t0;
    } else await sleep(1500);
    await shot(page, '03-play');

    // ---------------- frame loop
    res.frames = await page.evaluate(sampleFrames, 2500);
    if (res.frames.frames < 3 || res.frames.simAdvance <= 0) fail(`frame loop stalled (${res.frames.frames} rAF, sim +${res.frames.simAdvance}s)`);
    if (res.frames.state !== 'play') fail(`state '${res.frames.state}' during play sampling`);

    if (!p.net) {
      // ---------------- input
      const pos = () => page.evaluate(() => window.__game.player.pos.toArray());
      const dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
      // hold an input until the game's own clock advanced `simSec` (slow software-GL frames clamp dt to 0.1 s)
      const holdSim = async (simSec, sample) => {
        const t0s = await page.evaluate(() => window.__game.core.time.now); const tw = Date.now(); const out = [];
        for (;;) { await sleep(50); if (sample) out.push(await sample()); const t = await page.evaluate(() => window.__game.core.time.now); if (t - t0s >= simSec || Date.now() - tw > 20000) break; }
        return out;
      };
      if (p.kind === 'desktop') {
        let a = await pos(); await page.keyboard.down('KeyW'); await holdSim(0.9); await page.keyboard.up('KeyW'); let b = await pos();
        res.checks.keyboardMove = +dist(a, b).toFixed(2); if (res.checks.keyboardMove < 0.3) fail(`keyboard W did not move the player (${res.checks.keyboardMove} m)`);
        const y0 = (await pos())[1]; await page.keyboard.down('Space');
        const ys = await holdSim(0.5, async () => (await pos())[1]); await page.keyboard.up('Space');
        res.checks.jumpRise = +(Math.max(...ys) - y0).toFixed(2); if (res.checks.jumpRise < 0.2) fail(`Space did not jump (${res.checks.jumpRise} m)`);
        await holdSim(1.0);
        a = await pos();
        await page.evaluate(() => { window.__fakePad = { id: 'mobile-check pad', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes: [0, -1, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) }; });
        await holdSim(0.9); await page.evaluate(() => { window.__fakePad = null; }); b = await pos();
        res.checks.gamepadMove = +dist(a, b).toFixed(2); if (res.checks.gamepadMove < 0.3) fail(`gamepad stick did not move the player (${res.checks.gamepadMove} m)`);
        res.checks.pointerLockApi = res.env.pointerLock;
      } else {
        // on-screen controls are built elsewhere; probe for them and try a synthetic left-thumb drag (Pointer Events)
        res.checks.touchUI = await page.evaluate(() => !!document.querySelector('#touch, #touchUI, #touch-ui, .touch-ui, .touch-controls, #stick, .joystick, [data-touch-control], [data-touch]'));
        const a = await pos();
        await page.evaluate(async () => {
          const x0 = innerWidth * 0.18, y0 = innerHeight * 0.75; const el = document.elementFromPoint(x0, y0) || document.body;
          const ev = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1, pressure: type === 'pointerup' ? 0 : 0.5 }));
          ev('pointerdown', x0, y0);
          for (let i = 1; i <= 6; i++) { ev('pointermove', x0, y0 - i * 10); await new Promise((r) => setTimeout(r, 30)); }
          await new Promise((r) => setTimeout(r, 900));
          ev('pointerup', x0, y0 - 60);
        });
        const b = await pos();
        res.checks.touchMove = +dist(a, b).toFixed(2);
        const msg = `on-screen touch controls: ${res.checks.touchUI ? 'present' : 'absent'}, synthetic left-thumb drag moved ${res.checks.touchMove} m`;
        if (!res.checks.touchUI || res.checks.touchMove < 0.3) (argv['require-touch'] ? fail : warn)(msg + ' — a touch-only player cannot move');
        // GDD §5.1: phones in portrait get a full-screen "Telefonu yan çevir" prompt (game paused)
        const vp0 = page.viewportSize();
        if (vp0.height > vp0.width && Math.min(vp0.width, vp0.height) < 600) {
          res.checks.rotatePrompt = await page.evaluate(() => /yan çevir|döndür/i.test(document.body.innerText) && [...document.querySelectorAll("body *")].some((e) => /yan çevir/i.test(e.textContent) && e.getBoundingClientRect().height > innerHeight * 0.3));
          if (!res.checks.rotatePrompt) warn("portrait phone: no \"Telefonu yan çevir\" rotate prompt (GDD §5.1)");
        }
      }

      // ---------------- resize / rotation
      const vp = page.viewportSize();
      const rot = p.kind === 'mobile' ? { width: vp.height, height: vp.width } : { width: 1024, height: 640 };
      await page.evaluate(() => (document.fullscreenElement ? document.exitFullscreen().catch(() => {}) : null)); await sleep(300);   // CDP cannot resize a fullscreen window
      await page.setViewportSize(rot); await sleep(700);
      res.checks.resize = await page.evaluate(() => {
        const c = window.__game.core, r = c.renderer, gl = r.getContext();
        const pr = r.getPixelRatio();
        return { inner: [innerWidth, innerHeight], canvas: [r.domElement.clientWidth, r.domElement.clientHeight], buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], aspectOk: Math.abs(c.camera.aspect - innerWidth / innerHeight) < 0.01, bufferOk: Math.abs(gl.drawingBufferWidth - Math.floor(innerWidth * pr)) <= 2 && Math.abs(gl.drawingBufferHeight - Math.floor(innerHeight * pr)) <= 2 };
      });
      if (!res.checks.resize.aspectOk || !res.checks.resize.bufferOk) fail(`resize to ${rot.width}x${rot.height} not applied: ${JSON.stringify(res.checks.resize)}`);
      await shot(page, '04-rotated');
      await page.setViewportSize(vp); await sleep(400);

      // ---------------- background tab → pause (+ audio suspended)
      res.checks.visibility = await page.evaluate(async () => {
        const g = window.__game;
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 300));
        const out = { stateHidden: g.state, audioHidden: (g.audio.audio || g.audio.default || g.audio).context?.state ?? 'none' };
        delete document.hidden; delete document.visibilityState;
        document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 200));
        out.stateVisible = g.state;
        g.setPaused(false);
        return out;
      });
      if (res.checks.visibility.stateHidden !== 'paused') fail(`hidden tab did not pause (state '${res.checks.visibility.stateHidden}')`);

      // ---------------- WebGL context loss → restore
      res.checks.contextLoss = await page.evaluate(async () => {
        const g = window.__game, c = g.core, gl = c.renderer.getContext(); const ext = gl.getExtension('WEBGL_lose_context');
        if (!ext) return { supported: false };
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        let lostEvt = false, restoredEvt = false;
        c.renderer.domElement.addEventListener('webglcontextlost', () => { lostEvt = true; }, { once: true });
        c.renderer.domElement.addEventListener('webglcontextrestored', () => { restoredEvt = true; }, { once: true });
        ext.loseContext(); await wait(600);
        const whileLost = { lost: gl.isContextLost(), state: g.state };
        ext.restoreContext(); await wait(2500);
        const t1 = c.time.now; await wait(1200);
        return { supported: true, lostEvt, restoredEvt, whileLost, contextOk: !gl.isContextLost(), simAdvance: +(c.time.now - t1).toFixed(2), draws: c.stats().calls, state: g.state, uiNotice: !!document.querySelector('#contextLost, .context-lost, [data-context-lost]') };
      });
      if (res.checks.contextLoss.supported && (!res.checks.contextLoss.contextOk || !(res.checks.contextLoss.draws > 0))) warn(`WebGL context did not recover: ${JSON.stringify(res.checks.contextLoss)}`);
      await shot(page, '05-after-context-restore');
    }

    res.tex = await page.evaluate(probeTextures);
    res.report = await page.evaluate(() => window.__game.test.report());
    if (res.report?.errors?.length) fail(`world.report errors: ${res.report.errors.join('; ').slice(0, 200)}`);
  } catch (e) {
    fail(`flow: ${e.message.split('\n')[0]}`);
    await shot(page, '99-failure');
    try { res.stateAtFailure = await page.evaluate(() => window.__game?.state ?? 'no __game'); } catch { /* page gone */ }
  }

  // ---- network summary
  const byType = {}; const byExt = {};
  for (const r of reqs) {
    byType[r.type] = (byType[r.type] || 0) + r.bytes;
    const ext = (new URL(r.url).pathname.match(/\.([a-z0-9]+)$/i)?.[1] || 'other').toLowerCase(); byExt[ext] = (byExt[ext] || 0) + r.bytes;
  }
  const MB = (b) => +(b / 1048576).toFixed(2);
  res.net = {
    requests: reqs.length, mb: MB(reqs.reduce((s, r) => s + r.bytes, 0)), mbAtMenu: MB(res.bytesAtMenu || 0),
    byExt: Object.fromEntries(Object.entries(byExt).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, MB(v)])),
    largest: reqs.slice().sort((a, b) => b.bytes - a.bytes).slice(0, 8).map((r) => ({ file: decodeURIComponent(new URL(r.url).pathname.split('/').slice(-2).join('/')), mb: MB(r.bytes), at: r.at })),
  };
  res.consoleWarnings = consoleWarn;
  await context.close().catch(() => {}); await browser.close().catch(() => {});
  return res;
}

// ------------------------------------------------------------------ run + table
console.log(`mobile-check → ${BASE}  (${profiles.length} profiles, jobs=${JOBS})`);
const results = []; const queue = profiles.slice();
await Promise.all(Array.from({ length: JOBS }, async () => {
  while (queue.length) {
    const p = queue.shift(); const t = Date.now();
    process.stdout.write(`  … ${p.name}\n`);
    const r = await runProfile(p); r.wallSec = +((Date.now() - t) / 1000).toFixed(1); results.push(r);
    process.stdout.write(`  ${r.status.padEnd(4)} ${p.name} (${r.wallSec}s)${r.fails.length ? ' — ' + r.fails[0] : ''}\n`);
  }
}));
results.sort((a, b) => profiles.findIndex((p) => p.name === a.profile) - profiles.findIndex((p) => p.name === b.profile));

const s = (ms) => (ms == null ? '-' : (ms / 1000).toFixed(1));
const rows = [['profile', 'engine', 'result', 'GL', 'tier', 'dpr→px', 'menu s', 'play s', 'ready s', 'hdri s', 'fps', 'draws', 'MB/req', 'audio', 'touch', 'ctx-loss']];
for (const r of results) {
  const e = r.env || {}; const c = r.checks || {};
  rows.push([
    r.profile, r.engine, r.status, e.glVersion ? (e.webgl2 ? 'GL2' : 'GL1') : '-', e.tier || '-', e.dpr ? `${+e.dpr.toFixed(2)}→${e.pixelRatio}` : '-',
    s(r.timings.menu), s(r.timings.play), s(r.timings.worldReady), s(r.timings.hdri), r.frames?.fps ?? '-', r.frames?.draws ?? '-',
    r.net ? `${r.net.mb}/${r.net.requests}` : '-', c.audioInPlay || '-',
    r.kind === 'mobile' ? (c.touchUI ? `ui ${c.touchMove}m` : 'none') : (c.keyboardMove != null ? `kb ${c.keyboardMove}m` : '-'),
    c.contextLoss ? (c.contextLoss.supported ? (c.contextLoss.contextOk && c.contextLoss.draws > 0 ? 'ok' : 'BROKEN') : 'n/a') : '-',
  ]);
}
const w = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
console.log('\n' + rows.map((r, j) => r.map((c, i) => String(c).padEnd(w[i])).join(' | ') + (j === 0 ? '\n' + w.map((n) => '-'.repeat(n)).join('-|-') : '')).join('\n'));
for (const r of results) {
  if (!r.fails.length && !r.warns.length) continue;
  console.log(`\n[${r.status}] ${r.profile}`);
  for (const f of r.fails) console.log('   FAIL ' + f);
  for (const x of r.warns) console.log('   warn ' + x);
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ url: BASE, at: new Date().toISOString(), results }, null, 2));
console.log(`\nreport: ${path.relative(ROOT, path.join(OUT, 'report.json'))}  screenshots: ${path.relative(ROOT, OUT)}/`);
process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
