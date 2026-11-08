#!/usr/bin/env node
// UI flow check (headless Chrome, same launch args as smoke.mjs):
//   /?test=1 → click start → select 'kristal' via DOM → state 'play' → __game.test.collectAll() → teleport onto the portal
//   → state 'win' within 3 s → click 'Adalar' → select screen visible → pause/resume round trip
//   → dispose check: __game.loadLevel(level) three times; scene.children and renderer.info.memory.geometries must not grow.
// Usage: node tools/flow-check.mjs [--url=http://localhost:8765/] [--level=kristal]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const BASE = argv.url || 'http://localhost:8765/';
const LEVEL = argv.level || 'kristal';
const CHROME = argv.chrome || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.resolve('tools/out'); fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const problems = [], steps = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + (e?.message || e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push('console.error: ' + m.text()); });
page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) problems.push('http' + r.status() + ': ' + r.url()); });
page.on('requestfailed', (r) => { if (!/favicon/.test(r.url())) problems.push('requestfailed: ' + r.url() + ' ' + r.failure()?.errorText); });
const step = (name, ok, extra = '') => { steps.push({ name, ok, extra }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) problems.push('step failed: ' + name + ' ' + extra); };
const waitFor = (fn, ms, arg) => page.waitForFunction(fn, { timeout: ms, polling: 50 }, arg).then(() => true, () => false);
const visible = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none'; }, sel);

try {
  await page.goto(BASE + '?test=1', { waitUntil: 'load', timeout: 60000 });
  step('page loaded + __game.ready', await waitFor(() => window.__game && window.__game.ready === true, 60000));
  step("initial state is 'menu'", (await page.evaluate(() => window.__game.state)) === 'menu');

  await page.evaluate(() => document.querySelector('#startBtn').click());
  step("start → state 'select' + select screen visible", (await page.evaluate(() => window.__game.state)) === 'select' && (await visible('#selectScreen')));
  const cards = await page.evaluate(() => [...document.querySelectorAll('#levelList li.level-card')].map((li) => ({ id: li.dataset.id, locked: li.dataset.locked })));
  step('level cards rendered', cards.length > 0, JSON.stringify(cards));

  await page.evaluate((id) => document.querySelector(`#levelList li.level-card[data-id="${id}"]`).click(), LEVEL);
  step(`select '${LEVEL}' → state 'play'`, await waitFor(() => window.__game.state === 'play', 5000));
  step('overlays hidden while playing', !(await visible('#selectScreen')) && !(await visible('#startScreen')));
  step('HUD visible', await visible('#hud'));

  // a few ticks of play so the level settles, then collect everything & walk through the portal
  await page.evaluate(() => { for (let i = 0; i < 30; i++) window.__game.test.tick(1 / 60, { iy: 0.5 }); });
  await page.evaluate(() => window.__game.test.collectAll());
  const portalOpen = await page.evaluate(() => window.__game.world.portal.open && window.__game.test.report().crystalsLeft === 0);
  step('collectAll() opens the portal', portalOpen);
  await page.evaluate(() => { const p = window.__game.test.portalPos(); window.__game.test.teleport(p[0], p[1] - 0.7, p[2]); });
  // Headless Chrome only produces animation frames while a script pumps them, so wait for 'win' from inside the page,
  // yielding to requestAnimationFrame (the real main loop) between checks.
  const t0 = Date.now();
  const won = await page.evaluate(() => new Promise((resolve) => {
    const start = performance.now();
    const check = () => { if (window.__game.state === 'win') return resolve(true); if (performance.now() - start > 3000) return resolve(false); requestAnimationFrame(check); };
    requestAnimationFrame(check);
  }));
  step("teleport onto portal → state 'win' within 3 s", won, `${Date.now() - t0} ms`);
  step('win screen visible', await visible('#winScreen'));
  const stats = await page.evaluate(() => ({ stats: document.querySelector('#winStats')?.textContent, stars: document.querySelector('#winStars')?.textContent }));
  step('win stats rendered', !!stats.stats && /Süre/.test(stats.stats), JSON.stringify(stats));
  const saved = await page.evaluate((id) => window.__game.save.level(id), LEVEL);
  step('save.levelResult stored', saved.done === true && saved.stars >= 1, JSON.stringify(saved));
  await page.screenshot({ path: path.join(OUT, 'flow-win.png') });

  await page.evaluate(() => document.querySelector('#levelsBtn').click());
  step("'Adalar' → state 'select' + select screen visible", (await page.evaluate(() => window.__game.state)) === 'select' && (await visible('#selectScreen')) && !(await visible('#winScreen')));
  await page.screenshot({ path: path.join(OUT, 'flow-select.png') });

  // pause / resume round-trip
  await page.evaluate((id) => document.querySelector(`#levelList li.level-card[data-id="${id}"]`).click(), LEVEL);
  await page.keyboard.press('KeyP');
  step("P → state 'paused' + pause screen", (await page.evaluate(() => window.__game.state)) === 'paused' && (await visible('#pauseScreen')));
  await page.evaluate(() => document.querySelector('#resumeBtn').click());
  step("'Devam' → state 'play'", (await page.evaluate(() => window.__game.state)) === 'play' && !(await visible('#pauseScreen')));

  // dispose check: reload the same level repeatedly; everything a level creates through L must be removed + disposed
  const measure = () => page.evaluate(async (id) => {
    const g = window.__game;
    g.loadLevel(id);
    await g.test.ready();                                   // async props / tree batches attached
    for (let i = 0; i < 5; i++) g.test.tick(1 / 60, {});
    g.core.render();
    const m = g.core.renderer.info.memory;
    return { children: g.core.scene.children.length, geometries: m.geometries, textures: m.textures, colliders: g.colliders.length, coins: g.coins.length, enemies: g.enemies.length, report: g.test.report() };
  }, LEVEL);
  const m1 = await measure(), m2 = await measure(), m3 = await measure();
  const brief = (m) => `${m.children} children / ${m.geometries} geometries / ${m.textures} textures / ${m.colliders} colliders`;
  step('loadLevel ×3: scene.children count does not grow', m1.children === m2.children && m2.children === m3.children, [m1, m2, m3].map(brief).join(' → '));
  step('loadLevel ×3: renderer.info.memory.geometries does not grow', m2.geometries >= m3.geometries && m1.geometries >= m2.geometries);
  step('loadLevel ×3: colliders / coins / enemies rebuilt identically', m1.colliders === m3.colliders && m1.coins === m3.coins && m1.enemies === m3.enemies && m3.report.errors.length === 0, JSON.stringify(m3.report));
  step("state still 'play' after reloads", (await page.evaluate(() => window.__game.state)) === 'play');
} catch (e) {
  problems.push('exception: ' + (e?.message || e));
}
await browser.close();
console.log(`\n${steps.filter((s) => s.ok).length}/${steps.length} steps ok; ${problems.length} problem(s)`);
for (const p of problems) console.log(' - ' + p);
process.exit(problems.length ? 1 : 0);
