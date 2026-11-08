// Progress + settings in localStorage (schema ARCHITECTURE §9) with an in-memory fallback.
const KEY = 'pitir.save.v1';

function defaults() {
  return {
    v: 1,
    wallet: 0,
    cosmetics: { owned: ['none'], hat: 'none', scarf: 0x4dabf7 },
    settings: { mute: false, music: true, quality: 'auto', invertY: false, hints: true },
    levels: {},
  };
}
function defaultLevel() { return { unlocked: false, done: false, bestTime: null, bestCoins: 0, stars: 0, crystals: 0 }; }

let mem = null;          // in-memory copy (always valid)
let storageOk = true;

function read() {
  if (mem) return mem;
  mem = defaults();
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.v === 1) {
        mem = { ...mem, ...d, cosmetics: { ...mem.cosmetics, ...(d.cosmetics || {}) }, settings: { ...mem.settings, ...(d.settings || {}) }, levels: { ...(d.levels || {}) } };
      }
    }
  } catch { storageOk = false; }
  return mem;
}
function write() {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(mem)); storageOk = true; }
  catch { storageOk = false; }
}

/** Current save object (do not mutate; use patch). */
export function get() { return read(); }
/** patch(fn) → fn(draft) mutates the draft; it is then persisted. Never throws. */
export function patch(fn) {
  const d = read();
  try { fn(d); } catch (e) { console.warn('[save] patch failed', e); }
  write();
  return d;
}
export function level(id) {
  const d = read();
  return d.levels[id] ?? defaultLevel();
}
/** Levels are an ordered list [{id, order}]; the first is always unlocked. */
export function ensureUnlocks(levels) {
  patch((d) => {
    const sorted = [...levels].sort((a, b) => a.order - b.order);
    sorted.forEach((lv, i) => {
      const e = (d.levels[lv.id] ??= defaultLevel());
      if (i === 0) e.unlocked = true;
      const prev = i > 0 ? d.levels[sorted[i - 1].id] : null;
      if (prev?.done) e.unlocked = true;
    });
  });
}
/**
 * levelResult(id, {time, coins, coinsTotal, crystals, parTime, nextId}) → {stars, newBest, starFlags}
 * ★ finished, ★ all coins (coins ≥ coinsTotal), ★ time ≤ parTime. Unlocks `nextId` (next by order).
 */
export function levelResult(id, { time, coins = 0, coinsTotal = 0, crystals = 0, parTime = Infinity, nextId = null } = {}) {
  const starFlags = { done: true, coins: coinsTotal > 0 ? coins >= coinsTotal : true, time: time <= parTime };
  const stars = (starFlags.done ? 1 : 0) + (starFlags.coins ? 1 : 0) + (starFlags.time ? 1 : 0);
  let newBest = false;
  patch((d) => {
    const e = (d.levels[id] ??= defaultLevel());
    e.unlocked = true; e.done = true;
    if (e.bestTime == null || time < e.bestTime) { e.bestTime = time; newBest = true; }
    e.bestCoins = Math.max(e.bestCoins, coins);
    e.stars = Math.max(e.stars, stars);
    e.crystals = Math.max(e.crystals, crystals);
    d.wallet += coins;
    if (nextId) { const n = (d.levels[nextId] ??= defaultLevel()); n.unlocked = true; }
  });
  return { stars, newBest, starFlags };
}
export function setSetting(key, value) { patch((d) => { d.settings[key] = value; }); }
export function reset() { mem = defaults(); write(); }
export function isPersistent() { read(); return storageOk; }

export const save = { get, patch, level, ensureUnlocks, levelResult, setSetting, reset, isPersistent };
export default save;
