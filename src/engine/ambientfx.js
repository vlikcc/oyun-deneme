// Ambient particle systems (theme.particles 'snow' | 'embers' | 'leaves' | 'fireflies' | 'sparkles') + the night moon
// sprite (theme.sun.moon). ARCHITECTURE §15: main.js calls init() once at boot; init() registers every system through
// core.registerParticles(name, factory) — core.applyTheme builds theme.particles and disposes the previous system.
//
// One THREE.Points per level (one draw call), ≤ 400 particles (quality.maxParticles × a per-kind factor), on
// core.NO_REFLECT_LAYER. All motion runs in the vertex shader (PointsMaterial + onBeforeCompile): every particle has a
// fixed world-space seed position plus an analytic drift, wrapped (mod) into a 40 m box centred on the player, so the
// field stays put in the world while Pıtır moves through it and the CPU only writes two uniforms per frame (no per-frame
// allocation, no buffer uploads). Particles fade out at the box edges and right in front of the camera.
// Disposal: on bus 'level:unloaded' and when core.applyTheme replaces the system (dispose() is idempotent).
// theme.sun.moon: true (moon in theme.sun.dir) | [x, y, z] | { dir, color, size } — a camera-following sprite 320 m out,
// fog-free; it is added for any theme.particles value, 'none' included.
import * as THREE from 'three';
import * as core from './core.js';
import { player } from './physics.js';
import { bus } from './bus.js';

const MAX = 400;          // hard cap per system
const BOX = 40;           // follow box (m, x/z)

// Per-kind look. count = round(quality.maxParticles × k) (300/150/60 → high/medium/low), capped at MAX.
// h / yOff: box height and its centre above the player. size: world-space point size (m). sprite: canvas sprite.
const KINDS = {
  snow: { k: 1.33, h: 16, yOff: 4, size: 0.3, sprite: 'flake', additive: false, fog: true, opacity: 0.95, colors: [0xffffff, 0xf2f8ff, 0xe6f2ff] },
  embers: { k: 1.0, h: 14, yOff: 3, size: 0.3, sprite: 'dot', additive: true, fog: false, opacity: 1, colors: [0xff7a1a, 0xffa040, 0xffd060, 0xff5010] },
  leaves: { k: 0.6, h: 16, yOff: 4, size: 0.6, sprite: 'leaf', additive: false, fog: true, opacity: 1, colors: [0x8fd14f, 0x5fb83a, 0xf2c14e, 0xe8913a, 0xc9d94a] },
  fireflies: { k: 0.5, h: 6, yOff: 1.5, size: 0.6, sprite: 'dot', additive: true, fog: false, opacity: 1, colors: [0xe4ff7a, 0xc8ff5a, 0xfff08a] },
  sparkles: { k: 0.8, h: 10, yOff: 3, size: 0.55, sprite: 'star', additive: true, fog: false, opacity: 1, colors: [0xffffff, 0xfff1b8, 0xc8f0ff, 0xffd8f4] },
};
const KIND_ID = { snow: 0, embers: 1, leaves: 2, fireflies: 3, sparkles: 4 };

// ---------------------------------------------------------------- canvas sprites (created per system, disposed with it)
function canvasTex(draw, n = 64) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'); draw(g, n);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true;
  return t;
}
const TEX = {
  dot: (g, n) => {
    const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,0.95)');
    r.addColorStop(0.45, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, n, n);
  },
  flake: (g, n) => {
    const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    r.addColorStop(0.75, 'rgba(255,255,255,0.3)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, n, n);
  },
  leaf: (g, n) => {
    g.translate(n / 2, n / 2); g.rotate(-0.6);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -n * 0.44);
    g.quadraticCurveTo(n * 0.3, -n * 0.1, 0, n * 0.4); g.quadraticCurveTo(-n * 0.3, -n * 0.1, 0, -n * 0.44); g.fill();
    g.strokeStyle = 'rgba(120,120,120,0.55)'; g.lineWidth = n * 0.035;
    g.beginPath(); g.moveTo(0, -n * 0.36); g.lineTo(0, n * 0.46); g.stroke();
  },
  star: (g, n) => {
    const h = n / 2;
    const r = g.createRadialGradient(h, h, 0, h, h, h * 0.55);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, n, n);
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 2; i++) {   // 4-point twinkle: two thin diamonds
      g.beginPath();
      if (i === 0) { g.moveTo(h, 0); g.lineTo(h + n * 0.06, h); g.lineTo(h, n); g.lineTo(h - n * 0.06, h); }
      else { g.moveTo(0, h); g.lineTo(h, h - n * 0.06); g.lineTo(n, h); g.lineTo(h, h + n * 0.06); }
      g.closePath(); g.fill();
    }
  },
  moon: (g, n) => {
    const h = n / 2;
    const halo = g.createRadialGradient(h, h, n * 0.16, h, h, h);
    halo.addColorStop(0, 'rgba(220,230,255,0.55)'); halo.addColorStop(0.35, 'rgba(190,205,255,0.16)'); halo.addColorStop(1, 'rgba(180,200,255,0)');
    g.fillStyle = halo; g.fillRect(0, 0, n, n);
    const disc = g.createRadialGradient(h - n * 0.04, h - n * 0.04, 0, h, h, n * 0.17);
    disc.addColorStop(0, '#fffdf4'); disc.addColorStop(0.85, '#f1eedf'); disc.addColorStop(1, '#e4e0cf');
    g.fillStyle = disc; g.beginPath(); g.arc(h, h, n * 0.17, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(170,165,150,0.35)';   // a few soft maria
    for (const [x, y, r] of [[-0.05, -0.04, 0.045], [0.05, 0.03, 0.035], [-0.02, 0.07, 0.025], [0.07, -0.06, 0.02]]) { g.beginPath(); g.arc(h + x * n, h + y * n, r * n, 0, Math.PI * 2); g.fill(); }
  },
};

