'use strict';
const crypto = require('node:crypto');

// Perbandingan constant-time. Kedua sisi di-hash dulu supaya panjangnya sama
// dan panjang secret tidak bocor lewat waktu respons.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a ?? '')).digest();
  const hb = crypto.createHash('sha256').update(String(b ?? '')).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = { safeEqual };
