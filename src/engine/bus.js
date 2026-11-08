// Tiny synchronous event bus shared by the engine modules (keeps the import graph acyclic:
// physics never imports world/ui, it just emits 'hurt', 'respawn', 'hud', 'toast', 'pound', 'water'…).
// world.emit/on (§7 signals) are built on top of this with a per-level namespace.
const listeners = new Map();

export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => off(name, fn);
}
export function off(name, fn) { listeners.get(name)?.delete(fn); }
export function once(name, fn) { const un = on(name, (...a) => { un(); fn(...a); }); return un; }
export function emit(name, ...args) {
  const set = listeners.get(name); if (!set) return;
  for (const fn of [...set]) { try { fn(...args); } catch (e) { console.error(`[bus:${name}]`, e); } }
}
export function clear(prefix) {
  for (const k of [...listeners.keys()]) if (!prefix || k.startsWith(prefix)) listeners.delete(k);
}
export const bus = { on, off, once, emit, clear };
export default bus;
