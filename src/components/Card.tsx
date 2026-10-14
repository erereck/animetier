import { memo, useMemo, useRef, type CSSProperties, type HTMLAttributes, type Ref } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Check } from 'lucide-react';
import type { Item } from '../types';
import { Cover, useCardCoverSize } from './Cover';
import { useEditor } from '../store/editor';
import { useSettings } from '../store/settings';
import { drag, hover, useHits, useUI } from '../store/ui';
import { displayTitle, scoreColor, SEASON_COLOR, SEASON_LABEL } from '../lib/util';

interface ViewProps extends HTMLAttributes<HTMLDivElement> {
  item: Item;
  rank?: number;
  selected?: boolean;
  mark?: '' | 'dim' | 'match';
  overlay?: boolean;
  ghost?: boolean;
  ref?: Ref<HTMLDivElement>;
}

/** Pure visual card. All toggles (titles, scores, ranks…) are driven by CSS data-attributes. */
export const CardView = memo(function CardView({ item, rank, selected, mark, overlay, ghost, className, style, ref, ...rest }: ViewProps) {
  const lang = useSettings((s) => s.titleLang);
  const hideAdult = useSettings((s) => s.hideAdult);
  const coverSize = useCardCoverSize();
  const title = displayTitle(item, lang);
  const cls = [
    'card',
    selected && 'selected',
    mark,
    overlay && 'overlay',
    ghost && 'ghost',
    item.spoiler && 'spoiler',
    hideAdult && item.isAdult && 'adult-hidden',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const css = { ...style, '--cc': item.color } as CSSProperties;
  if (item.score != null) (css as Record<string, string>)['--sc'] = scoreColor(item.score);
  if (item.season) (css as Record<string, string>)['--ssc'] = SEASON_COLOR[item.season];
  return (
    <div ref={ref} className={cls} style={css} data-item={item.id} aria-label={title} {...rest}>
      <div className="clip">
        <Cover src={item.img} alt={title} size={coverSize} />
        <div className="cap">
          <span>{title}</span>
        </div>
      </div>
      {rank != null && <span className="rank">{rank}</span>}
      {item.score != null && <span className="score">{item.score}</span>}
      {item.season && (item.seasonYear || item.year) && (
        <span className="season" title={SEASON_LABEL[item.season]}>
          {SEASON_LABEL[item.season].slice(0, 3)} {String(item.seasonYear ?? item.year).slice(2)}
        </span>
      )}
      {item.note && <span className="note-dot" title="Tem anotação" />}
      {!overlay && (
        <span
          className="check"
          role="checkbox"
          aria-checked={!!selected}
          aria-label="Selecionar"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            useUI.getState().select([item.id], 'toggle');
          }}
        >
          <Check />
        </span>
      )}
    </div>
  );
});

// ── Shared interaction handlers ────────────────────────
let lastClicked: string | null = null;

export function onCardClick(e: React.MouseEvent, id: string) {
  if (Date.now() - drag.endedAt < 220) return;
  const ui = useUI.getState();
  if (e.shiftKey && lastClicked && lastClicked !== id) {
    // Range-select in display order, within the same container.
    const a = document.querySelector<HTMLElement>(`[data-item="${window.CSS.escape(lastClicked)}"]`);
    const b = e.currentTarget as HTMLElement;
    const box = b.closest('[data-container]');
    if (a && box && box.contains(a)) {
      const all = [...box.querySelectorAll<HTMLElement>('[data-item]')].map((n) => n.dataset.item!);
      const [i, j] = [all.indexOf(lastClicked), all.indexOf(id)].sort((x, y) => x - y);
      ui.select(all.slice(i, j + 1), 'add');
      lastClicked = id;
      return;
    }
  }
  if (e.shiftKey || e.ctrlKey || e.metaKey || ui.selected.size) ui.select([id], 'toggle');
  else ui.inspect(id);
  lastClicked = id;
}

export function onCardContext(e: React.MouseEvent, id: string) {
  e.preventDefault();
  useUI.getState().set({ itemMenu: { id, x: e.clientX, y: e.clientY } });
}

const ambientEl = () => document.querySelector<HTMLElement>('.ambient');
export function onCardEnter(e: React.PointerEvent, item: Item) {
  hover.id = item.id;
  if (e.pointerType !== 'mouse') return;
  const amb = ambientEl();
  if (amb && item.color) {
    amb.style.setProperty('--amb', item.color + '55');
    amb.style.setProperty('--ax', `${Math.round((e.clientX / innerWidth) * 100)}%`);
    amb.style.setProperty('--ay', `${Math.round((e.clientY / innerHeight) * 100)}%`);
  }
}
export function onCardLeave(id: string) {
  if (hover.id === id) hover.id = null;
}

function useCardState(id: string) {
  const item = useEditor((s) => s.list?.items[id]);
  const selected = useUI((s) => s.selected.has(id));
  return { item, selected };
}

/** Stable handlers so CardView's memo holds while dnd-kit re-renders every draggable. */
function useCardHandlers(id: string, item: Item | undefined) {
  const itemRef = useRef(item);
  itemRef.current = item;
  return useMemo(
    () => ({
      onClick: (e: React.MouseEvent) => onCardClick(e, id),
      onContextMenu: (e: React.MouseEvent) => onCardContext(e, id),
      onPointerEnter: (e: React.PointerEvent) => itemRef.current && onCardEnter(e, itemRef.current),
      onPointerLeave: () => onCardLeave(id),
    }),
    [id],
  );
}

// ── Sortable card (inside tiers) ───────────────────────
export const SortableCard = memo(function SortableCard({ id, container, rank, readOnly }: { id: string; container: string; rank: number; readOnly?: boolean }) {
  const { item, selected } = useCardState(id);
  const mark = useHits((s) => (s.hits ? (s.hits.has(id) ? 'match' : 'dim') : ''));
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
    data: { type: 'item', container },
    disabled: readOnly,
  });
  const handlers = useCardHandlers(id, item);
  const tf = CSS.Translate.toString(transform);
  const style = useMemo(() => ({ transform: tf, transition }), [tf, transition]);
  if (!item) return null;
  return <CardView ref={setNodeRef} item={item} rank={rank} selected={selected} mark={mark} ghost={isDragging} style={style} {...attributes} {...listeners} tabIndex={0} {...handlers} />;
});

// ── Draggable card (pool grid) ─────────────────────────
const POOL_DATA = { type: 'item', container: 'pool' };
export const PoolCard = memo(function PoolCard({ id }: { id: string }) {
  const { item, selected } = useCardState(id);
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id, data: POOL_DATA });
  const handlers = useCardHandlers(id, item);
  if (!item) return null;
  return <CardView ref={setNodeRef} item={item} selected={selected} ghost={isDragging} {...attributes} {...listeners} tabIndex={0} {...handlers} />;
});
