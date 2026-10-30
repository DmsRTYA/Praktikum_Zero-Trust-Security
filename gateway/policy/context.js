'use strict';
// Policy Engine membaca ATRIBUT dari database (bukan hanya isi token):
// kepemilikan NIM, kelas yang diampu, status final.
function createContextLoader(db) {
  const qNim = db.prepare('SELECT nim FROM users WHERE id = ?');
  const qKelasDiampu = db.prepare('SELECT id FROM kelas WHERE dosen_id = ?');
  const qKelas = db.prepare('SELECT id, dosen_id, status FROM kelas WHERE id = ?');
  const qNilai = db.prepare(`SELECT n.id, n.kelas_id, k.dosen_id, k.status
    FROM nilai n JOIN kelas k ON k.id = n.kelas_id WHERE n.id = ?`);

  return function load(routeKey, subject, params) {
    if (subject.type !== 'user') return {};
    const uid = Number(subject.id);
    switch (routeKey) {
      case 'GET /nilai':
        if (subject.role === 'mahasiswa') return { nimSaya: qNim.get(uid)?.nim ?? null };
        if (subject.role === 'dosen') return { kelasDiampu: qKelasDiampu.all(uid).map((r) => r.id) };
        return {};
      case 'PUT /nilai/:id':
        return { nilai: qNilai.get(Number(params.id)) };
      case 'POST /kelas/:id/finalisasi':
        return { kelas: qKelas.get(Number(params.id)) };
      case 'GET /transkrip/:nim':
        return subject.role === 'mahasiswa' ? { nimSaya: qNim.get(uid)?.nim ?? null } : {};
      default:
        return {};
    }
  };
}

module.exports = { createContextLoader };
