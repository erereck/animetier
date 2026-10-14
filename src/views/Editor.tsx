import { lazy, Suspense, useEffect } from 'react';
import { useEditor } from '../store/editor';
import { useSettings } from '../store/settings';
import { hover, useHits, useUI } from '../store/ui';
import { DnD } from '../features/DnD';
import { Board } from '../components/Board';
import { Pool } from '../components/Pool';
import { TopBar } from '../components/TopBar';
import { BulkBar, ItemMenu, TierMenu } from '../components/Menus';
import { Inspector } from '../features/Inspector';
import { hasOpenLayer } from '../components/Overlay';
import * as A from '../lib/actions';
import { matches, poolView } from '../lib/poolView';
import { isTypingTarget, normTitle } from '../lib/util';
import { POOL } from '../types';

const Dialogs = lazy(() => import('../features/Dialogs'));
const Insights = lazy(() => import('../features/Insights'));
const SpeedRank = lazy(() => import('../features/SpeedRank'));
const Duel = lazy(() => import('../features/Duel'));
const Palette = lazy(() => import('../features/Palette'));

export function Editor({ readOnly = false, header }: { readOnly?: boolean; header?: React.ReactNode }) {
  const s = useSettings();
  const hasSel = useUI((u) => u.selected.size > 0);
  const dialog = useUI((u) => u.dialog);
  const duel = useUI((u) => u.duelTierId);
  const palette = useUI((u) => u.palette);
  const insights = useUI((u) => u.insights);
  useSearchHits();
  useShortcuts(readOnly);
  usePasteImages(readOnly);

  useEffect(() => {
    document.documentElement.style.setProperty('--item-w-user', `${s.itemSize}px`);
  }, [s.itemSize]);
  return (
    <div
      className={`editor ${hasSel ? 'has-selection' : ''}`}
      data-titles={s.titles}
      data-scores={s.showScores}
      data-ranks={s.showRanks}
      data-season={s.showSeason}
    >
      {s.ambient && <div className="ambient" />}
      {header ?? <TopBar readOnly={readOnly} />}
      <DnD>
        <div className="workspace">
          <Board readOnly={readOnly} />
          {!readOnly && <Pool />}
        </div>
      </DnD>
      <Inspector />
      {!readOnly && (
        <>
          <BulkBar />
          <ItemMenu />
          <TierMenu />
          <Suspense fallback={null}>
            {dialog && dialog !== 'speed' && <Dialogs />}
            {dialog === 'speed' && <SpeedRank />}
            {duel && <Duel />}
            {palette && <Palette />}
          </Suspense>
        </>
      )}
      <Suspense fallback={null}>{insights && <Insights />}</Suspense>
    </div>
  );
}

/** Mirrors the search box onto ranked items (dim non-matches) without re-rendering the board. */
function useSearchHits() {
  const search = useUI((s) => s.search);
  const list = useEditor((s) => s.list);
  useEffect(() => {
    const q = normTitle(search);
    if (!q || !list) {
      if (useHits.getState().hits) useHits.setState({ hits: null });
      return;
    }
    const t = setTimeout(() => {
      const hits = new Set<string>();
      for (const tier of list.tiers) for (const id of tier.items) if (matches(list.items[id], q)) hits.add(id);
      useHits.setState({ hits });
    }, 120);
    return () => clearTimeout(t);
  }, [search, list]);
  useEffect(() => () => useHits.setState({ hits: null }), []);
}

function useShortcuts(readOnly: boolean) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!readOnly) ui.set({ palette: !ui.palette });
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (hasOpenLayer() || ui.inspectId || ui.palette || ui.duelTierId || ui.dialog || ui.insights) return;

      if (e.key === 'Escape') {
        if (ui.selected.size) ui.clearSelection();
        else if (ui.search) ui.setSearch('');
        return;
      }
      if (readOnly) return;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        A.undo();
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        A.redo();
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const s = useSettings.getState();
        ui.select(poolView(useEditor.getState().list!, ui.search, ui.filters, s.poolSort, s.titleLang), 'add');
      } else if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        focusSearch();
      } else if (mod) {
        return;
      } else if (e.key === '/') {
        e.preventDefault();
        focusSearch();
      } else if (e.key === '?') {
        ui.openDialog('help');
      } else if (e.key.toLowerCase() === 'r') {
        if (useEditor.getState().list?.pool.length) ui.openDialog('speed');
      } else if (e.key.toLowerCase() === 'i') {
        ui.set({ insights: true });
      } else if (e.key.toLowerCase() === 'p') {
        const s = useSettings.getState();
        if (window.innerWidth <= 900) ui.set({ sheet: ui.sheet === 'peek' ? 'half' : 'peek' });
        else s.set({ poolOpen: !s.poolOpen });
      } else {
        // Keys that act on the hovered item, or on the selection.
        const target = ui.selected.size ? [...ui.selected] : hover.id ? [hover.id] : [];
        if (!target.length) return;
        if (/^[0-9]$/.test(e.key)) {
          const n = Number(e.key);
          const dest = n === 0 ? POOL : useEditor.getState().list!.tiers[n - 1]?.id;
          if (!dest) return;
          e.preventDefault();
          A.moveTo(target, dest);
          if (ui.selected.size) ui.clearSelection();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          A.deleteItems(target);
        } else if (e.key === 'Enter' && target.length === 1) {
          e.preventDefault();
          ui.inspect(target[0]);
        } else if (e.key.toLowerCase() === 's' && target.length) {
          A.toggleSpoiler(target);
        } else if (e.key.toLowerCase() === 'x' && hover.id) {
          ui.select([hover.id], 'toggle');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [readOnly]);
}

function focusSearch() {
  const ui = useUI.getState();
  const s = useSettings.getState();
  if (!s.poolOpen) s.set({ poolOpen: true });
  if (window.innerWidth <= 900 && ui.sheet === 'peek') ui.set({ sheet: 'half' });
  ui.set({ poolTab: 'pool' });
  requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#pool-search')?.focus());
}

function usePasteImages(readOnly: boolean) {
  useEffect(() => {
    if (readOnly) return;
    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        A.addFiles(files);
        return;
      }
      const text = e.clipboardData?.getData('text') ?? '';
      if (/^https?:\/\/\S+\.(png|jpe?g|webp|gif|avif)(\?\S*)?$/im.test(text.trim())) {
        e.preventDefault();
        A.addUrls(text);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [readOnly]);
}

