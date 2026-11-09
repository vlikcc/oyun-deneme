#!/usr/bin/env node
// Engine contract check for GDD §3.0 E1–E10 + the registries (ARCHITECTURE §15), driven through window.__game in headless
// Chrome (same launch args as smoke.mjs; nothing renders unless the script calls core.render()).
// Asserts: setSolid (E1), fallCap (E2), waterKind water/lava/cloud toasts + cloud sea (E3; the lava sea may be core's
// built-in plane or the registered kind from mechanics/lava.js — either must be a visible scene child with kind 'lava'), the assist table (E4),
// cam.auto / cam.suggest (L.camHint) / cam.override (E5), function movers (E6), the GLB transmission swap (E7), layers +
// GL draw counter + medium reflection cadence + low shadows off (E8), save v2 migration from a v1 blob (E9), bus events
// respawn/faint/pound/level:unloaded (E10), core.registerParticles / registerWaterKind with no-op fallbacks, L.scatter
// instancing + quality.maxProps, the mechanic stubs, audio playMusic/playLoop/stopLoops + theme loops load/release, and
// §12–§14 items (ice row, extVel decay, controlLock, solid=false).
// Usage: node tools/engine-check.mjs [--url=http://localhost:8765/]
import puppeteer from 'puppeteer-core';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const BASE = argv.url || 'http://localhost:8765/';
const CHROME = argv.chrome || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
});
let fails = 0, total = 0;
const check = (ok, label, extra = '') => { total++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra !== '' ? ' — ' + extra : ''}`); if (!ok) fails++; };

async function open(query) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e?.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push('http' + r.status() + ': ' + r.url()); });
  await page.goto(BASE + '?test=1' + (query ? '&' + query : ''), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.ready === true, { timeout: 60000, polling: 100 });
  return { page, errors };
}

// Helpers injected into the page: a flat synthetic level, tick helpers, a toast recorder.
const HELPERS = `
  window.__ec = (() => {
    const g = window.__game;
    const toasts = []; g.bus.on('toast', (t) => toasts.push(t));
    const events = []; for (const n of ['respawn', 'faint', 'pound', 'level:unloaded', 'cam:override']) g.bus.on(n, (...a) => events.push([n, a[0]]));
    const T = { hdri: 'kloppenheim_06_puresky', particles: 'none', clouds: false, ambience: [], music: null };
    function level(id, theme, build) {
      return { id, name: 'Deneme', order: 90, hidden: true, theme: { ...T, ...theme }, spawn: [0, 0.1, 0], spawnFacing: Math.PI, crystals: 0, build };
    }
    function load(lv) { g.world.load(lv); g.physics.sim.playing = true; return g.world.L; }
    function ticks(n, inp = {}, dt = 1 / 60) { let r; for (let i = 0; i < n; i++) r = g.test.tick(dt, inp); return r; }
    return { g, toasts, events, level, load, ticks };
  })();
