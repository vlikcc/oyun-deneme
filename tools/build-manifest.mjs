#!/usr/bin/env node
// Scans assets/ and writes assets/manifest.json so the engine (src/engine/assets.js) and level authors know what exists.
// Usage: node tools/build-manifest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = path.join(ROOT, 'assets');
const ls = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => !f.startsWith('.')) : []);
const tex = {};
for (const f of ls(path.join(A, 'tex'))) {
  const m = f.match(/^(.*)_(diff|nor_gl|arm|ao|rough)\.jpg$/); if (!m) continue;
  (tex[m[1]] ??= []).push(m[2]);
}
const hdri = {};
for (const f of ls(path.join(A, 'hdri'))) {
  const m = f.match(/^(.*)_(1k|2k|4k)\.hdr$/); if (!m) continue;
  (hdri[m[1]] ??= []).push(m[2]);
}
const models = {};
for (const f of ls(path.join(A, 'models'))) {
  if (!f.endsWith('.glb')) continue;
  models[f.slice(0, -4)] = { bytes: fs.statSync(path.join(A, 'models', f)).size };
}
const sfx = ls(path.join(A, 'sfx')).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)).sort();
const manifest = { generated: new Date().toISOString().slice(0, 10), tex, hdri, models, sfx };
fs.writeFileSync(path.join(A, 'manifest.json'), JSON.stringify(manifest, null, 1));
fs.writeFileSync(path.join(A, 'sfx', 'manifest.json'), JSON.stringify(sfx));
console.log(`manifest: ${Object.keys(tex).length} texture sets, ${Object.keys(hdri).length} HDRIs, ${Object.keys(models).length} models, ${sfx.length} sounds`);
