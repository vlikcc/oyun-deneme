// Renderer, scene, camera, lights, sky/HDRI, fog, water, quality tiers, resize, time (ARCHITECTURE §3, §5).
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import * as assets from './assets.js';

export const params = new URLSearchParams(location.search);
// Touch-capable Windows/X11 laptops are not touch devices; iPadOS 13+ Safari sends a desktop 'Macintosh' UA but reports
// maxTouchPoints 5 (a real Mac reports 0), so a Macintosh UA with touch points is an iPad.
const isIPadOS = /Macintosh/.test(navigator.userAgent) && (navigator.maxTouchPoints > 1 || 'ontouchstart' in window);   // desktop Safari/Chrome on a Mac have neither
export const isTouchDevice = (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) && (isIPadOS || !/Macintosh|Windows NT|X11/.test(navigator.userAgent));
export const flags = {
  test: params.get('test') === '1',
  debug: params.get('debug') === '1',
  touch: params.get('touch') === '1' || isTouchDevice,
};

// ---------------------------------------------------------------- quality tiers
// GDD §5.2: shadows off on low (blob shadow only), reflection every 2nd frame on medium (reflectEvery), GL-wrapped draw
// budget per whole frame (drawBudget, checked by tools/smoke.mjs against core.stats().glDraws).
const TIERS = {
  high: { pixelRatio: 1.5, shadowMapSize: 2048, shadows: true, waterTex: 512, reflectEvery: 1, anisotropy: 8, maxProps: 400, maxParticles: 300, reflection: true, maxLights: 8, drawBudget: 900 },
  medium: { pixelRatio: 1.25, shadowMapSize: 1024, shadows: true, waterTex: 256, reflectEvery: 2, anisotropy: 4, maxProps: 250, maxParticles: 150, reflection: true, maxLights: 6, drawBudget: 500 },
  low: { pixelRatio: 1.0, shadowMapSize: 1024, shadows: false, waterTex: 0, reflectEvery: 0, anisotropy: 2, maxProps: 120, maxParticles: 60, reflection: false, maxLights: 4, drawBudget: 250 },
};
export const DRAW_BUDGET = { high: TIERS.high.drawBudget, medium: TIERS.medium.drawBudget, low: TIERS.low.drawBudget };
function detectTier() {
  const q = params.get('quality');
  if (q && TIERS[q]) return q;
  if (flags.touch) {
    // compat-audit C: pixels actually rendered at the medium DPR cap (1.25), not dpr×CSS px — an iPad Pro (2732×2048
    // physical) is ~3.3 Mpx at the cap and has a desktop-class GPU; old "dpr*w*h > 2.5e6" sent every big tablet to 'low'.
    const cap = Math.min(devicePixelRatio || 1, 1.25), px = innerWidth * innerHeight * cap * cap;
    const cores = navigator.hardwareConcurrency || 8, mem = navigator.deviceMemory || 8;   // deviceMemory: Chrome/Android only
    if (cores <= 4 || mem <= 3 || px > 4.2e6) return 'low';
    return 'medium';
  }
  return 'high';
}
export const quality = { tier: detectTier() };
Object.assign(quality, TIERS[quality.tier]);
assets.settings.anisotropy = quality.anisotropy;
assets.settings.hdriRes = quality.tier === 'high' ? '2k' : '1k';
assets.settings.texDir = quality.tier === 'high' || params.get('tex') === '1k' ? '' : '512/';   // compat-audit H   // §5: <id>_2k.hdr on high, <id>_1k.hdr otherwise

// ---------------------------------------------------------------- renderer / scene / camera
export const canvas = document.querySelector('#c') || (() => { const c = document.createElement('canvas'); c.id = 'c'; document.body.prepend(c); return c; })();
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = quality.shadows;   // low tier: no shadow pass at all (player.js keeps the blob shadow)
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;   // monolith: 1.05; re-tuned with environmentIntensity 0.35 for the HDRI/PBR pipeline (§14 impl note)
assets.settings.anisotropy = Math.min(quality.anisotropy, renderer.capabilities.getMaxAnisotropy());
// renderer.info counts a whole frame (shadow pass + water reflection pass + main pass): the Water reflection calls
// renderer.render() mid-frame, which would reset the counters with autoReset on. render() resets them instead.
renderer.info.autoReset = false;

