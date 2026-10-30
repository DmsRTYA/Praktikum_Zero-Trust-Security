// Orkestrator: boot, login, logout, navigasi per role, drawer mobile, simulator, badge PEP.
import { state, clearSession } from './state.js';
import { api, on, login, logout, restoreSession, fetchDemoInfo } from './api.js';
import { $, el, toast, toastError, setBusy } from './ui.js';
import { hydrateIcons } from './icons.js';
import { openDrawer, closeDrawer } from './shell.js';
import { initTerminal, resetTerminal, scheduleRefresh } from './terminal.js';
import { showDosen, bindDosen } from './dosen.js';
import { setupMahasiswa } from './mahasiswa.js';
import { setupAdmin, bindAdmin } from './admin.js';

const show = (id) => {
  for (const v of ['boot', 'view-login', 'view-app']) $(`#${v}`).classList.toggle('hidden', v !== id);
};

function enterApp() {
  const u = state.user;
  show('view-app');
  $('#session-name').textContent = u.nama;
  $('#session-role').textContent = u.role.toUpperCase();
  const nim = $('#session-nim');
  nim.textContent = u.nim || '';
  nim.classList.toggle('hidden', !u.nim);
  $('#device-text').textContent = state.deviceId;
  $('#sim-box').classList.toggle('hidden', !state.demo);
  $('#sim-toggle').checked = state.simulate;
  closeDrawer();
  scheduleRefresh();
  if (u.role === 'dosen') showDosen();
  else if (u.role === 'mahasiswa') setupMahasiswa();
  else if (u.role === 'admin') setupAdmin();
}

function backToLogin() {
  clearSession();
  resetTerminal();                    // log tidak boleh bocor ke sesi berikutnya
  state.simulate = false;
  $('#in-pass').value = '';
  show('view-login');
  $('#in-user').focus();
}

async function doLogout() {
  await logout();
  backToLogin();
}

function renderDemo(info) {
  state.demo = true;
  $('#creds').classList.remove('hidden');
  const title = $('#creds-title');
  title.replaceChildren('Kredensial pengujian (pass: ', el('span', 'pw', info.password), ')');   // password apa adanya, tidak di-uppercase
  const grid = $('#creds-grid');
  grid.replaceChildren();
  const order = ['dosen01', 'mhs01', 'dosen02', 'mhs02', 'mhs03', 'admin01'];
  const accounts = [...info.accounts].sort((a, b) => order.indexOf(a.username) - order.indexOf(b.username));
  for (const a of accounts) {
    const b = el('button', 'cred');
    b.type = 'button';
    b.append(el('b', null, a.username), el('span', null, a.device));
    b.addEventListener('click', () => {
      $('#in-user').value = a.username; $('#in-pass').value = info.password; $('#in-device').value = a.device;
      $('#btn-login').focus();
    });
    grid.append(b);
  }
}

function bindLogin() {
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('#in-user').value.trim();
    const password = $('#in-pass').value;
    const device = $('#in-device').value.trim();
    if (!username || !password || !device) return toast('Validasi Gagal', 'Username, password, dan X-Device-ID wajib diisi.', 'warn');
    const btn = $('#btn-login');
    setBusy(btn, true, 'MEMVERIFIKASI...');
    try {
      await login(username, password, device);
      $('#in-pass').value = '';
      enterApp();
    } catch (err) { toastError(err); }
    finally { setBusy(btn, false); }
  });
}

function bindShell() {
  $('#btn-logout').addEventListener('click', doLogout);
  $('#btn-menu').addEventListener('click', () => ($('#sidebar').classList.contains('open') ? closeDrawer() : openDrawer()));
  $('#overlay').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  window.matchMedia('(min-width: 1024px)').addEventListener('change', (m) => { if (m.matches) closeDrawer(); });
  $('#sim-toggle').addEventListener('change', (e) => {
    state.simulate = e.target.checked;
    toast('Simulator Kebijakan', state.simulate ? 'Waktu disimulasikan di luar jam kerja (hanya berlaku pada DEMO_MODE).' : 'Simulasi waktu dimatikan.', 'info');
  });

  // Indikator PEP mengikuti keterjangkauan gateway yang sebenarnya.
  const badge = $('#pep-badge');
  const setPep = (up) => { badge.classList.toggle('off', !up); badge.querySelector('.label').textContent = up ? 'PEP ACTIVE' : 'PEP OFFLINE'; };
  on('online', () => setPep(true));
  on('offline', () => setPep(false));
  on('activity', scheduleRefresh);                 // setiap aksi => ambil entri audit terbaru
  on('expired', () => {
    if (!state.user) return;
    backToLogin();
    toast('Sesi Berakhir', 'Sesi Anda telah berakhir. Silakan login kembali.', 'warn');
  });
}

async function boot() {
  hydrateIcons();
  bindLogin(); bindShell(); bindDosen(); bindAdmin();
  initTerminal();
  const [demo, restored] = await Promise.all([fetchDemoInfo(), restoreSession()]);
  if (demo && demo.demo) renderDemo(demo);
  if (restored) enterApp(); else show('view-login');
}

boot().catch((e) => { console.error(e); show('view-login'); });
