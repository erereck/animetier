import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, Copy, Download, FileUp, History, Loader2, MoreHorizontal, Pencil, Plus, Trash2, Upload, User, Zap, Share2, Image as ImageIcon, Sparkles, Moon, Sun } from 'lucide-react';
import type { Item, ListSummary } from '../types';
import { db, readLegacySaves } from '../lib/db';
import { go } from '../lib/router';
import { Brand } from '../components/TopBar';
import { Popover, usePopover, confirmDialog, promptDialog } from '../components/Overlay';
import { NewListDialog, createList } from '../features/NewList';
import { exportAllJSON, exportListJSON, fetchUserImport, importFile, errMsg } from '../lib/actions';
import { fromLegacy, isLegacy } from '../lib/migrate';
import { trending } from '../lib/anilist';
import { Cover } from '../components/Cover';
import { plural, timeAgo, uid } from '../lib/util';
import { useSettings } from '../store/settings';
import { toast } from '../components/Toasts';

export function Home() {
  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [legacy, setLegacy] = useState<{ name: string; data: unknown }[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => db.summaries().then(setLists);
  useEffect(() => {
    refresh();
    if (!localStorage.getItem('animetier:legacy-done')) readLegacySaves().then((l) => setLegacy(l.filter((x) => isLegacy(x.data))));
  }, []);

  const importLegacy = async () => {
    const t = toast.busy('Trazendo suas listas antigas…');
    for (const l of legacy) {
      const list = await fromLegacy(l.data as never, l.name === 'Autosave' ? undefined : l.name);
      await db.putList(list);
    }
    localStorage.setItem('animetier:legacy-done', '1');
    setLegacy([]);
    toast.update(t, `${plural(legacy.length, 'lista importada', 'listas importadas')} da versão antiga`, { kind: 'ok' });
    refresh();
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    await importFile(f);
    refresh();
  };

  return (
    <div
      className="home"
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => {
        const f = [...e.dataTransfer.files].find((x) => x.name.endsWith('.json'));
        if (f) {
          e.preventDefault();
          onFile(f);
        }
      }}
    >
      <header className="home-top">
        <Brand onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
        <div className="grow" />
        <ThemeToggle />
        <button className="btn btn-ghost hide-sm" onClick={() => fileRef.current?.click()}>
          <Upload /> Importar arquivo
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => onFile(e.target.files?.[0]).then(() => (e.target.value = ''))} />
        {!!lists?.length && (
          <button className="btn btn-ghost btn-icon" data-tip="Backup de todas as listas" onClick={exportAllJSON}>
            <Download />
          </button>
        )}
      </header>

      <Hero onNew={() => setNewOpen(true)} />

      {legacy.length > 0 && (
        <div className="legacy-banner">
          <History />
          <div className="grow">
            <b>Achamos {legacy.length === 1 ? 'sua tier list' : `${legacy.length} tier lists`} da versão antiga do AnimeTier</b>
            <span>Dá pra trazer tudo pra cá, com tiers, notas e anotações.</span>
          </div>
          <button className="btn btn-primary" onClick={importLegacy}>
            Importar
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              localStorage.setItem('animetier:legacy-done', '1');
              setLegacy([]);
            }}
          >
            Agora não
          </button>
        </div>
      )}

      <section className="library">
        <div className="lib-head">
          <h2 className="display">Suas listas</h2>
          {!!lists?.length && <span className="faint">{plural(lists.length, 'lista', 'listas')} · salvas neste navegador</span>}
        </div>
        <div className="lib-grid">
          <button className="list-card new" onClick={() => setNewOpen(true)}>
            <span className="plus">
              <Plus />
            </span>
            <b>Nova tier list</b>
            <span>Do AniList, de uma temporada ou do zero</span>
          </button>
          {lists?.map((l) => (
            <ListCard key={l.id} s={l} onChange={refresh} />
          ))}
          {lists && !lists.length && (
            <button className="list-card ghost" onClick={() => fileRef.current?.click()}>
              <FileUp />
              <b>Tem um backup?</b>
              <span>Importe um .json — inclusive da versão antiga</span>
            </button>
          )}
        </div>
      </section>

      <footer className="home-foot">
        <span>Tudo fica salvo só no seu navegador. Dados e capas via AniList.</span>
      </footer>

      {newOpen && <NewListDialog onClose={() => setNewOpen(false)} />}
    </div>
  );
}

function ThemeToggle() {
  const theme = useSettings((s) => s.theme);
  const light = theme === 'sakura' || theme === 'matcha';
  return (
    <button className="btn btn-ghost btn-icon" data-tip={light ? 'Tema escuro' : 'Tema claro'} onClick={() => useSettings.getState().set({ theme: light ? 'noite' : 'sakura' })}>
      {light ? <Moon /> : <Sun />}
    </button>
  );
}

// ── Hero ───────────────────────────────────────────────
let heroCache: Item[] | null = null;

