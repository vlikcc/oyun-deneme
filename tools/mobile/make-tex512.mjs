#!/usr/bin/env node
// 512 px copies of every assets/tex/*.jpg for the medium/low tiers (compat-audit patch H, GDD §5.2 texture row).
// Usage: node tools/mobile/make-tex512.mjs [--src=assets/tex] [--out=assets/tex/512] [--quality=82]
// Island 1 (kristal): 13 textures 9.0 MB → 0.48 MB download; GPU ≈ 5.3 MB → 1.3 MB per texture (RGBA8 + mips).
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const SRC = path.resolve(ROOT, String(argv.src || 'assets/tex'));
const OUT = path.resolve(ROOT, String(argv.out || 'assets/tex/512'));
const Q = Number(argv.quality || 82);
fs.mkdirSync(OUT, { recursive: true });
let a = 0, b = 0, n = 0;
for (const f of fs.readdirSync(SRC).filter((x) => /\.jpe?g$/i.test(x))) {
  const src = path.join(SRC, f), dst = path.join(OUT, f);
  const meta = await sharp(src).metadata();
  const size = Math.min(512, meta.width || 512);
  await sharp(src).resize(size, Math.round((size * (meta.height || size)) / (meta.width || size))).jpeg({ quality: Q, mozjpeg: true }).toFile(dst);
  a += fs.statSync(src).size; b += fs.statSync(dst).size; n++;
}
console.log(`${n} textures: ${(a / 1048576).toFixed(1)} MB → ${(b / 1048576).toFixed(1)} MB in ${path.relative(ROOT, OUT)}`);
