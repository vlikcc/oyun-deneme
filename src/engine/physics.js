// Player state, colliders, surfaces, collision resolution, stepPlayer(dt, input), mechanic hooks (ARCHITECTURE §2, §7).
// Feel constants are the originals — level authors rely on §2. physics imports only fx/audio/bus (never world/ui).
import * as THREE from 'three';
import { burst, hitStop, addTrauma } from './fx.js';
import { sfx } from './audio.js';
import { emit } from './bus.js';

// ---------------------------------------------------------------- constants (do not change: §2 reach rules)
export const JUMP_H = 3.2, APEX_T = 0.38;
export const GRAV = (2 * JUMP_H) / (APEX_T * APEX_T);   // ≈ 44
export const JUMP_V = (2 * JUMP_H) / APEX_T;            // ≈ 16.8
export const FALL_MULT = 1.7, MAX_FALL = 32;
export const RUN = 9, ACC_GROUND = 70, DEC_GROUND = 55, ACC_AIR = 28;
export const COYOTE = 0.1, BUFFER = 0.13, CHAIN_WINDOW = 0.28;
export const POUND_SPEED = 34;
export const WATER_Y = -1.0;
export const STEP = 1 / 120;
const CHAIN_MULT = [1, 1, 1.17, 1.4];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Surface multipliers (collider.surface). acc: push accel, dec: idle decel, friction: extra idle decel factor, speed: top speed. */
export const SURFACES = {
  normal: { acc: 1, dec: 1, friction: 1, speed: 1 },
  ice: { acc: 0.22, dec: 0.1, friction: 1, speed: 1.15 },
  mud: { acc: 0.6, dec: 1.5, friction: 1, speed: 0.45 },
  bounce: { acc: 1, dec: 1, friction: 1, speed: 1 },      // the bounce itself comes from collider.bounce
  conveyor: { acc: 1, dec: 1, friction: 1, speed: 1 },    // the conveyor mechanic sets collider.delta per step (player rides it)
  lava: { acc: 1, dec: 1, friction: 1, speed: 1, hazard: 'lava' },
};

// ---------------------------------------------------------------- registries
export const colliders = [];       // {type:'box', min, max} | {type:'cyl', x, z, r, y0, y1}; + mesh, bounce, surface, delta, hooks
export const solidMeshes = [];     // meshes the camera & blob-shadow raycast against
export const movers = [];          // box colliders animated by world.step (carry the player through .delta)

/** Shared simulation flags: main sets `playing`; world sets `waterY` / `waterKind` ('water'|'lava') / `killY` from the theme. */
export const sim = { playing: false, waterY: WATER_Y, waterKind: 'water', killY: -60, test: false, time: 0 };

// ---------------------------------------------------------------- player state
export const player = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), prevY: 0,
  R: 0.45, H: 1.4,
  grounded: false, wasGrounded: false, ground: null, coyote: 0, buffer: 0,
  jumpChain: 0, chainTimer: 0, cutAllowed: false, landSpeed: 0,
  pounding: false, poundHold: 0, facing: 0, flip: 0,
  hearts: 3, maxHearts: 3, invuln: 0, coins: 0, crystals: 0,
  scale: new THREE.Vector3(1, 1, 1), scaleVel: new THREE.Vector3(), runPhase: 0,
  groundY: -99,
  flying: false,                        // ballistic flight (cannon/launch): no air control, no jump cut, plain gravity; cleared on landing
  controlLock: 0,                       // seconds without input (velocity kept)
  extVel: new THREE.Vector3(),          // external velocity (wind, conveyor…) added each step, decays
  checkpoint: new THREE.Vector3(0, 0, 0), spawn: new THREE.Vector3(0, 0.1, 22), spawnFacing: Math.PI,
  leaves: null, scarfTail: null,
};
export let lastInput = { ix: 0, iy: 0, look: 0, jump: false, jumpHeld: false, pound: false, yaw: 0 };

export function squash(xz, y) { player.scale.set(xz, y, xz); player.scaleVel.set(0, 0, 0); }

/** setGround(c|null): change the ground collider, firing onLeave on the old one and onLand on the new one. */
export function setGround(c) {
  const old = player.ground;
  if (old === c) return;
  if (old) old.onLeave?.(player, old);
  player.ground = c;
  if (c) c.onLand?.(player, c);
}

