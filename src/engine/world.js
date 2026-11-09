// Level builder `L` (ARCHITECTURE §6), level load/unload, per-frame world update, collectibles, checkpoints, portal.
import * as THREE from 'three';
import { scene, quality, applyTheme, flags } from './core.js';
import * as core from './core.js';
import * as assets from './assets.js';
import * as physics from './physics.js';
import { player, colliders, solidMeshes, movers, sim, WATER_Y } from './physics.js';
import * as enemiesMod from './enemies.js';
import * as fx from './fx.js';
import * as audio from './audio.js';
import * as cameraApi from './camera.js';
import { install as installMechanics } from './mechanics/index.js';
import * as bus from './bus.js';

function shade(m, cast = true) { m.castShadow = cast; m.receiveShadow = true; return m; }
const toV3 = (v) => (v?.isVector3 ? v.clone() : new THREE.Vector3(v[0], v[1], v[2]));
const NO_REFLECT = 1;   // render layer for small decorations: drawn by the camera + shadow pass, skipped by the water reflection pass

// Box faces: +x,-x,+y,-y,+z,-z — stretch each face's 0..1 UVs to its metre size (one texture tile = `scale` metres)
function scaleBoxUVs(geo, w, h, d) {
  const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]); }
  uv.needsUpdate = true;
}
function scaleCylUVs(geo, r, h) {
  const uv = geo.attributes.uv, n = geo.attributes.normal, circ = Math.PI * 2 * r;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(n.getY(i)) > 0.99) uv.setXY(i, (uv.getX(i) - 0.5) * 2 * r, (uv.getY(i) - 0.5) * 2 * r);
    else uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * h);
  }
  uv.needsUpdate = true;
}
// Re-order an indexed geometry's triangles so every target material is one contiguous group (one draw call each).
// map[oldMaterialIndex] = newMaterialIndex. BoxGeometry has 6 groups (6 draw calls with a material array); after
// regroup(geo, [0,0,1,0,0,0]) it has 2 (sides, top). CylinderGeometry: 3 → regroup(geo, [0,1,0]) → 2.
function regroup(geo, map) {
  const idx = geo.index.array, buckets = new Map();
  for (const g of geo.groups) { const m = map[g.materialIndex] ?? 0; if (!buckets.has(m)) buckets.set(m, []); buckets.get(m).push(idx.subarray(g.start, g.start + g.count)); }
  const out = new (idx.constructor)(idx.length);
  geo.clearGroups();
  let start = 0;
  for (const [m, parts] of [...buckets].sort((a, b) => a[0] - b[0])) {
    let n = 0;
    for (const p of parts) { out.set(p, start + n); n += p.length; }
    geo.addGroup(start, n, m); start += n;
  }
  geo.setIndex(new THREE.BufferAttribute(out, 1));
  return geo;
}
// Footstep sample set for a collider (§11): by the top material role / theme override / surface.
const STEP_BY_ROLE = { ground: 'grass', cliff: 'stone', stone: 'stone', accent: 'sand', wood: 'stone', boulder: 'stone' };
function stepsFor(role, surface) {
  if (surface === 'ice') return 'snow';
  const def = typeof role === 'string' ? core.theme?.materials?.[role] : role;
  if (def?.steps) return def.steps;
  if (def?.tex && /snow/.test(def.tex)) return 'snow';
  if (def?.tex && /sand|gravel|coast/.test(def.tex)) return 'sand';
  return STEP_BY_ROLE[role] ?? (typeof role === 'string' ? 'grass' : 'stone');
}

// ---------------------------------------------------------------- shared (never disposed) geometry/materials
const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16).rotateX(Math.PI / 2);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0x6b4a00, metalness: 0.6, roughness: 0.3, envMapIntensity: 0.4 });   // low IBL keeps the coins gold under a bright sky
const crystalGeo = new THREE.OctahedronGeometry(0.75, 0);
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,230,140,.6)'); g.addColorStop(1, 'rgba(255,200,80,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const flowerGeo = new THREE.ConeGeometry(0.18, 0.35, 5);
const grassGeo = new THREE.ConeGeometry(0.12, 0.5, 4);
const rockLowGeo = new THREE.DodecahedronGeometry(1, 1);
const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
const cloudM4 = new THREE.Matrix4();
const flagGeo = new THREE.PlaneGeometry(1, 0.65, 4, 1);
const poleGeo = new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6);
const knobGeo = new THREE.SphereGeometry(0.13, 8, 6);
const RING_COLORS = [0xff5e5e, 0xffa94d, 0xffe066, 0x69db7c, 0x4dabf7, 0x9775fa];
const TREE_HEIGHT = { oak: 5.5, pine: 6, palm: 5 };   // metres at scale 1 for the GLB kinds (assets/models/tree_<kind>.glb)

// ---------------------------------------------------------------- state
export let level = null;
export let L = null;
export const coins = [], crystals = [], checkpoints = [], triggers = [], dynamics = [], signs = [], clouds = [];
export const portal = { group: null, core: null, open: false, pos: new THREE.Vector3() };
export const status = { built: false, coinsTotal: 0, errors: [] };
let currentCheckpoint = null;
let coinIM = null;          // one InstancedMesh for every coin of the level (world.update writes the matrices)

// Signals (§7): world.emit('switch', id) / world.on('switch', id, fn); subscriptions die with the level.
export function emit(name, id, ...args) { bus.emit(`signal:${name}:${id}`, ...args); }
export function on(name, id, fn) { const un = bus.on(`signal:${name}:${id}`, fn); L?._track.unsubs.push(un); return un; }

