// Pıtır's visual: model, squash/stretch spring, feet run cycle, flips, blob shadow. Reads physics.player, never writes gameplay state
// (except player.groundY, the ground probe used by the pound check).
import * as THREE from 'three';
import { scene } from './core.js';
import { flat } from './assets.js';
import { player, movers, sim, probeMeshes } from './physics.js';
import { burst } from './fx.js';
import { step as footstep } from './audio.js';

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function shade(m, cast = true) { m.castShadow = cast; m.receiveShadow = true; return m; }

export const pModel = new THREE.Group();      // world position + facing
export const pVis = new THREE.Group();        // squash/stretch pivot (at feet)
export const pSpin = new THREE.Group();       // flips / pound spin (pivot at body center)
pSpin.position.y = 0.7; pVis.add(pSpin); pModel.add(pVis); scene.add(pModel);
export const cosmetics = { scarf: null, scarfTail: null, hat: null };
{
  const body = shade(new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 16), flat(0xff9f43, { flatShading: false, roughness: 0.6 })));
  body.scale.set(1, 0.95, 1);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), flat(0xfff1d6, { flatShading: false }));
  belly.position.set(0, -0.12, 0.27); belly.scale.set(1, 0.9, 0.6);
  const eyeW = new THREE.SphereGeometry(0.16, 12, 10), eyeB = new THREE.SphereGeometry(0.085, 10, 8);
  const eyes = [];
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(eyeW, flat(0xffffff, { flatShading: false })); w.position.set(0.2 * sx, 0.15, 0.52); w.scale.z = 0.6;
    const b = new THREE.Mesh(eyeB, flat(0x2b2140, { flatShading: false })); b.position.set(0.21 * sx, 0.16, 0.6);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); shine.position.set(0.24 * sx, 0.2, 0.66);
    eyes.push(w, b, shine);
  }
  const cheekM = flat(0xff6f91, { flatShading: false });
  const ch1 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), cheekM); ch1.position.set(-0.36, -0.02, 0.46); ch1.scale.z = 0.4;
  const ch2 = ch1.clone(); ch2.position.x = 0.36;
  // sprout on head
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.35, 5), flat(0x3f9f3a)); stem.position.set(0, 0.72, 0);
  const leafGeo = new THREE.SphereGeometry(0.17, 8, 6);
  const l1 = shade(new THREE.Mesh(leafGeo, flat(0x6fd36a))); l1.scale.set(1.4, 0.35, 0.7); l1.position.set(-0.17, 0.9, 0); l1.rotation.z = 0.5;
  const l2 = shade(new THREE.Mesh(leafGeo, flat(0x6fd36a))); l2.scale.set(1.4, 0.35, 0.7); l2.position.set(0.17, 0.9, 0); l2.rotation.z = -0.5;
  // scarf
  const scarfMat = new THREE.MeshStandardMaterial({ color: 0x4dabf7, roughness: 0.85, flatShading: true });
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 8, 20), scarfMat); scarf.rotation.x = Math.PI / 2; scarf.position.y = -0.3;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.38, 0.06), scarfMat); tail.position.set(0.2, -0.45, -0.48); tail.rotation.z = 0.3;
  pSpin.add(body, belly, ...eyes, ch1, ch2, stem, l1, l2, scarf, tail);
  player.leaves = [l1, l2]; player.scarfTail = tail;
  cosmetics.scarf = scarf; cosmetics.scarfTail = tail; cosmetics.scarfMat = scarfMat;
}
export const feet = [];
for (const sx of [-1, 1]) {
  const f = shade(new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), flat(0x7a3e1d)));
  f.scale.set(1, 0.6, 1.5); f.position.set(0.24 * sx, 0.09, 0.05);
  pVis.add(f); feet.push(f);
}
// Blob shadow (depth cue for 3D jumps)
export const blob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
blob.rotation.x = -Math.PI / 2; blob.renderOrder = 2; blob.layers.set(1); scene.add(blob);

export function setScarfColor(hex) { cosmetics.scarfMat.color.set(hex); }

