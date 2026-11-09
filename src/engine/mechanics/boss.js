// Mechanic 'boss' — L.boss(x, y, z, opts) — Kral Pelte, registered as enemy kind 'boss' (GDD §3.11).
//
//   const king = L.boss(x, y, z, { arenaR: 8, hp: 3, waitFor: { name: 'lanterns', id: 'count', value: 4 }, portal: [x, y, z] })
//
// (x, y, z) = arena centre on the floor (y = walkable top). The boss is registered as enemy kind 'boss' and spawned through
// L.enemy, so it lives in enemies.enemies and dies with the level. States:
//   wait      hidden until it starts: `king.start()`, the `waitFor` signal ({name, id, value?}: a numeric value means
//             "signal arg ≥ value", otherwise any arg !== false) or — without waitFor and with `autoStart !== false` —
//             Pıtır coming within arenaR + 1 m of the centre (|dy| < 4).
//   intro     drops from 18 m above, lands (dust, trauma, boss_footstep) + boss_roar_1; cam.override 2 s toward the boss.
//   idle      1.0 s (slime_big_growl), turns to face Pıtır.
//   telegraph 0.8 s: squashes to 0.7, eyes narrow, boss_grunt; the hop target = Pıtır's position now (clamped to the arena),
//             shown as a red ring on the floor.
//   hop       ballistic 1.1 s onto the target (asymmetric gravity solve of the cannon: up at GRAV, down at GRAV·FALL_MULT).
//   slam      hit-stop 0.06, trauma 0.5, boss_footstep; a shock ring expands 0 → 7 m in 1.6 s (Yardım 2.2 s) and hurts
//             (hazard 'spike') when |hd − ring.r| < 0.6 and Pıtır's feet are below base + 0.8 (jump it!).
//   dizzy     2.5 s, stars over the head, stompable (stomp or ground-pound) → hit: hp−1, boss_grunt, scale ×0.85, hop
//             speed ×1.15, 2 slimes after the first hit (= at 2 HP); then a harmless retreat hop and back to idle.
//   dead      hp 0: 60-particle burst, boss_laugh_1 fading, level_complete_trumpets, the crystal built hidden at
//             (x, y + 1.4, z) appears, optional `opts.portal` is placed, world.emit('boss', 'dead').
// hp: opts.hp ?? 3 (Yardım Modu: 2). Extra signals: world.emit('boss', 'start' | 'landed' | 'hit', hp).
// Options: { arenaR = 8, hp, waitFor, autoStart, portal: [x, y, z, rotY?], crystalColor, slimeColor, color, name }.
//
// Local workarounds (shared files are frozen for this phase, see the report): the crystal is built during build() (so
// world.load's crystal-count assert sees it) and kept `taken = true, visible = false` until the boss dies.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as enemies from '../enemies.js';
import * as physics from '../physics.js';
import { player, sim, GRAV, FALL_MULT } from '../physics.js';
import * as audio from '../audio.js';
import * as fx from '../fx.js';
import * as bus from '../bus.js';
import { flat } from '../assets.js';

