// Hidden test level for the 'cannon' + 'geyser' mechanics (id 'test-cannon', ARCHITECTURE §12): excluded from the campaign,
// reachable via ?level=test-cannon or window.__game.loadLevel('test-cannon'). Exercises every feature of GDD §3.4 / §3.8:
//   cannon A  downhill long shot (main island → islet A), coins along the real flight;
//   cannon B  return shot from islet A, onto the main island;
//   cannon C  uphill shot (dy +7.6, apex 9) onto the pillar, with an explicit rotY (the barrel yaws toward the target);
//   cannon D  `locked: 'lanterns'` (need 2): toast "Fenerler yanınca ateşlenir." until both pressure plates on the pillar
//             have emitted world signal ('lanterns', 'count', n) — then it fires back down to the main island;
//   geysers   three terraces chained like volkan (period 3, phase 0/1/2, lift 22 ≈ 5.5 m, terraces +4 m) + a strong one
//             (lift 30 ≈ 10 m, period 2.4) next to a high coin ledge.
// tools/cannon-check.mjs asserts every unlocked flight lands within 0.6 m of `to`; tools/smoke.mjs checks the testPath.
import * as THREE from 'three';

const THEME = {
  hdri: 'kloppenheim_06_puresky',
  hdriRotation: 1.2,
  environmentIntensity: 0.4, backgroundIntensity: 1.0,
  sun: { dir: [0.2, 0.6, 0.8], color: 0xffd8b0, intensity: 2.4 },
  hemi: { sky: 0xffe2c0, ground: 0x8a6a4a, intensity: 0.8 },
  fog: { color: 0xffe0c0, near: 80, far: 230 },
  water: { color: 0x1b6f86, sunColor: 0xffb070, level: -1.2, distortion: 1.6 },
  materials: {
    ground: { tex: 'aerial_grass_rock', tint: 0xe4ffc4, scale: 5, normalScale: 0.7 },
    cliff: { tex: 'rock_face', tint: 0xe0c8b0, scale: 6 },
    stone: { tex: 'stone_tiles_02', tint: 0xfff2e0, scale: 3 },
    accent: { tex: 'coast_sand_01', tint: 0xffefc8, scale: 5 },
  },
  ambience: ['amb_waves'],
  music: null,
  particles: 'none',
  clouds: true,
};

