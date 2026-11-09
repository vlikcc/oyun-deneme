// HUD (GDD §4.10, §5.1): hearts (up to 5), coins, crystal gem slots, 🔑 / 🏮 slots when the level has them, timer, toast,
// hint, pause button, fade flash, ?debug=1 stats — plus the feel layer that lives on top of play:
//   * level start fly-in (2 s camera override from high above down to Pıtır) + "Hazır… Başla!" (any key / tap skips),
//   * sparkle guide: after 45 s without progress (crystal / checkpoint) and with İpuçları on, a ✨ arrow + a sparkle trail
//     point at the nearest uncollected crystal,
//   * 25-coin `one_up` jingle, `vibes_descend` on faint, Yardım Modu offer after the 3rd faint on the same island,
//   * "Titreme azalt" (settings.reduceShake) clamps the camera trauma every frame.
// Slots API: hud.setSlot('key'|'lantern', n, total) — or bus 'hud:slot' (kind, n, total); lanterns also follow the
// signals.js count signal (world.emit('lanterns', 'count', n)) with total = level.lanterns ?? 4; keys follow player.keys.
// DOM is created here; CSS in src/ui/ui.css.
import { player } from '../engine/physics.js';
import * as world from '../engine/world.js';
import { flags, stats } from '../engine/core.js';
import { cam } from '../engine/camera.js';
import * as cameraApi from '../engine/camera.js';
import * as fx from '../engine/fx.js';
import * as audio from '../engine/audio.js';
import * as save from '../engine/save.js';
import * as input from '../engine/input.js';
import { on } from '../engine/bus.js';

const $ = (s) => document.querySelector(s);
let els = null, toastTimer = 0, fpsAcc = 0, fpsN = 0, fpsShown = 0;
const handlers = { onPause: null };
const playing = () => document.body.dataset.state === 'play';
const snd = (k) => { if (audio.context) audio.play(k); };

export function init({ onPause } = {}) {
  if (els) return els;
  handlers.onPause = onPause;
  document.body.insertAdjacentHTML('beforeend', `
<div id="hud" class="hidden">
  <div class="pill" id="hearts" aria-label="Kalpler"></div>
  <div class="pill"><span class="ico">🪙</span><span id="coins">0</span></div>
  <div class="pill gems" aria-label="Kristaller"><span id="gemSlots"></span><span class="sr"><span id="crystals">0</span>/<span id="crystalsTotal">5</span></span></div>
  <div class="pill slot hidden" id="keySlot"><span class="ico">🔑</span><span id="keyCount"></span></div>
  <div class="pill slot hidden" id="lanternSlot"><span class="ico">🏮</span><span id="lanternCount">0/4</span></div>
</div>
<div class="pill hidden" id="timer">0:00</div>
<button id="pauseBtn" class="hidden" title="Duraklat (P)" aria-label="Duraklat">II</button>
<div id="toast" role="status"></div>
<div id="ready" aria-hidden="true"></div>
<div id="guide" class="hidden" aria-hidden="true"><span class="arrow">➜</span><span class="lbl">✨ Kristal bu yönde!</span></div>
<div id="assistOffer" class="hidden" role="dialog" aria-label="Yardım Modu"><span>Yardım Modu'nu açalım mı? 🤝</span><button id="assistYes">Evet</button><button id="assistNo">Hayır</button></div>
<div id="hint" class="hidden">Kamerayı döndürmek için ekrana tıkla · <kbd>Esc</kbd> fareyi bırakır</div>
<div id="debug" class="hidden"></div>
<div id="fade"></div>`);
  els = { hud: $('#hud'), hearts: $('#hearts'), coins: $('#coins'), crystals: $('#crystals'), crystalsTotal: $('#crystalsTotal'), gemSlots: $('#gemSlots'),
    keySlot: $('#keySlot'), keyCount: $('#keyCount'), lanternSlot: $('#lanternSlot'), lanternCount: $('#lanternCount'),
    timer: $('#timer'), pauseBtn: $('#pauseBtn'), toast: $('#toast'), ready: $('#ready'), guide: $('#guide'), offer: $('#assistOffer'), hint: $('#hint'), debug: $('#debug'), fade: $('#fade') };
  els.pauseBtn.addEventListener('click', () => handlers.onPause?.());
  if (flags.debug) els.debug.classList.remove('hidden');
  on('hud', refresh); on('toast', toast); on('respawn', fadeFlash);
  on('pointerlock', (locked) => { els.hint.style.opacity = locked ? 0 : 1; });
  // feel layer wiring
  on('level:loaded', onLevelLoaded);
  on('level:unloaded', () => { endIntro(true); hideGuide(); slots.key = slots.lantern = null; renderSlots(); });
  on('crystal', progress); on('checkpoint', progress);
  on('coin', () => { if (player.coins > 0 && player.coins % 25 === 0) snd('one_up'); });
  on('faint', onFaint);
  on('hud:slot', (kind, n, total) => setSlot(kind, n, total));
  on('signal:lanterns:count', (n) => setSlot('lantern', n, slots.lantern?.total ?? world.level?.lanterns ?? 4));   // signals.js announces the real lantern count first
  els.offer.querySelector('#assistYes').addEventListener('click', () => { closeOffer(); acceptAssist(); });
  els.offer.querySelector('#assistNo').addEventListener('click', () => closeOffer());
  return els;
}

