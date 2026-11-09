// Overlays (GDD §4.1–§4.7, §4.10): start, Harita (level select), pause, win card, Ayarlar, Krediler. DOM created by JS
// (CSS in src/ui/ui.css); every player-facing string is Turkish.
//
// Harita DOM contract (GDD §4.2; tools/flow-check.mjs relies on it):
//   #selectScreen .map-card > .map-wrap > svg.map-route + ul.levels#levelList
//     > li.level-card[data-id][data-locked="0|1"][data-soon="0|1"] > .lv-icon .lv-name .lv-stars .lv-best .lv-medal .lv-chips
//   #levelDetail (side panel: name, subtitle, par, the three star criteria with ticks, best/medal/chips, "Başla!" #playBtn)
//   Badge positions come from LAYOUT ({id, x%, y%}); narrow / short landscape screens get a snap-scrolling row (CSS only).
//   Tap a badge → it is selected and #levelDetail shows it; tapping the selected badge again (or Enter) starts it.
//   Locked → toast "Önce <ada> adasını kurtar" + ui_negative_blip; comingSoon → padlock + "Yakında" (toast "Yakında!").
// Win card: #winScreen (#iris portal iris → .win-card: #winStars pop one by one, #winStats time vs par + medal chip,
//   coins x/y, "Yeni rekor!", Kartpostal chip, wallet counter) with #nextBtn / #againBtn / #levelsBtn.
// Pause: #pauseScreen (#resumeBtn, #restartBtn, #pauseLevelsBtn, #optMute, #optMusic, #optAssist, #pauseSettingsBtn).
// Ayarlar: #settingsScreen (save.settings v2, applied live through window.__game.applySettings; quality on next load via
//   the boot script in index.html). Krediler: #creditsScreen (assets/CREDITS.md + Kartpostal count).
import * as save from '../engine/save.js';
import * as audio from '../engine/audio.js';
import * as world from '../engine/world.js';
import { flags, quality as coreQuality } from '../engine/core.js';
import { player } from '../engine/physics.js';
import { cam } from '../engine/camera.js';
import { on } from '../engine/bus.js';
import * as hud from './hud.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let els = null, current = null;
const h = {};
const SCREENS = ['start', 'select', 'pause', 'win', 'settings', 'credits'];

// ---------------------------------------------------------------- island table (GDD §2.1 / §4.2)
/** LAYOUT — map positions (percent of the map box) of the island badges, in route order. */
export const LAYOUT = [
  { id: 'kristal', x: 9, y: 70 },
  { id: 'kumsal', x: 21, y: 31 },
  { id: 'kar', x: 34, y: 69 },
  { id: 'volkan', x: 47, y: 29 },
  { id: 'orman', x: 60, y: 69 },
  { id: 'gok', x: 73, y: 29 },
  { id: 'fener', x: 86, y: 67 },
  { id: 'kanyon', x: 90, y: 22, bonus: true },
];
/** Fallbacks while an island module is still a placeholder (par/coins from GDD §2.1) + map visuals. */
const META = {
  kristal: { short: 'Kristal', label: 'Kristal Adası', par: 240, coins: 80, sky: '#9fdcff', icon: 'tower' },
  kumsal: { short: 'Kumsal', label: 'Gün Batımı Koyu', par: 210, coins: 95, sky: '#ffbe8a', icon: 'palm' },
  kar: { short: 'Kar Zirvesi', label: 'Kar Zirvesi', par: 240, coins: 95, sky: '#e2efff', icon: 'peak' },
  volkan: { short: 'Volkan', label: 'Volkan Adası', par: 240, coins: 100, sky: '#ff9a72', icon: 'volcano' },
  orman: { short: 'Orman', label: 'Kadim Tapınak', par: 270, coins: 110, sky: '#a8dcae', icon: 'ziggurat' },
  gok: { short: 'Gökyüzü', label: 'Gök Adaları', par: 240, coins: 100, sky: '#cbeaff', icon: 'whale' },
  fener: { short: 'Fener', label: 'Fener Adası', par: 300, coins: 100, sky: '#6676b8', icon: 'lighthouse' },
  kanyon: { short: 'Kızıl Kanyon', label: 'Kızıl Kanyon', par: null, coins: null, sky: '#f0a878', icon: 'mesa' },
};
const meta = (id) => META[id] || { short: id, par: null, coins: null, sky: '#cfe8ff', icon: 'tower' };

