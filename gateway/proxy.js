'use strict';
// Meneruskan request ke service. Gateway MEMBUANG header internal dari client lalu
// memasang X-Gateway-Secret miliknya sendiri; service menolak request tanpa header ini.
const http = require('node:http');
const { sendJson } = require('../shared/http');

const STRIP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer',
  'upgrade', 'host', 'x-gateway-secret', 'x-request-id', 'x-simulated-time',
]);

function forward(req, res, targetBase, { requestId, gatewaySecret, timeoutMs = 10000 }) {
  const target = new URL(targetBase);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!STRIP.has(k)) headers[k] = v;
  headers['x-gateway-secret'] = gatewaySecret;
  headers['x-request-id'] = requestId;
  headers.host = target.host;

  const upstream = http.request({
    hostname: target.hostname, port: target.port || 80, method: req.method, path: req.url, headers, timeout: timeoutMs,
  }, (upRes) => {
    const out = { ...upRes.headers };
    delete out.connection; delete out['keep-alive'];
    res.writeHead(upRes.statusCode, out);
    upRes.pipe(res);
  });

  upstream.on('timeout', () => upstream.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
  upstream.on('error', (err) => {
    if (res.headersSent) { res.destroy(); return; }
    const timeout = err.code === 'ETIMEDOUT';
    sendJson(res, timeout ? 504 : 502, {
      error: timeout ? 'Service tidak merespons tepat waktu' : 'Service tidak tersedia',
      reason: timeout ? 'SERVICE_TIMEOUT' : 'SERVICE_TIDAK_TERSEDIA',
    });
  });
  res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
  req.pipe(upstream);
}

module.exports = { forward };
