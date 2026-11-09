// Hidden test level 'test-lava' (ARCHITECTURE §12): exercises the lava mechanic (GDD §3.3).
// Reachable via ?level=test-lava / __game.test.start('test-lava'); excluded from the campaign (hidden: true).
//  * theme.water = { kind: 'lava', … } → the lava sea (core.registerWaterKind('lava') from mechanics/lava.js, 900 m, no
//    reflection pass); falling off the island = "Cız! Lav!" (E3).
//  * pool A: a ground-level puddle beside the path (trigger only, default options → reuses the sea's material);
//  * pool B: a walled basin whose lava rises and sinks with setLevel() (eruption stand-in), custom colour/glow/speed;
//  * pool C: a wide pool across the path with three 2.6 m stepping stones (the testPath hops over it);
//  * pool D: lava on a `surface: 'lava'` floor (the optional floor collider under a pool).
// The testPath only uses fixed stone/ground waypoints (no movers, no lava).
const THEME = {
  hdri: 'wasteland_clouds_puresky',
  hdriRotation: 0,
  environmentIntensity: 0.35, backgroundIntensity: 1.0,
  sun: { dir: [-0.4, 0.5, 0.6], color: 0xffa060, intensity: 2.0 },
  hemi: { sky: 0xd9a080, ground: 0x3a2a24, intensity: 0.6 },
  fog: { color: 0xd99a7a, near: 55, far: 170 },
  water: { kind: 'lava', color: 0xff5a1f, glow: 0xffb060, level: -1.2 },
  materials: {
    ground: { tex: 'rocks_ground_06', tint: 0x9a8f88, scale: 3, steps: 'stone' },
    stone: { tex: 'rock_boulder_cracked', tint: 0xc87850, scale: 2 },
    cliff: { tex: 'rock_face', tint: 0x6a6060, scale: 4 },
    accent: { tex: 'dry_ground_01', tint: 0x808080, scale: 3, steps: 'sand' },
  },
  ambience: ['lava_flow_loop'],
  music: null,
  particles: 'none',
  clouds: false,
};

export default {
  id: 'test-lava',
  name: 'Lav Deneme Adası',
  order: 98,
  hidden: true,
  subtitle: 'Lav mekaniği testi (gizli)',
  theme: THEME,
  spawn: [0, 0.1, 16], spawnFacing: Math.PI,
  parTime: 60,
  crystals: 1,
  coinsTotal: null,
  seed: 5,

  build(L) {
    // Island over the lava sea (ash beach ring)
    L.island(0, 0, 0, 20, 6, { beach: true, rocks: 8 });

    // Pool A — puddle beside the path, default options (same as the sea → shared material)
    L.lava(-9, 0.04, 6, 5, 5);
    L.sign(-5, 0, 10, 'Lav yakar!\nÜstüne basma.', { rotY: 0.4 });

    // Pool B — walled basin, rising and sinking lava (setLevel), custom colours
    const bx = 9, bz = 4, inner = 5, wall = 1, wh = 1.4;
    L.box(bx, wh, bz - (inner + wall) / 2, inner + 2 * wall, wall, wh, { mat: 'stone' });
    L.box(bx, wh, bz + (inner + wall) / 2, inner + 2 * wall, wall, wh, { mat: 'stone' });
    L.box(bx - (inner + wall) / 2, wh, bz, wall, inner, wh, { mat: 'stone' });
    L.box(bx + (inner + wall) / 2, wh, bz, wall, inner, wh, { mat: 'stone' });
    const basin = L.lava(bx, 0.3, bz, inner, inner, { color: 0xff3a10, glow: 0xffd070, speed: 0.14 });
    L.dynamic({ update(dt, t) { basin.setLevel(0.65 + Math.sin(t * 0.6) * 0.45); }, dispose() {} });

    // Pool C — across the path, stepping stones over it (z −3.5 … −12.5)
    L.lava(0, 0.04, -8, 9, 9);
    for (const z of [-5.5, -9.5]) L.box(0, 0.7, z, 2.6, 2.6, 1.2, { mat: 'stone' });
    L.coinArc([0, 1.2, -2.5], [0, 1.6, -5.5], 3, 1.2);
    L.coinArc([0, 1.6, -5.5], [0, 1.6, -9.5], 4, 1.4);

    // Pool D — lava resting on a lava-surface floor (the optional floor collider)
    L.box(-9, 0.5, -6, 4, 4, 1, { surface: 'lava', color: 0x3a1a10, topColor: 0x3a1a10 });
    L.lava(-9, 0.54, -6, 4, 4, { speed: 0.05 });

    // Goal side
    L.checkpoint(2.2, 0, 15, { active: true });
    L.checkpoint(3, 0, -15);
    L.crystal(0, 1.4, -16, 0xff8a3d);
    L.portal(6, 2.5, 12, { rotY: 0.3 });
    L.light(9, 2.5, 4, 0xff7a2a, 5, 9);
  },

  testPath: [
    { at: [0, 0.1, 16], via: 'walk', note: 'spawn' },
    { at: [0, 0, 4], via: 'walk', note: 'between pools A and B' },
    { at: [0, 0, -2.5], via: 'walk', note: 'edge of pool C' },
    { at: [0, 0.7, -5.5], via: 'jump', note: 'stone 1 over the lava' },
    { at: [0, 0.7, -9.5], via: 'jump', note: 'stone 2 over the lava' },
    { at: [0, 0, -14], via: 'jump', note: 'far shore' },
    { at: [0, 0, -16], via: 'walk', note: 'crystal' },
    { at: [0, 0.7, -9.5], via: 'jump', note: 'back: stone 2' },
    { at: [0, 0.7, -5.5], via: 'jump', note: 'back: stone 1' },
    { at: [0, 0, -2.5], via: 'jump', note: 'back: near shore' },
    { at: [6, 0, 12], via: 'walk', note: 'portal' },
  ],
};
