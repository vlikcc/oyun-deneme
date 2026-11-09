// Hidden mechanic test level 'test-boss' (ARCHITECTURE §12): exercises src/engine/mechanics/boss.js (Kral Pelte, GDD §3.11)
// and src/engine/mechanics/enemies-extra.js (crab, bat/bird, snow/lava boulder, GDD §3.12). Excluded from the campaign
// (hidden: true); reachable with ?level=test-boss (boss.js registers it, levels/index.js does not import it).
// Layout (main island r 28, top 0): spawn (0, 0.1, 22) facing −z; snowball lane z = 6 (x −26 → −8) in front of crystal 1;
// crabs and a bat on the east lawn; a bird over the lava-rock strip (x 18) with its lava boulder lane; the boss arena
// (centre (0, 0, −10), r 8) starts on the `switch:boss` signal from the trigger at its north edge.

const THEME = {
  hdri: 'kloppenheim_06_puresky',      // assets/hdri/kloppenheim_06_puresky_1k.hdr
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
  id: 'test-boss',
  name: 'Kral Pelte Deneme',
  order: 99,
  hidden: true,
  subtitle: 'Boss ve yeni düşmanlar (gizli test)',
  theme: THEME,
  spawn: [0, 0.1, 22], spawnFacing: Math.PI,
  parTime: 120,
  crystals: 2,                       // crystal 1 + the boss's reward crystal (built hidden by L.boss)
  coinsTotal: null,
  seed: 11,

  build(L) {
    L.island(0, 0, 0, 28, 8, { beach: true, rocks: 8, flowers: 18 });

    // ---- arena: a ring of flowers + 8 low stones on the rim (decor, outside the 8 m fight circle)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      L.cyl(Math.cos(a) * 10, 0.5, -10 + Math.sin(a) * 10, 0.7, 1.0, { mat: 'stone', seg: 10 });
    }
    L.sign(4, 0, 2.5, 'Halkanın üstünden zıpla,\nsersemleyince üstüne bas!', { rotY: 0 });
    const king = L.boss(0, 0, -10, { arenaR: 8, waitFor: { name: 'switch', id: 'boss', value: true }, portal: [0, 2.5, -1.5, 0], crystalColor: 0xff7ad9 });
    L.trigger({ x: 0, y: 0, z: 3.5, w: 18, h: 4, d: 3 }, { once: true, onEnter: () => L.emit('switch', 'boss', true) });
    L.checkpoint(-3, 0, 3);
    L.on('boss', 'dead', () => L.toast('Ada kurtarıldı!', 1.5));
    king.testName = 'Kral Pelte';

    // ---- snowball lane in front of crystal 1 (jump it: r 1.1 < jump height 3.2)
    L.enemy('boulder', [-26, 0, 6], [-8, 0, 6], { every: 5, duration: 3, r: 1.1, skin: 'snow', delay: 0.5 });
    L.crystal(-17, 1.2, 0, 0x7dd3ff);
    L.coinLine([-20, 1, 1], [-14, 1, 1], 4);

    // ---- east lawn: two crabs and a bat
    L.enemy('crab', [12, 0, 14], [19, 0, 14], { speed: 2.4 });
    L.crab([10, 0, 8], [10, 0, 2], { speed: 2 });
    L.enemy('bat', [-12, 0, 16], { r: 4, h: 1.5, skin: 'bat' });

    // ---- lava-rock strip with a lava boulder lane and a bird circling above it
    L.box(18, 0.5, -12, 4, 16, 1.0, { mat: 'stone' });
    L.boulder([18, 0.5, -19], [18, 0.5, -5], { every: 6, duration: 2.5, r: 1.1, skin: 'lava', delay: 2 });
    L.bat([22, 0, -12], { r: 3.5, h: 1.6, skin: 'bird', cw: false });
    L.coinRing(18, 1.5, -12, 2, 6);

    L.checkpoint(2.2, 0, 21, { active: true });
    L.scatter('grass', { center: [0, 0], rMin: 4, rMax: 24, count: 30, keepClear: [[0, -10, 10]] });
  },

  // fixed ground only (arena floor and lawn are part of the main island)
  testPath: [
    { at: [0, 0.1, 22], via: 'walk', note: 'spawn' },
    { at: [-6, 0, 12], via: 'walk', note: 'west lawn' },
    { at: [-17, 0, 2], via: 'walk', note: 'crystal 1 behind the snowball lane' },
    { at: [-2, 0, 3.5], via: 'walk', note: 'arena trigger (boss lands)' },
    { at: [0, 0, -10], via: 'walk', note: 'boss reward crystal (arena centre)' },
    { at: [0, 0, -1.5], via: 'walk', note: 'portal (placed when the boss bursts)' },
    { at: [15, 0, -12], via: 'walk', note: 'beside the lava strip' },
    { at: [18, 0.5, -12], via: 'jump', note: 'lava strip (boulder lane)' },
  ],
};
