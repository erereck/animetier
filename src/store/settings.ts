import { create } from 'zustand';
import type { TitleLang } from '../types';

export type ThemeId = 'noite' | 'sakura' | 'neon' | 'persona' | 'vapor' | 'mono' | 'retro' | 'matcha';
export type FontId = 'unbounded' | 'bebas' | 'bangers' | 'rajdhani' | 'orbitron' | 'pixel' | 'rounded' | 'serif';
export type TitleMode = 'hover' | 'always' | 'never';
export type PoolSort = 'added' | 'title' | 'score' | 'alScore' | 'listScore' | 'year' | 'season' | 'popularity' | 'format';

export interface Settings {
  theme: ThemeId;
  font: FontId;
  itemSize: number;
  titles: TitleMode;
  showScores: boolean;
  showRanks: boolean;
  showSeason: boolean;
  titleLang: TitleLang;
  ambient: boolean;
  poolWidth: number;
  poolOpen: boolean;
  poolSort: PoolSort;
  poolView: 'grid' | 'list';
  hideAdult: boolean;
  lastUser: string;
  seenWelcome: boolean;
}

const DEFAULTS: Settings = {
  theme: 'noite',
  font: 'unbounded',
  itemSize: 84,
  titles: 'hover',
  showScores: false,
  showRanks: false,
  showSeason: false,
  titleLang: 'english',
  ambient: true,
  poolWidth: 380,
  poolOpen: true,
  poolSort: 'added',
  poolView: 'grid',
  hideAdult: false,
  lastUser: '',
  seenWelcome: false,
};

const KEY = 'animetier:settings';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* private mode / blocked storage */
  }
  const s = { ...DEFAULTS };
  if (typeof window !== 'undefined' && window.innerWidth < 700) s.itemSize = 64;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) s.theme = 'sakura';
  return s;
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
}

export const useSettings = create<SettingsStore>((set) => ({
  ...load(),
  set: (patch) =>
    set((s) => {
      const next = { ...s, ...patch };
      try {
        const { set: _omit, ...plain } = next;
        void _omit;
        localStorage.setItem(KEY, JSON.stringify(plain));
      } catch {
        /* ignore */
      }
      return next;
    }),
}));

export const getSettings = () => useSettings.getState();