function Hero({ onNew }: { onNew: () => void }) {
  const [covers, setCovers] = useState<Item[]>(heroCache ?? []);
  const [user, setUser] = useState(useSettings.getState().lastUser);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (heroCache) return;
    try {
      const cached = sessionStorage.getItem('animetier:hero');
      if (cached) {
        heroCache = JSON.parse(cached);
        setCovers(heroCache!);
        return;
      }
    } catch {
      /* ignore */
    }
    trending('ANIME')
      .then((r) => {
        heroCache = r.filter((i) => i.img && !i.isAdult).slice(0, 24);
        setCovers(heroCache);
        try {
          sessionStorage.setItem('animetier:hero', JSON.stringify(heroCache));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, []);

  const quick = async () => {
    if (!user.trim()) {
      onNew();
      return;
    }
    setBusy(true);
    try {
      const { items, userName } = await fetchUserImport({ user, type: 'ANIME', statuses: ['COMPLETED', 'CURRENT', 'REPEATING', 'PAUSED', 'DROPPED'], yearMode: 'any' });
      useSettings.getState().set({ lastUser: user.trim() });
      if (!items.length) throw new Error('Essa lista está vazia.');
      await createList({ title: `Animes de ${userName}`, template: 'classic', items, anilistUser: userName });
      toast.ok(`${plural(items.length, 'anime pronto', 'animes prontos')} pra ranquear — aperte R pro Rank rápido`, { duration: 6000 });
    } catch (e) {
      toast.err((e as Error).message?.length < 80 ? (e as Error).message : errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const cols = [0, 1, 2, 3, 4, 5].map((c) => covers.filter((_, i) => i % 6 === c));

  return (
    <section className="hero">
      <div className="hero-wall" aria-hidden>
        {cols.map((col, ci) => (
          <div key={ci} className="wall-col" style={{ '--d': `${ci % 2 ? -1 : 1}`, '--t': `${38 + ci * 6}s` } as CSSProperties}>
            {[...col, ...col].map((it, i) => (
              <div key={it.id + i} className="wall-card" style={{ '--cc': it.color } as CSSProperties}>
                <Cover src={it.img} alt="" size="large" />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="hero-copy">
        <span className="eyebrow">
          <Sparkles size={14} /> AnimeTier 6
        </span>
        <h1 className="display">
          Ranqueie tudo que você <em>já assistiu.</em>
        </h1>
        <p>Puxe sua lista do AniList em segundos, arraste pra tier certa (ou use o Rank rápido) e compartilhe com um link.</p>
        <div className="hero-form">
          <div className="input-wrap">
            <User />
            <input className="input" placeholder="seu usuário do AniList" value={user} onChange={(e) => setUser(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && quick()} />
          </div>
          <button className="btn btn-primary btn-lg" onClick={quick} disabled={busy}>
            {busy ? <Loader2 className="spin" /> : <Zap />} {user.trim() ? 'Montar minha tier list' : 'Começar'}
          </button>
        </div>
        <div className="hero-alt">
          <button className="link" onClick={onNew}>
            ou escolha um modelo, uma temporada ou comece do zero <ArrowRight size={14} />
          </button>
        </div>
        <ul className="hero-feats">
          <li>
            <Zap size={15} /> Rank rápido no teclado
          </li>
          <li>
            <Share2 size={15} /> Link pra compartilhar
          </li>
          <li>
            <ImageIcon size={15} /> Imagem em alta pra postar
          </li>
        </ul>
      </div>
    </section>
  );
}

// ── Library card ───────────────────────────────────────
function ListCard({ s, onChange }: { s: ListSummary; onChange: () => void }) {
  const menu = usePopover<HTMLElement>();
  const pct = s.total ? Math.round((s.ranked / s.total) * 100) : 0;
  const rows = s.preview.slice(0, 6);
  return (
    <div className="list-card" onClick={() => go('l/' + s.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go('l/' + s.id)}>
      <div className="lc-preview">
        {rows.map((r, i) => (
          <div key={i} className="lc-row">
            <i style={{ background: r.color }} />
            <div className="lc-covers">
              {r.covers.slice(0, 8).map((c, j) => (
                <span key={j}>
                  <Cover src={c} alt="" />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="lc-info">
        <b>{s.title}</b>
        <span>
          {plural(s.total, 'item', 'itens')} · {pct}% ranqueado · {timeAgo(s.updatedAt)}
        </span>
      </div>
      <div className="lc-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <button
        className="btn btn-ghost btn-icon btn-sm lc-more"
        aria-label="Opções"
        onClick={(e) => {
          e.stopPropagation();
          menu.toggle(e.currentTarget);
        }}
      >
        <MoreHorizontal />
      </button>
      {menu.anchor && (
        <Popover anchor={menu.anchor} onClose={menu.close} placement="bottom-end">
          <div className="menu" onClick={(e) => e.stopPropagation()}>
            <button
              className="menu-item"
              onClick={async () => {
                menu.close();
                const name = await promptDialog({ title: 'Renomear lista', input: { value: s.title }, confirm: 'Salvar' });
                if (!name?.trim()) return;
                const l = await db.getList(s.id);
                if (l) await db.putList({ ...l, title: name.trim(), updatedAt: Date.now() });
                onChange();
              }}
            >
              <Pencil /> Renomear
            </button>
            <button
              className="menu-item"
              onClick={async () => {
                menu.close();
                const l = await db.getList(s.id);
                if (!l) return;
                await db.putList({ ...l, id: uid('l'), title: l.title + ' (cópia)', createdAt: Date.now(), updatedAt: Date.now() });
                toast.ok('Lista duplicada');
                onChange();
              }}
            >
              <Copy /> Duplicar
            </button>
            <button
              className="menu-item"
              onClick={async () => {
                menu.close();
                const l = await db.getList(s.id);
                if (l) exportListJSON(l);
              }}
            >
              <Download /> Baixar backup
            </button>
            <div className="menu-sep" />
            <button
              className="menu-item danger"
              onClick={async () => {
                menu.close();
                const ok = await confirmDialog({ title: `Excluir "${s.title}"?`, body: 'Essa lista some deste navegador pra sempre. Se quiser guardar, baixe um backup antes.', confirm: 'Excluir', danger: true });
                if (!ok) return;
                await db.deleteList(s.id);
                toast('Lista excluída');
                onChange();
              }}
            >
              <Trash2 /> Excluir
            </button>
          </div>
        </Popover>
      )}
    </div>
  );
}
