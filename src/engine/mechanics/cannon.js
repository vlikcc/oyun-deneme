// Mechanic 'cannon' — L.cannon(x, top, z, opts) — hop in, boom, exact ballistic flight (GDD §3.4).
// install(L, ctx) attaches L.cannon(...); ctx = { scene, player, physics, enemies, fx, audio, assets, world }.
//
// L.cannon(x, top, z, { to: [x, y, z], apex = 8, locked = null, rotY, lockedText, need }) → cannon record
//   * a stone drum (solid cyl r 1.2, h 1.4, top = top + 1.4 = the mouth) carries the barrel (assets/models/cannon_01.glb,
//     procedural barrel if the model cannot load); the trigger is a cylinder r 1.2 above the drum (feet within 2.5 m).
//   * hop in → input locked, Pıtır tweens into the mouth (0.5 s) while the barrel yaws/pitches toward `to` → 0.6 s fuse
//     (barrel shake, sparks, `timer_tick`) → `cannon_launch` + `whoosh_rise`, smoke ring + puffs, `addTrauma(0.3)`,
//     `cam.yaw` snaps behind the flight → ballistic flight (`physics.launch(v, { flying: true })`, `fallCap` 120,
//     `controlLock` T + 0.15) → lands exactly on `to` (feet; on the collider top under `to`).
//   * Flight solve (GDD §3.4, asymmetric gravity): tUp = √(2·apex / GRAV), tDown = √(2·(apex − dy) / (GRAV·FALL_MULT)).
//     The engine's `flying` mode integrates plain GRAV on the way down (ARCHITECTURE §12/§13), so while a cannon flight is
//     active this module adds the missing GRAV·(FALL_MULT − 1) per fixed step whenever vel.y < 0 (a dynamic runs before
//     physics.stepPlayer) — exactly the non-flying fall. The horizontal speed is then refined against the discrete
//     integrator (same dt as the step that fires) so the landing step puts the feet on `to` to within a few cm.
//   * `locked: signalId` — the cannon refuses to fire (toast `lockedText`, default "Fenerler yanınca ateşlenir." for
//     'lanterns', else "Top kilitli! Önce yolu aç.") until a world signal unlocks it: L.on('switch'|'lantern'|'cannon',
//     signalId) with any argument other than `false` (`false` locks it again), and for 'lanterns' also
//     L.on('lanterns', 'count', n) with n ≥ opts.need (default 4). `cannon.unlock()` / `cannon.lock()` work too.
//   * The returned record: { x, top, z, mouth, to, apex, base (collider), group, T, locked, state, unlock(), lock(),
//     fire(), point(t) → [x, y, z] (flight position t s after launch), coins(n) (places n L.coin along the real flight
//     path, skipping the first/last metre), lastLanding, flights }. Every cannon of the level is in `L.cannons`.
import * as THREE from 'three';
import * as bus from '../bus.js';

export const name = 'cannon';

