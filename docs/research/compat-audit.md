# Cross-browser & mobile compatibility audit — Pıtır'ın Kristal Adaları

Date: 2026-11-09. Target: the **live build** https://vlikcc.github.io/oyun-deneme/ (commit `3ad4ef6`; the local tree was
mid-edit, so it was only *read*, never tested). Everything below was measured by running it unless marked
**(not verified)**. Companion: `docs/research/mobile-readiness.md` (Capacitor/engine audit of 2026-11-08) — this document
does not repeat it.

## 0. Summary

| Engine / device | Result on the live build | How it was run |
|---|---|---|
| Chromium 158 desktop (1280×800 @1, 1512×945 @2) | **PASS** — loads, menu → select → island 1 → play, 60 fps, keyboard + gamepad + resize + context loss OK | Playwright, ANGLE Metal (real GPU) |
| Google Chrome 156 desktop (installed) | **PASS** (same checks) | Playwright `channel: 'chrome'` |
| WebKit 27.2 desktop (= Safari 27, 1440×900 @2) | **PASS** (same checks) | Playwright WebKit, Apple GPU |
| **Mobile Safari, iOS 27.0, iPhone 17 Simulator** | **PASS** — WebGL2, tier medium, state `play`, 60 fps, 0 page errors, hidden-tab pause and context restore OK | `xcrun simctl` + `tools/mobile/ios-sim.mjs` |
| iPhone 390×844 @3 portrait / landscape (WebKit, touch) | **PASS*** — loads and runs at 60 fps; *a player cannot move* (no touch controls) | Playwright WebKit emulation |
| Android 412×915 @2.625 portrait / landscape (Chromium, touch) | **PASS*** (same caveat) | Playwright Chromium emulation |
| iPad 820×1180 @2 portrait / landscape, Android tablet 1280×800 @2 | **PASS*** (same caveat) | emulation |
| Android, Fast 4G / Slow 4G throttling | **PASS*** — menu after 1.3 s / 3.8 s, but the island is **black for 13 s / 70 s** | Chromium + CDP throttling |
| Firefox desktop / Firefox Android | **NOT VERIFIED** — Playwright Firefox 159 (and 142) will not start on this Mac (macOS 27.2): "Could not find profile folder" / content-sandbox failure. No Firefox installed. | — |
| Microsoft Edge | **NOT VERIFIED** — not installed (Edge = Chromium engine, covered by the Chromium rows) | — |
| Old Safari (iOS ≤ 16.3) / no WebGL2 | **FAIL** — blank sky-blue page, no message (simulated: import map stripped / `getContext('webgl2')` → null) | `gate-*` profiles |

\* "PASS" = the automated flow passed; the touch-controls gap is reported as a warning because that work is being done
elsewhere (run `tools/mobile-check.mjs --require-touch` to make it fail).

Top issues: **(1)** no on-screen controls → unplayable on every phone/tablet (in progress elsewhere); **(2)** untextured
black island for 13–70 s on mobile networks (patch D/E); **(3)** 1k textures on phones: 10.3 MB JPG download and ≈ 92 MB
of GPU textures for island 1 (patch H → 0.6 MB / 28.5 MB, verified); **(4)** blank page on unsupported browsers (patch A,
verified); **(5)** landscape phones: "Başla!" is below the fold (fix exists in the working tree, verify after deploy);
**(6)** no fullscreen / PWA install (patches B + G, assets created).

## 1. Method and tools

- **`tools/mobile-check.mjs`** (new) — Playwright; one row per browser/device profile (`tools/mobile/profiles.mjs`). It
  runs the *real* player flow without `?test=1`: load → title → tap/click **Başla!** → level select → tap island 1 →
  state `play`, then probes: WebGL version/GPU/limits/extensions, quality tier, DPR cap and drawing-buffer size, CSS
  (touch-action, overscroll, safe-area env(), dvh), fullscreen / orientation-lock / pointer-lock / gamepad / import-map
  support, AudioContext state after real taps, rAF frame rate + simulation clock, desktop keyboard (W, Space) and a
  stubbed gamepad stick moving the player, a synthetic left-thumb drag (touch), rotation/resize, a hidden tab, WebGL
  context loss + restore, estimated GPU texture memory, and every network request (bytes, timing). Exit 1 on any FAIL.
  Screenshots + `report.json` in `tools/out/mobile/`.
  Opt-in profiles: `android-slow4g` (throttled), `gate-no-importmap`, `gate-no-webgl2` (the page must *show a message*).
