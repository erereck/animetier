import type { Item, ListStatus, Season, Tier, TierList } from '../types';
import { blobToDataURL, dataURLToBlob, db, storeLocalImage } from './db';
import { uid } from './util';

/** Shape of the old single-file AnimeTier (v5) saves. */
interface LegacyItem {
  id?: string;
  img?: string;
  lbl?: string;
  anilistId?: number;
  genres?: string[];
  tags?: { name: string; rank: number }[];
  studio?: string;
  year?: number;
  month?: number;
  season?: string;
  seasonYear?: number;
  format?: string;
  episodes?: number;
  duration?: number;
  alScore?: number;
  popularity?: number;
  favourites?: number;
  source?: string;
  country?: string;
  isAdult?: boolean;
  alStatus?: string;
  userAlScore?: number;
  progress?: number;
  startedAt?: number;
  completedAt?: number;
  score?: number;
  note?: string;
  blur?: boolean;
}
interface LegacyTier {
  name?: string;
  color?: string;
  icon?: string;
  items?: LegacyItem[];
  sortMode?: string;
  collapsed?: boolean;
  locked?: boolean;
}
interface LegacyState {
  title?: string;
  tiers?: LegacyTier[];
  pool?: LegacyItem[];
}

export function isLegacy(data: unknown): data is LegacyState {
  const d = data as LegacyState;
  return !!d && Array.isArray(d.tiers) && Array.isArray(d.pool) && !('items' in (d as object));
}

const v = <T>(x: T | null | undefined) => (x == null || (x as unknown) === '' ? undefined : x);

async function convertItem(o: LegacyItem): Promise<Item> {
  let img = o.img || '';
  if (img.startsWith('data:')) {
    try {
      img = await storeLocalImage(await dataURLToBlob(img));
    } catch {
      /* keep data url */
    }
  } else if (img === '[localfile]') img = '';
  else img = img.replace(/\?v=\d+$/, '');
  const item: Item = {
    id: uid('i'),
    title: o.lbl || 'Sem título',
    img,
    kind: o.anilistId ? 'anime' : 'custom',
    addedAt: Date.now(),
    anilistId: v(o.anilistId),
    genres: o.genres,
    tags: o.tags,
    studio: v(o.studio),
    year: v(o.year),
    month: v(o.month),
    season: v(o.season) as Season | undefined,
    seasonYear: v(o.seasonYear),
    format: v(o.format),
    episodes: v(o.episodes),
    duration: v(o.duration),
    alScore: v(o.alScore),
    popularity: v(o.popularity),
    favourites: v(o.favourites),
    source: v(o.source),
    country: v(o.country),
    isAdult: !!o.isAdult,
    listStatus: v(o.alStatus) as ListStatus | undefined,
    listScore: o.userAlScore ? o.userAlScore : undefined,
    progress: v(o.progress),
    startedYear: v(o.startedAt),
    completedYear: v(o.completedAt),
    note: v(o.note),
    spoiler: o.blur || undefined,
  };
  const score = o.score ?? (o.userAlScore ? o.userAlScore : undefined);
  if (score != null) item.score = score;
  // Old lists stored English-or-romaji in `lbl`; treat it as the English slot so the
  // title language preference has something to work with until a refresh.
  if (o.anilistId) item.titleEnglish = o.lbl;
  return item;
}

function legacyOrder(items: LegacyItem[], mode?: string): LegacyItem[] {
  const a = [...items];
  const name = (x: LegacyItem) => x.lbl || '';
  if (mode === 'alpha') a.sort((x, y) => name(x).localeCompare(name(y)));
  else if (mode === 'alpha-desc') a.sort((x, y) => name(y).localeCompare(name(x)));
  else if (mode === 'score-desc') a.sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
  else if (mode === 'score-asc') a.sort((x, y) => (x.score ?? 101) - (y.score ?? 101));
  return a;
}

export async function fromLegacy(data: LegacyState, fallbackTitle = 'Lista importada'): Promise<TierList> {
  const items: Record<string, Item> = {};
  const tiers: Tier[] = [];
  for (const t of data.tiers || []) {
    const ids: string[] = [];
    // Old tiers could use a persistent sort; bake the order the user actually saw.
    for (const o of legacyOrder(t.items || [], t.sortMode)) {
      const it = await convertItem(o);
      items[it.id] = it;
      ids.push(it.id);
    }
    tiers.push({ id: uid('t'), name: t.name || 'Tier', color: /^#[0-9a-f]{6}$/i.test(t.color || '') ? t.color! : '#9b7bff', icon: t.icon || undefined, locked: t.locked || undefined, collapsed: t.collapsed || undefined, items: ids });
  }
  const pool: string[] = [];
  for (const o of data.pool || []) {
    const it = await convertItem(o);
    items[it.id] = it;
    pool.push(it.id);
  }
  const now = Date.now();
  return { id: uid('l'), title: data.title || fallbackTitle, createdAt: now, updatedAt: now, tiers, pool, items };
}

// ── Backups (v6) ───────────────────────────────────────
interface Backup {
  app: 'animetier';
  version: 6;
  exportedAt: number;
  lists: TierList[];
  blobs: Record<string, string>;
}

export async function makeBackup(lists: TierList[]): Promise<string> {
  const blobs: Record<string, string> = {};
  for (const l of lists) {
    for (const it of Object.values(l.items)) {
      if (!it.img.startsWith('local:')) continue;
      const key = it.img.slice(6);
      if (blobs[key]) continue;
      const b = await db.getBlob(key);
      if (b) blobs[key] = await blobToDataURL(b);
    }
  }
  const backup: Backup = { app: 'animetier', version: 6, exportedAt: Date.now(), lists, blobs };
  return JSON.stringify(backup);
}

/** Accepts a v6 backup, a single v6 list, or an old v5 save. Returns fresh lists (new ids). */
export async function parseImport(text: string, fileName = 'Lista importada'): Promise<TierList[]> {
  const data = JSON.parse(text);
  if (data?.app === 'animetier' && Array.isArray(data.lists)) {
    const b = data as Backup;
    for (const [key, url] of Object.entries(b.blobs || {})) {
      try {
        await db.putBlob(key, await dataURLToBlob(url));
      } catch {
        /* skip broken image */
      }
    }
    return b.lists.map((l) => ({ ...l, id: uid('l'), updatedAt: Date.now() }));
  }
  if (data && typeof data.items === 'object' && Array.isArray(data.tiers)) {
    return [{ ...(data as TierList), id: uid('l'), updatedAt: Date.now() }];
  }
  if (isLegacy(data)) return [await fromLegacy(data, fileName.replace(/\.json$/i, ''))];
  throw new Error('Arquivo não reconhecido');
}