function doJump(v, chain) {
  player.vel.y = v; player.grounded = false; setGround(null);
  player.coyote = 0; player.buffer = 0; player.cutAllowed = true;
  player.jumpChain = chain;
  if (chain === 3) player.flip = 1;
  squash(0.75, 1.3);
  sfx.jump(chain);
  burst(player.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), 5, 0xf5ead0, { speed: 2.5, up: 1, life: 0.35, size: 1.2, grav: 2 });
}

/** physics.launch(vel, {flying}): set velocity, clear grounded/jump chain (cannons, springs); flying=true → ballistic until landing. */
export function launch(vel, { flying = false } = {}) {
  player.vel.copy(vel);
  player.grounded = false; setGround(null);
  player.jumpChain = 0; player.chainTimer = 0; player.cutAllowed = false; player.pounding = false;
  player.coyote = 0; player.buffer = 0; player.flip = 0; player.flying = flying;
}

const isSolid = (c) => !c.noSolid && c.solid !== false;
/** probeMeshes(extra?) → the raycast list for the camera / blob shadow / test ground probe: solidMeshes minus the meshes
 *  whose collider (`mesh.userData.collider`, set by world.registerCollider) is currently non-solid (fading platforms). */
export function probeMeshes(extra = null) {
  const out = [];
  for (const m of solidMeshes) { const c = m.userData?.collider; if (!c || isSolid(c)) out.push(m); }
  if (extra) for (const m of extra) if (m && !out.includes(m)) { const c = m.userData?.collider; if (!c || isSolid(c)) out.push(m); }
  return out;
}

function resolveCollisions() {
  const p = player.pos, R = player.R, H = player.H;
  player.grounded = false;
  let groundHit = null;
  for (const c of colliders) {
    if (!isSolid(c)) continue;
    let dx, dz, d2, top, bottom;
    if (c.type === 'box') {
      const cx = clamp(p.x, c.min.x, c.max.x), cz = clamp(p.z, c.min.z, c.max.z);
      dx = p.x - cx; dz = p.z - cz; d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      top = c.max.y; bottom = c.min.y;
    } else {
      dx = p.x - c.x; dz = p.z - c.z; d2 = dx * dx + dz * dz;
      const rr = c.r + R; if (d2 >= rr * rr) continue;
      top = c.y1; bottom = c.y0;
    }
    if (p.y >= top || p.y + H <= bottom) continue;
    if (player.prevY >= top - 0.06 && player.vel.y <= 0) {
      p.y = top; landOn(c); groundHit = c;                                   // landing on top
    } else if (player.prevY + H <= bottom + 0.06 && player.vel.y > 0) {
      p.y = bottom - H; player.vel.y = Math.min(player.vel.y, 0) - 1;        // head bonk
      sfx.land(); c.onBonk?.(player, c, 'head');
    } else if (top - p.y < 0.4 && player.vel.y <= 0.5 && player.wasGrounded) {
      p.y = top; landOn(c); groundHit = c;                                   // step up small ledges
    } else {
      // horizontal push out
      if (c.type === 'box') {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = R - d; p.x += (dx / d) * push; p.z += (dz / d) * push;
        } else {
          const px = Math.min(p.x - c.min.x, c.max.x - p.x), pz = Math.min(p.z - c.min.z, c.max.z - p.z);
          if (px < pz) p.x = p.x - c.min.x < c.max.x - p.x ? c.min.x - R : c.max.x + R;
          else p.z = p.z - c.min.z < c.max.z - p.z ? c.min.z - R : c.max.z + R;
        }
      } else {
        const d = Math.sqrt(d2) || 1e-4, push = c.r + R - d; p.x += (dx / d) * push; p.z += (dz / d) * push;
      }
      c.onBonk?.(player, c, 'side');
    }
  }
  return groundHit;
}
function landOn(c) {
  const surf = SURFACES[c.surface] || SURFACES.normal;
  if (surf.hazard) {
    // Same semantics as falling into lava water (§13): the hazard fires when it can; while invulnerable (just hurt /
    // just respawned) the player is sent back to the checkpoint instead of being left un-grounded on the lava top.
    const from = c.type === 'box' ? new THREE.Vector3((c.min.x + c.max.x) / 2, c.max.y, (c.min.z + c.max.z) / 2) : new THREE.Vector3(c.x, c.y1, c.z);
    if (!hazard(surf.hazard, from)) respawn();
    return;
  }
  const impact = -player.vel.y;
  player.vel.y = 0;
  player.grounded = true; player.flying = false;
  const first = !player.wasGrounded;
  setGround(c);
  if (first) {
    player.landSpeed = impact;
    const hadChain = player.jumpChain;
    player.chainTimer = hadChain && hadChain < 3 ? CHAIN_WINDOW : 0;
    if (hadChain >= 3) player.jumpChain = 0;
    player.flip = 0;
    if (player.pounding) onPoundLand();
    else if (impact > 6) { squash(1 + Math.min(impact, 30) * 0.012, 1 - Math.min(impact, 30) * 0.012); sfx.land(); burst(player.pos.clone().add(new THREE.Vector3(0, 0.05, 0)), 6, 0xf5ead0, { speed: 3, up: 0.8, life: 0.4, grav: 2 }); }
    if (c.bounce) bounceFrom(c);
  }
}
function bounceFrom(c) {
  const v = player.pounding ? c.bounce * 1.15 : c.bounce;
  player.pounding = false;
  player.vel.y = v; player.grounded = false; setGround(null); player.cutAllowed = false; player.jumpChain = 3; player.flip = 1;
  squash(0.65, 1.45); sfx.bounce();
  if (c.mesh) { c.mesh.scale.y = 0.4; c.springT = 0; }
  burst(player.pos.clone(), 12, 0xff6fd8, { speed: 5, up: 3, life: 0.6 });
}
function onPoundLand() {
  player.pounding = false;
  squash(1.5, 0.55);
  sfx.pound(); addTrauma(0.55); hitStop(0.06);
  const ring = player.pos.clone().add(new THREE.Vector3(0, 0.1, 0));
  burst(ring, 18, 0xf5ead0, { speed: 9, up: 1.2, life: 0.5, grav: 4, size: 1.4 });
  emit('pound', player.pos.clone(), player.ground);
}

