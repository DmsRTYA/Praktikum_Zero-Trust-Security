// Tampilan Mahasiswa: nilai saya (Service Nilai) dan transkrip (Service Transkrip). Read-only.
import { api } from './api.js';
import { state } from './state.js';
import { $, el, cell, emptyRow, toastError } from './ui.js';
import { setTitle, showView, setNav, markNav } from './shell.js';

export function setupMahasiswa() {
  setNav([
    { key: 'nilai', label: 'Nilai Saya', icon: 'clipboard-list', onSelect: showNilai },
    { key: 'transkrip', label: 'Transkrip Nilai', icon: 'file-spreadsheet', onSelect: showTranskrip },
  ]);
  return showNilai();
}

export async function showNilai() {
  setTitle('Nilai Saya'); showView('view-nilai'); markNav('nilai');
  const tbody = $('#nilai-tbody');
  try {
    const d = await api('/nilai');
    tbody.replaceChildren();
    if (!d.data.length) tbody.append(emptyRow(5, 'Belum ada nilai yang difinalisasi.'));
    for (const r of d.data) {
      const tr = el('tr');
      tr.append(cell('Kode MK', r.kode_mk, 'mono'), cell('Mata Kuliah', r.nama_mk), cell('Tahun Ajaran', r.tahun_ajaran),
        cell('SKS', String(r.sks), 'num'), cell('Nilai', r.nilai_angka === null ? '-' : String(r.nilai_angka), 'num mono'));
      tbody.append(tr);
    }
  } catch (e) { toastError(e); }
}

export async function showTranskrip() {
  setTitle('Transkrip Nilai'); showView('view-transkrip'); markNav('transkrip');
  const tbody = $('#transkrip-tbody');
  try {
    const d = await api(`/transkrip/${encodeURIComponent(state.user.nim)}`);
    renderTranskrip(tbody, d, $('#transkrip-total'));
  } catch (e) { toastError(e); }
}

export function renderTranskrip(tbody, d, totalEl) {
  tbody.replaceChildren();
  if (!d.mata_kuliah.length) tbody.append(emptyRow(5, 'Belum ada mata kuliah yang difinalisasi.'));
  for (const r of d.mata_kuliah) {
    const huruf = el('span', 'badge badge-huruf', r.nilai_huruf);
    const tr = el('tr');
    tr.append(cell('Kode MK', r.kode_mk, 'mono'), cell('Mata Kuliah', r.nama_mk), cell('SKS', String(r.sks), 'num'),
      cell('Nilai', String(r.nilai_angka), 'num mono'), cell('Huruf', huruf, 'num'));
    tbody.append(tr);
  }
  totalEl.textContent = `Total SKS: ${d.total_sks}`;
}
