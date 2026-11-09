// Mechanic 'vista' — L.vista(x, y, z, opts) / L.secret(x, y, z, opts) — Kartpostal camera moment and secret coin cache (GDD §3.9).
//
//   L.vista(x, y, z, { title, yaw, pitch = 0.3, dist = 18 })   trigger box 3 × 2 × 3 (bottom at y). First entry per level
//       run: Pıtır stops (controlLock), cam.override tweens to {yaw, pitch, dist} over 2.5 s (+0.6 s hold; camera.js emits
//       'cam:override' → main.js hides the HUD and the touch layer), toast "📷 <title>", `medal_fairy_dust`,
//       save levels[id].vista = true, bus 'vista'({ id, title }). A floating 📷 badge marks the spot until it is used.
//       `yaw` defaults to the current camera yaw. Returns the trigger.
//   L.secret(x, y, z, { coins = 8, r = 2, pound = false, ringR = 2.2 })   a ring of `coins` coins at (x, y + 1, z) placed
//       at build, so they count in coinsTotal, but hidden and uncollectable until found. Found = entering the 3 × 2 × 3
//       trigger (bottom at y) once, or with `pound` a ground pound (bus 'pound') within r metres. Then the coins rise out
//       of the ground, `temple_mystery_sting`, toast "Gizli hazine!", save levels[id].secret = true, bus 'secret'.
//       Returns { secret: true, coins, found, reveal() }.
//
// Workaround (world.js has no "hidden coin" state): secret coins are built with `taken = true, popT = 99` (exactly the
// state L.remove(coin) leaves: invisible, skipped by pickup) and flagged `hidden = true`; reveal() sets `taken = false`.
// They are in world.coins from the start, so `coinsTotal` includes them (GDD: the coin star needs the secret), while
// `report().coinsLeft` only counts them once revealed.
import * as THREE from 'three';
import * as bus from '../bus.js';
import * as save from '../save.js';

export const name = 'vista';

let badgeMat = null;   // shared 📷 badge sprite material (never disposed)
function getBadgeMat() {
  if (badgeMat) return badgeMat;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,248,232,1)'); g.addColorStop(0.62, 'rgba(255,248,232,0.95)'); g.addColorStop(0.7, 'rgba(255,214,102,0.9)'); g.addColorStop(1, 'rgba(255,214,102,0)');
  x.fillStyle = g; x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
  x.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('📷', 64, 70);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  badgeMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  return badgeMat;
}
const markGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.05, 18);   // pound-secret ground mark (shared)

export function install(L, ctx) {
  const { player, physics, audio, fx } = ctx;
  const levelId = L.level?.id ?? 'unknown';
  const snd = (key, fallback) => { if (audio.has?.(key)) audio.play(key); else { if (fallback) audio.play(fallback); audio.ensure?.([key]); } };
  const badges = [], rising = [];
  let driver = null;
  const ensureDriver = () => {
    if (driver) return;
    driver = L.dynamic({
      update(dt, t) {
        for (const b of badges) if (b.visible) { b.position.y = b.userData.y + Math.sin(t * 2 + b.userData.phase) * 0.18; }
        for (let i = rising.length - 1; i >= 0; i--) {
          const r = rising[i];
          r.t += dt;
          const k = Math.min(1, r.t / 0.5), e = 1 - (1 - k) * (1 - k);
          r.coin.pos.y = r.from + (r.to - r.from) * e;
          if (k >= 1) rising.splice(i, 1);
        }
      },
    });
  };

  // ================================================================ vista
  L.vista = (x, y, z, opts = {}) => {
    ensureDriver();
    const title = opts.title ?? 'Kartpostal';
    const T = opts.t ?? 2.5, hold = opts.hold ?? 0.6;
    audio.ensure?.(['medal_fairy_dust']);
    const badge = new THREE.Sprite(getBadgeMat());
    badge.scale.setScalar(1.1); badge.position.set(x, y + 2.3, z); badge.userData = { y: y + 2.3, phase: badges.length };
    badge.renderOrder = 4; L.smallLayer(badge); L.add(badge);
    badges.push(badge);
    const tr = L.trigger({ x, y, z, w: 3, h: 2, d: 3 }, {
      once: true,
      onEnter: () => {
        badge.visible = false;
        player.vel.x = 0; player.vel.z = 0; player.extVel.set(0, 0, 0);
        player.controlLock = Math.max(player.controlLock, T + hold);
        L.cam.override = { yaw: opts.yaw ?? L.cam.yaw, pitch: opts.pitch ?? 0.3, dist: opts.dist ?? 18, t: T, hold };
        L.toast(`📷 ${title}`, T + hold);
        snd('medal_fairy_dust', 'crystal');
        fx.burst(new THREE.Vector3(x, y + 2.2, z), 20, 0xffe066, { speed: 3, up: 3, life: 0.9, grav: 1 });
        save.levelFlag(levelId, 'vista', true);
        bus.emit('vista', { id: levelId, title });
        tr.fired = true;
      },
    });
    tr.vista = { title, x, y, z, badge };
    return tr;
  };

  // ================================================================ secret
  L.secret = (x, y, z, opts = {}) => {
    ensureDriver();
    const n = opts.coins ?? 8, r = opts.r ?? 2, ringR = opts.ringR ?? 2.2;
    audio.ensure?.(['temple_mystery_sting']);
    const coins = L.coinRing(x, y + 1, z, ringR, n);
    for (const c of coins) { c.hidden = true; c.taken = true; c.popT = 99; c.secret = true; }
    const rec = {
      secret: true, x, y, z, coins, found: false,
      reveal() {
        if (rec.found) return false;
        rec.found = true;
        for (const c of coins) {
          c.hidden = false; c.taken = false; c.popT = -1;
          const to = c.pos.y; c.pos.y = y + 0.1;
          rising.push({ coin: c, from: y + 0.1, to, t: 0 });
        }
        snd('temple_mystery_sting', 'crystal');
        fx.burst(new THREE.Vector3(x, y + 0.6, z), 26, 0xffd23f, { speed: 5, up: 6, life: 0.9, grav: 8, size: 1.2 });
        L.toast('Gizli hazine!', 1.8);
        save.levelFlag(levelId, 'secret', true);
        bus.emit('secret', { id: levelId, coins: n });
        return true;
      },
    };
    if (opts.pound) {
      const mark = new THREE.Mesh(markGeo, L.assets.flat(0x8f8676));
      mark.position.set(x, y + 0.03, z); mark.receiveShadow = true; L.add(mark);
      rec.mark = mark;
      L._track.unsubs.push(bus.on('pound', (pos) => {
        if (rec.found || !pos) return;
        if (Math.hypot(pos.x - x, pos.z - z) <= r && Math.abs(pos.y - y) < 2.5) rec.reveal();
      }));
    } else {
      rec.trigger = L.trigger({ x, y, z, w: 3, h: 2, d: 3 }, { once: true, onEnter: () => rec.reveal() });
    }
    return rec;
  };
}
