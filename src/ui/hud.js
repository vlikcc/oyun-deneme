// HUD: hearts / coins / crystals / timer, toast, hint, pause button, fade flash, ?debug=1 stats. DOM created here.
import { player } from '../engine/physics.js';
import * as world from '../engine/world.js';
import { flags, stats } from '../engine/core.js';
import { on } from '../engine/bus.js';

const $ = (s) => document.querySelector(s);
let els = null, toastTimer = 0, fpsAcc = 0, fpsN = 0, fpsShown = 0;
const handlers = { onPause: null };

export function init({ onPause } = {}) {
  if (els) return els;
  handlers.onPause = onPause;
  document.body.insertAdjacentHTML('beforeend', `
<div id="hud" class="hidden">
  <div class="pill" id="hearts">❤❤❤</div>
  <div class="pill">🪙 <span id="coins">0</span></div>
  <div class="pill">💎 <span id="crystals">0</span>/<span id="crystalsTotal">5</span></div>
</div>
<div class="pill hidden" id="timer">0:00</div>
<button id="pauseBtn" class="hidden" title="Duraklat (P)" aria-label="Duraklat">II</button>
<div id="toast"></div>
<div id="hint" class="hidden">Kamerayı döndürmek için ekrana tıkla · <kbd>Esc</kbd> fareyi bırakır</div>
<div id="debug" class="hidden"></div>
<div id="fade"></div>`);
  els = { hud: $('#hud'), hearts: $('#hearts'), coins: $('#coins'), crystals: $('#crystals'), crystalsTotal: $('#crystalsTotal'), timer: $('#timer'), pauseBtn: $('#pauseBtn'), toast: $('#toast'), hint: $('#hint'), debug: $('#debug'), fade: $('#fade') };
  els.pauseBtn.addEventListener('click', () => handlers.onPause?.());
  if (flags.debug) els.debug.classList.remove('hidden');
  on('hud', refresh); on('toast', toast); on('respawn', fadeFlash);
  on('pointerlock', (locked) => { els.hint.style.opacity = locked ? 0 : 1; });
  return els;
}
export function refresh() {
  if (!els) return;
  els.hearts.textContent = '❤'.repeat(Math.max(0, player.hearts)) + '♡'.repeat(Math.max(0, player.maxHearts - player.hearts));
  els.coins.textContent = player.coins;
  els.crystals.textContent = player.crystals;
  els.crystalsTotal.textContent = world.level?.crystals ?? world.crystals.length;
}
export function toast(text, secs = 1.6) { if (!els) return; els.toast.textContent = text; els.toast.classList.add('show'); toastTimer = secs; }
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
}
export function update(dt) {
  if (!els) return;
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) els.toast.classList.remove('show'); }
  if (flags.debug) {
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { fpsShown = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    const s = stats();
    els.debug.textContent = `fps ${fpsShown}\ncalls ${s.calls}\ntris ${s.triangles}\npos ${player.pos.x.toFixed(1)} ${player.pos.y.toFixed(1)} ${player.pos.z.toFixed(1)}`;
  }
}
export const hud = { init, refresh, toast, fadeFlash, setTimer, setHint, setVisible, update };
export default hud;
