import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Check, Copy, Download, Image as ImageIcon, Link2, Loader2, Share2, Wand2, Scissors, History, Keyboard, Palette as PaletteIcon, RotateCcw, ExternalLink } from 'lucide-react';
import { Dialog } from '../components/Overlay';
import { Cover } from '../components/Cover';
import { ViewMenu } from '../components/ViewMenu';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { useSettings } from '../store/settings';
import { preloadCovers, renderTierList, type RenderOpts } from '../lib/renderImage';
import { encodeShare } from '../lib/share';
import { GROUPINGS, scoreThresholds } from '../lib/presets';
import * as ops from '../lib/ops';
import { displayTitle, download, plural, safeFilename, timeAgo } from '../lib/util';
import { toast } from '../components/Toasts';

export default function Dialogs() {
  const d = useUI((s) => s.dialog);
  const close = () => useUI.getState().openDialog(null);
  switch (d) {
    case 'export':
      return <ExportDialog onClose={close} />;
    case 'share':
      return <ShareDialog onClose={close} />;
    case 'help':
      return <HelpDialog onClose={close} />;
    case 'history':
      return <HistoryDialog onClose={close} />;
    case 'organize':
      return <OrganizeDialog onClose={close} />;
    case 'sequels':
      return <SequelsDialog onClose={close} />;
    case 'theme':
      return (
        <Dialog title="Tema e aparência" icon={<PaletteIcon className="dlg-icon" />} width={400} onClose={close}>
          <div style={{ margin: '-14px -22px -20px' }}>
            <ViewMenu />
          </div>
        </Dialog>
      );
    default:
      return null;
  }
}

