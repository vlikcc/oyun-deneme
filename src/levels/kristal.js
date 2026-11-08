// Level 1 — the original island, rebuilt 1:1 with the L API (same coordinates, same seeded placement order).
const THEME = {
  hdri: 'kloofendal_48d_partly_cloudy_puresky',      // → assets/hdri/sky_2k.hdr (alias table in assets.js)
  hdriRotation: 0,
  environmentIntensity: 0.35, backgroundIntensity: 1.0,
  sun: { dir: [0.555, 0.743, 0.374], color: 0xfff1d6, intensity: 2.6 },
  hemi: { sky: 0xdff4ff, ground: 0x6a8f4a, intensity: 0.8 },
  fog: { color: 0xd6ecff, near: 90, far: 230 },
  water: { color: 0x1c8fd1, sunColor: 0xfff1d6, level: -1.2, distortion: 2.2 },
  materials: {
    ground: { tex: 'aerial_grass_rock', tint: 0xe4ffc4, scale: 5, normalScale: 0.7, envMapIntensity: 1.2 },
    cliff: { tex: 'rock_face', tint: 0xe8ddd0, scale: 6 },
    stone: { tex: 'stone_tiles_02', tint: 0xfff2e0, scale: 3 },
    accent: { tex: 'coast_sand_01', tint: 0xffefc8, scale: 5, normalScale: 0.6 },
  },
  ambience: ['amb_waves', 'amb_birds'],
  music: null,
  particles: 'none',
  clouds: true,
};

const STAIRS = [[-10, 1.0, 10, 4], [-14, 2.3, 7.5, 3], [-17.5, 3.7, 3.5, 3], [-17, 5.1, -1.5, 3], [-13, 6.4, -4.5, 3], [-8, 7.7, -6.5, 4]];

