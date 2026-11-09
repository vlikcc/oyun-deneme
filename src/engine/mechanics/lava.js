// Mechanic 'lava' — L.lava(x, top, z, w, d, opts) — a glowing pool that burns, and the lava sea (GDD §3.3).
// install(L, ctx) attaches L.lava(...); ctx = { scene, player, physics, enemies, fx, audio, assets, world }.
//
// L.lava(x, top, z, w, d, { color = 0xff5a1f, glow = 0xffb060, speed = 0.08, scale = 4, bubbles }) →
//     { mesh, trigger, bubbles, material, top, setLevel(y) }
//   x, top, z  centre of the pool surface (world metres); w × d its size along x / z.
//   color      molten base colour; glow the hot highlight colour; speed the flow speed (noise cells / s);
//   scale      metres per noise cell / crust tile; bubbles = bubble count override (default by area and tier).
//   Visual: a plane with a ShaderMaterial (two scrolling value-noise octaves mixing the `rock_boulder_cracked` crust
//   texture with emissive orange, fogged, tone-mapped); low tier: MeshBasicMaterial with the crust texture, UV scroll and a
//   pulsing colour. Bubbles: one InstancedMesh of glowing domes per pool (grow → pop), render layer NO_REFLECT.
//   Collider: none — a L.trigger({x, z, y: top − 1, w, h: 1.25, d}) calls physics.hazard('lava') (sfx `lava_bubble_pop`,
//   plus `fire_crackle_loop` for 0.4 s); while the player is invulnerable it respawns instead (same rule as lava water,
//   ARCHITECTURE §14), so nobody is ever left standing in lava. A `surface: 'lava'` floor under it is optional.
//   setLevel(y) moves the surface, the bubbles and the trigger together (volkan's eruption).
//   Nearby pools also play a soft `lava_bubbles_small` loop whose gain follows the distance to the closest pool.
//
// Lava sea: core.registerWaterKind('lava', …) at module load → theme.water = { kind: 'lava', color, glow, speed, level }
// builds a 900 m plane with the same material (no reflection pass). A pool whose options match the sea reuses the sea's
// material instance. E3 (physics.fellInWater) handles the fall ("Cız! Lav!").
import * as THREE from 'three';
import * as core from '../core.js';
import * as bus from '../bus.js';

export const name = 'lava';

export const DEFAULTS = { color: 0xff5a1f, glow: 0xffb060, speed: 0.08, scale: 4 };
const CRUST = 'rock_boulder_cracked_diff.jpg';
const BURN_SFX = 'lava_bubble_pop', CRACKLE = 'fire_crackle_loop', CRACKLE_T = 0.4, NEAR_LOOP = 'lava_bubbles_small';
const NEAR_R = 8;                       // metres from a pool edge where the bubbling loop starts
const TIME = { value: 0 };              // one clock uniform shared by every lava ShaderMaterial (time.now)

