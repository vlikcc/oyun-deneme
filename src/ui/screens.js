// Overlays: start, level select, pause, win. DOM created by JS (CSS in src/ui/ui.css). All strings Turkish.
// Level select structure (kept simple on purpose, a designer pass comes later):
//   #selectScreen .card > h1 + ul.levels > li.level-card[data-id][data-locked="0|1"] > .lv-name .lv-stars .lv-sub .lv-best
import * as save from '../engine/save.js';
import * as audio from '../engine/audio.js';

const $ = (s) => document.querySelector(s);
let els = null, current = null;
const h = {};

export function init(handlers = {}) {
  Object.assign(h, handlers);
  if (els) return els;
  document.body.insertAdjacentHTML('beforeend', `
<div class="overlay hidden" id="startScreen">
  <div class="card">
    <h1>Pıtır'ın Kristal Adası</h1>
    <p>Adaların Güneş Kristalleri dağılmış! Hepsini topla, başlangıçtaki <b>gökkuşağı kapısı</b> açılsın.</p>
    <div class="keys">
      <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>Koş (kameraya göre)</span>
      <span><kbd>Boşluk</kbd></span><span>Zıpla — basılı tut: yüksek, ardı ardına 3 kez: üçlü zıplama</span>
      <span><kbd>Shift</kbd></span><span>Havadayken: yere çakılma (düşmanları ezer)</span>
      <span>Fare / <kbd>Q</kbd><kbd>E</kbd></span><span>Kamerayı döndür</span>
      <span><kbd>M</kbd> · <kbd>P</kbd></span><span>Ses aç/kapa · Duraklat</span>
    </div>
    <p class="small">Pelteleri üstlerine zıplayarak ez — ama dikenlilere dokunma! Gamepad de çalışır.</p>
    <button class="big" id="startBtn">Başla!</button>
    <p class="tiny">Sesler: zapsplat.com · Dokular &amp; gökyüzü: polyhaven.com, freepbr.com · Ağaçlar: 3dassets.dev · Deniz: jbouny/ocean</p>
  </div>
</div>
<div class="overlay hidden" id="selectScreen">
  <div class="card">
    <h1>Adalar</h1>
    <p class="small">Bir ada seç. Yıldızlar: bitir ★ · tüm altınlar ★ · hızlı bitir ★</p>
    <ul class="levels" id="levelList"></ul>
    <div class="row"><button class="big alt" id="selectBackBtn">Geri</button></div>
  </div>
</div>
<div class="overlay hidden" id="pauseScreen">
  <div class="card">
    <h1>Duraklatıldı</h1>
    <p>Devam etmek için <kbd>P</kbd> tuşuna bas.</p>
    <div class="settings-row">
      <label><input type="checkbox" id="optMute"> Ses kapalı</label>
      <label><input type="checkbox" id="optMusic" checked> Müzik</label>
    </div>
    <div class="row"><button class="big" id="resumeBtn">Devam</button><button class="big alt" id="pauseLevelsBtn">Adalar</button></div>
  </div>
</div>
<div class="overlay hidden" id="winScreen">
  <div class="card">
    <h1>Ada Kurtarıldı!</h1>
    <div class="stars-big" id="winStars">★★★</div>
    <p id="winStats"></p>
    <div class="row"><button class="big" id="nextBtn">Sonraki Ada</button><button class="big alt" id="levelsBtn">Adalar</button><button class="big alt" id="againBtn">Tekrar</button></div>
  </div>
</div>`);
  els = { start: $('#startScreen'), select: $('#selectScreen'), pause: $('#pauseScreen'), win: $('#winScreen'), levelList: $('#levelList'), winStats: $('#winStats'), winStars: $('#winStars'), nextBtn: $('#nextBtn') };
  $('#startBtn').onclick = () => h.onStart?.();
  $('#selectBackBtn').onclick = () => h.onBack?.();
  $('#resumeBtn').onclick = () => h.onResume?.();
  $('#pauseLevelsBtn').onclick = () => h.onLevels?.();
  $('#nextBtn').onclick = () => h.onNext?.();
  $('#levelsBtn').onclick = () => h.onLevels?.();
  $('#againBtn').onclick = () => h.onRetry?.();
  const s = save.get().settings;
  const mute = $('#optMute'), music = $('#optMusic');
  mute.checked = !!s.mute; music.checked = s.music !== false;
  audio.setMuted(mute.checked); audio.state.musicEnabled = music.checked;
  mute.onchange = () => { audio.setMuted(mute.checked); save.setSetting('mute', mute.checked); };
  music.onchange = () => { audio.setMusicEnabled(music.checked); save.setSetting('music', music.checked); };
  els.levelList.addEventListener('click', (e) => {
    const li = e.target.closest('li.level-card'); if (!li) return;
    if (li.dataset.soon === '1') { h.onSelect?.(li.dataset.id); return; }   // comingSoon: main.js toasts "Yakında!" (§13)
    if (li.dataset.locked === '1') return;
    h.onSelect?.(li.dataset.id);
  });
  return els;
}
export function show(name) {
  if (!els) return;
  for (const k of ['start', 'select', 'pause', 'win']) els[k].classList.toggle('hidden', k !== name);
  if (name === 'pause') {           // the M key toggles audio without touching the DOM: resync the boxes
    const m = $('#optMute'), mu = $('#optMusic');
    if (m) m.checked = !!audio.state.muted;
    if (mu) mu.checked = audio.state.musicEnabled !== false;
  }
  current = name;
}
export function hide() { show(null); }
export function visible(name) { return !!els && !els[name].classList.contains('hidden'); }
export function currentScreen() { return current; }

