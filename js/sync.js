// Two-way sync with the Google Apps Script backend (google/Code.gs): records go to a Google Sheet,
// photos and logos to Google Drive. Last write wins per record, using each record's `updated` time.
import { db, blobRefs } from './db.js';
import { blobToDataURL, dataURLToBlob } from './images.js';

const KEY = 'sync';
const TOMBS = 'sync-tombstones';
const DEFAULTS = { url: '', token: '', lastPull: 0, known: {}, lastSync: 0, sheetUrl: '', folderUrl: '' };

export const syncEvents = new EventTarget();
let status = { state: 'off', message: '' };
const emit = (state, message = '') => {
  status = { state, message };
  syncEvents.dispatchEvent(new CustomEvent('status', { detail: status }));
};
export const syncStatus = () => status;

export async function getConfig() {
  return { ...DEFAULTS, ...((await db.getMeta(KEY)) || {}) };
}
async function saveConfig(cfg) { await db.setMeta(KEY, cfg); return cfg; }

// Deletions waiting to be sent, kept apart from the config so a delete during a sync is never lost.
const getTombs = async () => (await db.getMeta(TOMBS)) || [];
async function dropTombs(ids) {
  const drop = new Set(ids);
  await db.setMeta(TOMBS, (await getTombs()).filter((t) => !drop.has(t.id)));
}
export const isConnected = (cfg) => !!(cfg && cfg.url && cfg.token);

async function call(cfg, action, payload = {}) {
  let res;
  try {
    res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // "simple" request: no CORS preflight
      body: JSON.stringify({ token: cfg.token, action, ...payload }),
      redirect: 'follow',
    });
  } catch {
    throw new Error(navigator.onLine ? 'Could not reach Google. Check the web app URL.' : 'You are offline.');
  }
  if (!res.ok) throw new Error(`Google returned an error (${res.status}).`);
  let data;
  try { data = JSON.parse(await res.text()); } catch {
    throw new Error('Unexpected reply from Google — make sure the web app is deployed with access set to "Anyone".');
  }
  if (!data.ok) throw new Error(data.error || 'Sync failed');
  return data;
}

const b64 = async (blob) => (await blobToDataURL(blob)).split(',')[1];

// ---------------------------------------------------------------- connect / disconnect

export async function connect(url, token) {
  url = url.trim(); token = token.trim();
  const dev = /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url); // local test server
  if (!dev && !/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) throw new Error('That doesn\'t look like an Apps Script web app URL (it should start with https://script.google.com/).');
  const info = await call({ url, token }, 'info');
  const prev = await getConfig();
  const sameServer = prev.url === url;
  await saveConfig({ ...DEFAULTS, ...(sameServer ? prev : {}), url, token, sheetUrl: info.sheetUrl, folderUrl: info.folderUrl });
  installTriggers();
  return syncNow();
}

export async function disconnect() {
  await saveConfig({ ...DEFAULTS });
  emit('off');
}

// ---------------------------------------------------------------- change tracking (called by the store)

export async function recordDeletion(kind, id) {
  const tombs = (await getTombs()).filter((t) => t.id !== id);
  await db.setMeta(TOMBS, tombs.concat({ kind, id, updated: Date.now() }));
  scheduleSync();
}

let timer = null;
export function scheduleSync(ms = 4000) {
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow().catch(() => {}); }, ms);
}

// ---------------------------------------------------------------- sync

let running = null, again = false;
export function syncNow() {
  if (running) { again = true; return running; }
  running = run().finally(() => {
    running = null;
    if (again) { again = false; scheduleSync(500); }
  });
  return running;
}

async function run() {
  let cfg = await getConfig();
  if (!isConnected(cfg)) { emit('off'); return { changed: 0 }; }
  if (!navigator.onLine) { emit('offline', 'Offline — changes will sync when you reconnect'); return { changed: 0 }; }
  emit('syncing');
  try {
    let changed = await pull(cfg);
    const stale = await push(cfg);
    if (stale) changed += await pull(cfg);
    cfg.lastSync = Date.now();
    await saveConfig(cfg);
    emit('ok');
    if (changed) window.dispatchEvent(new CustomEvent('ps:remote-change', { detail: { changed } }));
    return { changed };
  } catch (e) {
    emit('error', e.message);
    throw e;
  }
}

