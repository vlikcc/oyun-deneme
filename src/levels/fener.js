// Level 7 — 'fener' · Fener Adası (GDD §2.10): the night finale. Light four lanterns, wake the lighthouse, cross to the cove
// and beat Kral Pelte. New: lantern (signals.js), boss (boss.js). Reused as a victory lap: ice, crumble, riser, pads, cannon.
//
// Layout (spawn (0, 0.1, 20) facing −z, meadow r 30 centred on the origin):
//   L1 (0, 16) at the spawn · keeper's cottage (−6, 12) with the secret behind it (−9, 9)
//   Mantar Korusu (east): L2 (16, 6), glowing mushroom pads (16, 8) → ledge (18, 5, top 5) → pad → treehouse (20, 2, top 8)
//   Yıldız Çukuru (south-east): hill (6, −24) r 6 top 4, stair on its east side, rimmed icy bowl, 2 bats, heart, crystal
//   L3 (−6, −22) · L4 (−12, −10) at the lighthouse base · lighthouse (−16, −10): 12 spiral ledges → gallery (top 18) with the
//   pound-only lamp switch 'lamba' (crystal 1 appears out of the lamp) and the cannon to the cove (locked until 4 lanterns)
//   Yıldız Yolu (west): jetty (−30, 0, −14) → riser → crumble → riser (rise on 'lamba') → sea rock (−45, 1, −18), crystal 2
//   Cove arena (38, 0.5, −31) r 8: reached by two lantern risers from the east pier (23, 0, −19) or the gallery cannon;
//   Kral Pelte lands when all four lanterns are lit; his crystal + the portal (38, 0.5, −28) appear when he bursts.
//
// Deviations from the GDD text (all small, for reachability / safety), reported with the build:
//   * west shore (−30, 0, −14) and east shore (22, 0, −19) lie on the beach ring outside the r 30 meadow → a plank jetty
//     (−28, 0, −14) and a plank pier (23, 0, −19) carry the path there; the east-shore checkpoint sits on the pier (23, 0, −19).
//   * the lighthouse tower top is 17.4 (under the gallery ring, top 18) so the two top discs do not z-fight; the lamp switch
//     stands on the gallery floor (top 18, button top 18.35).
//   * the gallery cannon lands on the arena's north side (38, 0.5, −25) instead of the centre, where Kral Pelte sits.
//   * crystal 1 (Deniz Feneri) is built hidden and rises out of the lamp when the lamp switch is pounded.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const THEME = {
  hdri: 'kloppenheim_02_puresky',
  hdriRotation: 0.8,
  environmentIntensity: 0.35, backgroundIntensity: 1.2,
  sun: { dir: [-0.4, 0.7, 0.5], color: 0x9fb8ff, intensity: 0.9, moon: true },
  hemi: { sky: 0x33457a, ground: 0x0e1424, intensity: 0.7 },
  fog: { color: 0x161f45, near: 40, far: 150 },
  water: { color: 0x0b2650, sunColor: 0xa8c4ff, level: -1.2, distortion: 1.4 },
  materials: {
    // GDD tints/scales; envMapIntensity lifts the moonlit HDRI fill so the night stays readable on a phone
    ground: { tex: 'aerial_grass_rock', tint: 0x8ea0d0, scale: 5, normalScale: 0.7, envMapIntensity: 2.4 },
    cliff: { tex: 'rock_face', tint: 0x7f88a8, scale: 5, envMapIntensity: 1.8 },
    stone: { tex: 'stone_tiles_02', tint: 0xa8b0cc, scale: 3, envMapIntensity: 1.8 },
    accent: { tex: 'coast_sand_01', tint: 0x9aa4c8, scale: 5, normalScale: 0.6, envMapIntensity: 2.2 },
  },
  ambience: ['amb_rainforest_night', 'amb_waves'],
  music: 'music_calm_night_1',
  particles: 'fireflies',
  clouds: false,
};

// ---------------------------------------------------------------- layout constants
const TOWER = { x: -16, z: -10 };
const SPIRAL = { n: 12, r: 5.2, a0: 1.87, da: 0.6, rise: 1.4 };            // GDD: 12 ledges 2.6², rise 1.4, radius 5.2, 0.6·i
const ledgeAt = (i) => {
  const a = SPIRAL.a0 + SPIRAL.da * i;
  return [TOWER.x + Math.cos(a) * SPIRAL.r, SPIRAL.rise * (i + 1), TOWER.z + Math.sin(a) * SPIRAL.r];
};
const GALLERY_TOP = 18;
const ARRIVE_A = SPIRAL.a0 + SPIRAL.da * 11 + 0.35;                       // where the last ledge lands you on the gallery
const ARRIVE = [TOWER.x + Math.cos(ARRIVE_A) * 3.6, GALLERY_TOP, TOWER.z + Math.sin(ARRIVE_A) * 3.6];
const LAMP_Y = GALLERY_TOP + 6.2;                                          // lens centre (visual only, high above the button)
const BOWL = { x: 6, z: -24, top: 4, outer: 4.2, t: 1.5, rimTop: 5.5 };
const ARENA = { x: 38, top: 0.5, z: -31, r: 8 };
const LANTERNS = [['L1', 0, 16], ['L2', 16, 6], ['L3', -6, -22], ['L4', -12, -10]];
const DECO_LANTERNS = [   // Lantern_01 on wooden posts (GDD §2.3: Lantern_01 ×12 = 4 lanterns + 8 path lights)
  [-3.2, 0, 13.5], [-4, 0, 9.6], [12.2, 0, 9.5], [-26.2, 0, -12.2], [-43.2, 1, -20.2], [22.4, 0, -17.8], [33.6, 0.5, -25.6], [-12.4, 0, -14.6],
];