const MOUTH_H = 1.4, BASE_R = 1.2, TRIGGER_R = 1.2, TRIGGER_H = 2.5;
const LOAD_T = 0.5, FUSE_T = 0.6;
const FLIGHT_CAP = 120;
const SFX_KEYS = ['cannon_launch', 'whoosh_rise', 'timer_tick'];
const BARREL_LEN = 2.6;          // metres, model fitted to this length
const MODEL_FORWARD_YAW = 0;     // cannon_01: the muzzle points along local +z
const SMOKE = 0xeeeae2, FLASH = 0xffb347;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (k) => k * k * (3 - 2 * k);
const wrapPi = (a) => ((a + Math.PI * 3) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

/**
 * solveFlight(mouth, to, apex, physics, dt, landY) → { vx, vy, vz, T, steps, tUp, tDown }
 * GDD §3.4 analytic solve, then the horizontal speed refined on the discrete integrator (`steps` fixed steps of `dt` until the
 * feet cross `landY` going down, with the asymmetric gravity this module applies) so the landing is exact for that dt.
 */
export function solveFlight(mouth, to, apex, physics, dt = physics.STEP, landY = to[1]) {
  const { GRAV, FALL_MULT } = physics;
  const dy = landY - mouth[1];
  const tUp = Math.sqrt((2 * apex) / GRAV), tDown = Math.sqrt((2 * Math.max(0.01, apex - dy)) / (GRAV * FALL_MULT));
  const vy = GRAV * tUp;
  let y = mouth[1], v = vy, steps = 0;
  while (steps < 20000) {
    steps++;
    if (v < 0) v -= GRAV * (FALL_MULT - 1) * dt;          // this module's correction (only when falling)
    v = Math.max(v - GRAV * dt, -FLIGHT_CAP);             // physics.stepPlayer, flying branch
    y += v * dt;
    if (v <= 0 && y < landY) break;
  }
  const T = steps * dt;
  return { vx: (to[0] - mouth[0]) / T, vy, vz: (to[2] - mouth[2]) / T, T, steps, tUp, tDown, Tanalytic: tUp + tDown };
}

// ---------------------------------------------------------------- shared procedural barrel parts (never disposed)
let procGeo = null;
function proceduralGeo() {
  if (procGeo) return procGeo;
  const barrel = new THREE.CylinderGeometry(0.42, 0.55, 2.2, 18, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.55);
  const breech = new THREE.SphereGeometry(0.56, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0, -0.55);
  const ring = new THREE.TorusGeometry(0.47, 0.08, 8, 20);
  const wheel = new THREE.CylinderGeometry(0.55, 0.55, 0.18, 16).rotateZ(Math.PI / 2);
  procGeo = { barrel, breech, ring, wheel };
  return procGeo;
}

export function install(L, ctx) {
  const { player, physics, audio, assets, fx } = ctx;
  const cam = L.cam;
  L.cannons = [];
  let soundsWanted = false;
  let toastAt = -99;

  L.cannon = function cannon(x, top, z, opts = {}) {
    if (!opts.to || opts.to.length !== 3) { console.warn('[cannon] opts.to [x, y, z] is required'); return null; }
    const to = opts.to.map(Number);
    const mouth = [x, top + MOUTH_H, z];
    const dyRaw = to[1] - mouth[1];
    let apex = opts.apex ?? 8;
    if (apex < dyRaw + 1) { console.warn(`[cannon] apex ${apex} < dy + 1 (${(dyRaw + 1).toFixed(2)}); raised`); apex = dyRaw + 1; }
    const aimYaw = Math.atan2(to[0] - x, to[2] - z);                     // model yaw that points local +z at `to`
    const restYaw = opts.rotY ?? aimYaw;
    const pre = solveFlight(mouth, to, apex, physics);                    // nominal solve (fixed 120 Hz) for pitch / helpers
    const aimPitch = Math.atan2(pre.vy, Math.hypot(pre.vx, pre.vz));
    const shownPitch = clamp(aimPitch * 0.45, 0.08, 0.42);               // the whole model rears up a little (wheels stay cute)

    // drum (solid) — its top is the mouth
    const base = L.cyl(x, top + MOUTH_H, z, BASE_R, MOUTH_H, { mat: opts.mat ?? { side: 'stone', top: 'stone' }, seg: 20, tags: ['cannon'] });
    const rim = new THREE.Mesh(L.own(new THREE.TorusGeometry(BASE_R - 0.05, 0.09, 6, 24)), assets.flat(0x6b4a2e));
    rim.rotation.x = Math.PI / 2; rim.position.set(x, top + MOUTH_H + 0.02, z); rim.castShadow = false; L.add(rim);

    // barrel pivot: yaw group → pitch group → model / procedural barrel
    const yawG = new THREE.Group(); yawG.position.set(x, top + MOUTH_H, z); yawG.rotation.y = restYaw;
    const pitchG = new THREE.Group(); yawG.add(pitchG);
    const shakeG = new THREE.Group(); pitchG.add(shakeG);
    L.add(yawG);
    let usingModel = false;
    const buildProcedural = () => {
      const g = proceduralGeo();
      const metal = assets.flat(0x3a3f4a, { roughness: 0.45, metalness: 0.6 });
      const brass = assets.flat(0xd9a441, { roughness: 0.35, metalness: 0.7 });
      const wood = assets.pbr('wood');
      const b = new THREE.Mesh(g.barrel, metal); b.position.y = 0.62;
      const br = new THREE.Mesh(g.breech, metal); br.position.y = 0.62;
      const r1 = new THREE.Mesh(g.ring, brass); r1.position.set(0, 0.62, 1.62);
      const r2 = new THREE.Mesh(g.ring, brass); r2.position.set(0, 0.62, 0.1); r2.scale.setScalar(1.18);
      const w1 = new THREE.Mesh(g.wheel, wood); w1.position.set(0.62, 0.5, -0.1);
      const w2 = new THREE.Mesh(g.wheel, wood); w2.position.set(-0.62, 0.5, -0.1);
      for (const m of [b, br, r1, r2, w1, w2]) { m.castShadow = true; m.receiveShadow = true; shakeG.add(m); }
    };
    const loaded = assets.model(opts.model ?? 'cannon_01').then((m) => {
      if (L._track.disposed) return null;
      const bb = m.userData.bbox;
      const len = bb ? Math.max(bb.size[0], bb.size[2]) : 2.3;
      m.scale.setScalar(BARREL_LEN / len);
      m.rotation.y = MODEL_FORWARD_YAW;
      if (bb) m.position.z = -((bb.min[2] + bb.max[2]) / 2) * (BARREL_LEN / len) + 0.25;   // centre the carriage on the drum
      shakeG.add(m); usingModel = true;
      return m;
    }).catch(() => { if (!L._track.disposed) buildProcedural(); return null; });
    L._track.pending.push(loaded);

    // smoke ring (one torus, expanded + faded on each shot)
    const ringMat = L.own(new THREE.MeshBasicMaterial({ color: SMOKE, transparent: true, opacity: 0, depthWrite: false }));
    const ring = new THREE.Mesh(L.own(new THREE.TorusGeometry(0.6, 0.22, 8, 22)), ringMat);
    ring.visible = false; ring.castShadow = false; L.smallLayer(ring); L.add(ring);

    const c = {
      x, top, z, mouth, to, apex, base, group: yawG, ring, T: pre.T, aimYaw, aimPitch,
      locked: !!opts.locked, lockId: opts.locked ?? null, state: 'idle', t: 0, lastLanding: null, flights: 0,
      get usingModel() { return usingModel; },
      unlock() { if (!c.locked) return; c.locked = false; L.sfx('switch'); L.spawnParticles(new THREE.Vector3(x, top + MOUTH_H + 1, z), 14, 0xffe066, { speed: 3, up: 4, life: 0.7 }); },
      lock() { c.locked = true; },
      fire() { if (c.state === 'idle') startLoad(); },
      /** point(t) → feet position t s after the launch on the nominal (120 Hz) flight. */
      point(t) {
        const s = c.solve ?? pre, g = physics.GRAV;
        let y;
        if (t <= s.tUp) y = mouth[1] + s.vy * t - 0.5 * g * t * t;
        else { const u = t - s.tUp; y = mouth[1] + apex - 0.5 * g * physics.FALL_MULT * u * u; }
        return [mouth[0] + s.vx * t, y, mouth[2] + s.vz * t];
      },
      /** coins(n): n coins along the real flight (GDD: "a coinArc is placed on every flight by the level"). */
      coins(n = 8) {
        const out = [], T = pre.T, dist = Math.hypot(to[0] - x, to[2] - z), skip = Math.min(0.3, 1.5 / Math.max(1, dist));
        for (let i = 0; i < n; i++) {
          const t = T * (skip + (1 - 2 * skip) * (n === 1 ? 0.5 : i / (n - 1)));
          const p = c.point(t); out.push(L.coin(p[0], p[1] + 0.7, p[2]));
        }
        return out;
      },
    };
    c.solve = pre;
    L.cannons.push(c);

    if (!soundsWanted) { soundsWanted = true; audio.ensure?.(SFX_KEYS); }

    // ----- locks through world signals
    if (c.lockId) {
      const set = (v) => { if (v === false) c.lock(); else c.unlock(); };
      for (const kind of ['switch', 'lantern', 'cannon']) L.on(kind, c.lockId, set);
      if (c.lockId === 'lanterns') L.on('lanterns', 'count', (n) => { if (Number(n) >= (opts.need ?? 4)) c.unlock(); });
    }
    const lockedText = opts.lockedText ?? (c.lockId === 'lanterns' ? 'Fenerler yanınca ateşlenir.' : 'Top kilitli! Önce yolu aç.');

    // ----- state machine (runs per fixed step, before physics.stepPlayer)
    const from = new THREE.Vector3(), tmp = new THREE.Vector3();
    let wasInside = true;            // must step in fresh (spawning inside / landing back inside never auto-fires)
    let fromYaw = restYaw, sparkT = 0, tickDone = false, ringT = -1;

    function inside() {
      const p = player.pos;
      return Math.hypot(p.x - x, p.z - z) < TRIGGER_R && p.y >= mouth[1] - 0.25 && p.y <= mouth[1] + TRIGGER_H;
    }
    function startLoad() {
      c.state = 'load'; c.t = 0;
      from.copy(player.pos); fromYaw = yawG.rotation.y;
      player.vel.set(0, 0, 0); player.extVel.set(0, 0, 0); player.pounding = false;
      player.controlLock = LOAD_T + FUSE_T + 0.2;
      L.sfx('switch');
    }
    function launch(dt) {
      const landY = physics.groundAt(to[0], to[1] + 0.05, to[2]) ?? to[1];
      const s = solveFlight(mouth, [to[0], landY, to[2]], apex, physics, dt, landY);
      c.solve = s; c.T = s.T;
      player.pos.set(mouth[0], mouth[1], mouth[2]); player.prevY = mouth[1];
      player.extVel.set(0, 0, 0);
      physics.launch(tmp.set(s.vx, s.vy, s.vz), { flying: true });
      player.fallCap = FLIGHT_CAP;
      player.controlLock = s.T + 0.15;
      player.flip = 1;                                  // the triple-jump somersault, for joy
      player.facing = Math.atan2(s.vx, s.vz);
      physics.squash(0.7, 1.45);
      cam.yaw = Math.atan2(-s.vx, -s.vz);               // camera behind the flight
      cam.lastLook = performance.now();
      c.state = 'flying'; c.t = 0; c.flights++;
      // boom
      L.sfx('cannon_launch'); L.sfx('whoosh_rise'); if (!audio.has?.('cannon_launch')) L.sfx('cannon');
      fx.addTrauma(0.3);
      const muzzle = muzzlePos(tmp);
      L.spawnParticles(muzzle, 10, FLASH, { speed: 5, up: 3, life: 0.35, size: 1.2, grav: 2 });
      L.spawnParticles(muzzle, 14, SMOKE, { speed: 3.5, up: 2, life: 0.9, size: 1.8, grav: -1.5 });
      ring.position.copy(muzzle); ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(s.vx, s.vy, s.vz).normalize());
      ring.visible = true; ring.scale.setScalar(0.5); ringMat.opacity = 0.85; ringT = 0;
    }
    function muzzlePos(out) {
      yawG.updateMatrixWorld(true);
      return out.set(0, 0.62, BARREL_LEN * 0.62).applyMatrix4(shakeG.matrixWorld);
    }
    function endFlight(landed) {
      if (landed) {
        c.lastLanding = player.pos.toArray();
        player.vel.x = 0; player.vel.z = 0;            // stick the landing: a 30+ m/s flight must not slide off a small islet
        L.spawnParticles(player.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), 10, 0xf5ead0, { speed: 4, up: 1.5, life: 0.5, grav: 3 });
      }
      if (player.fallCap === FLIGHT_CAP) player.fallCap = physics.MAX_FALL;
      player.controlLock = 0;
      c.state = 'cool'; c.t = 0;
    }
    function reset() {
      if (c.state === 'flying' || c.state === 'load' || c.state === 'fuse') {
        if (player.fallCap === FLIGHT_CAP) player.fallCap = physics.MAX_FALL;
      }
      c.state = 'idle'; c.t = 0; wasInside = true;
      shakeG.position.set(0, 0, 0);
    }
    L._track.unsubs.push(bus.on('respawn', reset), bus.on('faint', reset));

    L.dynamic({
      update(dt) {
        c.t += dt;
        const isIn = inside();
        switch (c.state) {
          case 'idle': {
            if (isIn && !wasInside) {
              if (c.locked) {
                const now = performance.now() / 1000;
                if (now - toastAt > 2.5) { toastAt = now; L.toast(lockedText, 2); L.sfx('timer_tick'); }
              } else startLoad();
            }
            // idle: barrel eases back to its rest yaw
            yawG.rotation.y += wrapPi(restYaw - yawG.rotation.y) * (1 - Math.exp(-3 * dt));
            pitchG.rotation.x += (-0.0 - pitchG.rotation.x) * (1 - Math.exp(-3 * dt));
            break;
          }
          case 'load': {
            const k = smooth(Math.min(1, c.t / LOAD_T));
            player.pos.set(from.x + (mouth[0] - from.x) * k, from.y + (mouth[1] - from.y) * k + Math.sin(k * Math.PI) * 0.8, from.z + (mouth[2] - from.z) * k);
            player.prevY = player.pos.y; player.vel.set(0, 0, 0);
            physics.squash(1 - 0.85 * k, 1 - 0.85 * k);  // squeezes into the breech (hidden under the barrel by the end)
            yawG.rotation.y = fromYaw + wrapPi(aimYaw - fromYaw) * k;
            pitchG.rotation.x = -shownPitch * k;
            if (c.t >= LOAD_T) { c.state = 'fuse'; c.t = 0; sparkT = 0; tickDone = false; L.sfx('timer_tick'); }
            break;
          }
          case 'fuse': {
            player.pos.set(mouth[0], mouth[1], mouth[2]); player.prevY = mouth[1]; player.vel.set(0, 0, 0);
            physics.squash(0.15, 0.15);
            const a = 0.02 + 0.05 * (c.t / FUSE_T);
            shakeG.position.set(Math.sin(c.t * 83) * a, Math.abs(Math.sin(c.t * 61)) * a, Math.sin(c.t * 71) * a);
            if (!tickDone && c.t > FUSE_T * 0.5) { tickDone = true; L.sfx('timer_tick'); }
            sparkT -= dt;
            if (sparkT <= 0) {
              sparkT = 0.08;
              yawG.updateMatrixWorld(true);
              L.spawnParticles(tmp.set(0, 1.0, -0.5).applyMatrix4(shakeG.matrixWorld), 2, 0xffd166, { speed: 1.5, up: 2.5, life: 0.3, size: 0.7, grav: 6 });
            }
            if (c.t >= FUSE_T) { shakeG.position.set(0, 0, 0); launch(dt); }
            break;
          }
          case 'flying': {
            if (!player.flying || player.grounded) { endFlight(player.grounded); break; }
            // asymmetric gravity: the engine's flying branch integrates plain GRAV; add the heavier fall (GDD §3.4)
            if (player.vel.y < 0) player.vel.y -= physics.GRAV * (physics.FALL_MULT - 1) * dt;
            if (c.t > c.T + 6) endFlight(false);       // safety net (fell past the target into the void)
            break;
          }
          case 'cool': {
            if (c.t > 0.6) { c.state = 'idle'; c.t = 0; wasInside = isIn; }
            break;
          }
        }
        if (c.state !== 'cool') wasInside = isIn;
        if (ringT >= 0) {
          ringT += dt;
          const k = ringT / 0.7;
          ring.scale.setScalar(0.5 + k * 3.2); ringMat.opacity = 0.85 * (1 - k);
          ring.position.addScaledVector(tmp.set(0, 0, 1).applyQuaternion(ring.quaternion), dt * 3);
          if (k >= 1) { ring.visible = false; ringT = -1; }
        }
      },
      dispose() {
        if (c.state === 'flying' && player.fallCap === FLIGHT_CAP) player.fallCap = physics.MAX_FALL;
        if (soundsWanted) { soundsWanted = false; audio.release?.(SFX_KEYS); }
      },
    });
    return c;
  };
}

export default { name, install, solveFlight };
