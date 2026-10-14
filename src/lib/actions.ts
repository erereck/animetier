/**
 * User-level actions: store mutation + feedback. Shared by menus, the command palette,
 * keyboard shortcuts and dialogs so every entry point behaves the same.
 */
import type { Item, Season, TierList } from '../types';
import { POOL } from '../types';
import { useEditor } from '../store/editor';
import { useUI } from '../store/ui';
import { getSettings } from '../store/settings';
import { toast } from '../components/Toasts';
import * as ops from './ops';
import { fetchByIds, fetchFavouriteCharacters, fetchSeason, fetchUserList, matchTitles, refreshFields, AniListError } from './anilist';
import { db, storeLocalImage } from './db';
import { makeBackup, parseImport } from './migrate';
import { displayTitle, download, plural, safeFilename, SEASON_LABEL, uid } from './util';
import { tiersFromTemplate } from './presets';
import { go } from './router';

const ed = () => useEditor.getState();
const list = () => ed().list!;
const name = (id: string) => {
  const it = list()?.items[id];
  return it ? displayTitle(it, getSettings().titleLang) : 'item';
};
const tierName = (container: string) => (container === POOL ? 'Pool' : list().tiers.find((t) => t.id === container)?.name ?? '?');

export function undo() {
  const l = ed().undo();
  if (l) toast(`Desfeito: ${l}`, { duration: 1800 });
}
export function redo() {
  const l = ed().redo();
  if (l) toast(`Refeito: ${l}`, { duration: 1800 });
}

function undoAction() {
  return { label: 'Desfazer', run: undo };
}

export function moveTo(ids: string[], container: string, opts: { silent?: boolean } = {}) {
  if (!ids.length) return;
  const tier = list().tiers.find((t) => t.id === container);
  if (tier?.locked) {
    toast.warn(`A tier "${tier.name}" está trancada`);
    return;
  }
  const label = ids.length === 1 ? `"${name(ids[0])}" → ${tierName(container)}` : `${ids.length} itens → ${tierName(container)}`;
  ed().mutate(label, (d) => {
    ops.moveItems(d, ids, container);
  });
  flashItems(ids);
  if (!opts.silent && ids.length > 1) toast.ok(label);
}

export function deleteItems(ids: string[]) {
  if (!ids.length) return;
  const label = ids.length === 1 ? `Excluiu "${name(ids[0])}"` : `Excluiu ${ids.length} itens`;
  ed().mutate(label, (d) => ops.removeItems(d, ids));
  const ui = useUI.getState();
  ui.select(ids.filter((id) => ui.selected.has(id)), 'toggle');
  if (ui.inspectId && ids.includes(ui.inspectId)) ui.inspect(null);
  toast(label, { action: undoAction() });
}

export function setScore(ids: string[], score: number | null) {
  ed().mutate(
    ids.length === 1 ? `Nota de "${name(ids[0])}"` : `Nota em ${ids.length} itens`,
    (d) => {
      for (const id of ids) {
        const it = d.items[id];
        if (!it) continue;
        if (score == null) delete it.score;
        else it.score = score;
      }
    },
    'score:' + ids.join(','),
  );
}

export function patchItem(id: string, patch: Partial<Item>, label: string, coalesce?: string) {
  ed().mutate(label, (d) => Object.assign(d.items[id], patch), coalesce);
}

export function toggleSpoiler(ids: string[]) {
  const on = !ids.every((id) => list().items[id]?.spoiler);
  ed().mutate(on ? 'Marcou spoiler' : 'Removeu spoiler', (d) => ids.forEach((id) => (d.items[id].spoiler = on || undefined)));
}

export function duplicateItem(id: string) {
  ed().mutate(`Duplicou "${name(id)}"`, (d) => {
    const src = d.items[id];
    const copy = { ...src, id: uid('i'), anilistId: src.anilistId, addedAt: Date.now() };
    // Duplicates are intentional, so bypass the dedupe in addItems.
    d.items[copy.id] = copy;
    const c = ops.findContainer(d, id) ?? POOL;
    const arr = ops.containerItems(d, c)!;
    arr.splice(arr.indexOf(id) + 1, 0, copy.id);
  });
}

export function flashItems(ids: string[]) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      for (const id of ids.slice(0, 40)) {
        const el = document.querySelector<HTMLElement>(`[data-item="${window.CSS.escape(id)}"]`);
        if (!el) continue;
        el.classList.remove('landed');
        void el.offsetWidth;
        el.classList.add('landed');
        setTimeout(() => el.classList.remove('landed'), 500);
      }
    }),
  );
}

export function revealItem(id: string) {
  const el = document.querySelector<HTMLElement>(`[data-item="${window.CSS.escape(id)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1500);
}

// ── Tiers ──────────────────────────────────────────────
export function addTier(at?: number) {
  let id = '';
  ed().mutate('Nova tier', (d) => {
    id = ops.insertTier(d, at ?? d.tiers.length).id;
  });
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-tier="${id}"] .tier-label`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el) setTimeout(() => useUI.getState().set({ tierMenu: { id, el } }), 250);
  });
}