// small helpers ----------------------------------------------------------------
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
function glowTexture(L) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = L.own(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Instances of a kit GLB at hand-picked spots: one InstancedMesh per model primitive (async; tracked by whenReady).
 *  list = [[x, y, z, rotY, scale]]; opts { fitHeight, glow(material) → material|null, castShadow }. */
function instModel(L, name, list, { fitHeight = null, glow = null, castShadow = true, skip = null } = {}) {
  const M = new THREE.Matrix4(), P = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const pr = L.assets.model(name).then((m) => {
    if (L._track.disposed || !m) return;
    const k0 = fitHeight && m.userData.bbox?.height ? fitHeight / m.userData.bbox.height : 1;
    m.updateMatrixWorld(true);
    m.traverse((o) => {
      if (!o.isMesh || (skip && skip(o.material))) return;
      const mat = (glow && glow(o.material)) || o.material;
      const im = new THREE.InstancedMesh(o.geometry, mat, list.length);
      list.forEach(([x, y, z, rotY = 0, sc = 1], i) => {
        e.set(0, rotY, 0); q.setFromEuler(e); p.set(x, y, z); s.setScalar(k0 * sc);
        P.compose(p, q, s); M.multiplyMatrices(P, o.matrixWorld); im.setMatrixAt(i, M);
      });
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
      im.castShadow = castShadow; im.receiveShadow = true; im.name = 'fener:' + name;
      L.add(im);
    });
  }).catch(() => null);
  L._track.pending.push(pr);
  return pr;
}

/** A thin emissive frame around the top edge of a 2.6² stone (child of its mesh, so risers/crumbles carry it). */
function rim(L, c, mat) {
  const w = c.w + 0.12, h = 0.14, t = 0.16, y = c.h / 2 - h / 2 + 0.01;
  const parts = [
    new THREE.BoxGeometry(w, h, t).translate(0, y, (c.d + 0.12) / 2 - t / 2),
    new THREE.BoxGeometry(w, h, t).translate(0, y, -(c.d + 0.12) / 2 + t / 2),
    new THREE.BoxGeometry(t, h, c.d).translate((w) / 2 - t / 2, y, 0),
    new THREE.BoxGeometry(t, h, c.d).translate(-(w) / 2 + t / 2, y, 0),
  ];
  const geo = L.own(mergeGeometries(parts.map((g) => g.toNonIndexed()), false)); parts.forEach((g) => g.dispose());
  const m = new THREE.Mesh(geo, mat); m.castShadow = false; m.receiveShadow = false;
  c.mesh.add(m);
  return m;
}

/** Light-beam material: additive, bright at the lens, fading toward the far end (cone uv.y = 1 at the apex). */
function beamMaterial(L) {
  return L.own(new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xfff0b8) }, uOpacity: { value: 0 } },
    vertexShader: 'varying float vA; void main(){ vA = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying float vA; void main(){ float a = pow(vA, 1.6) * uOpacity; gl_FragColor = vec4(uColor, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  }));
}

/**
 * Draw-call budget (GDD §5.2): every L.box / L.cyl is its own mesh (2 draws × main + shadow + mirror pass). Static terrain
 * colliders of this level are re-drawn as one merged mesh per [side, top] material pair; the collider meshes stay in the
 * scene (invisible) so physics, the camera pull-in, the blob shadow and groundBelow probes keep working unchanged.
 * Skipped: anything that moves or animates (risers, crumbles, switches, bounce caps, movers, cannon drum) or is hidden.
 */
function mergeStatic(L) {
  const buckets = new Map();
  const tmp = new THREE.Matrix4();
  for (const c of L._track.colliders) {
    const m = c.mesh;
    if (!m || !m.isMesh || !m.visible || m.parent !== L.scene || !Array.isArray(m.material) || m.material.length !== 2) continue;
    if (c.mover || c.bounce || c.riser || c.crumble || c.switchRec || m.children.length || c.tags?.some((t) => t === 'cannon' || t === 'switch' || t === 'door')) continue;
    const g = m.geometry; if (!g.groups.length) continue;
    m.updateMatrixWorld(true); tmp.copy(m.matrixWorld);
    const flat = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(tmp);
    const key = m.material[0].uuid + '|' + m.material[1].uuid;
    if (!buckets.has(key)) buckets.set(key, { mats: m.material, parts: [[], []], shadow: false });
    const b = buckets.get(key);
    b.shadow ||= m.castShadow;
    for (const gr of g.groups) {
      const sub = new THREE.BufferGeometry();
      for (const [name, a] of Object.entries(flat.attributes)) sub.setAttribute(name, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize, a.normalized));
      b.parts[gr.materialIndex === 1 ? 1 : 0].push(sub);
    }
    flat.dispose();
    m.visible = false;
  }
  for (const b of buckets.values()) {
    const halves = b.parts.map((list) => (list.length ? mergeGeometries(list, false) : null));
    b.parts.flat().forEach((q) => q.dispose());
    const used = halves.filter(Boolean);
    const geo = L.own(mergeGeometries(used, true));
    halves.forEach((q) => q?.dispose());
    const mats = halves[0] && halves[1] ? b.mats : [halves[0] ? b.mats[0] : b.mats[1]];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = b.shadow; mesh.receiveShadow = true; mesh.name = 'fener:static';
    L.add(mesh);
  }
}

