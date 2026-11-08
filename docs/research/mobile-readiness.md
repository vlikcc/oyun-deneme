# Mobile & engineering readiness audit — Pıtır'ın Kristal Adası

Audited file: `index.html` (1237 lines, three.js r186.1 via import map). Date: 2026-11-08.
Method: full read of the file; three.js r186.1 files fetched from jsDelivr and their `import` lines grepped (Appendix A); the current build measured in headless Chrome with puppeteer-core 24 at a phone-landscape viewport (844×390 @3x) to count GL draw calls per frame and take HUD screenshots (Appendix B). Nothing in the project was modified except creating this document.

All line numbers below refer to the *current* `index.html`. When the monolith is split into `src/` modules, carry the fixes with the code.

---

## 0. TL;DR — ordered by what blocks a Capacitor build

| Prio | Problem | Where | Fix (short) |
|---|---|---|---|
| P0 | three.js comes from a CDN through an import map (`cdn.jsdelivr.net`). Offline = white screen. Import maps need iOS ≥ 16.4 (WKWebView uses the system WebKit). | 76–81, 84–86 | Vendor the verified file list (§1.1) under `vendor/three/` **and** bundle with esbuild into one `dist/game.js` (no import map at all). |
| P0 | No touch input: movement is keyboard-only, camera is pointer-lock / mouse-drag only, zoom is `wheel`. On a phone the player cannot move. | 661–673, 675–691, 694–718 | Touch layer in §2 (virtual stick + right-half orbit + jump/pound/pause buttons), merged into `readInput()`. |
| P0 | Start/pause/win cards do not fit a landscape phone (card is taller than 390 px and `overflow: hidden` on `body` kills scrolling) — the Başla! button is cut off (screenshot, Appendix B). | 10, 19–21, 31 | `.overlay { overflow:auto }`, `.card { max-height:100% }`, `@media (max-height:480px)` type scale. |
| P1 | HUD/hint ignore notch & home-indicator safe areas; fixed px sizes; `viewport-fit=cover` missing; mouse-only hint text; `:hover` sticks on touch. | 5, 12–18, 26–28, 44 | `viewport-fit=cover` + `env(safe-area-inset-*)`, `clamp()`/`vmin` sizes, `@media (hover:hover)`, pointer-type-aware hint. |
| P1 | ~1000–1200 GL draw calls per frame (measured) = 3 scene passes (shadow map + planar-reflection Water + main). CPU-bound on Android WebView; GPU-bound at DPR 1.5 with 4× MSAA + 2048² PCF shadows on low-end. | 92–96, 124, 246–251, 316–339, 344–366, 526–547 | Quality tiers (§1.10) + instancing/merging (§1.11) + cheap water fallback. Target ≤ 500 draws/frame total on *medium*, ≤ 250 on *low*. |
| P1 | Audio: works on first tap, but no recovery from iOS `interrupted` state, no suspend on background for the web build, ambient loops decoded to ~52 MB of PCM, music scheduler bursts after tab throttling. | 561–571, 577–587, 638–655, 1173, 1183 | §1.3. |
| P1 | No lifecycle handling: backgrounding does not pause (web), `pointercancel` not handled, WebGL context loss not handled. | 673, 1180–1184, 1200 | `visibilitychange → setPaused(true)`, context-lost handlers, release all touches. |
| P2 | No loading screen: textures/HDR/13 mp3s stream in while the menu already renders; PMREM + 37 shader programs compile on the first frames → 1–2 s hitch on phones. | 112–117, 153–180, 577–587, 1197–1200 | `LoadingManager` + `renderer.compileAsync` + explicit `PMREMGenerator` behind a loading bar. |
| P2 | Emoji HUD icons (`🪙` is Unicode 13; missing on Android < 11 / iOS < 14.2; renders grey in some WebViews — see screenshot). | 38–40, 1027, 1057 | Inline SVG icons; keep emoji only inside toasts. |
| P2 | Save data does not exist yet (`window.__game` is a debug hook only). | 1192 | §4 (`pitir.save.v1`, versioned, storage adapter that can swap to `@capacitor/preferences`). |

---

## 1. What breaks or feels wrong inside a Capacitor WebView (iOS WKWebView / Android System WebView)

### 1.1 Module loading: import map + CDN → vendor three.js r186.1 locally

Current (lines 76–81):

```html
<script type="importmap">
{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js",
               "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/" } }
</script>
```

Problems:
1. **Network dependency** — Capacitor serves the app from the bundle (`capacitor://localhost` on iOS, `https://localhost` on Android); the CDN fetch needs connectivity, and App Review will test in airplane mode. First launch on a bad connection = blank sky-blue page with no error UI.
2. **Import-map support** — WKWebView uses the OS WebKit; import maps shipped in Safari/WebKit 16.4 (March 2023). Capacitor's floor is iOS 14/15, so iOS 14–16.3 devices load nothing (the module script fails to resolve `three`). Android System WebView ≥ 89 is fine.
3. **No integrity/version pinning offline** — jsDelivr is fine, but a store build must be reproducible.

**Verified file list to vendor (fetched from `https://cdn.jsdelivr.net/npm/three@0.186.1/...` and import lines grepped — see Appendix A):**

| File (relative to the three package) | Size | Imports (exact) | Needed by |
|---|---|---|---|
| `build/three.module.js` | 663 KB | `import {…} from './three.core.js'` (line 6) and `export {…} from './three.core.js'` (line 7) | everything |
| `build/three.core.js` | 1 458 KB | *none* (self-contained) | `three.module.js` |
| `examples/jsm/objects/Water.js` | 13 KB | only `'three'` | sea (line 85) |
| `examples/jsm/loaders/HDRLoader.js` | 12 KB | only `'three'` | sky (line 86). (`RGBELoader.js` is now a 268-byte alias that re-exports `HDRLoader` — not needed.) |
| `examples/jsm/loaders/GLTFLoader.js` | 118 KB | `'three'`, `'../utils/BufferGeometryUtils.js'` (line 68, `toTrianglesDrawMode`), **`'../utils/SkeletonUtils.js'` (line 69, `clone`)** ← the plan's list missed this one | Poly Haven props |
| `examples/jsm/utils/BufferGeometryUtils.js` | 38 KB | only `'three'` | GLTFLoader + our own `mergeGeometries` |
| `examples/jsm/utils/SkeletonUtils.js` | 12 KB | only `'three'` | GLTFLoader |

Optional, only if we ever use compressed glTF/textures (Poly Haven GLBs are plain glTF + JPG/PNG, so **not** needed now):

| File | Size | Imports | When |
|---|---|---|---|
| `examples/jsm/libs/meshopt_decoder.module.js` | 29 KB | none | if we run `gltfpack`/`gltf-transform meshopt` on props (recommended over Draco: no wasm fetch, single file) |
| `examples/jsm/loaders/DRACOLoader.js` + `examples/jsm/libs/draco/gltf/{draco_decoder.wasm 192 KB, draco_wasm_wrapper.js 58 KB, draco_decoder.js 512 KB}` | — | `'three'`; spawns a `Worker` from `setDecoderPath()` | Draco-compressed glTF only |
| `examples/jsm/loaders/KTX2Loader.js` + `utils/WorkerPool.js`, `libs/ktx-parse.module.js`, `libs/zstddec.module.js`, `math/ColorSpaces.js`, `libs/basis/{basis_transcoder.js 58 KB, basis_transcoder.wasm 527 KB}` | — | all of those (lines 48–104 of KTX2Loader.js); spawns Workers | KTX2/Basis compressed textures (the real fix for GPU texture memory, §1.10) |

