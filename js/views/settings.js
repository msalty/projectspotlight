import { $, chrome, toast, confirmSheet, pickFile } from '../ui.js';
import { icon } from '../icons.js';
import { db } from '../db.js';
import { state, loadAll } from '../store.js';
import { blobToDataURL, dataURLToBlob } from '../images.js';
import { VERSION, installPrompt } from '../pwa.js';

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const mb = (n) => (n / 1048576).toFixed(n > 1e8 ? 0 : 1) + ' MB';

export async function settingsView(root) {
  await loadAll();
  chrome({ title: 'Settings', large: true, tab: 'settings' });
  root.innerHTML = `
    ${standalone ? '' : `
    <section class="card setting">
      <div class="setting-head">${icon('smartphone')}<div><h3>Install the app</h3><p class="muted">Add Project Spotlight to your home screen for a full-screen, app-like experience that works offline.</p></div></div>
      ${installPrompt() ? `<button class="btn primary" id="installBtn">${icon('download')}Install app</button>`
        : isIOS ? `<ol class="howto"><li>Tap the <b>Share</b> button in Safari</li><li>Choose <b>Add to Home Screen</b></li><li>Tap <b>Add</b></li></ol>`
        : `<p class="muted small">Use your browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>`}
    </section>`}

    <section class="card setting">
      <div class="setting-head">${icon('briefcase')}<div><h3>Storage</h3><p class="muted" id="storageInfo">${state.projects.length} projects · ${state.clients.length} clients saved on this device.</p></div></div>
      <button class="btn tonal" id="persistBtn">${icon('shield-check')}Keep my data safe on this device</button>
      <p class="muted small">Asks the browser not to clear your projects when space runs low. Google Drive sync is coming next.</p>
    </section>

    <section class="card setting">
      <div class="setting-head">${icon('file-down')}<div><h3>Backup</h3><p class="muted">Export everything — projects, photos, clients and logos — to a single file you can restore on any device.</p></div></div>
      <div class="row gap wrap">
        <button class="btn tonal" id="exportBtn">${icon('download')}Export backup</button>
        <button class="btn tonal" id="importBtn">${icon('upload')}Restore backup</button>
      </div>
    </section>

    <p class="muted small center pad">Project Spotlight v${VERSION}</p>`;

  const info = $('#storageInfo', root);
  if (navigator.storage?.estimate) {
    const [{ usage }, persisted] = await Promise.all([navigator.storage.estimate(), navigator.storage.persisted?.() ?? false]);
    info.textContent += ` Using ${mb(usage || 0)}.`;
    if (persisted) { $('#persistBtn', root).disabled = true; $('#persistBtn', root).innerHTML = `${icon('check')}Storage is protected`; }
  }
  $('#persistBtn', root).onclick = async () => {
    const ok = await navigator.storage?.persist?.();
    toast(ok ? 'Storage protected' : 'Your browser decides automatically — installing the app helps.');
    if (ok) settingsView(root);
  };
  $('#installBtn', root)?.addEventListener('click', async () => {
    const p = installPrompt();
    if (!p) return;
    p.prompt();
    await p.userChoice;
    settingsView(root);
  });

  $('#exportBtn', root).onclick = async () => {
    toast('Preparing backup…');
    const keys = await db.allBlobKeys();
    const blobs = {};
    for (const k of keys) blobs[k] = await blobToDataURL(await db.getBlob(k));
    const data = { app: 'project-spotlight', version: 1, exported: new Date().toISOString(), clients: state.clients, projects: state.projects, blobs };
    const file = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = `project-spotlight-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  $('#importBtn', root).onclick = async () => {
    const f = await pickFile({ accept: 'application/json,.json' });
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== 'project-spotlight') throw new Error('This is not a Project Spotlight backup.');
      if (!await confirmSheet('Restore this backup?', `${data.projects.length} projects and ${data.clients.length} clients will be added. Items with the same ID are replaced.`, 'Restore', false)) return;
      for (const [k, v] of Object.entries(data.blobs || {})) await db.putBlob(await dataURLToBlob(v), k);
      for (const c of data.clients || []) await db.put('clients', c);
      for (const p of data.projects || []) await db.put('projects', p);
      toast('Backup restored');
      location.hash = '#/';
    } catch (e) {
      toast('Restore failed: ' + e.message);
    }
  };
}