export default {
  id: 'fener',
  name: 'Fener Adası',
  order: 7,
  subtitle: "Dört feneri yak, Kral Pelte'yi yen!",
  theme: THEME,
  spawn: [0, 0.1, 20], spawnFacing: Math.PI,
  parTime: 300,
  crystals: 5,                 // 4 built here (Deniz Feneri hidden until the lamp is lit) + Kral Pelte's reward crystal
  lanterns: 4,                 // HUD 🏮 n/4
  coinsTotal: null,
  seed: 17,

  build(L) {
    const tier = L.quality.tier;
    const S = { t: 0, lampLit: false, allLit: false, lampK: 0, rimK: 0, eastK: 0, crystal1: null, c1T: -1, ff: null, wavesSet: false, beamYaw: 0 };
    L._fener = S;
    const glowTex = glowTexture(L);
    const planks = L.assets.pbrTex('weathered_planks', { scale: 1.6, tint: 0x9ea6c8, roughness: 0.9 });

    // ============================================================ meadow, shores, jetty, pier
    L.island(0, 0, 0, 30, 8, { beach: true });
    L.box(-28, 0, -14, 6, 3, 2.4, { mat: { side: planks, top: planks }, steps: 'stone' });       // west jetty → Yıldız Yolu
    L.box(23, 0, -19, 3, 3, 2.4, { mat: { side: planks, top: planks }, steps: 'stone' });        // east pier → cove risers
    for (const [x, z] of [[-30.6, -12.7], [-30.6, -15.3], [24.3, -17.7], [21.7, -20.3]]) L.cyl(x, 0.5, z, 0.22, 3.2, { mat: 'wood', seg: 8, castShadow: false });   // mooring posts

    // ============================================================ keeper's cottage (solid block, no interior) + secret behind it
    const cot = L.box(-6, 2.8, 12, 4.4, 4, 3.8, { mat: { side: planks, top: planks } });
    const roofCol = L.box(-6, 3.7, 12, 3.2, 2.8, 0.9, { mat: 'stone' }); roofCol.mesh.visible = false;   // walkable roof plateau (visual = frustum)
    {
      const roof = new THREE.Mesh(L.own(new THREE.CylinderGeometry(0.9, 3.45, 1.7, 4, 1).rotateY(Math.PI / 4)), L.assets.flat(0x5a2f3a, { roughness: 0.9 }));
      roof.scale.set(1, 1, 0.92); roof.position.set(-6, 2.8 + 0.85, 12); roof.castShadow = true; roof.receiveShadow = true; L.add(roof);
      const warm = L.own(new THREE.MeshStandardMaterial({ color: 0xffd58a, emissive: 0xffb347, emissiveIntensity: 1.6 }));
      const win = [
        new THREE.BoxGeometry(0.9, 0.8, 0.08).translate(-7.1, 1.6, 14.02), new THREE.BoxGeometry(0.08, 0.8, 0.9).translate(-8.22, 1.6, 11.2),
        new THREE.BoxGeometry(0.08, 0.8, 0.9).translate(-3.78, 1.6, 12.6),
      ];
      // lighthouse windows (tower radius ≈ 2.9 at mid height) on the meadow side
      for (const [a, y] of [[0.9, 5], [1.9, 9.5], [0.4, 13.5]]) {
        const r = 2.76 + ((y + 1) / 18.4) * 0.24 + 0.03;
        win.push(new THREE.BoxGeometry(0.7, 1.0, 0.1).rotateY(-a + Math.PI / 2).translate(TOWER.x + Math.cos(a) * r, y, TOWER.z + Math.sin(a) * r));
      }
      const wg = L.own(mergeGeometries(win.map((g) => g.toNonIndexed()), false)); win.forEach((g) => g.dispose());
      L.add(new THREE.Mesh(wg, warm));
      const dark = [
        new THREE.BoxGeometry(1.0, 1.9, 0.1).translate(-5, 0.95, 14.03),                                   // cottage door
        new THREE.BoxGeometry(0.6, 1.4, 0.6).translate(-4.9, 4.5, 11.2),                                    // chimney
        new THREE.BoxGeometry(1.3, 2.2, 0.2).rotateY(-0.25 + Math.PI / 2).translate(TOWER.x + Math.cos(0.25) * 2.83, 1.1, TOWER.z + Math.sin(0.25) * 2.83),   // tower door
      ];
      const dg = L.own(mergeGeometries(dark.map((g) => g.toNonIndexed()), false)); dark.forEach((g) => g.dispose());
      const dm = new THREE.Mesh(dg, L.assets.flat(0x3a2a2a)); dm.castShadow = true; L.add(dm);
    }
    L.secret(-10, 0, 8.6, { coins: 12, ringR: 1.8 });

    // ============================================================ lanterns (walk-in) + signpost
    for (const [id, x, z] of LANTERNS) L.lantern(x, z, id, { y: 0 });
    const signsMade = [L.sign(0, 0, 18, 'Dört feneri yak —\nfener kulesi uyansın!', { rotY: 0.35 })];

    // decorative path lights: wooden posts (invisible box colliders) + instanced Lantern_01 with a warmer glass + one Points glow
    {
      const postGeo = L.own(new THREE.CylinderGeometry(0.09, 0.12, 1.6, 7).translate(0, 0.8, 0));
      const posts = new THREE.InstancedMesh(postGeo, L.assets.pbr('wood'), DECO_LANTERNS.length);
      const m4 = new THREE.Matrix4();
      DECO_LANTERNS.forEach(([x, y, z], i) => {
        m4.makeTranslation(x, y, z); posts.setMatrixAt(i, m4);
        const c = L.box(x, y + 1.6, z, 0.3, 0.3, 1.6, { mat: 'stone', castShadow: false }); c.mesh.visible = false;
      });
      posts.instanceMatrix.needsUpdate = true; posts.computeBoundingSphere(); posts.castShadow = true; posts.receiveShadow = true;
      L.add(posts);
      instModel(L, 'Lantern_01', DECO_LANTERNS.map(([x, y, z], i) => [x, y + 1.6, z, i * 0.9, 1]), {
        fitHeight: 0.6, castShadow: false,
        glow: (m) => (m.userData?.glassSwap ? L.own(Object.assign(m.clone(), { emissiveIntensity: 1.8 })) : null),
      });
      const gp = new Float32Array(DECO_LANTERNS.length * 3);
      DECO_LANTERNS.forEach(([x, y, z], i) => gp.set([x, y + 1.85, z], i * 3));
      const gg = L.own(new THREE.BufferGeometry()); gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
      const glow = new THREE.Points(gg, L.own(new THREE.PointsMaterial({ size: 2.4, map: glowTex, color: 0xffb860, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 })));
      L.smallLayer(glow); L.add(glow);
    }

    // ============================================================ lighthouse + gallery + lamp
    L.cyl(TOWER.x, 17.4, TOWER.z, 3, 18.4, { mat: { side: 'stone', top: 'stone' }, seg: 28 });
    L.cyl(TOWER.x, GALLERY_TOP, TOWER.z, 4.5, 0.6, { mat: 'stone', seg: 32 });
    for (let i = 0; i < SPIRAL.n; i++) { const [x, y, z] = ledgeAt(i); L.box(x, y, z, 2.6, 2.6, 0.8, { mat: 'stone' }); }
    {
      // red bands + gallery trim (visual)
      const rAt = (y) => 2.76 + ((y + 1) / 18.4) * 0.24 + 0.04;
      const bands = [3.5, 9.5, 15].map((y) => new THREE.CylinderGeometry(rAt(y + 1.2), rAt(y - 1.2), 2.4, 28, 1, true).translate(TOWER.x, y, TOWER.z));
      const bg = L.own(mergeGeometries(bands.map((g) => g.toNonIndexed()), false)); bands.forEach((g) => g.dispose());
      const bm = new THREE.Mesh(bg, L.assets.flat(0xb8343f, { flatShading: false, roughness: 0.7 })); bm.receiveShadow = true; L.add(bm);
      // lamp cage: 4 iron posts from the gallery to the lens + a small cap above the lens (all far above the jump arc)
      const iron = [];
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        iron.push(new THREE.CylinderGeometry(0.07, 0.09, LAMP_Y - GALLERY_TOP + 0.4, 6).translate(TOWER.x + Math.cos(a) * 1.7, (GALLERY_TOP + LAMP_Y + 0.4) / 2, TOWER.z + Math.sin(a) * 1.7));
        iron.push(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6).rotateZ(Math.PI / 2).rotateY(-a).translate(TOWER.x + Math.cos(a) * 0.85, LAMP_Y + 0.4, TOWER.z + Math.sin(a) * 0.85));
      }
      iron.push(new THREE.ConeGeometry(1.5, 1.1, 12).translate(TOWER.x, LAMP_Y + 1.3, TOWER.z));
      iron.push(new THREE.TorusGeometry(4.4, 0.08, 6, 48).rotateX(Math.PI / 2).translate(TOWER.x, GALLERY_TOP + 0.05, TOWER.z));
      const ig = L.own(mergeGeometries(iron.map((g) => g.toNonIndexed()), false)); iron.forEach((g) => g.dispose());
      const im = new THREE.Mesh(ig, L.assets.flat(0x2c3248, { roughness: 0.5, metalness: 0.4 })); im.castShadow = true; L.add(im);
      // lens
      S.lensMat = L.own(new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffe39a, emissiveIntensity: 0.12, roughness: 0.2 }));
      const lens = new THREE.Mesh(L.own(new THREE.SphereGeometry(0.9, 20, 14)), S.lensMat); lens.position.set(TOWER.x, LAMP_Y, TOWER.z); L.add(lens);
      S.lensGlow = new THREE.Sprite(L.own(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe7a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })));
      S.lensGlow.scale.setScalar(7); S.lensGlow.position.copy(lens.position); L.smallLayer(S.lensGlow); L.add(S.lensGlow);
      // rotating beam (two opposite cones, one draw) + a real SpotLight sweeping the ground (high/medium only)
      const LEN = 46, RAD = 4.2;
      const c1 = new THREE.ConeGeometry(RAD, LEN, 20, 1, true).translate(0, -LEN / 2, 0).rotateZ(Math.PI / 2);   // apex at origin, base at +x
      const c2 = c1.clone().rotateY(Math.PI);
      const beamGeo = L.own(mergeGeometries([c1, c2], false)); c1.dispose(); c2.dispose();
      S.beamMat = beamMaterial(L);
      S.beam = new THREE.Mesh(beamGeo, S.beamMat); S.beam.position.copy(lens.position); S.beam.rotation.z = -0.08;
      S.beam.visible = false; S.beam.renderOrder = 4; S.beam.frustumCulled = false; L.smallLayer(S.beam); L.add(S.beam);
      if (tier !== 'low') {
        const spot = new THREE.SpotLight(0xfff0c0, 0, 90, 0.16, 0.55, 2);
        spot.castShadow = false; spot.position.copy(lens.position);
        L.add(spot); L.add(spot.target);
        S.spot = spot;
      }
    }
    L.switch(TOWER.x, GALLERY_TOP, TOWER.z, 'lamba', { pound: true });
    signsMade.push(L.sign(TOWER.x - 1.6, GALLERY_TOP, TOWER.z - 3.2, 'Lambaya havada\nB ile vur!', { rotY: 0.5 }));
    L.vista(TOWER.x - 3.2, GALLERY_TOP, TOWER.z - 1.2, { title: 'Fener Işığı', yaw: -1.2, pitch: 0.42, dist: 24 });
    // crystal 1 — Deniz Feneri: built hidden, rises out of the lamp when the lamp switch is pounded
    S.crystal1 = L.crystal(TOWER.x, GALLERY_TOP + 1.4, TOWER.z, 0xffe066);
    S.crystal1.taken = true; S.crystal1.group.visible = false;
    // gallery cannon → the cove arena (locked until the four lanterns are lit; signals 'lanterns' count ≥ 4)
    const cannon = L.cannon(-14, GALLERY_TOP, -8, { to: [ARENA.x, 0.6, -25], apex: 8, locked: 'lanterns', need: 4 });
    cannon.coins(5);

    // ============================================================ Yıldız Yolu (west): riser, crumble, riser → sea rock
    S.rimMat = L.own(new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x7fd0ff, emissiveIntensity: 0.08, roughness: 0.4 }));
    const r1 = L.box(-33, -3, -15, 2.6, 2.6, 1.6, { mat: 'stone' });
    const cr = L.box(-36.5, 0.6, -16, 2.6, 2.6, 1.6, { mat: 'stone' });
    const r2 = L.box(-40, -3, -17, 2.6, 2.6, 1.6, { mat: 'stone' });
    L.riser(r1, 3.4, 1.6, 'lamba');
    L.riser(r2, 3.4, 1.9, 'lamba');
    L.crumble(cr, { skin: 'rock', delay: 1.0, respawn: 4, look: true });
    for (const c of [r1, cr, r2]) rim(L, c, S.rimMat);
    L.cyl(-45, 1, -18, 3, 4.2, { mat: { side: 'cliff', top: 'stone' }, seg: 22 });
    L.crystal(-45, 2.4, -18, 0x7fd0ff);

    // ============================================================ Mantar Korusu (east): glowing mushroom pads → treehouse
    {
      const capMat = L.own(new THREE.MeshStandardMaterial({ color: 0xff8ad8, emissive: 0xd23cff, emissiveIntensity: 0.55, roughness: 0.45 }));
      const capSide = L.own(new THREE.MeshStandardMaterial({ color: 0xf2e6ff, emissive: 0x8a5cff, emissiveIntensity: 0.25, roughness: 0.6 }));
      L.cyl(16, 0.45, 8, 1.3, 0.45, { mat: { side: capSide, top: capMat }, taper: 0.55, seg: 18, bounce: 27 });
      L.cyl(18, 4.2, 5, 0.45, 4.4, { mat: 'wood', seg: 10 });                                   // trunk under the ledge
      L.box(18, 5, 5, 3, 3, 0.8, { mat: { side: planks, top: planks } });
      L.cyl(18, 5.45, 5, 1.1, 0.45, { mat: { side: capSide, top: capMat }, taper: 0.55, seg: 18, bounce: 27 });
      L.cyl(20, 7.2, 2, 0.6, 7.4, { mat: 'wood', seg: 10 });                                    // treehouse trunk
      L.box(20, 8, 2, 3, 3, 0.8, { mat: { side: planks, top: planks } });
      L.crystal(20, 9.4, 2, 0xff7ad9);
      // glowing mushroom groups (instanced, emissive copies of the kit materials)
      const glowMush = (m) => {
        if (/moss/i.test(m.name || '')) return null;
        const c = L.own(m.clone()); c.emissive = new THREE.Color(/red/i.test(m.name || '') ? 0xff4fa8 : 0x7ff0ff); c.emissiveIntensity = 0.9;
        return c;
      };
      instModel(L, 'mushroom_group', [
        [13.2, 0, 7.2, 0.4, 1.3], [17.6, 0, 9.8, 2.1, 1.1], [19.8, 0, 6.8, 1.2, 1.4], [14.2, 0, 3.4, 3.3, 1.0], [21.4, 0, 4.6, 5.1, 1.2],
        [11.4, 0, 4.2, 0.9, 0.9], [18.4, 0, 0.2, 2.6, 1.3], [16.6, 0, 2.4, 4.4, 0.8], [-7.6, 0, 14.6, 1.7, 0.9], [-13.8, 0, -13.8, 2.2, 1.0],
        [8.6, 0, -19.2, 0.3, 1.0], [-4.4, 0, -24.2, 3.9, 1.1],
      ], { fitHeight: 0.7, glow: glowMush, castShadow: false, skip: (m) => /moss/i.test(m.name || '') });   // no moss disc under the caps
    }

    // ============================================================ Yıldız Çukuru (south-east): hill, stair, rimmed icy bowl
    {
      const { x, z, top, outer, t, rimTop } = BOWL, h = rimTop - top, off = outer - t / 2, inner = outer - t;
      L.cyl(x, top, z, 6, top + 1, { mat: { side: 'cliff', top: 'ground' }, seg: 28 });
      const rimMat = { side: 'stone', top: 'stone' };
      L.box(x, rimTop, z - off, outer * 2, t, h, { mat: rimMat });                               // north
      L.box(x - off, rimTop, z, t, inner * 2, h, { mat: rimMat });                               // west
      L.box(x + off, rimTop, z, t, inner * 2, h, { mat: rimMat });                               // east
      const gap = 1, segW = outer - gap;                                                         // south: two pieces, 2 m gap
      L.box(x - gap - segW / 2, rimTop, z + off, segW, t, h, { mat: rimMat });
      L.box(x + gap + segW / 2, rimTop, z + off, segW, t, h, { mat: rimMat });
      L.ice(L.box(x, top + 0.1, z, inner * 2, inner * 2, 0.3, { mat: { side: 'stone' } }));        // icy bowl floor (ground top → ice look)
      L.box(16.4, 1.4, z, 2.6, 2.6, 2.4, { mat: { side: 'cliff', top: 'stone' } });              // stair, east side (1.4 rises)
      L.box(13.8, 2.8, z, 2.6, 2.6, 3.8, { mat: { side: 'cliff', top: 'stone' } });
      L.crystal(x, 5.4, z, 0x8cff9e);
      L.coinRing(x, top + 0.9, z, 1.8, 8);
      L.heart(x - 2.1, top + 0.9, z - 2.1);
      L.trigger({ x, y: top, z, w: inner * 2, h: 2, d: inner * 2 }, { once: true, onEnter: () => L.sfx('medal_fairy_dust') });
      L.bat([x, top + 0.1, z], { r: 1.7, h: 1.7, skin: 'bat' });
      L.bat([x, top + 0.1, z], { r: 2.1, h: 2.5, skin: 'bat', cw: false });
    }

    // ============================================================ cove arena + lantern risers + Kral Pelte
    L.cyl(ARENA.x, ARENA.top, ARENA.z, ARENA.r, 4.5, { mat: { side: 'cliff', top: 'ground' }, seg: 36 });
    L.cyl(ARENA.x, -0.92, ARENA.z, 11, 2.2, { mat: 'accent', seg: 40, noSolid: true, castShadow: false });   // shallows (decor)
    S.eastRimMat = L.own(new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffa040, emissiveIntensity: 0.05, roughness: 0.4 }));
    for (const [x, z] of [[25, -22], [28, -25]]) {
      const c = L.box(x, -3, z, 2.6, 2.6, 1.6, { mat: 'stone' });
      L.riser(c, 3.3, 2.0, 'lanterns', { count: 4 });
      rim(L, c, S.eastRimMat);
    }
    L.boss(ARENA.x, ARENA.top, ARENA.z, {
      arenaR: ARENA.r, waitFor: { name: 'lanterns', id: 'count', value: 4 },
      portal: [ARENA.x, ARENA.top + 2.5, -28, 0], crystalColor: 0xffb347, slimeColor: 0x7ad9ff,
    });
    L.on('boss', 'landed', () => L.audio.playMusic?.('music_boss_epic_loop', { crossfade: 2 }));
    L.on('boss', 'dead', () => L.audio.playMusic?.('music_calm_night_1', { crossfade: 2 }));

    // ============================================================ signal wiring: lamp and lanterns
    L.on('switch', 'lamba', (v) => {
      if (v === false || S.lampLit) return;
      S.lampLit = true; S.c1T = 0;
      L.sfx('lever_pull_long'); L.sfx('power_up');
      L.toast('Fener uyandı! Yıldız Yolu parlıyor ✨', 2.2);
    });
    L.on('lanterns', 'count', (n) => {
      if (n < 4 || S.allLit) return;
      S.allLit = true;
      startFireflies(L, S, glowTex);
    });

    // ============================================================ checkpoints (first = spawn flag)
    const cps = [
      L.checkpoint(2, 0, 18, { active: true }),
      L.checkpoint(-12, 0, -6),
      L.checkpoint(TOWER.x, GALLERY_TOP, TOWER.z + 4),
      L.checkpoint(14, 0, 4),
      L.checkpoint(23, 0, -19),
      L.checkpoint(ARENA.x, ARENA.top, -24),
    ];

    // ============================================================ coins: 83 here + 5 along the cannon flight + 12 in the secret = 100
    L.coinLine([0, 1, 13.5], [0, 1, 6.5], 4);                                   // spawn → meadow
    L.coinRing(0, 1, 0, 4, 8);                                                 // meadow centre
    L.coinLine([4, 1, 11], [12, 1, 8], 4);                                     // → grove
    L.coinLine([16.4, 2.6, 7.4], [17.6, 6.4, 5.6], 3);                         // up the first bounce
    L.coinLine([17, 6, 4], [19, 6, 6], 2);                                     // ledge
    L.coinRing(20, 9, 2, 1.1, 4);                                              // treehouse
    L.coin(16.4, 2.4, -24); L.coin(13.8, 3.8, -24);                            // stair
    L.coinLine([-1, 1, -12], [-5, 1, -19], 3);                                 // → L3
    L.coinLine([-4, 1, -5], [-9, 1, -8.5], 3);                                 // → L4
    for (let i = 0; i < SPIRAL.n; i++) { const [x, y, z] = ledgeAt(i); L.coin(x, y + 1, z); }   // spiral
    L.coinArc([TOWER.x - 3.4, 19, TOWER.z + 1.2], [TOWER.x - 1.2, 19, TOWER.z - 3.4], 3, 0.4);   // gallery (west side)
    L.coinLine([-26, 1, -14], [-30.2, 1, -14], 3);                             // jetty
    L.coin(-33, 1.4, -15); L.coin(-36.5, 1.6, -16); L.coin(-40, 1.4, -17);     // Yıldız Yolu
    L.coinRing(-45, 2, -18, 2, 6);                                             // sea rock
    L.coinLine([21, 1, -16], [23.5, 1, -19.5], 3);                             // east pier
    L.coin(25, 1.3, -22); L.coin(28, 1.3, -25);                                // lantern risers
    L.coinRing(ARENA.x, ARENA.top + 1, ARENA.z, 6.2, 8);                       // arena
    L.coinLine([-7.5, 4.6, 12], [-4.5, 4.6, 12], 2);                           // cottage roof

    // ============================================================ enemies (5 bats incl. the 2 in the bowl, 4 glowing slimes, 2 spikies, boss)
    L.bat([12, 0, 13], { r: 3, h: 1.6, skin: 'bat' });
    L.bat([-8.5, 0, -1], { r: 3, h: 1.7, skin: 'bat', cw: false });
    L.bat([-21, 0, 1], { r: 3, h: 1.6, skin: 'bat' });
    const glowSlime = (e, color) => {
      e?.group?.traverse((o) => {
        if (!o.isMesh || Array.isArray(o.material)) return;
        const m = L.own(o.material.clone()); m.emissive = new THREE.Color(color); m.emissiveIntensity = 0.55; o.material = m;
      });
    };
    glowSlime(L.slime(6, 0, 8, 4, 0x7ad9ff), 0x3fb8ff);
    glowSlime(L.slime(-5, 0, -3, 4, 0xb48aff), 0x8a4cff);
    glowSlime(L.slime(14, 0, -12, 3, 0x8cff9e), 0x2fd86a);
    glowSlime(L.slime(-21, 0, -22, 3, 0xff8ad8), 0xff4fb8);
    L.spiky([-3, 0, -16], [3, 0, -16], 2.4);
    L.spiky([9, 0, 11], [9, 0, 3], 2.2);

    // ============================================================ scenery: kit trees, mossy boulders, flowers, grass, shore rocks
    const keepClear = [
      [0, 18, 5], [0, 10, 4], [0, 0, 6], [-6, 12, 4.5], [-10, 8.6, 3], [16, 6, 7.5], [20, 2, 3], [6, -24, 8.5], [16, -24, 3.5],
      [TOWER.x, TOWER.z, 8.5], [-6, -22, 3.5], [-12, -10, 3], [-12, -6, 3], [-26, -14, 4], [21.5, -17.5, 4], [9, 7, 3],
      [14, 4, 3], [0, -16, 4],
      [0, 26, 8], [5, 23, 5], [6, 14, 4], [11, 10, 4], [18, -12, 4], [-6, -6, 4], [-18, -2, 4],   // camera corridors behind the main routes
    ];
    L.scatter('oak_ancient', { center: [0, 0], rMin: 19, rMax: 27, count: 9, keepClear, margin: 2.5, fitHeight: 7.5, scale: [0.85, 1.25], collide: 'cyl', r: 0.6, h: 3 });
    L.scatter('birch_mature', { center: [0, 0], rMin: 14, rMax: 27, count: 8, keepClear, margin: 2.2, fitHeight: 6.5, scale: [0.85, 1.2], collide: 'cyl', r: 0.3, h: 3 });
    if (tier !== 'low') L.scatter('birch_young', { center: [0, 0], rMin: 12, rMax: 27, count: 8, keepClear, margin: 2.2, fitHeight: 4.5, scale: [0.85, 1.2], collide: 'cyl', r: 0.25, h: 2.5 });
    L.scatter('boulder_mossy', { center: [0, 0], rMin: 10, rMax: 28, count: 8, keepClear, margin: 1.5, fitHeight: 1.1, scale: [0.8, 1.5], collide: 'cyl', r: 0.7, h: 0.9 });
    L.scatter('flowers', { center: [0, 0], rMin: 4, rMax: 27, count: 46, keepClear: [[0, 18, 3], [16, 6, 2]], y: 0, colors: [0xbfd8ff, 0xffffff, 0xd8c8ff, 0x9ff0ff] });
    L.scatter('grass', { center: [0, 0], rMin: 3, rMax: 27, count: 44, keepClear: [[TOWER.x, TOWER.z, 7]], margin: 0.4 });
    for (let i = 0; i < 16; i++) {
      const a = L.rnd() * Math.PI * 2, r = 30 + L.rnd() * 3, s = 0.8 + L.rnd() * 1.2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x + 28, z + 14) < 5 || Math.hypot(x - 23, z + 19) < 5) { L.rnd(); L.rnd(); L.rnd(); continue; }
      L.rock(x, z, { kind: 'low', scale: s, y: -0.8, rot: [L.rnd(), L.rnd(), L.rnd()] });
    }

    // draw-call budget: merged static terrain, checkpoints + signposts skip the water mirror pass
    mergeStatic(L);
    for (const cp of cps) L.smallLayer(cp.group);
    for (const sg of signsMade) L.smallLayer(sg.group);
  },

  // Per-frame visuals: lamp/beam, rims, crystal 1 rising out of the lamp, the firefly stream, the quieter sea ambience.
  update(dt, t, L) {
    const S = L?._fener; if (!S) return;
    S.t += dt;
    if (!S.wavesSet && L.audio.isLooping?.('amb_waves')) S.wavesSet = L.audio.setLoopGain?.('amb_waves', 0.4, 1.2) || true;   // −8 dB
    if (S.lampLit) {
      S.lampK = Math.min(1, S.lampK + dt * 0.8);
      const k = S.lampK;
      S.lensMat.emissiveIntensity = 0.12 + k * 3.2;
      S.lensGlow.material.opacity = k * (0.85 + Math.sin(t * 3) * 0.08);
      S.beam.visible = true; S.beamMat.uniforms.uOpacity.value = k * 0.22;
      S.beamYaw += dt * 0.3;
      S.beam.rotation.y = S.beamYaw;
      if (S.spot) {
        S.spot.intensity = k * 1600;
        S.spot.target.position.set(TOWER.x + Math.cos(-S.beamYaw) * 34, 0, TOWER.z + Math.sin(-S.beamYaw) * 34);
        S.spot.target.updateMatrixWorld();
      }
      S.rimMat.emissiveIntensity = 0.08 + k * (1.4 + Math.sin(t * 2.4) * 0.25);
      if (S.c1T >= 0 && S.crystal1) {
        S.c1T += dt;
        const c = S.crystal1;
        if (S.c1T > 0.6 && c.taken && !c.revealed) {          // drops out of the lens and floats down above the button
          c.revealed = true; c.taken = false; c.group.visible = true; c.base = LAMP_Y - 1.2;
          L.spawnParticles([TOWER.x, LAMP_Y, TOWER.z], 30, 0xffe066, { speed: 5, up: 2, life: 1, grav: 4 });
        }
        if (c.revealed && !c.taken) c.base = Math.max(GALLERY_TOP + 1.4, c.base - dt * 2.2);
      }
    }
    if (S.allLit) S.eastRimMat.emissiveIntensity = Math.min(1.3, S.eastRimMat.emissiveIntensity + dt * 0.8);
    if (S.ff) stepFireflies(S, dt);
  },

  // Every waypoint stands on fixed ground (never on a riser / crumble / mover / switch); 'jump' ≤ 6.5 m across / 2.5 m up.
  testPath: [
    { at: [0, 0.1, 20], via: 'walk', note: 'spawn' },
    { at: [1.3, 0, 16], via: 'walk', note: 'lantern L1' },
    { at: [10, 0, 9], via: 'walk', note: 'meadow → grove' },
    { at: [14.6, 0, 6], via: 'walk', note: 'lantern L2 (Mantar Korusu)' },
    { at: [16, 0.45, 8], via: 'walk', note: 'glowing mushroom pad' },
    { at: [19.2, 5, 6.2], via: 'bounce', note: 'ledge corner beside the second pad (bounce 27 ≈ 8 m)' },
    { at: [18, 5.45, 5], via: 'walk', note: 'second mushroom pad' },
    { at: [20, 8, 2], via: 'bounce', note: 'treehouse — crystal 3 Mantar Korusu' },
    { at: [16, 0, -4], via: 'walk', note: 'drop back to the meadow' },
    { at: [18.8, 0, -24], via: 'walk', note: 'stair foot (hill east side)' },
    { at: [16.4, 1.4, -24], via: 'jump', note: 'stair 1' },
    { at: [13.8, 2.8, -24], via: 'jump', note: 'stair 2' },
    { at: [11.1, 4, -24], via: 'jump', note: 'hill top, outside the rim' },
    { at: [9.45, 5.5, -24], via: 'jump', note: 'east rim' },
    { at: [6.8, 4.1, -24.8], via: 'jump', note: 'icy bowl floor — crystal 4 Yıldız Çukuru' },
    { at: [6, 4, -20.2], via: 'walk', note: 'south gap' },
    { at: [6, 0, -15.5], via: 'walk', note: 'drop off the hill' },
    { at: [-4.8, 0, -21], via: 'walk', note: 'lantern L3' },
    { at: [-10.6, 0, -10], via: 'walk', note: 'lantern L4 (lighthouse base) — all lanterns lit' },
    { at: [-18.2, 0, -2.8], via: 'walk', note: 'spiral foot' },
    ...Array.from({ length: SPIRAL.n }, (_, i) => ({ at: ledgeAt(i), via: 'jump', note: `spiral ledge ${i + 1}` })),
    { at: ARRIVE, via: 'jump', note: 'gallery' },
    { at: [TOWER.x + 1.4, GALLERY_TOP, TOWER.z - 0.6], via: 'walk', note: 'beside the lamp switch: pound it — crystal 1 Deniz Feneri' },
    { at: [TOWER.x - 3.2, GALLERY_TOP, TOWER.z - 1.2], via: 'walk', note: 'vista "Fener Işığı"' },
    { at: [-27, 0, -14], via: 'walk', note: 'jump off the gallery, walk to the west jetty' },
    { at: [-30.4, 0, -14], via: 'walk', note: 'jetty end' },
    { at: [-45, 1, -18], via: 'riser', note: 'Yıldız Yolu: riser −33 / crumble −36.5 / riser −40 → sea rock — crystal 2' },
    { at: [-30.4, 0, -14], via: 'riser', note: 'back over the stones' },
    { at: [23, 0, -19], via: 'walk', note: 'east pier (checkpoint)' },
    { at: [36.4, 0.5, -24.6], via: 'riser', note: 'lantern risers (25, −22) / (28, −25) → arena (or the gallery cannon)' },
    { at: [ARENA.x, ARENA.top, ARENA.z], via: 'walk', note: 'arena centre — Kral Pelte, crystal 5' },
    { at: [ARENA.x, ARENA.top, -28], via: 'walk', note: 'portal (placed when Kral Pelte bursts)' },
  ],
};

