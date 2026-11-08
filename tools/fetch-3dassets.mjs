#!/usr/bin/env node
// Download CC0 GLB props from 3dassets.dev into assets/models/<name>.glb (already web-optimised; no processing needed).
// Usage: node tools/fetch-3dassets.mjs <slug>[=name] [...]           e.g. stylized-trees-and-rocks-kit-oak-mature-658d06b2=tree_oak
//        node tools/fetch-3dassets.mjs --pack=<pack-slug> --filter=oak,pine,boulder   (downloads matching assets of a pack)
// Credits (CC0, attribution optional) are appended to assets/CREDITS.md. cdnUrl is immutable; files are reused if present.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://3dassets.dev/api/v1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'models');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const opts = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
let wanted = args.filter((a) => !a.startsWith('--')).map((a) => { const [slug, name] = a.split('='); return { slug, name }; });

async function j(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }
if (opts.pack) {
  const pack = (await j(`${API}/packs/${opts.pack}`)).data;
  const filters = (opts.filter || '').split(',').filter(Boolean);
  for (const a of pack.assets || []) {
    const slug = a.slug; if (/starter-scene/.test(slug)) continue;
    if (filters.length && !filters.some((f) => slug.includes(f))) continue;
    wanted.push({ slug, name: null });
  }
}
if (!wanted.length) { console.error('nothing to fetch'); process.exit(2); }
const credits = [];
for (const { slug, name } of wanted) {
  const a = (await j(`${API}/assets/${slug}`)).data;
  const short = name || slug.replace(/-[0-9a-f]{8}$/, '').replace(/^(stylized-trees-and-rocks-kit|volcano-and-lava-fields-volcano-and-lava-fields|jungle-temple-and-stone-city|lighthouse-and-rocky-coast|beach-surf-and-paddle-kit)-/, '').replace(/-/g, '_');
  const dest = path.join(OUT, `${short}.glb`);
  if (!fs.existsSync(dest) || opts.force) {
    const r = await fetch(a.cdnUrl); if (!r.ok) throw new Error(`${r.status} ${a.cdnUrl}`);
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  }
  const st = a.stats || {};
  console.log(`${short}.glb  ← ${slug}  (${st.triangles ?? '?'} tris, ${((st.fileSize || st.sizeBytes || 0) / 1024).toFixed(0)} KB)`);
  const attribution = a.license?.attributionText ? ` — ${a.license.attributionText}` : '';
  credits.push(`- **${short}.glb** — ${a.title || a.name || slug} by ${a.contributor?.username || a.contributor?.name || '3dassets.dev contributor'}, ${a.license?.id || a.license?.name || 'CC0'}, https://3dassets.dev/assets/${slug}${attribution}`);
}
const cf = path.join(ROOT, 'assets', 'CREDITS.md');
const existing = fs.existsSync(cf) ? fs.readFileSync(cf, 'utf8') : '# Asset credits\n';
const fresh = credits.filter((c) => !existing.includes(c.split(' — ')[0]));
if (fresh.length) fs.appendFileSync(cf, (existing.includes('## 3D models (3dassets.dev)') ? '' : '\n## 3D models (3dassets.dev, CC0)\n') + fresh.join('\n') + '\n');
