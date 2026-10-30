'use strict';
// Audit log: setiap keputusan (allow/deny) dicatat oleh gateway beserta alasannya.
// JANGAN pernah menulis token, password, atau secret ke sini.
function createAudit(db) {
  const insert = db.prepare(`INSERT INTO audit_log
    (ts, request_id, correlation_id, subject_type, subject_id, role, method, endpoint, device_id, decision, reason, status_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const setStatus = db.prepare('UPDATE audit_log SET status_code = ? WHERE id = ?');

  const COLS = 'id, ts, request_id, subject_type, subject_id, role, method, endpoint, device_id, decision, reason, status_code';
  // Pembacaan audit sendiri disembunyikan dari tampilan agar terminal tidak dipenuhi noise
  // (tetap tersimpan di database).
  const NOT_AUDIT_READ = "NOT (endpoint = '/audit' OR endpoint LIKE '/audit?%')";

  const adminLatest = db.prepare(`SELECT ${COLS} FROM audit_log WHERE ${NOT_AUDIT_READ} ORDER BY id DESC LIMIT ?`);
  const adminAfter = db.prepare(`SELECT ${COLS} FROM audit_log WHERE id > ? AND ${NOT_AUDIT_READ} ORDER BY id ASC LIMIT ?`);

  // Non-admin hanya melihat jejak miliknya + panggilan antar-service yang dipicu request miliknya.
  const SCOPE = `((subject_type = 'user' AND subject_id = ?)
    OR correlation_id IN (SELECT request_id FROM audit_log WHERE subject_type = 'user' AND subject_id = ?))`;
  const userLatest = db.prepare(`SELECT ${COLS} FROM audit_log WHERE ${NOT_AUDIT_READ} AND ${SCOPE} ORDER BY id DESC LIMIT ?`);
  const userAfter = db.prepare(`SELECT ${COLS} FROM audit_log WHERE id > ? AND ${NOT_AUDIT_READ} AND ${SCOPE} ORDER BY id ASC LIMIT ?`);

  return {
    write(e) {
      const r = insert.run(
        new Date().toISOString(), e.requestId, e.correlationId ?? null, e.subjectType, e.subjectId ?? null,
        e.role ?? null, e.method, e.endpoint, e.deviceId ?? null, e.decision, e.reason, e.statusCode ?? null,
      );
      return Number(r.lastInsertRowid);
    },
    setStatus(id, code) { if (id) setStatus.run(code, id); },
    list({ subject, afterId, limit }) {
      const isAdmin = subject.type === 'user' && subject.role === 'admin';
      if (afterId > 0) {
        return isAdmin ? adminAfter.all(afterId, limit) : userAfter.all(afterId, subject.id, subject.id, limit);
      }
      const rows = isAdmin ? adminLatest.all(limit) : userLatest.all(subject.id, subject.id, limit);
      return rows.reverse();
    },
  };
}

module.exports = { createAudit };
