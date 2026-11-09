// Island 2 — `kumsal` · Gün Batımı Koyu (GDD §2.5). Sunset lagoon: a plank pier with buoy rafts (bob), a shipwreck reached
// by cannon, a sea arch, a palm hill and a treasure islet whose chest opens as Pıtır comes close.
// New mechanics: cannon (L.cannon), bob (L.bob). Reused: bounce pad. Enemies: 4 crabs, 5 slimes, 2 spikies.
//
// Deviations from the GDD §2.5 coordinates (all forced by geometry the GDD numbers overlap; same intent):
//  * west-cliff crate steps: the GDD points (-18, 0) (-20, -1) (-22, 0) sit inside the cliff box (z -9…1), so the steps run
//    along its south face at z 2.8 (x -15 → -24) and the last hop goes north onto the top.
//  * cannon A lands on the open lower deck (-54.5, 1, -24.6) — the GDD target (-58, 1.1, -26) is inside the mast and under the
//    crow's nest (the flight would hit the nest first). The deck is 16 m long (x -65…-49) instead of 14 so cannon B, the
//    landing, the heart and the checkpoint all fit on the open part east of the upper deck; cannon B sits in the south-east
//    corner (-51, -27.4), well off cannon A's approach line (a flight that grazes cannon B's trigger fires it).
//  * bounce pad (-61.5, 3.65, -25.3): the GDD (-61, -24) hangs over the upper deck's edge.
//  * sea-arch walls rise to 9 m so the roof (bottom 9 m, as specified) rests on them; the pocket floor is a sand box level
//    with the island top (y 0) so the crab-free arch walk is flat.
//  * the pier is one 33 m plank box (x 2.5…35.5, top 0.35 so it is a walk-up step from the island, engine step-up < 0.4)
//    with a dock landing bridging the island edge; the secret's sand spit top is -0.45 (walk-up from the beach ring -0.8).
//  * an extra checkpoint on the pier end makes a splash between the buoy rafts cheap ("only coins at stake").
//  * old_military_crate.glb is a pair of 0.8 m ammo boxes, not a 2.6 m crate, so the crate steps are plank boxes and the
//    model is used as deck/cliff/dock decoration. Heart and deck checkpoint moved with the deck layout (-50.4, -24.1) /
//    (-55.8, -27.8).
//  * theme: GDD §2.2 values except hemi intensity 1.5 (GDD .7), environmentIntensity 0.6 and lighter sand/rock tints —
//    with the sun only 14° up the flat sand read as dark brown mud at the GDD numbers.
//  * low tier: 2 of the 6 pier lantern heads (x 10, 22) and two decorative crates are skipped (draw budget 250; no rnd() involved).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const THEME = {
  hdri: 'kloppenheim_06_puresky',
  hdriRotation: 1.2,                      // the HDRI sun sits over the pier (sunset, +z)
  environmentIntensity: 0.6, backgroundIntensity: 1.0,     // low sunset sun (y .25): IBL + hemi carry the flat sand
  sun: { dir: [0.2, 0.25, 0.95], color: 0xffb070, intensity: 2.2 },
  hemi: { sky: 0xffd9b0, ground: 0x8a6a4a, intensity: 1.5 },
  fog: { color: 0xffd3ad, near: 70, far: 200 },
  water: { color: 0x1b6f86, sunColor: 0xffa050, level: -1.2, distortion: 1.6 },
  materials: {
    ground: { tex: 'sand_03', tint: 0xffe4c0, scale: 3, normalScale: 0.6, steps: 'sand' },
    cliff: { tex: 'rock_face_03', tint: 0xf0d6c0, scale: 4 },
    stone: { tex: 'weathered_planks', tint: 0xffffff, scale: 2, steps: 'stone' },
    accent: { tex: 'coral_gravel', tint: 0xffffff, scale: 4, steps: 'sand' },
  },
  ambience: ['amb_waves', 'wind_breeze'],
  music: 'music_tropical_steel',
  particles: 'none',
  clouds: true,
};

