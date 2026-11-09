// Mechanic 'signals' — L.switch / L.riser / L.key / L.door / L.lantern — signal wiring through world.emit/on (GDD §3.7).
// install(L, ctx) attaches the primitives; ctx = { scene, player, physics, enemies, fx, audio, assets, world }.
//
//   L.switch(x, top, z, id, { pound = false, timed = 0 })   stone button standing on `top`; walk-in (onLand) or pound-only
//       (player.pounding at landing). Press: sinks 0.25 m (riders carried through c.delta), `switch_click_bright`,
//       world.emit('switch', id, true). timed: after `timed × physics.assist.timed` s emits false and pops back up,
//       `timer_tick` for the last 3 s; re-pressable (landing on it again restarts the timer). Returns the switch record
//       { c, id, pressed, press(), release() }.
//   L.riser(c, dy, dur, id, { signal, count })   tweens collider c (box or cyl) + its mesh by dy over dur s when signal id
//       turns on (switch or lantern id) and back on false; writes c.delta every step so riders are carried; `lever_gate`
//       when it starts moving. id 'lanterns' (or signal: 'lanterns') rises once the lit-lantern count reaches `count`
//       (default: every lantern of the level). Returns the riser record.
//   L.key(x, y, z, id)   gold key (bob + spin); pickup → `key_pickup` + `key_jingle_foley`, HUD 🔑 (bus 'hud:slot' + 'hud'), follows Pıtır at
//       (0, 2, 0) with lag 6, player.keys.add(id), world.emit('key', id, true). Lost on faint → back to its origin,
//       world.emit('key', id, false).
//   L.door(x, top, z, w, d, h, id)   box collider + large_castle_door prop on floor `top`; bumping it with key `id` →
//       `door_unlock`, slides up h + 0.3 over 1.2 s, then physics.setSolid(false), key consumed, world.emit('door', id, true).
//       Without the key: `door_lock_click` + toast "Kilitli! Anahtar lazım." (throttled 2 s).
//   L.lantern(x, z, id, { y })   Lantern_01 on a stone post (collider cyl r 0.5) standing on the ground found under (x, z);
//       walking into it (trigger r ≈ 1.3, bump or landing) lights it: emissive 2 + glow sprite, `switch_toggle` +
//       `star_wand_ping` + `fire_crackle_loop` (1 s), world.emit('lantern', id, true) and world.emit('lanterns', 'count', n).
//       ≤ 3 pooled PointLights (1 on low) follow the lit lanterns nearest the player. HUD 🏮 n/N (bus 'hud:slot').
//
// Workarounds (no shared file may change, ARCHITECTURE §15):
//  * player.keys does not exist on the physics player: install() sets `player.keys = new Set()` for every level load.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as bus from '../bus.js';

export const name = 'signals';


// ---------------------------------------------------------------- shared (never disposed) resources
let shared = null;
function getShared() {
  if (shared) return shared;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const x = cv.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,214,140,.65)'); g.addColorStop(1, 'rgba(255,170,60,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const glowTex = new THREE.CanvasTexture(cv);
  // key: bow (torus) + shaft + two teeth, merged into one geometry (one draw call); origin at the key's centre
  const bow = new THREE.TorusGeometry(0.24, 0.075, 8, 18).translate(0, 0.42, 0);
  const shaft = new THREE.CylinderGeometry(0.06, 0.06, 0.78, 8).translate(0, -0.09, 0);
  const t1 = new THREE.BoxGeometry(0.2, 0.08, 0.08).translate(0.1, -0.38, 0);
  const t2 = new THREE.BoxGeometry(0.14, 0.08, 0.08).translate(0.07, -0.22, 0);
  const keyGeo = mergeGeometries([bow, shaft, t1, t2].map((q) => q.toNonIndexed()));
  [bow, shaft, t1, t2].forEach((q) => q.dispose());
  const keyMat = new THREE.MeshStandardMaterial({ color: 0xffcf40, emissive: 0x6b4a00, emissiveIntensity: 0.7, metalness: 0.7, roughness: 0.28, envMapIntensity: 0.6 });
  const plinthGeo = new THREE.CylinderGeometry(1.05, 1.12, 0.12, 20);
  shared = { glowTex, keyGeo, keyMat, plinthGeo };
  return shared;
}

const SFX_KEYS = ['switch_click_bright', 'timer_tick', 'lever_gate', 'key_pickup', 'key_jingle_foley', 'door_unlock', 'door_lock_click', 'switch_toggle', 'star_wand_ping', 'fire_crackle_loop'];
const smooth = (k) => k * k * (3 - 2 * k);
const T = (c) => (c.type === 'box' ? c.max.y : c.y1);   // collider top

