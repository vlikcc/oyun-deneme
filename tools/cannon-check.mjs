#!/usr/bin/env node
// Cannon + geyser mechanic check (GDD §3.4, §3.8) on the hidden level 'test-cannon' (src/levels/_test_cannon.js).
// Usage: node tools/cannon-check.mjs [--url=http://localhost:8765/] [--quality=low|medium|high] [--no-shots]
// Asserts, through window.__game (test ticks, no rendering needed):
//   * every unlocked cannon flight lands within 0.6 m of its `to` (fixed steps of 1/120 s = the game, and 1/60 s = test ticks)
//   * during a flight: player.flying, fallCap 120, controlLock > 0, cam.yaw behind the flight; after landing: fallCap back
//     to MAX_FALL, controlLock 0, flying false; the apex is ≈ mouth + apex
//   * a locked cannon ('lanterns', need 2) does not fire and toasts "Fenerler yanınca ateşlenir."; after the two plates emit
//     ('lanterns', 'count', n) it fires and lands on target
//   * a respawn mid-flight restores fallCap / controlLock and re-arms the cannon
//   * a geyser launches the player once per eruption to ≈ top + lift²/(2·GRAV) and never during the idle phase
// Screenshots (unless --no-shots): tools/out/cannon-fuse.png, cannon-flight.png, geyser-erupt.png. Exit code 0 = all passed.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const BASE = argv.url || 'http://localhost:8765/';
const QUALITY = ['high', 'medium', 'low'].includes(argv.quality) ? argv.quality : 'medium';
const CHROME = argv.chrome || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.resolve('tools/out'); fs.mkdirSync(OUT, { recursive: true });
const TOL = 0.6;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + (e?.message || e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text()); });

