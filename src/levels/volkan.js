// Campaign level 4 — `volkan` · Volkan Adası (GDD §2.7). A stepped cone in a lava sea: lava stream tutorial, east lava bay
// (crumbling stone), west geyser terraces, north boulder alley (Kaya Yolu), the crater rim with a mover over the pool and the
// eruption climb up the spire, where the portal appears once all five crystals are home.
//
// Deviations from the GDD §2.7 numbers (they collide with each other or with the cone; same intent, coordinates fixed):
//  * Rim = 8 axis-aligned boxes (colliders are AABBs only): 4 cardinal 3 × 8.2 and 4 diagonal 2.8², tops 15, ring ≈ r 5.5–8.5
//    around the crater centre C = (0, 4).
//  * Tier 1 → tier 2 → rim stairs spiral round the outside of tier 2 (the GDD steps (5, 11.6, 4) / (4, 13.4, 10) sat inside the
//    crater / inside a rim box): 7.4, 8.8, 10.2, 11.6 on r 11.2 around C, then 13.4 against the south rim, then the rim (15).
//  * Base → tier 1 stairs sit on r 19 around tier 1's centre (the GDD ones were buried inside the cylinder).
//  * Geyser field moved 3–4 m west (geyser 1 at (-14, 0, 10) was inside tier 1); terraces 4 / 8 / 12 m, each geyser ≤ 2.5 m
//    from the next terrace face.
//  * Kaya Yolu ramp runs z −26 → −16 (17 steps of 0.35 m) so it meets tier 1's cliff edge; the boulder line follows it.
//  * Crater mover runs along the north side of the pool (x −2.2 ↔ 2.2, z 0.5, top 15.3), because a pool-centre crossing would go
//    through the spire; crystal ④ floats over its path at (0, 16.9, 0.5) instead of (0, 16.9, 4) (inside the spire).
//  * Inner ledges: 7 slabs on r 4.2 around the spire starting west (beside the mover's west end and flush with the west rim),
//    tops 16.3 + 1.3·i exactly as specified; the last one (24.1) is a hop across to the spire top (24).
//  * Lava stream tutorial (3 × 6 m, one stone) on the spawn strip next to the "Lav yakar!" sign — the base ring is only 6 m wide
//    south of the cone, there is no room for the sign at (0, 0, 20) (that is tier 1's cliff foot).
//  * Secret on the ash beach ring (16, −0.8, 24) so the coin ring does not sink into the base top.
//  * Eruption: the pool's own square trigger is replaced by a cylinder burn (r 5.35 around C) so the rim never burns, and the
//    rising lava is drawn as a round magma column (the 13 × 13 pool plane would float above the rim). The re-arm box is the
//    inner 12 × 12 (the GDD's 16 × 16 contains the rim checkpoint, so a respawn would never "enter" it). After 6 s at full
//    height the volcano calms down and re-arms, so standing on the rim can never soft-lock the climb.
//  * The portal is built hidden on the spire top (0, 26.5, 4 = centre, rings standing on the top at 24) and rises out of the
//    spire over 1.5 s when the last crystal is taken (portal.open is held back meanwhile, so collecting ⑤ on the spire
//    does not win instantly).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as bus from '../engine/bus.js';

const THEME = {
  hdri: 'wasteland_clouds_puresky',
  hdriRotation: 0,
  environmentIntensity: 0.35, backgroundIntensity: 1.0,
  sun: { dir: [-0.4, 0.5, 0.6], color: 0xffa060, intensity: 2.0 },
  hemi: { sky: 0xd9a080, ground: 0x3a2a24, intensity: 0.6 },
  fog: { color: 0xd99a7a, near: 55, far: 170 },
  water: { kind: 'lava', color: 0xff5a1f, glow: 0xffb060, level: -1.2, scale: 7 },   // scale 7: calmer plates on the 900 m sea
  // GDD §2.2 order: ground / cliff / stone / accent
  materials: {
    ground: { tex: 'rocks_ground_06', tint: 0x9a8f88, scale: 3, steps: 'stone' },
    cliff: { tex: 'rock_boulder_cracked', tint: 0xa86448, scale: 2 },          // GDD c87850, a touch darker: less 'brick cake'
    stone: { tex: 'rock_face', tint: 0x6a6060, scale: 4 },
    accent: { tex: 'dry_ground_01', tint: 0x808080, scale: 3, steps: 'sand' },
  },
  ambience: ['lava_flow_loop', 'lava_bubbles_loop', 'lava_rumble_loop'],
  music: 'music_space_race',
  particles: 'embers',
  clouds: false,
};

