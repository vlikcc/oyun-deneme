// Mechanic 'ice' — L.ice(c) — slippery surface + glide/scrape audio (GDD §3.2).
// install(L, ctx) attaches L.ice(...); ctx = { scene, player, physics, enemies, fx, audio, assets, world }.
//
// L.ice(c, { mat, steps }) → c
//   Sets c.surface = 'ice' (physics.SURFACES.ice: acc .22, dec .1, speed 1.15) and footsteps 'snow'. The top gets the ice
//   look (theme.materials.ice when the theme defines that role, else the shared glossy ice material) unless the level gave the box its own
//   top material; `opts.mat` (role string / material / inline def) forces a top material.
// One per-level dynamic handles every ice surface (also colliders created with { surface: 'ice' } directly):
//   * `ice_skate_glide` loop, gain clamp(speed / 9) while grounded on ice (faded out otherwise, stopped after 1.5 s off ice);
//   * `ice_skate_scrape` + a white spray when the wish direction flips (dot < −0.5) while sliding;
//   * white foot particles while running on ice (player.js keeps its own cream dust at > 6 m/s — not ours to change).
import * as THREE from 'three';

export const name = 'ice';

const GLIDE = 'ice_skate_glide', SCRAPE = 'ice_skate_scrape', LOOP_ID = 'ice:glide';
const WHITE = 0xffffff;