Minified alternative: `build/three.module.min.js` (393 KB) + `build/three.core.min.js` (416 KB) — same two-file split.

**Recommendation:** `npm i three@0.186.1` inside `tools/` (it already has `package.json`), and build with esbuild:

```sh
# tools/package.json  "scripts": { "build": "esbuild ../src/main.js --bundle --format=esm --minify --sourcemap --target=es2020 --outfile=../dist/game.js" }
```

- Tree-shaken bundle ≈ 650–750 KB minified (three core + Water + HDRLoader + GLTFLoader), ~170 KB gzipped on the web.
- `index.html` then has `<script type="module" src="dist/game.js"></script>` and **no import map** → works on iOS 14+ and offline.
- Keep `vendor/three/` as the unbundled fallback for `python3 -m http.server` dev (the import map can point at `./vendor/three/build/three.module.js` and `./vendor/three/examples/jsm/` during development — relative URLs are allowed in import maps).
- Workers (Draco/KTX2) need their scripts served from the app origin; Capacitor serves them, but `setDecoderPath('vendor/three/examples/jsm/libs/draco/gltf/')` must be a relative path, not a CDN.

### 1.2 Input model: pointer lock, mouse, keyboard, hover

| Line(s) | Current behaviour | On a phone / WebView |
|---|---|---|
| 677–681 `canvas.addEventListener('mousedown', …)` → `canvas.requestPointerLock?.()?.catch?.(…)` | pointer lock on click, `dragging = true` | iOS WebKit has **no Pointer Lock API** (`requestPointerLock` is `undefined`; the `?.` chain makes it a no-op — good, no crash). Android WebView has the API but it rejects/does nothing useful. A tap generates *compatibility* `mousedown/mouseup` only — `mousemove` with `movementX` never fires during a finger drag, so the camera cannot be orbited at all. |
| 683–689 `mousemove` → `cam.yaw/pitch` from `movementX/Y` | works with lock or drag | `movementX/Y` are 0/undefined for synthesized mouse events. |
| 690 `wheel` → `cam.dist` | zoom | no touch equivalent (add pinch, or drop zoom on touch — a fixed 10 m works fine for kids). |
| 691 `pointerlockchange` toggles `#hint` opacity | hides hint when locked | never fires on touch → the hint at line 44 ("Kamerayı döndürmek için ekrana tıkla · Esc fareyi bırakır") stays on screen forever and is wrong. |
| 663–673 keyboard (`keys` Set, `jumpPressed`, `poundPressed`, M/P toggles) | all movement | no physical keyboard. On-screen keyboard never appears (no focused input) — correct, but the game is unplayable. |
| 694–718 `readInput()` | returns `{ix, iy, look}`; **line 703 overwrites `jumpHeld` every frame** (`jumpHeld = keys.has('Space')`), gamepad ORs into it at 713 | the touch layer must merge *after* line 703 (`jumpHeld ||= touch.jumpHeld`), or `readInput()` is refactored into source-merge (§2.3). Gamepads keep working on iOS 13+/Android (Bluetooth Xbox/PS/MFi) — keep that path. |
| 1178 `startGame()` → `requestPointerLock` | — | harmless no-op; but on desktop touch-screen laptops it will lock the pointer when the user tapped — only request lock when `pointerType === 'mouse'`. |
| 26–28 `button.big:hover { transform: translateY(-2px) }` | hover lift | **sticky hover** on touch: after a tap the button stays "lifted" until another touch elsewhere. Wrap in `@media (hover: hover) and (pointer: fine)`. |
| 51–57 start card lists `W A S D`, `Boşluk`, `Shift`, `Fare / Q E`, `M · P` | keyboard tutorial | wrong on touch: render a second `.keys` block with touch pictograms (stick / A button / B button) and pick with `matchMedia('(pointer: coarse)')`. |
| 10 `user-select: none` | good | add `-webkit-touch-callout: none` (long-press callout on iOS) and `-webkit-tap-highlight-color: transparent` (grey flash on Android), and `canvas.addEventListener('contextmenu', e => e.preventDefault())` (long-press context menu). |
| 673 `blur → keys.clear()` | releases keys | add the same for `pointercancel` / `visibilitychange` (touches are cancelled by incoming calls, Control Center swipes, app switch). |

### 1.3 Audio: autoplay/unlock rules, iOS quirks, memory

- **Unlock is already correct**: `initAudio()` (562–571) creates the `AudioContext` inside `startGame()` (1173) which runs from a real `click` on `#startBtn` (1185) and immediately calls `ac.resume()`. A tap produces a `click`, so this satisfies both Chrome's and WebKit's gesture requirement. Keep creating the context *inside the gesture handler* — do not move it to module scope when refactoring.
- **iOS `interrupted` state** (WebKit-specific `ac.state === 'interrupted'` after a phone call, Siri, app switch, or the Control-Center play/pause): `resume()` must again be called from a user gesture. Add a one-shot `pointerdown`/`keydown` listener installed on `visibilitychange → visible` that calls `ac.resume()` when `ac.state !== 'running'`.
- **Background**: `setPaused(true)` already suspends the context (1183), but nothing calls it on `visibilitychange`. The web/PWA build keeps the `setInterval(…,100)` music scheduler (646–654) alive while hidden; browsers throttle it to ≥ 1 s so `next` falls behind `ac.currentTime`, and on return the `while` loop schedules every missed note with a negative `delay` → a chord burst. Fix: `document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') setPaused(true); })` and clamp `next = Math.max(next, ac.currentTime)` at the top of the interval callback.
- **Silent switch (iOS)**: Web Audio in WKWebView follows the ring/silent switch by default (ambient session). For a kids' game that is the expected behaviour; if the product wants sound regardless, the app must set `AVAudioSession` category `.playback` natively (AppDelegate) — verify on a device, WebKit sometimes resets the category.
- **Decoded sample memory** (577–587): `decodeAudioData` expands to float32 PCM at the context sample rate (48 kHz on iOS). The two ambient loops are **stereo 32 kHz mp3, 75 s and 60 s** → 75×48000×2×4 B ≈ 28.8 MB + 60×48000×2×4 B ≈ 23 MB ≈ **52 MB of RAM** just for ambience, decoded on the main thread at start (~0.5–1 s of decode on a mid phone). Options: (a) make both loops **mono and ≤ 30 s** (→ ~6 MB total, seamless if trimmed at zero crossings); (b) stream them through `<audio loop>` + `ac.createMediaElementSource()` (no PCM copy, but iOS treats media elements as "media playback" — shows in Control Center, pauses other music); (a) is the simplest and safest.
- The 11 one-shot samples are tiny (4–96 KB) — fine. Keep the synth fallbacks (616–629); they are also what headless tests hear.
- `fetch('assets/sfx/manifest.json')` (579) with relative URLs works under Capacitor (served from the bundle). Do not switch to `file://` loading — ES modules and `fetch` are blocked on `file://` origins; Capacitor's local server exists precisely for this.
- Haptics are the mobile replacement for part of the game-feel layer: `navigator.vibrate(8)` (Android web) / `@capacitor/haptics` `impact({style:'light'})` on jump-land, `medium` on stomp/bounce, `heavy` on pound/hurt — call from `landOn` (781), `killEnemy` (886), `onPoundLand` (804), `hurtPlayer` (963).

### 1.4 Viewport, safe areas, CSS

