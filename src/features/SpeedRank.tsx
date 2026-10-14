import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CornerUpLeft, PartyPopper, Shuffle, Sparkles, Star, X, Zap } from 'lucide-react';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { useSettings } from '../store/settings';
import { Cover } from '../components/Cover';
import { poolView } from '../lib/poolView';
import { moveItems } from '../lib/ops';
import { coverAt } from '../lib/anilist';
import { resolvedImageSync } from '../lib/db';
import { displayTitle, FORMAT_LABEL, inkOn, plural, scoreColor, SEASON_LABEL, shuffle, STATUS_LABEL } from '../lib/util';
import type { TierList } from '../types';

type Order = 'view' | 'random' | 'popular' | 'score';
type Step = { id: string; placed: boolean };

/**
 * One item at a time, full screen: press a number to place it. Built for turning a
 * 500-entry AniList import into a ranked list in minutes.
 */
export default function SpeedRank() {
  const list = useEditor((s) => s.list!);
  const lang = useSettings((s) => s.titleLang);
  const [order, setOrder] = useState<Order>('view');
  const [queue, setQueue] = useState<string[]>(() => initialQueue('view'));
  const [pos, setPos] = useState(0);
  const [steps, setSteps] = useState<Step[]>([]);
  const [fly, setFly] = useState<{ id: string; tier: number } | null>(null);
  const [placed, setPlaced] = useState(0);
  const flyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function initialQueue(o: Order): string[] {
    const l = useEditor.getState().list!;
    const ui = useUI.getState();
    const s = useSettings.getState();
    const base = poolView(l, ui.search, ui.filters, s.poolSort, s.titleLang);
    if (o === 'random') return shuffle(base);
    if (o === 'popular') return [...base].sort((a, b) => (l.items[b].popularity ?? 0) - (l.items[a].popularity ?? 0));
    if (o === 'score') return [...base].sort((a, b) => (l.items[b].score ?? -1) - (l.items[a].score ?? -1));
    return base;
  }

  // Skip ids that left the pool by other means.
  const currentId = useMemo(() => {
    for (let i = pos; i < queue.length; i++) if (list.pool.includes(queue[i])) return queue[i];
    return null;
  }, [pos, queue, list.pool]);
  const currentPos = currentId ? queue.indexOf(currentId) : queue.length;
  const item = currentId ? list.items[currentId] : null;
  const nextIds = queue.slice(currentPos + 1, currentPos + 4).filter((id) => list.pool.includes(id));

  const suggestion = useMemo(() => suggest(list, item?.score ?? null), [list, item?.score]);

  const close = () => useUI.getState().openDialog(null);

  const place = (tierIndex: number) => {
    if (!currentId || fly) return;
    const tier = list.tiers[tierIndex];
    if (!tier || tier.locked) return;
    const id = currentId;
    setFly({ id, tier: tierIndex });
    flyTimer.current = setTimeout(() => {
      useEditor.getState().mutate(`"${displayTitle(list.items[id], lang)}" → ${tier.name}`, (d) => void moveItems(d, [id], tier.id));
      setSteps((s) => [...s, { id, placed: true }]);
      setPlaced((n) => n + 1);
      setPos(queue.indexOf(id) + 1);
      setFly(null);
    }, 230);
  };
  const skip = () => {
    if (!currentId || fly) return;
    setSteps((s) => [...s, { id: currentId, placed: false }]);
    setPos(currentPos + 1);
  };
  const back = () => {
    const last = steps[steps.length - 1];
    if (!last || fly) return;
    if (last.placed) {
      useEditor.getState().undo();
      setPlaced((n) => n - 1);
    }
    setSteps((s) => s.slice(0, -1));
    setPos(queue.indexOf(last.id));
  };
  const reorder = (o: Order) => {
    setOrder(o);
    setQueue(initialQueue(o));
    setPos(0);
    setSteps([]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          back();
        }
        return;
      }
      if (/^[1-9]$/.test(e.key)) place(Number(e.key) - 1);
      else if (e.key === ' ' || e.key === 'ArrowRight') skip();
      else if (e.key === 'Backspace' || e.key === 'ArrowLeft') back();
      else if (e.key === 'Enter' && suggestion != null) place(suggestion);
      else if (e.key === 'Escape') close();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  useEffect(() => () => clearTimeout(flyTimer.current), []);

  const total = queue.length;
  const done = Math.min(currentPos, total);
  const bg = item ? coverAt(resolvedImageSync(item.img) ?? '', 'large') : '';

  return createPortal(
    <div className="speed" role="dialog" aria-modal="true" aria-label="Rank rápido">
      <div className="speed-bg" style={{ backgroundImage: bg ? `url("${bg}")` : undefined, '--cc': item?.color } as CSSProperties} />
      <header className="speed-top">
        <span className="speed-title">
          <Zap /> Rank rápido
        </span>
        <div className="speed-progress">
          <i style={{ width: `${total ? (done / total) * 100 : 100}%` }} />
        </div>
        <span className="speed-count">
          {Math.min(done + 1, total)} / {total}
        </span>
        <select className="select speed-order" value={order} onChange={(e) => reorder(e.target.value as Order)} aria-label="Ordem">
          <option value="view">Ordem do pool</option>
          <option value="popular">Mais populares primeiro</option>
          <option value="score">Maiores notas primeiro</option>
          <option value="random">Aleatória</option>
        </select>
        <button className="btn btn-ghost btn-icon" onClick={close} aria-label="Fechar (Esc)">
          <X />
        </button>
      </header>

      {item ? (
        <main className="speed-stage">
          <div className="speed-queue" aria-hidden>
            {nextIds
              .slice()
              .reverse()
              .map((id, i) => (
                <div key={id} className="q-card" style={{ '--i': nextIds.length - 1 - i, '--cc': list.items[id].color } as CSSProperties}>
                  <Cover src={list.items[id].img} alt="" />
                </div>
              ))}
            <div key={item.id} className={`speed-card ${fly?.id === item.id ? 'fly' : ''}`} style={{ '--cc': item.color, '--to': fly ? fly.tier - (list.tiers.length - 1) / 2 : 0 } as CSSProperties}>
              <div className={`speed-cover ${item.spoiler ? 'spoiler' : ''}`}>
                <Cover src={item.img} alt={displayTitle(item, lang)} size="extraLarge" eager />
              </div>
            </div>
          </div>
          <div className="speed-info" key={'i' + item.id}>
            <div className="speed-kicker">
              {[item.format && (FORMAT_LABEL[item.format] ?? item.format), item.season && (item.seasonYear || item.year) ? `${SEASON_LABEL[item.season]} ${item.seasonYear ?? item.year}` : item.year, item.episodes && `${item.episodes} ep`, item.studio || item.origin]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <h2 className="speed-name">{displayTitle(item, lang)}</h2>
            {item.titleRomaji && item.titleRomaji !== displayTitle(item, lang) && <div className="speed-alt">{item.titleRomaji}</div>}
            <div className="speed-chips">
              {item.alScore != null && (
                <span className="chip">
                  <Star size={13} /> AniList <b style={{ color: scoreColor(item.alScore) }}>{item.alScore}</b>
                </span>
              )}
              {item.score != null && (
                <span className="chip">
                  Sua nota <b style={{ color: scoreColor(item.score) }}>{item.score}</b>
                </span>
              )}
              {item.listStatus && <span className="chip">{STATUS_LABEL[item.listStatus]}</span>}
              {item.genres?.slice(0, 4).map((g) => (
                <span key={g} className="chip">
                  {g}
                </span>
              ))}
            </div>
            {suggestion != null && list.tiers[suggestion] && (
              <button className="speed-suggest" onClick={() => place(suggestion)}>
                <Sparkles size={15} /> Sugestão pela sua nota:
                <span className="tier-chip" style={{ '--tc': list.tiers[suggestion].color, '--ink': inkOn(list.tiers[suggestion].color) } as CSSProperties}>
                  {list.tiers[suggestion].name}
                </span>
                <span className="kbd">Enter</span>
              </button>
            )}
          </div>
        </main>
      ) : (
        <main className="speed-done">
          <PartyPopper />
          <h2 className="display">{list.pool.length ? 'Fim da fila!' : 'Pool zerado!'}</h2>
          <p className="muted">
            {placed ? `Você ranqueou ${plural(placed, 'item', 'itens')} nessa rodada.` : 'Nada ranqueado nessa rodada.'}
            {list.pool.length ? ` Ainda ${list.pool.length === 1 ? 'resta 1 no pool' : `restam ${list.pool.length} no pool`} (os que você pulou).` : ''}
          </p>
          <div className="row">
            {list.pool.length > 0 && (
              <button className="btn" onClick={() => reorder(order)}>
                <Shuffle /> Rever os pulados
              </button>
            )}
            <button className="btn btn-primary" onClick={close}>
              Ver minha tier list <ArrowRight />
            </button>
          </div>
        </main>
      )}

      {item && (
        <footer className="speed-tiers">
          {list.tiers.map((t, i) => (
            <button
              key={t.id}
              className={`speed-tier ${fly?.tier === i ? 'hit' : ''} ${suggestion === i ? 'suggested' : ''}`}
              style={{ '--tc': t.color, '--ink': inkOn(t.color) } as CSSProperties}
              disabled={t.locked}
              onClick={() => place(i)}
            >
              {i < 9 && <span className="n">{i + 1}</span>}
              <span className="nm">{t.name}</span>
              <span className="ct">{t.items.length}</span>
            </button>
          ))}
          <div className="speed-aux">
            <button className="btn btn-sm" onClick={back} disabled={!steps.length}>
              <CornerUpLeft /> Voltar <span className="kbd">⌫</span>
            </button>
            <button className="btn btn-sm" onClick={skip}>
              Pular <span className="kbd">Espaço</span>
            </button>
          </div>
        </footer>
      )}
    </div>,
    document.body,
  );
}

/**
 * Suggests a tier from the item's score, using the average score of what's already in
 * each tier — so it adapts to however the user names and uses their tiers.
 */
function suggest(list: TierList, score: number | null): number | null {
  if (score == null) return null;
  const avgs = list.tiers.map((t) => {
    const s = t.items.map((id) => list.items[id]?.score).filter((x): x is number => x != null);
    return s.length >= 2 ? s.reduce((a, b) => a + b, 0) / s.length : null;
  });
  let best: number | null = null;
  let bestD = Infinity;
  avgs.forEach((a, i) => {
    if (a == null || list.tiers[i].locked) return;
    const d = Math.abs(a - score);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  if (best != null) return best;
  // No history yet: map score bands onto tier order.
  const n = list.tiers.length;
  if (!n) return null;
  const idx = Math.round(((100 - score) / 60) * (n - 1));
  return Math.max(0, Math.min(n - 1, idx));
}