// ── Export image ───────────────────────────────────────
function ExportDialog({ onClose }: { onClose: () => void }) {
  const list = useEditor((s) => s.list!);
  const lang = useSettings((s) => s.titleLang);
  const [o, setO] = useState<Omit<RenderOpts, 'lang' | 'scale'>>(() => {
    try {
      return { ...defaults(), ...JSON.parse(localStorage.getItem('animetier:export') || '{}') };
    } catch {
      return defaults();
    }
  });
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState(false);
  const gen = useRef(0);
  // Re-render the preview as covers arrive, in steps, so it fills in progressively.
  const step = progress ? Math.floor(progress[0] / 30) : -1;

  useEffect(() => {
    preloadCovers(list, o.pool, 'medium', (d, n) => setProgress(d >= n ? null : [d, n]));
  }, [list, o.pool]);

  useEffect(() => {
    localStorage.setItem('animetier:export', JSON.stringify(o));
    const my = ++gen.current;
    const t = setTimeout(async () => {
      const c = await renderTierList(list, { ...o, lang, scale: 1 }, 'medium');
      if (my !== gen.current) return;
      c.toBlob((b) => {
        if (!b || my !== gen.current) return;
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(b);
        });
      }, 'image/png');
    }, 120);
    return () => clearTimeout(t);
  }, [o, list, lang, step]);

  const final = async (): Promise<Blob | null> => {
    await preloadCovers(list, o.pool, 'large', (d, n) => setProgress(d >= n ? null : [d, n]));
    const c = await renderTierList(list, { ...o, lang, scale: 2 }, 'large');
    return new Promise((r) => c.toBlob(r, 'image/png'));
  };
  const save = async () => {
    setBusy(true);
    const b = await final();
    setBusy(false);
    if (b) {
      download(`${safeFilename(list.title)}.png`, b);
      toast.ok('Imagem baixada');
    }
  };
  const copy = async () => {
    setBusy(true);
    try {
      const b = await final();
      if (b) await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
      toast.ok('Imagem copiada — é só colar no Discord/Twitter');
    } catch {
      toast.err('O navegador não deixou copiar a imagem. Use Baixar.');
    } finally {
      setBusy(false);
    }
  };
  const set = (p: Partial<typeof o>) => setO((x) => ({ ...x, ...p }));

  return (
    <Dialog
      title="Exportar imagem"
      sub="PNG em alta resolução, pronto pra postar."
      icon={<ImageIcon className="dlg-icon" />}
      width={1040}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Fechar
          </button>
          <button className="btn" onClick={copy} disabled={busy}>
            <Copy /> Copiar
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="spin" /> : <Download />} Baixar PNG
          </button>
        </>
      }
    >
      <div className="export">
        <div className="export-preview">
          {preview ? <img src={preview} alt="Prévia" /> : <div className="spinner" />}
          {progress && (
            <div className="export-progress">
              <Loader2 className="spin" size={14} /> Carregando capas {progress[0]}/{progress[1]}
            </div>
          )}
        </div>
        <div className="export-opts">
          <div className="field">
            <span className="label">Largura</span>
            <div className="seg full small">
              {[
                [960, 'Compacta'],
                [1280, 'Média'],
                [1800, 'Larga'],
              ].map(([w, l]) => (
                <button key={w} className={o.width === w ? 'on' : ''} onClick={() => set({ width: w as number })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label">Tamanho das capas · {o.cell}px</span>
            <input className="range" type="range" min={48} max={140} step={4} value={o.cell} style={{ '--p': `${((o.cell - 48) / 92) * 100}%` } as CSSProperties} onChange={(e) => set({ cell: Number(e.target.value) })} />
          </div>
          <div className="field">
            <span className="label">Fundo</span>
            <div className="seg full small">
              {(
                [
                  ['theme', 'Tema atual'],
                  ['dark', 'Escuro'],
                  ['light', 'Claro'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} className={o.background === k ? 'on' : ''} onClick={() => set({ background: k })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="col" style={{ gap: 0 }}>
            <Toggle label="Título da lista" on={o.header} set={(v) => set({ header: v })} />
            <Toggle label="Nomes nas capas" on={o.titles} set={(v) => set({ titles: v })} />
            <Toggle label="Suas notas" on={o.scores} set={(v) => set({ scores: v })} />
            <Toggle label={`Incluir o pool (${list.pool.length})`} on={o.pool} set={(v) => set({ pool: v })} />
            <Toggle label="Assinatura AnimeTier" on={o.watermark} set={(v) => set({ watermark: v })} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function defaults(): Omit<RenderOpts, 'lang' | 'scale'> {
  return { width: 1280, cell: 84, titles: false, scores: false, pool: false, header: true, watermark: true, background: 'theme' };
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="switch">
      {label}
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span className="track" />
    </label>
  );
}

// ── Share link ─────────────────────────────────────────
function ShareDialog({ onClose }: { onClose: () => void }) {
  const list = useEditor((s) => s.list!);
  const [pool, setPool] = useState(false);
  const [scores, setScores] = useState(true);
  const [copied, setCopied] = useState(false);
  const { url, skipped } = useMemo(() => encodeShare(list, { includePool: pool, includeScores: scores }), [list, pool, scores]);
  const copy = () =>
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  const native = typeof navigator.share === 'function';
  return (
    <Dialog
      title="Compartilhar"
      sub="Um link que abre sua tier list em qualquer navegador — sem conta, sem upload."
      icon={<Share2 className="dlg-icon" />}
      width={560}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => useUI.getState().openDialog('export')}>
            <ImageIcon /> Prefiro uma imagem
          </button>
          {native && (
            <button className="btn" onClick={() => navigator.share({ title: list.title, url }).catch(() => {})}>
              <Share2 /> Enviar…
            </button>
          )}
          <button className="btn btn-primary" onClick={copy}>
            {copied ? <Check /> : <Link2 />} {copied ? 'Copiado!' : 'Copiar link'}
          </button>
        </>
      }
    >
      <div className="share-url">
        <Link2 size={16} />
        <input className="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <a className="btn btn-icon btn-sm btn-ghost" href={url} target="_blank" rel="noreferrer" data-tip="Abrir">
          <ExternalLink />
        </a>
      </div>
      <div className="share-meta">
        <span>{url.length.toLocaleString('pt-BR')} caracteres</span>
        {url.length <= 2000 ? <span>cabe numa mensagem do Discord</span> : <span className="warn">passa do limite de 2.000 do Discord sem Nitro{pool ? ' — tente sem o pool' : scores ? ' — tente sem as notas' : ''}</span>}
        {skipped > 0 && <span className="warn">{plural(skipped, 'imagem local fica', 'imagens locais ficam')} de fora</span>}
      </div>
      <div className="col" style={{ gap: 0 }}>
        <Toggle label="Incluir suas notas" on={scores} set={setScores} />
        <Toggle label={`Incluir o pool (${list.pool.length} não ranqueados)`} on={pool} set={setPool} />
      </div>
      <p className="hint">O link guarda só os IDs do AniList — as capas são buscadas quando alguém abre. Quem receber pode salvar uma cópia e montar a própria versão.</p>
    </Dialog>
  );
}

// ── Organize ───────────────────────────────────────────
function OrganizeDialog({ onClose }: { onClose: () => void }) {
  const list = useEditor((s) => s.list!);
  const [mode, setMode] = useState<string>('score');
  const [scope, setScope] = useState<'pool' | 'all'>('pool');
  const scored = list.pool.filter((id) => list.items[id].score != null).length;
  const th = scoreThresholds(list.tiers.filter((t) => !t.locked).length);
  const g = GROUPINGS.find((x) => x.id === mode);
  const groupable = g ? (scope === 'all' ? [...list.tiers.flatMap((t) => t.items), ...list.pool] : list.pool).filter((id) => g.key(list.items[id])).length : 0;

  const apply = () => {
    const ed = useEditor.getState();
    let n = 0;
    if (mode === 'score') ed.mutate('Distribuiu por nota', (d) => void (n = ops.distributeByScore(d)));
    else if (mode === 'even') ed.mutate('Distribuiu igualmente', (d) => void (n = ops.distributeEvenly(d, false)));
    else if (mode === 'random') ed.mutate('Distribuiu aleatoriamente', (d) => void (n = ops.distributeEvenly(d, true)));
    else if (g) ed.mutate(`Organizou por ${g.name.toLowerCase()}`, (d) => void (n = ops.groupInto(d, g, scope)));
    onClose();
    if (n) toast.ok(`${plural(n, 'item organizado', 'itens organizados')}`, { action: { label: 'Desfazer', run: () => useEditor.getState().undo() } });
    else toast.warn('Nada pra organizar com essa opção');
  };

  const opts: [string, string, string][] = [
    ['score', 'Pela sua nota', scored ? `${plural(scored, 'item com nota', 'itens com nota')} no pool · faixas ${th.slice(0, -1).map((x) => '≥' + x).join(', ')}` : 'Nenhum item do pool tem nota ainda'],
    ...GROUPINGS.map((x) => [x.id, x.name, x.desc + ' · cria uma tier pra cada'] as [string, string, string]),
    ['even', 'Igualmente', 'Divide o pool entre as tiers, em ordem'],
    ['random', 'No caos', 'Joga cada item numa tier aleatória'],
  ];

  return (
    <Dialog
      title="Organizar automaticamente"
      sub="Um empurrão inicial — depois é só ajustar arrastando."
      icon={<Wand2 className="dlg-icon" />}
      width={560}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={apply}>
            <Wand2 /> Organizar
          </button>
        </>
      }
    >
      <div className="choice-list">
        {opts.map(([k, l, d]) => (
          <button key={k} className={`choice ${mode === k ? 'on' : ''}`} onClick={() => setMode(k)}>
            <span className="radio" />
            <span>
              <b>{l}</b>
              <span>{d}</span>
            </span>
          </button>
        ))}
      </div>
      {g && (
        <div className="row wrap">
          <div className="seg small">
            <button className={scope === 'pool' ? 'on' : ''} onClick={() => setScope('pool')}>
              Só o pool
            </button>
            <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>
              Refazer tudo
            </button>
          </div>
          <span className="hint">{scope === 'all' ? `Substitui as tiers atuais · ${groupable} itens têm esse dado` : `${groupable} itens do pool têm esse dado`}</span>
        </div>
      )}
    </Dialog>
  );
}

// ── Sequels ────────────────────────────────────────────
function SequelsDialog({ onClose }: { onClose: () => void }) {
  const list = useEditor((s) => s.list!);
  const lang = useSettings((s) => s.titleLang);
  const [scope, setScope] = useState<'pool' | 'all'>('pool');
  const candidates = useMemo(() => {
    const ids = scope === 'pool' ? list.pool : [...list.tiers.flatMap((t) => t.items), ...list.pool];
    return ids.filter((id) => ops.isSequel(list.items[id]));
  }, [list, scope]);
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const chosen = candidates.filter((id) => !keep.has(id));
  const unlinked = Object.values(list.items).filter((i) => i.anilistId && i.sequel === undefined).length;

  return (
    <Dialog
      title="Remover continuações"
      sub="Segundas temporadas, partes 2, cours… Clique numa capa pra mantê-la."
      icon={<Scissors className="dlg-icon" />}
      width={760}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-danger"
            disabled={!chosen.length}
            onClick={() => {
              useEditor.getState().mutate(`Removeu ${chosen.length} continuações`, (d) => ops.removeItems(d, chosen));
              onClose();
              toast(`${plural(chosen.length, 'continuação removida', 'continuações removidas')}`, { action: { label: 'Desfazer', run: () => useEditor.getState().undo() } });
            }}
          >
            <Scissors /> Remover {chosen.length || ''}
          </button>
        </>
      }
    >
      <div className="row wrap">
        <div className="seg small">
          <button className={scope === 'pool' ? 'on' : ''} onClick={() => setScope('pool')}>
            Só no pool
          </button>
          <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>
            Na lista toda
          </button>
        </div>
        {unlinked > 0 && <span className="hint">Dica: “Atualizar capas e dados” no menu ⋯ deixa a detecção mais precisa (usa as relações do AniList).</span>}
      </div>
      {candidates.length ? (
        <div className="pick-grid">
          {candidates.map((id) => {
            const it = list.items[id];
            const kept = keep.has(id);
            return (
              <button
                key={id}
                className={`pick ${kept ? 'kept' : 'gone'}`}
                onClick={() => {
                  const n = new Set(keep);
                  if (kept) n.delete(id);
                  else n.add(id);
                  setKeep(n);
                }}
                style={{ '--cc': it.color } as CSSProperties}
              >
                <span className="pick-cover">
                  <Cover src={it.img} alt="" />
                  <span className="pick-flag">{kept ? 'Manter' : 'Remover'}</span>
                </span>
                <span className="pick-title">{displayTitle(it, lang)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="empty">
          <Check />
          <b>Nenhuma continuação encontrada</b>
        </div>
      )}
    </Dialog>
  );
}

// ── History ────────────────────────────────────────────
function HistoryDialog({ onClose }: { onClose: () => void }) {
  const past = useEditor((s) => s.past);
  const future = useEditor((s) => s.future);
  return (
    <Dialog title="Histórico" sub="Volte pra qualquer ponto desta sessão. Nada se perde: dá pra refazer." icon={<History className="dlg-icon" />} width={520} onClose={onClose}>
      {!past.length && !future.length ? (
        <div className="empty">
          <History />
          <b>Nada por aqui ainda</b>
          <span>Cada mudança que você fizer aparece nesta lista.</span>
        </div>
      ) : (
        <div className="history">
          {[...future].reverse().map((h, i) => (
            <div key={'f' + i} className="hist undone">
              <span className="hist-dot" />
              <span className="grow">{h.label}</span>
              <span className="faint">desfeito</span>
            </div>
          ))}
          <div className="hist now">
            <span className="hist-dot" />
            <b className="grow">Agora</b>
          </div>
          {[...past].reverse().map((h, ri) => {
            const idx = past.length - 1 - ri;
            return (
              <div key={'p' + idx} className="hist">
                <span className="hist-dot" />
                <span className="grow">{h.label}</span>
                <span className="faint">{timeAgo(h.at)}</span>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    useEditor.getState().jumpTo(idx);
                    toast(`Voltou pra antes de “${h.label}”`);
                  }}
                  data-tip="Voltar pra antes disso"
                >
                  <RotateCcw />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}

// ── Help ───────────────────────────────────────────────
function HelpDialog({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['Ctrl K', 'Paleta de comandos — faz tudo daqui'],
    ['1 – 9', 'Manda o item sob o mouse (ou a seleção) pra tier N'],
    ['0', 'Devolve pro pool'],
    ['Enter', 'Abre os detalhes do item sob o mouse'],
    ['Del', 'Exclui o item sob o mouse / seleção'],
    ['S', 'Borra/desborra como spoiler'],
    ['X  ·  Ctrl/Shift + clique', 'Seleciona vários (Shift seleciona um intervalo)'],
    ['Ctrl A', 'Seleciona tudo que está visível no pool'],
    ['R', 'Rank rápido: ranqueia o pool um a um'],
    ['I', 'Insights da lista'],
    ['/  ·  Ctrl F', 'Buscar'],
    ['P', 'Mostrar/esconder o pool'],
    ['Ctrl Z  ·  Ctrl Y', 'Desfazer / refazer'],
    ['Esc', 'Fecha o que estiver aberto / limpa seleção'],
  ];
  return (
    <Dialog title="Atalhos" sub="O AnimeTier foi feito pra ser rápido no teclado." icon={<Keyboard className="dlg-icon" />} width={560} onClose={onClose}>
      <div className="keys">
        {rows.map(([k, d]) => (
          <div key={k} className="key-row">
            <span className="keycaps">
              {k.split('  ·  ').map((g, i) => (
                <span key={i} className="kgroup">
                  {i > 0 && <span className="faint">ou</span>}
                  {g.split(' ').map((x, j) =>
                    x === '–' || x === '+' ? (
                      <span key={j} className="faint">
                        {x}
                      </span>
                    ) : (
                      <span key={j} className="kbd">
                        {x}
                      </span>
                    ),
                  )}
                </span>
              ))}
            </span>
            <span>{d}</span>
          </div>
        ))}
      </div>
      <p className="hint">No celular: segure uma capa pra arrastar, ou toque pra abrir e escolher a tier. O pool fica numa gaveta embaixo.</p>
    </Dialog>
  );
}
