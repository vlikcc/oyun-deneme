// Enemy registry + built-in kinds (slime, spiky). New kinds: enemies.register(kind, def); L.enemy(kind, ...args).
// def = { spawn(L, ...args) → entity, update(e, dt, ctx), onStomp?(e), touch: 'hurt'|'stomp', poundable?: bool }
// entity = { kind, group (THREE.Group at feet), alive, dead, r, h, baseOffset (feet = group.y + baseOffset), ...own fields }
import * as THREE from 'three';
import { scene } from './core.js';
import { flat } from './assets.js';
import { player, sim, lastInput, squash } from './physics.js';
import * as physics from './physics.js';
import { burst, hitStop, addTrauma } from './fx.js';
import * as fx from './fx.js';
import { sfx } from './audio.js';
import * as audio from './audio.js';
import { emit, on } from './bus.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
function shade(m, cast = true) { m.castShadow = cast; m.receiveShadow = true; return m; }

export const kinds = new Map();
export const enemies = [];
let seed = 99;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);   // runtime wander PRNG (not the level's L.rnd)
export function reseed(s = 99) { seed = s; }

export function register(kind, def) {
  if (!def || typeof def.spawn !== 'function') throw new Error('enemies.register: def.spawn required for ' + kind);
  kinds.set(kind, { touch: 'hurt', ...def });
  return def;
}
export function has(kind) { return kinds.has(kind); }
/** spawn(kind, L, ...args) → entity (added to `enemies`, group added to the scene). */
export function spawn(kind, L, ...args) {
  const def = kinds.get(kind);
  if (!def) throw new Error('enemies: unknown kind ' + kind);
  const e = def.spawn(L, ...args);
  if (!e || !e.group) throw new Error('enemies: spawn must return {group}');
  Object.assign(e, { kind, def, alive: true, dead: 0, r: e.r ?? 0.6, h: e.h ?? 1, baseOffset: e.baseOffset ?? 0, touch: e.touch ?? def.touch });
  if (!e.group.parent) scene.add(e.group);
  enemies.push(e);
  return e;
}
export function kill(e, { coins = 2, color } = {}) {
  if (!e.alive) return;
  e.alive = false; e.dead = 0;
  sfx.stomp(); hitStop(0.05); addTrauma(0.15);
  burst(e.group.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 14, color ?? (e.kind === 'slime' ? 0xc77dff : 0x777777), { speed: 5, up: 4, life: 0.6 });
  for (let i = 0; i < coins; i++) { player.coins++; sfx.coin(); }
  emit('hud'); emit('enemy:killed', e);
}
export function clear() {
  for (const e of enemies) { scene.remove(e.group); e.def.dispose?.(e); }
  enemies.length = 0;
}
export function alive() { return enemies.filter((e) => e.alive).length; }

const ctx = { player, physics, fx, audio, scene, enemies };
export function update(dt) {
  const pp = player.pos;
  for (const e of enemies) {
    const g = e.group;
    if (!e.alive) {
      if (e.dead >= 0) {
        e.dead += dt;
        g.scale.set(1 + e.dead * 3, Math.max(0.05, 1 - e.dead * 6), 1 + e.dead * 3);
        if (e.dead > 0.3) { g.visible = false; e.dead = -1; }
      }
      continue;
    }
    e.def.update?.(e, dt, ctx);
    // player contact
    if (!sim.playing) continue;
    const base = g.position.y + e.baseOffset;
    const hd = Math.hypot(pp.x - g.position.x, pp.z - g.position.z);
    if (hd < e.r + player.R && pp.y < base + e.h && pp.y + player.H > base) {
      const stompable = e.touch === 'stomp';
      if (stompable && player.vel.y < 0 && pp.y > base + e.h * 0.4) {
        if (e.def.onStomp) e.def.onStomp(e, ctx); else kill(e);
        player.pounding = false;
        player.vel.y = physics.lastInput?.jumpHeld ? 17 : 12; player.cutAllowed = false; player.grounded = false;
        squash(0.8, 1.25);
      } else physics.hurt(g.position);
    }
  }
}
// ground pound shockwave kills nearby stompable enemies
on('pound', (pos) => {
  for (const e of enemies) {
    if (!e.alive) continue;
    const ep = e.group.position;
    if (Math.hypot(ep.x - pos.x, ep.z - pos.z) < 3.2 && Math.abs(ep.y - pos.y) < 1.8 && (e.def.poundable ?? e.touch === 'stomp')) {
      if (e.def.onStomp) e.def.onStomp(e, ctx); else kill(e);
    }
  }
});

