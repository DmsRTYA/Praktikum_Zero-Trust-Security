'use strict';
// ALAT UJI LOKAL: membuat token PALSU untuk membuktikan bahwa gateway dan service MENOLAKNYA.
//   node scripts/forge-token.js <mode> <token-asli>
// Mode:
//   tamper  : isi diubah (role menjadi admin), tanda tangan asli dibiarkan -> tidak cocok lagi
//   none    : header alg "none" tanpa tanda tangan
//   hs256   : ditandatangani HS256 memakai PUBLIC KEY sebagai secret (serangan algorithm confusion)
//   foreign : ditandatangani RS256 dengan private key LAIN (bukan milik gateway)
//   expired : ditandatangani private key ASLI (keys/private.pem) tetapi sudah kedaluwarsa
const crypto = require('node:crypto');
const fs = require('node:fs');
const env = require('../shared/env');
const jwt = require('../shared/jwt');

const MODES = ['tamper', 'none', 'hs256', 'foreign', 'expired'];
const [mode, token] = process.argv.slice(2);
if (!MODES.includes(mode) || !token) {
  console.error(`Pemakaian: node scripts/forge-token.js <${MODES.join('|')}> <token-asli>`);
  process.exit(1);
}
const parts = token.split('.');
let payload;
try {
  if (parts.length !== 3) throw new Error('bukan JWT');
  payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
} catch { console.error('Token asli tidak valid: harus berupa JWT (3 bagian dipisah titik).'); process.exit(1); }

const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const issuer = env.opt('JWT_ISSUER', 'zt-gateway');
let out;

if (mode === 'tamper') {
  out = `${parts[0]}.${enc({ ...payload, role: 'admin' })}.${parts[2]}`;
} else if (mode === 'none') {
  out = `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ ...payload, role: 'admin' })}.`;
} else if (mode === 'hs256') {
  const publicPem = fs.readFileSync(env.resolvePath(env.opt('JWT_PUBLIC_KEY_PATH', './keys/public.pem')), 'utf8');
  const data = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ ...payload, role: 'admin' })}`;
  out = `${data}.${crypto.createHmac('sha256', publicPem).update(data).digest('base64url')}`;
} else if (mode === 'foreign') {
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  out = jwt.sign(payload, other.privateKey, { ttlSeconds: 600, issuer });
} else {
  const key = jwt.loadPrivateKey(fs.readFileSync(env.resolvePath(env.need('JWT_PRIVATE_KEY_PATH'))));
  out = jwt.sign(payload, key, { ttlSeconds: -60, issuer });
}
console.log(out);