// silhouettes (64 × 64, ink outline) — tower / palm+sun / snow peak / volcano / ziggurat / cloud+whale / lighthouse / mesa
const SEA = '<path d="M-2 49c6-3 10 3 16 0s10 3 16 0 10 3 16 0 10 3 16 0v18H-2z" fill="#3b9ad6" stroke="#2b2140" stroke-width="2"/>';
const ICONS = {
  tower: `${SEA}<path d="M12 50c4-8 36-8 40 0z" fill="#7cd46a" stroke="#2b2140" stroke-width="2.5" stroke-linejoin="round"/><path d="M27 47V24h10v23z" fill="#f3e6cc" stroke="#2b2140" stroke-width="2.5" stroke-linejoin="round"/><path d="M25 25h14l-2-4H27z" fill="#ff8fa8" stroke="#2b2140" stroke-width="2.2" stroke-linejoin="round"/><path d="M32 6l7 8-7 8-7-8z" fill="#7fe8ff" stroke="#2b2140" stroke-width="2.5" stroke-linejoin="round"/><path d="M32 9v10" stroke="#fff" stroke-width="1.5" opacity=".8"/>`,
  palm: `<circle cx="44" cy="24" r="10" fill="#ffd34d" stroke="#2b2140" stroke-width="2.5"/>${SEA}<path d="M14 50c3-6 28-6 32 0z" fill="#ffe0a0" stroke="#2b2140" stroke-width="2.5" stroke-linejoin="round"/><path d="M27 48c0-10 1-18-3-27" fill="none" stroke="#2b2140" stroke-width="6" stroke-linecap="round"/><path d="M27 48c0-10 1-18-3-27" fill="none" stroke="#b07a4a" stroke-width="2.8" stroke-linecap="round"/><path d="M24 21c-7-4-13-2-16 3 6-1 10 0 16-3zm0 0c2-7 8-10 14-9-4 3-8 5-14 9zm0 0c7-2 13 1 15 6-6-2-9-3-15-6zm0 0c-4 4-6 9-5 14 3-5 4-9 5-14z" fill="#5ccf6a" stroke="#2b2140" stroke-width="2" stroke-linejoin="round"/>`,
  peak: `${SEA}<path d="M6 50L28 14l10 14 6-8 14 30z" fill="#9fb2c8" stroke="#2b2140" stroke-width="2.5" stroke-linejoin="round"/><path d="M21 26l7-12 7 10-4 3-3-3-3 4zM42 23l2-3 5 9-3-1-2 2z" fill="#fff" stroke="#2b2140" stroke-width="2" stroke-linejoin="round"/><circle cx="14" cy="14" r="2" fill="#fff"/><circle cx="50" cy="10" r="1.6" fill="#fff"/><circle cx="56" cy="18" r="1.4" fill="#fff"/>`,
  volcano: `<path d="M30 14c-4-5 1-10 6-8 2-5 10-4 10 2 5 0 6 7 1 8z" fill="#d9cfd0" stroke="#2b2140" stroke-width="2" stroke-linejoin="round"/><path d="M-2 50h68v16H-2z" fill="#ff6a2a" stroke="#2b2140" stroke-width="2"/><path d="M6 52l17-30h18l17 30z" fill="#7a5a52" stroke="#2b2140" stroke-width="2.5" stroke-linejoin="round"/><path d="M23 22h18l-4 6-3-3-3 6-3-5-2 3z" fill="#ffb03a" stroke="#2b2140" stroke-width="2" stroke-linejoin="round"/>`,
  ziggurat: `${SEA}<path d="M10 50h44v-7H10zM15 43h34v-7H15zM20 36h24v-7H20zM25 29h14v-7H25z" fill="#c9b98a" stroke="#2b2140" stroke-width="2.3" stroke-linejoin="round"/><path d="M29 50v-6h6v6z" fill="#2b2140"/><path d="M6 50c-2-8 2-16 8-18-2 6 0 12-2 18zM58 50c2-8-2-16-8-18 2 6 0 12 2 18z" fill="#4fae5c" stroke="#2b2140" stroke-width="2" stroke-linejoin="round"/>`,
  whale: `<path d="M4 54c0-6 6-9 11-7 1-7 11-10 16-4 4-5 14-4 15 3 6-2 13 2 13 8z" fill="#fff" stroke="#2b2140" stroke-width="2.5" stroke-linejoin="round"/><path d="M12 30c4-9 22-11 32-4l8-6-1 9 6 2-7 2c-10 9-30 8-38-3z" fill="#7aa9d8" stroke="#2b2140" stroke-width="2.5" stroke-linejoin="round"/><circle cx="20" cy="29" r="1.8" fill="#2b2140"/><path d="M16 35c6 3 16 3 24 0" fill="none" stroke="#2b2140" stroke-width="1.6"/><path d="M26 18c0-4 2-7 4-8M30 19c1-3 3-5 6-5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
  lighthouse: `<path d="M38 15L62 6v18z" fill="#fff2a8" opacity=".85"/><path d="M26 15L2 6v18z" fill="#fff2a8" opacity=".85"/><circle cx="50" cy="40" r="1.3" fill="#fff"/><circle cx="10" cy="34" r="1.3" fill="#fff"/>${SEA}<path d="M14 51c4-6 32-6 36 0z" fill="#5f8a6a" stroke="#2b2140" stroke-width="2.5" stroke-linejoin="round"/><path d="M26 48l2-28h8l2 28z" fill="#fff" stroke="#2b2140" stroke-width="2.5" stroke-linejoin="round"/><path d="M27.4 31h9.2l.5 8H26.8z" fill="#ff6f91"/><path d="M26 48l2-28h8l2 28z" fill="none" stroke="#2b2140" stroke-width="2.5" stroke-linejoin="round"/><path d="M27 20v-6h10v6z" fill="#ffd34d" stroke="#2b2140" stroke-width="2.3" stroke-linejoin="round"/><path d="M26 14l6-5 6 5z" fill="#ff6f91" stroke="#2b2140" stroke-width="2.2" stroke-linejoin="round"/>`,
  mesa: `<circle cx="48" cy="16" r="7" fill="#fff0b0" stroke="#2b2140" stroke-width="2"/><path d="M-2 50h68v16H-2z" fill="#f2c27a" stroke="#2b2140" stroke-width="2"/><path d="M6 50V30h6v-4h10v24zM28 50V18h12v32zM44 50V34h12v16z" fill="#d0643c" stroke="#2b2140" stroke-width="2.4" stroke-linejoin="round"/><path d="M28 26h12M44 40h12M6 38h16" stroke="#a94a2c" stroke-width="2"/>`,
};
const iconSvg = (id) => `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">${ICONS[meta(id).icon] || ICONS.tower}</svg>`;

// ---------------------------------------------------------------- helpers
export const fmt = (t) => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;
/** medalFor(time, par) → {key, name} (GDD §4.3: Altın ≤ par, Gümüş ≤ 1.35 × par, Bronz ≤ 1.8 × par) or null. */
export function medalFor(time, par) {
  if (time == null || !Number.isFinite(par)) return null;
  if (time <= par) return { key: 'gold', name: 'Altın', icon: '🥇' };
  if (time <= par * 1.35) return { key: 'silver', name: 'Gümüş', icon: '🥈' };
  if (time <= par * 1.8) return { key: 'bronze', name: 'Bronz', icon: '🥉' };
  return null;
}
const starSpans = (n, flagsArr) => (flagsArr || [0, 1, 2].map((i) => i < n)).map((f) => `<span class="${f ? 'on' : 'off'}">★</span>`).join('');
const parOf = (lv) => (Number.isFinite(lv?.parTime) ? lv.parTime : meta(lv?.id).par);
const coinsOf = (lv) => lv?.coinsTotal ?? meta(lv?.id).coins;
const getSettings = () => save.get().settings;
const applyNow = () => { try { window.__game?.applySettings?.(); } catch (e) { console.warn('[ui] applySettings', e); } };

// ---------------------------------------------------------------- sounds (GDD §4.2 / §6.1)
const UI_KEYS = ['ui_click', 'ui_hover_1', 'ui_back', 'ui_open', 'ui_negative_blip', 'star_jingle_1', 'star_jingle_2', 'medal_glissando', 'bonus_warm_10', 'level_complete_kids', 'one_up', 'pause_in', 'pause_out', 'ui_select_1', 'ui_select_2', 'vibes_descend', 'power_up'];
const MENU_MUSIC = 'music_menu_cheeky_monkey';
let uiLoaded = false, lastHover = 0, menuMusic = false;
function preloadUi() {
  if (uiLoaded || !audio.context) return;
  uiLoaded = true; audio.ensure(UI_KEYS);
}
export function sfx(key) { if (!audio.context) return; preloadUi(); audio.play(key); }
function hover(e) {
  if (e.pointerType && e.pointerType !== 'mouse') return;
  const now = performance.now(); if (now - lastHover < 70) return; lastHover = now; sfx('ui_hover_1');
}
function menuMusicOn() {
  if (flags.test || menuMusic) return;
  menuMusic = true; audio.resume(); audio.setMusic(MENU_MUSIC);
  audio.setAmbience(['amb_waves']);
}
on('level:loaded', () => { menuMusic = false; });   // world.load switched to the island's music + ambience

// pause music (§4.6): the context is suspended by main.js setPaused → resume it, duck the level loops, play the bed
let pauseAudio = false;
function pauseAudioOn() {
  if (pauseAudio || flags.test || document.hidden) return;
  pauseAudio = true;
  setTimeout(() => {
    if (!pauseAudio || current !== 'pause') return;
    audio.context?.resume?.().catch(() => {});
    for (const id of duckIds()) audio.setLoopGain(id, 0.0001, 0.15);
    sfx('pause_in');
    if (audio.state.musicEnabled) {
      if (!audio.playLoop('pause_music_loop', { id: '__pause', bus: 'music', fadeIn: 0.8, vol: 0.7 })) {
        audio.ensure(['pause_music_loop']).then(() => { if (pauseAudio && current === 'pause') audio.playLoop('pause_music_loop', { id: '__pause', bus: 'music', fadeIn: 0.8, vol: 0.7 }); });
      }
    }
  }, 0);
}
function pauseAudioOff(resumed) {
  if (!pauseAudio) return;
  pauseAudio = false;
  audio.stopLoop('__pause', 0.3);
  for (const id of duckIds()) audio.setLoopGain(id, 1, 0.25);
  if (resumed) sfx('pause_out');
}
function duckIds() { return ['__music', ...(world.level?.theme?.ambience || []), ...(globalThis.__game?.core?.theme?.ambience || [])]; }

// ---------------------------------------------------------------- DOM
export function init(handlers = {}) {
  Object.assign(h, handlers);
  if (els) return els;
  document.body.insertAdjacentHTML('beforeend', `
<div class="overlay hidden" id="startScreen">
  <div class="card start-card">
    <div class="title-ball" aria-hidden="true"></div>
    <h1>Pıtır'ın Kristal Adaları</h1>
    <p>Güneş Kristalleri yedi adaya dağıldı! Pıtır ile adaları dolaş, kristalleri topla, <b>gökkuşağı kapısını</b> aç.</p>
    <div class="keys">
      <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>Koş (kameraya göre)</span>
      <span><kbd>Boşluk</kbd></span><span>Zıpla — basılı tut: yüksek, ardı ardına 3 kez: üçlü zıplama</span>
      <span><kbd>Shift</kbd></span><span>Havadayken: yere çakılma (düşmanları ezer)</span>
      <span>Fare / <kbd>Q</kbd><kbd>E</kbd></span><span>Kamerayı döndür</span>
      <span><kbd>M</kbd> · <kbd>P</kbd></span><span>Ses aç/kapa · Duraklat</span>
    </div>
    <div class="row"><button class="big" id="startBtn">Başla!</button><button class="big alt" id="startSettingsBtn">⚙ Ayarlar</button></div>
    <p class="tiny">Sesler: zapsplat.com · Dokular &amp; gökyüzü: polyhaven.com, freepbr.com · Modeller: 3dassets.dev, polyhaven.com</p>
  </div>
</div>
<div class="overlay hidden" id="selectScreen">
  <div class="card map-card">
    <header class="map-head">
      <h1>Harita</h1>
      <div class="map-stats"><span class="chip-s" id="mapStars" title="Toplam yıldız">★ 0</span><span class="chip-s" id="mapWallet" title="Kumbara">🪙 0</span></div>
    </header>
    <div class="map-body">
      <div class="map-wrap" id="mapWrap">
        <svg class="map-route" id="mapRoute" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
        <ul class="levels" id="levelList" aria-label="Adalar"></ul>
      </div>
      <aside class="level-detail" id="levelDetail" aria-live="polite"></aside>
    </div>
    <nav class="map-bar">
      <button class="bar-btn" id="selectBackBtn" data-snd="back">⟵ Geri</button>
      <button class="bar-btn" id="wardrobeBtn">🎒 Dolap <small>Yakında</small></button>
      <button class="bar-btn" id="settingsBtn" data-snd="open">⚙ Ayarlar</button>
      <button class="bar-btn" id="creditsBtn" data-snd="open">📜 Krediler</button>
    </nav>
  </div>
</div>
<div class="overlay hidden" id="pauseScreen">
  <div class="card pause-card">
    <h1>Duraklatıldı</h1>
    <div class="row"><button class="big" id="resumeBtn">▶ Devam</button><button class="big alt" id="restartBtn">↺ Baştan</button><button class="big alt" id="pauseLevelsBtn" data-snd="back">🗺 Harita</button></div>
    <div class="settings-row">
      <label class="tog"><input type="checkbox" id="optMute"><span>🔇 Sessiz</span></label>
      <label class="tog"><input type="checkbox" id="optMusic" checked><span>🎵 Müzik</span></label>
      <label class="tog"><input type="checkbox" id="optAssist"><span>🤝 Yardım Modu</span></label>
    </div>
    <p class="small" id="assistNote">Yardım Modu: 5 kalp, daha yavaş tehlikeler. Kalpler bir sonraki doğuşta dolar.</p>
    <div class="row"><button class="big alt small-btn" id="pauseSettingsBtn" data-snd="open">⚙ Ayarlar</button></div>
  </div>
</div>
<div class="overlay hidden" id="winScreen">
  <div id="iris" aria-hidden="true"></div>
  <div class="card win-card">
    <h1>Ada Kurtarıldı!</h1>
    <div class="stars-big" id="winStars"></div>
    <div class="win-stats" id="winStats"></div>
    <div class="win-badges" id="winBadges"></div>
    <div class="wallet" id="winWalletRow">Kumbara <span class="coin-ico">🪙</span> <b id="winWallet">0</b> <span class="plus" id="winPlus"></span></div>
    <div class="row win-btns"><button class="big" id="nextBtn">Sonraki Ada ➜</button><button class="big" id="winCreditsBtn" data-snd="open">📜 Krediler</button><button class="big alt" id="againBtn">↺ Tekrar</button><button class="big alt" id="levelsBtn" data-snd="back">🗺 Harita</button></div>
  </div>
</div>
<div class="overlay hidden" id="settingsScreen">
  <div class="card settings-card">
    <h1>Ayarlar</h1>
    <div class="set-grid">
      <label class="set-item slider"><span>🔊 Efekt sesi</span><input type="range" id="setSfx" min="0" max="100" step="5"><output id="setSfxOut"></output></label>
      <label class="set-item slider"><span>🎵 Müzik sesi</span><input type="range" id="setMusicVol" min="0" max="100" step="5"><output id="setMusicVolOut"></output></label>
      <label class="set-item slider"><span>🎥 Kamera hızı</span><input type="range" id="setCamSens" min="50" max="200" step="10"><output id="setCamSensOut"></output></label>
      <label class="set-item tog"><input type="checkbox" id="setAutoCam"><span>🎯 Kamera otomatik</span></label>
      <div class="set-item select"><span>✨ Kalite</span>
        <div class="seg" id="setQuality" role="radiogroup" aria-label="Kalite">
          <button data-q="auto" role="radio">Otomatik</button><button data-q="high" role="radio">Yüksek</button><button data-q="medium" role="radio">Orta</button><button data-q="low" role="radio">Düşük</button>
        </div>
        <small id="setQualityNote"></small>
      </div>
      <label class="set-item tog"><input type="checkbox" id="setInvertY"><span>↕ Y ekseni ters</span></label>
      <label class="set-item tog"><input type="checkbox" id="setSimpleTouch"><span>👆 Basit dokunma</span></label>
      <label class="set-item tog"><input type="checkbox" id="setLeftHanded"><span>✋ Solak düzen</span></label>
      <label class="set-item tog"><input type="checkbox" id="setReduceShake"><span>〰 Titreme azalt</span></label>
      <label class="set-item tog"><input type="checkbox" id="setHints"><span>💡 İpuçları</span></label>
      <label class="set-item tog"><input type="checkbox" id="setAssist"><span>🤝 Yardım Modu <small>5 kalp, yavaş tehlikeler, süre yıldızı yok</small></span></label>
    </div>
    <div class="row"><button class="big alt small-btn danger" id="resetBtn">İlerlemeyi sıfırla</button><button class="big alt small-btn" id="settingsCreditsBtn" data-snd="open">📜 Krediler</button><button class="big small-btn" id="settingsBackBtn" data-snd="back">Tamam</button></div>
  </div>
</div>
<div class="overlay hidden" id="creditsScreen">
  <div class="card credits-card">
    <h1>Krediler</h1>
    <div class="credits-body" id="creditsBody"><p class="small">Yükleniyor…</p></div>
    <div class="row"><button class="big" id="creditsBackBtn" data-snd="back">Geri</button></div>
  </div>
</div>`);
  els = {
    start: $('#startScreen'), select: $('#selectScreen'), pause: $('#pauseScreen'), win: $('#winScreen'), settings: $('#settingsScreen'), credits: $('#creditsScreen'),
    levelList: $('#levelList'), route: $('#mapRoute'), detail: $('#levelDetail'), winStats: $('#winStats'), winStars: $('#winStars'), nextBtn: $('#nextBtn'),
  };
  $('#startBtn').onclick = () => { preloadUi(); h.onStart?.(); };
  $('#selectBackBtn').onclick = () => h.onBack?.();
  $('#resumeBtn').onclick = () => h.onResume?.();
  $('#restartBtn').onclick = () => (h.onRetry ? h.onRetry() : null);
  $('#pauseLevelsBtn').onclick = () => h.onLevels?.();
  $('#nextBtn').onclick = () => h.onNext?.();
  $('#levelsBtn').onclick = () => h.onLevels?.();
  $('#againBtn').onclick = () => h.onRetry?.();
  $('#winCreditsBtn').onclick = () => openSub('credits');
  $('#wardrobeBtn').onclick = () => hud.toast('Pıtır\'ın Dolabı yakında!', 1.4);
  for (const id of ['#settingsBtn', '#startSettingsBtn', '#pauseSettingsBtn']) $(id).onclick = () => openSub('settings');
  for (const id of ['#creditsBtn', '#settingsCreditsBtn']) $(id).onclick = () => openSub('credits');
  $('#settingsBackBtn').onclick = () => closeSub();
  $('#creditsBackBtn').onclick = () => closeSub();

  // pause toggles (existing ids #optMute / #optMusic; probe-check: #optMute mirrors audio.state.muted)
  const s = getSettings();
  const mute = $('#optMute'), music = $('#optMusic'), assist = $('#optAssist');
  mute.checked = !!s.mute; music.checked = s.music !== false;
  audio.setMuted(mute.checked); audio.state.musicEnabled = music.checked;
  mute.onchange = () => { audio.setMuted(mute.checked); save.setSetting('mute', mute.checked); };
  music.onchange = () => {
    audio.setMusicEnabled(music.checked); save.setSetting('music', music.checked);
    if (current === 'pause') { if (music.checked) { pauseAudio = false; pauseAudioOn(); } else audio.stopLoop('__pause', 0.3); }
  };
  assist.onchange = () => setAssist(assist.checked);

  // map: badge clicks / keyboard
  els.levelList.addEventListener('click', (e) => { const li = e.target.closest('li.level-card'); if (li) tapCard(li); });
  els.levelList.addEventListener('keydown', (e) => {
    const li = e.target.closest('li.level-card'); if (!li) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapCard(li); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const sib = e.key === 'ArrowRight' ? li.nextElementSibling : li.previousElementSibling; sib?.focus(); }
  });
  els.detail.addEventListener('click', (e) => { if (e.target.closest('#playBtn')) startSelected(); });

  // ui sounds: click on any overlay button, hover on badges/buttons (mouse only)
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.overlay button, .overlay .tog, #assistOffer button'); if (!b) return;
    sfx(b.dataset.snd === 'back' ? 'ui_back' : b.dataset.snd === 'open' ? 'ui_open' : 'ui_click');
  }, true);
  document.addEventListener('pointerover', (e) => { if (e.target.closest?.('.overlay button.big, .overlay .bar-btn, li.level-card')) hover(e); });
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { audio.unlock(); preloadUi(); }, { passive: true });

  initSettings();
  addEventListener('keydown', (e) => {   // Esc closes Ayarlar / Krediler
    if (e.code === 'Escape' && (current === 'settings' || current === 'credits')) { e.stopPropagation(); closeSub(); sfx('ui_back'); }
  }, true);
  return els;
}

