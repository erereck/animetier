import { useEffect, type CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { useSettings, type TitleMode } from '../store/settings';
import { FONTS, THEMES, loadAllFontsForPicker } from '../lib/themes';
import type { TitleLang } from '../types';

export function ViewMenu() {
  const s = useSettings();
  useEffect(() => loadAllFontsForPicker(), []);
  const pct = ((s.itemSize - 52) / (150 - 52)) * 100;
  return (
    <div className="view-menu">
      <div className="vm-sec">
        <div className="vm-row">
          <span className="label">Tamanho das capas</span>
          <span className="faint" style={{ fontWeight: 700, fontSize: 12 }}>
            {s.itemSize}px
          </span>
        </div>
        <input className="range" type="range" min={52} max={150} step={2} value={s.itemSize} style={{ '--p': `${pct}%` } as CSSProperties} onChange={(e) => s.set({ itemSize: Number(e.target.value) })} />
      </div>
      <div className="vm-sec">
        <span className="label">Títulos nas capas</span>
        <div className="seg full small">
          {(
            [
              ['hover', 'Ao passar'],
              ['always', 'Sempre'],
              ['never', 'Nunca'],
            ] as [TitleMode, string][]
          ).map(([k, l]) => (
            <button key={k} className={s.titles === k ? 'on' : ''} onClick={() => s.set({ titles: k })}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="vm-sec">
        <span className="label">Idioma dos títulos</span>
        <div className="seg full small">
          {(
            [
              ['english', 'Inglês'],
              ['romaji', 'Romaji'],
              ['native', '日本語'],
            ] as [TitleLang, string][]
          ).map(([k, l]) => (
            <button key={k} className={s.titleLang === k ? 'on' : ''} onClick={() => s.set({ titleLang: k })}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="vm-sec tight">
        <Toggle label="Mostrar notas nas capas" on={s.showScores} set={(v) => s.set({ showScores: v })} />
        <Toggle label="Numerar posições" on={s.showRanks} set={(v) => s.set({ showRanks: v })} />
        <Toggle label="Selo de temporada" on={s.showSeason} set={(v) => s.set({ showSeason: v })} />
        <Toggle label="Brilho ambiente das capas" on={s.ambient} set={(v) => s.set({ ambient: v })} />
        <Toggle label="Borrar conteúdo +18" on={s.hideAdult} set={(v) => s.set({ hideAdult: v })} />
      </div>
      <div className="vm-sec">
        <span className="label">Tema</span>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button key={t.id} className={`theme-swatch ${s.theme === t.id ? 'on' : ''}`} onClick={() => s.set({ theme: t.id })} title={t.name}>
              <span className="sw" style={{ background: t.swatch[0] }}>
                <i style={{ background: t.swatch[1] }} />
                <i style={{ background: t.swatch[2] }} />
                {s.theme === t.id && <Check />}
              </span>
              <span className="nm">{t.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="vm-sec">
        <span className="label">Fonte dos rótulos</span>
        <div className="font-grid">
          {FONTS.map((f) => (
            <button key={f.id} className={`font-opt ${s.font === f.id ? 'on' : ''}`} style={{ fontFamily: f.family }} onClick={() => s.set({ font: f.id })}>
              {f.id === 'pixel' ? 'Aa' : f.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
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
