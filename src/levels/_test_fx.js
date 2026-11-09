// Hidden test level 'test-fx' for src/engine/ambientfx.js (ambient particle systems + moon sprite).
// The particle kind is switchable with ?fx=snow|embers|leaves|fireflies|sparkles|none (default 'snow'); ?moon=1 forces a
// night sky with the moon sprite (fireflies are always shown at night with the moon). Reachable with ?level=test-fx or
// window.__game.loadLevel('test-fx') once registered in src/levels/index.js.
const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const FX = ['snow', 'embers', 'leaves', 'fireflies', 'sparkles', 'none'].includes(q.get('fx')) ? q.get('fx') : 'snow';
const NIGHT = FX === 'fireflies' || q.get('moon') === '1';

const DAY = {
  hdri: FX === 'snow' ? 'snow_field_puresky' : FX === 'embers' ? 'wasteland_clouds_puresky' : 'kloofendal_48d_partly_cloudy_puresky',
  hdriRotation: 0.3, environmentIntensity: 0.35, backgroundIntensity: 1.0,
  sun: { dir: [0.5, 0.75, 0.35], color: 0xfff1d6, intensity: 2.6 },
  hemi: { sky: 0xdff4ff, ground: 0x6a8f4a, intensity: 0.8 },
  fog: { color: 0xd6ecff, near: 80, far: 220 },
};
const NIGHT_SKY = {   // GDD §2.3 fener row
  hdri: 'kloppenheim_02_puresky', hdriRotation: 0.8, environmentIntensity: 0.35, backgroundIntensity: 1.2,
  sun: { dir: [-0.4, 0.7, 0.5], color: 0x9fb8ff, intensity: 0.9, moon: true },
  hemi: { sky: 0x33457a, ground: 0x0e1424, intensity: 0.7 },
  fog: { color: 0x161f45, near: 40, far: 150 },
};

const THEME = {
  ...(NIGHT ? NIGHT_SKY : DAY),
  water: NIGHT ? { color: 0x0b2650, sunColor: 0xa8c4ff, level: -1.2, distortion: 1.4 } : { color: 0x1c8fd1, sunColor: 0xfff1d6, level: -1.2, distortion: 2.2 },
  materials: {
    ground: { tex: 'aerial_grass_rock', tint: NIGHT ? 0x8ea0d0 : 0xe4ffc4, scale: 5, normalScale: 0.7 },
    cliff: { tex: 'rock_face', tint: 0xe8ddd0, scale: 6 },
    stone: { tex: 'stone_tiles_02', tint: 0xfff2e0, scale: 3 },
    accent: { tex: 'coast_sand_01', tint: 0xffefc8, scale: 5 },
  },
  ambience: [],
  music: null,
  particles: FX,
  clouds: !NIGHT,
};

export default {
  id: 'test-fx',
  name: 'Efekt Deneme Adası',
  order: 97,
  hidden: true,
  subtitle: 'Ortam parçacıkları ve ay testi (gizli)',
  theme: THEME,
  spawn: [0, 0.1, 10], spawnFacing: Math.PI,
  parTime: 60,
  crystals: 1,
  coinsTotal: null,
  seed: 5,

  build(L) {
    L.island(0, 0, 0, 20, 8, { beach: true, rocks: 8, trees: 0, flowers: 20 });
    L.tree(-7, -4, { kind: 'oak', scale: 1 });
    L.tree(7, -6, { kind: 'pine', scale: 1 });
    L.box(0, 1.5, -8, 4, 4, 1, { mat: 'stone' });
    L.sign(3, 0, 7, 'Kar, kıvılcım, yaprak,\nateş böceği, pırıltı!', { rotY: 0.3 });
    L.coinLine([-4, 1, 4], [4, 1, 4], 5);
    L.crystal(0, 3, -8, 0x8fe3ff);
    L.checkpoint(2, 0, 9, { active: true });
    L.portal(0, 2.5, 2, { rotY: 0 });
  },

  testPath: [
    { at: [0, 0.1, 10], via: 'walk', note: 'spawn' },
    { at: [0, 0, 2], via: 'walk', note: 'portal' },
    { at: [0, 0, -4], via: 'walk', note: 'in front of the stone box' },
    { at: [0, 1.5, -8], via: 'jump', note: 'stone box (crystal)' },
  ],
};
