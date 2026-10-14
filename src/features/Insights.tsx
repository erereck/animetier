import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Sparkles, X, Heart, ThumbsDown, Clock3 } from 'lucide-react';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { useSettings } from '../store/settings';
import { computeInsights, type Group, type Insights as Data, type Ranked } from '../lib/insights';
import { Cover } from '../components/Cover';
import { linkUnmatched, refreshMetadata } from '../lib/actions';
import { displayTitle, FORMAT_LABEL, inkOn, SEASON_LABEL, SOURCE_LABEL, STATUS_LABEL } from '../lib/util';

// ── Tooltip ────────────────────────────────────────────
type Tip = { x: number; y: number; value: string; label: string; sub?: string } | null;
let setTipGlobal: (t: Tip) => void = () => {};
const showTip = (e: { clientX: number; clientY: number }, value: string, label: string, sub?: string) => setTipGlobal({ x: e.clientX, y: e.clientY, value, label, sub });
const hideTip = () => setTipGlobal(null);

function TipLayer() {
  const [tip, setTip] = useState<Tip>(null);
  setTipGlobal = setTip;
  if (!tip) return null;
  const left = Math.min(tip.x + 14, window.innerWidth - 240);
  const top = tip.y + 16 > window.innerHeight - 80 ? tip.y - 70 : tip.y + 16;
  return (
    <div className="viz-tip" style={{ left, top }}>
      <b>{tip.value}</b>
      <span>{tip.label}</span>
      {tip.sub && <span className="faint">{tip.sub}</span>}
    </div>
  );
}

