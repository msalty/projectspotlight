// In-memory cache of records over IndexedDB, plus thumbnail generation.
import { db, collectGarbage } from './db.js';
import { newClient } from './presets.js';
import { render } from './render.js';

export const state = { clients: [], projects: [], pendingProject: null };

export async function loadAll() {
  [state.clients, state.projects] = await Promise.all([db.all('clients'), db.all('projects')]);
  state.clients.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return state;
}

const PLACEHOLDER = newClient({ id: '_none', name: '' });
export const clientFor = (p) => state.clients.find((c) => c.id === p.clientId) || state.clients[0] || PLACEHOLDER;

export async function saveProject(p) {
  await db.put('projects', p);
  const i = state.projects.findIndex((x) => x.id === p.id);
  if (i >= 0) state.projects[i] = p; else state.projects.push(p);
}

export async function saveClient(c) {
  c.updated = Date.now();
  await db.put('clients', c);
  const i = state.clients.findIndex((x) => x.id === c.id);
  if (i >= 0) state.clients[i] = c; else state.clients.push(c);
}

export async function deleteProject(id) {
  await db.del('projects', id);
  state.projects = state.projects.filter((p) => p.id !== id);
  collectGarbage().catch(console.error);
}

export async function deleteClient(id) {
  await db.del('clients', id);
  state.clients = state.clients.filter((c) => c.id !== id);
  collectGarbage().catch(console.error);
}

// Rendered design thumbnails keyed by project+client revision.
const thumbs = new Map();
let queue = Promise.resolve();
export function thumbFor(p, width = 480) {
  const c = clientFor(p);
  const key = `${p.id}:${p.updated}:${c.id}:${c.updated}:${width}`;
  if (!thumbs.has(key)) {
    const job = queue.then(async () => {
      const full = document.createElement('canvas');
      await render(full, p, c, 0);
      const t = document.createElement('canvas');
      t.width = width;
      t.height = Math.round((full.height * width) / full.width);
      const ctx = t.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(full, 0, 0, t.width, t.height);
      const blob = await new Promise((r) => t.toBlob(r, 'image/jpeg', 0.82));
      return URL.createObjectURL(blob);
    }).catch((e) => { console.error(e); return ''; });
    queue = job;
    thumbs.set(key, job);
  }
  return thumbs.get(key);
}
