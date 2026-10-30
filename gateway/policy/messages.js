'use strict';
// Pesan ke client untuk setiap kode alasan penolakan.
const MESSAGES = {
  TOKEN_TIDAK_ADA: 'Token akses diperlukan',
  TOKEN_TIDAK_VALID: 'Token tidak valid',
  TOKEN_KEDALUWARSA: 'Token kedaluwarsa',
  TIPE_TOKEN_SALAH: 'Jenis token tidak sesuai',
  USER_TIDAK_AKTIF: 'Pengguna tidak aktif atau tidak dikenal',
  DEVICE_TIDAK_ADA_DI_HEADER: 'Header X-Device-ID wajib dikirim',
  DEVICE_TIDAK_TERDAFTAR: 'Perangkat tidak terdaftar untuk pengguna ini',
  DEVICE_TIDAK_COCOK_DENGAN_TOKEN: 'Perangkat tidak sama dengan perangkat saat login',
  ROUTE_TIDAK_DIKENAL: 'Endpoint tidak dikenal (default deny)',
  ROLE_TIDAK_DIIZINKAN: 'Peran Anda tidak diizinkan untuk aksi ini',
  BUKAN_PEMILIK_NIM: 'Anda hanya boleh mengakses NIM milik sendiri',
  BUKAN_PENGAMPU: 'Anda bukan dosen pengampu kelas ini',
  NILAI_SUDAH_FINAL: 'Kelas sudah final, nilai tidak dapat diubah',
  DI_LUAR_JAM_AKSES: 'Aksi hanya diizinkan pada jam akses yang ditetapkan',
  BUKAN_TOKEN_SERVICE: 'Endpoint ini hanya untuk token service',
  SCOPE_SERVICE_TIDAK_SESUAI: 'Scope token service tidak sesuai',
  NILAI_TIDAK_DITEMUKAN: 'Nilai tidak ditemukan',
  KELAS_TIDAK_DITEMUKAN: 'Kelas tidak ditemukan',
};
const messageFor = (reason) => MESSAGES[reason] || 'Akses ditolak oleh kebijakan';

module.exports = { messageFor };
