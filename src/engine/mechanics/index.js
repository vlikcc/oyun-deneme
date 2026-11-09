// Gameplay mechanics registry (ARCHITECTURE §7, §15). Each mechanic is a module exporting `name` and install(L, ctx) that
// attaches L.<name>(...). Every GDD §3 module is imported statically here, in build order, so filling a mechanic never
// requires editing this file. ctx = { scene, player, physics, enemies, fx, audio, assets, world }. A mechanic never
// reaches into DOM. install() runs once per level load, after the builder L exists and before level.build(L).
import * as crumble from './crumble.js';
import * as ice from './ice.js';
import * as lava from './lava.js';
import * as cannon from './cannon.js';
import * as geyser from './geyser.js';
import * as wind from './wind.js';
import * as movers from './movers.js';
import * as signals from './signals.js';
import * as heart from './heart.js';
import * as vista from './vista.js';
import * as boss from './boss.js';
import * as enemies_extra from './enemies-extra.js';

export const MECHANICS = [crumble, ice, lava, cannon, geyser, wind, movers, signals, heart, vista, boss, enemies_extra];

export function install(L, ctx) {
  for (const m of MECHANICS) {
    try { m.install(L, ctx); }
    catch (e) { console.error('[mechanics] install failed', m?.name || m, e); }
  }
}
export default { MECHANICS, install };
