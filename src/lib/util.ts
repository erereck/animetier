import type { Item, TitleLang } from '../types';

let counter = 0;
export function uid(prefix = ''): string {
  counter = (counter + 1) % 1296;
  return prefix + Date.now().toString(36) + counter.toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 6);
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const d = (...a: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.flush = (...a: A) => {
    clearTimeout(t);
    fn(...a);
  };
  return d;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'agora mesmo';
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Color ──────────────────────────────────────────────
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Relative luminance (WCAG). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ink color that reads on top of `bg`. */
export function inkOn(bg: string): string {
  return luminance(bg) > 0.36 ? '#14111c' : '#ffffff';
}

export function withAlpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Scores ─────────────────────────────────────────────
export const SCORE_BANDS = [
  { min: 90, label: 'Obra-prima', color: '#5ee7ff' },
  { min: 80, label: 'Excelente', color: '#4ade80' },
  { min: 70, label: 'Bom', color: '#a3e635' },
  { min: 60, label: 'Ok', color: '#facc15' },
  { min: 45, label: 'Fraco', color: '#fb923c' },
  { min: 0, label: 'Ruim', color: '#f43f5e' },
];

export function scoreBand(n: number) {
  return SCORE_BANDS.find((b) => n >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}
export const scoreColor = (n: number) => scoreBand(n).color;

// ── Titles & labels ────────────────────────────────────
export function displayTitle(item: Item, lang: TitleLang): string {
  if (item.titleEdited) return item.title;
  const pick =
    lang === 'romaji' ? item.titleRomaji : lang === 'native' ? item.titleNative : item.titleEnglish;
  return pick || item.title || item.titleRomaji || item.titleEnglish || 'Sem título';
}

export const FORMAT_LABEL: Record<string, string> = {
  TV: 'TV',
  TV_SHORT: 'TV curto',
  MOVIE: 'Filme',
  SPECIAL: 'Especial',
  OVA: 'OVA',
  ONA: 'ONA',
  MUSIC: 'Clipe',
  MANGA: 'Mangá',
  NOVEL: 'Light novel',
  ONE_SHOT: 'One-shot',
};

export const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Completo',
  CURRENT: 'Assistindo',
  PLANNING: 'Planejo ver',
  DROPPED: 'Dropado',
  PAUSED: 'Pausado',
  REPEATING: 'Revendo',
};

export const STATUS_COLOR: Record<string, string> = {
  COMPLETED: '#4ade80',
  CURRENT: '#38bdf8',
  PLANNING: '#a78bfa',
  DROPPED: '#f43f5e',
  PAUSED: '#fb923c',
  REPEATING: '#facc15',
};

export const SEASON_LABEL: Record<string, string> = {
  WINTER: 'Inverno',
  SPRING: 'Primavera',
  SUMMER: 'Verão',
  FALL: 'Outono',
};
export const SEASON_COLOR: Record<string, string> = {
  WINTER: '#7dd3fc',
  SPRING: '#f9a8d4',
  SUMMER: '#fde047',
  FALL: '#fdba74',
};

export const SOURCE_LABEL: Record<string, string> = {
  ORIGINAL: 'Original',
  MANGA: 'Mangá',
  LIGHT_NOVEL: 'Light novel',
  VISUAL_NOVEL: 'Visual novel',
  VIDEO_GAME: 'Videogame',
  OTHER: 'Outro',
  NOVEL: 'Romance',
  DOUJINSHI: 'Doujinshi',
  ANIME: 'Anime',
  WEB_NOVEL: 'Web novel',
  LIVE_ACTION: 'Live action',
  GAME: 'Jogo',
  COMIC: 'Quadrinho',
  MULTIMEDIA_PROJECT: 'Multimídia',
  PICTURE_BOOK: 'Livro ilustrado',
  CARD_GAME: 'Card game',
  MUSIC: 'Música',
  BOOK: 'Livro',
};

export const COUNTRY_LABEL: Record<string, string> = {
  JP: 'Japão',
  CN: 'China',
  KR: 'Coreia do Sul',
  TW: 'Taiwan',
  US: 'EUA',
};

export function currentSeason(d = new Date()): { season: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL'; year: number } {
  const m = d.getMonth();
  const season = m < 3 ? 'WINTER' : m < 6 ? 'SPRING' : m < 9 ? 'SUMMER' : 'FALL';
  return { season, year: d.getFullYear() };
}

export function download(filename: string, data: Blob | string, type = 'application/octet-stream') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function safeFilename(s: string) {
  return (s || 'tierlist').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'tierlist';
}

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** Normalizes a title for fuzzy matching. */
export function normTitle(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9぀-ヿ一-龯]+/g, ' ')
    .trim();
}

/** HSL (deg, %, %) → #rrggbb, so every stored color stays hex. */
export function hsl(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export const GENRE_PT: Record<string, string> = {
  Action: 'Ação',
  Adventure: 'Aventura',
  Comedy: 'Comédia',
  Drama: 'Drama',
  Ecchi: 'Ecchi',
  Fantasy: 'Fantasia',
  Horror: 'Terror',
  'Mahou Shoujo': 'Mahou Shoujo',
  Mecha: 'Mecha',
  Music: 'Música',
  Mystery: 'Mistério',
  Psychological: 'Psicológico',
  Romance: 'Romance',
  'Sci-Fi': 'Ficção científica',
  'Slice of Life': 'Slice of Life',
  Sports: 'Esportes',
  Supernatural: 'Sobrenatural',
  Thriller: 'Suspense',
  Hentai: 'Hentai',
};
export const genrePT = (g: string) => GENRE_PT[g] ?? g;
