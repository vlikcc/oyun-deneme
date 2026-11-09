// Browser / device profiles for tools/mobile-check.mjs.
// engine: 'chromium' | 'webkit' | 'firefox'; channel: optional Playwright channel ('chrome', 'msedge') = the installed
// branded browser instead of Playwright's build. kind: 'desktop' | 'mobile' (mobile = touch flow, no keyboard check).
// net: optional Chromium-only network throttle (CDP Network.emulateNetworkConditions), kbps / ms.

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  // iPadOS 13+ Safari asks for the desktop site by default: Macintosh UA + maxTouchPoints 5 (core.js isIPadOS relies on this)
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  androidTab: 'Mozilla/5.0 (Linux; Android 14; SM-X210) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0',
};

// DevTools presets (Chrome 13x): "Fast 4G" 9 Mbps/1.5 Mbps/60 ms (DevTools adds packet-queue latency on top),
// "Slow 4G" 1.6 Mbps/750 kbps/150 ms (the old "Fast 3G").
export const NET = {
  fast4g: { downKbps: 9000, upKbps: 1500, latencyMs: 60, label: 'Fast 4G (9 Mbps, 60 ms)' },
  slow4g: { downKbps: 1600, upKbps: 750, latencyMs: 150, label: 'Slow 4G (1.6 Mbps, 150 ms)' },
};

const phone = (w, h, dpr, ua) => ({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true, userAgent: ua });

export const PROFILES = [
  // ---- desktop
  { name: 'chromium-desktop', engine: 'chromium', kind: 'desktop', ctx: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
  { name: 'chromium-hidpi', engine: 'chromium', kind: 'desktop', ctx: { viewport: { width: 1512, height: 945 }, deviceScaleFactor: 2 } },
  { name: 'chrome-desktop', engine: 'chromium', channel: 'chrome', kind: 'desktop', ctx: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
  { name: 'edge-desktop', engine: 'chromium', channel: 'msedge', kind: 'desktop', ctx: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
  { name: 'webkit-desktop', engine: 'webkit', kind: 'desktop', ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } },
  { name: 'firefox-desktop', engine: 'firefox', kind: 'desktop', ctx: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
  // ---- phones (GOAL: iPhone 390x844 @3, Android mid-range 412x915 @2.625)
  { name: 'iphone-portrait', engine: 'webkit', kind: 'mobile', ctx: phone(390, 844, 3, UA.iphone) },
  { name: 'iphone-landscape', engine: 'webkit', kind: 'mobile', ctx: phone(844, 390, 3, UA.iphone) },
  { name: 'android-portrait', engine: 'chromium', kind: 'mobile', ctx: phone(412, 915, 2.625, UA.android) },
  { name: 'android-landscape', engine: 'chromium', kind: 'mobile', ctx: phone(915, 412, 2.625, UA.android) },
  { name: 'firefox-android', engine: 'firefox', kind: 'mobile', note: 'Gecko + hasTouch + Android UA (Playwright Firefox has no isMobile emulation)', ctx: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, hasTouch: true, userAgent: UA.firefoxAndroid } },
  // ---- tablets
  { name: 'ipad-portrait', engine: 'webkit', kind: 'mobile', ctx: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA.ipad } },
  { name: 'ipad-landscape', engine: 'webkit', kind: 'mobile', ctx: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA.ipad } },
  { name: 'android-tablet', engine: 'chromium', kind: 'mobile', ctx: phone(1280, 800, 2, UA.androidTab) },
  // ---- throttled load measurement (Chromium only: CDP network emulation)
  { name: 'android-fast4g', engine: 'chromium', kind: 'mobile', net: 'fast4g', ctx: phone(412, 915, 2.625, UA.android) },
  { name: 'android-slow4g', engine: 'chromium', kind: 'mobile', net: 'slow4g', optIn: true, ctx: phone(412, 915, 2.625, UA.android) },
];

// Unsupported-browser gates (opt-in, Chromium with a feature removed): the page must SHOW a message instead of a blank
// sky-blue screen. gate: 'importmap' strips the import map from index.html (= Safari < 16.4 / iOS ≤ 16.3);
// 'webgl2' makes getContext('webgl2') return null (= three r163+ has no WebGL1 path; iOS < 15, old Android GPUs).
PROFILES.push(
  { name: 'gate-no-importmap', engine: 'chromium', kind: 'gate', gate: 'importmap', optIn: true, ctx: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA.iphone } },
  { name: 'gate-no-webgl2', engine: 'chromium', kind: 'gate', gate: 'webgl2', optIn: true, ctx: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA.iphone } },
);
