// Progress + settings in localStorage with an in-memory fallback. Schema v2 (GDD §4.4, E9) under the unchanged key
// 'pitir.save.v1'; a v1 blob is migrated additively on read (every v1 value is kept, missing v2 fields get defaults) and
// written back as v2. Unknown extra fields are preserved. Postcards (P2) live under a separate key.
export const KEY = 'pitir.save.v1';
export const VERSION = 2;

function defaultSettings() {
  return {
    mute: false, music: true, musicVol: 0.6, sfxVol: 0.9,
    quality: 'auto', qualityAuto: null, invertY: false, hints: true,
    assist: false,          // Yardım Modu (physics.setAssist)
    autoCam: null,          // null = device default (cam.auto on for touch, off for desktop); true/false = the player's choice
    camSens: 1.0,           // "Kamera hızı" (cam.sens)
    simpleTouch: false, leftHanded: false, reduceShake: false,
  };
}
function defaults() {
  const now = Date.now();
  return {
    v: VERSION, createdAt: now, updatedAt: now,
    wallet: 0,
    cosmetics: { owned: ['none', 'scarf:4dabf7'], hat: 'none', scarf: 0x4dabf7 },
    settings: defaultSettings(),
    levels: {},
    stats: { playTime: 0, jumps: 0, stomps: 0, faints: 0, wins: 0 },
    flags: { seenIntro: false, seenTouchTutorial: false, assistOffered: false },
    daily: { date: null, levelId: null, mod: null, done: false },
  };
}
function defaultLevel() { return { unlocked: false, done: false, bestTime: null, bestTimeAssist: null, bestCoins: 0, stars: 0, crystals: 0, vista: false, secret: false, attempts: 0 }; }

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
/** migrate(blob) → a v2 save object (pure; v1 → v2 additive, v2 → filled with any missing defaults). null for junk. */
export function migrate(d) {
  if (!isObj(d) || typeof d.v !== 'number' || d.v < 1) return null;
  const base = defaults();
  const out = { ...base, ...d };
  out.cosmetics = { ...base.cosmetics, ...(isObj(d.cosmetics) ? d.cosmetics : {}) };
  out.cosmetics.owned = [...new Set([...base.cosmetics.owned, ...(Array.isArray(d.cosmetics?.owned) ? d.cosmetics.owned : [])])];
  out.settings = { ...base.settings, ...(isObj(d.settings) ? d.settings : {}) };
  out.stats = { ...base.stats, ...(isObj(d.stats) ? d.stats : {}) };
  out.flags = { ...base.flags, ...(isObj(d.flags) ? d.flags : {}) };
  out.daily = { ...base.daily, ...(isObj(d.daily) ? d.daily : {}) };
  out.levels = {};
  for (const [id, e] of Object.entries(isObj(d.levels) ? d.levels : {})) out.levels[id] = { ...defaultLevel(), ...(isObj(e) ? e : {}) };
  out.wallet = Number.isFinite(d.wallet) ? d.wallet : 0;
  out.createdAt = d.createdAt ?? base.createdAt;
  if (d.v < VERSION) { out.migratedFrom = d.v; out.v = VERSION; }
  return out;
}

let mem = null;          // in-memory copy (always valid)
let storageOk = true;

function read() {
  if (mem) return mem;
  mem = defaults();
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) {
      const m = migrate(JSON.parse(raw));
      if (m) { const was = JSON.parse(raw).v; mem = m; if (was !== mem.v) write(); }
    }
  } catch { storageOk = false; }
  return mem;
}
function write() {
  mem.updatedAt = Date.now();
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(mem)); storageOk = true; }
  catch { storageOk = false; }
}
// flush on page hide (patch() already writes immediately; this covers direct mutations by callers)
for (const ev of ['pagehide', 'visibilitychange']) globalThis.addEventListener?.(ev, () => { if (mem && (ev === 'pagehide' || document.hidden)) write(); });

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
 * levelResult(id, {time, coins, coinsTotal, crystals, parTime, nextId, assist}) → {stars, newBest, starFlags}
 * ★ finished, ★ all coins (coins ≥ coinsTotal), ★ time ≤ parTime. Unlocks `nextId` (next by order).
 * assist (Yardım Modu run, GDD §4.3): no time star, the record goes to bestTimeAssist instead of bestTime.
 */
export function levelResult(id, { time, coins = 0, coinsTotal = 0, crystals = 0, parTime = Infinity, nextId = null, assist = false } = {}) {
  const starFlags = { done: true, coins: coinsTotal > 0 ? coins >= coinsTotal : true, time: !assist && time <= parTime };
  const stars = (starFlags.done ? 1 : 0) + (starFlags.coins ? 1 : 0) + (starFlags.time ? 1 : 0);
  let newBest = false;
  patch((d) => {
    const e = (d.levels[id] ??= defaultLevel());
    e.unlocked = true; e.done = true;
    const k = assist ? 'bestTimeAssist' : 'bestTime';
    if (e[k] == null || time < e[k]) { e[k] = time; newBest = true; }
    e.bestCoins = Math.max(e.bestCoins, coins);
    e.stars = Math.max(e.stars, stars);
    e.crystals = Math.max(e.crystals, crystals);
    d.wallet += coins;
    d.stats.wins = (d.stats.wins || 0) + 1;
    if (nextId) { const n = (d.levels[nextId] ??= defaultLevel()); n.unlocked = true; }
  });
  return { stars, newBest, starFlags };
}
/** levelFlag(id, key, value = true) — per-level boolean/number fields (vista, secret, attempts…). */
export function levelFlag(id, key, value = true) { patch((d) => { (d.levels[id] ??= defaultLevel())[key] = value; }); }
/** attempt(id) — counts a level start (levels[id].attempts). */
export function attempt(id) { patch((d) => { const e = (d.levels[id] ??= defaultLevel()); e.attempts = (e.attempts || 0) + 1; }); }
export function setSetting(key, value) { patch((d) => { d.settings[key] = value; }); }
export function reset() { mem = defaults(); write(); }
export function isPersistent() { read(); return storageOk; }
/** _reload() — test hook: drop the in-memory copy so the next get() re-reads (and migrates) localStorage. */
export function _reload() { mem = null; return read(); }

export const save = { get, patch, level, ensureUnlocks, levelResult, levelFlag, attempt, setSetting, reset, isPersistent, migrate, _reload, KEY, VERSION, defaultLevel, defaultSettings };
export default save;
