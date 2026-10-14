import { useState, type CSSProperties } from 'react';
import { CalendarDays, Heart, Loader2, Sparkles, User, FilePlus2 } from 'lucide-react';
import type { Item, Season, TierList } from '../types';
import { Dialog } from '../components/Overlay';
import { TEMPLATES, tiersFromTemplate } from '../lib/presets';
import { db } from '../lib/db';
import { addItems } from '../lib/ops';
import { fetchFavouriteCharacters, fetchSeason } from '../lib/anilist';
import { errMsg, fetchUserImport } from '../lib/actions';
import { currentSeason, SEASON_LABEL, uid, plural } from '../lib/util';
import { useSettings } from '../store/settings';
import { useEditor } from '../store/editor';
import { go } from '../lib/router';
import { toast } from '../components/Toasts';

type Source = 'empty' | 'anilist' | 'season' | 'favs';

export async function createList(opts: { title: string; template: string; items?: Item[]; anilistUser?: string }): Promise<TierList> {
  const now = Date.now();
  const list: TierList = { id: uid('l'), title: opts.title, createdAt: now, updatedAt: now, tiers: tiersFromTemplate(opts.template), pool: [], items: {}, anilistUser: opts.anilistUser };
  if (opts.items?.length) addItems(list, opts.items);
  await db.putList(list);
  useEditor.getState().open(list);
  go('l/' + list.id);
  return list;
}

