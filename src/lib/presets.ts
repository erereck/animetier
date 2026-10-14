import type { Item, Tier } from '../types';
import { STATUS_LABEL, STATUS_COLOR, FORMAT_LABEL, uid, hsl } from './util';

export const TIER_PALETTE = [
  '#ff4d6d', '#ff7a45', '#ffa940', '#ffd84d', '#d4f04a', '#7ee081',
  '#36d6a0', '#2ec5d3', '#4aa8ff', '#6b8cff', '#9b7bff', '#c06bff',
  '#ff6bd6', '#ff9eb5', '#c9a27e', '#8d99ae', '#e8e6f0', '#3a3a4a',
];

export function mkTier(name: string, color: string, icon?: string): Tier {
  return { id: uid('t'), name, color, icon, items: [] };
}

export interface Template {
  id: string;
  name: string;
  blurb: string;
  emoji: string;
  tiers: [string, string][];
}

export const TEMPLATES: Template[] = [
  { id: 'classic', name: 'Clássico', blurb: 'O bom e velho S até F', emoji: '🏆', tiers: [['S', '#ff4d6d'], ['A', '#ff9548'], ['B', '#ffd84d'], ['C', '#7ee081'], ['D', '#4aa8ff'], ['F', '#9b7bff']] },
  { id: 'season', name: 'Temporada', blurb: 'Pra rankear a season atual', emoji: '🌸', tiers: [['GOAT', '#ffd84d'], ['Top', '#ff4d6d'], ['Bom', '#7ee081'], ['Ok', '#4aa8ff'], ['Fraco', '#9b7bff'], ['Dropei', '#8d99ae']] },
  { id: 'numbers', name: 'Nota 10 → 5', blurb: 'Notas numéricas diretas', emoji: '🔢', tiers: [['10', '#ffd84d'], ['9', '#ff4d6d'], ['8', '#ff9548'], ['7', '#7ee081'], ['6', '#4aa8ff'], ['5', '#9b7bff']] },
  { id: 'mood', name: 'Mood', blurb: 'Como cada um te deixou', emoji: '💭', tiers: [['Amor', '#ff6bd6'], ['Chorei', '#4aa8ff'], ['Ri muito', '#ffd84d'], ['Soninho', '#9b7bff'], ['Ugh', '#ff4d6d']] },
  { id: 'waifus', name: 'Best Girls', blurb: 'Use com personagens favoritos', emoji: '💗', tiers: [['Casaria', '#ff6bd6'], ['Amo', '#ff4d6d'], ['Curto', '#ff9548'], ['Ok', '#7ee081'], ['Não', '#8d99ae']] },
  { id: 'openings', name: 'Openings', blurb: 'Banger ou skip?', emoji: '🎵', tiers: [['Banger', '#ffd84d'], ['Boa', '#7ee081'], ['Ok', '#4aa8ff'], ['Skip', '#8d99ae']] },
  { id: 'endings', name: 'Endings', blurb: 'Pra quem fica até o fim', emoji: '🎶', tiers: [['Chora', '#4aa8ff'], ['Boa', '#7ee081'], ['Ok', '#ffd84d'], ['Skip', '#8d99ae']] },
  { id: 'villains', name: 'Vilões', blurb: 'Quem é o melhor malvado', emoji: '😈', tiers: [['GOAT', '#c06bff'], ['Top', '#ff4d6d'], ['Ok', '#ff9548'], ['Genérico', '#8d99ae']] },
  { id: 'arcs', name: 'Arcos', blurb: 'Pra shonens longos', emoji: '⚔️', tiers: [['Épico', '#ffd84d'], ['Bom', '#7ee081'], ['Ok', '#4aa8ff'], ['Fraco', '#9b7bff'], ['Ruim', '#ff4d6d']] },
  { id: 'trauma', name: 'Traumas', blurb: 'Quais te destruíram', emoji: '💔', tiers: [['Me destruiu', '#ff4d6d'], ['Chorei', '#4aa8ff'], ['Doeu', '#9b7bff'], ['Só um fato', '#8d99ae']] },
  { id: 'comfort', name: 'Comfort', blurb: 'Os que abraçam a alma', emoji: '🛋️', tiers: [['Colchão', '#7ee081'], ['Quentinho', '#4aa8ff'], ['Às vezes', '#ffd84d'], ['Só ok', '#8d99ae']] },
  { id: 'backlog', name: 'Backlog', blurb: 'Priorize o que ver depois', emoji: '📌', tiers: [['Ver já', '#ff4d6d'], ['Em breve', '#ff9548'], ['Talvez', '#4aa8ff'], ['Nem a pau', '#8d99ae']] },
  { id: 'blank', name: 'Em branco', blurb: 'Uma tier e boa sorte', emoji: '✏️', tiers: [['Tier 1', '#9b7bff']] },
];

