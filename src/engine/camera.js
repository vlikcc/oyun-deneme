// Follow camera: exp smoothing, pitch clamp, collision pull-in, additive trauma shake; keeps the sun frustum on the player.
import * as THREE from 'three';
import { camera, sun, SUN_DIR, flags } from './core.js';
import { player, movers, sim, probeMeshes } from './physics.js';
import { feel } from './fx.js';
import { emit } from './bus.js';

/**
 * Camera state. Yaw sources, highest priority first (E5):
 *  1. `cam.override = { yaw, pitch, dist, t = 1, hold = Infinity }` — vistas / boss intro: tweens yaw/pitch/dist there over
 *     `t` s (smoothstep), ignores look input, auto-clears after `t + hold` s (or set `cam.override = null`); the previous
 *     pitch/dist are restored over 0.6 s. bus 'cam:override' (true|false) fires on start/end (main.js hides the HUD + touch layer).
 *  2. `cam.suggest = { yaw, until }` (`until` = performance.now() ms; L.camHint refreshes it while the player is inside its
 *     box) — eased toward (rate 2.5/s) once look input has been idle for 1.2 s.
 *  3. `cam.suggestYaw` (radians | null, §12) — eased toward once look input has been idle for 1.5 s.
 *  4. `cam.auto` (setting; default true on touch) — once look input has been idle for 1.2 s and the player moves
 *     (> 1.5 m/s horizontal), yaw eases toward `player.facing + π` (behind Pıtır) at rate 2.5/s, scaled by speed; it never
 *     swings round when the player runs toward the camera (|Δ| > 2.4 rad).
 * `cam.sens` (camera speed multiplier, settings.camSens) and `cam.invertY` apply to every look() call (mouse, touch, pad).
 */
export const cam = { yaw: 0, pitch: 0.42, dist: 10, target: new THREE.Vector3(), lastLook: 0, curDist: 0, idle: false, suggestYaw: null,
  auto: !!flags.touch, suggest: null, override: null, sens: 1, invertY: false };
export const AUTO_IDLE_MS = 1200;
let ov = null;            // active override bookkeeping { ref, el, from: {yaw, pitch, dist}, saved: {pitch, dist} }
let restore = null;       // { pitch, dist, el } easing back after an override ends
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const camRay = new THREE.Raycaster();
const dir = new THREE.Vector3(), want = new THREE.Vector3();

