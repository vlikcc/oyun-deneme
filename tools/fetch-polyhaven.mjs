#!/usr/bin/env node
// Download Poly Haven (CC0) glTF models at 1k and bake mobile-friendly GLBs into assets/models/<id>.glb
// Usage: node tools/fetch-polyhaven.mjs boulder_01 dead_tree_trunk [--tex=512] [--ratio=0.08] [--error=0.05] [--force]
//   --tex    max texture size in px (default 512)
//   --ratio  target vertex ratio for meshoptimizer simplification (default 0.08 → a 66k-tri scan becomes ~5k)
//   --error  simplification error limit as fraction of mesh radius (default 0.05)
// NOTE: Poly Haven TREES are 40–950 MB scans — never fetch them; use the stylized trees from tools/fetch-3dassets.mjs instead.
// Raw downloads are cached under tools/cache/polyhaven/<id>/ (gitignored). Credits are appended to assets/CREDITS.md.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opts = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const ids = args.filter((a) => !a.startsWith('--'));
if (!ids.length) { console.error('usage: node tools/fetch-polyhaven.mjs <asset_id> [...]'); process.exit(2); }
const TEX = Number(opts.tex || 512), RATIO = Number(opts.ratio || 0.08), ERR = Number(opts.error || 0.05);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'tools', 'cache', 'polyhaven');
const OUT = path.join(ROOT, 'assets', 'models');
fs.mkdirSync(OUT, { recursive: true });

async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

const credits = [];
for (const id of ids) {
  const out = path.join(OUT, `${id}.glb`);
  if (fs.existsSync(out) && !opts.force) { console.log(`skip ${id} (exists)`); continue; }
  const info = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const entry = info?.gltf?.['1k']?.gltf;
  if (!entry) { console.error(`no 1k gltf for ${id}`); continue; }
  const dir = path.join(CACHE, id);
  const gltfPath = path.join(dir, path.basename(entry.url));
  await download(entry.url, gltfPath);
  let total = entry.size;
  for (const [rel, f] of Object.entries(entry.include || {})) { await download(f.url, path.join(dir, rel)); total += f.size; }
  const meta = await (await fetch(`https://api.polyhaven.com/info/${id}`)).json().catch(() => ({}));
  const authors = Object.keys(meta?.authors || {}).join(', ') || 'Poly Haven';
  // SDK-based optimiser (strips per-face normals, welds, simplifies, rebuilds normals, shrinks textures, quantizes)
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'optimize-glb.mjs'), gltfPath, out, `--ratio=${RATIO}`, `--error=${ERR}`, `--tex=${TEX}`], { stdio: 'inherit' });
  const after = fs.statSync(out).size;
  console.log(`${id}: raw ${(total / 1e6).toFixed(2)} MB → ${(after / 1e6).toFixed(2)} MB  (${out})`);
  credits.push(`- **${meta?.name || id}** (${id}) — Poly Haven, CC0, by ${authors} (https://polyhaven.com/a/${id}); simplified ratio ${RATIO}, textures ≤${TEX}px`);
}
if (credits.length) {
  const cf = path.join(ROOT, 'assets', 'CREDITS.md');
  const existing = fs.existsSync(cf) ? fs.readFileSync(cf, 'utf8') : '# Asset credits\n';
  const fresh = credits.filter((c) => !existing.includes(c.split(' — ')[0]));
  if (fresh.length) fs.appendFileSync(cf, (existing.includes('## 3D models') ? '' : '\n## 3D models (assets/models)\n') + fresh.join('\n') + '\n');
}
