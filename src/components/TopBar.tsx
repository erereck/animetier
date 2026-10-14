import { useRef } from 'react';
import {
  Command,
  Download,
  History,
  Image as ImageIcon,
  Keyboard,
  LayoutTemplate,
  Link2,
  MoreHorizontal,
  Redo2,
  RefreshCw,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  FileText,
  FileSpreadsheet,
  Copy,
  Library,
  Palette,
} from 'lucide-react';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { useSettings } from '../store/settings';
import { Popover, usePopover } from './Overlay';
import { ViewMenu } from './ViewMenu';
import { go } from '../lib/router';
import * as A from '../lib/actions';
import { asText, exportCSV } from '../lib/exporters';
import { toast } from './Toasts';
import { TEMPLATES } from '../lib/presets';
import { confirmDialog } from './Overlay';

export function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <button className="brand" onClick={onClick} aria-label="AnimeTier — biblioteca">
      <span className="brand-mark">
        <Logo />
      </span>
      <span className="brand-name">
        Anime<em>Tier</em>
      </span>
    </button>
  );
}

export function Logo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16" />
      <path d="M4 12h10" />
      <path d="M4 18h5" />
      <path d="M18.5 13.5l1 2.2 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" fill="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function TopBar({ readOnly }: { readOnly?: boolean }) {
  const title = useEditor((s) => s.list?.title ?? '');
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const save = useEditor((s) => s.saveState);
  const view = usePopover<HTMLElement>();
  const more = usePopover<HTMLElement>();
  const moreRef = useRef<HTMLButtonElement>(null);

  return (
    <header className="topbar">
      <Brand onClick={() => go('')} />
      <span className="tb-sep hide-sm" />
      <div className="tb-title hide-sm">
        <span className="tb-title-text">{title}</span>
        {!readOnly && (
          <span className={`save-pill ${save}`} title={save === 'error' ? 'Não foi possível salvar' : 'Salvo automaticamente neste navegador'}>
            <span className="dot" />
            <span className="hide-md">{save === 'saving' ? 'Salvando…' : save === 'error' ? 'Erro ao salvar' : 'Salvo'}</span>
          </span>
        )}
      </div>
      {!readOnly && (
        <div className="tb-actions">
          <button className="cmdk-btn hide-sm" onClick={() => useUI.getState().set({ palette: true })}>
            <Search /> <span className="lbl">Buscar ações e itens…</span>
            <span className="kbd">Ctrl K</span>
          </button>
          <button className="btn btn-ghost btn-icon" data-tip="Desfazer (Ctrl+Z)" disabled={!canUndo} onClick={A.undo}>
            <Undo2 />
          </button>
          <button className="btn btn-ghost btn-icon hide-sm" data-tip="Refazer (Ctrl+Y)" disabled={!canRedo} onClick={A.redo}>
            <Redo2 />
          </button>
          <span className="tb-sep hide-sm" />
          <button className="btn btn-ghost btn-icon" data-tip="Aparência" onClick={(e) => view.toggle(e.currentTarget)}>
            <SlidersHorizontal />
          </button>
          <button className="btn btn-ghost btn-icon hide-md" data-tip="Insights" onClick={() => useUI.getState().set({ insights: true })}>
            <Sparkles />
          </button>
          <button className="btn hide-sm" onClick={() => useUI.getState().openDialog('export')}>
            <ImageIcon /> <span className="hide-md">Imagem</span>
          </button>
          <button className="btn btn-primary" onClick={() => useUI.getState().openDialog('share')}>
            <Share2 /> <span className="hide-sm">Compartilhar</span>
          </button>
          <button ref={moreRef} className="btn btn-ghost btn-icon" aria-label="Mais opções" onClick={(e) => more.toggle(e.currentTarget)}>
            <MoreHorizontal />
          </button>
        </div>
      )}
      {view.anchor && (
        <Popover anchor={view.anchor} onClose={view.close} placement="bottom-end" width={340}>
          <ViewMenu />
        </Popover>
      )}
      {more.anchor && (
        <Popover anchor={more.anchor} onClose={more.close} placement="bottom-end">
          <MoreMenu close={more.close} />
        </Popover>
      )}
    </header>
  );
}