export default {
  id: 'kristal',
  name: "Pıtır'ın Kristal Adası",
  order: 1,
  subtitle: 'Adanın 5 Güneş Kristalini topla!',
  theme: THEME,
  spawn: [0, 0.1, 22], spawnFacing: Math.PI,
  parTime: 240,
  crystals: 5,
  coinsTotal: null,
  seed: 7,

  build(L) {
    // Main island (original: addCyl(0, 0, 0, 30, 8, { seg: 48 })). The sandy shallows ring is decoration only: it sits
    // below the water death line (-1.0) and is noSolid, so falling off the island still means a splash, as originally.
    L.cyl(0, 0, 0, 30, 8, { seg: 48 });
    L.cyl(0, -1.12, 0, 35, 2.5, { mat: 'accent', seg: 64, noSolid: true, castShadow: false });

    // A) Staircase hill (north-west) → crystal 1
    for (const [x, t, z, s] of STAIRS) L.box(x, t, z, s, s, t + 1);

    // B) Floating stones over the sea (east) → island B → crystal 2
    for (const [x, t, z, s] of [[33.5, 0.6, 3, 3], [38, 1.4, 0, 2.6], [42.5, 2.0, 3.5, 2.6], [45.5, 1.6, 7.5, 3]]) L.box(x, t, z, s, s, 0.9, { mat: { top: 'stone' } });
    L.cyl(54, 1, 8, 6, 6);

    // C) Moving platforms → island C → crystal 3
    L.mover([54, 1.5, 17.5], [54, 1.5, 25], 5);
    L.box(54, 2.2, 29.5, 3, 3, 0.9);
    L.mover([49.5, 2.3, 33], [40.5, 2.3, 33], 6);
    L.cyl(33, 2.5, 38, 5, 7);
    L.box(33, 3.4, 38, 1.6, 1.6, 0.9, { color: 0xe8dcc4, topColor: 0xffe08a });
    for (const [x, t, z] of [[27, 2.0, 33], [22.5, 1.4, 29], [18.5, 0.8, 25.5]]) L.box(x, t, z, 2.6, 2.6, 0.9, { mat: { top: 'stone' } });   // way back

    // D) Bounce pad + high cliff (west) → crystal 4
    L.box(-24.75, 10, 16, 8.5, 10, 17);
    L.bouncePad(-17.5, 0.45, 16, 1.2, 32);

    // E) Central spiral tower → crystal 5
    L.cyl(6, 14, -14, 3.5, 15, { mat: { side: 'stone' }, seg: 20 });
    for (let i = 0; i < 10; i++) {
      const a = i * 0.72 + 0.2, y = 1.4 + i * 1.32;
      L.box(6 + Math.cos(a) * 5.8, y, -14 + Math.sin(a) * 5.8, 2.5, 2.5, 0.8, { mat: 'stone' });
    }
    // Bounce pad near tower (shortcut for skilled players)
    L.bouncePad(14, 0.45, -6, 1.1, 27);

    // Decorations: trees (trunks collide), flowers, rocks, clouds — same seeded order and positions as the original
    // build (L.tree consumes two rnd() per tree like the original addTree). The original's procedural blob trees are
    // GLB oaks/pines (4–6 m, instanced) with the original trunk collider (r = 0.45·s, y 0 … 2.2·s).
    const keepClear = [[0, 22, 6], [0, 14, 5], [0, 7, 5], [4, 26, 5], [-7, 23, 3], [-17.5, 16, 4], [6, -14, 9], [14, -6, 3], [0, 0, 0]];
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < 22; tries++) {
      const a = L.rnd() * Math.PI * 2, r = 9 + L.rnd() * 18;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (L.nearCollider(x, z, 2.5, keepClear)) continue;
      const s = 0.8 + L.rnd() * 0.6;
      L.tree(x, z, { kind: placed % 4 === 3 ? 'pine' : 'oak', scale: s, height: 4 + ((s - 0.8) / 0.6) * 2, r: 0.45 * s, y0: -1, y1: 2.2 * s }); placed++;
    }
    L.tree(53, 12.5, { kind: 'palm', scale: 0.8, y: 1, height: 4.4, r: 0.36, y0: -1, y1: 1.76 });    // islet B (top 1.0)
    L.tree(31, 41, { kind: 'palm', scale: 0.7, y: 2.5, height: 4.2, r: 0.315, y0: -1, y1: 1.54 });   // islet C (top 2.5)
    const FLOWER_COLORS = [0xff6f91, 0xffe066, 0xffffff, 0xa78bfa];
    for (let i = 0; i < 70; i++) {
      const a = L.rnd() * Math.PI * 2, r = 4 + L.rnd() * 25;
      L.flower(Math.cos(a) * r, 0.17, Math.sin(a) * r, FLOWER_COLORS[i % 4]);
    }
    for (let i = 0; i < 14; i++) {
      const a = L.rnd() * Math.PI * 2, r = 29 + L.rnd() * 3;
      const size = 0.8 + L.rnd() * 1.2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      L.rock(x, z, { kind: 'low', scale: size, y: -0.8, rot: [L.rnd(), L.rnd(), L.rnd()] });
    }
    L.clouds(14);

    // Coins
    L.coinLine([0, 1, 17], [0, 1, 9], 5);
    L.coinRing(0, 1, 0, 4, 8);
    for (const [x, t, z] of STAIRS) L.coin(x, t + 1, z);
    L.coinLine([33.5, 1.6, 3], [45.5, 2.6, 7.5], 4);
    L.coinRing(54, 2, 8, 3.5, 6);
    L.coinLine([54, 2.5, 17.5], [54, 2.5, 25], 3);
    L.coinRing(33, 3.5, 38, 3, 6);
    L.coinLine([27, 3, 33], [18.5, 1.8, 25.5], 3);
    L.coinLine([-17.5, 4, 16], [-17.5, 10, 16], 4);
    for (let i = 0; i < 10; i++) { const a = i * 0.72 + 0.2; L.coin(6 + Math.cos(a) * 5.8, 2.4 + i * 1.32, -14 + Math.sin(a) * 5.8); }
    L.coinRing(-12, 1, -14, 2.5, 6);
    L.coinLine([18, 1, 8], [24, 1, 0], 4);

    // Sun crystals
    L.crystal(-8, 9.2, -6.5, 0xff6f91);
    L.crystal(56, 2.6, 10.5, 0x5ee6ff);
    L.crystal(33, 4.9, 38, 0xffd23f);
    L.crystal(-26.5, 11.6, 16, 0x9b7bff);
    L.crystal(6, 15.6, -14, 0x7dff8a);

    // Checkpoints (first one = spawn flag)
    L.checkpoint(2.2, 0, 21, { active: true });
    L.checkpoint(51, 1, 5.5);
    L.checkpoint(35.5, 2.5, 36);
    L.checkpoint(9.5, 0, -5);
    L.checkpoint(-23, 10, 12.5);

    // Rainbow portal (goal)
    L.portal(-7, 2.5, 23, { rotY: 0.5 });

    // Enemies
    L.slime(5, 0, 6, 5); L.slime(-4, 0, -12, 4, 0x4cc9f0); L.slime(16, 0, -2, 5);
    L.slime(-12, 0, -16, 3, 0xf15bb5); L.slime(20, 0, 14, 4, 0x4cc9f0);
    L.slime(55, 1, 7, 3.5); L.slime(52, 1, 10, 3.5, 0xf15bb5);
    L.slime(6, 14, -14, 1.8, 0xf15bb5);
    L.spiky([-27, 10, 13], [-27, 10, 19.5]);
    L.spiky([-22, 0, -20], [-6, 0, -22], 3.2);
    L.spiky([30, 2.5, 41], [36, 2.5, 41], 2.2);
  },

  // Every waypoint stands on fixed ground (never on a mover: tools/smoke.mjs checks them after some seconds of play);
  // 'jump' hops respect §2 (≤ 6.5 m across, ≤ 2.5 m rise), 'walk' hops are on one surface.
  testPath: [
    { at: [0, 0.1, 22], via: 'walk', note: 'spawn' },
    { at: [-8.5, 0, 14], via: 'walk', note: 'foot of the stairs' },
    { at: [-10, 1.0, 10], via: 'jump', note: 'stairs 1' },
    { at: [-14, 2.3, 7.5], via: 'jump' }, { at: [-17.5, 3.7, 3.5], via: 'jump' }, { at: [-17, 5.1, -1.5], via: 'jump' },
    { at: [-13, 6.4, -4.5], via: 'jump' }, { at: [-8, 7.7, -6.5], via: 'jump', note: 'stairs top, crystal 1 above' },
    { at: [24, 0, 2], via: 'walk', note: 'east meadow' },
    { at: [29, 0, 2.5], via: 'walk', note: 'east shore' },
    { at: [33.5, 0.6, 3], via: 'jump', note: 'floating stone 1' }, { at: [38, 1.4, 0], via: 'jump' }, { at: [42.5, 2.0, 3.5], via: 'jump' },
    { at: [45.5, 1.6, 7.5], via: 'jump' }, { at: [49.5, 1, 8], via: 'jump', note: 'island B west edge' },
    { at: [54, 1, 8], via: 'walk', note: 'island B, crystal 2 above' },
    { at: [54, 1, 13.5], via: 'walk', note: 'island B south edge, mover 1 pickup' },
    { at: [54, 2.2, 29.5], via: 'mover', note: 'stone after mover 1' },
    { at: [36.5, 2.5, 36.5], via: 'mover', note: 'island C east edge (mover 2 + hop)' },
    { at: [33, 3.4, 38], via: 'jump', note: 'pedestal, crystal 3 above' },
    { at: [29.5, 2.5, 35.5], via: 'jump', note: 'island C south-west edge' },
    { at: [27, 2.0, 33], via: 'jump', note: 'way back 1' }, { at: [22.5, 1.4, 29], via: 'jump' }, { at: [18.5, 0.8, 25.5], via: 'jump' },
    { at: [15, 0, 21], via: 'jump', note: 'back on the main island' },
    { at: [-17.5, 0.45, 16], via: 'walk', note: 'bounce pad' }, { at: [-24.75, 10, 16], via: 'bounce', note: 'cliff, crystal 4' },
    { at: [6 + Math.cos(0.2) * 5.8, 1.4, -14 + Math.sin(0.2) * 5.8], via: 'walk', note: 'tower spiral start' },
    { at: [6 + Math.cos(9 * 0.72 + 0.2) * 5.8, 1.4 + 9 * 1.32, -14 + Math.sin(9 * 0.72 + 0.2) * 5.8], via: 'climb', note: 'spiral top' },
    { at: [6, 14, -14], via: 'jump', note: 'tower top, crystal 5' },
    { at: [-7, 0, 23], via: 'walk', note: 'portal' },
  ],
};
