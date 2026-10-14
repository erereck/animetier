import { useEffect, useRef } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, Sparkles, Zap } from 'lucide-react';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { TierRow } from './TierRow';
import { addTier } from '../lib/actions';
import { plural } from '../lib/util';

export function Board({ readOnly }: { readOnly?: boolean }) {
  const tiers = useEditor((s) => s.list!.tiers);
  return (
    <main className="board" data-scroll="board">
      <div className="board-inner">
        <ListHead readOnly={readOnly} />
        <SortableContext items={tiers.map((t) => 'row:' + t.id)} strategy={verticalListSortingStrategy}>
          <div className="tiers">
            {tiers.map((t) => (
              <TierRow key={t.id} tier={t} readOnly={readOnly} />
            ))}
          </div>
        </SortableContext>
        {!readOnly && (
          <button className="add-tier" onClick={() => addTier()}>
            <Plus /> Adicionar tier
          </button>
        )}
      </div>
    </main>
  );
}

function ListHead({ readOnly }: { readOnly?: boolean }) {
  const title = useEditor((s) => s.list!.title);
  const ranked = useEditor((s) => s.list!.tiers.reduce((n, t) => n + t.items.length, 0));
  const pool = useEditor((s) => s.list!.pool.length);
  const total = ranked + pool;
  const pct = total ? Math.round((ranked / total) * 100) : 0;
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) ref.current.textContent = title;
  }, [title]);

  const commit = () => {
    const v = (ref.current?.textContent || '').trim() || 'Sem título';
    if (ref.current) ref.current.textContent = v;
    if (v !== useEditor.getState().list?.title) useEditor.getState().mutate('Renomeou a lista', (d) => void (d.title = v));
  };

  return (
    <header className="list-head">
      <div style={{ minWidth: 0 }}>
        <h1
          ref={ref}
          className="list-title"
          contentEditable={!readOnly}
          suppressContentEditableWarning
          spellCheck={false}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLElement).blur();
            }
          }}
        >
          {title}
        </h1>
        <div className="list-meta">
          <span>{plural(total, 'item', 'itens')}</span>
          {total > 0 && (
            <span className="progress" title={`${ranked} ranqueados`}>
              <span className="progress-bar">
                <i style={{ width: `${pct}%` }} />
              </span>
              {pct}% ranqueado
            </span>
          )}
        </div>
      </div>
      {!readOnly && (
        <div className="right">
          {pool > 0 && (
            <button className="btn" onClick={() => useUI.getState().openDialog('speed')}>
              <Zap /> Rank rápido
            </button>
          )}
          <button className="btn" onClick={() => useUI.getState().set({ insights: true })}>
            <Sparkles /> Insights
          </button>
        </div>
      )}
    </header>
  );
}
