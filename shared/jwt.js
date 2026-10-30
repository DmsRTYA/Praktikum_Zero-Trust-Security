'use strict';
// JWT RS256 minimal. Gateway menandatangani dengan private key; gateway dan service
// memverifikasi dengan public key. Algoritma DIKUNCI ke RS256 (menolak "none"/HS256).
const crypto = require('node:crypto');

const b64u = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const B64URL = /^[A-Za-z0-9_-]+$/;

class JwtError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

function sign(payload, privateKey, { ttlSeconds, issuer }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const body = { ...payload, iss: issuer, iat: now, exp: now + ttlSeconds, jti: crypto.randomUUID() };
  const data = `${b64u(header)}.${b64u(body)}`;
  const signature = crypto.sign('sha256', Buffer.from(data), privateKey);
  return `${data}.${signature.toString('base64url')}`;
}

function verify(token, publicKey, { issuer, nowSeconds } = {}) {
  const bad = () => new JwtError('TOKEN_TIDAK_VALID', 'Token tidak valid');
  if (typeof token !== 'string' || token.length > 4096) throw bad();
  const parts = token.split('.');
  if (parts.length !== 3 || !parts.every((p) => p.length > 0 && B64URL.test(p))) throw bad();

  let header, payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { throw bad(); }

  // Kunci algoritma: mencegah serangan "alg: none" dan algorithm confusion.
  if (!header || header.alg !== 'RS256' || header.typ !== 'JWT') throw bad();

  let valid = false;
  try {
    valid = crypto.verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], 'base64url'));
  } catch { throw bad(); }
  if (!valid) throw bad();

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw bad();
  if (issuer && payload.iss !== issuer) throw bad();
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number') throw bad();
  if (now >= payload.exp) throw new JwtError('TOKEN_KEDALUWARSA', 'Token kedaluwarsa');
  if (typeof payload.nbf === 'number' && now < payload.nbf) throw bad();
  return payload;
}

const loadPrivateKey = (pem) => crypto.createPrivateKey(pem);
const loadPublicKey = (pem) => crypto.createPublicKey(pem);

module.exports = { sign, verify, JwtError, loadPrivateKey, loadPublicKey };
