// Island 6 — 'gok' · Gökyüzü Takımadaları (GDD §2.9). Floating islands over a cloud sea: no water pass, a fall below
// y −30 costs one heart ("Bulutlara düştün!", engine E3) and respawns at the last flag.
// New toys: updraft (B → C, hub → tower), wind (the walled garden G), orbiter (E → F, past the whale).
// Reused: cannon (C → D, F → G), crumble clouds (D → E), bounce clouds (hub → B, C → the hidden cloud).
// Layout coordinates are GDD §2.9's; the few nudges (and why) are marked "GDD nudge" below.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const THEME = {
  hdri: 'kloofendal_43d_clear_puresky',
  hdriRotation: 0,
  environmentIntensity: 0.35, backgroundIntensity: 1.0,
  sun: { dir: [0.4, 0.8, 0.4], color: 0xffffff, intensity: 2.8 },
  hemi: { sky: 0xe8f6ff, ground: 0x9fb0c0, intensity: 0.9 },
  fog: { color: 0xdff2ff, near: 110, far: 320 },
  water: null,
  fall: { y: -30, kind: 'cloud' },                 // cloud-sea plane at −35 (core.js), death line −30
  materials: {
    ground: { tex: 'aerial_grass_rock', tint: 0xd8ffb8, scale: 4, normalScale: 0.7 },
    cliff: { tex: 'rock_face_03', tint: 0xd8ccc0, scale: 4 },          // island sides / undersides
    stone: { tex: 'weathered_planks', tint: 0xffffff, scale: 2 },       // planks
    accent: { tex: 'marble_cliff_01', tint: 0xe8f4ff, scale: 4 },       // the wind tower
    boulder: { tex: 'marble_cliff_01', tint: 0xf2f6fa, scale: 1.2 },    // the garden wall stones (L.rock 'low')
  },
  ambience: ['wind_sky_loop', 'wind_airy'],
  music: 'music_tropical_dawn',
  particles: 'sparkles',
  clouds: true,
};

// Islands: [x, top, z, r, h] (GDD §2.9). Every one is a tapered L.cyl with rock_face_03 sides plus a rock cone under it.
const HUB = [0, 0, 0, 9, 6];
const B = [22, 5, 0, 6, 6];
const C = [31, 12, -10, 5, 6];
const D = [18, 18, -32, 7, 6];
const E = [-2, 20, -36, 6, 6];
const F = [-28, 22, -14, 6, 6];
const G = [-14, 8, 22, 6, 6];
const ISLANDS = [HUB, B, C, D, E, F, G];

// Orbiters E → F (GDD: centre (−15, 22.3, −25), r 13, period 16, phase 0 / 0.5)
const ORBIT_C = [-15, 22.3, -25], ORBIT_R = 13, ORBIT_T = 16;
// The whale on E (bronze_whale_statue: a whale on a twisted stem; body along the model's z, head +z).
// GDD nudges: scale 5 (not 7 — at 7 this model's back is 5.6 m up), body turned along +x (rotY π/2, so the back and fin
// colliders are honest AABBs), and it stands on E's far side: the GDD's back box (−3, 23, −36) sat inside the orbiters'
// sweep (a rider's head would hit it). The orbiters now pass right beside it ("riding the orbiter past the whale").
const WHALE = { x: 0.5, y: 20, z: -38.5, scale: 5, rotY: Math.PI / 2 };
const WHALE_BACK = [-0.5, 24, -38.5];        // top of the back collider (x −2.5 … 1.5, z ± 1.2)
const FIN = [-0.25, 22.2, -36.2];            // cloud step under the south pectoral fin

// G's low garden wall (GDD: "0.6 m rim"): AABB colliders only, so the rim is 13 blocks on the downwind half-circle
// (the wind pushes +x) rendered as one instanced batch of rocks.
const RIM = [];
for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (i / 12) * Math.PI; RIM.push([G[0] + Math.cos(a) * 5.55, G[2] + Math.sin(a) * 5.55]); }