// ---------------------------------------------------------------- material
const VERT = /* glsl */`
varying vec2 vW;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = /* glsl */`
uniform float uTime;
uniform float uSpeed;
uniform float uScale;
uniform vec3 uColor;
uniform vec3 uGlow;
uniform sampler2D uCrust;
varying vec2 vW;
#include <fog_pars_fragment>
// sin-free hash (stable on mobile GPUs far from the origin: the sea is 900 m wide)
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  vec2 p = vW / uScale;
  float t = uTime * uSpeed;
  float n1 = vnoise(p * 1.3 + vec2(t, t * 0.55));              // octave 1: big slow plates
  float n2 = vnoise(p * 3.1 + vec2(-t * 1.6, t * 0.8));        // octave 2: smaller, faster, other direction
  float n = n1 * 0.65 + n2 * 0.35;
  vec3 crust = texture2D(uCrust, p * 0.35 + vec2(t * 0.3, t * 0.12) + (n - 0.5) * 0.08).rgb;
  float lum = dot(crust, vec3(0.299, 0.587, 0.114));
  float heat = clamp(n * 1.3 - lum * 1.1 + 0.18, 0.0, 1.0);   // cracks (dark texels) and noise crests are molten
  float molten = smoothstep(0.36, 0.56, heat);
  vec3 crustCol = crust * (uColor * 0.25 + vec3(0.05, 0.025, 0.02));
  float pulse = 0.9 + 0.1 * sin(uTime * 1.7 + n * 6.2831);
  vec3 hot = mix(uColor, uGlow, smoothstep(0.6, 0.95, heat)) * pulse;
  gl_FragColor = vec4(mix(crustCol, hot, molten), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function norm(o = {}) {
  return {
    color: o.color ?? DEFAULTS.color, glow: o.glow ?? o.emissive ?? DEFAULTS.glow,
    speed: o.speed ?? DEFAULTS.speed, scale: o.scale ?? DEFAULTS.scale,
  };
}
const keyOf = (o, tier) => `${o.color}|${o.glow}|${o.speed}|${o.scale}|${tier === 'low' ? 'low' : 'shader'}`;

/** makeMaterial(opts, tier, assets) → the lava material (ShaderMaterial, or MeshBasicMaterial on the low tier). The crust
 *  texture comes from the shared assets cache (never disposed, never mutated here). */
export function makeMaterial(opts, tier, assets) {
  const o = norm(opts);
  const crust = assets.loadTex(CRUST, { srgb: true, rep: 1 });
  let m;
  if (tier === 'low') {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(o.color).lerp(new THREE.Color(o.glow), 0.3).multiplyScalar(1.7), map: crust, fog: true });
    m.userData.lava = { kind: 'basic', base: m.color.clone(), speed: o.speed, scale: o.scale };
  } else {
    m = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: TIME, uSpeed: { value: o.speed }, uScale: { value: o.scale },
        uColor: { value: new THREE.Color(o.color) }, uGlow: { value: new THREE.Color(o.glow) }, uCrust: { value: crust },
      },
      vertexShader: VERT, fragmentShader: FRAG, fog: true,
    });
    m.userData.lava = { kind: 'shader', speed: o.speed, scale: o.scale };
  }
  m.name = 'lava';
  return m;
}

// Low tier: the plane's UVs are metres / scale; scrolling rewrites the 4 UVs (no shared texture offset is touched).
function prepUV(geo, w, d, scale) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / scale, uv.getY(i) * d / scale);
  geo.userData.uvBase = Float32Array.from(uv.array);
  uv.needsUpdate = true;
}
function animateBasic(mat, geo, t) {
  const L = mat.userData.lava;
  if (!L || L.kind !== 'basic') return;
  mat.color.copy(L.base).multiplyScalar(0.88 + 0.12 * Math.sin(t * 1.7));                  // the "emissive" pulse
  const base = geo?.userData.uvBase; if (!base) return;
  const ou = (t * L.speed * 0.9) % 1, ov = (t * L.speed * 0.5) % 1;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, base[i * 2] + ou, base[i * 2 + 1] + ov);
  uv.needsUpdate = true;
}

// ---------------------------------------------------------------- lava sea (theme.water.kind === 'lava')
let sea = null;   // { key, mat, mesh } of the live sea (pools with the same options reuse `mat`)
/** Factory for core.registerWaterKind('lava'): a 900 m plane, no reflection pass. */
export function seaFactory(opts = {}, { quality, assets }) {
  const o = norm(opts), tier = quality?.tier ?? 'high', level = opts.level ?? -1.2, size = opts.size ?? 900;
  const geo = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
  const mat = makeMaterial(o, tier, assets);
  if (tier === 'low') prepUV(geo, size, size, o.scale * 3);   // bigger tiles far away: less visible repetition
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'lava-sea'; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.position.y = level; mesh.userData.level = level; mesh.userData.lavaSea = true;
  const rec = { key: keyOf(o, tier), mat, mesh };
  sea = rec;
  return {
    object: mesh,
    update(dt, t) {
      TIME.value = t;
      mesh.position.y = level + Math.sin(t * 0.5) * 0.04;
      animateBasic(mat, geo, t);
    },
    dispose() {
      geo.dispose(); mat.dispose();
      if (sea === rec) sea = null;
    },
  };
}
core.registerWaterKind('lava', seaFactory);

