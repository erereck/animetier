import type { Item, TierList } from '../types';
import { genrePT } from './util';

/**
 * Turns tier placement into an "affinity" number: top non-empty tier = 100,
 * bottom non-empty tier = 0. This lets us analyze taste without requiring scores.
 */
export interface Ranked {
  item: Item;
  tierIdx: number; // index among non-empty tiers
  tierId: string;
  aff: number;
}

export interface Group {
  key: string;
  label: string;
  n: number;
  aff: number;
  delta: number;
}

export interface Insights {
  total: number;
  ranked: Ranked[];
  tiers: { id: string; name: string; color: string; count: number; alAvg: number | null; scoreAvg: number | null; alValues: { item: Item; v: number }[] }[];
  meanAff: number;
  rho: number | null;
  rhoN: number;
  hours: number;
  episodes: number;
  avgScore: number | null;
  scored: number;
  withMeta: number;
  genres: Group[];
  studios: Group[];
  years: { year: number; n: number; aff: number | null }[];
  formats: { key: string; n: number }[];
  sources: { key: string; n: number }[];
  seasons: { key: string; n: number }[];
  statuses: { key: string; n: number }[];
  loves: Ranked[]; // high tier, low community score
  hates: Ranked[]; // low tier, high community score
  marathons: { item: Item; hours: number }[];
  goldenYear: { year: number; aff: number; n: number } | null;
  persona: { title: string; lines: string[] } | null;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

function ranks(a: number[]): number[] {
  const idx = a.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

export function spearman(x: number[], y: number[]): number | null {
  if (x.length < 8) return null;
  const rx = ranks(x);
  const ry = ranks(y);
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

function watchHours(i: Item): number {
  if (i.kind !== 'anime' || !i.duration) return 0;
  const eps = i.progress ?? (i.listStatus === 'COMPLETED' ? i.episodes ?? 0 : 0);
  return (eps * i.duration) / 60;
}

function groupBy(ranked: Ranked[], keyOf: (i: Item) => string[], min: number, meanAff: number, label = (k: string) => k): Group[] {
  const m = new Map<string, number[]>();
  for (const r of ranked) for (const k of keyOf(r.item)) (m.get(k) ?? m.set(k, []).get(k)!).push(r.aff);
  return [...m.entries()]
    .filter(([, v]) => v.length >= min)
    .map(([key, v]) => ({ key, label: label(key), n: v.length, aff: mean(v), delta: mean(v) - meanAff }))
    .sort((a, b) => b.delta - a.delta);
}

const ADJ: Record<string, string> = {
  Romance: 'romântico',
  Comedy: 'risonho',
  Action: 'explosivo',
  Drama: 'dramático',
  'Slice of Life': 'contemplativo',
  'Sci-Fi': 'futurista',
  Psychological: 'cabeçudo',
  Fantasy: 'sonhador',
  Mystery: 'investigador',
  Sports: 'competitivo',
  Horror: 'destemido',
  Mecha: 'piloto',
  Music: 'melômano',
  Supernatural: 'místico',
  Thriller: 'tenso',
  Adventure: 'aventureiro',
  Ecchi: 'sem vergonha',
  'Mahou Shoujo': 'mágico',
};

export function computeInsights(list: TierList): Insights {
  const nonEmpty = list.tiers.filter((t) => t.items.length);
  const T = nonEmpty.length;
  const ranked: Ranked[] = [];
  nonEmpty.forEach((t, ti) => {
    const aff = T > 1 ? 100 * (1 - ti / (T - 1)) : 50;
    for (const id of t.items) if (list.items[id]) ranked.push({ item: list.items[id], tierIdx: ti, tierId: t.id, aff });
  });
  const all = Object.values(list.items);
  const meanAff = mean(ranked.map((r) => r.aff));

  const withAl = ranked.filter((r) => r.item.alScore != null);
  const rho = spearman(
    withAl.map((r) => r.aff),
    withAl.map((r) => r.item.alScore!),
  );

  const tiers = list.tiers.map((t) => {
    const its = t.items.map((id) => list.items[id]).filter(Boolean);
    const al = its.filter((i) => i.alScore != null);
    const sc = its.filter((i) => i.score != null);
    return {
      id: t.id,
      name: t.name,
      color: t.color,
      count: its.length,
      alAvg: al.length ? mean(al.map((i) => i.alScore!)) : null,
      scoreAvg: sc.length ? mean(sc.map((i) => i.score!)) : null,
      alValues: al.map((i) => ({ item: i, v: i.alScore! })),
    };
  });

  const scoredItems = all.filter((i) => i.score != null);
  const hours = all.reduce((h, i) => h + watchHours(i), 0);
  const episodes = all.reduce((n, i) => n + (i.kind === 'anime' ? i.progress ?? (i.listStatus === 'COMPLETED' ? i.episodes ?? 0 : 0) : 0), 0);

  const genres = groupBy(ranked, (i) => i.genres ?? [], 5, meanAff, genrePT);
  const studios = groupBy(ranked, (i) => (i.studio ? [i.studio] : []), 3, meanAff);

  const yearMap = new Map<number, number[]>();
  for (const i of all) if (i.year) yearMap.set(i.year, yearMap.get(i.year) ?? []);
  for (const r of ranked) if (r.item.year) yearMap.get(r.item.year)!.push(r.aff);
  const yearCount = new Map<number, number>();
  for (const i of all) if (i.year) yearCount.set(i.year, (yearCount.get(i.year) ?? 0) + 1);
  const ys = [...yearCount.keys()].sort((a, b) => a - b);
  const years: Insights['years'] = [];
  if (ys.length) for (let y = ys[0]; y <= ys[ys.length - 1]; y++) years.push({ year: y, n: yearCount.get(y) ?? 0, aff: yearMap.get(y)?.length ? mean(yearMap.get(y)!) : null });
  const golden = years.filter((y) => y.aff != null && (yearMap.get(y.year)?.length ?? 0) >= 5).sort((a, b) => b.aff! - a.aff!)[0];

  const count = (key: (i: Item) => string | undefined) => {
    const m = new Map<string, number>();
    for (const i of all) {
      const k = key(i);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([k, n]) => ({ key: k, n })).sort((a, b) => b.n - a.n);
  };

  // Controversy: how far the tier placement sits from the community score.
  const contro = withAl.map((r) => ({ r, d: r.aff - r.item.alScore! }));
  const loves = contro
    .filter((x) => x.r.aff >= 60 && x.d > 0)
    .sort((a, b) => b.d - a.d)
    .slice(0, 6)
    .map((x) => x.r);
  const hates = contro
    .filter((x) => x.r.aff <= 40 && x.d < 0)
    .sort((a, b) => a.d - b.d)
    .slice(0, 6)
    .map((x) => x.r);

  const marathons = all
    .map((item) => ({ item, hours: watchHours(item) }))
    .filter((x) => x.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 5);

  const ins: Insights = {
    total: all.length,
    ranked,
    tiers,
    meanAff,
    rho,
    rhoN: withAl.length,
    hours,
    episodes,
    avgScore: scoredItems.length ? mean(scoredItems.map((i) => i.score!)) : null,
    scored: scoredItems.length,
    withMeta: all.filter((i) => i.anilistId).length,
    genres,
    studios,
    years,
    formats: count((i) => i.format),
    sources: count((i) => i.source),
    seasons: count((i) => i.season),
    statuses: count((i) => i.listStatus),
    loves,
    hates,
    marathons,
    goldenYear: golden ? { year: golden.year, aff: golden.aff!, n: yearMap.get(golden.year)!.length } : null,
    persona: null,
  };
  ins.persona = persona(ins);
  return ins;
}

function persona(i: Insights): Insights['persona'] {
  if (i.ranked.length < 12) return null;
  const top = i.genres[0];
  const bottom = i.genres[i.genres.length - 1];
  const noun = i.rho == null ? 'Colecionador' : i.rho >= 0.45 ? 'Curador' : i.rho >= 0.2 ? 'Crítico' : i.rho >= 0 ? 'Independente' : 'Rebelde';
  const adjKey = top && top.delta > 2 ? Object.keys(ADJ).find((k) => genrePT(k) === top.label) : undefined;
  const title = adjKey ? `${noun} ${ADJ[adjKey]}` : noun;
  const lines: string[] = [];
  if (i.rho != null) {
    const pct = Math.round(Math.max(0, i.rho) * 100);
    lines.push(
      i.rho >= 0.45
        ? `Suas tiers batem bastante com a comunidade do AniList (concordância de ${pct}%). Você sabe o que é bom — e o mundo concorda.`
        : i.rho >= 0.2
          ? `Você concorda com o AniList às vezes (${pct}%), mas não pede permissão pra discordar.`
          : i.rho >= 0
            ? `Suas tiers quase não seguem a nota da comunidade (${pct}% de concordância). Gosto próprio, sem medo.`
            : `Você ranqueia praticamente ao contrário do AniList. O que o mundo ama, você desconfia.`,
    );
  }
  if (top && top.delta > 3) lines.push(`${top.label} é o seu fraco: fica ${Math.round(top.delta)} pontos acima da sua média.`);
  if (bottom && bottom.delta < -3 && bottom !== top) lines.push(`${bottom.label} sofre na sua mão: ${Math.abs(Math.round(bottom.delta))} pontos abaixo da média.`);
  if (i.goldenYear) lines.push(`Seu ano de ouro é ${i.goldenYear.year} — as obras de lá ficam, em média, nas suas tiers mais altas.`);
  if (i.studios[0] && i.studios[0].delta > 5) lines.push(`Estúdio do coração: ${i.studios[0].label}.`);
  return { title, lines };
}
