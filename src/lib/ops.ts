/**
 * Pure mutations on a (draft) TierList. Used inside immer `produce` via the editor store.
 */
import type { Item, Tier, TierList, TitleLang } from '../types';
import { POOL } from '../types';
import { mkTier, scoreThresholds, TIER_PALETTE, type Grouping } from './presets';
import { displayTitle, shuffle, uid } from './util';

export function containerItems(list: TierList, container: string): string[] | null {
  if (container === POOL) return list.pool;
  return list.tiers.find((t) => t.id === container)?.items ?? null;
}

export function findContainer(list: TierList, itemId: string): string | null {
  if (list.pool.includes(itemId)) return POOL;
  for (const t of list.tiers) if (t.items.includes(itemId)) return t.id;
  return null;
}

/** Detaches ids from wherever they are. */
export function detach(list: TierList, ids: Iterable<string>) {
  const set = new Set(ids);
  list.pool = list.pool.filter((x) => !set.has(x));
  for (const t of list.tiers) if (t.items.some((x) => set.has(x))) t.items = t.items.filter((x) => !set.has(x));
}

/** Moves ids (in the given order) into a container at index (default end). Locked tiers refuse. */
export function moveItems(list: TierList, ids: string[], to: string, index?: number): boolean {
  const target = containerItems(list, to);
  if (!target) return false;
  const tier = list.tiers.find((t) => t.id === to);
  if (tier?.locked) return false;
  const valid = ids.filter((id) => list.items[id]);
  // Index is relative to the target *before* removal; compensate for items leaving from above.
  let at = index ?? target.length;
  if (index != null) at -= target.slice(0, index).filter((x) => valid.includes(x)).length;
  detach(list, valid);
  const fresh = containerItems(list, to)!;
  fresh.splice(Math.max(0, Math.min(at, fresh.length)), 0, ...valid);
  return true;
}

export function removeItems(list: TierList, ids: Iterable<string>) {
  const arr = [...ids];
  detach(list, arr);
  for (const id of arr) delete list.items[id];
}

export function itemKey(i: Item): string {
  if (i.anilistId && i.kind !== 'custom') return `${i.kind}:${i.anilistId}`;
  return `img:${i.img}`;
}

/** Adds items to a container, skipping ones already in the list. Returns how many were added. */
export function addItems(list: TierList, items: Item[], to: string = POOL, index?: number): string[] {
  const existing = new Set(Object.values(list.items).map(itemKey));
  const added: string[] = [];
  for (const it of items) {
    const k = itemKey(it);
    if (existing.has(k)) continue;
    existing.add(k);
    const copy = { ...it, id: list.items[it.id] ? uid('i') : it.id };
    list.items[copy.id] = copy;
    added.push(copy.id);
  }
  const target = containerItems(list, to) ?? list.pool;
  target.splice(index ?? target.length, 0, ...added);
  return added;
}

// ── Tiers ──────────────────────────────────────────────
export function nextTierColor(list: TierList): string {
  const used = new Set(list.tiers.map((t) => t.color));
  return TIER_PALETTE.find((c) => !used.has(c)) ?? TIER_PALETTE[list.tiers.length % TIER_PALETTE.length];
}

export function insertTier(list: TierList, at: number, name = 'Nova tier'): Tier {
  const t = mkTier(name, nextTierColor(list));
  list.tiers.splice(at, 0, t);
  return t;
}

export function deleteTier(list: TierList, tierId: string) {
  const i = list.tiers.findIndex((t) => t.id === tierId);
  if (i < 0) return;
  list.pool.unshift(...list.tiers[i].items);
  list.tiers.splice(i, 1);
}

export function duplicateTier(list: TierList, tierId: string) {
  const i = list.tiers.findIndex((t) => t.id === tierId);
  if (i < 0) return;
  const src = list.tiers[i];
  list.tiers.splice(i + 1, 0, { ...src, id: uid('t'), name: src.name + ' (cópia)', items: [], locked: false });
}

export function mergeTier(list: TierList, fromId: string, intoId: string) {
  const from = list.tiers.find((t) => t.id === fromId);
  const into = list.tiers.find((t) => t.id === intoId);
  if (!from || !into || from === into) return;
  into.items.push(...from.items);
  list.tiers = list.tiers.filter((t) => t.id !== fromId);
}

export function clearTier(list: TierList, tierId: string) {
  const t = list.tiers.find((x) => x.id === tierId);
  if (!t) return;
  list.pool.unshift(...t.items);
  t.items = [];
}

