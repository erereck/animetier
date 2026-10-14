import type { Item, TierList, TitleLang } from '../types';
import type { PoolSort } from '../store/settings';
import type { PoolFilters } from '../store/ui';
import { displayTitle, normTitle } from './util';
import { isSequel } from './ops';

export function matches(item: Item, q: string): boolean {
  if (!q) return true;
  const hay = normTitle([item.title, item.titleEnglish, item.titleRomaji, item.titleNative, item.studio, item.origin, ...(item.genres || [])].filter(Boolean).join(' · '));
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function activeFilterCount(f: PoolFilters) {
  return f.genres.length + f.formats.length + f.statuses.length + f.decades.length + (f.hideSequels ? 1 : 0);
}

export function passesFilters(i: Item, f: PoolFilters): boolean {
  if (f.hideSequels && isSequel(i)) return false;
  if (f.genres.length && !f.genres.some((g) => i.genres?.includes(g))) return false;
  if (f.formats.length && !(i.format && f.formats.includes(i.format))) return false;
  if (f.statuses.length && !(i.listStatus && f.statuses.includes(i.listStatus))) return false;
  if (f.decades.length && !(i.year && f.decades.includes(Math.floor(i.year / 10) * 10))) return false;
  return true;
}

const SEASON_ORDER: Record<string, number> = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 };

export function sortPool(list: TierList, ids: string[], sort: PoolSort, lang: TitleLang): string[] {
  const it = (id: string) => list.items[id];
  const a = [...ids];
  switch (sort) {
    case 'title':
      return a.sort((x, y) => displayTitle(it(x), lang).localeCompare(displayTitle(it(y), lang), 'pt-BR'));
    case 'score':
    case 'listScore':
      return a.sort((x, y) => (it(y).score ?? -1) - (it(x).score ?? -1));
    case 'alScore':
      return a.sort((x, y) => (it(y).alScore ?? -1) - (it(x).alScore ?? -1));
    case 'popularity':
      return a.sort((x, y) => (it(y).popularity ?? -1) - (it(x).popularity ?? -1));
    case 'year':
      return a.sort((x, y) => (it(y).year ?? 0) - (it(x).year ?? 0) || (it(y).month ?? 0) - (it(x).month ?? 0));
    case 'season':
      return a.sort(
        (x, y) =>
          (it(y).seasonYear ?? it(y).year ?? 0) - (it(x).seasonYear ?? it(x).year ?? 0) ||
          (SEASON_ORDER[it(y).season ?? ''] ?? -1) - (SEASON_ORDER[it(x).season ?? ''] ?? -1),
      );
    case 'format':
      return a.sort((x, y) => (it(x).format ?? 'ZZ').localeCompare(it(y).format ?? 'ZZ'));
    default:
      return a;
  }
}

export function poolView(list: TierList, q: string, f: PoolFilters, sort: PoolSort, lang: TitleLang): string[] {
  const nq = normTitle(q);
  const ids = list.pool.filter((id) => {
    const i = list.items[id];
    return i && matches(i, nq) && passesFilters(i, f);
  });
  return sortPool(list, ids, sort, lang);
}

export const SORT_LABEL: Record<PoolSort, string> = {
  added: 'Ordem de chegada',
  title: 'Título (A→Z)',
  score: 'Sua nota',
  listScore: 'Sua nota',
  alScore: 'Nota do AniList',
  popularity: 'Popularidade',
  year: 'Mais recentes',
  season: 'Temporada',
  format: 'Formato',
};
