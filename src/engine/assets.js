// Texture / PBR material cache, HDRI loader, GLTF model cache (ARCHITECTURE §1, §5).
// Shared caches are never disposed; levels only dispose what they create through `L`.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const settings = { anisotropy: 4, hdriRes: '1k' };    // core.js sets both from the quality tier ('2k' on high)
const BASE = 'assets/';

// ---------------------------------------------------------------- textures
const texLoader = new THREE.TextureLoader();
const texCache = new Map();
export function loadTex(file, { srgb = false, rep = 1 } = {}) {
  const key = `${file}|${srgb}|${rep}`;
  if (texCache.has(key)) return texCache.get(key);
  const url = BASE + 'tex/' + file;
  // retry a couple of times: dev servers / flaky mobile networks occasionally drop a request
  let tries = 0;
  const onError = () => { if (++tries <= 2) setTimeout(() => texLoader.load(url, (fresh) => { t.image = fresh.image; t.needsUpdate = true; }, undefined, onError), 400 * tries); else console.warn('[assets] texture failed', file); };
  const t = texLoader.load(url, undefined, undefined, onError);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
  t.anisotropy = settings.anisotropy;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

// Which maps each Poly Haven / FreePBR texture set ships with (assets/tex). Default: diff + nor_gl + arm.
const TEX_INFO = {
  boulder: { arm: false, ao: true },
  oak: { arm: false, ao: true },
};
const pbrCache = new Map();
/** pbrTex(name, opts) → MeshStandardMaterial with diffuse/normal/ARM maps; UV tile = `scale` metres. Cached. */
export function pbrTex(name, { tint = 0xffffff, scale = 4, roughness = 1, normalScale = 1, envMapIntensity = 1 } = {}) {
  const key = `${name}|${tint}|${scale}|${roughness}|${normalScale}|${envMapIntensity}`;
  if (pbrCache.has(key)) return pbrCache.get(key);
  const info = { arm: true, ao: false, ...(TEX_INFO[name] || {}) };
  const rep = 1 / scale;
  const m = new THREE.MeshStandardMaterial({
    color: tint, roughness, metalness: 0, envMapIntensity,
    map: loadTex(`${name}_diff.jpg`, { srgb: true, rep }),
    normalMap: loadTex(`${name}_nor_gl.jpg`, { rep }), normalScale: new THREE.Vector2(normalScale, normalScale),
  });
  if (info.arm) { const a = loadTex(`${name}_arm.jpg`, { rep }); m.aoMap = a; m.roughnessMap = a; m.metalnessMap = a; }   // R=AO G=rough B=metal
  else if (info.ao) m.aoMap = loadTex(`${name}_ao.jpg`, { rep });
  m.userData.shared = true;
  pbrCache.set(key, m);
  return m;
}

// Flat-colour materials (the old `mat(color, opts)` helper), cached & shared.
const flatCache = new Map();
export function flat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  let m = flatCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...opts }); m.userData.shared = true; flatCache.set(key, m); }
  return m;
}

// Theme material roles (§5): ground / cliff / stone / accent + any extra role a theme defines.
let theme = null;
const DEFAULT_MATERIALS = {
  ground: { tex: 'aerial_grass_rock', tint: 0xe4ffc4, scale: 5, normalScale: 0.7, envMapIntensity: 1.2 },
  cliff: { tex: 'rock_face', tint: 0xe8ddd0, scale: 6 },
  stone: { tex: 'stone_tiles_02', tint: 0xfff2e0, scale: 3 },
  accent: { tex: 'coast_sand_01', tint: 0xffefc8, scale: 5, normalScale: 0.6 },
  boulder: { tex: 'boulder', scale: 1, roughness: 0.9 },
  wood: { tex: 'oak', scale: 1, roughness: 0.85, tint: 0xd9b48a },
};
export function setTheme(t) { theme = t; }
/** pbr(role | THREE.Material | {tex,...}) → the theme's material for that role (falls back to the defaults table). */
export function pbr(role) {
  if (role && role.isMaterial) return role;
  const def = typeof role === 'object' ? role : (theme?.materials?.[role] ?? DEFAULT_MATERIALS[role] ?? DEFAULT_MATERIALS.cliff);
  const { tex, ...opts } = def;
  return pbrTex(tex, opts);
}

// ---------------------------------------------------------------- HDRI
// Theme ids are Poly Haven ids: assets/hdri/<id>_2k.hdr is used on the high tier, <id>_1k.hdr otherwise (the other
// resolution, then <id>.hdr, are fallbacks — a fallback can 404 once in dev). Names that do not follow the pattern go in
// HDRI_FILES. assets/manifest.json → hdri lists which resolutions exist for each id.
const HDRI_FILES = {
  sky_2k: 'sky_2k.hdr',      // legacy copy of kloofendal_48d_partly_cloudy_puresky_2k.hdr
  sky: 'sky_2k.hdr',
};
const hdrCache = new Map();
export function loadHDRI(id, res = settings.hdriRes) {
  if (!id) return Promise.resolve(null);
  const key = `${id}|${res}`;
  if (hdrCache.has(key)) return hdrCache.get(key);
  const other = res === '2k' ? '1k' : '2k';
  const candidates = HDRI_FILES[id] ? [HDRI_FILES[id]] : [`${id}_${res}.hdr`, `${id}_${other}.hdr`, `${id}.hdr`];
  const loader = new HDRLoader();
  const tryNext = (i) => new Promise((resolve, reject) => {
    if (i >= candidates.length) return reject(new Error('HDRI not found: ' + id));
    loader.load(BASE + 'hdri/' + candidates[i], (tex) => { tex.mapping = THREE.EquirectangularReflectionMapping; resolve(tex); }, undefined, () => tryNext(i + 1).then(resolve, reject));
  });
  const p = tryNext(0).catch((e) => { console.warn('[assets]', e.message); hdrCache.delete(key); return null; });
  hdrCache.set(key, p);
  return p;
}

// ---------------------------------------------------------------- GLTF models
const gltfLoader = new GLTFLoader();
const modelCache = new Map();      // name → Promise<Group> (the master copy; model() returns clones)
export const MODEL_INFO = {        // known bounds (metres, model rests on y=0) – filled/overridden at load
};
function loadModel(name) {
  if (modelCache.has(name)) return modelCache.get(name);
  const p = new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = () => gltfLoader.load(BASE + 'models/' + name + '.glb', (gltf) => {
      const root = gltf.scene;
      root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material?.map) o.material.map.anisotropy = settings.anisotropy; } });
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      root.userData.bbox = { min: box.min.toArray(), max: box.max.toArray(), size: size.toArray(), height: size.y, radius: Math.max(size.x, size.z) / 2 };
      MODEL_INFO[name] = root.userData.bbox;
      resolve(root);
    }, undefined, (err) => { if (++tries <= 2) setTimeout(attempt, 400 * tries); else { console.warn('[assets] model failed', name, err); reject(err); } });
    attempt();
  });
  modelCache.set(name, p);
  return p;
}
/** model(name) → Promise<Group clone> (geometry/materials shared with the cache). `clone.userData.bbox` is set. */
export function model(name) {
  return loadModel(name).then((root) => { const c = root.clone(true); c.userData.bbox = root.userData.bbox; return c; });
}
export function modelInfo(name) { return MODEL_INFO[name] || null; }

export const assets = { settings, loadTex, pbrTex, flat, pbr, setTheme, loadHDRI, model, modelInfo, MODEL_INFO };
export default assets;
