// Renderer, scene, camera, lights, sky/HDRI, fog, water, quality tiers, resize, time (ARCHITECTURE §3, §5).
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import * as assets from './assets.js';

export const params = new URLSearchParams(location.search);
// Touch-capable Windows/X11 laptops are not touch devices; iPadOS 13+ Safari sends a desktop 'Macintosh' UA but reports
// maxTouchPoints 5 (a real Mac reports 0), so a Macintosh UA with touch points is an iPad.
const isIPadOS = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
export const isTouchDevice = (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) && (isIPadOS || !/Macintosh|Windows NT|X11/.test(navigator.userAgent));
export const flags = {
  test: params.get('test') === '1',
  debug: params.get('debug') === '1',
  touch: params.get('touch') === '1' || isTouchDevice,
};

// ---------------------------------------------------------------- quality tiers
const TIERS = {
  high: { pixelRatio: 1.5, shadowMapSize: 2048, waterTex: 512, anisotropy: 8, maxProps: 400, reflection: true, maxLights: 8 },
  medium: { pixelRatio: 1.25, shadowMapSize: 1024, waterTex: 256, anisotropy: 4, maxProps: 250, reflection: true, maxLights: 6 },
  low: { pixelRatio: 1.0, shadowMapSize: 1024, waterTex: 0, anisotropy: 2, maxProps: 120, reflection: false, maxLights: 4 },
};
function detectTier() {
  const q = params.get('quality');
  if (q && TIERS[q]) return q;
  if (flags.touch) {
    const px = (devicePixelRatio || 1) * innerWidth * innerHeight;
    if (px > 2.5e6 || (navigator.hardwareConcurrency || 8) <= 4) return 'low';
    return 'medium';
  }
  return 'high';
}
export const quality = { tier: detectTier() };
Object.assign(quality, TIERS[quality.tier]);
assets.settings.anisotropy = quality.anisotropy;
assets.settings.hdriRes = quality.tier === 'high' ? '2k' : '1k';   // §5: <id>_2k.hdr on high, <id>_1k.hdr otherwise

// ---------------------------------------------------------------- renderer / scene / camera
export const canvas = document.querySelector('#c') || (() => { const c = document.createElement('canvas'); c.id = 'c'; document.body.prepend(c); return c; })();
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;   // monolith: 1.05; re-tuned with environmentIntensity 0.35 for the HDRI/PBR pipeline (§14 impl note)
assets.settings.anisotropy = Math.min(quality.anisotropy, renderer.capabilities.getMaxAnisotropy());
// renderer.info counts a whole frame (shadow pass + water reflection pass + main pass): the Water reflection calls
// renderer.render() mid-frame, which would reset the counters with autoReset on. render() resets them instead.
renderer.info.autoReset = false;

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
// Layer 1 = small decorations (coins, flowers, grass, particles…): drawn by the camera and the shadow pass, skipped by
// the water reflection pass (Water.js renders with a fresh camera that only has layer 0).
export const NO_REFLECT_LAYER = 1;
camera.layers.enable(NO_REFLECT_LAYER);
export const hemi = new THREE.HemisphereLight(0xdff4ff, 0x6a8f4a, 0.8);
export const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
sun.castShadow = true;
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
// Table so other engineers can fill entries later: name → (scene, quality) => { update(dt, t), dispose() } | null
export const AMBIENT_PARTICLES = {
  none: null, embers: null, snow: null, leaves: null, fireflies: null, sparkles: null,
};
let ambient = null;

// ---------------------------------------------------------------- water
export let water = null;
let waterKind = null;
/**
 * setWater(enabled, {color, sunColor, level, distortion}) — the water mesh is created once per session and re-themed on
 * later calls (Water.js owns a reflection render target that cannot be disposed from outside, so rebuilding it per
 * level would leak one GPU texture per load). Disabled themes just hide it.
 */
export let lava = null;   // theme.water.kind === 'lava': a separate flat emissive plane (no reflection pass), kept like the water
export function setWater(enabled, opts = {}) {
  if (lava) { scene.remove(lava); lava.visible = false; }
  if (!enabled) { if (water) { scene.remove(water); water.visible = false; } return null; }
  const { color = 0x1c8fd1, sunColor = 0xfff1d6, level = -1.2, distortion = 2.2, size = 900, kind = 'water' } = opts;
  if (kind === 'lava') {
    if (water) { scene.remove(water); water.visible = false; }
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
  if (lava?.visible) { lava.position.y = lava.userData.level + Math.sin(t * 0.5) * 0.04; const nm = lava.material.normalMap; nm.offset.x += dt * 0.01; nm.offset.y += dt * 0.006; lava.material.emissiveIntensity = 0.8 + Math.sin(t * 1.7) * 0.15; }
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
  setWater(!!theme.water, theme.water || {});
  if (ambient) { ambient.dispose?.(); ambient = null; }
  const factory = AMBIENT_PARTICLES[theme.particles || 'none'];
  if (factory) ambient = factory(scene, quality);
  return theme;
}

// ---------------------------------------------------------------- frame
export function render() {
  updateWater(time.dt, time.now);
  ambient?.update?.(time.dt, time.now);
  renderer.info.reset();
  renderer.render(scene, camera);
}
/** stats() → draw calls / triangles of the last whole frame (all passes) + GPU resource counts. */
export function stats() { const r = renderer.info.render, m = renderer.info.memory; return { calls: r.calls, triangles: r.triangles, geometries: m.geometries, textures: m.textures }; }

export const core = { renderer, scene, camera, sun, hemi, quality, applyTheme, setWater, render, time, flags, params, stats, NO_REFLECT_LAYER, get theme() { return theme; }, get water() { return water; }, get lava() { return lava; } };
export default core;