// ---------------------------------------------------------------- counters
let lastHearts = -1, lastMax = -1, lastGems = '';
export function refresh() {
  if (!els) return;
  const max = Math.max(1, Math.min(5, player.maxHearts | 0)), n = Math.max(0, Math.min(max, player.hearts | 0));
  if (n !== lastHearts || max !== lastMax) {
    const lost = n < lastHearts && lastMax === max;
    els.hearts.innerHTML = Array.from({ length: max }, (_, i) => `<span class="heart${i < n ? '' : ' empty'}${lost && i === n ? ' lost' : ''}">${i < n ? '❤' : '♡'}</span>`).join('');
    lastHearts = n; lastMax = max;
  }
  els.coins.textContent = player.coins;
  const total = world.level?.crystals ?? world.crystals.length;
  els.crystals.textContent = player.crystals;
  els.crystalsTotal.textContent = total;
  const key = `${player.crystals}/${total}`;
  if (key !== lastGems) {
    const prev = +(lastGems.split('/')[0] || 0);
    els.gemSlots.innerHTML = Array.from({ length: Math.max(0, total) }, (_, i) => `<span class="gem${i < player.crystals ? ' full' : ''}${i < player.crystals && i >= prev && lastGems ? ' pop' : ''}">◆</span>`).join('');
    lastGems = key;
  }
  renderSlots();
}
const slots = { key: null, lantern: null };
/** setSlot('key'|'lantern', n, total) — shows the 🔑 / 🏮 slot (null n hides it). */
export function setSlot(kind, n, total) {
  if (!(kind in slots)) return;
  slots[kind] = n == null ? null : { n, total };
  renderSlots();
}
function renderSlots() {
  if (!els) return;
  const keys = player.keys && typeof player.keys.size === 'number' ? player.keys.size : null;
  const k = slots.key ?? (keys ? { n: keys } : null);
  els.keySlot.classList.toggle('hidden', !k || !k.n);
  if (k) els.keyCount.textContent = k.n > 1 ? `×${k.n}` : '';
  const l = slots.lantern;
  els.lanternSlot.classList.toggle('hidden', !l);
  if (l) els.lanternCount.textContent = `${l.n}/${l.total ?? 4}`;
}
export function toast(text, secs = 1.6) { if (!els) return; els.toast.textContent = text; els.toast.classList.remove('show'); void els.toast.offsetWidth; els.toast.classList.add('show'); toastTimer = secs; }
export function fadeFlash() { if (!els) return; els.fade.style.opacity = 1; setTimeout(() => (els.fade.style.opacity = 0), 260); }
export function setTimer(seconds) {
  if (!els) return;
  const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60).toString().padStart(2, '0');
  els.timer.textContent = `${m}:${s}`;
}
export function setHint(html) { if (els) els.hint.innerHTML = html; }
export function setVisible(v) {
  if (!els) return;
  for (const k of ['hud', 'timer', 'pauseBtn']) els[k].classList.toggle('hidden', !v);
  els.hint.classList.toggle('hidden', !v || flags.touch || flags.test);
  if (!v) { hideGuide(); if (!playing()) closeOffer(); }
}