const fmt = (t) => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;
const starStr = (n) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
/** renderSelect(levels) — levels: [{id, name, subtitle, order}] (campaign list). Uses save data for lock/best/stars. */
export function renderSelect(levels) {
  if (!els) return;
  els.levelList.innerHTML = levels.map((lv) => {
    const e = save.level(lv.id);
    const soon = !!lv.comingSoon;                 // not built yet (ARCHITECTURE §12): shown as "Yakında", never startable
    const locked = soon || !e.unlocked;
    return `<li class="level-card" data-id="${lv.id}" data-locked="${locked ? 1 : 0}" data-soon="${soon ? 1 : 0}" tabindex="0" role="button" aria-label="${lv.name}">
      <div class="lv-name">${lv.order}. ${lv.name}${soon ? ' 🚧' : locked ? ' 🔒' : ''}</div>
      <div class="lv-stars">${soon ? '' : starStr(e.stars)}</div>
      <div class="lv-sub">${lv.subtitle || ''}</div>
      <div class="lv-best">${soon ? 'Yakında' : e.bestTime != null ? `En iyi süre: ${fmt(e.bestTime)} · Altın: ${e.bestCoins}` : locked ? 'Önceki adayı bitirince açılır' : 'Henüz oynanmadı'}</div>
    </li>`;
  }).join('');
}
export function showWin({ time, coins, coinsTotal, crystals, crystalsTotal, stars, starFlags, hasNext, newBest }) {
  if (!els) return;
  els.winStars.innerHTML = [starFlags?.done, starFlags?.coins, starFlags?.time].map((f) => `<span class="${f ? 'on' : 'off'}">★</span>`).join('');
  els.winStats.innerHTML = `Süre: <b>${fmt(time)}</b>${newBest ? ' 🏆' : ''} · Altın: <b>${coins}</b> / ${coinsTotal} · Kristal: <b>${crystals}</b> / ${crystalsTotal}<br>` +
    `<span class="small">${stars === 3 ? 'Mükemmel! Üç yıldız!' : starFlags?.coins ? 'Tüm altınlar toplandı!' : starFlags?.time ? 'Hızlı bitirdin!' : 'Pıtır ve ada sana minnettar! 🌱'}</span>`;
  els.nextBtn.style.display = hasNext ? '' : 'none';
  show('win');
}
export const screens = { init, show, hide, visible, currentScreen, renderSelect, showWin };
export default screens;