// ---------------------------------------------------------------- layout constants
const C = [0, 4];                                  // crater / spire centre (x, z)
const LAVA_REST = 13.3, LAVA_TOP = 21;             // crater lava level at rest / at the end of the rise
const RISE = 0.6, SINK = 1.0;                      // m/s (rise × physics.assist.eruption → 0.39 in Yardım Modu)
const BURN_R = 5.35;                               // crater lava column radius (burn + visual)
const SPIRE_TOP = 24;
const MOVER_Z = 0.5, MOVER_TOP = 15.3;
const RIM_TOP = 15;
const RIM = [                                      // [dx, dz, w, d] relative to C
  [7, 0, 3, 8.2], [-7, 0, 3, 8.2], [0, 7, 8.2, 3], [0, -7, 8.2, 3],
  [5.23, 5.23, 2.8, 2.8], [-5.23, 5.23, 2.8, 2.8], [5.23, -5.23, 2.8, 2.8], [-5.23, -5.23, 2.8, 2.8],
];
const LEDGE_R = 4.2;
const LEDGES = Array.from({ length: 7 }, (_, i) => {
  const a = Math.PI - 0.9 * i;
  return [C[0] + Math.cos(a) * LEDGE_R, 16.3 + 1.3 * i, C[1] + Math.sin(a) * LEDGE_R];
});
const deg = (d) => (d * Math.PI) / 180;
// base → tier 1 (tier 1 centre (0, 2), r 18): r 19, tops 1.4 … 5.6
const STAIRS1 = [50, 39, 28, 17].map((t, i) => [Math.cos(deg(t)) * 19, 1.4 * (i + 1), 2 + Math.sin(deg(t)) * 19]);
// tier 1 (6) → tier 2 (12): r 11.2 around C, tops 7.4 … 11.6, then the 13.4 step against the south rim
const STAIRS2 = [10, 28, 46, 64].map((t, i) => [C[0] + Math.cos(deg(t)) * 11.2, 6 + 1.4 * (i + 1), C[1] + Math.sin(deg(t)) * 11.2]);
const STEP5 = [1.34, 13.4, 13.5];
// Kaya Yolu: 17 steps of 0.35 m from z −26 to −16 (x −2…2)
const RAMP_N = 17, RAMP_Z0 = -26, RAMP_Z1 = -16, RAMP_DZ = (RAMP_Z1 - RAMP_Z0) / RAMP_N;
const rampTop = (k) => 0.35 * (k + 1);
// geyser terraces [x, top, z] (6 × 6) and vents [x, top, z, phase]
const TERRACES = [[-21, 4, 8], [-26, 8, 2], [-29, 12, -5]];
const GEYSERS = [[-19, 0, 13.2, 0], [-22.3, 4, 6.4, 1], [-27, 8, 0.4, 2]];

let ERUPTION = null;   // per-build controller (level.update drives it)

