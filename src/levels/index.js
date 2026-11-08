// Ordered campaign list (ARCHITECTURE §4, §12). Every campaign level file is imported statically; a level that is not
// built yet exports `{ id, name, order, comingSoon: true }` (the map shows "Yakında", it cannot be started).
// Hidden levels (`hidden: true`, e.g. the hook test level) are reachable by id but excluded from LEVELS.
import kristal from './kristal.js';
import kumsal from './kumsal.js';
import volkan from './volkan.js';
import buz from './buz.js';
import orman from './orman.js';
import gok from './gok.js';
import kale from './kale.js';
import test from './_test.js';

export const ALL_LEVELS = [kristal, kumsal, volkan, buz, orman, gok, kale, test].sort((a, b) => a.order - b.order);
/** Campaign list in order (includes comingSoon placeholders so the map can show them). */
export const LEVELS = ALL_LEVELS.filter((l) => !l.hidden);
/** Campaign levels that can actually be loaded (what tools/smoke.mjs --all iterates). */
export const PLAYABLE = LEVELS.filter((l) => !l.comingSoon);
export function levelById(id) { return ALL_LEVELS.find((l) => l.id === id) || null; }
export function isPlayable(lv) { return !!lv && !lv.comingSoon && typeof lv.build === 'function'; }
/** nextLevel(id) → the following campaign level, or null when there is none or it is not built yet. */
export function nextLevel(id) {
  const i = LEVELS.findIndex((l) => l.id === id);
  const n = i >= 0 && i + 1 < LEVELS.length ? LEVELS[i + 1] : null;
  return isPlayable(n) ? n : null;
}
export default LEVELS;
