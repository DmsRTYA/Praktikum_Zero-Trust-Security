'use strict';
// SERVICE NILAI (port 3001). Data nilai dan kelas. Hanya dapat dicapai lewat gateway.
// Gateway memutuskan BOLEH/TIDAK; service tetap membatasi DATA berdasarkan token
// terverifikasi (pertahanan berlapis).
const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
const env = require('../shared/env');
const { openDb } = require('../shared/db');
const jwt = require('../shared/jwt');
const { HttpError, Router, readJson, sendJson, makeServiceListener } = require('../shared/http');
const { createGuard } = require('./guard');
const { createTranskripClient, SyncError } = require('./transkripClient');

const port = env.int('NILAI_PORT', 3001);
const db = openDb(env.resolvePath(env.need('DB_PATH')));
const guard = createGuard({
  gatewaySecret: env.need('GATEWAY_SECRET'),
  issuer: env.need('JWT_ISSUER'),
  publicKey: jwt.loadPublicKey(fs.readFileSync(env.resolvePath(env.need('JWT_PUBLIC_KEY_PATH')))),  // hanya public key
});
const transkrip = createTranskripClient({
  gatewayUrl: env.need('GATEWAY_URL'), clientId: env.need('SERVICE_CLIENT_ID'), clientSecret: env.need('SERVICE_CLIENT_SECRET'),
});

const qNimSaya = db.prepare('SELECT nim FROM users WHERE id = ?');
const NILAI_COLS = `n.id, n.kelas_id, k.kode_mk, k.nama_mk, k.sks, k.tahun_ajaran, u.nim, u.nama AS nama_mahasiswa,
  n.nilai_angka, k.status AS status_kelas`;
const qNilaiMahasiswa = db.prepare(`SELECT ${NILAI_COLS} FROM nilai n JOIN kelas k ON k.id = n.kelas_id JOIN users u ON u.id = n.mahasiswa_id
  WHERE n.mahasiswa_id = ? AND k.status = 'final' ORDER BY k.kode_mk`);
const qKelasDosen = db.prepare(`SELECT id, kode_mk, nama_mk, nama_kelas, sks, tahun_ajaran, status FROM kelas WHERE dosen_id = ? ORDER BY id`);
const qNilaiDosen = db.prepare(`SELECT ${NILAI_COLS} FROM nilai n JOIN kelas k ON k.id = n.kelas_id JOIN users u ON u.id = n.mahasiswa_id
  WHERE k.dosen_id = ? ORDER BY k.id, u.nim`);
const qUpdateNilai = db.prepare(`UPDATE nilai SET nilai_angka = ?, updated_at = ?
  WHERE id = ? AND kelas_id IN (SELECT id FROM kelas WHERE dosen_id = ? AND status = 'draft')`);
const qNilaiById = db.prepare(`SELECT n.id, k.dosen_id, k.status FROM nilai n JOIN kelas k ON k.id = n.kelas_id WHERE n.id = ?`);
const qKelas = db.prepare('SELECT id, kode_mk, nama_mk, sks, tahun_ajaran, dosen_id, status FROM kelas WHERE id = ?');
const qNilaiKelas = db.prepare(`SELECT u.nim, n.nilai_angka FROM nilai n JOIN users u ON u.id = n.mahasiswa_id WHERE n.kelas_id = ? ORDER BY u.nim`);
const qSetFinal = db.prepare("UPDATE kelas SET status = 'final', finalized_at = ? WHERE id = ? AND dosen_id = ? AND status = 'draft'");
const qSetDraft = db.prepare("UPDATE kelas SET status = 'draft', finalized_at = NULL WHERE id = ? AND status = 'final'");

function requireUser(auth, roles) {
  if (auth.typ !== 'access') throw new HttpError(403, 'Endpoint ini untuk token user', 'BUKAN_TOKEN_USER');
  if (!roles.includes(auth.role)) throw new HttpError(403, 'Peran Anda tidak diizinkan untuk aksi ini', 'ROLE_TIDAK_DIIZINKAN');
}
const plain = (rows) => rows.map((r) => ({ ...r }));

const router = new Router();

// GET /nilai -> { kelas: [...], data: [...] }. Filter data berdasarkan identitas di TOKEN.
router.add('GET', '/nilai', (req, res, { auth, query }) => {
  requireUser(auth, ['mahasiswa', 'dosen']);
  const uid = Number(auth.sub);
  let kelasFilter = null;
  if (query.kelas_id !== undefined) {
    kelasFilter = Number(query.kelas_id);
    if (!Number.isInteger(kelasFilter)) throw new HttpError(422, 'kelas_id harus berupa angka', 'PARAMETER_TIDAK_VALID');
  }

  if (auth.role === 'mahasiswa') {
    const me = qNimSaya.get(uid);
    if (query.nim && (!me || query.nim !== me.nim)) throw new HttpError(403, 'Anda hanya boleh mengakses NIM milik sendiri', 'BUKAN_PEMILIK_NIM');
    // Mahasiswa hanya melihat nilai miliknya DAN pada kelas yang sudah final.
    let rows = plain(qNilaiMahasiswa.all(uid));
    if (kelasFilter !== null) rows = rows.filter((r) => r.kelas_id === kelasFilter);
    const seen = new Map();
    rows.forEach((r) => seen.set(r.kelas_id, { id: r.kelas_id, kode_mk: r.kode_mk, nama_mk: r.nama_mk, sks: r.sks, tahun_ajaran: r.tahun_ajaran, status: r.status_kelas }));
    return sendJson(res, 200, { kelas: [...seen.values()], data: rows });
  }

  // Dosen: hanya kelas yang diampu (termasuk kelas yang belum punya peserta).
  const kelas = plain(qKelasDosen.all(uid));
  if (kelasFilter !== null && !kelas.some((k) => k.id === kelasFilter)) throw new HttpError(403, 'Anda bukan dosen pengampu kelas ini', 'BUKAN_PENGAMPU');
  let rows = plain(qNilaiDosen.all(uid));
  if (kelasFilter !== null) rows = rows.filter((r) => r.kelas_id === kelasFilter);
  if (query.nim) rows = rows.filter((r) => r.nim === query.nim);
  sendJson(res, 200, { kelas, data: rows });
});

