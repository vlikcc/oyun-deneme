// Hook test level (id 'test'): hidden from the campaign; reachable via ?level=test or window.__game.loadLevel('test').
// Exercises every §7 hook so reviewers and tools/smoke.mjs can verify them: ice/lava surfaces, collider hooks,
// trigger → toast, dynamic that moves a prop, sign, L.enemy('slime'), a custom registered kind 'dummy', GLTF trees/rocks,
// L.scatter, L.light, L.coinArc, L.island, L.remove, world signals.
import * as THREE from 'three';

const THEME = {
  hdri: 'kloppenheim_06_puresky',      // exists as assets/hdri/kloppenheim_06_puresky_1k.hdr
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
  id: 'test',
  name: 'Deneme Adası',
  order: 99,
  hidden: true,
  subtitle: 'Mekanik testi (gizli)',
  theme: THEME,
  spawn: [0, 0.1, 10], spawnFacing: Math.PI,
  parTime: 60,
  crystals: 1,
  coinsTotal: null,
  seed: 3,

  build(L) {
    // custom enemy kind registered by the level (idempotent)
    if (!L.enemies.has('dummy')) {
      L.enemies.register('dummy', {
        touch: 'stomp',
        spawn(L, x, y, z) {
          const g = new THREE.Group();
          const m = new THREE.Mesh(L.own(new THREE.BoxGeometry(0.9, 0.9, 0.9)), L.assets.flat(0xff9f43));
          m.castShadow = true; m.position.y = 0.45; g.add(m);
          g.position.set(x, y, z);
          return { group: g, body: m, y, r: 0.6, h: 0.9, t: L.rnd() * 6 };
        },
        update(e, dt) { e.t += dt * 3; e.group.position.y = e.y + Math.abs(Math.sin(e.t)) * 0.4; e.body.rotation.y += dt; },
      });
    }

    // Main test island (L.island → cyl + beach + rocks + tree scatter)
    L.island(0, 0, 0, 22, 8, { beach: true, rocks: 10, trees: 0, flowers: 24 });

    // Surfaces
    const ice = L.box(8, 0.5, 0, 6, 6, 1, { surface: 'ice', color: 0x9fd8ff, topColor: 0xdffbff });
    ice.onLand = () => L.toast('Buz! Kayıyorsun', 0.8);
    const lava = L.box(-8, 0.3, 0, 5, 5, 0.8, { surface: 'lava', color: 0x7a1a00, topColor: 0xff5a1a });
    lava.tags = ['lava'];
    // standalone lava box over the sea (nothing under it): landing on it must respawn even while invulnerable (§7 impl note)
    const lavaSea = L.box(34, 0.5, 0, 4, 4, 1, { surface: 'lava', color: 0x7a1a00, topColor: 0xff5a1a });
    lavaSea.tags = ['lava', 'lava-sea'];
    const mud = L.box(8, 0.4, -8, 4, 4, 0.8, { surface: 'mud', color: 0x6b4a2e, topColor: 0x8a5a36 });
    const hooks = L.box(0, 0.6, -8, 3, 3, 1.2, { mat: 'stone' });
    hooks.onLand = () => L.toast('onLand ✓', 0.6);
    hooks.onLeave = () => L.sfx('switch');
    hooks.onBonk = () => L.sfx('land');
    hooks.standTime = 0;
    hooks.onStand = (p, c, dt) => { c.standTime += dt; };

    // Trigger → toast; a once trigger that fires a signal
    L.trigger({ x: 0, y: 0, z: -14, w: 4, h: 3, d: 3 }, { onEnter: () => L.toast('Tetik!', 1), onExit: () => L.toast('Çıktın', 0.6) });
    L.on('switch', 'gate', () => L.toast('Sinyal: kapı', 1));
    L.trigger({ x: 14, y: 0, z: 0, w: 3, h: 3, d: 6 }, { once: true, onEnter: () => L.emit('switch', 'gate') });

    // Dynamic that moves a prop (GLTF boulder) in a circle; crumble-style L.remove on a timer
    const boulder = L.rock(-12, -10, { kind: 'boulder_01', scale: 1.2 });
    L.dynamic({ t: 0, update(dt, t) { this.t += dt; boulder.position.set(-12 + Math.cos(this.t * 0.7) * 3, 0, -10 + Math.sin(this.t * 0.7) * 3); boulder.rotation.y += dt; }, dispose() {} });
    const crumble = L.box(-4, 1.2, 8, 2.5, 2.5, 0.6, { color: 0xc9b58a, topColor: 0xe8d9b0 });
    crumble.onLand = () => { if (crumble.timer == null) crumble.timer = 0.6; };
    L.dynamic({ update(dt) { if (crumble.timer != null && (crumble.timer -= dt) <= 0) { L.spawnParticles(new THREE.Vector3(-4, 1.2, 8), 12, 0xc9b58a); L.remove(crumble); L.remove(this); } } });

    // Sign, light, GLTF trees, scatter, props
    L.sign(3, 0, 8, 'Buz kaydırır,\nlav yakar!', { rotY: 0.3 });
    L.light(-8, 2.5, 0, 0xff6a1a, 6, 10);
    L.light(0, 3, -8, 0x6adfff, 3, 8);
    L.tree(-6, 14, { kind: 'oak', scale: 1 });
    L.tree(6, 14, { kind: 'pine', scale: 1 });
    L.tree(0, 16, { kind: 'palm', scale: 1 });
    L.tree(12, 10, { kind: 'birch', scale: 1 });
    L.tree(-12, 6, { kind: 'dead', scale: 0.9 });
    L.scatter('trees', { center: [0, 0], rMin: 12, rMax: 19, count: 8, kind: 'procedural', keepClear: [[0, 10, 4]] });
    L.scatter('grass', { center: [0, 0], rMin: 3, rMax: 18, count: 40 });
    L.prop('boulder_01', 14, 0, 12, { scale: 0.8, rotY: 1.2, collide: 'cyl', r: 0.6, h: 1 });

    // Collectibles
    L.coinArc([-4, 1, 4], [4, 1, 4], 7, 2.5);
    L.coinRing(0, 1, 0, 3, 6);
    L.crystal(0, 2.2, -8, 0x7dff8a);
    L.checkpoint(2, 0, 9, { active: true });
    L.checkpoint(0, 0, -11);
    L.portal(0, 2.5, 4, { rotY: 0 });

    // Enemies: built-in via L.enemy, and the custom kind
    L.enemy('slime', 6, 0, 6, 3, 0x9b5de5);
    L.slime(-6, 0, 6, 3, 0x4cc9f0);
    L.enemy('dummy', 4, 0, -4);
    L.spiky([-14, 0, 4], [-14, 0, -4], 2);
  },

  testPath: [
    { at: [0, 0.1, 10], via: 'walk', note: 'spawn' },
    { at: [8, 0.5, 0], via: 'walk', note: 'ice' },
    { at: [0, 0.6, -8], via: 'walk', note: 'hooks box' },
    { at: [0, 0, -14], via: 'walk', note: 'trigger' },
    { at: [0, 0, 4], via: 'walk', note: 'portal' },
  ],
};