| Line | Current | Problem on mobile | Fix |
|---|---|---|---|
| 5 | `<meta name="viewport" content="width=device-width, initial-scale=1">` | no `viewport-fit=cover` → `env(safe-area-inset-*)` are all 0 and the WebView letterboxes around the notch; double-tap/pinch zoom are possible on the HUD. | `content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no"` (WKWebView honours `user-scalable=no`; Safari ignores it, so also set `touch-action: none` on the canvas and the touch layer). |
| 10 | `html, body { height:100%; overflow:hidden }` | fine, but rubber-band scrolling still happens in WKWebView on the overlays. | add `overscroll-behavior: none; position: fixed; inset: 0;` to `body`; in `capacitor.config` set `ios.scrollEnabled: false`. |
| 11 | `canvas#c { width:100vw; height:100vh }` | harmless: `renderer.setSize()` (94, 133) writes inline `px` sizes that override it. Keep `100%`/`100dvh` only for completeness — the mobile-Safari `100vh` bug does not apply because the WebGL buffer is sized from `innerWidth/innerHeight`. | — |
| 12, 15 | `#hud { top:14px; left:16px }`, `#timer { top:14px; right:16px }` | in landscape the notch/Dynamic Island covers the left or right 47–59 px; the home indicator covers the bottom 21 px. | `top: calc(env(safe-area-inset-top,0px) + 10px); left: calc(env(safe-area-inset-left,0px) + 12px)` etc. (CSS in §2.5). |
| 13, 16, 31 | `.pill` 20 px, `#toast` 34 px `nowrap`, one `@media (max-width:600px)` | a landscape phone is 844–932 px *wide* and 390–430 px *tall*, so the 600 px breakpoint never triggers; toast text can exceed the width. | size with `clamp()` and `vmin` (height-driven): `.pill { font-size: clamp(13px, 2.4vmin + 5px, 20px) }`, `#toast { font-size: clamp(18px, 5vmin, 34px); white-space: normal; max-width: 90vw }`. |
| 18, 44 | `#hint` bottom 14 px, mouse text | under the home indicator; wrong text. | `bottom: calc(env(safe-area-inset-bottom,0px) + 10px)`; text by pointer type ("Sol: yürü · Sağ: kamerayı çevir"). Hide it after the first successful drag. |
| 19–21 | `.overlay` flex-centred, `.card { padding:28px 34px; max-width:560px }` | at 390 px tall the card overflows (screenshot: title and Başla! clipped) and cannot scroll. | `.overlay { overflow:auto; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left) } .card { max-height: 100%; overflow:auto }` + `@media (max-height:480px) { .card h1{font-size:26px} .card p{font-size:14px;margin:4px 0 8px} .keys{font-size:13px;gap:3px 10px} button.big{font-size:18px;padding:8px 26px} }`. |
| 38–40 | `❤❤❤`, `🪙`, `💎` text | font-dependent glyphs; `🪙` (U+1FA99) is absent on Android < 11 and iOS < 14.2, renders as a grey coin in some WebViews. | inline SVG icons (`<svg class="ico">`) sized in `em`. |
| 59, 65, 72 | `button.big` relies on `click` | fine (no 300 ms delay because `width=device-width` is set), but add `touch-action: manipulation` to buttons anyway. | — |

### 1.5 Resize, orientation, landscape lock

- Line 130–134 only listens to `resize`. On iOS the `resize` after a rotation fires *before* `innerWidth/innerHeight` settle in some versions; listen to `orientationchange` + `visualViewport.resize` and debounce 50 ms, then `setSize(innerWidth, innerHeight)` and `camera.aspect`.
- The level is designed for a wide view; **lock to landscape**: iOS `Info.plist` `UISupportedInterfaceOrientations` = landscape-left/right only (and the iPad variant); Android `<activity android:screenOrientation="sensorLandscape">`; or at runtime `@capacitor/screen-orientation` `lock({ type: 'landscape' })`. For the web/PWA build `screen.orientation.lock('landscape')` only works in fullscreen on Android and never on iOS → show a "Telefonu yan çevir" overlay with `@media (orientation: portrait)` and add `"orientation": "landscape", "display": "fullscreen"` to the web manifest.
- Hide the status bar (`@capacitor/status-bar` `hide()`) and use Android immersive mode; with the bars hidden the safe-area insets shrink to the notch only.
- Keep the screen awake during gamepad play (`@capacitor-community/keep-awake`); touch play keeps it awake by itself.

### 1.6 devicePixelRatio and resolution policy

Line 93: `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))`. iPhones are DPR 3, flagship Androids 2.6–3.5, iPads 2 — so the cap already halves the fill cost, but a 12.9" iPad at 1366×1024 CSS × 1.5 = **3.1 MP** with 4× MSAA and PBR is too much for an A12. Use a **pixel budget** instead of a fixed cap and apply it on resize:

```js
const BUDGET = { high: 4.0e6, medium: 1.2e6, low: 0.6e6 }[tier];
const dpr = Math.min(devicePixelRatio, tier === 'high' ? 2 : 1.5, Math.sqrt(BUDGET / (innerWidth * innerHeight)));
renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight);
```

Examples: iPhone 15 landscape 852×393 → medium gives DPR 1.5 (0.75 MP); iPad 11" 1180×820 → DPR 1.11 (1.2 MP); a 720×360 CSS budget phone on low → DPR 1.0 → 0.26 MP. Keep the HUD at full DPR (it is DOM).

### 1.7 localStorage availability

- Available in WKWebView and Android WebView, persistent across launches, **scoped to the origin**: iOS `capacitor://localhost`, Android `https://localhost` (Capacitor ≥ 5 default `androidScheme: 'https'`; older projects used `http`). Changing the scheme/hostname later wipes every player's save — pin `server.androidScheme` / `server.iosScheme` in `capacitor.config.*` and never change them after release.
- Private browsing (web build) and "Block all cookies" (Safari) make `localStorage` access **throw** — every read/write must be in `try/catch` with an in-memory fallback (§4.4).
- iOS may evict WebKit storage under disk pressure and "Offload App" deletes it; for the store builds mirror the save into `@capacitor/preferences` (UserDefaults/SharedPreferences, backed up by iCloud/Google) through the storage adapter in §4.4. Quota is irrelevant (the save is < 10 KB).
- The current code stores nothing (1192 is only a debug hook); `faint()` (972) and `win()` (1054) are the two places that will write.

### 1.8 Lifecycle & robustness

- `THREE.Timer.connect(document)` (1193–1194) already resets the delta on `visibilitychange` (verified in `three.core.js` lines 51151–51166 / 51288) and the loop clamps `dt ≤ 0.1` (1202) — no physics explosion after backgrounding. Still pause the game and audio on hidden (§1.3).
- **WebGL context loss** (Android under memory pressure, iOS when the WebView is backgrounded for long): add `canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); setPaused(true); })` and on `webglcontextrestored` re-upload is handled by three.js (`WebGLRenderer.onContextRestore`), but the Water render target and the HDR → PMREM must be recreated; test with `renderer.forceContextLoss()`.
- `requestPointerLock` returns a Promise in Chromium and `undefined` in older WebKit — the `?.catch?.()` chain at 679/1178 handles both; keep it.
- Memory limits: the iOS web-content process is killed around 1–1.5 GB on recent devices (far less on iPhone 8/X class); Android WebView shares the app's limit (commonly 512 MB on 3–4 GB phones). Budget: **≤ 300 MB total** (JS heap 49 MB measured + GPU ≈ 190 MB today, §1.10 table) — the texture set is the lever.
- `performance.memory` (Chrome only) and `navigator.deviceMemory` (not on iOS) are fine as *optional* telemetry; never branch on them exclusively.

### 1.9 Asset/bundle size for the store builds

