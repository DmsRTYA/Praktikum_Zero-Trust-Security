'use strict';
// Policy Engine (PE): memutuskan allow/deny beserta alasannya.
const { createContextLoader } = require('./context');
const { rules, deny } = require('./rules');

function createPolicy({ db, jamMulai, jamSelesai, jamTz }) {
  const loadContext = createContextLoader(db);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: jamTz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  // "HH:MM" pada zona waktu yang dikonfigurasi (bukan zona waktu mesin).
  const clockNow = () => fmt.format(new Date());
  // Rentang [mulai, selesai). Perbandingan string "HH:MM" valid karena formatnya tetap.
  const jamAksesOk = (hhmm) => hhmm >= jamMulai && hhmm < jamSelesai;

  // Jam simulasi (hanya DEMO_MODE) boleh MEMPERKETAT saja: dipakai bila hasilnya DI LUAR jam akses.
  // Klien tidak pernah bisa melonggarkan aturan dengan mengirim jam yang "di dalam" jam akses.
  const SIM = /^([01]\d|2[0-3]):[0-5]\d$/;
  function resolveClock(simulated, demoMode, real = clockNow()) {
    if (demoMode && typeof simulated === 'string' && SIM.test(simulated) && !jamAksesOk(simulated)) return simulated;
    return real;
  }

  function decide({ subject, routeKey, params, query, clock }) {
    const rule = rules[routeKey];
    if (!rule) return deny('ROUTE_TIDAK_DIKENAL');
    const ctx = loadContext(routeKey, subject, params);
    return rule({ subject, params, query, ctx, jamOk: () => jamAksesOk(clock) });
  }

  return { decide, clockNow, jamAksesOk, resolveClock };
}

module.exports = { createPolicy };
