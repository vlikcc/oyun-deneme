// Follow camera: exp smoothing, pitch clamp, collision pull-in, additive trauma shake; keeps the sun frustum on the player.
import * as THREE from 'three';
import { camera, sun, SUN_DIR } from './core.js';
import { player, movers, sim, probeMeshes } from './physics.js';
import { feel } from './fx.js';

// suggestYaw (radians | null): the camera eases toward it once the player has not orbited for 1.5 s (triggers may set it).
export const cam = { yaw: 0, pitch: 0.42, dist: 10, target: new THREE.Vector3(), lastLook: 0, curDist: 0, idle: false, suggestYaw: null };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const camRay = new THREE.Raycaster();
const dir = new THREE.Vector3(), want = new THREE.Vector3();

export function look(dx, dy) {
  cam.yaw -= dx; cam.pitch = clamp(cam.pitch + dy, -0.15, 1.25); cam.lastLook = performance.now();
}
export function zoom(d) { cam.dist = clamp(cam.dist + d, 5, 16); }
export function reset(yaw = 0, pitch = 0.42) { cam.yaw = yaw; cam.pitch = pitch; cam.curDist = 0; cam.suggestYaw = null; feel.trauma = 0; }
export function snap() { update(0.016, 0, true); }

export function update(dt, lookInput = 0, snapNow = false) {
  if (lookInput) { cam.yaw += lookInput * 2.2 * dt; cam.lastLook = performance.now(); }
  if (cam.idle) cam.yaw += dt * 0.12;
  else if (cam.suggestYaw != null && performance.now() - cam.lastLook > 1500) {
    const d = ((cam.suggestYaw - cam.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    cam.yaw += d * (1 - Math.exp(-2.5 * dt));
  }
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
export const cameraApi = { cam, update, look, zoom, reset, snap };
export default cameraApi;
