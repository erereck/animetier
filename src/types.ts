export type ItemKind = 'anime' | 'manga' | 'character' | 'custom';
export type ListStatus = 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'DROPPED' | 'PAUSED' | 'REPEATING';
export type Season = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
export type TitleLang = 'english' | 'romaji' | 'native';

export interface Tag {
  name: string;
  rank: number;
}

export interface Item {
  id: string;
  /** Display title. Overridden by titleLang preference unless `titleEdited`. */
  title: string;
  titleEdited?: boolean;
  /** http(s) URL, data URL, or `local:<key>` for a Blob stored in IndexedDB. */
  img: string;
  kind: ItemKind;
  addedAt: number;

  // Personal
  score?: number; // 0–100
  note?: string;
  spoiler?: boolean;

  // AniList metadata
  anilistId?: number;
  color?: string;
  titleRomaji?: string;
  titleEnglish?: string;
  titleNative?: string;
  genres?: string[];
  tags?: Tag[];
  studio?: string;
  year?: number;
  month?: number;
  season?: Season;
  seasonYear?: number;
  format?: string;
  episodes?: number;
  chapters?: number;
  duration?: number;
  alScore?: number;
  popularity?: number;
  favourites?: number;
  source?: string;
  country?: string;
  isAdult?: boolean;
  /** Media that has a PREQUEL relation (i.e. it is a continuation). */
  sequel?: boolean;
  /** For characters: the series they're from. */
  origin?: string;

  // The user's AniList list entry
  listStatus?: ListStatus;
  listScore?: number;
  progress?: number;
  startedYear?: number;
  completedYear?: number;
}

export interface Tier {
  id: string;
  name: string;
  color: string;
  icon?: string;
  locked?: boolean;
  collapsed?: boolean;
  items: string[];
}

export interface TierList {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  tiers: Tier[];
  pool: string[];
  items: Record<string, Item>;
  /** Owner's AniList username, remembered for refresh/import shortcuts. */
  anilistUser?: string;
}

export interface ListSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  total: number;
  ranked: number;
  /** Small preview for library cards: tier colors + a few covers each. */
  preview: { color: string; covers: string[] }[];
  poolCovers: string[];
}

/** Where an item currently lives: a tier id or the pool. */
export type ContainerId = string; // tier id | 'pool'
export const POOL = 'pool';
