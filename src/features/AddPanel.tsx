import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Check, Clipboard, Film, ImagePlus, Link2, Loader2, Plus, Search, Upload, User, Users, BookOpen, CalendarDays, Heart, TrendingUp } from 'lucide-react';
import type { Item, Season } from '../types';
import { useEditor } from '../store/editor';
import { useSettings } from '../store/settings';
import { search as alSearch, trending, type SearchKind } from '../lib/anilist';
import { addFiles, addToList, addUrls, importFavourites, importSeason, importUserList, pasteImage, revealItem, errMsg } from '../lib/actions';
import { itemKey } from '../lib/ops';
import { Cover } from '../components/Cover';
import { currentSeason, displayTitle, FORMAT_LABEL, SEASON_LABEL, STATUS_LABEL } from '../lib/util';
import { toast } from '../components/Toasts';

type Mode = 'search' | 'import' | 'files';

export function AddPanel() {
  const [mode, setMode] = useState<Mode>('search');
  return (
    <div className="add-panel">
      <div className="seg full">
        <button className={mode === 'search' ? 'on' : ''} onClick={() => setMode('search')}>
          <Search /> Buscar
        </button>
        <button className={mode === 'import' ? 'on' : ''} onClick={() => setMode('import')}>
          <Users /> Importar
        </button>
        <button className={mode === 'files' ? 'on' : ''} onClick={() => setMode('files')}>
          <ImagePlus /> Imagens
        </button>
      </div>
      {mode === 'search' && <SearchTab />}
      {mode === 'import' && <ImportTab />}
      {mode === 'files' && <FilesTab />}
    </div>
  );
}

// ── Search ─────────────────────────────────────────────
const kindCache = new Map<string, Item[]>();

function SearchTab() {
  const [kind, setKind] = useState<SearchKind>('ANIME');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const items = useEditor((s) => s.list!.items);
  const have = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of Object.values(items)) m.set(itemKey(it), it.id);
    return m;
  }, [items]);

  useEffect(() => {
    const ctrl = new AbortController();
    const query = q.trim();
    const key = kind + '|' + query;
    if (kindCache.has(key)) {
      setResults(kindCache.get(key)!);
      setError('');
      return;
    }
    setLoading(true);
    const t = setTimeout(
      () => {
        (query ? alSearch(query, kind, ctrl.signal) : trending(kind, ctrl.signal))
          .then((r) => {
            kindCache.set(key, r);
            setResults(r);
            setError('');
          })
          .catch((e) => {
            if (e.name !== 'AbortError') setError(errMsg(e));
          })
          .finally(() => !ctrl.signal.aborted && setLoading(false));
      },
      query ? 380 : 0,
    );
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, kind]);

  return (
    <>
      <div className="seg full small">
        <button className={kind === 'ANIME' ? 'on' : ''} onClick={() => setKind('ANIME')}>
          <Film /> Anime
        </button>
        <button className={kind === 'MANGA' ? 'on' : ''} onClick={() => setKind('MANGA')}>
          <BookOpen /> Mangá
        </button>
        <button className={kind === 'CHARACTER' ? 'on' : ''} onClick={() => setKind('CHARACTER')}>
          <Heart /> Personagens
        </button>
      </div>
      <div className="input-wrap">
        {loading ? <Loader2 className="spin" /> : <Search />}
        <input className="input" placeholder={kind === 'CHARACTER' ? 'Nome do personagem…' : 'Título no AniList…'} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="add-hint">
        {q.trim() ? (
          <>Clique pra mandar pro pool — ou arraste direto pra uma tier.</>
        ) : (
          <>
            <TrendingUp size={14} /> Em alta agora · clique ou arraste pra uma tier
          </>
        )}
      </div>
      {error && <div className="add-error">{error}</div>}
      {results && !results.length && !loading && (
        <div className="empty">
          <Search />
          <b>Nada encontrado</b>
        </div>
      )}
      <div className="result-grid">
        {results?.map((it) => {
          const k = itemKey(it);
          return <ResultCard key={k} item={it} existing={have.get(k)} />;
        })}
      </div>
    </>
  );
}