export function NewListDialog({ onClose, initial = 'anilist' }: { onClose: () => void; initial?: Source }) {
  const s = useSettings();
  const cs = currentSeason();
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState('classic');
  const [source, setSource] = useState<Source>(initial);
  const [user, setUser] = useState(s.lastUser);
  const [type, setType] = useState<'ANIME' | 'MANGA'>('ANIME');
  const [planning, setPlanning] = useState(false);
  const [yearMode, setYearMode] = useState<'any' | 'release' | 'completed'>('any');
  const [year, setYear] = useState(new Date().getFullYear());
  const [season, setSeason] = useState<Season>(cs.season);
  const [sYear, setSYear] = useState(cs.year);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const defaultTitle = () => {
    if (source === 'anilist') return `${type === 'MANGA' ? 'Mangás' : 'Animes'} de ${user.trim() || 'alguém'}${yearMode !== 'any' ? ` · ${year}` : ''}`;
    if (source === 'season') return `${SEASON_LABEL[season]} ${sYear}`;
    if (source === 'favs') return `Personagens de ${user.trim() || 'alguém'}`;
    return 'Minha tier list';
  };

  const create = async () => {
    setError('');
    if ((source === 'anilist' || source === 'favs') && !user.trim()) {
      setError('Digite seu usuário do AniList.');
      return;
    }
    setBusy(true);
    try {
      let items: Item[] = [];
      let anilistUser: string | undefined;
      if (source === 'anilist') {
        const statuses = ['COMPLETED', 'CURRENT', 'REPEATING', 'PAUSED', 'DROPPED', ...(planning ? ['PLANNING'] : [])];
        const r = await fetchUserImport({ user, type, statuses, yearMode, year });
        items = r.items;
        anilistUser = r.userName;
        if (!items.length) throw new Error('Nenhum item com esses filtros.');
      } else if (source === 'season') {
        items = await fetchSeason(season, sYear, { includeSequels: true, formats: ['TV', 'TV_SHORT', 'ONA', 'MOVIE'] });
      } else if (source === 'favs') {
        items = await fetchFavouriteCharacters(user.trim());
        anilistUser = user.trim();
        if (!items.length) throw new Error('Esse usuário não tem personagens favoritos.');
      }
      if (user.trim()) s.set({ lastUser: user.trim() });
      await createList({ title: title.trim() || defaultTitle(), template: source === 'favs' && template === 'classic' ? 'waifus' : template, items, anilistUser });
      onClose();
      if (items.length) toast.ok(`${plural(items.length, 'item pronto', 'itens prontos')} pra ranquear — experimente o Rank rápido (R)`, { duration: 5000 });
    } catch (e) {
      setError((e as Error).message && !(e as Error).message.startsWith('Algo') ? (e as Error).message : errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Nova tier list"
      sub="Escolha um modelo e de onde vêm os itens. Dá pra mudar tudo depois."
      width={640}
      onClose={onClose}
      footer={
        <>
          {error && <span className="form-error">{error}</span>}
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={create} disabled={busy}>
            {busy ? <Loader2 className="spin" /> : <Sparkles />} {busy ? 'Buscando…' : 'Criar lista'}
          </button>
        </>
      }
    >
      <div className="field">
        <span className="label">Nome</span>
        <input className="input" value={title} placeholder={defaultTitle()} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
      </div>

      <div className="field">
        <span className="label">Começar com</span>
        <div className="source-grid">
          {(
            [
              ['anilist', <User key="u" />, 'Minha lista do AniList', 'Tudo que você já viu'],
              ['season', <CalendarDays key="c" />, 'Uma temporada', 'Pra rankear a season'],
              ['favs', <Heart key="h" />, 'Personagens favoritos', 'Best girls, vilões…'],
              ['empty', <FilePlus2 key="f" />, 'Lista vazia', 'Adiciono depois'],
            ] as [Source, React.ReactNode, string, string][]
          ).map(([k, icon, t, d]) => (
            <button key={k} className={`source ${source === k ? 'on' : ''}`} onClick={() => setSource(k)}>
              {icon}
              <b>{t}</b>
              <span>{d}</span>
            </button>
          ))}
        </div>
      </div>

      {(source === 'anilist' || source === 'favs') && (
        <div className="source-opts">
          <div className="input-wrap">
            <User />
            <input className="input" placeholder="seu usuário do AniList" value={user} onChange={(e) => setUser(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} autoFocus />
          </div>
          {source === 'anilist' && (
            <>
              <div className="row wrap">
                <div className="seg small">
                  <button className={type === 'ANIME' ? 'on' : ''} onClick={() => setType('ANIME')}>
                    Anime
                  </button>
                  <button className={type === 'MANGA' ? 'on' : ''} onClick={() => setType('MANGA')}>
                    Mangá
                  </button>
                </div>
                <select className="select" style={{ width: 'auto', height: 36 }} value={yearMode} onChange={(e) => setYearMode(e.target.value as typeof yearMode)}>
                  <option value="any">De todos os anos</option>
                  <option value="release">Lançados em…</option>
                  <option value="completed">Que terminei em…</option>
                </select>
                {yearMode !== 'any' && <input className="input" type="number" style={{ width: 90, height: 36 }} value={year} onChange={(e) => setYear(Number(e.target.value))} />}
              </div>
              <label className="switch">
                Incluir os que estão em “Planejo ver”
                <input type="checkbox" checked={planning} onChange={(e) => setPlanning(e.target.checked)} />
                <span className="track" />
              </label>
            </>
          )}
        </div>
      )}
      {source === 'season' && (
        <div className="source-opts row">
          <select className="select" value={season} onChange={(e) => setSeason(e.target.value as Season)}>
            {(['WINTER', 'SPRING', 'SUMMER', 'FALL'] as Season[]).map((x) => (
              <option key={x} value={x}>
                {SEASON_LABEL[x]}
              </option>
            ))}
          </select>
          <input className="input" type="number" style={{ width: 110 }} value={sYear} onChange={(e) => setSYear(Number(e.target.value))} />
        </div>
      )}

      <div className="field">
        <span className="label">Modelo de tiers</span>
        <div className="template-grid">
          {TEMPLATES.map((t) => (
            <button key={t.id} className={`template ${template === t.id ? 'on' : ''}`} onClick={() => setTemplate(t.id)} title={t.blurb}>
              <span className="stripes">
                {t.tiers.map(([n, c]) => (
                  <i key={n} style={{ '--c': c } as CSSProperties} />
                ))}
              </span>
              <b>
                {t.emoji} {t.name}
              </b>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
