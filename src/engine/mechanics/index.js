// Gameplay mechanics registry (ARCHITECTURE §7). Each mechanic is a module exporting install(L, ctx) that attaches
// L.<name>(...). Add your module here:   import * as ice from './ice.js';   MECHANICS.push(ice);
// ctx = { scene, player, physics, enemies, fx, audio, assets, world }. A mechanic never reaches into DOM.
export const MECHANICS = [];

export function install(L, ctx) {
  for (const m of MECHANICS) {
    try { m.install(L, ctx); }
    catch (e) { console.error('[mechanics] install failed', m?.name || m, e); }
  }
}
export default { MECHANICS, install };
