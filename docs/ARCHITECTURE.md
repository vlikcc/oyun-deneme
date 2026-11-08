# Pıtır — engine architecture & level API contract

This document is the **contract** between the engine (src/engine, src/main.js), the gameplay mechanics modules
(src/engine/mechanics/*.js), the UI (src/ui/*.js) and the level files (src/levels/*.js). Several people/agents build
these in parallel, so: **implement exactly what is written here; if something is missing, add it to this document in the
same change** (append, don't rewrite others' sections). The gameplay primitive list (§7) is fixed by docs/GDD.md.

Runtime: static files only (python3 -m http.server 8765 for dev), ES modules, no bundler, no TypeScript, three.js r186
vendored at `vendor/three` (import map: `three`, `three/addons/`). Must run in a Capacitor WebView later → never depend on
a CDN, pointer lock, hover, or keyboard-only input. Every string the player sees is Turkish.

## 1. Files

```
index.html                 shell: <canvas id="c">, HUD + overlay containers, import map, <script type="module" src="src/main.js">
src/main.js                bootstrap + game state machine (menu → select → play → win) + main loop
src/engine/core.js         renderer, scene, camera, lights, sky/HDRI, fog, water, quality tiers, resize, time
src/engine/assets.js       texture/PBR material cache (pbr(id)), HDRI loader, GLTF loader + model cache (model(name)), manifest
src/engine/physics.js      player state, colliders, surfaces, collision resolution, stepPlayer(dt, input), hooks
src/engine/player.js       Pıtır's visual (model, squash/stretch, feet, blob shadow, cosmetics)
src/engine/enemies.js      enemy registry + built-in kinds (slime, spiky); new kinds register themselves
src/engine/world.js        Level builder `L` (primitives), level load/unload, per-frame world update, collectibles, checkpoints, portal
src/engine/mechanics/*.js  one file per gameplay primitive from §7 (ice, lava, crumble, wind, cannon, key/door, switch, …)
src/engine/camera.js       follow camera, collision pull-in, shake
src/engine/fx.js           particles, pops, hit-stop, trauma helpers
src/engine/audio.js        buses, sampled SFX with synth fallback, music, per-level ambience
src/engine/input.js        keyboard/mouse/gamepad → {ix, iy, look} + edge flags; merges touch input from touch.js
src/engine/touch.js        virtual joystick + buttons (pointer events), only activated on touch devices or ?touch=1
src/engine/save.js         localStorage progress + settings (schema §9)
src/ui/hud.js              hearts/coins/crystals/timer, toast, hint, pause button
src/ui/screens.js          start, level select, pause, win, settings overlays (DOM created by JS, CSS in src/ui/ui.css)
src/levels/index.js        `export const LEVELS = [...]` ordered list of level modules
src/levels/<id>.js         one level per file (see §4)
assets/                    tex/ hdri/ models/ sfx/ (+ CREDITS.md, manifest.json)
tools/                     smoke.mjs (headless test), fetch-*.mjs (asset downloads), optimize-glb.mjs
docs/                      GDD.md, ARCHITECTURE.md (this), research/
```

Module rules: import only from `three`, `three/addons/...` and relative `src/` paths. No circular imports between
`world.js` and mechanics: mechanics import `world.js`/`physics.js`, and `world.js` imports mechanics only through
`src/engine/mechanics/index.js` which re-exports `install(L)` functions. A mechanic never reaches into DOM.

## 2. Coordinate system & units

Y up, metres. Sea level `WATER_Y = -1.0` (player dies/loses a heart below it) unless the theme sets `water: null`.
The player is a vertical capsule approximated by radius `R = 0.5`, height `H = 1.1`; `player.pos` is the FEET position.
Run speed 9 m/s; single jump height 3.2 m (apex 0.38 s); double 3.75; triple ~4.5 (with flip); ground pound fall 34 m/s.
Reachability rules for level authors (single jump from a run): horizontal gap ≤ 6.5 m with ≤ 2.5 m rise; triple jump
≤ 9 m / 4.5 m rise; a bounce pad with strength 32 reaches ~11 m up. Keep walkable platform tops ≥ 2.2 m wide.

Colliders are ONLY: axis-aligned boxes `{type:'box', min, max}` and vertical cylinders `{type:'cyl', x, z, r, y0, y1}`.
Everything the player stands on or bumps into is one of these; visuals may be any mesh.

## 3. Engine core API (src/engine/core.js)

```js
export const renderer, scene, camera, sun, hemi;      // created at import time
export const quality = { tier: 'high'|'medium'|'low', pixelRatio, shadowMapSize, waterTex, anisotropy, maxProps };
export function applyTheme(theme)                      // sky/HDRI/fog/water/sun colours — see §5
export function setWater(enabled, opts)                // builds/destroys the Water mesh (planar reflection on high, flat animated plane on low)
export function render()                               // one frame
export const time = { now: 0, dt: 0 }                  // seconds, updated by main loop (dt clamped ≤ 0.1, 0 while paused)
```
Quality auto-detect: `?quality=` override, else `low` if (touch && (devicePixelRatio*innerWidth*innerHeight > 2.5M px or
hardwareConcurrency ≤ 4)), `medium` for other touch devices, `high` otherwise. Tier table:

| tier   | pixelRatio cap | shadow map | water                     | anisotropy | reflection |
|--------|----------------|------------|---------------------------|------------|------------|
| high   | 1.5            | 2048       | Water.js 512² reflection  | 8          | yes        |
| medium | 1.25           | 1024       | Water.js 256² reflection  | 4          | yes        |
| low    | 1.0            | 1024       | flat animated plane       | 2          | no         |

## 4. Level module (src/levels/<id>.js)

```js
export default {
  id: 'volkan',                      // ascii slug, unique, used in URLs (?level=volkan) and save data
  name: 'Volkan Adası',              // Turkish display name
  order: 2,                          // 1-based position in the campaign
  subtitle: 'Lavdan kaç, kristalleri kap!',
  theme: THEME,                      // §5
  spawn: [0, 0.1, 22], spawnFacing: Math.PI,
  parTime: 180,                      // seconds for the ★ time star
  crystals: 5,                       // number of crystals placed in build (engine asserts)
  coinsTotal: null,                  // filled by engine after build (for the ★ all-coins star)
  build(L) { ... },                  // §6 — synchronous; may call L.prop() which loads async
  update(dt, t, L) { ... },          // optional per-frame hook while playing
  testPath: [ { at: [x, y, z], via: 'walk'|'jump'|'triple'|'bounce'|'mover'|'cannon'|'crumble'|'climb', note: '...' }, ... ],
  //  ↑ waypoints from spawn to each crystal and back to the portal, in play order; tools/smoke.mjs teleports to each
  //    `at` and checks there is ground ≤ 0.6 m under it, and that consecutive 'walk'/'jump' hops respect §2 reach rules.
}
```
`src/levels/index.js` exports `LEVELS` sorted by `order`. Level 1 (`kristal`) is the current island rebuilt with the API.

## 5. Theme object

```js
{
  hdri: 'kloofendal_48d_partly_cloudy_puresky',  // file assets/hdri/<id>_2k.hdr or _1k.hdr (assets.js picks what exists)
  hdriRotation: 0,                                // radians around Y (align sun) — optional
  environmentIntensity: 0.7, backgroundIntensity: 1.0,
  sun: { dir: [0.555, 0.743, 0.374], color: 0xfff1d6, intensity: 2.6 },
  hemi: { sky: 0xdff4ff, ground: 0x6a8f4a, intensity: 0.8 },
  fog: { color: 0xd6ecff, near: 90, far: 230 },
  water: { color: 0x1c8fd1, sunColor: 0xfff1d6, level: -1.2, distortion: 2.2 } | null,
  // materials by role; ids are Poly Haven texture ids present in assets/tex (see assets/manifest.json)
  materials: {
    ground: { tex: 'aerial_grass_rock', tint: 0xe4ffc4, scale: 5, normalScale: 0.7 },
    cliff:  { tex: 'rock_face', tint: 0xe8ddd0, scale: 6 },
    stone:  { tex: 'stone_tiles_02', tint: 0xfff2e0, scale: 3 },
    accent: { tex: 'coast_sand_01', tint: 0xffefc8, scale: 5 },
  },
  ambience: ['amb_waves', 'amb_birds'],   // loop keys from assets/sfx/manifest.json
  music: 'music_island' | null,           // loop key, or null → synth tune
  particles: 'none'|'embers'|'snow'|'leaves'|'fireflies'|'sparkles',  // ambient particle system (core.js)
  clouds: true,
}
```
`applyTheme` is called on level load; `assets.pbr(role)` resolves the theme's material for `L` primitives.
(impl note) The shadow-casting directional light follows `theme.sun.dir` too: `camera.update` places it at
`player.pos + SUN_DIR × 54` every frame (the Water.js `sunDirection` uniform reads the same normalised `core.SUN_DIR`).

## 6. Level builder `L` (src/engine/world.js) — base primitives

All positions are world metres; `top` is the walkable top Y. Every function returns the collider (or object) it made so
authors can chain mechanics (`L.ice(L.box(...))`). `opts.mat` selects the theme material role for sides/tops:
`{ side: 'cliff'|'stone'|'ground'|'accent'|<THREE.Material>, top: ... , color, topColor }` (flat colours still work).

```js
L.box(x, top, z, w, d, h, opts)            // AABB platform; opts: {mat, bounce, surface, tags, castShadow}
L.cyl(x, top, z, r, h, opts)               // vertical cylinder island/pillar; opts: {mat, seg, bounce, surface, noSolid}
L.island(x, top, z, r, h, opts)            // cyl + beach ring + rocks + optional tree scatter: opts {beach:true, trees:n, flowers:n}
L.mover(a, b, period, w, d, opts)          // oscillating platform (THREE.Vector3 a, b) — carries the player
L.bouncePad(x, top, z, r, strength)        // strength 27 ≈ 8 m, 32 ≈ 11 m
L.coin(x, y, z) / L.coinLine(a, b, n) / L.coinRing(x, y, z, r, n) / L.coinArc(a, b, n, height)
L.crystal(x, y, z, colorHex)               // exactly `crystals` of these per level
L.checkpoint(x, y, z, {active})            // first one is the spawn flag
L.portal(x, y, z)                          // rainbow gate; opens when all crystals collected; entering = win
L.slime(x, y, z, roam, color) / L.spiky(a, b, speed)   // enemies (see enemies.js for new kinds: L.enemy(kind, ...))
L.tree(x, z, {kind:'oak'|'pine'|'palm'|'birch'|'dead'|'procedural', scale, collide:true})
L.rock(x, z, {kind:'boulder_01'|'low', scale})
L.prop(name, x, y, z, {scale, rotY, collide:'box'|'cyl'|null, tint})   // GLTF from assets/models/<name>.glb (async, cached, cloned)
L.scatter(kind, {center, rMin, rMax, count, keepClear})   // trees/flowers/grass tufts/rocks avoiding colliders
L.sign(x, y, z, text, {rotY})              // wooden signpost with a speech bubble when near (tutorial text)
L.light(x, y, z, color, intensity, dist)   // point light (max 4 per level on low tier → engine culls)
L.trigger(box, {onEnter, onStay, onExit, once})   // box = {x, y, z, w, h, d} volume tested against player feet/centre
L.dynamic({ update(dt, t), dispose() })    // register a per-frame updater owned by the level (removed on unload)
L.remove(collider)                         // removes collider + its mesh (crumble/doors use this)
L.spawnParticles(pos, n, color, opts)      // fx.js burst
L.toast(text, secs); L.sfx(key)
```
Lifecycle: `world.load(level)` → `applyTheme`, reset player/HUD, `level.build(L)`, assert crystals count, compute
`coinsTotal`; `world.unload()` removes every object/collider/trigger/dynamic/light created through `L`, disposes
per-level geometries and materials created through `L` (shared cached materials/models stay), stops ambience.
`world.update(dt, t)` runs movers, dynamics, triggers, collectibles, enemies, checkpoints, portal, water-death.

## 7. Gameplay primitives (mechanics) — the list is defined by docs/GDD.md §3

Each mechanic is a module `src/engine/mechanics/<name>.js` exporting `install(L, ctx)` which attaches `L.<name>(...)`.
`ctx = { scene, player, physics, enemies, fx, audio, assets, world }`. Mechanics may use these physics hooks:

* **Surfaces** — `collider.surface = 'normal'|'ice'|'mud'|'bounce'|'conveyor'|'lava'`. `physics.SURFACES[name] = {acc, dec, friction, speed}` multipliers; `lava` is a hazard (see hooks).
* **Collider hooks** — `collider.onLand(player, collider)`, `onStand(player, collider, dt)` every step while grounded on it, `onBonk(player, collider)` head/side contact, `onLeave(player, collider)`.
* **Player control locks** — `player.controlLock = seconds` (no input, keeps velocity), `player.extVel` (Vector3 added each step; mechanics set it, physics decays it), `physics.launch(vel)` sets velocity and clears grounded/chain.
* **Hazards** — `physics.hazard(kind, fromPos)` → `'lava'`: lose heart + respawn with fire particles; `'spike'`: hurt + knockback.
* **Enemies** — `enemies.register(kind, { spawn(L, ...args) → entity, update(e, dt, ctx), onStomp(e), touch: 'hurt'|'stomp' })`; `L.enemy(kind, ...args)`.
* **Signals** — `world.emit('switch', id)` / `world.on('switch', id, fn)` for key/door/switch wiring within a level.

## 8. Test hooks (`window.__game`) — required, used by tools/smoke.mjs

```js
window.__game = {
  ready: true,                      // set after assets.js manifest + first level list are available
  levels: [{id, name, order}],
  state,                            // 'menu'|'select'|'play'|'paused'|'win'
  player, enemies, coins, crystals, colliders, cam,
  loadLevel(id), startLevel(id),    // startLevel = load + state 'play' (no overlay, no pointer lock, audio may be muted)
  test: {
    start(id) → Promise,            // same as startLevel but resolves when the level is built
    tick(dt, {ix, iy, jump, pound, look}),  // one fixed physics+world step with that input, no render
    teleport(x, y, z),
    groundBelow(x, y, z) → y|null,  // raycast against solid meshes + movers
    report() → { coinsLeft, crystalsLeft, enemiesAlive, colliders, triggers, dynamics, errors: [] },
    collectAll(),                   // marks all crystals collected (opens portal) for win-flow tests
  },
}
```
Query params: `?level=<id>` jumps straight into that level (state 'play'), `?test=1` disables overlays/pointer lock/
music and sets fixed seed, `?quality=low|medium|high`, `?touch=1` forces touch controls on.

## 9. Save data (src/engine/save.js)

localStorage key `pitir.save.v1`:
```js
{ v: 1, wallet: 0, cosmetics: { owned: ['none'], hat: 'none', scarf: 0x4dabf7 },
  settings: { mute: false, music: true, quality: 'auto', invertY: false, hints: true },
  levels: { [id]: { unlocked: true, done: false, bestTime: null, bestCoins: 0, stars: 0, crystals: 0 } } }
```
`save.get()`, `save.patch(fn)`, `save.levelResult(id, {time, coins, coinsTotal, crystals})` computes stars:
★ finished, ★ all coins (coins ≥ coinsTotal), ★ time ≤ parTime; unlocks the next level by `order`. Never throws when
localStorage is unavailable (in-memory fallback).

## 10. Coding rules

* Keep the existing feel constants (physics.js) — level authors rely on §2.
* No `await` inside `build(L)`; async prop loads must resolve later and must not create colliders after build (colliders for props are created synchronously from `opts.collide` sizes, not from the loaded mesh bounds).
* Dispose what you create; `L` tracks everything. Shared caches (materials/models/textures) are never disposed.
* Deterministic placement: `L.rnd()` is a seeded PRNG reset per level load; never `Math.random()` in build.
* Performance: ≤ 300 draw calls on high tier per level (`renderer.info.render.calls` is shown in `?debug=1` HUD), ≤ 150k triangles, props instanced via `InstancedMesh` when `L.scatter` places ≥ 8 of one kind.
* All UI strings Turkish; keep the existing visual language (cream card, ink outline, gold buttons; CSS in src/ui/ui.css).
* Run `node tools/smoke.mjs --level=<id>` (or `--all`) before declaring a level or engine change done; `node --check` every file.
* (impl note) The draw-call budget is measured per *whole* frame (`core.stats()` after `core.render()`: shadow pass + water
  reflection pass + main pass) and is **≤ 350 calls on high** (≤ 300 on medium, ≤ 200 on low); kristal measures 326 / 271 / 172.

## 11. Audio loading (impl note, added after the Zapsplat download)

`assets/sfx` now holds ~230 mp3 files (45 MB) listed in `assets/manifest.json` → `sfx` and `assets/sfx/manifest.json`.
**Never decode them all at start.** audio.js keeps a CORE set decoded eagerly (jump, coin, stomp, hurt, bounce, pound,
land, splash, crystal, checkpoint, portal, win, ui_click/menu sounds) and decodes everything else lazily: the theme's
`ambience` + `music` keys on level load (then released on unload), and any other key the first time `sfx(key)` is called
(play the synth fallback for that first call if the buffer is not ready yet). Footstep keys are picked by surface role:
`step_grass_*`, `step_stone_*`, `step_sand_*`, `step_snow_*` round-robin (theme.materials.ground.steps may override).
Music tracks are long (up to 60 s loops at 96 kbps); loop them with a 0.5 s crossfade when `loop: true`.

## 11. Implementation notes (impl note) — first engine refactor

Appended by the engine refactor; each item names the section it clarifies.

* **§1 files (impl note)** — one extra module: `src/engine/bus.js`, a tiny synchronous event bus (`on/off/once/emit`).
  It keeps the import graph acyclic: `physics.js` never imports `world.js`/UI; it emits `'hud'`, `'toast'`, `'hurt'`,
  `'faint'`, `'respawn'`, `'water'`, `'hazard'`, `'pound'`; `world.js` emits `'win'`, `'coin'`, `'crystal'`,
  `'checkpoint'`, `'portal:open'`, `'sign'`, `'level:loaded'`, `'level:unloaded'`; `enemies.js` emits
  `'enemy:killed'`; `input.js` emits `'key:pause'`, `'key:mute'`, `'pointerlock'`. `world.emit/on` (§7 signals) are
  namespaced on this bus and subscriptions made through `L.on`/`world.on` die with the level.
  Import direction: `core ← assets`, `fx → core`, `physics → fx, audio, bus`, `camera → core, physics, fx`,
  `player → core, assets, physics, fx`, `enemies → core, assets, physics, fx, audio, bus`,
  `world → everything above + mechanics/index`, `input → core, camera, touch, bus`, `ui/* → engine`, `main → all`.
* **§2 player size (impl note)** — the shipped capsule is `R = 0.45`, `H = 1.4` (the original feel), not 0.5/1.1. Reach
  rules in §2 were measured with these values; keep them.
* **§3 core (impl note)** — `core.flags = { test, debug, touch }`, `core.params` (URLSearchParams), `core.stats()` →
  `{ calls, triangles }` from `renderer.info`. `renderer.info.render.calls` counts the shadow pass and the water
  reflection pass too, so the ≤ 300 budget is measured per `render()` including those; the ported `kristal` island sits
  at ~350 on high (shadow + reflection), ~100 on low. `AMBIENT_PARTICLES` is a table `name → factory(scene, quality)`
  returning `{ update(dt, t), dispose() }`; every entry is `null` (no-op) for now — fill them in `core.js`.
  Low tier water = flat `MeshStandardMaterial` plane with the scrolling `waternormals.jpg` normal map. `quality.maxLights`
  (8 / 6 / 4) is what `L.light` culls against. Clouds (`theme.clouds`) are built by `world.load` through `L.clouds(14)`
  as one `InstancedMesh` unless the level already called `L.clouds` itself (kristal does, to keep its seeded order).
* **§4 level module (impl note)** — optional fields: `seed` (PRNG seed for `L.rnd()`, default 7), `hidden: true`
  (excluded from `LEVELS` / the campaign, still loadable by id — used by `src/levels/_test.js`, id `test`),
  `camYaw`/`camPitch` (initial camera), `noAutoClouds`. `coinsTotal` is written onto the module after build.
  `src/levels/index.js` exports `LEVELS` (campaign), `ALL_LEVELS`, `levelById(id)`, `nextLevel(id)`.
* **§5 HDRI ids (impl note)** — `theme.hdri` is a Poly Haven id; `assets.js` keeps an alias table `HDRI_FILES`
  (`kloofendal_48d_partly_cloudy_puresky → sky_2k.hdr`, `kloppenheim_06_puresky → kloppenheim_06_puresky_1k.hdr`).
  Unknown ids try `<id>_2k.hdr` then `<id>_1k.hdr` then `<id>.hdr` (may 404 once in dev — add the file to the table).
  Nothing in `assets/` was renamed. Materials: `assets.pbr(role)` resolves `theme.materials[role]` with a default table
  for `ground/cliff/stone/accent` plus the extra roles `boulder` (FreePBR boulder set) and `wood` (oak bark); a role may
  also be a `THREE.Material` or an inline `{ tex, tint, scale, … }` object. Texture/model loads retry twice on failure.
* **§6 builder (impl note)** — extra primitives: `L.flower(x, y, z, color)` (all flowers of a level become one
  `InstancedMesh` after build), `L.clouds(n)`, `L.nearCollider(x, z, margin, keepClear)` (the original tree-placement
  test), `L.own(geometry|material|texture)` + `L.add(object3D)` to let a level/mechanic register things for disposal,
  `L.rnd()`, `L.player`, `L.colliders`, `L.enemies` (the registry, so a level can `L.enemies.register(...)`),
  `L.physics`, `L.fx`, `L.audio`, `L.assets`, `L.on/L.emit` (signals).
  `opts.mat` accepts a role string (side + top), `{ side, top }` roles/materials, or `{ color, topColor }` flat colours;
  `opts.color/topColor` still work at the top level. `L.cyl` opts: `side` = flat side colour (old API), `taper`.
  `L.mover(a, b, …)` accepts `[x, y, z]` arrays or Vector3. `L.spiky(a, b)` likewise. `L.portal(x, y, z, { rotY })`.
  `L.tree` kinds: `oak|pine|palm` load `assets/models/tree_<kind>.glb` through `L.prop` and are scaled so their height is
  5.5 / 6 / 5 m × `scale` (`fitHeight`), with a cylinder collider `r = 0.45·scale`, `y1 = 2.6·scale`;
  `procedural` is the old trunk + two leaf blobs (consumes `L.rnd()` twice: colour, rotation); `birch`/`dead` are
  procedural variants (white trunk / trunk only). `L.rock` kinds: `low` (dodecahedron, `opts.y`, `opts.rot` to pass
  explicit seeded values) and `boulder_01` (GLB, ≈1.5 m across at scale 1, cylinder collider).
  `L.prop(name, x, y, z, { scale, rotY, collide: 'box'|'cyl'|null, r, h, w, d, y0, tint, fitHeight, solid })` returns
  the placeholder `Group` immediately (`group.collider`, `group.loaded` Promise); the collider is built synchronously
  from the opts sizes; the GLB clone is attached when loaded. `solid: true` also adds its meshes to the camera raycast list.
  `L.scatter(kind, opts)`: kinds `flowers`, `grass`, `rocks`, `trees` (`opts.kind` or `'trees:oak'`); rocks/grass with
  ≥ 8 instances become one `InstancedMesh`. `L.trigger` box: `{x, z}` centre, `y` = bottom of the volume, `w, h, d` sizes;
  tested against feet and centre (`y + 0.7`); returns the trigger object (`inside`, `done`). `L.remove` accepts a
  collider, a trigger, a dynamic, an Object3D (and its `.collider`) or a collectible record.
  `L.sign` draws the bubble as a canvas sprite in-world (no DOM); it fades in within `opts.range` (4.5 m).
  Lifecycle split: `world.step(dt, t, input)` (fixed 120 Hz: movers → dynamics → `physics.stepPlayer` → triggers → water
  check) and `world.update(dt, t)` (per frame: collectibles, checkpoints, bounce-pad springs, portal, signs, clouds,
  enemies, `level.update`). Retrying a level always rebuilds it (`world.load`), there is no in-place reset.
* **§7 hooks (impl note)** — `physics.SURFACES` row = `{ acc, dec, friction, speed }`: `acc` scales ACC_GROUND while
  pushing, `dec·friction` scales DEC_GROUND while idle, `speed` scales the top speed; `lava` has `hazard: 'lava'` and
  landing on it calls `physics.hazard('lava')`. Conveyors: set `collider.delta` each step (the player rides any ground
  collider's `delta`). Hooks fire: `onLand` when the ground collider changes (from air or from another collider),
  `onStand(player, c, dt)` every step while grounded on it, `onLeave` when it stops being the ground, `onBonk(player, c,
  'head'|'side')`. `player.controlLock` seconds: no input, no jump, gravity still applies. `player.extVel` decays with
  rate 6/s grounded, 1.5/s airborne. `physics.launch(vel)` also clears pounding/flip. `physics.hazard('spike', from)` =
  `physics.hurt(from)`. `physics.lastInput` exposes the last input (enemies read `jumpHeld` for the stomp bounce).
  `physics.sim = { playing, waterY, killY, test }` — `waterY` is `null` for themes without water (then `killY = -60`).
  Enemy entity contract: `{ group, r, h, baseOffset (feet = group.y + baseOffset), touch }`; def may add `poundable`
  and `dispose(e)`. `enemies.spawn(kind, L, ...args)`, `enemies.kill(e)`, `enemies.alive()`.
* **§8 test hooks (impl note)** — `__game` also exposes `allLevels` (incl. hidden), `world`, `physics`, `core`,
  `audio`, `save`, `screens`, `hud`, `fx`, `setPaused(v)`, `showSelect()`, `showMenu()`; `test.portalPos()` and
  `test.win()`. `test.tick(dt, input)` runs `world.step` + `world.update` + visuals + camera (no render); the `jump`/
  `pound` flags are edges, `jumpHeld` defaults to `jump`. `?test=1` suppresses the automatic start overlay, pointer
  lock, music and the hint, fixes the PRNG seeds; overlays reached through the flow (select / pause / win) still render so
  `tools/flow-check.mjs` can drive the UI. `?level=<id>` works for hidden levels too. `node tools/flow-check.mjs` is the
  UI-flow regression (start → select → play → win → Adalar → pause/resume).
  Headless Chrome only produces animation frames while a script pumps `requestAnimationFrame`; drive progress with
  `test.tick` or from inside `page.evaluate`.
* **§9 save (impl note)** — `save.level(id)` returns a default record for unknown ids, `save.ensureUnlocks(LEVELS)`
  unlocks level 1 and every level whose predecessor is done, `save.setSetting(key, value)`, `save.isPersistent()`.
  `levelResult` takes `parTime` and `nextId` explicitly (the engine passes them) and returns
  `{ stars, newBest, starFlags: { done, coins, time } }`.
* **Audio (impl note)** — `audio.init()` is bound to the first `pointerdown`/`keydown`/`touchstart`; `audio.unlock()`
  = init + resume. Only the core SFX keys are preloaded; `assets/sfx/manifest.json` may list hundreds of files, so
  ambience/music loops and extra keys load on demand (`audio.ensure(keys)`, automatic in `setAmbience`, `setMusic`,
  `play`). `audio.play(key)` works for any key (sample if present, synth if one is defined, otherwise silent).
  Extra synth keys: `lava`, `switch`, `crumble`, `key`, `door`, `cannon`, `wind`.
* **UI (impl note)** — `src/ui/hud.js` and `src/ui/screens.js` create all markup; `index.html` only has the canvas,
  the import map and the stylesheet link. Level select DOM: `#selectScreen .card > ul.levels#levelList >
  li.level-card[data-id][data-locked="0|1"]` with `.lv-name`, `.lv-stars`, `.lv-sub`, `.lv-best`; clicking a card calls
  `onSelect(id)`. Win screen: `#winScreen` with `#winStars`, `#winStats`, buttons `#nextBtn` ("Sonraki Ada", hidden when
  there is no next level), `#levelsBtn` ("Adalar"), `#againBtn` ("Tekrar"). Pause: `#pauseScreen` with `#resumeBtn`,
  `#pauseLevelsBtn` and mute/music checkboxes (`#optMute`, `#optMusic`) persisted in save settings. HUD pause button
  `#pauseBtn`; `?debug=1` shows `#debug` (fps / draw calls / triangles / position). Game states:
  `menu → select → play ⇄ paused`, `play → win → (select | play)`; `document.body.dataset.state` mirrors it.
* **Touch (impl note)** — `touch.js` is a stub: `state`, `init()`, `setVisible()`, `merge(input)` (adds its axes and
  edge flags into the keyboard/gamepad input). `core.flags.touch` is true on touch devices or `?touch=1`; `main.js` calls
  `touch.init({ root, onPause })` then.

## 12. Additions for the build phase (impl notes)

* `window.__game.level` must reference the currently loaded level module (tools/smoke.mjs reads its `testPath`).
* Physics must honour `collider.solid === false` (skipped by collision + ground probes; mesh may stay for fading) and `player.flying`
  (no air control, no jump-cut, normal gravity without FALL_MULT) — used by cannon/launch.
* `theme.water` may be `{ kind: 'lava', ... }` (falling in = `physics.hazard('lava')`, no reflection pass, emissive lava shader) or
  `null` with `theme.killY` (void below sky islands → lose a heart + respawn).
* `cam.suggestYaw` (radians|null): camera eases toward it when the player has not orbited for 1.5 s; triggers may set it.
* Every mechanic module ships its own hidden test level `src/levels/_test_<name>.js` (id `test-<name>`, excluded from the
  campaign) and must pass `node tools/smoke.mjs --level=test-<name>`.
* `src/levels/index.js` imports all campaign level files statically (kristal, kumsal, volkan, buz, orman, gok, kale); a level that
  is not built yet exports `{ id, name, order, comingSoon: true }` and the map shows "Yakında".

## 13. Implementation notes (impl note) — refactor completion (engine + level 1 + §12 wiring)

Each item names the section it clarifies. Everything in §12 is implemented and covered by the checks listed at the end.

* **§3 core (impl note)** — `renderer.info.autoReset = false`; `core.render()` resets the counters, so `core.stats()` =
  `{ calls, triangles, geometries, textures }` of a *whole* frame (shadow pass + water reflection pass + main pass). The old
  "~350 on high" figure was a mid-frame reading (Water.js calls `renderer.render()` for its reflection, which reset the counter);
  measured now: kristal 326 calls / 83k tris on high and medium (incl. reflection), 215 on low. Render layer
  `core.NO_REFLECT_LAYER = 1`: the camera and the sun's shadow camera draw it, the Water.js mirror camera (layer 0 only) skips it —
  coins, flowers, grass, particles, the blob shadow and sign bubbles live there. The water mesh is created once per session and
  re-themed on later `setWater` calls (Water.js owns a reflection render target that cannot be disposed from outside; rebuilding
  it per level leaked one GPU texture per load — `memory.textures` is now constant across reloads). `theme.water.kind === 'lava'`
  → `core.lava` (flat emissive plane with the scrolling normal map, no reflection pass, pulsing emissive); `setWater` handles both
  kinds, `theme.water.color/emissive` tint lava. `DEFAULT_THEME.environmentIntensity` is 0.35 (0.7 washed every flat colour out
  under the bright puresky HDRIs); coins use `envMapIntensity 0.4`.
* **§5 HDRI (impl note)** — `assets.settings.hdriRes` is `'2k'` on the high tier and `'1k'` otherwise (set by core.js);
  `loadHDRI(id)` tries `<id>_<res>.hdr`, then the other resolution, then `<id>.hdr`; `HDRI_FILES` only maps names that do not
  follow the pattern (`sky`/`sky_2k` → the legacy copy). Cache key = id + resolution.
* **§6 builder (impl note)** — `L.box`/`L.cyl` meshes have two material groups `[side, top]` (`regroup()` re-orders the index so
  each material is one contiguous group): 2 draw calls per box instead of 6 (and in the shadow pass). `opts.noSolid` marks the
  collider `noSolid = true` / `solid = false` (walk-through, not in the camera raycast list); physics also honours
  `collider.solid = false` set later by a mechanic (fading platforms). Coins are one `InstancedMesh` per level: a coin record is
  `{ coin: true, pos, taken, popT, i }` (no `mesh`; the pop animation runs in `world.update`); coins added after build are picked
  up automatically; `L.remove(coin)` hides it. `L.rock(x, z, {kind:'low'})` returns a record and all low rocks become one
  `InstancedMesh` after build. GLB trees (`L.tree` kinds `oak|pine|palm`) are batched per kind into InstancedMeshes (one per model
  primitive, shared material, cast + receive shadows) once `assets/models/tree_<kind>.glb` loads — never one prop per tree;
  `L.tree` returns a placeholder Group with `.collider`. `L.tree` **always consumes two `rnd()` values** (variant, rotation) for
  every kind, so swapping a kind never reshuffles a seeded build; `opts.height` (metres) overrides `TREE_HEIGHT[kind] × scale`
  (5.5 / 6 / 5 m), `opts.r / y0 / y1` are absolute collider overrides. `world.whenReady()` (= `__game.test.ready()`) resolves when
  every async prop / tree batch has loaded (`report().pending` counts them). Every walkable collider carries `c.steps`
  (`'grass'|'stone'|'sand'|'snow'`, the footstep sample set) derived from its top material role (`ground`→grass, `stone|cliff`→
  stone, `accent`→sand, `snow*` textures→snow, surface `ice`→snow), overridable per role with `theme.materials.<role>.steps` or
  per collider with `opts.steps`. `L.island` takes `beachSolid: false` for a decorative ring.
* **§7 hooks (impl note)** — `physics.setGround(c|null)` is exported (fires `onLeave`/`onLand`; `test.teleport` uses it, so
  leaving a collider by teleport also fires `onLeave`). `physics.isSolid(c)`. `player.flying` (`physics.launch(vel, { flying:
  true })`): plain `GRAV` (no FALL_MULT), no air control, no jump cut, cleared on landing / respawn / reset. `sim.waterKind`
  (`'water'|'lava'` from `theme.water.kind`): below `sim.waterY` in lava = `physics.hazard('lava')` (respawns even while
  invulnerable); `sim.killY = theme.killY ?? -60` → `physics.fellInVoid()` (toast "Düştün!", bus `'void'`).
* **§8 test hooks (impl note)** — `__game.level` (loaded module, `tools/smoke.mjs` reads `.testPath`), `__game.levels` lists only
  loadable campaign levels (`PLAYABLE`; comingSoon placeholders are excluded so `smoke --all` does not try them),
  `__game.allLevels[i].comingSoon`, `__game.test.ready()`. `__game.loadLevel(id)` throws for a comingSoon id.
  `tools/flow-check.mjs` additionally runs the dispose regression: `loadLevel(level)` three times → `scene.children`,
  `renderer.info.memory.geometries`, colliders/coins/enemies must stay constant (they do: 74 / 93 / 59 for kristal). smoke.mjs's
  `testPath` rule in practice: waypoints must sit on *fixed* ground (never on a mover: they are probed after ~4 s of play) and a
  `'jump'` hop must be ≤ 6.5 m across / ≤ 2.5 m up — kristal's path was rewritten to 31 such waypoints.
* **§12 levels (impl note)** — `src/levels/index.js` exports `LEVELS` (campaign incl. comingSoon placeholders), `PLAYABLE`,
  `isPlayable(lv)`, `levelById`, `nextLevel(id)` (null when the next island is not built → the win screen hides "Sonraki Ada").
  Placeholders `kumsal.js, volkan.js, buz.js, orman.js, gok.js, kale.js` exist (orders 2–7, Turkish names/subtitles): replace the
  file in place, keep `id` and `order`. Level select renders them as `li.level-card[data-soon="1"][data-locked="1"]` with
  "Yakında" in `.lv-best`; clicking one toasts "Yakında!".
* **§11 audio (impl note)** — `audio.step(set)` plays `step_<set>_N` round-robin (`sand` = `step_sand_1..3` + `step_sand_dry`),
  decoded lazily on first use (a soft synth tick plays until then); `player.js` calls it at each foot contact while running
  (speed > 3 m/s) with `player.ground.steps`. `audio.release(keys)` drops decoded non-core buffers; `world.unload` releases the
  theme's ambience + music keys (§11 "released on unload"). `audio.playLoop(key, { crossfade })` re-triggers the buffer
  `crossfade` seconds before its end with overlapping fades instead of a hard loop (music uses 0.5 s; ambience loops stay
  hard loops); loop entries are `{ key, gain, stop() }`. Core keys without a sample in `assets/sfx/manifest.json` (`land`,
  `lava`, `switch`, `crumble`, `key`, `door`, `cannon`, `wind`) play their synth version.
* **Camera (impl note)** — `cam.suggestYaw` is implemented in `camera.js` (eases toward it at rate 2.5/s once 1.5 s passed
  since the last mouse / Q,E / gamepad look; `cameraApi.reset` clears it on level load). Gamepad input only counts as a look
  when the stick is deflected.
* **Enemies (impl note)** — the slime's face (eyes, pupils, brows) is one merged geometry with two material groups (slime =
  4 draw calls instead of 8); entity contract unchanged.
* **Level 1 (impl note)** — `src/levels/kristal.js` reproduces the committed `index.html` 1:1 for every collider, coin,
  crystal, checkpoint, portal and enemy (same coordinates, same seeded placement order; the two bounce pads, the 10 spiral
  steps, 65 coins, 11 enemies). Trees are GLB oaks (every 4th a pine) at the original 22 seeded positions, 4–6 m tall, with the
  original trunk colliders (`r = 0.45·s`, `y 0…2.2·s`), plus palms on islets B and C. The only addition is a sandy shallows ring
  (`L.cyl` r 35 at y −1.12, `noSolid`) that sits below the water death line, so falling off the island still means a splash.
* **Checks run for this change** — `node --check` on every file in `src/` and `tools/flow-check.mjs`; `node tools/smoke.mjs
  --all` (kristal: 0 problems, testPath 31 waypoints / 0 failed); `node tools/smoke.mjs --level=test` (0 problems, 5 waypoints);
  `node tools/flow-check.mjs` (19/19 steps incl. dispose); a scripted §3/§5/§6/§7/§8/§9/§11 contract check on the `test`
  level (ice acceleration, lava hazard, onLand/onStand/onLeave/onBonk, controlLock, extVel, launch, spike, trigger
  enter/stay/exit/once + signal, dynamic, L.remove, sign, custom enemy + stomp, instanced coin pickup, lights, scatter,
  island, save fallback, lazy audio, crossfade loop) — 49/49; §12 runtime checks (flying, lava water, void killY,
  `solid=false`, suggestYaw, Yakında cards, `?quality=medium`, `?touch=1&debug=1`).

## 14. Implementation notes (impl note) — review fixes after the refactor

* **§7 lava surface** — `landOn()` on a `surface: 'lava'` collider now behaves like lava water: `physics.hazard('lava')` when it
  can fire, otherwise (`player.invuln > 0`, i.e. just hurt or just respawned) `physics.respawn()`. The player is never left
  un-grounded on a lava top. `src/levels/_test.js` has a standalone lava box over the sea at (34, 0.5, 0) for this case.
* **§12 `collider.solid = false`** — `world.registerCollider` tags every collider mesh with `mesh.userData.collider`; the
  camera pull-in, the blob shadow / `player.groundY` and `__game.test.groundBelow` raycast against `physics.probeMeshes()`
  (= `solidMeshes` minus meshes whose collider is non-solid), so a fading platform drops out of every probe at once.
* **§6 `L.tree`** — always draws two `rnd()` values even when `opts.rotY` is given (the drawn rotation is simply unused).
* **§6 `L.remove(collider)`** — uses `physics.setGround(null)` when the removed collider is the ground (fires `onLeave`), and
  removes the owning tree/prop `Group` when the collider's mesh is a child of one (trunk, loaded GLB) so the visual goes with
  the collider. GLB-batched trees (`oak|pine|palm`) have no mesh of their own: `L.remove` only drops their collider.
* **§13 Yakında cards** — `li.level-card[data-soon="1"]` clicks reach `onSelect(id)` (main.js toasts "Yakında!"); other
  locked cards are still ignored by the click handler.
* **§3 touch detection** — a `Macintosh` UA with `navigator.maxTouchPoints > 1` is iPadOS Safari → `core.flags.touch = true`
  and the medium/low tier; Windows/X11 touch laptops stay desktop.
* **§3 exposure** — `renderer.toneMappingExposure = 1.12` (monolith: 1.05) is deliberate: re-tuned together with
  `DEFAULT_THEME.environmentIntensity = 0.35` for the HDRI/PBR pipeline. Do not "fix" it back.
* **§5 sun** — see the §5 impl note: the directional light follows `theme.sun.dir`.
* **§10 budget** — see the §10 impl note: ≤ 350 whole-frame calls on high.
* **§8 raycast probes** — `world.load()` calls `scene.updateMatrixWorld(true)` before the camera snap, movers refresh their
  `matrixWorld` inside `world.step()`, and `__game.test.tick()` refreshes the scene after `world.update()`: `groundBelow`, the
  blob shadow / ground-pound gate and the camera pull-in are correct without a rendered frame (test ticks never render).
* **§6 crystal count** — a level whose built crystal count differs from `level.crystals` logs `console.error` (so
  `tools/smoke.mjs` fails) in addition to `report().errors`.
* **Camera respawn (deliberate)** — `respawn` snaps the follow target and the pull-in distance (`cameraApi.snap()`); the
  monolith let the target ease up from the feet. Hidden by the 260 ms fade; keep the snap (no camera inside geometry after a
  far checkpoint).
* **§7 death timing** — water / lava / void checks run inside `physics.stepPlayer` (per 120 Hz sub-step), so a death can
  trigger up to 1/120 s earlier than the monolith's once-per-frame check.
* **Clouds** — every cloud `InstancedMesh` batch is flagged `needsUpdate` after the drift (a second `L.clouds()` call used to freeze).
