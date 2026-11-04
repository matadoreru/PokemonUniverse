import type { GamePhase, RoomMemberView } from '@pokemon-universe/shared/public';
import { apiAsset } from '../../lib/api';

/**
 * Lógica pura del kit de adivinar (Who's That, Zoomed, Palette, Cry, Pokédex Entry y Guess from Stats): qué placa
 * toca abajo, a dónde va el foco, qué dice la región viva, el marcador en vivo y el orden de la revelación. Los seis
 * juegos comparten la forma de sus estados (intentos, aciertos, enfriamiento); aquí se normaliza lo que cambia.
 */

/** Puesto ordinal («1.º»). */
export const ordinal = (value: number) => `${value}.º`;

/** Segundos con una cifra decimal («1.0s»), como siempre en estos juegos. */
export const guessSeconds = (ms: number) => `${(ms / 1_000).toFixed(1)}s`;

/** «1 intento» / «N intentos». */
export const attemptsText = (count: number) => `${count} ${count === 1 ? 'intento' : 'intentos'}`;

/** «+N puntos» en palabras («punto» en singular). */
export const pointsWord = (value: number) => (value === 1 ? 'punto' : 'puntos');

/** Los sprites llegan como ruta del proxy opaco (`/api/...`); se sirven desde el origen de la API. */
export const guessSprite = (sprite: string) => (sprite.startsWith('/api/') ? apiAsset(sprite) : sprite);

/** Pantalla inferior: qué placa toca. */
export type GuessPanelKind = 'guess' | 'solved' | 'watching' | 'out' | 'waiting' | 'reveal';

/**
 * Placa de la pantalla inferior. `participating` lo calcula el juego (rol `PLAYER` del miembro o `player.role`). En
 * `ROUND_RESULTS` sin `lastRound` (no debería pasar) se espera.
 *
 * Un jugador que no puede adivinar en plena ronda sin haber acertado es `out`: entró con la partida empezada (el motor
 * fija sus jugadores al empezar y lo rechaza toda la partida), así que «Esperando al servidor…» mentiría.
 */
export function guessPanelKind(phase: GamePhase, player: { participating: boolean; canGuess: boolean; solved: boolean } | null, hasLastRound: boolean): GuessPanelKind {
  if (phase === 'ROUND_RESULTS') return hasLastRound ? 'reveal' : 'waiting';
  if (phase !== 'ROUND_ACTIVE' || !player) return 'waiting';
  if (!player.participating) return 'watching';
  if (player.solved) return 'solved';
  return player.canGuess ? 'guess' : 'out';
}

/** Clave del foco (ver `useFocusOnTransition`): al acertar y al revelar, el título de la placa inferior. */
export function guessFocusKey(kind: GuessPanelKind, roundNumber: number): string | null {
  return kind === 'solved' || kind === 'reveal' ? `${kind}-${roundNumber}` : null;
}

/**
 * Quién ha acertado ya y en qué orden. Unos juegos mandan `solvedPlayers` (lista) y otros `solves` (registro por
 * jugador, p. ej. Zoomed): los dos se normalizan a un mapa jugador → orden.
 */
export function guessSolvedOrders(solved: readonly { playerId: string; solveOrder: number }[] | Readonly<Record<string, { solveOrder: number }>>): Map<string, number> {
  if (Array.isArray(solved)) return new Map(solved.map((entry) => [entry.playerId, entry.solveOrder]));
  return new Map(Object.entries(solved as Readonly<Record<string, { solveOrder: number }>>).map(([playerId, entry]) => [playerId, entry.solveOrder]));
}

/** Un intento público (incorrecto) de la ronda, como lo mandan los seis juegos. */
export interface GuessAttemptLike {
  playerId: string;
  guessedPokemon: { name: string; sprite: string };
  attemptedAt: number;
}

/** El último intento (fallido) propio de la ronda, o `null`. */
export function guessOwnLastAttempt<A extends GuessAttemptLike>(attempts: readonly A[], selfId: string): A | null {
  for (let index = attempts.length - 1; index >= 0; index--) if (attempts[index]!.playerId === selfId) return attempts[index]!;
  return null;
}

/** Fila del marcador en vivo. */
export interface GuessScoreLine {
  member: RoomMemberView;
  points: number;
  /** Con los mismos puntos, el mismo puesto. */
  position: number;
  /** Índice del jugador en la sala (para `playerColor`). */
  colorIndex: number;
  /** Orden de acierto en esta ronda, si ya acertó. */
  solveOrder: number | undefined;
  /** Comparte puesto con otro y tiene puntos (un empate a cero, al empezar, no cuenta). */
  tied: boolean;
}

