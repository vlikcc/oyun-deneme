// Hidden test level for the 'signals', 'heart' and 'vista' mechanics (id 'test-signals', ARCHITECTURE §12): every
// primitive of GDD §3.7 / §3.9 / §3.10 on one flat island.
//   walk-in switch 'a' → riser stone → high ledge with the key 'kapi' → door 'kapi' into the walled courtyard (crystal);
//   timed pound switch 'b' (8 s) → two risers → tower with a heart; three lanterns → 'lanterns' count riser;
//   a vista platform, a walk-in secret, a pound secret, a heart on the ground.
// Not in the campaign (hidden: true); registered at runtime by src/engine/mechanics/signals.js (src/levels/index.js is a
// shared file). Reach it with ?level=test-signals or window.__game.loadLevel('test-signals').
const THEME = {
  hdri: 'kloppenheim_06_puresky',
  hdriRotation: 0.6,
  environmentIntensity: 0.4, backgroundIntensity: 1.0,
  sun: { dir: [-0.4, 0.8, 0.3], color: 0xfff1d6, intensity: 2.4 },
  hemi: { sky: 0xdff4ff, ground: 0x6a8f4a, intensity: 0.8 },
  fog: { color: 0xd6ecff, near: 80, far: 220 },
  water: { color: 0x1c8fd1, sunColor: 0xfff1d6, level: -1.2, distortion: 2.2 },
  materials: {
    ground: { tex: 'aerial_grass_rock', tint: 0xe4ffc4, scale: 5, normalScale: 0.7 },
    cliff: { tex: 'rock_face', tint: 0xe8ddd0, scale: 6 },
    stone: { tex: 'stone_tiles_02', tint: 0xfff2e0, scale: 3 },
    accent: { tex: 'coast_sand_01', tint: 0xffefc8, scale: 5 },
  },
  ambience: ['amb_waves'],
  music: null,
  particles: 'none',
  clouds: true,
};

export default {
  id: 'test-signals',
  name: 'Sinyal Deneme Adası',
  order: 98,
  hidden: true,
  subtitle: 'Düğme, anahtar, kapı, fener, kalp, manzara (gizli test)',
  theme: THEME,
  spawn: [0, 0.1, 16], spawnFacing: Math.PI,
  parTime: 120,
  crystals: 1,
  lanterns: 3,                       // hud.js 🏮 slot total (signals.js announces it too)
  coinsTotal: null,
  seed: 5,

  build(L) {
    L.island(0, 0, 0, 24, 8, { beach: true, rocks: 8 });
    L.checkpoint(2, 0, 17, { active: true });
    L.checkpoint(-8, 0, -8);
    L.portal(-6, 2.5, 19);

    // --- walk-in switch 'a' → riser → ledge with the key
    L.sign(-3.5, 0, 10, 'Düğmeye bas —\ntaşlar yükselir!', { rotY: 0.4 });
    L.switch(-6, 0, 8, 'a');
    L.riser(L.box(-10.5, 0.3, 2, 2.6, 2.6, 1.3, { mat: 'stone' }), 2.3, 1.2, 'a');
    L.box(-14.5, 4.2, 2, 4, 4, 5.2, { mat: { side: 'cliff', top: 'stone' } });
    L.key(-14.5, 5.4, 2, 'kapi');

    // --- door 'kapi' into a walled courtyard (crystal inside)
    L.sign(3.5, 0, -5, 'Anahtarı bul,\nkapıyı aç.', { rotY: -0.3 });
    L.box(-3.75, 5, -8, 3.5, 0.8, 5, { mat: 'stone' });
    L.box(3.75, 5, -8, 3.5, 0.8, 5, { mat: 'stone' });
    L.box(-5.1, 5, -12.7, 0.8, 8.6, 5, { mat: 'stone' });
    L.box(5.1, 5, -12.7, 0.8, 8.6, 5, { mat: 'stone' });
    L.box(0, 5, -16.6, 11, 0.8, 5, { mat: 'stone' });
    L.door(0, 0, -8, 4, 0.6, 3.2, 'kapi');
    L.crystal(0, 1.4, -12.5, 0x7dff8a);

    // --- timed pound switch 'b' (8 s) → two risers → tower with a heart
    L.sign(5, 0, 11, 'Havada B ile\ndüğmeye çak!', { rotY: -0.4 });
    L.switch(8, 0, 8, 'b', { pound: true, timed: 8 });
    L.riser(L.box(12, 0.3, 4, 2.6, 2.6, 1.3, { mat: 'stone' }), 2.3, 1, 'b');
    L.riser(L.cyl(15, 0.3, 1, 1.3, 1.3, { mat: 'stone' }), 3.9, 1, 'b');
    L.box(18.5, 5.6, -1.5, 3, 3, 6.6, { mat: { side: 'cliff', top: 'stone' } });
    L.heart(18.5, 6.6, -1.5);
    L.heart(4, 1, 4);

    // --- three lanterns → a riser that rises once all are lit
    L.sign(-12, 0, -4, 'Üç feneri yak!', { rotY: 0.6 });
    L.lantern(-18, -8, 'f1');
    L.lantern(-16, -14, 'f2');
    L.lantern(-10, -18, 'f3');
    L.riser(L.box(-4, 0.3, -20, 3, 3, 1.3, { mat: 'stone' }), 2, 1.5, 'lanterns');
    L.coinLine([-5, 3.4, -20], [-3, 3.4, -20], 3);

    // --- vista platform, secrets
    L.box(14, 2.4, 14, 4, 4, 3.4, { mat: { side: 'cliff', top: 'stone' } });
    L.vista(14, 2.4, 14, { title: 'Deneme Manzarası', yaw: Math.PI / 4, pitch: 0.38, dist: 20 });
    L.secret(-19, 0, 12, { coins: 8 });
    L.secret(18, 0, -12, { coins: 6, pound: true });

    L.coinArc([-2, 1, 12], [2, 1, 12], 5, 1.5);
    L.scatter('flowers', { center: [0, 0], rMin: 4, rMax: 20, count: 24, y: 0 });
  },

  testPath: [
    { at: [0, 0.1, 16], via: 'walk', note: 'spawn' },
    { at: [-6, 0, 10], via: 'walk', note: "switch 'a'" },
    { at: [-9, 0, 5], via: 'walk', note: 'riser foot' },
    { at: [-14.5, 4.2, 2], via: 'riser', note: 'key ledge (riser a)' },
    { at: [0, 0, -5], via: 'walk', note: 'door' },
    { at: [0, 0, -12.5], via: 'walk', note: 'crystal (door open)' },
    { at: [-14, 0, -10], via: 'walk', note: 'lanterns' },
    { at: [8, 0, 10], via: 'walk', note: "pound switch 'b'" },
    { at: [18.5, 5.6, -1.5], via: 'riser', note: 'heart tower (risers b)' },
    { at: [11, 0, 14], via: 'walk', note: 'vista foot' },
    { at: [14, 2.4, 14], via: 'jump', note: 'vista' },
    { at: [-6, 0, 16], via: 'walk', note: 'portal' },
  ],
};
