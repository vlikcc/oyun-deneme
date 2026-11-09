// Keyboard / mouse / gamepad → {ix, iy, look, jump, jumpHeld, pound, yaw}; merges touch input (touch.js).
// Edge flags (jump, pound) stay set until physics.stepPlayer consumes them (it sets them back to false).
import { canvas, flags } from './core.js';
import { cam, look, zoom } from './camera.js';
import * as touch from './touch.js';
import { emit } from './bus.js';

const keys = new Set();
const current = { ix: 0, iy: 0, look: 0, jump: false, jumpHeld: false, pound: false, yaw: 0 };
export const settings = { pointerLock: !flags.test && !flags.touch, enabled: true };
let dragging = false, padPrevJump = false, padPrevPound = false;

addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyM') emit('key:mute');
  if (e.code === 'KeyP' || e.code === 'Escape') emit('key:pause', e.code);
  if (!settings.enabled) return;
  if (e.code === 'Space') current.jump = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyC') current.pound = true;
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

canvas.addEventListener('mousedown', () => {
  if (!settings.enabled) return;
  if (settings.pointerLock && document.pointerLockElement !== canvas) canvas.requestPointerLock?.()?.catch?.(() => {});
  dragging = true;
});
addEventListener('mouseup', () => (dragging = false));
addEventListener('mousemove', (e) => {
  if (!settings.enabled) return;
  if (document.pointerLockElement === canvas || dragging) look(e.movementX * 0.0028, e.movementY * 0.0024);
});
canvas.addEventListener('wheel', (e) => { if (settings.enabled) zoom(Math.sign(e.deltaY) * 0.8); }, { passive: true });
document.addEventListener('pointerlockchange', () => emit('pointerlock', document.pointerLockElement === canvas));

export function releasePointer() { if (document.pointerLockElement) document.exitPointerLock?.(); }
export function requestPointer() { if (settings.pointerLock && settings.enabled) canvas.requestPointerLock?.()?.catch?.(() => {}); }

/** read() → the live input object (same instance each frame). */
export function read() {
  let ix = 0, iy = 0, lk = 0;
  if (settings.enabled) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) iy += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) iy -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
    if (keys.has('KeyQ')) lk += 1;
    if (keys.has('KeyE')) lk -= 1;
    current.jumpHeld = keys.has('Space');
    const pad = navigator.getGamepads?.()?.find?.((p) => p);
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      ix += dz(pad.axes[0]); iy -= dz(pad.axes[1]);
      lk -= dz(pad.axes[2] ?? 0) * 1.2;
      const py = dz(pad.axes[3] ?? 0); if (py) look(0, py * 0.03);
      const pj = pad.buttons[0]?.pressed, pp = pad.buttons[1]?.pressed || pad.buttons[2]?.pressed || pad.buttons[6]?.pressed;
      if (pj && !padPrevJump) current.jump = true;
      if (pp && !padPrevPound) current.pound = true;
      current.jumpHeld ||= !!pj; padPrevJump = !!pj; padPrevPound = !!pp;
      if (pad.buttons[9]?.pressed && !padPrevStart) emit('key:pause', 'pad');
      padPrevStart = !!pad.buttons[9]?.pressed;
    }
  } else current.jumpHeld = false;
  current.ix = ix; current.iy = iy; current.look = lk;
  if (settings.enabled) touch.merge(current);          // touch axes + A/B edges + jumpHeld (touch.js); dropped while disabled
  else touch.clearEdges?.();
  const len = Math.hypot(current.ix, current.iy);
  if (len > 1) { current.ix /= len; current.iy /= len; }
  current.yaw = cam.yaw;
  return current;
}
let padPrevStart = false;
export function clearEdges() { current.jump = false; current.pound = false; touch.clearEdges?.(); }
export function setEnabled(v) { settings.enabled = v; if (!v) { keys.clear(); clearEdges(); touch.releaseAll?.(); } }

export const input = { read, clearEdges, setEnabled, settings, releasePointer, requestPointer, touch };
export default input;