export function update(dt, t) {
  const p = player;
  pModel.position.copy(p.pos);
  pModel.rotation.y = p.facing;
  // squash/stretch spring (returns to rest)
  const k = 260, c = 16;
  p.scaleVel.x += ((1 - p.scale.x) * k - p.scaleVel.x * c) * dt;
  p.scaleVel.y += ((1 - p.scale.y) * k - p.scaleVel.y * c) * dt;
  p.scale.x += p.scaleVel.x * dt; p.scale.y += p.scaleVel.y * dt; p.scale.z = p.scale.x;
  pVis.scale.copy(p.scale);
  // flip on triple jump / spin on pound
  if (p.pounding && p.poundHold > 0) pSpin.rotation.x += dt * 30;
  else if (p.pounding) pSpin.rotation.x = 0;
  else if (p.flip > 0) { p.flip += dt; pSpin.rotation.x = Math.min(1, (p.flip - 1) / 0.55) * Math.PI * 2; if (p.flip > 1.55) p.flip = 0; }
  else pSpin.rotation.x = damp(pSpin.rotation.x % (Math.PI * 2), 0, 20, dt);
  // run cycle
  const hs = Math.hypot(p.vel.x, p.vel.z);
  if (p.grounded && hs > 0.5) {
    p.runPhase += dt * hs * 2.2;
    feet[0].position.z = Math.sin(p.runPhase) * 0.25 + 0.05; feet[1].position.z = -Math.sin(p.runPhase) * 0.25 + 0.05;
    feet[0].position.y = 0.09 + Math.max(0, Math.cos(p.runPhase)) * 0.12; feet[1].position.y = 0.09 + Math.max(0, -Math.cos(p.runPhase)) * 0.12;
    pSpin.position.y = 0.7 + Math.abs(Math.sin(p.runPhase)) * 0.08;
    pSpin.rotation.z = Math.sin(p.runPhase) * 0.06;
    if (Math.sin(p.runPhase) * Math.sin(p.runPhase - dt * hs * 2.2) < 0) {   // a foot touched down
      if (hs > 3) footstep(p.ground?.steps || 'grass');                       // §11: sample set by the ground's material role
      if (hs > 6) burst(p.pos.clone().add(new THREE.Vector3(0, 0.05, 0)), 1, 0xf5ead0, { speed: 1, up: 0.6, life: 0.3, grav: 0 });
    }
  } else {
    for (const f of feet) { f.position.z = damp(f.position.z, p.grounded ? 0.05 : -0.1, 12, dt); f.position.y = damp(f.position.y, p.grounded ? 0.09 : 0.0, 12, dt); }
    pSpin.position.y = damp(pSpin.position.y, 0.7 + (p.grounded ? Math.sin(t * 3) * 0.02 : 0), 10, dt);
    pSpin.rotation.z = damp(pSpin.rotation.z, 0, 10, dt);
  }
  // body lean into motion
  pVis.rotation.x = damp(pVis.rotation.x, p.grounded ? hs * 0.012 : -p.vel.y * 0.008, 10, dt);
  p.leaves[0].rotation.z = 0.5 + Math.sin(t * 8) * 0.1 + (p.grounded ? 0 : p.vel.y * 0.02);
  p.leaves[1].rotation.z = -0.5 - Math.sin(t * 8) * 0.1 - (p.grounded ? 0 : p.vel.y * 0.02);
  p.scarfTail.rotation.x = damp(p.scarfTail.rotation.x, -hs * 0.08 - Math.max(0, -p.vel.y) * 0.03, 8, dt);
  // invulnerability blink
  pModel.visible = p.invuln > 0 ? Math.floor(p.invuln * 14) % 2 === 0 : true;
}

// Blob shadow + ground probe
const ray = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
const origin = new THREE.Vector3();
export function groundBelow(x, y, z, far = 60) {
  origin.set(x, y + 0.3, z);
  ray.set(origin, down); ray.far = far;
  const hit = ray.intersectObjects(probeMeshes(movers.map((m) => m.mesh)), false)[0];   // honours collider.solid = false (§12)
  return hit ? hit.point.y : null;
}
export function updateBlob() {
  const gy0 = groundBelow(player.pos.x, player.pos.y, player.pos.z);
  const gy = gy0 ?? (sim.waterY ?? -1) - 0.15;
  player.groundY = gy;
  const h = player.pos.y - gy;
  blob.position.set(player.pos.x, gy + 0.03, player.pos.z);
  blob.scale.setScalar(clamp(1 - h * 0.04, 0.45, 1));
  blob.material.opacity = clamp(0.4 - h * 0.012, 0.15, 0.4);
  blob.visible = gy0 !== null;
}
export const playerVisual = { pModel, pVis, pSpin, feet, blob, update, updateBlob, groundBelow, setScarfColor, cosmetics };
export default playerVisual;