// ---------------------------------------------------------------- GL-wrapped draw counter (GDD §5.2 / E8)
// renderer.info misses draws (nested Water.js render, shadow internals), so under ?debug=1 / ?test=1 every draw entry
// point of the WebGL context is wrapped and counted; core.render() resets the counter, core.stats().glDraws reads the
// last whole frame (shadow + reflection + main pass). multiDraw* count their `drawcount` argument.
const glCount = { on: false, cur: 0, last: 0, frames: 0 };
function wrapGL() {
  const gl = renderer.getContext();
  const wrap = (obj, name, n = () => 1) => {
    const f = obj?.[name]; if (typeof f !== 'function' || f.__counted) return;
    const w = function (...a) { glCount.cur += n(a); return f.apply(this, a); }; w.__counted = true; obj[name] = w;
  };
  for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) wrap(gl, name);
  const md = gl.getExtension('WEBGL_multi_draw');
  for (const name of ['multiDrawArraysWEBGL', 'multiDrawElementsWEBGL', 'multiDrawArraysInstancedWEBGL', 'multiDrawElementsInstancedWEBGL']) wrap(md, name, (a) => Number(a[a.length - 1]) || 0);
  const ia = gl.getExtension('ANGLE_instanced_arrays');   // WebGL1 path (unused on WebGL2, harmless)
  for (const name of ['drawArraysInstancedANGLE', 'drawElementsInstancedANGLE']) wrap(ia, name);
  glCount.on = true;
}
if (params.get('debug') === '1' || params.get('test') === '1') wrapGL();

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
// Layer 1 = small decorations (coins, flowers, grass, particles…): drawn by the camera and the shadow pass, skipped by
// the water reflection pass (Water.js renders with a fresh camera that only has layer 0).
export const NO_REFLECT_LAYER = 1;
camera.layers.enable(NO_REFLECT_LAYER);
export const hemi = new THREE.HemisphereLight(0xdff4ff, 0x6a8f4a, 0.8);
export const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
sun.castShadow = quality.shadows;   // low tier: shadows off (GDD §5.2)
sun.shadow.camera.layers.enable(NO_REFLECT_LAYER);
sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 140 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(hemi, sun, sun.target);
export const SUN_DIR = new THREE.Vector3(0.555, 0.743, 0.374);

export const time = { now: 0, dt: 0 };

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- sky
function gradientSky(top = '#4fb4ff', mid = '#a8e1ff', bottom = '#fff3d6') {
  const g = document.createElement('canvas'); g.width = 2; g.height = 256;
  const ctx = g.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top); grad.addColorStop(0.55, mid); grad.addColorStop(1, bottom);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(g); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const fallbackSky = gradientSky();
scene.background = fallbackSky;
scene.fog = new THREE.Fog(0xd6ecff, 90, 230);

// ---------------------------------------------------------------- ambient particle systems (§5 `particles`)
// Registry: name → factory(scene, quality, theme) => { update(dt, t), dispose() } | null. Fill it with
// core.registerParticles(name, factory) (src/engine/ambientfx.js does, at startup) — never by editing this file.
// Unknown / unregistered names are a silent no-op; a throwing factory or update is caught and logged as a warning.
export const AMBIENT_PARTICLES = {
  none: null, embers: null, snow: null, leaves: null, fireflies: null, sparkles: null,
};
let ambient = null;
/** registerParticles(name, factory) — factory(scene, quality, theme) → { update(dt, t), dispose() } | null. */
export function registerParticles(name, factory) {
  if (!name || (factory != null && typeof factory !== 'function')) { console.warn('[core] registerParticles: bad args', name); return; }
  AMBIENT_PARTICLES[name] = factory ?? null;
}

