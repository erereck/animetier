import { memo, useEffect, useState } from 'react';
import { resolveImage, resolvedImageSync } from '../lib/db';
import { coverAt } from '../lib/anilist';
import { useSettings } from '../store/settings';

interface Props {
  src: string;
  alt: string;
  size?: 'medium' | 'large' | 'extraLarge';
  className?: string;
  eager?: boolean;
}

/**
 * Cover image that resolves local blobs, fades in when decoded, and degrades to a
 * typographic placeholder instead of a broken-image icon.
 */
export const Cover = memo(function Cover({ src, alt, size = 'medium', className, eager }: Props) {
  const initial = resolvedImageSync(src);
  const [url, setUrl] = useState(initial ? coverAt(initial, size) : '');
  const [state, setState] = useState<'loading' | 'ok' | 'fail'>(src ? 'loading' : 'fail');

  useEffect(() => {
    let alive = true;
    if (!src) {
      setState('fail');
      return;
    }
    setState('loading');
    resolveImage(src).then((u) => {
      if (!alive) return;
      if (!u) setState('fail');
      else setUrl(coverAt(u, size));
    });
    return () => {
      alive = false;
    };
  }, [src, size]);

  if (state === 'fail' || !url)
    return (
      <div className={`cover-ph ${className ?? ''}`} aria-label={alt}>
        <span>{alt}</span>
      </div>
    );

  return (
    <img
      className={`cover ${state === 'ok' ? 'loaded' : ''} ${className ?? ''}`}
      src={url}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onLoad={() => setState('ok')}
      onError={() => {
        // A larger size may not exist for very old entries — fall back to the original.
        const orig = resolvedImageSync(src) ?? src;
        if (url !== orig && orig.startsWith('http')) setUrl(orig);
        else setState('fail');
      }}
    />
  );
});

/** Smallest AniList cover that stays crisp for the current card size and screen density. */
export function useCardCoverSize(): 'medium' | 'large' {
  return useSettings((s) => (s.itemSize * (window.devicePixelRatio || 1) <= 120 ? 'medium' : 'large'));
}
