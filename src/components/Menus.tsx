import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronsDownUp,
  ChevronsUpDown,
  CheckSquare,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Inbox,
  Lock,
  Merge,
  Star,
  Swords,
  Trash2,
  Unlock,
  X,
  Eraser,
  Info,
  CopyPlus,
  Pipette,
} from 'lucide-react';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { useSettings } from '../store/settings';
import { Popover, usePopover } from './Overlay';
import { TIER_PALETTE } from '../lib/presets';
import * as A from '../lib/actions';
import * as ops from '../lib/ops';
import { anilistUrl } from '../lib/anilist';
import { displayTitle, inkOn, plural, scoreColor } from '../lib/util';
import { POOL, type Tier } from '../types';
import { asText } from '../lib/exporters';
import { toast } from './Toasts';

const NO_TIERS: Tier[] = [];
const EMOJIS = ['👑', '🔥', '💎', '⭐', '💖', '😭', '😂', '😴', '💀', '🗑️', '🤔', '⚔️', '🎵', '🌸', '🍿', '🛋️'];

// ── Tier menu ──────────────────────────────────────────
export function TierMenu() {
  const menu = useUI((s) => s.tierMenu);
  const tier = useEditor((s) => s.list?.tiers.find((t) => t.id === menu?.id));
  const index = useEditor((s) => s.list?.tiers.findIndex((t) => t.id === menu?.id) ?? -1);
  const allTiers = useEditor((s) => s.list?.tiers);
  const others = (allTiers ?? []).filter((t) => t.id !== menu?.id);
  const close = () => useUI.getState().set({ tierMenu: null });
  const [name, setName] = useState(tier?.name ?? '');
  const [merging, setMerging] = useState(false);
  const colorRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(tier?.name ?? '');
    setMerging(false);
  }, [menu?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!menu || !tier) return null;
  const ed = useEditor.getState();
  const upd = (label: string, fn: (t: Tier) => void, coalesce?: string) =>
    ed.mutate(
      label,
      (d) => {
        const t = d.tiers.find((x) => x.id === tier.id);
        if (t) fn(t);
      },
      coalesce,
    );
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  const lang = useSettings.getState().titleLang;
  const sort = (mode: ops.TierSort, label: string) => ed.mutate(`${label} "${tier.name}"`, (d) => ops.sortTier(d, tier.id, mode, lang));

  return (
    <Popover anchor={menu.el} onClose={close} placement="right-start" width={300}>
      <div className="tier-menu" style={{ '--tc': tier.color, '--ink': inkOn(tier.color) } as CSSProperties}>
        <div className="tm-head">
          <input
            className="input tm-name"
            value={name}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              setName(e.target.value);
              upd('Renomeou tier', (t) => (t.name = e.target.value || ' '), 'rename:' + tier.id);
            }}
            onBlur={() => !name.trim() && upd('Renomeou tier', (t) => (t.name = 'Tier'), 'rename:' + tier.id)}
            onKeyDown={(e) => e.key === 'Enter' && close()}
            aria-label="Nome da tier"
          />
        </div>
        <div className="tm-colors">
          {TIER_PALETTE.map((c) => (
            <button key={c} className={`sw ${tier.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => upd('Mudou a cor', (t) => (t.color = c))} aria-label={`Cor ${c}`} />
          ))}
          <button className="sw custom" onClick={() => colorRef.current?.click()} aria-label="Cor personalizada" title="Cor personalizada">
            <Pipette />
          </button>
          <input ref={colorRef} type="color" value={tier.color} hidden onChange={(e) => upd('Mudou a cor', (t) => (t.color = e.target.value), 'color:' + tier.id)} />
        </div>
        <div className="tm-emoji">
          <button className={`em ${!tier.icon ? 'on' : ''}`} onClick={() => upd('Removeu ícone', (t) => delete t.icon)} title="Sem ícone">
            <X size={14} />
          </button>
          {EMOJIS.map((e) => (
            <button key={e} className={`em ${tier.icon === e ? 'on' : ''}`} onClick={() => upd('Mudou o ícone', (t) => (t.icon = e))}>
              {e}
            </button>
          ))}
        </div>
        <div className="menu-sep" />
        <div className="menu-head">Ordenar itens</div>
        <div className="tm-sorts">
          <button className="chip" onClick={() => sort('title', 'Ordenou A→Z')}>A→Z</button>
          <button className="chip" onClick={() => sort('score', 'Ordenou por nota')}>Sua nota</button>
          <button className="chip" onClick={() => sort('alScore', 'Ordenou por nota AniList')}>AniList</button>
          <button className="chip" onClick={() => sort('year', 'Ordenou por ano')}>Ano</button>
          <button className="chip" onClick={() => sort('shuffle', 'Embaralhou')}>Embaralhar</button>
          <button className="chip" onClick={() => sort('reverse', 'Inverteu')}>Inverter</button>
        </div>
        <div className="menu" style={{ padding: 0, minWidth: 0, maxHeight: 'none' }}>
          <button className="menu-item" disabled={tier.items.length < 2} onClick={run(() => useUI.getState().set({ duelTierId: tier.id }))}>
            <Swords /> Duelo: ordenar comparando
          </button>
          <div className="menu-sep" />
          <button className="menu-item" onClick={run(() => A.addTier(index))}>
            <ArrowUpToLine /> Inserir tier acima
          </button>
          <button className="menu-item" onClick={run(() => A.addTier(index + 1))}>
            <ArrowDownToLine /> Inserir tier abaixo
          </button>
          <button className="menu-item" onClick={run(() => upd(tier.locked ? 'Destrancou tier' : 'Trancou tier', (t) => (t.locked = !t.locked || undefined)))}>
            {tier.locked ? <Unlock /> : <Lock />} {tier.locked ? 'Destrancar' : 'Trancar'}
            <span className="end">{tier.locked ? '' : 'impede mudanças'}</span>
          </button>
          <button className="menu-item" onClick={run(() => upd(tier.collapsed ? 'Expandiu tier' : 'Recolheu tier', (t) => (t.collapsed = !t.collapsed || undefined)))}>
            {tier.collapsed ? <ChevronsUpDown /> : <ChevronsDownUp />} {tier.collapsed ? 'Expandir' : 'Recolher'}
          </button>
          <button className="menu-item" disabled={!tier.items.length} onClick={run(() => useUI.getState().select(tier.items, 'add'))}>
            <CheckSquare /> Selecionar todos
          </button>
          <button className="menu-item" onClick={run(() => ed.mutate(`Duplicou "${tier.name}"`, (d) => ops.duplicateTier(d, tier.id)))}>
            <CopyPlus /> Duplicar tier
          </button>
          <button className="menu-item" disabled={!others.length} onClick={() => setMerging(!merging)}>
            <Merge /> Mesclar com…
          </button>
          {merging && (
            <div className="tm-merge">
              {others.map((o) => (
                <button
                  key={o.id}
                  className="tier-chip"
                  style={{ '--tc': o.color, '--ink': inkOn(o.color) } as CSSProperties}
                  onClick={run(() => ed.mutate(`Mesclou "${tier.name}" em "${o.name}"`, (d) => ops.mergeTier(d, tier.id, o.id)))}
                >
                  {o.name}
                </button>
              ))}
            </div>
          )}
          <button
            className="menu-item"
            onClick={run(() => {
              const l = useEditor.getState().list!;
              const sub = { ...l, tiers: l.tiers.filter((t) => t.id === tier.id) };
              navigator.clipboard.writeText(asText(sub, lang, false)).then(() => toast.ok('Tier copiada como texto'));
            })}
          >
            <Copy /> Copiar como texto
          </button>
          <div className="menu-sep" />
          <button className="menu-item" disabled={!tier.items.length} onClick={run(() => ed.mutate(`Esvaziou "${tier.name}"`, (d) => ops.clearTier(d, tier.id)))}>
            <Eraser /> Mandar tudo pro pool
          </button>
          <button className="menu-item danger" onClick={run(() => A.deleteTier(tier.id))}>
            <Trash2 /> Excluir tier
          </button>
        </div>
      </div>
    </Popover>
  );
}

// ── Item context menu ──────────────────────────────────
export function ItemMenu() {
  const menu = useUI((s) => s.itemMenu);
  const item = useEditor((s) => (menu ? s.list?.items[menu.id] : undefined));
  const tiers = useEditor((s) => s.list?.tiers) ?? NO_TIERS;
  const where = useEditor((s) => (menu && s.list ? ops.findContainer(s.list, menu.id) : null));
  const lang = useSettings((s) => s.titleLang);
  const selected = useUI((s) => s.selected);
  if (!menu || !item) return null;
  const close = () => useUI.getState().set({ itemMenu: null });
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  // Acting on a selected item applies to the whole selection.
  const ids = selected.has(item.id) && selected.size > 1 ? [...selected] : [item.id];
  const many = ids.length > 1;
  return (
    <Popover anchor={{ x: menu.x, y: menu.y }} onClose={close} placement="point">
      <div className="menu item-menu">
        <div className="im-head">
          <b>{many ? `${ids.length} itens selecionados` : displayTitle(item, lang)}</b>
          {!many && item.score != null && (
            <span className="im-score" style={{ background: scoreColor(item.score) }}>
              {item.score}
            </span>
          )}
        </div>
        <div className="menu-head">Mover para</div>
        <div className="im-tiers">
          {tiers.map((t, i) => (
            <button
              key={t.id}
              className={`tier-chip ${where === t.id ? 'here' : ''}`}
              style={{ '--tc': t.color, '--ink': inkOn(t.color) } as CSSProperties}
              onClick={run(() => A.moveTo(ids, t.id))}
              title={i < 9 ? `Atalho: ${i + 1}` : undefined}
            >
              {t.name}
            </button>
          ))}
          <button className={`tier-chip pool-chip ${where === POOL ? 'here' : ''}`} onClick={run(() => A.moveTo(ids, POOL))} title="Atalho: 0">
            <Inbox size={14} /> Pool
          </button>
        </div>
        <div className="menu-sep" />
        {!many && (
          <button className="menu-item" onClick={run(() => useUI.getState().inspect(item.id))}>
            <Info /> Detalhes, nota e anotação <span className="end"><span className="kbd">Enter</span></span>
          </button>
        )}
        <button className="menu-item" onClick={run(() => A.toggleSpoiler(ids))}>
          {item.spoiler ? <Eye /> : <EyeOff />} {item.spoiler ? 'Tirar borrão de spoiler' : 'Borrar como spoiler'}
        </button>
        {!many && (
          <button className="menu-item" onClick={run(() => A.duplicateItem(item.id))}>
            <Copy /> Duplicar
          </button>
        )}
        {!many && item.anilistId && (
          <a className="menu-item" href={anilistUrl(item)} target="_blank" rel="noreferrer" onClick={close}>
            <ExternalLink /> Abrir no AniList
          </a>
        )}
        <button className="menu-item" onClick={run(() => useUI.getState().select(ids, many ? 'replace' : 'toggle'))}>
          <CheckSquare /> {selected.has(item.id) ? 'Desmarcar' : 'Selecionar'}
        </button>
        <div className="menu-sep" />
        <button className="menu-item danger" onClick={run(() => A.deleteItems(ids))}>
          <Trash2 /> Excluir{many ? ` ${ids.length} itens` : ''} <span className="end"><span className="kbd">Del</span></span>
        </button>
      </div>
    </Popover>
  );
}

// ── Bulk selection bar ─────────────────────────────────
export function BulkBar() {
  const selected = useUI((s) => s.selected);
  const tiers = useEditor((s) => s.list?.tiers) ?? NO_TIERS;
  const scorePop = usePopover<HTMLElement>();
  const [score, setScore] = useState(75);
  if (!selected.size) return null;
  const ids = [...selected];
  return (
    <div className="bulkbar" role="toolbar" aria-label="Ações em massa">
      <span className="count">{plural(ids.length, 'selecionado', 'selecionados')}</span>
      <div className="tiers-quick">
        {tiers.map((t) => (
          <button
            key={t.id}
            className="tier-chip"
            style={{ '--tc': t.color, '--ink': inkOn(t.color) } as CSSProperties}
            onClick={() => {
              A.moveTo(ids, t.id);
              useUI.getState().clearSelection();
            }}
            title={`Mover para ${t.name}`}
          >
            {t.name}
          </button>
        ))}
      </div>
      <button
        className="btn btn-sm"
        onClick={() => {
          A.moveTo(ids, POOL);
          useUI.getState().clearSelection();
        }}
      >
        <Inbox /> <span className="hide-sm">Pool</span>
      </button>
      <button className="btn btn-sm btn-icon" data-tip="Dar nota" onClick={(e) => scorePop.toggle(e.currentTarget)}>
        <Star />
      </button>
      <button className="btn btn-sm btn-icon" data-tip="Spoiler" onClick={() => A.toggleSpoiler(ids)}>
        <EyeOff />
      </button>
      <button className="btn btn-sm btn-icon btn-danger" data-tip="Excluir" onClick={() => A.deleteItems(ids)}>
        <Trash2 />
      </button>
      <button className="btn btn-sm btn-icon btn-ghost" data-tip="Limpar seleção (Esc)" onClick={() => useUI.getState().clearSelection()}>
        <X />
      </button>
      {scorePop.anchor && (
        <Popover anchor={scorePop.anchor} onClose={scorePop.close} placement="top-start" width={280}>
          <div className="score-pop">
            <div className="row">
              <b className="big-score" style={{ color: scoreColor(score) }}>
                {score}
              </b>
              <span className="muted">pra {plural(ids.length, 'item', 'itens')}</span>
            </div>
            <input className="range" type="range" min={0} max={100} value={score} style={{ '--p': `${score}%` } as CSSProperties} onChange={(e) => setScore(Number(e.target.value))} />
            <div className="row">
              <button className="btn btn-sm btn-ghost" onClick={() => (A.setScore(ids, null), scorePop.close())}>
                Remover notas
              </button>
              <button className="btn btn-sm btn-primary" style={{ marginLeft: 'auto' }} onClick={() => (A.setScore(ids, score), scorePop.close(), toast.ok(`Nota ${score} aplicada`))}>
                Aplicar
              </button>
            </div>
          </div>
        </Popover>
      )}
    </div>
  );
}