/** Move a box/cyl collider (and its mesh) vertically by d metres. */
function shiftY(c, d) {
  if (c.type === 'box') { c.min.y += d; c.max.y += d; } else { c.y0 += d; c.y1 += d; }
  if (c.top != null) c.top += d;
  if (c.mesh) { c.mesh.position.y += d; c.mesh.updateMatrixWorld(); }
}

export function install(L, ctx) {
  const { player, physics, audio, assets, fx } = ctx;
  const sim = physics.sim;
  player.keys = new Set();

  // ------------------------------------------------ per-level shared state
  let clock = 0;                       // seconds since the first primitive (advanced by the shared dynamic)
  let warmed = false;
  const switches = [], risers = [], keys = [], doors = [], lanterns = [];
  let lights = null;                   // pooled PointLights (lazy)
  const tmpV = new THREE.Vector3(), centre = new THREE.Vector3();

  const warm = () => { if (!warmed) { warmed = true; audio.ensure?.(SFX_KEYS); } };
  /** snd(key, fallback): the sample when decoded, else the synth fallback once while the sample loads. */
  const snd = (key, fallback) => {
    if (audio.has?.(key)) audio.play(key);
    else { if (fallback) audio.play(fallback); audio.ensure?.([key]); }
  };
  // HUD slots (hud.js: bus 'hud:slot'(kind, n, total)): 🔑 n while keys are carried, 🏮 lit/N once the level has lanterns.
  // hud.js resets its slots on 'level:loaded' (after build), so the lantern slot is (re)announced right after that.
  const keySlot = () => {
    const n = keys.filter((k) => k.state === 'held').length;
    bus.emit('hud:slot', 'key', n || null);
    bus.emit('hud');
  };
  const lanternSlot = () => {
    if (!lanterns.length) return;
    bus.emit('hud:slot', 'lantern', lanterns.filter((l) => l.lit).length, lanterns.length);
  };
  L._track.unsubs.push(bus.on('level:loaded', () => { lanternSlot(); if (keys.length) keySlot(); }));

  // One dynamic drives every primitive of this module (fixed 120 Hz step, before physics.stepPlayer).
  let driver = null;
  const ensureDriver = () => {
    if (driver) return;
    warm();
    driver = L.dynamic({
      update(dt, t) {
        clock += dt;
        centre.copy(player.pos); centre.y += 0.7;
        for (const s of switches) stepSwitch(s, dt);
        for (const r of risers) stepRiser(r, dt);
        for (const k of keys) stepKey(k, dt, t);
        for (const d of doors) stepDoor(d, dt);
        if (lanterns.length) stepLanterns(dt, t);
      },
      dispose() {
        for (const id of [...crackles]) audio.stopLoop?.(id, 0.1);
        crackles.clear();
        if (lights) for (const l of lights) { l.removeFromParent(); l.dispose?.(); }
        lights = null;
      },
    });
  };

  // ================================================================ switch
  const SINK = 0.25, BTN_H = 0.35;
  function stepSwitch(s, dt) {
    if (s.pressed && s.timed > 0) {
      const before = s.timer;
      s.timer -= dt;
      if (s.timer <= 3 && Math.ceil(s.timer) < Math.ceil(before) && s.timer > 0) snd('timer_tick', 'switch');
      if (s.timer <= 0) s.release();
    }
    const want = s.pressed ? SINK : 0;
    const d = Math.sign(want - s.sink) * Math.min(Math.abs(want - s.sink), dt * 2.5);
    if (d !== 0) { s.sink += d; shiftY(s.c, -d); s.c.delta.set(0, -d, 0); }
    else s.c.delta.set(0, 0, 0);
    s.capMat.emissiveIntensity += ((s.pressed ? 0.9 : 0.15) - s.capMat.emissiveIntensity) * Math.min(1, dt * 10);
  }
  L.switch = (x, top, z, id, opts = {}) => {
    ensureDriver();
    const pound = !!opts.pound, timed = opts.timed ?? 0;
    const base = pound ? 0xff5e5e : 0xffc93c;
    const capMat = L.own(new THREE.MeshStandardMaterial({ color: base, emissive: base, emissiveIntensity: 0.15, roughness: 0.45 }));
    const c = L.cyl(x, top + BTN_H, z, 0.8, BTN_H + SINK, { mat: { side: 'stone', top: capMat }, seg: 20, tags: ['switch'] });
    const plinth = new THREE.Mesh(getShared().plinthGeo, L.assets.pbr('stone'));
    plinth.position.set(x, top + 0.06, z); plinth.receiveShadow = true; plinth.castShadow = false;
    L.add(plinth);
    const s = {
      c, id, pound, timed, capMat, base, pressed: false, sink: 0, timer: 0, presses: 0,
      press() {
        const again = s.pressed;
        if (timed > 0) s.timer = timed * (physics.assist.timed ?? 1);
        if (again) return;
        s.pressed = true; s.presses++;
        capMat.color.set(0x69db7c); capMat.emissive.set(0x69db7c);
        snd('switch_click_bright', 'switch');
        fx.burst(new THREE.Vector3(x, top + 0.4, z), 10, 0x69db7c, { speed: 3, up: 2, life: 0.45, grav: 6 });
        L.emit('switch', id, true);
      },
      release() {
        if (!s.pressed) return;
        s.pressed = false; s.timer = 0;
        capMat.color.set(base); capMat.emissive.set(base);
        snd('switch_click_bright', 'switch');
        L.emit('switch', id, false);
      },
    };
    c.onLand = (p) => { if (pound && !p.pounding) return; s.press(); };   // fires before onPoundLand clears `pounding`
    if (pound) {
      // A fast pound can cross the ground top under the button and the button top in the same step (60 Hz test ticks:
      // 0.57 m/step); then onPoundLand fires on the ground collider first and the button's onLand sees pounding = false.
      // The bus 'pound' event at the button's footprint presses it too.
      L._track.unsubs.push(bus.on('pound', (pos) => {
        if (!pos || Math.hypot(pos.x - x, pos.z - z) > 0.8 + player.R) return;
        if (pos.y > T(c) + 0.05 || pos.y < top - 0.6) return;
        s.press();
      }));
    }
    c.switchRec = s;
    switches.push(s);
    return s;
  };

  // ================================================================ riser
  function stepRiser(r, dt) {
    const goal = r.up ? 1 : 0;
    if (r.k === goal) { r.c.delta.set(0, 0, 0); r.moving = false; return; }
    if (!r.moving) { r.moving = true; snd('lever_gate', 'door'); }
    r.k = goal > r.k ? Math.min(1, r.k + dt / r.dur) : Math.max(0, r.k - dt / r.dur);
    const off = r.dy * smooth(r.k), d = off - r.off;
    r.off = off;
    shiftY(r.c, d); r.c.delta.set(0, d, 0);
  }
  L.riser = (c, dy, dur = 1.5, id, opts = {}) => {
    ensureDriver();
    const r = { c, dy, dur: Math.max(0.05, dur), id, up: false, k: 0, off: 0, moving: false, set(v) { r.up = !!v; } };
    const signal = opts.signal ?? (id === 'lanterns' ? 'lanterns' : null);
    if (signal === 'lanterns') {
      L.on('lanterns', 'count', (n) => r.set(n >= (opts.count ?? lanterns.length)));
    } else {
      if (!signal || signal === 'switch') L.on('switch', id, (v) => r.set(v !== false));
      if (!signal || signal === 'lantern') L.on('lantern', id, (v) => r.set(v !== false));
    }
    c.riser = r;
    risers.push(r);
    return r;
  };

  // ================================================================ key
  function stepKey(k, dt, t) {
    const g = k.group;
    if (k.state === 'idle') {
      g.position.set(k.origin.x, k.origin.y + Math.sin(t * 2 + k.phase) * 0.22, k.origin.z);
      k.mesh.rotation.y = t * 1.8;
      if (sim.playing && g.position.distanceToSquared(centre) < 2.0) pickKey(k);
    } else if (k.state === 'held') {
      tmpV.set(player.pos.x, player.pos.y + 2 + Math.sin(t * 3) * 0.08, player.pos.z);
      g.position.lerp(tmpV, 1 - Math.exp(-6 * dt));
      k.mesh.rotation.y = t * 2.6;
    } else if (k.state === 'used') {
      k.useT += dt;
      g.position.lerp(k.useTo, 1 - Math.exp(-10 * dt));
      g.scale.setScalar(Math.max(0.01, 1 - k.useT / 0.45));
      if (k.useT >= 0.45) {
        k.state = 'gone'; g.visible = false;
        fx.burst(g.position.clone(), 14, 0xffcf40, { speed: 4, up: 3, life: 0.5 });
      }
    }
  }
  function pickKey(k) {
    k.state = 'held';
    player.keys.add(k.id);
    snd('key_pickup', 'key'); snd('key_jingle_foley');
    fx.burst(k.group.position.clone(), 18, 0xffcf40, { speed: 4, up: 4, life: 0.6, grav: 6 });
    L.toast('Anahtarı aldın! 🔑', 1.4);
    keySlot();
    L.emit('key', k.id, true);
  }
  function loseKey(k) {
    k.state = 'idle';
    player.keys.delete(k.id);
    k.group.position.copy(k.origin); k.group.scale.setScalar(1); k.group.visible = true;
    L.emit('key', k.id, false);
  }
  L.key = (x, y, z, id) => {
    ensureDriver();
    const sh = getShared();
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(sh.keyGeo, sh.keyMat); mesh.castShadow = true; mesh.rotation.z = 0.25;
    const glow = new THREE.Sprite(L.own(new THREE.SpriteMaterial({ map: sh.glowTex, color: 0xffe08a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })));
    glow.scale.setScalar(1.9);
    g.add(glow, mesh); g.position.set(x, y, z);
    L.smallLayer(g); L.add(g);
    const k = { key: true, id, group: g, mesh, origin: new THREE.Vector3(x, y, z), state: 'idle', phase: keys.length * 1.3, useT: 0, useTo: new THREE.Vector3() };
    keys.push(k);
    return k;
  };
  // faint → every carried key goes home (a plain respawn keeps it)
  L._track.unsubs.push(bus.on('faint', () => {
    let lost = false;
    for (const k of keys) if (k.state === 'held') { loseKey(k); lost = true; }
    if (lost) keySlot();
  }));

  // ================================================================ door
  function stepDoor(d, dt) {
    if (d.state !== 'opening') return;
    d.t += dt;
    const k = smooth(Math.min(1, d.t / 1.2));
    const off = (d.h + 0.3) * k, step = off - d.off;
    d.off = off;
    shiftY(d.c, step);
    d.group.position.y = d.top + off;
    d.group.updateMatrixWorld();
    if (d.t >= 1.2) { d.state = 'open'; physics.setSolid(d.c, false); L.emit('door', d.id, true); }
  }
  function openDoor(d) {
    d.state = 'opening'; d.t = 0;
    player.keys.delete(d.id);
    const k = keys.find((q) => q.id === d.id && q.state === 'held');
    if (k) { k.state = 'used'; k.useT = 0; k.useTo.set(d.x, d.top + d.h * 0.5, d.z); }
    keySlot();
    snd('door_unlock', 'door');
    fx.addTrauma?.(0.2);
    L.toast('Kapı açıldı!', 1.4);
  }
  L.door = (x, top, z, w, d, h, id) => {
    ensureDriver();
    const c = L.box(x, top + h, z, w, d, h, { mat: 'wood', castShadow: true, tags: ['door'] });
    const across = d > w;                                     // the door plane runs along z
    const span = across ? d : w, thick = across ? w : d;
    const group = L.prop('large_castle_door', x, top, z, { rotY: across ? Math.PI / 2 : 0 });
    group.loaded?.then((m) => {
      if (!m) return;
      const bb = m.userData.bbox?.size ?? [2.01, 2.96, 0.3];
      group.scale.set(span / bb[0], h / bb[1], Math.min(2.2, Math.max(0.8, thick / bb[2])));
      c.mesh.visible = false;                                // the collider box stays (camera / blob probes), the prop is the visual
      group.updateMatrixWorld(true);
    });
    const rec = { door: true, c, group, id, x, top, z, w, d, h, state: 'closed', t: 0, off: 0, lastMsg: -99 };
    c.onBonk = () => {
      if (rec.state !== 'closed') return;
      if (player.keys.has(id)) { openDoor(rec); return; }
      if (clock - rec.lastMsg < 2) return;
      rec.lastMsg = clock;
      snd('door_lock_click', 'door');
      L.toast('Kilitli! Anahtar lazım.', 1.6);
    };
    doors.push(rec);
    return rec;
  };

  // ================================================================ lantern
  const crackles = new Set();
  const crackleStops = [];
  const MAX_LIGHTS = () => (L.quality.tier === 'low' ? 1 : 3);
  function ensureLights() {
    if (lights) return;
    lights = [];
    for (let i = 0; i < MAX_LIGHTS(); i++) {
      const pl = new THREE.PointLight(0xffb347, 0, 10, 2);
      pl.castShadow = false; pl.userData.lanternPool = true;
      L.add(pl);                                               // constant light count for the whole level: no shader recompiles
      lights.push(pl);
    }
  }
  function stepLanterns(dt, t) {
    for (let i = crackleStops.length - 1; i >= 0; i--) {
      if ((crackleStops[i].t -= dt) <= 0) { audio.stopLoop?.(crackleStops[i].id, 0.3); crackles.delete(crackleStops[i].id); crackleStops.splice(i, 1); }
    }
    for (const l of lanterns) {
      if (!l.lit && sim.playing && l.near) light(l);
      l.near = false;
      if (l.lit) {
        l.glow.material.opacity = 0.75 + Math.sin(t * 9 + l.phase) * 0.08 + Math.sin(t * 23 + l.phase) * 0.05;
        if (l.lightUp < 1) l.lightUp = Math.min(1, l.lightUp + dt * 2.5);
        l.glow.scale.setScalar(2.8 * l.lightUp);
      }
    }
    if (!lights) return;
    const lit = lanterns.filter((l) => l.lit);
    lit.sort((a, b) => a.pos.distanceToSquared(player.pos) - b.pos.distanceToSquared(player.pos));
    lights.forEach((pl, i) => {
      const l = lit[i];
      if (!l) { pl.intensity = Math.max(0, pl.intensity - dt * 20); return; }
      if (pl.userData.owner !== l) { pl.userData.owner = l; pl.position.copy(l.pos); pl.position.y += 1.4; }
      pl.intensity = (6 + Math.sin(t * 11 + l.phase) * 0.6) * l.lightUp;
    });
  }
  function light(l) {
    l.lit = true; l.lightUp = 0;
    for (const m of l.mats) { m.emissive.set(0xffb347); m.emissiveIntensity = 2; }
    l.glow.visible = true;
    snd('switch_toggle', 'switch'); snd('star_wand_ping');
    const cid = 'lantern-crackle-' + lanterns.indexOf(l);
    const loop = audio.playLoop?.('fire_crackle_loop', { id: cid, bus: 'sfx', fadeIn: 0.05, vol: 0.5 });
    if (loop) { crackles.add(cid); crackleStops.push({ id: cid, t: 1 }); }
    fx.burst(l.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), 18, 0xffc060, { speed: 3, up: 3, life: 0.7, grav: 2 });
    const n = lanterns.filter((q) => q.lit).length;
    lanternSlot();
    L.emit('lantern', l.id, true);
    L.emit('lanterns', 'count', n);
    if (n === lanterns.length) L.toast(`Bütün fenerler yandı! 🏮 ${n}/${n}`, 2);
  }
  L.lantern = (x, z, id, opts = {}) => {
    ensureDriver(); ensureLights();
    const sh = getShared();
    const y = opts.y ?? physics.groundAt(x, 500, z) ?? 0;
    const POST = 0.9;
    const c = L.cyl(x, y + POST, z, 0.5, POST + 0.3, { mat: 'stone', seg: 14, tags: ['lantern'] });
    const group = new THREE.Group(); group.position.set(x, y + POST, z); L.add(group);
    const glow = new THREE.Sprite(L.own(new THREE.SpriteMaterial({ map: sh.glowTex, color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })));
    glow.position.y = 0.45; glow.scale.setScalar(2.8); glow.visible = false; L.smallLayer(glow);
    group.add(glow);
    const l = { lantern: true, id, c, group, glow, pos: new THREE.Vector3(x, y, z), lit: false, near: false, lightUp: 0, phase: lanterns.length * 1.7, mats: [] };
    assets.model('Lantern_01').then((m) => {
      if (L._track.disposed) return;
      const bh = m.userData.bbox?.height || 0.29;
      m.scale.setScalar(0.95 / bh);
      m.traverse((o) => {
        if (!o.isMesh) return;
        o.material = L.own(o.material.clone());              // per-lantern copy: lit / unlit emissive
        o.material.emissive = new THREE.Color(l.lit ? 0xffb347 : 0x000000);
        o.material.emissiveIntensity = l.lit ? 2 : 0;
        l.mats.push(o.material);
      });
      group.add(m);
    }).catch(() => {});
    c.onBonk = () => { l.near = true; };
    c.onLand = () => { l.near = true; };
    L.trigger({ x, y: y - 0.5, z, w: 2.6, h: 3, d: 2.6 }, { onEnter: () => { l.near = true; }, onStay: () => { if (!l.lit) l.near = true; } });
    lanterns.push(l);
    lanternSlot();
    return l;
  };
}
