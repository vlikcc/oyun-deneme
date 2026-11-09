// Mechanic 'crumble' — L.crumble(c, opts) — platform that shakes, breaks, falls and comes back (GDD §3.1).
// install(L, ctx) attaches L.crumble(...); ctx = { scene, player, physics, enemies, fx, audio, assets, world }.
//
// L.crumble(c, { skin: 'wood'|'ice'|'rock'|'cloud' = 'rock', delay = 1.0, respawn = 5, look }) → c
//   c       a collider from L.box / L.cyl (the mechanic only toggles its solidity through physics.setSolid).
//   delay   seconds of standing before it breaks; never below 1.0 (GDD §2.0), × physics.assist.crumble at use time.
//   respawn seconds after the break until it pops back (scale 0 → 1 in 0.3 s, `cartoon_rise_short`).
//   look    true → dress the mesh in the skin's material; false → keep it; default: only when the box still has the
//           builder's default materials (cliff side + ground top), so `{ mat: … }` from the level always wins.
// While stood on it wobbles (sideways sine, amplitude grows 0.03 → 0.075 m) and warns at delay − 0.5 s (ice: crack sound,
// otherwise `platform_crack_warn`, plus a few chips). Leaving it lets the timer decay at 2×. A respawn/faint resets
// every timer and brings broken platforms back 0.5 s later.
import * as THREE from 'three';
import * as bus from '../bus.js';
import { iceMaterial } from './ice.js';

export const name = 'crumble';

const MIN_DELAY = 1.0;            // GDD §2.0 hard limit (before the Yardım Modu multiplier)
const WARN_LEAD = 0.5;            // telegraph: warn this long before the break
const POP_T = 0.3;                // pop-in duration
const SKIN = {
  wood: { color: 0xa0703c, warn: ['platform_crack_warn'], brk: ['wood_break'] },
  ice: { color: 0xd8f4ff, warn: ['ice_crack_short'], brk: ['ice_break_1', 'ice_break_2'], melt: 'ice_melt' },
  rock: { color: 0x8f8478, warn: ['platform_crack_warn'], brk: ['rock_crumble_1', 'rock_crumble_2', 'rock_crumble_3'] },
  cloud: { color: 0xffffff, warn: ['platform_crack_warn'], brk: ['bubble_pop_designed'] },
};
const RISE = 'cartoon_rise_short';

/** Debug/test log (window tests import this module): last ≤ 60 events { ev, skin, key?, t }. */
export const log = [];
const note = (e) => { log.push(e); if (log.length > 60) log.shift(); };

// Shared (cached by assets.js, never disposed) skin materials → [side, top]
function skinMaterials(skin, assets) {
  switch (skin) {
    case 'wood': { const m = assets.pbrTex('weathered_planks', { scale: 1.6, tint: 0xf2d6ae, roughness: 0.9 }); return [m, m]; }
    case 'ice': { const m = iceMaterial(assets); return [m, m]; }
    case 'cloud': { const m = assets.flat(0xffffff, { flatShading: false, roughness: 0.95, emissive: 0x6a7d90, emissiveIntensity: 0.35 }); return [m, m]; }
    default: { const m = assets.pbrTex('rock_boulder_cracked', { scale: 2, tint: 0xd8ccc0 }); return [m, m]; }
  }
}
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };

