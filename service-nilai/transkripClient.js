'use strict';
// Panggilan Service Nilai -> Service Transkrip. WAJIB lewat gateway dengan TOKEN SERVICE
// (bukan token user): minta token ke POST /auth/service, lalu POST /transkrip/sinkron.
class SyncError extends Error {
  constructor(message, { timeout = false, status = 0 } = {}) { super(message); this.timeout = timeout; this.status = status; }
}

function createTranskripClient({ gatewayUrl, clientId, clientSecret, timeoutMs = 5000 }) {
  let cached = null;   // { token, expiresAt }

  async function call(path, { method = 'POST', headers = {}, body }) {
    try {
      return await fetch(gatewayUrl + path, {
        method, headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const timeout = e.name === 'TimeoutError' || e.name === 'AbortError';
      throw new SyncError(timeout ? 'Gateway timeout' : `Gateway tidak dapat dihubungi (${e.cause?.code || e.message})`, { timeout });
    }
  }

  async function serviceToken(correlationId) {
    // Perbarui bila sisa masa berlaku < 30 detik.
    if (cached && cached.expiresAt - Date.now() > 30_000) return cached.token;
    const res = await call('/auth/service', {
      headers: { 'X-Correlation-ID': correlationId },
      body: { client_id: clientId, client_secret: clientSecret },
    });
    if (!res.ok) throw new SyncError('Gagal memperoleh token service', { status: res.status });
    const data = await res.json();
    cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return cached.token;
  }

  async function sinkron(payload, correlationId) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await serviceToken(correlationId);
      const res = await call('/transkrip/sinkron', {
        headers: { Authorization: `Bearer ${token}`, 'X-Correlation-ID': correlationId }, body: payload,
      });
      if (res.status === 401 && attempt === 0) { cached = null; continue; }   // token service kedaluwarsa
      if (!res.ok) throw new SyncError(`Sinkron ditolak (HTTP ${res.status})`, { status: res.status });
      return res.json();
    }
    throw new SyncError('Sinkron gagal');
  }

  return { sinkron };
}

module.exports = { createTranskripClient, SyncError };
