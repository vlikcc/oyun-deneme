// Mechanic 'enemies-extra' — enemy kinds crab, bat, boulder registered through enemies.register (GDD §3.12).
// The kinds register once at module load (ARCHITECTURE §15: "code that must run once at startup may run at module top
// level"); levels spawn them with L.enemy(kind, ...args):
//   L.enemy('crab', a, b, { speed: 2.4 })                         side-steps a↔b (feet positions) with 0.6 s pauses; stompable
//   L.enemy('bat', home, { r: 4, h: 1.5, skin: 'bat'|'bird' })   circles home (ground point), swoops when < 6 m; stomp/pound
//   L.enemy('boulder', a, b, { every: 5, duration: 3, r: 1.1, skin: 'snow'|'lava', delay: 1 })
//                                                                 rolls a→b (ground points) every `every` s; hazard('spike')
// Every speed is multiplied by physics.assist.enemySpeed at use time (Yardım Modu). install(L) adds the convenience
// wrappers L.crab / L.bat / L.boulder (same arguments as L.enemy).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as enemies from '../enemies.js';
import * as physics from '../physics.js';
import { player, sim } from '../physics.js';
import * as audio from '../audio.js';
import * as fx from '../fx.js';
import { flat } from '../assets.js';

export const name = 'enemies-extra';

const toV3 = (v) => (v?.isVector3 ? v.clone() : new THREE.Vector3(v[0], v[1], v[2]));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const smooth = (k) => k * k * (3 - 2 * k);
const OFF = -1e3;                   // e.h while an entity must not touch the player (enemies.update's contact test fails)
const speedMul = () => physics.assist?.enemySpeed ?? 1;
const place = (geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => geo.applyMatrix4(new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
/** merge lists of geometries into one geometry with one material group per list (one draw call per material). */
const groups = (...lists) => mergeGeometries(lists.map((l) => mergeGeometries(l.map(nonIdx), false)), true);
function shade(m, cast = true) { m.castShadow = cast; m.receiveShadow = true; return m; }
let uid = 0;

// ---------------------------------------------------------------- shared geometry (module cache, never disposed)
const crabGeo = (() => {
  const red = [place(new THREE.SphereGeometry(0.5, 14, 8), 0, 0.42, 0, 0, 0, 0, 1.25, 0.55, 0.9)];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) red.push(place(new THREE.CylinderGeometry(0.05, 0.04, 0.55, 5), sx * 0.5, 0.25, -0.25 + i * 0.25, 0, 0, sx * 0.9));
    red.push(place(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 5), sx * 0.18, 0.75, 0.22));     // eye stalks
  }
  const white = [], dark = [];
  for (const sx of [-1, 1]) { white.push(place(new THREE.SphereGeometry(0.11, 8, 6), sx * 0.18, 0.92, 0.24)); dark.push(place(new THREE.SphereGeometry(0.055, 8, 6), sx * 0.18, 0.94, 0.33)); }
  dark.push(place(new THREE.TorusGeometry(0.12, 0.025, 4, 10, Math.PI), 0, 0.5, 0.43, 0, 0, Math.PI));   // smile
  const body = groups(red, white, dark);
  // one claw: an arm + an upper and a lower pincer (pivot at the shoulder; mirrored with scale.x = -1)
  const arm = [place(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 6), 0.15, 0, 0, 0, 0, Math.PI / 2), place(new THREE.SphereGeometry(0.2, 10, 8), 0.38, 0, 0.05, 0, 0, 0, 1, 0.8, 1.1)];
  const upper = [place(new THREE.ConeGeometry(0.1, 0.32, 6), 0, 0, 0.16, Math.PI / 2)];
  return { body, arm: mergeGeometries(arm.map(nonIdx), false), pincer: mergeGeometries(upper.map(nonIdx), false) };
})();

