// Mechanic 'geyser' — L.geyser(x, top, z, opts) — periodic launcher, never a burn (GDD §3.8).
// install(L, ctx) attaches L.geyser(...); ctx = { scene, player, physics, enemies, fx, audio, assets, world }.
//
// L.geyser(x, top, z, { period = 3, phase = 0, lift = 22, model = 'geyser', tint = 0x8c7f74 }) → geyser record
//   * a stone vent (assets/models/geyser.glb sunk so only its crater rim shows; a procedural ring if it cannot load) — no
//     collider, Pıtır walks over it; the launch volume is a cylinder r 1.3, h 2.5 above `top` (feet or centre inside).
//   * cycle (`period` s, own clock since level load, offset by `phase` seconds — volkan's 0/1/2 chain the three terraces):
//     u ∈ [0, 0.6) telegraph: bubbles + `bubbles_pop_asc`, the steam column grows 0.3 → 0.6;
//     u ∈ [0.6, 1.4) eruption: steam column scale 6 (≈ 6 m), puffs, `whoosh_rise`; a player inside with vel.y < lift is
//     launched once per eruption: `physics.launch([vel.x, lift, vel.z])` (air control stays on, no lock; lift 22 ≈ 5.5 m);
//     u ≥ 1.4: idle, the column sinks away.
//   * record: { x, top, z, period, phase, lift, group, column, state ('idle'|'telegraph'|'erupt'), launches, u }; every
//     geyser of the level is in `L.geysers`. Sounds only play within 24 m of Pıtır.
import * as THREE from 'three';

export const name = 'geyser';

const R = 1.3, H = 2.5;
const TELE = 0.6, ERUPT = 0.8;
const SFX_KEYS = ['bubbles_pop_asc', 'whoosh_rise'];
const HEAR = 24;

// ---------------------------------------------------------------- shared resources (created once, never disposed)
let shared = null;
function sharedRes() {
  if (shared) return shared;
  // steam texture: soft vertical streaks, alpha fading toward the top and the bottom edge
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const g = cv.getContext('2d');
  const img = g.createImageData(64, 128);
  let s = 9;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cols = Array.from({ length: 64 }, () => 0.55 + rnd() * 0.45);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 64; x++) {
      const v = 1 - y / 127;                                     // texture v: canvas row 0 is the top of the column (flipY)
      const fade = Math.min(1, (1 - v) * 1.5) * Math.min(1, v * 7 + 0.08);
      const streak = cols[x] * (0.75 + 0.25 * Math.sin((y / 128) * Math.PI * 6 + x));
      const a = Math.max(0, Math.min(1, fade * streak));
      const i = (y * 64 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 235);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  const colGeo = new THREE.CylinderGeometry(0.45, 0.9, 1, 18, 1, true).translate(0, 0.5, 0);
  const puffGeo = new THREE.IcosahedronGeometry(0.4, 1);
  const ventGeo = new THREE.TorusGeometry(1.0, 0.32, 8, 20).rotateX(Math.PI / 2);
  const holeGeo = new THREE.CircleGeometry(0.85, 20).rotateX(-Math.PI / 2);
  shared = { tex, colGeo, puffGeo, ventGeo, holeGeo };
  return shared;
}

