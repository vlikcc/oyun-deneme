// Mechanic 'movers' — L.orbiter(center, r, period, opts) / L.bob(c, amp, period, opts) / L.pathMover(fn, w, d, opts) —
// function movers through the E6 hook `m.fn(t) → top-centre` (GDD §3.6, ARCHITECTURE §15 "Movers (E6)").
// install(L, ctx) attaches the primitives; ctx = { scene, player, physics, enemies, fx, audio, assets, world }.
//
// Every primitive returns an ordinary mover collider (a box registered in physics.movers): world.step evaluates
// `m.fn(m.t)` (t = seconds since load, advanced only while not `m.stopped`), writes `m.delta`, and riders are carried as on
// any L.mover. `m.stopped = true` freezes it (delta 0) and it resumes from the same t. Box looks / materials: every other
// opts key is passed to L.mover → L.box (`mat`, `color`, `topColor`, `steps`, `surface`, …).
//
// L.orbiter(center, r, period, { w = 3, d = 3, phase = 0, cw = true, stopped = false })
//   top-centre = center + [cos a·r, 0, sin a·r], a = phase·2π + t/period·2π·(cw ? +1 : −1)   (phase in turns, 0..1).
//   `cw: true` is clockwise seen from above (Y up): +x → +z → −x → −z. The GDD §3.6 formula has the opposite sign
//   (`cw ? −1 : 1`), which turns counter-clockwise from above (right-hand rule about +Y); the name wins here, a = phase·2π
//   at t = 0 either way. Extra fields: m.orbit {center, r, period, phase, cw}, m.angleAt(t).
// L.bob(c, amp, period, { w = 3, d = 3, phase = 0, stopped = false, crestSfx = 'bubble_pop' })
//   c = top-centre [x, y, z] / Vector3 (a new mover box w × d), or an existing L.box collider (turned into a mover in
//   place, keeping its mesh/material/size). top = [x, y0 + sin((t/period + phase)·2π)·amp, z]. phase is in turns (the
//   kumsal rafts use 0/.25/.5/.75). Level rule (GDD §2.0): amp ≤ 0.35, period ≥ 3 — larger amp / shorter period are
//   clamped with a console.warn. crestSfx plays at each crest while the player stands on it (null = silent).
// L.pathMover(fn, w = 3, d = 3, { stopped = false, ...boxOpts }) — any `fn(t) → Vector3 | [x, y, z]` (top-centre).
import * as THREE from 'three';

export const name = 'movers';
export const BOB_MAX_AMP = 0.35, BOB_MIN_PERIOD = 3;   // GDD §2.0
const TAU = Math.PI * 2;
const OWN_KEYS = new Set(['w', 'd', 'phase', 'cw', 'stopped', 'crestSfx']);
const boxOpts = (opts) => { const o = {}; for (const k of Object.keys(opts || {})) if (!OWN_KEYS.has(k)) o[k] = opts[k]; return o; };
const toV3 = (v) => (v?.isVector3 ? v.clone() : Array.isArray(v) ? new THREE.Vector3(v[0], v[1], v[2]) : null);

