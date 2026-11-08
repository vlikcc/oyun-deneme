#!/usr/bin/env node
// Downloads the Zapsplat picks listed in docs/research/sounds.md (markdown tables: | key | title | duration | mp3 URL | license |)
// into assets/sfx/<key>.mp3, skipping GOLD-only rows. Long files are trimmed to --maxsec (default 60 s) with fades via ffmpeg.
// Usage: node tools/fetch-sounds.mjs [--only=key1,key2] [--maxsec=60] [--force]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opts = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const only = opts.only ? new Set(opts.only.split(',')) : null;
const MAX = Number(opts.maxsec || 60);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const doc = fs.readFileSync(path.join(ROOT, 'docs', 'research', 'sounds.md'), 'utf8');
const rows = [];
for (const line of doc.split('\n')) {
  const m = line.match(/^\|\s*([a-z0-9_]+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(https?:\/\/\S+?\.mp3)\s*\|\s*(.*?)\s*\|/i);
  if (!m) continue;
  const [, key, title, dur, url, lic] = m;
  if (/gold/i.test(lic)) continue;
  if (only && !only.has(key)) continue;
  rows.push({ key, title, dur, url, lic });
}
const out = path.join(ROOT, 'assets', 'sfx'); fs.mkdirSync(out, { recursive: true });
const credits = [];
let n = 0;
for (const r of rows) {
  const dest = path.join(out, `${r.key}.mp3`);
  if (fs.existsSync(dest) && !opts.force) { credits.push(r); continue; }
  try {
    const res = await fetch(r.url, { headers: { 'User-Agent': UA, Referer: 'https://www.zapsplat.com/' } });
    if (!res.ok || !/audio/.test(res.headers.get('content-type') || '')) { console.error(`skip ${r.key}: HTTP ${res.status} ${res.headers.get('content-type')}`); continue; }
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    // trim long loops
    const secs = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dest]).toString().trim() || 0);
    if (secs > MAX + 2) {
      const tmp = dest + '.tmp.mp3';
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', dest, '-ss', '2', '-t', String(MAX), '-af', `afade=t=in:st=0:d=1.5,afade=t=out:st=${MAX - 2}:d=2`, '-b:a', '96k', tmp]);
      fs.renameSync(tmp, dest);
      console.log(`${r.key}: ${secs.toFixed(0)} s → trimmed to ${MAX} s`);
    } else console.log(`${r.key}: ${secs.toFixed(1)} s`);
    n++; credits.push(r);
  } catch (e) { console.error(`fail ${r.key}: ${e.message}`); }
}
console.log(`${n} new files, ${rows.length} rows considered`);
// credits
const cf = path.join(ROOT, 'assets', 'CREDITS.md');
const existing = fs.existsSync(cf) ? fs.readFileSync(cf, 'utf8') : '';
const lines = credits.map((r) => `- ${r.key}: ${r.title} (${r.lic.replace(/STD \((.*)\)/, '$1')} via Zapsplat)`).filter((l) => !existing.includes(l.split(':')[0] + ':'));
if (lines.length) fs.appendFileSync(cf, '\n' + lines.join('\n') + '\n');
// refresh manifests
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-manifest.mjs')], { stdio: 'inherit' });