// ---------------------------------------------------------------- pools
// tiny local PRNG (bubble placement only; never touches the level's L.rnd() stream, identical on every tier)
function prng(seed) { let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
const BUBBLE_BUDGET = { high: 1, medium: 0.6, low: 0.35 };
const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();

// per-level state (materials by key, pool list, near-loop dynamic)
const perLevel = new WeakMap();

function crackle(audio) {
  const loop = audio.playLoop(CRACKLE, { id: 'lava:burn', bus: 'sfx', fadeIn: 0.03, vol: 0.7 });
  if (loop) setTimeout(() => audio.stopLoop('lava:burn', 0.15), CRACKLE_T * 1000);
}

export function install(L, ctx) {
  const { physics, audio, player } = ctx;
  const tier = L.quality?.tier ?? core.quality.tier;

  function state() {
    let s = perLevel.get(L);
    if (s) return s;
    s = { mats: new Map(), pools: [], nearT: 0, nearGain: -1 };
    perLevel.set(L, s);
    audio.ensure?.([BURN_SFX, CRACKLE, NEAR_LOOP]);
    // decoded on demand for this level; dropped again when it unloads (the bus listener is one-shot and untracked
    // on purpose: world.unload runs L._track.unsubs before it emits 'level:unloaded')
    bus.once('level:unloaded', () => { audio.stopLoop('lava:near', 0.2); audio.release?.([CRACKLE, NEAR_LOOP]); });
    // one dynamic per level: shared clock + the proximity bubbling loop (gain by distance to the closest pool edge)
    L.dynamic({
      update(dt, t) {
        TIME.value = t;
        if ((s.nearT -= dt) > 0) return;
        s.nearT = 0.1;
        let dist = Infinity;
        for (const p of s.pools) {
          const dx = Math.max(Math.abs(player.pos.x - p.x) - p.w / 2, 0), dz = Math.max(Math.abs(player.pos.z - p.z) - p.d / 2, 0);
          const dy = Math.max(player.pos.y - p.top - 1, p.top - 1 - player.pos.y, 0);
          dist = Math.min(dist, Math.hypot(dx, dy, dz));
        }
        const gain = physics.sim.playing ? Math.max(0, 1 - dist / NEAR_R) * 0.8 : 0;
        if (gain > 0.01 && !audio.isLooping('lava:near') && audio.playLoop(NEAR_LOOP, { id: 'lava:near', bus: 'sfx', fadeIn: 0.4, gain: 0.0001 })) s.nearGain = -1;
        if (audio.isLooping('lava:near') && Math.abs(gain - s.nearGain) > 0.02) { s.nearGain = gain; audio.setLoopGain('lava:near', gain, 0.25); }
      },
      dispose() { s.pools.length = 0; },
    });
    return s;
  }
  function materialFor(o) {
    const key = keyOf(o, tier);
    if (sea && sea.key === key) return { mat: sea.mat, shared: true };            // same options as the lava sea: reuse it
    const s = state();
    if (!s.mats.has(key)) s.mats.set(key, L.own(makeMaterial(o, tier, L.assets)));
    return { mat: s.mats.get(key), shared: false };
  }

  L.lava = function lava(x, top, z, w, d, opts = {}) {
    const o = norm(opts);
    const s = state();
    const { mat } = materialFor(o);
    const geo = L.own(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2));
    if (tier === 'low') prepUV(geo, w, d, o.scale);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'lava-pool'; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.position.set(x, top, z);
    L.add(mesh);

    // bubbles: glowing domes that swell and pop (one InstancedMesh = 1 draw call)
    const n = Math.max(0, Math.round(opts.bubbles ?? Math.min(28, Math.max(5, (w * d) / 4)) * (BUBBLE_BUDGET[tier] ?? 1)));
    let im = null, list = [];
    if (n > 0) {
      const bgeo = L.own(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2));
      const bmat = L.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(o.glow).lerp(new THREE.Color(o.color), 0.35), fog: true }));
      im = new THREE.InstancedMesh(bgeo, bmat, n);
      im.name = 'lava-bubbles'; im.castShadow = false; im.receiveShadow = false;
      im.position.set(x, top, z);
      im.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Math.hypot(w, d) / 2 + 1);
      L.smallLayer(im);
      L.add(im);
      const r = prng(x * 73.1 + z * 19.7 + top * 7 + w * d);
      const ix = Math.max(0.1, w / 2 - 0.4), iz = Math.max(0.1, d / 2 - 0.4);
      const spawn = (b, first) => {
        b.x = (r() * 2 - 1) * ix; b.z = (r() * 2 - 1) * iz;
        b.life = 0.9 + r() * 1.3; b.r = 0.12 + r() * 0.22;
        b.age = first ? -r() * 2.5 : -r() * 0.6;              // stagger (negative age = waiting below the surface)
      };
      for (let i = 0; i < n; i++) { const b = {}; spawn(b, true); list.push(b); }
      const write = () => {
        for (let i = 0; i < n; i++) {
          const b = list[i];
          let sc = 0;
          if (b.age > 0) {
            const k = b.age / b.life;
            sc = k < 0.85 ? b.r * (0.3 + 0.7 * (k / 0.85)) : b.r * (1 + (k - 0.85) * 3) * (1 - (k - 0.85) / 0.15);   // swell → pop
          }
          s3.set(Math.max(sc, 1e-4), Math.max(sc * 0.7, 1e-4), Math.max(sc, 1e-4));
          m4.compose(v3.set(b.x, -0.02, b.z), q0, s3);
          im.setMatrixAt(i, m4);
        }
        im.instanceMatrix.needsUpdate = true;
      };
      write();
      L.dynamic({
        acc: 0,
        update(dt) {
          this.acc += dt;
          if (this.acc < 1 / 60) return;                     // the fixed step is 120 Hz; bubbles only need 60
          const step = this.acc; this.acc = 0;
          for (const b of list) { b.age += step; if (b.age >= b.life) spawn(b, false); }
          write();
        },
        dispose() { list = []; },
      });
    }

    // burn: hazard('lava') when it can fire; invulnerable (just hurt / just respawned) → plain respawn (§14 rule)
    const burn = () => {
      if (!physics.sim.playing) return;
      if (physics.hazard('lava', player.pos, { sfxKey: BURN_SFX })) crackle(audio);
      else physics.respawn();
    };
    const trigger = L.trigger({ x, z, y: top - 1, w, h: 1.25, d }, { onEnter: burn, onStay: burn });

    // low tier: scroll this pool's UVs + pulse (the shader tier animates through the shared TIME uniform)
    if (tier === 'low') L.dynamic({ update(dt, t) { animateBasic(mat, geo, t); }, dispose() {} });

    const pool = {
      lava: true, mesh, trigger, bubbles: im, material: mat, x, z, w, d, top, opts: o,
      setLevel(y) {
        pool.top = y;
        mesh.position.y = y; mesh.updateMatrixWorld();
        if (im) { im.position.y = y; im.updateMatrixWorld(); }
        trigger.box.y = y - 1;
      },
    };
    s.pools.push(pool);
    return pool;
  };
}

export default { name, install, makeMaterial, seaFactory, DEFAULTS };
