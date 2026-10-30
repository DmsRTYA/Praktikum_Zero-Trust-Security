'use strict';
// Policy Administrator (PA): login, refresh, logout, dan token service.
// Setiap fungsi mengembalikan { status, json, decision, reason, subject } agar server
// dapat mencatat audit secara seragam. Pesan ke client sengaja SERAGAM (tidak membocorkan
// penyebab); alasan rinci hanya masuk audit log.
const crypto = require('node:crypto');
const jwt = require('../shared/jwt');
const { hashPassword, verifyPassword } = require('../shared/password');

const MSG_LOGIN = 'Kredensial atau device tidak valid';
const MSG_REFRESH = 'Refresh token tidak valid';
const MSG_CLIENT = 'Client service tidak valid';

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const R = (status, json, decision, reason, subject = null) => ({ status, json, decision, reason, subject });

function createAuth({ db, config }) {
  const qUserByName = db.prepare('SELECT id, nama, password_hash, role, nim FROM users WHERE username = ? AND is_active = 1');
  const qDevice = db.prepare('SELECT 1 AS ok FROM devices WHERE user_id = ? AND device_id = ? AND is_active = 1');
  const qInsertRt = db.prepare('INSERT INTO refresh_tokens (user_id, device_id, token_hash, issued_at, expires_at) VALUES (?, ?, ?, ?, ?)');
  const qRt = db.prepare(`SELECT rt.id, rt.user_id, rt.device_id, rt.expires_at, rt.revoked_at, u.nama, u.role, u.nim, u.is_active
    FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE rt.token_hash = ?`);
  const qRevoke = db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL');
  const qClient = db.prepare('SELECT client_id, client_secret_hash, scope FROM service_clients WHERE client_id = ? AND is_active = 1');

  // Hash pura-pura: dipakai saat user tidak ada supaya waktu respons tetap sama.
  let dummy = null;
  const dummyHash = async () => (dummy ??= await hashPassword(crypto.randomBytes(16).toString('hex')));

  const userView = (u) => ({ id: u.id, nama: u.nama, role: u.role, nim: u.nim ?? null });
  const accessToken = (u, deviceId) => jwt.sign(
    { sub: String(u.id), role: u.role, typ: 'access', did: deviceId },
    config.privateKey, { ttlSeconds: config.accessTtl, issuer: config.issuer },
  );

  async function login(ctx, body) {
    const { username, password } = body;
    const sane = typeof username === 'string' && typeof password === 'string'
      && username.length > 0 && username.length <= 64 && password.length > 0 && password.length <= 256;
    const user = sane ? qUserByName.get(username) : null;
    const passwordOk = await verifyPassword(sane ? password : 'x', user ? user.password_hash : await dummyHash());
    const fail = (reason, u) => R(401, { error: MSG_LOGIN },
      'deny', reason, u ? { type: 'user', id: String(u.id), role: u.role } : null);

    if (!user || !passwordOk) return fail('KREDENSIAL_TIDAK_VALID', null);
    if (!ctx.deviceId) return fail('DEVICE_TIDAK_ADA_DI_HEADER', user);
    if (!qDevice.get(user.id, ctx.deviceId)) return fail('DEVICE_TIDAK_TERDAFTAR', user);

    const refreshToken = crypto.randomBytes(32).toString('base64url');
    const now = new Date();
    const expires = new Date(now.getTime() + config.refreshTtlHours * 3600 * 1000);
    qInsertRt.run(user.id, ctx.deviceId, sha256(refreshToken), now.toISOString(), expires.toISOString());

    return R(200, {
      access_token: accessToken(user, ctx.deviceId), refresh_token: refreshToken,
      token_type: 'Bearer', expires_in: config.accessTtl, user: userView(user),
    }, 'allow', 'OK', { type: 'user', id: String(user.id), role: user.role });
  }

  function lookupRefresh(body) {
    const token = typeof body.refresh_token === 'string' ? body.refresh_token : '';
    if (token.length < 20 || token.length > 200) return null;
    return qRt.get(sha256(token)) || null;
  }
  const refreshUsable = (rt) => rt && !rt.revoked_at && rt.is_active && new Date(rt.expires_at) > new Date();

  async function refresh(ctx, body) {
    const rt = lookupRefresh(body);
    const subject = rt ? { type: 'user', id: String(rt.user_id), role: rt.role } : null;
    const fail = (reason) => R(401, { error: MSG_REFRESH }, 'deny', reason, subject);
    if (!refreshUsable(rt)) return fail('REFRESH_TOKEN_TIDAK_VALID');
    if (!ctx.deviceId) return fail('DEVICE_TIDAK_ADA_DI_HEADER');
    if (ctx.deviceId !== rt.device_id || !qDevice.get(rt.user_id, ctx.deviceId)) return fail('DEVICE_TIDAK_TERDAFTAR');
    const u = { id: rt.user_id, role: rt.role, nama: rt.nama, nim: rt.nim };
    return R(200, {
      access_token: accessToken(u, ctx.deviceId), token_type: 'Bearer',
      expires_in: config.accessTtl, user: userView(u),
    }, 'allow', 'OK', subject);
  }

  async function logout(ctx, body) {
    const rt = lookupRefresh(body);
    const subject = rt ? { type: 'user', id: String(rt.user_id), role: rt.role } : null;
    if (!refreshUsable(rt)) return R(401, { error: MSG_REFRESH }, 'deny', 'REFRESH_TOKEN_TIDAK_VALID', subject);
    qRevoke.run(new Date().toISOString(), rt.id);
    return R(200, { message: 'Logout berhasil' }, 'allow', 'OK', subject);
  }

  async function serviceToken(ctx, body) {
    const { client_id: clientId, client_secret: secret } = body;
    const sane = typeof clientId === 'string' && typeof secret === 'string' && clientId.length <= 64 && secret.length <= 256;
    const client = sane ? qClient.get(clientId) : null;
    const ok = await verifyPassword(sane ? secret : 'x', client ? client.client_secret_hash : await dummyHash());
    if (!client || !ok) return R(401, { error: MSG_CLIENT }, 'deny', 'CLIENT_SERVICE_TIDAK_VALID', null);
    const token = jwt.sign(
      { sub: client.client_id, role: 'service', typ: 'service', scope: client.scope },
      config.privateKey, { ttlSeconds: config.serviceTtl, issuer: config.issuer },
    );
    return R(200, { access_token: token, token_type: 'Bearer', expires_in: config.serviceTtl },
      'allow', 'OK', { type: 'service', id: client.client_id, role: 'service' });
  }

  return { login, refresh, logout, serviceToken };
}

module.exports = { createAuth };