// ---------------------------------------------------------------- shader injection
// Seed attribute aSeed = (phase 0..1, speed 0..1, size mul, rotation phase). position = fixed base in [0,1)^3 × box.
const MOTION = /* glsl */`
  vec3 p = position;
  float t = uTime, ph = aSeed.x * 6.2831853, sp = aSeed.y;
  float tw = 1.0;
#if FX_KIND == 0
  p.y -= t * (0.9 + sp * 0.9);
  p.x += sin(t * (0.5 + sp * 0.7) + ph) * 0.55 + t * 0.35;
  p.z += cos(t * (0.4 + sp * 0.5) + ph * 1.7) * 0.5;
#elif FX_KIND == 1
  p.y += t * (0.7 + sp * 1.1);
  p.x += sin(t * 1.3 + ph) * 0.7 + t * 0.15;
  p.z += cos(t * (0.9 + sp * 0.6) + ph * 2.3) * 0.7;
  tw = 0.55 + 0.45 * sin(t * (6.0 + sp * 7.0) + ph * 13.0);
#elif FX_KIND == 2
  p.y -= t * (0.45 + sp * 0.4);
  p.x += sin(t * (0.6 + sp * 0.5) + ph) * 1.6 + t * 0.6;
  p.z += sin(t * (0.45 + sp * 0.3) + ph * 2.1) * 1.1;
  vRot = aSeed.w * 6.2831853 + t * (0.8 + sp * 1.8) * (aSeed.w > 0.5 ? 1.0 : -1.0);
#elif FX_KIND == 3
  p.x += sin(t * (0.25 + sp * 0.35) + ph) * 1.8 + sin(t * 1.7 + ph * 5.0) * 0.22;
  p.y += sin(t * (0.35 + sp * 0.3) + ph * 1.3) * 0.8;
  p.z += cos(t * (0.3 + sp * 0.35) + ph * 2.0) * 1.8;
  tw = 0.12 + 0.88 * smoothstep(0.25, 1.0, 0.5 + 0.5 * sin(t * (1.1 + sp * 1.4) + ph * 7.0));
#else
  p.y += t * (0.12 + sp * 0.22);
  p.x += sin(t * 0.4 + ph) * 0.35;
  p.z += cos(t * 0.35 + ph * 1.9) * 0.35;
  tw = 0.3 + 0.7 * pow(max(0.0, sin(t * (1.6 + sp * 2.2) + ph * 9.0)), 4.0);
#endif
  vec3 rel = mod(p - uCenter + uHalf, uHalf * 2.0) - uHalf;   // wrap into the box around the player
  vec3 transformed = uCenter + rel;
  vec3 e = abs(rel) / uHalf;
  float edge = (1.0 - smoothstep(0.72, 1.0, max(e.x, e.z))) * (1.0 - smoothstep(0.7, 1.0, e.y));
#if FX_KIND == 1
  edge *= 1.0 - smoothstep(-0.4, 1.0, rel.y / uHalf.y);   // embers cool down as they rise
#endif
  vAlpha = edge * tw;
  vSizeK = aSeed.z * (FX_KIND == 4 ? (0.45 + 0.55 * tw) : 1.0);
`;