export function install(L, ctx) {
  const { physics, player, audio, fx, assets } = ctx;
  const list = [];
  let dyn = null, rockIdx = 0, iceIdx = 0, preloaded = false, clock = 0;
  const sfxKeys = new Set([RISE]);

  const topCentre = (c, out = new THREE.Vector3()) => (c.type === 'box'
    ? out.set((c.min.x + c.max.x) / 2, c.max.y, (c.min.z + c.max.z) / 2)
    : out.set(c.x, c.y1, c.z));
  const delayOf = (s) => s.delay * (physics.assist?.crumble ?? 1);
  const pick = (s, keys) => {
    if (keys.length === 1) return keys[0];
    if (s.skin === 'rock') return keys[(rockIdx++) % keys.length];
    return keys[(iceIdx++) % keys.length];
  };
  const play = (s, key, ev) => { audio.play(key); note({ ev, skin: s.skin, key, t: +clock.toFixed(3) }); };

  function warn(s) {
    s.warned = true;
    play(s, SKIN[s.skin].warn[0], 'warn');
    const p = topCentre(s.c);
    fx.burst(p, 5, SKIN[s.skin].color, { speed: 2.2, up: 1.5, life: 0.45, grav: 10, size: 0.8 });
  }
  function breakNow(s) {
    s.broken = true; s.fallT = 0; s.t = 0; s.warned = false;
    physics.setSolid(s.c, false);
    play(s, pick(s, SKIN[s.skin].brk), 'break');
    const p = topCentre(s.c);
    fx.burst(p, 14, SKIN[s.skin].color, { speed: 4, up: 4, life: 0.8, grav: 14, size: 1.3 });
  }
  function restore(s) {
    const m = s.c.mesh;
    s.broken = false; s.fallT = 0; s.t = 0; s.warned = false; s.popT = 0;
    if (m) { m.position.copy(s.p0); m.rotation.copy(s.r0); m.scale.copy(s.s0).multiplyScalar(0.001); m.visible = true; m.updateMatrixWorld(); }
    physics.setSolid(s.c, true);
    play(s, RISE, 'respawn');
    const melt = SKIN[s.skin].melt;
    if (melt) {   // ice floes (GDD §6.1 kar): a short slice of the melt sample, faded out after ~1 s
      const id = 'crumble:melt';
      if (audio.playLoop?.(melt, { id, bus: 'sfx', fadeIn: 0.05, gain: 0.45 })) s.meltT = 1.0;
    }
    fx.burst(topCentre(s.c), 8, SKIN[s.skin].color, { speed: 2.5, up: 2.5, life: 0.5, grav: 6, size: 0.9 });
  }

  function update(dt) {
    clock += dt;
    // ctx.audio is the module namespace (no .context getter): state.ready ⇔ the AudioContext exists
    if (!preloaded && (audio.state?.ready || audio.context)) { preloaded = true; audio.ensure?.([...sfxKeys]); }
    for (const s of list) {
      const c = s.c, m = c.mesh;
      if (s.meltT > 0 && (s.meltT -= dt) <= 0) audio.stopLoop?.('crumble:melt', 0.5);
      if (s.broken) {
        s.fallT += dt;
        if (m) {
          const k = Math.min(1, s.fallT);
          m.position.y -= 8 * s.fallT * dt;                        // GDD: y -= 8·t·dt (accelerating drop)
          m.scale.copy(s.s0).multiplyScalar(1 - 0.7 * k);           // shrinks to 0.3
          m.rotation.z = s.r0.z + s.fallT * 0.6 * s.spin;
          m.visible = s.fallT < 1;
        }
        if (s.fallT >= s.respawn) restore(s);
        continue;
      }
      // timer decays at 2× while nobody stands on it (onStand adds dt while stood on)
      const standing = player.grounded && player.ground === c;
      if (!standing && s.t > 0) { s.t = Math.max(0, s.t - 2 * dt); if (s.t === 0) s.warned = false; }
      if (!m) continue;
      if (s.popT < POP_T) {
        s.popT = Math.min(POP_T, s.popT + dt);
        m.scale.copy(s.s0).multiplyScalar(Math.max(0.001, easeOutBack(s.popT / POP_T)));
      }
      if (s.t > 0) {
        const D = delayOf(s), amp = 0.03 * (1 + 1.5 * Math.min(1, s.t / D));
        m.position.x = s.p0.x + Math.sin(s.t * 60) * amp;
        m.position.z = s.p0.z + Math.cos(s.t * 47) * amp * 0.35;
        m.rotation.z = s.r0.z + Math.sin(s.t * 53) * amp * 0.25;
        s.wobbling = true;
      } else if (s.wobbling) { m.position.copy(s.p0); m.rotation.copy(s.r0); s.wobbling = false; }
    }
  }

  function onRespawn() {
    for (const s of list) {
      if (s.broken) s.fallT = Math.max(s.fallT, s.respawn - 0.5);
      else { s.t = 0; s.warned = false; }
    }
  }

  L.crumble = function crumble(c, opts = {}) {
    if (!c || (c.type !== 'box' && c.type !== 'cyl')) { console.warn('[crumble] L.crumble needs a box/cyl collider'); return c; }
    const skin = SKIN[opts.skin] ? opts.skin : 'rock';
    if (opts.skin && !SKIN[opts.skin]) console.warn('[crumble] unknown skin', opts.skin, '→ rock');
    let delay = opts.delay ?? MIN_DELAY;
    if (delay < MIN_DELAY) { console.warn(`[crumble] delay ${delay} < ${MIN_DELAY} s (GDD §2.0) → ${MIN_DELAY}`); delay = MIN_DELAY; }
    const respawn = Math.max(POP_T + 0.5, opts.respawn ?? 5);
    const m = c.mesh;
    if (m && Array.isArray(m.material)) {
      const dflt = m.material[0] === assets.pbr('cliff') && m.material[1] === assets.pbr('ground');
      if (opts.look === true || (opts.look !== false && dflt)) m.material = skinMaterials(skin, assets);
    }
    const s = {
      c, skin, delay, respawn, t: 0, warned: false, broken: false, fallT: 0, popT: POP_T, meltT: 0, wobbling: false,
      p0: m ? m.position.clone() : new THREE.Vector3(), r0: m ? m.rotation.clone() : new THREE.Euler(), s0: m ? m.scale.clone() : new THREE.Vector3(1, 1, 1),
      spin: list.length % 2 ? -1 : 1,                     // no L.rnd(): adding a crumble never reshuffles a seeded build
    };
    for (const k of SKIN[skin].warn) sfxKeys.add(k);
    for (const k of SKIN[skin].brk) sfxKeys.add(k);
    if (SKIN[skin].melt) sfxKeys.add(SKIN[skin].melt);
    preloaded = false;
    const prevStand = c.onStand;
    c.onStand = (p, col, dt) => {
      prevStand?.(p, col, dt);
      if (s.broken) return;
      s.t += dt;
      const D = delayOf(s);
      if (!s.warned && s.t >= D - WARN_LEAD) warn(s);
      if (s.t >= D) breakNow(s);
    };
    c.crumble = s;
    c.tags = [...(c.tags || []), 'crumble'];
    list.push(s);
    if (!dyn) {
      dyn = L.dynamic({ update, dispose() { audio.stopLoop?.('crumble:melt', 0.2); list.length = 0; } });
      L._track.unsubs.push(bus.on('respawn', onRespawn));
    }
    return c;
  };
}
