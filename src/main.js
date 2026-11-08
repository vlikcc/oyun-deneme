// Bootstrap + game state machine (menu → select → play → paused/win) + main loop + window.__game test hooks (§8).
import * as THREE from 'three';
import * as core from './engine/core.js';
import { renderer, camera, scene, time, flags, params } from './engine/core.js';
import * as physics from './engine/physics.js';
import { player, sim, STEP } from './engine/physics.js';
import * as playerVisual from './engine/player.js';
import * as enemies from './engine/enemies.js';
import * as world from './engine/world.js';
import * as cameraApi from './engine/camera.js';
import { cam } from './engine/camera.js';
import * as fx from './engine/fx.js';
import * as audio from './engine/audio.js';
import * as input from './engine/input.js';
import * as touch from './engine/touch.js';
import * as save from './engine/save.js';
import * as hud from './ui/hud.js';
import * as screens from './ui/screens.js';
import { on } from './engine/bus.js';
import { LEVELS, ALL_LEVELS, PLAYABLE, levelById, nextLevel, isPlayable } from './levels/index.js';

let state = 'menu';          // 'menu' | 'select' | 'play' | 'paused' | 'win'
let elapsed = 0, acc = 0;
let currentId = null;
const idleInput = { ix: 0, iy: 0, look: 0, jump: false, jumpHeld: false, pound: false, yaw: 0 };

function setState(s) { state = s; sim.playing = s === 'play'; document.body.dataset.state = s; }

// ---------------------------------------------------------------- flow
export function loadLevel(id) {
  const lv = levelById(id); if (!lv) throw new Error('unknown level ' + id);
  if (!isPlayable(lv)) throw new Error(`level ${id} is not built yet (comingSoon)`);
  currentId = id;
  if (flags.test) fx.reseed(12345);
  world.load(lv, { seed: lv.seed ?? 7 });
  hud.refresh();
  elapsed = 0; acc = 0;
  return lv;
}
export function startLevel(id) {
  const lv = loadLevel(id ?? PLAYABLE[0].id);
  cam.idle = false;
  setState('play');
  screens.hide();
  hud.setVisible(true); hud.setTimer(0);
  input.setEnabled(true); input.clearEdges();
  if (!flags.test) { audio.unlock(); hud.toast('Kristalleri bul!', 1.6); input.requestPointer(); }
  return lv;
}
function showMenu() {
  setState('menu');
  cam.idle = true; cam.yaw = 0.6;
  hud.setVisible(false); input.setEnabled(false); input.releasePointer();
  if (!flags.test) screens.show('start');
}
function showSelect() {
  setState('select');
  cam.idle = true;
  hud.setVisible(false); input.setEnabled(false); input.releasePointer();
  save.ensureUnlocks(LEVELS);
  screens.renderSelect(LEVELS);
  screens.show('select');
}
function setPaused(v) {
  if (v && state === 'play') { setState('paused'); screens.show('pause'); input.releasePointer(); audio.suspend(); }
  else if (!v && state === 'paused') { setState('play'); screens.hide(); audio.resume(); input.clearEdges(); if (!flags.test) input.requestPointer(); }
}
function onWin() {
  if (state !== 'play') return;
  setState('win');
  audio.sfx.win(); input.releasePointer(); input.setEnabled(false);
  const lv = world.level;
  const next = nextLevel(lv.id);
  const res = save.levelResult(lv.id, { time: elapsed, coins: player.coins, coinsTotal: lv.coinsTotal ?? world.coins.length, crystals: player.crystals, parTime: lv.parTime ?? Infinity, nextId: next?.id ?? null });
  screens.showWin({ time: elapsed, coins: player.coins, coinsTotal: lv.coinsTotal ?? world.coins.length, crystals: player.crystals, crystalsTotal: lv.crystals, stars: res.stars, starFlags: res.starFlags, hasNext: !!next, newBest: res.newBest });
}