function makeMaterial(kind, def, tex, U) {
  const mat = new THREE.PointsMaterial({
    size: def.size, map: tex, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true,
    opacity: def.opacity, fog: def.fog, blending: def.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  mat.defines = { FX_KIND: KIND_ID[kind] };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uCenter = U.uCenter; sh.uniforms.uHalf = U.uHalf;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSeed;\nuniform float uTime;\nuniform vec3 uCenter;\nuniform vec3 uHalf;\nvarying float vAlpha;\nvarying float vRot;\nfloat vSizeK;')
      .replace('#include <begin_vertex>', 'vRot = 0.0;\n' + MOTION)
      .replace('gl_PointSize = size;', 'gl_PointSize = size * vSizeK;')
      .replace('#include <logdepthbuf_vertex>', 'vAlpha *= smoothstep(0.6, 2.2, -mvPosition.z);\ngl_PointSize = min(gl_PointSize, 96.0);\n#include <logdepthbuf_vertex>');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlpha;\nvarying float vRot;')
      .replace('#include <map_particle_fragment>', `
#if FX_KIND == 2
  { vec2 q = gl_PointCoord - 0.5; float c = cos(vRot), s = sin(vRot); q = mat2(c, -s, s, c) * q + 0.5;
    diffuseColor *= texture2D(map, vec2(q.x, 1.0 - q.y)); }
#else
  #include <map_particle_fragment>
#endif
  diffuseColor.a *= vAlpha;
  if (diffuseColor.a < 0.004) discard;`);
  };
  mat.customProgramCacheKey = () => 'ambientfx-' + kind;
  return mat;
}

// Deterministic per-system PRNG (mulberry32) so screenshots and tests are stable.
function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const center = new THREE.Vector3();
function followPoint(out) {
  if (player?.pos && Number.isFinite(player.pos.x)) return out.copy(player.pos);
  return out.copy(core.camera.position);
}

function buildParticles(kind, scene, quality) {
  const def = KINDS[kind];
  const n = Math.max(0, Math.min(MAX, Math.round((quality?.maxParticles ?? 150) * def.k)));
  if (!n) return null;
  const rnd = prng(0x51ed + KIND_ID[kind] * 7919);
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), seed = new Float32Array(n * 4);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    pos[i * 3] = rnd() * BOX; pos[i * 3 + 1] = rnd() * def.h; pos[i * 3 + 2] = rnd() * BOX;
    c.set(def.colors[(rnd() * def.colors.length) | 0]);
    if (def.additive) c.multiplyScalar(1.5);   // additive sprites lose against bright day skies: push them a bit
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    seed[i * 4] = rnd(); seed[i * 4 + 1] = rnd(); seed[i * 4 + 2] = 0.6 + rnd() * 0.8; seed[i * 4 + 3] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const U = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uHalf: { value: new THREE.Vector3(BOX / 2, def.h / 2, BOX / 2) } };
  const tex = canvasTex(TEX[def.sprite]);
  const mat = makeMaterial(kind, def, tex, U);
  const pts = new THREE.Points(geo, mat);
  pts.name = 'ambient-' + kind;
  pts.frustumCulled = false; pts.matrixAutoUpdate = false; pts.renderOrder = 2;
  pts.layers.set(core.NO_REFLECT_LAYER);
  pts.userData.count = n;
  scene.add(pts);
  return {
    object: pts, count: n,
    update(dt, t) {
      U.uTime.value = t;
      followPoint(center); center.y += def.yOff;
      U.uCenter.value.copy(center);
    },
    dispose() { scene.remove(pts); geo.dispose(); mat.dispose(); tex.dispose(); },
  };
}

const moonDir = new THREE.Vector3();
function buildMoon(scene, theme) {
  const m = theme?.sun?.moon;
  if (!m) return null;
  const o = (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
  const dirArr = Array.isArray(m) ? m : (o.dir || theme.sun.dir || [-0.4, 0.7, 0.5]);
  const dir = new THREE.Vector3().fromArray(dirArr).normalize();
  const tex = canvasTex(TEX.moon, 256);
  const mat = new THREE.SpriteMaterial({ map: tex, color: o.color ?? 0xffffff, fog: false, depthWrite: false, transparent: true, toneMapped: false });
  const spr = new THREE.Sprite(mat);
  const size = o.size ?? 70;   // sprite size at 320 m (disc ≈ 1/3 of it → ≈ 4°)
  spr.scale.set(size, size, 1); spr.name = 'moon'; spr.renderOrder = -1; spr.frustumCulled = false;
  scene.add(spr);
  return {
    update() { moonDir.copy(dir).multiplyScalar(320); spr.position.copy(core.camera.position).add(moonDir); },
    dispose() { scene.remove(spr); mat.dispose(); tex.dispose(); },
  };
}

/** Factory shared by every registered name: particles (if any) + moon (if theme.sun.moon). */
function factoryFor(kind) {
  return (scene, quality, theme) => {
    const parts = [];
    if (kind && KINDS[kind]) { const p = buildParticles(kind, scene, quality); if (p) parts.push(p); }
    const moon = buildMoon(scene, theme); if (moon) parts.push(moon);
    if (!parts.length) return null;
    let disposed = false;
    const sys = {
      kind, parts,
      get count() { return parts.reduce((s, p) => s + (p.count || 0), 0); },
      update(dt, t) { if (disposed) return; for (let i = 0; i < parts.length; i++) parts[i].update(dt, t); },
      dispose() {
        if (disposed) return; disposed = true;
        un?.();
        for (const p of parts) { try { p.dispose(); } catch (e) { console.warn('[ambientfx] dispose', e); } }
        parts.length = 0;
      },
    };
    const un = bus.on('level:unloaded', () => sys.dispose());
    sys.update(0, core.time.now);   // place it before the first render
    return sys;
  };
}

export const KIND_NAMES = Object.keys(KINDS);
let inited = false;
export function init() {
  if (inited) return; inited = true;
  core.registerParticles('none', factoryFor(null));   // moon-only themes
  for (const k of KIND_NAMES) core.registerParticles(k, factoryFor(k));
}
