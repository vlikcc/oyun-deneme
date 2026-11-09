// Touch controls (GDD §5.1, docs/research/mobile-readiness.md §2): dynamic left-half stick, right-half orbit drag, A (jump)
// and B (pound) buttons, pause pill fallback, Basit mod (tap right half = jump, drag = orbit), Solak (mirrored) layout,
// portrait "Telefonu yan çevir" prompt. Pointer Events only; every pointer id has exactly one role (stick | look | button |
// tap) and is captured on the layer, so a finger sliding off a button still ends cleanly. pointercancel /
// lostpointercapture / visibilitychange / blur / leaving the 'play' state release everything (a stuck jumpHeld would
// give infinite apex hang).
// Shown only when (pointer: coarse) or ?touch=1 (body.touch) and only while body[data-state=play] and setVisible(true).
// input.js calls merge(input) every read(); camera drags go straight to cameraApi.look() (cam.sens / invertY / override).
import { params, isTouchDevice } from './core.js';
import { look as camLook } from './camera.js';
import * as audio from './audio.js';
import * as save from './save.js';

export const state = { active: false, visible: true, ix: 0, iy: 0, look: 0, jump: false, jumpHeld: false, pound: false, holdUntil: 0 };
const DEAD = 0.12;                       // stick dead zone (fraction of the radius)
const SLOP = 12;                         // px a Basit-mod tap may wander before it becomes an orbit drag
const TAP_HOLD_MS = 300;                 // Basit-mod tap jump: jumpHeld stays on this long (a fuller jump than a cut tap)
const SENS = () => (Math.PI * 1.1) / Math.max(1, innerWidth);   // radians per CSS px; a full-width swipe ≈ 200°
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

let layer = null, ring = null, knob = null, rotateEl = null, cssLink = null, onPauseCb = null;
const stick = { id: null, ox: 0, oy: 0, R: 64 };
const lookP = { id: null, x: 0, y: 0, sx: 0, sy: 0, tap: false, moved: false };
const held = new Map();                  // pointerId → 'jump' | 'pound' | 'pause'
const opts = { simple: false, left: false };
const cleanup = [];
const listen = (target, ev, fn, o) => { target.addEventListener(ev, fn, o); cleanup.push(() => target.removeEventListener(ev, fn, o)); };

/** wantTouchUi() — the layer is shown for coarse pointers or ?touch=1 (a touch laptop with a mouse keeps the desktop UI
 *  until its first real touch, see onFirstTouch). */
function wantTouchUi() { return params.get('touch') === '1' || matchMedia('(pointer: coarse)').matches; }

/** syncSettings(force) — reads save.settings.simpleTouch / leftHanded (init, entering 'play', and every merge() while no
 *  finger is down — so a change in Ayarlar applies at once without remapping a finger mid-gesture). */
export function syncSettings(force = true) {
  let st = {};
  try { st = save.get().settings || {}; } catch { /* in-memory save fallback still returns defaults */ }
  if (!force && opts.simple === !!st.simpleTouch && opts.left === !!st.leftHanded) return;
  opts.simple = !!st.simpleTouch; opts.left = !!st.leftHanded;
  document.body.classList.toggle('touch-left', opts.left);
  document.body.classList.toggle('touch-simple', opts.simple);
  const hint = layer?.querySelector('.touch-hint');
  if (hint) {
    const [a, b] = opts.left ? ['Sağ', 'Sol'] : ['Sol', 'Sağ'];
    hint.textContent = `${a}: yürü · ${b}: ${opts.simple ? 'dokun = zıpla, kaydır = kamera' : 'kamerayı çevir'}`;
    hint.hidden = !!seenTutorial();
  }
}
function seenTutorial() { try { return !!save.get().flags?.seenTouchTutorial; } catch { return false; } }

function stickRadius() { return clamp(Math.min(innerWidth, innerHeight) * 0.16, 48, 96); }   // = --stick / 2 in touch.css
/** stickSide(x) — true when x lies in the stick half (left, or right with Solak). */
const stickSide = (x) => (opts.left ? x >= innerWidth * 0.5 : x < innerWidth * 0.5);

function moveKnob(dx, dy) { if (knob) knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; }
function placeRing() { if (ring) ring.style.transform = `translate(${stick.ox}px, ${stick.oy}px)`; }

function press(name, down) {
  if (name === 'jump') { if (down) state.jump = true; state.jumpHeld = down; }
  else if (name === 'pound') { if (down) state.pound = true; }
  else if (name === 'pause') { if (down) onPauseCb?.(); }
  if (down) { try { navigator.vibrate?.(6); } catch { /* not allowed (no user activation / iOS) */ } }
}
function buttonEl(name) { return layer?.querySelector(`[data-btn="${name}"]`); }

