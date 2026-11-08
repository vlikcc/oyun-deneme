// Audio: buses, sampled SFX (assets/sfx/manifest.json) with synth fallback, ambience loops, synth music.
// The AudioContext is created/resumed on the first pointerdown/keydown/touchstart (mobile autoplay rules).
let ac = null, master, sfxBus, musicBus, ambBus;
export const state = { muted: false, musicEnabled: true, ready: false, musicPlaying: false };

// Sampled SFX: each key that has an mp3 replaces its synth fallback. Only the keys the engine/theme actually use are
// fetched (the manifest can list hundreds of files); other keys load on first use via ensure()/play().
const samples = {};
let manifest = null;            // Set of keys present in assets/sfx/manifest.json
const inflight = new Map();     // key → Promise
const CORE_SFX = ['jump', 'coin', 'stomp', 'hurt', 'bounce', 'pound', 'land', 'splash', 'crystal', 'checkpoint', 'portal', 'win', 'lava', 'switch', 'crumble', 'key', 'door', 'cannon', 'wind'];
const SAMPLE_VOL = { jump: 0.5, coin: 0.5, stomp: 0.7, hurt: 0.6, bounce: 0.6, pound: 0.8, land: 0.35, splash: 0.7, crystal: 0.7, checkpoint: 0.5, portal: 0.7, win: 0.7, amb_waves: 0.6, amb_birds: 0.35 };
let samplesLoaded = null;
const loops = new Map();            // key → { gain, stop() }  (ambience loops and '__music')
let wantedLoops = [];               // ambience keys requested before samples arrived
let wantedMusic = undefined;        // theme.music (null → synth tune)

export function init() {
  if (ac) return ac;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  ac = new Ctx();
  master = ac.createGain(); master.gain.value = state.muted ? 0 : 0.55; master.connect(ac.destination);
  sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  musicBus = ac.createGain(); musicBus.gain.value = 0.22; musicBus.connect(master);
  ambBus = ac.createGain(); ambBus.gain.value = 0.5; ambBus.connect(master);
  state.ready = true;
  loadSamples().then(() => { setAmbience(wantedLoops); });
  if (wantedMusic !== undefined) setMusic(wantedMusic);
  return ac;
}
export function resume() { if (ac && ac.state !== 'running') ac.resume().catch(() => {}); }
export function suspend() { if (ac && ac.state === 'running') ac.suspend().catch(() => {}); }
export function unlock() { init(); resume(); }
// first user gesture → create + resume context
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, unlock, { passive: true });