- **`tools/mobile/ios-sim.mjs`** (new) — real Mobile Safari in the iOS Simulator. Starts a local proxy that relays the
  live site byte-for-byte and injects one reporting script, opens it with `simctl openurl`, drives the flow with DOM
  clicks, screenshots each step with `simctl io screenshot`.
- **`tools/mobile/patches/apply.mjs`** (new) — the shared-file patches of §4 as anchor-based edits; dry-run by default.
  Applied to a `git archive HEAD` copy, served by `tools/strict-serve.mjs`, and re-checked (§3.3).
- Chromium runs on the real GPU (`--use-angle=metal`, default on macOS; `--gl=swiftshader` for CI). With SwiftShader the
  game runs at 1–5 fps headless, which made earlier input checks unreliable; the tool now holds inputs until the game's
  own clock has advanced.

Commands that produced the numbers below:

```sh
cd tools && npm i && npx playwright install chromium webkit firefox      # once
node tools/mobile-check.mjs --skip=android-fast4g --jobs=2                # live, 14 default profiles  → exit 0 (3 SKIP)
node tools/mobile-check.mjs --only=android-fast4g,android-slow4g --timeout=400
node tools/mobile-check.mjs --only=gate-no-importmap,gate-no-webgl2      # live → exit 1 (blank page)
node tools/mobile/ios-sim.mjs --device="iPhone 17"                        # iOS 27.0 simulator → PASS
node tools/mobile/patches/apply.mjs --root=<HEAD copy> --write && node tools/strict-serve.mjs --dir=<HEAD copy> --port=18798 &
node tools/mobile-check.mjs --url=http://127.0.0.1:18798/oyun-deneme/ --out=tools/out/mobile-patched --only=…   # exit 0
```

## 2. Findings

Severity: **blocker** = a player on that platform cannot play; **major** = playable but badly broken/slow for many;
**minor** = polish / robustness.

