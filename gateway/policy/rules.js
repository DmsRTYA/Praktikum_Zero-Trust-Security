'use strict';
// Aturan akses per endpoint (Tabel 3 soal). Urutan evaluasi tetap agar "reason" di audit
// konsisten:  role -> kepemilikan -> status -> konteks (jam akses).
const allow = () => ({ allow: true, reason: 'OK', status: 200 });
const deny = (reason, status = 403) => ({ allow: false, reason, status });

const rules = {
  // Mahasiswa: hanya miliknya. Dosen: hanya kelas yang diampu. Admin DITOLAK.
  'GET /nilai': ({ subject, query, ctx }) => {
    if (subject.type !== 'user' || !['mahasiswa', 'dosen'].includes(subject.role)) return deny('ROLE_TIDAK_DIIZINKAN');
    if (subject.role === 'mahasiswa') {
      if (query.nim && query.nim !== ctx.nimSaya) return deny('BUKAN_PEMILIK_NIM');
      return allow();
    }
    if (query.kelas_id !== undefined && !ctx.kelasDiampu.includes(Number(query.kelas_id))) return deny('BUKAN_PENGAMPU');
    return allow();
  },

  // Dosen: kelas diampu + nilai belum final + dalam jam akses.
  'PUT /nilai/:id': ({ subject, ctx, jamOk }) => {
    if (subject.type !== 'user' || subject.role !== 'dosen') return deny('ROLE_TIDAK_DIIZINKAN');
    if (!ctx.nilai) return deny('NILAI_TIDAK_DITEMUKAN', 404);
    if (ctx.nilai.dosen_id !== Number(subject.id)) return deny('BUKAN_PENGAMPU');
    if (ctx.nilai.status === 'final') return deny('NILAI_SUDAH_FINAL');
    if (!jamOk()) return deny('DI_LUAR_JAM_AKSES');
    return allow();
  },

  // Dosen: kelas diampu + dalam jam akses. Finalisasi ganda dijawab 409 oleh Service Nilai.
  'POST /kelas/:id/finalisasi': ({ subject, ctx, jamOk }) => {
    if (subject.type !== 'user' || subject.role !== 'dosen') return deny('ROLE_TIDAK_DIIZINKAN');
    if (!ctx.kelas) return deny('KELAS_TIDAK_DITEMUKAN', 404);
    if (ctx.kelas.dosen_id !== Number(subject.id)) return deny('BUKAN_PENGAMPU');
    if (!jamOk()) return deny('DI_LUAR_JAM_AKSES');
    return allow();
  },

  // Mahasiswa: hanya NIM sendiri. Admin: semua NIM. Dosen dan service DITOLAK.
  'GET /transkrip/:nim': ({ subject, params, ctx }) => {
    if (subject.type !== 'user') return deny('ROLE_TIDAK_DIIZINKAN');
    if (subject.role === 'admin') return allow();
    if (subject.role === 'mahasiswa') return params.nim === ctx.nimSaya ? allow() : deny('BUKAN_PEMILIK_NIM');
    return deny('ROLE_TIDAK_DIIZINKAN');
  },

  // Hanya token service. Token user mana pun ditolak.
  'POST /transkrip/sinkron': ({ subject }) => {
    if (subject.type !== 'service' || subject.role !== 'service') return deny('BUKAN_TOKEN_SERVICE');
    if (subject.scope !== 'transkrip:sync') return deny('SCOPE_SERVICE_TIDAK_SESUAI');
    return allow();
  },

  // Panel audit di UI: semua user terautentikasi (hasil dibatasi di sisi data).
  'GET /audit': ({ subject }) => (subject.type === 'user' ? allow() : deny('ROLE_TIDAK_DIIZINKAN')),
};

module.exports = { rules, deny };