async function loadManifest() {
  if (manifest) return manifest;
  try { manifest = new Set(await (await fetch('assets/sfx/manifest.json')).json()); } catch { manifest = new Set(); }
  return manifest;
}
/** ensure(keys): fetch+decode those samples that exist in the manifest (idempotent, a few at a time). */
export async function ensure(keys) {
  if (!ac) return;
  const m = await loadManifest();
  const todo = [...new Set(keys)].filter((k) => m.has(k) && !samples[k]);
  await Promise.all(todo.map((name) => {
    if (inflight.has(name)) return inflight.get(name);
    const p = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetch(`assets/sfx/${name}.mp3`); if (!r.ok) return;
          samples[name] = await ac.decodeAudioData(await r.arrayBuffer()); return;
        } catch (e) { if (attempt === 2) console.warn('sfx load failed', name, e); else await new Promise((res) => setTimeout(res, 300 * (attempt + 1))); }
      }
    })().finally(() => inflight.delete(name));
    inflight.set(name, p);
    return p;
  }));
}
async function loadSamples() {
  if (samplesLoaded) return samplesLoaded;
  samplesLoaded = ensure(CORE_SFX);
  return samplesLoaded;
}
/** release(keys): drop decoded buffers that are not in the core set (theme ambience/music on level unload, §11). */
export function release(keys = []) {
  for (const k of keys) if (!CORE_SFX.includes(k) && samples[k] && !loops.has(k)) delete samples[k];
}
export function has(key) { return !!samples[key]; }
function playSample(name, { vol = SAMPLE_VOL[name] ?? 0.6, rate = 1, bus = sfxBus, loop = false, fadeIn = 0 } = {}) {
  const b = samples[name]; if (!b || !ac) return null;
  const src = ac.createBufferSource(); src.buffer = b; src.loop = loop; src.playbackRate.value = rate;
  const g = ac.createGain();
  if (fadeIn > 0) { g.gain.setValueAtTime(0.0001, ac.currentTime); g.gain.exponentialRampToValueAtTime(vol, ac.currentTime + fadeIn); }
  else g.gain.value = vol;
  src.connect(g).connect(bus); src.start();
  return { src, gain: g };
}
function tone(freq, dur, { type = 'square', vol = 0.25, slide = 0, delay = 0, bus = sfxBus } = {}) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.3, freq = 800, delay = 0 } = {}) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = ac.createBufferSource(); s.buffer = buf;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = ac.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(sfxBus); s.start(t);
}
const synth = {
  jump: (n = 1) => tone(330 + n * 70, 0.16, { type: 'square', vol: 0.12, slide: 380 + n * 120 }),
  coin: () => { tone(988, 0.07, { type: 'square', vol: 0.1 }); tone(1319, 0.22, { type: 'square', vol: 0.1, delay: 0.07 }); },
  stomp: () => { tone(220, 0.15, { type: 'triangle', vol: 0.35, slide: -150 }); noise(0.12, { vol: 0.25, freq: 1200 }); },
  hurt: () => { tone(440, 0.35, { type: 'sawtooth', vol: 0.15, slide: -330 }); },
  bounce: () => tone(200, 0.35, { type: 'sine', vol: 0.35, slide: 700 }),
  pound: () => { tone(90, 0.25, { type: 'sine', vol: 0.6, slide: -50 }); noise(0.2, { vol: 0.4, freq: 500 }); },
  land: () => noise(0.06, { vol: 0.12, freq: 600 }),
  splash: () => { noise(0.45, { vol: 0.35, freq: 2500 }); tone(600, 0.3, { type: 'sine', vol: 0.12, slide: -400 }); },
  crystal: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.16, delay: i * 0.07 })),
  checkpoint: () => [392, 523, 659].forEach((f, i) => tone(f, 0.18, { type: 'square', vol: 0.08, delay: i * 0.08 })),
  portal: () => [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.15, delay: i * 0.1 })),
  win: () => [523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'square', vol: 0.1, delay: i * 0.13 })),
  // extra keys mechanics may use (synth only unless a sample with that name exists)
  lava: () => { noise(0.3, { vol: 0.3, freq: 900 }); tone(180, 0.3, { type: 'sawtooth', vol: 0.12, slide: -120 }); },
  switch: () => { tone(660, 0.08, { type: 'square', vol: 0.1 }); tone(880, 0.12, { type: 'square', vol: 0.1, delay: 0.08 }); },
  crumble: () => noise(0.25, { vol: 0.25, freq: 700 }),
  key: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.15, { type: 'triangle', vol: 0.12, delay: i * 0.06 })),
  door: () => tone(140, 0.5, { type: 'triangle', vol: 0.2, slide: 60 }),
  cannon: () => { noise(0.3, { vol: 0.4, freq: 600 }); tone(120, 0.3, { type: 'sine', vol: 0.3, slide: 300 }); },
  wind: () => noise(0.5, { vol: 0.12, freq: 1500 }),
};
/** sfx.<key>(...args): sample if present (slightly random pitch), synth otherwise. sfx.play(key) for dynamic keys. */
export const sfx = {};
for (const k of Object.keys(synth)) sfx[k] = (...args) => play(k, ...args);
export function play(k, ...args) {
  if (!ac) return;
  const rate = k === 'jump' ? 1 + (args[0] ?? 1) * 0.06 : 0.94 + Math.random() * 0.12;
  if (!playSample(k, { rate })) { synth[k]?.(...args); if (!CORE_SFX.includes(k)) ensure([k]); }
}

// ---------------------------------------------------------------- footsteps (§11): step_<set>_N round-robin, lazy
const STEP_SETS = { grass: ['step_grass_1', 'step_grass_2', 'step_grass_3', 'step_grass_4'], stone: ['step_stone_1', 'step_stone_2', 'step_stone_3', 'step_stone_4'], sand: ['step_sand_1', 'step_sand_2', 'step_sand_3', 'step_sand_dry'], snow: ['step_snow_1', 'step_snow_2', 'step_snow_3', 'step_snow_4'] };
const stepIdx = {};
let lastStepAt = 0;
/** step(set): one footstep from the surface's sample set ('grass'|'stone'|'sand'|'snow'); synth tick until decoded. */
export function step(set = 'grass') {
  if (!ac) return;
  const keys = STEP_SETS[set] || STEP_SETS.grass;
  const now = ac.currentTime; if (now - lastStepAt < 0.09) return; lastStepAt = now;
  const i = (stepIdx[set] = ((stepIdx[set] ?? -1) + 1) % keys.length);
  if (!playSample(keys[i], { vol: 0.22, rate: 0.95 + Math.random() * 0.1 })) { noise(0.04, { vol: 0.05, freq: set === 'stone' ? 1800 : 700 }); ensure(keys); }
}

// ---------------------------------------------------------------- loops (ambience / music samples)
/**
 * playLoop(key, {vol, bus, fadeIn, crossfade}) — a looping sample. With `crossfade` (seconds) the buffer is re-triggered
 * `crossfade` s before its end with overlapping fades instead of a hard loop (music tracks, §11: 0.5 s).
 */
