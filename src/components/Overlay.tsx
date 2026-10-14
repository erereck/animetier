import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { create } from 'zustand';

/** Stack of open layers so Esc closes only the top-most one. */
const layers: (() => void)[] = [];
function useLayer(onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const fn = () => ref.current();
    layers.push(fn);
    return () => {
      const i = layers.lastIndexOf(fn);
      if (i >= 0) layers.splice(i, 1);
    };
  }, []);
}
export function hasOpenLayer() {
  return layers.length > 0;
}
if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && layers.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        layers[layers.length - 1]();
      }
    },
    true,
  );
}

// ── Dialog ─────────────────────────────────────────────
interface DialogProps {
  title?: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  width?: number;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bare?: boolean;
}

export function Dialog({ title, sub, icon, width, onClose, children, footer, className, bare }: DialogProps) {
  useLayer(onClose);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Respect an element that already took focus via autoFocus.
    if (box.current?.contains(document.activeElement)) return;
    // Bare dialogs (the inspector) drive their own keyboard shortcuts — don't park focus in a field.
    if (bare) {
      box.current?.focus({ preventScroll: true });
      return;
    }
    const el = box.current?.querySelector<HTMLElement>('input:not([type=hidden]), textarea, button.btn-primary');
    el?.focus({ preventScroll: true });
  }, []);
  return createPortal(
    <div
      className="scrim"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={box} tabIndex={-1} className={`dialog ${className ?? ''}`} style={{ '--w': width ? `${width}px` : undefined } as CSSProperties} role="dialog" aria-modal="true">
        {bare ? (
          children
        ) : (
          <>
            {(title || sub) && (
              <div className="dialog-head">
                {icon}
                <div className="grow">
                  {title && <div className="dialog-title">{title}</div>}
                  {sub && <div className="dialog-sub">{sub}</div>}
                </div>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Fechar">
                  <X />
                </button>
              </div>
            )}
            <div className="dialog-body">{children}</div>
            {footer && <div className="dialog-foot">{footer}</div>}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Popover ────────────────────────────────────────────
export type Anchor = HTMLElement | DOMRect | { x: number; y: number };

interface PopoverProps {
  anchor: Anchor;
  onClose: () => void;
  children: ReactNode;
  placement?: 'bottom-start' | 'bottom-end' | 'right-start' | 'top-start' | 'point';
  className?: string;
  width?: number;
}

function rectOf(a: Anchor): DOMRect {
  if (a instanceof HTMLElement) return a.getBoundingClientRect();
  if ('width' in a) return a;
  return new DOMRect(a.x, a.y, 0, 0);
}

export function Popover({ anchor, onClose, children, placement = 'bottom-start', className, width }: PopoverProps) {
  useLayer(onClose);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; origin: string } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const r = rectOf(anchor);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const m = 8;
      let left = r.left;
      let top = r.bottom + 6;
      let origin = 'top left';
      if (placement === 'bottom-end') {
        left = r.right - w;
        origin = 'top right';
      } else if (placement === 'right-start') {
        left = r.right + 6;
        top = r.top;
      } else if (placement === 'top-start') {
        top = r.top - h - 6;
        origin = 'bottom left';
      } else if (placement === 'point') {
        top = r.top;
      }
      if (top + h > vh - m) {
        const above = (placement === 'point' ? r.top : r.top - 6) - h;
        top = above > m ? above : Math.max(m, vh - h - m);
        origin = origin.replace('top', 'bottom');
      }
      if (left + w > vw - m) left = Math.max(m, (placement === 'right-start' ? r.left - w - 6 : vw - w - m));
      left = Math.max(m, left);
      setPos({ left, top, origin });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor, placement]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchor instanceof HTMLElement && anchor.contains(t)) return;
      // Clicks inside a nested float (e.g. a color picker) shouldn't close the parent.
      if ((t as HTMLElement).closest?.('.float') && !ref.current?.contains(t)) {
        const all = [...document.querySelectorAll('.float')];
        if (all.indexOf((t as HTMLElement).closest('.float')!) > all.indexOf(ref.current!)) return;
      }
      onClose();
    };
    const onScroll = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const id = setTimeout(() => {
      document.addEventListener('pointerdown', onDown, true);
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onClose);
    });
    return () => {
      clearTimeout(id);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      className={`float ${className ?? ''}`}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width, '--origin': pos?.origin, visibility: pos ? 'visible' : 'hidden' } as CSSProperties}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Hook for the common "button toggles a popover" pattern. */
export function usePopover<T = Anchor>() {
  const [anchor, setAnchor] = useState<T | null>(null);
  return {
    anchor,
    open: (a: T) => setAnchor(a),
    toggle: (a: T) => setAnchor((cur) => (cur ? null : a)),
    close: () => setAnchor(null),
  };
}

// ── Confirm / prompt ───────────────────────────────────
interface Ask {
  title: string;
  body?: ReactNode;
  confirm?: string;
  cancel?: string;
  danger?: boolean;
  input?: { value: string; placeholder?: string };
  resolve: (v: string | boolean | null) => void;
}
const useAsk = create<{ ask: Ask | null }>(() => ({ ask: null }));

export function confirmDialog(o: Omit<Ask, 'resolve' | 'input'>): Promise<boolean> {
  return new Promise((resolve) => useAsk.setState({ ask: { ...o, resolve: (v) => resolve(!!v) } }));
}
export function promptDialog(o: Omit<Ask, 'resolve'> & { input: Ask['input'] }): Promise<string | null> {
  return new Promise((resolve) => useAsk.setState({ ask: { ...o, resolve: (v) => resolve(typeof v === 'string' ? v : null) } }));
}

export function AskHost() {
  const ask = useAsk((s) => s.ask);
  const [val, setVal] = useState('');
  useEffect(() => setVal(ask?.input?.value ?? ''), [ask]);
  if (!ask) return null;
  const done = (v: string | boolean | null) => {
    useAsk.setState({ ask: null });
    ask.resolve(v);
  };
  const ok = () => done(ask.input ? val : true);
  return (
    <Dialog
      title={ask.title}
      width={420}
      onClose={() => done(null)}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => done(null)}>
            {ask.cancel ?? 'Cancelar'}
          </button>
          <button className={`btn ${ask.danger ? 'btn-danger' : 'btn-primary'}`} onClick={ok} autoFocus={!ask.input}>
            {ask.confirm ?? 'Confirmar'}
          </button>
        </>
      }
    >
      {ask.body && <div className="muted">{ask.body}</div>}
      {ask.input && (
        <input
          className="input"
          value={val}
          placeholder={ask.input.placeholder}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ok()}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </Dialog>
  );
}