const ResultCard = memo(function ResultCard({ item, existing }: { item: Item; existing?: string }) {
  const lang = useSettings((s) => s.titleLang);
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: 'new:' + itemKey(item), data: { type: 'new', item }, disabled: !!existing });
  const title = displayTitle(item, lang);
  const meta = item.kind === 'character' ? item.origin : [item.seasonYear ?? item.year, item.format && (FORMAT_LABEL[item.format] ?? item.format)].filter(Boolean).join(' · ');
  return (
    <div
      ref={setNodeRef}
      className={`result ${existing ? 'have' : ''}`}
      style={{ opacity: isDragging ? 0.4 : 1, '--cc': item.color } as React.CSSProperties}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (existing) revealItem(existing);
        else if (addToList([{ ...item }]) > 0) toast.ok(`"${title}" foi pro pool`, { duration: 1600 });
      }}
      title={existing ? 'Já está na lista — clique pra encontrar' : 'Adicionar ao pool'}
    >
      <div className="result-cover">
        <Cover src={item.img} alt={title} />
        <span className="result-badge">{existing ? <Check /> : <Plus />}</span>
      </div>
      <div className="result-title">{title}</div>
      {meta && <div className="result-meta">{meta}</div>}
    </div>
  );
});

// ── Import ─────────────────────────────────────────────
const ALL_STATUSES = ['COMPLETED', 'CURRENT', 'REPEATING', 'PAUSED', 'DROPPED', 'PLANNING'];

