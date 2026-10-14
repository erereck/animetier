import { memo, useDeferredValue, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Check, Filter, Inbox, LayoutGrid, List, MoreHorizontal, Search, Shuffle, Sparkles, Trash2, Wand2, X, Zap, Scissors, CheckSquare, PanelRightClose } from 'lucide-react';
import { useEditor } from '../store/editor';
import { useSettings, type PoolSort } from '../store/settings';
import { EMPTY_FILTERS, useDragState, useUI } from '../store/ui';
import { PoolCard, onCardClick, onCardContext, onCardEnter, onCardLeave } from './Card';
import { Cover } from './Cover';
import { Popover, usePopover, confirmDialog } from './Overlay';
import { activeFilterCount, poolView, SORT_LABEL } from '../lib/poolView';
import { displayTitle, FORMAT_LABEL, plural, scoreColor, STATUS_LABEL, STATUS_COLOR, shuffle } from '../lib/util';
import { AddPanel } from '../features/AddPanel';
import { toast } from './Toasts';

export function Pool() {
  const tab = useUI((s) => s.poolTab);
  const sheet = useUI((s) => s.sheet);
  const open = useSettings((s) => s.poolOpen);
  const width = useSettings((s) => s.poolWidth);
  const count = useEditor((s) => s.list!.pool.length);
  const drop = useDroppable({ id: 'pool', data: { type: 'container' } });
  const over = useDragState((s) => s.over === 'pool');
  const draggingFromTier = useDragState((s) => {
    if (!s.activeId) return false;
    const l = useEditor.getState().list;
    return !!l && !l.pool.includes(s.activeId);
  });
  const asideRef = useRef<HTMLElement>(null);
  const [rz, setRz] = useState(false);

  const startResize = (e: React.PointerEvent) => {
    setRz(true);
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => {
      const w = Math.max(300, Math.min(760, startW + (startX - ev.clientX)));
      asideRef.current?.style.setProperty('--pool-w', w + 'px');
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setRz(false);
      useSettings.getState().set({ poolWidth: Math.max(300, Math.min(760, startW + (startX - ev.clientX))) });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const cycleSheet = () => useUI.getState().set({ sheet: sheet === 'peek' ? 'half' : sheet === 'half' ? 'full' : 'peek' });

  return (
    <>
      <aside
        ref={asideRef}
        className={`pool ${open ? '' : 'closed'} ${over && draggingFromTier ? 'is-over' : ''}`}
        data-sheet={sheet}
        style={{ '--pool-w': `${width}px` } as CSSProperties}
        aria-label="Pool"
      >
        <div className={`pool-resize ${rz ? 'on' : ''}`} onPointerDown={startResize} />
        <div className="sheet-handle" onClick={cycleSheet} />
        <div className="pool-head">
          <div className="pool-tabs">
            <div className="seg full">
              <button className={tab === 'pool' ? 'on' : ''} onClick={() => useUI.getState().set({ poolTab: 'pool', sheet: sheet === 'peek' ? 'half' : sheet })}>
                <Inbox /> Pool <span className="faint">{count}</span>
              </button>
              <button className={tab === 'add' ? 'on' : ''} onClick={() => useUI.getState().set({ poolTab: 'add', sheet: sheet === 'peek' ? 'half' : sheet })}>
                <Sparkles /> Adicionar
              </button>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm hide-md" data-tip="Esconder painel" onClick={() => useSettings.getState().set({ poolOpen: false })}>
              <PanelRightClose />
            </button>
          </div>
          {tab === 'pool' && <PoolTools />}
        </div>
        {tab === 'pool' ? (
          <div className="pool-body" ref={drop.setNodeRef} data-scroll="pool">
            {over && draggingFromTier && <div className="pool-drop-hint">Soltar no pool</div>}
            <PoolItems />
          </div>
        ) : (
          <div className="pool-body add" ref={drop.setNodeRef}>
            <AddPanel />
          </div>
        )}
      </aside>
      {!open && (
        <button className="pool-collapsed-tab" onClick={() => useSettings.getState().set({ poolOpen: true })}>
          Pool <b>{count}</b>
        </button>
      )}
    </>
  );
}

function PoolTools() {
  const search = useUI((s) => s.search);
  const filters = useUI((s) => s.filters);
  const sort = useSettings((s) => s.poolSort);
  const view = useSettings((s) => s.poolView);
  const filterPop = usePopover<HTMLElement>();
  const sortPop = usePopover<HTMLElement>();
  const morePop = usePopover<HTMLElement>();
  const nf = activeFilterCount(filters);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="pool-tools">
        <div className="input-wrap">
          <Search />
          <input
            ref={inputRef}
            id="pool-search"
            className="input"
            placeholder="Buscar em tudo…"
            value={search}
            onChange={(e) => useUI.getState().setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (useUI.getState().setSearch(''), inputRef.current?.blur())}
            autoComplete="off"
            spellCheck={false}
          />
          {search && (
            <button className="btn btn-ghost btn-icon btn-sm input-end" onClick={() => useUI.getState().setSearch('')} aria-label="Limpar busca">
              <X />
            </button>
          )}
        </div>
        <button className={`btn btn-icon ${nf ? 'active' : ''}`} data-tip="Filtros" onClick={(e) => filterPop.toggle(e.currentTarget)}>
          <Filter />
        </button>
        <button className="btn btn-icon" data-tip={SORT_LABEL[sort]} onClick={(e) => sortPop.toggle(e.currentTarget)}>
          <SortIcon />
        </button>
        <button className="btn btn-icon btn-ghost" data-tip="Mais" onClick={(e) => morePop.toggle(e.currentTarget)}>
          <MoreHorizontal />
        </button>
      </div>
      {nf > 0 && (
        <div className="pool-filters">
          {filters.hideSequels && <FilterChip label="Sem continuações" onClear={() => useUI.getState().setFilters({ hideSequels: false })} />}
          {filters.genres.map((g) => (
            <FilterChip key={g} label={g} onClear={() => useUI.getState().setFilters({ genres: filters.genres.filter((x) => x !== g) })} />
          ))}
          {filters.formats.map((g) => (
            <FilterChip key={g} label={FORMAT_LABEL[g] ?? g} onClear={() => useUI.getState().setFilters({ formats: filters.formats.filter((x) => x !== g) })} />
          ))}
          {filters.statuses.map((g) => (
            <FilterChip key={g} label={STATUS_LABEL[g] ?? g} onClear={() => useUI.getState().setFilters({ statuses: filters.statuses.filter((x) => x !== g) })} />
          ))}
          {filters.decades.map((g) => (
            <FilterChip key={g} label={`${g}s`} onClear={() => useUI.getState().setFilters({ decades: filters.decades.filter((x) => x !== g) })} />
          ))}
          <button className="chip" onClick={() => useUI.getState().set({ filters: EMPTY_FILTERS })}>
            Limpar
          </button>
        </div>
      )}
      {filterPop.anchor && (
        <Popover anchor={filterPop.anchor} onClose={filterPop.close} placement="bottom-end" width={340}>
          <FilterPanel />
        </Popover>
      )}
      {sortPop.anchor && (
        <Popover anchor={sortPop.anchor} onClose={sortPop.close} placement="bottom-end">
          <div className="menu">
            <div className="menu-head">Ordenar pool por</div>
            {(['added', 'title', 'score', 'alScore', 'popularity', 'year', 'season', 'format'] as PoolSort[]).map((k) => (
              <button
                key={k}
                className={`menu-item ${sort === k ? 'on' : ''}`}
                onClick={() => {
                  useSettings.getState().set({ poolSort: k });
                  sortPop.close();
                }}
              >
                {SORT_LABEL[k]}
                {sort === k && <Check className="check end" style={{ marginLeft: 'auto' }} />}
              </button>
            ))}
            <div className="menu-sep" />
            <div className="menu-head">Visualização</div>
            <button className={`menu-item ${view === 'grid' ? 'on' : ''}`} onClick={() => useSettings.getState().set({ poolView: 'grid' })}>
              <LayoutGrid /> Grade de capas {view === 'grid' && <Check className="check" style={{ marginLeft: 'auto' }} />}
            </button>
            <button className={`menu-item ${view === 'list' ? 'on' : ''}`} onClick={() => useSettings.getState().set({ poolView: 'list' })}>
              <List /> Lista compacta {view === 'list' && <Check className="check" style={{ marginLeft: 'auto' }} />}
            </button>
          </div>
        </Popover>
      )}
      {morePop.anchor && (
        <Popover anchor={morePop.anchor} onClose={morePop.close} placement="bottom-end">
          <PoolMenu close={morePop.close} />
        </Popover>
      )}
    </>
  );
}

function SortIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h13M3 12h9M3 18h5M18 8v12m0 0-3-3m3 3 3-3" />
    </svg>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button className="chip on" onClick={onClear}>
      {label} <X />
    </button>
  );
}

