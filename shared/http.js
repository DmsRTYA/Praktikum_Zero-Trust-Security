'use strict';
// Helper HTTP kecil (pengganti framework): JSON, body, router, dan listener service.
class HttpError extends Error {
  constructor(status, message, reason) { super(message); this.status = status; this.reason = reason; }
}

const getUrl = (req) => new URL(req.url, 'http://localhost');

function sendJson(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(data);
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let rejected = false;
    req.on('data', (c) => {
      if (rejected) return;
      size += c.length;
      if (size > limit) { rejected = true; reject(new HttpError(413, 'Body terlalu besar', 'BODY_TERLALU_BESAR')); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!rejected) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req);
  if (buf.length === 0) return {};
  try {
    const v = JSON.parse(buf.toString('utf8'));
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('bukan object');
    return v;
  } catch {
    throw new HttpError(400, 'Body harus berupa JSON object yang valid', 'JSON_TIDAK_VALID');
  }
}

function bearerToken(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  return m ? m[1] : null;
}

class Router {
  constructor() { this.routes = []; }
  add(method, pattern, handler) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-z_]+)/gi, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    this.routes.push({ method, re, keys, handler });
    return this;
  }
  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (!m) continue;
      const params = {};
      try { r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); }
      catch { throw new HttpError(400, 'Path tidak valid', 'PATH_TIDAK_VALID'); }
      return { handler: r.handler, params };
    }
    return null;
  }
}

// Listener untuk Service Nilai / Transkrip: guard (secret + token) SELALU jalan lebih dulu.
function makeServiceListener({ name, router, guard }) {
  return async (req, res) => {
    const started = Date.now();
    try {
      const url = getUrl(req);
      const auth = guard(req);
      const found = router.match(req.method, url.pathname);
      if (!found) throw new HttpError(404, 'Endpoint tidak ditemukan', 'ENDPOINT_TIDAK_DITEMUKAN');
      await found.handler(req, res, {
        auth,
        params: found.params,
        query: Object.fromEntries(url.searchParams),
        requestId: String(req.headers['x-request-id'] || ''),
      });
    } catch (e) {
      if (e instanceof HttpError) sendJson(res, e.status, { error: e.message, reason: e.reason });
      else { console.error(`[${name}]`, e); sendJson(res, 500, { error: 'Kesalahan internal', reason: 'KESALAHAN_INTERNAL' }); }
    } finally {
      console.log(`[${name}] ${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - started}ms)`);
    }
  };
}

module.exports = { HttpError, getUrl, sendJson, readBody, readJson, bearerToken, Router, makeServiceListener };
