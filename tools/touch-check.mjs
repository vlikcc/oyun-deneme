#!/usr/bin/env node
// Touch-controls regression (GDD §5.1, docs/research/mobile-readiness.md §2) in headless Chrome with a phone viewport
// (844x390, isMobile, hasTouch) and real touch input through CDP Input.dispatchTouchEvent (Chrome turns it into pointer
// events, so pointer ids / setPointerCapture / pointercancel behave like on a device).
// Usage: node tools/touch-check.mjs [--url=http://localhost:8765/] [--level=kristal] [--quality=low] [--verbose]
// Exit 0 when every check passes. Screenshots: tools/out/touch-landscape.png, touch-solak.png, touch-portrait.png.
// The game only advances while driven: each step reads the real input pipeline (input.read() → touch.merge) and feeds
// it to window.__game.test.tick, exactly like the main loop does.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const BASE = argv.url || 'http://localhost:8765/';
const LEVEL = argv.level || 'kristal';
const QUALITY = ['high', 'medium', 'low'].includes(argv.quality) ? argv.quality : 'low';
const CHROME = argv.chrome || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.resolve('tools/out'); fs.mkdirSync(OUT, { recursive: true });
const PHONE = { width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const PORTRAIT = { ...PHONE, width: 390, height: 844 };

const results = []; const problems = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  if (!ok) problems.push(`${name}${detail ? ' — ' + detail : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail && (argv.verbose || !ok) ? '  ' + detail : ''}`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required', `--window-size=${PHONE.width},${PHONE.height}`],
  defaultViewport: PHONE,
});
async function open(url, view = PHONE) {
  for (let attempt = 1; attempt <= 3; attempt++) {     // python http.server can reset connections under parallel load
    const page = await browser.newPage();
    await page.setViewport(view);
    const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + (e?.message || e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console.error: ' + m.text()); });
    page.on('requestfailed', (r) => { if (!/favicon/.test(r.url())) errs.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`); });
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 90000 });
      await page.waitForFunction(() => window.__game && window.__game.ready === true, { timeout: 90000, polling: 100 });
      return { page, errs };
    } catch (e) {
      console.log(`  (load attempt ${attempt} failed: ${String(e.message || e).slice(0, 80)}; ${errs.slice(0, 2).join(' | ')})`);
      await page.close();
    }
  }
  throw new Error('page did not load: ' + url);
}

const url = new URL(BASE); url.searchParams.set('test', '1'); url.searchParams.set('touch', '1'); url.searchParams.set('level', LEVEL); url.searchParams.set('quality', QUALITY);
let page, cdp, errs0 = [];
try {
  ({ page, errs: errs0 } = await open(url.toString()));
  cdp = await page.createCDPSession();
  await page.evaluate(async () => {
    const [input, touch] = await Promise.all([import('/src/engine/input.js'), import('/src/engine/touch.js')]);
    const g = window.__game;
    window.__tc = {
      input, touch,
      /** steps the game n frames through the real input pipeline; returns per-frame samples */
      steps(n, dt = 1 / 60) {
        const out = [];
        for (let i = 0; i < n; i++) {
          const inp = g.state === 'play' ? input.read() : { ix: 0, iy: 0, look: 0, jump: false, jumpHeld: false, pound: false, yaw: g.cam.yaw };
          const r = g.test.tick(dt, inp);
          inp.jump = false; inp.pound = false;           // test.tick copies the input; the main loop's physics clears these
          out.push({ y: r.pos[1], vy: r.vel[1], x: r.pos[0], z: r.pos[2], grounded: r.grounded, pounding: !!g.player.pounding, yaw: g.cam.yaw });
        }
        return out;
      },
      rect(sel) { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, shown: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 }; },
    };
    await g.test.ready?.();
    g.core.renderer.setAnimationLoop(null);   // deterministic: only __tc.steps() advances the game (screenshots render by hand)
  });
  // touchmove is rAF-aligned in Chrome: a dispatched move is only delivered with the next frame (headless makes frames
  // only when one is requested). So after every dispatch pump two animation frames. The game's own loop is stopped above
  // (setAnimationLoop(null)), so those frames do not step the game — only steps() does.
  const T = async (type, touchPoints) => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))));
  };
  const steps = (n) => page.evaluate((k) => window.__tc.steps(k), n);
  const st = () => page.evaluate(() => ({ ...window.__tc.touch.state, state: window.__game.state, yaw: window.__game.cam.yaw, pos: window.__game.player.pos.toArray(), grounded: window.__game.player.grounded }));
  const rect = (sel) => page.evaluate((s) => window.__tc.rect(s), sel);
  const settle = async () => { await steps(90); };

  // ------------------------------------------------------------ layout
  await settle();
  const L = await page.evaluate(() => {
    const q = (s) => window.__tc.rect(s);
    const at = (r) => { const el = r && document.elementFromPoint(r.cx, r.cy); return el ? (el.closest('[data-btn]')?.dataset.btn || el.id || el.tagName) : null; };
    const A = q('#touch [data-btn="jump"]'), B = q('#touch [data-btn="pound"]'), P = q('#touch [data-btn="pause"]');
    const hud = ['#hud', '#timer', '#pauseBtn', ...[...document.querySelectorAll('#hud .pill')].map((_, i) => `#hud .pill:nth-child(${i + 1})`)].map((s) => ({ s, r: q(s) })).filter((h) => h.r?.shown);
    return {
      body: document.body.className, layer: getComputedStyle(document.querySelector('#touch')).display, touchAction: getComputedStyle(document.querySelector('#touch')).touchAction,
      css: !!document.querySelector('link#touchCss')?.sheet, A, B, P, atA: at(A), atB: at(B), hud,
      pauseBtn: q('#pauseBtn'), atPause: at(q('#pauseBtn')), vw: innerWidth, vh: innerHeight, hint: document.querySelector('#hint')?.classList.contains('hidden'),
    };
  });
  const inside = (r) => r && r.x >= 0 && r.y >= 0 && r.x + r.w <= L.vw && r.y + r.h <= L.vh;
  const overlap = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  check('touch.css loaded and body.touch set (?touch=1)', L.css && /\btouch\b/.test(L.body), L.body);
  check('#touch layer shown in play, touch-action none', L.layer === 'block' && L.touchAction === 'none', `${L.layer} ${L.touchAction}`);
  check('A/B inside the viewport', inside(L.A) && inside(L.B), JSON.stringify({ A: L.A, B: L.B }));
  check('A size clamp(56px,17vmin,96px) ≈ 66 px at 390 px tall; B = 0.72 A; both ≥ 44 px', Math.abs(L.A.w - 66.3) < 1.5 && Math.abs(L.B.w / L.A.w - 0.72) < 0.02 && L.B.w >= 44, `A ${L.A.w.toFixed(1)} B ${L.B.w.toFixed(1)}`);
  check('B sits up-left of A', L.B.cx < L.A.cx && L.B.cy < L.A.cy);
  check('elementFromPoint hits A and B at their centres', L.atA === 'jump' && L.atB === 'pound', `${L.atA} ${L.atB}`);
  check('A/B do not overlap any visible HUD element', L.hud.length > 0 && L.hud.every((h) => !overlap(h.r, L.A) && !overlap(h.r, L.B)), L.hud.map((h) => h.s).join(','));
  check('HUD #pauseBtn stays tappable above the layer; fallback pause pill hidden', (!L.pauseBtn?.shown || L.atPause === 'pauseBtn') && !(L.P?.shown && L.pauseBtn?.shown), `at=${L.atPause} pill=${L.P?.shown}`);

  // ------------------------------------------------------------ stick moves the player (forward = screen up)
  let s0 = await st();
  const sx = Math.round(L.vw * 0.2), sy = Math.round(L.vh * 0.62);
  await T('touchStart', [{ x: sx, y: sy, id: 1 }]);
  await T('touchMove', [{ x: sx, y: sy - 4, id: 1 }]);
  let s1 = await st();
  check('stick dead zone: 4 px of 62 px radius reads 0', s1.ix === 0 && s1.iy === 0, `ix ${s1.ix} iy ${s1.iy}`);
  await T('touchMove', [{ x: sx, y: sy - 90, id: 1 }]);
  s1 = await st();
  check('stick full up → iy ≈ 1 (dynamic origin follows past the ring)', s1.iy > 0.98 && Math.abs(s1.ix) < 0.02, `iy ${s1.iy.toFixed(3)}`);
  const ring = await rect('#stick');
  check('stick ring visible under the finger', ring.shown && (await page.evaluate(() => document.querySelector('#stick').classList.contains('show'))));
  const yaw0 = s0.yaw;
  const walk = await steps(45);
  const last = walk.at(-1), dx = last.x - s0.pos[0], dz = last.z - s0.pos[2], dist = Math.hypot(dx, dz);
  const fwd = dist > 0 ? (dx * -Math.sin(yaw0) + dz * -Math.cos(yaw0)) / dist : 0;
  check('stick moves the player away from the camera', dist > 2 && fwd > 0.7, `moved ${dist.toFixed(2)} m, forward dot ${fwd.toFixed(2)}`);
  await T('touchMove', [{ x: sx + 300, y: sy - 90, id: 1 }]);   // far right: the ring is dragged along, direction ≈ right
  s1 = await st();
  check('stick right → ix > 0.9', s1.ix > 0.9, `ix ${s1.ix.toFixed(2)} iy ${s1.iy.toFixed(2)}`);
  await T('touchEnd', []);
  s1 = await st();
  check('releasing the stick zeroes the axes and hides the ring', s1.ix === 0 && s1.iy === 0 && !(await page.evaluate(() => document.querySelector('#stick').classList.contains('show'))));
  await settle();

  // ------------------------------------------------------------ A: tap vs hold (jumpHeld), each pointerdown = jump
  const jumpApex = async (holdFrames) => {
    const base = (await st()).pos[1];
    await T('touchStart', [{ x: Math.round(L.A.cx), y: Math.round(L.A.cy), id: 3 }]);
    const s = await st();
    let samples = await steps(holdFrames);
    await T('touchEnd', []);
    samples = samples.concat(await steps(70 - holdFrames));
    return { pressed: s.jumpHeld, apex: Math.max(...samples.map((q) => q.y)) - base, landed: samples.at(-1).grounded };
  };
  const tap = await jumpApex(2);
  await settle();
  const hold = await jumpApex(40);
  check('A tap jumps', tap.pressed && tap.apex > 0.8, `apex ${tap.apex.toFixed(2)} m`);
  check('A hold jumps higher (jumpHeld while the finger is down)', hold.apex > tap.apex + 0.3, `tap ${tap.apex.toFixed(2)} m, hold ${hold.apex.toFixed(2)} m`);
  check('A released → jumpHeld false', !(await st()).jumpHeld);
  await settle();

  // ------------------------------------------------------------ B: pound in the air, second finger while A is held
  await T('touchStart', [{ x: Math.round(L.A.cx), y: Math.round(L.A.cy), id: 3 }]);
  await steps(14);
  await T('touchStart', [{ x: Math.round(L.A.cx), y: Math.round(L.A.cy), id: 3 }, { x: Math.round(L.B.cx), y: Math.round(L.B.cy), id: 4 }]);
  const bDown = await page.evaluate(() => ({ a: document.querySelector('[data-btn="jump"]').classList.contains('down'), b: document.querySelector('[data-btn="pound"]').classList.contains('down') }));
  const pound = await steps(3);
  check('B (second finger while A held) → ground pound in the air', pound.some((q) => q.pounding) && bDown.a && bDown.b, JSON.stringify(bDown));
  await T('touchEnd', []);
  await settle();

  // ------------------------------------------------------------ multi-touch: stick + right-half orbit at once
  s0 = await st();
  const rx = Math.round(L.vw * 0.62), ry = Math.round(L.vh * 0.45);
  await T('touchStart', [{ x: sx, y: sy, id: 5 }]);
  await T('touchMove', [{ x: sx, y: sy - 60, id: 5 }]);
  await T('touchStart', [{ x: sx, y: sy - 60, id: 5 }, { x: rx, y: ry, id: 6 }]);
  await T('touchMove', [{ x: sx, y: sy - 60, id: 5 }, { x: rx - 120, y: ry + 20, id: 6 }]);
  s1 = await st();
  const sens = await page.evaluate(() => window.__game.cam.sens ?? 1);
  const expectYaw = 120 * (Math.PI * 1.1 / L.vw) * sens;
  check('right-half drag orbits (yaw += dx·π·1.1/innerWidth) while the stick keeps its finger', Math.abs((s1.yaw - s0.yaw) - expectYaw) < 0.02 && s1.iy > 0.5, `Δyaw ${(s1.yaw - s0.yaw).toFixed(3)} expected ${expectYaw.toFixed(3)}, iy ${s1.iy.toFixed(2)}`);
  await T('touchCancel', []);
  s1 = await st();
  check('pointercancel releases every role', s1.ix === 0 && s1.iy === 0 && !s1.jumpHeld && !(await page.evaluate(() => document.querySelector('#stick').classList.contains('show'))));

  // ------------------------------------------------------------ blur / visibilitychange release a held button
  await T('touchStart', [{ x: Math.round(L.A.cx), y: Math.round(L.A.cy), id: 7 }]);
  const heldBefore = (await st()).jumpHeld;
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  check('window blur releases a held A (no stuck jumpHeld)', heldBefore && !(await st()).jumpHeld);
  await T('touchEnd', []);
  await T('touchStart', [{ x: sx, y: sy, id: 8 }]); await T('touchMove', [{ x: sx + 80, y: sy, id: 8 }]);
  const vis = await page.evaluate(() => {
    const tc = window.__tc, before = tc.touch.state.ix;
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    delete document.hidden;
    const r = { before, after: tc.touch.state.ix, state: window.__game.state };
    window.__game.setPaused(false);
    return r;
  });
  check('visibilitychange (hidden) releases the stick and pauses', vis.before > 0.5 && vis.after === 0 && vis.state === 'paused', JSON.stringify(vis));
  await T('touchEnd', []);
  await steps(5);

  // ------------------------------------------------------------ edges are not merged while paused / disabled
  await page.evaluate(() => { window.__tc.touch.state.jump = true; window.__game.setPaused(true); window.__game.setPaused(false); });
  check('input.clearEdges (resume) drops a queued touch jump', !(await st()).jump);

  // ------------------------------------------------------------ HUD pause button tapped by touch
  if (L.pauseBtn?.shown) {
    await T('touchStart', [{ x: Math.round(L.pauseBtn.cx), y: Math.round(L.pauseBtn.cy), id: 9 }]);
    await T('touchEnd', []);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
    const ps = await page.evaluate(() => ({ state: window.__game.state, layer: getComputedStyle(document.querySelector('#touch')).display }));
    check('tapping the HUD pause button pauses; the layer hides while paused', ps.state === 'paused' && ps.layer === 'none', JSON.stringify(ps));
    await page.evaluate(() => window.__game.setPaused(false));
  }

  // ------------------------------------------------------------ vista: cam.override hides the layer (main.js → setVisible)
  await page.evaluate(() => window.__game.cameraApi.setOverride({ yaw: 1, pitch: 0.5, dist: 12, t: 0.15, hold: 0.15 }));
  await steps(2);
  const ovOn = await page.evaluate(() => ({ hidden: document.querySelector('#touch').hidden, disp: getComputedStyle(document.querySelector('#touch')).display }));
  await steps(40);
  const ovOff = await page.evaluate(() => ({ hidden: document.querySelector('#touch').hidden, disp: getComputedStyle(document.querySelector('#touch')).display }));
  check('cam.override hides the touch layer, and it comes back after', ovOn.hidden && ovOn.disp === 'none' && !ovOff.hidden && ovOff.disp === 'block', JSON.stringify({ ovOn, ovOff }));
  await settle();

  // ------------------------------------------------------------ screenshot: stick held + A pressed
  await T('touchStart', [{ x: sx, y: sy, id: 10 }]);
  await T('touchMove', [{ x: sx + 30, y: sy - 40, id: 10 }]);
  await T('touchStart', [{ x: sx + 30, y: sy - 40, id: 10 }, { x: Math.round(L.A.cx), y: Math.round(L.A.cy), id: 11 }]);
  await steps(6);
  await page.evaluate(() => window.__game.core.render());
  await page.screenshot({ path: path.join(OUT, 'touch-landscape.png') });
  await T('touchEnd', []);
  await settle();

  // ------------------------------------------------------------ Basit mod: tap right half = jump, drag = orbit
  await page.evaluate(() => window.__game.save.setSetting('simpleTouch', true));
  await steps(1);
  s0 = await st();
  await T('touchStart', [{ x: rx, y: ry, id: 12 }]);
  await T('touchMove', [{ x: rx + 5, y: ry + 3, id: 12 }]);   // inside the 12 px slop: still a tap
  const yawTap = (await st()).yaw;
  await T('touchEnd', []);
  let sm = await steps(30);
  check('Basit: tap on the right half jumps (no orbit inside the 12 px slop)', Math.max(...sm.map((q) => q.y)) - s0.pos[1] > 0.8 && Math.abs(yawTap - s0.yaw) < 1e-6, `apex ${(Math.max(...sm.map((q) => q.y)) - s0.pos[1]).toFixed(2)}`);
  await settle();
  s0 = await st();
  await T('touchStart', [{ x: rx, y: ry, id: 13 }]);
  for (let k = 1; k <= 6; k++) await T('touchMove', [{ x: rx - k * 20, y: ry, id: 13 }]);
  await T('touchEnd', []);
  sm = await steps(20);
  s1 = await st();
  check('Basit: drag on the right half orbits and does not jump', s1.yaw - s0.yaw > 0.2 && Math.max(...sm.map((q) => q.y)) - s0.pos[1] < 0.2, `Δyaw ${(s1.yaw - s0.yaw).toFixed(2)}`);
  await page.evaluate(() => window.__game.save.setSetting('simpleTouch', false));
  await steps(1);

  // ------------------------------------------------------------ Solak: mirrored layout
  await page.evaluate(() => window.__game.save.setSetting('leftHanded', true));
  await steps(1);
  const LL = await page.evaluate(() => ({ body: document.body.className, A: window.__tc.rect('#touch [data-btn="jump"]'), B: window.__tc.rect('#touch [data-btn="pound"]'), hud: window.__tc.rect('#hud'), vw: innerWidth }));
  check('Solak: A/B mirrored to the bottom-left, B up-right of A, clear of the HUD', /touch-left/.test(LL.body) && LL.A.cx < LL.vw * 0.25 && LL.B.cx > LL.A.cx && LL.B.cy < LL.A.cy && !overlap(LL.hud, LL.A) && !overlap(LL.hud, LL.B), JSON.stringify({ A: [LL.A.cx, LL.A.cy], B: [LL.B.cx, LL.B.cy] }));
  await T('touchStart', [{ x: Math.round(L.vw * 0.8), y: sy, id: 14 }]);
  await T('touchMove', [{ x: Math.round(L.vw * 0.8), y: sy - 80, id: 14 }]);
  s1 = await st();
  check('Solak: the stick lives on the right half', s1.iy > 0.9, `iy ${s1.iy.toFixed(2)}`);
  await steps(4);
  await page.evaluate(() => window.__game.core.render());
  await page.screenshot({ path: path.join(OUT, 'touch-solak.png') });
  await T('touchEnd', []);
  s0 = await st();
  await T('touchStart', [{ x: Math.round(L.vw * 0.4), y: Math.round(L.vh * 0.4), id: 15 }]);
  await T('touchMove', [{ x: Math.round(L.vw * 0.4) + 100, y: Math.round(L.vh * 0.4), id: 15 }]);
  s1 = await st();
  await T('touchEnd', []);
  check('Solak: the left half orbits', s1.yaw < s0.yaw - 0.1 && s1.ix === 0, `Δyaw ${(s1.yaw - s0.yaw).toFixed(2)}`);
  await page.evaluate(() => window.__game.save.setSetting('leftHanded', false));
  await steps(1);

  // ------------------------------------------------------------ portrait prompt pauses the game
  await page.setViewport(PORTRAIT);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
  const P1 = await page.evaluate(() => ({ rot: window.__tc.rect('#rotate'), text: document.querySelector('#rotate')?.textContent || '', state: window.__game.state, z: getComputedStyle(document.querySelector('#rotate')).zIndex }));
  check('portrait: "Telefonu yan çevir 📱↻" covers the screen and pauses the game', P1.rot?.shown && P1.rot.w >= 389 && P1.rot.h >= 843 && P1.text.includes('Telefonu yan çevir 📱↻') && P1.state === 'paused', JSON.stringify({ state: P1.state, w: P1.rot?.w, h: P1.rot?.h }));
  await page.screenshot({ path: path.join(OUT, 'touch-portrait.png') });
  await page.setViewport(PHONE);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
  const P2 = await page.evaluate(() => ({ rot: window.__tc.rect('#rotate'), state: window.__game.state }));
  check('landscape again: prompt gone, game stays paused until Devam', !P2.rot?.shown && P2.state === 'paused', JSON.stringify({ state: P2.state }));
  await page.evaluate(() => window.__game.setPaused(false));

  // ------------------------------------------------------------ safe-area insets (when this Chrome can emulate them)
  try {
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 47, bottom: 21, right: 47 } });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
    const SA = await page.evaluate(() => ({ A: window.__tc.rect('#touch [data-btn="jump"]'), vw: innerWidth, vh: innerHeight }));
    check('safe-area insets push A in from the right/bottom edge', SA.vw - (SA.A.x + SA.A.w) >= 47 && SA.vh - (SA.A.y + SA.A.h) >= 21, `right gap ${(SA.vw - SA.A.x - SA.A.w).toFixed(1)}, bottom gap ${(SA.vh - SA.A.y - SA.A.h).toFixed(1)}`);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: {} });
  } catch (e) { console.log(`skip safe-area emulation (${String(e.message || e).slice(0, 60)})`); }

  check('no page errors / console errors / failed requests during the touch run', errs0.length === 0, errs0.join(' | '));
  await page.close();

  // ------------------------------------------------------------ desktop (fine pointer, no ?touch=1): no touch layer
  const durl = new URL(BASE); durl.searchParams.set('test', '1'); durl.searchParams.set('level', LEVEL); durl.searchParams.set('quality', 'low');
  const { page: dp } = await open(durl.toString(), { width: 1280, height: 800, deviceScaleFactor: 1 });
  const D = await dp.evaluate(() => ({ layer: !!document.querySelector('#touch'), body: document.body.className }));
  check('desktop (pointer: fine, no ?touch=1): no touch layer', !D.layer && !/\btouch\b/.test(D.body), JSON.stringify(D));
  await dp.close();
} catch (e) {
  problems.push('exception: ' + (e?.stack || e));
  console.log('EXCEPTION', e?.stack || e);
}
await browser.close();
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed${problems.length ? '\n' + problems.map((p) => '  - ' + p).join('\n') : ''}`);
console.log(`screenshots: ${['touch-landscape.png', 'touch-solak.png', 'touch-portrait.png'].map((f) => path.join(OUT, f)).join(', ')}`);
process.exit(problems.length ? 1 : 0);
