import { create } from 'zustand';

export type DialogId =
  | null
  | 'export'
  | 'share'
  | 'help'
  | 'history'
  | 'import'
  | 'organize'
  | 'sequels'
  | 'refresh'
  | 'speed'
  | 'theme';

export interface PoolFilters {
  genres: string[];
  formats: string[];
  statuses: string[];
  decades: number[];
  hideSequels: boolean;
}

export const EMPTY_FILTERS: PoolFilters = { genres: [], formats: [], statuses: [], decades: [], hideSequels: false };

interface UIStore {
  selected: Set<string>;
  search: string;
  filters: PoolFilters;
  inspectId: string | null;
  dialog: DialogId;
  duelTierId: string | null;
  palette: boolean;
  insights: boolean;
  poolTab: 'pool' | 'add';
  sheet: 'peek' | 'half' | 'full';
  itemMenu: { id: string; x: number; y: number } | null;
  tierMenu: { id: string; el: HTMLElement } | null;

  select: (ids: string[], mode?: 'toggle' | 'add' | 'replace') => void;
  clearSelection: () => void;
  setSearch: (s: string) => void;
  setFilters: (f: Partial<PoolFilters>) => void;
  inspect: (id: string | null) => void;
  openDialog: (d: DialogId) => void;
  set: (patch: Partial<UIStore>) => void;
}

export const useUI = create<UIStore>((set, get) => ({
  selected: new Set(),
  search: '',
  filters: EMPTY_FILTERS,
  inspectId: null,
  dialog: null,
  duelTierId: null,
  palette: false,
  insights: false,
  poolTab: 'pool',
  sheet: 'peek',
  itemMenu: null,
  tierMenu: null,

  select: (ids, mode = 'toggle') => {
    const next = mode === 'replace' ? new Set<string>() : new Set(get().selected);
    for (const id of ids) {
      if (mode === 'toggle' && next.has(id)) next.delete(id);
      else next.add(id);
    }
    set({ selected: next });
  },
  clearSelection: () => {
    if (get().selected.size) set({ selected: new Set() });
  },
  setSearch: (search) => set({ search }),
  setFilters: (f) => set({ filters: { ...get().filters, ...f } }),
  inspect: (inspectId) => set({ inspectId }),
  openDialog: (dialog) => set({ dialog }),
  set: (patch) => set(patch),
}));

/** Item under the pointer — kept outside React state so hovering never re-renders. */
export const hover = { id: null as string | null };

/** Search results over ranked items: null = no search; otherwise ids that match. */
export const useHits = create<{ hits: Set<string> | null }>(() => ({ hits: null }));

export const drag = { endedAt: 0, active: false };

/** Which container the dragged item is hovering (for highlight), and the active drag. */
export const useDragState = create<{ over: string | null; activeId: string | null; multi: string[] }>(() => ({ over: null, activeId: null, multi: [] }));