const subStack = [];   // screens Ayarlar / Krediler return to (Ayarlar → Krediler → back → Ayarlar → back → Harita)
function openSub(name) {
  if (current === name) return;
  subStack.push(current);
  if (name === 'settings') syncSettings();
  if (name === 'credits') loadCredits();
  show(name);
}
function closeSub() {
  const st = document.body.dataset.state;
  let back = subStack.pop();
  if (!back) back = st === 'paused' ? 'pause' : st === 'win' ? 'win' : st === 'select' ? 'select' : 'start';
  if (back === 'select') renderSelect(lastLevels);
  if (back === 'settings') syncSettings();
  show(back, { keepWin: true });
}

export function show(name, { keepWin = false } = {}) {
  if (!els) return;
  if (current === 'win' && name !== 'win' && !keepWin) clearWinTimers();
  if (current === 'pause' && name !== 'pause' && name !== 'settings' && name !== 'credits') pauseAudioOff(name == null);
  if (name !== 'settings' && name !== 'credits' && (current === 'settings' || current === 'credits') && !keepWin) subStack.length = 0;
  for (const k of SCREENS) els[k].classList.toggle('hidden', k !== name);
  if (name === 'pause') {           // the M key toggles audio without touching the DOM: resync the boxes
    const m = $('#optMute'), mu = $('#optMusic'), a = $('#optAssist');
    if (m) m.checked = !!audio.state.muted;
    if (mu) mu.checked = audio.state.musicEnabled !== false;
    if (a) a.checked = !!getSettings().assist;
    if (current !== 'settings' && current !== 'credits') pauseAudioOn();
  }
  if ((name === 'start' || name === 'select') && current !== 'settings' && current !== 'credits') menuMusicOn();
  if (name === 'select') {
    const sel = els.levelList.querySelector(`li.level-card[data-id="${selectedId}"]`);
    if (sel && !flags.test) requestAnimationFrame(() => sel.scrollIntoView?.({ block: 'nearest', inline: 'center' }));
  }
  current = name;
}
export function hide() { show(null); }
export function visible(name) { return !!els && !!els[name] && !els[name].classList.contains('hidden'); }
export function currentScreen() { return current; }

