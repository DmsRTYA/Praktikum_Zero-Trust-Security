// Kerangka halaman: judul, navigasi sidebar, pergantian view, drawer mobile.
import { $, $$, el } from './ui.js';
import { icon } from './icons.js';

export function setTitle(text) {
  $('#page-title').textContent = text;
  document.title = `${text} | Sistem Nilai Zero Trust`;
}

export function showView(id) {
  $$('.view[id^="view-"]').forEach((v) => v.classList.toggle('hidden', v.id !== id));
  $('#workspace').scrollTop = 0;
}

export function setNav(items, group) {
  const nav = $('#nav');
  nav.replaceChildren();
  if (group) nav.append(el('div', 'nav-group', group));
  for (const it of items) {
    const b = el('button', `nav-item${it.normalCase ? ' case-normal' : ''}`);
    b.type = 'button';
    b.dataset.key = it.key;
    b.innerHTML = icon(it.icon, 16);
    b.append(el('span', null, it.label));
    b.addEventListener('click', () => { closeDrawer(); it.onSelect(); });
    nav.append(b);
  }
}

export function markNav(key) {
  $$('.nav-item').forEach((b) => {
    const on = b.dataset.key === String(key);
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}

export function openDrawer() {
  $('#sidebar').classList.add('open');
  $('#overlay').classList.remove('hidden');
  $('#btn-menu').setAttribute('aria-expanded', 'true');
}

export function closeDrawer() {
  $('#sidebar').classList.remove('open');
  $('#overlay').classList.add('hidden');
  $('#btn-menu').setAttribute('aria-expanded', 'false');
}