// Crate steps (plank boxes 2.6², rises 1.4): east of the hill → hill rim, and along the west cliff's south face → its top.
const HILL_STEPS = [[13, 1.4, -1], [13.5, 2.8, -4], [13, 4.2, -7], [12.5, 5.6, -9]];
const CLIFF_STEPS = [[-15, 1.4, 2.8], [-18, 2.8, 2.8], [-21, 4.2, 2.8], [-24, 5.6, 2.8]];
// Buoy rafts (L.bob, amp 0.35, period 3): pier → Fener Kayası, and the east shore → Hazine Adacığı.
const PIER_RAFTS = [[41, 0.6, 27, 0], [46, 0.9, 25, 0.25], [51, 0.6, 27, 0.5], [56, 0.9, 25, 0.75]];
const EAST_RAFTS = [[29, 0.5, -13, 0], [34, 0.8, -17, 0.5]];
// Cannons (GDD §3.4): A cliff → wreck deck, B (return) deck → beach.
const CANNON_A = { at: [-24, 7, -6], to: [-54.5, 1, -24.6], apex: 8 };
const CANNON_B = { at: [-51, 1, -27.4], to: [-12, 0, -10], apex: 9 };
const CHEST = { x: 40, y: 1.5, z: -22, scale: 2.2, rotY: -Math.PI / 2 };   // front (lock side) faces west, toward the rafts
const SUNSET_YAW = Math.atan2(-0.2, -0.95);                                  // camera behind Pıtır, looking into the sun