Today: `assets/` = 18 MB (tex 11 MB as 1k JPG ×19, HDR 5.2 MB, sfx 1.8 MB) + three.js ≈ 2.3 MB unbundled. Fine for stores (< 100 MB) but each Poly Haven prop at 1k adds 2–8 MB. Budget the `www/` folder at **≤ 60 MB**; rules: 1k max (512 for small props), JPG q≈80 or WebP (glTF `EXT_texture_webp` is supported by GLTFLoader and iOS 14+/Android), `gltf-transform resize --width 1024`, `meshopt` compression (29 KB decoder) instead of Draco, HDR at 2k for the background on high/medium but **1k (≈1.3 MB) is visually identical as `scene.environment`**.

### 1.10 Performance budget and quality tiers

**Measured (headless Chrome 844×390 @3x, SwiftShader — counts are exact, timings are not):**

| State | GL draws / frame | `bindFramebuffer` / frame | programs linked | GL textures |
|---|---|---|---|---|
| menu (idle orbit) | 1034 | 4 | 37 | 33 |
| play, standing at spawn | 1206 | 4 | 37 | 33 |
| play, running toward the tower | 930 | 4 | 37 | 33 |

Where the ~1200 come from (per frame): **three full scene passes** —
1. shadow-map depth pass (`sun.castShadow`, 123–127; every `shade()`d mesh and all 70 coins cast, 348) ≈ 250–300 draws;
2. planar reflection pass inside `Water.onBeforeRender` (`Water.js` 238–330: `renderer.render(scene, mirrorCamera)` at 512×512 half-float; it disables `shadowMap.autoUpdate` but still re-shades every object with full PBR) ≈ 400–480 draws;
3. main pass ≈ 480 draws: flowers 70 separate meshes (316–321), trees 24 × 3 meshes (296–315), clouds 14 × 4 (329–339), coins 70 (344–366), rocks 14 (322–327), slimes 8 × 8 meshes (482–496), spikies 3 × 15 (497–512), player ≈ 22 (441–473), checkpoints 5 × 3, crystals 5 × 2, portal 7, level solids ≈ 37 (241–285), water, blob, background.

Almost all of these draws are < 100 triangles, so the cost is **CPU per draw** (Android WebView/ANGLE ≈ 20–50 µs per draw → 1200 draws ≈ 25–60 ms; iOS WebKit ≈ 8–15 µs → 10–18 ms). Fragment cost is the second limiter: `MeshStandardMaterial` with `map + normalMap + ARM + PMREM env + multi-tap PCF` on the big island/beach at DPR 1.5.

GPU memory today (why low-end Android will struggle):

| Resource | Lines | Size |
|---|---|---|
| 18 PBR JPGs at 1024² → RGBA8 + mips | 153–180 | 18 × 5.6 MB ≈ **100 MB** |
| `waternormals.jpg` 1024² | 248 | 5.6 MB |
| HDR 2048×1024 RGBA16F equirect + PMREM | 112–117 | 16 MB + ~6 MB |
| shadow map 2048² (depth target + depth buffer) | 124 | ≈ 16–32 MB |
| Water render target 512² RGBA16F + depth | 246–247 | ≈ 3 MB |
| 4× MSAA back buffer at 0.75 MP (iPhone landscape, DPR 1.5) | 92–94 | ≈ 24 MB |
| **Total** | | **≈ 190 MB** |

**Tier parameters** (decide *before* `new WebGLRenderer` because `antialias` cannot change at runtime; everything else can be switched live at level load):

| Parameter | high (desktop, Apple-silicon iPad) | medium (iPhone XS+/iOS 17+, iPad 2019+, Snapdragon 8xx / Dimensity 9xxx, Pixel 6+) | low (everything else; auto-fallback target) |
|---|---|---|---|
| pixel budget / DPR cap | 4.0 MP / 2.0 | 1.2 MP / 1.5 | 0.6 MP / 1.0 |
| `antialias` (MSAA) | on | on | **off** |
| shadow map | 2048², `PCFSoftShadowMap`, frustum ±45 | 1024², `PCFShadowMap`, frustum ±32 (tighter = sharper) | **off** — `renderer.shadowMap.enabled=false`; the blob shadow (475, 1102–1113) stays as the depth cue |
| shadow casters | all `shade()`d meshes | level solids + trees + player + enemies (coins/flowers/clouds `castShadow=false`) | none |
| sea | `Water` 512² reflection, every frame | `Water` 256², reflection updated every 2nd frame; small objects (coins, flowers, particles, enemies) on `layer 2` so the mirror camera (default layer 1) skips them | **`cheapWater`** (below): no reflection pass, scrolling normal map + PMREM env reflections |
| texture resolution | 1k | 1k diffuse, 512 normal/ARM | 512 diffuse + 512 AO, **no normal maps on terrain** (drops the tangent-space work), `rock_face`/`stone` share one set |
| `texture.anisotropy` (158) | 8 | 4 | 1 (trilinear only) |
| HDR | 2k background + env | 1k background + env | gradient sky (101–109, already written) + 512×256 HDR for `scene.environment` only |
| tone mapping | ACES | ACES | ACES (cheap) |
| props | flowers 70, clouds 14, trees 24, rocks 14 (all instanced) | 50 / 10 / 24 / 14 | 24 / 6 / 14 / 8 |
| particle pool cap | 300 | 150 | 60 |
| fog (110) | 90 → 230 | 80 → 200 | 60 → 150 (+ `camera.far` 400 → 220) |
| target | 60 fps | 60 fps (30 fps on iPhone XS/11) | 30 fps |
| draw budget (main + shadow + reflection) | ≤ 900 | ≤ 500 | ≤ 250 |

`cheapWater` (≈ 40 lines, same look from a distance, no second scene render):

```js
function cheapWater() {
  const n = loadTex('waternormals.jpg', { rep: 1 / 12 });
  const m = new THREE.MeshStandardMaterial({ color: 0x1c8fd1, roughness: 0.12, metalness: 0, normalMap: n,
    normalScale: new THREE.Vector2(0.6, 0.6), transparent: true, opacity: 0.94, envMapIntensity: 1.3, fog: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), m);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = -1.2; mesh.receiveShadow = false;
  mesh.userData.update = (dt) => { n.offset.x += dt * 0.012; n.offset.y += dt * 0.008; };   // call from the loop instead of line 1231
  return mesh;
}
```

**Tier detection** (`src/quality.js`): explicit `?quality=` or saved setting wins; otherwise `high` when not mobile; on iOS the GPU string is always "Apple GPU", so use the OS version from the UA (iOS ≥ 17 implies A12 or newer → `medium`, older → `low`); on Android parse `WEBGL_debug_renderer_info` (`Adreno (TM) 6[5-9]x/7xx`, `Mali-G7x/G8x/G9x`, `Immortalis`, `Xclipse` + `navigator.deviceMemory ≥ 4` → `medium`, else `low`). Then a **runtime probe**: average `dt` over the first 180 frames of play; > 22 ms → step down one tier at the next level load and remember it in `settings.qualityAuto`; < 9 ms for 600 frames on `low` → step up. Show the tier in the settings card so testers can report it.

### 1.11 Draw-call reductions (engine work, independent of tiers)

