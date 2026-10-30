// Klien API ke gateway (port yang sama dengan halaman ini, jadi tanpa CORS).
// Setiap request membawa Authorization: Bearer <access token> dan X-Device-ID.
// Saat 401, access token diperbarui SEKALI lewat refresh token, lalu request diulang.
import { state, saveSession, loadSession, clearSession } from './state.js';

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.error) || `HTTP ${status}`);
    this.status = status;
    this.reason = (body && body.reason) || null;
  }
}

const bus = new EventTarget();
export const on = (name, fn) => bus.addEventListener(name, fn);
const emit = (name) => bus.dispatchEvent(new Event(name));

// Waktu yang dikirim saat simulator aktif. Server hanya menerimanya pada DEMO_MODE=true.
const SIMULATED_TIME = '23:30';

async function send(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (state.deviceId) headers['X-Device-ID'] = state.deviceId;
  if (auth && state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;
  if (state.demo && state.simulate) headers['X-Simulated-Time'] = SIMULATED_TIME;

  let res;
  try {
    res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, cache: 'no-store' });
  } catch {
    emit('offline');
    throw new ApiError(0, { error: 'Gateway tidak dapat dihubungi', reason: 'GATEWAY_OFFLINE' });
  }
  emit('online');
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; } }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

let refreshing = null;
function refreshAccess() {
  if (!state.refreshToken) return Promise.resolve(false);
  refreshing ??= (async () => {
    try {
      const d = await send('/auth/refresh', { method: 'POST', body: { refresh_token: state.refreshToken }, auth: false });
      state.accessToken = d.access_token;
      return true;
    } catch { return false; } finally { refreshing = null; }
  })();
  return refreshing;
}

export async function api(path, opts = {}) {
  try {
    const data = await send(path, opts);
    if (!opts.silent) emit('activity');
    return data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && opts.auth !== false && !opts._retried && state.refreshToken) {
      if (await refreshAccess()) return api(path, { ...opts, _retried: true });
      emit('expired');
    }
    if (!opts.silent) emit('activity');
    throw e;
  }
}

export async function login(username, password, deviceId) {
  state.deviceId = deviceId;
  try {
    const d = await send('/auth/login', { method: 'POST', body: { username, password }, auth: false });
    state.accessToken = d.access_token; state.refreshToken = d.refresh_token; state.user = d.user;
    saveSession();
    emit('activity');
    return d;
  } catch (e) { state.deviceId = null; throw e; }
}

export async function logout() {
  const rt = state.refreshToken;
  try { if (rt) await send('/auth/logout', { method: 'POST', body: { refresh_token: rt }, auth: false }); } catch { /* tetap keluar */ }
}

// Memulihkan sesi setelah reload halaman: access token baru dari refresh token tersimpan.
export async function restoreSession() {
  const s = loadSession();
  if (!s || !s.refreshToken || !s.deviceId) return false;
  state.refreshToken = s.refreshToken; state.deviceId = s.deviceId;
  try {
    const d = await send('/auth/refresh', { method: 'POST', body: { refresh_token: s.refreshToken }, auth: false });
    state.accessToken = d.access_token; state.user = d.user;
    return true;
  } catch { clearSession(); return false; }
}

export async function fetchDemoInfo() {
  try {
    const res = await fetch('/demo/accounts', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