// ---------------------------------------------------------------- water
export let water = null;
let waterKind = null;
// Registry for non-water seas: kind → factory(opts, { scene, quality, assets, THREE }) → { object?: Object3D,
// update?(dt, t), dispose?() } | null. A registered kind wins over the built-in fallback ('lava' = flat emissive plane,
// 'cloud' = white cloud-sea plane). core adds `object` to the scene and removes + dispose()s it on the next setWater.
// Unknown kinds without a factory fall back to the built-in plane of that kind (or nothing). Errors are caught.
export const WATER_KINDS = {};
/** registerWaterKind(kind, factory) — see WATER_KINDS. Register at startup (ambientfx.js / a mechanic module). */
export function registerWaterKind(kind, factory) {
  if (!kind || kind === 'water' || (factory != null && typeof factory !== 'function')) { console.warn('[core] registerWaterKind: bad args', kind); return; }
  WATER_KINDS[kind] = factory ?? null;
}
let custom = null;        // { kind, inst } — the active registered-kind instance
let frameNo = 0;          // render() counter (reflection cadence)
/**
 * setWater(enabled, {kind, color, sunColor, level, distortion}) — the water mesh is created once per session and
 * re-themed on later calls (Water.js owns a reflection render target that cannot be disposed from outside, so rebuilding
 * it per level would leak one GPU texture per load). Disabled themes just hide it. kind: 'water' (default) | 'lava' |
 * 'cloud' | any kind registered with registerWaterKind.
 */
