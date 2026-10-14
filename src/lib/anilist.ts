import type { Item, ItemKind, ListStatus, Season } from '../types';
import { uid } from './util';

const ENDPOINT = 'https://graphql.anilist.co';

export class AniListError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POSTs a GraphQL query, retrying politely when rate-limited. */
export async function gql<T>(query: string, variables: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      if (attempt < 2) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      throw new AniListError('Sem conexão com o AniList. Verifique sua internet.');
    }
    if (res.status === 429 && attempt < 4) {
      const wait = Number(res.headers.get('Retry-After')) || 20;
      await sleep(Math.min(wait, 65) * 1000);
      continue;
    }
    let body: { data?: T; errors?: { message: string; status?: number }[] } = {};
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    if (body.data && (!body.errors || Object.values(body.data as object).some((v) => v != null))) return body.data;
    const err = body.errors?.[0];
    if (err?.status === 404 || /not found/i.test(err?.message || '')) throw new AniListError('Usuário ou mídia não encontrado no AniList.', 404);
    if (err?.message?.toLowerCase().includes('private')) throw new AniListError('Essa lista do AniList é privada.', 403);
    throw new AniListError(err?.message || `Erro ${res.status} no AniList`, res.status);
  }
}

// ── Fragments ──────────────────────────────────────────
const MEDIA = `
  id type
  title { romaji english native }
  coverImage { large extraLarge color }
  startDate { year month }
  season seasonYear format episodes chapters duration
  averageScore popularity favourites genres
  tags { name rank isGeneralSpoiler isMediaSpoiler }
  studios(isMain: true) { nodes { name } }
  source countryOfOrigin isAdult
  relations { edges { relationType(version: 2) node { id type } } }
`;

const CHARACTER = `
  id
  name { full native userPreferred }
  image { large }
  favourites
  media(perPage: 1, sort: POPULARITY_DESC) { nodes { title { romaji english } } }
`;

export interface AniMedia {
  id: number;
  type: 'ANIME' | 'MANGA';
  title: { romaji?: string; english?: string; native?: string };
  coverImage?: { large?: string; extraLarge?: string; color?: string };
  startDate?: { year?: number; month?: number };
  season?: Season;
  seasonYear?: number;
  format?: string;
  episodes?: number;
  chapters?: number;
  duration?: number;
  averageScore?: number;
  popularity?: number;
  favourites?: number;
  genres?: string[];
  tags?: { name: string; rank: number; isGeneralSpoiler: boolean; isMediaSpoiler: boolean }[];
  studios?: { nodes: { name: string }[] };
  source?: string;
  countryOfOrigin?: string;
  isAdult?: boolean;
  relations?: { edges: { relationType: string; node: { id: number; type: string } }[] };
}

export interface AniCharacter {
  id: number;
  name: { full?: string; native?: string; userPreferred?: string };
  image?: { large?: string };
  favourites?: number;
  media?: { nodes: { title: { romaji?: string; english?: string } }[] };
}

interface ListEntry {
  status: ListStatus;
  score: number;
  progress: number;
  startedAt?: { year?: number };
  completedAt?: { year?: number };
  media: AniMedia;
}

const n = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

export function mediaToItem(m: AniMedia, entry?: Omit<ListEntry, 'media'>): Item {
  const kind: ItemKind = m.type === 'MANGA' ? 'manga' : 'anime';
  const t = m.title || {};
  const item: Item = {
    id: uid('i'),
    title: t.english || t.romaji || t.native || 'Sem título',
    img: m.coverImage?.large || m.coverImage?.extraLarge || '',
    kind,
    addedAt: Date.now(),
    anilistId: m.id,
    color: n(m.coverImage?.color),
    titleRomaji: n(t.romaji),
    titleEnglish: n(t.english),
    titleNative: n(t.native),
    genres: m.genres || [],
    tags: (m.tags || []).filter((x) => !x.isGeneralSpoiler && !x.isMediaSpoiler).slice(0, 12).map((x) => ({ name: x.name, rank: x.rank })),
    studio: n(m.studios?.nodes?.[0]?.name),
    year: n(m.startDate?.year),
    month: n(m.startDate?.month),
    season: n(m.season),
    seasonYear: n(m.seasonYear),
    format: n(m.format),
    episodes: n(m.episodes),
    chapters: n(m.chapters),
    duration: n(m.duration),
    alScore: n(m.averageScore),
    popularity: n(m.popularity),
    favourites: n(m.favourites),
    source: n(m.source),
    country: n(m.countryOfOrigin),
    isAdult: !!m.isAdult,
    sequel: !!m.relations?.edges?.some((e) => e.relationType === 'PREQUEL' && e.node?.type === m.type),
  };
  if (entry) {
    item.listStatus = entry.status;
    if (entry.score > 0) {
      item.listScore = entry.score;
      item.score = entry.score;
    }
    item.progress = entry.progress || undefined;
    item.startedYear = n(entry.startedAt?.year);
    item.completedYear = n(entry.completedAt?.year);
  }
  return item;
}

