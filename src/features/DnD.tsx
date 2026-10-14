import { useCallback, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Active,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type Over,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Item, TierList } from '../types';
import { POOL } from '../types';
import { useEditor } from '../store/editor';
import { drag, useDragState, useUI } from '../store/ui';
import { useSettings } from '../store/settings';
import { CardView } from '../components/Card';
import { findContainer, moveItems } from '../lib/ops';
import { addToList, flashItems } from '../lib/actions';
import { displayTitle, inkOn } from '../lib/util';
import { toast } from '../components/Toasts';

type ActiveInfo = { id: string; type: 'item' | 'tier' | 'new'; item?: Item; multi: string[] };

const getList = () => useEditor.getState().list as TierList;

/** Resolves a droppable id (container or item) to its container. */
function containerFor(list: TierList, id: string): string | null {
  if (id === POOL) return POOL;
  if (list.tiers.some((t) => t.id === id)) return id;
  return findContainer(list, id);
}

/** Insertion index when hovering an item inside a tier (before/after by horizontal center). */
function indexFor(list: TierList, container: string, overId: string, active: Active, over: Over): number | undefined {
  if (container === POOL || overId === container) return undefined;
  const items = list.tiers.find((t) => t.id === container)?.items ?? [];
  const i = items.indexOf(overId);
  if (i < 0) return undefined;
  const r = active.rect.current.translated;
  const after = !!r && r.left + r.width / 2 > over.rect.left + over.rect.width / 2;
  return i + (after ? 1 : 0);
}

const dropAnimation: DropAnimation = {
  duration: 240,
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.3' } } }),
};