// ---------------------------------------------------------------- Harita
let lastLevels = [], selectedId = null, armedId = null;   // armedId: the badge the player tapped (a second tap starts it)
function levelInfo(levels, lv) {
  const e = save.level(lv.id);
  const soon = !!lv.comingSoon;
  const totalStars = levels.reduce((n, l) => n + (save.level(l.id).stars || 0), 0);
  const starGate = Number.isFinite(lv.unlockStars) && totalStars < lv.unlockStars;
  const locked = soon || !e.unlocked || starGate;
  const prev = [...levels].filter((l) => l.order < lv.order && !l.bonus).sort((a, b) => b.order - a.order)[0];
  return { e, soon, locked, starGate, prev, par: parOf(lv), coins: coinsOf(lv), totalStars };
}
/** renderSelect(levels) — levels: [{id, name, subtitle, order, comingSoon?, parTime?, unlockStars?}] (campaign, map order). */
export function renderSelect(levels) {
  if (!els) return;
  lastLevels = levels || [];
  const pos = new Map(LAYOUT.map((p) => [p.id, p]));
  const anyDone = lastLevels.some((l) => save.level(l.id).done);
  let totalStars = 0, maxStars = 0;
  els.levelList.innerHTML = lastLevels.map((lv, i) => {
    const p = pos.get(lv.id) || { x: 10 + (i * 80) / Math.max(1, lastLevels.length - 1), y: i % 2 ? 30 : 68 };
    const m = meta(lv.id), inf = levelInfo(lastLevels, lv), e = inf.e;
    if (!inf.soon) { totalStars += e.stars || 0; maxStars += 3; }
    const medal = medalFor(e.bestTime, inf.par);
    const best = inf.soon ? 'Yakında' : e.bestTime != null ? `En iyi ${fmt(e.bestTime)} · 🪙 ${e.bestCoins}${inf.coins ? '/' + inf.coins : ''}` : e.bestTimeAssist != null ? `Yardımla ${fmt(e.bestTimeAssist)}` : inf.starGate ? `${lv.unlockStars} ★ gerekli` : '';
    const chips = `${e.vista ? '<span title="Kartpostal">📷</span>' : ''}${e.secret ? '<span title="Gizli hazine">🔍</span>' : ''}`;
    const here = !anyDone && i === 0 ? '<span class="lv-here">Buradan başla!</span>' : '';
    return `<li class="level-card${lv.bonus ? ' bonus' : ''}${e.done ? ' done' : ''}" data-id="${esc(lv.id)}" data-locked="${inf.locked ? 1 : 0}" data-soon="${inf.soon ? 1 : 0}" style="--x:${p.x}%;--y:${p.y}%;--sky:${m.sky}" tabindex="0" role="button" aria-label="${esc(lv.name)}${inf.soon ? ' — Yakında' : inf.locked ? ' — kilitli' : ''}">
      <div class="lv-icon">${iconSvg(lv.id)}${inf.locked ? '<span class="lv-lock" aria-hidden="true">🔒</span>' : ''}${here}</div>
      <div class="lv-name">${esc(m.label || lv.name)}</div>
      <div class="lv-stars">${inf.soon ? '' : starSpans(e.stars || 0)}</div>
      <div class="lv-best">${esc(best)}</div>
      <div class="lv-medal"${medal ? ` data-medal="${medal.key}"` : ''}>${medal ? `${medal.icon} ${medal.name}` : ''}</div>
      <div class="lv-chips">${chips}</div>
    </li>`;
  }).join('');
  $('#mapStars').textContent = `★ ${totalStars}/${maxStars}`;
  $('#mapWallet').textContent = `🪙 ${save.get().wallet || 0}`;
  drawRoute(lastLevels, pos);
  // default selection: the current island (last played if still loaded, else the first unlocked one not done yet)
  const playable = lastLevels.filter((l) => !levelInfo(lastLevels, l).locked);
  const keep = playable.find((l) => l.id === selectedId);
  const firstOpen = playable.find((l) => !save.level(l.id).done);
  const lastPlayed = playable.find((l) => l.id === world.level?.id && !world.level?.hidden);
  armedId = null;
  selectedId = (keep || firstOpen || lastPlayed || playable[0] || lastLevels[0])?.id ?? null;
  renderDetail();
}
function drawRoute(levels, pos) {
  const pts = levels.filter((l) => !l.bonus).map((l) => pos.get(l.id)).filter(Boolean);
  const path = (ps) => {
    if (ps.length < 2) return '';
    let d = `M${ps[0].x} ${ps[0].y}`;
    for (let i = 0; i < ps.length - 1; i++) {      // Catmull-Rom → cubic Bézier
      const p0 = ps[i - 1] || ps[i], p1 = ps[i], p2 = ps[i + 1], p3 = ps[i + 2] || p2;
      const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
      d += ` C${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} ${p2.x} ${p2.y}`;
    }
    return d;
  };
  const camp = levels.filter((l) => !l.bonus);
  let reached = 0;
  camp.forEach((l, i) => { if (save.level(l.id).unlocked && !l.comingSoon) reached = i; });
  const done = pts.slice(0, reached + 1);
  const bonus = levels.filter((l) => l.bonus).map((l) => [pos.get(camp[camp.length - 1]?.id), pos.get(l.id)]).filter(([a, b]) => a && b);
  els.route.innerHTML = `
    <path class="route-shadow" d="${path(pts)}" vector-effect="non-scaling-stroke"/>
    <path class="route-base" d="${path(pts)}" vector-effect="non-scaling-stroke"/>
    ${done.length > 1 ? `<path class="route-done" d="${path(done)}" vector-effect="non-scaling-stroke"/>` : ''}
    ${bonus.map(([a, b]) => `<path class="route-bonus" d="M${a.x} ${a.y} Q${(a.x + b.x) / 2 + 8} ${(a.y + b.y) / 2} ${b.x} ${b.y}" vector-effect="non-scaling-stroke"/>`).join('')}`;
}
function renderDetail() {
  if (!els) return;
  for (const li of els.levelList.children) li.classList.toggle('selected', li.dataset.id === selectedId);
  const lv = lastLevels.find((l) => l.id === selectedId);
  if (!lv) { els.detail.innerHTML = ''; return; }
  const inf = levelInfo(lastLevels, lv), e = inf.e, m = meta(lv.id);
  const medal = medalFor(e.bestTime, inf.par);
  const tick = (ok) => `<span class="tick ${ok ? 'on' : ''}">${ok ? '✔' : '○'}</span>`;
  const coinStar = e.done && e.bestCoins >= (inf.coins ?? Infinity);
  const timeStar = e.bestTime != null && Number.isFinite(inf.par) && e.bestTime <= inf.par;
  els.detail.style.setProperty('--sky', m.sky);
  els.detail.innerHTML = `
    <div class="det-head"><div class="det-icon">${iconSvg(lv.id)}</div><div><h2>${esc(lv.name)}</h2><p class="det-sub">${esc(lv.subtitle || '')}</p></div></div>
    ${inf.soon ? `<p class="det-soon">🚧 Yakında! Bu ada henüz yapım aşamasında.</p>` : `
    <ul class="crit">
      <li>${tick(e.done)}<span>★ Adayı kurtar</span></li>
      <li>${tick(coinStar)}<span>★ Tüm altınlar${inf.coins ? ` (🪙 ${inf.coins})` : ''}</span></li>
      <li>${tick(timeStar)}<span>★ Hedef süre${Number.isFinite(inf.par) ? ` ⏱ ${fmt(inf.par)}` : ''}</span></li>
    </ul>
    <div class="det-best">${e.bestTime != null ? `En iyi <b>${fmt(e.bestTime)}</b>${medal ? ` <span class="medal" data-medal="${medal.key}">${medal.icon} ${medal.name}</span>` : ''} · 🪙 ${e.bestCoins}` : e.bestTimeAssist != null ? `Yardımla en iyi <b>${fmt(e.bestTimeAssist)}</b> <span class="chip">🤝 yardım</span>` : 'Henüz kurtarılmadı'}
      ${e.vista ? '<span class="chip">📷 Kartpostal</span>' : ''}${e.secret ? '<span class="chip">🔍 Gizli</span>' : ''}</div>
    ${inf.locked ? `<p class="det-lock">🔒 ${inf.starGate ? `${lv.unlockStars} ★ topla, açılsın!` : `Önce ${esc(meta(inf.prev?.id).short)} adasını kurtar`}</p>` : '<button class="big play" id="playBtn">Başla!</button>'}`}`;
}
function tapCard(li) {
  const id = li.dataset.id;
  const lv = lastLevels.find((l) => l.id === id); if (!lv) return;
  const inf = levelInfo(lastLevels, lv);
  if (inf.soon) {
    sfx('ui_negative_blip'); selectedId = id; renderDetail(); hud.toast('Yakında!', 1.2);
    return;
  }
  if (inf.locked) {
    sfx('ui_negative_blip');
    hud.toast(inf.starGate ? `${lv.unlockStars} ★ topla, ${meta(id).short} açılsın!` : `Önce ${meta(inf.prev?.id).short} adasını kurtar`, 1.8);
    li.classList.remove('shake'); void li.offsetWidth; li.classList.add('shake');
    return;
  }
  if (selectedId === id && armedId === id) { startSelected(); return; }
  selectedId = armedId = id; sfx('ui_click'); renderDetail();
}
function startSelected() {
  const lv = lastLevels.find((l) => l.id === selectedId); if (!lv) return;
  if (levelInfo(lastLevels, lv).locked) return;
  audio.unlock();
  h.onSelect?.(lv.id);
}
/** selectLevel(id) — test/UI hook: select a badge (opens #levelDetail) without starting it. */
export function selectLevel(id) { const li = els?.levelList.querySelector(`li.level-card[data-id="${id}"]`); if (li) tapCard(li); return selectedId; }

