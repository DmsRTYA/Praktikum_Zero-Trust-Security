'use strict';
// Dua pemeriksaan INDEPENDEN (assume breach): keduanya harus lulus.
//   1. X-Gateway-Secret benar  -> service tidak bisa diakses langsung
//   2. Token RS256 valid (tanda tangan, exp, iss) -> secret saja TIDAK cukup
// Identitas HANYA berasal dari token terverifikasi, bukan dari header apa pun.
const jwt = require('../shared/jwt');
const { safeEqual } = require('../shared/safeEqual');
const { HttpError, bearerToken } = require('../shared/http');

function createGuard({ gatewaySecret, publicKey, issuer }) {
  return function guard(req) {
    if (!safeEqual(req.headers['x-gateway-secret'], gatewaySecret)) {
      throw new HttpError(403, 'Akses langsung ke service tidak diizinkan', 'GATEWAY_SECRET_TIDAK_VALID');
    }
    const token = bearerToken(req);
    if (!token) throw new HttpError(401, 'Token akses diperlukan', 'TOKEN_TIDAK_ADA');
    let claims;
    try { claims = jwt.verify(token, publicKey, { issuer }); }
    catch (e) { throw new HttpError(401, e.message, e.code || 'TOKEN_TIDAK_VALID'); }
    if (claims.typ !== 'access' && claims.typ !== 'service') throw new HttpError(401, 'Jenis token tidak sesuai', 'TIPE_TOKEN_SALAH');
    return { sub: claims.sub, role: claims.role, typ: claims.typ, scope: claims.scope };
  };
}

module.exports = { createGuard };
