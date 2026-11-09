// Mechanic 'wind' — L.wind(box, dir, speed, opts) / L.updraft(x, z, r, y0, y1, opts) (GDD §3.5, ARCHITECTURE §7/§15).
// install(L, ctx) attaches both primitives; ctx = { scene, player, physics, enemies, fx, audio, assets, world }.
//
// L.wind(box, dir, speed, { gust = 0, phase = 0, color }) — horizontal push volume.
//   box = {x, y, z, w, h, d} like L.trigger (x/z centre, y bottom). While the player is inside, `player.extVel` (x/z only)
//   is eased toward dir·speed·gust(t)·assist.wind (rate 10/s) and clamped to that speed; the engine's extVel decay leaves
//   ≈ 0.87·speed airborne / ≈ 0.6·speed grounded. speed is capped at MAX_WIND (4 m/s, GDD §2.0). gust (Hz) > 0 makes the
//   strength breathe: g(t) = 0.5 + 0.5·sin((t·gust + phase)·2π). No push during a cannon flight (`player.flying`), so the
//   cannon's exact landing solve is never disturbed. Visual: one InstancedMesh of 24 streaks flowing along dir (1 draw).
//   Returns the zone { trigger, mesh, dir, speed, gust, enabled, inside, gustAt(t), setSpeed(v) }.
//
// L.updraft(x, z, r, y0, y1, { lift = 14, color }) — vertical lift column (not a collider).
//   While the player's capsule is inside the cylinder and the feet are ≤ y1: vel.y = damp(vel.y, lift, 6, dt),
//   grounded = false, pounding = false (gravity is still integrated → lift 14 climbs at ≈ 6.5 m/s). Above y1 the player
//   arcs over normally with air control. `spring_boing` + a small puff once per entry (hysteresis: the entry only re-arms
//   after leaving the column sideways, dropping below y0, or rising 2.5 m above y1). Visual: a faint gradient column + an
//   InstancedMesh of rising spiral streaks (2 draws). Returns { x, z, r, y0, y1, lift, enabled, inside, lifting, entries,
//   column, mesh }.
//
// Audio (one shared runtime per level): `wind_strong` loop gain follows the gust envelope while inside a wind zone,
// `wind_howl_loop` gain follows the wind strength / the height inside an updraft. Both loops are stopped and their
// decoded buffers released when the level unloads (the runtime is an L.dynamic with dispose()).
import * as THREE from 'three';

export const name = 'wind';
export const MAX_WIND = 4;            // m/s, GDD §2.0 level rule (before the Yardım Modu multiplier)
const WIND_STREAKS = 24;
const TAU = Math.PI * 2;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const LOOP_STRONG = 'mech:wind_strong', LOOP_HOWL = 'mech:wind_howl';
const KEY_STRONG = 'wind_strong', KEY_HOWL = 'wind_howl_loop';

// Small local PRNG for streak placement: seeded with ONE L.rnd() draw per primitive, so a wind zone never shifts the
// level's seeded stream by more than one value (still fully deterministic, no Math.random()).
function prng(seed) { let s = Math.max(1, Math.floor(seed) % 2147483647); return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// ---------------------------------------------------------------- shared (never disposed, like world.js' shared geometry)
let shared = null;
function gradientTex(horizontal) {
  const c = document.createElement('canvas'); c.width = horizontal ? 64 : 1; c.height = horizontal ? 1 : 64;
  const x = c.getContext('2d');
  // horizontal: streak along u (0 → 1 → 0); vertical: column along v (canvas y=0 is the TOP of the texture = v 1)
  const g = horizontal ? x.createLinearGradient(0, 0, 64, 0) : x.createLinearGradient(0, 64, 0, 0);
  if (horizontal) { g.addColorStop(0, '#000'); g.addColorStop(0.35, '#fff'); g.addColorStop(0.75, '#fff'); g.addColorStop(1, '#000'); }
  else { g.addColorStop(0, '#000'); g.addColorStop(0.08, '#fff'); g.addColorStop(0.7, '#aaa'); g.addColorStop(1, '#000'); }
  x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
  return noMip(new THREE.CanvasTexture(c));
}
// 1-texel-wide gradients: no mipmaps (the thin streak's other UV axis would otherwise pick the 1×1 average mip)
function noMip(t) { t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; return t; }
function res() {
  if (shared) return shared;
  shared = {
    windGeo: new THREE.BoxGeometry(1, 0.12, 0.12),          // long along +X (u runs along X on the ±Y/±Z faces)
    riseGeo: new THREE.BoxGeometry(0.12, 1, 0.12),          // long along +Y (v runs along Y on the ±X/±Z faces)
    columnGeo: new THREE.CylinderGeometry(1, 1, 1, 24, 1, true),
    alongU: gradientTex(true),
    alongV: gradientTex(false),
  };
  // the rising streaks use the vertical gradient too (fade at both ends)
  shared.streakV = (() => {
    const c = document.createElement('canvas'); c.width = 1; c.height = 32; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 32, 0, 0); g.addColorStop(0, '#000'); g.addColorStop(0.4, '#fff'); g.addColorStop(0.8, '#fff'); g.addColorStop(1, '#000');
    x.fillStyle = g; x.fillRect(0, 0, 1, 32); return noMip(new THREE.CanvasTexture(c));
  })();
  return shared;
}

