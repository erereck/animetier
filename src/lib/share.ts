import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Item, TierList } from '../types';
import { fetchByIds } from './anilist';
import { uid } from './util';

/**
 * Share links carry only references (AniList ids), never images, so even big lists fit
 * in a URL — ideally under Discord's 2,000 characters.
 *
 * Format: `#/s/2.<header>.<refs>`
 *   header — lz-compressed JSON: title, tiers (name, color, icon, count), pool count, custom items
 *   refs   — a base64url bit stream: one fixed-width value per item (id·4 + kind),
 *            then, if scores are included, a presence bit and a 7-bit score per item.
 */
interface Header {
  t: string;
  r: [string, string, string, number][]; // name, color (no #), icon, item count
  p: number;
  s: 0 | 1; // scores included
  u?: [string, string][]; // custom items: title, http url
}

const KIND = { anime: 0, manga: 1, character: 2, custom: 3 } as const;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

class BitWriter {
  private bits: number[] = [];
  write(v: number, n: number) {
    for (let i = n - 1; i >= 0; i--) this.bits.push(Math.floor(v / 2 ** i) % 2);
  }
  toString() {
    let out = '';
    for (let i = 0; i < this.bits.length; i += 6) {
      let c = 0;
      for (let j = 0; j < 6; j++) c = c * 2 + (this.bits[i + j] ?? 0);
      out += B64[c];
    }
    return out;
  }
}

class BitReader {
  private pos = 0;
  private bits: number[] = [];
  constructor(s: string) {
    for (const ch of s) {
      const c = B64.indexOf(ch);
      if (c < 0) throw new Error('Link corrompido.');
      for (let j = 5; j >= 0; j--) this.bits.push((c >> j) & 1);
    }
  }
  read(n: number) {
    let v = 0;
    for (let i = 0; i < n; i++) v = v * 2 + (this.bits[this.pos++] ?? 0);
    return v;
  }
}

export interface ShareOptions {
  includePool: boolean;
  includeScores: boolean;
}

export function encodeShare(list: TierList, opts: ShareOptions): { url: string; skipped: number } {
  const u: [string, string][] = [];
  let skipped = 0;
  type Tok = { value: number; score?: number };
  const tok = (id: string): Tok | null => {
    const it = list.items[id];
    if (!it) return null;
    let value: number;
    if (it.anilistId && it.kind !== 'custom') value = it.anilistId * 4 + KIND[it.kind];
    else if (it.img.startsWith('http')) {
      u.push([it.title, it.img]);
      value = (u.length - 1) * 4 + KIND.custom;
    } else {
      skipped++;
      return null;
    }
    return { value, score: opts.includeScores ? it.score : undefined };
  };
  const tiers = list.tiers.map((t) => ({ t, toks: t.items.map(tok).filter((x): x is Tok => !!x) }));
  const pool = opts.includePool ? list.pool.map(tok).filter((x): x is Tok => !!x) : [];
  const all = [...tiers.flatMap((x) => x.toks), ...pool];

  const width = Math.max(1, Math.ceil(Math.log2(Math.max(2, ...all.map((x) => x.value + 1)))));
  const w = new BitWriter();
  w.write(width, 5);
  for (const x of all) w.write(x.value, width);
  const scores = opts.includeScores && all.some((x) => x.score != null);
  if (scores)
    for (const x of all) {
      w.write(x.score != null ? 1 : 0, 1);
      if (x.score != null) w.write(Math.max(0, Math.min(100, Math.round(x.score))), 7);
    }

  const header: Header = {
    t: list.title,
    r: tiers.map(({ t, toks }) => [t.name, t.color.replace('#', ''), t.icon || '', toks.length]),
    p: pool.length,
    s: scores ? 1 : 0,
  };
  if (u.length) header.u = u;
  const base = location.href.split('#')[0];
  return { url: `${base}#/s/2.${compressToEncodedURIComponent(JSON.stringify(header))}.${w.toString()}`, skipped };
}

export interface DecodedShare {
  list: TierList;
  missing: number;
}

export async function decodeShare(data: string, onProgress?: (msg: string) => void): Promise<DecodedShare> {
  const [ver, head, refs = ''] = data.split('.');
  if (ver !== '2') throw new Error('Versão de link desconhecida.');
  const json = decompressFromEncodedURIComponent(head ?? '');
  if (!json) throw new Error('Link inválido ou incompleto.');
  const h = JSON.parse(json) as Header;

  const total = h.r.reduce((n, r) => n + r[3], 0) + h.p;
  const rd = new BitReader(refs);
  const width = rd.read(5);
  const values = Array.from({ length: total }, () => rd.read(width));
  const scores: (number | undefined)[] = values.map(() => undefined);
  if (h.s) for (let i = 0; i < total; i++) if (rd.read(1)) scores[i] = rd.read(7);

  type Ref = { kind: number; id: number; score?: number };
  const all: Ref[] = values.map((v, i) => ({ kind: v % 4, id: Math.floor(v / 4), score: scores[i] }));
  const mediaIds = all.filter((r) => r.kind === KIND.anime || r.kind === KIND.manga).map((r) => r.id);
  const charIds = all.filter((r) => r.kind === KIND.character).map((r) => r.id);

  onProgress?.('Buscando capas no AniList…');
  const media = mediaIds.length ? await fetchByIds(mediaIds, 'media', (d) => onProgress?.(`Buscando capas… ${d}/${mediaIds.length}`)) : new Map<number, Item>();
  const chars = charIds.length ? await fetchByIds(charIds, 'character') : new Map<number, Item>();

  const items: Record<string, Item> = {};
  let missing = 0;
  const make = (r: Ref): string | null => {
    let base: Item | undefined;
    if (r.kind === KIND.custom) {
      const c = h.u?.[r.id];
      if (!c) return null;
      base = { id: '', title: c[0], img: c[1], kind: 'custom', addedAt: Date.now() };
    } else base = (r.kind === KIND.character ? chars : media).get(r.id);
    if (!base) {
      missing++;
      return null;
    }
    const it: Item = { ...base, id: uid('i') };
    if (r.score != null) it.score = r.score;
    else delete it.score;
    items[it.id] = it;
    return it.id;
  };

  let at = 0;
  const take = (n: number) => {
    const ids = all.slice(at, at + n).map(make).filter((x): x is string => !!x);
    at += n;
    return ids;
  };
  const now = Date.now();
  const list: TierList = {
    id: uid('l'),
    title: h.t || 'Tier list compartilhada',
    createdAt: now,
    updatedAt: now,
    tiers: h.r.map((r) => ({ id: uid('t'), name: r[0], color: '#' + r[1], icon: r[2] || undefined, items: take(r[3]) })),
    pool: [],
    items,
  };
  list.pool = take(h.p);
  return { list, missing };
}
