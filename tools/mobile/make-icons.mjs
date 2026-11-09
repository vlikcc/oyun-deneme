#!/usr/bin/env node
// Generates the PWA / home-screen icons in assets/icons/ from one SVG (Pıtır: the orange sprout from the favicon).
// Usage: node tools/mobile/make-icons.mjs   (needs sharp, already in tools/node_modules via @gltf-transform)
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/icons');
fs.mkdirSync(OUT, { recursive: true });

// Pıtır on a sky disc. `pad` shrinks the character into the maskable safe zone (inner 80 % circle).
const svg = ({ bg = true, round = false, pad = 0 } = {}) => {
  const s = 512, k = 1 - pad, o = (s * pad) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fb4ff"/><stop offset=".6" stop-color="#a8e1ff"/><stop offset="1" stop-color="#fff3d6"/></linearGradient>
    <radialGradient id="body" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="#ffd08a"/><stop offset=".55" stop-color="#ff9f43"/><stop offset="1" stop-color="#e5762a"/></radialGradient>
  </defs>
  ${bg ? (round ? `<circle cx="256" cy="256" r="256" fill="url(#sky)"/>` : `<rect width="512" height="512" fill="url(#sky)"/>`) : ''}
  <g transform="translate(${o} ${o}) scale(${k})">
    <ellipse cx="256" cy="452" rx="150" ry="26" fill="#2b2140" opacity=".18"/>
    <path d="M250 150 C250 110 256 86 262 66" stroke="#3f9a3c" stroke-width="16" fill="none" stroke-linecap="round"/>
    <path d="M262 74 C300 30 360 34 384 56 C350 92 300 100 262 74 Z" fill="#6fd36a" stroke="#2b2140" stroke-width="10" stroke-linejoin="round"/>
    <path d="M254 82 C220 40 168 40 146 60 C176 94 222 102 254 82 Z" fill="#5bc256" stroke="#2b2140" stroke-width="10" stroke-linejoin="round"/>
    <circle cx="256" cy="290" r="168" fill="url(#body)" stroke="#2b2140" stroke-width="14"/>
    <ellipse cx="206" cy="270" rx="22" ry="30" fill="#2b2140"/><ellipse cx="306" cy="270" rx="22" ry="30" fill="#2b2140"/>
    <circle cx="213" cy="258" r="8" fill="#fff"/><circle cx="313" cy="258" r="8" fill="#fff"/>
    <ellipse cx="170" cy="330" rx="26" ry="15" fill="#ff6f91" opacity=".55"/><ellipse cx="342" cy="330" rx="26" ry="15" fill="#ff6f91" opacity=".55"/>
    <path d="M226 336 Q256 366 286 336" stroke="#2b2140" stroke-width="12" fill="none" stroke-linecap="round"/>
    <path d="M130 382 Q256 430 382 382" stroke="#4dabf7" stroke-width="22" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;
};

const jobs = [
  ['icon.svg', null, svg({ round: true, pad: 0.1 })],
  ['icon-192.png', 192, svg({ round: true, pad: 0.1 })],
  ['icon-512.png', 512, svg({ round: true, pad: 0.1 })],
  ['icon-maskable-512.png', 512, svg({ pad: 0.24 })],          // full-bleed background, character inside the 80 % safe zone
  ['apple-touch-icon-180.png', 180, svg({ pad: 0.14 })],        // iOS masks the square itself; no transparency
  ['favicon-32.png', 32, svg({ round: true, pad: 0.02 })],
];
for (const [name, size, src] of jobs) {
  const f = path.join(OUT, name);
  if (!size) { fs.writeFileSync(f, src); continue; }
  await sharp(Buffer.from(src), { density: Math.max(72, (72 * size) / 512 * 2) }).resize(size, size).png({ compressionLevel: 9 }).toFile(f);
}
console.log('wrote', jobs.map((j) => j[0]).join(', '), '→', path.relative(process.cwd(), OUT));