export default {
  id: 'volkan',
  name: 'Volkan Adası',
  order: 4,
  subtitle: 'Lav denizinde uyuyan bir yanardağ.',
  theme: THEME,
  spawn: [0, 0.1, 24], spawnFacing: Math.PI,
  camYaw: 0, camPitch: 0.2,
  parTime: 240,
  crystals: 5,
  coinsTotal: null,
  seed: 4,
  crystalNames: ['Lav Gölü', 'Buhar Bacaları', 'Kaya Yolu', 'Krater', 'Patlama'],

  build(L) {
    const tier = L.quality?.tier ?? 'high';
    const STONE_TOP = { side: 'cliff', top: 'stone' };
    L.audio.ensure?.(['rock_landslide', 'music_boss_epic_loop']);
    const statics = [];                                            // fixed boxes, drawn as merged meshes (see mergeStatic)
    const box = (...a) => { const c = L.box(...a); statics.push(c); return c; };

    // ============================================================ terrain: base, tiers, rim, crater
    L.island(0, 0, 0, 26, 8, { beach: true, rocks: 12 });          // ash beach ring r 31 at −0.8
    L.cyl(0, 6, 2, 18, 6, { seg: 44 });                             // tier 1
    L.cyl(0, 12, C[1], 10, 6, { seg: 36 });                         // tier 2 (the rim's plinth)
    for (const [dx, dz, w, d] of RIM) box(C[0] + dx, RIM_TOP, C[1] + dz, w, d, 3.4, { mat: { side: 'cliff', top: 'stone' } });
    L.cyl(C[0], 13, C[1], 7, 2, { surface: 'lava', noSolid: true, mat: { side: 'cliff', top: 0x2a1610 }, castShadow: false });
    const pool = L.lava(C[0], LAVA_REST, C[1], 13, 13);
    L.remove(pool.trigger);                                         // replaced by the cylinder burn below (rim never burns)
    L.cyl(C[0], SPIRE_TOP, C[1], 2, SPIRE_TOP - 13, { mat: 'stone', seg: 22, taper: 1.15 });   // eruption spire
    for (const [x, top, z] of LEDGES) box(x, top, z, 2.6, 2.6, 0.8, { mat: STONE_TOP });
    L.mover([-2.2, MOVER_TOP, MOVER_Z], [2.2, MOVER_TOP, MOVER_Z], 6, 3, 2.6);

    // stairs: base → tier 1 (south-east), tier 1 → rim (east → south)
    for (const [x, top, z] of STAIRS1) box(x, top, z, 3, 3, top + 0.8, { mat: STONE_TOP });
    for (const [x, top, z] of STAIRS2) box(x, top, z, 3, 3, top - 6 + 0.8, { mat: STONE_TOP });
    box(STEP5[0], STEP5[1], STEP5[2], 3, 3, STEP5[1] - 6 + 0.5, { mat: STONE_TOP });

    // ============================================================ ① Lav Gölü — east lava bay
    box(29, 0.5, -2, 2.6, 2.6, 1.8, { mat: 'stone' });
    L.crumble(L.box(32.5, 0.8, -1, 2.6, 2.6, 2.4), { skin: 'rock', delay: 1.0, respawn: 5 });
    box(36, 1.1, -2, 2.6, 2.6, 2.7, { mat: 'stone' });
    L.cyl(40, 3, -2, 2.5, 5, { mat: STONE_TOP, seg: 7, taper: 1.12 });   // basalt column (hexagonal-ish)
    L.prop('hexago', 40, 2.62, -2, { scale: 1.15, rotY: 0.3, tint: 0x8a7a72 });

    // ============================================================ ② Buhar Bacaları — west geyser terraces
    for (const [x, top, z] of TERRACES) box(x, top, z, 6, 6, top + 1.6, { mat: { side: 'cliff', top: 'ground' } });
    for (const [x, top, z, phase] of GEYSERS) L.geyser(x, top, z, { period: 3, phase, lift: 22 });
    L.heart(-24, 9, 0);

    // ============================================================ ③ Kaya Yolu — north boulder alley
    for (let k = 0; k < RAMP_N; k++) {
      const top = rampTop(k), zc = RAMP_Z0 + RAMP_DZ * (k + 0.5);
      box(0, top, zc, 4, RAMP_DZ + 0.02, top + 1.0, { mat: STONE_TOP, castShadow: k % 2 === 0 });
    }
    // side walls (1.2 m above the highest step of each segment, ≤ 3 m above the lowest; open at the foot for the entry)
    for (const [k0, k1] of [[3, 8], [9, 12], [13, 16]]) {
      const z0 = RAMP_Z0 + RAMP_DZ * k0, z1 = RAMP_Z0 + RAMP_DZ * (k1 + 1), top = rampTop(k1) + 1.2;
      for (const sx of [-1, 1]) box(sx * 2.3, top, (z0 + z1) / 2, 0.6, z1 - z0, top + 0.5, { mat: 'cliff' });
    }
    box(5, 7, -13, 3, 3, 1.4, { mat: STONE_TOP });              // ledge with crystal ③
    L.boulder([0, 6.1, -15.6], [0, 0.2, -26.2], { every: 5, duration: 3, skin: 'lava' });
    L.camHint({ x: 0, y: -0.5, z: -21, w: 5, h: 8, d: 10 }, Math.PI);

    // ============================================================ spawn strip: lava stream tutorial + signs
    L.lava(7, 0.04, 22, 3, 6);
    box(7, 0.45, 22.5, 2.6, 2.6, 1.0, { mat: 'stone' });
    L.sign(3.4, 0, 21.4, 'Lav yakar!\nSadece taşlara bas.', { rotY: -0.7 });
    L.sign(-15.5, 0, 16.6, 'Gayzer seni fırlatır —\nbekle ve bas!', { rotY: -0.5 });
    L.camHint({ x: -22, y: -0.5, z: 6, w: 14, h: 14, d: 18 }, 0.6);

    // ============================================================ secret, vista, lights
    L.secret(16, -0.8, 24, { coins: 12, pound: true });             // cracked crust on the ash beach (pound within 2 m)
    L.prop('rock_pile', 17.6, -0.8, 22.7, { scale: 0.8, rotY: 2.1, tint: 0x6a5a52 });   // a hint beside the cracked crust
    L.vista(0, RIM_TOP, 11, { title: 'Krater', yaw: 0.25, pitch: 0.55, dist: 24 });
    const craterLight = L.light(C[0], 16.5, C[1], 0xff6a20, 60, 26);
    L.light(7, 1.4, 22, 0xff7a2a, 8, 8);

    // ============================================================ props (hero moon rocks + stylized kit)
    const HERO = [
      ['moon_rock_02', -6.5, 0, 24.2, 13, 0.4, 1.5, 2.4], ['moon_rock_06', 17, 0, -15, 34, 1.2, 1.5, 2],
      ['moon_rock_04', -21, 0, -9.5, 22, 2.2, 1.6, 1], ['moon_rock_02', 20.5, -0.8, 14.5, 10, 3.1, 1.2, 1.8],
      ['moon_rock_06', 36, -2.6, 12, 60, 0.7, null, 0], ['moon_rock_04', -36, -1.9, 8, 40, 4.0, null, 0],
      ['moon_rock_02', -10, -2.8, -34, 26, 5.2, null, 0],   // sea stacks sunk into the lava
    ];
    for (const [name, x, y, z, scale, rotY, r, h] of HERO) L.prop(name, x, y, z, { scale, rotY, tint: 0xb09484, collide: r ? 'cyl' : null, r, h });
    // tier 1 dressing (explicit: scatter's collider test would reject tier 1's own top)
    for (const [name, x, z, s, ry, r, h] of [
      ['dead_snag_tall', -6.5, -13, 0.75, 0.3, 0.35, 3], ['dead_snag_tall', 15.5, 4.5, 0.6, 2.1, 0.3, 3], ['dead_snag_short', -12.5, 12.5, 1.1, 1.2, 0.3, 1.5],
      ['dead_snag_short', 9.5, -10.5, 1.0, 4.0, 0.3, 1.5], ['spatte', 10.5, -9, 1.1, 2.6, 1.0, 1],
      ['slab_upright', -3.2, -14.4, 1.3, 0.2, 0.4, 2], ['slab_upright', 3.2, -15.2, 1.1, 1.4, 0.4, 2], ['rock_pile', -15.5, 7, 1.4, 0.6, 0.6, 1],
      ['dead_tree_trunk', 12.5, 1, 1.4, 1.9, null, 0],
    ]) L.prop(name, x, 6, z, { scale: s, rotY: ry, collide: r ? 'cyl' : null, r, h });
    // base ring dressing
    for (const [name, x, y, z, s, ry, r, h] of [
      ['spatte', -21, 0, -2, 1.4, 0.4, 1.2, 1], ['namaqualand_boulder_02', 23.5, 0, 9.5, 1.6, 0.9, 1.3, 1.2],
      ['namaqualand_boulder_02', -12, 0, -21.5, 1.8, 2.4, 1.4, 1.2], ['namaqualand_boulder_02', 9, 0, -23, 1.5, 0.2, 1.2, 1.1],
      ['dead_tree_trunk', 21, 0, -10.5, 1.2, 1.1, null, 0],
      ['obsidi', 9.5, -0.8, 27.5, 1.2, 0.5, null, 0], ['obsidi', -27.5, -0.8, 14.5, 1.4, 1.9, null, 0], ['obsidi', 21, -0.8, -20, 1.3, 3.3, null, 0],
      ['obsidi', -20.5, -0.8, -21, 1.1, 5.0, null, 0],
    ]) L.prop(name, x, y, z, { scale: s, rotY: ry, collide: r ? 'cyl' : null, r, h });
    const keepClear = [[0, 24, 3.5], [7, 22, 4.2], [12.2, 17, 3.2], [16.8, 11, 2.5], [18.2, 7.6, 2.5], [25, -2.5, 4], [-19, 13.2, 3.2],
      [-16, 15.5, 2.5], [2, 22, 2.5], [24, -4.5, 2.5], [3.5, -24.5, 3], [0, -25, 5], [16, 24, 3.5], [22, -3.5, 2.5], [-24, -6, 3], [-9, 21.5, 2.5], [-13, 19.5, 2]];
    L.scatter('dead_snag_tall', { center: [0, 0], rMin: 19.5, rMax: 25, count: 8, scale: [0.55, 0.95], collide: 'cyl', r: 0.35, h: 3, keepClear });
    L.scatter('dead_snag_short', { center: [0, 0], rMin: 19.5, rMax: 25.2, count: 8, scale: [0.9, 1.3], collide: 'cyl', r: 0.3, h: 1.5, keepClear });
    L.scatter('rock_pile', { center: [0, 0], rMin: 19.5, rMax: 25.5, count: 12, scale: [0.8, 1.5], keepClear, tint: 0x8a7a70 });
    L.scatter('slab_upright', { center: [0, 0], rMin: 20, rMax: 25, count: 9, scale: [0.9, 1.6], collide: 'cyl', r: 0.35, h: 1.6, keepClear, tint: 0x5a4a44 });

    // ============================================================ crystals, checkpoints, portal
    L.crystal(40, 4.4, -2, 0x5ee6ff);                               // ① Lav Gölü
    L.crystal(-28, 13.4, -6, 0x7dff8a);                             // ② Buhar Bacaları
    L.crystal(5, 8.4, -13, 0xffd23f);                               // ③ Kaya Yolu
    const crystal4 = L.crystal(0, 16.9, MOVER_Z, 0x9b7bff);         // ④ Krater (over the mover's path)
    L.crystal(C[0], SPIRE_TOP + 1.4, C[1], 0xff6f91);               // ⑤ Patlama (spire top)

    L.checkpoint(2, 0, 22, { active: true });                       // spawn
    L.checkpoint(24, 0, -4.5);                                      // east shore
    L.checkpoint(-16, 0, 15.5);                                     // geyser field
    L.checkpoint(3.5, 0, -24.5);                                    // alley foot
    L.checkpoint(2, RIM_TOP, 11);                                   // crater rim (before the climb)

    const portal = L.portal(C[0], SPIRE_TOP + 2.5, C[1], { rotY: -2.45 });
    portal.group.visible = false;

    // ============================================================ coins (88 placed + 12 in the secret = 100)
    L.coinLine([0, 1, 22.5], [3.6, 1, 23.2], 3);
    L.coin(7, 1.6, 22.5);
    L.coinLine([11, 1, 20.8], [15.5, 1, 16.5], 2);
    L.coinLine([20, 1, 11], [23.5, 1, 1], 4);
    L.coin(29, 1.6, -2); L.coin(32.5, 1.9, -1); L.coin(36, 2.2, -2);
    L.coinRing(40, 4, -2, 1.6, 6);
    L.coinLine([-4, 1, 24.6], [-13, 1, 20], 4);
    for (const [x, top, z] of GEYSERS) for (const dy of [2, 3.5, 5]) L.coin(x, top + dy, z);
    L.coinRing(-29.6, 13, -4.4, 1.5, 4);
    L.coinLine([-22, 1, -9], [-10, 1, -21], 4);
    L.coinLine([0, 1.4, -24.5], [0, 6.6, -17], 6);
    L.coinRing(5, 8, -13, 2.2, 4);
    L.coinRing(0, 7.2, 2, 14, 12);
    for (const [x, top, z] of [...STAIRS2, STEP5]) L.coin(x, top + 1, z + (z === STEP5[2] ? 0.3 : 0));
    L.coinRing(C[0], RIM_TOP + 1, C[1], 7, 12);
    L.coin(-2.5, 16.4, MOVER_Z); L.coin(2.5, 16.4, MOVER_Z);
    for (const [x, top, z] of LEDGES) L.coin(x, top + 1, z);

    // ============================================================ enemies (6 orange slimes, 3 red spikies, 1 lava boulder)
    const ORANGE = 0xff8c42;
    L.slime(-10, 0, 21.5, 2.5, ORANGE);
    L.slime(21.5, 0, 6, 2.5, ORANGE);
    L.slime(14, 6, -3, 3, ORANGE);
    L.slime(-9, 6, -11, 3, ORANGE);
    L.slime(-12, 6, 9, 3, ORANGE);
    L.slime(14, 0, -18.5, 3, ORANGE);
    const red = L.own(new THREE.MeshStandardMaterial({ color: 0xc8322a, roughness: 0.55, flatShading: true }));
    for (const [a, b, sp] of [[[22, 0, -8], [22, 0, 1], 2.2], [[-15, 6, -2], [-15, 6, 6], 2.4], [[-16, 0, -16], [-8, 0, -21.5], 2.6]]) {
      const e = L.spiky(a, b, sp);
      if (Array.isArray(e?.core?.material)) e.core.material = [red, e.core.material[1]];
    }

    mergeStatic(L, statics);

    // ============================================================ volcano: smoke plume + eruption controller
    ERUPTION = makeEruption(L, { pool, crystal4, portal, craterLight, tier });
  },

  update(dt, t, L) { ERUPTION?.update(dt, t, L); },
  /** test/debug view of the eruption controller ({ state, lava, … }); null before the first build. */
  get eruption() { return ERUPTION?.E ?? null; },

  // Fixed ground only (never the mover / the crumbling stone); 'jump' ≤ 6.5 m across / ≤ 2.5 m up.
  testPath: [
    { at: [0, 0.1, 24], via: 'walk', note: 'spawn' },
    { at: [4.6, 0, 23.2], via: 'walk', note: 'west bank of the lava stream (sign)' },
    { at: [7, 0.45, 22.5], via: 'jump', note: 'stone in the lava stream' },
    { at: [9.8, 0, 22], via: 'jump', note: 'east bank' },
    { at: [17, 0, 15], via: 'walk', note: 'south-east base strip' },
    { at: [23, 0, 5], via: 'walk', note: 'east strip' },
    { at: [25.5, 0, -2], via: 'walk', note: 'east shore' },
    { at: [29, 0.5, -2], via: 'jump', note: 'bay stone 1' },
    { at: [36, 1.1, -2], via: 'crumble', note: 'over the crumbling middle stone (32.5, 0.8, -1) to stone 3' },
    { at: [40, 3, -2], via: 'jump', note: 'basalt column, crystal ① Lav Gölü' },
    { at: [36, 1.1, -2], via: 'jump', note: 'back: stone 3' },
    { at: [29, 0.5, -2], via: 'crumble', note: 'back over the crumbling stone' },
    { at: [25.5, 0, -2], via: 'jump', note: 'east shore' },
    { at: [23, 0, 5], via: 'walk' }, { at: [17, 0, 15], via: 'walk' }, { at: [9.8, 0, 22], via: 'walk' },
    { at: [7, 0.45, 22.5], via: 'jump', note: 'stream stone' },
    { at: [4.6, 0, 23.2], via: 'jump' },
    { at: [-8, 0, 23], via: 'walk', note: 'south-west strip' },
    { at: [-16, 0, 16.5], via: 'walk', note: 'geyser field (checkpoint, sign)' },
    { at: [-19, 0, 13.2], via: 'walk', note: 'geyser 1' },
    { at: [-21, 4, 8.6], via: 'geyser', note: 'geyser 1 launch (lift 22 ≈ 5.5 m) → terrace 1' },
    { at: [-22.3, 4, 6.4], via: 'walk', note: 'geyser 2' },
    { at: [-26, 8, 2.6], via: 'geyser', note: 'geyser 2 launch → terrace 2 (heart)' },
    { at: [-27, 8, 0.4], via: 'walk', note: 'geyser 3' },
    { at: [-29, 12, -5], via: 'geyser', note: 'geyser 3 launch → terrace 3, crystal ② Buhar Bacaları' },
    { at: [-24.5, 0, -6.5], via: 'jump', note: 'drop down to the base (west)' },
    { at: [-16, 0, -15.5], via: 'walk', note: 'north-west strip' },
    { at: [-3.6, 0, -24.4], via: 'walk', note: 'Kaya Yolu foot (beside the alley wall)' },
    { at: [0, 0.35, -25.7], via: 'walk', note: 'ramp step 1' },
    { at: [0, rampTop(16), RAMP_Z1 - RAMP_DZ / 2], via: 'climb', note: 'up the 0.35 m steps, jumping the lava boulder' },
    { at: [0, 6, -14.6], via: 'walk', note: 'tier 1 at the ramp top' },
    { at: [5, 7, -13], via: 'jump', note: 'ledge, crystal ③ Kaya Yolu' },
    { at: [13, 6, -6], via: 'walk', note: 'drop off the ledge, tier 1 east' },
    { at: [13.2, 6, 3.5], via: 'walk', note: 'foot of the rim stairs' },
    ...STAIRS2.map((p, i) => ({ at: [...p], via: 'jump', note: `rim stairs ${i + 1}` })),
    { at: [STEP5[0], STEP5[1], 13.8], via: 'jump', note: 'step against the south rim' },
    { at: [1.3, RIM_TOP, 11.4], via: 'jump', note: 'crater rim south (checkpoint, vista "Krater")' },
    { at: [-3.5, RIM_TOP, 11], via: 'walk' },
    { at: [-5.23, RIM_TOP, 9.23], via: 'walk', note: 'rim south-west' },
    { at: [-7, RIM_TOP, 4], via: 'walk', note: 'rim west' },
    { at: [-5.23, RIM_TOP, -1.23], via: 'walk', note: 'rim north-west' },
    { at: [0, RIM_TOP, -3], via: 'walk', note: 'rim north (mover pick-up)' },
    { at: [...LEDGES[0]], via: 'mover', note: 'ride the mover, crystal ④ Krater (eruption starts), hop to ledge 1' },
    ...LEDGES.slice(1).map((p, i) => ({ at: [...p], via: 'jump', note: `inner ledge ${i + 2}` })),
    { at: [C[0], SPIRE_TOP, C[1]], via: 'jump', note: 'spire top, crystal ⑤ Patlama' },
    { at: [C[0], SPIRE_TOP, C[1]], via: 'walk', note: 'portal (rises out of the spire top)' },
  ],
};