function onDown(e) {
  if (!layer || layer.hidden) return;
  e.preventDefault();                                   // no compat mouse events, no text selection, no double-tap zoom
  try { layer.setPointerCapture(e.pointerId); } catch { /* synthetic events have no active pointer */ }
  onFirstTouch(e);
  const b = e.target.closest?.('[data-btn]');
  if (b && layer.contains(b)) {
    held.set(e.pointerId, b.dataset.btn); b.classList.add('down'); press(b.dataset.btn, true);
    return;
  }
  if (stickSide(e.clientX) && stick.id === null) {
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.R = stickRadius();
    ring.style.setProperty('--stick', `${stick.R * 2}px`);
    placeRing(); ring.classList.add('show'); moveKnob(0, 0);
    state.ix = state.iy = 0;
    if (!layer.classList.contains('used')) {             // first stick use fades the "Sol: yürü" hint, once per save
      layer.classList.add('used');
      if (!seenTutorial()) { try { save.patch((d) => { (d.flags ??= {}).seenTouchTutorial = true; }); } catch { /* ignore */ } }
    }
  } else if (lookP.id === null) {
    Object.assign(lookP, { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, tap: opts.simple, moved: !opts.simple });
  }
}

function onMove(e) {
  if (e.pointerId === stick.id) {
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy, d = Math.hypot(dx, dy);
    if (d > stick.R) {                                  // dynamic origin: the ring follows the finger
      const k = 1 - stick.R / d; stick.ox += dx * k; stick.oy += dy * k;
      dx = e.clientX - stick.ox; dy = e.clientY - stick.oy; d = stick.R;
      placeRing();
    }
    const n = clamp((d / stick.R - DEAD) / (1 - DEAD), 0, 1);   // 12 % dead zone, linear outside
    state.ix = d > 0 ? (dx / d) * n : 0; state.iy = d > 0 ? (-dy / d) * n : 0;   // screen-up = forward, like W
    moveKnob(dx, dy);
  } else if (e.pointerId === lookP.id) {
    if (!lookP.moved) {                                 // Basit mod: still a potential tap until it travels SLOP px
      if (Math.hypot(e.clientX - lookP.sx, e.clientY - lookP.sy) <= SLOP) return;
      lookP.moved = true; lookP.tap = false;
    }
    const dx = e.clientX - lookP.x, dy = e.clientY - lookP.y; lookP.x = e.clientX; lookP.y = e.clientY;
    camLook(dx * SENS(), dy * SENS() * 0.8);
  }
}

function onEnd(e) {
  const id = e.pointerId;
  if (id === stick.id) { stick.id = null; state.ix = state.iy = 0; ring?.classList.remove('show'); moveKnob(0, 0); }
  if (id === lookP.id) {
    if (lookP.tap && e.type === 'pointerup') {           // Basit mod tap → jump (held briefly for a full-ish jump)
      state.jump = true; state.holdUntil = performance.now() + TAP_HOLD_MS;
      try { navigator.vibrate?.(6); } catch { /* ignore */ }
    }
    lookP.id = null; lookP.tap = false;
  }
  const b = held.get(id);
  if (b) { held.delete(id); press(b, false); if (![...held.values()].includes(b)) buttonEl(b)?.classList.remove('down'); }
}

/** releaseAll() — drops every role and zeroes the axes / held buttons (edge flags already queued are cleared too). */
export function releaseAll() {
  if (layer) {
    for (const id of [stick.id, lookP.id, ...held.keys()]) if (id != null) { try { layer.releasePointerCapture(id); } catch { /* not captured */ } }
    for (const b of layer.querySelectorAll('.down')) b.classList.remove('down');
  }
  stick.id = null; lookP.id = null; lookP.tap = false; held.clear();
  ring?.classList.remove('show'); moveKnob(0, 0);
  state.ix = state.iy = 0; state.jumpHeld = false; state.holdUntil = 0; state.jump = false; state.pound = false;
}
/** clearEdges() — forget queued jump/pound presses (input.clearEdges calls this on resume / level start). */
export function clearEdges() { state.jump = false; state.pound = false; }

function onFirstTouch(e) {
  if (e && e.pointerType === 'touch' && !document.body.classList.contains('touch')) document.body.classList.add('touch');
  audio.unlock();                                       // AudioContext create/resume inside the gesture (iOS); idempotent
}

// ---------------------------------------------------------------- portrait prompt
const portraitMq = () => matchMedia('(orientation: portrait)');
function updateRotate() {
  if (!rotateEl) return;
  const show = document.body.classList.contains('touch') && portraitMq().matches;
  rotateEl.hidden = !show;
  document.body.classList.toggle('touch-portrait', show);
  if (show) { releaseAll(); if (document.body.dataset.state === 'play') onPauseCb?.(); }
}

