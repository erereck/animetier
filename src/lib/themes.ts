import { create } from 'zustand';
import type { FontId, ThemeId } from '../store/settings';

export const THEMES: { id: ThemeId; name: string; swatch: [string, string, string] }[] = [
  { id: 'noite', name: 'Meia-noite', swatch: ['#0a0a10', '#8b7bff', '#ff6b9a'] },
  { id: 'sakura', name: 'Sakura', swatch: ['#f6f2ef', '#e0457b', '#8b5cf6'] },
  { id: 'neon', name: 'Neon', swatch: ['#05060a', '#f7e14b', '#22e8ff'] },
  { id: 'persona', name: 'Phantom', swatch: ['#0c0304', '#ff1f44', '#ffffff'] },
  { id: 'vapor', name: 'Vaporwave', swatch: ['#120a26', '#ff71ce', '#01cdfe'] },
  { id: 'retro', name: 'Retrô 90', swatch: ['#1b120c', '#ff9f43', '#ffd166'] },
  { id: 'matcha', name: 'Matcha', swatch: ['#edf1e8', '#3f8f5b', '#c08a3e'] },
  { id: 'mono', name: 'Noir', swatch: ['#0b0b0b', '#f5f5f5', '#737373'] },
];

export const FONTS: { id: FontId; name: string; family: string; google?: string }[] = [
  { id: 'unbounded', name: 'Unbounded', family: "'Unbounded Variable'" },
  { id: 'bebas', name: 'Bebas Neue', family: "'Bebas Neue'", google: 'Bebas+Neue' },
  { id: 'bangers', name: 'Bangers', family: "'Bangers'", google: 'Bangers' },
  { id: 'rajdhani', name: 'Rajdhani', family: "'Rajdhani'", google: 'Rajdhani:wght@700' },
  { id: 'orbitron', name: 'Orbitron', family: "'Orbitron'", google: 'Orbitron:wght@800' },
  { id: 'rounded', name: 'M+ Rounded', family: "'M PLUS Rounded 1c'", google: 'M+PLUS+Rounded+1c:wght@800' },
  { id: 'serif', name: 'Fraunces', family: "'Fraunces'", google: 'Fraunces:opsz,wght@9..144,800' },
  { id: 'pixel', name: 'Pixel', family: "'Press Start 2P'", google: 'Press+Start+2P' },
];

const loaded = new Set<string>();

export function ensureFont(id: FontId) {
  const f = FONTS.find((x) => x.id === id);
  if (!f?.google || loaded.has(f.id)) return;
  loaded.add(f.id);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`;
  document.head.appendChild(link);
}

export function loadAllFontsForPicker() {
  FONTS.forEach((f) => ensureFont(f.id));
}

/** Bumped whenever the display font changes or finishes loading, so text fitting re-measures. */
export const useFontVersion = create<{ v: number }>(() => ({ v: 0 }));
export const bumpFonts = () => useFontVersion.setState((s) => ({ v: s.v + 1 }));

let measureCtx: CanvasRenderingContext2D | null = null;
/** Width of the longest word of `text` in the display font, in em. */
export function longestWordEm(text: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  const cs = getComputedStyle(document.documentElement);
  const family = cs.getPropertyValue('--font-display').trim() || 'sans-serif';
  const weight = cs.getPropertyValue('--display-weight').trim() || '800';
  const upper = cs.getPropertyValue('--display-case').trim() === 'uppercase';
  const tracking = parseFloat(cs.getPropertyValue('--display-tracking')) || 0;
  if (!measureCtx) return Math.max(2, text.length) * 0.8;
  measureCtx.font = `${weight} 100px ${family}`;
  let max = 0;
  for (const w of text.split(/\s+/)) {
    const word = upper ? w.toUpperCase() : w;
    max = Math.max(max, measureCtx.measureText(word).width / 100 + tracking * word.length);
  }
  return Math.max(max, 0.6);
}
