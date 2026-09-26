import { $, esc, chrome, toast, confirmSheet, pickFile } from '../ui.js';
import { icon } from '../icons.js';
import { db } from '../db.js';
import { state, loadAll } from '../store.js';
import { blobToDataURL, dataURLToBlob } from '../images.js';
import { VERSION, installPrompt } from '../pwa.js';
import { getConfig, isConnected, connect, disconnect, syncNow, syncEvents, syncStatus, scheduleSync } from '../sync.js';

const GUIDE = 'https://github.com/msalty/projectspotlight/blob/main/google/README.md';
function ago(t) {
  if (!t) return 'never';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const mb = (n) => (n / 1048576).toFixed(n > 1e8 ? 0 : 1) + ' MB';

export async function settingsView(root) {
  await loadAll();
  chrome({ title: 'Settings', large: true, tab: 'settings' });
  const cfg = await getConfig();
  const connected = isConnected(cfg);
  root.innerHTML = `
    <section class="card setting" id="syncCard">
      <div class="setting-head">${icon(connected ? 'cloud' : 'cloud-off')}<div><h3>Google Sync</h3>
        <p class="muted">${connected
          ? 'Projects and your brand sync to your Google Sheet; photos and logos are stored in Google Drive. Use the same web app URL and secret key on every phone and computer.'
          : 'Keep projects in a Google Sheet and photos in Google Drive, and use the app on all your phones and computers.'}</p></div></div>
      ${connected ? `
        <p class="sync-line" id="syncLine"></p>
        <div class="row gap wrap">
          <button class="btn primary" id="syncNowBtn">${icon('refresh-cw')}Sync now</button>
          ${cfg.sheetUrl ? `<a class="btn tonal" href="${esc(cfg.sheetUrl)}" target="_blank" rel="noopener">${icon('sheet')}Open Sheet</a>` : ''}
          ${cfg.folderUrl ? `<a class="btn tonal" href="${esc(cfg.folderUrl)}" target="_blank" rel="noopener">${icon('folder-open')}Open Drive folder</a>` : ''}
          <button class="btn text" id="disconnectBtn">${icon('unplug')}Disconnect</button>
        </div>` : `
        <ol class="howto">
          <li>Follow the <a href="${GUIDE}" target="_blank" rel="noopener"><b>5-minute setup guide</b></a> to add the sync script to a Google Sheet.</li>
          <li>Paste the <b>web app URL</b> and <b>secret key</b> it gives you below.</li>
        </ol>
        <label class="field"><span>Web app URL</span><input id="syncUrl" type="url" inputmode="url" autocapitalize="off" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(cfg.url)}"></label>
        <label class="field"><span>Secret key</span><input id="syncToken" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="From the setup step" value="${esc(cfg.token)}"></label>
        <button class="btn primary" id="connectBtn">${icon('link')}Connect</button>`}
    </section>

    ${standalone ? '' : `
    <section class="card setting">
      <div class="setting-head">${icon('smartphone')}<div><h3>Install the app</h3><p class="muted">Add Project Spotlight to your home screen for a full-screen, app-like experience that works offline.</p></div></div>
      ${installPrompt() ? `<button class="btn primary" id="installBtn">${icon('download')}Install app</button>`
        : isIOS ? `<ol class="howto"><li>Tap the <b>Share</b> button in Safari</li><li>Choose <b>Add to Home Screen</b></li><li>Tap <b>Add</b></li></ol>`
        : `<p class="muted small">Use your browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>`}
    </section>`}

    <section class="card setting">
      <div class="setting-head">${icon('briefcase')}<div><h3>Storage</h3><p class="muted" id="storageInfo">${state.projects.length} projects · ${state.clients.length} brand${state.clients.length === 1 ? '' : 's'} saved on this device.</p></div></div>
      <button class="btn tonal" id="persistBtn">${icon('shield-check')}Keep my data safe on this device</button>
      <p class="muted small">Asks the browser not to clear your projects when space runs low.</p>
    </section>

    <section class="card setting">
      <div class="setting-head">${icon('file-down')}<div><h3>Backup</h3><p class="muted">Export everything — projects, photos, brand and logo — to a single file you can restore on any device.</p></div></div>
      <div class="row gap wrap">
        <button class="btn tonal" id="exportBtn">${icon('download')}Export backup</button>
        <button class="btn tonal" id="importBtn">${icon('upload')}Restore backup</button>
      </div>
    </section>

    <p class="muted small center pad">Project Spotlight v${VERSION}</p>`;

  // ---- Google Sync
  const line = $('#syncLine', root);
  if (line) {
    const paint = () => {
      if (!line.isConnected) { syncEvents.removeEventListener('status', paint); return; }
      const st = syncStatus();
      getConfig().then((c) => {
        line.dataset.state = st.state;
        line.innerHTML = st.state === 'syncing' ? `${icon('refresh-cw')}${esc(st.message || 'Syncing…')}`
          : st.state === 'error' ? `${icon('cloud-alert')}${esc(st.message)}`
          : st.state === 'offline' ? `${icon('cloud-off')}${esc(st.message)}`
          : `${icon('check')}Last synced ${ago(c.lastSync)}`;
      });
    };
    syncEvents.addEventListener('status', paint);
    paint();
    $('#syncNowBtn', root).onclick = () => syncNow().catch(() => {});
    $('#disconnectBtn', root).onclick = async () => {
      if (!await confirmSheet('Disconnect Google Sync?', 'Your data stays on this device and in your Google Sheet. You can reconnect any time.', 'Disconnect', false)) return;
      await disconnect();
      toast('Google Sync disconnected');
      settingsView(root);
    };
  }
  $('#connectBtn', root)?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `${icon('refresh-cw')}Connecting…`;
    try {
      await connect($('#syncUrl', root).value, $('#syncToken', root).value);
      toast('Connected — your projects are syncing with Google');
      settingsView(root);
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.innerHTML = `${icon('link')}Connect`;
      if (isConnected(await getConfig())) settingsView(root);
    }
  });

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
      if (!await confirmSheet('Restore this backup?', `${data.projects.length} projects and ${data.clients.length} brand(s) will be added. Items with the same ID are replaced.`, 'Restore', false)) return;
      for (const [k, v] of Object.entries(data.blobs || {})) await db.putBlob(await dataURLToBlob(v), k);
      for (const c of data.clients || []) await db.put('clients', c);
      for (const p of data.projects || []) await db.put('projects', p);
      toast('Backup restored');
      scheduleSync(500);
      location.hash = '#/';
    } catch (e) {
      toast('Restore failed: ' + e.message);
    }
  };
}