1. **Instancing**: flowers (316–321) → one `InstancedMesh` with `instanceColor` (70 → 1); coins (344–366) → one `InstancedMesh`, spin by rebuilding 70 matrices per frame (cheap) or rotate the whole instanced mesh's geometry by a uniform; clouds (329–339) → one instanced icosahedron (56 → 1); rocks (14 → 1); tree trunks and canopies (72 → 2–3). This alone removes ≈ 250 draws from *each* of the three passes.
2. **Static merge**: `BufferGeometryUtils.mergeGeometries` (already vendored for GLTFLoader) for the level solids that share the same material set (spiral steps 279–282, floating stones 261/271) — `addBox` uses a 6-material array (209), so merge per material group or switch to a single material with a vertex-colour/`uv2` "top vs side" mask. Keep colliders as they are (they are data, not meshes).
3. **Enemies**: build each slime as 2 meshes (body+base merged, face merged) instead of 8 (482–496); merge the 12 spike cones into the spiky core (497–512) → 3 meshes instead of 15.
4. **Particles** (526–547): the current `burst()` allocates a `MeshBasicMaterial` per particle and disposes it (541) — that is a GC spike and a draw per particle. Replace with a pooled `InstancedMesh(partGeo, basicMat, 300)` with `instanceColor`; hide dead instances by scaling to 0.
5. **Shadow casters**: `coin.castShadow = true` (348) × 70 and flowers add ~100 depth draws for no visible gain; cast only from solids/trees/player/enemies/crystals.
6. **Reflection**: put coins, flowers, particles, enemies, clouds on `layer 2` and `camera.layers.enable(2)` on the main camera — `Water.js` creates its `mirrorCamera` with the default layer mask, so they are skipped automatically; wrap `water.onBeforeRender` to run every other frame on *medium*.
7. **Startup hitches**: HDR parse (`HDRLoader` decodes RGBE → half-float in JS on the main thread, 2 M pixels ≈ 100–200 ms on a phone), implicit PMREM generation on the first render after `scene.environment` is set (`three.module.js` ~3877–3891), and 37 program links (iOS compiles synchronously, 5–30 ms each). Do all of it behind a loading screen: `const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromEquirectangular(hdr).texture;` then `await renderer.compileAsync(scene, camera)` before enabling the Başla! button.

---

## 2. Touch-control design (fits `readInput()` / `jumpPressed` / `jumpHeld` / `poundPressed`)

### 2.1 Layout (landscape)

```
┌──────────────────────────────────────────────────────────────────┐
│ [❤❤❤] [🪙 12] [💎 1/5]                              [⏸] [0:42] │  ← HUD, inset by safe-area
│                                                                  │
│      LEFT HALF                          RIGHT HALF               │
│  pointerdown anywhere = joystick        drag anywhere = orbit    │
│  origin (dynamic), ring follows         camera (yaw/pitch)       │
│  the finger if it leaves the ring                                │
│                                                       ( B )      │  ← pound, 0.72× jump size
│        ◯ ring (shown while touching)                   ( A )     │  ← jump, big, thumb reach
│                                                                  │
│  "Sol: yürü · Sağ: kamerayı çevir"  (hint, fades after 1st use) │
└──────────────────────────────────────────────────────────────────┘
```

- Left/right split at `innerWidth * 0.5`; the buttons sit *inside* the right half, so a finger that lands on a button is a button press, anywhere else on the right is a camera drag. A second finger can start on A while the first is dragging the camera (and vice versa) — every pointer id has exactly one role.
- Jump button diameter `clamp(56px, 17vmin, 96px)` (≈ 66 px on a 390 px-tall phone, 96 px on iPad) — comfortably above the 44 pt minimum; pound is 0.72× and sits up-left of jump (Mario-style B); pause is a 44×44 button next to the timer.
- Hold-to-jump-higher works because the button reports `jumpHeld` while the pointer is down; triple jump works because each `pointerdown` sets `jumpPressed` (consumed at 827); ground pound = tap B in the air (consumed at 836–839).
- Young children: an optional **"basit mod"** (setting) where a tap anywhere on the right half jumps and a drag (> 12 px slop) orbits; same code path, different gesture classifier.
- Camera sensitivity in **radians per CSS pixel**, scaled by width so a full-width swipe is ≈ 200°: `SENS = Math.PI * 1.1 / innerWidth`; pitch at 0.8× SENS, clamped to the existing `[-0.15, 1.25]` (686). No pinch-zoom in v1 (`cam.dist` stays 10); if added, two pointers on the right half → distance delta × 0.02 → `cam.dist` clamped `[5, 16]` like line 690.
- No 300 ms delay: Pointer Events + `touch-action: none` on the layer and `width=device-width` in the viewport; game buttons never use `click`. Menu buttons keep `click` (fine, no delay).

### 2.2 `src/input/touch.js` (≈ 110 lines, Pointer Events only)

```js
import { clamp } from '../util.js';
export function createTouch({ cam, onPause }) {
  const layer = document.querySelector('#touch');           // fixed, inset:0, touch-action:none, z-index below .overlay
  const ring  = layer.querySelector('#stick'), knob = ring.firstElementChild;
  const s = { ix: 0, iy: 0, jumpPressed: false, jumpHeld: false, poundPressed: false, active: false };
  const SENS = () => (Math.PI * 1.1) / innerWidth;
  const stick = { id: null, ox: 0, oy: 0, R: 64 };
  const look  = { id: null, x: 0, y: 0 };
  const held  = new Map();                                   // pointerId -> 'jump' | 'pound' | 'pause'

  layer.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;                   // desktop keeps the mouse-orbit code (683–689)
    e.preventDefault();                                      // suppresses compat mousedown → line 677 never fires for touch
    layer.setPointerCapture(e.pointerId);
    s.active = true; document.body.classList.add('touch');  // reveal the touch HUD on first touch (hybrid laptops)
    const b = e.target.closest('[data-btn]');
    if (b) { held.set(e.pointerId, b.dataset.btn); b.classList.add('down'); press(b.dataset.btn, true); return; }
    if (e.clientX < innerWidth * 0.5 && stick.id === null) {
      stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY;
      stick.R = clamp(innerHeight * 0.16, 48, 96);            // same number as the CSS --stick radius
      ring.style.transform = `translate(${stick.ox}px, ${stick.oy}px)`; ring.classList.add('show'); moveKnob(0, 0);
    } else if (look.id === null) { look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; }
  });

  layer.addEventListener('pointermove', (e) => {
    if (e.pointerId === stick.id) {
      let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy, d = Math.hypot(dx, dy);
      if (d > stick.R) {                                     // dynamic origin: drag the ring along with the finger
        const k = 1 - stick.R / d; stick.ox += dx * k; stick.oy += dy * k; dx = e.clientX - stick.ox; dy = e.clientY - stick.oy; d = stick.R;
        ring.style.transform = `translate(${stick.ox}px, ${stick.oy}px)`;
      }
      const dead = 0.12, n = clamp((d / stick.R - dead) / (1 - dead), 0, 1);  // 12 % dead zone, linear outside
      s.ix = d > 0 ? (dx / d) * n : 0; s.iy = d > 0 ? (-dy / d) * n : 0;      // screen-up = forward, like W
      moveKnob(dx, dy);
    } else if (e.pointerId === look.id) {
      const dx = e.clientX - look.x, dy = e.clientY - look.y; look.x = e.clientX; look.y = e.clientY;
      cam.yaw -= dx * SENS(); cam.pitch = clamp(cam.pitch + dy * SENS() * 0.8, -0.15, 1.25); cam.lastLook = performance.now();
    }
  });

  const end = (e) => {
    if (e.pointerId === stick.id) { stick.id = null; s.ix = s.iy = 0; ring.classList.remove('show'); }
    if (e.pointerId === look.id) look.id = null;
    const b = held.get(e.pointerId); if (b) { held.delete(e.pointerId); press(b, false); layer.querySelector(`[data-btn=${b}]`).classList.remove('down'); }
  };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) layer.addEventListener(ev, end);
  const releaseAll = () => { stick.id = look.id = null; held.clear(); s.ix = s.iy = 0; s.jumpHeld = false; ring.classList.remove('show'); };
  document.addEventListener('visibilitychange', () => document.hidden && releaseAll());
  addEventListener('blur', releaseAll);
  layer.addEventListener('contextmenu', (e) => e.preventDefault());

  function press(name, down) {
    if (name === 'jump')  { if (down) s.jumpPressed = true; s.jumpHeld = down; }
    if (name === 'pound' && down) s.poundPressed = true;
    if (name === 'pause' && down) onPause();
    if (down) navigator.vibrate?.(6);
  }
  function moveKnob(dx, dy) { knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; }
  return { state: s, releaseAll };
}
```

