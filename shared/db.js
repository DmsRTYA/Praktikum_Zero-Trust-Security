'use strict';
// Adapter SQLite. Memakai better-sqlite3 bila terpasang, kalau tidak memakai
// modul bawaan "node:sqlite" (Node >= 22.5). API yang dipakai sama untuk keduanya:
// prepare(sql).get/all/run(...params), exec(sql), transaction(fn).
const fs = require('node:fs');
const path = require('node:path');

function viaBetterSqlite(file) {
  const Database = require('better-sqlite3');
  const db = new Database(file);
  return { driver: 'better-sqlite3', exec: (s) => db.exec(s), prepare: (s) => db.prepare(s), close: () => db.close() };
}

function viaNodeSqlite(file) {
  // node:sqlite masih berstatus eksperimental dan mencetak peringatan saat dimuat. Peringatan khusus
  // itu disembunyikan agar terminal bersih; peringatan lain tetap tampil.
  const emit = process.emitWarning;
  process.emitWarning = (w, ...a) => (/SQLite/.test(String(w)) ? undefined : emit.call(process, w, ...a));
  let DatabaseSync;
  try { ({ DatabaseSync } = require('node:sqlite')); } finally { process.emitWarning = emit; }
  const db = new DatabaseSync(file);
  return { driver: 'node:sqlite', exec: (s) => db.exec(s), prepare: (s) => db.prepare(s), close: () => db.close() };
}

function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const errors = [];
  let h = null;
  for (const open of [viaBetterSqlite, viaNodeSqlite]) {
    try { h = open(file); break; } catch (e) { errors.push(`${open.name}: ${e.message.split('\n')[0]}`); }
  }
  if (!h) {
    console.error('[db] Tidak ada driver SQLite yang dapat dipakai.');
    console.error('     Gunakan Node.js >= 22.5 (SQLite bawaan) ATAU jalankan: npm install');
    errors.forEach((e) => console.error('     - ' + e));
    process.exit(1);
  }
  // WAL: tiga proses membaca/menulis satu file. busy_timeout: tunggu, bukan langsung gagal.
  h.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  h.transaction = (fn) => (...args) => {
    h.exec('BEGIN IMMEDIATE');
    try { const r = fn(...args); h.exec('COMMIT'); return r; }
    catch (e) { try { h.exec('ROLLBACK'); } catch { /* abaikan */ } throw e; }
  };
  return h;
}

module.exports = { openDb };
