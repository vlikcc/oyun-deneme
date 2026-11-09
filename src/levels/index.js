// Ordered campaign list (ARCHITECTURE §4, §12). Every campaign level file is imported statically; a level that is not
// built yet exports `{ id, name, order, comingSoon: true }` (the map shows "Yakında", it cannot be started).
// Hidden levels (`hidden: true`, e.g. the hook test level) are reachable by id but excluded from LEVELS.
// Roster (GDD §2.1, order is the spec): kristal → kumsal → kar → volkan → orman → gok → fener, then the bonus kanyon.
import kristal from './kristal.js';
import kumsal from './kumsal.js';
import kar from './kar.js';
import volkan from './volkan.js';
import orman from './orman.js';
import gok from './gok.js';
import fener from './fener.js';
import kanyon from './kanyon.js';
import test from './_test.js';
// Hidden mechanic test levels (ARCHITECTURE §15): reachable by id (`?level=test-cannon`, tools/smoke.mjs), never on the map.
import testCrumble from './_test_crumble.js';
import testLava from './_test_lava.js';
import testCannon from './_test_cannon.js';
import testWind from './_test_wind.js';
import testSignals from './_test_signals.js';
import testBoss from './_test_boss.js';
import testFx from './_test_fx.js';

export const ALL_LEVELS = [kristal, kumsal, kar, volkan, orman, gok, fener, kanyon, test,
  testCrumble, testLava, testCannon, testWind, testSignals, testBoss, testFx].sort((a, b) => a.order - b.order);
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