// ---------------------------------------------------------------- win card (GDD §4.5)
let winTimers = [];
let winWalletFinal = null;
function clearWinTimers() { for (const t of winTimers) clearTimeout(t); winTimers = []; if (winWalletFinal != null) { const w = $('#winWallet'); if (w) w.textContent = winWalletFinal; } }
const later = (ms, fn) => { winTimers.push(setTimeout(fn, ms)); };
export function showWin({ time, coins, coinsTotal, crystals, crystalsTotal, stars, starFlags, hasNext, newBest }) {
  if (!els) return;
  clearWinTimers();
  const lv = world.level || {};
  const par = parOf(lv), medal = medalFor(time, par);
  const e = save.level(lv.id);
  const assisted = !!(globalThis.__game?.physics?.assist?.on);
  const fl = [starFlags?.done, starFlags?.coins, starFlags?.time];
  els.winStars.innerHTML = fl.map((f, i) => `<span class="${f ? 'on' : 'off'}" style="--i:${i}">★</span>`).join('');
  els.winStats.innerHTML = `
    <div class="win-line"><span>⏱ Süre</span><b>${fmt(time)}</b><span class="par">/ ${Number.isFinite(par) ? fmt(par) : '–'}</span>${medal ? `<span class="medal" data-medal="${medal.key}">${medal.icon} ${medal.name}</span>` : ''}</div>
    <div class="win-line"><span>🪙 Altın</span><b>${coins}</b><span class="par">/ ${coinsTotal}</span></div>
    <div class="win-line"><span>💎 Kristal</span><b>${crystals}</b><span class="par">/ ${crystalsTotal ?? crystals}</span></div>`;
  $('#winBadges').innerHTML = `${newBest ? '<span class="badge record">Yeni rekor!</span>' : ''}${e.vista ? '<span class="chip">📷 Kartpostal</span>' : ''}${e.secret ? '<span class="chip">🔍 Gizli</span>' : ''}${assisted ? '<span class="chip">🤝 yardım</span>' : ''}${stars === 3 ? '<span class="chip gold">Mükemmel!</span>' : ''}`;
  const walletAfter = save.get().wallet || 0, walletBefore = Math.max(0, walletAfter - coins);
  const walletEl = $('#winWallet'); walletEl.textContent = walletBefore;
  winWalletFinal = walletAfter;
  $('#winPlus').textContent = coins > 0 ? `+${coins}` : '';
  els.nextBtn.style.display = hasNext ? '' : 'none';
  $('#winCreditsBtn').style.display = !hasNext && lv.id === 'fener' ? '' : 'none';
  els.win.classList.remove('play'); void els.win.offsetWidth; els.win.classList.add('play');
  show('win');
  if (flags.test) { walletEl.textContent = walletAfter; return; }
  // timeline: iris 0–0.75 s → card → fanfare → stars one by one → medal → record → wallet count
  const T0 = 800;
  later(T0, () => sfx('level_complete_kids'));
  fl.forEach((f, i) => { if (f) later(T0 + 450 + i * 380, () => sfx(i === 1 ? 'star_jingle_2' : 'star_jingle_1')); });
  if (stars === 3) later(T0 + 450 + 3 * 380, () => sfx('medal_glissando'));
  if (newBest) later(T0 + 1700, () => sfx('bonus_warm_10'));
  if (coins > 0) later(T0 + 2000, () => {
    const t0 = performance.now(), dur = Math.min(1400, 300 + coins * 12);
    let ticks = 0;
    const stepFn = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      walletEl.textContent = Math.round(walletBefore + coins * k);
      if (Math.floor(k * 10) > ticks) { ticks = Math.floor(k * 10); audio.play('coin'); }
      if (k < 1 && current === 'win') winTimers.push(setTimeout(stepFn, 33)); else { walletEl.textContent = walletAfter; $('#winWalletRow').classList.add('bump'); }
    };
    $('#winWalletRow').classList.remove('bump');
    stepFn();
  });
}