const results = [];
const check = (ok, name, detail = '') => { results.push({ ok: !!ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

try {
  const url = new URL(BASE); url.searchParams.set('test', '1'); url.searchParams.set('level', 'test-cannon'); url.searchParams.set('quality', QUALITY);
  await page.goto(url.toString(), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.ready === true, { timeout: 60000, polling: 100 });
  await page.evaluate(async () => { const g = window.__game; await g.test.start('test-cannon'); await g.test.ready(); });
  check(await page.evaluate(() => window.__game.level?.id === 'test-cannon' && window.__game.state === 'play'), 'test-cannon loads and plays');

  // ---------------------------------------------------------------- helpers injected into the page
  await page.evaluate(() => {
    const g = window.__game;
    const W = (window.__cc = {});
    W.toasts = [];
    g.bus.on('toast', (t) => W.toasts.push(t));
    W.L = () => g.world.L;
    // stand somewhere neutral until every cannon is idle again (the 0.6 s cool-down) so the next hop-in is a fresh entry
    W.away = (dt) => { g.test.teleport(0, 0.2, 14); for (let i = 0; i < Math.ceil(1.5 / dt); i++) { g.test.tick(dt, {}); if (i > 2 && W.L().cannons.every((c) => c.state === 'idle')) break; } };
    // hop into cannon i (from outside its trigger) and run until the flight is over; returns the flight record
    W.fly = (i, dt, { abortAt = null } = {}) => {
      const c = W.L().cannons[i];
      W.away(dt);
      g.test.teleport(c.mouth[0], c.mouth[1] + 0.6, c.mouth[2] + 0.8);
      const rec = { i, to: c.to, dt, states: [], maxY: -1e9, flyingSeen: false, capSeen: 0, lockSeen: 0, yawAtLaunch: null, flightDir: null, steps: 0 };
      const P = g.player;
      let launched = false;
      for (let k = 0; k < Math.ceil(12 / dt); k++) {
        g.test.tick(dt, {});
        rec.steps++;
        if (rec.states[rec.states.length - 1] !== c.state) rec.states.push(c.state);
        if (c.state === 'flying') {
          if (!launched) { launched = true; rec.yawAtLaunch = g.cam.yaw; rec.flightDir = Math.atan2(-P.vel.x, -P.vel.z); }
          rec.flyingSeen ||= P.flying; rec.capSeen = Math.max(rec.capSeen, P.fallCap); rec.lockSeen = Math.max(rec.lockSeen, P.controlLock);
          rec.maxY = Math.max(rec.maxY, P.pos.y);
          if (abortAt !== null && P.vel.y < abortAt) { g.physics.respawn(); g.test.tick(dt, {}); rec.aborted = true; break; }
        }
        if (launched && (c.state === 'cool' || c.state === 'idle')) break;
      }
      rec.landing = c.lastLanding; rec.flights = c.flights; rec.state = c.state;
      if (!rec.aborted) { for (let k = 0; k < Math.ceil(0.6 / dt); k++) g.test.tick(dt, {}); rec.settled = P.pos.toArray(); }
      rec.after = { fallCap: P.fallCap, controlLock: P.controlLock, flying: P.flying, grounded: P.grounded, pos: P.pos.toArray() };
      rec.mouth = c.mouth; rec.apex = c.apex; rec.T = c.T;
      return rec;
    };
  });

  const MAX_FALL = await page.evaluate(() => window.__game.physics.MAX_FALL);
  const n = await page.evaluate(() => window.__cc.L().cannons.length);
  check(n === 4, 'level builds 4 cannons', `L.cannons.length = ${n}`);
  const modelUsed = await page.evaluate(() => window.__cc.L().cannons.map((c) => c.usingModel));
  check(modelUsed.every(Boolean), 'cannons use the cannon_01 model', JSON.stringify(modelUsed));

  // ---------------------------------------------------------------- unlocked cannons A, B, C at 120 Hz and 60 Hz
  for (const dt of [1 / 120, 1 / 60]) {
    for (const i of [0, 1, 2]) {
      const r = await page.evaluate((i, dt) => window.__cc.fly(i, dt), i, dt);
      const land = r.landing;
      const dXZ = land ? Math.hypot(land[0] - r.to[0], land[2] - r.to[2]) : Infinity;
      const dY = land ? Math.abs(land[1] - r.to[1]) : Infinity;
      const tag = `cannon ${'ABCD'[i]} @${Math.round(1 / dt)} Hz`;
      check(land && dXZ < TOL && dY < TOL, `${tag}: lands within ${TOL} m of to`, `landing ${land?.map((v) => v.toFixed(2))} to ${r.to} → ${dXZ.toFixed(3)} m (xz), ${dY.toFixed(3)} m (y)`);
      const st = r.settled ? Math.hypot(r.settled[0] - r.to[0], r.settled[2] - r.to[2]) : Infinity;
      check(st < TOL, `${tag}: stays on target 0.6 s after landing (no slide)`, `settled ${r.settled?.map((v) => v.toFixed(2))} → ${st.toFixed(3)} m`);
      check(r.flyingSeen && r.capSeen === 120 && r.lockSeen > r.T, `${tag}: flying, fallCap 120, controlLock > T during the flight`, `flying ${r.flyingSeen}, cap ${r.capSeen}, lock ${r.lockSeen.toFixed(2)} (T ${r.T.toFixed(2)})`);
      check(r.after.fallCap === MAX_FALL && r.after.controlLock <= 0 && !r.after.flying && r.after.grounded, `${tag}: fallCap/controlLock/flying restored on landing`, JSON.stringify(r.after));
      const yawErr = Math.abs(((r.yawAtLaunch - r.flightDir + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      check(yawErr < 0.05, `${tag}: cam.yaw snaps behind the flight`, `yaw ${r.yawAtLaunch?.toFixed(3)} vs ${r.flightDir?.toFixed(3)}`);
      const apexY = r.mouth[1] + r.apex;
      check(Math.abs(r.maxY - apexY) < 0.35, `${tag}: apex ≈ mouth + apex`, `max y ${r.maxY.toFixed(2)} vs ${apexY.toFixed(2)}`);
      check(r.states.join('>').startsWith('idle>load>fuse>flying') || r.states.join('>').startsWith('load>fuse>flying'), `${tag}: load → fuse → flying`, r.states.join(' > '));
    }
  }

  // ---------------------------------------------------------------- locked cannon D
  {
    const r = await page.evaluate(() => {
      const g = window.__game, W = window.__cc, c = W.L().cannons[3], dt = 1 / 60;
      W.toasts.length = 0;
      W.away(dt);
      g.test.teleport(c.mouth[0], c.mouth[1] + 0.6, c.mouth[2] + 0.8);
      for (let k = 0; k < 90; k++) g.test.tick(dt, {});
      return { state: c.state, locked: c.locked, flights: c.flights, toasts: [...W.toasts] };
    });
    check(r.locked && r.flights === 0 && r.state === 'idle', 'cannon D stays put while locked', JSON.stringify({ state: r.state, flights: r.flights }));
    check(r.toasts.includes('Fenerler yanınca ateşlenir.'), 'locked cannon toasts "Fenerler yanınca ateşlenir."', JSON.stringify(r.toasts));
    const u = await page.evaluate(() => {
      const g = window.__game, W = window.__cc, c = W.L().cannons[3], dt = 1 / 60;
      const plates = [[-27, 9.1, -15.5], [-31.5, 9.1, -11]];
      const out = [];
      for (const [x, y, z] of plates) { g.test.teleport(x, y, z); for (let k = 0; k < 4; k++) g.test.tick(dt, {}); out.push(c.locked); }
      return out;
    });
    check(u[0] === true && u[1] === false, 'cannon D unlocks when both plates emit lanterns/count ≥ 2', JSON.stringify(u));
    const f = await page.evaluate(() => window.__cc.fly(3, 1 / 120));
    const d = f.landing ? Math.hypot(f.landing[0] - f.to[0], f.landing[2] - f.to[2]) : Infinity;
    check(f.landing && d < TOL && Math.abs(f.landing[1] - f.to[1]) < TOL, `cannon D @120 Hz (unlocked): lands within ${TOL} m of to`, `landing ${f.landing?.map((v) => v.toFixed(2))} to ${f.to} → ${d.toFixed(3)} m`);
    const relock = await page.evaluate(() => { const W = window.__cc, c = W.L().cannons[3]; W.L().emit('switch', 'lanterns', false); const a = c.locked; W.L().emit('switch', 'lanterns', true); return [a, c.locked]; });
    check(relock[0] === true && relock[1] === false, 'world signal false re-locks, true unlocks', JSON.stringify(relock));
  }

  // ---------------------------------------------------------------- respawn mid-flight
  {
    const r = await page.evaluate(() => window.__cc.fly(0, 1 / 120, { abortAt: -2 }));
    const c = await page.evaluate(() => ({ state: window.__cc.L().cannons[0].state }));
    check(r.aborted && r.after.fallCap === MAX_FALL && r.after.controlLock <= 0 && !r.after.flying && c.state === 'idle', 'respawn mid-flight restores fallCap / controlLock and re-arms', JSON.stringify({ ...r.after, state: c.state }));
  }

  // ---------------------------------------------------------------- geyser
  {
    const r = await page.evaluate(() => {
      const g = window.__game, W = window.__cc, gy = W.L().geysers[0], dt = 1 / 120, P = g.player;
      // wait for the idle part of the cycle, then stand on the vent
      W.away(dt);
      let guard = 0;
      while (gy.state !== 'idle' && guard++ < 2000) g.test.tick(dt, {});
      g.test.teleport(gy.x + 0.3, gy.top + 0.1, gy.z);
      const l0 = gy.launches;
      let idleLaunch = false, maxY = -1e9, launchedAt = null, states = [];
      for (let k = 0; k < Math.ceil(2 * gy.period / dt); k++) {
        const before = gy.launches, st = gy.state;
        g.test.tick(dt, {});
        if (states[states.length - 1] !== gy.state) states.push(gy.state);
        if (gy.launches > before) { if (st === 'idle' && gy.state === 'idle') idleLaunch = true; if (launchedAt === null) launchedAt = P.pos.y; }
        if (launchedAt !== null && maxY < P.pos.y) maxY = P.pos.y;
        if (launchedAt !== null && P.grounded && maxY > launchedAt + 1) break;
      }
      return { launches: gy.launches - l0, idleLaunch, maxY, top: gy.top, lift: gy.lift, GRAV: g.physics.GRAV, states };
    });
    const want = r.top + (r.lift * r.lift) / (2 * r.GRAV);
    check(r.launches >= 1 && !r.idleLaunch, 'geyser launches the player during an eruption only', JSON.stringify({ launches: r.launches, states: r.states }));
    check(Math.abs(r.maxY - want) < 0.6, 'geyser launch height ≈ top + lift²/2g', `max y ${r.maxY.toFixed(2)} vs ${want.toFixed(2)}`);
    const once = await page.evaluate(() => {
      const g = window.__game, W = window.__cc, gy = W.L().geysers[0], dt = 1 / 120;
      // hold the player inside the column for a whole eruption: exactly one launch
      let guard = 0;
      while (gy.state !== 'telegraph' && guard++ < 2000) g.test.tick(dt, {});
      const l0 = gy.launches;
      while (gy.state !== 'idle' && guard++ < 4000) { g.test.teleport(gy.x, gy.top + 0.5, gy.z); g.player.vel.set(0, 0, 0); g.test.tick(dt, {}); }
      return gy.launches - l0;
    });
    check(once === 1, 'geyser launches once per eruption', `launches during one held eruption: ${once}`);
    const phases = await page.evaluate(() => window.__cc.L().geysers.slice(0, 3).map((q) => [q.period, q.phase, q.lift]));
    check(JSON.stringify(phases) === JSON.stringify([[3, 0, 22], [3, 1, 22], [3, 2, 22]]), 'terrace geysers period 3, phases 0/1/2, lift 22', JSON.stringify(phases));
  }

  // ---------------------------------------------------------------- dispose: reload the level 4×, scene children / geometries constant
  {
    const r = await page.evaluate(async () => {
      const g = window.__game, out = [];
      for (let k = 0; k < 4; k++) { g.loadLevel('test-cannon'); await g.test.ready(); for (let i = 0; i < 5; i++) g.test.tick(1 / 60, {}); g.core.render(); out.push([g.core.scene.children.length, g.core.renderer.info.memory.geometries, g.core.renderer.info.memory.textures]); }
      g.startLevel('test-cannon'); await g.test.ready();
      return out;
    });
    // scene children and textures must be identical on every load; renderer.info.memory.geometries only counts geometries
    // that have been drawn at least once, so it may wobble by one with what happens to be visible — it must never grow
    const same = r.every((x) => x[0] === r[0][0] && x[2] === r[0][2]) && Math.max(...r.map((x) => x[1])) - Math.min(...r.map((x) => x[1])) <= 1;   // a leak grows ≥ 1 per load (≥ 3 over 4 loads)
    check(same, 'reloading test-cannon 4×: scene children / textures constant, geometries do not grow', JSON.stringify(r));
  }

  // ---------------------------------------------------------------- screenshots (rendered frames)
  if (!argv['no-shots']) {
    const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
    await page.evaluate(() => {
      const g = window.__game, W = window.__cc, c = W.L().cannons[0];
      W.away(1 / 60);
      g.cam.yaw = c.aimYaw + Math.PI * 0.62; g.cam.pitch = 0.25; g.cam.lastLook = performance.now() + 1e7;
      g.test.teleport(c.mouth[0], c.mouth[1] + 0.6, c.mouth[2] + 0.8);
      for (let k = 0; k < 50; k++) g.test.tick(1 / 60, {});
    });
    await frame(); await page.screenshot({ path: path.join(OUT, 'cannon-fuse.png') });
    await page.evaluate(() => { const g = window.__game; for (let k = 0; k < 40; k++) g.test.tick(1 / 60, {}); });
    await frame(); await page.screenshot({ path: path.join(OUT, 'cannon-flight.png') });
    await page.evaluate(() => {
      const g = window.__game, W = window.__cc, gy = W.L().geysers[0];
      for (let k = 0; k < 200; k++) g.test.tick(1 / 60, {});
      g.test.teleport(gy.x + 4, gy.top + 0.1, gy.z + 4);
      g.cam.yaw = Math.PI * 0.25; g.cam.pitch = 0.2; g.cam.lastLook = performance.now() + 1e7;
      let guard = 0;
      while (!(gy.state === 'erupt' && gy.u > 1.0) && guard++ < 1000) g.test.tick(1 / 60, {});
    });
    await frame(); await page.screenshot({ path: path.join(OUT, 'geyser-erupt.png') });
    console.log('screenshots: tools/out/cannon-fuse.png, tools/out/cannon-flight.png, tools/out/geyser-erupt.png');
  }
} catch (e) {
  check(false, 'exception', String(e?.stack || e));
}
check(errors.length === 0, 'no page / console errors', errors.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
