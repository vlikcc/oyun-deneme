// Mechanic 'heart' — L.heart(x, y, z) — +1 heart pickup (GDD §3.10).
// A pink heart (bob + spin + glow) at (x, y, z); touching it gives +1 heart (capped at player.maxHearts), plays
// `heart_pickup_1`, a pink burst and the toast "+1 ❤" (full hearts: "Kalbin dolu!"), and bus 'hud'. It never respawns
// within a level run (a retry rebuilds the level). Returns { heart: true, group, pos, taken }.
import * as THREE from 'three';
import * as bus from '../bus.js';

export const name = 'heart';

let shared = null;   // geometry/materials/texture shared by every level (never disposed, like world.js's coin mesh)
function getShared() {
  if (shared) return shared;
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.15, -0.3, -0.62, -0.12, -0.6, 0.18);
  s.bezierCurveTo(-0.58, 0.48, -0.2, 0.6, 0, 0.32);
  s.bezierCurveTo(0.2, 0.6, 0.58, 0.48, 0.6, 0.18);
  s.bezierCurveTo(0.62, -0.12, 0.15, -0.3, 0, -0.5);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 3, curveSegments: 10 });
  geo.center();
  const mat = new THREE.MeshStandardMaterial({ color: 0xff5c9a, emissive: 0xff2d7a, emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.05 });
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const x = cv.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,150,200,.55)'); g.addColorStop(1, 'rgba(255,90,160,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const glowMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 });
  shared = { geo, mat, glowMat };
  return shared;
}

export function install(L, ctx) {
  const { player, physics, audio, fx } = ctx;
  const hearts = [];
  let driver = null;
  const centre = new THREE.Vector3();

  function pick(h) {
    h.taken = true; h.group.visible = false;
    const full = player.hearts >= player.maxHearts;
    player.hearts = Math.min(player.maxHearts, player.hearts + 1);
    if (audio.has?.('heart_pickup_1')) audio.play('heart_pickup_1'); else { audio.play('coin'); audio.ensure?.(['heart_pickup_1']); }
    fx.burst(h.pos.clone(), 24, 0xff6fae, { speed: 5, up: 5, life: 0.8, grav: 6, size: 1.2 });
    L.toast(full ? 'Kalbin dolu!' : '+1 ❤', 1.2);
    bus.emit('hud');
    bus.emit('heart', h);
  }

  L.heart = (x, y, z) => {
    const sh = getShared();
    if (!driver) {
      audio.ensure?.(['heart_pickup_1']);
      driver = L.dynamic({
        update(dt, t) {
          centre.copy(player.pos); centre.y += 0.7;
          for (const h of hearts) {
            if (h.taken) continue;
            h.group.position.y = h.pos.y + Math.sin(t * 2.2 + h.phase) * 0.2;
            h.mesh.rotation.y = t * 1.5;
            const beat = 1 + Math.max(0, Math.sin(t * 6 + h.phase)) * 0.08;
            h.mesh.scale.setScalar(beat);
            if (physics.sim.playing && h.group.position.distanceToSquared(centre) < 1.8) pick(h);
          }
        },
      });
    }
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(sh.geo, sh.mat); mesh.castShadow = true;
    const glow = new THREE.Sprite(sh.glowMat); glow.scale.setScalar(2.2);
    g.add(glow, mesh); g.position.set(x, y, z);
    L.smallLayer(g); L.add(g);
    const h = { heart: true, group: g, mesh, pos: new THREE.Vector3(x, y, z), taken: false, phase: hearts.length * 1.1 };
    hearts.push(h);
    return h;
  };
}
