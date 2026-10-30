// Tampilan Admin: pencarian transkrip mahasiswa berdasarkan NIM.
import { api } from './api.js';
import { $, toast, toastError, setBusy } from './ui.js';
import { setTitle, showView, setNav, markNav } from './shell.js';
import { renderTranskrip } from './mahasiswa.js';

export function setupAdmin() {
  setNav([{ key: 'cari', label: 'Cari Transkrip', icon: 'search', onSelect: showCari }]);
  showCari();
}

function showCari() {
  setTitle('Pusat Data Akademik'); showView('view-admin'); markNav('cari');
}

async function cari(e) {
  e.preventDefault();
  const nim = $('#admin-nim').value.trim();
  // Validasi format hanya untuk kenyamanan; gateway dan service memvalidasi ulang.
  if (!/^\d{5,15}$/.test(nim)) return toast('Validasi Gagal', 'NIM harus berupa angka (5 sampai 15 digit).', 'warn');
  const btn = $('#btn-cari');
  setBusy(btn, true, 'MENCARI...');
  try {
    const d = await api(`/transkrip/${encodeURIComponent(nim)}`);
    $('#admin-result-title').textContent = `Transkrip: ${d.nama} (${d.nim})`;
    renderTranskrip($('#admin-tbody'), d, $('#admin-total'));
    $('#admin-result').classList.remove('hidden');
  } catch (err) {
    $('#admin-result').classList.add('hidden');
    toastError(err);
  } finally { setBusy(btn, false); }
}

export function bindAdmin() {
  $('#admin-form').addEventListener('submit', cari);
}
