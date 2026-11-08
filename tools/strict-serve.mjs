#!/usr/bin/env node
// Strict GitHub-Pages-like static server (no dependencies).
//   node tools/strict-serve.mjs [--port=8766] [--base=/oyun-deneme/] [--dir=_site]
// Emulates how a GitHub Pages PROJECT site serves files:
//   - everything lives under the base path; "/oyun-deneme" (no slash) → 301 to "/oyun-deneme/"; anything outside → 404
//   - every path segment is resolved against fs.readdirSync with EXACT case (a case-insensitive hit is still a 404,
//     because GitHub's file system is case-sensitive while macOS APFS is not — that is the whole point of this server)
//   - "." / ".." segments, empty segments and encoded slashes → 404 (no traversal); directories without a trailing slash
//     → 301 to the slash form, a directory serves its index.html (or 404 — GitHub Pages has no directory listings)
//   - Pages-like content types; minimal single-range support (so <audio>/fetch with Range work); HEAD supported
//   - every 404 is logged to stderr as "404 <method> <url> (<reason>)"; SIGTERM/SIGINT close the server and exit 0
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const PORT = Number(argv.port || 8766);
let BASE = String(argv.base || '/oyun-deneme/');
if (!BASE.startsWith('/')) BASE = '/' + BASE;
if (!BASE.endsWith('/')) BASE += '/';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.resolve(ROOT, String(argv.dir || '_site'));
const BASE_NOSLASH = BASE.slice(0, -1);   // "/oyun-deneme"

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream',
  '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.gif': 'image/gif', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};
const typeOf = (file) => TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';

let n404 = 0;
const notFound = (req, res, reason) => {
  n404++;
  process.stderr.write(`404 ${req.method} ${req.url} (${reason})\n`);
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : '<h1>404</h1><p>File not found (strict-serve)</p>');
};
const redirect = (res, to) => { res.writeHead(301, { Location: to, 'Content-Length': '0' }); res.end(); };

/** Resolve a decoded, base-relative path ("src/main.js") to an absolute file with exact-case matching per segment.
 *  Returns { file, isDir } or { error }. */
function resolveStrict(rel) {
  const segs = rel === '' ? [] : rel.split('/');
  let cur = DIR;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s === '' && i === segs.length - 1) break;              // trailing slash → directory
    if (s === '' || s === '.' || s === '..' || s.includes('\0') || s.includes('\\')) return { error: 'bad segment' };
    let entries;
    try { entries = fs.readdirSync(cur); } catch { return { error: 'not a directory' }; }
    if (!entries.includes(s)) {
      const ci = entries.find((e) => e.toLowerCase() === s.toLowerCase());
      return { error: ci ? `CASE MISMATCH: "${s}" vs on-disk "${ci}"` : 'no such entry' };
    }
    cur = path.join(cur, s);
  }
  let st;
  try { st = fs.statSync(cur); } catch { return { error: 'stat failed' }; }
  return { file: cur, isDir: st.isDirectory(), size: st.size, mtime: st.mtime };
}

function serveFile(req, res, info) {
  const headers = {
    'Content-Type': typeOf(info.file), 'Accept-Ranges': 'bytes', 'Last-Modified': info.mtime.toUTCString(),
    'Cache-Control': 'max-age=600', 'Vary': 'Accept-Encoding',
  };
  const range = req.headers.range;
  let start = 0, end = info.size - 1, status = 200;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === '' && m[2] === '')) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); return res.end(); }
    if (m[1] === '') { start = Math.max(0, info.size - Number(m[2])); }
    else { start = Number(m[1]); if (m[2] !== '') end = Math.min(end, Number(m[2])); }
    if (start > end || start >= info.size) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); return res.end(); }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
  }
  headers['Content-Length'] = String(end - start + 1);
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || info.size === 0) return res.end();
  const stream = fs.createReadStream(info.file, { start, end });
  stream.on('error', () => { try { res.destroy(); } catch {} });
  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  const q = req.url.indexOf('?');
  const rawPath = q >= 0 ? req.url.slice(0, q) : req.url;
  const query = q >= 0 ? req.url.slice(q) : '';
  if (rawPath === BASE_NOSLASH) return redirect(res, BASE + query);
  if (!rawPath.startsWith(BASE)) return notFound(req, res, 'outside base path ' + BASE);
  if (/%2f/i.test(rawPath)) return notFound(req, res, 'encoded slash');
  let rel;
  try { rel = decodeURIComponent(rawPath.slice(BASE.length)); } catch { return notFound(req, res, 'bad percent-encoding'); }
  const r = resolveStrict(rel);
  if (r.error) return notFound(req, res, r.error);
  if (r.isDir) {
    if (!rawPath.endsWith('/')) return redirect(res, rawPath + '/' + query);
    const idx = resolveStrict((rel.endsWith('/') || rel === '' ? rel : rel + '/') + 'index.html');
    if (idx.error || idx.isDir) return notFound(req, res, 'directory without index.html');
    return serveFile(req, res, idx);
  }
  serveFile(req, res, r);
});

if (!fs.existsSync(DIR) || !fs.statSync(DIR).isDirectory()) { console.error(`strict-serve: directory not found: ${DIR}`); process.exit(2); }
server.listen(PORT, '127.0.0.1', () => {
  console.log(`strict-serve: http://localhost:${PORT}${BASE}  ←  ${DIR}  (exact-case, base-path only; 404s → stderr)`);
});
const shutdown = (sig) => {
  console.log(`strict-serve: ${sig}, ${n404} 404(s) logged, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
