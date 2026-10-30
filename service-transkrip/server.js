'use strict';
// SERVICE TRANSKRIP (port 3002). Data transkrip mahasiswa. Hanya dapat dicapai lewat gateway.
const http = require('node:http');
const fs = require('node:fs');
const env = require('../shared/env');
const { openDb } = require('../shared/db');
const jwt = require('../shared/jwt');
const { HttpError, Router, readJson, sendJson, makeServiceListener } = require('../shared/http');
const { createGuard } = require('./guard');

const port = env.int('TRANSKRIP_PORT', 3002);
const db = openDb(env.resolvePath(env.need('DB_PATH')));
const guard = createGuard({
  gatewaySecret: env.need('GATEWAY_SECRET'),
  issuer: env.need('JWT_ISSUER'),
  publicKey: jwt.loadPublicKey(fs.readFileSync(env.resolvePath(env.need('JWT_PUBLIC_KEY_PATH')))),  // hanya public key
});

const qNimSaya = db.prepare('SELECT nim FROM users WHERE id = ?');
const qMahasiswa = db.prepare("SELECT nim, nama FROM users WHERE nim = ? AND role = 'mahasiswa'");
const qTranskrip = db.prepare(`SELECT kelas_id, kode_mk, nama_mk, sks, tahun_ajaran, nilai_angka, nilai_huruf
  FROM transkrip WHERE nim = ? ORDER BY tahun_ajaran, kode_mk`);
const qKelas = db.prepare('SELECT id, status FROM kelas WHERE id = ?');
const qNimAda = db.prepare("SELECT 1 AS ok FROM users WHERE nim = ? AND role = 'mahasiswa'");
const qUpsert = db.prepare(`INSERT INTO transkrip (nim, kelas_id, kode_mk, nama_mk, sks, tahun_ajaran, nilai_angka, nilai_huruf, synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(nim, kelas_id) DO UPDATE SET kode_mk = excluded.kode_mk, nama_mk = excluded.nama_mk, sks = excluded.sks,
    tahun_ajaran = excluded.tahun_ajaran, nilai_angka = excluded.nilai_angka, nilai_huruf = excluded.nilai_huruf,
    synced_at = excluded.synced_at`);

const huruf = (n) => (n >= 85 ? 'A' : n >= 70 ? 'B' : n >= 55 ? 'C' : n >= 40 ? 'D' : 'E');
const str = (v, max = 120) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

const router = new Router();

// Mahasiswa: hanya NIM sendiri. Admin: semua. Role lain (dosen, service) ditolak.
router.add('GET', '/transkrip/:nim', (req, res, { auth, params }) => {
  if (auth.typ !== 'access') throw new HttpError(403, 'Endpoint ini untuk token user', 'BUKAN_TOKEN_USER');
  if (auth.role === 'mahasiswa') {
    const me = qNimSaya.get(Number(auth.sub));
    if (!me || me.nim !== params.nim) throw new HttpError(403, 'Anda hanya boleh mengakses NIM milik sendiri', 'BUKAN_PEMILIK_NIM');
  } else if (auth.role !== 'admin') {
    throw new HttpError(403, 'Peran Anda tidak diizinkan', 'ROLE_TIDAK_DIIZINKAN');
  }
  const mhs = qMahasiswa.get(params.nim);
  if (!mhs) throw new HttpError(404, 'NIM tidak ditemukan', 'NIM_TIDAK_DITEMUKAN');
  const rows = qTranskrip.all(params.nim).map((r) => ({ ...r }));
  sendJson(res, 200, {
    nim: mhs.nim, nama: mhs.nama, total_sks: rows.reduce((s, r) => s + r.sks, 0), mata_kuliah: rows,
  });
});

// Hanya token SERVICE dengan scope transkrip:sync. Token user mana pun ditolak.
// Idempotent: upsert berdasarkan (nim, kelas_id), aman dicoba ulang.
router.add('POST', '/transkrip/sinkron', async (req, res, { auth }) => {
  if (auth.typ !== 'service' || auth.role !== 'service') throw new HttpError(403, 'Endpoint ini hanya untuk token service', 'BUKAN_TOKEN_SERVICE');
  if (auth.scope !== 'transkrip:sync') throw new HttpError(403, 'Scope token tidak sesuai', 'SCOPE_SERVICE_TIDAK_SESUAI');

  const b = await readJson(req);
  const invalid = (m) => new HttpError(422, m, 'PAYLOAD_TIDAK_VALID');
  if (!Number.isInteger(b.kelas_id) || !str(b.kode_mk, 32) || !str(b.nama_mk) || !Number.isInteger(b.sks) || b.sks < 0
      || !str(b.tahun_ajaran, 16) || !Array.isArray(b.nilai) || b.nilai.length === 0 || b.nilai.length > 500) throw invalid('Payload sinkron tidak valid');
  for (const n of b.nilai) {
    if (!n || typeof n.nim !== 'string' || typeof n.nilai_angka !== 'number' || !Number.isFinite(n.nilai_angka)
        || n.nilai_angka < 0 || n.nilai_angka > 100) throw invalid('Data nilai tidak valid');
    if (!qNimAda.get(n.nim)) throw invalid(`NIM tidak dikenal: ${n.nim}`);
  }
  // Pertahanan berlapis: hanya kelas yang sudah FINAL di database yang boleh disinkronkan.
  const kelas = qKelas.get(b.kelas_id);
  if (!kelas) throw new HttpError(404, 'Kelas tidak ditemukan', 'KELAS_TIDAK_DITEMUKAN');
  if (kelas.status !== 'final') throw new HttpError(409, 'Kelas belum final', 'KELAS_BELUM_FINAL');

  const now = new Date().toISOString();
  db.transaction(() => {
    for (const n of b.nilai) {
      qUpsert.run(n.nim, b.kelas_id, b.kode_mk, b.nama_mk, b.sks, b.tahun_ajaran, n.nilai_angka, huruf(n.nilai_angka), now);
    }
  })();
  sendJson(res, 200, { kelas_id: b.kelas_id, jumlah_disinkron: b.nilai.length });
});

const server = http.createServer(makeServiceListener({ name: 'transkrip', router, guard }));
server.listen(port, env.opt('SERVICE_HOST', '127.0.0.1'), () => console.log(`[transkrip] aktif di port ${port} (driver DB: ${db.driver})`));
const stop = () => { server.close(); try { db.close(); } catch { /* sudah tertutup */ } process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