export default {
  id: 'test-cannon',
  name: 'Top ve Gayzer Deneme',
  order: 98,
  hidden: true,
  subtitle: 'Mekanik testi: top + gayzer (gizli)',
  theme: THEME,
  spawn: [0, 0.1, 14], spawnFacing: Math.PI,
  camYaw: 0,
  parTime: 120,
  crystals: 3,
  coinsTotal: null,
  seed: 5,

  build(L) {
    // ---------------------------------------------------------------- terrain
    L.island(0, 0, 0, 20, 8, { beach: true, rocks: 8, flowers: 16 });
    L.cyl(40, 1, -20, 5, 4, { mat: { side: 'cliff', top: 'accent' } });                 // islet A
    L.cyl(-30, 9, -14, 4.5, 10, { mat: { side: 'cliff', top: 'stone' } });              // pillar (cannon C target)
    // geyser terraces (west, like volkan): each 4 m higher, ≤ 3 m from the geyser below
    L.box(-12, 4, 10, 5, 5, 4, { mat: { side: 'cliff', top: 'stone' } });
    L.box(-17.5, 8, 5, 5, 5, 8, { mat: { side: 'cliff', top: 'stone' } });
    L.box(-22, 12, 0, 5, 5, 12, { mat: { side: 'cliff', top: 'stone' } });
    L.box(12, 9, 12, 3, 3, 1, { mat: 'stone' });                                        // high ledge over the strong geyser

    // ---------------------------------------------------------------- cannons
    L.sign(3, 0, 5, 'Topun içine gir —\nPıtır uçar!', { rotY: 0.4 });
    const a = L.cannon(6, 0, 0, { to: [40, 1, -20], apex: 8 });
    a.coins(8);
    L.cannon(42.5, 1, -17.5, { to: [-4, 0, 8], apex: 9 });
    const c = L.cannon(-6, 0, 0, { to: [-28, 9, -12], apex: 9, rotY: 0 });
    c.coins(6);
    L.cannon(-32, 9, -16, { to: [2, 0, -8], apex: 4, locked: 'lanterns', need: 2 });

    // two pressure plates standing in for lanterns (signals.js owns the real L.lantern): each counts once
    let lit = 0;
    for (const [px, pz] of [[-27, -15.5], [-31.5, -11]]) {
      const mat = L.own(new THREE.MeshStandardMaterial({ color: 0x8a6a4a, emissive: 0x000000, roughness: 0.6 }));
      const plate = new THREE.Mesh(L.own(new THREE.CylinderGeometry(0.8, 0.85, 0.16, 18)), mat);
      plate.position.set(px, 9.08, pz); plate.receiveShadow = true; L.add(plate);
      L.trigger({ x: px, y: 9, z: pz, w: 1.6, h: 1.5, d: 1.6 }, {
        once: true,
        onEnter() {
          lit++; mat.color.set(0xffd166); mat.emissive.set(0xff9f1c); mat.emissiveIntensity = 0.8;
          L.sfx('switch'); L.toast(`Fener ${lit}/2`, 1);
          L.emit('lanterns', 'count', lit);
        },
      });
    }

    // ---------------------------------------------------------------- geysers
    L.sign(-10.5, 0, 16, 'Gayzer seni fırlatır —\nbekle ve bas!', { rotY: 0.4 });
    L.geyser(-7.5, 0, 14, { period: 3, phase: 0, lift: 22 });
    L.geyser(-13.5, 4, 8.5, { period: 3, phase: 1, lift: 22 });
    L.geyser(-18.5, 8, 3.5, { period: 3, phase: 2, lift: 22 });
    L.geyser(12, 0, 8.5, { period: 2.4, phase: 0.5, lift: 30 });
    L.coinRing(12, 9.8, 12, 1, 5);

    // ---------------------------------------------------------------- collectibles & flow
    L.crystal(38.5, 2.4, -18.5, 0xffd23f);          // islet A (cannon A)
    L.crystal(-30, 10.4, -14, 0x7dd3fc);             // pillar (cannon C)
    L.crystal(-22, 13.4, 0, 0xff8fab);               // terrace 3 (geysers)
    L.checkpoint(2, 0, 13, { active: true });
    L.checkpoint(38, 1, -22.5);
    L.checkpoint(-29, 9, -12.5);
    L.portal(5, 2.5, 13, { rotY: 0 });
  },

  testPath: [
    { at: [0, 0.1, 14], via: 'walk', note: 'spawn' },
    { at: [5, 0, 3.5], via: 'walk', note: 'cannon A foot' },
    { at: [6, 1.4, 0], via: 'jump', note: 'cannon A drum (mouth)' },
    { at: [40, 1, -20], via: 'cannon', note: 'islet A (cannon A target)' },
    { at: [42.5, 2.4, -17.5], via: 'jump', note: 'cannon B drum' },
    { at: [-4, 0, 8], via: 'cannon', note: 'main island (cannon B target)' },
    { at: [-5, 0, 3.5], via: 'walk', note: 'cannon C foot' },
    { at: [-6, 1.4, 0], via: 'jump', note: 'cannon C drum' },
    { at: [-28, 9, -12], via: 'cannon', note: 'pillar (cannon C target)' },
    { at: [-27, 9, -15.5], via: 'walk', note: 'plate 1' },
    { at: [-31.5, 9, -11], via: 'walk', note: 'plate 2' },
    { at: [-32, 10.4, -16], via: 'jump', note: 'cannon D drum (unlocked)' },
    { at: [2, 0, -8], via: 'cannon', note: 'main island (cannon D target)' },
    { at: [-7.5, 0, 14], via: 'walk', note: 'geyser 1' },
    { at: [-12, 4, 10], via: 'geyser', note: 'terrace 1' },
    { at: [-17.5, 8, 5], via: 'geyser', note: 'terrace 2' },
    { at: [-22, 12, 0], via: 'geyser', note: 'terrace 3 (crystal)' },
    { at: [5, 0, 11], via: 'walk', note: 'portal' },
  ],
};
