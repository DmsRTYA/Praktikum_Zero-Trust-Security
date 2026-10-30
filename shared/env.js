'use strict';
// Pemuat konfigurasi: membaca .env (tanpa dependensi) dan menyediakan helper.
// Variabel dari proses (process.env) selalu menang atas isi .env.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv(path.join(ROOT, '.env'));

// Variabel wajib: aplikasi GAGAL START jika kosong. Tidak ada nilai default untuk secret.
function need(name) {
  const v = process.env[name];
  if (!v || /^GANTI_/.test(v)) {
    console.error(`[config] Variabel wajib "${name}" belum diisi. Jalankan "npm run setup" atau lengkapi file .env`);
    process.exit(1);
  }
  return v;
}
const opt = (name, def) => (process.env[name] !== undefined && process.env[name] !== '' ? process.env[name] : def);
const int = (name, def) => {
  const n = Number.parseInt(opt(name, String(def)), 10);
  if (!Number.isInteger(n)) { console.error(`[config] "${name}" harus berupa angka`); process.exit(1); }
  return n;
};
const bool = (name, def = false) => String(opt(name, String(def))).toLowerCase() === 'true';
const resolvePath = (p) => (path.isAbsolute(p) ? p : path.resolve(ROOT, p));

// "10m" | "30s" | "24h" | "600" -> detik
function duration(name, def) {
  const v = String(opt(name, def)).trim();
  const m = /^(\d+)\s*([smhd]?)$/.exec(v);
  if (!m) { console.error(`[config] "${name}" tidak valid: ${v}`); process.exit(1); }
  const mult = { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2]];
  return Number(m[1]) * mult;
}

module.exports = { ROOT, need, opt, int, bool, duration, resolvePath };
