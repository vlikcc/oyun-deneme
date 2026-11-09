// Hidden test level 'test-crumble' (ARCHITECTURE §12): exercises the crumble + ice mechanics (GDD §3.1, §3.2).
// Reachable via ?level=test-crumble once listed in src/levels/index.js (excluded from the campaign: hidden: true).
//  * crumble row over the sea (north, −z): wood → ice (+ L.ice) → rock → cloud (delay 1.2) → islet with the crystal;
//    every skin gets its own look (the boxes keep the builder's default materials).
//  * a rock crumble with an explicit stone top (look kept) and an Yardım Modu-sized one (delay 1.5, respawn 3) on the island;
//  * ice: a default-material rink (→ marble top), an ice cylinder, an ice box with its own stone top (kept), and an
//    ice box with an explicit flat colour (opts.mat).
const THEME = {
  hdri: 'snow_field_puresky',
  hdriRotation: 0,
  environmentIntensity: 0.4, backgroundIntensity: 1.0,
  sun: { dir: [0.3, 0.6, 0.5], color: 0xe8f0ff, intensity: 2.2 },
  hemi: { sky: 0xeaf2ff, ground: 0x9aa6b4, intensity: 0.9 },
  fog: { color: 0xe6edf5, near: 70, far: 200 },
  water: { color: 0x5fa8cc, sunColor: 0xffffff, level: -1.2, distortion: 1.2 },
  materials: {
    ground: { tex: 'snow_02', tint: 0xffffff, scale: 2, normalScale: 0.5 },
    cliff: { tex: 'rock_wall_08', tint: 0xc8d0dc, scale: 3 },
    stone: { tex: 'marble_cliff_01', tint: 0xd8f0ff, scale: 4 },
    accent: { tex: 'snow_02', tint: 0xe6eef8, scale: 2 },
  },
  ambience: ['amb_waves'],
  music: null,
  particles: 'none',
  clouds: true,
};

export const ROW = [
  { skin: 'wood', at: [0, 0.4, -19] },
  { skin: 'ice', at: [0, 0.7, -22.5], ice: true },
  { skin: 'rock', at: [0, 1.0, -26] },
  { skin: 'cloud', at: [0, 1.3, -29.5], delay: 1.2 },
];

export default {
  id: 'test-crumble',
  name: 'Çatlayan Buz Deneme',
  order: 101,
  hidden: true,
  subtitle: 'Çökme ve buz testi (gizli)',
  theme: THEME,
  spawn: [0, 0.1, 10], spawnFacing: Math.PI,
  parTime: 60,
  crystals: 1,
  coinsTotal: null,
  seed: 5,

  build(L) {
    // Main island + decorative shallows ring (below the death line, walk-through)
    L.cyl(0, 0, 0, 16, 6, { seg: 40 });
    L.cyl(0, -1.12, 0, 20, 2.5, { mat: 'accent', seg: 48, noSolid: true, castShadow: false });

    // Crumble row over the sea → islet with the crystal
    for (const r of ROW) {
      const [x, top, z] = r.at;
      const c = L.box(x, top, z, 2.6, 2.6, 0.7);
      L.crumble(c, { skin: r.skin, delay: r.delay ?? 1.0, respawn: 5 });
      if (r.ice) L.ice(c);
      L.coin(x, top + 1.2, z);
    }
    L.cyl(0, 1.6, -36, 4, 5);
    L.crystal(0, 3.0, -36, 0x9ae6ff);
    L.checkpoint(1.8, 1.6, -35);

    // Crumbles on the island: explicit material is kept (look stays stone), long delay + short respawn
    L.crumble(L.box(6, 0.8, -8, 2.6, 2.6, 0.8, { mat: { top: 'stone' } }), { skin: 'rock' });
    L.crumble(L.box(10, 0.8, -8, 2.6, 2.6, 0.8), { skin: 'wood', delay: 1.5, respawn: 3 });
    L.sign(3, 0, -13, 'Çatlayan buz: hızlı geç!', { rotY: 0.2 });

    // Ice: default rink → marble top; ice cylinder; own stone top kept; explicit flat colour
    L.ice(L.box(-9, 0.3, -2, 8, 10, 0.6));
    L.ice(L.cyl(9, 0.3, 3, 3.5, 0.6));
    L.ice(L.box(9, 0.3, -2.5, 4, 3, 0.6, { mat: { top: 'stone' } }));
    L.ice(L.box(-9, 0.3, 7, 4, 3, 0.6), { mat: 0xbfe8ff });
    L.sign(-4, 0, 3, 'Buz kaygan! Erken dön.', { rotY: -0.3 });
    L.coinRing(-9, 1.3, -2, 2.5, 6);

    L.checkpoint(2, 0, 9, { active: true });
    L.portal(-4, 2.5, 12, { rotY: 0 });
  },

  testPath: [
    { at: [0, 0.1, 10], via: 'walk', note: 'spawn' },
    { at: [-9, 0.3, -2], via: 'walk', note: 'ice rink (marble top)' },
    { at: [0, 0, -14], via: 'walk', note: 'island north edge, crumble row start' },
    { at: [0, 1.6, -36], via: 'crumble', note: 'islet after the wood/ice/rock/cloud crumbles, crystal' },
    { at: [0, 0, -14], via: 'crumble', note: 'back over the respawned row' },
    { at: [-4, 0, 12], via: 'walk', note: 'portal' },
  ],
};
