import type { GameResults } from '@pokemon-universe/shared/public';
import { guessSeconds } from './presentation';

/**
 * Métricas y récords de los resultados de los seis juegos de adivinar. Todos comparten la misma base de estadísticas
 * por jugador (`correct`, `missed`, `totalAttempts`, `firstTry`, `solveTimeTotalMs`, `bestTimeMs`, `pointsFromRounds`)
 * y, para «primero en acertar la ronda», `roundFirsts` (Zoomed lo llama `firstPositions`).
 */

export type GuessStats = GameResults['standings'][number]['stats'];
const num = (stats: GuessStats, key: string) => Number(stats[key] ?? 0);

/** Veces que fue el primero en acertar una ronda (`roundFirsts`, o `firstPositions` en Zoomed). */
export const guessRoundFirsts = (stats: GuessStats) => num(stats, stats.roundFirsts !== undefined ? 'roundFirsts' : 'firstPositions');

/** El mejor valor (mayor, o menor con `lowest`) de una estadística entre los que la tienen por encima de 0, con sus empates. */
export function guessTop(entries: readonly { name: string; stats: GuessStats }[], key: string | ((stats: GuessStats) => number), lowest = false): { value: number; names: string[] } | null {
  const read = typeof key === 'string' ? (stats: GuessStats) => num(stats, key) : key;
  const scored = entries.map((entry) => ({ name: entry.name, value: read(entry.stats) })).filter((entry) => entry.value > 0);
  if (scored.length === 0) return null;
  const values = scored.map((entry) => entry.value);
  const best = lowest ? Math.min(...values) : Math.max(...values);
  return { value: best, names: scored.filter((entry) => entry.value === best).map((entry) => entry.name) };
}

/**
 * Línea de métricas de un jugador en texto: aciertos, sin acertar, intentos, precisión, media, mejor tiempo y al primer
 * intento, más los `extras` propios del juego («3 a máximo zoom»). Sin aciertos, la media y el mejor tiempo son «—».
 */
export function guessStatsLine(stats: GuessStats, extras: readonly string[] = []): string {
  const correct = num(stats, 'correct');
  const missed = num(stats, 'missed');
  const attempts = num(stats, 'totalAttempts');
  const accuracy = attempts ? Math.round(correct / attempts * 100) : 0;
  const best = num(stats, 'bestTimeMs');
  return [
    `${correct} ${correct === 1 ? 'acierto' : 'aciertos'}`,
    `${missed} sin acertar`,
    `${attempts} ${attempts === 1 ? 'intento' : 'intentos'}`,
    `${accuracy}% precisión`,
    `media ${correct ? guessSeconds(num(stats, 'solveTimeTotalMs') / correct) : '—'}`,
    `mejor ${correct && best ? guessSeconds(best) : '—'}`,
    `${num(stats, 'firstTry')} al primer intento`,
    ...extras,
  ].join(' · ');
}

/** Récord de la partida: el valor en texto y quién lo tiene (empates juntos); `null` si nadie lo consiguió. */
export interface GuessRecord { value: string; names: string[] }

const record = (top: { value: number; names: string[] } | null, format: (value: number) => string = String): GuessRecord | null => top && { value: format(top.value), names: top.names };

/**
 * Récords comunes: más aciertos, el acierto más rápido (el mínimo de `bestTimeMs`), más aciertos al primer intento y
 * más veces primero en acertar una ronda (`roundFirsts`/`firstPositions`). Cada juego elige cuáles pinta en `ResultsRecords`.
 */
export function guessRecords(entries: readonly { name: string; stats: GuessStats }[]): { correct: GuessRecord | null; fastest: GuessRecord | null; firstTry: GuessRecord | null; roundFirsts: GuessRecord | null } {
  return {
    correct: record(guessTop(entries, 'correct')),
    fastest: record(guessTop(entries, 'bestTimeMs', true), guessSeconds),
    firstTry: record(guessTop(entries, 'firstTry')),
    roundFirsts: record(guessTop(entries, guessRoundFirsts)),
  };
}