// ---------------------------------------------------------------- builder
function makeBuilder(lv, seedValue) {
  const track = { objects: [], geometries: [], materials: [], textures: [], colliders: [], lights: [], unsubs: [], props: [], flowers: [], rocks: [], trees: new Map(), propBatches: new Map(), propCount: 0, propWarned: false, pending: [], lightCount: 0, disposed: false };
  let seed = seedValue;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const own = (g) => { if (g?.isBufferGeometry) track.geometries.push(g); else if (g?.isMaterial) track.materials.push(g); else if (g?.isTexture) track.textures.push(g); return g; };
  const add = (o) => { scene.add(o); track.objects.push(o); return o; };
  const resolveMat = (m, fallbackRole) => (m === undefined || m === null) ? assets.pbr(fallbackRole) : (typeof m === 'number' ? assets.flat(m) : assets.pbr(m));
  // → { side, top, topRole } (topRole: the role string / inline def the top resolved from, null for flat colours)
  const sideTop = (opts, defSide, defTop) => {
    const mat = opts.mat;
    let side, top, topRole = null;
    if (typeof mat === 'string' || mat?.isMaterial) { side = resolveMat(mat, defSide); top = resolveMat(mat, defTop); topRole = typeof mat === 'string' ? mat : null; }
    else {
      side = mat?.side !== undefined ? resolveMat(mat.side, defSide) : (mat?.color ?? opts.color) !== undefined ? assets.flat(mat?.color ?? opts.color) : assets.pbr(defSide);
      if (mat?.top !== undefined) { top = resolveMat(mat.top, defTop); topRole = typeof mat.top === 'number' || mat.top?.isMaterial ? null : mat.top; }
      else if ((mat?.topColor ?? opts.topColor) !== undefined) top = assets.flat(mat?.topColor ?? opts.topColor);
      else { top = assets.pbr(defTop); topRole = defTop; }
    }
    return { side, top, topRole };
  };
  // noSolid: the collider is registered (for L.remove / bookkeeping) but the player walks through it and the camera
  // ignores it; raycast:false keeps a solid collider out of the camera/blob raycast list (tree trunks, like the original).
  const registerCollider = (c, mesh, { noSolid = false, raycast = true } = {}) => {
    c.delta = new THREE.Vector3(); c.surface ??= (c.bounce ? 'bounce' : 'normal'); c.mesh = mesh ?? null; c.level = lv.id;
    if (mesh) mesh.userData.collider = c;   // lets physics.probeMeshes() drop the mesh from camera/shadow probes when c.solid = false
    c.raycast = raycast;                     // physics.setSolid(c, true) only re-adds the mesh to solidMeshes when raycast !== false
    if (noSolid) { c.noSolid = true; c.solid = false; }   // physics also honours `collider.solid = false` set later (fading platforms)
    colliders.push(c); track.colliders.push(c);
    if (mesh && raycast && !noSolid) solidMeshes.push(mesh);
    return c;
  };

  // Small objects (enemies, crystals) go on core.NO_REFLECT_LAYER (E8): drawn by the camera and the shadow pass, skipped
  // by the water mirror camera (layer 0 only).
  const smallLayer = (o) => { o?.traverse?.((k) => k.layers.set(NO_REFLECT)); return o; };
  const enemyLayer = (e) => { if (e?.group) smallLayer(e.group); return e; };
  const L = {
    level: lv, scene, quality, theme: () => core.theme, player, colliders, enemies: enemiesMod, physics, fx, audio, assets,
    rnd, own, add, _track: track, cam: cameraApi.cam, smallLayer,
    emit, on,

    // -------------------------------------------------- terrain
    box(x, top, z, w, d, h, opts = {}) {
      const geo = own(regroup(new THREE.BoxGeometry(w, h, d), [0, 0, 1, 0, 0, 0]));
      scaleBoxUVs(geo, w, h, d);
      const { side, top: topM, topRole } = sideTop(opts, 'cliff', 'ground');
      const mesh = shade(new THREE.Mesh(geo, [side, topM]), opts.castShadow ?? true);
      mesh.position.set(x, top - h / 2, z);
      add(mesh);
      const c = { type: 'box', min: new THREE.Vector3(x - w / 2, top - h, z - d / 2), max: new THREE.Vector3(x + w / 2, top, z + d / 2), bounce: opts.bounce ?? 0, surface: opts.surface, tags: opts.tags, x, z, top, w, d, h };
      c.steps = opts.steps ?? stepsFor(topRole, opts.surface);
      return registerCollider(c, mesh, { noSolid: opts.noSolid });
    },
    cyl(x, top, z, r, h, opts = {}) {
      const seg = opts.seg ?? 28;
      const geo = own(regroup(new THREE.CylinderGeometry(r, r * (opts.taper ?? 0.92), h, seg), [0, 1, 0]));
      scaleCylUVs(geo, r, h);
      const { side: sideM, top: topM, topRole } = sideTop({ ...opts, color: opts.side ?? opts.color }, 'cliff', 'ground');
      const mesh = shade(new THREE.Mesh(geo, [sideM, topM]), opts.castShadow ?? true);
      mesh.position.set(x, top - h / 2, z);
      add(mesh);
      const c = { type: 'cyl', x, z, r, y0: top - h, y1: top, bounce: opts.bounce ?? 0, surface: opts.surface, tags: opts.tags, top, h };
      c.steps = opts.steps ?? stepsFor(topRole, opts.surface);
      return registerCollider(c, mesh, { noSolid: opts.noSolid });
    },
    island(x, top, z, r, h, opts = {}) {
      const main = L.cyl(x, top, z, r, h, { seg: opts.seg ?? Math.max(24, Math.round(r * 1.6)), mat: opts.mat });
      if (opts.beach ?? true) L.cyl(x, top - 0.8, z, r + 5, 2.5, { mat: 'accent', seg: opts.beachSeg ?? Math.max(32, Math.round(r * 2)), noSolid: opts.beachSolid === false });
      if (opts.rocks) L.scatter('rocks', { center: [x, z], rMin: r - 1, rMax: r + 2, count: opts.rocks, y: top - 0.8 });
      if (opts.trees) L.scatter('trees', { center: [x, z], rMin: 3, rMax: r - 2, count: opts.trees, kind: opts.treeKind ?? 'procedural', margin: 2.5 });
      if (opts.flowers) L.scatter('flowers', { center: [x, z], rMin: 2, rMax: r - 1, count: opts.flowers, y: top });
      return main;
    },
    /** mover(a, b, period, w, d, opts): a↔b oscillation (a, b = top-centre positions). E6: a mechanic may set `m.fn = (t) =>
     *  Vector3|[x,y,z]` (top-centre at time t, seconds since load; orbiter/bob/pathMover) which replaces a↔b; `m.stopped = true`
     *  freezes it (delta 0). Riders are carried through `m.delta` either way. */
    mover(a, b, period, w = 3, d = 3, opts = {}) {
      a = toV3(a); b = toV3(b);
      const c = L.box(a.x, a.y, a.z, w, d, 0.7, { color: 0xffd36e, topColor: 0xff9f43, steps: 'stone', ...opts });
      c.mesh.castShadow = true;
      Object.assign(c, { a, b, period, t: 0, w, d, h: 0.7, mover: true });
      movers.push(c);
      return c;
    },
    bouncePad(x, top, z, r, strength = 27) {
      return L.cyl(x, top, z, r, 0.6, { side: 0x7a4fd1, topColor: 0xff6fd8, seg: 16, bounce: strength });
    },

    // -------------------------------------------------- collectibles
    // Coins are one InstancedMesh per level (built after build(), rebuilt automatically when coins are added later).
    coin(x, y, z) {
      const c = { coin: true, pos: new THREE.Vector3(x, y, z), taken: false, t: 0, popT: -1, i: coins.length };
      coins.push(c); return c;
    },
    coinLine(a, b, n) { const out = []; for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : i / (n - 1); out.push(L.coin(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)); } return out; },
    coinRing(x, y, z, r, n) { const out = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push(L.coin(x + Math.cos(a) * r, y, z + Math.sin(a) * r)); } return out; },
    coinArc(a, b, n, height = 2) { const out = []; for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : i / (n - 1); out.push(L.coin(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + height * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t)); } return out; },
    crystal(x, y, z, color = 0xffd23f) {
      const g = new THREE.Group();
      const m = new THREE.Mesh(crystalGeo, own(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.1, flatShading: true })));
      m.scale.y = 1.4; m.castShadow = true;
      const glow = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
      glow.scale.setScalar(3.2);
      g.add(glow, m); g.position.set(x, y, z); smallLayer(g); add(g);
      const c = { group: g, gem: m, base: y, taken: false, color };
      crystals.push(c); return c;
    },
    checkpoint(x, y, z, opts = {}) {
      const active = opts.active ?? checkpoints.length === 0;
      const g = new THREE.Group();
      const pole = shade(new THREE.Mesh(poleGeo, assets.flat(0xeeeeee))); pole.position.y = 1.3;
      const flagMat = own(new THREE.MeshStandardMaterial({ color: active ? 0x5be37d : 0xff6f6f, side: THREE.DoubleSide, flatShading: true }));
      const flag = new THREE.Mesh(flagGeo, flagMat); flag.position.set(0.5, 2.25, 0); flag.castShadow = true;
      const knob = new THREE.Mesh(knobGeo, assets.flat(0xffc93c)); knob.position.y = 2.65;
      g.add(pole, flag, knob); g.position.set(x, y, z); add(g);
      const cp = { pos: new THREE.Vector3(x, y, z), group: g, flag, flagMat, active };
      checkpoints.push(cp);
      if (active) { currentCheckpoint = cp; player.checkpoint.copy(cp.pos); }
      return cp;
    },
    portal(x, y, z, opts = {}) {
      if (portal.group) { scene.remove(portal.group); }
      const g = new THREE.Group();
      RING_COLORS.forEach((c, i) => {
        const t = new THREE.Mesh(own(new THREE.TorusGeometry(2.3 - i * 0.16, 0.08, 6, 40)), own(new THREE.MeshStandardMaterial({ color: 0x777777, emissive: c, emissiveIntensity: 0 })));
        g.add(t);
      });
      const coreM = new THREE.Mesh(own(new THREE.CircleGeometry(1.4, 32)), own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide })));
      g.add(coreM);
      g.position.set(x, y, z); g.rotation.y = opts.rotY ?? 0;
      add(g);
      portal.group = g; portal.core = coreM; portal.open = false; portal.pos.set(x, y, z);
      return portal;
    },

    // -------------------------------------------------- enemies
    enemy(kind, ...args) { return enemyLayer(enemiesMod.spawn(kind, L, ...args)); },
    slime(x, y, z, roam = 4, color = 0x9b5de5) { return enemyLayer(enemiesMod.spawn('slime', L, x, y, z, roam, color)); },
    spiky(a, b, speed = 2.6) { return enemyLayer(enemiesMod.spawn('spiky', L, a, b, speed)); },

    // -------------------------------------------------- props & decoration
    /**
     * tree(x, z, { kind, scale, height, collide, y, rotY, r, y0, y1 }) — every kind consumes exactly two rnd() values
     * (variant, rotation) so swapping a kind never reshuffles the rest of a seeded build. GLB kinds (oak|pine|palm) are
     * batched: all trees of one kind become InstancedMeshes once the model loads (see finishBatches). `height` overrides
     * the kind's default height × scale; r / y0 / y1 are absolute collider overrides.
     */
    tree(x, z, opts = {}) {
      const { kind = 'procedural', scale: s = 1, collide = true, y = 0 } = opts;
      const variant = rnd(), rot = rnd() * 6, rotY = opts.rotY ?? rot;   // always two rnd() draws, even with an explicit rotY (§13)
      if (TREE_HEIGHT[kind]) {
        const height = opts.height ?? TREE_HEIGHT[kind] * s;
        const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; g.name = 'tree:' + kind;   // placeholder (no mesh of its own)
        let c = null;
        if (collide) c = registerCollider({ type: 'cyl', x, z, r: opts.r ?? 0.45 * s, y0: opts.y0 ?? y - 1, y1: opts.y1 ?? y + 2.6 * s, bounce: 0, tags: ['tree', kind] }, null);
        g.collider = c;
        if (!track.trees.has(kind)) track.trees.set(kind, []);
        track.trees.get(kind).push({ x, y, z, rotY, height, variant });
        return g;
      }
      // procedural (also 'birch' / 'dead' variants): trunk + 2 leaf blobs
      const g = new THREE.Group();
      const trunkMat = kind === 'birch' ? assets.flat(0xf1ece2) : kind === 'dead' ? assets.flat(0x6b4a2e) : assets.pbr('wood');
      const trunk = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.3 * s, 0.4 * s, 2 * s, 9)), trunkMat));
      trunk.position.y = s;
      const c1 = shade(new THREE.Mesh(own(new THREE.IcosahedronGeometry(1.6 * s, 0)), assets.flat(variant > 0.5 ? (kind === 'birch' ? 0x9ddc7a : 0x4fbf5a) : (kind === 'birch' ? 0xb7e68a : 0x3fae6a))));
      c1.position.y = 2.8 * s;
      const c2 = shade(new THREE.Mesh(own(new THREE.IcosahedronGeometry(1.1 * s, 0)), assets.flat(0x6fd36a)));
      c2.position.set(0.5 * s, 3.8 * s, 0.2 * s);
      g.add(trunk); if (kind !== 'dead') g.add(c1, c2); else trunk.scale.y = 1.6;
      g.position.set(x, y, z); g.rotation.y = rotY;
      add(g);
      let c = null;
      if (collide) c = registerCollider({ type: 'cyl', x, z, r: opts.r ?? 0.45 * s, y0: opts.y0 ?? y - 1, y1: opts.y1 ?? y + 2.2 * s, bounce: 0, tags: ['tree'] }, trunk, { raycast: false });
      g.collider = c;
      return g;
    },
    rock(x, z, opts = {}) {
      const { kind = 'low', scale: s = 1, y = -0.8, rot = null } = opts;
      if (kind === 'boulder_01') return L.prop('boulder_01', x, y, z, { scale: s, rotY: rot ? rot[1] : rnd() * 6, collide: opts.collide ?? 'cyl', r: 0.7 * s, h: 1.1 * s });
      // 'low' rocks are batched into one InstancedMesh after build (see finishBatches)
      const r = { rock: true, x, y, z, s, rot: rot ? [...rot] : [rnd(), rnd(), rnd()], i: track.rocks.length };
      track.rocks.push(r);
      return r;
    },
    flower(x, y, z, color) { track.flowers.push({ x, y, z, color }); return track.flowers.length - 1; },
    prop(name, x, y, z, opts = {}) {
      const { scale: s = 1, rotY = 0, collide = null, tint = null, fitHeight = null, solid = false } = opts;
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; g.name = 'prop:' + name;
      add(g);
      let c = null;
      if (collide === 'cyl') c = registerCollider({ type: 'cyl', x, z, r: opts.r ?? 0.5 * s, y0: y + (opts.y0 ?? -0.5), y1: y + (opts.h ?? 1 * s), bounce: 0, tags: ['prop', name] }, null);
      else if (collide === 'box') { const w = opts.w ?? s, d = opts.d ?? s, h = opts.h ?? s; c = registerCollider({ type: 'box', min: new THREE.Vector3(x - w / 2, y, z - d / 2), max: new THREE.Vector3(x + w / 2, y + h, z + d / 2), bounce: 0, surface: opts.surface, tags: ['prop', name], x, z, top: y + h, w, d, h, steps: opts.steps ?? 'stone' }, null); }
      g.collider = c;
      const p = assets.model(name).then((m) => {
        if (track.disposed) return null;
        const k = fitHeight && m.userData.bbox?.height ? fitHeight / m.userData.bbox.height : s;
        m.scale.setScalar(k);
        if (tint !== null) m.traverse((o) => { if (o.isMesh) { o.material = own(o.material.clone()); o.material.color.multiply(new THREE.Color(tint)); } });
        if (opts.castShadow === false) m.traverse((o) => { if (o.isMesh) o.castShadow = false; });
        g.add(m);
        if (c) { c.mesh = m; m.userData.collider = c; }
        if (solid) m.traverse((o) => { if (o.isMesh) { if (c) o.userData.collider = c; solidMeshes.push(o); track.props.push(o); } });
        return m;
      }).catch(() => null);
      g.loaded = p; track.pending.push(p);
      return g;
    },
    /** nearCollider(x, z, margin, keepClear=[[x,z,r]…]) — true when a platform/tree/pillar (not the big islands) is within margin */
    nearCollider(x, z, m, keepClear = []) {
      for (const c of colliders) {
        if (c.type === 'box' && x > c.min.x - m && x < c.max.x + m && z > c.min.z - m && z < c.max.z + m && c.max.y > 0.1 && c.max.y < 30) return true;
        if (c.type === 'cyl' && c.r < 20 && Math.hypot(x - c.x, z - c.z) < c.r + m) return true;
      }
      return keepClear.some(([kx, kz, r]) => Math.hypot(x - kx, z - kz) < r);
    },
    /**
     * scatter(kind, opts) — seeded placement around `center` avoiding colliders. kinds: 'flowers', 'grass', 'rocks',
     * 'trees' / 'trees:<oak|pine|palm|procedural|…>', and any kit model name ('prop:<name>' or the bare name, e.g.
     * 'bush_round'): ≥ 8 placements of one model become one InstancedMesh per model primitive (props: `fitHeight` metres
     * at scale 1, `tint`, `collide: 'cyl'` + `r`/`h` per unit scale, `castShadow`). Every kind counts toward
     * `quality.maxProps` per level: placements over the budget are dropped *after* the seeded loop, so the rnd() stream (and
     * every later placement) is identical on every tier.
     */
    scatter(kind, { center = [0, 0], rMin = 0, rMax = 10, count = 10, keepClear = [], margin = kind === 'trees' ? 2.5 : 0.6, y = 0, scale = [0.8, 1.4], colors = [0xff6f91, 0xffe066, 0xffffff, 0xa78bfa], kind: treeKind = 'procedural', ...propOpts } = {}) {
      const [cx, cz] = center;
      const placed = [];
      for (let tries = 0; tries < count * 20 && placed.length < count; tries++) {
        const a = rnd() * Math.PI * 2, r = rMin + rnd() * (rMax - rMin);
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (margin > 0 && L.nearCollider(x, z, margin, keepClear)) continue;
        if (margin <= 0 && keepClear.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr)) continue;
        placed.push({ x, z, s: scale[0] + rnd() * (scale[1] - scale[0]), rx: rnd(), ry: rnd() * 6, rz: rnd(), i: placed.length });
      }
      const room = Math.max(0, (quality.maxProps ?? Infinity) - track.propCount);
      if (placed.length > room) { if (!track.propWarned) { track.propWarned = true; console.warn(`[world] scatter: quality.maxProps ${quality.maxProps} reached (${quality.tier}), dropping ${placed.length - room} × ${kind}`); } placed.length = room; }
      track.propCount += placed.length;
      const base = kind.split(':');
      if (base[0] === 'trees' || base[0] === 'tree') { const k = base[1] ?? treeKind; return placed.map((p) => L.tree(p.x, p.z, { kind: k, scale: p.s, y })); }
      if (base[0] === 'flowers') { placed.forEach((p) => L.flower(p.x, y + 0.17, p.z, colors[p.i % colors.length])); return placed; }
      if (base[0] === 'rocks') return placed.map((p) => L.rock(p.x, p.z, { kind: 'low', scale: p.s, y, rot: [p.rx, p.ry, p.rz] }));
      if (base[0] === 'grass') {
        if (placed.length >= 8) {
          const im = new THREE.InstancedMesh(grassGeo, assets.flat(0x5fc24a), placed.length); im.castShadow = false; im.receiveShadow = true; im.layers.set(NO_REFLECT);
          const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
          placed.forEach((p, i) => { e.set(0, p.ry, 0); q.setFromEuler(e); v.set(p.x, y + 0.25, p.z); const k = p.s * 0.8; sc.set(k, k, k); m4.compose(v, q, sc); im.setMatrixAt(i, m4); });
          im.instanceMatrix.needsUpdate = true;
          add(im);
          return im;
        }
        return placed.map((p) => { const m = new THREE.Mesh(grassGeo, assets.flat(0x5fc24a)); m.position.set(p.x, y + 0.25, p.z); m.scale.setScalar(p.s * 0.8); m.rotation.y = p.ry; m.layers.set(NO_REFLECT); add(m); return m; });
      }
      // kit model props
      const name = base[0] === 'prop' ? base.slice(1).join(':') : kind;
      if (!name) { console.warn('[world] scatter: unknown kind', kind); return placed; }
      const { collide = null, r: pr = 0.4, h: ph = 1, fitHeight = null, tint = null, castShadow = true } = propOpts;
      if (placed.length < 8) return placed.map((p) => L.prop(name, p.x, y, p.z, { scale: p.s, rotY: p.ry, collide, r: pr * p.s, h: ph * p.s, fitHeight: fitHeight ? fitHeight * p.s : null, tint, castShadow }));
      const key = `${name}|${tint ?? ''}|${castShadow ? 1 : 0}`;
      if (!track.propBatches.has(key)) track.propBatches.set(key, { name, tint, castShadow, list: [] });
      const batch = track.propBatches.get(key);
      return placed.map((p) => {
        const c = collide === 'cyl' ? registerCollider({ type: 'cyl', x: p.x, z: p.z, r: pr * p.s, y0: y - 0.5, y1: y + ph * p.s, bounce: 0, tags: ['prop', name] }, null) : null;
        const rec = { x: p.x, y, z: p.z, rotY: p.ry, s: p.s, fitHeight, collider: c, propBatch: name };
        batch.list.push(rec);
        return rec;
      });
    },
    /** camHint(box, yaw): while the player is inside `box` ({x, y, z, w, h, d} like L.trigger) the camera is offered `yaw`
     *  (cam.suggest = {yaw, until}); it eases there whenever the look input has been idle for 1.2 s. Returns the trigger. */
    camHint(box, yaw) {
      const set = () => { cameraApi.cam.suggest = { yaw, until: performance.now() + 400 }; };
      return L.trigger(box, { onEnter: set, onStay: set });
    },
    clouds(n = 14, opts = {}) {
      // one InstancedMesh for all puffs (4 per cloud); each cloud drifts along +x in world.update
      const im = new THREE.InstancedMesh(cloudGeo, assets.flat(0xffffff, { roughness: 1 }), n * 4);
      im.castShadow = false; im.receiveShadow = false; im.frustumCulled = false;
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const puffs = [];
        for (let k = 0; k < 4; k++) puffs.push({ s: 2 + rnd() * 2, x: k * 2.4 - 3.6, y: rnd(), z: rnd() * 1.5 });   // same rnd() order as the original build
        const a = rnd() * Math.PI * 2, r = (opts.rMin ?? 40) + rnd() * (opts.rSpread ?? 70);
        const c = { mesh: im, first: i * 4, puffs, position: new THREE.Vector3(Math.cos(a) * r, (opts.yMin ?? 22) + rnd() * (opts.ySpread ?? 18), Math.sin(a) * r) };
        clouds.push(c);
        puffs.forEach((p, k) => { m4.makeScale(p.s, p.s, p.s).setPosition(c.position.x + p.x, c.position.y + p.y, c.position.z + p.z); im.setMatrixAt(c.first + k, m4); });
      }
      im.instanceMatrix.needsUpdate = true;
      add(im);
      return clouds;
    },
    sign(x, y, z, text, opts = {}) {
      const g = new THREE.Group();
      const post = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 7)), assets.pbr('wood'))); post.position.y = 0.8;
      const plank = shade(new THREE.Mesh(own(new THREE.BoxGeometry(1.5, 0.7, 0.12)), assets.pbr('wood'))); plank.position.y = 1.55;
      const arrow = new THREE.Mesh(own(new THREE.ConeGeometry(0.2, 0.3, 4)), assets.flat(0xffe066)); arrow.position.set(0, 1.55, 0.09); arrow.rotation.x = Math.PI / 2;
      g.add(post, plank, arrow);
      // speech bubble: canvas sprite that fades in when the player is near
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 192;
      const cx = cv.getContext('2d');
      cx.fillStyle = 'rgba(255,248,232,0.96)'; cx.strokeStyle = '#2b2140'; cx.lineWidth = 10;
      cx.beginPath(); cx.roundRect(8, 8, 496, 150, 32); cx.fill(); cx.stroke();
      cx.beginPath(); cx.moveTo(236, 158); cx.lineTo(276, 158); cx.lineTo(256, 186); cx.closePath(); cx.fillStyle = '#2b2140'; cx.fill();
      cx.fillStyle = '#2b2140'; cx.font = '800 36px "Trebuchet MS", system-ui, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      const lines = String(text).split('\n'); lines.forEach((ln, i) => cx.fillText(ln, 256, 84 + (i - (lines.length - 1) / 2) * 42));
      const tex = own(new THREE.CanvasTexture(cv)); tex.colorSpace = THREE.SRGBColorSpace;
      const bubble = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false })));
      bubble.scale.set(4, 1.5, 1); bubble.position.y = 3.1; bubble.renderOrder = 5; bubble.layers.set(NO_REFLECT);
      g.add(bubble);
      g.position.set(x, y, z); g.rotation.y = opts.rotY ?? 0;
      add(g);
      const s = { group: g, bubble, pos: new THREE.Vector3(x, y, z), text, range: opts.range ?? 4.5, near: false };
      signs.push(s);
      return s;
    },
    light(x, y, z, color = 0xffffff, intensity = 1, dist = 10) {
      const light = new THREE.PointLight(color, intensity, dist, 2);
      light.position.set(x, y, z);
      track.lightCount++;
      if (track.lightCount <= quality.maxLights) add(light); else light.userData.culled = true;
      track.lights.push(light);
      return light;
    },
    trigger(box, { onEnter, onStay, onExit, once = false } = {}) {
      const t = { box: { ...box }, onEnter, onStay, onExit, once, inside: false, done: false, trigger: true };
      triggers.push(t);
      return t;
    },
    dynamic(d) {
      if (!d || typeof d.update !== 'function') throw new Error('L.dynamic needs {update(dt, t)}');
      d.dynamic = true; dynamics.push(d);
      return d;
    },
    remove(c) {
      if (!c) return;
      if (c.trigger) { const i = triggers.indexOf(c); if (i >= 0) triggers.splice(i, 1); return; }
      if (c.dynamic) { const i = dynamics.indexOf(c); if (i >= 0) { dynamics.splice(i, 1); c.dispose?.(); } return; }
      if (c.coin) { c.taken = true; c.popT = 99; return; }
      if (c.propBatch) { if (c.collider) L.remove(c.collider); c.collider = null; return; }   // instanced scatter prop: collider only (like GLB trees)
      if (c.type === 'box' || c.type === 'cyl') {
        let i = colliders.indexOf(c); if (i >= 0) colliders.splice(i, 1);
        i = movers.indexOf(c); if (i >= 0) movers.splice(i, 1);
        for (let k = solidMeshes.length - 1; k >= 0; k--) if (solidMeshes[k] === c.mesh || solidMeshes[k].userData?.collider === c) solidMeshes.splice(k, 1);
        if (c.mesh) {
          // the mesh may be a child of a tree/prop Group (trunk, loaded GLB): remove the owning group, not just the child
          const owner = (c.tags?.includes('tree') || c.tags?.includes('prop')) && c.mesh.parent && c.mesh.parent !== scene ? c.mesh.parent : c.mesh;
          owner.removeFromParent();
        }
        if (player.ground === c) { physics.setGround(null); player.grounded = false; }   // fires onLeave (§13)
        return;
      }
      if (c.isObject3D) { scene.remove(c); if (c.collider) L.remove(c.collider); return; }
      if (c.group?.isObject3D) { scene.remove(c.group); c.taken = true; }
    },
    spawnParticles(pos, n, color, opts) { fx.burst(pos?.isVector3 ? pos : new THREE.Vector3(pos[0], pos[1], pos[2]), n, color, opts); },
    toast(text, secs = 1.6) { bus.emit('toast', text, secs); },
    sfx(key, ...args) { audio.play(key, ...args); },
  };
  return L;
}

