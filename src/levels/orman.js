// Island 5 — 'orman' · Kadim Tapınak (GDD §2.8). A jungle village under giant oaks and a ziggurat temple island across a
// river. New toys: key & door (the oak-canopy key opens the temple gate), switch + riser (walk-in river switch, timed
// pound switch on the altar tier). Reused: crumbling wood logs, movers-free; enemies bat ×6, slime ×5, thorn spiky ×2.
//
// Play order (testPath): spawn → ① Kök Çukuru (root hollow, 3 bats) → river switch 'nehir' → root stair up the ancient
// oak → canopy (key 'tapinak' + vista "Sisli Tapınak") → river stones (risers) → temple gate (door 'tapinak') → stair
// notch → ② courtyard → tier spiral (NW 1→2, NE→E 2→3, E 3→4) → pound switch 'sunak' (timed 10 s) → two risers →
// ③ altar → down the east side → ④ waterfall ledge → crumbling log bridge → Muz Koyu → ⑤ mossy boulder stack → stump
// stones back to the village → portal.
//
// Deviations from the GDD text (geometry the box/cyl-only engine cannot express literally), all reported:
//  * Kök Çukuru: an AABB/cylinder world cannot carve a pit into the island cylinder, so the "hollow" is a mossy floor at
//    ground level ringed by 1.2 m root banks (west/north/south, open east) — same depth feel, walls ≤ 1.5 m.
//  * Temple tiers are split into AABB pieces around a stair notch (x −2…2) and a courtyard cut (x −5…5, z −50…−55.5) so
//    crystal ② at (0, 5.4, −52) sits on the tier-1 floor; tier stairs: 1→2 at the NW corner (GDD), 2→3 and 3→4 on the
//    east ledges so the GDD's tier-3 checkpoint (6, 12, −54) and the pound sign lie on the path.
//  * Altar risers start at top 15.9 (just under tier 4's top) instead of 15.5 and R1 sits at x −4.6 (GDD −5) so the
//    lowered stones are hidden inside tier 4 and a rider carried down is stepped back onto the floor.
//  * Stump stones are cylinders r 1.3 (Ø 2.6) instead of 2.6² boxes; the waterfall is cosmetic (no L.waterfall yet).
//  * A gate lintel (4.0…6.6 m) above the 3.2 m door: the 0.8 m slit is too low to slip through, the door cannot be
//    double-jumped, and jumping onto the first stair inside the open gate never bonks the lintel.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const THEME = {
  hdri: 'kloofendal_misty_morning_puresky',
  hdriRotation: 0.4,
  environmentIntensity: 0.35, backgroundIntensity: 1.0,
  sun: { dir: [0.3, 0.8, 0.3], color: 0xfff4d0, intensity: 1.8 },
  hemi: { sky: 0xd8e8d0, ground: 0x3f5a3a, intensity: 0.8 },
  fog: { color: 0xcde2cf, near: 45, far: 150 },
  water: { color: 0x2a8c6c, sunColor: 0xfff0c0, level: -1.2, distortion: 1.0 },
  materials: {
    ground: { tex: 'forest_leaves_02', tint: 0xd4e8b0, scale: 3, normalScale: 0.7 },
    cliff: { tex: 'mossy_stone_wall', tint: 0xffffff, scale: 2.5 },
    stone: { tex: 'mossy_cobblestone', tint: 0xffffff, scale: 2 },
    accent: { tex: 'rock_face', tint: 0xa8b8a0, scale: 4, steps: 'stone' },
    plank: { tex: 'weathered_planks', tint: 0xe8d4b0, scale: 2, steps: 'stone' },
  },
  ambience: ['amb_jungle_day'],
  music: 'music_tropical_banana',
  particles: 'leaves',
  clouds: true,
};

const TEMPLE = [0, -60];                  // temple island centre (x, z)
const FALLS = new THREE.Vector3(27, 2, -52);   // waterfall base (sound source)
const CRYSTAL_COLORS = [0x7dff8a, 0xffd23f, 0xff6f91, 0x5ee6ff, 0xffa94d];

// Root stair up the ancient oak (GDD §2.8): 3×3 boxes, rise 1.4 → canopy deck.
const ROOTS = [[-12, 1.4, -5], [-14, 2.8, -8], [-16, 4.2, -11], [-18, 5.6, -13], [-19, 7, -16]];
// Temple tier stairs (rise ≈ 1.35, 2.6² tops): A/B tier 1→2 (NW), C/D tier 2→3 (east ledge), E/F tier 3→4 (east ledge).
const TSTEPS = [[-13.5, 5.35, -66.8], [-13.5, 6.7, -69.4], [10.5, 9.35, -58.1], [10.5, 10.7, -55.5], [7.5, 13.35, -59.2], [7.5, 14.7, -61.8]];
// Stump stones from the village east rim to Muz Koyu, and the crumbling log bridge to the waterfall ledge.
const STUMPS = [[26, 0.4, -6], [29, 0.8, -11], [31, 1.2, -16], [33, 1.6, -21]];
const LOGS = [[33, 1, -36], [32, 1.3, -39.5], [31, 1.6, -43], [30, 1.9, -46.5]];