/** Marcador en vivo: los jugadores (sin espectadores) por puntos y, a igualdad, por nombre. */
export function guessScoreboard(members: readonly RoomMemberView[], scores: Readonly<Record<string, number>>, solved: ReadonlyMap<string, number>): GuessScoreLine[] {
  const colorIndex = new Map(members.map((member, index) => [member.id, index]));
  const sorted = members
    .filter((member) => member.role !== 'SPECTATOR')
    .map((member) => ({ member, points: scores[member.id] ?? 0 }))
    .sort((left, right) => right.points - left.points || left.member.displayName.localeCompare(right.member.displayName));
  const points = sorted.map((line) => line.points);
  return sorted.map(({ member, points: own }) => {
    const position = points.indexOf(own) + 1;
    return { member, points: own, position, colorIndex: colorIndex.get(member.id) ?? 0, solveOrder: solved.get(member.id), tied: own > 0 && points.filter((value) => value === own).length > 1 };
  });
}

/** Lo que cuenta la revelación de un acierto (los seis juegos lo tienen; Zoomed o Stats añaden más en `detail`). */
export interface GuessRevealSolveLike {
  solveOrder: number;
  elapsedMs: number;
  points: number;
  attempts?: number;
}

/** Fila de la revelación. */
export interface GuessRevealLine<S extends GuessRevealSolveLike = GuessRevealSolveLike> {
  member: RoomMemberView;
  colorIndex: number;
  solve: S | null;
  /** Intentos de la ronda: `attemptCounts` del resultado o, si no lo hay, los del acierto. */
  attempts: number;
}

/** Revelación: los jugadores (sin espectadores) por orden de acierto; los que no acertaron, detrás en el orden de la sala. */
export function guessRevealLines<S extends GuessRevealSolveLike>(members: readonly RoomMemberView[], solves: Readonly<Record<string, S>>, attemptCounts?: Readonly<Record<string, number>>): GuessRevealLine<S>[] {
  return members
    .map((member, colorIndex) => ({ member, colorIndex, solve: solves[member.id] ?? null, attempts: attemptCounts?.[member.id] ?? solves[member.id]?.attempts ?? 0 }))
    .filter((line) => line.member.role !== 'SPECTATOR')
    .sort((left, right) => (left.solve?.solveOrder ?? Infinity) - (right.solve?.solveOrder ?? Infinity) || left.colorIndex - right.colorIndex);
}

/** Cómo acabó la ronda para quien mira (el kicker de la placa inferior en la revelación). */
export interface GuessVerdict { tone: 'ok' | 'bad' | 'info'; text: string; points: number }

export function guessVerdict(solves: Readonly<Record<string, { solveOrder: number; points: number }>>, selfId: string, participating: boolean): GuessVerdict {
  const solve = solves[selfId];
  if (solve) return { tone: 'ok', text: `¡Acertaste! ${ordinal(solve.solveOrder)} en acertar`, points: solve.points };
  if (!participating) return { tone: 'info', text: 'Estás observando', points: 0 };
  return { tone: 'bad', text: 'Esta vez no acertaste', points: 0 };
}

/**
 * Aviso de la única región viva de la pantalla (solo para lectores). Cada estado da un texto fijo, sin cuentas que
 * cambien cada décima: un fallo se anuncia una vez (aunque el contador del enfriamiento siga corriendo a la vista), un
 * acierto propio una vez y la revelación una vez. No repite los textos visibles que buscan las E2E por texto exacto.
 */
export function guessAnnouncement({ kind, roundNumber, answer, solveOrder, roundPoints, lastWrong, attemptCount }: {
  kind: GuessPanelKind;
  roundNumber: number;
  /** Revelación: lo que era («Lucario», o «3 respuestas válidas»). */
  answer?: string | null;
  solveOrder?: number | null;
  roundPoints?: number;
  /** Último intento fallido propio de la ronda (nombre del Pokémon), si lo hay. */
  lastWrong?: string | null;
  /** Intentos propios de la ronda: dos fallos seguidos con el mismo nombre se anuncian los dos. */
  attemptCount?: number;
}): string {
  if (kind === 'reveal') return answer ? `Ronda ${roundNumber} terminada: era ${answer}.` : `Ronda ${roundNumber} terminada.`;
  if (kind === 'solved') return `Acierto${solveOrder ? `, ${ordinal(solveOrder)} en acertar` : ''}: ${roundPoints ?? 0} ${pointsWord(roundPoints ?? 0)} esta ronda.`;
  if (kind === 'guess' && lastWrong) return `Incorrecto${attemptCount ? ` (${attemptsText(attemptCount)})` : ''}: ${lastWrong} no era. Hay una breve espera antes del siguiente intento.`;
  return '';
}