export const name = 'boss';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const smooth = (k) => k * k * (3 - 2 * k);
const wrapPi = (a) => ((a + Math.PI * 3) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
const OFF = -1e3;                         // e.h while the boss must not touch the player (enemies.update's contact test fails)
const SFX = ['boss_roar_1', 'slime_big_growl', 'boss_grunt', 'boss_footstep', 'boss_laugh_1', 'level_complete_trumpets'];

export const BOSS = {
  R: 2, H: 2.2,                           // contact cylinder at full size (GDD: cyl r 2 h 2.2)
  IDLE: 1.0, TELEGRAPH: 0.8, HOP: 1.1, SLAM: 0.35, DIZZY: 2.5, HIT: 0.5, RETREAT: 0.9, INTRO: 2.0, INTRO_DROP: 18,
  RING_R: 7, RING_T: 1.6, RING_T_ASSIST: 2.2, RING_HALF: 0.6, RING_FEET: 0.8,
  SHRINK: 0.85, SPEEDUP: 1.15,
};

// ---------------------------------------------------------------- shared geometry (module cache, never disposed)
const place = (geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => geo.applyMatrix4(new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
const GEO = (() => {
  // the slime build (enemies.js) — body cap + base disc + face — then ×3.5 (height squashed to 2.2 m)
  const cap = Math.PI * 0.62, yc = -0.62 * Math.cos(cap);
  const body = place(new THREE.SphereGeometry(0.62, 28, 18, 0, Math.PI * 2, 0, cap), 0, yc, 0);
  const base = place(new THREE.CircleGeometry(0.62 * Math.sin(cap), 28), 0, 0.001, 0, Math.PI / 2);
  const bodyGeo = mergeGeometries([nonIdx(body), nonIdx(base)], false);
  const white = [], pupil = [], brow = [];
  for (const sx of [-1, 1]) {
    white.push(place(new THREE.SphereGeometry(0.11, 10, 8), 0.2 * sx, 0, 0));
    pupil.push(place(new THREE.SphereGeometry(0.06, 8, 6), 0.2 * sx, 0, 0.1));
    brow.push(place(new THREE.BoxGeometry(0.22, 0.045, 0.045), 0.2 * sx, 0.14, 0.06, 0, 0, -0.45 * sx));
  }
  const eyes = mergeGeometries([mergeGeometries(white.map(nonIdx), false), mergeGeometries([...pupil, ...brow].map(nonIdx), false)], true);
  const mouth = place(new THREE.TorusGeometry(0.09, 0.022, 5, 12, Math.PI), 0, 0, 0, 0, 0, Math.PI);
  // crown: open band + 5 spikes (gold) and 5 gems (red), one geometry with two groups
  const gold = [new THREE.CylinderGeometry(0.2, 0.22, 0.12, 20, 1, true)];
  const gems = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    gold.push(place(new THREE.ConeGeometry(0.06, 0.16, 5), Math.sin(a) * 0.2, 0.13, Math.cos(a) * 0.2));
    gems.push(place(new THREE.OctahedronGeometry(0.035, 0), Math.sin(a) * 0.215, 0.0, Math.cos(a) * 0.215));
  }
  const crown = mergeGeometries([mergeGeometries(gold.map(nonIdx), false), mergeGeometries(gems.map(nonIdx), false)], true);
  return {
    body: bodyGeo, eyes, mouth, crown,
    star: new THREE.OctahedronGeometry(0.22, 0),
    wave: new THREE.CylinderGeometry(1, 1, 0.55, 48, 1, true).translate(0, 0.275, 0),   // shock wall, scaled (r, 1, r)
    waveFloor: new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2),
    marker: new THREE.RingGeometry(1.6, 2.1, 40).rotateX(-Math.PI / 2),
  };
})();

// ---------------------------------------------------------------- enemy kind 'boss'
const v1 = new THREE.Vector3();
function setContact(e, on) { e.contact = on; e.h = on ? BOSS.H * e.size : OFF; e.r = BOSS.R * e.size; }
function enter(e, state) {
  e.state = state; e.st = 0;
  const L = e.L;
  if (state === 'idle') { e.touch = 'hurt'; setContact(e, true); e.stars.visible = false; L.sfx('slime_big_growl'); }
  else if (state === 'telegraph') {
    L.sfx('boss_grunt');
    const p = player.pos, dx = p.x - e.home.x, dz = p.z - e.home.z, d = Math.hypot(dx, dz), lim = Math.max(0, e.arenaR - BOSS.R * e.size * 0.75);
    const k = d > lim ? lim / d : 1;
    e.from.copy(e.group.position); e.to.set(e.home.x + dx * k, e.home.y, e.home.z + dz * k);
    e.marker.position.set(e.to.x, e.home.y + 0.04, e.to.z); e.marker.visible = true; e.marker.scale.setScalar(e.size);
  } else if (state === 'hop' || state === 'retreat') {
    e.hopT = (state === 'hop' ? BOSS.HOP : BOSS.RETREAT) / e.speed;
    e.tUp = e.hopT / (1 + 1 / Math.sqrt(FALL_MULT));          // T = tUp + tDown, apex reached at GRAV, fall at GRAV·FALL_MULT
    e.apex = 0.5 * GRAV * e.tUp * e.tUp;
    e.from.copy(e.group.position);
    if (state === 'retreat') { setContact(e, false); e.marker.visible = false; }
  } else if (state === 'slam') {
    e.marker.visible = false; e.group.position.copy(e.to);
    fx.hitStop(0.06); fx.addTrauma(0.5); L.sfx('boss_footstep');
    fx.burst(v1.copy(e.to).setY(e.to.y + 0.2), 24, 0xd8c9a8, { speed: 8, up: 2, life: 0.6, grav: 6, size: 1.4 });
    e.ring.active = true; e.ring.r = 0; e.ring.c.copy(e.to); e.ring.hit = false;
    e.wave.visible = true; e.wave.position.copy(e.to);
  } else if (state === 'dizzy') { e.touch = 'stomp'; e.stars.visible = true; L.toast('Kral Pelte sersemledi! Üstüne zıpla!', 1.6); }
  else if (state === 'hit') { e.touch = 'hurt'; setContact(e, false); e.stars.visible = false; }
}
function startBoss(e) {
  if (e.state !== 'wait' || !e.alive) return;
  enter(e, 'intro');
  e.group.visible = true;
  e.group.position.set(e.home.x, e.home.y + BOSS.INTRO_DROP, e.home.z);
  e.landed = false;
  const p = player.pos;
  // camera behind Pıtır looking at the arena (cam yaw = direction from the target to the camera)
  e.L.cam.override = { yaw: Math.atan2(p.x - e.home.x, p.z - e.home.z), pitch: 0.32, dist: 15, t: 0.6, hold: BOSS.INTRO - 0.6 };
  player.controlLock = Math.max(player.controlLock, BOSS.INTRO);
  e.L.emit('boss', 'start');
}
function hopY(e, t) {          // height above the floor during a hop (t seconds in)
  if (t <= e.tUp) { const v0 = GRAV * e.tUp; return v0 * t - 0.5 * GRAV * t * t; }
  const td = t - e.tUp; return Math.max(0, e.apex - 0.5 * GRAV * FALL_MULT * td * td);
}

enemies.register('boss', {
  touch: 'hurt',                          // poundable stays undefined → a ground-pound counts only while touch === 'stomp' (dizzy)
  spawn(L, x, y, z, opts = {}) {
    const color = opts.color ?? 0x7ad957;
    const g = new THREE.Group();
    const inner = new THREE.Group(); g.add(inner);
    const bodyMat = L.own(new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.93, emissive: 0x000000 }));
    const body = new THREE.Mesh(GEO.body, bodyMat); body.castShadow = true; body.receiveShadow = true;
    const sx = 3.5, sy = BOSS.H / 0.85;   // slime cap is ≈ 0.85 tall at scale 1 → 2.2 m
    body.scale.set(sx, sy, sx);
    const eyes = new THREE.Mesh(GEO.eyes, [flat(0xffffff, { flatShading: false }), flat(0x1a1030)]);
    eyes.scale.setScalar(sx); eyes.position.set(0, 0.55 * sy, 0.5 * sx);
    const mouth = new THREE.Mesh(GEO.mouth, flat(0x1a1030)); mouth.scale.setScalar(sx); mouth.position.set(0, 0.36 * sy, 0.6 * sx);
    const crown = new THREE.Mesh(GEO.crown, [flat(0xffc93c, { metalness: 0.6, roughness: 0.3 }), flat(0xff3b6b, { emissive: 0x801030 })]);
    crown.scale.setScalar(sx); crown.position.y = BOSS.H + 0.1; crown.castShadow = true;
    inner.add(body, eyes, mouth, crown);
    const stars = new THREE.Group();
    for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(GEO.star, flat(0xffe066, { emissive: 0xffc93c, emissiveIntensity: 0.8 })); stars.add(s); }
    stars.visible = false; stars.position.y = BOSS.H + 0.9; g.add(stars);
    g.position.set(x, y + 60, z); g.visible = false;
    // shock ring (wall + floor band) and the telegraph marker: level objects (L.add → removed on unload)
    const waveMat = L.own(new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
    const wave = new THREE.Group();
    wave.add(new THREE.Mesh(GEO.wave, waveMat), new THREE.Mesh(GEO.waveFloor, L.own(new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }))));
    wave.visible = false; wave.renderOrder = 3; L.smallLayer(L.add(wave));
    const marker = new THREE.Mesh(GEO.marker, L.own(new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.55, depthWrite: false })));
    marker.visible = false; marker.renderOrder = 2; L.smallLayer(L.add(marker));
    // the reward crystal is built now (crystal-count assert) and revealed when the boss bursts
    const crystal = L.crystal(x, y + 1.4, z, opts.crystalColor ?? 0xffd23f);
    crystal.taken = true; crystal.group.visible = false; crystal.bossHidden = true;
    const assistOn = !!physics.assist?.on;
    const e = {
      group: g, inner, body, bodyMat, eyes, crown, stars, wave, marker, crystal, L, opts, baseColor: new THREE.Color(color),
      home: new THREE.Vector3(x, y, z), arenaR: opts.arenaR ?? 8, hp: opts.hp ?? (assistOn ? 2 : 3), maxHp: 0,
      ringT: assistOn ? BOSS.RING_T_ASSIST : BOSS.RING_T, ring: { active: false, r: 0, c: new THREE.Vector3(), hit: false },
      state: 'wait', st: 0, t: 0, size: 1, speed: 1, from: new THREE.Vector3(), to: new THREE.Vector3(x, y, z),
      hopT: 1, tUp: 0.5, apex: 1, contact: false, touch: 'hurt', r: BOSS.R, h: OFF, baseOffset: 0, slimes: false, yaw: 0,
    };
    e.maxHp = e.hp;
    e.start = () => startBoss(e);
    // start conditions: an explicit signal, else proximity (autoStart), else only king.start()
    if (opts.waitFor) {
      const w = opts.waitFor;
      L.on(w.name, w.id, (v) => {
        const ok = w.value === undefined ? v !== false : typeof w.value === 'number' ? Number(v) >= w.value : v === w.value;
        if (ok) startBoss(e);
      });
    }
    e.autoStart = opts.autoStart ?? !opts.waitFor;
    // Pıtır respawned (fell / fainted): the shock ring and the telegraph marker go away
    L._track.unsubs.push(bus.on('respawn', () => { e.ring.active = false; e.wave.visible = false; }));
    audio.ensure(SFX);
    return e;
  },
  update(e, dt) {
    const g = e.group, p = player.pos, L = e.L;
    e.t += dt; e.st += dt;
    // shock ring (independent of the state: it keeps running through dizzy)
    if (e.ring.active) {
      const ring = e.ring;
      ring.r += (BOSS.RING_R / e.ringT) * dt;
      const s = Math.max(0.01, ring.r);
      e.wave.scale.set(s, 1 + 0.4 * (1 - ring.r / BOSS.RING_R), s);
      e.wave.children[0].material.opacity = 0.75 * (1 - 0.6 * ring.r / BOSS.RING_R);
      const hd = Math.hypot(p.x - ring.c.x, p.z - ring.c.z);
      if (sim.playing && !ring.hit && Math.abs(hd - ring.r) < BOSS.RING_HALF && p.y < ring.c.y + BOSS.RING_FEET && p.y > ring.c.y - 1.5) {
        if (physics.hazard('spike', ring.c)) ring.hit = true;
      }
      if (ring.r >= BOSS.RING_R) { ring.active = false; e.wave.visible = false; }
    }
    if (e.stars.visible) {
      e.stars.children.forEach((s, i) => { const a = e.t * 4 + (i / 3) * Math.PI * 2; s.position.set(Math.cos(a) * 0.9, Math.sin(e.t * 6 + i) * 0.12, Math.sin(a) * 0.9); s.rotation.y = e.t * 5; });
      e.stars.position.y = BOSS.H * e.size + 0.7;
    }
    // face Pıtır (except mid-air / dizzy)
    if (e.state === 'idle' || e.state === 'telegraph' || e.state === 'intro') {
      const want = Math.atan2(p.x - g.position.x, p.z - g.position.z);
      g.rotation.y += wrapPi(want - g.rotation.y) * (1 - Math.exp(-5 * dt));
    }
    const inner = e.inner;
    let sxz = 1, sy = 1;
    switch (e.state) {
      case 'wait': {
        if (e.autoStart && sim.playing) {
          const hd = Math.hypot(p.x - e.home.x, p.z - e.home.z);
          if (hd < e.arenaR + 1 && Math.abs(p.y - e.home.y) < 4) startBoss(e);
        }
        return;
      }
      case 'intro': {
        if (!e.landed) {
          const y = e.home.y + BOSS.INTRO_DROP - 0.5 * GRAV * FALL_MULT * e.st * e.st;
          if (y <= e.home.y) {
            e.landed = true; g.position.y = e.home.y; e.landT = e.st;
            setContact(e, true); fx.addTrauma(0.6); fx.hitStop(0.06);
            L.sfx('boss_footstep'); L.sfx('boss_roar_1');
            fx.burst(v1.copy(e.home).setY(e.home.y + 0.2), 30, 0xd8c9a8, { speed: 9, up: 3, life: 0.7, grav: 6, size: 1.5 });
            L.toast('Kral Pelte geldi!', 1.6);
            L.emit('boss', 'landed');
          } else { g.position.y = y; sxz = 0.85; sy = 1.2; }
        }
        if (e.landed) {
          const k = e.st - e.landT; sxz = 1 + Math.exp(-k * 5) * 0.35 * Math.cos(k * 18); sy = 2 - sxz;
          if (k > 0.3 && k < 1.4) { inner.position.x = Math.sin(e.t * 40) * 0.04; }   // roar tremble
          else inner.position.x = 0;
        }
        if (e.st >= BOSS.INTRO) { inner.position.x = 0; enter(e, 'idle'); }
        break;
      }
      case 'idle': {
        const breathe = Math.sin(e.t * 4) * 0.05; sxz = 1 + breathe; sy = 1 - breathe;
        const idleT = BOSS.IDLE / e.speed / Math.max(0.3, physics.assist?.enemySpeed ?? 1);   // Yardım Modu: longer pauses
        const hd = Math.hypot(p.x - e.home.x, p.z - e.home.z);
        if (e.st >= idleT && hd < e.arenaR + 3 && Math.abs(p.y - e.home.y) < 5 && sim.playing) enter(e, 'telegraph');
        break;
      }
      case 'telegraph': {
        const k = smooth(clamp(e.st / 0.35, 0, 1));
        sy = 1 - 0.3 * k; sxz = 1 + 0.18 * k;                              // squash to 0.7
        inner.position.x = Math.sin(e.t * 50) * 0.05 * k;
        e.eyes.scale.y = 3.5 * (1 - 0.6 * k);                            // eyes narrow
        e.marker.material.opacity = 0.35 + 0.3 * Math.abs(Math.sin(e.t * 10));
        if (e.st >= BOSS.TELEGRAPH) { inner.position.x = 0; e.eyes.scale.y = 3.5; enter(e, 'hop'); }
        break;
      }
      case 'hop': case 'retreat': {
        const t = Math.min(e.st, e.hopT), k = t / e.hopT;
        g.position.set(e.from.x + (e.to.x - e.from.x) * k, e.home.y + hopY(e, t), e.from.z + (e.to.z - e.from.z) * k);
        const vy = t <= e.tUp ? 1 - t / e.tUp : -(t - e.tUp) / (e.hopT - e.tUp);
        sy = 1 + 0.25 * vy; sxz = 1 - 0.12 * vy;                                 // stretch going up and coming down
        if (e.state === 'hop') e.marker.material.opacity = 0.3 + 0.4 * k;
        if (e.st >= e.hopT) {
          if (e.state === 'hop') enter(e, 'slam');
          else { g.position.copy(e.to); L.sfx('boss_footstep'); fx.addTrauma(0.2); enter(e, 'idle'); }
        }
        break;
      }
      case 'slam': {
        const k = e.st / BOSS.SLAM; sy = 0.65 + 0.35 * smooth(k); sxz = 1.3 - 0.3 * smooth(k);
        if (e.st >= BOSS.SLAM) enter(e, 'dizzy');
        break;
      }
      case 'dizzy': {
        g.rotation.y += dt * 1.5;
        inner.rotation.z = Math.sin(e.t * 5) * 0.12;
        sy = 1 - 0.05 * Math.sin(e.t * 7);
        if (e.st >= BOSS.DIZZY) { inner.rotation.z = 0; enter(e, 'idle'); }
        break;
      }
      case 'hit': {
        const k = e.st / BOSS.HIT;
        sy = 0.7 + 0.3 * smooth(k); sxz = 1.25 - 0.25 * smooth(k);
        inner.rotation.z = 0;
        e.bodyMat.emissive.setRGB(1, 1, 1).multiplyScalar(Math.abs(Math.sin(e.st * 30)) * 0.6);
        if (e.st >= BOSS.HIT) {
          e.bodyMat.emissive.setRGB(0, 0, 0);
          // harmless retreat hop back toward the centre (away from Pıtır when he stands there)
          const px = p.x - e.home.x, pz = p.z - e.home.z, pd = Math.hypot(px, pz);
          if (pd < 3.5) {
            const r = Math.max(0, Math.min(4, e.arenaR - 2.5)), ux = pd > 0.01 ? -px / pd : 0, uz = pd > 0.01 ? -pz / pd : 1;
            e.to.set(e.home.x + ux * r, e.home.y, e.home.z + uz * r);
          } else e.to.copy(e.home);
          enter(e, 'retreat');
        }
        break;
      }
      default: break;
    }
    inner.scale.set(sxz, sy, sxz);
    g.scale.setScalar(e.size);
  },
  onStomp(e) {
    if (e.state !== 'dizzy' || !e.alive) return;
    const L = e.L;
    e.hp--;
    L.sfx('boss_grunt'); fx.hitStop(0.1); fx.addTrauma(0.35);
    fx.burst(v1.copy(e.group.position).setY(e.group.position.y + BOSS.H * e.size), 16, e.baseColor.getHex(), { speed: 6, up: 5, life: 0.6 });
    L.emit('boss', 'hit', e.hp);
    if (e.hp <= 0) { bossDies(e); return; }
    e.size *= BOSS.SHRINK; e.speed *= BOSS.SPEEDUP;
    L.toast(e.hp === 1 ? 'Bir vuruş kaldı!' : `Aferin! ${e.hp} vuruş kaldı!`, 1.4);
    if (!e.slimes) {                       // GDD: "at 2 HP spawns 2 slimes" (first hit; also with Yardım Modu's 2 HP)
      e.slimes = true;
      const c = e.home, r = Math.min(4, e.arenaR - 2);
      for (const s of [-1, 1]) {
        const sl = L.slime(c.x + s * r, c.y, c.z + s * 0.5 * r, Math.min(3, e.arenaR - r), e.opts.slimeColor ?? 0x9b5de5);
        fx.burst(sl.group.position.clone().setY(c.y + 0.5), 10, e.opts.slimeColor ?? 0x9b5de5, { speed: 3, up: 4, life: 0.5 });
      }
    }
    enter(e, 'hit');
  },
  dispose(e) { audio.stopLoop('boss:laugh', 0.2); e.ring.active = false; },
});

