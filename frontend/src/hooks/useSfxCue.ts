import { useEffect, useRef } from 'react';
import { audio, type SoundId } from '../audio';

/** Nombres de los efectos antiguos (el módulo de sonido anterior): los juegos que los piden siguen funcionando. */
export type LegacyCue = 'tick' | 'hit' | 'miss' | 'reveal' | 'win' | 'clang';

const LEGACY: Record<LegacyCue, SoundId> = {
  tick: 'ui.tick',
  hit: 'game.hit',
  miss: 'game.miss',
  reveal: 'game.reveal',
  win: 'game.win',
  clang: 'game.clang',
};

/** Traduce un nombre antiguo al id del catálogo; los ids nuevos pasan tal cual. */
export function resolveCue(cue: SoundId | LegacyCue): SoundId {
  return cue in LEGACY ? LEGACY[cue as LegacyCue] : (cue as SoundId);
}

/** ¿Suena ahora? Solo si la clave cambió respecto a la anterior (nunca en el primer render) y hay efecto y clave. */
export function shouldCue(previousKey: string | number | null, key: string | number | null, cue: unknown): boolean {
  return previousKey !== key && cue !== null && key !== null;
}

/**
 * Juegos que ya piden su propio `reveal` al llegar a los resultados de ronda: la sala no suma el suyo para no
 * duplicarlo.
 */
export const SELF_REVEAL_GAMES: ReadonlySet<string> = new Set(['pokedex-distance']);

/** Clave del `game.reveal` común de la sala: cambia al entrar en resultados de ronda y es `null` fuera de ellos. */
export function roomRevealKey(game: { gameId?: string; phase?: string; roundNumber?: number } | null | undefined): string | null {
  if (!game || game.phase !== 'ROUND_RESULTS' || !game.gameId || SELF_REVEAL_GAMES.has(game.gameId)) return null;
  return `${game.gameId}:${game.roundNumber ?? 0}`;
}

/**
 * Suena `cue` una vez cada vez que cambia `key` (nunca en el primer render).
 * Con el sonido silenciado `audio.play` no hace nada.
 */
export function useSfxCue(cue: SoundId | LegacyCue | null, key: string | number | null): void {
  const previous = useRef(key);
  useEffect(() => {
    const before = previous.current;
    previous.current = key;
    if (cue !== null && shouldCue(before, key, cue)) audio.play(resolveCue(cue));
  }, [cue, key]);
}
