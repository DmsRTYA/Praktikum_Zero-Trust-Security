// Terminal log audit (PEP). Isinya diambil dari GET /audit: admin melihat semua keputusan,
// pengguna lain hanya jejak miliknya (+ panggilan antar-service yang dipicu request miliknya).
import { api } from './api.js';
import { state } from './state.js';
import { $, el } from './ui.js';
import { icon } from './icons.js';

let body, panel, resizer, maxBtn;
let busy = false, pending = false, timer = null, restoreHeight = null;

const MIN_H = 100;
const maxHeight = () => Math.max(120, window.innerHeight - 150);

function setHeight(h) {
  panel.style.height = `${Math.round(Math.min(maxHeight(), Math.max(MIN_H, h)))}px`;
}

function placeholder() {
  body.replaceChildren(el('div', 'term-empty', '> menunggu aktivitas...'));
}

export function initTerminal() {
  body = $('#term-body'); panel = $('#terminal'); resizer = $('#resizer'); maxBtn = $('#term-max');
  placeholder();

  // Resize: pointer events agar berfungsi di mouse dan layar sentuh.
  resizer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    resizer.setPointerCapture(e.pointerId);
    resizer.classList.add('active');
  });
  resizer.addEventListener('pointermove', (e) => {
    if (resizer.hasPointerCapture(e.pointerId)) setHeight(window.innerHeight - e.clientY);
  });
  const release = (e) => {
    if (resizer.hasPointerCapture(e.pointerId)) resizer.releasePointerCapture(e.pointerId);
    resizer.classList.remove('active');
  };
  resizer.addEventListener('pointerup', release);
  resizer.addEventListener('pointercancel', release);
  resizer.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); setHeight(panel.offsetHeight + 24); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHeight(panel.offsetHeight - 24); }
  });

  $('#term-clear').addEventListener('click', placeholder);
  maxBtn.addEventListener('click', () => {
    const expanded = maxBtn.dataset.expanded === '1';
    if (expanded) { setHeight(restoreHeight || 280); maxBtn.dataset.expanded = '0'; }
    else { restoreHeight = panel.offsetHeight; setHeight(maxHeight()); maxBtn.dataset.expanded = '1'; }
    maxBtn.innerHTML = icon(expanded ? 'maximize-2' : 'minimize-2', 12);
    maxBtn.setAttribute('aria-label', expanded ? 'Perbesar log audit' : 'Kecilkan log audit');
  });
  window.addEventListener('resize', () => { if (panel.style.height) setHeight(panel.offsetHeight); });
}

export function resetTerminal() {
  state.lastAuditId = 0;
  placeholder();
}

export function scheduleRefresh() {
  clearTimeout(timer);
  timer = setTimeout(refresh, 120);
}

const hhmmss = (iso) => new Date(iso).toLocaleTimeString('id-ID', { hour12: false }).replace(/\./g, ':');
const subjectLabel = (r) => (r.subject_type === 'anonymous' ? 'anonymous' : `${r.subject_type}:${r.subject_id}`);

function entry(r) {
  const deny = r.decision === 'deny';
  const box = el('div', `log ${deny ? 'deny' : 'allow'}`);
  const top = el('div', 'log-top');
  top.append(
    el('span', 'log-ts', `[${hhmmss(r.ts)}]`),
    el('span', deny ? 'log-deny' : 'log-pass', deny ? 'DENY' : 'PASS'),
    el('span', 'log-http', r.status_code ? `HTTP ${r.status_code}` : 'HTTP -'),
  );
  box.append(top);
  const row = (k, v, cls = '') => {
    const line = el('div', 'log-row');
    line.append(el('span', 'log-k', k), el('span', `log-v ${cls}`.trim(), v));
    box.append(line);
  };
  row('SUBJ:', subjectLabel(r));
  row('DEV:', r.device_id || '-');
  row('REQ:', `${r.method} ${r.endpoint}`, 'req');
  row('RSN:', r.reason, deny ? 'rsn-deny' : '');
  return box;
}

export async function refresh() {
  if (!state.user) return;
  if (busy) { pending = true; return; }
  busy = true;
  try {
    const q = state.lastAuditId ? `?after=${state.lastAuditId}&limit=100` : '?limit=30';
    const { data } = await api(`/audit${q}`, { silent: true });
    if (!state.user || !data.length) return;
    if (body.querySelector('.term-empty')) body.replaceChildren();
    for (const r of data) body.append(entry(r));
    state.lastAuditId = Math.max(state.lastAuditId, ...data.map((r) => r.id));
    body.scrollTop = body.scrollHeight;
  } catch { /* log audit bersifat pelengkap; kegagalan tidak mengganggu aksi utama */ }
  finally { busy = false; if (pending) { pending = false; scheduleRefresh(); } }
}
