// IndexedDB storage: project and client records, plus photo/logo blobs stored separately
// so records stay small (and can later be mirrored to Google Sheets, with blobs in Drive).

const DB_NAME = 'project-spotlight';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('clients')) d.createObjectStore('clients', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Storage is blocked by another open tab.'));
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const d = await open();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
  });
}

export const db = {
  all: (store) => run(store, 'readonly', (s) => s.getAll()),
  get: (store, id) => run(store, 'readonly', (s) => s.get(id)),
  put: (store, value) => run(store, 'readwrite', (s) => s.put(value)).then(() => value),
  del: (store, id) => run(store, 'readwrite', (s) => s.delete(id)),

  async putBlob(blob, id = crypto.randomUUID()) {
    await run('blobs', 'readwrite', (s) => s.put(blob, id));
    return id;
  },
  getBlob: (id) => (id ? run('blobs', 'readonly', (s) => s.get(id)) : Promise.resolve(null)),
  delBlob: (id) => (id ? run('blobs', 'readwrite', (s) => s.delete(id)) : Promise.resolve()),
  allBlobKeys: () => run('blobs', 'readonly', (s) => s.getAllKeys()),

  getMeta: (key) => run('meta', 'readonly', (s) => s.get(key)),
  setMeta: (key, value) => run('meta', 'readwrite', (s) => s.put(value, key)),
};

// Blob ids referenced by a project or client.
export function blobRefs(record) {
  if (!record) return [];
  if (record.photos) return Object.values(record.photos).filter(Boolean);
  return record.logo ? [record.logo] : [];
}

// Remove blobs that no record references any more.
export async function collectGarbage() {
  const [projects, clients, keys] = await Promise.all([db.all('projects'), db.all('clients'), db.allBlobKeys()]);
  const used = new Set([...projects, ...clients].flatMap(blobRefs));
  await Promise.all(keys.filter((k) => !used.has(k)).map((k) => db.delBlob(k)));
}