export default {
  id: 'kumsal',
  name: 'Gün Batımı Koyu',
  order: 2,
  subtitle: 'Gün batımında iskele, batık gemi ve hazine adacığı.',
  theme: THEME,
  spawn: [0, 0.1, 18], spawnFacing: Math.PI,
  camYaw: 0,
  parTime: 210,
  crystals: 5,
  coinsTotal: null,
  seed: 23,

  build(L) {
    const wood = L.assets.pbr('wood');
    const LOW = L.quality.tier === 'low';
    // static colliders that use one material on every face are drawn as one merged mesh per material (see mergeLooks)
    const planks = [], rocks = [];
    const P = (c) => { planks.push(c); return c; }, R = (c) => { rocks.push(c); return c; };

    // ------------------------------------------------------------ main island, hill, west cliff
    L.island(0, 0, 0, 26, 8, { beach: true });                       // sand top, coral-gravel beach ring (top -0.8, r 31)
    L.cyl(4, 7, -6, 8, 7, { seg: 36 });                               // Palmiye Tepesi
    for (const [x, t, z] of HILL_STEPS) P(L.box(x, t, z, 2.6, 2.6, t + 1, { mat: 'stone' }));
    L.box(-22, 7, -4, 10, 10, 8);                                     // west cliff (cannon A on top)
    for (const [x, t, z] of CLIFF_STEPS) P(L.box(x, t, z, 2.6, 2.6, t + 1, { mat: 'stone' }));

    // ------------------------------------------------------------ pier, lanterns, buoy rafts → Fener Kayası
    P(L.box(5, 0.35, 25.2, 6, 3.5, 1.4, { mat: 'stone' }));            // dock landing over the island edge (walk-up step)
    P(L.box(19, 0.35, 28, 33, 2.6, 0.6, { mat: 'stone' }));            // the pier (x 2.5 … 35.5)
    R(L.cyl(61, 2.6, 27, 3, 4, { mat: 'cliff', seg: 14 }));   // rock stack

    // pier posts + lantern posts: one InstancedMesh (wood)
    const posts = [];
    for (let x = 4; x <= 34; x += 3) { posts.push([x, -1.6, 26.85, 0.14, 1.6]); posts.push([x, -1.6, 29.15, 0.14, 1.6]); }
    const LANTERNS = [4, 10, 16, 22, 28, 34];
    for (const x of LANTERNS) posts.push([x, 0.35, 29.5, 0.09, 1.6]);
    {
      const geo = L.own(new THREE.CylinderGeometry(1, 1, 1, 7).translate(0, 0.5, 0));
      const im = new THREE.InstancedMesh(geo, wood, posts.length);
      const m4 = new THREE.Matrix4();
      posts.forEach(([x, y, z, r, h], i) => im.setMatrixAt(i, m4.makeScale(r, h, r).setPosition(x, y, z)));
      im.castShadow = true; im.receiveShadow = true;
      L.add(im);
    }
    // low tier (draw budget 250): every other lantern head only (the posts stay; L.prop draws no rnd())
    for (const x of LANTERNS) if (!LOW || x % 12 === 4 || x === 34) L.prop('Lantern_01', x, 1.95, 29.5, { scale: 3, rotY: 0.4 });
    L.prop('Lantern_01', 62.6, 2.6, 28.2, { scale: 5, rotY: 1.1 });   // "lighthouse" lamp on the rock stack

    // rafts: bob movers + a buoy at one corner + three pontoon drums (one InstancedMesh, follows the bob every frame)
    const rafts = [];
    for (const [x, y, z, phase] of [...PIER_RAFTS, ...EAST_RAFTS]) {
      const m = L.bob([x, y, z], 0.35, 3, { w: 2.6, d: 2.6, phase, mat: 'stone' });
      const buoy = L.prop('ocean_buoy', x + 1.05, y - 1.1, z + 1.05, { scale: 1, rotY: phase * 6 });
      rafts.push({ m, buoy, x, z });
    }
    const DRUM = [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85]];
    const drums = new THREE.InstancedMesh(L.own(new THREE.CylinderGeometry(0.42, 0.42, 1, 12)), L.assets.flat(0xc4573a, { roughness: 0.55, metalness: 0.2 }), rafts.length * DRUM.length);
    drums.castShadow = true; drums.receiveShadow = true; drums.frustumCulled = false;
    L.add(drums);
    const dm4 = new THREE.Matrix4();
    const syncRafts = () => {
      rafts.forEach((r, i) => {
        const top = r.m.max.y;
        r.buoy.position.y = top - 1.1;
        DRUM.forEach(([dx, dz], k) => drums.setMatrixAt(i * DRUM.length + k, dm4.makeScale(1, 2.0, 1).setPosition(r.x + dx, top - 1.7, r.z + dz)));
      });
      drums.instanceMatrix.needsUpdate = true;
    };
    syncRafts();
    L.dynamic({ update: syncRafts });

    // ------------------------------------------------------------ cannons, wreck islet, crow's nest
    const cannonA = L.cannon(CANNON_A.at[0], CANNON_A.at[1], CANNON_A.at[2], { to: CANNON_A.to, apex: CANNON_A.apex });
    cannonA.coins(8);
    const cannonB = L.cannon(CANNON_B.at[0], CANNON_B.at[1], CANNON_B.at[2], { to: CANNON_B.to, apex: CANNON_B.apex });
    cannonB.coins(6);

    P(L.box(-57, 1, -26, 16, 6, 2.2, { mat: 'stone' }));    // lower deck (x -65 … -49)
    P(L.box(-61, 3.2, -27, 8, 6, 2.2, { mat: 'stone' }));    // upper deck (x -65 … -57)
    P(L.box(-57, 1.6, -28.85, 16, 0.3, 0.6, { mat: 'stone' }));                       // rails
    P(L.box(-53, 1.6, -23.15, 8, 0.3, 0.6, { mat: 'stone' }));
    P(L.box(-49.15, 1.6, -26, 0.3, 5.4, 0.6, { mat: 'stone' }));
    {
      // the bow: a visual wedge past the east rail, sloping into the sea (the rail keeps Pıtır on the deck)
      const A = [-49, 1, -29], B = [-49, 1, -23], C = [-49, -1.6, -28.4], D = [-49, -1.6, -23.6], T = [-44.2, 1.7, -26], U = [-45.8, -1.6, -26];
      const tris = [A, B, T, B, D, U, B, U, T, A, T, U, A, U, C];          // top, north side, south side
      const geo = L.own(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
      geo.computeVertexNormals();
      const bow = new THREE.Mesh(geo, L.assets.flat(0x6b4a33, { roughness: 0.9, side: THREE.DoubleSide }));
      bow.castShadow = true; bow.receiveShadow = true;
      L.add(bow);
    }
    L.cyl(-58, 12, -26, 0.4, 12, { mat: { side: wood, top: wood }, seg: 10 });     // mast
    P(L.box(-58, 12, -26, 2.6, 2.6, 0.5, { mat: 'stone' }));                          // crow's nest
    L.bouncePad(-61.5, 3.65, -25.3, 1.2, 32);
    {
      // tattered sail east of the mast (visual only; the bounce path stays west of it)
      const sail = new THREE.Mesh(L.own(new THREE.PlaneGeometry(3.6, 4.6, 6, 6)), L.own(new THREE.MeshStandardMaterial({ color: 0xf1e2c2, roughness: 0.9, side: THREE.DoubleSide })));
      const p = sail.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getY(i) * 0.7 + 1) * 0.35 * (0.5 + p.getX(i) / 3.6));
      sail.geometry.computeVertexNormals();
      sail.position.set(-57.15, 8.4, -26); sail.rotation.y = Math.PI / 2; sail.castShadow = true;
      L.add(sail);
      const yard = new THREE.Mesh(L.own(new THREE.CylinderGeometry(0.12, 0.12, 4.6, 6)), wood);
      yard.rotation.x = Math.PI / 2; yard.position.set(-57.6, 10.7, -26); yard.castShadow = true;
      L.add(yard);
    }
    L.prop('old_military_crate', -63, 3.2, -28.6, { scale: 1.6, rotY: 0.3 });
    if (!LOW) L.prop('old_military_crate', -50.5, 1, -28.2, { scale: 1.3, rotY: -0.2 });
    L.prop('Lantern_01', -56.9, 12, -24.9, { scale: 3 });
    L.scatter('boulder_01', { center: [-57, -26], rMin: 9, rMax: 12, count: 8, y: -1.3, scale: [1.6, 2.6], margin: 0.5, tint: 0xcdbcaa });

    // ------------------------------------------------------------ sea arch (open pocket, roof bottom at 9 m)
    R(L.box(-5, 9, -29, 3, 6, 10, { mat: 'cliff' }));
    R(L.box(5, 9, -29, 3, 6, 10, { mat: 'cliff' }));
    R(L.box(0, 10.5, -29, 13, 6, 1.5, { mat: 'cliff' }));
    L.box(0, 0, -29.5, 7, 7, 1.6, { mat: 'accent' });                               // damp-sand pocket floor
    P(L.cyl(0, 0.3, -31, 1.2, 1.3, { mat: 'stone', seg: 16 }));                        // shell pedestal
    L.prop('lambis_shell', 0.9, 0.3, -31.4, { scale: 7, rotY: 2.2 });

    // ------------------------------------------------------------ treasure islet + chest (opens within 3 m)
    L.cyl(40, 1.5, -22, 5, 4, { mat: { side: 'cliff', top: 'ground' }, seg: 24 });
    const chest = L.prop('treasure_chest', CHEST.x, CHEST.y, CHEST.z, { scale: CHEST.scale, rotY: CHEST.rotY, collide: 'box', w: 1.1, d: 2.0, h: 0.95 });
    L.tree(43, -19.5, { kind: 'palm', scale: 0.8, y: 1.5, height: 4.6, r: 0.3, y0: 0.5, y1: 3.2 });
    L.tree(36.5, -25, { kind: 'palm', scale: 0.7, y: 1.5, height: 3.8, r: 0.28, y0: 0.5, y1: 3 });

    // ------------------------------------------------------------ secret cove (west beach, two leaning boulders)
    L.cyl(-29, -0.45, 19, 4.5, 1.2, { mat: 'accent', seg: 20 });
    for (const [bz, lean] of [[17.2, -0.32], [22.8, 0.32]]) {
      const b = L.prop('boulder_large', -30.5, -0.5, bz, { scale: 1.9, rotY: 0, collide: 'cyl', r: 1.2, h: 2.6, tint: 0xcfa27c });
      b.rotation.x = lean;
    }
    L.prop('palm_leaning', -26.5, -0.45, 16.2, { scale: 1.1, rotY: 2.4 });
    L.prop('palm_leaning', -27, -0.45, 23.4, { scale: 1.0, rotY: 0.9 });
    L.secret(-30, -0.45, 20, { coins: 10 });

    // ------------------------------------------------------------ decoration (seeded)
    const keepClear = [[0, 18, 4.5], [0, 24, 6], [2, 17, 3], [-6, 20, 4], [12, 22, 3], [5, 25, 4], [8, 8, 3], [13, 2, 3], [-13, 6, 3],
      [-12, -10, 3.5], [0, -24, 4], [10, -20, 3], [24, -8, 3.5], [16, -12, 3], [20, -8, 2.5], [-8, 8, 3]];
    L.scatter('trees:palm', { count: 14, rMin: 10, rMax: 20, keepClear, margin: 2.6 });
    L.scatter('palm_young', { count: 8, rMin: 21, rMax: 24.5, keepClear, margin: 2, scale: [0.9, 1.3] });
    for (const [x, z, s] of [[1, -9.5, 0.75], [7.5, -2.8, 0.85], [-0.5, -3.2, 0.7]]) L.tree(x, z, { kind: 'palm', scale: s, y: 7, height: 4.4 * s / 0.8, r: 0.3, y0: 6, y1: 9 });
    L.tree(-18.5, -8, { kind: 'palm', scale: 0.8, y: 7, height: 4.4, r: 0.3, y0: 6, y1: 9 });
    L.scatter('grass_tuft_tall', { count: 26, rMin: 5, rMax: 24, keepClear, margin: 1, scale: [0.7, 1.2], tint: 0xe8dc9a, castShadow: false });
    L.scatter('lambis_shell', { count: 14, rMin: 26.6, rMax: 30.4, y: -0.8, scale: [3, 5], margin: 0.8 });
    L.scatter('boulder_01', { count: 10, rMin: 27.5, rMax: 32, y: -0.9, scale: [1.2, 2.2], margin: 1.2, tint: 0xcdbcaa, keepClear: [[-29, 19, 6], [8, 27, 6], [26, -10, 5]] });
    L.scatter('boulder_01', { center: [-22, -4], rMin: 6.8, rMax: 9, count: 8, y: 0, scale: [0.9, 1.5], margin: 0.4, tint: 0xcdbcaa, keepClear: [[-16, 3, 3], [-19, 5, 4], [-12, -10, 3]] });
    if (!LOW) L.prop('old_military_crate', 7.2, 0.35, 24.3, { scale: 1.3, rotY: 0.2 });
    L.prop('old_military_crate', -25.8, 7, -8.2, { scale: 1.4, rotY: 1.2 });
    L.clouds(12, { rMin: 50, rSpread: 80, yMin: 26 });

    // ------------------------------------------------------------ coins (85 placed + 10 secret = 95)
    L.coinLine([2, 1, 14], [10, 1, 4], 5);                                          // spawn → hill steps
    for (const [x, t, z] of HILL_STEPS) L.coin(x, t + 1, z);
    L.coinRing(4, 8, -6, 3.5, 8);                                                  // hill top
    for (const [x, z] of [[10, -20], [7, -22.5], [4, -24.5], [1.5, -26], [0, -27.5], [0, -29], [-2.2, -30.6]]) L.coin(x, 1, z);   // shell trail
    for (const [x, t, z] of CLIFF_STEPS) L.coin(x, t + 1, z);
    L.coinLine([-56, 2, -26], [-52.5, 2, -25], 3);                              // deck
    L.coinLine([-61.5, 5.5, -25.3], [-59, 11, -25.8], 4);                           // bounce column
    L.coinLine([14, 1, -4], [22, 1, -7], 3);                                        // → east shore
    for (const [x, y, z] of EAST_RAFTS) L.coin(x, y + 1.2, z);
    L.coinRing(40, 2.5, -22, 3.3, 6);                                               // islet
    L.coinLine([3, 1.35, 24.5], [8, 1.35, 25.8], 4);                                // dock
    L.coinLine([7, 1.3, 28], [31, 1.3, 28], 8);                                     // pier
    for (const [x, y, z] of PIER_RAFTS) L.coin(x, y + 1.2, z);
    L.coinRing(61, 3.6, 27, 2, 5);                                                 // rock stack
    L.coinLine([-16, 1, 14], [-24, 0.2, 18], 4);                                    // west beach → secret cove

    // ------------------------------------------------------------ crystals (play order: 4, 3, 2, 5, 1)
    L.crystal(61, 4.0, 27, 0xffa94d);                                              // ① Fener Kayası
    L.crystal(-58, 13.4, -26, 0x5ee6ff);                                           // ② Gözcü Yuvası
    L.crystal(0, 1.7, -31, 0xff8fab);                                              // ③ Deniz Kemeri
    L.crystal(4, 8.4, -6, 0x7dff8a);                                               // ④ Palmiye Tepesi
    const gem5 = L.crystal(CHEST.x, CHEST.y + 0.2, CHEST.z, 0xffd23f);             // ⑤ Hazine Adacığı (rises to y 3.0)
    gem5.base = CHEST.y + 0.2; gem5.group.scale.setScalar(0.01);

    // ------------------------------------------------------------ checkpoints, portal, signs, vista, heart
    L.checkpoint(2, 0, 17, { active: true });
    L.checkpoint(12, 0, 22);
    L.checkpoint(-20, 7, -2);
    L.checkpoint(-55.8, 1, -27.8);
    L.checkpoint(24, 0, -8);
    L.checkpoint(29.5, 0.35, 28.3);                                                // pier end (cheap retry for the rafts)
    L.portal(-6, 2.5, 20, { rotY: 0.3 });
    L.sign(-21, 7, -4.5, 'Topun içine gir —\nPıtır uçar!', { rotY: 0.38 });
    L.sign(33.6, 0.35, 26.95, 'Şamandıralar sallanır —\nzamanla!', { rotY: -Math.PI / 2 });
    L.vista(34.2, 0.35, 28, { title: 'Gün Batımı', yaw: SUNSET_YAW, pitch: 0.12, dist: 15 });
    L.heart(-50.4, 2, -24.1);
    L.camHint({ x: -22, y: 7, z: -4.5, w: 9, h: 3, d: 8 }, Math.atan2(0.82, 0.57));  // cliff top: look along the cannon flight

    // ------------------------------------------------------------ enemies: 4 crabs, 5 slimes, 2 spikies
    L.crab([27.5, -0.8, 4], [28.5, -0.8, -3]);
    L.crab([-11, -0.8, 27.5], [-17, -0.8, 25.2]);
    L.crab([-28, -0.8, -12], [-24, -0.8, -16.5]);
    L.crab([37.6, 1.5, -25], [42.4, 1.5, -25.4], { speed: 2 });
    L.slime(2, 7, -8.5, 2.2);
    L.slime(7, 7, -4.5, 2.2, 0x4cc9f0);
    L.slime(1, 7, -3.5, 1.8, 0xf15bb5);
    L.slime(-19.5, 7, -6.5, 2);
    L.slime(-8, 0, 8, 4, 0x4cc9f0);
    L.spiky([-3, 0, -26], [3, 0, -26], 2.2);
    L.spiky([15, 0, -15], [21, 0, -10], 2.4);

    mergeLooks(L, planks, L.assets.pbr('stone'));
    mergeLooks(L, rocks, L.assets.pbr('cliff'));

    // ------------------------------------------------------------ the chest: lid opens within 3 m, crystal ⑤ rises 1.5 m
    const lid = { pivot: null, k: 0, open: false, t: 0 };
    chest.loaded.then((m) => { if (m) lid.pivot = splitChestLid(L, m); });
    L.trigger({ x: CHEST.x, y: CHEST.y - 0.5, z: CHEST.z, w: 6, h: 4, d: 6 }, {
      once: true,
      onEnter() { lid.open = true; L.sfx('door_unlock'); L.sfx('key_pickup_twinkle'); L.spawnParticles(new THREE.Vector3(CHEST.x, CHEST.y + 1.4, CHEST.z), 18, 0xffd23f); },
    });
    L.dynamic({
      update(dt) {
        if (!lid.open || lid.t >= 1.4) return;
        lid.t = Math.min(1.4, lid.t + dt);
        const a = Math.min(1, lid.t / 1.0), e = a * a * (3 - 2 * a);                 // 1 s tween
        if (lid.pivot) lid.pivot.rotation.x = -1.95 * e;
        const r = Math.max(0, Math.min(1, (lid.t - 0.3) / 1.0)), er = r * r * (3 - 2 * r);
        gem5.base = CHEST.y + 0.2 + 1.3 * er;                                          // rises to y 3.0
        gem5.group.scale.setScalar(Math.max(0.01, er));
      },
    });
  },

  // Play order: hill ④ → arch ③ → cliff, cannon A → wreck ② → cannon B → east rafts → islet ⑤ → pier → rafts → rock ①
  // → portal. Every waypoint is on fixed ground (never on a bob raft — those hops are tagged 'bob').
  testPath: [
    { at: [0, 0.1, 18], via: 'walk', note: 'spawn' },
    { at: [8, 0, 3], via: 'walk', note: 'meadow' },
    { at: [13, 0, 2], via: 'walk', note: 'foot of the hill crate steps' },
    { at: [13, 1.4, -1], via: 'jump', note: 'crate 1' }, { at: [13.5, 2.8, -4], via: 'jump' }, { at: [13, 4.2, -7], via: 'jump' },
    { at: [12.5, 5.6, -9], via: 'jump', note: 'crate 4' },
    { at: [9, 7, -7], via: 'jump', note: 'hill rim' },
    { at: [4, 7, -6], via: 'walk', note: 'hill top, crystal ④ Palmiye Tepesi' },
    { at: [4, 0, -16.5], via: 'walk', note: 'down the hill (drop)' },
    { at: [0, 0, -24], via: 'walk', note: 'arch entrance (spiky lane at z -26)' },
    { at: [0, 0, -28.5], via: 'walk', note: 'arch pocket' },
    { at: [0, 0.3, -31], via: 'walk', note: 'shell pedestal, crystal ③ Deniz Kemeri' },
    { at: [-12, 0, 5], via: 'walk', note: 'west meadow' },
    { at: [-15, 1.4, 2.8], via: 'jump', note: 'cliff crate 1' }, { at: [-18, 2.8, 2.8], via: 'jump' }, { at: [-21, 4.2, 2.8], via: 'jump' },
    { at: [-24, 5.6, 2.8], via: 'jump', note: 'cliff crate 4' },
    { at: [-24, 7, -1], via: 'jump', note: 'cliff top' },
    { at: [-20, 7, -2], via: 'walk', note: 'cliff checkpoint' },
    { at: [-22, 7, -4.5], via: 'walk', note: 'cannon A foot' },
    { at: [-24, 8.4, -6], via: 'jump', note: 'cannon A drum (mouth)' },
    { at: [-54.5, 1, -24.6], via: 'cannon', note: 'wreck lower deck (cannon A target)' },
    { at: [-55.8, 1, -27.8], via: 'walk', note: 'deck checkpoint' },
    { at: [-56.4, 1, -27.5], via: 'walk', note: 'below the upper deck' },
    { at: [-59.5, 3.2, -28.2], via: 'jump', note: 'upper deck' },
    { at: [-61.5, 3.65, -25.3], via: 'walk', note: 'bounce pad' },
    { at: [-58, 12, -26], via: 'bounce', note: "crow's nest, crystal ② Gözcü Yuvası" },
    { at: [-53, 1, -26.5], via: 'walk', note: 'back down on the deck (drop)' },
    { at: [-51, 2.4, -27.4], via: 'jump', note: 'cannon B drum' },
    { at: [-12, 0, -10], via: 'cannon', note: 'beach (cannon B target)' },
    { at: [24, 0, -8], via: 'walk', note: 'east shore checkpoint' },
    { at: [37, 1.5, -19.5], via: 'bob', note: 'two east buoy rafts → islet' },
    { at: [38.6, 1.5, -22], via: 'walk', note: 'in front of the chest, crystal ⑤ Hazine Adacığı rises' },
    { at: [24, 0, -8], via: 'bob', note: 'rafts back to the east shore' },
    { at: [12, 0, 22], via: 'walk', note: 'pier root checkpoint' },
    { at: [5, 0.35, 25], via: 'walk', note: 'dock landing' },
    { at: [29.5, 0.35, 28], via: 'walk', note: 'pier end checkpoint' },
    { at: [34.5, 0.35, 28], via: 'walk', note: 'pier end vista' },
    { at: [60, 2.6, 27], via: 'bob', note: 'four buoy rafts → rock stack, crystal ① Fener Kayası' },
    { at: [34.5, 0.35, 28], via: 'bob', note: 'rafts back to the pier' },
    { at: [-4, 0, 19], via: 'walk', note: 'portal' },
  ],
};