`;

try {
  // ------------------------------------------------------------------ main page (?test=1, high tier)
  const { page, errors } = await open('');
  await page.evaluate(HELPERS);
  await page.evaluate(() => window.__game.startLevel('test'));

  // E1 setSolid
  const e1 = await page.evaluate(() => {
    const { g, level, load, ticks } = window.__ec, P = g.physics;
    let plat = null;
    load(level('ec-solid', {}, (L) => { L.box(0, 0, 0, 12, 12, 2); plat = L.box(0, 3, -20, 4, 4, 1); }));
    g.test.teleport(0, 3.05, -20); ticks(10);
    const onIt = g.player.grounded && g.player.ground === plat;
    const inList0 = P.solidMeshes.includes(plat.mesh);
    P.setSolid(plat, false);
    const off = { noSolid: plat.noSolid, solid: plat.solid, inList: P.solidMeshes.includes(plat.mesh), ground: g.player.ground === plat };
    ticks(3);
    const falling = !g.player.grounded && g.player.vel.y < 0;
    const probe = g.test.groundBelow(0, 3.5, -20);
    g.test.teleport(0, 2.4, -20);            // feet inside the (non-solid) box
    P.setSolid(plat, true);
    const lifted = g.player.pos.y;
    const inList1 = P.solidMeshes.includes(plat.mesh);
    ticks(3);
    return { onIt, inList0, off, falling, probe, lifted, inList1, grounded: g.player.grounded && g.player.ground === plat };
  });
  check(e1.onIt && e1.inList0, 'E1 player stands on the platform, its mesh is in solidMeshes');
  check(e1.off.noSolid === true && e1.off.solid === false && !e1.off.inList && !e1.off.ground, 'E1 setSolid(c,false): noSolid, out of solidMeshes, ground cleared', JSON.stringify(e1.off));
  check(e1.falling && e1.probe == null, 'E1 player falls through + groundBelow ignores it', `probe ${e1.probe}`);
  check(Math.abs(e1.lifted - 3) < 1e-6 && e1.inList1 && e1.grounded, 'E1 setSolid(c,true) lifts the player onto the top and re-adds the mesh', `y ${e1.lifted}`);

  // E2 fallCap
  const e2 = await page.evaluate(() => {
    const { g, level, load, ticks } = window.__ec, P = g.physics;
    load(level('ec-fall', { water: null, fall: { y: -500, kind: 'cloud' } }, (L) => { L.box(0, 0, 0, 6, 6, 1); }));
    const run = (cap) => { g.test.teleport(200, 300, 200); if (cap) g.player.fallCap = cap; let min = 0; for (let i = 0; i < 60; i++) { ticks(1); min = Math.min(min, g.player.vel.y); } return min; };
    const def = g.player.fallCap, a = run(0), b = run(120);
    P.respawn(); const after = g.player.fallCap;
    return { def, a, b, after, MAX: P.MAX_FALL };
  });
  check(e2.def === e2.MAX && Math.abs(e2.a + e2.MAX) < 1e-6, 'E2 default fallCap = MAX_FALL caps the fall at 32 m/s', `min vel ${e2.a.toFixed(2)}`);
  check(e2.b < -60, 'E2 fallCap 120 lets the fall exceed 32 m/s', `min vel ${e2.b.toFixed(2)}`);
  check(e2.after === e2.MAX, 'E2 respawn restores fallCap');

  // E3 water kinds
  const e3 = await page.evaluate(() => {
    const { g, toasts, level, load, ticks } = window.__ec, P = g.physics, out = {};
    const fall = (x, y, z) => { toasts.length = 0; g.player.invuln = 0; g.player.hearts = 3; g.test.teleport(x, y, z); ticks(90); return [...toasts]; };
    load(level('ec-water', { water: { color: 0x1c8fd1, level: -1.2 } }, (L) => { L.box(0, 0, 0, 6, 6, 1); }));
    out.water = { kind: P.sim.waterKind, y: P.sim.waterY, toasts: fall(30, 0, 30), visible: !!g.core.water?.visible };
    load(level('ec-lava', { water: { kind: 'lava', color: 0xff5a1f, level: -1.2 } }, (L) => { L.box(0, 0, 0, 6, 6, 1); }));
    out.lava = { kind: P.sim.waterKind, y: P.sim.waterY, toasts: fall(30, 0, 30), lavaVisible: !!g.core.lava?.visible || g.core.scene.children.some((o) => o.userData?.kind === 'lava' && o.visible), lavaSea: g.core.scene.children.find((o) => o.userData?.kind === 'lava')?.name ?? null, waterVisible: !!g.core.water?.visible, hearts: g.player.hearts };
    load(level('ec-cloud', { water: null, fall: { y: -30, kind: 'cloud' } }, (L) => { L.box(0, 0, 0, 6, 6, 1); }));
    const cs = g.core.cloudSea;
    out.cloud = { kind: P.sim.waterKind, y: P.sim.waterY, killY: P.sim.killY, toasts: fall(30, -28, 30), sea: cs ? { visible: cs.visible, y: cs.userData.level, inScene: !!cs.parent } : null, waterVisible: !!g.core.water?.visible, lavaVisible: !!g.core.lava?.visible };
    load(level('ec-void', { water: null, killY: -40 }, (L) => { L.box(0, 0, 0, 6, 6, 1); }));
    out.void = { waterY: P.sim.waterY, killY: P.sim.killY, toasts: fall(30, -38, 30), cloudVisible: !!g.core.cloudSea?.visible };
    return out;
  });
  check(e3.water.kind === 'water' && e3.water.y === -1 && e3.water.toasts.includes('Şapırt!') && e3.water.visible, "E3 water: waterKind 'water' → \"Şapırt!\"", JSON.stringify(e3.water));
  check(e3.lava.kind === 'lava' && e3.lava.toasts.includes('Cız! Lav!') && e3.lava.lavaVisible && !e3.lava.waterVisible, "E3 lava sea: waterKind 'lava' → hazard + \"Cız! Lav!\"", JSON.stringify(e3.lava));
  check(e3.cloud.kind === 'cloud' && e3.cloud.y === -30 && e3.cloud.killY === -30 && e3.cloud.toasts.includes('Bulutlara düştün!'), "E3 theme.fall cloud: waterY = killY = fall.y → \"Bulutlara düştün!\"", JSON.stringify(e3.cloud));
  check(e3.cloud.sea && e3.cloud.sea.visible && e3.cloud.sea.inScene && e3.cloud.sea.y === -35 && !e3.cloud.waterVisible && !e3.cloud.lavaVisible, 'E3 cloud-sea plane at fall.y − 5, no water/lava', JSON.stringify(e3.cloud.sea));
  check(e3.void.waterY === null && e3.void.killY === -40 && e3.void.toasts.includes('Düştün!') && !e3.void.cloudVisible, 'theme.water null + killY still → void "Düştün!"', JSON.stringify(e3.void));

  // E4 assist table
  const e4 = await page.evaluate(() => {
    const { g, level, load, ticks } = window.__ec, P = g.physics, out = {};
    out.off = { ...P.assist };
    load(level('ec-assist', {}, (L) => { L.box(0, 0, 0, 20, 20, 1); }));
    g.test.teleport(0, 0.05, 0); ticks(5); out.coyoteOff = g.player.coyote;
    P.setAssist(true); out.on = { ...P.assist };
    ticks(2); out.coyoteOn = g.player.coyote;
    g.player.coins = 20; P.faint(); out.coinsAfterFaintOn = g.player.coins; out.maxHeartsAfterFaint = g.player.maxHearts;
    P.reset([0, 0.1, 0]); out.resetHearts = [g.player.hearts, g.player.maxHearts];
    P.setAssist(false);
    g.player.coins = 20; P.faint(); out.coinsAfterFaintOff = g.player.coins;
    P.reset([0, 0.1, 0]); out.resetHeartsOff = [g.player.hearts, g.player.maxHearts];
    return out;
  });
  check(JSON.stringify(Object.keys(e4.off).sort()) === JSON.stringify(['coinLoss', 'coyote', 'crumble', 'enemySpeed', 'eruption', 'hearts', 'on', 'timed', 'wind']) && e4.off.coyote === 0.1 && e4.off.hearts === 3 && e4.off.coinLoss === true, 'E4 physics.assist defaults', JSON.stringify(e4.off));
  check(e4.on.on && e4.on.coyote === 0.18 && e4.on.enemySpeed === 0.75 && e4.on.crumble === 1.5 && e4.on.wind === 0.7 && e4.on.timed === 1.5 && e4.on.coinLoss === false && e4.on.hearts === 5, 'E4 setAssist(true) = GDD §4.7 Yardım values', JSON.stringify(e4.on));
  check(Math.abs(e4.coyoteOff - 0.1) < 1e-9 && Math.abs(e4.coyoteOn - 0.18) < 1e-9, 'E4 coyote time read through assist', `${e4.coyoteOff} → ${e4.coyoteOn}`);
  check(e4.coinsAfterFaintOn === 20 && e4.coinsAfterFaintOff === 10, 'E4 faint skips the coin loss in Yardım Modu', `${e4.coinsAfterFaintOn} / ${e4.coinsAfterFaintOff}`);
  check(e4.maxHeartsAfterFaint === 5 && e4.resetHearts[0] === 5 && e4.resetHearts[1] === 5 && e4.resetHeartsOff[1] === 3, 'E4 maxHearts = assist.hearts on reset/faint', JSON.stringify([e4.resetHearts, e4.resetHeartsOff]));

  // E5 camera
  const e5 = await page.evaluate(() => {
    const { g, events, level, load, ticks } = window.__ec, cam = g.cam, out = {};
    load(level('ec-cam', {}, (L) => { L.box(0, 0, 0, 200, 200, 1); L.camHint({ x: 60, y: -1, z: 0, w: 10, h: 4, d: 10 }, 1.0); }));
    // auto: run along +x (input yaw pinned to 0) with no look input → yaw → facing + π = −π/2
    cam.auto = true; cam.yaw = 0; cam.lastLook = performance.now() - 5000;
    g.test.teleport(-40, 0.05, 0);
    ticks(150, { ix: 1, yaw: 0 });
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    out.autoYaw = cam.yaw; out.autoErr = Math.abs(wrap(cam.yaw - (g.player.facing + Math.PI)));
    // auto off → yaw stays
    cam.auto = false; cam.yaw = 0; ticks(60, { ix: 1, yaw: 0 }); out.noAutoYaw = cam.yaw;
    // recent look input blocks auto
    cam.auto = true; cam.yaw = 0; g.cameraApi.look(0.0001, 0); ticks(30, { ix: 1, yaw: 0 }); out.lookBlocks = Math.abs(cam.yaw) < 0.01;
    // camHint suggest
    cam.auto = false; cam.yaw = 0; g.test.teleport(60, 0.05, 0); cam.lastLook = performance.now() - 5000;
    ticks(120); out.suggest = cam.suggest ? { ...cam.suggest } : null; out.hintYaw = cam.yaw;
    g.test.teleport(0, 0.05, 0); ticks(1);
    // override
    events.length = 0; cam.yaw = 0; cam.pitch = 0.42; cam.dist = 10;
    g.cameraApi.setOverride({ yaw: 2, pitch: 0.9, dist: 15, t: 0.5, hold: 0.3 });
    ticks(2); out.hudDuring = getComputedStyle(document.querySelector('#hud')).display !== 'none' && !document.querySelector('#hud').classList.contains('hidden');
    g.cameraApi.look(1, 0); const yawAfterLook = cam.yaw;
    ticks(30); out.ovReached = { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist }; out.lookIgnored = yawAfterLook !== undefined && Math.abs(wrap(cam.yaw - 2)) < 0.05;
    ticks(40); out.cleared = cam.override === null;
    ticks(60); out.restored = { pitch: cam.pitch, dist: cam.dist };
    out.hudAfter = getComputedStyle(document.querySelector('#hud')).display !== 'none' && !document.querySelector('#hud').classList.contains('hidden');
    out.events = events.filter((e) => e[0] === 'cam:override').map((e) => e[1]);
    return out;
  });
  check(e5.autoErr < 0.25, 'E5 cam.auto eases yaw behind the player (facing + π)', `yaw ${e5.autoYaw.toFixed(2)}, err ${e5.autoErr.toFixed(3)}`);
  check(e5.noAutoYaw === 0 && e5.lookBlocks, 'E5 cam.auto off / recent look input → no auto turn');
  check(e5.suggest && Math.abs(e5.hintYaw - 1) < 0.05, 'E5 L.camHint → cam.suggest {yaw, until} eases the yaw', `yaw ${e5.hintYaw.toFixed(3)}`);
  check(Math.abs(e5.ovReached.yaw - 2) < 0.02 && Math.abs(e5.ovReached.pitch - 0.9) < 0.02 && Math.abs(e5.ovReached.dist - 15) < 0.05 && e5.lookIgnored, 'E5 cam.override tweens yaw/pitch/dist and ignores look input', JSON.stringify(e5.ovReached));
  check(e5.cleared && Math.abs(e5.restored.pitch - 0.42) < 0.01 && Math.abs(e5.restored.dist - 10) < 0.05, 'E5 override auto-clears after t + hold and restores pitch/dist', JSON.stringify(e5.restored));
  check(!e5.hudDuring && e5.hudAfter && JSON.stringify(e5.events) === '[true,false]', "E5 bus 'cam:override' true/false hides then shows the HUD", JSON.stringify(e5.events));

  // E6 function movers
  const e6 = await page.evaluate(() => {
    const { g, level, load, ticks } = window.__ec, THREE = g.core.camera.constructor;   // (unused) keep THREE out of the page
    let m = null;
    load(level('ec-mover', {}, (L) => { L.box(0, 0, 0, 10, 10, 1); m = L.mover([20, 2, 0], [20, 2, 0], 4, 3, 3); m.fn = (t) => [20 + Math.cos(t) * 5, 2, Math.sin(t) * 5]; }));
    g.test.teleport(25, 2.05, 0); ticks(3);
    const riding = g.player.ground === m;
    const p0 = g.player.pos.clone();
    ticks(30);
    const t = m.t, want = [20 + Math.cos(t) * 5, 2, Math.sin(t) * 5];
    const top = m.mesh.position.y + m.h / 2;
    const err = Math.hypot(m.mesh.position.x - want[0], top - want[1], m.mesh.position.z - want[2]);
    const carried = g.player.ground === m && g.player.pos.distanceTo(p0) > 1;
    const probe = g.test.groundBelow(m.mesh.position.x, top + 0.5, m.mesh.position.z);
    m.stopped = true; const before = m.mesh.position.clone(); ticks(10); const frozen = before.distanceTo(m.mesh.position) < 1e-9 && m.delta.lengthSq() === 0;
    return { riding, err, carried, probe, top, frozen };
  });
  check(e6.riding && e6.err < 1e-6, 'E6 mover follows m.fn(t) (top-centre)', `err ${e6.err}`);
  check(e6.carried && e6.probe != null && Math.abs(e6.probe - e6.top) < 0.05, 'E6 riders are carried + matrixWorld refreshed for probes', `probe ${e6.probe}`);
  check(e6.frozen, 'E6 m.stopped freezes the mover (delta 0)');

  // E8 layers + GL counter (high)
  const e8 = await page.evaluate(async () => {
    const { g } = window.__ec;
    g.startLevel('kristal'); await g.test.ready();
    for (let i = 0; i < 5; i++) g.test.tick(1 / 60, {});
    const small = (o) => { let ok = true; o.traverse((k) => { if ((k.isMesh || k.isSprite) && k.layers.mask !== 2) ok = false; }); return ok; };
    const crystals = g.crystals.every((c) => small(c.group));
    const enemies = g.enemies.every((e) => small(e.group));
    const camSees = g.core.camera.layers.isEnabled(1) && g.core.camera.layers.isEnabled(0);
    const shadowSees = g.core.sun.shadow.camera.layers.isEnabled(1);
    const seen = []; for (let i = 0; i < 3; i++) { g.core.render(); seen.push(g.core.stats().glDraws); }
    const st = g.core.stats();
    return { crystals, enemies, camSees, shadowSees, seen, calls: st.calls, budget: st.drawBudget, tier: st.tier, shadows: g.core.renderer.shadowMap.enabled, report: g.test.report().glDraws };
  });
  check(e8.crystals && e8.enemies, 'E8 crystals + enemies on NO_REFLECT_LAYER (mask 2)');
  check(e8.camSees && e8.shadowSees, 'E8 camera + sun shadow camera render layer 1 too');
  check(e8.seen.every((n) => n > 0) && e8.seen[2] >= e8.calls && e8.report === e8.seen[2], 'E8 core.stats().glDraws counts GL draws (≥ renderer.info calls) and report() exposes it', JSON.stringify(e8));
  check(e8.tier === 'high' && e8.budget === 900 && e8.shadows && e8.seen[2] <= 900, 'E8 high tier: shadows on, kristal within 900', `glDraws ${e8.seen[2]}`);

  // Registries
  const reg = await page.evaluate(() => {
    const { g } = window.__ec, core = g.core, out = {};
    const log = [];
    core.registerParticles('ec-dust', (scene, quality, theme) => { log.push('make:' + quality.tier + ':' + theme.particles); return { update: () => log.push('update'), dispose: () => log.push('dispose') }; });
    core.applyTheme({ particles: 'ec-dust', water: null }); core.render(); core.render();
    core.applyTheme({ particles: 'no-such-system' });
    out.particles = log.join(',');
    out.unknownParticles = core.core.ambient == null;   // __game.core is the module namespace; the live getter is on core.core
    const wlog = [];
    core.registerWaterKind('ec-sea', (opts, ctx) => { const o = new ctx.THREE.Mesh(new ctx.THREE.PlaneGeometry(10, 10), new ctx.THREE.MeshBasicMaterial({ color: opts.color })); wlog.push('make'); return { object: o, update: () => wlog.push('update'), dispose: () => { o.geometry.dispose(); o.material.dispose(); wlog.push('dispose'); } }; });
    const obj = core.setWater(true, { kind: 'ec-sea', color: 0xff0000, level: -2 });
    out.seaInScene = !!obj?.parent && obj.userData.kind === 'ec-sea';
    core.render();
    core.setWater(true, { kind: 'water' });
    out.water = wlog.join(','); out.seaRemoved = !obj.parent;
    // a registered 'lava' factory wins over the built-in plane; a throwing factory falls back to it
    core.registerWaterKind('ec-broken', () => { throw new Error('boom'); });
    const fb = core.setWater(true, { kind: 'ec-broken' });
    out.brokenFallback = !!fb && fb === core.water;
    core.setWater(false);
    out.api = typeof core.registerParticles === 'function' && typeof core.registerWaterKind === 'function';
    return out;
  });
  check(reg.api && reg.particles === 'make:high:ec-dust,update,update,dispose' && reg.unknownParticles, 'core.registerParticles: factory(scene, quality, theme) → update per render → dispose; unknown name = no-op', reg.particles);
  check(reg.seaInScene && reg.water === 'make,update,dispose' && reg.seaRemoved, 'core.registerWaterKind: factory object added, updated, removed + disposed on the next setWater', reg.water);
  check(reg.brokenFallback, 'core.registerWaterKind: a throwing factory falls back to the built-in plane');

  // L.scatter instancing + maxProps
  const sc = await page.evaluate(async () => {
    const { g, level, load } = window.__ec;
    let a, b, flowers;
    load(level('ec-scatter', {}, (L) => {
      L.box(0, 0, 0, 120, 120, 1);
      a = L.scatter('bush_round', { center: [0, 0], rMin: 5, rMax: 40, count: 12, margin: 0, collide: 'cyl', r: 0.5, h: 1 });
      b = L.scatter('prop:stump_oak', { center: [0, 0], rMin: 5, rMax: 40, count: 3, margin: 0 });
      flowers = L.scatter('flowers', { center: [0, 0], rMin: 0, rMax: 55, count: 1000, margin: 0 });
    }));
    await g.test.ready();
    const ims = []; g.core.scene.traverse((o) => { if (o.isInstancedMesh && /^props:bush_round/.test(o.name)) ims.push(o.count); });
    const groups = b.filter((x) => x.isObject3D && x.name === 'prop:stump_oak').length;
    return { a: a.length, colliders: a.filter((r) => r.collider).length, ims, groups, flowers: flowers.length, max: g.core.quality.maxProps };
  });
  check(sc.a === 12 && sc.ims.length > 0 && sc.ims.every((n) => n === 12) && sc.colliders === 12, 'L.scatter: ≥ 8 kit props → one InstancedMesh per primitive (+ colliders)', JSON.stringify(sc));
  check(sc.groups === 3, 'L.scatter: < 8 props → individual L.prop groups');
  check(sc.flowers === sc.max - 15, 'L.scatter respects quality.maxProps per level', `${sc.flowers} flowers, max ${sc.max}`);

  // §12–§14 still hold
  const s12 = await page.evaluate(() => {
    const { g, level, load, ticks } = window.__ec, P = g.physics, out = {};
    out.ice = P.SURFACES.ice;
    out.levelRef = g.level?.id;
    load(level('ec-misc', {}, (L) => { L.box(0, 0, 0, 40, 40, 1); }));
    g.test.teleport(0, 0.05, 0); ticks(5);
    g.player.extVel.set(10, 0, 0); ticks(30); out.extVel = g.player.extVel.length();
    g.player.extVel.set(0, 0, 0); ticks(5); g.player.controlLock = 0.5; const x0 = g.player.pos.x; ticks(10, { iy: 1 }); out.lockedMove = Math.abs(g.player.pos.x - x0) + Math.abs(g.player.vel.z);
    ticks(40, { iy: 1 }); out.unlockedSpeed = Math.hypot(g.player.vel.x, g.player.vel.z);
    out.levelRef2 = g.level?.id;
    return out;
  });
  check(s12.ice.acc === 0.22 && s12.ice.dec === 0.1 && s12.ice.speed === 1.15, 'SURFACES.ice = {acc .22, dec .1, speed 1.15}');
  check(s12.extVel < 10 * Math.exp(-6 * 0.5) * 1.05, 'extVel decays (grounded rate 6/s)', s12.extVel.toFixed(3));
  check(s12.lockedMove < 0.05 && s12.unlockedSpeed > 5, 'controlLock blocks input, then control returns', JSON.stringify(s12));
  check(s12.levelRef2 === 'ec-misc', 'window.__game.level follows the loaded level');

  // E10 bus events
  const e10 = await page.evaluate(() => {
    const { g, events, level, load, ticks } = window.__ec, P = g.physics;
    load(level('ec-bus', {}, (L) => { L.box(0, 0, 0, 40, 40, 1); }));
    events.length = 0;
    g.test.teleport(0, 6, 0); ticks(2); g.test.tick(1 / 60, { pound: true }); ticks(60);
    P.respawn(); P.faint();
    g.world.unload();
    return events.map((e) => e[0]);
  });
  for (const n of ['pound', 'respawn', 'faint', 'level:unloaded']) check(e10.includes(n), `E10 bus '${n}' emitted by the engine`, e10.join(','));

  // E9 save v2 migration
  const e9 = await page.evaluate(() => {
    const { g } = window.__ec, S = g.save;
    const v1 = { v: 1, wallet: 42, cosmetics: { owned: ['none', 'hat:leaf'], hat: 'hat:leaf', scarf: 0xff0000 }, settings: { mute: true, music: false, quality: 'low', invertY: true, hints: false }, levels: { kristal: { unlocked: true, done: true, bestTime: 120.5, bestCoins: 60, stars: 2, crystals: 5 } } };
    localStorage.setItem(S.KEY, JSON.stringify(v1));
    const d = S._reload();
    const stored = JSON.parse(localStorage.getItem(S.KEY));
    return { d: JSON.parse(JSON.stringify(d)), storedV: stored.v };
  });
  const d = e9.d;
  check(d.v === 2 && e9.storedV === 2 && d.migratedFrom === 1, 'E9 v1 blob migrates to v: 2 and is written back', `v ${d.v}, stored ${e9.storedV}`);
  check(d.wallet === 42 && d.cosmetics.hat === 'hat:leaf' && d.cosmetics.owned.includes('hat:leaf') && d.cosmetics.owned.includes('scarf:4dabf7') && d.settings.mute === true && d.settings.invertY === true && d.settings.quality === 'low' && d.levels.kristal.bestTime === 120.5 && d.levels.kristal.stars === 2, 'E9 every v1 value survives', JSON.stringify({ wallet: d.wallet, cos: d.cosmetics, k: d.levels.kristal }));
  const st = d.settings, lv = d.levels.kristal;
  check(st.assist === false && st.simpleTouch === false && st.leftHanded === false && st.reduceShake === false && st.camSens === 1 && st.musicVol === 0.6 && st.sfxVol === 0.9 && st.qualityAuto === null && 'autoCam' in st, 'E9 new settings defaults (assist, simpleTouch, leftHanded, reduceShake, camSens, volumes, qualityAuto, autoCam)', JSON.stringify(st));
  check(lv.vista === false && lv.secret === false && lv.bestTimeAssist === null && lv.attempts === 0 && d.stats && d.flags && d.daily && d.createdAt && d.updatedAt, 'E9 per-level vista/secret/bestTimeAssist/attempts + stats/flags/daily', JSON.stringify(lv));

  // Mechanic stubs + ambientfx
  const mech = await page.evaluate(async () => {
    const m = await import('./src/engine/mechanics/index.js');
    const a = await import('./src/engine/ambientfx.js');
    return { names: m.MECHANICS.map((x) => x.name), installs: m.MECHANICS.every((x) => typeof x.install === 'function'), ambient: typeof a.init === 'function' };
  });
  check(JSON.stringify(mech.names) === JSON.stringify(['crumble', 'ice', 'lava', 'cannon', 'geyser', 'wind', 'movers', 'signals', 'heart', 'vista', 'boss', 'enemies-extra']) && mech.installs && mech.ambient, 'mechanics/index.js imports all 12 modules in order; ambientfx.init exists', mech.names.join(','));

  // E7 transmission swap
  const e7 = await page.evaluate(async () => {
    const m = await window.__game.world.L?.assets?.model?.('Lantern_01').catch(() => null) ?? await (await import('./src/engine/assets.js')).model('Lantern_01');
    let trans = 0, swapped = 0, mats = 0;
    m.traverse((o) => { if (o.isMesh) for (const x of [].concat(o.material)) { mats++; if (x.transmission > 0) trans++; if (x.userData.glassSwap) swapped++; } });
    return { trans, swapped, mats };
  });
  check(e7.trans === 0, 'E7 no transmission material left on Lantern_01 after the GLB post-process', JSON.stringify(e7));

  // audio: theme loops load on level load and release on unload; playMusic crossfade
  const au = await page.evaluate(async () => {
    const { g } = window.__ec, A = g.audio, out = {};
    A.unlock();
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (fn, ms = 8000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (fn()) return true; await wait(100); } return false; };
    out.api = ['playMusic', 'playLoop', 'stopLoops', 'setLoopGain', 'releaseLevelMusic'].every((k) => typeof A[k] === 'function');
    g.startLevel('test');                                     // theme.ambience ['amb_waves']
    out.ambLoaded = await until(() => A.isLooping('amb_waves') && A.has('amb_waves'));
    A.playMusic('music_menu_cheeky_monkey', { crossfade: 0.3 });
    out.music = await until(() => A.isLooping('__music'));
    g.world.unload();
    out.released = !A.isLooping('amb_waves') && !A.has('amb_waves') && !A.has('music_menu_cheeky_monkey') && !A.isLooping('__music');
    return out;
  });
  check(au.api, 'audio exposes playMusic / playLoop / stopLoops / setLoopGain / releaseLevelMusic');
  check(au.ambLoaded, 'theme ambience decoded + looping after level load', JSON.stringify(au));
  check(au.music, 'audio.playMusic starts a crossfaded music loop');
  check(au.released, 'world.unload stops loops and releases ambience + playMusic buffers');

  check(errors.length === 0, 'no page/console errors (main page)', errors.slice(0, 4).join(' | '));
  await page.close();

  // ------------------------------------------------------------------ medium + low tiers
  for (const q of ['medium', 'low']) {
    const { page: p2, errors: err2 } = await open('quality=' + q + '&level=kristal');
    const r = await p2.evaluate(async () => {
      const g = window.__game; await g.test.ready();
      for (let i = 0; i < 5; i++) g.test.tick(1 / 60, {});
      const seen = []; for (let i = 0; i < 4; i++) { g.core.render(); seen.push(g.core.stats().glDraws); }
      return { seen, shadows: g.core.renderer.shadowMap.enabled, sunCasts: g.core.sun.castShadow, tier: g.core.quality.tier, budget: g.core.quality.drawBudget, reflectEvery: g.core.quality.reflectEvery, hdriRes: (await import('./src/engine/assets.js')).settings.hdriRes, blob: !!g.core.scene.children.find((o) => o.geometry?.type === 'CircleGeometry' && o.material?.opacity > 0) };
    });
    if (q === 'medium') {
      const alt = r.seen[0] !== r.seen[1] && r.seen[0] === r.seen[2] && r.seen[1] === r.seen[3];
      check(r.tier === 'medium' && r.reflectEvery === 2 && alt && r.shadows && Math.max(...r.seen) <= r.budget, 'E8 medium: reflection every 2nd frame (draws alternate), within 500', JSON.stringify(r.seen));
      check(r.hdriRes === '1k', 'E7 medium prefers _1k HDRIs');
    } else {
      check(r.tier === 'low' && !r.shadows && !r.sunCasts && r.blob && Math.max(...r.seen) <= r.budget, 'E8 low: shadow map off (blob shadow stays), within 250', JSON.stringify(r));
      check(r.hdriRes === '1k', 'E7 low prefers _1k HDRIs');
    }
    check(err2.length === 0, `no page/console errors (${q})`, err2.slice(0, 3).join(' | '));
    await p2.close();
  }
} catch (e) { check(false, 'exception', String(e?.stack || e)); }
await browser.close();
console.log(`\n${total - fails}/${total} engine checks ok`);
process.exit(fails ? 1 : 0);
