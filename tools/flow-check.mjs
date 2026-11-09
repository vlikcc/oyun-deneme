#!/usr/bin/env node
// UI flow check (headless Chrome, same launch args as smoke.mjs):
//   /?test=1 → click start → Harita (GDD §4.2 DOM: roster order, badge parts, LAYOUT positions, "Yakında" cards, locked
//   toast) → tap 'kristal' badge → #levelDetail + "Başla!" #playBtn → state 'play' → __game.test.collectAll() → teleport
//   onto the portal → state 'win' within 3 s (win card: medal, coins, wallet, buttons) → 'Harita' → select screen →
//   Ayarlar (sliders/toggles persisted + applied live, two-tap reset arming) → Krediler → pause (Devam / Baştan / Harita,
//   Yardım Modu toggle) → dispose check: __game.loadLevel(level) three times; scene.children and
//   renderer.info.memory.geometries must not grow.
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
  // GDD §2.1 roster: ids and order are the spec; every not-built island is a "Yakında" card that cannot be started
  const ROSTER = ['kristal', 'kumsal', 'kar', 'volkan', 'orman', 'gok', 'fener', 'kanyon'];
  step('select lists the GDD §2.1 roster in order', JSON.stringify(cards.map((c) => c.id)) === JSON.stringify(ROSTER), cards.map((c) => c.id).join(','));
  const soon = await page.evaluate(() => [...document.querySelectorAll('#levelList li.level-card')].map((li) => ({ id: li.dataset.id, soon: li.dataset.soon === '1', yakinda: /Yakında/.test(li.textContent) })));
  const comingSoon = await page.evaluate(() => window.__game.allLevels.filter((l) => l.comingSoon).map((l) => l.id));
  step('comingSoon islands render as "Yakında" cards', soon.filter((c) => comingSoon.includes(c.id)).every((c) => c.soon && c.yakinda) && soon.filter((c) => !comingSoon.includes(c.id)).every((c) => !c.soon), JSON.stringify(soon.filter((c) => c.soon).map((c) => c.id)));
  await page.evaluate(() => document.querySelector('#levelList li.level-card[data-soon="1"]')?.click());
  step("clicking a 'Yakında' card keeps state 'select'", (await page.evaluate(() => window.__game.state)) === 'select');

  // GDD §4.2 badge structure + map layout
  const parts = await page.evaluate(() => [...document.querySelectorAll('#levelList li.level-card')].map((li) => ({
    id: li.dataset.id, parts: ['.lv-icon', '.lv-name', '.lv-stars', '.lv-best', '.lv-medal', '.lv-chips'].filter((s) => !li.querySelector(s)),
    svg: !!li.querySelector('.lv-icon svg'), x: li.style.getPropertyValue('--x'), lock: !!li.querySelector('.lv-lock') === (li.dataset.locked === '1') })));
  step('every badge has .lv-icon/.lv-name/.lv-stars/.lv-best/.lv-medal/.lv-chips + an SVG silhouette', parts.every((p) => !p.parts.length && p.svg), JSON.stringify(parts.filter((p) => p.parts.length || !p.svg)));
  step('badges are placed by the LAYOUT table and locked ones show a padlock', parts.every((p) => /%$/.test(p.x) && p.lock));
  step('dotted route drawn', await page.evaluate(() => document.querySelectorAll('#mapRoute path').length >= 2));
  step('first launch: "Buradan başla!" on the first island', await page.evaluate(() => /Buradan başla!/.test(document.querySelector('#levelList li.level-card')?.textContent || '')));
  // locked (built but not unlocked yet) island → toast "Önce <ada> adasını kurtar", no start
  const lockToast = await page.evaluate(() => {
    const g = window.__game;
    g.screens.renderSelect([{ id: 'kristal', name: "Pıtır'ın Kristal Adası", order: 1 }, { id: 'zz-locked', name: 'Kilitli Ada', order: 2, build() {} }]);
    document.querySelector('#levelList li.level-card[data-id="zz-locked"]').click();
    const t = document.querySelector('#toast').textContent, st = g.state;
    g.showSelect();
    return { t, st };
  });
  step('locked badge → toast "Önce Kristal adasını kurtar", stays on the map', /Önce Kristal adasını kurtar/.test(lockToast.t) && lockToast.st === 'select', JSON.stringify(lockToast));

  await page.evaluate((id) => document.querySelector(`#levelList li.level-card[data-id="${id}"]`).click(), LEVEL);
  const det = await page.evaluate(() => ({ state: window.__game.state, text: document.querySelector('#levelDetail')?.textContent || '', play: !!document.querySelector('#levelDetail #playBtn') }));
  step(`tap '${LEVEL}' badge → #levelDetail with par, star criteria and "Başla!" (#playBtn), still on the map`, det.state === 'select' && det.play && /Hedef süre/.test(det.text) && /Tüm altınlar/.test(det.text), det.text.slice(0, 120));
  await page.screenshot({ path: path.join(OUT, 'flow-map.png') });
  await page.evaluate(() => document.querySelector('#playBtn').click());
  step(`"Başla!" → state 'play'`, await waitFor(() => window.__game.state === 'play', 5000));
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
  const stats = await page.evaluate(() => ({ stats: document.querySelector('#winStats')?.textContent, stars: document.querySelectorAll('#winStars span').length, wallet: document.querySelector('#winWallet')?.textContent,
    next: getComputedStyle(document.querySelector('#nextBtn')).display, btns: ['#againBtn', '#levelsBtn'].every((s) => !!document.querySelector(s)), iris: !!document.querySelector('#winScreen #iris') }));
  step('win card: time vs par, coins x/y, three stars, wallet, buttons, iris', !!stats.stats && /Süre/.test(stats.stats) && /\/ \d+:\d\d/.test(stats.stats) && /Altın/.test(stats.stats) && stats.stars === 3 && stats.btns && stats.iris, JSON.stringify(stats));
  const walletOk = await page.evaluate(() => +document.querySelector('#winWallet').textContent === window.__game.save.get().wallet);
  step('wallet counter shows the banked coins', walletOk);
  step('"Sonraki Ada" hidden when the next island is not built', await page.evaluate(() => !window.__game.allLevels.find((l) => l.order === 2 && !l.comingSoon)) ? stats.next === 'none' : stats.next !== 'none', stats.next);
  const saved = await page.evaluate((id) => window.__game.save.level(id), LEVEL);
  step('save.levelResult stored', saved.done === true && saved.stars >= 1, JSON.stringify(saved));
  await page.screenshot({ path: path.join(OUT, 'flow-win.png') });

  await page.evaluate(() => document.querySelector('#levelsBtn').click());
  step("'Harita' → state 'select' + select screen visible", (await page.evaluate(() => window.__game.state)) === 'select' && (await visible('#selectScreen')) && !(await visible('#winScreen')));
  const done = await page.evaluate((id) => { const li = document.querySelector(`#levelList li.level-card[data-id="${id}"]`); return { stars: li.querySelectorAll('.lv-stars .on').length, best: li.querySelector('.lv-best').textContent, here: /Buradan başla/.test(li.textContent) }; }, LEVEL);
  step('badge shows earned stars + "En iyi" time after the win', done.stars >= 1 && /En iyi \d+:\d\d/.test(done.best) && !done.here, JSON.stringify(done));
  await page.screenshot({ path: path.join(OUT, 'flow-select.png') });

  // Ayarlar: persisted in save.settings (v2) and applied live
  await page.evaluate(() => document.querySelector('#settingsBtn').click());
  step('Ayarlar opens from the Harita bottom bar', await visible('#settingsScreen') && !(await visible('#selectScreen')));
  const set = await page.evaluate(() => {
    const g = window.__game, $ = (s) => document.querySelector(s);
    const fire = (el, ev) => el.dispatchEvent(new Event(ev, { bubbles: true }));
    const r = {};
    const cs = $('#setCamSens'); cs.value = 150; fire(cs, 'input'); r.camSens = [g.save.get().settings.camSens, g.cam.sens];
    const sv = $('#setSfx'); sv.value = 40; fire(sv, 'input'); r.sfx = g.save.get().settings.sfxVol;
    const a = $('#setAssist'); a.checked = true; fire(a, 'change'); r.assistOn = [g.save.get().settings.assist, g.physics.assist.on, g.physics.assist.hearts];
    a.checked = false; fire(a, 'change'); r.assistOff = [g.save.get().settings.assist, g.physics.assist.on];
    const ac = $('#setAutoCam'); ac.checked = true; fire(ac, 'change'); r.autoCam = [g.save.get().settings.autoCam, g.cam.auto];
    ac.checked = false; fire(ac, 'change'); r.autoCamOff = g.cam.auto;
    const iy = $('#setInvertY'); iy.checked = true; fire(iy, 'change'); r.invertY = g.cam.invertY; iy.checked = false; fire(iy, 'change');
    $('#setQuality button[data-q="low"]').click(); r.quality = g.save.get().settings.quality; r.qNote = $('#setQualityNote').textContent;
    $('#setQuality button[data-q="auto"]').click();
    cs.value = 100; fire(cs, 'input'); sv.value = 90; fire(sv, 'input');
    const rb = $('#resetBtn'); rb.click(); r.armed = rb.classList.contains('armed') && /Emin/.test(rb.textContent); r.levelsKept = !!g.save.level('kristal').done;
    return r;
  });
  step('Ayarlar: Kamera hızı → settings.camSens + cam.sens', set.camSens[0] === 1.5 && set.camSens[1] === 1.5, JSON.stringify(set.camSens));
  step('Ayarlar: Efekt sesi slider persisted', set.sfx === 0.4, String(set.sfx));
  step('Ayarlar: Yardım Modu → physics.assist (5 hearts) and back', set.assistOn[0] === true && set.assistOn[1] === true && set.assistOn[2] === 5 && set.assistOff[0] === false && set.assistOff[1] === false, JSON.stringify([set.assistOn, set.assistOff]));
  step('Ayarlar: Kamera otomatik / Y ters applied to cam', set.autoCam[0] === true && set.autoCam[1] === true && set.autoCamOff === false && set.invertY === true, JSON.stringify(set));
  step('Ayarlar: Kalite stored for the next load + detected tier shown', set.quality === 'low' && /Algılanan/.test(set.qNote), set.qNote);
  step('Ayarlar: first tap on "İlerlemeyi sıfırla" only arms it', set.armed && set.levelsKept);
  await page.screenshot({ path: path.join(OUT, 'flow-settings.png') });
  await page.evaluate(() => document.querySelector('#settingsCreditsBtn').click());
  const cred = await waitFor(() => /Poly Haven/.test(document.querySelector('#creditsBody')?.textContent || ''), 5000);
  step('Krediler lists assets/CREDITS.md', cred && (await visible('#creditsScreen')));
  await page.evaluate(() => document.querySelector('#creditsBackBtn').click());
  step('Krediler → back to Ayarlar', await visible('#settingsScreen'));
  await page.evaluate(() => document.querySelector('#settingsBackBtn').click());
  step('Ayarlar "Tamam" → back to the Harita', (await visible('#selectScreen')) && (await page.evaluate(() => window.__game.state)) === 'select');
  await page.evaluate(() => document.querySelector('#wardrobeBtn').click());
  step('Dolap placeholder toasts "yakında"', await page.evaluate(() => /yakında/i.test(document.querySelector('#toast').textContent)));

  // pause / resume round-trip (+ Baştan, Yardım Modu toggle)
  await page.evaluate((id) => { document.querySelector(`#levelList li.level-card[data-id="${id}"]`).click(); document.querySelector(`#levelList li.level-card[data-id="${id}"]`).click(); }, LEVEL);
  step('second tap on the selected badge starts it', await waitFor(() => window.__game.state === 'play', 5000));
  await page.keyboard.press('KeyP');
  step("P → state 'paused' + pause screen", (await page.evaluate(() => window.__game.state)) === 'paused' && (await visible('#pauseScreen')));
  const pz = await page.evaluate(() => {
    const g = window.__game, a = document.querySelector('#optAssist');
    a.checked = true; a.dispatchEvent(new Event('change', { bubbles: true }));
    const on = g.physics.assist.on && g.save.get().settings.assist;
    a.checked = false; a.dispatchEvent(new Event('change', { bubbles: true }));
    return { on, off: !g.physics.assist.on, btns: ['#resumeBtn', '#restartBtn', '#pauseLevelsBtn', '#optMute', '#optMusic'].every((s) => !!document.querySelector(s)) };
  });
  step('pause: Devam / Baştan / Harita + Ses / Müzik / Yardım Modu toggles', pz.on && pz.off && pz.btns, JSON.stringify(pz));
  await page.screenshot({ path: path.join(OUT, 'flow-pause.png') });
  await page.evaluate(() => document.querySelector('#restartBtn').click());
  step("'Baştan' → level restarted, state 'play'", (await page.evaluate(() => window.__game.state)) === 'play' && !(await visible('#pauseScreen')));
  await page.keyboard.press('KeyP');
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