export function DnD({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveInfo | null>(null);
  const lastOver = useRef<string | null>(null);
  const movedRecently = useRef(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const collision: CollisionDetection = useCallback((args) => {
    const type = args.active.data.current?.type;
    if (type === 'tier') {
      return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => String(c.id).startsWith('row:')) });
    }
    const list = getList();
    const containers = args.droppableContainers.filter((c) => c.data.current?.type === 'container');
    let hits = pointerWithin({ ...args, droppableContainers: containers });
    if (!hits.length) hits = rectIntersection({ ...args, droppableContainers: containers });
    let overId = getFirstCollision(hits, 'id') as string | null;
    if (overId != null) {
      const tier = overId !== POOL ? list.tiers.find((t) => t.id === overId) : undefined;
      if (tier && tier.items.length && !tier.collapsed) overId = pickInTier(tier.id, tier.items, args) ?? overId;
      lastOver.current = overId;
      return [{ id: overId }];
    }
    if (movedRecently.current) lastOver.current = String(args.active.id);
    return lastOver.current ? [{ id: lastOver.current }] : [];
  }, []);

  const onDragStart = ({ active: a }: DragStartEvent) => {
    const type = a.data.current?.type as ActiveInfo['type'];
    const id = String(a.id);
    const sel = useUI.getState().selected;
    const multi = type === 'item' && sel.has(id) && sel.size > 1 ? orderedSelection(sel) : [];
    setActive({ id, type, item: a.data.current?.item, multi });
    useDragState.setState({ activeId: id, multi, over: null });
    drag.active = true;
    if (type !== 'new') useEditor.getState().beginGesture();
    useUI.getState().set({ itemMenu: null, tierMenu: null });
  };

  const onDragOver = ({ active: a, over }: DragOverEvent) => {
    const type = a.data.current?.type;
    if (type === 'tier') return;
    if (!over) {
      useDragState.setState({ over: null });
      return;
    }
    const list = getList();
    const overId = String(over.id);
    const to = containerFor(list, overId);
    useDragState.setState({ over: to });
    if (type !== 'item' || useDragState.getState().multi.length) return;
    const id = String(a.id);
    const from = findContainer(list, id);
    if (!from || !to) return;
    if (from === to) {
      // Hovering the empty tail of the same tier: preview the item at the end.
      if (to !== POOL && overId === to) {
        const items = list.tiers.find((t) => t.id === to)!.items;
        if (items[items.length - 1] !== id) useEditor.getState().transient((d) => void moveItems(d, [id], to));
      }
      return;
    }
    if (list.tiers.find((t) => t.id === to)?.locked) return;
    const index = indexFor(list, to, overId, a, over);
    movedRecently.current = true;
    requestAnimationFrame(() => (movedRecently.current = false));
    useEditor.getState().transient((d) => {
      moveItems(d, [id], to, to === POOL ? 0 : index);
    });
  };

  const finish = () => {
    setActive(null);
    useDragState.setState({ over: null, activeId: null, multi: [] });
    drag.active = false;
    drag.endedAt = Date.now();
    lastOver.current = null;
  };

  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    const type = a.data.current?.type as ActiveInfo['type'];
    const id = String(a.id);
    const multi = useDragState.getState().multi;
    finish();
    const store = useEditor.getState();
    const list = getList();
    const lang = useSettings.getState().titleLang;

    if (type === 'tier') {
      if (over && over.id !== a.id) {
        const from = list.tiers.findIndex((t) => 'row:' + t.id === id);
        const to = list.tiers.findIndex((t) => 'row:' + t.id === over.id);
        if (from >= 0 && to >= 0) store.transient((d) => void (d.tiers = arrayMove(d.tiers, from, to)));
      }
      store.endGesture('Reordenou as tiers');
      return;
    }

    if (type === 'new') {
      if (!over) return;
      const overId = String(over.id);
      const to = containerFor(list, overId);
      const item = a.data.current?.item as Item | undefined;
      if (!to || !item) return;
      if (list.tiers.find((t) => t.id === to)?.locked) return;
      const added = addToList([item], to, indexFor(list, to, overId, a, over));
      if (!added) toast.warn('Esse já está na lista');
      return;
    }

    if (!over) {
      store.cancelGesture();
      return;
    }
    const overId = String(over.id);
    const to = containerFor(list, overId);
    const tierOf = (c: string | null) => (c === POOL ? 'Pool' : list.tiers.find((t) => t.id === c)?.name ?? '?');

    if (multi.length > 1) {
      if (!to || list.tiers.find((t) => t.id === to)?.locked || multi.includes(overId)) {
        store.cancelGesture();
        return;
      }
      const index = indexFor(list, to, overId, a, over);
      store.transient((d) => void moveItems(d, multi, to, index));
      store.endGesture(`${multi.length} itens → ${tierOf(to)}`);
      useUI.getState().clearSelection();
      flashItems(multi);
      return;
    }

    const from = findContainer(list, id);
    if (from && from === to && to !== POOL) {
      const items = list.tiers.find((t) => t.id === to)!.items;
      const oldIndex = items.indexOf(id);
      const newIndex = items.indexOf(overId);
      if (newIndex >= 0 && oldIndex !== newIndex) {
        store.transient((d) => {
          const t = d.tiers.find((x) => x.id === to)!;
          t.items = arrayMove(t.items, oldIndex, newIndex);
        });
      }
    }
    const base = store.gestureBase;
    const startC = base ? findContainer(base, id) : null;
    const finalC = findContainer(getList(), id);
    const title = list.items[id] ? displayTitle(list.items[id], lang) : 'item';
    store.endGesture(startC !== finalC ? `"${title}" → ${tierOf(finalC)}` : `Reordenou "${tierOf(finalC)}"`);
    flashItems([id]);
  };

  const onDragCancel = () => {
    finish();
    useEditor.getState().cancelGesture();
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      autoScroll={{ threshold: { x: 0.05, y: 0.14 }, acceleration: 14 }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
      accessibility={{
        screenReaderInstructions: { draggable: 'Pressione espaço para pegar, setas para mover e espaço de novo para soltar.' },
      }}
    >
      {children}
      {createPortal(
        <DragOverlay dropAnimation={active?.multi.length || active?.type === 'new' ? null : dropAnimation} className="drag-overlay" zIndex={1200}>
          {active ? <OverlayContent info={active} /> : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

/**
 * Inside a tier: a direct hit on a cover wins; past the last cover means "append";
 * otherwise fall back to the closest cover.
 */
function pickInTier(tierId: string, items: string[], args: Parameters<CollisionDetection>[0]): string | null {
  const p = args.pointerCoordinates;
  const rects = items.map((id) => [id, args.droppableRects.get(id)] as const).filter((x): x is readonly [string, NonNullable<typeof x[1]>] => !!x[1]);
  if (!rects.length) return null;
  if (p) {
    const hit = rects.find(([, r]) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom);
    if (hit) return hit[0];
    const last = rects[rects.length - 1][1];
    if (p.y > last.bottom || (p.y >= last.top && p.x > last.right)) return tierId;
  }
  const ids = new Set(items);
  const inner = closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => ids.has(String(c.id))) });
  return inner.length ? String(inner[0].id) : null;
}

function orderedSelection(sel: Set<string>): string[] {
  const list = getList();
  const order = [...list.tiers.flatMap((t) => t.items), ...list.pool];
  return order.filter((id) => sel.has(id));
}

function OverlayContent({ info }: { info: ActiveInfo }) {
  const list = useEditor((s) => s.list);
  if (!list) return null;
  if (info.type === 'tier') {
    const t = list.tiers.find((x) => 'row:' + x.id === info.id);
    if (!t) return null;
    return (
      <div className="tier-ghost" style={{ background: t.color, color: inkOn(t.color) }}>
        <b>{t.name}</b>
        <span>{t.items.length} itens</span>
      </div>
    );
  }
  if (info.type === 'new' && info.item) return <CardView item={info.item} overlay />;
  const ids = info.multi.length ? info.multi : [info.id];
  const items = ids.map((id) => list.items[id]).filter(Boolean);
  if (!items.length) return null;
  if (items.length === 1) return <CardView item={items[0]} overlay />;
  return (
    <div className="stack">
      {items.slice(0, 3).map((it) => (
        <CardView key={it.id} item={it} overlay />
      ))}
      <span className="badge">{items.length}</span>
    </div>
  );
}