export let lava = null;   // built-in lava: a flat emissive plane (no reflection pass), kept for the session like the water
export let cloudSea = null;   // built-in cloud sea (theme.water null + theme.fall.kind 'cloud'), kept for the session
function hideAll() {
  if (lava) { scene.remove(lava); lava.visible = false; }
  if (cloudSea) { scene.remove(cloudSea); cloudSea.visible = false; }
  if (water) { scene.remove(water); water.visible = false; }
  if (custom) {
    const { inst } = custom; custom = null;
    try { if (inst?.object) scene.remove(inst.object); inst?.dispose?.(); } catch (e) { console.warn('[core] water kind dispose', e); }
  }
}
export function setWater(enabled, opts = {}) {
  hideAll();
  if (!enabled) return null;
  const { color = 0x1c8fd1, sunColor = 0xfff1d6, level = -1.2, distortion = 2.2, size = 900, kind = 'water' } = opts;
  if (kind !== 'water' && WATER_KINDS[kind]) {
    try {
      const inst = WATER_KINDS[kind](opts, { scene, quality, assets, THREE });
      if (inst) {
        custom = { kind, inst };
        if (inst.object) { inst.object.userData.level ??= level; inst.object.userData.kind = kind; if (!inst.object.parent) scene.add(inst.object); }
        return inst.object ?? null;
      }
    } catch (e) { console.warn('[core] water kind factory failed, using the built-in plane', kind, e); custom = null; }
  }
  if (kind === 'lava') {
    if (!lava) {
      const nm = assets.loadTex('waternormals.jpg', { rep: 40 });
      lava = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: 0xff6a1a, emissive: 0xff3a00, emissiveIntensity: 0.9, roughness: 0.6, metalness: 0, normalMap: nm, normalScale: new THREE.Vector2(0.5, 0.5) }));
      lava.rotation.x = -Math.PI / 2; lava.name = 'lava';
    }
    lava.material.color.set(opts.color ?? 0xff6a1a); lava.material.emissive.set(opts.emissive ?? 0xff3a00);
    lava.position.y = level; lava.userData.level = level; lava.userData.kind = 'lava'; lava.visible = true;
    scene.add(lava);
    return lava;
  }
  if (kind === 'cloud') {
    if (!cloudSea) {
      const nm = assets.loadTex('waternormals.jpg', { rep: 18 });
      cloudSea = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f0fa, emissiveIntensity: 0.55, roughness: 1, metalness: 0, normalMap: nm, normalScale: new THREE.Vector2(0.8, 0.8) }));
      cloudSea.rotation.x = -Math.PI / 2; cloudSea.name = 'cloud-sea'; cloudSea.receiveShadow = false;
    }
    cloudSea.material.color.set(opts.color ?? 0xffffff);
    cloudSea.position.y = level; cloudSea.userData.level = level; cloudSea.userData.kind = 'cloud'; cloudSea.visible = true;
    scene.add(cloudSea);
    return cloudSea;
  }
  if (kind !== 'water') console.warn('[core] unknown water kind (no factory registered), drawing plain water:', kind);
  if (water) {
    if (waterKind === 'reflect') {
      const u = water.material.uniforms;
      u.waterColor.value.set(color); u.sunColor.value.set(sunColor); u.distortionScale.value = distortion; u.sunDirection.value.copy(SUN_DIR);
    } else water.material.color.set(color);
    water.position.y = level; water.userData.level = level; water.visible = true;
    if (!water.parent) scene.add(water);
    return water;
  }
  const geo = new THREE.PlaneGeometry(size, size);
  if (quality.reflection) {
    water = new Water(geo, {
      textureWidth: quality.waterTex, textureHeight: quality.waterTex,
      waterNormals: assets.loadTex('waternormals.jpg'),
      sunDirection: SUN_DIR.clone(), sunColor, waterColor: color,
      distortionScale: distortion, fog: true, alpha: 0.96,
    });
    waterKind = 'reflect';
    // E8: the mirror camera (Water.js internal, default layers = mask 1 → layer 0 only) never sees NO_REFLECT_LAYER
    // objects; on medium (reflectEvery 2) the reflection re-renders every 2nd frame and keeps its last texture +
    // textureMatrix pair in between.
    const mirror = water.onBeforeRender;
    water.onBeforeRender = function (...a) { if (quality.reflectEvery > 1 && frameNo % quality.reflectEvery !== 0) return; mirror.apply(this, a); };
  } else {
    const nm = assets.loadTex('waternormals.jpg', { rep: 60 });
    water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.1, normalMap: nm, normalScale: new THREE.Vector2(0.6, 0.6), transparent: true, opacity: 0.94 }));
    waterKind = 'flat';
  }
  water.rotation.x = -Math.PI / 2; water.position.y = level;
  water.userData.level = level;
  scene.add(water);
  return water;
}
function updateWater(dt, t) {
  if (custom?.inst?.update) { try { custom.inst.update(dt, t); } catch (e) { console.warn('[core] water kind update', e); custom.inst.update = null; } }
  if (lava?.visible) { lava.position.y = lava.userData.level + Math.sin(t * 0.5) * 0.04; const nm = lava.material.normalMap; nm.offset.x += dt * 0.01; nm.offset.y += dt * 0.006; lava.material.emissiveIntensity = 0.8 + Math.sin(t * 1.7) * 0.15; }
  if (cloudSea?.visible) { const nm = cloudSea.material.normalMap; nm.offset.x += dt * 0.004; nm.offset.y += dt * 0.0025; }
  if (!water || !water.visible) return;
  water.position.y = water.userData.level + Math.sin(t * 0.8) * 0.06;
  if (waterKind === 'reflect') water.material.uniforms.time.value += dt * 0.5;
  else { const nm = water.material.normalMap; nm.offset.x += dt * 0.02; nm.offset.y += dt * 0.013; }
}

