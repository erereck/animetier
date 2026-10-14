import { create } from 'zustand';
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';

type Kind = 'ok' | 'warn' | 'err' | 'info' | 'busy';
interface Toast {
  id: number;
  msg: string;
  kind: Kind;
  action?: { label: string; run: () => void };
  duration: number;
  leaving?: boolean;
}

interface ToastStore {
  toasts: Toast[];
}
const useToasts = create<ToastStore>(() => ({ toasts: [] }));

let next = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function schedule(t: Toast) {
  clearTimeout(timers.get(t.id));
  if (t.kind === 'busy' || t.duration <= 0) return;
  timers.set(
    t.id,
    setTimeout(() => dismiss(t.id), t.duration),
  );
}

function dismiss(id: number) {
  clearTimeout(timers.get(id));
  useToasts.setState((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) }));
  setTimeout(() => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 200);
}

interface Opts {
  kind?: Kind;
  action?: Toast['action'];
  duration?: number;
}

export function toast(msg: string, opts: Opts = {}): number {
  const t: Toast = { id: next++, msg, kind: opts.kind ?? 'info', action: opts.action, duration: opts.duration ?? (opts.action ? 6000 : 3200) };
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-3), t] }));
  schedule(t);
  return t.id;
}
toast.ok = (m: string, o: Opts = {}) => toast(m, { ...o, kind: 'ok' });
toast.warn = (m: string, o: Opts = {}) => toast(m, { ...o, kind: 'warn' });
toast.err = (m: string, o: Opts = {}) => toast(m, { ...o, kind: 'err', duration: o.duration ?? 5000 });
toast.busy = (m: string) => toast(m, { kind: 'busy' });
toast.update = (id: number, msg: string, opts: Opts = {}) => {
  let found: Toast | undefined;
  useToasts.setState((s) => ({
    toasts: s.toasts.map((t) => {
      if (t.id !== id) return t;
      found = { ...t, msg, kind: opts.kind ?? t.kind, action: opts.action ?? t.action, duration: opts.duration ?? (opts.kind && opts.kind !== 'busy' ? 3200 : t.duration) };
      return found;
    }),
  }));
  if (found) schedule(found);
  else if (opts.kind && opts.kind !== 'busy') toast(msg, opts);
};
toast.dismiss = dismiss;

const ICON = { ok: CheckCircle2, warn: AlertTriangle, err: XCircle, info: Info, busy: Loader2 };

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div key={t.id} className={`toast ${t.kind}${t.leaving ? ' out' : ''}`}>
            <Icon />
            <span className="msg">{t.msg}</span>
            {t.action && (
              <button
                className="btn btn-sm"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
