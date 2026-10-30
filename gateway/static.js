'use strict';
// Menyajikan antarmuka (file statis) dari gateway agar satu origin: tidak perlu CORS dan
// token tidak lintas origin. File statis bukan data, jadi tidak melewati pipeline kebijakan.
const fs = require('node:fs');
const path = require('node:path');
const { sendJson } = require('../shared/http');

const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
};
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com", "img-src 'self' data:", "connect-src 'self'",
  "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'",
].join('; ');

const isStaticPath = (p) => p === '/' || p === '/index.html' || p === '/favicon.svg' || p.startsWith('/css/') || p.startsWith('/js/');

async function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return sendJson(res, 400, { error: 'Path tidak valid' }); }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  const type = MIME[path.extname(file)];
  if (!file.startsWith(PUBLIC + path.sep) || !type) return sendJson(res, 404, { error: 'Tidak ditemukan' });
  try {
    const data = await fs.promises.readFile(file);
    res.writeHead(200, {
      'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': 'no-cache',
      'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    sendJson(res, 404, { error: 'Tidak ditemukan' });
  }
}

module.exports = { isStaticPath, serveStatic };
