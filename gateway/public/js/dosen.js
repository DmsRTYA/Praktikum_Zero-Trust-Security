// Tampilan Dosen: daftar kelas yang diampu, input nilai, simpan draft, finalisasi & sinkron.
// Semua pengecekan di sini hanya petunjuk UX; keputusan sebenarnya selalu di gateway dan service.
import { api } from './api.js';
import { $, $$, el, cell, emptyRow, toast, toastError, setBusy } from './ui.js';
import { setTitle, showView, setNav, markNav } from './shell.js';

let kelasList = [];
let active = null;          // kelas yang sedang ditampilkan
let armTimer = null;

export async function showDosen() {
  setTitle('Manajemen Nilai');
  showView('view-dosen');
  disarm();
  try {
    const d = await api('/nilai');
    kelasList = d.kelas;
    setNav(kelasList.map((k) => ({
      key: k.id, label: k.nama_mk, icon: 'book', normalCase: true, onSelect: () => selectKelas(k.id),
    })), 'Manajemen Kelas');
    if (!kelasList.length) {
      $('#dosen-content').classList.add('hidden'); $('#dosen-empty').classList.remove('hidden');
      return;
    }
    $('#dosen-empty').classList.add('hidden'); $('#dosen-content').classList.remove('hidden');
    render(kelasList[0], d.data.filter((r) => r.kelas_id === kelasList[0].id));
  } catch (e) { toastError(e); }
}

async function selectKelas(id) {
  disarm();
  try {
    const d = await api(`/nilai?kelas_id=${id}`);
    const k = d.kelas.find((x) => x.id === id);
    if (k) render(k, d.data);
  } catch (e) { toastError(e); }
}

function render(kelas, rows) {
  active = kelas;
  markNav(kelas.id);
  const final = kelas.status === 'final';
  $('#dosen-title').textContent = `${kelas.kode_mk} - ${kelas.nama_mk}`;
  $('#dosen-meta').textContent = `${kelas.sks} SKS | Kelas ${kelas.nama_kelas} | ${kelas.tahun_ajaran} | Program Studi Informatika`;
  const badge = $('#dosen-status');
  badge.textContent = `STATUS: ${final ? 'FINAL' : 'DRAFT'}`;
  badge.className = `badge ${final ? 'badge-final' : 'badge-draft'}`;

  const tbody = $('#dosen-tbody');
  tbody.replaceChildren();
  if (!rows.length) tbody.append(emptyRow(3, 'Belum ada mahasiswa terdaftar di kelas ini.'));
  for (const r of rows) {
    const input = el('input', 'grade-input');
    input.type = 'number'; input.min = '0'; input.max = '100'; input.step = '0.01'; input.inputMode = 'decimal';
    input.value = r.nilai_angka ?? '';
    input.dataset.id = r.id; input.dataset.orig = input.value;
    input.disabled = final;
    input.setAttribute('aria-label', `Nilai ${r.nama_mahasiswa}`);
    input.addEventListener('input', () => input.classList.toggle('dirty', input.value !== input.dataset.orig));
    const tr = el('tr');
    tr.append(cell('NIM', r.nim, 'mono'), cell('Nama Mahasiswa', r.nama_mahasiswa), cell('Nilai Angka', input, 'num'));
    tbody.append(tr);
  }
  $('#btn-simpan').disabled = final || !rows.length;
}

const dirtyInputs = () => $$('#dosen-tbody input.grade-input').filter((i) => !i.disabled && i.value !== i.dataset.orig);

async function simpanDraft() {
  const btn = $('#btn-simpan');
  const dirty = dirtyInputs();
  if (!dirty.length) return toast('Tidak Ada Perubahan', 'Tidak ada nilai yang diubah.', 'info');
  setBusy(btn, true, 'MENYIMPAN...');
  let ok = 0;
  try {
    for (const input of dirty) {
      const raw = input.value.trim();
      const angka = Number(raw);
      if (raw === '' || !Number.isFinite(angka) || angka < 0 || angka > 100) {
        toast('Validasi Gagal', 'Nilai harus berupa angka 0 sampai 100.', 'warn'); input.focus(); break;
      }
      await api(`/nilai/${input.dataset.id}`, { method: 'PUT', body: { nilai_angka: angka } });
      input.dataset.orig = input.value;         // baris ini sudah tersimpan
      input.classList.remove('dirty');
      ok += 1;
    }
    if (ok === dirty.length) toast('Operasi Sukses', `${ok} nilai disimpan sebagai draft.`, 'success');
    else if (ok > 0) toast('Sebagian Tersimpan', `${ok} dari ${dirty.length} nilai tersimpan.`, 'warn');
  } catch (e) {
    toastError(e);
    if (ok > 0) toast('Sebagian Tersimpan', `${ok} dari ${dirty.length} nilai tersimpan sebelum gagal.`, 'warn');
  } finally {
    setBusy(btn, false);
    // Muat ulang hanya bila semua tersimpan. Bila ada yang gagal/ditolak, nilai yang sudah diketik
    // dipertahankan agar pengguna bisa memperbaiki atau mencoba lagi.
    if (ok === dirty.length) await selectKelas(active.id);
  }
}

// Finalisasi tidak dapat dibatalkan, jadi butuh dua klik (konfirmasi) dalam 4 detik.
function arm() {
  const btn = $('#btn-finalisasi');
  btn.classList.add('armed');
  btn.querySelector('.btn-label').textContent = 'KLIK LAGI UNTUK KONFIRMASI';
  btn.dataset.armed = '1';
  armTimer = setTimeout(disarm, 4000);
}
function disarm() {
  clearTimeout(armTimer);
  const btn = $('#btn-finalisasi');
  btn.classList.remove('armed');
  delete btn.dataset.armed;
  const lab = btn.querySelector('.btn-label');
  if (!btn.disabled) lab.textContent = 'FINALISASI & SINKRON';
}

async function finalisasi() {
  const btn = $('#btn-finalisasi');
  if (!active) return;
  if (dirtyInputs().length) return toast('Perubahan Belum Disimpan', 'Simpan draft terlebih dahulu sebelum finalisasi.', 'warn');
  if (!btn.dataset.armed) return arm();
  disarm();
  setBusy(btn, true, 'MEMPROSES...');
  try {
    const r = await api(`/kelas/${active.id}/finalisasi`, { method: 'POST' });
    toast('Operasi Sukses', `Kelas difinalisasi. ${r.jumlah_disinkron} nilai disinkronkan ke transkrip.`, 'success');
  } catch (e) { toastError(e); }
  finally { setBusy(btn, false); await selectKelas(active.id); }
}

export function bindDosen() {
  $('#btn-simpan').addEventListener('click', simpanDraft);
  $('#btn-finalisasi').addEventListener('click', finalisasi);
}
