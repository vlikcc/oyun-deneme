// Particles, coin pops, hit-stop and camera trauma helpers (game-feel).
import * as THREE from 'three';
import { scene } from './core.js';

const particles = [];
const partGeo = new THREE.IcosahedronGeometry(0.12, 0);
const matCache = new Map();
function pmat(color) {
  // one shared material per colour; opacity is faked by scale so particles can share materials (fewer allocations)
  let m = matCache.get(color);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, transparent: true }); matCache.set(color, m); }
  return m;
}
// Separate PRNG so visual effects never touch the level's seeded L.rnd() stream.
let seed = 12345;
export function rnd() { return ((seed = (seed * 16807) % 2147483647) / 2147483647); }
export function reseed(s = 12345) { seed = s; }

/** burst(pos, n, color, {speed, up, life, size, grav, spread}) — a puff of chunky particles. */
export function burst(pos, n, color, { speed = 4, up = 3, life = 0.6, size = 1, grav = 12, spread = 1 } = {}) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(partGeo, pmat(color));
    m.position.copy(pos);
    const a = rnd() * Math.PI * 2, s = speed * (0.5 + rnd() * 0.5);
    const v = new THREE.Vector3(Math.cos(a) * s * spread, up * (0.5 + rnd()), Math.sin(a) * s * spread);
    m.scale.setScalar(size * (0.6 + rnd() * 0.8));
    m.castShadow = false; m.layers.set(1);   // not drawn in the water reflection pass (core.NO_REFLECT_LAYER)
    scene.add(m);
    particles.push({ m, v, life, max: life, grav, s0: m.scale.x });
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { scene.remove(p.m); particles.splice(i, 1); continue; }
    p.v.y -= p.grav * dt;
    p.m.position.addScaledVector(p.v, dt);
    const k = p.life / p.max;
    p.m.scale.setScalar(Math.max(0.001, p.s0 * k));
  }
}

const pops = []; // collected coins flying up
export function pop(mesh) { pops.push({ mesh, t: 0 }); }
function updatePops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; p.t += dt;
    p.mesh.position.y += dt * 6; p.mesh.rotation.y += dt * 25;
    p.mesh.scale.setScalar(Math.max(0.01, 1 - p.t / 0.35));
    if (p.t > 0.35) { scene.remove(p.mesh); pops.splice(i, 1); }
  }
}

/** Hit-stop: real-time countdown during which the simulation runs at 5 % speed. */
export const feel = { hitStop: 0, trauma: 0, shakeT: 0 };
export function hitStop(d) { feel.hitStop = Math.max(feel.hitStop, d); }
export function addTrauma(a) { feel.trauma = Math.min(1, feel.trauma + a); }

export function update(dt) { updateParticles(dt); updatePops(dt); }
export function clear() {
  for (const p of particles) scene.remove(p.m);
  for (const p of pops) scene.remove(p.mesh);
  particles.length = 0; pops.length = 0; feel.hitStop = 0; feel.trauma = 0;
}

export const fx = { burst, pop, hitStop, addTrauma, feel, update, clear, rnd, reseed };
export default fx;