Why this is multi-touch safe: roles are keyed by `pointerId` (`stick.id`, `look.id`, `held`), `setPointerCapture` keeps each pointer's events flowing to the layer even if the finger slides off a button, and `pointercancel`/`lostpointercapture`/`visibilitychange`/`blur` all funnel into `end`/`releaseAll` so a cancelled touch can never leave `jumpHeld` stuck (which would otherwise give infinite apex hang via line 864).

### 2.3 Integration with the existing input code (lines 694–718)

Refactor `readInput()` into a merge of sources so the order problem at line 703 disappears:

```js
function readInput() {
  const k = keyboardSource();          // lines 695–703 as-is → {ix, iy, look, jumpHeld}
  const g = gamepadSource();           // lines 704–714 (sets jumpPressed/poundPressed as today)
  const t = touch.state;
  let ix = k.ix + g.ix + t.ix, iy = k.iy + g.iy + t.iy, look = k.look + g.look;
  jumpHeld = k.jumpHeld || g.jumpHeld || t.jumpHeld;         // replaces the assignment at 703 + OR at 713
  if (t.jumpPressed)  { jumpPressed = true;  t.jumpPressed = false; }
  if (t.poundPressed) { poundPressed = true; t.poundPressed = false; }
  const len = Math.hypot(ix, iy); if (len > 1) { ix /= len; iy /= len; }
  return { ix, iy, look };
}
```

- Touch camera drag writes `cam.yaw/pitch` directly (like the mouse at 685–686), not through `look` (1118 multiplies `look` by `2.2 * dt`, which is a *rate* for Q/E and sticks).
- Pause: `onPause: () => setPaused(!paused)` (1180–1184); the pause card gets a touchable "Devam" (already a `button`, 65) and must not be covered by `#touch` (`z-index`: canvas 0 < `#touch` 5 < `.overlay` 10).
- Show the layer only while `state === 'play'` (`layer.hidden = state !== 'play'`), and only on coarse pointers or after the first touch: `document.body.classList.toggle('touch', matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch'))`.
- Line 677 (`mousedown` → pointer lock) must early-return when the last input was touch (`s.active`), otherwise a stylus/mouse on Android would lock the pointer.

### 2.4 Touch HUD markup

```html
<div id="touch" hidden>
  <div id="stick"><div class="knob"></div></div>
  <button class="tbtn" data-btn="pound" aria-label="Yere çakıl">B</button>
  <button class="tbtn" data-btn="jump"  aria-label="Zıpla">A</button>
  <button class="tbtn small" data-btn="pause" aria-label="Duraklat">⏸</button>
</div>
```

### 2.5 CSS (sizes in `clamp()`/`vmin`, safe-area aware; replaces lines 12–18 and 26–28)

```css
:root { --sa-t: env(safe-area-inset-top, 0px); --sa-r: env(safe-area-inset-right, 0px);
        --sa-b: env(safe-area-inset-bottom, 0px); --sa-l: env(safe-area-inset-left, 0px);
        --btn: clamp(56px, 17vmin, 96px); --stick: clamp(96px, 32vmin, 192px); }
body { position: fixed; inset: 0; overscroll-behavior: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
canvas#c { touch-action: none; }
#hud   { top: calc(var(--sa-t) + 10px); left: calc(var(--sa-l) + 12px); gap: clamp(6px, 1.4vmin, 12px); }
#timer { top: calc(var(--sa-t) + 10px); right: calc(var(--sa-r) + 12px); }
.pill  { font-size: clamp(13px, 2.4vmin + 5px, 20px); padding: clamp(3px, .8vmin, 6px) clamp(8px, 1.8vmin, 14px); border-width: clamp(2px, .4vmin, 3px); }
#toast { font-size: clamp(18px, 5vmin, 34px); white-space: normal; max-width: 90vw; }
#hint  { bottom: calc(var(--sa-b) + 10px); font-size: clamp(11px, 2vmin + 3px, 14px); }
#touch { position: fixed; inset: 0; z-index: 5; touch-action: none; display: none; }
body.touch #touch:not([hidden]) { display: block; }
#stick { position: absolute; left: 0; top: 0; width: var(--stick); height: var(--stick); margin: calc(var(--stick) / -2) 0 0 calc(var(--stick) / -2);
         border-radius: 50%; border: 3px solid rgba(43,33,64,.45); background: rgba(255,248,232,.18); opacity: 0; transition: opacity .12s; pointer-events: none; }
#stick.show { opacity: 1; }
#stick .knob { position: absolute; left: 50%; top: 50%; width: 38%; height: 38%; border-radius: 50%; background: rgba(255,248,232,.9); border: 3px solid var(--ink); transform: translate(-50%, -50%); }
.tbtn  { position: absolute; width: var(--btn); height: var(--btn); border-radius: 50%; border: 3px solid var(--ink); background: rgba(255,248,232,.78);
         box-shadow: 0 4px 0 var(--ink); font: inherit; font-weight: 900; font-size: calc(var(--btn) * .36); color: var(--ink); touch-action: none; user-select: none; }
.tbtn.down { transform: translateY(3px); box-shadow: 0 1px 0 var(--ink); background: var(--gold); }
.tbtn[data-btn=jump]  { right: calc(var(--sa-r) + 4vmin); bottom: calc(var(--sa-b) + 5vmin); }
.tbtn[data-btn=pound] { right: calc(var(--sa-r) + 4vmin + var(--btn) * 1.1); bottom: calc(var(--sa-b) + 5vmin + var(--btn) * .6); width: calc(var(--btn) * .72); height: calc(var(--btn) * .72); }
.tbtn[data-btn=pause] { top: calc(var(--sa-t) + 8px); right: calc(var(--sa-r) + 12px + 7.5em); width: 44px; height: 44px; font-size: 18px; }
@media (hover: hover) and (pointer: fine) { button.big:hover { transform: translateY(-2px); } }   /* was unconditional at line 27 */
@media (orientation: portrait) { #rotate { display: grid; } }                                       /* "Telefonu yan çevir" overlay (web build) */
```

Testing the layout without a device: puppeteer `page.setViewport({ width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true })` + `?touch=1`, then assert `document.elementFromPoint()` at each button centre returns that button and that every `.tbtn`/`.pill` rect lies inside the viewport minus the emulated insets (§3.4).

---

## 3. Headless smoke-test strategy (puppeteer-core + local Chrome)

`tools/` already has `puppeteer-core@24` installed and `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` exists; the measurement in Appendix B is a working prototype of this setup (flags: `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --autoplay-policy=no-user-gesture-required --no-sandbox`). SwiftShader rendered the current scene at 844×390@3x in ≈ 240 ms/frame, so tests must run at **640×360 @1x** and advance the simulation with a manual `step()` instead of waiting wall-clock time.