/** Hide the meshes of static colliders and draw them as one merged mesh per material (2 draws for the whole temple
 *  instead of 2 per box). Colliders, camera / blob raycasts and groundBelow keep using the hidden meshes. */
function batchStatic(L, list) {
  const buckets = new Map();
  for (const c of list) {
    const m = c.mesh; if (!m) continue;
    m.updateMatrix();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrix);
    const groups = g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
    for (const gr of groups) {
      const part = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        const a = g.attributes[name];
        part.setAttribute(name, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
      }
      const mat = mats[gr.materialIndex ?? 0];
      if (!buckets.has(mat)) buckets.set(mat, []);
      buckets.get(mat).push(part);
    }
    g.dispose();
    m.visible = false;
  }
  for (const [mat, parts] of buckets) {
    const geo = L.own(mergeGeometries(parts));
    parts.forEach((p) => p.dispose());
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'orman:static';
    L.add(mesh);
  }
}

/** Box geometry with UVs in metres / tile (like L.box) so PBR textures keep their scale on hand-built visuals. */
function metricBox(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]); }
  return geo;
}

function canvasTex(L, w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = L.own(new THREE.CanvasTexture(cv));
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default {
  id: 'orman',
  name: 'Kadim Tapınak',
  order: 5,
  subtitle: 'Orman köyü ve nehrin ötesinde kadim bir tapınak.',
  theme: THEME,
  spawn: [0, 0.1, 18], spawnFacing: Math.PI,
  parTime: 270,
  crystals: 5,
  coinsTotal: null,
  seed: 5,

  build(L) {
    const S = [];                                     // static colliders → batchStatic at the end
    const st = (c) => { S.push(c); return c; };
    const A = L.assets;
    this._st = { temple: false, fallsT: 0 };
    // low/medium tiers: small decorations and enemies farther than `far` from Pıtır are hidden (draw budget, GDD §5.2)
    const cull = [];
    const deco = (o) => { cull.push({ o }); return o; };
    const foe = (e) => { if (e?.group) cull.push({ e }); return e; };

    // ============================================================ islands
    st(L.island(0, 0, 0, 24, 8));                                                   // village (beach ring r 29 at −0.8)
    st(L.island(TEMPLE[0], 0, TEMPLE[1], 26, 8, { beach: false }));                 // temple island
    st(L.cyl(34, 0, -23, 7, 6, { seg: 24 }));                                       // Muz Koyu islet
    L.cyl(34, -0.8, -23, 9, 2.5, { mat: 'accent', seg: 28, castShadow: false });   // its rocky shore ring
    // a cobbled path spawn → river switch and temple shore → gate
    st(L.box(0.8, 0.03, 6, 2.6, 20, 0.3, { mat: 'stone' }));
    st(L.box(0, 0.03, -40.5, 3, 11, 0.3, { mat: 'stone' }));

    // ============================================================ village
    L.checkpoint(2, 0, 16, { active: true });
    L.portal(-6, 2.5, 20, { rotY: 0.35 });
    L.sign(4, 0, -5, 'Düğmeye bas —\ntaşlar yükselir!', { rotY: -0.2 });
    L.sign(-8.5, 0, -1.5, 'Anahtarı bul,\nkapıyı aç.', { rotY: 0.5 });

    // three huts: walls + leafy pyramid roof (visual, merged), one hidden collider box per hut (top 4.4 ≈ roof)
    {
      const wallMat = A.pbr('plank'), roofMat = A.pbrTex('forest_leaves_02', { tint: 0xb8cc80, scale: 1.2 });
      const doorMat = A.flat(0x3a2a1c);
      const walls = [], roofs = [], doors = [];
      for (const [x, z] of [[13, 12], [-11.5, 13], [12.5, -12]]) {
        const c = L.box(x, 4.4, z, 4, 4, 4.9, { tags: ['hut'] }); c.mesh.visible = false;
        const m4 = new THREE.Matrix4().makeRotationY(0).setPosition(x, 1.3, z);
        walls.push(metricBox(4, 2.6, 4).applyMatrix4(m4));
        roofs.push(new THREE.ConeGeometry(3.4, 2.4, 4, 1).rotateY(Math.PI / 4).translate(x, 2.6 + 1.2, z));
        // door plane on the side facing the island centre (snapped to a box face)
        const face = Math.abs(x) > Math.abs(z) ? [Math.sign(-x) * 2.01, 0] : [0, Math.sign(-z) * 2.01];
        const dg = new THREE.PlaneGeometry(1.2, 1.9);
        if (face[0] !== 0) dg.rotateY(face[0] > 0 ? Math.PI / 2 : -Math.PI / 2); else dg.rotateY(face[1] > 0 ? 0 : Math.PI);
        doors.push(dg.translate(x + face[0], 0.95, z + face[1]));
      }
      for (const [list, mat, cast] of [[walls, wallMat, true], [roofs, roofMat, true], [doors, doorMat, false]]) {
        const geo = L.own(mergeGeometries(list.map((g) => g.index ? g.toNonIndexed() : g)));
        list.forEach((g) => g.dispose());
        const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = cast; mesh.receiveShadow = true; L.add(mesh);
      }
      deco(L.prop('wooden_lantern_01', 10.6, 0, 9.6, { castShadow: false, fitHeight: 1.6, rotY: 0.4 }));
      deco(L.prop('wooden_lantern_01', -9, 0, 10.5, { castShadow: false, fitHeight: 1.6, rotY: -0.5 }));
      deco(L.prop('old_military_crate', 15.6, 0, 9.4, { scale: 0.9, rotY: 0.3, collide: 'box', w: 1.1, d: 1.1, h: 0.9 }));
    }

    // ------------------------------------------------ ① Kök Çukuru — root hollow (floor + 1.2 m root banks, open east)
    st(L.box(-18, 0.03, 4, 6, 6, 0.5, { mat: 'stone' }));
    const bank = { mat: { side: 'cliff', top: 'ground' } };
    st(L.box(-22, 1.2, 4, 2, 10, 2.1, bank)); st(L.box(-18, 1.2, 0, 6, 2, 2.1, bank)); st(L.box(-18, 1.2, 8, 6, 2, 2.1, bank));
    // roots spilling over the banks (sunk so only the roots show, not the moss bulb)
    for (const [x, y, z, r] of [[-22, 1.2, 1.5, 0.3], [-22, 1.2, 6.5, 2.4], [-16, 1.2, 0, 4.4], [-19, 1.2, 8, 5.2]]) {
      deco(L.prop('root_cluster', x, y - 0.3, z, { castShadow: false, scale: 1.2, rotY: r, tint: 0x9a7a58 }));
    }
    deco(L.prop('fern_clump', -19.6, 1.2, 0.2, { castShadow: false, scale: 2.4 })); deco(L.prop('fern_clump', -16.4, 1.2, 8.1, { castShadow: false, scale: 2.2 }));
    deco(L.prop('mushroom_group', -20, 0.03, 6, { castShadow: false, scale: 1.3 }));
    deco(L.prop('moss_patch', -16.5, 0.03, 2.2, { castShadow: false, scale: 1.4 }));
    L.crystal(-18, 0.9, 4, CRYSTAL_COLORS[0]);
    for (let i = 0; i < 3; i++) foe(L.bat([-18, 0, 4], { r: 3.5, h: 2.2, phase: i / 3 }));

    // ------------------------------------------------ river switch 'nehir' → three river stones (risers)
    L.switch(4, 0, -8, 'nehir');
    for (const z of [-26.5, -29.5, -32.5]) L.riser(L.box(0, -2, z, 2.6, 2.6, 3, { mat: { side: 'cliff', top: 'stone' } }), 2.3, 1.5, 'nehir');
    L.checkpoint(2, 0, -20);

    // ------------------------------------------------ ancient oak, root stair, canopy deck (key + vista)
    L.prop('oak_ancient', -16, 0, -8, { scale: 1.6, rotY: 0.8, collide: 'cyl', r: 0.8, h: 6 });
    for (const [x, t, z] of ROOTS) st(L.box(x, t, z, 3, 3, t + 1, { mat: { side: 'wood', top: 'ground' } }));
    st(L.box(-17, 8.4, -19, 3, 3, 0.8, { mat: { side: 'wood', top: 'plank' } }));
    st(L.cyl(-17, 7.6, -19, 0.9, 8.6, { mat: 'wood', seg: 12 }));
    L.key(-17, 9.4, -19, 'tapinak');
    L.vista(-17, 8.4, -19, { title: 'Sisli Tapınak', yaw: Math.atan2(-17, 43), pitch: 0.24, dist: 20 });

    // ============================================================ temple island — ziggurat (centre (0, ·, −62))
    const zig = { mat: { side: 'cliff', top: 'stone' } };
    // tier 1 (top 4, 30×30) around the stair notch x −2…2, z −47…−51.8
    st(L.box(-8.5, 4, -62, 13, 30, 4, zig)); st(L.box(8.5, 4, -62, 13, 30, 4, zig)); st(L.box(0, 4, -64.4, 4, 25.2, 4, zig));
    // tier 2 (top 8, 24×24) and tier 3 (top 12, 18×18) around the courtyard cut x −5…5, z −50…−55.5
    st(L.box(-8.5, 8, -62, 7, 24, 4, zig)); st(L.box(8.5, 8, -62, 7, 24, 4, zig)); st(L.box(0, 8, -64.75, 10, 18.5, 4, zig));
    st(L.box(-7, 12, -62, 4, 18, 4, zig)); st(L.box(7, 12, -62, 4, 18, 4, zig)); st(L.box(0, 12, -63.25, 10, 15.5, 4, zig));
    st(L.box(0, 16, -62, 12, 12, 4, zig));            // tier 4
    st(L.box(0, 20, -62, 6, 6, 4, zig));              // tier 5 — altar
    // stair notch behind the gate: two 1.35 m steps up to the courtyard floor (tier-1 top 4)
    st(L.box(0, 1.35, -48.2, 4, 2.4, 1.85, { mat: 'stone' }));
    st(L.box(0, 2.7, -50.6, 4, 2.4, 3.2, { mat: 'stone' }));
    // tier stairs
    for (const [x, t, z] of TSTEPS) st(L.box(x, t, z, 2.6, 2.6, 2.4, { mat: 'stone' }));
    // gate: lintel + pillars, the key door, guardian statues, serpent heads on the stair cheeks
    st(L.box(0, 6.6, -46.5, 5.4, 0.7, 2.6, { mat: 'cliff' }));   // lintel 4.0…6.6: the 0.8 m slit above the 3.2 m door is too low for Pıtır
    st(L.box(-3.2, 6.6, -46.4, 1.0, 1.2, 6.6, { mat: 'cliff' })); st(L.box(3.2, 6.6, -46.4, 1.0, 1.2, 6.6, { mat: 'cliff' }));
    L.door(0, 0, -46.5, 4, 0.6, 3.2, 'tapinak');
    for (const sx of [-1, 1]) {
      deco(L.prop('gothic_statue', sx * 5, 0, -45, { scale: 2, rotY: Math.PI + sx * 0.25, tint: 0xb8c0b0, collide: 'cyl', r: 0.9, h: 3.4 }));
      deco(L.prop('serpent_balustrade_head', sx * 2.6, 4, -47.6, { scale: 1.3, rotY: 0, tint: 0xc8d0b8 }));
    }
    L.checkpoint(0, 0, -38);
    L.crystal(0, 5.4, -52, CRYSTAL_COLORS[1]);
    L.checkpoint(6, 12, -54);
    L.sign(8.6, 12, -56.6, 'Havada B ile\ndüğmeye çak!', { rotY: Math.PI / 2 });
    // altar puzzle: timed pound switch on tier 4 → two risers → tier 5
    L.switch(4, 16, -62, 'sunak', { pound: true, timed: 10 });
    L.riser(L.box(-4.6, 15.9, -58, 2.6, 2.6, 3, { mat: 'stone' }), 1.5, 1, 'sunak');
    L.riser(L.box(-4, 15.9, -61, 2.6, 2.6, 4, { mat: 'stone' }), 2.9, 1, 'sunak');
    L.crystal(0, 21.4, -62, CRYSTAL_COLORS[2]);
    // secret: the lion head on the gate face spits coins when you pound the worn stone in front of it
    deco(L.prop('lion_head', 8, 1.2, -46.95, { scale: 4.5, tint: 0xb8c0b0 }));
    L.secret(8, 0, -44, { coins: 12, pound: true });

    // ------------------------------------------------ ④ waterfall ledge (crumbling log bridge arrives here)
    st(L.box(28, 2, -49, 4, 4, 3, { mat: { side: 'cliff', top: 'stone' } }));
    st(L.box(27, 11, -54.5, 6, 4, 12.5, { mat: { side: 'cliff', top: 'ground' } }));
    {
      const water = canvasTex(L, 128, 512, (x, w, h) => {
        const base = x.createLinearGradient(0, 0, w, 0);
        base.addColorStop(0, 'rgba(170,220,235,0.35)'); base.addColorStop(0.5, 'rgba(200,236,248,0.7)'); base.addColorStop(1, 'rgba(170,220,235,0.35)');
        x.fillStyle = base; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) {
          const sx = (i * 41) % w, sw = 2 + (i * 7) % 6, sy = (i * 97) % h, sl = 60 + (i * 53) % 180;
          for (const oy of [sy, sy - h]) {
            const g = x.createLinearGradient(0, oy, 0, oy + sl);
            g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${0.45 + ((i * 13) % 10) / 20})`); g.addColorStop(1, 'rgba(255,255,255,0)');
            x.fillStyle = g; x.fillRect(sx, oy, sw, sl);
          }
        }
      });
      water.wrapS = water.wrapT = THREE.RepeatWrapping; water.repeat.set(1.5, 2.5);
      const wm = L.own(new THREE.MeshBasicMaterial({ map: water, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: 0xe8f8ff }));
      const curtain = new THREE.Mesh(L.own(new THREE.PlaneGeometry(4.4, 12.4)), wm);
      curtain.position.set(27, 4.85, -52.35); L.smallLayer(curtain); L.add(curtain); deco(curtain);
      const mistTex = canvasTex(L, 64, 64, (x, w) => {
        const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w);
      });
      const mist = new THREE.Sprite(L.own(new THREE.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0.7 })));
      mist.position.set(27, -0.4, -51.6); mist.scale.set(7, 3, 1); L.smallLayer(mist); L.add(mist); deco(mist);
      L.dynamic({ update(dt, t) { water.offset.y += dt * 1.4; mist.material.opacity = 0.55 + Math.sin(t * 3) * 0.12; mist.scale.x = 7 + Math.sin(t * 2.1) * 0.6; } });
      deco(L.prop('boulder_mossy', 25, 11, -55, { scale: 1.4, rotY: 0.4 }));
      deco(L.prop('bush_round', 29, 11, -55.5, { scale: 1.6, tint: 0x9ccc7a }));
      deco(L.prop('fern_clump', 26.8, 11, -53.4, { castShadow: false, scale: 2.2 }));
    }
    L.crystal(28, 3.4, -49, CRYSTAL_COLORS[3]);

    // crumbling log bridge: wood planks on a floating log, delay 1.0, respawn 6
    for (const [x, t, z] of LOGS) {
      const c = L.crumble(L.box(x, t, z, 2.6, 2.6, 0.6), { skin: 'wood', delay: 1.0, respawn: 6 });
      const log = deco(L.prop('dead_tree_trunk_02', 0, 0, 0, { scale: 0.75, rotY: Math.atan2(10.5, -3) }));
      log.removeFromParent(); c.mesh.add(log); log.position.set(0, -0.85, 0);
    }

    // ============================================================ Muz Koyu islet
    for (const [x, t, z] of STUMPS) st(L.cyl(x, t, z, 1.3, t + 3, { mat: { side: 'wood', top: 'plank' }, seg: 14 }));
    st(L.box(36, 2, -30, 3, 3, 6, { mat: { side: 'cliff', top: 'ground' } }));
    st(L.box(38, 4, -33, 3, 3, 8, { mat: { side: 'cliff', top: 'ground' } }));
    deco(L.prop('boulder_mossy', 35.4, 0, -27.8, { scale: 1.3, rotY: 1.1 }));
    deco(L.prop('boulder_mossy', 39.6, 2, -30.6, { scale: 1.1, rotY: 2.3 }));
    L.checkpoint(34, 0, -18);
    L.heart(35.2, 1, -19.4);
    L.crystal(38, 5.4, -33, CRYSTAL_COLORS[4]);
    // two bats circle crystal ⑤ tightly (short swoop range) so they never reach the crumbling log bridge
    foe(L.bat([38, 4, -33], { r: 2, h: 1.8, phase: 0, range: 3.5 }));
    foe(L.bat([38, 4, -33], { r: 2, h: 1.8, phase: 0.5, range: 3.5 }));
    L.tree(30.5, -21.5, { kind: 'palm', scale: 0.9, height: 5, r: 0.36, y0: -1, y1: 2 });
    L.tree(37.5, -20, { kind: 'palm', scale: 0.8, height: 4.4, r: 0.32, y0: -1, y1: 1.8 });
    L.tree(29.5, -26.5, { kind: 'palm', scale: 0.75, height: 4.2, r: 0.3, y0: -1, y1: 1.7 });

    // ============================================================ enemies
    foe(L.slime(8, 0, 4, 4));
    foe(L.slime(-4, 0, -13, 3, 0x4cc9f0));
    foe(L.slime(31, 0, -25, 2.5, 0xf15bb5));
    foe(L.slime(-18, 0, -56, 3));
    foe(L.slime(18, 0, -70, 3, 0x4cc9f0));
    foe(L.spiky([-10, 0, -17], [-4, 0, -17], 2.4));
    foe(L.spiky([18, 0, -53], [18, 0, -64], 2.6));
    foe(L.bat([-10, 0, -40], { r: 3, h: 2, phase: 0.25 }));

    // ============================================================ coins (98 + 12 secret = 110)
    L.coinLine([0, 1, 13], [3, 1, -3], 6);
    L.coinLine([3.5, 1, -11], [2, 1, -18], 4);
    L.coinRing(-18, 1, 4, 2.2, 6);
    for (const [x, t, z] of ROOTS) L.coin(x, t + 1, z);
    L.coinLine([12, 1, 0], [21, 1, -1.5], 5);
    L.coinRing(-4, 1, 9, 2.5, 6);
    for (const z of [-26.5, -29.5, -32.5]) L.coin(0, 1.4, z);
    L.coinLine([0, 1, -37], [0, 1, -44], 4);
    L.coin(0, 2.4, -48.2); L.coin(0, 3.7, -50.6);
    L.coinLine([-4, 5, -48.5], [-12, 5, -48.5], 4);
    L.coinLine([-13.5, 5, -52], [-13.5, 5, -63], 5);
    for (const [x, t, z] of TSTEPS) L.coin(x, t + 1, z);
    L.coinLine([-8, 9, -72.5], [8, 9, -72.5], 6);
    L.coinLine([10.5, 9, -69], [10.5, 9, -62], 4);
    L.coinLine([3, 17, -57.5], [-2, 17, -57.5], 3);
    L.coinRing(0, 21, -62, 1.8, 4);
    for (const [x, t, z] of STUMPS) L.coin(x, t + 1, z);
    L.coinRing(34, 1, -23, 4.5, 8);
    L.coin(36, 3, -30); L.coin(37, 4.4, -31.5);
    for (const [x, t, z] of LOGS) L.coin(x, t + 1, z);
    L.coinLine([26.5, 3, -47.5], [29.5, 3, -47.5], 3);
    L.coinLine([22, 1, -48.5], [16, 1, -47], 4);

    // ============================================================ scatter (deterministic, ≤ 120 props for the low tier)
    const villageClear = [[0, -14, 9], [-6, -20, 6], [7, -18, 6], [0, 18, 5], [2, 16, 3], [1, 6, 3.5], [3, -2, 3.5], [4, -7, 3.5], [1, -20, 5], [-18, 4, 6.5], [-15, -10, 7.5],
      [-17, -19, 4], [-6, 20, 4.5], [18, -1, 3.5], [-8.5, -1.5, 2], [13, 12, 4], [-11.5, 13, 4], [12.5, -12, 4], [8, 4, 2.5]];
    const templeClear = [[0, -38, 5], [0, -44, 6], [8, -44, 3], [20, -49, 4.5], [-10, -40, 3.5], [-18, -56, 3], [18, -70, 3], [18, -58, 3.5]];
    L.scatter('oak_ancient', { center: [0, 0], rMin: 6, rMax: 21.5, count: 8, scale: [1.5, 2.0], collide: 'cyl', r: 0.5, h: 4, margin: 2.5, keepClear: villageClear });
    L.scatter('oak_ancient', { center: TEMPLE, rMin: 18, rMax: 24.5, count: 8, scale: [1.3, 1.8], collide: 'cyl', r: 0.5, h: 4, margin: 2.5, keepClear: templeClear });
    L.scatter('birch_mature', { center: [0, 0], rMin: 9, rMax: 22, count: 8, scale: [0.9, 1.2], collide: 'cyl', r: 0.2, h: 3, margin: 1.5, keepClear: villageClear });
    L.scatter('birch_young', { center: TEMPLE, rMin: 17, rMax: 24.5, count: 8, scale: [0.9, 1.3], margin: 1.2, keepClear: templeClear });
    L.scatter('stump_mossy', { castShadow: false, center: [0, 0], rMin: 5, rMax: 22, count: 8, scale: [1.2, 1.8], margin: 0.8, keepClear: villageClear });
    L.scatter('mushroom_group', { castShadow: false, center: [0, 0], rMin: 4, rMax: 22, count: 8, scale: [1.0, 1.6], margin: 0.6, keepClear: villageClear });
    L.scatter('fern_clump', { castShadow: false, center: [0, 0], rMin: 4, rMax: 23, count: 14, scale: [1.6, 2.6], margin: 0.6, keepClear: villageClear });
    L.scatter('root_cluster', { castShadow: false, center: [-16, -8], rMin: 1.2, rMax: 3.2, count: 8, y: -0.35, scale: [1.2, 1.6], margin: 0, tint: 0x9a7a58 });
    L.scatter('fern_02', { castShadow: false, center: TEMPLE, rMin: 16, rMax: 25, count: 12, scale: [1.2, 1.8], margin: 0.6, keepClear: templeClear });
    L.scatter('boulder_mossy', { center: TEMPLE, rMin: 17, rMax: 25, count: 8, scale: [0.9, 1.6], margin: 0.8, collide: 'cyl', r: 0.6, h: 0.9, keepClear: templeClear });
    L.scatter('slab_upright', { center: TEMPLE, rMin: 17, rMax: 24, count: 8, scale: [1.0, 1.5], margin: 1.0, tint: 0xc8d0b8, collide: 'cyl', r: 0.45, h: 1.8, keepClear: templeClear });
    L.scatter('moss_patch', { castShadow: false, center: TEMPLE, rMin: 16, rMax: 25, count: 8, scale: [1.2, 2.0], margin: 0.4, keepClear: templeClear });
    L.clouds(12, { yMin: 26 });

    // ivy curtains hanging from the tier edges (one merged mesh, alpha-tested canvas texture)
    {
      const ivy = canvasTex(L, 128, 256, (x, w, h) => {
        const greens = ['#2f6b2a', '#3f8a35', '#58a845', '#79c25a'];
        for (let v = 0; v < 5; v++) {
          let cx = 14 + v * 25, len = h * (0.45 + ((v * 37) % 50) / 100);
          x.strokeStyle = '#2d4a1e'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx, 0);
          for (let yy = 0; yy < len; yy += 8) { cx += Math.sin(yy * 0.07 + v) * 1.6; x.lineTo(cx, yy); }
          x.stroke();
          cx = 14 + v * 25;
          for (let yy = 0; yy < len; yy += 7) {
            cx += Math.sin(yy * 0.07 + v) * 1.6 * (7 / 8);
            const k = 1 - yy / len, r = 4 + 6 * k;
            for (const sd of [-1, 1]) {
              x.fillStyle = greens[(v + yy / 7 + (sd > 0 ? 1 : 0)) % 4 | 0];
              x.beginPath(); x.ellipse(cx + sd * r * 0.9, yy + 2, r, r * 0.6, sd * 0.6, 0, Math.PI * 2); x.fill();
            }
          }
        }
        x.fillStyle = '#3f8a35'; x.fillRect(0, 0, w, 10);
      });
      const faces = [   // [axis 'x'|'z', plane coord, normal sign, from, to, yTop, height]
        ['z', -47, 1, -15, -4.5, 4, 4], ['z', -47, 1, 4.5, 6.5, 4, 4], ['z', -47, 1, 9.5, 15, 4, 4],
        ['x', -15, -1, -76, -48, 4, 4], ['x', 15, 1, -76, -48, 4, 4], ['z', -77, -1, -14, 14, 4, 4],
        ['z', -50, 1, -12, -5, 8, 4], ['z', -50, 1, 5, 12, 8, 4], ['x', -12, -1, -73, -51, 8, 4], ['x', 12, 1, -73, -51, 8, 4],
        ['z', -53, 1, -9, -5, 12, 4], ['z', -53, 1, 5, 9, 12, 4], ['x', -9, -1, -70, -54, 12, 4], ['x', 9, 1, -70, -54, 12, 4],
        ['z', -55.5, 1, -5, 5, 12, 8], ['z', -56, 1, -6, 6, 16, 4], ['x', -6, -1, -67, -57, 16, 4], ['z', -59, 1, -3, 3, 20, 4],
      ];
      const quads = [];
      for (const [ax, c, n, a, b, yTop, fh] of faces) {
        const cnt = Math.max(1, Math.round((b - a) / 4.5));
        for (let i = 0; i < cnt; i++) {
          const w = 1.4 + L.rnd() * 0.9, hh = fh * (0.5 + L.rnd() * 0.42), u = a + ((i + 0.2 + L.rnd() * 0.6) / cnt) * (b - a);
          const q = new THREE.PlaneGeometry(w, hh).translate(0, -hh / 2, 0);
          q.rotateY(ax === 'z' ? (n > 0 ? 0 : Math.PI) : (n > 0 ? Math.PI / 2 : -Math.PI / 2));
          q.translate(ax === 'z' ? u : c + n * 0.04, yTop, ax === 'z' ? c + n * 0.04 : u);
          quads.push(q.toNonIndexed()); q.dispose();
        }
      }
      const geo = L.own(mergeGeometries(quads)); quads.forEach((q) => q.dispose());
      const mesh = new THREE.Mesh(geo, L.own(new THREE.MeshStandardMaterial({ map: ivy, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 })));
      mesh.receiveShadow = true; mesh.name = 'orman:ivy'; L.smallLayer(mesh); L.add(mesh);
    }

    batchStatic(L, S);

    // distance cull for the low / medium tiers (checked 5× a second around Pıtır; dead enemies stay hidden)
    const far = { low: 55, medium: 60 }[L.quality.tier];
    if (far) {
      let acc = 1;
      const f2 = far * far, pp = L.player.pos;
      L.dynamic({
        update(dt) {
          if ((acc += dt) < 0.2) return;
          acc = 0;
          for (const c of cull) {
            const o = c.e ? c.e.group : c.o;
            if (c.e && !c.e.alive) continue;
            o.getWorldPosition(c.w ??= new THREE.Vector3());
            const dx = c.w.x - pp.x, dz = c.w.z - pp.z;
            o.visible = dx * dx + dz * dz < f2;
          }
        },
      });
    }

    // ============================================================ audio: waterfall roar + temple ambience (level.update)
    L.dynamic({
      update() {},
      dispose() {
        L.audio.stopLoop('orman-falls', 0.2); L.audio.stopLoop('orman-temple', 0.2);
        L.audio.release(['amb_cave_stream', 'amb_temple_airy']);
      },
    });
  },

  // Music crossfades to the temple bed while Pıtır is on the temple island (+ amb_temple_airy); the waterfall roars
  // (amb_cave_stream) with a gain by distance.
  update(dt, t, L) {
    const s = this._st; if (!s || !L) return;
    const a = L.audio, p = L.player.pos;
    const onTemple = p.z < -32 && Math.hypot(p.x - TEMPLE[0], p.z - TEMPLE[1]) < (s.temple ? 28.5 : 26.5);
    if (onTemple !== s.temple) {
      s.temple = onTemple;
      if (a.state.musicPlaying) a.playMusic(onTemple ? 'music_mystery_bed' : 'music_tropical_banana', { crossfade: 2 });
      if (!onTemple) a.stopLoop('orman-temple', 2);
    }
    if (s.temple && !a.isLooping('orman-temple')) a.playLoop('amb_temple_airy', { id: 'orman-temple', bus: 'amb', fadeIn: 2, gain: 0.6 });
    const d = p.distanceTo(FALLS), g = Math.max(0, 1 - d / 32) * 0.9;
    if (g > 0 && !a.isLooping('orman-falls')) a.playLoop('amb_cave_stream', { id: 'orman-falls', bus: 'amb', fadeIn: 0, gain: 0 });
    a.setLoopGain('orman-falls', g, 0.3);
  },

  // Waypoints stand on fixed ground only (never on a riser / crumble / switch-moved stone: probed after ~4 s of play);
  // 'jump' hops ≤ 6.5 m across / ≤ 2.5 m up, 'walk' ≤ 0.7 m up on one surface.
  testPath: [
    { at: [0, 0.1, 18], via: 'walk', note: 'spawn' },
    { at: [-13, 0, 4], via: 'walk', note: 'Kök Çukuru entrance (open east side)' },
    { at: [-18, 0.03, 4], via: 'walk', note: 'crystal 1 Kök Çukuru (3 bats)' },
    { at: [4, 0.35, -8], via: 'walk', note: "river switch 'nehir'" },
    { at: [-10, 0, -2.5], via: 'walk', note: 'root stair foot' },
    { at: ROOTS[0], via: 'jump', note: 'root step 1' },
    { at: ROOTS[1], via: 'jump' }, { at: ROOTS[2], via: 'jump' }, { at: ROOTS[3], via: 'jump' }, { at: ROOTS[4], via: 'jump' },
    { at: [-17, 8.4, -19], via: 'jump', note: "oak canopy: key 'tapinak' + vista" },
    { at: [-13, 0, -19], via: 'jump', note: 'drop to the village' },
    { at: [2, 0, -20], via: 'walk', note: 'river bank checkpoint' },
    { at: [0, 0, -23], via: 'walk', note: 'river bank' },
    { at: [0, 0, -35.5], via: 'riser', note: 'three river stones raised by the switch → temple shore' },
    { at: [0, 0, -38], via: 'walk', note: 'temple shore checkpoint' },
    { at: [0, 0, -45.5], via: 'walk', note: 'gate (the key opens the door)' },
    { at: [0, 1.35, -48.2], via: 'jump', note: 'stair notch step 1 (door open)' },
    { at: [0, 2.7, -50.6], via: 'jump', note: 'step 2' },
    { at: [0, 4, -53], via: 'jump', note: 'courtyard, crystal 2' },
    { at: [-3.5, 4, -50.8], via: 'walk' },
    { at: [-3.5, 4, -48.5], via: 'walk', note: 'tier 1 south ledge' },
    { at: [-13.5, 4, -48.5], via: 'walk' },
    { at: [-13.5, 4, -64], via: 'walk', note: 'tier 1 west ledge' },
    { at: TSTEPS[0], via: 'jump', note: 'NW step A' }, { at: TSTEPS[1], via: 'jump', note: 'NW step B' },
    { at: [-10.8, 8, -69.4], via: 'jump', note: 'tier 2' },
    { at: [-10.5, 8, -72.5], via: 'walk' },
    { at: [10.5, 8, -72.5], via: 'walk', note: 'tier 2 north ledge' },
    { at: [10.5, 8, -61], via: 'walk', note: 'tier 2 east ledge' },
    { at: TSTEPS[2], via: 'jump', note: 'step C' }, { at: TSTEPS[3], via: 'jump', note: 'step D' },
    { at: [7.5, 12, -55.5], via: 'jump', note: 'tier 3 checkpoint + sign' },
    { at: TSTEPS[4], via: 'jump', note: 'step E' }, { at: TSTEPS[5], via: 'jump', note: 'step F' },
    { at: [5.2, 16, -61.8], via: 'jump', note: 'tier 4' },
    { at: [4, 16.35, -62], via: 'walk', note: "pound switch 'sunak' (timed 10 s)" },
    { at: [4, 16, -57.5], via: 'walk' },
    { at: [-2.5, 16, -57.5], via: 'walk', note: 'tier 4 south ledge' },
    { at: [0, 20, -62], via: 'riser', note: 'two timed risers → altar, crystal 3' },
    { at: [4, 16, -57.5], via: 'jump', note: 'down to tier 4' },
    { at: [7.5, 12, -54.5], via: 'jump', note: 'tier 3' },
    { at: [10.5, 8, -52], via: 'jump', note: 'tier 2 south-east' },
    { at: [13.5, 4, -48.5], via: 'jump', note: 'tier 1 south-east' },
    { at: [18, 0, -48.5], via: 'jump', note: 'temple ground east' },
    { at: [22.5, 0, -49], via: 'walk' },
    { at: [28, 2, -49], via: 'jump', note: 'waterfall ledge, crystal 4' },
    { at: [34, 0, -29.5], via: 'crumble', note: 'crumbling log bridge (delay 1.0) → Muz Koyu' },
    { at: [36, 2, -30], via: 'jump', note: 'boulder 1' },
    { at: [38, 4, -33], via: 'jump', note: 'boulder 2, crystal 5 (2 bats)' },
    { at: [36, 2, -30], via: 'jump' },
    { at: [34, 0, -25], via: 'jump', note: 'Muz Koyu' },
    { at: [34, 0, -18], via: 'walk', note: 'Muz Koyu checkpoint + heart' },
    { at: STUMPS[3], via: 'jump', note: 'stump stones back' }, { at: STUMPS[2], via: 'jump' }, { at: STUMPS[1], via: 'jump' }, { at: STUMPS[0], via: 'jump' },
    { at: [23, 0, -2], via: 'jump', note: 'village east rim' },
    { at: [-6, 0, 17], via: 'walk', note: 'portal' },
  ],
};