export function install(L, ctx) {
  const { physics } = ctx;

  /** Build a mover box at fn(0) and hand world.step the function. */
  function fnMover(fn, w, d, opts) {
    const p0 = toV3(fn(0));
    if (!p0 || ![p0.x, p0.y, p0.z].every(Number.isFinite)) throw new Error('movers: fn(0) must return a Vector3 or [x, y, z]');
    const m = L.mover(p0, p0.clone(), 1, w, d, boxOpts(opts));
    m.fn = fn; m.stopped = !!opts.stopped;
    return m;
  }

  /** L.orbiter(center, r, period, { w, d, phase, cw, stopped }) → mover collider (see header). */
  L.orbiter = function orbiter(center, r, period, opts = {}) {
    const c = toV3(center);
    if (!c || !(period > 0) || !(r >= 0)) throw new Error('L.orbiter(center, r, period): needs a centre, r ≥ 0, period > 0');
    const { w = 3, d = 3, phase = 0, cw = true } = opts;
    const sgn = cw ? 1 : -1, out = new THREE.Vector3();
    const angleAt = (t) => phase * TAU + (t / period) * TAU * sgn;
    const fn = (t) => { const a = angleAt(t); return out.set(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r); };
    const m = fnMover(fn, w, d, opts);
    m.orbit = { center: c, r, period, phase, cw: !!cw };
    m.angleAt = angleAt;
    return m;
  };

  /** L.bob(c, amp, period, { w, d, phase, stopped, crestSfx }) → mover collider (see header). */
  L.bob = function bob(c, amp, period, opts = {}) {
    let A = Math.abs(Number(amp) || 0), P = Number(period) || BOB_MIN_PERIOD;
    if (A > BOB_MAX_AMP) { console.warn(`[movers] bob amplitude ${A} > ${BOB_MAX_AMP} m (GDD §2.0), clamped`); A = BOB_MAX_AMP; }
    if (P < BOB_MIN_PERIOD) { console.warn(`[movers] bob period ${P} < ${BOB_MIN_PERIOD} s (GDD §2.0), clamped`); P = BOB_MIN_PERIOD; }
    const phase = Number(opts.phase) || 0;
    const out = new THREE.Vector3();
    let m, x, y0, z;
    if (c && c.type === 'box' && c.mesh) {
      // an existing L.box: turn it into a function mover in place (keeps its mesh, materials, size and hooks)
      m = c; x = (c.min.x + c.max.x) / 2; z = (c.min.z + c.max.z) / 2; y0 = c.max.y;
      const h = c.max.y - c.min.y;
      Object.assign(m, { a: new THREE.Vector3(x, y0, z), b: new THREE.Vector3(x, y0, z), period: P, t: 0, w: c.max.x - c.min.x, d: c.max.z - c.min.z, h, mover: true });
      if (!physics.movers.includes(m)) physics.movers.push(m);
      m.stopped = !!opts.stopped;
    } else if (c && c.type === 'cyl') {
      throw new Error('L.bob: cylinder colliders cannot move (movers are boxes) — pass [x, top, z] or an L.box');
    } else {
      const p = toV3(c);
      if (!p) throw new Error('L.bob(c, …): c must be [x, top, z], a Vector3 or an L.box collider');
      x = p.x; y0 = p.y; z = p.z;
    }
    const fn = (t) => out.set(x, y0 + Math.sin((t / P + phase) * TAU) * A, z);
    if (m) {
      m.fn = fn;
      // place it at fn(0) right away so the first step has no jump
      const f = fn(0); m.mesh.position.set(f.x, f.y - m.h / 2, f.z);
      m.min.set(f.x - m.w / 2, f.y - m.h, f.z - m.d / 2); m.max.set(f.x + m.w / 2, f.y, f.z + m.d / 2);
      m.mesh.updateMatrixWorld();
    } else m = fnMover(fn, opts.w ?? 3, opts.d ?? 3, opts);
    m.bobInfo = { x, y0, z, amp: A, period: P, phase };
    // crest sound while ridden: fires when the platform passes its highest point (sin crosses its maximum)
    const crestSfx = opts.crestSfx === undefined ? 'bubble_pop' : opts.crestSfx;
    if (crestSfx) {
      const prev = m.onStand;
      let lastCycle = Math.floor(m.t / P + phase - 0.25);
      m.onStand = (pl, col, dt) => {
        prev?.(pl, col, dt);
        const cyc = Math.floor(col.t / P + phase - 0.25);   // integer part increases right at each crest (phase 0.25 of a sine)
        if (cyc !== lastCycle) { if (cyc > lastCycle) L.sfx(crestSfx); lastCycle = cyc; }
      };
      const prevLand = m.onLand;
      m.onLand = (pl, col) => { prevLand?.(pl, col); lastCycle = Math.floor(col.t / P + phase - 0.25); };
    }
    return m;
  };

  /** L.pathMover(fn, w, d, { stopped, ...boxOpts }) → mover collider driven by fn(t) → top-centre. */
  L.pathMover = function pathMover(fn, w = 3, d = 3, opts = {}) {
    if (typeof fn !== 'function') throw new Error('L.pathMover(fn, w, d): fn(t) → Vector3 | [x, y, z]');
    return fnMover(fn, w, d, opts);
  };
}