export function install(L, ctx) {
  const { player, physics, audio, assets, fx } = ctx;
  L.geysers = [];
  let soundsWanted = false;

  L.geyser = function geyser(x, top, z, opts = {}) {
    const period = Math.max(TELE + ERUPT + 0.2, opts.period ?? 3);
    const phase = opts.phase ?? 0, lift = opts.lift ?? 22;
    const low = L.quality?.tier === 'low';
    const res = sharedRes();

    const group = new THREE.Group(); group.position.set(x, top, z); group.name = 'geyser';
    L.add(group);

    // vent: GLB cone sunk into the ground (only the crater rim shows) — procedural stone ring as the fallback
    const vent = new THREE.Group(); group.add(vent);
    const hole = new THREE.Mesh(res.holeGeo, assets.flat(0x2a2522)); hole.position.y = 0.03; hole.receiveShadow = true; vent.add(hole);
    const RIM = 0.22;                          // visible crater rim above the walk level (no collider: Pıtır walks over it)
    const loaded = assets.model(opts.model ?? 'geyser').then((m) => {
      if (L._track.disposed) return null;
      const bb = m.userData.bbox, h = bb?.height ?? 1.3, w = bb ? Math.max(bb.size[0], bb.size[2]) : 2.2;
      const k = 3.0 / w;                       // ≈ 3 m wide crater
      m.scale.set(k, k * 0.8, k);
      m.position.y = -h * k * 0.8 + RIM;       // sunk: only the crater rim shows
      // the photogrammetry cone is pale pumice: tint it toward the theme's dark stone so it reads as a vent
      m.traverse((o) => { if (o.isMesh) { o.material = L.own(o.material.clone()); o.material.color.multiply(new THREE.Color(opts.tint ?? 0x8c7f74)); } });
      hole.scale.setScalar(0.55); hole.position.y = RIM + 0.02;
      vent.add(m);
      return m;
    }).catch(() => {
      if (L._track.disposed) return null;
      const ring = new THREE.Mesh(res.ventGeo, assets.pbr('cliff')); ring.position.y = 0.12; ring.castShadow = true; ring.receiveShadow = true;
      vent.add(ring);
      return null;
    });
    L._track.pending.push(loaded);

    // steam column (scale.y = height in metres)
    const colMat = L.own(new THREE.MeshBasicMaterial({ map: res.tex, color: 0xf4f7fb, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    const colTex = L.own(res.tex.clone()); colTex.needsUpdate = true; colMat.map = colTex;
    const column = new THREE.Mesh(res.colGeo, colMat);
    column.scale.set(0.6, 0.3, 0.6); column.visible = false; column.castShadow = false; column.renderOrder = 3;
    L.smallLayer(column); group.add(column);

    // bubbles + steam puffs: one InstancedMesh, instances recycled
    const N = low ? 14 : 30;
    const puffMat = L.own(new THREE.MeshStandardMaterial({ color: 0xf3f7fb, emissive: 0x9aa4b0, emissiveIntensity: 0.35, roughness: 1, transparent: true, opacity: 0.6, depthWrite: false }));
    const puffs = new THREE.InstancedMesh(res.puffGeo, puffMat, N);
    puffs.frustumCulled = false; puffs.castShadow = false; puffs.renderOrder = 4; puffs.name = 'geyser:puffs';
    L.smallLayer(puffs); group.add(puffs);
    const parts = Array.from({ length: N }, () => ({ life: 0, max: 1, s: 0, grow: 0, p: new THREE.Vector3(), v: new THREE.Vector3() }));
    const m4 = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < N; i++) puffs.setMatrixAt(i, zero);
    puffs.instanceMatrix.needsUpdate = true;
    let next = 0;
    function emit(kind) {
      const q = parts[next]; next = (next + 1) % N;
      const a = fx.rnd() * Math.PI * 2, r = fx.rnd() * (kind === 'bubble' ? 0.6 : 0.5);
      q.p.set(Math.cos(a) * r, 0.15, Math.sin(a) * r);
      if (kind === 'bubble') { q.v.set(Math.cos(a) * 0.3, 1.2 + fx.rnd() * 1.4, Math.sin(a) * 0.3); q.max = q.life = 0.45; q.s = 0.3 + fx.rnd() * 0.3; q.grow = 0; }
      else { q.v.set(Math.cos(a) * (0.6 + fx.rnd()), 10 + fx.rnd() * 6, Math.sin(a) * (0.6 + fx.rnd())); q.max = q.life = 0.8 + fx.rnd() * 0.4; q.s = 0.6 + fx.rnd() * 0.5; q.grow = 1.6; }
    }
    function stepParts(dt) {
      for (let i = 0; i < N; i++) {
        const q = parts[i];
        if (q.life <= 0) { puffs.setMatrixAt(i, zero); continue; }
        q.life -= dt;
        q.v.y -= q.v.y * Math.min(1, 1.6 * dt);              // drag: puffs slow down and hang
        q.p.addScaledVector(q.v, dt);
        const k = q.life / q.max, sc = q.s * (1 + (1 - k) * q.grow) * Math.min(1, k * 4);   // steam swells as it rises, pops out at the end
        m4.makeScale(sc, sc, sc).setPosition(q.p);
        puffs.setMatrixAt(i, k > 0 ? m4 : zero);
      }
      puffs.instanceMatrix.needsUpdate = true;
    }

    const g = { x, top, z, period, phase, lift, group, column, puffs, state: 'idle', launches: 0, u: 0, clock: 0 };
    L.geysers.push(g);
    if (!soundsWanted) { soundsWanted = true; audio.ensure?.(SFX_KEYS); }

    let cycle = -1, launched = false, emitT = 0, colH = 0.3, colW = 0.6, colA = 0;
    const near = () => Math.hypot(player.pos.x - x, player.pos.z - z) < HEAR;
    const insideCol = () => {
      const p = player.pos;
      if (Math.hypot(p.x - x, p.z - z) >= R) return false;
      return (p.y >= top - 0.3 && p.y <= top + H) || (p.y + 0.7 >= top && p.y + 0.7 <= top + H);
    };

    L.dynamic({
      update(dt) {
        g.clock += dt;
        const raw = g.clock - phase;
        const n = Math.floor(raw / period), u = raw - n * period;
        g.u = u;
        if (n !== cycle) { cycle = n; launched = false; }
        const prev = g.state;
        g.state = u < TELE ? 'telegraph' : u < TELE + ERUPT ? 'erupt' : 'idle';
        if (g.state !== prev) {
          if (g.state === 'telegraph' && near()) L.sfx('bubbles_pop_asc');
          if (g.state === 'erupt') { if (near()) L.sfx('whoosh_rise'); }
        }
        // targets for the column
        let tH, tW, tA;
        if (g.state === 'telegraph') { const k = u / TELE; tH = 0.3 + 0.3 * k; tW = 0.6; tA = 0.55; }
        else if (g.state === 'erupt') { tH = 6; tW = 1; tA = 0.95; }
        else { tH = 0.3; tW = 0.6; tA = 0; }
        const rate = g.state === 'erupt' ? 14 : 6;
        colH += (tH - colH) * (1 - Math.exp(-rate * dt));
        colW += (tW - colW) * (1 - Math.exp(-rate * dt));
        colA += (tA - colA) * (1 - Math.exp(-(g.state === 'idle' ? 3 : 10) * dt));
        column.visible = colA > 0.02;
        column.scale.set(colW, colH, colW);
        colMat.opacity = colA;
        colTex.offset.x += dt * (g.state === 'erupt' ? 0.9 : 0.25);   // swirl (streaks repeat around the column)
        // particles
        emitT -= dt;
        if (g.state === 'telegraph' && emitT <= 0) { emitT = low ? 0.1 : 0.05; emit('bubble'); }
        else if (g.state === 'erupt' && emitT <= 0) { emitT = low ? 0.075 : 0.04; emit('puff'); }
        stepParts(dt);
        // launch once per eruption
        if (g.state === 'erupt' && !launched && insideCol() && player.vel.y < lift) {
          launched = true; g.launches++;
          physics.launch(new THREE.Vector3(player.vel.x, lift, player.vel.z));
          physics.squash(0.7, 1.4);
          L.spawnParticles(new THREE.Vector3(player.pos.x, player.pos.y + 0.2, player.pos.z), 8, 0xffffff, { speed: 3, up: 4, life: 0.5, size: 1.3, grav: 2 });
        }
      },
      dispose() {
        puffs.dispose();                       // nested InstancedMesh: world.unload only disposes top-level ones
        if (soundsWanted) { soundsWanted = false; audio.release?.(SFX_KEYS); }
      },
    });
    return g;
  };
}
export default { name, install };