// ---------------------------------------------------------------- firefly stream (all four lanterns lit → the cove)
const FF_TRAVEL = 4.2, FF_SPAWN = 7, FF_LIFE = 12.5;
function startFireflies(L, S, glowTex) {
  const n = L.quality.tier === 'low' ? 64 : L.quality.tier === 'medium' ? 110 : 160;
  const pos = new Float32Array(n * 3);
  const geo = L.own(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = L.own(new THREE.PointsMaterial({ size: 1.3, map: glowTex, color: 0xeeff9a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 1 }));
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; L.smallLayer(pts); L.add(pts);
  const from = LANTERNS.map(([, x, z]) => v3(x, 1.8, z));
  const to = v3(ARENA.x, 3, ARENA.z);
  const seeds = Array.from({ length: n }, (_, i) => {
    const h = Math.sin(i * 12.9898) * 43758.5453; const f = h - Math.floor(h);
    const h2 = Math.sin(i * 78.233) * 12345.678; const f2 = h2 - Math.floor(h2);
    return { src: i % 4, delay: (i / n) * FF_SPAWN, lift: 7 + f * 7, side: (f2 - 0.5) * 8, w: 2 + f * 3, ph: f2 * 6.28 };
  });
  S.ff = { pts, geo, mat, pos, seeds, from, to, t: 0, n, tmp: v3(0, 0, 0) };
  L.sfx('star_wand_ping');
}
function stepFireflies(S, dt) {
  const F = S.ff; F.t += dt;
  const { pos, seeds, from, to } = F;
  for (let i = 0; i < F.n; i++) {
    const s = seeds[i];
    let u = (F.t - s.delay) / FF_TRAVEL;
    if (u < 0) { pos[i * 3 + 1] = -100; continue; }
    if (F.t < FF_SPAWN + FF_TRAVEL) u = u % 1;                       // re-launch while the stream runs
    const a = from[s.src];
    if (u > 1) {                                                       // arrived: circle the arena until the stream fades
      const ang = F.t * 0.8 + s.ph, rr = 3 + (s.w % 4);
      pos[i * 3] = to.x + Math.cos(ang) * rr; pos[i * 3 + 1] = to.y + Math.sin(F.t * 2 + s.ph) * 0.6; pos[i * 3 + 2] = to.z + Math.sin(ang) * rr;
      continue;
    }
    const k = 1 - u;
    const cx = (a.x + to.x) / 2 + s.side, cy = Math.max(a.y, to.y) + s.lift, cz = (a.z + to.z) / 2 - s.side * 0.5;
    const wob = Math.sin(F.t * s.w + s.ph) * 0.5;
    pos[i * 3] = k * k * a.x + 2 * k * u * cx + u * u * to.x + wob;
    pos[i * 3 + 1] = k * k * a.y + 2 * k * u * cy + u * u * to.y + Math.cos(F.t * s.w * 1.3 + s.ph) * 0.4;
    pos[i * 3 + 2] = k * k * a.z + 2 * k * u * cz + u * u * to.z - wob;
  }
  F.geo.attributes.position.needsUpdate = true;
  F.mat.opacity = F.t < FF_LIFE ? 1 : Math.max(0, 1 - (F.t - FF_LIFE) / 2.5);
  if (F.mat.opacity <= 0) { F.pts.visible = false; S.ff = null; }
}