const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

export function install(L, ctx) {
  const { physics, audio, player } = ctx;

  // ---------------------------------------------------------------- per-level runtime (created on first use)
  const rt = { time: 0, zones: [], drafts: [], dyn: null, vizAcc: 0, audioAcc: 0,
    loops: { [LOOP_STRONG]: { key: KEY_STRONG, target: 0, last: -1, idle: 0, scale: 0.45 }, [LOOP_HOWL]: { key: KEY_HOWL, target: 0, last: -1, idle: 0, scale: 0.55 } } };

  function runtime() {
    if (rt.dyn) return rt;
    rt.dyn = L.dynamic({
      update(dt) { stepRuntime(dt); },
      dispose() {
        for (const id of Object.keys(rt.loops)) { try { audio.stopLoop?.(id, 0.3); } catch { /* audio may be uninitialised */ } }
        try { audio.release?.([KEY_STRONG, KEY_HOWL]); } catch { /* ignore */ }
        rt.zones.length = 0; rt.drafts.length = 0; rt.dyn = null;
      },
    });
    return rt;
  }

  function stepRuntime(dt) {
    rt.time += dt;
    const p = player, playing = physics.sim.playing;
    let strong = 0, howl = 0;

    // updrafts: lift + entry detection (this dynamic runs before physics.stepPlayer, so gravity integrates after the damp)
    for (const u of rt.drafts) {
      if (!u.enabled) { u.inside = u.lifting = false; continue; }
      const dxz = Math.hypot(p.pos.x - u.x, p.pos.z - u.z);
      const lifting = playing && !p.flying && dxz < u.r && p.pos.y + p.H > u.y0 && p.pos.y <= u.y1;
      const near = playing && dxz < u.r + 0.35 && p.pos.y + p.H > u.y0 && p.pos.y <= u.y1 + 2.5;
      if (lifting) {
        p.vel.y = THREE.MathUtils.damp(p.vel.y, u.lift, 6, dt);
        p.grounded = false; p.pounding = false; p.poundHold = 0; p.cutAllowed = false;
        if (!u.inside) {
          u.inside = true; u.entries++;
          L.sfx('spring_boing');
          physics.squash?.(0.8, 1.25);
          L.spawnParticles(new THREE.Vector3(p.pos.x, p.pos.y + 0.2, p.pos.z), 8, u.color, { speed: 2, up: 6, life: 0.5, grav: 2 });
        }
      } else if (!near) u.inside = false;
      u.lifting = lifting;
      if (u.inside) howl = Math.max(howl, 0.3 + 0.7 * clamp01((p.pos.y - u.y0) / Math.max(1, u.y1 - u.y0)));
    }
    // wind zones: envelope for visuals + audio (the push itself runs in the trigger's onStay)
    for (const z of rt.zones) {
      z.env = z.gustAt(rt.time);
      if (z.enabled && z.trigger.inside) {
        const k = z.speed / MAX_WIND;
        strong = Math.max(strong, (0.2 + 0.8 * z.env) * k);
        howl = Math.max(howl, 0.35 * k);
      }
    }
    rt.loops[LOOP_STRONG].target = strong;
    rt.loops[LOOP_HOWL].target = howl;

    rt.vizAcc += dt;
    if (rt.vizAcc >= 1 / 60 - 1e-6) { const vdt = rt.vizAcc; rt.vizAcc = 0; for (const z of rt.zones) drawWind(z, vdt); for (const u of rt.drafts) drawDraft(u, vdt); }
    rt.audioAcc += dt;
    if (rt.audioAcc >= 0.1) { const adt = rt.audioAcc; rt.audioAcc = 0; updateLoops(adt); }
  }

  function updateLoops(dt) {
    for (const [id, l] of Object.entries(rt.loops)) {
      const target = l.target * l.scale;
      if (target > 0.01) {
        l.idle = 0;
        if (!audio.isLooping?.(id)) { if (audio.playLoop?.(l.key, { id, bus: 'sfx', fadeIn: 0.5, gain: target })) l.last = target; }
        else if (Math.abs(target - l.last) > 0.02) { audio.setLoopGain?.(id, target, 0.2); l.last = target; }
      } else if (audio.isLooping?.(id)) {
        if (l.last !== 0) { audio.setLoopGain?.(id, 0, 0.3); l.last = 0; }
        l.idle += dt;
        if (l.idle > 2) { audio.stopLoop?.(id, 0.4); l.idle = 0; l.last = -1; }
      }
    }
  }

  // ---------------------------------------------------------------- visuals
  function drawWind(z, dt) {
    const im = z.mesh; if (!im) return;
    im.visible = z.enabled;
    if (!z.enabled) return;
    z.flow += dt * z.visSpeed * (0.35 + 0.65 * z.env);
    z.mat.opacity = 0.35 + 0.45 * z.env;
    const b = z.box;
    for (let i = 0; i < z.streaks.length; i++) {
      const s = z.streaks[i];
      const f = (((s.a + (z.flow * s.spd) / z.ea) % 1) + 1) % 1;
      const along = (f - 0.5) * z.ea;
      v4.set(b.x, s.y, b.z).addScaledVector(z.dir, along).addScaledVector(z.lat, s.l * z.el);
      if (Math.abs(v4.x - b.x) > b.w / 2 || Math.abs(v4.z - b.z) > b.d / 2) { im.setMatrixAt(i, ZERO); continue; }   // diagonal winds: clip to the box
      const k = Math.sin(Math.PI * f);
      s4.set(s.len * Math.max(0.05, k) * (0.55 + 0.45 * z.env), 0.6 + 0.4 * k, 0.6 + 0.4 * k);
      m4.compose(v4, z.quat, s4); im.setMatrixAt(i, m4);
    }
    im.instanceMatrix.needsUpdate = true;
  }
  function drawDraft(u, dt) {
    const im = u.mesh; if (!im) return;
    im.visible = u.column.visible = u.enabled;
    if (!u.enabled) return;
    u.flow += dt;
    const H = u.top - u.y0;
    for (let i = 0; i < u.streaks.length; i++) {
      const s = u.streaks[i];
      const f = (((s.f + (u.flow * u.visSpeed * s.spd) / H) % 1) + 1) % 1;
      const a = s.ang + u.flow * 0.7 * s.spd;
      v4.set(u.x + Math.cos(a) * s.rad, u.y0 + f * H, u.z + Math.sin(a) * s.rad);
      const k = Math.sin(Math.PI * f);
      s4.set(0.7 + 0.3 * k, s.len * Math.max(0.05, k), 0.7 + 0.3 * k);
      q4.identity();
      m4.compose(v4, q4, s4); im.setMatrixAt(i, m4);
    }
    im.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- L.wind
  /** L.wind(box, dir, speed, { gust = 0 Hz, phase = 0 (cycles), color = 0xffffff }) → zone (see header). */
  L.wind = function wind(box, dir, speed, opts = {}) {
    if (!box || ![box.x, box.y, box.z, box.w, box.h, box.d].every(Number.isFinite)) throw new Error('L.wind needs box {x, y, z, w, h, d}');
    const d = Array.isArray(dir) ? new THREE.Vector3(dir[0] ?? 0, 0, dir[2] ?? 0) : new THREE.Vector3(dir?.x ?? 0, 0, dir?.z ?? 0);
    if (d.lengthSq() < 1e-8) { console.warn('[wind] zero direction, using +x'); d.set(1, 0, 0); }
    d.normalize();
    let spd = Number(speed) || 0;
    if (spd > MAX_WIND) { console.warn(`[wind] speed ${spd} > ${MAX_WIND} m/s (GDD §2.0), clamped`); spd = MAX_WIND; }
    spd = Math.max(0, spd);
    const gust = Math.max(0, Number(opts.gust) || 0), phase = Number(opts.phase) || 0;
    const r = runtime();
    const rand = prng(L.rnd() * 2147483646 + 1);
    const zone = {
      kind: 'wind', box: { ...box }, dir: d, lat: new THREE.Vector3(-d.z, 0, d.x), speed: spd, gust, phase, enabled: true,
      env: 1, flow: 0, streaks: [], mesh: null, mat: null, trigger: null,
      quat: new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(-d.z, d.x)),
      ea: Math.abs(d.x) * box.w + Math.abs(d.z) * box.d, el: Math.abs(d.z) * box.w + Math.abs(d.x) * box.d,
      visSpeed: Math.max(2.5, spd * 2.2),
      get inside() { return !!zone.trigger?.inside; },
      gustAt(t) { return gust > 0 ? 0.5 + 0.5 * Math.sin((t * gust + phase) * TAU) : 1; },
      setSpeed(v) { zone.speed = Math.max(0, Math.min(MAX_WIND, Number(v) || 0)); zone.visSpeed = Math.max(2.5, zone.speed * 2.2); },
    };
    const target = new THREE.Vector3();
    const push = (p, dt) => {
      if (!zone.enabled || p.flying) return;
      const eff = zone.speed * physics.assist.wind;
      target.copy(zone.dir).multiplyScalar(eff * zone.gustAt(r.time));
      const k = 1 - Math.exp(-10 * dt);
      p.extVel.x += (target.x - p.extVel.x) * k;
      p.extVel.z += (target.z - p.extVel.z) * k;
      const h = Math.hypot(p.extVel.x, p.extVel.z);
      if (h > eff) { const s = eff / h; p.extVel.x *= s; p.extVel.z *= s; }   // clampLength(0, speed) on the horizontal part
    };
    zone.trigger = L.trigger(zone.box, { onEnter: (p) => push(p, physics.STEP ?? 1 / 120), onStay: (p, tr, dt) => push(p, dt ?? 1 / 120) });

    // 24 streaks: one InstancedMesh, no shadows, not reflected (NO_REFLECT layer via L.smallLayer)
    const R = res();
    zone.mat = L.own(new THREE.MeshBasicMaterial({ color: opts.color ?? 0xffffff, alphaMap: R.alongU, transparent: true, opacity: 0.5, depthWrite: false }));
    const im = new THREE.InstancedMesh(R.windGeo, zone.mat, WIND_STREAKS);
    im.name = 'wind:streaks'; im.castShadow = false; im.receiveShadow = false;
    im.boundingSphere = new THREE.Sphere(new THREE.Vector3(box.x, box.y + box.h / 2, box.z), 0.5 * Math.hypot(box.w, box.h, box.d) + 2);
    for (let i = 0; i < WIND_STREAKS; i++) {
      zone.streaks.push({ a: rand(), l: rand() - 0.5, y: box.y + 0.25 + rand() * Math.max(0.1, box.h - 0.5), len: 1.4 + rand() * 1.6, spd: 0.8 + rand() * 0.5 });
      im.setMatrixAt(i, ZERO);
    }
    zone.mesh = im;
    L.smallLayer(im); L.add(im);
    r.zones.push(zone);
    drawWind(zone, 0);
    return zone;
  };

  // ---------------------------------------------------------------- L.updraft
  /** L.updraft(x, z, r, y0, y1, { lift = 14, color = 0xeaf8ff }) → updraft (see header). */
  L.updraft = function updraft(x, z, r, y0, y1, opts = {}) {
    if (![x, z, r, y0, y1].every(Number.isFinite) || r <= 0 || y1 <= y0) throw new Error('L.updraft(x, z, r, y0, y1): needs r > 0 and y1 > y0');
    const rtm = runtime();
    const rand = prng(L.rnd() * 2147483646 + 1);
    const color = opts.color ?? 0xeaf8ff;
    const top = y1 + 1.5;                                      // the visual fades out a little above the lift ceiling
    const u = { kind: 'updraft', x, z, r, y0, y1, top, lift: opts.lift ?? 14, color, enabled: true, inside: false, lifting: false, entries: 0,
      flow: 0, visSpeed: 7, streaks: [], mesh: null, column: null };
    const R = res();
    // faint gradient column (double-sided so it reads from inside too)
    const colMat = L.own(new THREE.MeshBasicMaterial({ color, alphaMap: R.alongV, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    const col = new THREE.Mesh(R.columnGeo, colMat);
    col.name = 'updraft:column'; col.position.set(x, (y0 + top) / 2, z); col.scale.set(r, top - y0, r);
    col.castShadow = false; col.receiveShadow = false; col.renderOrder = 1;
    u.column = col; L.smallLayer(col); L.add(col);
    // rising spiral streaks
    const n = Math.max(16, Math.min(48, Math.round((top - y0) * 0.9)));
    const sMat = L.own(new THREE.MeshBasicMaterial({ color: 0xffffff, alphaMap: R.streakV, transparent: true, opacity: 0.75, depthWrite: false }));
    const im = new THREE.InstancedMesh(R.riseGeo, sMat, n);
    im.name = 'updraft:streaks'; im.castShadow = false; im.receiveShadow = false; im.renderOrder = 2;
    im.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, (y0 + top) / 2, z), Math.hypot(r, (top - y0) / 2) + 1);
    for (let i = 0; i < n; i++) {
      u.streaks.push({ f: rand(), ang: rand() * TAU, rad: r * Math.sqrt(rand()) * 0.85, len: 0.9 + rand() * 1.2, spd: 0.8 + rand() * 0.5 });
      im.setMatrixAt(i, ZERO);
    }
    u.mesh = im; L.smallLayer(im); L.add(im);
    rtm.drafts.push(u);
    drawDraft(u, 0);
    return u;
  };
}

