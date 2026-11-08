#!/usr/bin/env node
// Exact-case asset / path audit for GitHub Pages (case-sensitive) — this Mac's APFS is case-insensitive, so a reference
// like 'lantern_01' for Lantern_01.glb works locally and 404s live. Every reference the code can produce is extracted by
// regex (+ the manifests) and checked against fs.readdirSync listings with EXACT case (never fs.existsSync).
// Usage: node tools/case-check.mjs [--verbose]      exit 1 when any reference is missing / wrong-case / manifest drifts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');
const PUBLISHED = ['index.html', 'src', 'vendor', 'assets', '.nojekyll'];   // what the Pages deploy ships

// ---------------------------------------------------------------- exact-case directory index
const files = new Set();            // every published file, posix path relative to ROOT, exact case
const dirs = new Set(['']);
function walk(rel) {
  const abs = path.join(ROOT, rel);
  const st = fs.statSync(abs);
  if (st.isFile()) { files.add(rel.split(path.sep).join('/')); return; }
  dirs.add(rel.split(path.sep).join('/'));
  for (const name of fs.readdirSync(abs)) { if (name === '.DS_Store') continue; walk(rel ? path.join(rel, name) : name); }
}
for (const p of PUBLISHED) if (fs.existsSync(path.join(ROOT, p))) walk(p);
const lowerIndex = new Map();        // lowercase path → [exact paths]
for (const f of files) { const k = f.toLowerCase(); (lowerIndex.get(k) || lowerIndex.set(k, []).get(k)).push(f); }
const listDir = (d) => (fs.existsSync(path.join(ROOT, d)) ? fs.readdirSync(path.join(ROOT, d)).filter((f) => !f.startsWith('.')) : []);

// ---------------------------------------------------------------- source scanning helpers
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
function jsFiles(dir) { const out = []; (function rec(d) { for (const n of fs.readdirSync(path.join(ROOT, d))) { const r = d + '/' + n; if (fs.statSync(path.join(ROOT, r)).isDirectory()) rec(r); else if (/\.(js|mjs)$/.test(n)) out.push(r); } })(dir); return out; }
const SRC = jsFiles('src');
const VENDOR = jsFiles('vendor');
/** strip // and /* comments (naively but enough for this codebase: keeps strings that contain // like http://) */
function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
}
const sources = Object.fromEntries(SRC.map((f) => [f, stripComments(read(f))]));
const lineOf = (code, idx) => code.slice(0, idx).split('\n').length;
/** every match of re (with one capture) in every src file → [{file, line, value}] */
function scan(re, filesToScan = SRC, group = 1) {
  const out = [];
  for (const f of filesToScan) {
    const code = sources[f] ?? stripComments(read(f));
    for (const m of code.matchAll(re)) { if (m[group] === undefined || m[group].includes('${')) continue; out.push({ file: f, line: lineOf(code, m.index), value: m[group] }); }   // template literals are not fixed references
  }
  return out;
}
/** string literals inside an array literal: `ambience: ['a', 'b']` → ['a','b'] */
const strList = (s) => [...s.matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);

// ---------------------------------------------------------------- findings
const problems = [];   // { kind, ref, where, detail }
const infos = [];
const counts = {};
function check(kind, ref, relPath, where) {
  counts[kind] = (counts[kind] || 0) + 1;
  if (files.has(relPath)) { if (VERBOSE) console.log(`ok   ${kind.padEnd(10)} ${relPath}  (${where})`); return true; }
  const alt = lowerIndex.get(relPath.toLowerCase());
  if (alt) problems.push({ kind, ref, where, detail: `CASE MISMATCH: code says '${relPath}', disk has '${alt.join("', '")}'` });
  else problems.push({ kind, ref, where, detail: `MISSING: '${relPath}' does not exist` });
  return false;
}
const loc = (m) => `${m.file}:${m.line}`;