export function playLoop(key, { vol = SAMPLE_VOL[key] ?? 0.5, bus = ambBus, fadeIn = 2.5, crossfade = 0, id = key } = {}) {
  if (!ac || loops.has(id)) return loops.get(id) || null;
  const b = samples[key]; if (!b) return null;
  const lg = ac.createGain(); lg.connect(bus);
  if (fadeIn > 0) { lg.gain.setValueAtTime(0.0001, ac.currentTime); lg.gain.exponentialRampToValueAtTime(1, ac.currentTime + fadeIn); } else lg.gain.value = 1;
  const entry = { key, gain: lg, srcs: [], timer: null, stopped: false, stop() {
    entry.stopped = true; clearTimeout(entry.timer);
    try { lg.gain.cancelScheduledValues(ac.currentTime); lg.gain.setTargetAtTime(0.0001, ac.currentTime, 0.3); } catch {}
    for (const s of entry.srcs) { try { s.stop(ac.currentTime + 1.2); } catch {} }
  } };
  if (!crossfade) {
    const src = ac.createBufferSource(); src.buffer = b; src.loop = true;
    const g = ac.createGain(); g.gain.value = vol; src.connect(g).connect(lg); src.start();
    entry.srcs.push(src);
  } else {
    const dur = b.duration, fade = Math.min(crossfade, dur / 4);
    const schedule = (at) => {
      if (entry.stopped) return;
      const src = ac.createBufferSource(); src.buffer = b;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + fade);
      g.gain.setValueAtTime(vol, at + dur - fade); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.connect(g).connect(lg); src.start(at); src.stop(at + dur + 0.05);
      entry.srcs.push(src);
      src.onended = () => { const i = entry.srcs.indexOf(src); if (i >= 0) entry.srcs.splice(i, 1); };
      const next = at + dur - fade;
      entry.timer = setTimeout(() => schedule(next), Math.max(0, (next - ac.currentTime - 0.4) * 1000));
    };
    schedule(ac.currentTime + 0.05);
  }
  loops.set(id, entry);
  return entry;
}
export function stopLoop(key) {
  const l = loops.get(key); if (!l) return;
  try { l.stop(); } catch {}
  loops.delete(key);
}
export function stopLoops() { for (const k of [...loops.keys()]) stopLoop(k); }
/** setAmbience(['amb_waves', …]) — called by world.load from theme.ambience; safe before the context exists. */
export function setAmbience(keys = []) {
  wantedLoops = [...keys];
  if (!ac) return;
  for (const k of [...loops.keys()]) if (!wantedLoops.includes(k) && k !== '__music') stopLoop(k);
  const want = [...wantedLoops];
  ensure(want).then(() => { for (const k of want) if (wantedLoops.includes(k)) playLoop(k); });
}

// ---------------------------------------------------------------- music (synth pentatonic tune or a sampled loop)
let musicTimer = null;
function startSynthMusic() {
  if (musicTimer || !ac) return;
  const scale = [0, 2, 4, 7, 9, 12, 14, 16];
  const melody = [0, 2, 4, 2, 5, 4, 2, 4, 3, 4, 5, 7, 5, 4, 2, 1];
  const bass = [0, 0, 5, 5, 3, 3, 4, 4];
  const base = 261.63, beat = 0.28;
  let step = 0, next = ac.currentTime + 0.1;
  const f = (s, oct = 0) => base * Math.pow(2, (scale[s % scale.length] + 12 * (Math.floor(s / scale.length) + oct)) / 12);
  musicTimer = setInterval(() => {
    if (ac.state !== 'running') { next = ac.currentTime + 0.1; return; }
    while (next < ac.currentTime + 0.4) {
      const delay = next - ac.currentTime;
      const m = melody[step % 16];
      if (step % 4 !== 3) tone(f(m), beat * 0.9, { type: 'triangle', vol: 0.18, delay, bus: musicBus });
      if (step % 2 === 0) tone(f(bass[(step >> 1) % 8], -2), beat * 1.8, { type: 'sine', vol: 0.3, delay, bus: musicBus });
      next += beat; step++;
    }
  }, 100);
}
function stopSynthMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
/** setMusic(key|null): sampled loop `key` or the synth tune when null; respects state.musicEnabled. */
export function setMusic(key = null) {
  wantedMusic = key;
  stopSynthMusic(); stopLoop('__music');
  state.musicPlaying = false;
  if (!ac || !state.musicEnabled) return;
  if (key) ensure([key]).then(() => { if (wantedMusic === key && state.musicEnabled && samples[key]) playLoop(key, { id: '__music', bus: musicBus, fadeIn: 1.5, vol: 0.8, crossfade: 0.5 }); });
  else startSynthMusic();
  state.musicPlaying = true;
}
export function setMusicEnabled(v) { state.musicEnabled = !!v; setMusic(wantedMusic ?? null); }
export function setMuted(v) { state.muted = !!v; if (master) master.gain.value = state.muted ? 0 : 0.55; }
export function toggleMute() { setMuted(!state.muted); return state.muted; }

export const audio = { init, resume, suspend, unlock, sfx, play, step, ensure, release, has, playLoop, stopLoop, stopLoops, setAmbience, setMusic, setMusicEnabled, setMuted, toggleMute, state, get context() { return ac; } };
export default audio;
