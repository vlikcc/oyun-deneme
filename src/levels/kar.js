// Island 3 — 'kar' · Kar Zirvesi (GDD §2.6). A snowfield with a frozen lake, a ski run and a three-tier summit.
// New toys: ice (L.ice) and crumble (ice skin). Enemies: 5 blue sliding slimes, 3 icicle spikies, 2 snowballs.
//
// Deviations from the GDD coordinates (each one forced by a contradiction or a §2.0 rule — see the notes inline):
//  * cabin moved to (13, 16): at (8, 16) its 6 × 5 footprint covered the spawn (6, 14);
//  * snowball lane runs (12, -1) → (21, 11) across the spawn → stairs / lake roads: the GDD lane (26, -8) → (14, -2) cut
//    through the east stair boxes;
//  * checkpoints (14, 7, -8) / (6, 14, -12) were just off the tier-1 / tier-2 rims → (11, 7, -6) / (4, 14, -11); the lake
//    checkpoint sits on the shore (20.5, 0, 5) instead of on the ice;
//  * ski run = 14 axis-aligned ice boxes in two straight legs (west, then south) with railed corners, ending into the bowl,
//    which moved from (-31, 10) to (-30.5, 7.5) so the run's last box empties straight onto it (no way-back stones needed:
//    the bowl touches the island; one stepping stone leads down);
//  * ice valley = axis-aligned trench (AABB walls cannot run diagonally) from (-11, 14) to (-21, 14) with the crystal
//    pillar at its closed end (-19.6, 14);
//  * giant pine at (16, -24) keeps its trunk; the branch ledge is outside the foliage (19.5, 6, -21) and the canopy nest
//    sits on the treetop (16, 12.5, -24).
//  * look (checked in screenshots): cliff = rock_face_03 (rock_wall_08 read as a dark brick wall on the round tiers),
//    summit / valley walls / lake + floe sides use the shared glossy ice material (marble_cliff_01 renders tan, not icy),
//    sun 2.2 and environment 0.5 (snow read grey at 1.6 / 0.35), 'wood' role = weathered_planks (cabin, rails, signs).
// Engine gaps worked around here: "sliding" slimes (momentum on the lake, level.update), icicle spikies (own materials),
// mushroom pads (recoloured bouncePad), ski-run downhill push (onStand on the ice boxes), summit blizzard ambience (trigger).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { iceMaterial } from '../engine/mechanics/ice.js';

const THEME = {
  hdri: 'snow_field_puresky',
  hdriRotation: 0,
  environmentIntensity: 0.5, backgroundIntensity: 1.0,
  sun: { dir: [0.3, 0.6, 0.5], color: 0xe8f0ff, intensity: 2.2 },
  hemi: { sky: 0xeaf2ff, ground: 0x9aa6b4, intensity: 0.9 },
  fog: { color: 0xe6edf5, near: 45, far: 150 },
  water: { color: 0x5fa8cc, sunColor: 0xffffff, level: -1.2, distortion: 1.2 },
  materials: {
    ground: { tex: 'snow_02', tint: 0xffffff, scale: 2, normalScale: 0.5, envMapIntensity: 1.7 },
    cliff: { tex: 'rock_face_03', tint: 0xc8d2e0, scale: 6, envMapIntensity: 1.3 },
    stone: { tex: 'marble_cliff_01', tint: 0xc4e4ff, scale: 4, envMapIntensity: 1.5 },
    accent: { tex: 'snow_02', tint: 0xe6eef8, scale: 2, envMapIntensity: 1.5 },
    wood: { tex: 'weathered_planks', tint: 0xffffff, scale: 1.6, envMapIntensity: 1.4, steps: 'stone' },
  },
  ambience: ['snow_wind_loop_1'],
  music: 'music_winter_dance',
  particles: 'snow',
  clouds: true,
};

