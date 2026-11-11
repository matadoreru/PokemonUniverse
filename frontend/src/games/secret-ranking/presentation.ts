import type { GamePhase, SecretRankingRoundResult } from '@pokemon-universe/shared/public';
import type { PhaseStep, ProgressStatus } from '../../room/social-kit';
import { joinNames } from '../../lib/format';

/**
 * Lógica de la pantalla de Secret Ranking: mover un Pokémon de la lista (y a qué botón va el foco), fases, títulos,
 * región viva, distancias y el veredicto propio de la revelación.
 */

/** Distancia máxima (Spearman footrule) entre dos órdenes de cinco Pokémon: 4 + 2 + 0 + 2 + 4. */
export const MAX_RANKING_DISTANCE = 12;

export type MoveDirection = -1 | 1;
export type MoveButton = 'up' | 'down';

/** Sube (`-1`) o baja (`1`) el elemento `index` un puesto; fuera de los extremos devuelve el mismo orden. */
export function moveRankingItem<T>(order: readonly T[], index: number, direction: MoveDirection): T[] {
  const target = index + direction;
  if (index < 0 || index >= order.length || target < 0 || target >= order.length) return [...order];
  const next = [...order];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/**
 * Botón al que va el foco tras mover un elemento a `newIndex`: el de la misma dirección (para seguir subiendo o bajando
 * con Intro) salvo si el elemento ha llegado al extremo, donde ese botón se deshabilita: entonces, el contrario.
 */
export function rankingFocusAfterMove(newIndex: number, length: number, direction: MoveDirection): MoveButton {
  if (direction === -1) return newIndex <= 0 ? 'down' : 'up';
  return newIndex >= length - 1 ? 'up' : 'down';
}

/** Texto de la región viva al mover: «Pikachu pasa al puesto 2.». */
export function rankingMoveText(name: string, position: number): string {
  return `${name} pasa al puesto ${position}.`;
}

/** Fases de la ronda: ordenar y el resultado. */
export const secretRankingSteps: readonly PhaseStep[] = [
  { key: 'order', label: 'Ordenar' },
  { key: 'result', label: 'Resultado' },
];

export function secretRankingCurrentStep(phase: GamePhase): string | null {
  if (phase === 'ROUND_ACTIVE') return 'order';
  if (phase === 'ROUND_RESULTS') return 'result';
  return null;
}

/** Título (`h1`) de la fase. */
export function secretRankingHeading(phase: GamePhase, result: SecretRankingRoundResult | null, locked: boolean): string {
  if (phase === 'ROUND_ACTIVE') return locked ? 'Ranking bloqueado' : 'Ordena el ranking';
  if (phase === 'ROUND_RESULTS' && result) return result.consensus.length ? 'El consenso del grupo' : 'Sin rankings';
  return 'Preparando la ronda…';
}

/** Distancia con dos decimales, en castellano («1,50»). */
export function formatDistance(distance: number): string {
  return distance.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Jugadores de la revelación, del más cercano al grupo al más lejano; quien no envió ranking (o no tuvo con quién compararse), al final. */
export function rankingStandings(result: SecretRankingRoundResult): string[] {
  return Object.entries(result.players)
    .sort(([leftId, left], [rightId, right]) => (left.position ?? Infinity) - (right.position ?? Infinity) || Number(right.ranking !== null) - Number(left.ranking !== null) || leftId.localeCompare(rightId))
    .map(([playerId]) => playerId);
}

/** Quién quedó más cerca del grupo (puesto 1; con empate, varios). */
export function rankingClosest(result: SecretRankingRoundResult): string[] {
  return Object.entries(result.players).filter(([, player]) => player.position === 1).map(([playerId]) => playerId);
}

/** Resumen de la revelación en una frase (también para la región viva). */
export function secretRankingSummary(result: SecretRankingRoundResult, nameOf: (playerId: string) => string): string {
  if (!result.consensus.length) return 'Nadie completó el ranking a tiempo.';
  const closest = rankingClosest(result);
  if (!closest.length) return 'Solo llegó un ranking: no hubo con quién compararlo.';
  const distance = result.players[closest[0]!]?.distance ?? 0;
  if (closest.length > 1) return `Empate en cabeza entre ${joinNames(closest.map(nameOf))}, a distancia ${formatDistance(distance)}.`;
  return distance === 0 ? `${nameOf(closest[0]!)} coincidió del todo con el grupo.` : `${nameOf(closest[0]!)} fue quien más se acercó al grupo, a distancia ${formatDistance(distance)}.`;
}

/**
 * Texto de la única región viva: el último movimiento de la lista (cada uno distinto del anterior, ver `moveSeq`), el
 * ranking bloqueado o el resumen de la revelación.
 */
export function secretRankingAnnouncement({ phase, roundNumber, locked, move, moveSeq = 0, result, nameOf }: {
  phase: GamePhase;
  roundNumber: number;
  locked: boolean;
  /** Último movimiento de esta ronda, ya en texto (`rankingMoveText`). */
  move: string | null;
  /**
   * Número del movimiento: alterna un espacio de ancho cero al final para que dos textos iguales seguidos (subir y
   * volver a bajar al mismo puesto) se anuncien los dos.
   */
  moveSeq?: number;
  result: SecretRankingRoundResult | null;
  nameOf(playerId: string): string;
}): string {
  if (phase === 'ROUND_ACTIVE') {
    if (locked) return 'Ranking bloqueado. El resultado sale cuando terminen todos o se acabe el tiempo.';
    if (move) return moveSeq % 2 ? `${move}\u200b` : move;
    return `Ronda ${roundNumber}: ordena los cinco Pokémon.`;
  }
  if (phase === 'ROUND_RESULTS' && result) return `Ronda ${roundNumber} terminada. ${secretRankingSummary(result, nameOf)}`;
  return '';
}

/** Estado de un jugador en la revelación («1.º puesto», «Sin ranking»…), en texto. */
export function rankingPlayerStatus(result: SecretRankingRoundResult, playerId: string): ProgressStatus {
  const player = result.players[playerId];
  if (!player?.ranking) return { tone: 'bad', text: 'Sin ranking' };
  if (player.position === null) return { tone: 'neutral', text: 'Sin con quién comparar' };
  if (player.position === 1) return { tone: 'ok', text: player.distance === 0 ? 'Coincidencia perfecta' : 'El más cercano' };
  return { tone: 'neutral', text: `${player.position}.º puesto` };
}

/** Puesto que dio cada jugador a un Pokémon (o `null` si no envió ranking). */
export function rankingPositionOf(result: SecretRankingRoundResult, playerId: string, pokemonId: string): number | null {
  const ranking = result.players[playerId]?.ranking;
  if (!ranking) return null;
  const index = ranking.findIndex((pokemon) => pokemon.id === pokemonId);
  return index < 0 ? null : index + 1;
}

/** Veredicto propio de la revelación (kicker de la placa) y los puntos ganados. */
export function secretRankingVerdict(result: SecretRankingRoundResult, selfId: string, participating: boolean): { tone: 'ok' | 'bad' | 'info'; text: string; points: number } {
  if (!participating) return { tone: 'info', text: 'Estás observando', points: 0 };
  const own = result.players[selfId];
  const points = own?.pointsAwarded ?? 0;
  if (!own?.ranking) return { tone: 'bad', text: 'No enviaste ranking', points };
  if (own.position === null || own.distance === null) return { tone: 'info', text: 'Nadie más envió ranking', points };
  if (own.position === 1) return { tone: 'ok', text: own.distance === 0 ? '¡Coincidiste del todo con el grupo!' : '¡Fuiste quien más se acercó!', points };
  return { tone: 'info', text: `Quedaste ${own.position}.º · distancia ${formatDistance(own.distance)}`, points };
}

/**
 * Envía el ranking de la ronda: `busy` en esa ronda mientras se envía y, tras el éxito, hasta que el servidor devuelve
 * el ranking propio (sin doble envío). Si el servidor lo rechaza, se suelta el botón y se devuelve `false`: el fallo ya
 * sale en el aviso global de la sala (un dueño por error).
 */
export async function submitRanking(round: number, submit: () => Promise<void>, setBusyRound: (update: (current: number | null) => number | null) => void): Promise<boolean> {
  setBusyRound(() => round);
  try {
    await submit();
    return true;
  } catch {
    setBusyRound((current) => (current === round ? null : current));
    return false;
  }
}

type Stats = Record<string, number | undefined>;
const num = (stats: Stats, key: string) => Number(stats[key] ?? 0);

/** Distancia media de las rondas en las que envió ranking (o `null` sin ninguna). */
export function averageDistance(stats: Stats): number | null {
  const submitted = num(stats, 'rankingsSubmitted');
  return submitted > 0 ? num(stats, 'distanceTotal') / submitted : null;
}

/** Línea de métricas de la clasificación: victorias de ronda, coincidencias perfectas, rankings enviados y distancia media. */
export function secretRankingStatsLine(stats: Stats): string {
  const wins = num(stats, 'roundWins');
  const perfect = num(stats, 'perfectMatches');
  const average = averageDistance(stats);
  return [
    `${wins} ${wins === 1 ? 'victoria' : 'victorias'}`,
    `${perfect} ${perfect === 1 ? 'coincidencia perfecta' : 'coincidencias perfectas'}`,
    `${num(stats, 'rankingsSubmitted')}/${num(stats, 'roundsPlayed')} rankings`,
    `distancia media ${average === null ? '—' : formatDistance(average)}`,
  ].join(' · ');
}

/** Récord de la menor distancia media entre quienes enviaron algún ranking (una media de 0 también cuenta). */
export function closestAverage(entries: readonly { name: string; stats: Stats }[]): { value: number; names: string[] } | null {
  const scored = entries.flatMap((entry) => { const value = averageDistance(entry.stats); return value === null ? [] : [{ name: entry.name, value }]; });
  if (!scored.length) return null;
  const best = Math.min(...scored.map((entry) => entry.value));
  return { value: best, names: scored.filter((entry) => entry.value === best).map((entry) => entry.name) };
}