/** Debug/test log: last ≤ 60 events { ev, key?, gain?, t }. */
export const log = [];
const note = (e) => { log.push(e); if (log.length > 60) log.shift(); };
/** Live state for tests: { onIce, gain, looping, scrapes, puffs }. */
export const state = { onIce: false, gain: 0, looping: false, scrapes: 0, puffs: 0 };

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Shared ice look (module cache like assets.js's material caches: created once, never disposed): pale blue, glossy so the
// HDRI sky reflects in it, with the marble normal map for a little relief. crumble.js uses it for the 'ice' skin.
let ICE_MAT = null;
export function iceMaterial(assets) {
  if (!ICE_MAT) {
    ICE_MAT = new THREE.MeshStandardMaterial({
      color: 0xd2efff, roughness: 0.14, metalness: 0, envMapIntensity: 1.5, emissive: 0x16384c, emissiveIntensity: 0.3,
      normalMap: assets.loadTex('marble_cliff_01_nor_gl.jpg', { rep: 1 / 4 }), normalScale: new THREE.Vector2(0.35, 0.35),
    });
    ICE_MAT.userData.shared = true;
  }
  return ICE_MAT;
}

export function install(L, ctx) {
  const { player, physics, audio, fx, assets } = ctx;
  let dyn = null, clock = 0, preloaded = false;
  let offIce = 99, retryT = 0, gainSent = -1;
  let lastWx = 0, lastWz = 0, lastWishAge = 99, scrapeCd = 0, footDist = 0;
  const foot = new THREE.Vector3();
  Object.assign(state, { onIce: false, gain: 0, looping: false, scrapes: 0, puffs: 0 });

  const iceTop = () => { const def = L.theme()?.materials?.ice; return def ? assets.pbr(def) : iceMaterial(assets); };

  function setGain(g) {
    if (Math.abs(g - gainSent) < 0.02 && !(g === 0 && gainSent !== 0)) return;
    if (audio.setLoopGain?.(LOOP_ID, g * 0.9, 0.08)) gainSent = g;
  }

  function update(dt) {
    clock += dt;
    // ctx.audio is the module namespace (no .context getter): state.ready ⇔ the AudioContext exists
    if (!preloaded && (audio.state?.ready || audio.context)) { preloaded = true; audio.ensure?.([GLIDE, SCRAPE]); }
    const p = player, v = p.vel;
    const onIce = !!(physics.sim?.playing !== false && p.grounded && p.ground && p.ground.surface === 'ice');
    const speed = Math.hypot(v.x, v.z);
    state.onIce = onIce;
    scrapeCd -= dt;

    // ---- glide loop: gain by speed while on ice
    const target = onIce ? clamp01(speed / 9) : 0;
    state.gain = target;
    if (target > 0.02) {
      offIce = 0;
      if (!audio.isLooping?.(LOOP_ID) && (retryT -= dt) <= 0) {
        retryT = 0.5;    // playLoop returns null (and starts decoding) until the sample is ready: retry twice a second
        if (audio.playLoop?.(GLIDE, { id: LOOP_ID, bus: 'sfx', fadeIn: 0, gain: 0 })) { gainSent = 0; note({ ev: 'glide:start', key: GLIDE, t: +clock.toFixed(3) }); }
      }
    } else offIce += dt;
    if (audio.isLooping?.(LOOP_ID)) {
      setGain(target);
      if (offIce > 1.5) { audio.stopLoop?.(LOOP_ID, 0.25); gainSent = -1; note({ ev: 'glide:stop', t: +clock.toFixed(3) }); }
    }
    state.looping = !!audio.isLooping?.(LOOP_ID);

    if (!onIce) { lastWishAge = 99; footDist = 0; return; }

    // ---- scrape: the wish direction flips (dot < −0.5) while sliding
    const inp = physics.lastInput || {};
    const locked = p.controlLock > 0;
    const yaw = inp.yaw || 0, ix = locked ? 0 : inp.ix || 0, iy = locked ? 0 : inp.iy || 0;
    const wx = -Math.sin(yaw) * iy + Math.cos(yaw) * ix, wz = -Math.cos(yaw) * iy - Math.sin(yaw) * ix;
    const wl = Math.hypot(wx, wz);
    lastWishAge += dt;
    if (wl > 0.3) {
      const nx = wx / wl, nz = wz / wl;
      if (lastWishAge < 0.6 && nx * lastWx + nz * lastWz < -0.5 && speed > 1.5 && scrapeCd <= 0) {
        scrapeCd = 0.35; state.scrapes++;
        audio.play(SCRAPE);
        note({ ev: 'scrape', key: SCRAPE, t: +clock.toFixed(3) });
        foot.set(p.pos.x, p.pos.y + 0.08, p.pos.z);
        fx.burst(foot, 8, WHITE, { speed: 3, up: 1.6, life: 0.45, grav: 6, size: 0.9 });
      }
      lastWx = nx; lastWz = nz; lastWishAge = 0;
    }

    // ---- white foot particles (≈ one puff per 1.2 m of sliding above 3 m/s)
    if (speed > 3) {
      footDist += speed * dt;
      if (footDist > 1.2) {
        footDist = 0; state.puffs++;
        foot.set(p.pos.x - (v.x / speed) * 0.3, p.pos.y + 0.05, p.pos.z - (v.z / speed) * 0.3);
        fx.burst(foot, 2, WHITE, { speed: 1.2, up: 0.8, life: 0.35, grav: 2, size: 0.8 });
      }
    }
  }

  L.ice = function ice(c, opts = {}) {
    if (!c || (c.type !== 'box' && c.type !== 'cyl')) { console.warn('[ice] L.ice needs a box/cyl collider'); return c; }
    c.surface = 'ice';
    c.steps = opts.steps ?? 'snow';
    const m = c.mesh;
    if (m && Array.isArray(m.material)) {
      const top = opts.mat !== undefined ? (typeof opts.mat === 'number' ? assets.flat(opts.mat) : assets.pbr(opts.mat)) : m.material[1] === assets.pbr('ground') ? iceTop() : null;
      if (top) m.material = [m.material[0], top];
    }
    c.tags = [...(c.tags || []), 'ice'];
    if (!dyn) dyn = L.dynamic({ update, dispose() { audio.stopLoop?.(LOOP_ID, 0.2); state.looping = false; } });
    return c;
  };
}