// ---------------------------------------------------------------- draw-call batching
// ~55 fixed boxes (rim, ledges, stairs, ramp, walls, terraces, stones) would be ~110 draws on the low tier (2 material groups
// each). Their colliders and meshes stay exactly as L.box made them (physics, the camera/blob/groundBelow raycasts and
// L.remove keep working: Raycaster ignores `visible`); the meshes are only hidden, and every material group is re-drawn as
// ONE merged mesh per shared theme material (world-space copies of the box faces, same UVs/normals).
function mergeStatic(L, list) {
  const buckets = new Map();                         // material uuid → { mat, parts: [] }
  for (const c of list) {
    const m = c?.mesh, g = m?.geometry;
    if (!m || !Array.isArray(m.material) || !g?.index || !g.groups?.length) continue;
    m.updateMatrixWorld(true);
    for (const grp of g.groups) {
      const mat = m.material[grp.materialIndex];
      if (!mat) continue;
      const part = new THREE.BufferGeometry();
      for (const [k, attr] of Object.entries(g.attributes)) part.setAttribute(k, attr.clone());
      part.setIndex(Array.from(g.index.array.subarray(grp.start, grp.start + grp.count)));
      part.applyMatrix4(m.matrixWorld);
      if (!buckets.has(mat.uuid)) buckets.set(mat.uuid, { mat, parts: [] });
      buckets.get(mat.uuid).parts.push(part);
    }
    m.visible = false;
  }
  for (const { mat, parts } of buckets.values()) {
    const geo = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!geo) continue;
    L.own(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'volkan:static'; mesh.castShadow = true; mesh.receiveShadow = true;
    L.add(mesh);
  }
}

