#!/usr/bin/env node
// Regression for ARCHITECTURE §14 "raycast probes" + the pause-screen audio boxes:
//  1. inside ONE page.evaluate (no frame renders) test.start(level) then groundBelow at the spawn must see the real ground
//     (before the fix every mesh still had an identity matrixWorld → wrong heights, ground-pound gate refused);
//  2. after test.tick()s a mover's ground probe must follow the mover;
//  3. the M key mutes → opening the pause screen shows #optMute checked.
// Usage: node tools/probe-check.mjs [--level=kristal] [--url=http://localhost:8765/]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const LEVEL = argv.level || 'kristal';
const smoke = fs.readFileSync(path.join(ROOT, 'tools', 'smoke.mjs'), 'utf8');
const CHROME = new Function('process', 'argv', 'return ' + smoke.match(/const CHROME = (.*?);\n/)[1])(process, argv);
const BASE = argv.url || 'http://localhost:8765/';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let fails = 0;
const check = (ok, label, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
try {
  await page.goto(BASE + '?test=1', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.ready, { timeout: 60000 });
  const r = await page.evaluate((id) => {
    const g = window.__game;
    g.test.start(id);                                   // synchronous build; nothing renders inside this evaluate
    const s = g.player.pos.toArray();
    const gs = g.test.groundBelow(s[0], s[1] + 0.5, s[2]);
    const far = g.test.groundBelow(s[0] + 60, 30, s[2] + 60);   // far away over the sea: must be null/undefined
    const movers = g.physics.movers || [];
    let mover = null;
    if (movers.length) {
      for (let i = 0; i < 120; i++) g.test.tick(1 / 60, {});
      const m = movers[0], top = m.mesh.position.y + m.h / 2;
      const gy = g.test.groundBelow(m.mesh.position.x, top + 0.5, m.mesh.position.z);
      mover = { top, gy, ok: gy != null && Math.abs(gy - top) < 0.05 };
    }
    return { spawn: s, gs, far, mover, state: g.state };
  }, LEVEL);
  check(r.state === 'play', `level ${LEVEL} started`, r.state);
  check(r.gs != null && r.spawn[1] - r.gs >= -0.05 && r.spawn[1] - r.gs < 0.35, 'groundBelow at spawn before any render (spawn rests ≤ 0.35 m above ground)', `spawn y ${r.spawn[1]}, ground ${r.gs}`);
  check(r.far == null, 'groundBelow over the sea is empty', String(r.far));
  if (r.mover) check(r.mover.ok, 'mover ground probe follows the mover after ticks', `top ${r.mover.top.toFixed(2)}, probe ${r.mover.gy == null ? 'none' : r.mover.gy.toFixed(2)}`);
  else console.log('skip mover probe (level has no movers)');
  const p = await page.evaluate(() => {
    const g = window.__game;
    g.audio.setMuted(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', key: 'm', bubbles: true }));
    const muted = !!g.audio.state.muted;
    g.setPaused(true);
    const box = document.querySelector('#optMute')?.checked;
    const shown = !document.querySelector('#pauseScreen')?.classList.contains('hidden');
    g.setPaused(false);
    g.audio.setMuted(false);
    return { muted, box, shown };
  });
  check(p.shown, 'pause screen shown');
  check(p.muted === true, 'M key mutes audio', String(p.muted));
  check(p.box === p.muted, 'pause screen #optMute mirrors audio.state.muted', `muted ${p.muted}, box ${p.box}`);
} catch (e) { check(false, 'exception', String(e?.message || e)); }
check(errors.length === 0, 'no page/console errors', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n${fails ? fails + ' problem(s)' : 'all probe checks ok'}`);
process.exit(fails ? 1 : 0);