// ---------------------------------------------------------------- built-in: slime
// The face (2 eyes, 2 pupils, 2 brows) is one merged geometry with two material groups: 1 draw call instead of 6.
const slimeGeo = (() => {
  const place = (geo, x, y, z, rz = 0) => geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(1, 1, 1)));
  const white = [], dark = [];
  for (const sx of [-1, 1]) {
    white.push(place(new THREE.SphereGeometry(0.11, 8, 6), 0.2 * sx, 0.55, 0.42));
    dark.push(place(new THREE.SphereGeometry(0.06, 8, 6), 0.2 * sx, 0.55, 0.52));
    dark.push(place(new THREE.BoxGeometry(0.2, 0.04, 0.04), 0.2 * sx, 0.7, 0.48, -0.4 * sx));
  }
  return {
    body: new THREE.SphereGeometry(0.62, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
    base: new THREE.CircleGeometry(0.62 * Math.sin(Math.PI * 0.62), 16),
    face: mergeGeometries([mergeGeometries(white, false), mergeGeometries(dark, false)], true),
  };
})();
register('slime', {
  touch: 'stomp',
  spawn(L, x, y, z, roam = 4, color = 0x9b5de5) {
    const g = new THREE.Group();
    const body = shade(new THREE.Mesh(slimeGeo.body, flat(color, { flatShading: false, roughness: 0.35 })));
    const base = new THREE.Mesh(slimeGeo.base, flat(color)); base.rotation.x = Math.PI / 2; base.position.y = 0.62 * Math.cos(Math.PI * 0.62);
    const inner = new THREE.Group(); inner.add(body, base); inner.position.y = -0.62 * Math.cos(Math.PI * 0.62);
    inner.add(new THREE.Mesh(slimeGeo.face, [flat(0xffffff, { flatShading: false }), flat(0x1a1030)]));
    g.add(inner); g.position.set(x, y, z);
    const r = L?.rnd ?? rnd;
    return { group: g, inner, home: new THREE.Vector3(x, y, z), roam, y, dir: r() * 6, timer: 0, r: 0.6, h: 1.0, phase: r() * 6, baseOffset: 0 };
  },
  update(e, dt) {
    const g = e.group, pp = player.pos;
    e.phase += dt * 6;
    const dx = pp.x - g.position.x, dz = pp.z - g.position.z, dist = Math.hypot(dx, dz);
    const chasing = dist < 7.5 && Math.abs(pp.y - e.y) < 2.5 && sim.playing;
    let speed = 1.8;
    if (chasing) { e.dir = Math.atan2(dx, dz); speed = 3.3; }
    else {
      e.timer -= dt;
      if (e.timer <= 0) { e.dir = rnd() * Math.PI * 2; e.timer = 1.5 + rnd() * 2; }
    }
    const nx = g.position.x + Math.sin(e.dir) * speed * dt, nz = g.position.z + Math.cos(e.dir) * speed * dt;
    if (Math.hypot(nx - e.home.x, nz - e.home.z) < e.roam) { g.position.x = nx; g.position.z = nz; }
    else e.dir = Math.atan2(e.home.x - g.position.x, e.home.z - g.position.z);
    g.rotation.y = damp(g.rotation.y, e.dir, 8, dt);
    const s = Math.sin(e.phase);
    e.inner.scale.set(1 + s * 0.08, 1 - s * 0.1, 1 + s * 0.08);
    g.position.y = e.y;
  },
});

// ---------------------------------------------------------------- built-in: spiky (patrols a→b, cannot be stomped)
// core + 12 spikes merged into one geometry with two material groups (2 draw calls instead of 13 per spiky)
const spikyGeo = (() => {
  const core = new THREE.IcosahedronGeometry(0.55, 0);
  const spike = new THREE.ConeGeometry(0.14, 0.45, 5);
  const ico = core.getAttribute('position');
  const seen = new Set(), spikes = [];
  for (let i = 0; i < ico.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(ico, i); const k = v.toArray().map((n) => n.toFixed(2)).join();
    if (seen.has(k)) continue; seen.add(k);
    const g = spike.clone();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(v.clone().multiplyScalar(1.15), q, new THREE.Vector3(1, 1, 1)));
    spikes.push(g);
  }
  const body = mergeGeometries([core.toNonIndexed(), mergeGeometries(spikes.map((g) => g.toNonIndexed()), false)], true);
  return { body, eye: new THREE.SphereGeometry(0.1, 8, 6) };
})();
const toV3 = (v) => (v?.isVector3 ? v.clone() : new THREE.Vector3(v[0], v[1], v[2]));
register('spiky', {
  touch: 'hurt', poundable: false,
  spawn(L, a, b, speed = 2.6) {
    a = toV3(a); b = toV3(b);
    const g = new THREE.Group();
    const core = shade(new THREE.Mesh(spikyGeo.body, [flat(0x495057), flat(0xffe066)]));
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(spikyGeo.eye, flat(0xff3b3b, { emissive: 0xaa0000 })); e.position.set(0.2 * sx, 0.15, 0.48); g.add(e); }
    core.position.y = 0; g.add(core); g.position.copy(a); g.position.y += 0.6;
    return { group: g, core, a, b, speed, t: 0, r: 0.75, h: 1.2, y: a.y, baseOffset: -0.6 };
  },
  update(e, dt) {
    const g = e.group;
    e.t += dt * e.speed / Math.max(0.01, e.a.distanceTo(e.b));
    const k = (1 - Math.cos(e.t * Math.PI)) / 2;
    g.position.lerpVectors(e.a, e.b, k); g.position.y = e.y + 0.6 + Math.abs(Math.sin(e.t * 9)) * 0.15;
    e.core.rotation.x += dt * 4; e.core.rotation.y += dt * 2;
    const dir = Math.sin(e.t * Math.PI) >= 0 ? 1 : -1;
    g.rotation.y = Math.atan2((e.b.x - e.a.x) * dir, (e.b.z - e.a.z) * dir);
  },
});

export const enemiesApi = { kinds, enemies, register, has, spawn, kill, clear, alive, update, reseed };
export default enemiesApi;
