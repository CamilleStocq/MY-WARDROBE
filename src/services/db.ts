/**
 * Accès IndexedDB minimal (sans dépendance).
 * Magasins :
 *  - garments : vêtements (clé id)
 *  - images   : photos { id, full: Blob, thumb: Blob, width, height, createdAt }
 *  - outfits  : tenues favorites (clé id)
 *  - kv       : préférences, cache météo, historique { key, value }
 */
const DB_NAME = 'my-wardrobe';
const DB_VERSION = 1;

export type StoreName = 'garments' | 'images' | 'outfits' | 'kv';

export class StorageError extends Error {}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new StorageError("Le stockage local n'est pas disponible dans ce navigateur."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('garments')) {
        const s = db.createObjectStore('garments', { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
        s.createIndex('category', 'category');
      }
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('outfits')) {
        const s = db.createObjectStore('outfits', { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(new StorageError("Impossible d'ouvrir le stockage local (navigation privée ?)."));
    };
    req.onblocked = () => reject(new StorageError("L'application est ouverte dans un autre onglet : fermez-le puis réessayez."));
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new StorageError('Erreur de stockage.'));
  });
}

async function store(name: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

export const db = {
  async getAll<T>(name: StoreName): Promise<T[]> {
    return wrap((await store(name, 'readonly')).getAll()) as Promise<T[]>;
  },
  async get<T>(name: StoreName, key: string): Promise<T | undefined> {
    return wrap((await store(name, 'readonly')).get(key)) as Promise<T | undefined>;
  },
  async put<T>(name: StoreName, value: T): Promise<void> {
    try {
      await wrap((await store(name, 'readwrite')).put(value));
    } catch (e) {
      if ((e as DOMException)?.name === 'QuotaExceededError') {
        throw new StorageError("L'espace de stockage de l'appareil est plein. Supprimez des vêtements ou libérez de l'espace.");
      }
      throw e;
    }
  },
  /**
   * Écrit plusieurs enregistrements, dans plusieurs magasins, en UNE transaction :
   * si une écriture échoue (quota…), rien n'est conservé.
   */
  async putAtomic(writes: { store: StoreName; values: unknown[] }[]): Promise<void> {
    const database = await openDb();
    const names = [...new Set(writes.map((w) => w.store))];
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(names, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => {
        const e = tx.error;
        reject(
          e?.name === 'QuotaExceededError'
            ? new StorageError("L'espace de stockage de l'appareil est plein : la restauration a été annulée, rien n'a été modifié.")
            : new StorageError("L'écriture a échoué : la restauration a été annulée, rien n'a été modifié."),
        );
      };
      for (const w of writes) {
        const s = tx.objectStore(w.store);
        for (const v of w.values) s.put(v);
      }
    });
  },
  async delete(name: StoreName, key: string): Promise<void> {
    await wrap((await store(name, 'readwrite')).delete(key));
  },
  async clear(name: StoreName): Promise<void> {
    await wrap((await store(name, 'readwrite')).clear());
  },
};

export const kv = {
  async get<T>(key: string): Promise<T | undefined> {
    const row = await db.get<{ key: string; value: T }>('kv', key);
    return row?.value;
  },
  async set<T>(key: string, value: T): Promise<void> {
    await db.put('kv', { key, value });
  },
  async del(key: string): Promise<void> {
    await db.delete('kv', key);
  },
};

/** Demande au navigateur de ne pas effacer les données en cas de manque d'espace. */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* non supporté */
  }
  return null;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