const batGeo = (() => {
  const body = [place(new THREE.SphereGeometry(0.32, 12, 9), 0, 0, 0, 0, 0, 0, 1, 1.05, 1)];
  const ears = [];
  for (const sx of [-1, 1]) ears.push(place(new THREE.ConeGeometry(0.09, 0.26, 5), sx * 0.15, 0.36, -0.02, 0, 0, sx * -0.25));
  const eyes = [], dark = [];
  for (const sx of [-1, 1]) { eyes.push(place(new THREE.SphereGeometry(0.075, 8, 6), sx * 0.12, 0.07, 0.27)); dark.push(place(new THREE.SphereGeometry(0.035, 6, 5), sx * 0.12, 0.08, 0.335)); }
  const beak = [place(new THREE.ConeGeometry(0.08, 0.22, 6), 0, -0.02, 0.38, Math.PI / 2)];
  // a wing = flattened fan of three segments, pivot at the body edge (x = 0), spreading along +x
  const wing = [];
  for (let i = 0; i < 3; i++) wing.push(place(new THREE.SphereGeometry(0.3, 8, 4), 0.2 + i * 0.22, 0.02 - i * 0.03, -0.02 - i * 0.04, 0, 0, 0, 1, 0.12, 0.62 - i * 0.12));
  return {
    bat: groups([...body, ...ears], eyes, dark),        // body+ears / eyes / pupils
    bird: groups(body, [...eyes.map((g) => g.clone())], dark, beak),   // body / eyes / pupils / beak
    wing: mergeGeometries(wing.map(nonIdx), false),
  };
})();
const BAT_SKINS = {
  bat: { geo: 'bat', mats: () => [flat(0x4b2d6b), flat(0xffe066, { emissive: 0x806000 }), flat(0x1a1030)], wing: () => flat(0x6a4c93), burst: 0x6a4c93 },
  bird: { geo: 'bird', mats: () => [flat(0xffffff), flat(0xffffff), flat(0x1a1030), flat(0xff9f1c)], wing: () => flat(0xe9ecef), burst: 0xffffff },
};

const boulderGeo = new THREE.IcosahedronGeometry(1, 1);
const BOULDER_SKINS = {
  snow: { mat: () => flat(0xf4f9ff, { roughness: 0.95 }), burst: [0xffffff, 0xdbefff], burstKey: 'rock_crumble_2' },
  lava: { mat: () => flat(0x4a2c22, { emissive: 0xff5a1f, emissiveIntensity: 0.55 }), burst: [0xff7a1a, 0x3a2a24], burstKey: 'rock_crumble_2' },
};

// ---------------------------------------------------------------- crab
enemies.register('crab', {
  touch: 'stomp',
  spawn(L, a, b, opts = {}) {
    a = toV3(a); b = toV3(b);
    if (typeof opts === 'number') opts = { speed: opts };
    const g = new THREE.Group();
    const body = shade(new THREE.Mesh(crabGeo.body, [flat(0xff6b4a), flat(0xffffff, { flatShading: false }), flat(0x1a1030)]));
    g.add(body);
    const claws = [];
    for (const sx of [-1, 1]) {
      const c = new THREE.Group(); c.position.set(sx * 0.62, 0.48, 0.22); c.scale.x = sx; c.rotation.y = sx * -0.5;
      const arm = shade(new THREE.Mesh(crabGeo.arm, flat(0xff6b4a)));
      const up = new THREE.Mesh(crabGeo.pincer, flat(0xff8c69)); up.position.set(0.42, 0.06, 0.12);
      const lo = new THREE.Mesh(crabGeo.pincer, flat(0xff8c69)); lo.position.set(0.42, -0.06, 0.12);
      c.add(arm, up, lo); g.add(c); claws.push({ c, up, lo });
    }
    g.position.copy(a);
    const len = Math.max(0.01, Math.hypot(b.x - a.x, b.z - a.z) + Math.abs(b.y - a.y));
    g.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);   // local +x (its side) along a→b: a crab never turns round
    audio.ensure(['enemy_hit_bounce']);
    return { group: g, body, claws, a, b, len, speed: opts.speed ?? 2.4, pause: opts.pause ?? 0.6, seg: 0, k: 0, wait: 0, t: L?.rnd ? L.rnd() * 6 : 0, r: 0.75, h: 0.9, baseOffset: 0 };
  },
  update(e, dt) {
    e.t += dt;
    let moving = false;
    if (e.wait > 0) e.wait -= dt;
    else {
      e.k += (dt * e.speed * speedMul()) / e.len;
      moving = true;
      if (e.k >= 1) { e.k = 0; e.seg ^= 1; e.wait = e.pause; }
    }
    const k = smooth(clamp(e.k, 0, 1)), from = e.seg ? e.b : e.a, to = e.seg ? e.a : e.b;
    e.group.position.lerpVectors(from, to, k);
    e.body.position.y = moving ? Math.abs(Math.sin(e.t * 16)) * 0.06 : 0;
    e.body.rotation.z = moving ? Math.sin(e.t * 16) * 0.08 : 0;
    // claws snap: fast while paused (a warning wave), lazy while walking
    const snap = moving ? 0.15 + Math.sin(e.t * 6) * 0.12 : Math.max(0, Math.sin(e.t * 14)) * 0.55;
    for (const c of e.claws) { c.up.rotation.z = snap; c.lo.rotation.z = -snap; c.c.rotation.z = Math.sin(e.t * 3 + c.c.scale.x) * 0.15; }
  },
  onStomp(e) { audio.play('enemy_hit_bounce'); enemies.kill(e, { color: 0xff6b4a }); },
});

