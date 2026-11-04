import type { GameResults, PokemonLegendaryStatus, WhosThatPokemonHint } from '@pokemon-universe/shared/public';
import { pokemonTypeLabels } from '../../components/PokemonTypeBadge';

const categoryLabels: Record<PokemonLegendaryStatus, string> = { NORMAL: 'No legendario', LEGENDARY: 'Legendario', MYTHICAL: 'Mítico' };

/** Texto de una pista adicional (los de siempre). */
export function describeWhosThatHint(hint: WhosThatPokemonHint): string {
  if (hint.kind === 'GENERATION') return `Generación ${hint.value}`;
  if (hint.kind === 'TYPE') return `Uno de sus tipos es ${pokemonTypeLabels[hint.value]}`;
  if (hint.kind === 'TYPE_COUNT') return hint.value === 1 ? 'Es monotipo' : 'Tiene dos tipos';
  if (hint.kind === 'CATEGORY') return categoryLabels[hint.value];
  if (hint.stages <= 1) return 'No evoluciona';
  if (hint.stage === 1) return 'Pokémon base';
  if (hint.stage >= hint.stages) return 'Evolución final';
  return 'Evolución intermedia';
}

type Stats = GameResults['standings'][number]['stats'];
const num = (stats: Stats, key: string) => Number(stats[key] ?? 0);
const seconds = (ms: number) => `${(ms / 1_000).toFixed(1)}s`;

/**
 * Métricas de un jugador en los resultados, en texto (las cuentas de siempre): aciertos, sin acertar, intentos,
 * precisión, media, mejor tiempo y al primer intento.
 */
export function whosThatStatsLine(stats: Stats): string {
  const correct = num(stats, 'correct');
  const missed = num(stats, 'missed');
  const attempts = num(stats, 'totalAttempts');
  const accuracy = attempts ? Math.round(correct / attempts * 100) : 0;
  const average = correct ? num(stats, 'solveTimeTotalMs') / correct : 0;
  const best = num(stats, 'bestTimeMs');
  return [
    `${correct} ${correct === 1 ? 'acierto' : 'aciertos'}`,
    `${missed} sin acertar`,
    `${attempts} ${attempts === 1 ? 'intento' : 'intentos'}`,
    `${accuracy}% precisión`,
    `media ${seconds(average)}`,
    `mejor ${best ? seconds(best) : '—'}`,
    `${num(stats, 'firstTry')} al primer intento`,
  ].join(' · ');
}

/** Récord de la partida: el valor (en texto) y quién lo tiene (empates juntos); `null` si nadie lo consiguió. */
export interface WhosThatRecord { value: string; names: string[] }

function top(entries: readonly { name: string; stats: Stats }[], key: string, lowest = false): { value: number; names: string[] } | null {
  const scored = entries.map((entry) => ({ name: entry.name, value: num(entry.stats, key) })).filter((entry) => entry.value > 0);
  if (scored.length === 0) return null;
  const best = lowest ? Math.min(...scored.map((entry) => entry.value)) : Math.max(...scored.map((entry) => entry.value));
  return { value: best, names: scored.filter((entry) => entry.value === best).map((entry) => entry.name) };
}

/** Récords: más aciertos, el acierto más rápido (el mínimo, no el máximo) y más aciertos al primer intento. */
export function whosThatRecords(entries: readonly { name: string; stats: Stats }[]): { correct: WhosThatRecord | null; fastest: WhosThatRecord | null; firstTry: WhosThatRecord | null } {
  const correct = top(entries, 'correct');
  const fastest = top(entries, 'bestTimeMs', true);
  const firstTry = top(entries, 'firstTry');
  return {
    correct: correct && { value: String(correct.value), names: correct.names },
    fastest: fastest && { value: seconds(fastest.value), names: fastest.names },
    firstTry: firstTry && { value: String(firstTry.value), names: firstTry.names },
  };
}
