import type { OddOneOutRoundResult } from '@pokemon-universe/shared/public';

/** «3 de 4 han votado» (singular con uno). */
export function votedCountText(voted: number, total: number): string {
  return `${voted} de ${total} ${voted === 1 ? 'ha votado' : 'han votado'}`;
}

/** Veredicto de la ronda para un jugador: acertó el intruso, votó otro o no votó. */
export function roundOutcome(lastRound: OddOneOutRoundResult | null, selfId: string): { title: string; tone: 'ok' | 'bad' | 'info' } {
  const vote = lastRound?.votes[selfId];
  if (!lastRound || !vote) return { title: 'Sin voto', tone: 'info' };
  return vote.optionId === lastRound.intruderOptionId ? { title: '¡Era el intruso!', tone: 'ok' } : { title: 'No era ese', tone: 'bad' };
}

/** Línea de estadísticas de un puesto: aciertos y precisión. */
export function oddStatsLine(stats: Readonly<Record<string, number | undefined>>): string {
  const correct = stats.correctVotes ?? 0;
  return `${correct} ${correct === 1 ? 'acierto' : 'aciertos'} · ${stats.accuracy ?? 0}% de precisión`;
}

/** Mejor valor de una estadística y quién lo logró (con empate, todos); `null` si nadie pasó de cero. */
function best(entries: readonly { name: string; stats: Readonly<Record<string, number | undefined>> }[], key: string) {
  const value = Math.max(0, ...entries.map((entry) => entry.stats[key] ?? 0));
  if (value <= 0) return null;
  return { value, names: entries.filter((entry) => (entry.stats[key] ?? 0) === value).map((entry) => entry.name) };
}

/** Récords de la partida: más aciertos y mejor precisión. */
export function oddRecords(entries: readonly { name: string; stats: Readonly<Record<string, number | undefined>> }[]) {
  return { correct: best(entries, 'correctVotes'), accuracy: best(entries, 'accuracy') };
}