// ---------------------------------------------------------------- fly-in + "Hazır… Başla!" (GDD §4.1 / §4.10)
let intro = null;   // { t, yaw, pitch, dist, phase, unsub }
const INTRO_T = 2.0;
function onLevelLoaded(lv) {
  lastHearts = -1; lastGems = '';
  noProgress = 0; hideGuide(); closeOffer();
  if (faintLevel !== lv?.id) { faintLevel = lv?.id; faints = 0; }
  slots.key = null; slots.lantern = lv?.lanterns ? { n: 0, total: lv.lanterns } : null;
  // startLevel() switches the state to 'play' right after loadLevel(): decide once that has happened
  queueMicrotask(() => { if (playing() && !flags.test && !lv?.hidden) startIntro(lv); });
}
export function startIntro(lv = world.level) {
  if (!els || !lv) return;
  endIntro(true);
  const yaw = cam.yaw, pitch = cam.pitch, dist = cam.dist;
  // far view: high above, looking down across the island toward the first objective, then a 2 s tween back to the spawn view
  cameraApi.setOverride({ yaw: yaw + 0.7, pitch: 1.18, dist: 40, t: 0.001, hold: 10 });
  cameraApi.snap();
  cameraApi.setOverride({ yaw, pitch, dist, t: INTRO_T, hold: 0 });
  player.controlLock = INTRO_T + 0.2;
  intro = { t: 0, yaw, pitch, dist, phase: 0 };
  const skip = (e) => { if (e.type === 'keydown' && (e.code === 'KeyP' || e.code === 'Escape' || e.code === 'KeyM')) return; if (intro && playing()) finishIntro(true); };
  addEventListener('keydown', skip, true); addEventListener('pointerdown', skip, true);
  intro.unsub = () => { removeEventListener('keydown', skip, true); removeEventListener('pointerdown', skip, true); };
  setReady('Hazır…', 'ready'); snd('ui_select_1');
}
function setReady(text, cls) {
  els.ready.textContent = text; els.ready.className = '';
  void els.ready.offsetWidth; els.ready.className = 'show ' + cls;
}
function finishIntro(skipped) {
  if (!intro) return;
  if (skipped) {
    cameraApi.setOverride({ yaw: intro.yaw, pitch: intro.pitch, dist: intro.dist, t: 0.25, hold: 0 });
    input.clearEdges?.();
  }
  player.controlLock = 0;
  setReady('Başla!', 'go'); snd('ui_select_2');
  intro.unsub?.(); intro = null;
  setTimeout(() => { if (!intro && els.ready.classList.contains('go')) els.ready.className = ''; }, 900);
}
function endIntro(silent) {
  if (!intro) return;
  intro.unsub?.(); intro = null;
  if (silent && els) els.ready.className = '';
}
export function introActive() { return !!intro; }