// ---------------------------------------------------------------- DOM
const MARKUP = `
  <div id="stick" aria-hidden="true"><div class="knob"></div></div>
  <div class="touch-hint" aria-hidden="true">Sol: yürü · Sağ: kamerayı çevir</div>
  <button type="button" class="tbtn" tabindex="-1" data-btn="pound" aria-label="Yere çakıl">B</button>
  <button type="button" class="tbtn" tabindex="-1" data-btn="jump" aria-label="Zıpla">A</button>
  <button type="button" class="tbtn pill-btn" tabindex="-1" data-btn="pause" aria-label="Duraklat">II</button>`;

/** init({ root, onPause }) — builds #touch + #rotate, loads src/ui/touch.css, wires the listeners. Idempotent. */
export function init({ root = document.body, onPause } = {}) {
  onPauseCb = onPause || null;
  if (layer) return api;
  // stylesheet (index.html is owned by the UI; the link is added from here). Hide our DOM until it has loaded.
  cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet'; cssLink.id = 'touchCss';
  cssLink.href = 'src/ui/touch.css';                   // document-relative like index.html's ui.css (works under the Pages base path)
  document.head.appendChild(cssLink);

  layer = document.createElement('div');
  layer.id = 'touch'; layer.innerHTML = MARKUP; layer.style.display = 'none';
  ring = layer.querySelector('#stick'); knob = ring.firstElementChild;
  // insert right after the canvas: same stacking level as the HUD (z-index auto) but earlier in the DOM, so the HUD's
  // own buttons (#pauseBtn) stay on top and tappable while drags elsewhere land on the layer.
  const canvas = root.querySelector?.('#c');
  if (canvas && canvas.parentNode) canvas.after(layer); else root.prepend(layer);

  rotateEl = document.createElement('div');
  rotateEl.id = 'rotate'; rotateEl.hidden = true; rotateEl.style.display = 'none';
  rotateEl.innerHTML = '<div class="rotate-card"><div class="rotate-icon" aria-hidden="true">📱</div><div class="rotate-text">Telefonu yan çevir 📱↻</div></div>';
  root.appendChild(rotateEl);
  cssLink.addEventListener('load', () => { layer.style.display = ''; rotateEl.style.display = ''; });
  cssLink.addEventListener('error', () => { layer.style.display = ''; rotateEl.style.display = ''; });

  if (wantTouchUi()) document.body.classList.add('touch');
  else if (isTouchDevice) listen(window, 'pointerdown', (e) => { if (e.pointerType === 'touch') { document.body.classList.add('touch'); updateRotate(); } }, { passive: true });
  state.active = true;
  syncSettings();

  listen(layer, 'pointerdown', onDown);
  listen(layer, 'pointermove', onMove);
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(layer, ev, onEnd);
  listen(layer, 'contextmenu', (e) => e.preventDefault());
  listen(layer, 'selectstart', (e) => e.preventDefault());
  listen(rotateEl, 'pointerdown', () => audio.unlock(), { passive: true });
  listen(document, 'visibilitychange', () => { if (document.hidden) releaseAll(); });
  listen(window, 'blur', releaseAll);
  listen(window, 'resize', () => { if (stick.id === null) stick.R = stickRadius(); updateRotate(); });
  const mq = portraitMq();
  listen(mq, 'change', updateRotate);
  // leaving 'play' (pause / win / menu) drops every role; entering it re-reads the Basit / Solak settings
  const mo = new MutationObserver(() => { if (document.body.dataset.state === 'play') syncSettings(); else releaseAll(); });
  mo.observe(document.body, { attributes: true, attributeFilter: ['data-state'] });
  cleanup.push(() => mo.disconnect());
  updateRotate();
  return api;
}

/** setVisible(v) — main.js hides the layer while cam.override runs (vistas / boss intro). */
export function setVisible(v) {
  state.visible = !!v;
  if (!layer) return;
  layer.hidden = !v;
  if (!v) releaseAll();
}

/** merge(input): adds the touch axes/buttons into the keyboard/gamepad input object and returns it. */
export function merge(input) {
  if (!state.active) return input;
  if (held.size === 0 && stick.id === null && lookP.id === null) syncSettings(false);   // Basit / Solak changed in Ayarlar
  input.ix += state.ix; input.iy += state.iy; input.look += state.look;
  if (state.jump) { input.jump = true; state.jump = false; }
  if (state.pound) { input.pound = true; state.pound = false; }
  input.jumpHeld = input.jumpHeld || state.jumpHeld || (state.holdUntil > 0 && performance.now() < state.holdUntil);
  return input;
}

/** dispose() — removes the DOM, the stylesheet and every listener (tests / hot reload). */
export function dispose() {
  releaseAll();
  for (const f of cleanup.splice(0)) f();
  layer?.remove(); rotateEl?.remove(); cssLink?.remove();
  layer = ring = knob = rotateEl = cssLink = null; state.active = false;
  document.body.classList.remove('touch', 'touch-left', 'touch-simple', 'touch-portrait');
}

const api = { state, init, setVisible, merge, releaseAll, clearEdges, syncSettings, dispose };
export const touch = api;
export default touch;
