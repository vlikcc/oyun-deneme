#!/usr/bin/env node
// Headless smoke test for the game using the locally installed Google Chrome (software WebGL via SwiftShader).
// Usage:  node tools/smoke.mjs [--url=http://localhost:8765/] [--level=<id>] [--frames=240] [--quality=low|medium|high] [--touch] [--viewport=390x844] [--shot=tools/out/name.png] [--script=<js file>]
//         node tools/smoke.mjs --all            (every level listed by window.__game.levels, one after another)
// Exit code 0 = no page errors / console errors / failed requests and the game reached state 'play'.
// Extra checks run through window.__game (see docs/LEVEL-API.md → "Test hooks").
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const BASE = argv.url || 'http://localhost:8765/';
const FRAMES = Number(argv.frames || 240);
const CHROME = argv.chrome || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.resolve('tools/out'); fs.mkdirSync(OUT, { recursive: true });
const VP = /^(\d+)x(\d+)$/.exec(String(argv.viewport || ''));   // --viewport=390x844 → phone-sized window (default 1280x800)
const VIEW = VP ? { width: +VP[1], height: +VP[2], deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { width: 1280, height: 800, deviceScaleFactor: 1 };

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required', `--window-size=${VIEW.width},${VIEW.height}`],
  defaultViewport: VIEW,
});

async function runOne(levelId) {
  const page = await browser.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push({ kind: 'pageerror', text: String(e?.message || e) }));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push({ kind: 'console.error', text: m.text() }); });
  const warnings = [];
  const ignorable = (u) => /favicon\.ico$/.test(u);
  page.on('requestfailed', (r) => { if (ignorable(r.url())) return; const t = `${r.url()} ${r.failure()?.errorText}`; (/ERR_CONNECTION_RESET/.test(t) && /\.(mp3|jpg|hdr)$/.test(r.url()) ? warnings : problems).push({ kind: 'requestfailed', text: t }); });
  page.on('response', (r) => { if (r.status() >= 400 && !ignorable(r.url())) problems.push({ kind: 'http' + r.status(), text: r.url() }); });
  const url = new URL(BASE); url.searchParams.set('test', '1'); if (levelId) url.searchParams.set('level', levelId); if (argv.quality) url.searchParams.set('quality', argv.quality); if (argv.touch) url.searchParams.set('touch', '1');
  const t0 = Date.now();
  const result = { level: levelId || '(default)', url: url.toString() };
  try {
    await page.goto(url.toString(), { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.__game && (window.__game.ready === undefined || window.__game.ready === true), { timeout: 60000 });
    // start the game (works for the old single-level build and the new level system)
    await page.evaluate(async (lvl) => {
      const g = window.__game;
      if (g.test?.start) await g.test.start(lvl);
      else document.querySelector('#startBtn')?.click();
    }, levelId || null);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
    // simulate FRAMES frames of play with some input, via the test hook when available
    await page.evaluate(async (n) => {
      const g = window.__game;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < n; i++) {
        if (g.test?.tick) g.test.tick(1 / 60, { ix: Math.sin(i / 40), iy: 0.6, jump: i % 50 === 0 });
        else await new Promise((r) => requestAnimationFrame(r));
        if (i % 60 === 0) await wait(0);
      }
    }, FRAMES);
    result.state = await page.evaluate(() => {
      const g = window.__game, p = g.player;
      const nan = [p.pos.x, p.pos.y, p.pos.z, p.vel.x, p.vel.y, p.vel.z].some((v) => !Number.isFinite(v));
      return { state: g.state, pos: [p.pos.x, p.pos.y, p.pos.z].map((v) => +v.toFixed(2)), nan, coins: g.coins?.length, crystals: g.crystals?.length, enemies: g.enemies?.length, colliders: g.colliders?.length, extra: g.test?.report?.() ?? null };
    });
    if (result.state.nan) problems.push({ kind: 'nan', text: 'player position/velocity is NaN' });
    if (result.state.state !== 'play') problems.push({ kind: 'state', text: `expected state play, got ${result.state.state}` });
    // testPath check (docs/ARCHITECTURE.md §4): every waypoint must have ground under it; hops must respect §2 reach rules
    const tp = await page.evaluate(() => window.__game.level?.testPath || null);
    if (tp && tp.length) {
      const RULES = { walk: [99, 0.7], jump: [6.5, 2.5], triple: [9, 4.5] };
      const checks = await page.evaluate(async (path) => {
        const g = window.__game, out = [];
        for (let i = 0; i < path.length; i++) {
          const [x, y, z] = path[i].at;
          const gy = g.test.groundBelow(x, y + 0.3, z);
          out.push({ i, at: path[i].at, via: path[i].via || 'walk', gy });
        }
        return out;
      }, tp);
      for (const c of checks) {
        if (c.gy === null || c.gy === undefined || c.at[1] - c.gy > 0.8 || c.gy - c.at[1] > 0.3) problems.push({ kind: 'testpath', text: `waypoint ${c.i} ${JSON.stringify(c.at)} (${tp[c.i].note || ''}): ground at ${c.gy === null || c.gy === undefined ? 'none' : c.gy.toFixed(2)}` });
        if (c.i > 0) {
          const a = checks[c.i - 1].at, b = c.at, rule = RULES[c.via];
          if (rule) {
            const dx = Math.hypot(b[0] - a[0], b[2] - a[2]), rise = b[1] - a[1];
            if (dx > rule[0] || rise > rule[1]) problems.push({ kind: 'testpath', text: `hop ${c.i - 1}→${c.i} via ${c.via}: ${dx.toFixed(1)} m across, ${rise.toFixed(1)} m up exceeds ${rule[0]} m / ${rule[1]} m (${tp[c.i].note || ''})` });
          }
        }
      }
      result.testPath = { waypoints: tp.length, failed: problems.filter((p) => p.kind === 'testpath').length };
    } else result.testPath = null;
    if (argv.script) {
      const code = fs.readFileSync(path.resolve(argv.script), 'utf8');
      result.script = await page.evaluate(code);
    }
    const shot = argv.shot ? path.resolve(argv.shot) : path.join(OUT, `${levelId || 'default'}.png`);
    await page.screenshot({ path: shot });
    result.screenshot = shot;
  } catch (e) {
    problems.push({ kind: 'exception', text: String(e?.message || e) });
  }
  result.ms = Date.now() - t0;
  result.problems = problems; result.warnings = warnings;
  await page.close();
  return result;
}

let levels = [];
if (argv.all) {
  const page = await browser.newPage();
  await page.goto(BASE + '?test=1', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__game, { timeout: 60000 });
  levels = await page.evaluate(() => (window.__game.levels || []).map((l) => l.id));
  await page.close();
  if (!levels.length) levels = [null];
} else levels = [argv.level || null];

const results = [];
for (const id of levels) { const r = await runOne(id); results.push(r); console.log(JSON.stringify(r)); }
await browser.close();
const bad = results.filter((r) => r.problems.length);
console.log(`\n${results.length - bad.length}/${results.length} level(s) clean`);
process.exit(bad.length ? 1 : 0);