function FilterPanel() {
  const list = useEditor((s) => s.list!);
  const f = useUI((s) => s.filters);
  const stats = useMemo(() => {
    const g = new Map<string, number>();
    const fm = new Map<string, number>();
    const st = new Map<string, number>();
    const dc = new Map<number, number>();
    for (const id of list.pool) {
      const i = list.items[id];
      i.genres?.forEach((x) => g.set(x, (g.get(x) ?? 0) + 1));
      if (i.format) fm.set(i.format, (fm.get(i.format) ?? 0) + 1);
      if (i.listStatus) st.set(i.listStatus, (st.get(i.listStatus) ?? 0) + 1);
      if (i.year) dc.set(Math.floor(i.year / 10) * 10, (dc.get(Math.floor(i.year / 10) * 10) ?? 0) + 1);
    }
    const sort = <K,>(m: Map<K, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    return { g: sort(g), fm: sort(fm), st: sort(st), dc: [...dc.entries()].sort((a, b) => b[0] - a[0]) };
  }, [list]);
  const toggle = <K extends 'genres' | 'formats' | 'statuses' | 'decades'>(k: K, v: PoolFiltersValue<K>) => {
    const cur = f[k] as unknown[];
    useUI.getState().setFilters({ [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] } as never);
  };
  const empty = !stats.g.length && !stats.fm.length;
  return (
    <div className="filter-panel">
      <label className="switch">
        Esconder continuações
        <input type="checkbox" checked={f.hideSequels} onChange={(e) => useUI.getState().setFilters({ hideSequels: e.target.checked })} />
        <span className="track" />
      </label>
      {empty && <p className="hint">Itens do AniList trazem gênero, formato e ano — dá pra filtrar por eles aqui.</p>}
      {stats.st.length > 0 && (
        <Section title="Status no AniList">
          {stats.st.map(([k, n]) => (
            <button key={k} className={`chip ${f.statuses.includes(k) ? 'on' : ''}`} onClick={() => toggle('statuses', k)}>
              <span className="dot" style={{ background: STATUS_COLOR[k] }} />
              {STATUS_LABEL[k] ?? k} <span className="count">{n}</span>
            </button>
          ))}
        </Section>
      )}
      {stats.fm.length > 0 && (
        <Section title="Formato">
          {stats.fm.map(([k, n]) => (
            <button key={k} className={`chip ${f.formats.includes(k) ? 'on' : ''}`} onClick={() => toggle('formats', k)}>
              {FORMAT_LABEL[k] ?? k} <span className="count">{n}</span>
            </button>
          ))}
        </Section>
      )}
      {stats.dc.length > 0 && (
        <Section title="Década">
          {stats.dc.map(([k, n]) => (
            <button key={k} className={`chip ${f.decades.includes(k) ? 'on' : ''}`} onClick={() => toggle('decades', k)}>
              {k}s <span className="count">{n}</span>
            </button>
          ))}
        </Section>
      )}
      {stats.g.length > 0 && (
        <Section title="Gênero">
          {stats.g.map(([k, n]) => (
            <button key={k} className={`chip ${f.genres.includes(k) ? 'on' : ''}`} onClick={() => toggle('genres', k)}>
              {k} <span className="count">{n}</span>
            </button>
          ))}
        </Section>
      )}
    </div>
  );
}
type PoolFiltersValue<K> = K extends 'decades' ? number : string;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="filter-sec">
      <div className="label">{title}</div>
      <div className="row wrap" style={{ gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function PoolMenu({ close }: { close: () => void }) {
  const ui = useUI.getState();
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  return (
    <div className="menu">
      <button className="menu-item" onClick={run(() => ui.openDialog('speed'))}>
        <Zap /> Rank rápido
        <span className="end">
          <span className="kbd">R</span>
        </span>
      </button>
      <button className="menu-item" onClick={run(() => ui.openDialog('organize'))}>
        <Wand2 /> Organizar automaticamente…
      </button>
      <button className="menu-item" onClick={run(() => ui.openDialog('sequels'))}>
        <Scissors /> Remover continuações…
      </button>
      <div className="menu-sep" />
      <button
        className="menu-item"
        onClick={run(() => {
          const l = useEditor.getState().list!;
          const ids = poolView(l, ui.search, ui.filters, useSettings.getState().poolSort, useSettings.getState().titleLang);
          ui.select(ids, 'add');
          toast(`${plural(ids.length, 'item selecionado', 'itens selecionados')}`);
        })}
      >
        <CheckSquare /> Selecionar visíveis
      </button>
      <button
        className="menu-item"
        onClick={run(() => {
          useSettings.getState().set({ poolSort: 'added' });
          useEditor.getState().mutate('Embaralhou o pool', (d) => void (d.pool = shuffle(d.pool)));
        })}
      >
        <Shuffle /> Embaralhar
      </button>
      <div className="menu-sep" />
      <button
        className="menu-item danger"
        onClick={run(async () => {
          const l = useEditor.getState().list!;
          if (!l.pool.length) return;
          const ok = await confirmDialog({ title: 'Esvaziar o pool?', body: `${plural(l.pool.length, 'item será excluído', 'itens serão excluídos')} da lista. Você pode desfazer com Ctrl+Z.`, confirm: 'Esvaziar', danger: true });
          if (!ok) return;
          const n = l.pool.length;
          useEditor.getState().mutate('Esvaziou o pool', (d) => {
            for (const id of d.pool) delete d.items[id];
            d.pool = [];
          });
          toast(`${plural(n, 'item excluído', 'itens excluídos')}`, { action: { label: 'Desfazer', run: () => useEditor.getState().undo() } });
        })}
      >
        <Trash2 /> Esvaziar pool
      </button>
    </div>
  );
}

function PoolItems() {
  const list = useEditor((s) => s.list!);
  const search = useDeferredValue(useUI((s) => s.search));
  const filters = useUI((s) => s.filters);
  const sort = useSettings((s) => s.poolSort);
  const lang = useSettings((s) => s.titleLang);
  const view = useSettings((s) => s.poolView);
  // Only recompute when pool membership/order or item data change.
  const ids = useMemo(() => poolView(list, search, filters, sort, lang), [list.pool, list.items, search, filters, sort, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!list.pool.length)
    return (
      <div className="empty">
        <Inbox />
        <b>Pool vazio</b>
        <span>Tudo ranqueado! Adicione mais coisas pela aba Adicionar.</span>
        <button className="btn btn-sm" onClick={() => useUI.getState().set({ poolTab: 'add' })}>
          <Sparkles /> Adicionar
        </button>
      </div>
    );
  if (!ids.length)
    return (
      <div className="empty">
        <Search />
        <b>Nada encontrado</b>
        <span>Nenhum item do pool bate com a busca ou filtros.</span>
      </div>
    );
  return <VirtualPool ids={ids} view={view} />;
}

/**
 * Renders only the rows near the viewport. A fresh AniList import puts hundreds of items
 * here, and every rendered card is a dnd-kit draggable that re-renders on each drag.
 */
function VirtualPool({ ids, view }: { ids: string[]; view: 'grid' | 'list' }) {
  const ref = useRef<HTMLDivElement>(null);
  const itemSize = useSettings((s) => s.itemSize);
  const [box, setBox] = useState({ width: 0, height: 900 });
  const [range, setRange] = useState<[number, number]>([0, 12]);
  const GAP = view === 'grid' ? 8 : 4;

  const narrow = typeof window !== 'undefined' && window.innerWidth <= 560;
  const minCell = Math.min(narrow ? Math.min(itemSize, 58) : itemSize, 92);
  const cols = view === 'grid' ? Math.max(1, Math.floor((box.width + GAP) / (minCell + GAP))) : 1;
  const cellW = view === 'grid' ? (box.width - GAP * (cols - 1)) / cols : 0;
  const rowH = view === 'grid' ? cellW * 1.5 + GAP : 60 + GAP;
  const rows = Math.ceil(ids.length / cols);

  useLayoutEffect(() => {
    const el = ref.current;
    const scroller = el?.parentElement;
    if (!el || !scroller) return;
    const measure = () => setBox((b) => (b.width === el.clientWidth && b.height === scroller.clientHeight ? b : { width: el.clientWidth, height: scroller.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    const scroller = el?.parentElement;
    if (!el || !scroller || !rowH) return;
    const BUF = 4;
    const update = () => {
      const top = scroller.scrollTop - el.offsetTop;
      const start = Math.max(0, Math.floor(top / rowH) - BUF);
      const end = Math.min(rows, Math.ceil((top + scroller.clientHeight) / rowH) + BUF);
      setRange((r) => (r[0] === start && r[1] === end ? r : [start, end]));
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    return () => scroller.removeEventListener('scroll', update);
  }, [rowH, rows]);

  const [start, end] = range;
  const slice = ids.slice(start * cols, end * cols);
  const style: CSSProperties = {
    paddingTop: start * rowH,
    paddingBottom: Math.max(0, (rows - end) * rowH),
    ...(view === 'grid' ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : null),
  };
  return (
    <div ref={ref} className={view === 'grid' ? 'pool-grid' : 'pool-list'} data-container="pool" style={style}>
      {box.width > 0 && (view === 'grid' ? slice.map((id) => <PoolCard key={id} id={id} />) : slice.map((id) => <PoolRow key={id} id={id} />))}
    </div>
  );
}

const PoolRow = memo(function PoolRow({ id }: { id: string }) {
  const item = useEditor((s) => s.list?.items[id]);
  const selected = useUI((s) => s.selected.has(id));
  const lang = useSettings((s) => s.titleLang);
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id, data: { type: 'item', container: 'pool' } });
  if (!item) return null;
  const meta = [item.format && (FORMAT_LABEL[item.format] ?? item.format), item.year, item.studio || item.origin].filter(Boolean).join(' · ');
  return (
    <div
      ref={setNodeRef}
      className={`pool-row ${selected ? 'selected' : ''}`}
      style={{ opacity: isDragging ? 0.3 : 1, '--cc': item.color } as CSSProperties}
      data-item={id}
      {...attributes}
      {...listeners}
      onClick={(e) => onCardClick(e, id)}
      onContextMenu={(e) => onCardContext(e, id)}
      onPointerEnter={(e) => onCardEnter(e, item)}
      onPointerLeave={() => onCardLeave(id)}
    >
      <div className="thumb">
        <Cover src={item.img} alt="" />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="t">{displayTitle(item, lang)}</div>
        {meta && <div className="m">{meta}</div>}
      </div>
      {item.score != null && (
        <span className="s" style={{ color: scoreColor(item.score) }}>
          {item.score}
        </span>
      )}
    </div>
  );
});