### 3.1 Test API the engine must expose (`window.__game`, extending line 1192)

```ts
window.__game = {
  version: '<git sha or build time>',
  ready: Promise<void>,                    // assets loaded, PMREM built, shaders compiled, first frame rendered
  get state(): 'loading'|'menu'|'play'|'paused'|'won',
  levels: string[],                        // registry ids
  level: { id, name, parTime, crystalCount, coinCount, spawn: [x,y,z] },
  loadLevel(id, { start = false, quality, seed } = {}): Promise<void>,
  start(): void,                           // same as pressing Başla!, audio muted
  pause(v: boolean): void,
  teleport(x, y, z): void,                 // pos = (x,y,z), vel = 0, grounded = false, camera snap (updateCamera(…, true), 1117)
  input: { ix: 0, iy: 0, jumpHeld: false, jump(): void, pound(): void },   // an extra source merged in readInput() (§2.3)
  step(frames: number, dt = 1/60): void,   // stops the RAF loop (renderer.setAnimationLoop(null)), runs the loop body `frames` times with fixed dt, re-enables RAF
  collectAll(): { coins, crystals },       // teleports onto every coin/crystal and steps once each → real pickup code path (1011, 1022), portal opens via 1027
  counts(): { colliders, movers, coins, coinsTaken, crystals, crystalsTaken, enemies, enemiesAlive, checkpoints, meshes,
              drawCalls, triangles, programs, textures, geometries },      // from renderer.info (+ scene.traverse)
  snapshot(): { pos, vel, hearts, coins, crystals, grounded, checkpoint, elapsed, finite: boolean },
  errors: string[],                        // window.onerror + unhandledrejection + console.error, since boot
  renderer, scene, camera, player, enemies, crystals, coins, colliders, checkpoints, cam, save,
};
```

Implementation notes: `step()` is the important one — it makes the run deterministic and 10–50× faster than real time under SwiftShader. `rnd()` (146–147) is already seeded, so level builds are deterministic; `Math.random()` is only used for audio pitch (634) and noise (610). Add an engine guard that the test can observe: after `resolveCollisions()` (871) `if (!Number.isFinite(p.pos.x + p.pos.y + p.pos.z + v.x + v.y + v.z)) { errors.push('NaN position'); respawn(); }`.

### 3.2 URL parameters (web/test only; Capacitor uses `__game.loadLevel()` instead)

`?level=<id>` auto-loads a level · `&start=1` skips the menu · `&mute=1` · `&quality=low|medium|high` · `&touch=1` forces the touch HUD · `&seed=<n>` · `&nosave=1` uses an in-memory storage adapter so test runs never touch `pitir.save.v1` · `&test=1` sets `renderer.info.autoReset = false` semantics for counting and disables the random SFX pitch.

### 3.3 `tools/smoke.js` — per-level checks (exit code ≠ 0 on any failure, JSON report to `tools/out/smoke.json`)

For each `id` in `__game.levels` (or `--level <id>`):