// ---------------------------------------------------------------- layout tables (shared by build + testPath)
const STAIRS = [[20, 1.4, -2], [19, 2.8, -5], [18, 4.2, -8], [17, 5.6, -11]];            // east stairs → tier 1
const CRUMBLE_STEPS = [[10, 8.4, -9], [9.5, 9.8, -12], [9, 11.2, -15], [8.5, 12.6, -18]];  // tier 1 → tier 2 (ice skin)
const FLOES = [[42, 0.3, 2], [45, 0.5, 0], [48, 0.7, 2]];                                  // lake → islet (ice skin)
// Ski run: 14 boxes 4 × 4, each 0.35 m lower: leg A heads west along z = -10, corner 1, leg B heads south along x = -26,
// the last box (corner 2) turns west into the bowl. `dir` = downhill push direction.
const SKI = [];
for (let i = 0; i < 14; i++) {
  const top = +(6.65 - 0.35 * i).toFixed(2);
  if (i < 5) SKI.push({ x: -16 - 2 * i, z: -10, top, dir: [-1, 0] });
  else if (i === 5) SKI.push({ x: -26, z: -10, top, dir: [-0.707, 0.707] });
  else if (i < 13) SKI.push({ x: -26, z: -8 + 2 * (i - 6), top, dir: [0, 1] });
  else SKI.push({ x: -26, z: 6, top, dir: [-0.96, 0.28] });
}
const BOWL = [-30.5, 1.8, 7.5];
const VALLEY = { x0: -21, x1: -11, z: 14 };            // ice trench floor x -21…-11, z 12…16
const PILLAR = [-19.6, 0.45, 14];
const PINE = [16, -24];
const PAD_A = [17, 0.45, -18], LEDGE = [19.5, 6, -21], CANOPY = [16, 12.5, -24];

// per-level runtime state (rebuilt by build(); the module object is shared between loads)
let RT = null;

// ---------------------------------------------------------------- helpers
// Box faces of a non-indexed BoxGeometry: +x, -x, +y, -y, +z, -z (6 vertices each). UVs are stretched to metres like
// world.js's L.box (one texture tile = the material's `scale` metres).
function boxParts(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]); }
  g.translate(x, y, z);
  const n = g.toNonIndexed(); g.dispose();
  const slice = (ranges) => {
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const a = n.attributes[name], arr = [];
      for (const [s, e] of ranges) for (let i = s; i < e; i++) for (let c = 0; c < a.itemSize; c++) arr.push(a.array[i * a.itemSize + c]);
      out.setAttribute(name, new THREE.Float32BufferAttribute(arr, a.itemSize));
    }
    return out;
  };
  const parts = { side: slice([[0, 12], [18, 36]]), top: slice([[12, 18]]) };
  n.dispose();
  return parts;
}

/**
 * Static boxes drawn as ONE mesh (2 draw calls: sides + tops) instead of 2 per box: each box still gets its own L.box
 * collider (mesh hidden — it stays in the camera / ground raycasts, which ignore visibility). Returns the colliders.
 */
function mergedBoxes(L, list, sideMat, topMat, { castShadow = true } = {}) {
  const sides = [], tops = [], cols = [];
  for (const b of list) {
    const c = L.box(b.x, b.top, b.z, b.w, b.d, b.h, b.opts || {});
    c.mesh.visible = false; c.mesh.castShadow = false;
    cols.push(c);
    const p = boxParts(b.w, b.h, b.d, b.x, b.top - b.h / 2, b.z);
    sides.push(p.side); tops.push(p.top);
  }
  const S = mergeGeometries(sides, false), T = mergeGeometries(tops, false);
  const geo = L.own(mergeGeometries([S, T], true));
  for (const g of [...sides, ...tops, S, T]) g.dispose();
  const mesh = new THREE.Mesh(geo, [sideMat, topMat]);
  mesh.castShadow = castShadow; mesh.receiveShadow = true;
  L.add(mesh);
  return cols;
}

