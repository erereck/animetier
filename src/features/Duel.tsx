import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, CornerUpLeft, Swords, Trophy, X, Shuffle } from 'lucide-react';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { useSettings } from '../store/settings';
import { Cover } from '../components/Cover';
import { displayTitle, FORMAT_LABEL, inkOn, shuffle } from '../lib/util';
import { toast } from '../components/Toasts';

/** Binary-insertion sort driven by the user's choices. */
interface State {
  input: string[]; // items still to insert (input[0] is being inserted)
  sorted: string[]; // best → worst
  lo: number;
  hi: number;
  asked: number;
}

function start(ids: string[]): State {
  return { input: ids.slice(1), sorted: ids.slice(0, 1), lo: 0, hi: 1, asked: 0 };
}

function estimate(n: number) {
  let t = 0;
  for (let k = 1; k < n; k++) t += Math.ceil(Math.log2(k + 1));
  return t;
}

export default function Duel() {
  const tierId = useUI((s) => s.duelTierId);
  const tier = useEditor((s) => s.list?.tiers.find((t) => t.id === tierId));
  const items = useEditor((s) => s.list?.items);
  const lang = useSettings((s) => s.titleLang);
  const [st, setSt] = useState<State>(() => start(shuffle(tier?.items ?? [])));
  const [hist, setHist] = useState<State[]>([]);
  const [pick, setPick] = useState<'a' | 'b' | null>(null);
  const total = useMemo(() => estimate(tier?.items.length ?? 0), [tier?.items.length]);
  const close = () => useUI.getState().set({ duelTierId: null });

  const finished = st.input.length === 0;
  const a = st.input[0];
  const mid = Math.floor((st.lo + st.hi) / 2);
  const b = st.sorted[mid];

  const choose = (aWins: boolean) => {
    if (finished || pick) return;
    setPick(aWins ? 'a' : 'b');
    setTimeout(() => {
      setPick(null);
      setHist((h) => [...h, st]);
      setSt((s) => {
        let { lo, hi } = s;
        const m = Math.floor((lo + hi) / 2);
        if (aWins) hi = m;
        else lo = m + 1;
        if (lo >= hi) {
          const sorted = [...s.sorted];
          sorted.splice(lo, 0, s.input[0]);
          return { input: s.input.slice(1), sorted, lo: 0, hi: sorted.length, asked: s.asked + 1 };
        }
        return { ...s, lo, hi, asked: s.asked + 1 };
      });
    }, 180);
  };
  const undo = () => {
    const prev = hist[hist.length - 1];
    if (!prev) return;
    setHist((h) => h.slice(0, -1));
    setSt(prev);
  };
  const apply = () => {
    if (!tier) return;
    const order = st.sorted;
    useEditor.getState().mutate(`Duelo em "${tier.name}"`, (d) => {
      const t = d.tiers.find((x) => x.id === tier.id);
      if (!t) return;
      // Keep anything added meanwhile at the end.
      t.items = [...order.filter((id) => t.items.includes(id)), ...t.items.filter((id) => !order.includes(id))];
    });
    toast.ok(`"${tier.name}" ordenada por duelo`);
    close();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (finished && e.key === 'Enter') apply();
      else if (e.key === 'ArrowLeft' || e.key === '1') choose(true);
      else if (e.key === 'ArrowRight' || e.key === '2') choose(false);
      else if (e.key === 'Backspace' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z')) undo();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!tier || !items) return null;
  const card = (id: string, side: 'a' | 'b') => {
    const it = items[id];
    if (!it) return null;
    return (
      <button className={`duel-card ${pick === side ? 'win' : pick ? 'lose' : ''}`} onClick={() => choose(side === 'a')} style={{ '--cc': it.color } as CSSProperties}>
        <span className="duel-cover">
          <Cover src={it.img} alt={displayTitle(it, lang)} size="extraLarge" eager />
        </span>
        <span className="duel-name">{displayTitle(it, lang)}</span>
        <span className="duel-meta">{[it.format && (FORMAT_LABEL[it.format] ?? it.format), it.seasonYear ?? it.year].filter(Boolean).join(' · ')}</span>
        <span className="kbd">{side === 'a' ? '←' : '→'}</span>
      </button>
    );
  };

  return createPortal(
    <div className="duel" role="dialog" aria-modal="true" style={{ '--tc': tier.color, '--ink': inkOn(tier.color) } as CSSProperties}>
      <header className="speed-top">
        <span className="speed-title">
          <Swords /> Duelo · <span className="tier-chip" style={{ '--tc': tier.color, '--ink': inkOn(tier.color) } as CSSProperties}>{tier.name}</span>
        </span>
        <div className="speed-progress">
          <i style={{ width: `${finished ? 100 : Math.min(97, (st.asked / Math.max(1, total)) * 100)}%` }} />
        </div>
        <span className="speed-count">{finished ? 'pronto!' : `~${Math.max(1, total - st.asked)} escolhas`}</span>
        <button className="btn btn-ghost btn-icon" onClick={close} aria-label="Fechar">
          <X />
        </button>
      </header>
      {!finished ? (
        <main className="duel-stage">
          <h2 className="duel-q display">Qual é melhor?</h2>
          <div className="duel-pair" key={a + b}>
            {card(a, 'a')}
            <span className="duel-vs">VS</span>
            {card(b, 'b')}
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn btn-sm" onClick={undo} disabled={!hist.length}>
              <CornerUpLeft /> Voltar
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => (setSt(start(shuffle(tier.items))), setHist([]))}>
              <Shuffle /> Recomeçar
            </button>
          </div>
        </main>
      ) : (
        <main className="duel-result">
          <Trophy className="trophy" />
          <h2 className="display">Ordem definida</h2>
          <p className="muted">
            {st.asked} escolhas pra ordenar {tier.items.length} itens. Confere e aplica:
          </p>
          <ol className="duel-podium">
            {st.sorted.map((id, i) => (
              <li key={id} style={{ '--cc': items[id]?.color, animationDelay: `${Math.min(i, 20) * 25}ms` } as CSSProperties}>
                <span className="pos">{i + 1}</span>
                <span className="mini">
                  <Cover src={items[id]?.img ?? ''} alt="" />
                </span>
                <span className="nm">{items[id] ? displayTitle(items[id], lang) : ''}</span>
              </li>
            ))}
          </ol>
          <div className="row">
            <button className="btn" onClick={close}>
              Descartar
            </button>
            <button className="btn btn-primary" onClick={apply}>
              <Check /> Aplicar ordem <span className="kbd">Enter</span>
            </button>
          </div>
        </main>
      )}
    </div>,
    document.body,
  );
}
