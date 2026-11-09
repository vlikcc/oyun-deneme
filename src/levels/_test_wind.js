// Hidden mechanic test level 'test-wind' (ARCHITECTURE §12: one per mechanic module, excluded from the campaign).
// Exercises src/engine/mechanics/wind.js and movers.js: a gusty wind zone and a steady diagonal one over solid ground,
// an updraft column to a pillar top (the crystal), two orbiters to a far islet, a stopped counter-clockwise orbiter,
// three bobbing rafts (one converted from an L.box) and a figure-eight pathMover. Sky theme with a cloud-sea death line.
// Reachable with ?level=test-wind or window.__game.loadLevel('test-wind') once registered in src/levels/index.js.

const THEME = {
  hdri: 'kloofendal_43d_clear_puresky',
  hdriRotation: 0.4,
  environmentIntensity: 0.35, backgroundIntensity: 1.0,
  sun: { dir: [0.5, 0.75, 0.35], color: 0xfff1d6, intensity: 2.6 },
  hemi: { sky: 0xdff4ff, ground: 0x8aa0b8, intensity: 0.85 },
  fog: { color: 0xe4f1ff, near: 90, far: 240 },
  water: null,
  fall: { y: -30, kind: 'cloud' },
  materials: {
    ground: { tex: 'aerial_grass_rock', tint: 0xe4ffc4, scale: 5, normalScale: 0.7 },
    cliff: { tex: 'rock_face', tint: 0xe8ddd0, scale: 6 },
    stone: { tex: 'stone_tiles_02', tint: 0xfff2e0, scale: 3 },
    accent: { tex: 'coast_sand_01', tint: 0xffefc8, scale: 5 },
  },
  ambience: [],
  music: null,
  particles: 'none',
  clouds: true,
};

export default {
  id: 'test-wind',
  name: 'Rüzgâr Deneme Adası',
  order: 98,
  hidden: true,
  subtitle: 'Rüzgâr, hava sütunu ve hareketli platform testi (gizli)',
  theme: THEME,
  spawn: [0, 0.1, 14], spawnFacing: Math.PI,
  parTime: 90,
  crystals: 1,
  coinsTotal: null,
  seed: 11,

  build(L) {
    // Main floating island (top 0) and the far islets
    L.cyl(0, 0, 0, 22, 8, { taper: 0.6, seg: 40 });
    L.cyl(-51, 1, 0, 5, 5, { taper: 0.6 });            // C: reached by the orbiters
    L.cyl(0, 0.6, 37, 3, 4, { taper: 0.6 });            // D: reached by the bobbing rafts

    // 1) Gusty wind zone over solid ground (never over a fall, GDD §2.0) + a steady diagonal one
    const gusty = L.wind({ x: -8, y: 0, z: 2, w: 10, h: 3, d: 8 }, [1, 0, 0], 3.5, { gust: 0.6 });
    L.wind({ x: 9, y: 0, z: 6, w: 6, h: 3, d: 6 }, [1, 0, -1], 2.5);
    L.sign(-8, 0, 7.5, 'Rüzgâr iter —\nona karşı yürü!', { rotY: 0.2 });
    L.coinLine([-12, 1, 2], [-4, 1, 2], 5);

    // 2) Updraft column next to a stone pillar: ride it up, drift onto the top (crystal)
    L.cyl(10, 12, -12, 3, 12, { mat: 'stone', taper: 1 });
    L.updraft(4.5, -12, 2.2, -1, 14, { lift: 14 });
    L.sign(1.5, 0, -8.5, 'Rüzgâr sütunu\nseni yukarı taşır!', { rotY: -0.3 });
    L.coinLine([4.5, 4, -12], [4.5, 12, -12], 5);
    L.crystal(10, 13.4, -12, 0x8fe3ff);

    // 3) Orbiters: two 3×3 platforms on one circle (phase 0 / 0.5) between the island's west rim and islet C
    L.orbiter([-34, 1, 0], 10, 14, { phase: 0 });
    L.orbiter([-34, 1, 0], 10, 14, { phase: 0.5 });
    // a stopped counter-clockwise orbiter (parity flag) parked south of the circle
    L.orbiter([-34, 1, 16], 3, 10, { cw: false, stopped: true, w: 2.6, d: 2.6 });
    L.coinRing(-51, 2, 0, 2.5, 6);
    L.checkpoint(-50, 1, 2);

    // 4) Bobbing rafts (amp 0.35, period 3, phases 0/.25/.5) south to islet D; the middle one is an L.box turned into a bob
    L.bob([0, 0.3, 25], 0.35, 3, { w: 2.6, d: 2.6, phase: 0 });
    L.bob(L.box(0, 0.3, 28.5, 2.6, 2.6, 0.5, { mat: { top: 'stone' } }), 0.35, 3, { phase: 0.25 });
    L.bob([0, 0.3, 32], 0.35, 3, { w: 2.6, d: 2.6, phase: 0.5 });
    L.coinLine([0, 1.6, 25], [0, 1.6, 32], 3);
    L.checkpoint(1.5, 0.6, 37);

    // 5) Figure-eight path mover over the east meadow
    L.pathMover((t) => [15 + Math.sin(t * 0.6) * 3.5, 0.6, -2 + Math.sin(t * 1.2) * 2.2], 2.6, 2.6);

    L.checkpoint(2, 0, 14, { active: true });
    L.portal(-6, 2.5, 16);
  },

  // Fixed ground only (smoke probes after ~4 s of play). via 'updraft' / 'orbiter' / 'bob' carry no reach rule.
  testPath: [
    { at: [0, 0.1, 14], via: 'walk', note: 'spawn' },
    { at: [-8, 0, 2], via: 'walk', note: 'gusty wind zone' },
    { at: [9, 0, 6], via: 'walk', note: 'diagonal wind zone' },
    { at: [4.5, 0, -12], via: 'walk', note: 'updraft base' },
    { at: [10, 12, -12], via: 'updraft', note: 'pillar top, crystal' },
    { at: [-20, 0, 0], via: 'walk', note: 'west rim, orbiter pickup' },
    { at: [-51, 1, 0], via: 'orbiter', note: 'islet C' },
    { at: [-20, 0, 0], via: 'orbiter', note: 'back on the island' },
    { at: [0, 0, 20], via: 'walk', note: 'south rim, rafts' },
    { at: [0, 0.6, 37], via: 'bob', note: 'islet D' },
    { at: [0, 0, 20], via: 'bob', note: 'back' },
    { at: [-6, 0, 16], via: 'walk', note: 'portal' },
  ],
};
