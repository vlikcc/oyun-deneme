#!/usr/bin/env node
// Real Mobile Safari check in the iOS Simulator (Xcode `xcrun simctl`), against the LIVE site through a local
// reporting proxy.
//
// Mobile Safari cannot be driven by Playwright, so this tool:
//   1. starts a proxy on http://localhost:<port>/ that relays the live site (default https://vlikcc.github.io/oyun-deneme/)
//      byte-for-byte, counts the bytes it relays, and injects ONE classic <script> at the top of index.html. The script
//      collects errors / console.error, probes WebGL + the game (window.__game), and long-polls the proxy for commands;
//   2. boots a simulator (or uses the booted one), opens the proxied URL in Mobile Safari (`simctl openurl`);
//   3. drives the flow title → "Başla!" → island 1 → play with DOM clicks (synthetic: they are not user gestures, so the
//      AudioContext stays locked — a real tap is needed for that), and takes `simctl io screenshot` after every step.
// Output: tools/out/mobile/ios-sim/<device>-NN-step.png and ios-sim/<device>.json.
//
// Usage: node tools/mobile/ios-sim.mjs [--device="iPhone 17"] [--url=https://vlikcc.github.io/oyun-deneme/] [--port=8790]
//          [--keep] (leave the simulator booted)  [--landscape] (not supported by simctl; rotate by hand, then rerun with --noboot)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const UP = new URL(String(argv.url || 'https://vlikcc.github.io/oyun-deneme/'));
const PORT = Number(argv.port || 8790);
const DEVICE = String(argv.device || 'iPhone 17');
const OUT = path.join(ROOT, 'tools/out/mobile/ios-sim'); fs.mkdirSync(OUT, { recursive: true });
const tag = DEVICE.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const simctl = (...a) => execFileSync('xcrun', ['simctl', ...a], { encoding: 'utf8' });

// ------------------------------------------------------------------ injected page agent (classic script, ES2017)
const AGENT = `<script>(function(){
var log={errors:[],warnings:[]};window.__mcLog=log;
addEventListener('error',function(e){log.errors.push('error: '+(e.message||(e.target&&e.target.src)||'resource'))},true);
addEventListener('unhandledrejection',function(e){log.errors.push('rejection: '+String(e.reason&&e.reason.message||e.reason))});
var ce=console.error;console.error=function(){try{log.errors.push('console.error: '+[].slice.call(arguments).join(' ').slice(0,300))}catch(_){}return ce.apply(console,arguments)};
var cw=console.warn;console.warn=function(){try{if(log.warnings.length<10)log.warnings.push([].slice.call(arguments).join(' ').slice(0,200))}catch(_){}return cw.apply(console,arguments)};
function post(p,b){return fetch('/__mc/'+p,{method:'POST',body:JSON.stringify(b)})}
async function run(cmd){
  try{ var v=await (0,eval)('(async function(){'+cmd.code+'})()'); return {ok:true,value:v}; }catch(e){ return {ok:false,error:String(e&&e.message||e)}; }
}
async function loop(){ for(;;){ try{ var r=await fetch('/__mc/cmd'); var cmd=await r.json(); if(!cmd||!cmd.code){await new Promise(function(z){setTimeout(z,200)});continue;} var res=await run(cmd); res.id=cmd.id; res.log=log; await post('result',res);}catch(e){await new Promise(function(z){setTimeout(z,500)})} } }
loop();
})();</script>`;