export function tiersFromTemplate(id: string): Tier[] {
  const t = TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[0];
  return t.tiers.map(([name, color]) => mkTier(name, color));
}

// ── Auto-organize ──────────────────────────────────────
export interface Grouping {
  id: string;
  name: string;
  desc: string;
  /** Returns a group key + label + color for an item, or null to leave it alone. */
  key: (i: Item) => { key: string; label: string; color: string; order: number } | null;
}

const decadeColors = ['#ff4d6d', '#ff9548', '#ffd84d', '#7ee081', '#2ec5d3', '#4aa8ff', '#9b7bff', '#ff6bd6'];

export const GROUPINGS: Grouping[] = [
  {
    id: 'status',
    name: 'Status no AniList',
    desc: 'Completo, assistindo, dropado…',
    key: (i) => {
      if (!i.listStatus) return null;
      const order = ['COMPLETED', 'REPEATING', 'CURRENT', 'PAUSED', 'PLANNING', 'DROPPED'].indexOf(i.listStatus);
      return { key: i.listStatus, label: STATUS_LABEL[i.listStatus], color: STATUS_COLOR[i.listStatus], order };
    },
  },
  {
    id: 'format',
    name: 'Formato',
    desc: 'TV, filme, OVA, ONA…',
    key: (i) => {
      if (!i.format) return null;
      const order = ['TV', 'TV_SHORT', 'ONA', 'MOVIE', 'OVA', 'SPECIAL', 'MUSIC', 'MANGA', 'NOVEL', 'ONE_SHOT'].indexOf(i.format);
      return { key: i.format, label: FORMAT_LABEL[i.format] ?? i.format, color: ['#4aa8ff', '#2ec5d3', '#7ee081', '#ff4d6d', '#9b7bff', '#ffd84d', '#ff6bd6', '#ff9548', '#c06bff', '#8d99ae'][Math.max(0, order)], order };
    },
  },
  {
    id: 'decade',
    name: 'Década',
    desc: '2020s, 2010s, 2000s…',
    key: (i) => {
      if (!i.year) return null;
      const d = Math.floor(i.year / 10) * 10;
      const idx = Math.max(0, Math.min(7, Math.floor((2029 - d) / 10)));
      return { key: String(d), label: d < 1990 ? `Anos ${String(d).slice(2)}` : `${d}s`, color: decadeColors[idx], order: -d };
    },
  },
  {
    id: 'year',
    name: 'Ano de lançamento',
    desc: 'Uma tier por ano',
    key: (i) => (i.year ? { key: String(i.year), label: String(i.year), color: hsl((i.year * 37) % 360, 80, 66), order: -i.year } : null),
  },
  {
    id: 'completed',
    name: 'Ano em que terminei',
    desc: 'Baseado na data de conclusão do AniList',
    key: (i) => (i.completedYear ? { key: String(i.completedYear), label: `Vi em ${i.completedYear}`, color: hsl((i.completedYear * 53) % 360, 75, 66), order: -i.completedYear } : null),
  },
  {
    id: 'genre',
    name: 'Gênero principal',
    desc: 'O primeiro gênero de cada obra',
    key: (i) => {
      const g = i.genres?.[0];
      if (!g) return null;
      let h = 0;
      for (const c of g) h = (h * 31 + c.charCodeAt(0)) % 360;
      return { key: g, label: g, color: hsl(h, 75, 64), order: 0 };
    },
  },
];

/** Score thresholds that spread `n` tiers over the 40–90 range. */
export function scoreThresholds(n: number): number[] {
  if (n <= 1) return [0];
  if (n === 2) return [70, 0];
  const out: number[] = [];
  for (let i = 0; i < n - 1; i++) out.push(Math.round(90 - (i * 50) / (n - 2)));
  out.push(0);
  return out;
}
