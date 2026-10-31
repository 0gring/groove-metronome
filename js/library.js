// Saves imported files on the device (IndexedDB) so they survive app restarts.
// Item: { id, name, type: 'tab' | 'xml' | 'mxl' | 'pdf', data: string | ArrayBuffer, settings: {}, added }

const DB = 'groove-metronome';
const STORE = 'library';
let dbp = null;

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export const listItems = async () =>
  ((await tx('readonly', (s) => s.getAll())) ?? []).sort((a, b) => b.added - a.added);
export const getItem = (id) => tx('readonly', (s) => s.get(id));
export const putItem = (item) => tx('readwrite', (s) => s.put(item));
export const deleteItem = (id) => tx('readwrite', (s) => s.delete(id));
export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