function bossDies(e) {
  const L = e.L, at = e.group.position.clone().setY(e.group.position.y + 1.1 * e.size);
  e.state = 'dead'; e.ring.active = false; e.wave.visible = false; e.marker.visible = false; e.stars.visible = false;
  e.bodyMat.emissive.setRGB(0, 0, 0);
  enemies.kill(e, { coins: 5, color: e.baseColor.getHex() });
  fx.burst(at, 40, e.baseColor.getHex(), { speed: 9, up: 8, life: 1.1, grav: 8, size: 1.6 });       // 60 in all with the two below
  fx.burst(at, 12, 0xffc93c, { speed: 7, up: 9, life: 1.2, grav: 7, size: 1.2 });
  fx.burst(at, 8, 0xffffff, { speed: 5, up: 6, life: 0.9, grav: 5, size: 1.0 });
  fx.hitStop(0.15); fx.addTrauma(0.6);
  // boss_laugh_1 fading out (a one-shot loop entry so it can fade), then the fanfare
  if (audio.playLoop('boss_laugh_1', { id: 'boss:laugh', bus: 'sfx', fadeIn: 0.02, vol: 0.85 })) {
    let tl = 0; const fader = L.dynamic({ update(dt) { tl += dt; if (tl > 0.45) { audio.stopLoop('boss:laugh', 0.9); L.remove(fader); } } });
  } else L.sfx('boss_laugh_1');
  L.sfx('level_complete_trumpets');
  L.toast('Kral Pelte yenildi! 👑', 2.2);
  // reveal the crystal (built hidden at spawn) and place the portal, after the burst has read
  let t = 0;
  const reveal = L.dynamic({ update(dt) {
    t += dt; if (t < 0.6) return;
    L.remove(reveal);
    const c = e.crystal;
    if (c && c.bossHidden) {
      c.bossHidden = false; c.taken = false; c.base = e.home.y + 1.4;
      c.group.position.set(e.home.x, c.base, e.home.z); c.group.visible = true;
      fx.burst(c.group.position.clone(), 24, c.color, { speed: 5, up: 5, life: 0.9, grav: 5, size: 1.2 });
    }
    if (e.opts.portal) { const [px, py, pz, rotY = 0] = e.opts.portal; L.portal(px, py, pz, { rotY }); }
  } });
  L.emit('boss', 'dead');
}

export function install(L) {
  /** L.boss(x, y, z, opts) → the boss entity (`.start()`, `.hp`, `.state`). See the header for opts. */
  L.boss = (x, y, z, opts = {}) => L.enemy('boss', x, y, z, opts);
}