/**
 * One fixed step. input = {ix, iy, look, jump (edge), jumpHeld, pound (edge), yaw (camera yaw)}.
 * The edge flags are consumed (set to false) so a frame with several sub-steps jumps once.
 */
export function stepPlayer(dt, input) {
  const p = player, v = p.vel;
  lastInput = input;
  p.wasGrounded = p.grounded;

  // ride moving platforms (and conveyors: anything that sets collider.delta)
  if (p.grounded && p.ground && p.ground.delta) p.pos.add(p.ground.delta);

  // timers
  if (p.grounded) p.coyote = COYOTE; else p.coyote -= dt;
  p.buffer -= dt; p.chainTimer -= dt; p.invuln -= dt;
  const locked = p.controlLock > 0;
  if (locked) p.controlLock -= dt;
  if (input.jump) { if (!locked) p.buffer = BUFFER; input.jump = false; }

  // camera-relative wish direction
  const yaw = input.yaw || 0;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const ix = locked ? 0 : input.ix || 0, iy = locked ? 0 : input.iy || 0;
  let wx = fx * iy + rx * ix, wz = fz * iy + rz * ix;
  const wishLen = Math.hypot(wx, wz);

  // Ground pound
  if (input.pound) {
    input.pound = false;
    if (!locked && !p.grounded && !p.pounding && p.pos.y > (p.groundY ?? -99) + 1.0) { p.pounding = true; p.poundHold = 0.2; v.set(0, 0, 0); p.flip = 0; sfx.jump(0); }
  }
  const surf = (p.grounded && p.ground && SURFACES[p.ground.surface]) || SURFACES.normal;
  if (p.grounded) p.flying = false;
  if (p.pounding) {
    if (p.poundHold > 0) { p.poundHold -= dt; v.set(0, 0, 0); }
    else { v.x = 0; v.z = 0; v.y = -POUND_SPEED; }
  } else if (p.flying) {
    // ballistic: keep velocity, plain gravity, no control until landing (a jump press is still buffered for the landing)
    v.y = Math.max(v.y - GRAV * dt, -MAX_FALL);
  } else {
    if (!locked) {
      // horizontal accel
      const target = RUN * surf.speed * Math.min(1, wishLen);
      const tx = wishLen > 0.01 ? (wx / wishLen) * target : 0, tz = wishLen > 0.01 ? (wz / wishLen) * target : 0;
      const acc = p.grounded ? (wishLen > 0.01 ? ACC_GROUND * surf.acc : DEC_GROUND * surf.dec * surf.friction) : ACC_AIR;
      const dvx = tx - v.x, dvz = tz - v.z, dl = Math.hypot(dvx, dvz), maxStep = acc * dt;
      if (dl <= maxStep) { v.x = tx; v.z = tz; } else { v.x += (dvx / dl) * maxStep; v.z += (dvz / dl) * maxStep; }

      // jump: buffer + coyote, with triple-jump chain
      if (p.buffer > 0 && p.coyote > 0) {
        const speed = Math.hypot(v.x, v.z);
        let chain = 1;
        if (p.chainTimer > 0 && speed > 5) chain = Math.min(3, p.jumpChain + 1);
        doJump(JUMP_V * CHAIN_MULT[chain], chain);
      }
      // variable height
      if (!input.jumpHeld && p.cutAllowed && v.y > 0) { v.y *= 0.5; p.cutAllowed = false; }
    }
    if (v.y <= 0) p.cutAllowed = false;

    // gravity: heavier fall, slight apex hang while holding jump
    let g = v.y < 0 ? GRAV * FALL_MULT : GRAV;
    if (input.jumpHeld && !locked && Math.abs(v.y) < 2.5 && !p.grounded) g *= 0.6;
    v.y = Math.max(v.y - g * dt, -MAX_FALL);
  }

  // integrate & collide
  p.prevY = p.pos.y;
  p.pos.x += v.x * dt; p.pos.z += v.z * dt; p.pos.y += v.y * dt;
  if (p.extVel.lengthSq() > 1e-6) {
    p.pos.addScaledVector(p.extVel, dt);
    p.extVel.multiplyScalar(Math.exp(-(p.grounded ? 6 : 1.5) * dt));
    if (p.extVel.lengthSq() < 1e-4) p.extVel.set(0, 0, 0);
  }
  const groundHit = resolveCollisions();
  if (!p.grounded) setGround(null);
  else if (groundHit) groundHit.onStand?.(p, groundHit, dt);

  // facing
  const hs = Math.hypot(v.x, v.z);
  if (hs > 0.5 && !p.pounding) {
    const target = Math.atan2(v.x, v.z);
    let diff = ((target - p.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    p.facing += diff * (1 - Math.exp(-14 * dt));
  }

  // water / lava / void
  if (sim.playing) {
    if (sim.waterY != null && p.pos.y < sim.waterY) { if (sim.waterKind === 'lava') { if (!hazard('lava')) respawn(); } else fellInWater(); }
    else if (p.pos.y < sim.killY) fellInVoid();
  }
}
/** Below theme.killY (sky islands without water): lose a heart + respawn. */
export function fellInVoid() {
  player.hearts--; emit('hud'); emit('void');
  if (player.hearts <= 0) { faint(); return; }
  emit('toast', 'Düştün!', 0.9);
  respawn();
}

// ---------------------------------------------------------------- damage / respawn
/** hurt(fromPos): lose a heart with knockback (enemies, spikes). Ignored while invulnerable. */
export function hurt(from) {
  if (player.invuln > 0) return false;
  player.hearts--; player.invuln = 1.6;
  sfx.hurt(); addTrauma(0.45); hitStop(0.08);
  const away = new THREE.Vector3(player.pos.x - from.x, 0, player.pos.z - from.z);
  if (away.lengthSq() < 1e-6) away.set(0, 0, 1);
  away.normalize().multiplyScalar(9);
  player.vel.set(away.x, 10, away.z); player.grounded = false; setGround(null); player.pounding = false; player.cutAllowed = false;
  emit('hud'); emit('hurt', from);
  if (player.hearts <= 0) faint();
  return true;
}
export function faint() {
  emit('toast', 'Bayıldın! Son bayrağa dönülüyor…', 2);
  player.coins = Math.max(0, player.coins - 10);
  player.hearts = player.maxHearts; emit('hud'); emit('faint');
  respawn();
}
export function respawn() {
  player.pos.copy(player.checkpoint).add(new THREE.Vector3(1.2, 0.2, 1.2));
  player.vel.set(0, 0, 0); player.extVel.set(0, 0, 0); player.pounding = false; player.jumpChain = 0; player.invuln = 1.2; player.controlLock = 0; player.flying = false;
  player.grounded = false; setGround(null);
  emit('respawn', player.pos.clone());
}
export function fellInWater() {
  sfx.splash();
  burst(new THREE.Vector3(player.pos.x, (sim.waterY ?? 0) - 0.1, player.pos.z), 20, 0xbfefff, { speed: 4, up: 7, life: 0.8, grav: 18 });
  player.hearts--; emit('hud'); emit('water');
  if (player.hearts <= 0) { faint(); return; }
  emit('toast', 'Şapırt!', 0.9);
  respawn();
}
/** hazard('lava'|'spike', fromPos). lava: lose heart + respawn with fire particles; spike: hurt + knockback. */
export function hazard(kind, from = player.pos) {
  if (kind === 'lava') {
    if (player.invuln > 0) return false;
    sfx.lava?.(); sfx.hurt(); addTrauma(0.5); hitStop(0.08);
    burst(player.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 24, 0xff7a1a, { speed: 4, up: 7, life: 0.7, grav: 6, size: 1.3 });
    burst(player.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 10, 0xffd166, { speed: 3, up: 5, life: 0.5, grav: 4 });
    player.hearts--; emit('hud'); emit('hazard', kind, from);
    if (player.hearts <= 0) { faint(); return true; }
    emit('toast', 'Cız! Çok sıcak!', 1);
    respawn();
    return true;
  }
  if (kind === 'spike') { const ok = hurt(from); if (ok) emit('hazard', kind, from); return ok; }
  console.warn('[physics] unknown hazard', kind);
  return false;
}

/** reset(spawn, facing): new life at the level spawn (hearts/coins/crystals cleared). */
export function reset(spawn, facing = Math.PI) {
  if (spawn) player.spawn.set(spawn[0], spawn[1], spawn[2]);
  player.spawnFacing = facing;
  player.hearts = player.maxHearts; player.coins = 0; player.crystals = 0;
  player.pos.copy(player.spawn); player.vel.set(0, 0, 0); player.extVel.set(0, 0, 0);
  player.facing = facing; player.invuln = 0; player.controlLock = 0; player.flying = false;
  player.grounded = false; player.wasGrounded = false; player.ground = null; player.pounding = false; player.jumpChain = 0; player.chainTimer = 0; player.flip = 0;
  player.scale.set(1, 1, 1); player.scaleVel.set(0, 0, 0); player.prevY = player.pos.y;
  player.checkpoint.copy(player.spawn).sub(new THREE.Vector3(1.2, 0.2, 1.2));
  emit('hud');
}
export { isSolid };
export function clearWorld() {
  colliders.length = 0; solidMeshes.length = 0; movers.length = 0; player.ground = null; player.grounded = false;
}

// A tiny ground probe used by world/test hooks (no three.js raycast; pure collider maths).
export function groundAt(x, y, z) {
  let best = null;
  for (const c of colliders) {
    if (!isSolid(c)) continue;
    let top;
    if (c.type === 'box') { if (x < c.min.x || x > c.max.x || z < c.min.z || z > c.max.z) continue; top = c.max.y; }
    else { if (Math.hypot(x - c.x, z - c.z) > c.r) continue; top = c.y1; }
    if (top <= y + 0.05 && (best === null || top > best)) best = top;
  }
  return best;
}

export const physics = {
  player, colliders, solidMeshes, movers, sim, SURFACES, stepPlayer, launch, hazard, hurt, faint, respawn, fellInWater, fellInVoid, reset, clearWorld, squash, groundAt, setGround, isSolid, probeMeshes,
  get lastInput() { return lastInput; },
  JUMP_H, APEX_T, GRAV, JUMP_V, RUN, STEP, WATER_Y,
};
export default physics;