| # | Issue | Browser / device | Sev. | Evidence | Fix |
|---|---|---|---|---|---|
| 1 | No on-screen controls: `src/engine/touch.js` on the live build is a stub, so touch players can tap through the menus but never move or jump. | all phones/tablets | **blocker** | every mobile profile: `touchUI: false`, synthetic left-thumb drag moved the player **0 m** | being built by the touch workflow (GDD §5.1). Gate: `mobile-check --require-touch` |
| 2 | Black island until the textures arrive. Island 1 is built with materials whose JPGs are still downloading; untextured PBR materials render black, and the player can already play. | mobile networks, all browsers | **major** | Fast 4G: menu at 1.3 s (0.52 MB), play at 2.1 s, last texture at **13.1 s**; Slow 4G: menu 3.8 s, play 4.6 s, last texture at **70.5 s**. Screenshot `tools/out/mobile/android-slow4g-03a-play-early.png` (black ground, 0.56 MB loaded) | patch **D + E** (loading card "Ada hazırlanıyor…", ≤ 25 s); verified: no black frame, play starts once textures are in |
| 3 | Phones download and upload **1024² textures** for every PBR map although GDD §5.2 says medium = 512 normal/ARM, low = 512. | phones, tablets (medium/low tier) | **major** | island 1 on a phone: 13.6 MB / 71 requests, of which **10.3 MB JPG**; estimated GPU textures **92.5 MB** (17 × 1024² RGBA8 + mips) + 17.6–20 MB framebuffers + HDR. iOS also keeps decoded image copies in the WebContent process. | patch **H** + `tools/mobile/make-tex512.mjs` (64 textures 42.7 MB → 2.6 MB). Verified: phone download JPG 10.27 → **0.61 MB**, GPU textures 92.5 → **28.5 MB** |
| 4 | Unsupported browser = blank sky-blue page with no message. three r186 needs an import map (Safari ≥ 16.4) and WebGL2 (no WebGL1 path since r163). | iOS ≤ 16.3, old Android WebViews, GPU-blocklisted desktops | **major** (blocker for those users) | `gate-no-importmap`: `Failed to resolve module specifier "three"`, empty body; `gate-no-webgl2`: `Error creating WebGL context`, empty body | patch **A** (classic-script gate + boot-error catcher). Verified: both gates show a Turkish message with a "Yenile" button; normal Chromium/WebKit unaffected |
| 5 | Landscape phones: the start card is taller than the screen; **Başla!** sits at y = 399–453 px in a 390–412 px tall viewport. A touch swipe does scroll the card (Chromium CDP touch gesture: scrollTop 0 → 139), but nothing tells the player to scroll. | iPhone/Android landscape | **major** (first screen) | `startBtnInView: false`, screenshot `iphone-landscape-01-title.png` | the working tree's `ui.css` (short-landscape media query, `max-height:100%`) addresses it; re-run `mobile-check` after deploy (it warns while the button is off-screen) |
| 6 | No fullscreen: browser bars take ~15 % of a landscape phone. iPhone Safari has **no** element Fullscreen API (`fullscreenEnabled` and `webkitFullscreenEnabled` both `undefined` in the iOS 27 simulator); Android Chrome has it plus `screen.orientation.lock` (only while fullscreen). | Android, iPadOS; iPhone | **major** (mobile UX) | env probe per profile; simulator screenshot shows Safari's toolbar over the bottom 90 px | patch **G** (fullscreen + landscape lock on the Başla! tap; verified `fullscreenAfterTap: true` in Android emulation) and patch **B** (iPhone: Add-to-Home-Screen standalone is the only way to hide the bars) |
| 7 | No PWA/installability: no manifest, no icons, no `apple-mobile-web-app-*` tags (theme-color is already in the working tree). | all mobile | minor (blocks PWA/store prep) | `mobile-check` warns `PWA/install tags missing` | created `assets/app.webmanifest` + `assets/icons/*`; wiring = patch **B** |
| 8 | Tier detection uses `devicePixelRatio × innerWidth × innerHeight > 2.5e6 → low`. That is neither CSS nor device pixels, and ignores the DPR cap: every large tablet (iPad Pro 13″ landscape: 2 × 1376 × 1032 = 2.84 M) gets **low** — the strongest touch devices get the worst tier — while a 4-core 3 GB Android phone at 412×915 gets medium only because of `hardwareConcurrency`. | iPad Pro, big Android tablets | minor | code read (`src/engine/core.js` detectTier, same in HEAD and the working tree); emulation cannot show it because Playwright WebKit reports `maxTouchPoints 0`, so iPads emulate as desktops (tier high) | patch **C** (rendered pixels at the 1.25 cap, + `deviceMemory ≤ 3`) |
| 9 | WebGL context loss: three.js restores the context and the game renders again (all engines, iOS simulator included), but the simulation keeps running while nothing is drawn (`state: 'play'` while lost) — the player can die unseen. | all | minor | `contextLoss.whileLost.state = 'play'`, then `contextOk: true`, draws > 0 | patch **F** (pause on `webglcontextlost`); verified `whileLost.state = 'paused'` |
| 10 | Portrait phones get no "Telefonu yan çevir" prompt on the live build (GDD §5.1). | phones portrait | minor | `mobile-check` warning | `#rotate` exists in the working tree's `touch.css` — touch workflow |
| 11 | HUD ignores safe areas on the live build (fixed 14/16 px offsets) although `viewport-fit=cover` is set; in landscape the Dynamic Island covers the left ~59 px (hearts pill). | iPhone landscape | minor | env probe: `safe-area` insets are 0 in portrait Safari (toolbar present) **(landscape not verified: simulator rotation timed out)** | working tree `ui.css`/`touch.css` already use `env(safe-area-inset-*)` |
| 12 | Start card shows keyboard instructions (WASD, Boşluk, Shift, Fare) on touch devices. | phones/tablets | minor | screenshots `*-01-title.png` | UI workflow (`screens.js`) |
| 13 | iOS audio: after the deep link `?level=…` (no gesture) the AudioContext is created `interrupted`; it resumes on the next tap because `audio.js` keeps `pointerdown/keydown/touchstart → unlock()` listeners (not `once`). With real taps it is `running` after the first tap in WebKit and Chromium. Hidden tab → `paused` + context `suspended`. | iOS | OK (info) | simulator: `audio: 'interrupted'` after synthetic clicks; WebKit emulation: `running` after a real tap | none needed |
| 14 | Renderer: WebGL2 everywhere tested; HDRIs load as **half-float** `DataTexture` (2048×1024 on high = 16 MB with mips, 1024×512 on medium/low). iOS simulator: `OES_texture_float_linear: false`, half-float linear filtering is core WebGL2 so HDRLoader's default `HalfFloatType` is the right choice — do not switch it to `FloatType`. Max texture size 8192 (simulator) / 16384; the largest texture is 2048. No 4K textures anywhere. | all | OK (info) | env + texture probes | keep `HalfFloatType` |
| 15 | DPR cap works: iPhone @3 → 1.25 (buffer 487×1055 for 390×844), Android @2.625 → 1.25, desktop @2 → 1.5 (buffer 2268×1417, ≈ 110 MB of MSAA framebuffers). Resize and rotation update the buffer and the camera aspect on every engine. | all | OK | `checks.resize` | — |
| 16 | Desktop input: W moves 7.6–8.2 m, Space jumps 3.2 m, a gamepad stick moves 7.7–8.0 m on Chromium, Chrome and WebKit (gamepad stubbed via `navigator.getGamepads`; real-pad button gating not tested). Pointer lock API present on all desktop engines; the code tolerates Safari's non-promise `requestPointerLock()`. | desktop | OK | `checks.keyboardMove/jumpRise/gamepadMove` | — |
| 17 | Frame rate in play: 56–60 fps on every engine with a real GPU (Apple M4 host — **not representative of a mid-range phone**). `renderer.info` draw calls 257–354 per frame (undercounts the reflection pass; GDD §5.2 budgets use the GL-wrapped count of `tools/smoke.mjs`). | all | info | `frames` | — |
| 18 | Storage blocked (`localStorage` throws, e.g. Safari private mode / strict WebViews): game boots and plays with the in-memory save. | all | OK | Chromium with a throwing `localStorage` getter | — |