export function characterToItem(c: AniCharacter): Item {
  const origin = c.media?.nodes?.[0]?.title;
  return {
    id: uid('i'),
    title: c.name.userPreferred || c.name.full || c.name.native || 'Personagem',
    titleEnglish: n(c.name.full),
    titleRomaji: n(c.name.full),
    titleNative: n(c.name.native),
    img: c.image?.large || '',
    kind: 'character',
    addedAt: Date.now(),
    anilistId: c.id,
    favourites: n(c.favourites),
    origin: origin ? origin.english || origin.romaji : undefined,
  };
}

/** Metadata fields refreshed from AniList (never touches personal fields or list placement). */
export function refreshFields(target: Item, fresh: Item) {
  const keep = { id: target.id, title: target.title, titleEdited: target.titleEdited, score: target.score, note: target.note, spoiler: target.spoiler, addedAt: target.addedAt, listStatus: target.listStatus, listScore: target.listScore, progress: target.progress, startedYear: target.startedYear, completedYear: target.completedYear };
  Object.assign(target, fresh, keep);
  if (!target.titleEdited) target.title = fresh.title;
}

// ── Queries ────────────────────────────────────────────
export interface UserListResult {
  user: { name: string; avatar?: string };
  items: Item[];
}

export async function fetchUserList(userName: string, type: 'ANIME' | 'MANGA', signal?: AbortSignal): Promise<UserListResult> {
  const q = `query($u: String, $t: MediaType) {
    MediaListCollection(userName: $u, type: $t) {
      user { name avatar { large } }
      lists { entries { status score(format: POINT_100) progress startedAt { year } completedAt { year } media { ${MEDIA} } } }
    }
  }`;
  const d = await gql<{ MediaListCollection: { user: { name: string; avatar?: { large?: string } }; lists: { entries: ListEntry[] }[] } | null }>(q, { u: userName, t: type }, signal);
  const col = d.MediaListCollection;
  if (!col) throw new AniListError('Usuário não encontrado no AniList.', 404);
  const seen = new Set<number>();
  const items: Item[] = [];
  for (const l of col.lists) {
    for (const e of l.entries) {
      if (!e.media || seen.has(e.media.id)) continue;
      seen.add(e.media.id);
      items.push(mediaToItem(e.media, e));
    }
  }
  return { user: { name: col.user?.name ?? userName, avatar: col.user?.avatar?.large }, items };
}

export async function fetchFavouriteCharacters(userName: string, signal?: AbortSignal): Promise<Item[]> {
  const out: Item[] = [];
  for (let page = 1; page <= 8; page++) {
    const q = `query($u: String, $p: Int) { User(name: $u) { favourites { characters(page: $p, perPage: 25) { pageInfo { hasNextPage } nodes { ${CHARACTER} } } } } }`;
    const d = await gql<{ User: { favourites: { characters: { pageInfo: { hasNextPage: boolean }; nodes: AniCharacter[] } } } | null }>(q, { u: userName, p: page }, signal);
    if (!d.User) throw new AniListError('Usuário não encontrado no AniList.', 404);
    const c = d.User.favourites.characters;
    out.push(...c.nodes.map(characterToItem));
    if (!c.pageInfo.hasNextPage) break;
  }
  return out;
}

export async function fetchSeason(season: Season, year: number, opts: { includeSequels: boolean; formats: string[] }, signal?: AbortSignal): Promise<Item[]> {
  const out: Item[] = [];
  for (let page = 1; page <= 4; page++) {
    const q = `query($s: MediaSeason, $y: Int, $p: Int, $f: [MediaFormat]) {
      Page(page: $p, perPage: 50) {
        pageInfo { hasNextPage }
        media(season: $s, seasonYear: $y, type: ANIME, isAdult: false, format_in: $f, sort: [POPULARITY_DESC]) { ${MEDIA} }
      }
    }`;
    const d = await gql<{ Page: { pageInfo: { hasNextPage: boolean }; media: AniMedia[] } }>(q, { s: season, y: year, p: page, f: opts.formats }, signal);
    out.push(...d.Page.media.map((m) => mediaToItem(m)));
    if (!d.Page.pageInfo.hasNextPage) break;
  }
  return opts.includeSequels ? out : out.filter((i) => !i.sequel);
}

export type SearchKind = 'ANIME' | 'MANGA' | 'CHARACTER';

export async function search(query: string, kind: SearchKind, signal?: AbortSignal): Promise<Item[]> {
  if (kind === 'CHARACTER') {
    const q = `query($s: String) { Page(perPage: 30) { characters(search: $s, sort: [SEARCH_MATCH, FAVOURITES_DESC]) { ${CHARACTER} } } }`;
    const d = await gql<{ Page: { characters: AniCharacter[] } }>(q, { s: query }, signal);
    return d.Page.characters.map(characterToItem);
  }
  const q = `query($s: String, $t: MediaType) { Page(perPage: 30) { media(search: $s, type: $t, sort: [SEARCH_MATCH, POPULARITY_DESC]) { ${MEDIA} } } }`;
  const d = await gql<{ Page: { media: AniMedia[] } }>(q, { s: query, t: kind }, signal);
  return d.Page.media.map((m) => mediaToItem(m));
}

