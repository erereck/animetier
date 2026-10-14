import { memo, useMemo, type CSSProperties } from 'react';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, GripVertical, Lock, MoreHorizontal } from 'lucide-react';
import type { Tier } from '../types';
import { SortableCard } from './Card';
import { Cover } from './Cover';
import { useEditor } from '../store/editor';
import { useDragState, useUI } from '../store/ui';
import { inkOn } from '../lib/util';
import { longestWordEm, useFontVersion } from '../lib/themes';
import { useSettings } from '../store/settings';

export function nameSize(name: string): string {
  const longestWord = Math.max(...name.split(/\s+/).map((w) => w.length), 0);
  if (name.length <= 2) return 's1';
  if (name.length <= 5 && longestWord <= 5) return 's2';
  if (name.length <= 14 && longestWord <= 10) return 's3';
  return 's4';
}

interface Props {
  tier: Tier;
  readOnly?: boolean;
}

export const TierRow = memo(function TierRow({ tier, readOnly }: Props) {
  const isOver = useDragState((s) => s.over === tier.id);
  const fontV = useFontVersion((s) => s.v);
  const theme = useSettings((s) => s.theme);
  const fitEm = useMemo(() => longestWordEm(tier.name), [tier.name, fontV, theme]); // eslint-disable-line react-hooks/exhaustive-deps
  const sortable = useSortable({ id: 'row:' + tier.id, data: { type: 'tier' }, disabled: readOnly });
  const drop = useDroppable({ id: tier.id, data: { type: 'container' }, disabled: readOnly || tier.locked });
  const ink = inkOn(tier.color);
  const openMenu = (el: HTMLElement) => !readOnly && useUI.getState().set({ tierMenu: { id: tier.id, el } });

  const style = {
    '--tc': tier.color,
    '--ink': ink,
    transform: CSS.Translate.toString(sortable.transform),
    transition: sortable.transition,
  } as CSSProperties;

  const cls = ['tier', isOver && 'is-over', sortable.isDragging && 'is-row-dragging', tier.locked && 'locked', tier.collapsed && 'collapsed'].filter(Boolean).join(' ');

  return (
    <section ref={sortable.setNodeRef} className={cls} style={style} data-tier={tier.id} aria-label={`Tier ${tier.name}`}>
      <div
        className="tier-label"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('.grip')) return;
          openMenu(e.currentTarget);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          openMenu(e.currentTarget);
        }}
        role="button"
        tabIndex={readOnly ? -1 : 0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openMenu(e.currentTarget)}
        title={readOnly ? tier.name : 'Editar tier'}
      >
        {!readOnly && (
          <>
            <span className="grip" {...sortable.attributes} {...sortable.listeners} aria-label="Arrastar tier" role="button" tabIndex={0}>
              <GripVertical />
            </span>
            <span className="more" aria-hidden>
              <MoreHorizontal />
            </span>
          </>
        )}
        {tier.icon && <span className="tier-icon">{tier.icon}</span>}
        <span className={`tier-name ${tier.collapsed ? '' : nameSize(tier.name)}`} style={{ '--fit-em': fitEm } as CSSProperties}>
          {tier.name}
        </span>
        {!tier.collapsed && <span className="tier-count">{tier.items.length}</span>}
        {tier.locked && (
          <span className="tier-flag" title="Trancada">
            <Lock />
          </span>
        )}
      </div>
      <div ref={drop.setNodeRef} className="tier-items" data-container={tier.id}>
        {tier.collapsed ? (
          <CollapsedStrip tier={tier} />
        ) : (
          <SortableContext items={tier.items} strategy={rectSortingStrategy}>
            {tier.items.map((id, i) => (
              <SortableCard key={id} id={id} container={tier.id} rank={i + 1} readOnly={readOnly} />
            ))}
          </SortableContext>
        )}
        {!tier.collapsed && !tier.items.length && <div className="tier-empty">{tier.locked ? 'Trancada' : 'Solte aqui'}</div>}
      </div>
    </section>
  );
});

function CollapsedStrip({ tier }: { tier: Tier }) {
  const items = useEditor((s) => s.list?.items);
  return (
    <button
      className="collapsed-strip"
      onClick={() => useEditor.getState().mutate(`Expandiu "${tier.name}"`, (d) => (d.tiers.find((t) => t.id === tier.id)!.collapsed = false))}
    >
      <span className="faces">
        {tier.items.slice(0, 8).map((id) => (
          <span key={id} style={{ background: items?.[id]?.color }}>
            <Cover src={items?.[id]?.img ?? ''} alt="" />
          </span>
        ))}
      </span>
      <span>
        {tier.items.length} {tier.items.length === 1 ? 'item' : 'itens'} · recolhida
      </span>
      <ChevronDown size={16} />
    </button>
  );
}
