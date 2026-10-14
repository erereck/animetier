import { create } from 'zustand';
import { produce } from 'immer';
import type { TierList } from '../types';
import { db } from '../lib/db';
import { debounce } from '../lib/util';

export interface HistEntry {
  list: TierList;
  label: string;
  at: number;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface EditorStore {
  list: TierList | null;
  /** Read-only lists (share links) are never persisted. */
  readOnly: boolean;
  past: HistEntry[];
  future: HistEntry[];
  gestureBase: TierList | null;
  saveState: SaveState;

  open: (list: TierList, readOnly?: boolean) => void;
  close: () => void;
  /** Recorded mutation. `coalesce` merges with the previous entry if it has the same key and is recent. */
  mutate: (label: string, recipe: (d: TierList) => void, coalesce?: string) => void;
  /** Mutation that skips history (used mid-drag). */
  transient: (recipe: (d: TierList) => void) => void;
  beginGesture: () => void;
  endGesture: (label: string) => void;
  cancelGesture: () => void;
  undo: () => string | null;
  redo: () => string | null;
  jumpTo: (pastIndex: number) => void;
}

const LIMIT = 200;
let lastCoalesce: { key: string; at: number } | null = null;

const persist = debounce((list: TierList) => {
  useEditor.setState({ saveState: 'saving' });
  db.putList(list)
    .then(() => useEditor.setState({ saveState: 'saved' }))
    .catch(() => useEditor.setState({ saveState: 'error' }));
}, 500);

export function flushSave() {
  const { list, readOnly } = useEditor.getState();
  if (list && !readOnly) persist.flush(list);
}

export const useEditor = create<EditorStore>((set, get) => {
  const commit = (next: TierList, prev: TierList, label: string, coalesce?: string) => {
    const now = Date.now();
    const stamped = produce(next, (d) => {
      d.updatedAt = now;
    });
    let past = get().past;
    const merge = coalesce && lastCoalesce && lastCoalesce.key === coalesce && now - lastCoalesce.at < 4000 && past.length;
    if (!merge) past = [...past, { list: prev, label, at: now }].slice(-LIMIT);
    lastCoalesce = coalesce ? { key: coalesce, at: now } : null;
    set({ list: stamped, past, future: [] });
    if (!get().readOnly) persist(stamped);
  };

  return {
    list: null,
    readOnly: false,
    past: [],
    future: [],
    gestureBase: null,
    saveState: 'idle',

    open: (list, readOnly = false) => set({ list, readOnly, past: [], future: [], gestureBase: null, saveState: readOnly ? 'idle' : 'saved' }),
    close: () => {
      flushSave();
      set({ list: null, past: [], future: [], gestureBase: null });
    },

    mutate: (label, recipe, coalesce) => {
      const prev = get().list;
      if (!prev) return;
      const next = produce(prev, recipe);
      if (next === prev) return;
      commit(next, prev, label, coalesce);
    },

    transient: (recipe) => {
      const prev = get().list;
      if (!prev) return;
      const next = produce(prev, recipe);
      if (next !== prev) set({ list: next });
    },

    beginGesture: () => set({ gestureBase: get().list }),
    endGesture: (label) => {
      const base = get().gestureBase;
      const cur = get().list;
      set({ gestureBase: null });
      if (!base || !cur || base === cur) return;
      commit(cur, base, label);
    },
    cancelGesture: () => {
      const base = get().gestureBase;
      if (base) set({ list: base, gestureBase: null });
    },

    undo: () => {
      const { past, future, list } = get();
      const last = past[past.length - 1];
      if (!last || !list) return null;
      set({ list: last.list, past: past.slice(0, -1), future: [{ list, label: last.label, at: last.at }, ...future] });
      lastCoalesce = null;
      if (!get().readOnly) persist(last.list);
      return last.label;
    },
    redo: () => {
      const { past, future, list } = get();
      const next = future[0];
      if (!next || !list) return null;
      set({ list: next.list, future: future.slice(1), past: [...past, { list, label: next.label, at: next.at }] });
      lastCoalesce = null;
      if (!get().readOnly) persist(next.list);
      return next.label;
    },
    jumpTo: (idx) => {
      // Restore the state *before* past[idx] happened.
      const { past, future, list } = get();
      if (!list || idx < 0 || idx >= past.length) return;
      const target = past[idx];
      const undone: HistEntry[] = [];
      // past[i].list is the state before action i; the state after action i is past[i+1].list (or current).
      for (let i = past.length - 1; i >= idx; i--) {
        const after = i === past.length - 1 ? list : past[i + 1].list;
        undone.unshift({ list: after, label: past[i].label, at: past[i].at });
      }
      set({ list: target.list, past: past.slice(0, idx), future: [...undone, ...future] });
      if (!get().readOnly) persist(target.list);
    },
  };
});

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
}
