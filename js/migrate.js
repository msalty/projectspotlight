// One-time import of data saved by earlier versions of the app:
//  - localStorage 'ps-projects' / 'ps-brand' (photos as data URLs)
//  - IndexedDB 'projectSpotlight' key/value store (photos as File blobs)
import { db } from './db.js';
import { dataURLToBlob } from './images.js';
import { newClient, newProject } from './presets.js';

const FLAG = 'migrated-v1';

async function readLegacyIDB() {
  if (!indexedDB.databases) return null;
  const list = await indexedDB.databases().catch(() => []);
  if (!list.some((d) => d.name === 'projectSpotlight')) return null;
  const d = await new Promise((res, rej) => {
    const r = indexedDB.open('projectSpotlight');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  if (!d.objectStoreNames.contains('kv')) { d.close(); return null; }
  const get = (k) => new Promise((res) => {
    const r = d.transaction('kv').objectStore('kv').get(k);
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
  });
  const out = { projects: (await get('projects')) || [], brand: await get('brand') };
  d.close();
  return out;
}

function readLegacyLocal() {
  try {
    return {
      projects: JSON.parse(localStorage.getItem('ps-projects') || '[]'),
      brand: JSON.parse(localStorage.getItem('ps-brand') || 'null'),
    };
  } catch { return { projects: [], brand: null }; }
}

async function toBlobId(v) {
  if (!v) return null;
  if (typeof v === 'string' && v.startsWith('data:')) return db.putBlob(await dataURLToBlob(v));
  if (v instanceof Blob) return db.putBlob(v);
  return null;
}

export async function migrateLegacy() {
  if (await db.getMeta(FLAG)) return 0;
  const sources = [readLegacyLocal(), await readLegacyIDB().catch(() => null)].filter(Boolean);
  let client = null, count = 0;
  for (const src of sources) {
    if (!client && src.brand && (src.brand.companyName || src.brand.phone)) {
      const b = src.brand;
      client = newClient({
        name: b.companyName || '', tagline: b.tagline || '', phone: b.phone || '', website: b.website || '',
        primary: b.primaryColor || '#102a43', accent: b.accentColor || '#f4c430',
        logo: await toBlobId(b.logo),
      });
      await db.put('clients', client);
    }
    for (const old of src.projects || []) {
      if (!old || (!old.title && !old.before && !old.after)) continue;
      const p = newProject({
        title: old.title || '', description: old.description || '', category: old.category || '',
        location: old.location || '', clientId: client ? client.id : null,
        created: old.updated || Date.now(), updated: old.updated || Date.now(),
      });
      p.photos = { before: await toBlobId(old.before), after: await toBlobId(old.after) };
      await db.put('projects', p);
      count++;
    }
  }
  await db.setMeta(FLAG, Date.now());
  return count;
}
