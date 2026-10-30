'use strict';
// Menyiapkan secret lokal: key pair RS256 dan file .env berisi secret acak.
//   npm run setup            (tidak menimpa yang sudah ada)
//   npm run setup -- --force (membuat ulang semuanya)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const force = process.argv.includes('--force');
const rnd = () => crypto.randomBytes(32).toString('hex');

const keysDir = path.join(ROOT, 'keys');
const privFile = path.join(keysDir, 'private.pem');
const pubFile = path.join(keysDir, 'public.pem');
fs.mkdirSync(keysDir, { recursive: true });

if (force || !fs.existsSync(privFile) || !fs.existsSync(pubFile)) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  fs.writeFileSync(privFile, privateKey, { mode: 0o600 });
  fs.writeFileSync(pubFile, publicKey);
  console.log('[setup] Key pair RS256 dibuat di keys/ (private.pem hanya untuk gateway)');
} else {
  console.log('[setup] Key pair sudah ada, dilewati');
}

const envFile = path.join(ROOT, '.env');
if (force || !fs.existsSync(envFile)) {
  const content = `# Dibuat oleh "npm run setup". JANGAN di-commit.
DB_PATH=./db/nilai.db
JWT_ISSUER=zt-gateway
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem

GATEWAY_SECRET=${rnd()}
GATEWAY_HOST=127.0.0.1
GATEWAY_PORT=3000
NILAI_PORT=3001
TRANSKRIP_PORT=3002
NILAI_URL=http://127.0.0.1:3001
TRANSKRIP_URL=http://127.0.0.1:3002
GATEWAY_URL=http://127.0.0.1:3000

ACCESS_TOKEN_TTL=10m
SERVICE_TOKEN_TTL=5m
REFRESH_TOKEN_TTL_HOURS=24

JAM_AKSES_MULAI=07:00
JAM_AKSES_SELESAI=21:00
JAM_AKSES_TZ=Asia/Jakarta

SERVICE_CLIENT_ID=service-nilai
SERVICE_CLIENT_SECRET=${rnd()}

# Password akun demo (hanya dipakai "npm run seed")
SEED_DEFAULT_PASSWORD=password123

# true = panel akun demo di halaman login + simulator jam akses. Set false di luar demo.
DEMO_MODE=true
`;
  fs.writeFileSync(envFile, content, { mode: 0o600 });
  console.log('[setup] File .env dibuat dengan secret acak');
} else {
  console.log('[setup] .env sudah ada, dilewati');
}
console.log('[setup] Selesai. Langkah berikutnya: npm run seed  lalu  npm run dev');