Tooling notes: (a) Playwright WebKit screenshots at DPR ≥ 2 sometimes show a lime band at the horizon; a GL read-back of
the same frame has no lime pixels and the iOS simulator does not show it → screenshot artefact, not a game bug. (b) The
iOS-simulator "menu" screenshot is the empty sky-blue body: it is taken the moment `__game.ready` turns true, before
Safari's first paint, and also shows that there is no loading indicator before the first frame. (c) Python's
`http.server` drops connections under parallel load; use `tools/strict-serve.mjs` for local runs.

## 3. Measurements

### 3.1 Live build, default profiles (`node tools/mobile-check.mjs --skip=android-fast4g --jobs=2`, exit 0)

| profile | engine | result | GL | tier | DPR→px | menu s | play s | fps | draws | MB / req | audio after taps | GPU tex MB (est.) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| chromium-desktop | Chromium 158 | PASS | 2 | high | 1→1 | 1.0 | 2.2 | 60 | 332 | 16.09 / 75 | running | 106 |
| chromium-hidpi | Chromium 158 | PASS | 2 | high | 2→1.5 | 2.1 | 4.6 | 60 | 330 | 16.09 / 75 | running | 106 |
| chrome-desktop | Chrome 156 | PASS | 2 | high | 1→1 | 1.3 | 2.4 | 60 | 328 | 16.09 / 76 | running | 106 |
| edge-desktop | — | SKIP (not installed) | | | | | | | | | | |
| webkit-desktop | WebKit 27.2 | PASS | 2 | high | 2→1.5 | 1.6 | 2.6 | 60 | 332 | 16.12 / 75 | running | 106 |
| firefox-desktop | Firefox 159 | SKIP (won't launch on macOS 27.2) | | | | | | | | | | |
| iphone-portrait | WebKit | PASS* | 2 | medium | 3→1.25 | 1.4 | 2.1 | 60 | 272 | 13.58 / 71 | running | 92.5 |
| iphone-landscape | WebKit | PASS* | 2 | medium | 3→1.25 | 0.8 | 1.6 | 60 | 354 | 13.59 / 71 | running | 92.5 |
| android-portrait | Chromium | PASS* | 2 | medium | 2.63→1.25 | 36.0† | 36.8† | 60 | 257 | 13.56 / 71 | running | 92.5 |
| android-landscape | Chromium | PASS* | 2 | medium | 2.63→1.25 | 36.0† | 37.9† | 60 | 354 | 13.56 / 73 | running | 92.5 |
| firefox-android | Firefox | SKIP | | | | | | | | | | |
| ipad-portrait | WebKit | PASS* | 2 | high‡ | 2→1.5 | 1.1 | 6.5 | 60 | 295 | 16.10 / 71 | running | 106 |
| ipad-landscape | WebKit | PASS* | 2 | high‡ | 2→1.5 | 0.7 | 1.7 | 60 | 323 | 16.10 / 71 | running | 106 |
| android-tablet | Chromium | PASS* | 2 | medium | 2→1.25 | 1.1 | 2.8 | 60 | 327 | 13.56 / 71 | running | 92.5 |

\* touch players cannot move (issue 1). † one slow GitHub Pages response in that run; the same profiles took 1.2–4 s in
three other runs. ‡ Playwright WebKit reports `maxTouchPoints 0`, so an iPadOS UA is detected as a desktop; a real iPad
(maxTouchPoints 5) gets medium, or low on 12.9/13″ models (issue 8).

### 3.2 Downloads and load times (island 1 = kristal)

- **What island 1 downloads** (the whole 157 MB repo is *not* downloaded; only the current island's assets):
  phone (medium tier) **13.6 MB in 71 requests** = JPG 10.28 MB, MP3 1.78 MB, HDR 0.91 MB (1k), JS 0.52 MB (gzip),
  GLB 0.07 MB. Desktop (high) **16.1 MB** — the 2k HDR is 3.43 MB.
- The menu needs only **0.52 MB** (HTML, CSS, three.js, game modules). The level behind the menu keeps loading.
- Throttled (Chromium, `Network.emulateNetworkConditions`, cache disabled, phone profile):

| profile | menu visible | state `play` | world ready (props) | last texture / HDRI | everything idle | total |
|---|---|---|---|---|---|---|
| Fast 4G (9 Mbps, 60 ms) | 1.3 s | 2.1 s | 2.1 s | 13.1 s | 13.3 s | 13.56 MB |
| Slow 4G (1.6 Mbps, 150 ms) | 3.8 s | 4.6 s | 7.0 s | 70.5 s | 72.2 s | 13.56 MB |

- Real Mobile Safari (iOS 27.0 simulator, through the local relay proxy): 69 requests, 15.9 MB relayed *uncompressed*
  (three.core.js 1.39 MB raw); WebGL 2.0, "Apple GPU", tier medium, DPR 3 → 1.25, buffer 502×892 for a 402×714 viewport,
  `maxTouchPoints 5`, import maps supported, no fullscreen API, no `screen.orientation.lock`, safe-area insets 0 in
  portrait (Safari toolbar visible), 60 fps, `world.report().errors: []`, zero page errors.

### 3.3 Patched build (patches A–H applied to a HEAD copy, strict Pages emulator, exit 0)

| profile | result | MB / req¹ | JPG MB | GPU tex MB | ctx-loss state while lost | notes |
|---|---|---|---|---|---|---|
| chromium-desktop | PASS | 19.77 / 77 | 10.27 | 106 | paused | high tier keeps 1k textures |
| webkit-desktop | PASS | 20.49 / 77 | 10.27 | 106 | paused | |
| iphone-portrait / landscape | PASS | 6.30 / 72 | **0.61** | **28.5** | paused | no PWA warning any more |
| android-portrait | PASS | 6.27 / 73 | **0.61** | **28.5** | paused | `fullscreenAfterTap: true` |
| android-landscape / tablet | PASS | 6.27 / 73 | 0.61 | 28.5 | paused | |
| android-slow4g | PASS | 7.82 / 73 | 0.61 | 28.5 | — | loading card shown for 20 s; first play frame fully textured (`android-slow4g-03a-play-early.png`) |
| gate-no-importmap | PASS | — | — | — | — | message "Oyun yüklenemedi…" |
| gate-no-webgl2 | PASS | — | — | — | — | message "Bu cihazda 3B grafik (WebGL 2)…" |

¹ the local server does not gzip: JS is 2.37 MB here vs 0.52 MB on GitHub Pages, so on the live site the phone total
would be ≈ 4.4 MB instead of 13.6 MB.

## 4. PATCHES FOR SHARED FILES

All patches are also encoded in `tools/mobile/patches/apply.mjs` (exact anchors, idempotent markers).
`node tools/mobile/patches/apply.mjs` (dry run) reports **all anchors present in the current working tree** (2026-11-09
15:40); B2 is skipped there because theme-color already exists. None of them touch `touch.js`, `input.js`, `touch.css`
or the HUD. Apply after the touch work lands, then run `node tools/mobile-check.mjs --url=http://localhost:8765/`.

### A — `index.html`: unsupported-browser gate (issue 4)

Insert **after** `<link rel="stylesheet" href="src/ui/ui.css" />` (before the quality redirect script and the import
map) the contents of `tools/mobile/patches/compat-gate.html` — a classic ES5 `<script>` that:

```js
// 1. HTMLScriptElement.supports('importmap') false → message 'importmap' (Safari < 16.4, Chrome < 89, Firefox < 108)
// 2. document.createElement('canvas').getContext('webgl2') null → message 'webgl2' (context then released via WEBGL_lose_context)
// 3. window 'error' from a script (*.js / *.mjs, not img/audio) or 'unhandledrejection' before window.__game.ready → 'error'
// Message: full-screen #compatMsg card (inline styles, no dependency on ui.css), Turkish text, "Yenile" button.
window.__compat = { ok, reason }   // for tests
```

Why: today these users get an empty sky-blue page. Verified with `gate-no-importmap` / `gate-no-webgl2` and a 404 on a
module; no false positive in Chromium or WebKit.

### B — `index.html`: PWA / home-screen tags (issues 6, 7)

Insert **before** `<link rel="stylesheet" href="src/ui/ui.css" />`:

```html
<link rel="manifest" href="assets/app.webmanifest" />
<link rel="icon" type="image/png" sizes="32x32" href="assets/icons/favicon-32.png" />
<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon-180.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Pıtır" />
<meta name="format-detection" content="telephone=no" />
```

(B2, only if missing: `<meta name="theme-color" content="#8fd3ff" />`.) The manifest uses relative `start_url`/`scope`
(`../` from `assets/`), so it works under `/oyun-deneme/` and from a Capacitor bundle; `display: fullscreen` with
`display_override: ["fullscreen","standalone"]`, `orientation: landscape`, icons 192/512/maskable-512/SVG.
`stage-site.sh` already copies `assets/`, so no workflow change is needed. A service worker (offline, install prompt on
Chrome) is deliberately not included — it needs a cache plan for the 157 MB of per-island assets.

### C — `src/engine/core.js`: tier detection (issue 8)

Replace

```js
    const px = (devicePixelRatio || 1) * innerWidth * innerHeight;
    if (px > 2.5e6 || (navigator.hardwareConcurrency || 8) <= 4) return 'low';
```

with

```js
    // compat-audit C: pixels actually rendered at the medium DPR cap (1.25), not dpr×CSS px — an iPad Pro (2732×2048
    // physical) is ~3.3 Mpx at the cap and has a desktop-class GPU; old "dpr*w*h > 2.5e6" sent every big tablet to 'low'.
    const cap = Math.min(devicePixelRatio || 1, 1.25), px = innerWidth * innerHeight * cap * cap;
    const cores = navigator.hardwareConcurrency || 8, mem = navigator.deviceMemory || 8;   // deviceMemory: Chrome/Android only
    if (cores <= 4 || mem <= 3 || px > 4.2e6) return 'low';
```

Effect: iPad Pro 13″ landscape 1376×1032 → 2.2 Mpx → medium (was low); phones unchanged (iPhone 390×844 → 0.51 Mpx →
medium); 3 GB Android phones → low. The runtime frame-time probe of GDD §5.2 still steps down when needed.
**(Not verified on a real iPad.)**

### D — `src/engine/assets.js`: track texture + HDRI loads (issue 2)

Replace `const texLoader = new THREE.TextureLoader();` with

```js
// compat-audit D: one LoadingManager for textures + HDRIs → loadState / whenIdle() (main.js shows "Ada hazırlanıyor…").
export const loadState = { busy: false, loaded: 0, total: 0 };
const idleWaiters = [];
export const loadManager = new THREE.LoadingManager(
  () => { loadState.busy = false; idleWaiters.splice(0).forEach((f) => f(true)); },
  (url, loaded, total) => { loadState.loaded = loaded; loadState.total = total; },
);
loadManager.onStart = () => { loadState.busy = true; };
/** whenIdle(ms) → true when every queued texture/HDRI request finished, false on timeout. */
export function whenIdle(ms = 25000) {
  if (!loadState.busy) return Promise.resolve(true);
  return new Promise((r) => { idleWaiters.push(r); setTimeout(() => r(false), ms); });
}
const texLoader = new THREE.TextureLoader(loadManager);
```

and in `loadHDRI` replace `const loader = new HDRLoader();` with `const loader = new HDRLoader(loadManager);`.
(Loader errors also call `itemEnd`, so a failed texture never blocks; retries in `loadTex` go through the same manager.)

### E — `src/main.js`: loading gate before play (issue 2)

After `import * as save from './engine/save.js';` add `import * as assetsMod from './engine/assets.js';`, then replace

```js
export function startLevel(id) {
  const lv = loadLevel(id ?? PLAYABLE[0].id);
```

with

```js
// compat-audit E: on a slow connection the island's JPG/HDR textures arrive 10–70 s after the build; untextured PBR
// materials render black. Wait (≤ 25 s) behind a card, then start for real. Tests (?test=1) never wait.
let loadingCard = null;
function showLoading(on) {
  if (on && !loadingCard) {
    loadingCard = document.createElement('div'); loadingCard.className = 'overlay'; loadingCard.id = 'loadingCard';
    loadingCard.innerHTML = '<div class="card"><h2>Ada hazırlanıyor…</h2><p class="small" id="loadingPct"></p></div>';
    document.body.appendChild(loadingCard);
  } else if (!on && loadingCard) { loadingCard.remove(); loadingCard = null; }
}
export function startLevel(id, opts = {}) {
  id = id ?? PLAYABLE[0].id;
  if (!opts.loaded && !flags.test) {
    if (currentId !== id || !world.level) loadLevel(id);          // queues this island's textures + HDRI
    if (assetsMod.loadState.busy) {
      setState('loading'); screens.hide(); hud.setVisible(false); input.setEnabled(false); showLoading(true);
      const iv = setInterval(() => { const s = assetsMod.loadState, el = document.getElementById('loadingPct'); if (el) el.textContent = s.total ? Math.round((100 * s.loaded) / s.total) + ' %' : ''; }, 250);
      assetsMod.whenIdle(25000).then(() => { clearInterval(iv); showLoading(false); if (state === 'loading') startLevel(id, { loaded: true }); });
      return levelById(id);
    }
  }
  const lv = loadLevel(id);
```

Notes: introduces a `'loading'` state (`body[data-state="loading"]`; pause/keys ignore it). When the menu has been open
long enough the island is already loaded and nothing changes. If the new UI has its own loading card ("Ada
hazırlanıyor…", GDD §5.3), keep D and call `assets.whenIdle()` from there instead of `showLoading`.

### F — `src/main.js`: pause while the WebGL context is lost (issue 9)

After `addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') setPaused(true); });` add

```js
renderer.domElement.addEventListener('webglcontextlost', () => { if (state === 'play') setPaused(true); });   // compat-audit F
```

three r186 already calls `preventDefault()` and re-initialises GL state on `webglcontextrestored` (verified: textures,
water and shadows render again on Chromium, WebKit and iOS Safari), so only the game state needs care.

### G — `src/main.js`: fullscreen + landscape lock on the first tap (issue 6)

Before `screens.init({` add

```js
// compat-audit G: fullscreen hides the browser bars on Android Chrome / iPadOS Safari; orientation.lock only works
// while fullscreen (Android). Must run inside the tap handler. No-op on desktop, iPhone and in installed PWAs.
function goFullscreen() {
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!flags.touch || flags.test || !req || document.fullscreenElement || document.webkitFullscreenElement) return;
  if (matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) return;
  try { Promise.resolve(req.call(el, { navigationUI: 'hide' })).then(() => screen.orientation?.lock?.('landscape')).catch(() => {}); } catch { /* ignore */ }
}
```

and change `onStart: () => { audio.unlock(); showSelect(); },` to
`onStart: () => { audio.unlock(); goFullscreen(); showSelect(); },   // compat-audit G`.
If the new UI adds an Ayarlar toggle, gate the call on it. Leaving fullscreen (back gesture) simply shows the bars again.

### H — 512 px textures on medium/low (issue 3; GDD §5.2 texture row)

1. Generate once: `node tools/mobile/make-tex512.mjs` → `assets/tex/512/*.jpg` (64 files, 42.7 → 2.6 MB, mozjpeg q82).
   Run `node tools/case-check.mjs` afterwards.
2. `src/engine/assets.js`, in `loadTex` replace `  const url = BASE + 'tex/' + file;` with
   `  const url = BASE + 'tex/' + (settings.texDir || '') + file;   // compat-audit H: '512/' on medium/low`
3. `src/engine/core.js`, after `assets.settings.hdriRes = quality.tier === 'high' ? '2k' : '1k';` add
   `assets.settings.texDir = quality.tier === 'high' || params.get('tex') === '1k' ? '' : '512/';   // compat-audit H`

(If the planned WebP conversion of GDD §5.3 lands first, point `texDir` at that folder instead — `TextureLoader` handles
WebP on every engine tested, Safari ≥ 14.) Island 1 visual check on a phone: the 512 diffuse maps at 1.25 DPR are hard to
tell apart from 1k at gameplay distance (`tools/out/mobile-patched/iphone-landscape-03-play.png`).

### Already handled in the working tree (verify after deploy, no patch needed)

safe-area insets on HUD/cards, `100dvh`, `overscroll-behavior` on cards, `-webkit-tap-highlight-color`,
`-webkit-touch-callout: none` (body.touch), `touch-action: pan-x pan-y` on overlays (no pinch-zoom), portrait `#rotate`
prompt, shadows off on the low tier, short-landscape card sizing. `mobile-check` warns about each of the visible ones
(start button off-screen, rotate prompt, PWA tags, touch UI) until they are live.

## 5. Not verified

- **No real devices** (no iPhone/iPad/Android hardware): all frame rates come from an Apple M4 host GPU; mid-range phone
  performance, thermal throttling, real memory limits (iOS WebContent jetsam) and the ring/silent switch are unknown.
- **Firefox** (desktop and Android) — Playwright's Firefox builds 159 and 142 fail to launch on macOS 27.2; Firefox is not
  installed; Docker is installed but its daemon was not running (the Linux Playwright image would run it:
  `docker run --rm -v "$PWD":/w -w /w mcr.microsoft.com/playwright:v1.65.0-noble node tools/mobile-check.mjs --only=firefox-desktop,firefox-android --gl=swiftshader`).
- **Edge** — not installed (Chromium engine is covered).
- **Real macOS Safari** — `safaridriver` needs "Allow Remote Automation"; WebKit 27.2 via Playwright was used instead.
- **iOS landscape**: simulator rotation timed out, so safe-area/Dynamic-Island overlap in landscape Safari is inferred
  from the CSS, not observed. Old iOS (≤ 16.3) was simulated by stripping the import map, not run.
- **Audio unlock with a real finger on iOS** — the simulator run used DOM clicks (context stays `interrupted`, as
  expected); Playwright WebKit's trusted taps show `running`.
- Real gamepads (Safari exposes pads only after a button press), pointer-lock UX, double-tap/pinch zoom gestures on a
  device, `screen.orientation.lock` on a real Android phone, PWA install flows (iOS "Add to Home Screen", Chrome install
  prompt), and patch C's tier choice on real tablets.
