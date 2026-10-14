import { useSyncExternalStore } from 'react';

export type Route = { name: 'home' } | { name: 'list'; id: string } | { name: 'share'; data: string };

export function parse(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  if (h.startsWith('l/')) return { name: 'list', id: h.slice(2).split('/')[0] };
  if (h.startsWith('s/')) return { name: 'share', data: h.slice(2) };
  return { name: 'home' };
}

let current = parse(location.hash);
const subs = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse(location.hash);
  subs.forEach((f) => f());
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => current,
  );
}

export function go(path: string, replace = false) {
  const url = '#/' + path.replace(/^\//, '');
  if (replace) {
    history.replaceState(null, '', url);
    current = parse(url);
    subs.forEach((f) => f());
  } else location.hash = url;
}