// ================================================================ 1. textures
// TEX_INFO from assets.js: which sets ship ao instead of arm
const assetsJs = sources['src/engine/assets.js'];
const texInfo = {};
for (const m of assetsJs.matchAll(/^\s*(\w+):\s*\{\s*arm:\s*(true|false)\s*,\s*ao:\s*(true|false)\s*\}/gm)) texInfo[m[1]] = { arm: m[2] === 'true', ao: m[3] === 'true' };
const texIds = [...scan(/\btex:\s*['"`]([^'"`]+)['"`]/g), ...scan(/\bpbrTex\(\s*['"`]([^'"`]+)['"`]/g)];
for (const t of texIds) {
  const info = { arm: true, ao: false, ...(texInfo[t.value] || {}) };
  const maps = ['diff', 'nor_gl', ...(info.arm ? ['arm'] : []), ...(info.ao ? ['ao'] : [])];
  for (const map of maps) check('texture', `${t.value} (${map})`, `assets/tex/${t.value}_${map}.jpg`, loc(t));
}
for (const t of scan(/\bloadTex\(\s*['"`]([^'"`]+)['"`]/g)) check('texture', t.value, `assets/tex/${t.value}`, loc(t));
// material roles used by name must exist in DEFAULT_MATERIALS (otherwise they silently fall back to cliff)
const defaultRoles = new Set([...assetsJs.matchAll(/^\s*(\w+):\s*\{\s*tex:/gm)].map((m) => m[1]));
for (const r of scan(/\bassets\.pbr\(\s*['"`]([^'"`]+)['"`]/g)) { counts.role = (counts.role || 0) + 1; if (!defaultRoles.has(r.value)) problems.push({ kind: 'role', ref: r.value, where: loc(r), detail: `material role '${r.value}' is not in DEFAULT_MATERIALS (${[...defaultRoles].join(', ')})` }); }

// ================================================================ 2. HDRIs
const hdriFiles = {};
for (const m of assetsJs.matchAll(/^\s*(\w+):\s*['"`]([^'"`]+\.hdr)['"`]/gm)) hdriFiles[m[1]] = m[2];
for (const [id, file] of Object.entries(hdriFiles)) check('hdri', `HDRI_FILES.${id}`, `assets/hdri/${file}`, 'src/engine/assets.js HDRI_FILES');
for (const h of scan(/\bhdri:\s*['"`]([^'"`]+)['"`]/g)) {
  if (hdriFiles[h.value]) { check('hdri', h.value, `assets/hdri/${hdriFiles[h.value]}`, loc(h)); continue; }
  for (const res of ['1k', '2k']) check('hdri', `${h.value} (${res})`, `assets/hdri/${h.value}_${res}.hdr`, loc(h));   // low/medium → 1k, high → 2k
}
for (const h of scan(/\bloadHDRI\(\s*['"`]([^'"`]+)['"`]/g)) for (const res of ['1k', '2k']) check('hdri', h.value, `assets/hdri/${hdriFiles[h.value] ?? `${h.value}_${res}.hdr`}`, loc(h));

// ================================================================ 3. models
const modelRefs = [
  ...scan(/\bassets\.model\(\s*['"`]([^'"`]+)['"`]\s*\)/g),
  ...scan(/\bmodel\(\s*['"`]([^'"`]+)['"`]\s*\)/g),
  ...scan(/\b(?:L\.)?prop\(\s*['"`]([^'"`]+)['"`]/g),
  ...scan(/\bmodelInfo\(\s*['"`]([^'"`]+)['"`]/g),
];
for (const m of modelRefs) check('model', m.value, `assets/models/${m.value}.glb`, loc(m));
// MODEL_INFO keys (if any are hard-coded)
const modelInfoBlock = assetsJs.match(/MODEL_INFO\s*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? '';
for (const m of modelInfoBlock.matchAll(/^\s*['"]?([\w-]+)['"]?\s*:/gm)) check('model', `MODEL_INFO.${m[1]}`, `assets/models/${m[1]}.glb`, 'src/engine/assets.js MODEL_INFO');
// tree kinds: GLB kinds are the TREE_HEIGHT keys → tree_<kind>.glb; every other kind is procedural
const worldJs = sources['src/engine/world.js'];
const treeHeight = Object.fromEntries([...(worldJs.match(/TREE_HEIGHT\s*=\s*\{([^}]*)\}/)?.[1] ?? '').matchAll(/(\w+):\s*[\d.]+/g)].map((m) => [m[1], true]));
for (const k of Object.keys(treeHeight)) check('tree', `TREE_HEIGHT.${k}`, `assets/models/tree_${k}.glb`, 'src/engine/world.js TREE_HEIGHT');
const treeKindRefs = [...scan(/\bkind:\s*['"`]([^'"`]+)['"`]/g), ...scan(/\bkind:\s*[^,}]*\?\s*['"`]([^'"`]+)['"`]\s*:\s*['"`]([^'"`]+)['"`]/g), ...scan(/\bkind:\s*[^,}]*\?\s*['"`]([^'"`]+)['"`]\s*:\s*['"`]([^'"`]+)['"`]/g, SRC, 2), ...scan(/\bscatter\(\s*['"`]trees?:([^'"`]+)['"`]/g), ...scan(/\btreeKind:\s*['"`]([^'"`]+)['"`]/g)];
for (const t of treeKindRefs) {
  if (treeHeight[t.value]) check('tree', t.value, `assets/models/tree_${t.value}.glb`, loc(t));
  else {
    counts.tree = (counts.tree || 0) + 1;
    const near = Object.keys(treeHeight).find((k) => k.toLowerCase() === t.value.toLowerCase());
    if (near) problems.push({ kind: 'tree', ref: t.value, where: loc(t), detail: `CASE MISMATCH: tree kind '${t.value}' silently becomes a procedural tree; the GLB kind is '${near}'` });
    else if (VERBOSE) console.log(`ok   tree       '${t.value}' is procedural / not a tree kind (${loc(t)})`);
  }
}

// ================================================================ 4. sounds
const audioJs = sources['src/engine/audio.js'];
const sfxManifest = JSON.parse(read('assets/sfx/manifest.json'));
const sfxOnDisk = new Set(listDir('assets/sfx').filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)));
const synthKeys = new Set([...(audioJs.match(/const synth = \{([\s\S]*?)\n\};/)?.[1] ?? '').matchAll(/^\s*(\w+):\s*\(/gm)].map((m) => m[1]));
const soundRefs = [];
const addKeys = (m, tag) => { for (const k of strList(m.value)) soundRefs.push({ key: k, where: `${loc(m)} ${tag}` }); };
for (const m of scan(/CORE_SFX\s*=\s*(\[[^\]]*\])/g, ['src/engine/audio.js'])) addKeys(m, 'CORE_SFX');
for (const m of scan(/STEP_SETS\s*=\s*(\{[^}]*\})/g, ['src/engine/audio.js'])) addKeys(m, 'STEP_SETS');
for (const m of scan(/SAMPLE_VOL\s*=\s*\{([^}]*)\}/g, ['src/engine/audio.js'])) for (const k of m.value.matchAll(/(\w+):/g)) soundRefs.push({ key: k[1], where: `${loc(m)} SAMPLE_VOL`, soft: true });
for (const m of scan(/\bambience:\s*(\[[^\]]*\])/g)) addKeys(m, 'theme.ambience');
for (const m of scan(/\bmusic:\s*(['"`][^'"`]+['"`])/g)) addKeys(m, 'theme.music');
for (const m of scan(/\b(?:audio\.play|play|L\.sfx|sfx|ensure|playLoop|setMusic|setAmbience)\(\s*((?:\[[^\]]*\]|['"`][^'"`]+['"`]))/g)) addKeys(m, 'call');
for (const m of scan(/\bsfx\.(\w+)\??\(/g)) soundRefs.push({ key: m.value, where: `${loc(m)} sfx.${m.value}()` });
for (const m of scan(/\bfootstep\(\s*[^)]*['"`](\w+)['"`]/g)) soundRefs.push({ key: m.value, where: `${loc(m)} footstep set`, set: true });
for (const m of scan(/\bsteps:\s*['"`](\w+)['"`]/g)) soundRefs.push({ key: m.value, where: `${loc(m)} steps`, set: true });
for (const m of scan(/STEP_BY_ROLE\s*=\s*\{([^}]*)\}/g, ['src/engine/world.js'])) for (const k of m.value.matchAll(/:\s*['"`](\w+)['"`]/g)) soundRefs.push({ key: k[1], where: `${loc(m)} STEP_BY_ROLE`, set: true });
for (const m of scan(/return\s+['"`](grass|stone|sand|snow)['"`]/g, ['src/engine/world.js'])) soundRefs.push({ key: m.value, where: `${loc(m)} stepsFor`, set: true });
const stepSets = Object.fromEntries([...(audioJs.match(/STEP_SETS\s*=\s*\{([\s\S]*?)\};/)?.[1] ?? '').matchAll(/(\w+):\s*\[([^\]]*)\]/g)].map((m) => [m[1], strList(m[2])]));
for (const s of soundRefs) {
  counts.sound = (counts.sound || 0) + 1;
  if (s.set) { if (!stepSets[s.key]) problems.push({ kind: 'sound', ref: s.key, where: s.where, detail: `footstep set '${s.key}' is not in STEP_SETS (${Object.keys(stepSets).join(', ')})` }); continue; }
  const rel = `assets/sfx/${s.key}.mp3`;
  if (files.has(rel)) {
    if (!sfxManifest.includes(s.key)) problems.push({ kind: 'sound', ref: s.key, where: s.where, detail: `'${s.key}.mp3' exists but is not in assets/sfx/manifest.json (audio.ensure() skips it)` });
    continue;
  }
  const alt = lowerIndex.get(rel.toLowerCase());
  if (alt) { problems.push({ kind: 'sound', ref: s.key, where: s.where, detail: `CASE MISMATCH: '${rel}' vs disk '${alt.join(', ')}'` }); continue; }
  if (synthKeys.has(s.key)) infos.push(`sound '${s.key}' has no mp3 → synth fallback (${s.where})`);
  else if (s.soft) infos.push(`sound '${s.key}' in SAMPLE_VOL has no mp3 (harmless default table entry) (${s.where})`);
  else problems.push({ kind: 'sound', ref: s.key, where: s.where, detail: `MISSING: no '${rel}' and no synth fallback → silent` });
}

// ================================================================ 5. module imports (src + vendor) and index.html
let importMap = {};
const html = read('index.html');
try { importMap = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports; } catch (e) { problems.push({ kind: 'html', ref: 'importmap', where: 'index.html', detail: 'cannot parse importmap: ' + e.message }); }
function resolveSpec(spec, fromFile) {
  if (importMap[spec]) return path.posix.normalize(importMap[spec].replace(/^\.\//, ''));
  for (const [k, v] of Object.entries(importMap)) if (k.endsWith('/') && spec.startsWith(k)) return path.posix.normalize(v.replace(/^\.\//, '') + spec.slice(k.length));
  if (spec.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  return null;
}
const importRe = /(?:^|\n)\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"`]([^'"`]+)['"`]|(?:^|\n)\s*import\s*['"`]([^'"`]+)['"`]|\bimport\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
for (const f of [...SRC, ...VENDOR]) {
  const code = sources[f] ?? stripComments(read(f));
  for (const m of code.matchAll(importRe)) {
    const spec = m[1] ?? m[2] ?? m[3];
    const target = resolveSpec(spec, f);
    const where = `${f}:${lineOf(code, m.index)}`;
    if (target === null) { counts.import = (counts.import || 0) + 1; problems.push({ kind: 'import', ref: spec, where, detail: `bare specifier '${spec}' is not in the import map` }); continue; }
    if (spec.startsWith('/') || /^https?:/.test(spec)) problems.push({ kind: 'import', ref: spec, where, detail: 'absolute import specifier breaks under /oyun-deneme/' });
    check('import', spec, target, where);
  }
}
for (const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
  const v = m[1]; const where = `index.html:${lineOf(html, m.index)}`;
  if (/^(data:|https?:|#)/.test(v)) continue;
  if (v.startsWith('/')) problems.push({ kind: 'html', ref: v, where, detail: 'root-relative URL breaks under /oyun-deneme/' });
  check('html', v, path.posix.normalize(v.replace(/^\.\//, '')), where);
}
for (const [k, v] of Object.entries(importMap)) {
  const target = path.posix.normalize(v.replace(/^\.\//, ''));
  if (v.startsWith('/')) problems.push({ kind: 'html', ref: v, where: 'index.html importmap', detail: 'root-relative importmap entry breaks under /oyun-deneme/' });
  if (k.endsWith('/')) { counts.html = (counts.html || 0) + 1; if (!dirs.has(target.replace(/\/$/, ''))) problems.push({ kind: 'html', ref: k, where: 'index.html importmap', detail: `prefix target '${target}' is not a directory (exact case)` }); }
  else check('html', k, target, 'index.html importmap');
}
// fetch() targets in src (relative asset URLs)
for (const m of scan(/\bfetch\(\s*['"`]([^'"`$]+)['"`]/g)) { if (m.value.startsWith('/')) problems.push({ kind: 'fetch', ref: m.value, where: loc(m), detail: 'root-relative fetch breaks under /oyun-deneme/' }); else check('fetch', m.value, path.posix.normalize(m.value), loc(m)); }
for (const m of scan(/\bfetch\(\s*`([^`]*)`/g)) { counts.fetch = (counts.fetch || 0) + 1; if (m.value.startsWith('/')) problems.push({ kind: 'fetch', ref: m.value, where: loc(m), detail: 'root-relative fetch breaks under /oyun-deneme/' }); const dir = m.value.split('${')[0]; if (!dirs.has(dir.replace(/\/$/, ''))) problems.push({ kind: 'fetch', ref: m.value, where: loc(m), detail: `fetch template base dir '${dir}' not found (exact case)` }); }
// BASE constant + sub-folders in assets.js
for (const m of scan(/BASE\s*=\s*['"`]([^'"`]+)['"`]/g, ['src/engine/assets.js'])) { counts.fetch = (counts.fetch || 0) + 1; if (m.value.startsWith('/')) problems.push({ kind: 'fetch', ref: m.value, where: loc(m), detail: 'root-relative BASE breaks under /oyun-deneme/' }); for (const sub of ['tex', 'hdri', 'models']) if (!dirs.has(path.posix.normalize(m.value + sub))) problems.push({ kind: 'fetch', ref: m.value + sub, where: loc(m), detail: 'asset sub-folder not found (exact case)' }); }

// ================================================================ 6. manifests vs disk (exact case)
const manifest = JSON.parse(read('assets/manifest.json'));
const diff = (label, a, b) => { const A = new Set(a), B = new Set(b); for (const x of A) if (!B.has(x)) problems.push({ kind: 'manifest', ref: x, where: label, detail: `in manifest but not on disk (exact case)` }); for (const x of B) if (!A.has(x)) problems.push({ kind: 'manifest', ref: x, where: label, detail: `on disk but not in manifest → run node tools/build-manifest.mjs` }); counts.manifest = (counts.manifest || 0) + A.size; };
const texOnDisk = {}; for (const f of listDir('assets/tex')) { const m = f.match(/^(.*)_(diff|nor_gl|arm|ao|rough)\.jpg$/); if (m) (texOnDisk[m[1]] ??= []).push(m[2]); }
diff('assets/manifest.json tex', Object.keys(manifest.tex), Object.keys(texOnDisk));
for (const [id, maps] of Object.entries(manifest.tex)) diff(`assets/manifest.json tex.${id}`, maps, texOnDisk[id] || []);
const hdriOnDisk = {}; for (const f of listDir('assets/hdri')) { const m = f.match(/^(.*)_(1k|2k|4k)\.hdr$/); if (m) (hdriOnDisk[m[1]] ??= []).push(m[2]); }
diff('assets/manifest.json hdri', Object.keys(manifest.hdri), Object.keys(hdriOnDisk));
diff('assets/manifest.json models', Object.keys(manifest.models), listDir('assets/models').filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)));
diff('assets/manifest.json sfx', manifest.sfx, [...sfxOnDisk]);
diff('assets/sfx/manifest.json', sfxManifest, [...sfxOnDisk]);
for (const [label, list] of [['assets/manifest.json sfx', manifest.sfx], ['assets/sfx/manifest.json', sfxManifest]]) if (JSON.stringify(list) !== JSON.stringify([...list].sort())) problems.push({ kind: 'manifest', ref: label, where: label, detail: 'sfx list is not sorted (build-manifest output drifted)' });

// ================================================================ 7. absolute / root-relative URLs and base-path hazards
const hazardRe = /['"`]\/(assets|src|vendor)\b|location\.origin|new URL\(|history\.(pushState|replaceState)|serviceWorker|localhost|127\.0\.0\.1|href="\/|src="\/|url\(\s*\/|location\.pathname|document\.baseURI|<base\b/g;
for (const f of ['index.html', ...SRC, 'src/ui/ui.css']) {
  const code = f.endsWith('.js') ? sources[f] : read(f);
  for (const m of code.matchAll(hazardRe)) { counts.hazard = (counts.hazard || 0) + 1; problems.push({ kind: 'hazard', ref: m[0], where: `${f}:${lineOf(code, m.index)}`, detail: 'absolute / root-relative / origin-dependent path — breaks under /oyun-deneme/' }); }
}
// query-string handling must only use location.search / URLSearchParams (base-path agnostic)
for (const m of scan(/\bparams\.get\(\s*['"`](\w+)['"`]/g)) { counts.query = (counts.query || 0) + 1; if (VERBOSE) console.log(`ok   query      ?${m.value}= (${loc(m)})`); }

// ================================================================ 8. Jekyll / URL-encoding hazards in published names
const underscore = [], special = [];
for (const f of [...files, ...dirs]) {
  if (!f) continue;
  for (const seg of f.split('/')) { if (seg.startsWith('_')) { underscore.push(f); break; } }
  if (/[ #?%]|[^\x20-\x7e]/.test(f)) special.push(f);
}

// ================================================================ report
console.log('case-check: exact-case audit of published files (index.html, src/, vendor/, assets/) — ' + files.size + ' files indexed');
console.log('reference kinds checked: ' + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', '));
if (infos.length) { console.log('\ninfo (no action needed):'); for (const i of [...new Set(infos)]) console.log('  - ' + i); }
console.log(`\nunderscore-prefixed published paths (need .nojekyll — ${fs.existsSync(path.join(ROOT, '.nojekyll')) ? 'present' : 'MISSING!'}): ${underscore.length}`);
for (const u of [...new Set(underscore)].sort()) console.log('  - ' + u);
console.log(`paths with spaces / # / ? / % / non-ASCII: ${special.length}`);
for (const s of special.sort()) console.log('  - ' + s);
if (!fs.existsSync(path.join(ROOT, '.nojekyll')) && underscore.length) problems.push({ kind: 'jekyll', ref: '.nojekyll', where: ROOT, detail: 'underscore paths exist but .nojekyll is missing' });
if (problems.length) {
  console.log(`\n${problems.length} PROBLEM(S):`);
  for (const p of problems) console.log(`  [${p.kind}] ${p.where}: ${p.ref} — ${p.detail}`);
  process.exit(1);
}
console.log('\nclean: every reference resolves with exact case, manifests match disk, no root-relative paths.');
