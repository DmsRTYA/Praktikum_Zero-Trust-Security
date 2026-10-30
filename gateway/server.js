'use strict';
// API GATEWAY = Policy Enforcement Point (PEP), port 3000.
// Urutan untuk setiap request ke data (selain /auth/*):
//   1 authenticate (token RS256)  2 deviceCheck  3 resolveRoute (default deny)
//   4 Policy Engine (baca atribut dari DB)  5 audit  6 proxy + X-Gateway-Secret
const http = require('node:http');
const crypto = require('node:crypto');
const config = require('./config');
const { openDb } = require('../shared/db');
const { HttpError, getUrl, sendJson, readJson, bearerToken } = require('../shared/http');
const jwt = require('../shared/jwt');
const { createAudit } = require('./audit');
const { createAuth } = require('./auth');
const { createPolicy } = require('./policy/policy');
const { resolveRoute } = require('./policy/routes');
const { messageFor } = require('./policy/messages');
const { forward } = require('./proxy');
const { isStaticPath, serveStatic } = require('./static');

const db = openDb(config.dbPath);
const audit = createAudit(db);
const auth = createAuth({ db, config });
const policy = createPolicy({ db, jamMulai: config.jamMulai, jamSelesai: config.jamSelesai, jamTz: config.jamTz });

const qUserById = db.prepare('SELECT id, role, is_active FROM users WHERE id = ?');
const qDevice = db.prepare('SELECT 1 AS ok FROM devices WHERE user_id = ? AND device_id = ? AND is_active = 1');
const qDemoAccounts = db.prepare(`SELECT u.username, u.role, d.device_id AS device FROM users u
  JOIN devices d ON d.user_id = u.id WHERE u.is_active = 1 AND d.is_active = 1 ORDER BY u.id`);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TARGETS = { nilai: config.nilaiUrl, transkrip: config.transkripUrl };
const validCorrelation = (req) => { const v = String(req.headers['x-correlation-id'] || ''); return UUID.test(v) ? v : null; };

function newContext(req) {
  const url = getUrl(req);
  const dev = String(req.headers['x-device-id'] || '').trim();
  return {
    id: crypto.randomUUID(), method: req.method, pathname: url.pathname, url,
    endpoint: (url.pathname + url.search).slice(0, 300), deviceId: dev ? dev.slice(0, 64) : null, correlationId: null,
  };
}

// Mencatat keputusan. Kegagalan menulis log dilaporkan ke stderr, tidak menjatuhkan request.
function writeAudit(ctx, { decision, reason, status, subject }) {
  try {
    return audit.write({
      requestId: ctx.id, correlationId: ctx.correlationId, subjectType: subject?.type || 'anonymous',
      subjectId: subject?.id ?? null, role: subject?.role ?? null, method: ctx.method, endpoint: ctx.endpoint,
      deviceId: subject?.type === 'service' ? null : ctx.deviceId, decision, reason, statusCode: status ?? null,
    });
  } catch (e) { console.error('[audit] gagal menulis:', e.message); return null; }
}

// ---------- Policy Administrator: /auth/* ----------
const AUTH_ROUTES = {
  'POST /auth/login': auth.login, 'POST /auth/refresh': auth.refresh,
  'POST /auth/logout': auth.logout, 'POST /auth/service': auth.serviceToken,
};

async function handleAuth(req, res, ctx) {
  const fn = AUTH_ROUTES[`${req.method} ${ctx.pathname}`];
  let result;
  if (!fn) {
    result = { status: 404, json: { error: messageFor('ROUTE_TIDAK_DIKENAL'), reason: 'ROUTE_TIDAK_DIKENAL' }, decision: 'deny', reason: 'ROUTE_TIDAK_DIKENAL', subject: null };
  } else {
    try { result = await fn(ctx, await readJson(req)); }
    catch (e) {
      if (!(e instanceof HttpError)) throw e;
      result = { status: e.status, json: { error: e.message, reason: e.reason }, decision: 'deny', reason: e.reason, subject: null };
    }
  }
  // Korelasi hanya dipercaya dari client service yang BERHASIL diautentikasi.
  if (ctx.pathname === '/auth/service' && result.decision === 'allow') ctx.correlationId = validCorrelation(req);
  writeAudit(ctx, { decision: result.decision, reason: result.reason, status: result.status, subject: result.subject });
  sendJson(res, result.status, result.json);
}

// Hanya aktif saat DEMO_MODE=true: daftar akun untuk panel login.
function handleDemo(req, res) {
  sendJson(res, 200, { demo: true, password: config.seedPassword, accounts: qDemoAccounts.all().map((a) => ({ ...a })) });
}