// ---------------------------------------------------------------- pause (GDD §4.6) + Yardım Modu
function setAssist(on) {
  save.setSetting('assist', !!on);
  applyNow();
  const a = $('#optAssist'), b = $('#setAssist');
  if (a) a.checked = !!on; if (b) b.checked = !!on;
  hud.toast(on ? 'Yardım Modu açık 🤝' : 'Yardım Modu kapalı', 1.2);
}
export { setAssist };

// ---------------------------------------------------------------- Ayarlar (GDD §4.7)
const QNAME = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' };
/** deviceTier() — what core.js would pick without ?quality (same rule as core.detectTier). */
function deviceTier() {
  if (!flags.touch) return 'high';
  const px = (devicePixelRatio || 1) * innerWidth * innerHeight;
  if (px > 2.5e6 || (navigator.hardwareConcurrency || 8) <= 4) return 'low';
  return 'medium';
}
let resetArm = 0, resetTimer = null;
function initSettings() {
  const bindRange = (id, key, toUi, fromUi, fmtOut) => {
    const el = $('#' + id), out = $('#' + id + 'Out');
    el.addEventListener('input', () => {
      const v = fromUi(+el.value); out.textContent = fmtOut(v);
      save.patch((d) => { d.settings[key] = v; });
      applyNow();
    });
    el.addEventListener('change', () => { if (key === 'sfxVol') sfx('ui_click'); });
    return () => { const v = getSettings()[key]; el.value = toUi(v); out.textContent = fmtOut(v); };
  };
  const syncs = [
    bindRange('setSfx', 'sfxVol', (v) => Math.round((v ?? 0.9) * 100), (u) => u / 100, (v) => `${Math.round(v * 100)}%`),
    bindRange('setMusicVol', 'musicVol', (v) => Math.round((v ?? 0.6) * 100), (u) => u / 100, (v) => `${Math.round(v * 100)}%`),
    bindRange('setCamSens', 'camSens', (v) => Math.round((v ?? 1) * 100), (u) => u / 100, (v) => `${Math.round(v * 100)}%`),
  ];
  const toggles = { setInvertY: 'invertY', setSimpleTouch: 'simpleTouch', setLeftHanded: 'leftHanded', setReduceShake: 'reduceShake', setHints: 'hints' };
  for (const [id, key] of Object.entries(toggles)) {
    $('#' + id).addEventListener('change', (ev) => { save.setSetting(key, ev.target.checked); applyNow(); hud.refreshSettings?.(); });
  }
  $('#setAutoCam').addEventListener('change', (ev) => { save.setSetting('autoCam', ev.target.checked); applyNow(); });
  $('#setAssist').addEventListener('change', (ev) => setAssist(ev.target.checked));
  $('#setQuality').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-q]'); if (!b) return;
    save.setSetting('quality', b.dataset.q); syncQuality();
  });
  $('#resetBtn').addEventListener('click', () => {
    const btn = $('#resetBtn');
    if (!resetArm) {
      resetArm = 1; btn.textContent = 'Emin misin? Tekrar dokun'; btn.classList.add('armed');
      clearTimeout(resetTimer); resetTimer = setTimeout(() => { resetArm = 0; btn.textContent = 'İlerlemeyi sıfırla'; btn.classList.remove('armed'); }, 3000);
      return;
    }
    resetArm = 0; clearTimeout(resetTimer); btn.textContent = 'İlerlemeyi sıfırla'; btn.classList.remove('armed');
    resetProgress();
    hud.toast('İlerleme sıfırlandı', 1.4);
  });
  syncSettings = () => {
    for (const f of syncs) f();
    const st = getSettings();
    for (const [id, key] of Object.entries(toggles)) $('#' + id).checked = !!st[key];
    $('#setAutoCam').checked = st.autoCam == null ? !!cam.auto : !!st.autoCam;
    $('#setAssist').checked = !!st.assist;
    syncQuality();
  };
}
let syncSettings = () => {};
function syncQuality() {
  const st = getSettings(), q = st.quality || 'auto';
  for (const b of document.querySelectorAll('#setQuality button')) { const on = b.dataset.q === q; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }
  const now = coreQuality.tier, det = st.qualityAuto || deviceTier();
  const want = q === 'auto' ? det : q;
  $('#setQualityNote').textContent = `Algılanan: ${QNAME[det] || det} · şu an: ${QNAME[now] || now}${want !== now ? ' · bir sonraki açılışta uygulanır' : ''}`;
}
/** resetProgress() — "İlerlemeyi sıfırla": levels, wallet, cosmetics, stats, flags and daily go back to defaults; settings stay. */
export function resetProgress() {
  save.patch((d) => {
    d.levels = {}; d.wallet = 0;
    d.cosmetics = { owned: ['none', 'scarf:4dabf7'], hat: 'none', scarf: 0x4dabf7 };
    d.stats = { playTime: 0, jumps: 0, stomps: 0, faints: 0, wins: 0 };
    d.flags = { seenIntro: false, seenTouchTutorial: false, assistOffered: false };
    d.daily = { date: null, levelId: null, mod: null, done: false };
  });
  if (lastLevels.length) { save.ensureUnlocks(lastLevels); selectedId = armedId = null; renderSelect(lastLevels); }
  return save.get();
}

