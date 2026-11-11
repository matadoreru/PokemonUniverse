import type { SoundId } from '../../audio';
import { useSfxCue } from '../../hooks/useSfxCue';

/** Resultado propio de una jugada: acierto, fallo o nada que sonar (`null`/`undefined`). */
export type Outcome = boolean | 'hit' | 'miss' | null | undefined;

/** Efecto del resultado: `game.hit` al acertar, `game.miss` al fallar y nada sin resultado. */
export function outcomeCue(outcome: Outcome): SoundId | null {
  if (outcome === null || outcome === undefined) return null;
  return outcome === true || outcome === 'hit' ? 'game.hit' : 'game.miss';
}

/**
 * Suena el acierto o el fallo propios una vez por `key` (la ronda, el `attemptedAt` del intento…), nunca al montar.
 * Sin resultado la clave cuenta como `null`: al llegar uno nuevo con la misma clave de antes vuelve a sonar.
 */
export function useOutcomeCue(outcome: Outcome, key: string | number | null | undefined): void {
  const cue = outcomeCue(outcome);
  useSfxCue(cue, cue === null ? null : key ?? null);
}
