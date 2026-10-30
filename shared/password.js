'use strict';
// Hash password dengan scrypt (bawaan Node, memory-hard). Format:
//   scrypt$N$r$p$salt(b64)$hash(b64)
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

const N = 16384, R = 8, P = 1, KEYLEN = 64;
const OPTS = (n, r, p) => ({ N: n, r, p, maxmem: 128 * n * r * 2 });

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const dk = await scrypt(password, salt, KEYLEN, OPTS(N, R, P));
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${dk.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const dk = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, OPTS(+n, +r, +p));
  return crypto.timingSafeEqual(dk, expected);
}

module.exports = { hashPassword, verifyPassword };
