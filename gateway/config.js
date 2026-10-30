'use strict';
const fs = require('node:fs');
const env = require('../shared/env');
const { loadPrivateKey, loadPublicKey } = require('../shared/jwt');

const jam = (name, def) => {
  const v = env.opt(name, def);
  if (!/^([01]\d|2[0-4]):[0-5]\d$/.test(v)) { console.error(`[config] ${name} harus berformat HH:MM, nilai: ${v}`); process.exit(1); }
  return v;
};

module.exports = {
  host: env.opt('GATEWAY_HOST', '127.0.0.1'),
  port: env.int('GATEWAY_PORT', 3000),
  dbPath: env.resolvePath(env.need('DB_PATH')),
  issuer: env.need('JWT_ISSUER'),
  // Private key HANYA dimuat di gateway.
  privateKey: loadPrivateKey(fs.readFileSync(env.resolvePath(env.need('JWT_PRIVATE_KEY_PATH')))),
  publicKey: loadPublicKey(fs.readFileSync(env.resolvePath(env.need('JWT_PUBLIC_KEY_PATH')))),
  gatewaySecret: env.need('GATEWAY_SECRET'),
  nilaiUrl: env.need('NILAI_URL'),
  transkripUrl: env.need('TRANSKRIP_URL'),
  accessTtl: env.duration('ACCESS_TOKEN_TTL', '10m'),
  serviceTtl: env.duration('SERVICE_TOKEN_TTL', '5m'),
  refreshTtlHours: env.int('REFRESH_TOKEN_TTL_HOURS', 24),
  jamMulai: jam('JAM_AKSES_MULAI', '07:00'),
  jamSelesai: jam('JAM_AKSES_SELESAI', '21:00'),
  jamTz: env.opt('JAM_AKSES_TZ', 'Asia/Jakarta'),
  demoMode: env.bool('DEMO_MODE', false),
  seedPassword: env.opt('SEED_DEFAULT_PASSWORD', ''),
};
