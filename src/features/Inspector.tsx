import { useEffect, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Copy, ExternalLink, Eye, EyeOff, Inbox, RotateCcw, Trash2, X, Users, Star, Tv, BookOpen, Clock, Building2, Sparkles } from 'lucide-react';
import { Dialog } from '../components/Overlay';
import { Cover } from '../components/Cover';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { useSettings } from '../store/settings';
import { anilistUrl, cleanDescription, coverAt, fetchDetail, type MediaDetail } from '../lib/anilist';
import * as A from '../lib/actions';
import { findContainer } from '../lib/ops';
import { poolView } from '../lib/poolView';
import { COUNTRY_LABEL, displayTitle, FORMAT_LABEL, inkOn, isTypingTarget, scoreBand, scoreColor, SEASON_LABEL, SOURCE_LABEL, STATUS_COLOR, STATUS_LABEL } from '../lib/util';
import { POOL } from '../types';
import { resolvedImageSync } from '../lib/db';

/** Items in display order around `id`: its tier, or the pool as currently sorted/filtered. */
function siblings(id: string): string[] {
  const l = useEditor.getState().list;
  if (!l) return [];
  const c = findContainer(l, id);
  if (c === POOL) {
    const ui = useUI.getState();
    const s = useSettings.getState();
    const view = poolView(l, ui.search, ui.filters, s.poolSort, s.titleLang);
    return view.includes(id) ? view : l.pool;
  }
  return l.tiers.find((t) => t.id === c)?.items ?? [];
}

export function Inspector() {
  const id = useUI((s) => s.inspectId);
  const item = useEditor((s) => (id ? s.list?.items[id] : undefined));
  const close = () => useUI.getState().inspect(null);
  useEffect(() => {
    if (id && !item) close();
  }, [id, item]);
  if (!id || !item) return null;
  return (
    <Dialog bare width={880} onClose={close} className="insp-dialog">
      <InspectorBody id={id} />
    </Dialog>
  );
}