1. **Boot**: `goto ${BASE}/index.html?level=${id}&start=1&mute=1&nosave=1&quality=low&test=1`; `await page.evaluate(() => window.__game.ready)` within 20 s; `errors.length === 0`; no `pageerror`; no console `error` (collect `warning`s into the report).
2. **Structure** (`counts()` vs the level module's declared numbers): `crystals === level.crystalCount ≥ 1`, `coins === level.coinCount > 0`, `checkpoints ≥ 1`, `colliders > 0`; every coin/crystal/checkpoint has solid ground within 6 m below it (raycast down against `solidMeshes`, same helper as 1103–1105) — catches "floating in the void" placements; spawn is on ground; enemies' `home`/`a`/`b` are above ground.
3. **Physics sanity**: `input.iy = 1; step(120)` → position moved > 5 m, `finite === true`, `hearts === 3`; `input.jump(); step(30)` → `pos.y` rose above ground; `teleport(spawn.x, 30, spawn.z); step(200)` → player landed (grounded) and hearts unchanged; `teleport(0, 5, 999); step(120)` → fell in water, hearts 2, respawned at the checkpoint (984–991).
4. **Completion**: `collectAll()` → `crystalsTaken === crystalCount`, portal open; `teleport(portal.x, portal.y, portal.z); step(10)` → `state === 'won'`; then `save.get().levels[id].completed === true` and `bestTimeMs > 0` (with `nosave` the adapter is in-memory, so this still asserts the write path).
5. **Enemies**: teleport 2 m above a slime, `step(60)` → `enemiesAlive` decreased (937–941); teleport next to a spiky → hearts decreased (942) and `invuln > 0`.
6. **Budgets** (tier `low`): `drawCalls ≤ 250`, `triangles ≤ 300k`, `programs ≤ 45`, `textures ≤ 40`; also run once with `quality=medium` and assert `drawCalls ≤ 500`.
7. **Screenshots**: `page.screenshot({ path: tools/out/${id}-{spawn,crystal1,portal}.png })` after `step(1)` at three teleport poses (no `preserveDrawingBuffer` needed — puppeteer captures the composited page); keep them as golden images for `pixelmatch` later (threshold 0.1, ignore the timer pill).

Run order: `python3 -m http.server 8765` is already the dev server; the script reads `BASE` (default `http://localhost:8765`) and `CHROME_PATH` (default the macOS path) so it also runs in CI (`ubuntu-latest` + `google-chrome-stable`, same SwiftShader flags). Each level takes ≈ 3–6 s under `step()`.

### 3.4 HUD/touch layout test

Separate run at `844×390 @3 hasTouch` and `390×844 @3` with `?touch=1&start=1`: assert every `.pill`, `.tbtn`, `#timer` rect is inside the viewport inset by emulated safe areas (`page.addStyleTag` overriding `--sa-*` to 47/21 px), `elementFromPoint` on each button centre returns that button, the start card's `#startBtn` rect is fully visible at 844×390 (the current build fails this — Appendix B), and a `touchscreen.touchStart/Move/End` sequence on the left half changes `__game.snapshot().pos`.

---

## 4. Save-data design — `localStorage['pitir.save.v1']`

### 4.1 Schema (JSON, one object, < 10 KB)

```json
{
  "v": 1,
  "createdAt": 1762600000000, "updatedAt": 1762600000000,
  "wallet": { "coins": 0 },
  "levels": {
    "kristal-adasi": { "unlocked": true, "completed": true, "bestTimeMs": 183400, "maxCoins": 71, "coinTotal": 76,
                       "stars": 2, "crystalsBest": 5, "attempts": 3, "lastPlayedAt": 1762600000000 }
  },
  "settings": { "mute": false, "music": 0.22, "sfx": 0.9, "quality": "auto", "qualityAuto": "medium",
                "controlHints": true, "simpleTouch": false, "cameraSens": 1.0, "invertY": false, "leftHanded": false },
  "stats": { "playTimeMs": 0, "jumps": 0, "stomps": 0, "faints": 0, "wins": 0 },
  "flags": { "seenIntro": false, "seenTouchTutorial": false }
}
```

- `levels[id]` is created on first `loadLevel(id)` (`attempts++`); `unlocked` is computed from the level registry (linear chain: completing `levels[i]` unlocks `levels[i+1]`; optional `unlockStars` gate on a level definition for the hub) **and** stored, so a later re-ordering never locks a player out.
- `bestTimeMs = min(bestTimeMs, round(elapsed * 1000))` on win (`elapsed` accumulates clamped `dt`, 1210 — game time, not wall time; hit-stop (1204) slows it, which is consistent across devices).
- `maxCoins = max(maxCoins, player.coins)`; `coinTotal` stores `level.coinCount` at that moment so the "all coins" star can be recomputed if a level is rebalanced.
- `stars` = completed (1) + `maxCoins ≥ coinTotal` (1) + `bestTimeMs ≤ parTime*1000` (1). Crystals are mandatory for completion (1027), so they do not award a star.
- `wallet.coins += player.coins` on win only (quitting mid-level banks nothing; faint already costs 10 coins at 974). The wallet is for cosmetics later (scarf colours).
- `settings.quality: 'auto'|'high'|'medium'|'low'`; `qualityAuto` is what the runtime probe decided (§1.10) so the choice survives restarts.
- `controlHints` drives the `#hint` pill and the start-card tutorial; `seenTouchTutorial` shows the stick/A/B overlay once.

### 4.2 Versioning & migration

The storage key carries the *slot* version (`.v1`); the object's `v` carries the *schema* version. Bump `v` for additive changes and migrate in place; rename the key only for an incompatible rewrite (then read the old key once, migrate, write the new one, delete the old).

```js
const KEY = 'pitir.save.v1', SCHEMA = 1;
const fresh = () => ({ v: SCHEMA, createdAt: Date.now(), updatedAt: Date.now(), wallet: { coins: 0 }, levels: {}, settings: { ...DEFAULT_SETTINGS }, stats: { ...DEFAULT_STATS }, flags: {} });
const migrations = {              // from version N → N+1; each is pure and small
  0: () => fresh(),
  // 1: (s) => ({ ...s, v: 2, levels: Object.fromEntries(Object.entries(s.levels).map(([id, l]) => [id, { ...l, crystalsBest: l.crystalsBest ?? 0 }])) }),
};
export function load(store) {
  let raw = null, s = null;
  try { raw = store.getItem(KEY); } catch { /* storage disabled */ }
  if (raw) { try { s = JSON.parse(raw); } catch { try { store.setItem(KEY + '.corrupt', raw); } catch {} } }
  if (!s || typeof s !== 'object') s = fresh();
  while ((s.v ?? 0) < SCHEMA) s = migrations[s.v ?? 0](s);
  if (s.v > SCHEMA) s = { ...fresh(), ...s, v: SCHEMA };      // newer build wrote it (downgrade): keep what we understand
  return sanitize(s);                                        // typeof checks, clamp numbers to ≥ 0, drop NaN, fill missing defaults
}
```

### 4.3 Write policy

- Single in-memory object; `save.patch(fn)` mutates and marks dirty; **flush** on: level win, settings change, checkpoint reached (`stats` only), `visibilitychange → hidden`, `pagehide`, and a 1 s debounce. Writes are `try { store.setItem(KEY, JSON.stringify(s)) } catch (e) { toast('Kayıt yapılamadı'); }` (QuotaExceededError in private mode).
- Never store positions/checkpoints mid-level (a level restarts from spawn — simpler and what kids expect); never store `Date` objects (epoch ms only).
- "İlerlemeyi sıfırla" in settings: two-tap confirm, then `store.removeItem(KEY)` + `load()`.

### 4.4 Storage adapter (web ↔ Capacitor)

`src/save/storage.js` exposes `{ getItem, setItem, removeItem }` synchronously over an in-memory cache:

- **web**: `localStorage` behind `try/catch`; falls back to memory-only (toast once) when access throws.
- **Capacitor**: at boot `await Preferences.get({ key: KEY })` (`@capacitor/preferences`, native UserDefaults/SharedPreferences, survives WebKit storage eviction and is included in device backups) seeds the cache; every `setItem` writes both `localStorage` and `Preferences.set` (fire-and-forget). If both exist, prefer the one with the larger `updatedAt`.
- `?nosave=1` → memory adapter (tests).
- Origin caveat from §1.7: progress is per origin (`capacitor://localhost`, `https://localhost`, the web host) — there is no sync between the web and store builds by design (no backend).

### 4.5 Test hooks

`__game.save = { get(), patch(fn), flush(), reset(), key: 'pitir.save.v1', adapter: 'local'|'memory'|'capacitor' }`; the smoke test asserts the write after a win (§3.3 step 4) and runs `load()` against three fixtures: empty, `{v:0}` legacy, and a corrupt string (expects `.corrupt` backup + fresh save).

---

## Appendix A — three.js r186.1 import graph (verified 2026-11-08 from jsDelivr)

```
build/three.module.js  (662 772 B)  → import … from './three.core.js' ; export … from './three.core.js'
build/three.core.js    (1 458 113 B) → (no imports)
examples/jsm/objects/Water.js            (12 894 B) → 'three'
examples/jsm/loaders/HDRLoader.js        (12 079 B) → 'three'            (RGBELoader.js = 268 B alias of HDRLoader)
examples/jsm/loaders/GLTFLoader.js      (117 570 B) → 'three', '../utils/BufferGeometryUtils.js' (toTrianglesDrawMode), '../utils/SkeletonUtils.js' (clone)
examples/jsm/utils/BufferGeometryUtils.js (37 712 B) → 'three'
examples/jsm/utils/SkeletonUtils.js      (11 535 B) → 'three'
— optional —
examples/jsm/libs/meshopt_decoder.module.js (29 256 B) → none
examples/jsm/loaders/DRACOLoader.js      (19 030 B) → 'three' (+ Worker from libs/draco/gltf/*)
examples/jsm/loaders/KTX2Loader.js       (36 567 B) → 'three', '../utils/WorkerPool.js', '../libs/ktx-parse.module.js', '../libs/zstddec.module.js', '../math/ColorSpaces.js' (+ Worker from libs/basis/*)
```

Also verified: `THREE.Timer` is in core (used at 1193; `connect()` subscribes to `visibilitychange`); `Water.js` creates a `WebGLRenderTarget(textureWidth, textureHeight, { type: HalfFloatType })` (line 88) → needs `EXT_color_buffer_half_float`/WebGL2 float render targets (present on iOS 15+ and every Android WebGL2 device; the `cheapWater` fallback covers the rest); `HDRLoader` default `type = HalfFloatType` (line 41).

## Appendix B — measurement log

```
# headless Chrome via puppeteer-core 24 (tools/node_modules), viewport 844×390 @3x, isMobile+hasTouch, SwiftShader
# GL calls counted by wrapping WebGL2RenderingContext.prototype.{drawElements,drawArrays,bindFramebuffer,useProgram,bindTexture,texImage2D,createTexture,linkProgram}
[menu]         draws/frame=1034  bindFramebuffer=4  useProgram=47  bindTexture=66  | textures=33 texImage2D=17 linkProgram=37 | 216 ms/frame (software GL)
[play-idle]    draws/frame=1206  bindFramebuffer=4  useProgram=48  bindTexture=66  | 260 ms/frame
[play-running] draws/frame=930   bindFramebuffer=4  useProgram=39  bindTexture=66  | 241 ms/frame   (W held 1.2 s → pos z 22 → −10.6, 7 coins)
JS heap after start: 48.9 MB · console errors/warnings: none · requestPointerLock rejected silently (as expected headless)
Screenshots: start card at 844×390 is clipped top and bottom (title and "Başla!" cut, no scroll); HUD pills render at full 20 px; coin emoji renders as a grey glyph.
```

Audio assets (afinfo): `amb_birds.mp3` 2 ch 32 kHz 75.06 s, `amb_waves.mp3` 2 ch 32 kHz 60.05 s, one-shots 1–2 ch ≤ 0.5 s. HDR: `sky_2k.hdr` RADIANCE RGBE 2048×1024, 5.2 MB. Textures: 19 × 1024² JPG (11 MB).