// ---------------------------------------------------------------- sparkle guide (45 s without progress, İpuçları on)
let noProgress = 0, guideT = 0, guideTarget = null, trailT = 0;
const GUIDE_AFTER = 45, GUIDE_SHOW = 5;
function progress() { noProgress = 0; hideGuide(); }
function nearestCrystal() {
  let best = null, bd = Infinity;
  for (const c of world.crystals) {
    if (c.taken || !c.group) continue;
    const p = c.group.position, d = (p.x - player.pos.x) ** 2 + (p.z - player.pos.z) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
/** showGuide() — point at the nearest uncollected crystal now (also used by tests). */
export function showGuide() {
  if (!els) return false;
  guideTarget = nearestCrystal();
  if (!guideTarget) return false;
  guideT = GUIDE_SHOW; trailT = 0;
  els.guide.classList.remove('hidden');
  snd('ui_hover_2');
  return true;
}
function hideGuide() { guideT = 0; guideTarget = null; els?.guide.classList.add('hidden'); }
function updateGuide(dt) {
  const st = save.get().settings;
  if (!playing() || intro || cam.override) return;
  if (flags.test && guideT <= 0) return;                     // tests drive showGuide() themselves
  if (st.hints === false) { if (guideT > 0) hideGuide(); noProgress = 0; return; }
  noProgress += dt;
  if (guideT <= 0 && noProgress >= GUIDE_AFTER) { noProgress = 0; showGuide(); }
  if (guideT <= 0 || !guideTarget) return;
  guideT -= dt;
  if (guideTarget.taken || guideT <= 0) { hideGuide(); return; }
  const tp = guideTarget.group.position;
  const dx = tp.x - player.pos.x, dz = tp.z - player.pos.z, len = Math.hypot(dx, dz) || 1;
  // screen arrow: angle of the target relative to the camera's forward (camera looks along -(sin yaw, cos yaw))
  const fx_ = -Math.sin(cam.yaw), fz_ = -Math.cos(cam.yaw);
  const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  const ang = Math.atan2((dx * rx + dz * rz) / len, (dx * fx_ + dz * fz_) / len);
  els.guide.style.setProperty('--a', `${ang - Math.PI / 2}rad`);
  // sparkle trail in the world: small gold bursts marching from Pıtır toward the crystal
  trailT -= dt;
  if (trailT <= 0) {
    trailT = 0.12;
    const k = ((GUIDE_SHOW - guideT) * 6) % Math.min(10, len);
    const p = player.pos.clone(); p.x += (dx / len) * (1.2 + k); p.z += (dz / len) * (1.2 + k); p.y += 0.9 + Math.sin(k) * 0.3;
    fx.burst(p, 4, 0xffe680, { speed: 0.7, up: 1.4, life: 0.8, size: 1.1, grav: 0.4, spread: 0.35 });
  }
}

// ---------------------------------------------------------------- faints → vibes_descend + Yardım Modu offer (GDD §4.7)
let faints = 0, faintLevel = null, offerT = 0;
function onFaint() {
  snd('vibes_descend');
  faints++;
  const d = save.get();
  if (faints >= 3 && !d.settings.assist && !d.flags?.assistOffered && !flags.test) {
    save.patch((x) => { x.flags.assistOffered = true; });
    setTimeout(() => { if (playing()) { els.offer.classList.remove('hidden'); offerT = 9; } }, 1200);
  }
}
function closeOffer() { offerT = 0; els?.offer.classList.add('hidden'); }
function acceptAssist() {
  save.setSetting('assist', true);
  try { window.__game?.applySettings?.(); } catch {}
  toast('Yardım Modu açık 🤝', 1.4);
}

// ---------------------------------------------------------------- per frame
export function update(dt) {
  if (!els) return;
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) els.toast.classList.remove('show'); }
  if (intro && playing()) {
    intro.t += dt;
    if (intro.t >= INTRO_T) finishIntro(false);
  }
  if (playing()) {
    updateGuide(dt);
    if (offerT > 0 && (offerT -= dt) <= 0) closeOffer();
    if (save.get().settings.reduceShake && fx.feel.trauma > 0.25) fx.feel.trauma = 0.25;   // Titreme azalt
    if (player.keys && typeof player.keys.size === 'number' && player.keys.size !== (renderSlots._k ?? 0)) { renderSlots._k = player.keys.size; renderSlots(); }
  }
  if (flags.debug) {
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { fpsShown = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    const s = stats();
    els.debug.textContent = `fps ${fpsShown}\ncalls ${s.calls}\ngl ${s.glDraws ?? '-'}\ntris ${s.triangles}\npos ${player.pos.x.toFixed(1)} ${player.pos.y.toFixed(1)} ${player.pos.z.toFixed(1)}`;
  }
}
export const hud = { init, refresh, toast, fadeFlash, setTimer, setHint, setVisible, update, setSlot, showGuide, startIntro, introActive };
export default hud;
