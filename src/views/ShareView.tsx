import { useEffect, useState } from 'react';
import { Copy, Sparkles, Eye } from 'lucide-react';
import { decodeShare } from '../lib/share';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { db } from '../lib/db';
import { go } from '../lib/router';
import { uid, plural } from '../lib/util';
import { Editor } from './Editor';
import { Brand } from '../components/TopBar';
import { Splash } from '../App';
import { toast } from '../components/Toasts';

export default function ShareView({ data }: { data: string }) {
  const [state, setState] = useState<{ loading: boolean; msg: string; error?: string }>({ loading: true, msg: 'Abrindo tier list…' });
  const list = useEditor((s) => (s.readOnly ? s.list : null));

  useEffect(() => {
    let alive = true;
    decodeShare(data, (msg) => alive && setState({ loading: true, msg }))
      .then(({ list: l, missing }) => {
        if (!alive) return;
        useEditor.getState().open(l, true);
        setState({ loading: false, msg: '' });
        if (missing) toast.warn(`${plural(missing, 'item não foi encontrado', 'itens não foram encontrados')} no AniList`);
        document.title = `${l.title} · AnimeTier`;
      })
      .catch((e) => alive && setState({ loading: false, msg: '', error: (e as Error).message }));
    return () => {
      alive = false;
      useEditor.getState().close();
      useUI.getState().set({ inspectId: null, insights: false });
    };
  }, [data]);

  if (state.error)
    return (
      <div className="splash">
        <b>Não deu pra abrir esse link.</b>
        <span className="muted">{state.error}</span>
        <button className="btn btn-primary" onClick={() => go('')}>
          Ir pro AnimeTier
        </button>
      </div>
    );
  if (state.loading || !list) return <Splash text={state.msg} />;

  const save = async () => {
    const now = Date.now();
    const copy = { ...list, id: uid('l'), createdAt: now, updatedAt: now };
    await db.putList(copy);
    useEditor.getState().close();
    useEditor.getState().open(copy);
    go('l/' + copy.id);
    toast.ok('Cópia salva nas suas listas — agora é sua pra editar');
  };

  return (
    <Editor
      readOnly
      header={
        <header className="topbar share-bar">
          <Brand onClick={() => go('')} />
          <span className="tb-sep hide-sm" />
          <span className="share-badge hide-sm">
            <Eye size={14} /> Tier list compartilhada
          </span>
          <div className="tb-actions">
            <button className="btn btn-ghost hide-sm" onClick={() => useUI.getState().set({ insights: true })}>
              <Sparkles /> Insights
            </button>
            <button className="btn" onClick={() => go('')}>
              Criar a minha
            </button>
            <button className="btn btn-primary" onClick={save}>
              <Copy /> <span className="hide-sm">Salvar uma cópia</span>
            </button>
          </div>
        </header>
      }
    />
  );
}
