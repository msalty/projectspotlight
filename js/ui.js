// Small UI helpers shared by the views: DOM shortcuts, toasts, bottom sheets, app chrome.
import { icon } from './icons.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

let toastTimer = null;
export function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); action.onClick(); };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2600);
}

// Bottom sheet with a list of actions. Resolves with the chosen action's value (or null).
export function sheet({ title = '', body = '', actions = [] }) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'sheet-backdrop';
    root.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title || 'Options')}">
      <div class="grabber"></div>
      ${title ? `<h3>${esc(title)}</h3>` : ''}${body ? `<p class="sheet-body">${esc(body)}</p>` : ''}
      <div class="sheet-actions">
        ${actions.map((a, i) => `<button type="button" class="sheet-btn ${a.danger ? 'danger' : ''} ${a.primary ? 'primary' : ''}" data-i="${i}">${a.icon ? icon(a.icon) : ''}<span>${esc(a.label)}</span></button>`).join('')}
        <button type="button" class="sheet-btn cancel" data-i="-1"><span>Cancel</span></button>
      </div></div>`;
    const close = (val) => {
      root.classList.remove('open');
      setTimeout(() => root.remove(), 220);
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) { const a = actions[+b.dataset.i]; close(a ? (a.value ?? +b.dataset.i) : null); } else if (e.target === root) close(null);
    });
    document.addEventListener('keydown', onKey);
    document.body.append(root);
    requestAnimationFrame(() => root.classList.add('open'));
    root.querySelector('.sheet-btn')?.focus({ preventScroll: true });
  });
}

export async function confirmSheet(title, body, okLabel, danger = true) {
  return (await sheet({ title, body, actions: [{ label: okLabel, danger, primary: !danger, value: true, icon: danger ? 'trash-2' : 'check' }] })) === true;
}

// Top app bar + bottom tab bar for each view.
export function chrome({ title = '', back = null, actions = '', large = false, tab = null, sub = '' }) {
  const bar = $('#appbar');
  bar.className = 'appbar' + (large ? ' large' : '');
  bar.innerHTML = `
    ${back ? `<a class="icon-btn" href="${back}" aria-label="Back">${icon('arrow-left')}</a>` : `<span class="brand-mark" aria-hidden="true"><img src="./icons/icon.svg" alt=""></span>`}
    <div class="appbar-title"><h1>${esc(title)}</h1>${sub ? `<span class="appbar-sub" id="appbarSub">${sub}</span>` : '<span class="appbar-sub" id="appbarSub"></span>'}</div>
    <div class="appbar-actions">${actions}</div>`;
  const tabs = $('#tabbar');
  tabs.hidden = !tab;
  document.body.classList.toggle('has-tabs', !!tab);
  $$('a', tabs).forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
}

export function debounce(fn, ms) {
  let t = null;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

// Opens the file picker. Resolves with a File (or an array of Files when `multiple`), or null if cancelled.
export function pickFile({ accept = 'image/*', capture = false, multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    if (capture) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    input.onchange = () => {
      const files = [...(input.files || [])];
      resolve(multiple ? (files.length ? files : null) : files[0] || null);
      input.remove();
    };
    input.addEventListener('cancel', () => { resolve(null); input.remove(); });
    document.body.append(input);
    input.click();
  });
}