// ---------------------------------------------------------------- UI wiring
hud.init({ onPause: () => (state === 'play' ? setPaused(true) : state === 'paused' ? setPaused(false) : null) });
screens.init({
  onStart: () => { audio.unlock(); showSelect(); },
  onBack: () => showMenu(),
  onSelect: (id) => { audio.unlock(); if (isPlayable(levelById(id))) startLevel(id); else hud.toast('Yakında!', 1.2); },
  onResume: () => setPaused(false),
  onLevels: () => { showSelect(); },
  onNext: () => { const n = nextLevel(currentId); if (n) startLevel(n.id); else showSelect(); },
  onRetry: () => startLevel(currentId),
});
on('win', onWin);
on('key:pause', (code) => {
  if (state === 'play') setPaused(true);
  else if (state === 'paused' && code !== 'Escape') setPaused(false);
});
on('key:mute', () => { const m = audio.toggleMute(); save.setSetting('mute', m); hud.toast(m ? 'Ses kapalı' : 'Ses açık', 0.8); });
on('respawn', () => cameraApi.snap());
if (flags.touch) touch.init({ root: document.body, onPause: () => setPaused(true) });
addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') setPaused(true); });

// ---------------------------------------------------------------- test hooks (§8)
function makeInput(i = {}) {
  return { ix: i.ix ?? 0, iy: i.iy ?? 0, look: i.look ?? 0, jump: !!i.jump, jumpHeld: i.jumpHeld ?? !!i.jump, pound: !!i.pound, yaw: i.yaw ?? cam.yaw };
}
window.__game = {
  ready: false,
  levels: PLAYABLE.map((l) => ({ id: l.id, name: l.name, order: l.order })),                       // loadable campaign levels (smoke --all)
  allLevels: ALL_LEVELS.map((l) => ({ id: l.id, name: l.name, order: l.order, hidden: !!l.hidden, comingSoon: !!l.comingSoon })),
  get state() { return state; },
  get level() { return world.level; },        // the loaded level module (tools/smoke.mjs reads .testPath)
  player, enemies: enemies.enemies, coins: world.coins, crystals: world.crystals, colliders: physics.colliders, cam,
  world, physics, core, audio, save, screens, hud, fx,
  loadLevel(id) { loadLevel(id); return world.level; },
  startLevel(id) { return startLevel(id); },
  setPaused, showSelect, showMenu,
  test: {
    async start(id) { startLevel(id ?? PLAYABLE[0].id); await Promise.resolve(); return world.level; },
    ready() { return world.whenReady(); },     // resolves when async props / tree batches of the level have loaded
    tick(dt = 1 / 60, i = {}) {
      const inp = makeInput(i);
      time.dt = dt; time.now += dt; elapsed += state === 'play' ? dt : 0;
      world.step(dt, time.now, inp);
      world.update(dt, time.now);
      scene.updateMatrixWorld(true);   // test ticks never render: refresh matrices for the raycast probes
      playerVisual.updateBlob();
      playerVisual.update(dt, time.now);
      fx.update(dt);
      cameraApi.update(dt, inp.look);
      hud.update(dt); hud.setTimer(elapsed);
      return { pos: player.pos.toArray(), vel: player.vel.toArray(), grounded: player.grounded, state };
    },
    teleport(x, y, z) { player.pos.set(x, y, z); player.vel.set(0, 0, 0); player.extVel.set(0, 0, 0); player.prevY = y; player.grounded = false; physics.setGround(null); cameraApi.snap(); },
    groundBelow(x, y, z) { return playerVisual.groundBelow(x, y, z); },
    report() { return world.report(); },
    collectAll() { world.collectAll(); },
    portalPos() { return world.portal.pos.toArray(); },
    win: onWin,
  },
};

// ---------------------------------------------------------------- boot
save.ensureUnlocks(LEVELS);
{
  const startId = params.get('level');
  if (startId && isPlayable(levelById(startId))) startLevel(startId);
  else { loadLevel(PLAYABLE[0].id); showMenu(); }
  window.__game.ready = true;
}

// ---------------------------------------------------------------- main loop (fixed 120 Hz physics inside a variable frame)
const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop(() => {
  timer.update();
  let dt = Math.min(Math.max(timer.getDelta(), 0), 0.1);
  hud.update(dt);
  if (fx.feel.hitStop > 0) { fx.feel.hitStop -= dt; dt *= 0.05; }      // hit-stop: real-time countdown, slowed sim
  if (state === 'paused') dt = 0;
  time.dt = dt; time.now += dt;

  const inp = state === 'play' ? input.read() : idleInput;
  if (dt > 0) {
    acc += dt;
    while (acc >= STEP) { world.step(STEP, time.now, inp); acc -= STEP; }
    if (state === 'play') { elapsed += dt; hud.setTimer(elapsed); }
  }
  world.update(dt, time.now);
  playerVisual.update(dt, time.now);
  fx.update(dt);
  playerVisual.updateBlob();
  cameraApi.update(dt, inp.look);
  core.render();
});
