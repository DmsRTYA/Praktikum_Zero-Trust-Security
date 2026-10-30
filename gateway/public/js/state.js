// Status sesi di sisi browser.
//  - access token HANYA di memori (hilang saat tab ditutup/reload, lalu dipulihkan via refresh)
//  - refresh token + device ID di sessionStorage (per tab; hilang saat tab ditutup)
// Catatan: sessionStorage dapat dibaca skrip di halaman yang sama (risiko XSS). Mitigasinya:
// semua keluaran di-escape/textContent dan CSP "script-src 'self'" dari gateway.
export const state = {
  user: null,          // { id, nama, role, nim }
  deviceId: null,
  accessToken: null,
  refreshToken: null,
  demo: false,         // diisi dari /demo/accounts (hanya ada saat DEMO_MODE=true di server)
  simulate: false,     // simulator "Diluar Jam Kerja" (hanya berpengaruh jika server DEMO_MODE)
  lastAuditId: 0,
};

const KEY = 'zt.session';

export function saveSession() {
  try { sessionStorage.setItem(KEY, JSON.stringify({ refreshToken: state.refreshToken, deviceId: state.deviceId })); } catch { /* storage tidak tersedia */ }
}

export function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; }
}

export function clearSession() {
  try { sessionStorage.removeItem(KEY); } catch { /* abaikan */ }
  state.user = null; state.accessToken = null; state.refreshToken = null; state.deviceId = null; state.lastAuditId = 0;
}