export default {
  id: 'gok',
  name: 'Gökyüzü Takımadaları',
  order: 6,
  subtitle: 'Bulut denizinin üstünde uçan adalar.',
  theme: THEME,
  spawn: [0, 0.1, 4], spawnFacing: Math.PI,          // faces −z: the wind tower fills the view
  parTime: 240,
  crystals: 5,
  coinsTotal: null,
  seed: 61,

  build(L) {
    const flat = (c, o) => L.assets.flat(c, o);

    // ------------------------------------------------------------ islands
    for (const [x, t, z, r, h] of ISLANDS) L.cyl(x, t, z, r, h, { taper: 0.6, seg: Math.max(24, Math.round(r * 4)) });
    // the wind tower (marble, straight)
    L.cyl(0, 34, -14, 3.5, 44, { mat: 'accent', taper: 0.94, seg: 28 });

    // ------------------------------------------------------------ hub → tower (updraft) ............ crystal 5
    // GDD nudge: plank 1 is 3.4 deep (not 2.6) so it touches the hub rim (no hidden 0.5 m gap at walking speed).
    L.box(-2.5, 0, -10.5, 2.6, 3.4, 0.5, { mat: 'stone' });
    L.box(-4.5, 0, -12.5, 2.6, 2.6, 0.5, { mat: 'stone' });
    L.updraft(-6, -14, 2.5, -8, 37, { lift: 14 });
    L.sign(0, 0, -6, 'Rüzgâr sütunu\nseni yukarı taşır!', { rotY: 0.25 });
    L.coinRing(0, 1, -1.5, 3.5, 8);
    L.coinLine([-2.5, 1, -9.8], [-4.5, 1, -12.5], 2);
    L.coinLine([-5.2, 5, -13.6], [-4.6, 32, -14], 8);
    L.coinRing(0, 35, -14, 2.3, 3);
    L.vista(1.2, 34, -15.2, { title: 'Gökyüzü', yaw: Math.PI, pitch: 0.42, dist: 30 });

    // ------------------------------------------------------------ A → B: planks + bounce cloud ..... crystal 1
    L.box(10.5, 0, 0, 3, 2.6, 0.5, { mat: 'stone' });
    L.box(13.5, 0, 0, 3, 2.6, 0.5, { mat: 'stone' });
    const padB = L.bouncePad(15.5, 0.45, 0, 1.2, 27);
    L.coinLine([10.5, 1, 0], [13.5, 1, 0], 2);
    L.coinLine([15.5, 3, 0], [16.2, 7.5, 0], 3);
    L.coinRing(22, 6, 0, 3, 6);

    // ------------------------------------------------------------ B → C: updraft ...................... crystal 2
    L.updraft(28.5, -4.5, 2.5, -6, 15, { lift: 14 });
    L.coinLine([28.5, 8, -4.5], [29, 14, -5.5], 4);
    L.coinLine([32.5, 13, -8], [30.5, 13, -12.5], 3);

    // secret: a hollow cloud NE of C, reached with a bounce cloud on C (GDD: L.secret(36, 14, −2, {coins: 10}))
    const padC = L.bouncePad(33.5, 12.45, -7, 1, 27);
    const sx = 36, sy = 14, sz = -2;
    const cloudFloor = L.cyl(sx, sy, sz, 2.7, 1.2, { mat: { color: 0xffffff, topColor: 0xf6fbff }, taper: 0.7, seg: 18 });
    for (const [x, z, w, d] of [[sx, sz - 2.9, 6.2, 0.6], [sx, sz + 2.9, 6.2, 0.6], [sx - 2.9, sz, 0.6, 5.2], [sx + 2.9, sz, 0.6, 5.2]]) {
      L.box(x, sy + 2.2, z, w, d, 2.6, { mat: { color: 0xffffff } }).mesh.visible = false;   // walls of the hollow (puffs show them)
    }
    L.secret(sx, sy, sz, { coins: 10, ringR: 1.5 });

    // ------------------------------------------------------------ C → D: cannon
    const cC = L.cannon(33, 12, -12, { to: [18, 18.1, -32], apex: 10 });
    cC.coins(8);
    L.coinRing(18, 19, -32, 4.6, 6);
    L.heart(20, 19, -30);

    // ------------------------------------------------------------ D → E: crumble clouds ............... crystal 3
    for (const [x, t, z] of [[8, 18.4, -31], [5, 18.9, -33.5]]) {
      L.crumble(L.box(x, t, z, 2.6, 2.6, 0.7), { skin: 'cloud', delay: 1.2, respawn: 5 });
      L.coin(x, t + 1.1, z);
    }
    // the whale (hero prop): a cloud step under its fin, then its back (crystal 3); the stem blocks like the statue does
    const whale = L.prop('bronze_whale_statue', WHALE.x, WHALE.y, WHALE.z, { scale: WHALE.scale, rotY: WHALE.rotY, tint: 0xffffff });
    whale.loaded.then((m) => m?.traverse((o) => { if (o.isMesh) { o.material.color.set(0xe0b77a); o.material.metalness = 0.45; o.material.roughness = 0.45; o.material.envMapIntensity = 1.4; } }));
    L.cyl(FIN[0], FIN[1], FIN[2], 1.3, 1.2, { mat: { color: 0xffffff, topColor: 0xf6fbff }, taper: 0.75, seg: 16 }).mesh.visible = false;
    L.box(WHALE_BACK[0], WHALE_BACK[1], WHALE_BACK[2], 4, 2.4, 1.2, { mat: { color: 0xc9a46a } }).mesh.visible = false;
    L.cyl(WHALE.x, WHALE.y + 2.6, WHALE.z, 0.7, 2.6, { mat: { color: 0xc9a46a } }).mesh.visible = false;
    L.coin(FIN[0], FIN[1] + 1, FIN[2]); L.coin(1.2, WHALE_BACK[1] + 1, WHALE_BACK[2]);
    L.coin(-4, 21, -33.5);   // orbiter boarding spot

    // ------------------------------------------------------------ E → F: orbiters ...................... crystal 4
    // GDD: clockwise; cw:false here means the E → F half runs over the open sky, away from the tower (movers.js notes
    // the GDD formula's sign is reversed anyway). Both platforms are 3 × 3 at top 22.3 (hop on from E's 20, walk off on F's 22).
    for (const phase of [0, 0.5]) L.orbiter(ORBIT_C, ORBIT_R, ORBIT_T, { phase, cw: false, mat: { side: 0xf1f6ff, top: 0xffffff } });
    for (const deg of [-70, -100, -130, -160, -190]) { const a = deg * Math.PI / 180; L.coin(ORBIT_C[0] + Math.cos(a) * ORBIT_R, ORBIT_C[1] + 1.1, ORBIT_C[2] + Math.sin(a) * ORBIT_R); }
    L.coinRing(-28, 23, -14, 3.5, 5);

    // ------------------------------------------------------------ F → G: cannon, the windy garden
    const cF = L.cannon(-30, 22, -12, { to: [-14, 8.1, 22], apex: 6 });
    cF.coins(8);
    L.wind({ x: G[0], y: G[1], z: G[2], w: 11, h: 3, d: 11 }, [1, 0, 0], 3.5, { gust: 0.6 });
    L.sign(-16.5, 8, 19.5, 'Rüzgâr iter —\nona karşı yürü!', { rotY: -0.6 });
    L.camHint({ x: G[0], y: G[1], z: G[2], w: 7, h: 3, d: 7 }, -Math.PI / 2);   // look downwind, toward the crystal
    for (const [x, z] of RIM) {
      L.box(x, G[1] + 0.6, z, 1.5, 1.5, 0.6, { mat: { color: 0xcfc8bd } }).mesh.visible = false;
      L.rock(x, z, { kind: 'low', scale: 0.72, y: G[1] - 0.05, rot: [L.rnd(), L.rnd(), L.rnd()] });
    }
    for (const deg of [-60, -40, -20, 20, 40, 60, 0]) { const a = deg * Math.PI / 180; L.coin(G[0] + Math.cos(a) * 4.2, G[1] + 1, G[2] + Math.sin(a) * 4.2); }
    L.coinLine([-18.5, 9, 20], [-18.5, 9, 24], 3);   // upwind: walk against it

    // ------------------------------------------------------------ G → hub: descending planks (drops ≤ 1.5)
    const DOWN = [[-6, 7, 18], [-4.5, 5.5, 14], [-3, 4, 10.5], [-2, 2.5, 7.5]];
    for (const [x, t, z] of DOWN) { L.box(x, t, z, 2.6, 2.6, 0.5, { mat: 'stone' }); L.coin(x, t + 1, z); }

    // ------------------------------------------------------------ crystals (play order)
    L.crystal(22, 6.4, 0, 0xff8fab);                                   // 1 Bulut Köprüsü
    L.crystal(31, 13.4, -10, 0x7dd3fc);                                // 2 Yıldız Kayası
    L.crystal(WHALE_BACK[0], WHALE_BACK[1] + 1.4, WHALE_BACK[2], 0xffd23f);   // 3 Balina Sırtı
    L.crystal(-9.5, 9.4, 22, 0x7dff8a);                                // 4 Gizli Bahçe
    L.crystal(0, 35.4, -14, 0xb197fc);                                 // 5 Rüzgâr Kulesi

    // ------------------------------------------------------------ checkpoints & portal
    L.checkpoint(2, 0, 3, { active: true });
    L.checkpoint(22, 5, 2);
    L.checkpoint(18, 18, -29);
    L.checkpoint(-28, 22, -12);
    L.checkpoint(-14, 8, 25);
    L.portal(4, 2.5, 5, { rotY: -0.5 });

    // ------------------------------------------------------------ enemies: 4 birds, 3 cloud slimes, 1 spiky
    // Hurt knock-back is 9 m/s sideways + 10 m/s up and every edge here is a fall: enemies sit near island centres, birds
    // only dive when Pıtır comes within 4–5 m of their circle, and the windy garden keeps its one slime upwind.
    const CLOUD_SLIME = 0xf4f8ff;
    L.slime(-6, 0, 1, 1.5, CLOUD_SLIME);
    L.slime(-6, 20, -37.2, 1.2, CLOUD_SLIME);
    L.slime(-17.5, 8, 22, 1.2, CLOUD_SLIME);
    L.bat([5, 0, -5.5], { r: 2.2, h: 2.6, skin: 'bird', range: 3 });
    L.bat([24.5, 5, 3], { r: 1.6, h: 2.8, skin: 'bird', range: 3 });
    L.bat([18, 18, -34.5], { r: 2.4, h: 2.8, skin: 'bird', range: 4 });
    L.bat([-28, 22, -14.5], { r: 2.2, h: 2.8, skin: 'bird', range: 4 });
    L.spiky([15, 18, -36], [21, 18, -36], 2.2);

    // ------------------------------------------------------------ decoration
    // bounce clouds: white sides, pink tops
    for (const p of [padB, padC]) p.mesh.material = [flat(0xf7fbff), flat(0xffb3e6)];
    // hub birches stay on the west/south-west rim, off the paths (east exit, tower planks, plank landing, portal)
    L.scatter('birch_young', { center: [0, 0], rMin: 6.6, rMax: 8.4, count: 8, margin: 0, keepClear: [[7, -1, 8], [0, 4, 2.5], [-2.5, -8.5, 3], [-1.5, 7, 3], [-6, 1, 1.5]], fitHeight: 3.2, scale: [0.85, 1.15], tint: 0xcfeab8, collide: 'cyl', r: 0.25, h: 3 });
    L.scatter('flower_white_patch', { center: [0, 0], rMin: 2, rMax: 8, count: 10, margin: 0, keepClear: [[0, 4, 1.5], [2, 3, 1.2]], scale: [0.8, 1.3], tint: 0xa8d488, castShadow: false });
    L.scatter('birch_leaning', { center: [D[0], D[2]], rMin: 4.6, rMax: 6.4, count: 8, y: D[1], margin: 0, keepClear: [[11, -31.5, 2.8], [18, -29, 2], [20, -30, 1.5], [18, -36.5, 4.5]], fitHeight: 5, scale: [0.8, 1.1], collide: 'cyl', r: 0.25, h: 3 });
    L.scatter('topiary_cone', { center: [G[0], G[2]], rMin: 2.4, rMax: 4.6, count: 8, y: G[1], margin: 0, keepClear: [[-14, 22, 2.2], [-9.5, 22, 1.8], [-14, 25, 1.5], [-16.5, 19.5, 1.3], [-17.5, 23.5, 1.8], [-18.5, 22, 1.5]], scale: [0.8, 1.15], collide: 'cyl', r: 0.35, h: 1.8 });
    L.scatter('flower_white_patch', { center: [F[0], F[2]], rMin: 1.5, rMax: 5, count: 8, y: F[1], margin: 0, keepClear: [[-30, -12, 2], [-28, -12, 1]], scale: [0.8, 1.2], tint: 0xa8d488, castShadow: false });
    L.scatter('flowers', { center: [B[0], B[2]], rMin: 1.5, rMax: 5.4, count: 14, y: B[1], margin: 0, colors: [0xffffff, 0xffb3e6, 0xfff1b8] });
    L.scatter('flowers', { center: [E[0], E[2]], rMin: 1, rMax: 5.4, count: 12, y: E[1], margin: 0, colors: [0xffffff, 0xc8f0ff, 0xffb3e6] });
    L.scatter('flowers', { center: [G[0], G[2]], rMin: 1, rMax: 4.8, count: 14, y: G[1], margin: 0, colors: [0xffffff, 0xffb3e6, 0xfff1b8, 0xa78bfa] });
    L.scatter('grass', { center: [C[0], C[2]], rMin: 1, rMax: 4.6, count: 10, y: C[1], margin: 0 });
    L.scatter('grass', { center: [D[0], D[2]], rMin: 1, rMax: 6.4, count: 14, y: D[1], margin: 0 });
    L.scatter('grass', { center: [F[0], F[2]], rMin: 1, rMax: 5.4, count: 12, y: F[1], margin: 0 });
    for (const [x, z, ry] of [[6.2, 6.2, 0.4], [2.2, 7.2, -0.3]]) L.prop('Lantern_01', x, 0, z, { fitHeight: 1.1, rotY: ry });
    // floating rock chunks in the void between the islands (one instanced batch)
    L.scatter('cliff_block', { center: [4, -10], rMin: 14, rMax: 46, count: 10, y: -4, margin: 4, scale: [1.2, 2.6], castShadow: false, tint: 0xd8ccc0 });
    L.clouds(16, { rMin: 60, rSpread: 70, yMin: -14, ySpread: 52 });

    // the hollow cloud's puffs (one merged mesh, no collider of its own)
    const puffs = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, s = 0.95 + L.rnd() * 0.5;
      puffs.push(new THREE.IcosahedronGeometry(s, 1).translate(sx + Math.cos(a) * 2.75, sy + 0.9 + L.rnd() * 0.7, sz + Math.sin(a) * 2.75));
    }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; puffs.push(new THREE.IcosahedronGeometry(1.3, 1).translate(sx + Math.cos(a) * 1.8, sy - 1.2, sz + Math.sin(a) * 1.8)); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; puffs.push(new THREE.IcosahedronGeometry(0.75 + L.rnd() * 0.25, 1).translate(FIN[0] + Math.cos(a) * 0.95, FIN[1] - 0.45, FIN[2] + Math.sin(a) * 0.75)); }
    puffs.push(new THREE.IcosahedronGeometry(1.1, 1).scale(1.2, 0.75, 1).translate(FIN[0], FIN[1] - 0.95, FIN[2]));
    const puffGeo = L.own(mergeGeometries(puffs, false)); puffs.forEach((g) => g.dispose());
    const puffMesh = new THREE.Mesh(puffGeo, flat(0xffffff, { roughness: 1, emissive: 0x9fb3c8, emissiveIntensity: 0.25 }));
    puffMesh.castShadow = true; puffMesh.receiveShadow = true;
    L.add(puffMesh);

    // towering cloud banks rising out of the cloud sea (one merged mesh, slowly turning round the archipelago)
    const banks = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + L.rnd() * 0.3, r = 120 + L.rnd() * 60, y = -34 + L.rnd() * 6;
      for (let k = 0; k < 5; k++) {
        const s = 9 + L.rnd() * 9;
        banks.push(new THREE.IcosahedronGeometry(s, 1).scale(1, 0.75, 1).translate(Math.cos(a) * r + (k - 2) * 10, y + L.rnd() * 8 + (k === 2 ? 6 : 0), Math.sin(a) * r + (L.rnd() - 0.5) * 10));
      }
    }
    const bankMesh = new THREE.Mesh(L.own(mergeGeometries(banks, false)), flat(0xffffff, { roughness: 1, emissive: 0xc8d8e8, emissiveIntensity: 0.35 }));
    banks.forEach((g) => g.dispose());
    bankMesh.castShadow = false; bankMesh.receiveShadow = false;
    L.add(bankMesh);
    L.dynamic({ update(dt) { bankMesh.rotation.y += dt * 0.006; } });

    // rock cones under every island (visual only; built last so the scatters above never see their colliders)
    for (const [x, t, z, r, h] of ISLANDS) L.cyl(x, t - h, z, r * 0.6, r * 1.5, { taper: 0.06, seg: Math.max(12, Math.round(r * 2.4)), noSolid: true, castShadow: false });
    L.cyl(0, -10, -14, 3.5 * 0.94, 7, { mat: 'cliff', taper: 0.08, seg: 16, noSolid: true, castShadow: false });
  },

  // Fixed ground only (smoke probes after ~4 s of play; movers / crumble clouds are never waypoints). 'jump' ≤ 6.5 m across /
  // ≤ 2.5 m up; 'bounce' / 'updraft' / 'cannon' / 'crumble' / 'orbiter' / 'fall' carry no reach rule (see notes).
  testPath: [
    { at: [0, 0.1, 4], via: 'walk', note: 'spawn (hub)' },
    { at: [8, 0, 0], via: 'walk', note: 'hub east rim' },
    { at: [10.5, 0, 0], via: 'walk', note: 'plank A→B 1' },
    { at: [13.5, 0, 0], via: 'walk', note: 'plank A→B 2' },
    { at: [15.5, 0.45, 0], via: 'walk', note: 'bounce cloud' },
    { at: [19, 5, 0], via: 'bounce', note: 'island B (bounce 27 ≈ 8 m, B is +5)' },
    { at: [22, 5, 0], via: 'walk', note: 'crystal 1 Bulut Köprüsü' },
    { at: [26.5, 5, -2.5], via: 'walk', note: 'B east rim, step into the updraft' },
    { at: [31, 12, -10], via: 'updraft', note: 'island C — crystal 2 Yıldız Kayası (updraft to 15, drift onto C)' },
    { at: [33.5, 12.45, -7], via: 'walk', note: 'bounce cloud on C (secret detour)' },
    { at: [36, 14, -2], via: 'bounce', note: 'hollow cloud — secret coins' },
    { at: [32.8, 12, -6.2], via: 'jump', note: 'back on C (hop over the puff wall, drop 2)' },
    { at: [33, 13.4, -12], via: 'jump', note: 'cannon C drum' },
    { at: [18, 18, -32], via: 'cannon', note: 'island D (cannon lands on [18, 18.1, −32])' },
    { at: [20, 18, -30], via: 'walk', note: 'heart' },
    { at: [11.5, 18, -31.5], via: 'walk', note: 'D west rim' },
    { at: [3, 20, -35], via: 'crumble', note: 'island E over two crumble clouds (gaps ≤ 2 m, rises ≤ 1.1)' },
    { at: FIN, via: 'jump', note: 'cloud step under the whale fin (+2.2)' },
    { at: WHALE_BACK, via: 'jump', note: 'whale back — crystal 3 Balina Sırtı' },
    { at: [-4.5, 20, -33], via: 'walk', note: 'E north-west rim: orbiter boarding (platform top 22.3, +2.3)' },
    { at: [-25, 22, -16], via: 'orbiter', note: 'island F (ride half an orbit, walk off)' },
    { at: [-28.5, 22, -13.5], via: 'walk', note: 'F, by cannon F' },
    { at: [-30, 23.4, -12], via: 'jump', note: 'cannon F drum' },
    { at: [-14, 8, 22], via: 'cannon', note: 'island G (cannon lands on [−14, 8.1, 22])' },
    { at: [-9.5, 8, 22], via: 'walk', note: 'crystal 4 Gizli Bahçe (wind pushes +x toward it)' },
    { at: [-6, 7, 18], via: 'jump', note: 'over the 0.6 m rim onto plank 1' },
    { at: [-4.5, 5.5, 14], via: 'jump', note: 'plank 2' },
    { at: [-3, 4, 10.5], via: 'jump', note: 'plank 3' },
    { at: [-2, 2.5, 7.5], via: 'jump', note: 'plank 4' },
    { at: [-1, 0, 4], via: 'jump', note: 'back on the hub' },
    { at: [-2.5, 0, -10], via: 'walk', note: 'tower plank 1' },
    { at: [-4.5, 0, -12.5], via: 'walk', note: 'tower plank 2 (in the updraft)' },
    { at: [0, 34, -14], via: 'updraft', note: 'tower top — crystal 5 Rüzgâr Kulesi, vista' },
    { at: [0, 0, -6], via: 'fall', note: 'jump off south onto the hub (1.5 m gap)' },
    { at: [4, 0, 5], via: 'walk', note: 'portal' },
  ],
};