export type TierSort = 'title' | 'score' | 'alScore' | 'year' | 'popularity' | 'shuffle' | 'reverse';

export function sortTier(list: TierList, tierId: string, mode: TierSort, lang: TitleLang) {
  const t = list.tiers.find((x) => x.id === tierId);
  if (!t) return;
  t.items = sortIds(list, t.items, mode, lang);
}

export function sortIds(list: TierList, ids: string[], mode: TierSort, lang: TitleLang): string[] {
  const it = (id: string) => list.items[id];
  const a = [...ids];
  switch (mode) {
    case 'title':
      return a.sort((x, y) => displayTitle(it(x), lang).localeCompare(displayTitle(it(y), lang), 'pt-BR'));
    case 'score':
      return a.sort((x, y) => (it(y).score ?? -1) - (it(x).score ?? -1));
    case 'alScore':
      return a.sort((x, y) => (it(y).alScore ?? -1) - (it(x).alScore ?? -1));
    case 'year':
      return a.sort((x, y) => (it(y).year ?? 0) - (it(x).year ?? 0) || (it(y).month ?? 0) - (it(x).month ?? 0));
    case 'popularity':
      return a.sort((x, y) => (it(y).popularity ?? 0) - (it(x).popularity ?? 0));
    case 'shuffle':
      return shuffle(a);
    case 'reverse':
      return a.reverse();
  }
}

// ── Auto-organize ──────────────────────────────────────
/** Puts scored pool items into existing tiers by score bands. Returns moved count. */
export function distributeByScore(list: TierList): number {
  const tiers = list.tiers.filter((t) => !t.locked);
  if (!tiers.length) return 0;
  const th = scoreThresholds(tiers.length);
  let moved = 0;
  list.pool = list.pool.filter((id) => {
    const s = list.items[id]?.score;
    if (s == null) return true;
    const idx = th.findIndex((min) => s >= min);
    tiers[idx === -1 ? tiers.length - 1 : idx].items.push(id);
    moved++;
    return false;
  });
  return moved;
}

/** Rebuilds tiers from a metadata grouping. scope 'all' regroups everything already ranked too. */
export function groupInto(list: TierList, g: Grouping, scope: 'pool' | 'all'): number {
  const ids = scope === 'all' ? [...list.tiers.flatMap((t) => t.items), ...list.pool] : [...list.pool];
  const groups = new Map<string, { label: string; color: string; order: number; ids: string[] }>();
  const leftovers: string[] = [];
  for (const id of ids) {
    const k = g.key(list.items[id]);
    if (!k) {
      leftovers.push(id);
      continue;
    }
    let grp = groups.get(k.key);
    if (!grp) groups.set(k.key, (grp = { label: k.label, color: k.color, order: k.order, ids: [] }));
    grp.ids.push(id);
  }
  const sorted = [...groups.values()].sort((a, b) => a.order - b.order || b.ids.length - a.ids.length);
  const moved = sorted.reduce((n, x) => n + x.ids.length, 0);
  if (scope === 'all') {
    list.tiers = sorted.map((x) => ({ id: uid('t'), name: x.label, color: x.color, items: x.ids }));
    list.pool = leftovers;
  } else {
    for (const x of sorted) {
      let tier = list.tiers.find((t) => t.name === x.label);
      if (!tier) {
        tier = { id: uid('t'), name: x.label, color: x.color, items: [] };
        list.tiers.push(tier);
      }
      tier.items.push(...x.ids);
    }
    list.pool = leftovers;
  }
  return moved;
}

export function distributeEvenly(list: TierList, random: boolean): number {
  const tiers = list.tiers.filter((t) => !t.locked);
  if (!tiers.length) return 0;
  const ids = random ? shuffle(list.pool) : [...list.pool];
  ids.forEach((id, i) => tiers[random ? Math.floor(Math.random() * tiers.length) : i % tiers.length].items.push(id));
  list.pool = [];
  return ids.length;
}

const SEQUEL_RE = [/\bseason\s*\d+\b/i, /\b\d+(st|nd|rd|th)\s*season\b/i, /\bcour\s*\d+\b/i, /\bpart\s*(?:[2-9]|1\d|ii+|iv|v|vi+)\b/i, /[\s\-:](?:[2-9]|ii+|iv|vi*)\s*$/i, /\bfinal season\b/i];

export function isSequel(i: Item): boolean {
  if (i.sequel) return true;
  if (i.kind === 'character') return false;
  return [i.title, i.titleRomaji, i.titleEnglish].some((t) => !!t && SEQUEL_RE.some((r) => r.test(t)));
}