// ---------------------------------------------------------------- Krediler
let creditsHtml = null;
async function loadCredits() {
  const body = $('#creditsBody');
  const levels = lastLevels.length ? lastLevels : (globalThis.__game?.allLevels || []).filter((l) => !l.hidden);
  const vistas = levels.filter((l) => save.level(l.id).vista).length;
  const head = `<div class="cred-top">
      <p><b>Pıtır'ın Kristal Adaları</b> — Pıtır ve yedi ada için sevgiyle yapıldı.</p>
      <p>📷 Kartpostallar: <b>${vistas}</b> / ${levels.filter((l) => !l.bonus).length} · ★ ${levels.reduce((n, l) => n + (save.level(l.id).stars || 0), 0)} yıldız</p>
      <p class="small">Sesler: “Sound effects obtained from https://www.zapsplat.com” · Dokular, gökyüzü ve modeller: Poly Haven (CC0), FreePBR, 3dassets.dev (CC0) · Deniz: three.js Water (jbouny/ocean, MIT)</p>
    </div>`;
  if (creditsHtml == null) {
    body.innerHTML = head + '<p class="small">Yükleniyor…</p>';
    try {
      const r = await fetch('assets/CREDITS.md');
      creditsHtml = r.ok ? mdToHtml(await r.text()) : '<p class="small">Kredi listesi yüklenemedi.</p>';
    } catch { creditsHtml = '<p class="small">Kredi listesi yüklenemedi.</p>'; }
  }
  body.innerHTML = head + creditsHtml;
}
/** tiny Markdown subset → HTML (headings, bullets, **bold**, `code`, [text](url) → text; URLs shown as plain text). */
function mdToHtml(md) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1').replace(/\(?(https?:\/\/[^\s)]+)\)?/g, '<span class="url">$1</span>');
  let out = '', inList = false;
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    const li = /^\s*[-*] (.*)$/.exec(line), hd = /^(#{1,4}) (.*)$/.exec(line);
    if (!li && inList) { out += '</ul>'; inList = false; }
    if (hd) { if (hd[1].length > 1) out += `<h3>${inline(hd[2])}</h3>`; }
    else if (li) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${inline(li[1])}</li>`; }
    else if (line.trim()) out += `<p>${inline(line)}</p>`;
  }
  if (inList) out += '</ul>';
  return out;
}

export const screens = { init, show, hide, visible, currentScreen, renderSelect, showWin, selectLevel, medalFor, resetProgress, setAssist, LAYOUT, sfx };
export default screens;
