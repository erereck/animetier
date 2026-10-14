import { lazy, Suspense, useEffect, useState } from 'react';
import { useRoute, go } from './lib/router';
import { useSettings } from './store/settings';
import { useEditor } from './store/editor';
import { useUI, EMPTY_FILTERS } from './store/ui';
import { bumpFonts, ensureFont } from './lib/themes';
import { db } from './lib/db';
import { Home } from './views/Home';
import { Editor } from './views/Editor';
import { Toasts } from './components/Toasts';
import { AskHost } from './components/Overlay';

const ShareView = lazy(() => import('./views/ShareView'));

export function App() {
  const route = useRoute();
  const theme = useSettings((s) => s.theme);
  const font = useSettings((s) => s.font);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    bumpFonts();
    const meta = document.querySelector('meta[name="theme-color"]');
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (meta && bg) meta.setAttribute('content', bg);
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.font = font;
    ensureFont(font);
    bumpFonts();
    document.fonts.ready.then(bumpFonts);
    const t = setTimeout(bumpFonts, 1500);
    return () => clearTimeout(t);
  }, [font]);

  return (
    <>
      {route.name === 'home' && <Home />}
      {route.name === 'list' && <ListRoute id={route.id} />}
      {route.name === 'share' && (
        <Suspense fallback={<Splash text="Abrindo tier list…" />}>
          <ShareView data={route.data} />
        </Suspense>
      )}
      <Toasts />
      <AskHost />
    </>
  );
}

function ListRoute({ id }: { id: string }) {
  const loaded = useEditor((s) => s.list?.id === id && !s.readOnly);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const ed = useEditor.getState();
    if (ed.list?.id === id && !ed.readOnly) return;
    setMissing(false);
    db.getList(id).then((l) => {
      if (l) ed.open(l);
      else setMissing(true);
    });
  }, [id]);

  useEffect(
    () => () => {
      useEditor.getState().close();
      useUI.getState().set({ selected: new Set(), search: '', filters: EMPTY_FILTERS, inspectId: null, dialog: null, duelTierId: null, palette: false, insights: false, itemMenu: null, tierMenu: null });
    },
    [id],
  );

  useEffect(() => {
    const t = useEditor.getState().list?.title;
    document.title = t ? `${t} · AnimeTier` : 'AnimeTier';
    return () => void (document.title = 'AnimeTier');
  });

  if (missing)
    return (
      <div className="splash">
        <b>Lista não encontrada neste navegador.</b>
        <button className="btn" onClick={() => go('')}>
          Voltar pras minhas listas
        </button>
      </div>
    );
  if (!loaded) return <Splash text="Carregando…" />;
  return <Editor />;
}

export function Splash({ text }: { text: string }) {
  return (
    <div className="splash">
      <div className="spinner" />
      <span>{text}</span>
    </div>
  );
}
