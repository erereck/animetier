import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight, BarChart3, Copy, Download, Eye, FileSpreadsheet, FileText, History, Image as ImageIcon, Keyboard, Library, Link2, Minus, Palette as PaletteIcon, Plus, Redo2,
  RefreshCw, Scissors, Search, Share2, Shuffle, Sparkles, Type, Undo2, Upload, Wand2, Zap, Layers, Swords, Inbox, CalendarDays,
} from 'lucide-react';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { useSettings } from '../store/settings';
import { Cover } from '../components/Cover';
import * as A from '../lib/actions';
import { asText, exportCSV } from '../lib/exporters';
import { THEMES } from '../lib/themes';
import { matches } from '../lib/poolView';
import { displayTitle, inkOn, normTitle, shuffle } from '../lib/util';
import { go } from '../lib/router';
import { toast } from '../components/Toasts';
import { findContainer } from '../lib/ops';
import { POOL } from '../types';

interface Cmd {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  keys?: string;
  run: () => void;
  extra?: string;
}

export default function Palette() {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const list = useEditor((s) => s.list!);
  const lang = useSettings((s) => s.titleLang);
  const close = () => useUI.getState().set({ palette: false });

  const commands = useMemo<Cmd[]>(() => {
    const ui = useUI.getState();
    const s = useSettings.getState();
    const copy = (md: boolean) =>
      navigator.clipboard.writeText(asText(useEditor.getState().list!, s.titleLang, md)).then(() => toast.ok(md ? 'Markdown copiado' : 'Texto copiado'));
    const addTab = () => {
      s.set({ poolOpen: true });
      ui.set({ poolTab: 'add', sheet: 'half' });
    };
    const c: Cmd[] = [
      { id: 'speed', group: 'Ranquear', label: 'Rank rápido', hint: 'Ranqueia o pool item por item', icon: <Zap />, keys: 'R', run: () => ui.openDialog('speed') },
      { id: 'organize', group: 'Ranquear', label: 'Organizar automaticamente…', hint: 'Por nota, status, formato, década…', icon: <Wand2 />, run: () => ui.openDialog('organize') },
      { id: 'sequels', group: 'Ranquear', label: 'Remover continuações…', icon: <Scissors />, run: () => ui.openDialog('sequels') },
      { id: 'newtier', group: 'Ranquear', label: 'Nova tier', icon: <Plus />, run: () => A.addTier() },
      { id: 'add', group: 'Adicionar', label: 'Buscar no AniList', hint: 'Anime, mangá ou personagem', icon: <Search />, run: addTab },
      { id: 'import', group: 'Adicionar', label: 'Importar minha lista do AniList', icon: <Upload />, run: addTab },
      { id: 'season', group: 'Adicionar', label: 'Importar uma temporada', icon: <CalendarDays />, run: addTab },
      { id: 'insights', group: 'Ver', label: 'Insights', hint: 'Estatísticas e seu perfil de gosto', icon: <BarChart3 />, keys: 'I', run: () => ui.set({ insights: true }) },
      { id: 'pool', group: 'Ver', label: s.poolOpen ? 'Esconder o pool' : 'Mostrar o pool', icon: <Inbox />, keys: 'P', run: () => s.set({ poolOpen: !s.poolOpen }) },
      { id: 'bigger', group: 'Ver', label: 'Capas maiores', icon: <Plus />, run: () => s.set({ itemSize: Math.min(150, s.itemSize + 12) }) },
      { id: 'smaller', group: 'Ver', label: 'Capas menores', icon: <Minus />, run: () => s.set({ itemSize: Math.max(52, s.itemSize - 12) }) },
      { id: 'titles', group: 'Ver', label: s.titles === 'always' ? 'Títulos só ao passar o mouse' : 'Sempre mostrar títulos', icon: <Type />, run: () => s.set({ titles: s.titles === 'always' ? 'hover' : 'always' }) },
      { id: 'scores', group: 'Ver', label: s.showScores ? 'Esconder notas nas capas' : 'Mostrar notas nas capas', icon: <Eye />, run: () => s.set({ showScores: !s.showScores }) },
      { id: 'ranks', group: 'Ver', label: s.showRanks ? 'Esconder posições' : 'Numerar posições', icon: <Layers />, run: () => s.set({ showRanks: !s.showRanks }) },
      ...THEMES.map((t) => ({ id: 'theme-' + t.id, group: 'Tema', label: `Tema: ${t.name}`, icon: <span className="pal-swatch" style={{ background: `linear-gradient(135deg, ${t.swatch[1]}, ${t.swatch[2]})`, borderColor: t.swatch[0] }} />, run: () => s.set({ theme: t.id }) })),
      { id: 'appearance', group: 'Tema', label: 'Aparência e fonte…', icon: <PaletteIcon />, run: () => ui.openDialog('theme') },
      { id: 'export', group: 'Compartilhar', label: 'Exportar imagem', icon: <ImageIcon />, run: () => ui.openDialog('export') },
      { id: 'share', group: 'Compartilhar', label: 'Copiar link de compartilhamento', icon: <Share2 />, run: () => ui.openDialog('share') },
      { id: 'text', group: 'Compartilhar', label: 'Copiar como texto', icon: <Copy />, run: () => copy(false) },
      { id: 'md', group: 'Compartilhar', label: 'Copiar como Markdown', icon: <FileText />, run: () => copy(true) },
      { id: 'csv', group: 'Compartilhar', label: 'Baixar planilha (CSV)', icon: <FileSpreadsheet />, run: () => exportCSV(useEditor.getState().list!, s.titleLang) },
      { id: 'json', group: 'Compartilhar', label: 'Baixar backup (JSON)', icon: <Download />, run: () => A.exportListJSON(useEditor.getState().list!) },
      { id: 'refresh', group: 'AniList', label: 'Atualizar capas e dados do AniList', icon: <RefreshCw />, run: A.refreshMetadata },
      { id: 'link', group: 'AniList', label: 'Vincular itens sem AniList', icon: <Link2 />, run: A.linkUnmatched },
      { id: 'undo', group: 'Editar', label: 'Desfazer', icon: <Undo2 />, keys: 'Ctrl Z', run: A.undo },
      { id: 'redo', group: 'Editar', label: 'Refazer', icon: <Redo2 />, keys: 'Ctrl Y', run: A.redo },
      { id: 'history', group: 'Editar', label: 'Histórico de alterações', icon: <History />, run: () => ui.openDialog('history') },
      { id: 'shuffle', group: 'Editar', label: 'Embaralhar o pool', icon: <Shuffle />, run: () => useEditor.getState().mutate('Embaralhou o pool', (d) => void (d.pool = shuffle(d.pool))) },
      { id: 'help', group: 'Ajuda', label: 'Atalhos de teclado', icon: <Keyboard />, keys: '?', run: () => ui.openDialog('help') },
      { id: 'home', group: 'Ajuda', label: 'Voltar pras minhas listas', icon: <Library />, run: () => go('') },
    ];
    for (const t of list.tiers) {
      c.push({
        id: 'tier-' + t.id,
        group: 'Tiers',
        label: `Ir para "${t.name}"`,
        extra: t.name,
        icon: <span className="pal-swatch" style={{ background: t.color }} />,
        run: () => document.querySelector(`[data-tier="${t.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      });
      if (t.items.length > 1)
        c.push({ id: 'duel-' + t.id, group: 'Tiers', label: `Duelo em "${t.name}"`, extra: t.name, hint: 'Ordena comparando dois a dois', icon: <Swords />, run: () => ui.set({ duelTierId: t.id }) });
    }
    return c;
  }, [list.tiers]); // eslint-disable-line react-hooks/exhaustive-deps

  const nq = normTitle(q);
  const cmdResults = useMemo(() => (nq ? commands.filter((c) => nq.split(' ').every((w) => normTitle(c.label + ' ' + c.group + ' ' + (c.hint ?? '')).includes(w))) : commands.filter((c) => !c.id.startsWith('theme-') && !c.id.startsWith('duel-'))), [nq, commands]);
  const itemResults = useMemo(() => {
    if (nq.length < 2) return [];
    const out: string[] = [];
    for (const id of Object.keys(list.items)) {
      if (matches(list.items[id], nq)) out.push(id);
      if (out.length >= 8) break;
    }
    return out;
  }, [nq, list.items]);

  type Row = { kind: 'cmd'; cmd: Cmd } | { kind: 'item'; id: string };
  const rows: Row[] = [...itemResults.map((id) => ({ kind: 'item' as const, id })), ...cmdResults.map((cmd) => ({ kind: 'cmd' as const, cmd }))];

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const exec = (r: Row | undefined) => {
    if (!r) return;
    close();
    if (r.kind === 'cmd') setTimeout(r.cmd.run, 0);
    else {
      A.revealItem(r.id);
      setTimeout(() => useUI.getState().inspect(r.id), 250);
    }
  };

  let lastGroup = '';
  return createPortal(
    <div className="scrim palette-scrim" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Paleta de comandos">
        <div className="pal-input">
          <Search />
          <input
            autoFocus
            placeholder="O que você quer fazer? Ou busque um anime…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(rows.length - 1, s + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                exec(rows[sel]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="pal-list" ref={listRef}>
          {!rows.length && (
            <div className="empty">
              <Sparkles />
              <b>Nada encontrado</b>
            </div>
          )}
          {rows.map((r, i) => {
            const group = r.kind === 'item' ? 'Itens' : r.cmd.group;
            const head = group !== lastGroup ? <div className="menu-head">{group}</div> : null;
            lastGroup = group;
            if (r.kind === 'item') {
              const it = list.items[r.id];
              const c = findContainer(list, r.id);
              const tier = list.tiers.find((t) => t.id === c);
              return (
                <div key={r.id}>
                  {head}
                  <button data-i={i} className="pal-row" data-active={i === sel} onMouseMove={() => setSel(i)} onClick={() => exec(r)}>
                    <span className="pal-thumb" style={{ '--cc': it.color } as CSSProperties}>
                      <Cover src={it.img} alt="" />
                    </span>
                    <span className="grow">{displayTitle(it, lang)}</span>
                    {tier ? (
                      <span className="tier-chip sm" style={{ '--tc': tier.color, '--ink': inkOn(tier.color) } as CSSProperties}>
                        {tier.name}
                      </span>
                    ) : (
                      c === POOL && <span className="faint">pool</span>
                    )}
                    <ArrowRight size={14} className="go" />
                  </button>
                </div>
              );
            }
            return (
              <div key={r.cmd.id}>
                {head}
                <button data-i={i} className="pal-row" data-active={i === sel} onMouseMove={() => setSel(i)} onClick={() => exec(r)}>
                  <span className="pal-icon">{r.cmd.icon}</span>
                  <span className="grow">
                    {r.cmd.label}
                    {r.cmd.hint && <span className="pal-hint"> — {r.cmd.hint}</span>}
                  </span>
                  {r.cmd.keys && (
                    <span className="row" style={{ gap: 3 }}>
                      {r.cmd.keys.split(' ').map((k) => (
                        <span key={k} className="kbd">
                          {k}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        <div className="pal-foot">
          <span>
            <span className="kbd">↑</span> <span className="kbd">↓</span> navegar
          </span>
          <span>
            <span className="kbd">Enter</span> executar
          </span>
          <span className="grow" />
          <span className="faint">digite “tema”, “imagem”, “duelo” ou um título</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