// ---------------------------------------------------------------- theme
export let theme = null;
let hdriToken = 0;
export const DEFAULT_THEME = {
  hdri: 'kloofendal_48d_partly_cloudy_puresky', hdriRotation: 0,
  environmentIntensity: 0.35, backgroundIntensity: 1.0,   // 0.35: the bright sky HDRI washes out flat colours above that
  sun: { dir: [0.555, 0.743, 0.374], color: 0xfff1d6, intensity: 2.6 },
  hemi: { sky: 0xdff4ff, ground: 0x6a8f4a, intensity: 0.8 },
  fog: { color: 0xd6ecff, near: 90, far: 230 },
  water: { color: 0x1c8fd1, sunColor: 0xfff1d6, level: -1.2, distortion: 2.2 },
  materials: {},
  ambience: [], music: null, particles: 'none', clouds: true,
};
export function applyTheme(t) {
  theme = { ...DEFAULT_THEME, ...(t || {}) };
  assets.setTheme(theme);
  const s = theme.sun || DEFAULT_THEME.sun;
  SUN_DIR.fromArray(s.dir || DEFAULT_THEME.sun.dir).normalize();
  sun.color.set(s.color ?? 0xfff1d6); sun.intensity = s.intensity ?? 2.6;
  const h = theme.hemi || DEFAULT_THEME.hemi;
  hemi.color.set(h.sky ?? 0xdff4ff); hemi.groundColor.set(h.ground ?? 0x6a8f4a); hemi.intensity = h.intensity ?? 0.8;
  const f = theme.fog || DEFAULT_THEME.fog;
  scene.fog = new THREE.Fog(f.color ?? 0xd6ecff, f.near ?? 90, f.far ?? 230);
  scene.backgroundIntensity = theme.backgroundIntensity ?? 1;
  scene.environmentIntensity = theme.environmentIntensity ?? 0.35;
  scene.backgroundRotation.set(0, theme.hdriRotation || 0, 0);
  scene.environmentRotation.set(0, theme.hdriRotation || 0, 0);
  // sky: gradient until the HDRI arrives (async, cached)
  scene.background = fallbackSky; scene.environment = null;
  const token = ++hdriToken;
  assets.loadHDRI(theme.hdri).then((tex) => { if (tex && token === hdriToken) { scene.background = tex; scene.environment = tex; } });
  // sea: theme.water (kind 'water' | 'lava' | registered kind), or theme.water null + theme.fall {y, kind:'cloud'} → a
  // cloud-sea plane 5 m under the fall line (world.load sets sim.waterY = sim.killY = fall.y, sim.waterKind = fall.kind).
  if (theme.water) setWater(true, theme.water);
  else if (theme.fall && (theme.fall.kind ?? 'cloud') !== 'void') setWater(true, { ...theme.fall, kind: theme.fall.kind ?? 'cloud', level: (theme.fall.y ?? -30) - 5 });
  else setWater(false);
  if (ambient) { try { ambient.dispose?.(); } catch (e) { console.warn('[core] particles dispose', e); } ambient = null; }
  const factory = AMBIENT_PARTICLES[theme.particles || 'none'];
  if (factory) { try { ambient = factory(scene, quality, theme) || null; } catch (e) { console.warn('[core] particles factory failed', theme.particles, e); ambient = null; } }
  return theme;
}

// ---------------------------------------------------------------- frame
export function render() {
  updateWater(time.dt, time.now);
  if (ambient?.update) { try { ambient.update(time.dt, time.now); } catch (e) { console.warn('[core] particles update', e); ambient = null; } }
  frameNo++;
  renderer.info.reset();
  glCount.cur = 0;
  renderer.render(scene, camera);
  glCount.last = glCount.cur; glCount.frames++;
}
/**
 * stats() → { calls, triangles, geometries, textures } from renderer.info (informational: whole frame, but it undercounts)
 * + glDraws (GL-wrapped draw calls of the last render(); null unless ?debug=1 / ?test=1) — the GDD §5.2 budget metric.
 */
export function stats() {
  const r = renderer.info.render, m = renderer.info.memory;
  return { calls: r.calls, triangles: r.triangles, geometries: m.geometries, textures: m.textures, glDraws: glCount.on ? glCount.last : null, glFrames: glCount.frames, drawBudget: quality.drawBudget, tier: quality.tier };
}

export const core = { renderer, scene, camera, sun, hemi, quality, applyTheme, setWater, render, time, flags, params, stats, registerParticles, registerWaterKind, AMBIENT_PARTICLES, WATER_KINDS, DRAW_BUDGET, NO_REFLECT_LAYER, get theme() { return theme; }, get water() { return water; }, get lava() { return lava; }, get cloudSea() { return cloudSea; }, get ambient() { return ambient; } };
export default core;