// ---------- Pipeline PEP ----------
async function handleProtected(req, res, ctx) {
  const reject = (status, reason, subject = null) => {
    writeAudit(ctx, { decision: 'deny', reason, status, subject });
    sendJson(res, status, { error: messageFor(reason), reason });
  };

  // 1. authenticate: tanda tangan RS256, exp, iss
  const token = bearerToken(req);
  if (!token) return reject(401, 'TOKEN_TIDAK_ADA');
  let claims;
  try { claims = jwt.verify(token, config.publicKey, { issuer: config.issuer }); }
  catch (e) { return reject(401, e.code || 'TOKEN_TIDAK_VALID'); }

  // 2. identitas + verifikasi konteks (device)
  let subject;
  if (claims.typ === 'access') {
    const uid = Number(claims.sub);
    const user = Number.isInteger(uid) ? qUserById.get(uid) : null;
    if (!user || !user.is_active || user.role !== claims.role) return reject(401, 'USER_TIDAK_AKTIF');
    subject = { type: 'user', id: String(user.id), role: user.role };
    if (!ctx.deviceId) return reject(403, 'DEVICE_TIDAK_ADA_DI_HEADER', subject);
    if (!qDevice.get(user.id, ctx.deviceId)) return reject(403, 'DEVICE_TIDAK_TERDAFTAR', subject);
    if (claims.did !== ctx.deviceId) return reject(403, 'DEVICE_TIDAK_COCOK_DENGAN_TOKEN', subject);
  } else if (claims.typ === 'service' && claims.role === 'service') {
    subject = { type: 'service', id: String(claims.sub), role: 'service', scope: claims.scope };
    ctx.correlationId = validCorrelation(req);   // dipercaya hanya dari token service
    ctx.deviceId = null;                         // device hanya berlaku untuk request user
  } else {
    return reject(401, 'TIPE_TOKEN_SALAH');
  }

  // 3. rute dikenal? (default deny)
  const route = resolveRoute(req.method, ctx.pathname);
  if (!route) return reject(403, 'ROUTE_TIDAK_DIKENAL', subject);

  // 4. Policy Engine. Jam simulasi hanya saat DEMO_MODE=true dan hanya untuk MEMPERKETAT (lihat resolveClock).
  const clock = policy.resolveClock(String(req.headers['x-simulated-time'] || ''), config.demoMode);
  const decision = policy.decide({
    subject, routeKey: route.key, params: route.params, query: Object.fromEntries(ctx.url.searchParams), clock,
  });
  if (!decision.allow) return reject(decision.status, decision.reason, subject);

  // 5. audit (allow), status akhir diperbarui saat respons selesai
  const auditId = writeAudit(ctx, { decision: 'allow', reason: 'OK', status: null, subject });

  if (route.target === 'gateway') {   // GET /audit
    const q = Object.fromEntries(ctx.url.searchParams);
    const afterId = Math.max(0, Number.parseInt(q.after, 10) || 0);
    const limit = Math.min(200, Math.max(1, Number.parseInt(q.limit, 10) || 50));
    audit.setStatus(auditId, 200);
    return sendJson(res, 200, { data: audit.list({ subject, afterId, limit }).map((r) => ({ ...r })) });
  }

  // 6. teruskan ke service dengan X-Gateway-Secret
  res.on('finish', () => { try { audit.setStatus(auditId, res.statusCode); } catch { /* abaikan */ } });
  forward(req, res, TARGETS[route.target], { requestId: ctx.id, gatewaySecret: config.gatewaySecret });
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  res.on('finish', () => console.log(`[gateway] ${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - started}ms)`));
  try {
    delete req.headers['x-gateway-secret'];   // header internal tidak boleh datang dari client
    const ctx = newContext(req);
    res.setHeader('X-Request-ID', ctx.id);
    if ((req.method === 'GET' || req.method === 'HEAD') && isStaticPath(ctx.pathname)) return await serveStatic(req, res, ctx.pathname);
    if (ctx.pathname.startsWith('/auth/')) return await handleAuth(req, res, ctx);
    if (config.demoMode && req.method === 'GET' && ctx.pathname === '/demo/accounts') return handleDemo(req, res);
    return await handleProtected(req, res, ctx);
  } catch (e) {
    console.error('[gateway] kesalahan:', e);
    if (!res.headersSent) sendJson(res, 500, { error: 'Kesalahan internal', reason: 'KESALAHAN_INTERNAL' });
    else res.destroy();
  }
});

server.listen(config.port, config.host, () => {
  console.log(`[gateway] PEP aktif di http://${config.host}:${config.port} (driver DB: ${db.driver})`);
  console.log(`[gateway] jam akses ${config.jamMulai}-${config.jamSelesai} ${config.jamTz}`);
  if (config.demoMode) console.log('[gateway] DEMO_MODE=true: panel akun demo & simulator jam akses AKTIF (matikan di luar demo)');
});

function shutdown() { server.close(); try { db.close(); } catch { /* sudah tertutup */ } process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