// ---------------------------------------------------------------- eruption + plume + portal reveal
// States: idle (before ④) → rumble (1.2 s telegraph: toast, landslide, shake) → rising (0.6 m/s × assist.eruption to 21) →
// risen (6 s) → calming (sinks 1 m/s) → armed; armed → rumble again when Pıtır enters the inner crater box. A respawn/faint
// resets the lava to 13.3 at once and arms it. All five crystals → final: the lava sinks back for good and the portal rises.
function makeEruption(L, { pool, crystal4, portal, craterLight, tier }) {
  const { player, physics, audio, fx } = L;
  const theme = L.level.theme;
  const E = { state: 'idle', lava: LAVA_REST, t: 0, inBox: false, portalT: -1, emberT: 0, baseLight: craterLight.intensity };

  // magma column (shown while the lava is above the rest level; the square pool plane would float over the rim)
  const colGeo = L.own(new THREE.CylinderGeometry(BURN_R, BURN_R * 1.02, 1, 40, 1, true).translate(0, 0.5, 0));
  const capGeo = L.own(new THREE.CircleGeometry(BURN_R, 40).rotateX(-Math.PI / 2));
  if (tier === 'low') {                                  // MeshBasicMaterial path: metre-ish UVs instead of one stretched tile
    const su = (g, ku, kv) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ku, uv.getY(i) * kv); uv.needsUpdate = true; };
    su(colGeo, 8, 2); su(capGeo, 2.6, 2.6);
  }
  const column = new THREE.Mesh(colGeo, pool.material); column.position.set(C[0], 13, C[1]); column.visible = false;
  const cap = new THREE.Mesh(capGeo, pool.material); cap.position.set(C[0], LAVA_REST, C[1]); cap.visible = false;
  for (const m of [column, cap]) { m.castShadow = false; m.receiveShadow = false; L.add(m); }

  // smoke plume over the spire: one InstancedMesh of soft puffs drifting east (the island's silhouette from the spawn)
  const N = tier === 'low' ? 10 : 18, LIFE = 16;
  const puffGeo = L.own(new THREE.IcosahedronGeometry(1, 3));
  const puffMat = L.own(new THREE.MeshLambertMaterial({ color: 0x7a6e6a, emissive: 0x3a1608, emissiveIntensity: 0.3, transparent: true, opacity: 0.38, depthWrite: false }));
  const plume = new THREE.InstancedMesh(puffGeo, puffMat, N);
  plume.frustumCulled = false; plume.castShadow = false; plume.receiveShadow = false; plume.renderOrder = 2; plume.name = 'volkan:plume';
  L.add(plume);
  const puffs = Array.from({ length: N }, (_, i) => ({ age: (i / N) * LIFE, sx: 0.7 + L.rnd() * 0.7, ox: L.rnd() * 4 - 2, oy: L.rnd() * 3, oz: L.rnd() * 4 - 2 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const writePlume = (speed) => {
    for (let i = 0; i < N; i++) {
      const p = puffs[i], k = p.age / LIFE;
      v.set(C[0] + 1.5 + p.ox * (0.4 + k) + k * 18, SPIRE_TOP + 8 + p.oy + k * 26, C[1] + p.oz * (0.4 + k) - k * 5);
      const sc = (1.2 + k * 5.5) * p.sx * Math.min(1, k * 5) * Math.min(1, (1 - k) * 3);
      s.set(sc, sc * 0.8, sc);
      plume.setMatrixAt(i, m4.compose(v, q, s));
    }
    plume.instanceMatrix.needsUpdate = true;
  };
  writePlume(1);

  // burn: the crater lava column (r 5.35 around C) — hazard('lava'), or a plain respawn while invulnerable (lava.js rule)
  L.dynamic({
    update() {
      if (!physics.sim.playing) return;
      const p = player.pos;
      if (p.y < 12 || p.y > E.lava + 0.25) return;
      if (Math.hypot(p.x - C[0], p.z - C[1]) > BURN_R) return;
      if (!physics.hazard('lava', p, { sfxKey: 'lava_bubble_pop' })) physics.respawn();
    },
    dispose() {},
  });

  function setLava(y) {
    E.lava = y;
    pool.setLevel(y);
    const risen = y > LAVA_REST + 0.03;
    pool.mesh.visible = !risen; if (pool.bubbles) pool.bubbles.visible = !risen;
    column.visible = cap.visible = risen;
    column.scale.y = Math.max(0.01, y - 13); cap.position.y = y;
    column.updateMatrixWorld(); cap.updateMatrixWorld();
  }
  const allIn = () => player.crystals >= (L.level.crystals ?? 5);
  function start() {
    if (allIn()) return;
    E.state = 'rumble'; E.t = 0;
    L.toast('Volkan uyanıyor!', 2.2);
    L.sfx('rock_landslide');
    fx.addTrauma(0.5);
    audio.playMusic?.('music_boss_epic_loop', { crossfade: 2 });
  }
  function calmMusic() { audio.playMusic?.(theme.music ?? null, { crossfade: 2 }); }
  function reset() {
    if (E.state === 'idle' || E.state === 'final' || E.state === 'armed') return;
    setLava(LAVA_REST);
    E.state = 'armed'; E.t = 0; E.inBox = true;      // re-arms on the next entry into the inner crater box
    calmMusic();
  }

  L._track.unsubs.push(
    bus.on('crystal', (c) => { if (c === crystal4 && E.state === 'idle') start(); }),
    bus.on('respawn', reset),
    bus.on('faint', reset),
    bus.on('portal:open', () => {
      // hold the gate back while it rises out of the spire (no instant win when ⑤ is taken on the spire top)
      portal.open = false;
      portal.group.visible = true; portal.group.scale.setScalar(0.01);
      E.portalT = 0;
      if (E.state !== 'idle') calmMusic();
      E.state = 'final';
    }),
  );

  const inInnerBox = () => {
    const p = player.pos;
    return Math.abs(p.x - C[0]) <= 6 && Math.abs(p.z - C[1]) <= 6 && p.y >= 14.5 && p.y <= 18.5;
  };

  return {
    E,
    update(dt, t) {
      if (dt <= 0) return;
      const playing = physics.sim.playing;
      E.t += dt;
      switch (E.state) {
        case 'rumble':
          fx.addTrauma(dt * 0.6);
          if (E.t >= 1.2) { E.state = 'rising'; E.t = 0; }
          break;
        case 'rising': {
          const y = Math.min(LAVA_TOP, E.lava + RISE * (physics.assist?.eruption ?? 1) * dt);
          setLava(y);
          if (y >= LAVA_TOP) { E.state = 'risen'; E.t = 0; }
          break;
        }
        case 'risen':
          if (E.t >= 6) { E.state = 'calming'; E.t = 0; L.toast('Volkan sakinleşiyor…', 1.6); calmMusic(); }
          break;
        case 'calming':
        case 'final':
          if (E.lava > LAVA_REST) setLava(Math.max(LAVA_REST, E.lava - SINK * dt));
          if (E.state === 'calming' && E.lava <= LAVA_REST) { E.state = 'armed'; E.t = 0; E.inBox = inInnerBox(); }
          break;
        case 'armed': {
          const inside = playing && inInnerBox();
          if (inside && !E.inBox) { if (E.t > 1.5) start(); else break; }   // an entry inside the 1.5 s grace starts it right after
          E.inBox = inside;
          break;
        }
        default: break;
      }
      // embers + crater glow while the volcano is awake
      const awake = E.state === 'rumble' || E.state === 'rising' || E.state === 'risen';
      if (awake && (E.emberT -= dt) <= 0) {
        E.emberT = 0.18;
        const a = L.rnd() * Math.PI * 2, r = 1 + L.rnd() * 3.5;
        L.spawnParticles(new THREE.Vector3(C[0] + Math.cos(a) * r, E.lava + 0.2, C[1] + Math.sin(a) * r), 6, L.rnd() < 0.5 ? 0xff7a1a : 0xffd166, { speed: 2.5, up: 9, life: 0.9, grav: 7, size: 1.2 });
      }
      craterLight.intensity = E.baseLight * (awake ? 1.8 + 0.4 * Math.sin(t * 9) : 1 + 0.15 * Math.sin(t * 2.3));
      craterLight.position.y = E.lava + 3.2;
      // plume
      const speed = awake ? 2.2 : 1;
      for (const p of puffs) { p.age += dt * speed; if (p.age >= LIFE) p.age -= LIFE; }
      writePlume(speed);
      // portal reveal (1.5 s): rises out of the spire top, then opens
      if (E.portalT >= 0 && E.portalT < 1.5) {
        E.portalT = Math.min(1.5, E.portalT + dt);
        const k = E.portalT / 1.5, e = 1 - Math.pow(1 - k, 3);
        portal.group.scale.setScalar(0.01 + 0.99 * e);
        portal.group.position.y = SPIRE_TOP + 0.4 + (portal.pos.y - SPIRE_TOP - 0.4) * e;
        if (E.portalT >= 1.5) { portal.group.position.y = portal.pos.y; portal.open = true; L.sfx('portal'); }
      }
    },
  };
}
