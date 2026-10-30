-- Skema database bersama (gateway, Service Nilai, Service Transkrip).
-- Status "final" melekat pada KELAS. Sebuah nilai dianggap final bila kelasnya final.
-- Baris di tabel "nilai" sekaligus menjadi data peserta kelas (nilai_angka NULL = belum dinilai).

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  nama          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('mahasiswa','dosen','admin')),
  nim           TEXT UNIQUE,
  is_active     INTEGER NOT NULL DEFAULT 1,
  CHECK ((role = 'mahasiswa' AND nim IS NOT NULL) OR (role <> 'mahasiswa' AND nim IS NULL))
);

CREATE TABLE devices (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  device_id     TEXT NOT NULL UNIQUE,
  label         TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  registered_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE kelas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kode_mk      TEXT NOT NULL,
  nama_mk      TEXT NOT NULL,
  nama_kelas   TEXT NOT NULL,
  sks          INTEGER NOT NULL,
  tahun_ajaran TEXT NOT NULL,
  dosen_id     INTEGER REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  finalized_at TEXT,
  UNIQUE (kode_mk, nama_kelas, tahun_ajaran)
);

CREATE TABLE nilai (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kelas_id     INTEGER NOT NULL REFERENCES kelas(id),
  mahasiswa_id INTEGER NOT NULL REFERENCES users(id),
  nilai_angka  REAL CHECK (nilai_angka IS NULL OR (nilai_angka >= 0 AND nilai_angka <= 100)),
  updated_at   TEXT,
  UNIQUE (kelas_id, mahasiswa_id)
);

CREATE TABLE transkrip (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nim          TEXT NOT NULL REFERENCES users(nim),
  kelas_id     INTEGER NOT NULL,
  kode_mk      TEXT NOT NULL,
  nama_mk      TEXT NOT NULL,
  sks          INTEGER NOT NULL,
  tahun_ajaran TEXT NOT NULL,
  nilai_angka  REAL NOT NULL,
  nilai_huruf  TEXT NOT NULL,
  synced_at    TEXT NOT NULL,
  UNIQUE (nim, kelas_id)
);

-- Refresh token disimpan sebagai HASH SHA-256, bukan nilai aslinya.
CREATE TABLE refresh_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  device_id  TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  issued_at  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE service_clients (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id          TEXT NOT NULL UNIQUE,
  client_secret_hash TEXT NOT NULL,
  scope              TEXT NOT NULL,
  is_active          INTEGER NOT NULL DEFAULT 1
);

-- correlation_id: menghubungkan panggilan antar-service dengan request user yang memicunya.
CREATE TABLE audit_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             TEXT NOT NULL,
  request_id     TEXT NOT NULL,
  correlation_id TEXT,
  subject_type   TEXT NOT NULL CHECK (subject_type IN ('user','service','anonymous')),
  subject_id     TEXT,
  role           TEXT,
  method         TEXT NOT NULL,
  endpoint       TEXT NOT NULL,
  device_id      TEXT,
  decision       TEXT NOT NULL CHECK (decision IN ('allow','deny')),
  reason         TEXT NOT NULL,
  status_code    INTEGER
);
CREATE INDEX idx_audit_ts      ON audit_log(ts);
CREATE INDEX idx_audit_request ON audit_log(request_id);
CREATE INDEX idx_audit_corr    ON audit_log(correlation_id);
CREATE INDEX idx_audit_subject ON audit_log(subject_type, subject_id);
