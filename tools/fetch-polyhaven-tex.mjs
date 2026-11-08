#!/usr/bin/env node
// Download Poly Haven (CC0) PBR texture sets and HDRIs.
// Usage: node tools/fetch-polyhaven-tex.mjs snow_02 lava_rock_01 ...          → assets/tex/<id>_diff.jpg, <id>_nor_gl.jpg, <id>_arm.jpg (1k)
//        node tools/fetch-polyhaven-tex.mjs --hdri kloppenheim_06_puresky ...   → assets/hdri/<id>_2k.hdr  (use --res=1k for smaller files)
// Appends credits to assets/CREDITS.md. Existing files are skipped unless --force.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opts = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const ids = args.filter((a) => !a.startsWith('--'));
if (!ids.length) { console.error('usage: node tools/fetch-polyhaven-tex.mjs [--hdri] [--res=1k|2k] <id>...'); process.exit(2); }
const RES = opts.res || (opts.hdri ? '2k' : '1k');
async function j(u) { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); }
async function dl(u, dest) { if (fs.existsSync(dest) && !opts.force) return false; const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u}`); fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer())); return true; }
const credits = [];
for (const id of ids) {
  const files = await j(`https://api.polyhaven.com/files/${id}`);
  const info = await j(`https://api.polyhaven.com/info/${id}`).catch(() => ({}));
  if (opts.hdri) {
    const e = files?.hdri?.[RES]?.hdr; if (!e) { console.error(`${id}: no ${RES} hdr`); continue; }
    const dest = path.join(ROOT, 'assets', 'hdri', `${id}_${RES}.hdr`); fs.mkdirSync(path.dirname(dest), { recursive: true });
    const got = await dl(e.url, dest); console.log(`${id}: ${got ? 'downloaded' : 'exists'} ${(e.size / 1e6).toFixed(1)} MB → ${path.relative(ROOT, dest)}`);
    credits.push(`- **HDRI ${info.name || id}** (${id}) — Poly Haven, CC0 (https://polyhaven.com/a/${id})`);
  } else {
    const maps = { diff: 'Diffuse', nor_gl: 'nor_gl', arm: 'arm' };
    const dir = path.join(ROOT, 'assets', 'tex'); fs.mkdirSync(dir, { recursive: true });
    let ok = 0;
    for (const [suffix, key] of Object.entries(maps)) {
      const e = files?.[key]?.[RES]?.jpg; if (!e) { console.error(`${id}: missing ${key} ${RES} jpg`); continue; }
      await dl(e.url, path.join(dir, `${id}_${suffix}.jpg`)); ok++;
    }
    console.log(`${id}: ${ok}/3 maps → assets/tex/${id}_{diff,nor_gl,arm}.jpg`);
    credits.push(`- **Texture ${info.name || id}** (${id}) — Poly Haven, CC0 (https://polyhaven.com/a/${id})`);
  }
}
const cf = path.join(ROOT, 'assets', 'CREDITS.md');
const existing = fs.existsSync(cf) ? fs.readFileSync(cf, 'utf8') : '# Asset credits\n';
const fresh = credits.filter((c) => !existing.includes(c.split(' — ')[0]));
if (fresh.length) fs.appendFileSync(cf, (existing.includes('## Poly Haven textures & HDRIs') ? '' : '\n## Poly Haven textures & HDRIs (CC0)\n') + fresh.join('\n') + '\n');