// PUT /nilai/:id -> update ATOMIK bersyarat (pengampu + status draft): aman dari race dengan finalisasi.
router.add('PUT', '/nilai/:id', async (req, res, { auth, params }) => {
  requireUser(auth, ['dosen']);
  const body = await readJson(req);
  const v = body.nilai_angka;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) {
    throw new HttpError(422, 'nilai_angka harus berupa angka 0 sampai 100', 'NILAI_TIDAK_VALID');
  }
  const id = Number(params.id);
  const r = qUpdateNilai.run(v, new Date().toISOString(), id, Number(auth.sub));
  if (r.changes === 0) {
    const row = qNilaiById.get(id);
    if (!row) throw new HttpError(404, 'Nilai tidak ditemukan', 'NILAI_TIDAK_DITEMUKAN');
    if (row.dosen_id !== Number(auth.sub)) throw new HttpError(403, 'Anda bukan dosen pengampu kelas ini', 'BUKAN_PENGAMPU');
    throw new HttpError(409, 'Kelas sudah final, nilai tidak dapat diubah', 'KELAS_SUDAH_FINAL');
  }
  sendJson(res, 200, { id, nilai_angka: v });
});

// POST /kelas/:id/finalisasi
//   1) set status final (transaksi singkat, bersyarat draft)  2) sinkron ke transkrip LEWAT GATEWAY
//   3) bila sinkron gagal: update kompensasi kembali ke draft. Tidak ada transaksi yang ditahan
//      selama panggilan HTTP, supaya tidak mengunci database bersama.
router.add('POST', '/kelas/:id/finalisasi', async (req, res, { auth, params, requestId }) => {
  requireUser(auth, ['dosen']);
  const kelasId = Number(params.id);
  const kelas = qKelas.get(kelasId);
  if (!kelas) throw new HttpError(404, 'Kelas tidak ditemukan', 'KELAS_TIDAK_DITEMUKAN');
  if (kelas.dosen_id !== Number(auth.sub)) throw new HttpError(403, 'Anda bukan dosen pengampu kelas ini', 'BUKAN_PENGAMPU');
  if (kelas.status === 'final') throw new HttpError(409, 'Kelas sudah difinalisasi', 'KELAS_SUDAH_FINAL');

  const peserta = qNilaiKelas.all(kelasId);
  if (peserta.length === 0) throw new HttpError(422, 'Kelas belum memiliki peserta', 'KELAS_TIDAK_ADA_PESERTA');
  if (peserta.some((p) => p.nilai_angka === null)) throw new HttpError(422, 'Masih ada nilai yang kosong', 'NILAI_BELUM_LENGKAP');

  const locked = qSetFinal.run(new Date().toISOString(), kelasId, Number(auth.sub));
  if (locked.changes === 0) throw new HttpError(409, 'Kelas sudah difinalisasi', 'KELAS_SUDAH_FINAL');

  const correlationId = /^[0-9a-f-]{36}$/i.test(requestId) ? requestId : crypto.randomUUID();
  try {
    await transkrip.sinkron({
      kelas_id: kelas.id, kode_mk: kelas.kode_mk, nama_mk: kelas.nama_mk, sks: kelas.sks, tahun_ajaran: kelas.tahun_ajaran,
      nilai: peserta.map((p) => ({ nim: p.nim, nilai_angka: p.nilai_angka })),
    }, correlationId);
  } catch (e) {
    qSetDraft.run(kelasId);   // kompensasi
    const timeout = e instanceof SyncError && e.timeout;
    console.error(`[nilai] sinkron gagal untuk kelas ${kelasId}: ${e.message} -> status dikembalikan ke draft`);
    throw new HttpError(timeout ? 504 : 502, 'Sinkron ke Service Transkrip gagal. Status kelas dikembalikan ke draft.', 'SINKRON_GAGAL');
  }
  sendJson(res, 200, { kelas_id: kelasId, status: 'final', sinkron: 'berhasil', jumlah_disinkron: peserta.length });
});

const server = http.createServer(makeServiceListener({ name: 'nilai', router, guard }));
server.listen(port, env.opt('SERVICE_HOST', '127.0.0.1'), () => console.log(`[nilai] aktif di port ${port} (driver DB: ${db.driver})`));
const stop = () => { server.close(); try { db.close(); } catch { /* sudah tertutup */ } process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
