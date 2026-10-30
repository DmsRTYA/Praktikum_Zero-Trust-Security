'use strict';
// Menjalankan gateway + Service Nilai + Service Transkrip sekaligus (satu terminal).
//   npm run dev
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const run = (file) => spawnSync(process.execPath, [path.join(ROOT, file)], { stdio: 'inherit' });

if (!fs.existsSync(path.join(ROOT, '.env'))) run('scripts/setup.js');
require('../shared/env');
const dbFile = path.resolve(ROOT, process.env.DB_PATH || './db/nilai.db');
if (!fs.existsSync(dbFile)) run('db/seed.js');

const services = [
  { name: 'nilai    ', file: 'service-nilai/server.js', color: '\x1b[33m' },
  { name: 'transkrip', file: 'service-transkrip/server.js', color: '\x1b[35m' },
  { name: 'gateway  ', file: 'gateway/server.js', color: '\x1b[36m' },
];
const children = [];
let stopping = false;

function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((c) => { try { c.kill('SIGTERM'); } catch { /* sudah berhenti */ } });
  setTimeout(() => process.exit(code), 300);
}

for (const s of services) {
  const child = spawn(process.execPath, [path.join(ROOT, s.file)], { cwd: ROOT, env: process.env });
  const prefix = `${s.color}[${s.name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      lines.forEach((l) => l && !/ExperimentalWarning|--trace-warnings/.test(l) && out.write(prefix + l + '\n'));
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => { if (!stopping) { console.error(`${prefix}berhenti (kode ${code}). Menghentikan semua proses.`); stopAll(code || 1); } });
  children.push(child);
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
