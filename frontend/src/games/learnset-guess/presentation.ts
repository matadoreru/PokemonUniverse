import type { GamePhase, GameResults, LearnsetGuessPlayerState, LearnsetGuessPublicState, LearnsetMoveGroup, LearnsetMoveHint, LearnsetRoundResult, MoveCategory, PokemonType } from '@pokemon-universe/shared/public';
import { pokemonTypeLabels } from '../../components/PokemonTypeBadge';

/** Nombre de un tipo en español (el color del tipo nunca va solo). */
export const typeLabel = (type: PokemonType) => pokemonTypeLabels[type];

/** Nombre de la categoría de un movimiento. */
export const categoryLabel: Record<MoveCategory, string> = { physical: 'Físico', special: 'Especial', status: 'Estado' };

/** Puesto ordinal («1.º»). */
export const ordinal = (value: number) => `${value}.º`;

/**
 * Orden de las pistas en pantalla: la última que ha entrado arriba (así se ve sin desplazar, también en el móvil) y,
 * dentro de las iniciales, por nivel como llegan del servidor. Orden estable.
 */
export function learnsetClueOrder(groups: readonly LearnsetMoveGroup[]): LearnsetMoveGroup[] {
  return groups.map((group, index) => ({ group, index })).sort((left, right) => right.group.stage - left.group.stage || left.index - right.index).map(({ group }) => group);
}

/** Etapa más alta visible (0 = solo las pistas iniciales). */
export const learnsetLatestStage = (groups: readonly { stage: number }[]) => Math.max(0, ...groups.map((group) => group.stage));

/** Pantalla inferior: qué placa toca. */
export type LearnsetPlateKind = 'guess' | 'solved' | 'watching' | 'reveal' | 'waiting';

export function learnsetPlateKind(phase: GamePhase, player: Pick<LearnsetGuessPlayerState, 'canGuess' | 'solved'> | null, hasLastRound: boolean): LearnsetPlateKind {
  if (phase === 'ROUND_RESULTS') return hasLastRound ? 'reveal' : 'waiting';
  if (phase !== 'ROUND_ACTIVE') return 'waiting';
  if (player?.solved) return 'solved';
  return player?.canGuess ? 'guess' : 'watching';
}

/** Clave del foco (ver `useFocusOnTransition`): al acertar y al revelar, el título de la placa inferior. */
export function learnsetFocusKey(kind: LearnsetPlateKind, roundNumber: number): string | null {
  return kind === 'solved' || kind === 'reveal' ? `${kind}-${roundNumber}` : null;
}

/** Cómo acabó la ronda para quien mira (texto del kicker de la placa en la revelación). */
export function learnsetVerdict(lastRound: LearnsetRoundResult, selfId: string, isPlayer: boolean): { tone: 'ok' | 'bad' | 'info'; text: string; points: number } {
  const solve = lastRound.solves[selfId];
  if (solve) return { tone: 'ok', text: `¡Acertaste! ${ordinal(solve.solveOrder)} en acertar`, points: solve.points };
  if (!isPlayer) return { tone: 'info', text: 'Estás observando', points: 0 };
  return { tone: 'bad', text: 'Esta vez no acertaste', points: 0 };
}

/** «Pistas iniciales» o «Después de N reveals» (texto de siempre). */
export const learnsetStageText = (stage: number) => stage === 0 ? 'Pistas iniciales' : `Después de ${stage} reveal${stage === 1 ? '' : 's'}`;

/** Texto de un movimiento para los lectores («Nv. 12 · Aguante»). */
export const moveText = (move: LearnsetMoveHint) => `${move.level !== null ? `Nv. ${move.level} · ` : ''}${move.name}`;

/**
 * Aviso de la región viva (solo para lectores): la pista nueva, el acierto propio y la revelación. No repite los textos
 * que buscan las E2E por texto exacto (el enfriamiento, «¡Has acertado!»).
 */
export function learnsetAnnouncement({ kind, game, roundPoints }: { kind: LearnsetPlateKind; game: Pick<LearnsetGuessPublicState, 'roundNumber' | 'visibleGroups' | 'lastRound'>; roundPoints: number }): string {
  if (kind === 'reveal' && game.lastRound) return `Ronda ${game.roundNumber} terminada: era ${game.lastRound.pokemon.name}.`;
  if (kind === 'solved') return `Acierto: ${roundPoints} ${roundPoints === 1 ? 'punto' : 'puntos'} esta ronda.`;
  const stage = learnsetLatestStage(game.visibleGroups);
  if (stage === 0) return '';
  const moves = game.visibleGroups.filter((group) => group.stage === stage).flatMap((group) => group.moves.map(moveText));
  return `Nueva pista: ${moves.join(', ')}.`;
}

type Stats = GameResults['standings'][number]['stats'];
const num = (stats: Stats, key: string) => Number(stats[key] ?? 0);

/** Línea de estadísticas de un jugador en los resultados (las cuentas de siempre). */
export function learnsetStatsLine(stats: Stats): string {
  const correct = num(stats, 'correct');
  const missed = num(stats, 'missed');
  const total = correct + missed;
  const accuracy = total ? Math.round(correct / total * 100) : 0;
  const average = correct ? (num(stats, 'pointsFromSolves') / correct).toFixed(1) : '0';
  return `${correct} ${correct === 1 ? 'acierto' : 'aciertos'} · ${missed} ${missed === 1 ? 'fallo' : 'fallos'} · ${accuracy}% · media ${average} pts`;
}

/** Récord de la partida: el valor (en texto) y quién lo tiene (empates juntos); `null` si nadie lo consiguió. */
export interface LearnsetRecord { value: string; names: string[] }

function best(entries: readonly { name: string; stats: Stats }[], key: string): { value: number; names: string[] } | null {
  const scored = entries.map((entry) => ({ name: entry.name, value: num(entry.stats, key) })).filter((entry) => entry.value > 0);
  if (scored.length === 0) return null;
  const top = Math.max(...scored.map((entry) => entry.value));
  return { value: top, names: scored.filter((entry) => entry.value === top).map((entry) => entry.name) };
}

/** Récords: más aciertos, más aciertos con las pistas iniciales y la mejor ronda (puntos). */
export function learnsetRecords(entries: readonly { name: string; stats: Stats }[]): { correct: LearnsetRecord | null; initial: LearnsetRecord | null; bestRound: LearnsetRecord | null } {
  const correct = best(entries, 'correct');
  const initial = best(entries, 'initialSolves');
  const bestRound = best(entries, 'bestRoundPoints');
  return {
    correct: correct && { value: String(correct.value), names: correct.names },
    initial: initial && { value: String(initial.value), names: initial.names },
    bestRound: bestRound && { value: `+${bestRound.value}`, names: bestRound.names },
  };
}

/** Puestos del marcador en vivo (ya ordenado): con los mismos puntos, el mismo puesto. */
export function learnsetPositions(points: readonly number[]): number[] {
  return points.map((value) => points.indexOf(value) + 1);
}
