import type { Item, TierList, TitleLang } from '../types';
import { resolveImage } from './db';
import { coverAt } from './anilist';
import { displayTitle, inkOn, scoreColor, withAlpha } from './util';

export interface RenderOpts {
  width: number;
  cell: number;
  scale: number;
  titles: boolean;
  scores: boolean;
  pool: boolean;
  header: boolean;
  watermark: boolean;
  background: 'theme' | 'dark' | 'light';
  lang: TitleLang;
}

interface Palette {
  bg: string;
  row: string;
  text: string;
  text2: string;
  line: string;
  accent: string;
  accent2: string;
}

function palette(mode: RenderOpts['background']): Palette {
  if (mode === 'dark') return { bg: '#0b0b12', row: '#15151f', text: '#f2f1f7', text2: '#9d9bb0', line: 'rgba(255,255,255,.08)', accent: '#8b7bff', accent2: '#ff6b9a' };
  if (mode === 'light') return { bg: '#f7f4f1', row: '#ffffff', text: '#1d1720', text2: '#6c5e69', line: 'rgba(40,20,30,.1)', accent: '#e0457b', accent2: '#8b5cf6' };
  const cs = getComputedStyle(document.documentElement);
  const v = (k: string) => cs.getPropertyValue(k).trim();
  return { bg: v('--bg'), row: v('--panel'), text: v('--text'), text2: v('--text-2'), line: v('--line'), accent: v('--accent'), accent2: v('--accent-2') };
}

const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
/** Settled loads, so renders can draw whatever is ready without waiting. */
const ready = new Map<string, HTMLImageElement | null>();

function loadOne(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.decoding = 'async';
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

/** Loads an image usable on canvas: direct CORS → cache-busted CORS → public image proxy. */
export type CoverSize = 'medium' | 'large';

export function loadImage(ref: string, size: CoverSize = 'large'): Promise<HTMLImageElement | null> {
  const key = size + '|' + ref;
  let p = imgCache.get(key);
  if (!p) {
    p = (async () => {
      const url = await resolveImage(ref);
      if (!url) return null;
      if (url.startsWith('blob:') || url.startsWith('data:')) return loadOne(url);
      const big = coverAt(url, size);
      return (await loadOne(big)) ?? (await loadOne(big + (big.includes('?') ? '&' : '?') + 'cors=1')) ?? (await loadOne(`https://wsrv.nl/?url=${encodeURIComponent(big)}&w=300&output=webp`));
    })();
    p.then((im) => ready.set(key, im));
    imgCache.set(key, p);
  }
  return p;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | [number, number, number, number]) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  // Hard-break words that are still too wide.
  return lines.flatMap((l) => {
    if (ctx.measureText(l).width <= maxW) return [l];
    const out: string[] = [];
    let s = '';
    for (const ch of l) {
      if (ctx.measureText(s + ch).width > maxW && s) {
        out.push(s);
        s = ch;
      } else s += ch;
    }
    if (s) out.push(s);
    return out;
  });
}