function MoreMenu({ close }: { close: () => void }) {
  const ui = useUI.getState();
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  const tmpl = usePopover<HTMLElement>();
  const copy = (md: boolean) => {
    const l = useEditor.getState().list!;
    navigator.clipboard
      .writeText(asText(l, useSettings.getState().titleLang, md))
      .then(() => toast.ok(md ? 'Markdown copiado' : 'Texto copiado'))
      .catch(() => toast.err('Não deu pra copiar'));
  };
  return (
    <div className="menu" style={{ minWidth: 260 }}>
      <button className="menu-item" onClick={run(() => ui.set({ palette: true }))}>
        <Command /> Paleta de comandos <span className="end"><span className="kbd">Ctrl K</span></span>
      </button>
      <button className="menu-item" onClick={run(() => ui.openDialog('history'))}>
        <History /> Histórico de alterações
      </button>
      <button className="menu-item" onClick={(e) => tmpl.toggle(e.currentTarget)}>
        <LayoutTemplate /> Trocar modelo de tiers…
      </button>
      <button className="menu-item" onClick={run(() => ui.openDialog('theme'))}>
        <Palette /> Tema e fonte
      </button>
      <div className="menu-sep" />
      <div className="menu-head">AniList</div>
      <button className="menu-item" onClick={run(A.refreshMetadata)}>
        <RefreshCw /> Atualizar capas e dados
      </button>
      <button className="menu-item" onClick={run(A.linkUnmatched)}>
        <Link2 /> Vincular itens sem AniList
      </button>
      <div className="menu-sep" />
      <div className="menu-head">Exportar</div>
      <button className="menu-item" onClick={run(() => ui.openDialog('export'))}>
        <ImageIcon /> Imagem (PNG)
      </button>
      <button className="menu-item" onClick={run(() => copy(false))}>
        <Copy /> Copiar como texto
      </button>
      <button className="menu-item" onClick={run(() => copy(true))}>
        <FileText /> Copiar como Markdown
      </button>
      <button className="menu-item" onClick={run(() => exportCSV(useEditor.getState().list!, useSettings.getState().titleLang))}>
        <FileSpreadsheet /> Planilha (CSV)
      </button>
      <button className="menu-item" onClick={run(() => A.exportListJSON(useEditor.getState().list!))}>
        <Download /> Backup (JSON)
      </button>
      <div className="menu-sep" />
      <button className="menu-item" onClick={run(() => ui.openDialog('help'))}>
        <Keyboard /> Atalhos de teclado <span className="end"><span className="kbd">?</span></span>
      </button>
      <button className="menu-item" onClick={run(() => go(''))}>
        <Library /> Minhas listas
      </button>
      {tmpl.anchor && (
        <Popover anchor={tmpl.anchor} onClose={tmpl.close} placement="right-start">
          <div className="menu">
            <div className="menu-head">Substituir as tiers por…</div>
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                className="menu-item"
                onClick={async () => {
                  tmpl.close();
                  close();
                  const ok = await confirmDialog({ title: `Usar o modelo "${t.name}"?`, body: 'As tiers atuais serão trocadas e todos os itens ranqueados voltam pro pool. Dá pra desfazer.', confirm: 'Trocar modelo' });
                  if (ok) A.applyTemplate(t.id);
                }}
              >
                <span style={{ width: 18, textAlign: 'center' }}>{t.emoji}</span> {t.name}
                <span className="end">
                  {t.tiers.slice(0, 6).map(([, c], i) => (
                    <span key={i} className="dot" style={{ background: c, width: 7, height: 7 }} />
                  ))}
                </span>
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}
