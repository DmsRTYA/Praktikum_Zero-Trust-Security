// Helper UI. Semua teks dari server/pengguna dimasukkan lewat textContent (anti-XSS).
import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

const REASON_TEXT = {
  TOKEN_TIDAK_ADA: 'Token akses tidak ditemukan. Silakan login kembali.',
  TOKEN_TIDAK_VALID: 'Token tidak valid. Silakan login kembali.',
  TOKEN_KEDALUWARSA: 'Sesi berakhir. Silakan login kembali.',
  USER_TIDAK_AKTIF: 'Akun tidak aktif atau tidak dikenal.',
  DEVICE_TIDAK_ADA_DI_HEADER: 'Header X-Device-ID tidak dikirim.',
  DEVICE_TIDAK_TERDAFTAR: 'Perangkat tidak terdaftar untuk pengguna ini.',
  DEVICE_TIDAK_COCOK_DENGAN_TOKEN: 'Perangkat berbeda dari perangkat saat login.',
  ROUTE_TIDAK_DIKENAL: 'Endpoint tidak dikenal (default deny).',
  ROLE_TIDAK_DIIZINKAN: 'Peran Anda tidak diizinkan untuk aksi ini.',
  BUKAN_PEMILIK_NIM: 'Anda hanya boleh mengakses NIM milik sendiri.',
  BUKAN_PENGAMPU: 'Anda bukan dosen pengampu kelas ini.',
  NILAI_SUDAH_FINAL: 'Kelas sudah final, nilai tidak dapat diubah.',
  KELAS_SUDAH_FINAL: 'Kelas ini sudah difinalisasi sebelumnya.',
  DI_LUAR_JAM_AKSES: 'Aksi ini hanya diizinkan pada jam akses yang ditetapkan (07:00 - 21:00).',
  NILAI_BELUM_LENGKAP: 'Masih ada nilai kosong. Lengkapi semua nilai sebelum finalisasi.',
  KELAS_TIDAK_ADA_PESERTA: 'Kelas belum memiliki peserta.',
  NILAI_TIDAK_VALID: 'Nilai harus berupa angka 0 sampai 100.',
  NIM_TIDAK_DITEMUKAN: 'NIM tidak ditemukan.',
  SINKRON_GAGAL: 'Sinkron ke Service Transkrip gagal. Status kelas dikembalikan ke draft.',
  GATEWAY_OFFLINE: 'Gateway tidak dapat dihubungi. Periksa apakah server berjalan.',
};

const TITLE = {
  0: 'Gateway Offline', 401: 'Otentikasi Gagal', 403: 'Pelanggaran Kebijakan', 404: 'Tidak Ditemukan',
  409: 'Konflik Status', 422: 'Validasi Gagal', 502: 'Sinkron Gagal', 504: 'Sinkron Gagal',
};

export function describeError(e) {
  const status = e.status ?? 0;
  return {
    title: TITLE[status] || 'Error',
    text: REASON_TEXT[e.reason] || e.message || 'Terjadi kesalahan.',
    type: [409, 422, 404].includes(status) ? 'warn' : 'error',
  };
}

const TOAST_ICON = { success: 'check-square', error: 'x-square', warn: 'alert-triangle', info: 'info' };

export function toast(title, text, type = 'info') {
  const box = $('#toasts');
  const t = el('div', `toast ${type}`);
  t.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const ic = el('span'); ic.innerHTML = icon(TOAST_ICON[type] || 'info', 18);
  const body = el('div');
  body.append(el('div', 'toast-title', title), el('div', 'toast-text', text));
  t.append(ic, body);
  box.append(t);
  setTimeout(() => t.remove(), 3000);
  while (box.children.length > 4) box.firstChild.remove();
}

export function toastError(e) {
  const d = describeError(e);
  toast(d.title, d.text, d.type);
}

// Menonaktifkan tombol sambil request berjalan; label asli dipulihkan setelahnya.
export function setBusy(btn, busy, label) {
  const lab = btn.querySelector('.btn-label');
  if (busy) {
    btn.disabled = true;
    if (lab) { btn.dataset.label = lab.textContent; if (label) lab.textContent = label; }
  } else {
    btn.disabled = false;
    if (lab && btn.dataset.label) lab.textContent = btn.dataset.label;
  }
}

export const cell = (label, content, cls) => {
  const td = el('td', cls);
  td.dataset.label = label;
  if (content instanceof Node) td.append(content); else td.textContent = content ?? '';
  return td;
};

export const emptyRow = (cols, text) => {
  const tr = el('tr'); const td = el('td', 'empty', text); td.colSpan = cols; tr.append(td); return tr;
};
