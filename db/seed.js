'use strict';
// Mengatur ulang database ke data awal (aman dijalankan berulang untuk demo).
//   npm run seed
// Syarat soal: min. 1 admin, 2 dosen, 3 mahasiswa, 2 kelas dosen berbeda, tiap user 1 device.
const fs = require('node:fs');
const path = require('node:path');
const env = require('../shared/env');
const { openDb } = require('../shared/db');
const { hashPassword } = require('../shared/password');

const TABLES = ['audit_log', 'refresh_tokens', 'service_clients', 'transkrip', 'nilai', 'kelas', 'devices', 'users'];

async function runSeed({ dbPath, password, clientId, clientSecret }) {
  const db = openDb(dbPath);
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of TABLES) db.exec(`DROP TABLE IF EXISTS ${t}`);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  const pw = await hashPassword(password);
  const addUser = db.prepare('INSERT INTO users (username, nama, password_hash, role, nim) VALUES (?, ?, ?, ?, ?)');
  const addDevice = db.prepare('INSERT INTO devices (user_id, device_id, label) VALUES (?, ?, ?)');
  const id = (r) => Number(r.lastInsertRowid);

  // Urutan sisip menghasilkan id: admin=1, dosen01=2, mhs01=3, dosen02=4, mhs02=5, mhs03=6
  const admin = id(addUser.run('admin01', 'Admin Prodi', pw, 'admin', null));
  const d1 = id(addUser.run('dosen01', 'Dr. Budi Santoso', pw, 'dosen', null));
  const m1 = id(addUser.run('mhs01', 'Andi Pratama', pw, 'mahasiswa', '237006001'));
  const d2 = id(addUser.run('dosen02', 'Dr. Siti Rahma', pw, 'dosen', null));
  const m2 = id(addUser.run('mhs02', 'Dewi Lestari', pw, 'mahasiswa', '237006002'));
  const m3 = id(addUser.run('mhs03', 'Rizky Maulana', pw, 'mahasiswa', '237006003'));

  addDevice.run(admin, 'DEV-ADM-001', 'Laptop Admin');
  addDevice.run(d1, 'DEV-DSN-001', 'Laptop Dosen 1');
  addDevice.run(d2, 'DEV-DSN-002', 'Laptop Dosen 2');
  addDevice.run(m1, 'DEV-MHS-001', 'Perangkat Mahasiswa 1');
  addDevice.run(m2, 'DEV-MHS-002', 'Perangkat Mahasiswa 2');
  addDevice.run(m3, 'DEV-MHS-003', 'Perangkat Mahasiswa 3');

  const addKelas = db.prepare('INSERT INTO kelas (kode_mk, nama_mk, nama_kelas, sks, tahun_ajaran, dosen_id) VALUES (?, ?, ?, ?, ?, ?)');
  const k1 = id(addKelas.run('KP70065004', 'Keamanan Informasi', 'A', 3, '2025/2026', d1));
  const k2 = id(addKelas.run('IF70011003', 'Pemrograman Web', 'A', 3, '2025/2026', d2));

  const addNilai = db.prepare('INSERT INTO nilai (kelas_id, mahasiswa_id, nilai_angka) VALUES (?, ?, ?)');
  [[k1, m1, 85], [k1, m2, 78], [k1, m3, 90], [k2, m1, 88], [k2, m2, 72], [k2, m3, 65]]
    .forEach(([k, m, v]) => addNilai.run(k, m, v));

  db.prepare('INSERT INTO service_clients (client_id, client_secret_hash, scope) VALUES (?, ?, ?)')
    .run(clientId, await hashPassword(clientSecret), 'transkrip:sync');

  db.close();
}

module.exports = { runSeed };

if (require.main === module) {
  runSeed({
    dbPath: env.resolvePath(env.need('DB_PATH')),
    password: env.need('SEED_DEFAULT_PASSWORD'),
    clientId: env.need('SERVICE_CLIENT_ID'),
    clientSecret: env.need('SERVICE_CLIENT_SECRET'),
  }).then(() => {
    console.log('[seed] Database diatur ulang.');
    console.log('[seed] Akun: admin01, dosen01, dosen02, mhs01, mhs02, mhs03 (password dari SEED_DEFAULT_PASSWORD)');
  }).catch((e) => { console.error('[seed] Gagal:', e); process.exit(1); });
}