// ------------------------------------------------------------------ proxy
let bytes = 0, requests = 0; const files = [];
const pending = []; const waiters = new Map(); let nextId = 1; let cmdWaiter = null;
function send(code, timeout = 120000) {
  const id = nextId++; const cmd = { id, code };
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { waiters.delete(id); reject(new Error(`page did not answer command ${id} in ${timeout} ms`)); }, timeout);
    waiters.set(id, (v) => { clearTimeout(t); resolve(v); });
    if (cmdWaiter) { const w = cmdWaiter; cmdWaiter = null; w(cmd); } else pending.push(cmd);
  });
}
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__mc/cmd') {
    const cmd = pending.shift();
    if (cmd) return res.end(JSON.stringify(cmd));
    const t = setTimeout(() => { cmdWaiter = null; res.end('{}'); }, 20000);
    cmdWaiter = (c) => { clearTimeout(t); res.end(JSON.stringify(c)); };
    return;
  }
  if (u.pathname === '/__mc/result') {
    let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => { const r = JSON.parse(body); waiters.get(r.id)?.(r); waiters.delete(r.id); res.end('ok'); });
    return;
  }
  // relay /<base>/… to the upstream origin (same path)
  const target = new URL(u.pathname + u.search, UP.origin);
  try {
    const up = await fetch(target, { redirect: 'manual' });
    let buf = Buffer.from(await up.arrayBuffer());
    const ct = up.headers.get('content-type') || 'application/octet-stream';
    if (/text\/html/.test(ct)) buf = Buffer.from(buf.toString('utf8').replace(/<head>/i, '<head>' + AGENT));
    bytes += buf.length; requests++; files.push({ path: u.pathname, bytes: buf.length, status: up.status });
    res.writeHead(up.status, { 'content-type': ct, 'cache-control': 'no-store', ...(up.headers.get('location') ? { location: up.headers.get('location').replace(UP.origin, `http://localhost:${PORT}`) } : {}) });
    res.end(buf);
  } catch (e) { res.writeHead(502); res.end(String(e)); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

// ------------------------------------------------------------------ simulator
const devices = JSON.parse(simctl('list', 'devices', 'available', '-j')).devices;
const all = Object.entries(devices).flatMap(([rt, list]) => list.map((d) => ({ ...d, runtime: rt })));
const dev = all.find((d) => d.state === 'Booted' && (argv.noboot || d.name === DEVICE)) || all.find((d) => d.name === DEVICE);
if (!dev) { console.error(`no simulator named "${DEVICE}"; available: ${all.map((d) => d.name).join(', ')}`); process.exit(2); }
const bootedHere = dev.state !== 'Booted';
if (bootedHere) { console.log(`booting ${dev.name} (${dev.runtime.split('.').pop()})…`); simctl('boot', dev.udid); }
try { simctl('bootstatus', dev.udid, '-b'); } catch { /* older Xcode */ }
const shot = (name) => { const f = path.join(OUT, `${tag}-${name}.png`); try { simctl('io', dev.udid, 'screenshot', f); } catch (e) { console.warn('screenshot failed', e.message); } return path.relative(ROOT, f); };

const report = { device: dev.name, runtime: dev.runtime.split('.').pop(), url: UP.href, steps: [], fails: [] };
const step = async (name, code, timeout) => {
  const t = Date.now(); let r;
  try { r = await send(code, timeout); } catch (e) { r = { ok: false, error: e.message }; }
  const s = { name, ms: Date.now() - t, ok: r.ok, value: r.value, error: r.error, shot: shot(String(report.steps.length + 1).padStart(2, '0') + '-' + name) };
  report.steps.push(s); report.log = r.log || report.log;
  console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${name} (${s.ms} ms)${r.error ? ' — ' + r.error : ''}`);
  if (!r.ok) report.fails.push(`${name}: ${r.error}`);
  return r.value;
};

const pageUrl = `http://localhost:${PORT}${UP.pathname}`;
console.log(`opening ${pageUrl} in Mobile Safari on ${dev.name}`);
const t0 = Date.now();
simctl('openurl', dev.udid, pageUrl);

await step('menu', `
  var t=Date.now(); while(!(window.__game&&window.__game.ready)){ if(Date.now()-t>120000) throw new Error('__game.ready never true'); await new Promise(function(r){setTimeout(r,200)}); }
  var g=window.__game,c=g.core,r=c.renderer,gl=r.getContext(),d=gl.getExtension('WEBGL_debug_renderer_info');
  var meta=document.querySelector('meta[name=viewport]');
  var b=document.querySelector('#startBtn').getBoundingClientRect();
  return { ua:navigator.userAgent, webgl2: typeof WebGL2RenderingContext!=='undefined' && gl instanceof WebGL2RenderingContext, gl: gl.getParameter(gl.VERSION),
    gpu: d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER), maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    halfFloatRT: !!gl.getExtension('EXT_color_buffer_half_float')||!!gl.getExtension('EXT_color_buffer_float'), floatLinear: !!gl.getExtension('OES_texture_float_linear'),
    tier: c.quality.tier, dpr: devicePixelRatio, pixelRatio: r.getPixelRatio(), inner:[innerWidth,innerHeight], buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],
    touchFlag: c.flags.touch, maxTouchPoints: navigator.maxTouchPoints, hwConcurrency: navigator.hardwareConcurrency, importMap: HTMLScriptElement.supports?HTMLScriptElement.supports('importmap'):null,
    fullscreen: { std: document.fullscreenEnabled===undefined?null:document.fullscreenEnabled, webkit: document.webkitFullscreenEnabled===undefined?null:document.webkitFullscreenEnabled }, orientationLock: !!(screen.orientation&&screen.orientation.lock),
    safeArea: (function(){var e=document.createElement('div');e.style.cssText='position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';document.body.appendChild(e);var s=getComputedStyle(e);var v=[s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft].join(' ');e.remove();return v})(),
    viewportMeta: meta&&meta.content, startBtnInView: b.top>=0&&b.bottom<=innerHeight, standalone: !!navigator.standalone,
    audio: (g.audio.audio||g.audio.default||g.audio).context ? (g.audio.audio||g.audio.default||g.audio).context.state : 'none', state: g.state };`, 150000);
report.timings = { menuMs: Date.now() - t0, bytesAtMenu: bytes };

await step('select', `document.querySelector('#startBtn').click(); await new Promise(function(r){setTimeout(r,800)}); return window.__game.state;`);
await step('play', `
  var li=document.querySelector('li.level-card[data-locked="0"]'); li.click();
  var t=Date.now(); while(window.__game.state!=='play'){ if(Date.now()-t>30000) throw new Error('state '+window.__game.state); await new Promise(function(r){setTimeout(r,100)}); }
  await window.__game.test.ready();
  t=Date.now(); while(!(window.__game.core.scene.background&&window.__game.core.scene.background.isDataTexture)){ if(Date.now()-t>60000) break; await new Promise(function(r){setTimeout(r,200)}); }
  await new Promise(function(r){setTimeout(r,2500)});
  var c=window.__game.core, t0=c.time.now, n=0, s=performance.now();
  await new Promise(function(res){ function f(){ n++; if(performance.now()-s<3000) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); });
  var g=window.__game;
  return { state:g.state, level:g.level&&g.level.id, fps: Math.round(n/((performance.now()-s)/1000)), simAdvance: +(c.time.now-t0).toFixed(2), draws: c.stats().calls,
    hdri: !!(c.scene.background&&c.scene.background.isDataTexture), report: g.test.report(), audio: (g.audio.audio||g.audio.default||g.audio).context ? (g.audio.audio||g.audio.default||g.audio).context.state : 'none' };`, 180000);
report.timings.playMs = Date.now() - t0;
await step('visibility', `
  document.dispatchEvent(new Event('visibilitychange',{bubbles:true}));
  Object.defineProperty(document,'hidden',{configurable:true,get:function(){return true}}); document.dispatchEvent(new Event('visibilitychange',{bubbles:true}));
  await new Promise(function(r){setTimeout(r,300)}); var s=window.__game.state; delete document.hidden; window.__game.setPaused(false); return s;`);
await step('context-loss', `
  var c=window.__game.core,gl=c.renderer.getContext(),x=gl.getExtension('WEBGL_lose_context'); if(!x) return 'no WEBGL_lose_context';
  x.loseContext(); await new Promise(function(r){setTimeout(r,600)}); x.restoreContext(); await new Promise(function(r){setTimeout(r,3000)});
  var t=c.time.now; await new Promise(function(r){setTimeout(r,1000)}); return { contextOk: !gl.isContextLost(), simAdvance: +(c.time.now-t).toFixed(2), draws: c.stats().calls, state: window.__game.state };`);

report.net = { requests, mb: +(bytes / 1048576).toFixed(2), largest: files.slice().sort((a, b) => b.bytes - a.bytes).slice(0, 8).map((f) => ({ file: decodeURIComponent(f.path.split('/').slice(-2).join('/')), mb: +(f.bytes / 1048576).toFixed(2) })), errors: files.filter((f) => f.status >= 400) };
if (report.log?.errors?.length) report.fails.push(...report.log.errors.map((e) => 'page ' + e));
if (report.net.errors.length) report.fails.push(...report.net.errors.map((f) => `http ${f.status} ${f.path}`));
report.status = report.fails.length ? 'FAIL' : 'PASS';
fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify(report, null, 2));
console.log(`\n${report.status} ${dev.name} (${report.runtime}) — menu ${(report.timings.menuMs / 1000).toFixed(1)} s, play+ready ${(report.timings.playMs / 1000).toFixed(1)} s, ${report.net.mb} MB / ${requests} requests through the proxy`);
for (const f of report.fails) console.log('   FAIL ' + f);
console.log(`report: ${path.relative(ROOT, path.join(OUT, tag + '.json'))}`);
server.close();
if (bootedHere && !argv.keep) { try { simctl('shutdown', dev.udid); } catch { /* ignore */ } }
process.exit(report.fails.length ? 1 : 0);