async function pull(cfg) {
  const res = await call(cfg, 'pull', { since: cfg.lastPull });
  const tomb = new Map((await getTombs()).map((t) => [t.id, t]));
  const resolved = [];
  let changed = 0;
  for (const [store, list] of [['clients', res.clients], ['projects', res.projects]]) {
    for (const r of list || []) {
      const t = tomb.get(r.id);
      if (t && t.updated >= r.updated) continue; // deleted here after that edit; our tombstone wins
      const mine = await db.get(store, r.id);
      if (r.deleted) {
        if (mine && mine.updated <= r.updated) { await db.del(store, r.id); changed++; }
      } else if (!mine || r.updated > mine.updated) {
        await db.put(store, r);
        changed++;
        if (t) resolved.push(r.id); // edited elsewhere after we deleted it: keep the edit
      }
      cfg.known[r.id] = r.updated;
    }
  }
  if (resolved.length) await dropTombs(resolved);
  cfg.lastPull = res.now;
  await saveConfig(cfg);
  await downloadMissingBlobs(cfg);
  return changed;
}

async function downloadMissingBlobs(cfg) {
  const [projects, clients] = await Promise.all([db.all('projects'), db.all('clients')]);
  const ids = [...new Set([...projects, ...clients].flatMap(blobRefs))];
  const have = new Set(await db.allBlobKeys());
  for (const id of ids.filter((x) => !have.has(x))) {
    emit('syncing', 'Downloading photos…');
    const res = await call(cfg, 'getBlob', { id });
    if (res.data) await db.putBlob(await dataURLToBlob(`data:${res.mime};base64,${res.data}`), id);
  }
}

// Uploads records changed since they were last seen on the server, plus any photos they need.
// Returns true if the server kept a newer copy of something (so another pull is needed).
async function push(cfg) {
  const [projects, clients] = await Promise.all([db.all('projects'), db.all('clients')]);
  const dirty = (r) => cfg.known[r.id] !== r.updated;
  const outP = projects.filter(dirty), outC = clients.filter(dirty);
  const deleted = await getTombs();
  if (!outP.length && !outC.length && !deleted.length) return false;

  const clientName = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const labels = new Map();
  for (const p of outP) for (const [slot, id] of Object.entries(p.photos || {})) if (id) labels.set(id, `${clientName[p.clientId] || 'Project'} - ${p.title || 'Untitled'} - ${slot}`);
  for (const c of outC) if (c.logo) labels.set(c.logo, `${c.name || 'Client'} - logo`);
  if (labels.size) {
    const { missing } = await call(cfg, 'hasBlobs', { ids: [...labels.keys()] });
    let n = 0;
    for (const id of missing) {
      const blob = await db.getBlob(id);
      if (!blob) continue;
      emit('syncing', `Uploading photos… ${++n}/${missing.length}`);
      await call(cfg, 'putBlob', { id, mime: blob.type || 'image/jpeg', name: labels.get(id), data: await b64(blob) });
    }
  }

  emit('syncing', 'Saving to Google Sheets…');
  const res = await call(cfg, 'push', { projects: outP, clients: outC, deleted });
  const stale = new Set(res.stale || []);
  for (const r of [...outP, ...outC]) if (!stale.has(r.id)) cfg.known[r.id] = r.updated;
  await dropTombs(deleted.filter((t) => !stale.has(t.id)).map((t) => t.id));
  for (const t of deleted) delete cfg.known[t.id];
  await saveConfig(cfg);
  return stale.size > 0;
}

// Saves finished graphics into the Drive "Graphics" folder. Returns the folder URL.
export async function saveGraphicsToDrive(files) {
  const cfg = await getConfig();
  if (!isConnected(cfg)) throw new Error('Connect Google Sync in Settings first.');
  let folderUrl = '';
  for (const f of files) {
    const res = await call(cfg, 'putGraphic', { name: f.name.replace(/\.jpg$/, ''), mime: f.type, data: await b64(f) });
    folderUrl = res.folderUrl;
  }
  return folderUrl;
}

// Background triggers: app start, coming back online, returning to the app, and every few minutes.
export async function startAutoSync() {
  const cfg = await getConfig();
  if (!isConnected(cfg)) { emit('off'); return; }
  emit('ok');
  installTriggers();
  scheduleSync(300);
}

let triggers = false;
function installTriggers() {
  if (triggers) return;
  triggers = true;
  window.addEventListener('online', () => scheduleSync(500));
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const c = await getConfig();
    if (isConnected(c) && Date.now() - c.lastSync > 60_000) scheduleSync(300);
  });
  setInterval(() => { if (document.visibilityState === 'visible') scheduleSync(0); }, 5 * 60_000);
}