export default {
  id: 'kar',
  name: 'Kar Zirvesi',
  order: 3,
  subtitle: 'Donmuş göl, kayak pisti ve üç katlı zirve.',
  theme: THEME,
  spawn: [6, 0.1, 14], spawnFacing: Math.PI,   // faces -z: the summit is the first thing you see
  parTime: 240,
  crystals: 5,
  coinsTotal: null,
  seed: 11,

  build(L) {
    const { assets, audio } = L;
    RT = { slides: [], quietSet: false, blizzard: false, blizzardWant: false };
    const ICE = iceMaterial(assets);
    const WOOD = assets.pbr('wood');

    // ---------------------------------------------------------------- terrain
    L.island(0, 0, 0, 28, 8, { seg: 56, beachSeg: 64 });                  // snowfield + snowy shore ring (top -0.8)
    L.cyl(0, 7, -12, 14, 7, { seg: 40 });                                  // tier 1
    L.cyl(-2, 14, -14, 8, 7, { seg: 32 });                                 // tier 2
    const summit = L.box(-4, 22, -17, 6, 6, 8, { mat: { top: 'ground' } });   // summit: an ice block with a snow cap
    summit.mesh.material = [iceMaterial(assets), summit.mesh.material[1]];

    // Cabin (planks) with a snowy roof; spawn flag in front of it. Walls 3.2 m (one jump cannot reach the roof); an invisible
    // collider under the roof ridge so a triple-jumper stands on the roof instead of inside it.
    L.box(13, 3.2, 16, 6, 5, 3.2, { mat: { side: 'wood', top: 'ground' } });
    const roofHit = L.box(13, 4.4, 16, 6.6, 5.6, 1.2); roofHit.mesh.visible = false; roofHit.mesh.castShadow = false;
    {
      const prism = new THREE.CylinderGeometry(3.5, 3.5, 6.8, 3, 1);           // triangular prism, axis along x, apex up
      prism.rotateZ(Math.PI / 2); prism.rotateX(-Math.PI / 2); prism.scale(1, 0.35, 1);
      const roof = L.own(prism.toNonIndexed()); prism.dispose();
      roof.computeVertexNormals(); roof.translate(13, 3.2 + 3.5 * 0.5 * 0.35, 16);
      const m = new THREE.Mesh(roof, assets.pbr('ground')); m.castShadow = true; m.receiveShadow = true; L.add(m);
      const door = new THREE.Mesh(L.own(new THREE.BoxGeometry(0.12, 2.0, 1.2)), assets.flat(0x6b4a2e)); door.position.set(9.96, 1.0, 15.2); L.add(door);
      const win = new THREE.Mesh(L.own(new THREE.BoxGeometry(0.1, 0.9, 1.1)), assets.flat(0xffd27a, { emissive: 0xffa040, emissiveIntensity: 0.9 })); win.position.set(9.96, 1.9, 17.4); L.add(win);
    }
    L.prop('wooden_lantern_01', 9.3, 0, 14.3, { scale: 3, collide: 'cyl', r: 0.3, h: 1.6, rotY: 0.6 });
    L.light(9.3, 1.4, 14.3, 0xffb066, 2.2, 7);
    L.prop('dead_tree_trunk_02', 14, 0.36, 21.6, { scale: 1.1, rotY: 0.25, collide: 'box', w: 4.4, d: 1.3, h: 0.45 });   // fallen log

    // East stairs → tier 1 (rises 1.4)
    mergedBoxes(L, STAIRS.map(([x, t, z]) => ({ x, top: t, z, w: 3, d: 3, h: t + 1 })), assets.pbr('cliff'), assets.pbr('ground'));

    // Frozen lake (x 22…40, z -5…9) over the shore and the sea; three ice floes crack behind you → islet
    L.ice(L.box(31, 0.1, 2, 18, 14, 1.4, { mat: { side: ICE } }));
    for (const [x, t, z] of FLOES) L.ice(L.crumble(L.box(x, t, z, 2.6, 2.6, 0.7), { skin: 'ice', delay: 1.0, respawn: 5 }));
    L.cyl(54, 1, 2, 4, 4, { seg: 24 });

    // Crumble ice steps tier 1 → tier 2, bounce pad tier 2 → summit
    for (const [x, t, z] of CRUMBLE_STEPS) L.crumble(L.box(x, t, z, 2.6, 2.6, 0.7), { skin: 'ice', delay: 1.0, respawn: 5 });
    L.bouncePad(1, 14.45, -15, 1.2, 32);

    // Ski run: ice boxes (one merged mesh) + side rails (one merged mesh); each box pushes the rider downhill.
    const skiCols = mergedBoxes(L, SKI.map((s) => ({ x: s.x, top: s.top, z: s.z, w: 4, d: 4, h: s.top + 1 })), assets.pbr('cliff'), ICE);
    skiCols.forEach((c, i) => {
      L.ice(c);
      const [dx, dz] = SKI[i].dir;
      c.onStand = (p, col, dt) => {                     // downhill acceleration (ice idle decel is 5.5 m/s²): ≈ 6.5 m/s² net, capped at 9 m/s
        const along = p.vel.x * dx + p.vel.z * dz;
        if (along < 9) { p.vel.x += dx * 12 * dt; p.vel.z += dz * 12 * dt; }
      };
    });
    // Rails (0.5 wide, 0.8 m above the ice under them) enclose the L-shaped run; open at the tier-1 start (x -14) and on
    // the west side of the last box (z 4…8, the exit into the bowl). 2 m pieces follow the 0.35 m steps.
    const skiTop = (x, z) => SKI.reduce((m, s) => (Math.abs(x - s.x) <= 2 && Math.abs(z - s.z) <= 2 ? Math.max(m, s.top) : m), 0);
    const rails = [];
    const rail = (x0, x1, z0, z1, sx, sz) => { const top = skiTop(sx, sz) + 0.8; rails.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, top, h: 1.6 }); };
    for (let x = -14; x > -28; x -= 2) rail(Math.max(-28.5, x - 2 - (x === -26 ? 0.5 : 0)), x, -12.5, -12, x - 1, -11);   // north
    for (let z = -12.5; z < 4; z += 2) rail(-28.5, -28, z, Math.min(4, z + 2), -27, Math.min(3.5, z + 1));              // west (open z 4…8)
    for (let x = -14; x > -24; x -= 2) rail(x - 2, x, -8, -7.5, x - 1, -9);                                              // south of leg A
    for (let z = -7.5; z < 8.5; z += 2) rail(-24, -23.5, z, Math.min(8.5, z + 2), -25, Math.min(7.5, z + 1));            // east of leg B
    rail(-28.5, -24, 8, 8.5, -26, 7);                                                                                    // end stop
    mergedBoxes(L, rails, WOOD, assets.pbr('ground'));
    L.cyl(BOWL[0], BOWL[1], BOWL[2], 5, 4, { seg: 28 });               // snow bowl islet
    L.box(-25, 0.9, 11, 2.6, 2.6, 1.9, { mat: { top: 'ground' } });    // stepping stone down to the snowfield

    // Ice valley: open trench (walls 4 m), icy floor, crystal pillar at the closed west end
    mergedBoxes(L, [
      { x: -16, top: 4, z: 11.5, w: 10, d: 1, h: 4.5 },
      { x: -16, top: 4, z: 16.5, w: 10, d: 1, h: 4.5 },
      { x: -21.5, top: 4, z: 14, w: 1, d: 6, h: 4.5 },
    ], ICE, assets.pbr('ground'));
    L.ice(L.box(-16, 0.1, VALLEY.z, 10, 4, 0.6, { mat: { side: ICE } }));
    L.cyl(PILLAR[0], PILLAR[1], PILLAR[2], 1.2, 1.0, { mat: { side: ICE, top: 'ground' }, seg: 16 });

    // Giant pine "Sincap Ağacı": mushroom pads → branch ledge → treetop nest
    L.prop('pine_columnar', PINE[0], 0, PINE[1], { fitHeight: 12, collide: 'cyl', r: 0.9, h: 11.7, solid: false });
    const mush = (x, t, z) => {
      const c = L.bouncePad(x, t, z, 1.2, 27);
      c.mesh.material = [assets.flat(0xf3e6c8, { flatShading: false }), assets.flat(0xe0483c, { flatShading: false, roughness: 0.5 })];
      return c;
    };
    mush(...PAD_A);
    L.box(LEDGE[0], LEDGE[1], LEDGE[2], 3, 3, 0.8, { mat: { side: 'wood', top: 'ground' } });
    mush(LEDGE[0], LEDGE[1] + 0.45, LEDGE[2]);
    L.box(CANOPY[0], CANOPY[1], CANOPY[2], 3, 3, 0.8, { mat: { side: 'wood', top: 'ground' } });

    // Igloo (dome + entrance) — the secret cache is in its doorway, with the heart
    {
      const dome = new THREE.Mesh(L.own(new THREE.SphereGeometry(2.5, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2)), assets.flat(0xf2f7ff, { roughness: 0.6 }));
      dome.position.set(-6, 0, 8); dome.castShadow = true; dome.receiveShadow = true; L.add(dome);
      const tunnel = new THREE.Mesh(L.own(new THREE.CylinderGeometry(1.05, 1.05, 1.8, 12, 1, false, -Math.PI / 2, Math.PI)), assets.flat(0xe6f0fb, { roughness: 0.6 }));
      tunnel.rotation.x = Math.PI / 2; tunnel.position.set(-6, 0, 10.4); tunnel.castShadow = true; L.add(tunnel);
      const hole = new THREE.Mesh(L.own(new THREE.CircleGeometry(0.75, 12, 0, Math.PI)), assets.flat(0x2a3a52));
      hole.position.set(-6, 0, 11.32); L.add(hole);
      const c = L.cyl(-6, 2.2, 8, 2.2, 2.6, { seg: 12 }); c.mesh.visible = false; c.mesh.castShadow = false;
    }
    L.secret(-6, 0, 12.6, { coins: 8, ringR: 1.6 });
    L.heart(-6, 1.0, 12.6);

    // ---------------------------------------------------------------- decoration (seeded scatter)
    const keepClear = [[6, 14, 4], [5, 22, 5.5], [9, 19, 3], [8, 12, 2.5], [-2, 15.5, 4.5], [13, 16, 5.5], [14, 21.6, 3], [12, -1, 2.5], [15, 3, 2.5], [18, 7, 2.5], [21, 11, 2.5],
      [9, 10, 2.5], [14, 7, 2.5], [17, 1, 3], [23, -5, 3], [20, -16, 3], [17, -18, 3.5], [16, -24, 4.5], [26, 2, 5], [24, -3, 3], [24, 8, 3], [21, 5, 3.5], [19, 2, 2.5],
      [-6, 9, 4.5], [-6, 12.6, 3], [-16, 14, 7], [-9, 12, 3], [-25, 11, 3], [-14, 2, 3.5], [-28, 4, 4], [-10, 9, 2.5], [-2, 10, 2.5]];
    L.scatter('pine_spreading', { center: [0, 0], rMin: 13, rMax: 26, count: 9, keepClear, margin: 2.5, scale: [1.3, 1.9], collide: 'cyl', r: 0.3, h: 3 });
    L.scatter('pine_windswept', { center: [0, 0], rMin: 13, rMax: 26, count: 8, keepClear, margin: 2.5, scale: [1.3, 1.8], collide: 'cyl', r: 0.3, h: 3 });
    L.scatter('pine_windswept', {                       // tier 1 top: keep the routes clear
      center: [0, -12], rMin: 9.5, rMax: 13, count: 8, margin: 0, y: 7, scale: [1.0, 1.4], collide: 'cyl', r: 0.3, h: 3,
      keepClear: [[-2, -14, 9.6], [13, -12, 3.5], [10, -7, 3.5], [12, -8, 2.5], [10, -9, 2.5], [9.5, -12, 2.5], [9, -15, 2.5], [8.5, -18, 3],
        [-8.5, -3, 3.5], [-6, -3, 3], [-12, -9, 3.5], [-14, -10, 4], [4, -1, 3.5], [8, -3, 2.5], [0, -3, 2.5]],
    });
    L.scatter('pine_sapling', { center: [0, 0], rMin: 5, rMax: 26, count: 12, keepClear, margin: 1.2, scale: [1.2, 2.0] });
    L.scatter('stump_pine', { center: [0, 0], rMin: 5, rMax: 26, count: 8, keepClear, margin: 1.2, scale: [1.3, 2.0] });
    L.scatter('boulder_medium', { center: [0, 0], rMin: 29, rMax: 32, count: 12, y: -0.8, keepClear: [[31, 2, 10], [-30.5, 7.5, 6.5], [19.5, -21, 3]], margin: 0.5, scale: [1.3, 2.4], tint: 0xdfe8f0 });
    for (const [x, z, r] of [[9.5, 10.4, 0.3], [14.6, 10.6, 2.6], [20.2, 13.6, -0.4]]) L.prop('Lantern_01', x, 0, z, { scale: 5, rotY: r, collide: 'cyl', r: 0.3, h: 1.4 });
    L.clouds(12, { yMin: 26, ySpread: 14 });

    // ---------------------------------------------------------------- coins (87 placed + 8 in the secret = 95)
    L.coinLine([8.5, 1, 10.5], [17, 1, 5.5], 5);                                    // lake road
    L.coinLine([24, 1.1, 2], [38, 1.1, 2], 6);                                      // across the lake
    for (const [x, t, z] of FLOES) L.coin(x, t + 1.2, z);
    L.coinRing(54, 2, 2, 2.6, 6);                                                   // islet
    for (const [x, t, z] of STAIRS) L.coin(x, t + 1, z);
    L.coinLine([8, 8, -2.5], [-4, 8, -2.5], 6);                                     // tier 1 south band
    for (const [x, t, z] of CRUMBLE_STEPS) L.coin(x, t + 1.1, z);
    L.coinLine([5, 15, -13], [2.5, 15, -14], 3);                                    // tier 2 → pad
    L.coin(1, 17.5, -15); L.coin(0.2, 20.5, -15.4); L.coin(-1.6, 23.2, -16);       // up the bounce
    for (const [x, z] of [[-6, -19], [-2, -19], [-6, -15], [-2, -15]]) L.coin(x, 23, z);   // summit corners
    for (let i = 1; i < 13; i++) L.coin(SKI[i].x, SKI[i].top + 1, SKI[i].z);       // ski run
    L.coinRing(BOWL[0], BOWL[1] + 1, BOWL[2], 2.6, 6);                              // bowl
    L.coinLine([-12, 1.2, VALLEY.z], [-18, 1.2, VALLEY.z], 5);                      // ice valley
    L.coin(17, 3, -18); L.coin(18.2, 5.2, -19.4);                                  // pine: pad A → ledge
    L.coin(18.6, 9, -22); L.coin(17.4, 11.6, -23.2);                               // ledge → nest
    L.coinRing(CANOPY[0], CANOPY[1] + 1, CANOPY[2], 1.1, 4);
    L.coinRing(-6, 1, 8, 3.7, 8);                                                   // round the igloo
    L.coinRing(-14, 1, 2, 2.4, 4);                                                  // snowfield south-west

    // ---------------------------------------------------------------- crystals (play order: lake, summit, ski, valley, pine)
    L.crystal(54, 2.4, 2, 0x5ee6ff);                    // ① Donmuş Göl
    L.crystal(-4, 23.4, -17, 0xffd23f);                 // ③ Zirve
    L.crystal(BOWL[0], BOWL[1] + 1.4, BOWL[2], 0xff6f91);   // ② Kayak Pisti
    L.crystal(PILLAR[0], PILLAR[1] + 1.4, PILLAR[2], 0x9b7bff);   // ④ Buz Vadisi
    L.crystal(CANOPY[0], CANOPY[1] + 1.4, CANOPY[2], 0x7dff8a);   // ⑤ Sincap Ağacı

    // ---------------------------------------------------------------- checkpoints, portal, signs, vista
    L.checkpoint(8, 0, 12, { active: true });
    L.checkpoint(20.5, 0, 5);
    L.checkpoint(11, 7, -6);
    L.checkpoint(4, 14, -11);
    L.checkpoint(-9.5, 0, 10.5);
    L.portal(-2, 2.5, 15.5, { rotY: 0.9 });

    L.sign(10, 0, 6.5, 'Kartopu geliyor —\nüstünden zıpla!', { rotY: -0.3 });
    L.sign(21.5, 0, 8.2, 'Buz kaygan! Erken dön.', { rotY: -1.2 });
    L.sign(12.3, 7, -8.2, 'Çatlayan buz: hızlı geç!', { rotY: 2.3 });
    L.vista(-4, 22, -17, { title: 'Zirve', yaw: Math.PI + 0.23, pitch: 0.38, dist: 26 });

    // Camera hints: ski legs (camera behind the rider), lake (looking east)
    L.camHint({ x: -21, y: 4, z: -10, w: 14, h: 5, d: 4 }, Math.PI / 2);
    L.camHint({ x: -26, y: 1.5, z: -1, w: 4, h: 6, d: 18 }, Math.PI);
    L.camHint({ x: 31, y: -0.5, z: 2, w: 18, h: 3, d: 14 }, -Math.PI / 2);

    // Summit blizzard (GDD §6.1): snow_blizzard_amb while standing up there
    L.trigger({ x: -4, y: 21.5, z: -17, w: 8, h: 5, d: 8 }, {
      onEnter: () => { RT.blizzardWant = true; },
      onExit: () => { RT.blizzardWant = false; },
    });
    audio.ensure?.(['snow_blizzard_amb']);

    // ---------------------------------------------------------------- enemies
    const ICE_BOUNDS = { x0: 23, x1: 39, z0: -4, z1: 8 };
    for (const [x, z] of [[28, -1], [32, 5], [36, 0]]) {               // sliding slimes on the lake
      const e = L.slime(x, 0.1, z, 3, 0x4cc9f0);
      RT.slides.push({ e, prev: e.group.position.clone(), v: new THREE.Vector3(), b: ICE_BOUNDS });
    }
    L.slime(4, 7, -1, 2.5, 0x74c0fc);                                   // tier 1
    L.slime(-14, 0, 2, 3, 0x4dabf7);                                    // snowfield south-west
    const icicle = [L.own(new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.2, flatShading: true, emissive: 0x1d4a66, emissiveIntensity: 0.35 })),
      L.own(new THREE.MeshStandardMaterial({ color: 0xf2fbff, roughness: 0.15, flatShading: true, emissive: 0x5a8fb0, emissiveIntensity: 0.25 }))];
    for (const [x, sp] of [[-13, 2.2], [-15.2, 2.6], [-17.2, 2.4]]) {   // icicle spikies cross the valley
      const e = L.spiky([x, 0.1, VALLEY.z - 1.3], [x, 0.1, VALLEY.z + 1.3], sp);
      e.core.material = icicle;
    }
    L.boulder([12, 0, -1], [21, 0, 11], { every: 5, duration: 3, skin: 'snow', delay: 1 });
    L.boulder([-8.5, 7, -5.5], [-8.5, 7, -0.5], { every: 6, duration: 2.2, skin: 'snow', delay: 2.5 });
  },

  update(dt, t, L) {
    if (!RT || !(dt > 0)) return;
    const audio = L.audio;
    // Sliding slimes: keep the AI's intent but give it momentum on the ice (it overshoots and drifts)
    for (const s of RT.slides) {
      const g = s.e.group;
      if (!g.parent) continue;
      const vx = (g.position.x - s.prev.x) / dt, vz = (g.position.z - s.prev.z) / dt;
      const k = 1 - Math.exp(-2.2 * dt);
      s.v.x += (vx - s.v.x) * k; s.v.z += (vz - s.v.z) * k;
      let nx = s.prev.x + s.v.x * dt, nz = s.prev.z + s.v.z * dt;
      if (nx < s.b.x0 || nx > s.b.x1) { s.v.x *= -0.5; nx = Math.min(s.b.x1, Math.max(s.b.x0, nx)); }
      if (nz < s.b.z0 || nz > s.b.z1) { s.v.z *= -0.5; nz = Math.min(s.b.z1, Math.max(s.b.z0, nz)); }
      g.position.x = nx; g.position.z = nz;
      s.prev.set(nx, g.position.y, nz);
      if (s.e.inner) { s.e.inner.rotation.z = Math.max(-0.25, Math.min(0.25, -s.v.x * 0.05)); s.e.inner.rotation.x = Math.max(-0.25, Math.min(0.25, s.v.z * 0.05)); }
    }
    // Quiet wind ambience (GDD §6.1: snow_wind_loop_1 quiet)
    if (!RT.quietSet && audio.isLooping?.('snow_wind_loop_1')) RT.quietSet = audio.setLoopGain?.('snow_wind_loop_1', 0.45, 0.5) ?? true;
    // Summit blizzard loop (retries until the sample is decoded)
    if (RT.blizzardWant && !RT.blizzard) {
      if (audio.playLoop?.('snow_blizzard_amb', { id: 'kar:blizzard', bus: 'amb', gain: 0.7, fadeIn: 1.2 })) RT.blizzard = true;
    } else if (!RT.blizzardWant && RT.blizzard) { audio.stopLoop?.('kar:blizzard', 1.5); RT.blizzard = false; }
  },

  // Waypoints stand on fixed ground only (never on a floe / crumble step / mover); 'jump' hops ≤ 6.5 m across, ≤ 2.5 m up.
  testPath: [
    { at: [6, 0.1, 14], via: 'walk', note: 'spawn' },
    { at: [17, 0, 4], via: 'walk', note: 'lake road (crosses the snowball lane)' },
    { at: [21, 0, 6], via: 'walk', note: 'lake shore' },
    { at: [24, 0.1, 2], via: 'walk', note: 'onto the frozen lake' },
    { at: [39, 0.1, 2], via: 'walk', note: 'lake east end (sliding slimes)' },
    { at: [52, 1, 2], via: 'crumble', note: 'three ice floes → islet, crystal Donmuş Göl' },
    { at: [39, 0.1, 2], via: 'crumble', note: 'back over the respawned floes' },
    { at: [17, 0, 1], via: 'walk', note: 'foot of the east stairs' },
    { at: [20, 1.4, -2], via: 'jump', note: 'stairs 1' },
    { at: [19, 2.8, -5], via: 'jump' }, { at: [18, 4.2, -8], via: 'jump' }, { at: [17, 5.6, -11], via: 'jump' },
    { at: [12.5, 7, -11], via: 'jump', note: 'tier 1 east rim' },
    { at: [10.5, 7, -6], via: 'walk', note: 'tier 1, foot of the crumble ice steps' },
    { at: [4, 14, -12], via: 'crumble', note: 'four crumbling ice steps → tier 2' },
    { at: [1, 14.45, -15], via: 'walk', note: 'bounce pad' },
    { at: [-4, 22, -17], via: 'bounce', note: 'summit, crystal Zirve + vista' },
    { at: [-4, 14, -8.5], via: 'walk', note: 'drop back to tier 2' },
    { at: [-6, 7, -3], via: 'walk', note: 'drop to the tier 1 south band (snowball lane 2)' },
    { at: [-12, 7, -9], via: 'walk', note: 'tier 1 west rim' },
    { at: [SKI[0].x, SKI[0].top, SKI[0].z], via: 'walk', note: 'ski run start' },
    { at: [SKI[5].x - 1, SKI[5].top, SKI[5].z - 1], via: 'walk', note: 'ski corner 1' },
    { at: [SKI[13].x, SKI[13].top, SKI[13].z + 1], via: 'walk', note: 'ski run end' },
    { at: [BOWL[0], BOWL[1], BOWL[2]], via: 'walk', note: 'snow bowl, crystal Kayak Pisti' },
    { at: [-25, 0.9, 11], via: 'walk', note: 'stepping stone' },
    { at: [-10, 0, 9], via: 'walk', note: 'valley mouth (checkpoint)' },
    { at: [-10, 0, 14], via: 'walk' },
    { at: [-12, 0.1, 14], via: 'walk', note: 'ice valley floor (icicle spikies)' },
    { at: [-18, 0.1, 14], via: 'walk' },
    { at: [PILLAR[0], PILLAR[1], PILLAR[2]], via: 'jump', note: 'pillar, crystal Buz Vadisi' },
    { at: [-10, 0, 14], via: 'walk', note: 'out of the valley' },
    { at: [23, 0, -5], via: 'walk', note: 'east of the stairs' },
    { at: [20, 0, -16], via: 'walk' },
    { at: [PAD_A[0], PAD_A[1], PAD_A[2]], via: 'walk', note: 'mushroom pad' },
    { at: [LEDGE[0], LEDGE[1] + 0.45, LEDGE[2]], via: 'bounce', note: 'branch ledge (its pad)' },
    { at: [CANOPY[0], CANOPY[1], CANOPY[2]], via: 'bounce', note: 'treetop nest, crystal Sincap Ağacı' },
    { at: [-2, 0, 15.5], via: 'walk', note: 'portal' },
  ],
};
