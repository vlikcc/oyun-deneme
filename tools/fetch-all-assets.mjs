#!/usr/bin/env node
// Fetch EVERY published file through a server, using the exact names the code would request (no dependencies).
//   node tools/fetch-all-assets.mjs [--url=http://localhost:8766/oyun-deneme/] [--dir=_site]
// Sources of the URL list:
//   assets/manifest.json → tex: <id>_<variant>.jpg for each listed variant; hdri: <id>_<res>.hdr; models: <name>.glb;
//   assets/sfx/manifest.json → sfx/<key>.mp3; plus every .js/.css under src/ and vendor/three/ (recursive listing),
//   plus index.html, assets/manifest.json, assets/sfx/manifest.json and the base path itself.
// Every URL must answer 200 (a HEAD-less GET; the body is read and its length compared with the file on disk).
// Afterwards three deliberately wrong-case URLs must answer 404 — proof that the server really is case-sensitive.
// Exit 1 on any unexpected status.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let BASE = String(argv.url || 'http://localhost:8766/oyun-deneme/');
if (!BASE.endsWith('/')) BASE += '/';
const DIR = path.resolve(ROOT, String(argv.dir || '_site'));   // where the served files live (for size comparison)
const CONCURRENCY = Number(argv.concurrency || 8);

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
const sfx = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));

const urls = new Map();   // relative path → origin label
const add = (rel, why) => { if (!urls.has(rel)) urls.set(rel, why); };
add('', 'base path');
add('index.html', 'html');
add('assets/manifest.json', 'manifest');
add('assets/sfx/manifest.json', 'sfx manifest');
for (const [id, variants] of Object.entries(manifest.tex)) for (const v of variants) add(`assets/tex/${id}_${v}.jpg`, 'tex');
for (const [id, resolutions] of Object.entries(manifest.hdri)) for (const r of resolutions) add(`assets/hdri/${id}_${r}.hdr`, 'hdri');
for (const name of Object.keys(manifest.models)) add(`assets/models/${name}.glb`, 'model');
for (const key of sfx) add(`assets/sfx/${key}.mp3`, 'sfx');
const walk = (rel, filter) => {   // rel: path relative to ROOT, with forward slashes (also the URL path)
  for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) walk(r, filter);
    else if (filter(e.name)) add(r, 'code');
  }
};
walk('src', (n) => /\.(js|mjs|css)$/.test(n));
walk('vendor/three', (n) => /\.(js|mjs|css)$/.test(n));

const counts = {};
for (const why of urls.values()) counts[why] = (counts[why] || 0) + 1;
console.log(`fetch-all-assets: ${urls.size} URL(s) via ${BASE}  —  ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);

const failures = [];
const list = [...urls.entries()];
let idx = 0, ok = 0, bytes = 0;
async function worker() {
  while (idx < list.length) {
    const [rel, why] = list[idx++];
    const url = BASE + rel;
    try {
      const r = await fetch(url);
      const buf = new Uint8Array(await r.arrayBuffer());
      bytes += buf.length;
      if (r.status !== 200) { failures.push(`${r.status} ${url} [${why}]`); continue; }
      const onDisk = rel === '' ? 'index.html' : rel;
      const p = path.join(DIR, onDisk);
      if (fs.existsSync(p)) {
        const size = fs.statSync(p).size;
        if (size !== buf.length) { failures.push(`size mismatch ${url}: got ${buf.length}, on disk ${size}`); continue; }
      } else failures.push(`(served but not in ${DIR}: ${onDisk})`);
      ok++;
    } catch (e) { failures.push(`fetch error ${url}: ${e?.message || e}`); }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`200 + size-verified: ${ok}/${list.length}  (${(bytes / 1048576).toFixed(1)} MB transferred)`);
if (failures.length) { console.log(`FAILURES (${failures.length}):`); for (const f of failures) console.log(' - ' + f); }
else console.log('no failures');

// negative probes: wrong case must be rejected by the server
const negatives = ['src/Main.js', 'assets/models/lantern_01.glb', 'vendor/three/addons/loaders/gltfloader.js', 'Assets/manifest.json', 'src/levels/_Test.js'];
let negBad = 0;
console.log('\nwrong-case probes (must be 404):');
for (const rel of negatives) {
  const r = await fetch(BASE + rel);
  await r.arrayBuffer();
  const good = r.status === 404;
  if (!good) negBad++;
  console.log(` ${good ? 'ok  ' : 'FAIL'} ${r.status} ${BASE + rel}`);
}
// a few more Pages-shape probes. fetch()/URL normalise ".." on the client, so traversal probes go out as RAW request
// lines over http.request, which sends the path verbatim.
const rawStatus = (rel) => new Promise((resolve, reject) => {
  const u = new URL(BASE);
  const req = http.request({ host: u.hostname, port: u.port, method: 'GET', path: u.pathname + rel }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
  req.on('error', reject); req.end();
});
const extra = [['../index.html', 404, 'traversal (raw ..)'], ['src/../index.html', 404, 'traversal (raw dot-dot segment)'], ['src/./main.js', 404, 'raw dot segment'], ['src%2Fmain.js', 404, 'encoded slash'], ['docs/', 404, 'not published'], ['tools/smoke.mjs', 404, 'not published']];
for (const [rel, want, label] of extra) {
  const status = await rawStatus(rel);
  const good = status === want;
  if (!good) negBad++;
  console.log(` ${good ? 'ok  ' : 'FAIL'} ${status} ${BASE + rel}  (${label}, expected ${want})`);
}
const noSlash = await fetch(BASE.slice(0, -1), { redirect: 'manual' });
await noSlash.arrayBuffer();
const redirOk = noSlash.status === 301 && noSlash.headers.get('location') === new URL(BASE).pathname;
if (!redirOk) negBad++;
console.log(` ${redirOk ? 'ok  ' : 'FAIL'} ${noSlash.status} ${BASE.slice(0, -1)} → ${noSlash.headers.get('location')}  (base without slash redirects)`);
const rangeRes = await fetch(BASE + 'assets/sfx/' + sfx[0] + '.mp3', { headers: { Range: 'bytes=0-99' } });
const rangeBuf = await rangeRes.arrayBuffer();
const rangeOk = rangeRes.status === 206 && rangeBuf.byteLength === 100 && /^bytes 0-99\/\d+$/.test(rangeRes.headers.get('content-range') || '');
if (!rangeOk) negBad++;
console.log(` ${rangeOk ? 'ok  ' : 'FAIL'} ${rangeRes.status} Range bytes=0-99 on ${sfx[0]}.mp3 → ${rangeBuf.byteLength} bytes, ${rangeRes.headers.get('content-range')}`);

process.exit(failures.length || negBad ? 1 : 0);