function fitLabel(ctx: CanvasRenderingContext2D, text: string, family: string, weight: string, maxW: number, maxH: number) {
  for (let size = text.length <= 2 ? 52 : 34; size >= 11; size -= 1) {
    ctx.font = `${weight} ${size}px ${family}`;
    const lines = wrap(ctx, text, maxW);
    const lh = size * 1.08;
    if (lines.length * lh <= maxH && lines.every((l) => ctx.measureText(l).width <= maxW)) return { size, lines, lh };
  }
  ctx.font = `${weight} 11px ${family}`;
  return { size: 11, lines: wrap(ctx, text, maxW).slice(0, 4), lh: 12 };
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, item: Item, x: number, y: number, w: number, h: number, o: RenderOpts) {
  const r = Math.max(6, w * 0.08);
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.fillStyle = item.color || '#2a2a38';
  ctx.fillRect(x, y, w, h);
  const title = displayTitle(item, o.lang);
  if (img) {
    const ir = img.width / img.height;
    const cr = w / h;
    let sw = img.width;
    let sh = img.height;
    let sx = 0;
    let sy = 0;
    if (ir > cr) {
      sw = img.height * cr;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / cr;
      sy = (img.height - sh) / 2;
    }
    if (item.spoiler) ctx.filter = 'blur(10px)';
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    ctx.filter = 'none';
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${Math.max(9, w * 0.12)}px 'Manrope Variable', sans-serif`;
    const lines = wrap(ctx, title, w - 10).slice(0, 5);
    lines.forEach((l, i) => ctx.fillText(l, x + 5, y + 16 + i * w * 0.14));
  }
  if (o.titles && img) {
    const g = ctx.createLinearGradient(0, y + h * 0.45, 0, y + h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.88)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y + h * 0.45, w, h * 0.55);
    const fs = Math.max(8.5, Math.min(12, w * 0.12));
    ctx.font = `750 ${fs}px 'Manrope Variable', sans-serif`;
    ctx.fillStyle = '#fff';
    const lines = wrap(ctx, title, w - 8).slice(0, 3);
    const lh = fs * 1.18;
    lines.forEach((l, i) => ctx.fillText(l, x + 4, y + h - 6 - (lines.length - 1 - i) * lh));
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.stroke();
  if (o.scores && item.score != null) {
    const fs = Math.max(9, w * 0.13);
    ctx.font = `800 ${fs}px 'Manrope Variable', sans-serif`;
    const tw = ctx.measureText(String(item.score)).width + fs * 0.9;
    const bh = fs * 1.6;
    roundRect(ctx, x + w - tw - 4, y + 4, tw, bh, 6);
    ctx.fillStyle = scoreColor(item.score);
    ctx.fill();
    ctx.fillStyle = '#0b0b0f';
    ctx.fillText(String(item.score), x + w - tw - 4 + fs * 0.45, y + 4 + bh * 0.7);
  }
}

/** Loads every cover the render will need (12 at a time). */
export async function preloadCovers(list: TierList, includePool: boolean, size: CoverSize, onProgress?: (done: number, total: number) => void): Promise<void> {
  const ids = [...list.tiers.flatMap((t) => t.items), ...(includePool ? list.pool : [])].filter((id) => list.items[id]?.img);
  const refs = [...new Set(ids.map((id) => list.items[id].img))];
  let done = refs.filter((r) => ready.has(size + '|' + r)).length;
  const queue = refs.filter((r) => !ready.has(size + '|' + r));
  onProgress?.(done, refs.length);
  const worker = async () => {
    while (queue.length) {
      await loadImage(queue.shift()!, size);
      onProgress?.(++done, refs.length);
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
}

/** Draws synchronously with whatever covers are loaded; missing ones get a typographic placeholder. */
export async function renderTierList(list: TierList, o: RenderOpts, size: CoverSize = 'large'): Promise<HTMLCanvasElement> {
  await document.fonts.ready;
  const pal = palette(o.background);
  const P = 32;
  const labelW = Math.max(110, Math.round(o.cell * 1.55));
  const gap = Math.max(4, Math.round(o.cell * 0.07));
  const pad = gap + 4;
  const cellH = Math.round(o.cell * 1.5);
  const areaW = o.width - P * 2 - labelW;
  const cols = Math.max(1, Math.floor((areaW - pad * 2 + gap) / (o.cell + gap)));
  const rowsOf = (n: number) => Math.max(1, Math.ceil(n / cols));
  const rowH = (n: number) => rowsOf(n) * (cellH + gap) - gap + pad * 2;

  type Row = { name: string; color: string; icon?: string; items: string[] };
  const rows: Row[] = list.tiers.map((t) => ({ name: t.name, color: t.color, icon: t.icon, items: t.items }));
  if (o.pool && list.pool.length) rows.push({ name: 'Sem tier', color: '#6b6982', items: list.pool });

  const headerH = o.header ? 104 : 0;
  const footH = o.watermark ? 44 : 0;
  const rowGap = 10;
  const height = P + headerH + rows.reduce((h, r) => h + rowH(r.items.length) + rowGap, 0) - rowGap + footH + P;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(o.width * o.scale);
  canvas.height = Math.round(height * o.scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(o.scale, o.scale);
  ctx.textBaseline = 'alphabetic';

  // Background + soft glow
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, o.width, height);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, o.width * 0.7);
  glow.addColorStop(0, withAlpha(toHex(pal.accent), 0.16));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, o.width, height);

  const display = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || "'Unbounded Variable', sans-serif";
  const displayWeight = getComputedStyle(document.documentElement).getPropertyValue('--display-weight').trim() || '800';

  let y = P;
  if (o.header) {
    ctx.fillStyle = pal.text;
    const t = fitLabel(ctx, list.title, display, displayWeight, o.width - P * 2, 60);
    ctx.font = `${displayWeight} ${Math.min(t.size, 40)}px ${display}`;
    ctx.fillText(wrap(ctx, list.title, o.width - P * 2)[0] ?? '', P, y + 42);
    const ranked = list.tiers.reduce((n, x) => n + x.items.length, 0);
    ctx.font = `650 15px 'Manrope Variable', sans-serif`;
    ctx.fillStyle = pal.text2;
    ctx.fillText(`${ranked.toLocaleString('pt-BR')} ranqueados · ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`, P, y + 72);
    y += headerH;
  }


  for (const r of rows) {
    const h = rowH(r.items.length);
    const x0 = P;
    // Row body
    roundRect(ctx, x0, y, o.width - P * 2, h, 14);
    ctx.fillStyle = pal.row;
    ctx.fill();
    roundRect(ctx, x0, y, o.width - P * 2, h, 14);
    ctx.fillStyle = withAlpha(toHex(r.color), 0.08);
    ctx.fill();
    // Label
    roundRect(ctx, x0, y, labelW, h, [14, 0, 0, 14]);
    const lg = ctx.createLinearGradient(x0, y, x0 + labelW, y + h);
    lg.addColorStop(0, r.color);
    lg.addColorStop(1, shade(r.color, -0.16));
    ctx.fillStyle = lg;
    ctx.fill();
    const ink = inkOn(r.color);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    const iconH = r.icon ? 30 : 0;
    const fit = fitLabel(ctx, r.name, display, displayWeight, labelW - 22, Math.min(h - 26, 140) - iconH);
    const blockH = fit.lines.length * fit.lh + iconH;
    let ty = y + h / 2 - blockH / 2 + fit.size * 0.85;
    if (r.icon) {
      ctx.font = `26px sans-serif`;
      ctx.fillText(r.icon, x0 + labelW / 2, y + h / 2 - blockH / 2 + 24);
      ty += iconH;
    }
    ctx.font = `${displayWeight} ${fit.size}px ${display}`;
    fit.lines.forEach((l, i) => ctx.fillText(l, x0 + labelW / 2, ty + i * fit.lh));
    ctx.textAlign = 'left';
    // Covers
    r.items.forEach((id, i) => {
      const cx = x0 + labelW + pad + (i % cols) * (o.cell + gap);
      const cy = y + pad + Math.floor(i / cols) * (cellH + gap);
      const it = list.items[id];
      if (it) drawCover(ctx, ready.get(size + '|' + it.img) ?? ready.get('large|' + it.img) ?? ready.get('medium|' + it.img) ?? null, it, cx, cy, o.cell, cellH, o);
    });
    y += h + rowGap;
  }

  if (o.watermark) {
    ctx.textAlign = 'right';
    ctx.font = `700 13px 'Manrope Variable', sans-serif`;
    ctx.fillStyle = pal.text2;
    const label = 'feito com';
    const brand = 'AnimeTier';
    ctx.font = `800 15px 'Unbounded Variable', sans-serif`;
    const bw = ctx.measureText(brand).width;
    const grad = ctx.createLinearGradient(o.width - P - bw, 0, o.width - P, 0);
    grad.addColorStop(0, pal.accent);
    grad.addColorStop(1, pal.accent2);
    ctx.fillStyle = grad;
    ctx.fillText(brand, o.width - P, height - P - 4);
    ctx.font = `650 13px 'Manrope Variable', sans-serif`;
    ctx.fillStyle = pal.text2;
    ctx.fillText(label, o.width - P - bw - 8, height - P - 4);
    ctx.textAlign = 'left';
  }
  return canvas;
}

function toHex(c: string): string {
  if (c.startsWith('#')) return c;
  const m = c.match(/\d+(\.\d+)?/g);
  if (!m) return '#888888';
  return '#' + m.slice(0, 3).map((n) => Math.round(Number(n)).toString(16).padStart(2, '0')).join('');
}

function shade(hex: string, amt: number): string {
  const n = parseInt(toHex(hex).slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