export function deleteTier(id: string) {
  const t = list().tiers.find((x) => x.id === id);
  if (!t) return;
  ed().mutate(`Excluiu a tier "${t.name}"`, (d) => ops.deleteTier(d, id));
  toast(t.items.length ? `Tier excluída · ${plural(t.items.length, 'item voltou', 'itens voltaram')} pro pool` : 'Tier excluída', { action: undoAction() });
}

export function applyTemplate(templateId: string) {
  ed().mutate('Aplicou modelo', (d) => {
    const ranked = d.tiers.flatMap((t) => t.items);
    d.pool.unshift(...ranked);
    d.tiers = tiersFromTemplate(templateId);
  });
  toast('Modelo aplicado — seus itens foram pro pool', { action: undoAction() });
}

// ── Adding things ──────────────────────────────────────
export function addToList(items: Item[], to: string = POOL, index?: number): number {
  let added: string[] = [];
  ed().mutate(items.length === 1 ? `Adicionou "${displayTitle(items[0], getSettings().titleLang)}"` : `Adicionou ${items.length} itens`, (d) => {
    added = ops.addItems(d, items, to, index);
  });
  if (to !== POOL) flashItems(added);
  return added.length;
}

function report(added: number, total: number, what: string) {
  const dupes = total - added;
  if (!total) return toast.warn(`Nada encontrado ${what}`);
  if (!added) return toast.warn(`Tudo isso já estava na lista`);
  toast.ok(`${plural(added, 'item adicionado', 'itens adicionados')}${dupes ? ` · ${dupes} já existiam` : ''}`);
}

export interface UserImportOpts {
  user: string;
  type: 'ANIME' | 'MANGA';
  statuses: string[];
  yearMode: 'any' | 'release' | 'completed';
  year?: number;
  skipSequels?: boolean;
}

export async function fetchUserImport(o: UserImportOpts): Promise<{ items: Item[]; userName: string }> {
  const res = await fetchUserList(o.user.trim(), o.type);
  let items = res.items.filter((i) => !i.listStatus || o.statuses.includes(i.listStatus));
  if (o.yearMode === 'release' && o.year) items = items.filter((i) => i.year === o.year || i.seasonYear === o.year);
  if (o.yearMode === 'completed' && o.year) items = items.filter((i) => i.completedYear === o.year);
  if (o.skipSequels) items = items.filter((i) => !ops.isSequel(i));
  return { items, userName: res.user.name };
}

export async function importUserList(o: UserImportOpts) {
  const t = toast.busy(`Buscando a lista de ${o.user}…`);
  try {
    const { items, userName } = await fetchUserImport(o);
    toast.dismiss(t);
    const added = addToList(items);
    report(added, items.length, 'com esses filtros');
    ed().mutate('Lembrou usuário', (d) => {
      d.anilistUser = userName;
    });
    return added;
  } catch (e) {
    toast.update(t, errMsg(e), { kind: 'err' });
    return 0;
  }
}

export async function importSeason(season: Season, year: number, includeSequels: boolean) {
  const t = toast.busy(`Buscando ${SEASON_LABEL[season].toLowerCase()} ${year}…`);
  try {
    const items = await fetchSeason(season, year, { includeSequels, formats: ['TV', 'TV_SHORT', 'ONA', 'MOVIE'] });
    toast.dismiss(t);
    const added = addToList(items);
    report(added, items.length, 'nessa temporada');
    return added;
  } catch (e) {
    toast.update(t, errMsg(e), { kind: 'err' });
    return 0;
  }
}

export async function importFavourites(user: string) {
  const t = toast.busy(`Buscando personagens favoritos de ${user}…`);
  try {
    const items = await fetchFavouriteCharacters(user.trim());
    toast.dismiss(t);
    const added = addToList(items);
    report(added, items.length, 'nos favoritos');
    return added;
  } catch (e) {
    toast.update(t, errMsg(e), { kind: 'err' });
    return 0;
  }
}

export async function addFiles(files: FileList | File[]) {
  const imgs = [...files].filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) return;
  const t = toast.busy(`Salvando ${plural(imgs.length, 'imagem', 'imagens')}…`);
  const items: Item[] = [];
  for (const f of imgs) {
    const img = await storeLocalImage(f);
    items.push({ id: uid('i'), title: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), img, kind: 'custom', addedAt: Date.now() });
  }
  toast.dismiss(t);
  report(addToList(items), items.length, '');
}

export function addUrls(text: string) {
  const items: Item[] = [];
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^(https?:\/\/\S+)(?:\s*[|;,\t]\s*(.+))?$/i) || line.trim().match(/^(.+?)\s*[|;\t]\s*(https?:\/\/\S+)$/i);
    if (!m) continue;
    const [url, title] = m[1].startsWith('http') ? [m[1], m[2]] : [m[2], m[1]];
    items.push({ id: uid('i'), title: (title || decodeURIComponent(url.split('/').pop() || 'Imagem').replace(/\.[^.]+$/, '')).trim(), img: url, kind: 'custom', addedAt: Date.now() });
  }
  if (!items.length) {
    toast.warn('Nenhuma URL válida encontrada');
    return 0;
  }
  const added = addToList(items);
  report(added, items.length, '');
  return added;
}