function ImportTab() {
  const remembered = useEditor((s) => s.list!.anilistUser);
  const lastUser = useSettings((s) => s.lastUser);
  const [user, setUser] = useState(remembered || lastUser);
  const [type, setType] = useState<'ANIME' | 'MANGA'>('ANIME');
  const [statuses, setStatuses] = useState<string[]>(['COMPLETED', 'CURRENT', 'REPEATING', 'PAUSED', 'DROPPED']);
  const [yearMode, setYearMode] = useState<'any' | 'release' | 'completed'>('any');
  const [year, setYear] = useState(new Date().getFullYear());
  const [skipSequels, setSkipSequels] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const cs = currentSeason();
  const [season, setSeason] = useState<Season>(cs.season);
  const [sYear, setSYear] = useState(cs.year);
  const [seqSeason, setSeqSeason] = useState(true);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };
  const needUser = () => {
    if (!user.trim()) {
      toast.warn('Digite seu usuário do AniList');
      return true;
    }
    useSettings.getState().set({ lastUser: user.trim() });
    return false;
  };

  return (
    <div className="import-stack">
      <section className="import-card">
        <header>
          <span className="ic" style={{ background: '#02a9ff' }}>
            <User />
          </span>
          <div>
            <b>Sua lista do AniList</b>
            <span>Anime ou mangá, com nota, status e progresso</span>
          </div>
        </header>
        <div className="input-wrap">
          <User />
          <input className="input" placeholder="usuário do AniList" value={user} onChange={(e) => setUser(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !needUser() && run('list', () => importUserList({ user, type, statuses, yearMode, year, skipSequels }))} />
        </div>
        <div className="seg full small">
          <button className={type === 'ANIME' ? 'on' : ''} onClick={() => setType('ANIME')}>
            Anime
          </button>
          <button className={type === 'MANGA' ? 'on' : ''} onClick={() => setType('MANGA')}>
            Mangá
          </button>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {ALL_STATUSES.map((s) => (
            <button key={s} className={`chip ${statuses.includes(s) ? 'on' : ''}`} onClick={() => setStatuses(statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s])}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="row">
          <select className="select" value={yearMode} onChange={(e) => setYearMode(e.target.value as typeof yearMode)}>
            <option value="any">Qualquer ano</option>
            <option value="release">Lançados em…</option>
            <option value="completed">Que terminei em…</option>
          </select>
          {yearMode !== 'any' && <input className="input" type="number" style={{ width: 96 }} value={year} min={1950} max={2100} onChange={(e) => setYear(Number(e.target.value))} />}
        </div>
        <label className="switch">
          Pular continuações (2ª temporada, parte 2…)
          <input type="checkbox" checked={skipSequels} onChange={(e) => setSkipSequels(e.target.checked)} />
          <span className="track" />
        </label>
        <button className="btn btn-primary" disabled={!!busy || !statuses.length} onClick={() => !needUser() && run('list', () => importUserList({ user, type, statuses, yearMode, year, skipSequels }))}>
          {busy === 'list' ? <Loader2 className="spin" /> : <Upload />} Importar lista
        </button>
      </section>

      <section className="import-card">
        <header>
          <span className="ic" style={{ background: 'linear-gradient(135deg,#ff9eb5,#ff6bd6)' }}>
            <CalendarDays />
          </span>
          <div>
            <b>Uma temporada inteira</b>
            <span>Todos os animes da season, por popularidade</span>
          </div>
        </header>
        <div className="row">
          <select className="select" value={season} onChange={(e) => setSeason(e.target.value as Season)}>
            {(['WINTER', 'SPRING', 'SUMMER', 'FALL'] as Season[]).map((s) => (
              <option key={s} value={s}>
                {SEASON_LABEL[s]}
              </option>
            ))}
          </select>
          <input className="input" type="number" style={{ width: 96 }} value={sYear} min={1960} max={2100} onChange={(e) => setSYear(Number(e.target.value))} />
        </div>
        <label className="switch">
          Incluir continuações
          <input type="checkbox" checked={seqSeason} onChange={(e) => setSeqSeason(e.target.checked)} />
          <span className="track" />
        </label>
        <button className="btn" disabled={!!busy} onClick={() => run('season', () => importSeason(season, sYear, seqSeason))}>
          {busy === 'season' ? <Loader2 className="spin" /> : <CalendarDays />} Importar {SEASON_LABEL[season].toLowerCase()} {sYear}
        </button>
      </section>

      <section className="import-card">
        <header>
          <span className="ic" style={{ background: 'linear-gradient(135deg,#ff4d6d,#c06bff)' }}>
            <Heart />
          </span>
          <div>
            <b>Personagens favoritos</b>
            <span>Os que você favoritou no AniList — perfeito pra Best Girls</span>
          </div>
        </header>
        <button className="btn" disabled={!!busy} onClick={() => !needUser() && run('fav', () => importFavourites(user))}>
          {busy === 'fav' ? <Loader2 className="spin" /> : <Heart />} Importar favoritos{user ? ` de ${user}` : ''}
        </button>
      </section>
    </div>
  );
}

// ── Files / URLs ───────────────────────────────────────
function FilesTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [urls, setUrls] = useState('');
  return (
    <div className="import-stack">
      <div
        className={`dropzone ${over ? 'on' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <ImagePlus />
        <b>Solte imagens aqui</b>
        <span>ou clique pra escolher · ficam salvas no navegador</span>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files).then(() => (e.target.value = ''))} />
      </div>
      <button className="btn" onClick={pasteImage}>
        <Clipboard /> Colar imagem <span className="kbd" style={{ marginLeft: 4 }}>Ctrl V</span>
      </button>
      <section className="import-card">
        <header>
          <span className="ic" style={{ background: 'linear-gradient(135deg,#36d6a0,#2ec5d3)' }}>
            <Link2 />
          </span>
          <div>
            <b>Por URL</b>
            <span>Uma por linha · pode usar “URL | Nome”</span>
          </div>
        </header>
        <textarea className="textarea" rows={5} placeholder={'https://site.com/capa.jpg | Nome\nhttps://…'} value={urls} onChange={(e) => setUrls(e.target.value)} />
        <button className="btn" disabled={!urls.trim()} onClick={() => addUrls(urls) && setUrls('')}>
          <Plus /> Adicionar URLs
        </button>
      </section>
    </div>
  );
}
