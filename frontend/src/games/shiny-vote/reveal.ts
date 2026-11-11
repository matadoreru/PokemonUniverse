import { secondsLabel } from '../../lib/format';

/** Lo máximo que una ronda espera a que carguen las cartas: después se juega aunque falle alguna imagen. */
export const SHINY_CARDS_TIMEOUT_MS = 4_000;

export const SHINY_CARDS_LOADING = 'Cargando cartas…';
export const SHINY_BEFORE_AFTER = { title: 'Antes / después', normal: 'Normal', shiny: 'Shiny', missing: 'Sin sprite' } as const;
export const SHINY_REVEAL_DURATION_LABEL = 'Duración de la revelación';

export function shinyRevealSecondsLabel(seconds: number): string {
  return secondsLabel(seconds);
}

/**
 * Las cartas se pueden votar cuando han cargado (o fallado) todas, o cuando pasa el límite: un sprite que no llega
 * nunca no bloquea la ronda.
 */
export function shinyCardsReady(loaded: number, total: number, elapsedMs: number, timeoutMs = SHINY_CARDS_TIMEOUT_MS): boolean {
  return loaded >= total || elapsedMs >= timeoutMs;
}

/** Puntos de la ronda para la carta propia: `null` hasta revelar; `+0` si falla o no vota. */
export function shinyRoundFeedback(roundResult: { correct: boolean; points: number } | null, voted: boolean): { tone: 'leaf' | 'berry'; label: string } | null {
  if (!roundResult) return null;
  return roundResult.correct && voted ? { tone: 'leaf', label: `+${roundResult.points}` } : { tone: 'berry', label: '+0' };
}