function InspectorBody({ id }: { id: string }) {
  const item = useEditor((s) => s.list!.items[id]);
  const tiers = useEditor((s) => s.list!.tiers);
  const where = useEditor((s) => findContainer(s.list!, id));
  const readOnly = useEditor((s) => s.readOnly);
  const lang = useSettings((s) => s.titleLang);
  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [more, setMore] = useState(false);
  const [title, setTitle] = useState(displayTitle(item, lang));
  const [note, setNote] = useState(item.note ?? '');

  useEffect(() => {
    setTitle(displayTitle(item, lang));
    setNote(item.note ?? '');
    setDetail(null);
    setMore(false);
    let alive = true;
    fetchDetail(item).then((d) => alive && setDetail(d));
    return () => {
      alive = false;
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sib = siblings(id);
  const idx = sib.indexOf(id);
  const go = (d: number) => {
    const next = sib[idx + d];
    if (next) useUI.getState().inspect(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (/^[0-9]$/.test(e.key) && !readOnly) {
        const n = Number(e.key);
        const target = n === 0 ? POOL : useEditor.getState().list!.tiers[n - 1]?.id;
        if (target) A.moveTo([id], target);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const desc = cleanDescription(detail?.description);
  const ranking = detail?.rankings?.find((r) => r.allTime && r.type === 'RATED') ?? detail?.rankings?.find((r) => r.type === 'RATED');
  const popRank = detail?.rankings?.find((r) => r.allTime && r.type === 'POPULAR');
  const hours = item.duration && item.progress ? Math.round((item.duration * item.progress) / 60) : null;
  const banner = detail?.bannerImage;
  const color = item.color ?? '#8b7bff';
  const kindLabel = item.kind === 'anime' ? 'Anime' : item.kind === 'manga' ? 'Mangá' : item.kind === 'character' ? 'Personagem' : 'Item';

  const stats: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [];
  if (item.alScore) stats.push({ icon: <Star />, label: 'Nota AniList', value: <span style={{ color: scoreColor(item.alScore) }}>{item.alScore}%</span> });
  if (item.popularity) stats.push({ icon: <Users />, label: 'Popularidade', value: item.popularity.toLocaleString('pt-BR') });
  if (item.favourites && item.kind === 'character') stats.push({ icon: <Star />, label: 'Favoritos', value: item.favourites.toLocaleString('pt-BR') });
  if (item.episodes) stats.push({ icon: <Tv />, label: 'Episódios', value: `${item.episodes}${item.duration ? ` × ${item.duration}min` : ''}` });
  if (item.chapters) stats.push({ icon: <BookOpen />, label: 'Capítulos', value: item.chapters });
  if (item.studio) stats.push({ icon: <Building2 />, label: 'Estúdio', value: item.studio });
  if (item.source) stats.push({ icon: <Sparkles />, label: 'Origem', value: SOURCE_LABEL[item.source] ?? item.source });
  if (hours) stats.push({ icon: <Clock />, label: 'Tempo assistido', value: `${hours}h` });

  const scorePct = item.score ?? 0;

  return (
    <div className="insp" style={{ '--cc': color } as CSSProperties}>
      <div className="insp-backdrop" style={{ backgroundImage: `url("${banner || coverAt(resolvedImageSync(item.img) ?? '', 'large')}")` }} />
      <button className="btn btn-ghost btn-icon btn-sm insp-close" onClick={() => useUI.getState().inspect(null)} aria-label="Fechar">
        <X />
      </button>
      <div className="insp-art">
        <div className={`insp-cover ${item.spoiler ? 'spoiler' : ''}`}>
          <Cover src={item.img} alt={displayTitle(item, lang)} size="extraLarge" eager />
        </div>
        <div className="insp-nav">
          <button className="btn btn-sm btn-icon" disabled={idx <= 0} onClick={() => go(-1)} aria-label="Anterior">
            <ChevronLeft />
          </button>
          <span className="faint">{idx >= 0 ? `${idx + 1} / ${sib.length}` : ''}</span>
          <button className="btn btn-sm btn-icon" disabled={idx < 0 || idx >= sib.length - 1} onClick={() => go(1)} aria-label="Próximo">
            <ChevronRight />
          </button>
        </div>
        {!readOnly && (
          <div className="insp-art-actions">
            <button className="btn btn-sm" onClick={() => A.toggleSpoiler([id])}>
              {item.spoiler ? <Eye /> : <EyeOff />} {item.spoiler ? 'Revelar' : 'Spoiler'}
            </button>
            <button className="btn btn-sm btn-icon" data-tip="Duplicar" onClick={() => A.duplicateItem(id)}>
              <Copy />
            </button>
            <button className="btn btn-sm btn-icon btn-danger" data-tip="Excluir" onClick={() => A.deleteItems([id])}>
              <Trash2 />
            </button>
          </div>
        )}
      </div>

      <div className="insp-main">
        <div className="insp-kicker">
          <span className="pill">{kindLabel}</span>
          {item.format && <span>{FORMAT_LABEL[item.format] ?? item.format}</span>}
          {item.season && (item.seasonYear || item.year) ? (
            <span>
              {SEASON_LABEL[item.season]} {item.seasonYear ?? item.year}
            </span>
          ) : (
            item.year && <span>{item.year}</span>
          )}
          {item.country && item.country !== 'JP' && <span>{COUNTRY_LABEL[item.country] ?? item.country}</span>}
          {item.isAdult && <span className="pill adult">+18</span>}
        </div>

        <textarea
          className="insp-title"
          rows={1}
          value={title}
          readOnly={readOnly}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
          onChange={(e) => {
            setTitle(e.target.value);
            A.patchItem(id, { title: e.target.value, titleEdited: true }, 'Renomeou item', 'title:' + id);
          }}
          aria-label="Título"
        />
        <div className="insp-alt">
          {[item.titleRomaji, item.titleNative, item.origin].filter((t) => t && t !== title).map((t) => (
            <span key={t}>{t}</span>
          ))}
          {item.titleEdited && !readOnly && (
            <button
              className="link"
              onClick={() => {
                A.patchItem(id, { titleEdited: false, title: item.titleEnglish || item.titleRomaji || item.title }, 'Restaurou título');
                setTitle(displayTitle({ ...item, titleEdited: false }, lang));
              }}
            >
              <RotateCcw size={12} /> título original
            </button>
          )}
        </div>

        {!!item.genres?.length && (
          <div className="insp-genres">
            {item.genres.map((g) => (
              <span key={g} className="chip">
                {g}
              </span>
            ))}
          </div>
        )}

        {stats.length > 0 && (
          <div className="insp-stats">
            {stats.map((s) => (
              <div key={s.label} className="stat">
                {s.icon}
                <div>
                  <span className="k">{s.label}</span>
                  <span className="v">{s.value}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {(ranking || popRank || item.listStatus) && (
          <div className="insp-badges">
            {item.listStatus && (
              <span className="chip" style={{ borderColor: STATUS_COLOR[item.listStatus] + '66' }}>
                <span className="dot" style={{ background: STATUS_COLOR[item.listStatus] }} />
                {STATUS_LABEL[item.listStatus]}
                {item.progress ? ` · ${item.progress}${item.episodes ? '/' + item.episodes : ''} ${item.kind === 'manga' ? 'cap.' : 'ep.'}` : ''}
                {item.completedYear ? ` · ${item.completedYear}` : ''}
              </span>
            )}
            {ranking && (
              <span className="chip">
                ⭐ #{ranking.rank} mais bem avaliado{ranking.allTime ? ' de todos' : ranking.year ? ` de ${ranking.year}` : ''}
              </span>
            )}
            {popRank && <span className="chip">🔥 #{popRank.rank} mais popular de todos</span>}
          </div>
        )}

        {!readOnly && (
          <>
            <div className="insp-sec">
              <div className="insp-sec-h">
                <span className="label">Sua nota</span>
                {item.score != null && (
                  <button className="link" onClick={() => A.setScore([id], null)}>
                    remover
                  </button>
                )}
              </div>
              <div className="score-row">
                <div className="big-score" style={{ color: item.score != null ? scoreColor(item.score) : 'var(--text-3)' }}>
                  {item.score ?? '—'}
                </div>
                <div className="grow col" style={{ gap: 6 }}>
                  <input
                    className="range"
                    type="range"
                    min={0}
                    max={100}
                    value={scorePct}
                    style={{ '--p': `${scorePct}%`, '--accent': item.score != null ? scoreColor(item.score) : undefined } as CSSProperties}
                    onChange={(e) => A.setScore([id], Number(e.target.value))}
                    aria-label="Sua nota"
                  />
                  <span className="faint" style={{ fontSize: 12, fontWeight: 700 }}>
                    {item.score != null ? scoreBand(item.score).label : 'Arraste pra dar uma nota de 0 a 100'}
                    {item.listScore != null && item.listScore !== item.score ? ` · no AniList: ${item.listScore}` : ''}
                  </span>
                </div>
              </div>
            </div>

            <div className="insp-sec">
              <span className="label">Mover para</span>
              <div className="im-tiers">
                {tiers.map((t, i) => (
                  <button key={t.id} className={`tier-chip ${where === t.id ? 'here' : ''}`} style={{ '--tc': t.color, '--ink': inkOn(t.color) } as CSSProperties} onClick={() => A.moveTo([id], t.id)} title={i < 9 ? `Tecla ${i + 1}` : undefined}>
                    {t.name}
                  </button>
                ))}
                <button className={`tier-chip pool-chip ${where === POOL ? 'here' : ''}`} onClick={() => A.moveTo([id], POOL)} title="Tecla 0">
                  <Inbox size={14} /> Pool
                </button>
              </div>
            </div>

            <div className="insp-sec">
              <span className="label">Anotação</span>
              <textarea
                className="textarea"
                rows={2}
                placeholder="O que você achou? Ninguém vai ler (a não ser que você exporte)."
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  A.patchItem(id, { note: e.target.value || undefined }, 'Editou anotação', 'note:' + id);
                }}
              />
            </div>
          </>
        )}

        {desc.length > 0 && (
          <div className="insp-sec">
            <span className="label">Sinopse</span>
            <div className={`insp-desc ${more ? 'open' : ''}`}>
              {desc.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {desc.join(' ').length > 320 && (
              <button className="link" onClick={() => setMore(!more)}>
                {more ? 'mostrar menos' : 'ler mais'}
              </button>
            )}
          </div>
        )}

        {item.anilistId && (
          <a className="btn btn-sm insp-al" href={anilistUrl(item)} target="_blank" rel="noreferrer">
            <ExternalLink /> Ver no AniList
          </a>
        )}
      </div>
    </div>
  );
}
