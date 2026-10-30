'use strict';
// Tabel rute yang dikenal (DEFAULT DENY): request yang tidak cocok dengan tabel ini ditolak.
const ROUTES = [
  { key: 'GET /nilai',                 method: 'GET',  re: /^\/nilai$/,                        names: [],      target: 'nilai' },
  { key: 'PUT /nilai/:id',             method: 'PUT',  re: /^\/nilai\/(\d{1,9})$/,             names: ['id'],   target: 'nilai' },
  { key: 'POST /kelas/:id/finalisasi', method: 'POST', re: /^\/kelas\/(\d{1,9})\/finalisasi$/, names: ['id'],   target: 'nilai' },
  { key: 'GET /transkrip/:nim',        method: 'GET',  re: /^\/transkrip\/(\d{5,15})$/,        names: ['nim'],  target: 'transkrip' },
  { key: 'POST /transkrip/sinkron',    method: 'POST', re: /^\/transkrip\/sinkron$/,           names: [],      target: 'transkrip' },
  { key: 'GET /audit',                 method: 'GET',  re: /^\/audit$/,                        names: [],      target: 'gateway' },
];

function resolveRoute(method, pathname) {
  for (const r of ROUTES) {
    if (r.method !== method) continue;
    const m = r.re.exec(pathname);
    if (!m) continue;
    const params = {};
    r.names.forEach((n, i) => { params[n] = m[i + 1]; });
    return { key: r.key, target: r.target, params };
  }
  return null;
}

module.exports = { resolveRoute };