/**
 * mergeLooks(L, colliders, material): draw many static single-material L.box / L.cyl colliders as ONE mesh (their
 * metre-scaled UVs are kept). The colliders and their (now hidden) meshes stay registered, so physics, the camera
 * pull-in, the blob shadow and test.groundBelow are unchanged (three's Raycaster ignores `visible`). Saves ~2 draws each.
 */
function mergeLooks(L, list, material) {
  if (!list.length) return null;
  const geos = list.map((c) => {
    c.mesh.updateMatrixWorld(true);
    const g = c.mesh.geometry.clone().applyMatrix4(c.mesh.matrixWorld);
    g.clearGroups();
    c.mesh.visible = false;
    return g;
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  if (!merged) { list.forEach((c) => { c.mesh.visible = true; }); return null; }
  const mesh = new THREE.Mesh(L.own(merged), material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  L.add(mesh);
  return mesh;
}

/**
 * treasure_chest.glb is one joined mesh (lid baked in). Split it at load: connected components whose lowest point is in the
 * top third of the model are the lid; the lid goes on a pivot at its back-bottom edge (the hinge). Returns the pivot
 * (rotation.x < 0 opens it) or null when the model does not look like expected (the crystal still rises).
 */
function splitChestLid(L, root) {
  let src = null;
  root.traverse((o) => { if (o.isMesh && !src) src = o; });
  if (!src || !src.geometry.index) return null;
  const g = src.geometry, pos = g.attributes.position, idx = g.index, n = pos.count;
  // src-local → root-local matrix
  src.updateMatrix();
  const M = src.matrix.clone();
  for (let p = src.parent; p && p !== root; p = p.parent) { p.updateMatrix(); M.premultiply(p.matrix); }
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let i = 0; i < idx.count; i += 3) {
    const a = find(idx.getX(i)), b = find(idx.getX(i + 1));
    if (a !== b) parent[b] = a;
    const c = find(idx.getX(i + 2)), ra = find(a);
    if (c !== ra) parent[c] = ra;
  }
  const v = new THREE.Vector3(), minY = new Map();
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(M);
    lo = Math.min(lo, v.y); hi = Math.max(hi, v.y);
    const r = find(i);
    minY.set(r, Math.min(minY.get(r) ?? Infinity, v.y));
  }
  const cut = lo + (hi - lo) * 0.66;
  const isLid = (r) => minY.get(r) >= cut;
  const bodyIdx = [], lidIdx = [];
  let hz = Infinity, hy = Infinity;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
    if (isLid(find(a))) {
      lidIdx.push(a, b, c);
      for (const k of [a, b, c]) { hz = Math.min(hz, pos.getZ(k)); hy = Math.min(hy, pos.getY(k)); }
    } else bodyIdx.push(a, b, c);
  }
  if (!lidIdx.length || !bodyIdx.length) return null;
  const make = (list) => {
    const out = new THREE.BufferGeometry();
    for (const [k, attr] of Object.entries(g.attributes)) out.setAttribute(k, attr.clone());
    out.setIndex(list);
    out.computeBoundingSphere();
    return L.own(out);
  };
  // a frame in src-local space (same transform as the original node); body + hinged lid inside it
  const frame = new THREE.Group();
  frame.matrixAutoUpdate = false; frame.matrix.copy(src.matrix);
  const body = new THREE.Mesh(make(bodyIdx), src.material);
  const lidMesh = new THREE.Mesh(make(lidIdx), src.material);
  body.castShadow = lidMesh.castShadow = true; body.receiveShadow = lidMesh.receiveShadow = true;
  const pivot = new THREE.Group();
  pivot.position.set(0, hy, hz);
  lidMesh.position.set(0, -hy, -hz);
  pivot.add(lidMesh);
  frame.add(body, pivot);
  src.parent.add(frame);
  src.visible = false;
  return pivot;
}