// ---------------------------------------------------------------- bat / bird
enemies.register('bat', {
  touch: 'stomp', poundable: true,
  spawn(L, home, opts = {}) {
    home = toV3(home);
    const skin = BAT_SKINS[opts.skin] ? opts.skin : 'bat', S = BAT_SKINS[skin];
    const g = new THREE.Group();
    const body = shade(new THREE.Mesh(batGeo[S.geo], S.mats()));
    g.add(body);
    const wings = [];
    for (const sx of [-1, 1]) { const w = shade(new THREE.Mesh(batGeo.wing, S.wing())); w.position.set(sx * 0.22, 0.05, 0); w.scale.x = sx; g.add(w); wings.push(w); }
    const r = opts.r ?? 4, h = opts.h ?? 1.5;
    const a0 = (opts.phase ?? (L?.rnd ? L.rnd() : 0)) * Math.PI * 2;
    g.position.set(home.x + Math.cos(a0) * r, home.y + h, home.z + Math.sin(a0) * r);
    audio.ensure(['cartoon_rise_short']);
    return { group: g, body, wings, skin, home, R: r, H: h, ang: a0, dirSign: opts.cw === false ? -1 : 1, mode: 'circle', modeT: 0, cool: 1, target: new THREE.Vector3(),
      t: a0, circleSpeed: opts.circleSpeed ?? 2.5, swoopSpeed: opts.speed ?? 4, range: opts.range ?? 6, r: 0.55, h: 0.7, baseOffset: -0.35, vel: new THREE.Vector3() };
  },
  update(e, dt) {
    const g = e.group, sm = speedMul();
    e.t += dt; e.modeT += dt; e.cool -= dt;
    e.ang += (dt * e.circleSpeed * sm * e.dirSign) / Math.max(0.5, e.R);
    const cx = e.home.x + Math.cos(e.ang) * e.R, cz = e.home.z + Math.sin(e.ang) * e.R, cy = e.home.y + e.H + Math.sin(e.t * 2) * 0.3;
    const prev = tmpA.copy(g.position);
    if (e.mode === 'circle') {
      g.position.set(damp(g.position.x, cx, 6, dt), damp(g.position.y, cy, 6, dt), damp(g.position.z, cz, 6, dt));
      const pp = player.pos, ph = Math.hypot(pp.x - e.home.x, pp.z - e.home.z);
      const d = Math.hypot(pp.x - g.position.x, pp.y + 0.7 - g.position.y, pp.z - g.position.z);
      if (sim.playing && e.cool <= 0 && d < e.range && ph < e.R + e.range) {
        e.mode = 'swoop'; e.modeT = 0; e.target.set(pp.x, pp.y + 0.6, pp.z);
        audio.play('cartoon_rise_short');
      }
    } else {
      const tgt = e.mode === 'swoop' ? e.target : tmpB.set(cx, cy, cz);
      const to = tmpC.subVectors(tgt, g.position), dist = to.length(), step = e.swoopSpeed * sm * dt;
      if (dist <= Math.max(0.25, step)) {
        g.position.copy(tgt);
        if (e.mode === 'swoop') { e.mode = 'return'; e.modeT = 0; } else { e.mode = 'circle'; e.cool = 1.5; }
      } else g.position.addScaledVector(to, step / dist);
      if (e.mode === 'swoop' && e.modeT > 2.5) { e.mode = 'return'; e.modeT = 0; }
      if (e.mode === 'return' && e.modeT > 6) { e.mode = 'circle'; e.cool = 1.5; }   // safety: never stuck away from home
    }
    e.vel.subVectors(g.position, prev);
    if (e.vel.x * e.vel.x + e.vel.z * e.vel.z > 1e-8) {
      const want = Math.atan2(e.vel.x, e.vel.z);
      let d = ((want - g.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      g.rotation.y += d * (1 - Math.exp(-10 * dt));
    }
    const flap = Math.sin(e.t * (e.mode === 'swoop' ? 26 : 16)) * 0.65;
    e.wings[0].rotation.z = flap; e.wings[1].rotation.z = flap;   // mirrored by scale.x
    e.body.rotation.x = e.mode === 'swoop' ? 0.35 : 0;
  },
  onStomp(e) { enemies.kill(e, { color: BAT_SKINS[e.skin].burst }); },
});
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();

// ---------------------------------------------------------------- boulder (snowball / lava rock)
const AX = new THREE.Vector3(), QS = new THREE.Quaternion();
enemies.register('boulder', {
  touch: 'hurt', poundable: false,
  spawn(L, a, b, opts = {}) {
    a = toV3(a); b = toV3(b);
    const skin = BOULDER_SKINS[opts.skin] ? opts.skin : 'snow', S = BOULDER_SKINS[skin];
    const R = opts.r ?? 1.1;
    const g = new THREE.Group();
    const ball = shade(new THREE.Mesh(boulderGeo, S.mat()));
    ball.scale.setScalar(R);
    g.add(ball); g.visible = false;
    g.position.set(a.x, a.y + R, a.z);
    const len = a.distanceTo(b);
    const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z); if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1); dir.normalize();
    audio.ensure(['rock_landslide', 'rock_crumble_2', 'spiky_roll_loop', 'splash']);
    return {
      group: g, ball, skin, a, b, len, dir, axis: new THREE.Vector3(dir.z, 0, -dir.x), R,
      every: Math.max(1, opts.every ?? 5), duration: Math.max(0.3, opts.duration ?? 3), clock: -(opts.delay ?? 1), warned: false,
      rolling: false, rollT: 0, rolled: 0, loopId: `boulder:${++uid}`, loopOn: false, loopGain: -1,
      r: R, h: OFF, touch: 'hurt', baseOffset: -R,       // engine contact off: the boulder hurts through hazard('spike') below
    };
  },
  update(e, dt) {
    const g = e.group, sm = speedMul();
    const dur = Math.min(e.duration / sm, e.every - 0.4);     // Yardım Modu: slower roll, still inside one period
    e.clock += dt;
    if (!e.rolling) {
      if (!e.warned && e.clock >= -0.3) {                     // warn 0.3 s before it appears (GDD §3.12)
        e.warned = true; audio.play('rock_landslide');
        fx.burst(new THREE.Vector3(e.a.x, e.a.y + 0.3, e.a.z), 10, BOULDER_SKINS[e.skin].burst[1], { speed: 3, up: 3, life: 0.5, grav: 8 });
      }
      if (e.clock >= 0) { e.rolling = true; e.rollT = 0; e.rolled = 0; g.visible = true; g.scale.setScalar(0.4); g.position.set(e.a.x, e.a.y + e.R, e.a.z); }
    }
    if (e.rolling) {
      e.rollT += dt;
      const k = Math.min(1, e.rollT / dur);
      const x = e.a.x + (e.b.x - e.a.x) * k, y = e.a.y + (e.b.y - e.a.y) * k, z = e.a.z + (e.b.z - e.a.z) * k;
      g.position.set(x, y + e.R, z);
      g.scale.setScalar(Math.min(1, g.scale.x + dt * 5));
      const d = e.len * k, step = d - e.rolled; e.rolled = d;
      if (step > 0) { QS.setFromAxisAngle(AX.copy(e.axis), step / e.R); e.ball.quaternion.premultiply(QS); }   // rotation = distance / r
      // contact: player capsule (feet .. head) vs the sphere → hazard('spike') (untouchable: never stompable)
      if (sim.playing) {
        const p = player.pos, cy = clamp(g.position.y, p.y + player.R, p.y + player.H - player.R);
        const dd = Math.hypot(p.x - g.position.x, cy - g.position.y, p.z - g.position.z);
        if (dd < e.R + player.R * 0.85) physics.hazard('spike', g.position);
      }
      if (k >= 1) {
        e.rolling = false; g.visible = false; e.warned = false; e.clock -= e.every;
        const S = BOULDER_SKINS[e.skin], at = g.position.clone();
        fx.burst(at, 16, S.burst[0], { speed: 5, up: 5, life: 0.7, size: 1.4 });
        fx.burst(at, 8, S.burst[1], { speed: 4, up: 4, life: 0.6, size: 1.1 });
        audio.play(sim.waterY != null && e.b.y < sim.waterY + 0.3 ? 'splash' : S.burstKey);
      }
    }
    // spiky_roll_loop: one loop per boulder, gain by distance to Pıtır while rolling (0 between rolls)
    const dist = g.position.distanceTo(player.pos);
    const gain = e.rolling ? clamp(1 - dist / 22, 0, 1) * 0.9 : 0;
    if (!e.loopOn && e.rolling && gain > 0.01) e.loopOn = !!audio.playLoop('spiky_roll_loop', { id: e.loopId, bus: 'sfx', fadeIn: 0.1, gain: Math.max(0.0001, gain) });
    if (e.loopOn && Math.abs(gain - e.loopGain) > 0.02) { audio.setLoopGain(e.loopId, gain, 0.08); e.loopGain = gain; }
  },
  dispose(e) { if (e.loopOn) audio.stopLoop(e.loopId, 0.2); e.loopOn = false; },
});

export function install(L) {
  L.crab = (a, b, opts) => L.enemy('crab', a, b, opts);
  L.bat = (home, opts) => L.enemy('bat', home, opts);
  L.boulder = (a, b, opts) => L.enemy('boulder', a, b, opts);
}
