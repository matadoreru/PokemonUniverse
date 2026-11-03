import { useEffect, useRef } from 'react';
import { sfx, type SfxName } from '../lib/sfx';

/**
 * Suena `cue` una vez cada vez que cambia `key` (nunca en el primer render).
 * Con el sonido silenciado `sfx.play` no hace nada.
 */
export function useSfxCue(cue: SfxName | null, key: string | number | null): void {
  const previous = useRef(key);
  useEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    if (cue !== null && key !== null) sfx.play(cue);
  }, [cue, key]);
}
