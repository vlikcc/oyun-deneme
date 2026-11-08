#!/usr/bin/env node
// Aggressive, mobile-friendly GLB optimisation using the glTF-Transform SDK.
// Why not `gltf-transform optimize`? Poly Haven scans export unwelded per-face vertices, so the stock weld+simplify
// barely reduces them. Here we drop normals/tangents, weld positions+uvs, simplify with meshoptimizer, then rebuild
// smooth normals, shrink textures and quantize attributes (KHR_mesh_quantization — three.js loads it natively).
// Usage: node tools/optimize-glb.mjs <in.gltf|glb> <out.glb> [--ratio=0.1] [--error=0.05] [--tex=512] [--flat]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, prune, quantize, simplify, textureCompress, weld, normals, resample, sparse } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import path from 'node:path';

const args = process.argv.slice(2);
const opts = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const [input, output] = args.filter((a) => !a.startsWith('--'));
if (!input || !output) { console.error('usage: node tools/optimize-glb.mjs <in> <out.glb> [--ratio=0.1] [--error=0.05] [--tex=512]'); process.exit(2); }
const RATIO = Number(opts.ratio ?? 0.1), ERR = Number(opts.error ?? 0.05), TEX = Number(opts.tex ?? 512);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(path.resolve(input));
const before = countTris(doc);
await MeshoptSimplifier.ready;
// strip per-face normals/tangents so welding can merge vertices
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  for (const sem of ['NORMAL', 'TANGENT']) { const a = prim.getAttribute(sem); if (a) { prim.setAttribute(sem, null); if (a.listParents().length === 1) a.dispose(); } }
}
await doc.transform(
  dedup(), flatten(), join(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: ERR, lockBorder: false }),
  normals({ overwrite: true }),
  resample(), prune(), sparse(),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [TEX, TEX], quality: 82 }),
  quantize(),
);
const after = countTris(doc);
await io.write(path.resolve(output), doc);
const size = (await import('node:fs')).statSync(path.resolve(output)).size;
console.log(`${path.basename(input)} → ${path.basename(output)}: ${before.toLocaleString()} → ${after.toLocaleString()} tris, ${(size / 1e6).toFixed(2)} MB`);

function countTris(d) {
  let n = 0;
  for (const m of d.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const idx = p.getIndices(); n += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
  return Math.round(n);
}