// ---------------------------------------------------------------- batches built after build(): flowers, low rocks, GLB trees, coins
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3(), c4 = new THREE.Color();
function finishBatches(track) {
  if (track.flowers.length) {
    const list = track.flowers;
    const im = new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }), list.length);
    L.own(im.material); im.layers.set(NO_REFLECT); im.receiveShadow = true;
    list.forEach((f, i) => { m4.makeTranslation(f.x, f.y, f.z); im.setMatrixAt(i, m4); im.setColorAt(i, c4.set(f.color)); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    L.add(im);
  }
  if (track.rocks.length) {
    const im = new THREE.InstancedMesh(rockLowGeo, assets.pbr('boulder'), track.rocks.length); im.castShadow = true; im.receiveShadow = true;
    track.rocks.forEach((r, i) => { e4.set(r.rot[0], r.rot[1], r.rot[2]); q4.setFromEuler(e4); v4.set(r.x, r.y, r.z); s4.setScalar(r.s); m4.compose(v4, q4, s4); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true;
    L.add(im);
  }
  for (const [kind, list] of track.trees) {
    const p = assets.model('tree_' + kind).then((model) => {
      if (track.disposed) return null;
      const bh = model.userData.bbox?.height || 1;
      model.updateMatrixWorld(true);
      const parts = [];
      model.traverse((o) => { if (o.isMesh) parts.push(o); });
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        im.castShadow = true; im.receiveShadow = true; im.name = `trees:${kind}:${part.name}`;
        list.forEach((t, i) => { const k = t.height / bh; e4.set(0, t.rotY, 0); q4.setFromEuler(e4); v4.set(t.x, t.y, t.z); s4.setScalar(k); m4.compose(v4, q4, s4).multiply(part.matrixWorld); im.setMatrixAt(i, m4); });
        im.instanceMatrix.needsUpdate = true;
        L.add(im);
      }
      return parts.length;
    }).catch((e) => { console.warn('[world] tree batch failed', kind, e); return null; });
    track.pending.push(p);
  }
  for (const [, b] of track.propBatches) {
    const p = assets.model(b.name).then((model) => {
      if (track.disposed) return null;
      const bh = model.userData.bbox?.height || 1;
      model.updateMatrixWorld(true);
      const parts = [];
      model.traverse((o) => { if (o.isMesh) parts.push(o); });
      for (const part of parts) {
        let mat = part.material;
        if (b.tint !== null && b.tint !== undefined) { mat = L.own(mat.clone()); mat.color.multiply(c4.set(b.tint)); }
        const im = new THREE.InstancedMesh(part.geometry, mat, b.list.length);
        im.castShadow = b.castShadow; im.receiveShadow = true; im.name = `props:${b.name}:${part.name}`;
        b.list.forEach((t, i) => { const k = t.fitHeight ? (t.fitHeight * t.s) / bh : t.s; e4.set(0, t.rotY, 0); q4.setFromEuler(e4); v4.set(t.x, t.y, t.z); s4.setScalar(k); m4.compose(v4, q4, s4).multiply(part.matrixWorld); im.setMatrixAt(i, m4); });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        L.add(im);
      }
      return parts.length;
    }).catch((e) => { console.warn('[world] prop batch failed', b.name, e); return null; });
    track.pending.push(p);
  }
  syncCoinMesh();
}
function syncCoinMesh() {
  if (!L) return;
  if (coinIM && coinIM.userData.capacity >= coins.length) { coinIM.count = coins.length; return; }
  if (coinIM) { scene.remove(coinIM); coinIM.dispose(); }
  const cap = Math.max(16, coins.length + 16);
  coinIM = new THREE.InstancedMesh(coinGeo, coinMat, cap);
  coinIM.userData.capacity = cap; coinIM.count = coins.length; coinIM.castShadow = true; coinIM.frustumCulled = false; coinIM.layers.set(NO_REFLECT); coinIM.name = 'coins';
  scene.add(coinIM);
  updateCoinMatrices(0, 0);
}
function updateCoinMatrices(dt, t) {
  if (!coinIM) return;
  for (const c of coins) {
    if (c.taken && c.popT < 0) c.popT = 0;
    if (c.taken) {
      if (c.popT > 0.35) { m4.makeScale(0, 0, 0); coinIM.setMatrixAt(c.i, m4); continue; }
      c.popT += dt;
      const k = Math.max(0.01, 1 - c.popT / 0.35);
      e4.set(0, t * 3 + c.popT * 25, 0); q4.setFromEuler(e4); v4.set(c.pos.x, c.pos.y + c.popT * 6, c.pos.z); s4.setScalar(k);
    } else { e4.set(0, t * 3, 0); q4.setFromEuler(e4); v4.copy(c.pos); s4.setScalar(1); }
    m4.compose(v4, q4, s4); coinIM.setMatrixAt(c.i, m4);
  }
  coinIM.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- load / unload
const mechanicsCtx = () => ({ scene, player, physics, enemies: enemiesMod, fx, audio, assets, world: worldApi });

/** load(levelModule, {seed}) — synchronous build; props/tree batches keep loading afterwards (whenReady()). Returns L. */
export function load(lv, { seed = 7 } = {}) {
  unload();
  level = lv;
  status.built = false; status.errors = []; status.coinsTotal = 0;
  const th = applyTheme(lv.theme);
  // E3: the death line + its kind. theme.water → waterY = deathY ?? -1, kind 'lava' | 'water' (other registered sea kinds
  // count as water); theme.water null + theme.fall {y, kind} → waterY = killY = fall.y, kind = fall.kind ?? 'cloud';
  // theme.water null without fall → no water death, void below theme.killY ?? -60 (physics.fellInVoid).
  if (th.water) {
    sim.waterY = th.water.deathY ?? WATER_Y;
    sim.waterKind = th.water.kind === 'lava' ? 'lava' : 'water';
    sim.killY = th.killY ?? -60;
  } else if (th.fall) {
    sim.waterY = sim.killY = th.fall.y ?? -30;
    sim.waterKind = th.fall.kind ?? 'cloud';
  } else { sim.waterY = null; sim.waterKind = 'water'; sim.killY = th.killY ?? -60; }
  physics.reset(lv.spawn ?? [0, 0.1, 22], lv.spawnFacing ?? Math.PI);
  enemiesMod.reseed(flags.test ? 99 : (Date.now() & 0xffff) + 1);
  fx.clear();
  L = makeBuilder(lv, seed);
  installMechanics(L, mechanicsCtx());
  try { lv.build(L); }
  catch (e) { console.error('[world] build failed', e); status.errors.push('build: ' + (e?.message || e)); }
  finishBatches(L._track);
  if (th.clouds && clouds.length === 0 && !lv.noAutoClouds) L.clouds(14);
  if (!checkpoints.length) { L.checkpoint(player.spawn.x + 2.2, player.spawn.y - 0.1, player.spawn.z - 1, { active: true }); }
  if (!currentCheckpoint) { currentCheckpoint = checkpoints[0]; currentCheckpoint.active = true; currentCheckpoint.flagMat.color.set(0x5be37d); player.checkpoint.copy(currentCheckpoint.pos); }
  if (lv.crystals != null && crystals.length !== lv.crystals) { const msg = `level ${lv.id}: expected ${lv.crystals} crystals, built ${crystals.length}`; console.error('[world]', msg); status.errors.push(msg); }
  lv.coinsTotal = status.coinsTotal = coins.length;
  audio.setAmbience(th.ambience || []);
  if (!flags.test) audio.setMusic(th.music ?? null);
  cameraApi.reset(lv.camYaw ?? 0, lv.camPitch ?? 0.42);
  scene.updateMatrixWorld(true);   // raycast probes (camera snap, groundBelow) read matrixWorld before the first render
  cameraApi.snap();
  status.built = true;
  bus.emit('level:loaded', lv);
  return L;
}
/** whenReady() → Promise that resolves when every async prop / tree batch of the current level has loaded. */
export function whenReady() { return L ? Promise.all([...L._track.pending]).then(() => true) : Promise.resolve(false); }

export function unload() {
  if (!L) { level = null; return; }
  const t = L._track; t.disposed = true;
  const th = core.theme;
  for (const d of dynamics) { try { d.dispose?.(); } catch (e) { console.warn(e); } }
  dynamics.length = 0; triggers.length = 0; signs.length = 0; clouds.length = 0;
  for (const un of t.unsubs) un();
  enemiesMod.clear(); fx.clear();
  for (const o of t.objects) { scene.remove(o); if (o.isInstancedMesh) o.dispose(); }
  for (const g of t.geometries) g.dispose();
  for (const m of t.materials) m.dispose();
  for (const x of t.textures) x.dispose();
  for (const l of t.lights) { scene.remove(l); l.dispose?.(); }
  if (coinIM) { scene.remove(coinIM); coinIM.dispose(); coinIM = null; }
  coins.length = 0; crystals.length = 0; checkpoints.length = 0; currentCheckpoint = null;
  portal.group = null; portal.core = null; portal.open = false;
  physics.clearWorld();
  audio.stopLoops();
  audio.release([...(th?.ambience || []), ...(th?.music ? [th.music] : [])]);   // §11: theme loops are decoded per level
  audio.releaseLevelMusic();                                                         // tracks switched to with audio.playMusic
  bus.emit('level:unloaded', level);
  L = null; level = null; status.built = false;
}

// ---------------------------------------------------------------- per-step (fixed 120 Hz) & per-frame updates
const tmp = new THREE.Vector3();
/** step(dt, t, input): movers → dynamics → physics.stepPlayer → triggers. Called from the fixed-step loop. */
export function step(dt, t, input) {
  for (const m of movers) {
    if (m.stopped) { m.delta.set(0, 0, 0); continue; }
    m.t += dt;
    const prev = tmp.copy(m.mesh.position);
    if (m.fn) {                                         // E6: function mover (orbiter / bob / pathMover) → top-centre position
      const f = m.fn(m.t);
      if (f?.isVector3) m.mesh.position.copy(f); else m.mesh.position.set(f[0], f[1], f[2]);
    } else {
      const k = (1 - Math.cos((m.t / m.period) * Math.PI * 2)) / 2;
      m.mesh.position.lerpVectors(m.a, m.b, k);
    }
    m.mesh.position.y -= m.h / 2;
    m.delta.subVectors(m.mesh.position, prev);
    m.min.set(m.mesh.position.x - m.w / 2, m.mesh.position.y - m.h / 2, m.mesh.position.z - m.d / 2);
    m.max.set(m.mesh.position.x + m.w / 2, m.mesh.position.y + m.h / 2, m.mesh.position.z + m.d / 2);
    m.mesh.updateMatrixWorld();     // keep raycast probes in sync with the mover between renders
  }
  for (const d of [...dynamics]) { try { d.update(dt, t); } catch (e) { console.error('[world] dynamic', e); } }
  physics.stepPlayer(dt, input);
  if (triggers.length) {
    const p = player.pos;
    for (const tr of [...triggers]) {
      if (tr.done) continue;
      const b = tr.box;
      const inX = Math.abs(p.x - b.x) <= b.w / 2, inZ = Math.abs(p.z - b.z) <= b.d / 2;
      const feetIn = p.y >= b.y && p.y <= b.y + b.h, centreIn = p.y + 0.7 >= b.y && p.y + 0.7 <= b.y + b.h;
      const inside = sim.playing && inX && inZ && (feetIn || centreIn);
      if (inside && !tr.inside) { tr.inside = true; tr.onEnter?.(player, tr); if (tr.once) { tr.done = true; const i = triggers.indexOf(tr); if (i >= 0) triggers.splice(i, 1); continue; } }
      else if (inside) tr.onStay?.(player, tr, dt);
      else if (!inside && tr.inside) { tr.inside = false; tr.onExit?.(player, tr); }
    }
  }
}

export function openPortal() {
  if (!portal.group || portal.open) return;
  portal.open = true; audio.sfx.portal();
  portal.group.children.forEach((r) => { if (r.material.emissive) r.material.color.set(0xffffff); });
  fx.burst(portal.pos.clone(), 40, 0xffffff, { speed: 6, up: 5, life: 1.2, grav: 3 });
  bus.emit('portal:open');
}
const pc = new THREE.Vector3();
/** update(dt, t): collectibles, checkpoints, bounce-pad springs, portal, signs, clouds, enemies. Per frame. */
export function update(dt, t) {
  const playing = sim.playing;
  pc.copy(player.pos).add(new THREE.Vector3(0, 0.7, 0));
  if (coinIM && (coinIM.count !== coins.length || coinIM.userData.capacity < coins.length)) syncCoinMesh();
  for (const c of coins) {
    if (c.taken) continue;
    if (playing && c.pos.distanceToSquared(pc) < 1.2) {
      c.taken = true; c.popT = 0;
      player.coins++; audio.sfx.coin();
      if (player.coins % 25 === 0 && player.hearts < player.maxHearts) { player.hearts++; bus.emit('toast', '+1 ❤', 1); }
      bus.emit('hud'); bus.emit('coin', c);
    }
  }
  updateCoinMatrices(dt, t);
  const total = level?.crystals ?? crystals.length;
  for (const c of crystals) {
    if (c.taken) continue;
    c.group.position.y = c.base + Math.sin(t * 2) * 0.25;
    c.gem.rotation.y = t * 1.6;
    if (playing && c.group.position.distanceToSquared(pc) < 2.0) collectCrystal(c, total);
  }
  for (const cp of checkpoints) {
    cp.flag.rotation.y = Math.sin(t * 3 + cp.pos.x) * 0.25;
    if (!cp.active && playing && cp.pos.distanceTo(player.pos) < 2) {
      cp.active = true; cp.flagMat.color.set(0x5be37d); currentCheckpoint = cp; player.checkpoint.copy(cp.pos);
      audio.sfx.checkpoint(); bus.emit('toast', 'Kontrol noktası!', 1); bus.emit('checkpoint', cp);
      fx.burst(cp.pos.clone().add(new THREE.Vector3(0.5, 2.3, 0)), 12, 0x5be37d, { speed: 3, up: 3 });
    } else if (cp.active && cp !== currentCheckpoint && cp.pos.distanceTo(player.pos) < 2) { currentCheckpoint = cp; player.checkpoint.copy(cp.pos); }
  }
  // bounce pads spring back
  for (const c of colliders) if (c.bounce && c.mesh && c.mesh.scale.y < 1) c.mesh.scale.y = Math.min(1, c.mesh.scale.y + dt * 4);
  // portal
  if (portal.group) {
    portal.group.rotation.z += dt * (portal.open ? 1.5 : 0.2);
    if (portal.open) {
      portal.group.children.forEach((r, i) => { if (r.material.emissiveIntensity !== undefined) r.material.emissiveIntensity = 1.2 + Math.sin(t * 4 + i) * 0.4; });
      portal.core.material.opacity = 0.55 + Math.sin(t * 5) * 0.2;
      if (playing && portal.pos.distanceTo(pc) < 2.2) { sim.playing = false; bus.emit('win'); }
    }
  }
  for (const s of signs) {
    const near = s.pos.distanceTo(player.pos) < s.range;
    const want = near ? 1 : 0;
    s.bubble.material.opacity += (want - s.bubble.material.opacity) * Math.min(1, dt * 8);
    if (near !== s.near) { s.near = near; bus.emit('sign', s, near); }
  }
  if (clouds.length && dt > 0) {
    for (const c of clouds) {
      c.position.x += dt * 0.6; if (c.position.x > 120) c.position.x = -120;
      c.puffs.forEach((p, k) => { cloudM4.makeScale(p.s, p.s, p.s).setPosition(c.position.x + p.x, c.position.y + p.y, c.position.z + p.z); c.mesh.setMatrixAt(c.first + k, cloudM4); });
    }
    for (const m of new Set(clouds.map((c) => c.mesh))) m.instanceMatrix.needsUpdate = true;
  }
  enemiesMod.update(dt);
  level?.update?.(dt, t, L);
}
function collectCrystal(c, total) {
  c.taken = true; c.group.visible = false; player.crystals++;
  audio.sfx.crystal(); fx.hitStop(0.15); fx.addTrauma(0.25);
  fx.burst(c.group.position.clone(), 30, c.color, { speed: 6, up: 6, life: 1, grav: 6, size: 1.3 });
  bus.emit('hud'); bus.emit('crystal', c);
  if (player.crystals >= total) { openPortal(); bus.emit('toast', 'Tüm kristaller! Kapı açıldı! 🌈', 2.6); }
  else bus.emit('toast', `Güneş Kristali ${player.crystals}/${total}!`, 1.8);
}
/** Test hook: collect every crystal (opens the portal). */
export function collectAll() {
  const total = level?.crystals ?? crystals.length;
  for (const c of crystals) if (!c.taken) { c.taken = true; c.group.visible = false; player.crystals++; }
  player.crystals = Math.max(player.crystals, total);
  bus.emit('hud'); openPortal();
}
export function report() {
  return {
    coinsLeft: coins.filter((c) => !c.taken).length, crystalsLeft: crystals.filter((c) => !c.taken).length,
    enemiesAlive: enemiesMod.alive(), colliders: colliders.length, triggers: triggers.length, dynamics: dynamics.length,
    signs: signs.length, movers: movers.length, pending: L ? L._track.pending.length : 0, errors: [...status.errors],
  };
}

const worldApi = {
  get level() { return level; }, get L() { return L; }, coins, crystals, checkpoints, triggers, dynamics, signs, portal, status,
  load, unload, whenReady, step, update, openPortal, collectAll, report, emit, on,
};
export default worldApi;