export default function Insights() {
  const list = useEditor((s) => s.list!);
  const lang = useSettings((s) => s.titleLang);
  const d = useMemo(() => computeInsights(list), [list]);
  const close = () => useUI.getState().set({ insights: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const pctRanked = d.total ? Math.round((d.ranked.length / d.total) * 100) : 0;
  const meta = d.total ? d.withMeta / d.total : 0;

  return createPortal(
    <div className="insights" role="dialog" aria-modal="true" aria-label="Insights">
      <header className="ins-top">
        <span className="speed-title">
          <Sparkles /> Insights
        </span>
        <span className="faint ins-sub">{list.title}</span>
        <span className="grow" />
        <button className="btn btn-ghost btn-icon" onClick={close} aria-label="Fechar">
          <X />
        </button>
      </header>
      <div className="ins-scroll">
        <div className="ins-wrap">
          {meta < 0.5 && d.total > 0 && (
            <div className="ins-note">
              <span>Só {Math.round(meta * 100)}% dos itens têm dados do AniList — muita coisa abaixo fica vazia.</span>
              <button className="btn btn-sm" onClick={() => (close(), linkUnmatched())}>
                Vincular ao AniList
              </button>
            </div>
          )}

          {d.persona && (
            <section className="persona">
              <div className="persona-art" aria-hidden>
                {d.ranked.slice(0, 7).map((r, i) => (
                  <span key={r.item.id} style={{ '--i': i, '--cc': r.item.color } as CSSProperties}>
                    <Cover src={r.item.img} alt="" size="large" />
                  </span>
                ))}
              </div>
              <div className="persona-copy">
                <span className="eyebrow">Seu perfil de gosto</span>
                <h2 className="display">{d.persona.title}</h2>
                <ul>
                  {d.persona.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          <section className="kpis">
            <Kpi label="Itens na lista" value={d.total.toLocaleString('pt-BR')} sub={`${pctRanked}% ranqueados`} />
            {d.hours > 0 && <Kpi label="Tempo assistido" value={d.hours >= 48 ? `${Math.round(d.hours / 24)} dias` : `${Math.round(d.hours)} h`} sub={`${Math.round(d.hours).toLocaleString('pt-BR')} h · ${d.episodes.toLocaleString('pt-BR')} episódios`} />}
            {d.rho != null && <Kpi label="Concordância com o AniList" value={`${Math.round(Math.max(0, d.rho) * 100)}%`} sub={`correlação de postos em ${d.rhoN} itens`} />}
            {d.avgScore != null && <Kpi label="Sua nota média" value={d.avgScore.toFixed(0)} sub={`${d.scored} itens com nota`} />}
            {d.goldenYear && <Kpi label="Ano de ouro" value={String(d.goldenYear.year)} sub={`${d.goldenYear.n} itens ranqueados`} />}
          </section>

          <div className="ins-grid">
            <Card title="Quantos itens em cada tier" wide>
              <TierBars d={d} />
            </Card>

            {d.tiers.some((t) => t.alValues.length) && (
              <Card title="Você vs. a comunidade" sub="Cada ponto é um item, posicionado pela nota média do AniList. Tiers altas com pontos à esquerda = gosto seu, não da maioria." wide>
                <Strip d={d} />
              </Card>
            )}

            {(d.loves.length > 0 || d.hates.length > 0) && (
              <>
                <Card title="Você ama, o mundo nem tanto" icon={<Heart />}>
                  <Hot rows={d.loves} lang={lang} list={list} />
                </Card>
                <Card title="O mundo ama, você não" icon={<ThumbsDown />}>
                  <Hot rows={d.hates} lang={lang} list={list} />
                </Card>
              </>
            )}

            {d.genres.length > 2 && (
              <Card title="Gêneros: a favor e contra" sub="Quanto cada gênero fica acima ou abaixo da sua média de tier (mín. 5 itens).">
                <Diverging rows={d.genres} />
              </Card>
            )}
            {d.studios.length > 2 && (
              <Card title="Estúdios: a favor e contra" sub="Mesma lógica, estúdios com 3+ itens ranqueados.">
                <Diverging rows={[...d.studios.slice(0, 6), ...d.studios.slice(6).slice(-6)]} />
              </Card>
            )}

            {d.years.length > 2 && (
              <Card title="Por ano de lançamento" wide>
                <Columns years={d.years} />
              </Card>
            )}

            {d.statuses.length > 0 && (
              <Card title="Status no AniList" wide>
                <Stack rows={d.statuses} />
              </Card>
            )}
            {d.formats.length > 0 && (
              <Card title="Formatos">
                <Bars rows={d.formats.map((x) => ({ label: FORMAT_LABEL[x.key] ?? x.key, n: x.n }))} />
              </Card>
            )}
            {d.sources.length > 0 && (
              <Card title="De onde vieram">
                <Bars rows={d.sources.slice(0, 8).map((x) => ({ label: SOURCE_LABEL[x.key] ?? x.key, n: x.n }))} />
              </Card>
            )}
            {d.seasons.length > 0 && (
              <Card title="Temporada de estreia">
                <Bars rows={['WINTER', 'SPRING', 'SUMMER', 'FALL'].map((k) => ({ label: SEASON_LABEL[k], n: d.seasons.find((s) => s.key === k)?.n ?? 0 }))} />
              </Card>
            )}
            {d.marathons.length > 0 && (
              <Card title="Maratonas" icon={<Clock3 />}>
                <div className="hot">
                  {d.marathons.map((m, i) => (
                    <div key={m.item.id} className="hot-row" onClick={() => (close(), useUI.getState().inspect(m.item.id))}>
                      <span className="hot-pos">{i + 1}</span>
                      <span className="hot-thumb" style={{ '--cc': m.item.color } as CSSProperties}>
                        <Cover src={m.item.img} alt="" />
                      </span>
                      <span className="grow hot-name">{displayTitle(m.item, lang)}</span>
                      <b className="hot-val">{Math.round(m.hours)} h</b>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {d.withMeta > 0 && (
            <div className="ins-foot">
              <button className="btn btn-sm btn-ghost" onClick={refreshMetadata}>
                <RefreshCw /> Atualizar dados do AniList
              </button>
              <span className="faint">“Afinidade” = posição na sua tier list: a tier mais alta com itens vale 100, a mais baixa vale 0.</span>
            </div>
          )}
        </div>
      </div>
      <TipLayer />
    </div>,
    document.body,
  );
}

function Card({ title, sub, icon, wide, children }: { title: string; sub?: string; icon?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`ins-card ${wide ? 'wide' : ''}`}>
      <header>
        <h3>
          {icon}
          {title}
        </h3>
        {sub && <p>{sub}</p>}
      </header>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

// ── Charts ─────────────────────────────────────────────
function TierBars({ d }: { d: Data }) {
  const max = Math.max(1, ...d.tiers.map((t) => t.count));
  return (
    <div className="hbars">
      {d.tiers.map((t) => (
        <div
          key={t.id}
          className="hbar-row"
          onPointerMove={(e) => showTip(e, `${t.count} itens`, t.name, t.alAvg != null ? `nota média no AniList: ${t.alAvg.toFixed(0)}` : undefined)}
          onPointerLeave={hideTip}
        >
          <span className="hbar-label">
            <i className="key" style={{ background: t.color }} />
            {t.name}
          </span>
          <span className="hbar-track">
            <span className="hbar" style={{ width: `${(t.count / max) * 100}%`, background: t.color }} />
            <span className="hbar-val">{t.count}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Bars({ rows }: { rows: { label: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.label} className="hbar-row" onPointerMove={(e) => showTip(e, r.n.toLocaleString('pt-BR'), r.label)} onPointerLeave={hideTip}>
          <span className="hbar-label">{r.label}</span>
          <span className="hbar-track">
            <span className="hbar single" style={{ width: `${(r.n / max) * 100}%` }} />
            <span className="hbar-val">{r.n}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Diverging({ rows }: { rows: Group[] }) {
  const max = Math.max(5, ...rows.map((r) => Math.abs(r.delta)));
  return (
    <div className="dbars">
      {rows.map((r) => {
        const w = (Math.abs(r.delta) / max) * 40;
        const pos = r.delta >= 0;
        return (
          <div key={r.key} className="dbar-row" onPointerMove={(e) => showTip(e, `${pos ? '+' : ''}${r.delta.toFixed(1)}`, r.label, `afinidade ${r.aff.toFixed(0)} · ${r.n} itens`)} onPointerLeave={hideTip}>
            <span className="hbar-label">
              {r.label} <span className="faint">{r.n}</span>
            </span>
            <span className="dbar-track">
              <span className="mid" />
              <span className={`dbar ${pos ? 'pos' : 'neg'}`} style={pos ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} />
              <span className="dbar-val" style={pos ? { left: `calc(50% + ${w}% + 6px)` } : { right: `calc(50% + ${w}% + 6px)` }}>
                {pos ? '+' : '−'}
                {Math.abs(Math.round(r.delta))}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Strip({ d }: { d: Data }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const rows = d.tiers.filter((t) => t.alValues.length);
  const all = rows.flatMap((t) => t.alValues.map((x) => x.v));
  const lo = Math.max(0, Math.floor((Math.min(...all) - 2) / 10) * 10);
  const hi = Math.min(100, Math.ceil((Math.max(...all) + 2) / 10) * 10);
  const labelW = Math.min(150, w * 0.28);
  const rowH = 34;
  const pad = 12;
  const plotW = Math.max(100, w - labelW - pad * 2);
  const x = (v: number) => labelW + pad + ((v - lo) / (hi - lo)) * plotW;
  const H = rows.length * rowH + 26;
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 10) ticks.push(t);
  const lang = useSettings((s) => s.titleLang);

  const onMove = (e: React.PointerEvent<SVGRectElement>, ri: number) => {
    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - box.left;
    const t = rows[ri];
    let best = t.alValues[0];
    let bd = Infinity;
    for (const v of t.alValues) {
      const dd = Math.abs(x(v.v) - px);
      if (dd < bd) {
        bd = dd;
        best = v;
      }
    }
    if (bd > 26) return hideTip();
    showTip(e, `${best.v}`, displayTitle(best.item, lang), `${t.name} · nota AniList`);
  };

  return (
    <div ref={ref} className="strip">
      <svg width={w} height={H} role="img" aria-label="Nota no AniList dos itens de cada tier">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={0} y2={rows.length * rowH} className="grid" />
            <text x={x(t)} y={rows.length * rowH + 18} className="tick" textAnchor="middle">
              {t}
            </text>
          </g>
        ))}
        {rows.map((t, ri) => {
          const cy = ri * rowH + rowH / 2;
          const vals = t.alValues.map((v) => v.v).sort((a, b) => a - b);
          const med = vals[Math.floor(vals.length / 2)];
          return (
            <g key={t.id}>
              <text x={0} y={cy + 4} className="rowlabel">
                {t.name.length > 18 ? t.name.slice(0, 17) + '…' : t.name}
              </text>
              {t.alValues.map((v, i) => (
                <circle key={i} cx={x(v.v)} cy={cy + (((i * 37) % 9) - 4)} r={4.5} fill={t.color} className="dot" />
              ))}
              <line x1={x(med)} x2={x(med)} y1={cy - 12} y2={cy + 12} className="median" />
              <rect x={labelW} y={ri * rowH} width={plotW + pad * 2} height={rowH} fill="transparent" onPointerMove={(e) => onMove(e, ri)} onPointerLeave={hideTip} />
            </g>
          );
        })}
      </svg>
      <div className="strip-legend">
        <span>
          <i className="dotkey" /> item
        </span>
        <span>
          <i className="medkey" /> mediana da tier
        </span>
        <span className="faint">eixo: nota média no AniList</span>
      </div>
    </div>
  );
}

function Columns({ years }: { years: Data['years'] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const H = 180;
  const base = H - 24;
  const max = Math.max(1, ...years.map((y) => y.n));
  const slot = w / years.length;
  const bw = Math.max(2, Math.min(24, slot - 2));
  const every = Math.ceil(years.length / Math.max(1, Math.floor(w / 46)));
  const niceMax = Math.ceil(max / 5) * 5;
  const gridVals = [0, Math.round(niceMax / 2), niceMax];
  return (
    <div ref={ref} className="cols">
      <svg width={w} height={H} role="img" aria-label="Itens por ano de lançamento">
        {gridVals.map((g) => {
          const y = base - (g / niceMax) * (base - 10);
          return (
            <g key={g}>
              <line x1={0} x2={w} y1={y} y2={y} className={g === 0 ? 'axis' : 'grid'} />
              {g > 0 && (
                <text x={0} y={y - 4} className="tick">
                  {g}
                </text>
              )}
            </g>
          );
        })}
        {years.map((y, i) => {
          const h = (y.n / niceMax) * (base - 10);
          const cx = i * slot + slot / 2;
          return (
            <g key={y.year} onPointerMove={(e) => showTip(e, `${y.n} itens`, String(y.year), y.aff != null ? `afinidade média ${y.aff.toFixed(0)}` : 'nada ranqueado') } onPointerLeave={hideTip}>
              <rect x={i * slot} y={0} width={slot} height={base} fill="transparent" />
              {y.n > 0 && <path d={colPath(cx - bw / 2, base - h, bw, h)} className="col" />}
              {i % every === 0 && (
                <text x={cx} y={H - 6} className="tick" textAnchor="middle">
                  {y.year}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Column with 4px rounded top, square at the baseline. */
function colPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

const STATUS_ORDER = ['COMPLETED', 'CURRENT', 'REPEATING', 'PAUSED', 'DROPPED', 'PLANNING'];
function Stack({ rows }: { rows: { key: string; n: number }[] }) {
  const total = rows.reduce((a, b) => a + b.n, 0);
  const ordered = STATUS_ORDER.map((k, i) => ({ key: k, slot: i + 1, n: rows.find((r) => r.key === k)?.n ?? 0 })).filter((r) => r.n > 0);
  return (
    <div className="stack-viz">
      <div className="stack-bar">
        {ordered.map((r) => (
          <span key={r.key} className="seg" style={{ flex: r.n, background: `var(--viz-${r.slot})` }} onPointerMove={(e) => showTip(e, `${r.n} (${Math.round((r.n / total) * 100)}%)`, STATUS_LABEL[r.key])} onPointerLeave={hideTip} />
        ))}
      </div>
      <div className="legend">
        {ordered.map((r) => (
          <span key={r.key}>
            <i style={{ background: `var(--viz-${r.slot})` }} />
            {STATUS_LABEL[r.key]} <b>{r.n}</b> <span className="faint">{Math.round((r.n / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Hot({ rows, lang, list }: { rows: Ranked[]; lang: ReturnType<typeof useSettings.getState>['titleLang']; list: ReturnType<typeof useEditor.getState>['list'] }) {
  if (!rows.length) return <p className="hint">Nada polêmico por aqui — você e a comunidade estão em paz.</p>;
  return (
    <div className="hot">
      {rows.map((r) => {
        const t = list!.tiers.find((x) => x.id === r.tierId)!;
        return (
          <div key={r.item.id} className="hot-row" onClick={() => (useUI.getState().set({ insights: false }), useUI.getState().inspect(r.item.id))}>
            <span className="hot-thumb" style={{ '--cc': r.item.color } as CSSProperties}>
              <Cover src={r.item.img} alt="" />
            </span>
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="hot-name">{displayTitle(r.item, lang)}</span>
              <span className="hot-meta">
                <span className="tier-chip sm" style={{ '--tc': t.color, '--ink': inkOn(t.color) } as CSSProperties}>
                  {t.name}
                </span>
                <span className="faint">AniList {r.item.alScore}</span>
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
