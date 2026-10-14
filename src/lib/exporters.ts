import type { TierList, TitleLang } from '../types';
import { displayTitle, download, FORMAT_LABEL, safeFilename, SEASON_LABEL, STATUS_LABEL } from './util';

export function asText(list: TierList, lang: TitleLang, markdown: boolean): string {
  const t = (id: string) => displayTitle(list.items[id], lang);
  const sc = (id: string) => {
    const s = list.items[id].score;
    return s != null ? (markdown ? ` — **${s}**` : ` [${s}]`) : '';
  };
  const lines: string[] = [markdown ? `# ${list.title}` : `=== ${list.title} ===`, ''];
  for (const tier of list.tiers) {
    if (!tier.items.length) continue;
    lines.push(markdown ? `## ${tier.icon ? tier.icon + ' ' : ''}${tier.name}` : `[${tier.name}]`);
    tier.items.forEach((id, i) => lines.push(markdown ? `${i + 1}. ${t(id)}${sc(id)}` : `  ${i + 1}. ${t(id)}${sc(id)}`));
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
}

export function exportCSV(list: TierList, lang: TitleLang) {
  const head = ['Título', 'Tier', 'Posição', 'Sua nota', 'Nota AniList', 'Gêneros', 'Estúdio', 'Ano', 'Temporada', 'Formato', 'Episódios', 'Status', 'Progresso', 'Nota pessoal', 'AniList ID'];
  const rows: (string | number)[][] = [head];
  const add = (id: string, tier: string, pos: number | '') => {
    const x = list.items[id];
    rows.push([
      displayTitle(x, lang),
      tier,
      pos,
      x.score ?? '',
      x.alScore ?? '',
      (x.genres || []).join('; '),
      x.studio ?? '',
      x.year ?? '',
      x.season ? `${SEASON_LABEL[x.season]} ${x.seasonYear ?? ''}` : '',
      x.format ? FORMAT_LABEL[x.format] ?? x.format : '',
      x.episodes ?? x.chapters ?? '',
      x.listStatus ? STATUS_LABEL[x.listStatus] : '',
      x.progress ?? '',
      (x.note || '').replace(/\n/g, ' '),
      x.anilistId ?? '',
    ]);
  };
  list.tiers.forEach((t) => t.items.forEach((id, i) => add(id, t.name, i + 1)));
  list.pool.forEach((id) => add(id, 'Pool', ''));
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  download(`${safeFilename(list.title)}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
}