export async function pasteImage() {
  try {
    const clip = await navigator.clipboard.read();
    for (const c of clip) {
      const type = c.types.find((t) => t.startsWith('image/'));
      if (type) {
        const blob = await c.getType(type);
        await addFiles([new File([blob], 'Imagem colada.png', { type })]);
        return;
      }
    }
    toast.warn('Não há imagem na área de transferência');
  } catch {
    toast.warn('Sem permissão pra ler a área de transferência — tente Ctrl+V');
  }
}

// ── AniList maintenance ────────────────────────────────
export async function refreshMetadata() {
  const l = list();
  const media = Object.values(l.items).filter((i) => i.anilistId && (i.kind === 'anime' || i.kind === 'manga'));
  const chars = Object.values(l.items).filter((i) => i.anilistId && i.kind === 'character');
  if (!media.length && !chars.length) {
    toast.warn('Nenhum item vinculado ao AniList');
    return;
  }
  const t = toast.busy(`Atualizando ${media.length + chars.length} itens…`);
  try {
    const m = await fetchByIds(media.map((i) => i.anilistId!), 'media', (n) => toast.update(t, `Atualizando… ${n}/${media.length}`));
    const c = chars.length ? await fetchByIds(chars.map((i) => i.anilistId!), 'character') : new Map<number, Item>();
    let n = 0;
    ed().mutate('Atualizou dados do AniList', (d) => {
      for (const it of Object.values(d.items)) {
        if (!it.anilistId) continue;
        const fresh = (it.kind === 'character' ? c : m).get(it.anilistId);
        if (fresh) {
          refreshFields(it, fresh);
          n++;
        }
      }
    });
    toast.update(t, `${plural(n, 'item atualizado', 'itens atualizados')} com capas em alta e dados novos`, { kind: 'ok' });
  } catch (e) {
    toast.update(t, errMsg(e), { kind: 'err' });
  }
}

export async function linkUnmatched() {
  const l = list();
  const loose = Object.values(l.items).filter((i) => !i.anilistId && i.kind !== 'character');
  if (!loose.length) {
    toast.ok('Todos os itens já estão vinculados ao AniList');
    return;
  }
  const t = toast.busy(`Procurando ${loose.length} títulos no AniList…`);
  try {
    const found = await matchTitles(
      loose.map((i) => i.title),
      'ANIME',
      (n) => toast.update(t, `Procurando… ${n}/${loose.length}`),
    );
    let n = 0;
    ed().mutate('Vinculou itens ao AniList', (d) => {
      loose.forEach((orig, idx) => {
        const fresh = found[idx];
        const it = d.items[orig.id];
        if (!fresh || !it) return;
        const keepImg = it.img.startsWith('local:') || it.img.startsWith('data:');
        refreshFields(it, fresh);
        it.kind = fresh.kind;
        if (keepImg) it.img = orig.img;
        n++;
      });
    });
    toast.update(t, `${n} de ${loose.length} vinculados`, { kind: n ? 'ok' : 'warn' });
  } catch (e) {
    toast.update(t, errMsg(e), { kind: 'err' });
  }
}

// ── Files ──────────────────────────────────────────────
export async function exportListJSON(l: TierList) {
  download(`${safeFilename(l.title)}.animetier.json`, await makeBackup([l]), 'application/json');
  toast.ok('Backup baixado');
}

export async function exportAllJSON() {
  const sums = await db.summaries();
  const lists: TierList[] = [];
  for (const s of sums) {
    const l = await db.getList(s.id);
    if (l) lists.push(l);
  }
  download(`animetier-backup-${new Date().toISOString().slice(0, 10)}.json`, await makeBackup(lists), 'application/json');
  toast.ok(`Backup de ${plural(lists.length, 'lista', 'listas')} baixado`);
}

/** Imports one or more lists from a file and opens the first. */
export async function importFile(file: File): Promise<boolean> {
  const t = toast.busy('Importando…');
  try {
    const lists = await parseImport(await file.text(), file.name);
    for (const l of lists) await db.putList(l);
    toast.update(t, lists.length === 1 ? `"${lists[0].title}" importada` : `${lists.length} listas importadas`, { kind: 'ok' });
    if (lists.length === 1) go('l/' + lists[0].id);
    return true;
  } catch (e) {
    toast.update(t, `Não deu pra importar: ${(e as Error).message}`, { kind: 'err' });
    return false;
  }
}

export function errMsg(e: unknown): string {
  if (e instanceof AniListError) return e.message;
  if ((e as Error)?.name === 'AbortError') return 'Cancelado';
  return `Algo deu errado: ${(e as Error)?.message ?? e}`;
}
