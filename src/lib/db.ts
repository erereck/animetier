import type { ListSummary, TierList } from '../types';

/**
 * Tiny promise wrapper around IndexedDB.
 * Stores: lists (full TierList), summaries (for the library), blobs (local images).
 */
const DB_NAME = 'animetier';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('lists')) db.createObjectStore('lists', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('summaries')) db.createObjectStore('summaries', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        t.oncomplete = () => resolve(req ? (req.result as T) : (undefined as T));
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export function summarize(list: TierList): ListSummary {
  const ranked = list.tiers.reduce((n, t) => n + t.items.length, 0);
  const coverOf = (id: string) => list.items[id]?.img ?? '';
  const http = (s: string) => s.startsWith('http');
  return {
    id: list.id,
    title: list.title,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
    total: ranked + list.pool.length,
    ranked,
    preview: list.tiers.slice(0, 8).map((t) => ({
      color: t.color,
      covers: t.items.map(coverOf).filter(http).slice(0, 10),
    })),
    poolCovers: list.pool.map(coverOf).filter(http).slice(0, 6),
  };
}

export const db = {
  async getList(id: string): Promise<TierList | undefined> {
    return tx<TierList | undefined>('lists', 'readonly', (s) => s.get(id));
  },
  async putList(list: TierList): Promise<void> {
    await tx('lists', 'readwrite', (s) => s.put(list));
    await tx('summaries', 'readwrite', (s) => s.put(summarize(list)));
  },
  async deleteList(id: string): Promise<void> {
    const list = await db.getList(id);
    await tx('lists', 'readwrite', (s) => s.delete(id));
    await tx('summaries', 'readwrite', (s) => s.delete(id));
    // Clean up local images that only this list used.
    if (list) {
      const keys = Object.values(list.items)
        .map((i) => i.img)
        .filter((img) => img.startsWith('local:'))
        .map((img) => img.slice(6));
      for (const k of keys) await tx('blobs', 'readwrite', (s) => s.delete(k)).catch(() => {});
    }
  },
  async summaries(): Promise<ListSummary[]> {
    const all = await tx<ListSummary[]>('summaries', 'readonly', (s) => s.getAll());
    return (all || []).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async putBlob(key: string, blob: Blob): Promise<void> {
    await tx('blobs', 'readwrite', (s) => s.put(blob, key));
  },
  async getBlob(key: string): Promise<Blob | undefined> {
    return tx<Blob | undefined>('blobs', 'readonly', (s) => s.get(key));
  },
};

// ── Local images ───────────────────────────────────────
const urlCache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

/** Resolves an item image reference to something an <img> can display. */
export function resolveImage(img: string): Promise<string> {
  if (!img.startsWith('local:')) return Promise.resolve(img);
  const key = img.slice(6);
  const cached = urlCache.get(key);
  if (cached) return Promise.resolve(cached);
  let p = pending.get(key);
  if (!p) {
    p = db.getBlob(key).then((b) => {
      const url = b ? URL.createObjectURL(b) : '';
      if (url) urlCache.set(key, url);
      pending.delete(key);
      return url;
    });
    pending.set(key, p);
  }
  return p;
}

export function resolvedImageSync(img: string): string | undefined {
  if (!img.startsWith('local:')) return img;
  return urlCache.get(img.slice(6));
}

export async function storeLocalImage(blob: Blob): Promise<string> {
  const key = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const small = await downscale(blob, 600);
  await db.putBlob(key, small);
  urlCache.set(key, URL.createObjectURL(small));
  return 'local:' + key;
}

/** Keeps local images reasonable: long edge ≤ max px, re-encoded as webp/jpeg. */
async function downscale(blob: Blob, max: number): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && blob.size < 400_000) return blob;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.88));
    return out ?? blob;
  } catch {
    return blob;
  }
}

export async function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataURLToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  return res.blob();
}


// ── Legacy (AnimeTier v5) storage ──────────────────────
/** Reads the old single-file app's autosave + named saves, if this origin has them. */
export async function readLegacySaves(): Promise<{ name: string; data: unknown }[]> {
  const out: { name: string; data: unknown }[] = [];
  try {
    const raw = await new Promise<string | null>((resolve) => {
      const req = indexedDB.open('anitier-db');
      req.onupgradeneeded = () => {
        // The DB didn't exist — abort so we don't create an empty one.
        req.transaction?.abort();
        resolve(null);
      };
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('saves')) {
          d.close();
          resolve(null);
          return;
        }
        const g = d.transaction('saves', 'readonly').objectStore('saves').get('anitier');
        g.onsuccess = () => {
          resolve(g.result?.value ?? null);
          d.close();
        };
        g.onerror = () => resolve(null);
      };
    });
    if (raw) out.push({ name: 'Autosave', data: JSON.parse(raw) });
  } catch {
    /* ignore */
  }
  try {
    const autosave = localStorage.getItem('anitier');
    if (autosave && !out.length) out.push({ name: 'Autosave', data: JSON.parse(autosave) });
    const idx = JSON.parse(localStorage.getItem('anitier-saves') || '[]') as { id: string; name: string }[];
    for (const s of idx) {
      const d = localStorage.getItem('anitier-' + s.id);
      if (d) out.push({ name: s.name, data: JSON.parse(d) });
    }
  } catch {
    /* ignore */
  }
  return out;
}
