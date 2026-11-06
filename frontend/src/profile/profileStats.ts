import type { ProfileDerivedMetricDefinition, ProfileMetricDefinition } from '@pokemon-universe/shared/public';

const decimal = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

function duration(milliseconds: number): string {
  return `${decimal.format(milliseconds / 1000)} s`;
}

/** Porcentaje de victorias redondeado; sin partidas, 0 %. */
export function winRate(won: number, played: number): string {
  return `${played ? Math.round((won / played) * 100) : 0} %`;
}

/** Métrica por juego que el servidor suma en cada partida sin clasificación de victorias (cooperativa). */
export const UNRANKED_GAMES_PLAYED = 'unrankedGamesPlayed';

/** Métricas guardadas visibles en el perfil: {@code unrankedGamesPlayed} es interna (descuenta partidas del winrate). */
export function visibleStoredMetrics<T extends { key: string }>(metrics: readonly T[]): T[] {
  return metrics.filter((metric) => metric.key !== UNRANKED_GAMES_PLAYED);
}

function unranked(metrics: Record<string, number>): number {
  return metrics[UNRANKED_GAMES_PLAYED] ?? 0;
}

/** Porcentaje de victorias de un juego: solo sobre sus partidas clasificadas (jugadas − sin clasificar). */
export function gameWinRate(stats: { gamesPlayed: number; gamesWon: number; metrics: Record<string, number> }): string {
  return winRate(stats.gamesWon, Math.max(0, stats.gamesPlayed - unranked(stats.metrics)));
}

/** Porcentaje de victorias global: las partidas totales menos las sin clasificar de todos los juegos. */
export function globalWinRate(
  totals: { gamesPlayed: number; gamesWon: number },
  games: readonly { stats: { metrics: Record<string, number> } }[],
): string {
  const unrankedTotal = games.reduce((sum, game) => sum + unranked(game.stats.metrics), 0);
  return winRate(totals.gamesWon, Math.max(0, totals.gamesPlayed - unrankedTotal));
}

/** Métrica guardada tal cual: número entero o duración en segundos con un decimal. */
export function formatStoredMetric(metric: ProfileMetricDefinition, value: number): string {
  return metric.format === 'DURATION_MS' ? duration(value) : integer.format(value);
}

/** Métrica derivada (porcentaje o media de otras): sin denominador, 0 % o «—». */
export function formatDerivedMetric(metric: ProfileDerivedMetricDefinition, metrics: Record<string, number>): string {
  const denominator = metric.denominator.reduce((sum, key) => sum + (metrics[key] ?? 0), 0);
  if (!denominator) return metric.kind === 'PERCENT' ? '0 %' : '—';
  const value = (metrics[metric.numerator] ?? 0) / denominator;
  if (metric.kind === 'PERCENT') return `${Math.round(value * 100)} %`;
  return metric.format === 'DURATION_MS' ? duration(value) : decimal.format(value);
}

/** Los juegos ya jugados primero, de más a menos puntos; el resto en el orden del catálogo. */
export function sortProfileGames<T extends { stats: { gamesPlayed: number; points: number } }>(games: readonly T[]): T[] {
  const played = games.filter((game) => game.stats.gamesPlayed > 0).sort((a, b) => b.stats.points - a.stats.points);
  return [...played, ...games.filter((game) => game.stats.gamesPlayed === 0)];
}
