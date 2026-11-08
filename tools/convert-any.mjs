#!/usr/bin/env node
// Convert any 3D file (or a zip/rar containing one) into an optimised game GLB using Blender + glTF-Transform.
// Usage: node tools/convert-any.mjs <model.(blend|fbx|obj|dae|gltf|glb|stl|usd)|archive.zip> <name> [--decimate=0.3] [--height=5] [--ratio=0.5] [--error=0.02] [--tex=512]
//   --decimate  Blender decimate ratio applied first (collapse), 1 = off
//   --height    rescale so the model is this many metres tall (0 = keep)
//   --ratio/--error/--tex  passed to tools/optimize-glb.mjs (meshopt simplify + texture shrink + quantize)
// Output: assets/models/<name>.glb. Add the source + license line to assets/CREDITS.md yourself.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BLENDER = process.env.BLENDER || '/Volumes/vlikcc/Applications/Blender.app/Contents/MacOS/Blender';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opts = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const [input, name] = args.filter((a) => !a.startsWith('--'));
if (!input || !name) { console.error('usage: node tools/convert-any.mjs <model|archive> <name> [--decimate=0.3] [--height=5] [--ratio=0.5] [--error=0.02] [--tex=512]'); process.exit(2); }
if (!fs.existsSync(BLENDER)) { console.error(`Blender not found at ${BLENDER} (set BLENDER=/path/to/Blender)`); process.exit(1); }

let src = path.resolve(input);
if (/\.(zip|rar|7z)$/i.test(src)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-'));
  if (/\.zip$/i.test(src)) execFileSync('unzip', ['-oq', src, '-d', dir]);
  else execFileSync('7z', ['x', '-y', `-o${dir}`, src]);   // needs p7zip for .rar/.7z
  const prefer = ['.blend', '.fbx', '.gltf', '.glb', '.obj', '.dae', '.usdz', '.usd', '.3ds', '.stl'];
  const files = walk(dir);
  src = prefer.map((e) => files.filter((f) => f.toLowerCase().endsWith(e)).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0]).find(Boolean);
  if (!src) { console.error('no supported model file inside the archive'); process.exit(1); }
  console.log('using', path.relative(dir, src));
}
const raw = path.join(os.tmpdir(), `${name}-blender.glb`);
execFileSync(BLENDER, ['-b', '--python', path.join(ROOT, 'tools', 'blender-export.py'), '--', src, raw, String(opts.decimate ?? 1), String(opts.height ?? 0)], { stdio: 'inherit' });
const out = path.join(ROOT, 'assets', 'models', `${name}.glb`);
execFileSync(process.execPath, [path.join(ROOT, 'tools', 'optimize-glb.mjs'), raw, out, `--ratio=${opts.ratio ?? 0.5}`, `--error=${opts.error ?? 0.02}`, `--tex=${opts.tex ?? 512}`], { stdio: 'inherit' });
console.log('→', path.relative(ROOT, out));
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]); }