export function look(dx, dy) {
  if (ov) return;                                   // override: input ignored
  const k = cam.sens ?? 1;
  cam.yaw -= dx * k; cam.pitch = clamp(cam.pitch + dy * k * (cam.invertY ? -1 : 1), -0.15, 1.25); cam.lastLook = performance.now();
}
const wrapPi = (a) => ((a + Math.PI * 3) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
const smooth = (k) => k * k * (3 - 2 * k);
/** setOverride({yaw, pitch, dist, t, hold}) / clearOverride() — helpers for cam.override (assigning it directly works too). */
export function setOverride(o) { cam.override = o ? { t: 1, hold: Infinity, ...o } : null; return cam.override; }
export function clearOverride() { cam.override = null; }
function stepOverride(dt) {
  if (cam.override && (!ov || ov.ref !== cam.override)) {
    const first = !ov;
    ov = { ref: cam.override, el: 0, from: { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist }, saved: first ? { pitch: cam.pitch, dist: cam.dist } : ov.saved };
    restore = null;
    if (first) emit('cam:override', true, cam.override);
  }
  if (!cam.override && ov) { restore = { pitch: ov.saved.pitch, dist: ov.saved.dist, el: 0 }; ov = null; emit('cam:override', false); }
  if (ov) {
    const o = ov.ref, T = Math.max(0.001, o.t ?? 1);
    ov.el += dt;
    const k = smooth(Math.min(1, ov.el / T));
    if (o.yaw != null) cam.yaw = ov.from.yaw + wrapPi(o.yaw - ov.from.yaw) * k;
    if (o.pitch != null) cam.pitch = ov.from.pitch + (o.pitch - ov.from.pitch) * k;
    if (o.dist != null) cam.dist = ov.from.dist + (o.dist - ov.from.dist) * k;
    cam.lastLook = performance.now();
    if (ov.el >= T + (o.hold ?? Infinity)) cam.override = null;   // ends next frame
    return true;
  }
  if (restore) {
    restore.el += dt;
    const r = 1 - Math.exp(-6 * dt);
    cam.pitch += (restore.pitch - cam.pitch) * r; cam.dist += (restore.dist - cam.dist) * r;
    if (restore.el > 0.6) { cam.pitch = restore.pitch; cam.dist = restore.dist; restore = null; }
  }
  return false;
}
export function zoom(d) { cam.dist = clamp(cam.dist + d, 5, 16); }
export function reset(yaw = 0, pitch = 0.42) {
  if (ov) { cam.dist = ov.saved.dist; ov = null; emit('cam:override', false); }
  restore = null;
  cam.yaw = yaw; cam.pitch = pitch; cam.curDist = 0; cam.suggestYaw = null; cam.suggest = null; cam.override = null; feel.trauma = 0;
}
export function snap() { update(0.016, 0, true); }

export function update(dt, lookInput = 0, snapNow = false) {
  const overriding = stepOverride(dt);
  if (lookInput && !overriding) { cam.yaw += lookInput * 2.2 * (cam.sens ?? 1) * dt; cam.lastLook = performance.now(); }
  const now = performance.now(), idleMs = now - cam.lastLook;
  if (overriding) { /* yaw/pitch/dist driven by the override */ }
  else if (cam.idle) cam.yaw += dt * 0.12;
  else if (cam.suggest && now < cam.suggest.until && idleMs > AUTO_IDLE_MS) cam.yaw += wrapPi(cam.suggest.yaw - cam.yaw) * (1 - Math.exp(-2.5 * dt));
  else if (cam.suggestYaw != null && idleMs > 1500) cam.yaw += wrapPi(cam.suggestYaw - cam.yaw) * (1 - Math.exp(-2.5 * dt));
  else if (cam.auto && idleMs > AUTO_IDLE_MS && dt > 0) {
    const hs = Math.hypot(player.vel.x, player.vel.z);
    if (hs > 1.5 && !player.pounding) {
      const d = wrapPi(player.facing + Math.PI - cam.yaw);
      if (Math.abs(d) < 2.4) cam.yaw += d * (1 - Math.exp(-2.5 * Math.min(1, hs / 9) * dt));
    }
  }
  if (cam.suggest && now >= cam.suggest.until) cam.suggest = null;
  want.copy(player.pos).add(new THREE.Vector3(0, 1.3, 0));
  // vertical deadzone-ish: follow y slower while airborne so jumps don't bob the view
  const rateXZ = 10, rateY = player.grounded || player.pos.y < cam.target.y - 2 ? 6 : 2.2;
  if (snapNow) cam.target.copy(want);
  else {
    cam.target.x = damp(cam.target.x, want.x, rateXZ, dt);
    cam.target.z = damp(cam.target.z, want.z, rateXZ, dt);
    cam.target.y = damp(cam.target.y, want.y, rateY, dt);
  }
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  dir.set(Math.sin(cam.yaw) * cp, sp, Math.cos(cam.yaw) * cp);
  let dist = cam.dist;
  camRay.set(cam.target, dir); camRay.far = dist;
  const hit = camRay.intersectObjects(probeMeshes(), false)[0];   // skips colliders with solid = false (fading platforms)
  if (hit) dist = Math.max(1.5, hit.distance - 0.4);
  cam.curDist = snapNow || !cam.curDist ? dist : (dist < cam.curDist ? dist : damp(cam.curDist, dist, 4, dt));
  camera.position.copy(cam.target).addScaledVector(dir, cam.curDist);
  const waterY = sim.waterY ?? -1;
  if (camera.position.y < waterY + 0.4) camera.position.y = waterY + 0.4;
  camera.lookAt(cam.target);
  // trauma shake (trauma^2, smooth sin noise, decays)
  if (feel.trauma > 0) {
    feel.trauma = Math.max(0, feel.trauma - 1.4 * dt);
    feel.shakeT += dt * 32;
    const s = feel.trauma * feel.trauma;
    camera.position.x += Math.sin(feel.shakeT * 1.7) * 0.5 * s;
    camera.position.y += Math.sin(feel.shakeT * 2.3) * 0.4 * s;
    camera.rotation.z += Math.sin(feel.shakeT * 1.1) * 0.05 * s;
  }
  // keep the sun's shadow frustum around the player, along theme.sun.dir (§5; SUN_DIR is normalised by applyTheme).
  // 54 m ≈ the original (25, 45, 18) offset length, so the player stays inside the shadow camera's near 1 / far 140.
  sun.position.copy(player.pos).addScaledVector(SUN_DIR, 54);
  sun.target.position.copy(player.pos);
}
export { movers };
export const cameraApi = { cam, update, look, zoom, reset, snap, setOverride, clearOverride, AUTO_IDLE_MS };
export default cameraApi;
