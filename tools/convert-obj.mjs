#!/usr/bin/env node
// Convert a downloaded OBJ (+MTL/textures) or a zip containing one into an optimised GLB for the game.
// Usage: node tools/convert-obj.mjs <file.obj|archive.zip> <name> [--ratio=0.3] [--error=0.02] [--tex=512]
//   → assets/models/<name>.glb   (remember to add a credit line to assets/CREDITS.md with the source + license)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opts = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const [input, name] = args.filter((a) => !a.startsWith('--'));
if (!input || !name) { console.error('usage: node tools/convert-obj.mjs <file.obj|archive.zip> <name> [--ratio=0.3] [--error=0.02] [--tex=512]'); process.exit(2); }
let objPath = path.resolve(input);
if (/\.zip$/i.test(input)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obj-'));
  execFileSync('unzip', ['-oq', objPath, '-d', dir]);
  const found = walk(dir).filter((f) => /\.obj$/i.test(f)).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  if (!found.length) { console.error('no .obj inside the zip'); process.exit(1); }
  objPath = found[0]; console.log('using', path.relative(dir, objPath));
}
const tmpGlb = path.join(os.tmpdir(), `${name}-raw.glb`);
const obj2gltf = path.join(ROOT, 'tools', 'node_modules', '.bin', 'obj2gltf');
execFileSync(obj2gltf, ['-i', objPath, '-o', tmpGlb, '--binary', '--unlit=false', '--checkTransparency'], { stdio: 'inherit' });
const out = path.join(ROOT, 'assets', 'models', `${name}.glb`);
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'optimize-glb.mjs'), tmpGlb, out, `--ratio=${opts.ratio ?? 0.3}`, `--error=${opts.error ?? 0.02}`, `--tex=${opts.tex ?? 512}`], { stdio: 'inherit' });
console.log('→', path.relative(ROOT, out));
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]); }