export async function trending(kind: SearchKind, signal?: AbortSignal): Promise<Item[]> {
  if (kind === 'CHARACTER') {
    const q = `query { Page(perPage: 30) { characters(sort: FAVOURITES_DESC) { ${CHARACTER} } } }`;
    const d = await gql<{ Page: { characters: AniCharacter[] } }>(q, {}, signal);
    return d.Page.characters.map(characterToItem);
  }
  const q = `query($t: MediaType) { Page(perPage: 30) { media(type: $t, sort: TRENDING_DESC, isAdult: false) { ${MEDIA} } } }`;
  const d = await gql<{ Page: { media: AniMedia[] } }>(q, { t: kind }, signal);
  return d.Page.media.map((m) => mediaToItem(m));
}

/** Fetches fresh metadata for many ids (batched 50 per request). */
export async function fetchByIds(ids: number[], kind: 'media' | 'character', onProgress?: (done: number) => void, signal?: AbortSignal): Promise<Map<number, Item>> {
  const map = new Map<number, Item>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    if (kind === 'character') {
      const q = `query($ids: [Int]) { Page(perPage: 50) { characters(id_in: $ids) { ${CHARACTER} } } }`;
      const d = await gql<{ Page: { characters: AniCharacter[] } }>(q, { ids: chunk }, signal);
      d.Page.characters.forEach((c) => map.set(c.id, characterToItem(c)));
    } else {
      const q = `query($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids) { ${MEDIA} } } }`;
      const d = await gql<{ Page: { media: AniMedia[] } }>(q, { ids: chunk }, signal);
      d.Page.media.forEach((m) => map.set(m.id, mediaToItem(m)));
    }
    onProgress?.(Math.min(unique.length, i + 50));
  }
  return map;
}

/** Finds the best AniList match for many titles using aliased queries (10 per request). */
export async function matchTitles(titles: string[], type: 'ANIME' | 'MANGA', onProgress?: (done: number) => void, signal?: AbortSignal): Promise<(Item | null)[]> {
  const out: (Item | null)[] = [];
  for (let i = 0; i < titles.length; i += 10) {
    const chunk = titles.slice(i, i + 10);
    const vars: Record<string, unknown> = { t: type };
    const decl = chunk.map((_, j) => `$s${j}: String`).join(', ');
    const body = chunk.map((_, j) => `m${j}: Media(search: $s${j}, type: $t) { ${MEDIA} }`).join('\n');
    chunk.forEach((s, j) => (vars['s' + j] = s));
    let d: Record<string, AniMedia | null> = {};
    try {
      d = await gql<Record<string, AniMedia | null>>(`query(${decl}, $t: MediaType) { ${body} }`, vars, signal);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
    }
    chunk.forEach((_, j) => {
      const m = d['m' + j];
      out.push(m ? mediaToItem(m) : null);
    });
    onProgress?.(Math.min(titles.length, i + 10));
  }
  return out;
}

export interface MediaDetail {
  description?: string;
  bannerImage?: string;
  status?: string;
  nextAiringEpisode?: { episode: number; airingAt: number };
  rankings?: { rank: number; type: string; allTime: boolean; context: string; year?: number }[];
  siteUrl?: string;
}

const detailCache = new Map<string, Promise<MediaDetail | null>>();

export function fetchDetail(item: Item): Promise<MediaDetail | null> {
  if (!item.anilistId) return Promise.resolve(null);
  const key = item.kind + item.anilistId;
  let p = detailCache.get(key);
  if (!p) {
    const q =
      item.kind === 'character'
        ? `query($id: Int) { Character(id: $id) { description siteUrl } }`
        : `query($id: Int) { Media(id: $id) { description bannerImage status siteUrl nextAiringEpisode { episode airingAt } rankings { rank type allTime context year } } }`;
    p = gql<{ Media?: MediaDetail; Character?: MediaDetail }>(q, { id: item.anilistId })
      .then((d) => d.Media ?? d.Character ?? null)
      .catch(() => {
        detailCache.delete(key);
        return null;
      });
    detailCache.set(key, p);
  }
  return p;
}

export function anilistUrl(item: Item): string {
  if (!item.anilistId) return `https://anilist.co/search/anime?search=${encodeURIComponent(item.title)}`;
  const seg = item.kind === 'manga' ? 'manga' : item.kind === 'character' ? 'character' : 'anime';
  return `https://anilist.co/${seg}/${item.anilistId}`;
}

/** AniList serves every cover size under the same filename. */
export function coverAt(url: string, size: 'medium' | 'large' | 'extraLarge'): string {
  if (!url || !url.includes('anilistcdn')) return url;
  return url.replace(/\/cover\/(small|medium|large|extraLarge)\//, `/cover/${size}/`);
}

/** Turns AniList's HTML-ish descriptions into plain paragraphs. */
export function cleanDescription(html?: string): string[] {
  if (!html) return [];
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/~!([\s\S]*?)!~/g, '[spoiler]')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/__(.*?)__/g, '$1');
  return text
    .split(/\n{1,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}
