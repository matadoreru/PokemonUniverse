import type { ConnectionAttemptFeedback, ConnectionPlayerStatus, PokemonConnectionsPlayerState, PokemonConnectionsPublicState } from '@pokemon-universe/shared/public';

/** Estado de un jugador en texto (además del color del chip). */
export const connectionsStatusLabels: Record<ConnectionPlayerStatus, string> = { PLAYING: 'Resolviendo', SOLVED: 'Completado', ELIMINATED: 'Sin intentos', TIMED_OUT: 'Sin tiempo' };

export const connectionsStatusTone = (status: ConnectionPlayerStatus): 'ok' | 'bad' | 'info' => status === 'SOLVED' ? 'ok' : status === 'PLAYING' ? 'info' : 'bad';

const plural = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

/** Lo que dice el último intento propio: «Grupo encontrado», «Te falta uno» o «Ese grupo no conecta». */
export function connectionsFeedbackText(feedback: ConnectionAttemptFeedback | null): string | null {
  if (!feedback) return null;
  if (feedback.kind === 'CORRECT') return 'Grupo encontrado';
  return feedback.nearMiss ? 'Te falta uno' : 'Ese grupo no conecta';
}

/** Errores que quedan, en texto: «Quedan 3 errores de 4». */
export function connectionsLivesText(mistakesUsed: number, mistakesAllowed: number): string {
  const left = Math.max(0, mistakesAllowed - mistakesUsed);
  return `${left === 1 ? 'Queda' : 'Quedan'} ${plural(left, 'error', 'errores')} de ${mistakesAllowed}`;
}

/** Pantalla inferior: qué placa toca. */
export type ConnectionsPlateKind = 'select' | 'solved' | 'eliminated' | 'watching' | 'reveal' | 'waiting';

export function connectionsPlateKind(phase: PokemonConnectionsPublicState['phase'], player: PokemonConnectionsPlayerState | null, revealed: boolean): ConnectionsPlateKind {
  if (phase === 'ROUND_RESULTS' && revealed) return 'reveal';
  if (phase !== 'ROUND_ACTIVE') return 'waiting';
  if (!player || player.role !== 'PLAYER') return 'watching';
  if (player.status === 'SOLVED') return 'solved';
  if (player.status !== 'PLAYING' || !player.canSubmit) return 'eliminated';
  return 'select';
}

/**
 * Clave del foco (ver `useFocusOnTransition`): tras cada intento propio (al enviar, la selección se vacía y la píldora
 * «Comprobar» queda deshabilitada: el foco no debe caer al `body`) y al revelar, el título de la placa.
 */
export function connectionsFocusKey(kind: ConnectionsPlateKind, roundNumber: number, feedback: ConnectionAttemptFeedback | null, fresh = true): string | null {
  if (kind === 'reveal') return `reveal-${roundNumber}`;
  if (kind === 'waiting' || kind === 'watching' || !feedback || !fresh) return null;
  return `attempt-${roundNumber}-${feedback.attemptedAt}`;
}

/**
 * Aviso de la única región viva de la pantalla: el resultado del último intento (con los errores que quedan o el grupo
 * encontrado), el tablero completado o sin intentos, y el cierre de la ronda. La selección no se anuncia: cada carta ya
 * dice si está pulsada (`aria-pressed`).
 */
export function connectionsAnnouncement({ kind, roundNumber, groupSize, player, foundLabel, found, groupCount }: {
  kind: ConnectionsPlateKind;
  roundNumber: number;
  groupSize: number;
  player: PokemonConnectionsPlayerState | null;
  /** Tema del último grupo encontrado (solo el propio). */
  foundLabel: string | null;
  /** Grupos propios encontrados: en la ronda, los del jugador; al revelar, los de su resultado. */
  found: number;
  groupCount: number;
}): string {
  const own = player?.role === 'PLAYER' ? player : null;
  switch (kind) {
    case 'reveal': return own ? `Puzle ${roundNumber} terminado: encontraste ${found} de ${groupCount} grupos.` : `Puzle ${roundNumber} terminado: ya se ven todas las conexiones.`;
    case 'solved': return `Tablero completado, ${own?.completionRank ?? 0}.º en terminar: ${plural(own?.roundPoints ?? 0, 'punto', 'puntos')} esta ronda.`;
    case 'eliminated': return own?.status === 'ELIMINATED' ? 'Sin intentos: has agotado los errores. Esperando al resto del grupo.' : 'Ya no puedes enviar más grupos en esta ronda.';
    case 'watching': return `Puzle ${roundNumber}: estás observando.`;
    case 'waiting': return 'Preparando el puzle.';
    default: {
      const feedback = own?.lastAttempt ?? null;
      if (!own || !feedback) return `Puzle ${roundNumber}: selecciona ${groupSize} Pokémon que compartan una conexión.`;
      if (feedback.kind === 'CORRECT') return `Correcto: ${foundLabel ?? 'grupo encontrado'}. Llevas ${found} de ${groupCount}.`;
      const lives = connectionsLivesText(own.mistakesUsed, own.mistakesAllowed);
      return feedback.nearMiss ? `Casi: te falta uno. ${lives}.` : `Incorrecto: ese grupo no conecta. ${lives}.`;
    }
  }
}

/** Línea de una fila de la revelación: «3/4 grupos · 12.0s · 1 error». */
export function connectionsRoundLine(player: { foundGroups: number; elapsedMs: number | null; mistakesUsed: number }, groupCount: number): string {
  const time = player.elapsedMs !== null ? ` · ${(player.elapsedMs / 1_000).toFixed(1)}s` : '';
  return `${player.foundGroups}/${groupCount} grupos${time} · ${plural(player.mistakesUsed, 'error', 'errores')}`;
}

/** Orden de la revelación: primero quien completó antes; después, por puntos de la ronda. */
export function connectionsRevealOrder<T extends { completionRank: number | null; pointsAwarded: number }>(players: Record<string, T>): [string, T][] {
  return Object.entries(players).sort(([, left], [, right]) => (left.completionRank ?? Infinity) - (right.completionRank ?? Infinity) || right.pointsAwarded - left.pointsAwarded);
}

/** Línea de estadísticas de la clasificación final. */
export function connectionsStatsLine(stats: Readonly<Record<string, number | undefined>>): string {
  const { groupsFound = 0, boardsSolved = 0, roundsPlayed = 0, mistakes = 0, nearMisses = 0, podiumFinishes = 0 } = stats;
  return `${plural(groupsFound, 'grupo', 'grupos')} · ${boardsSolved}/${roundsPlayed} tableros · ${plural(mistakes, 'error', 'errores')} · ${nearMisses} a una · ${plural(podiumFinishes, 'podio', 'podios')}`;
}

/** Paso del deslizador «Tiempo por puzle» y sus límites (los del contrato). */
export const CONNECTIONS_TIME = { min: 30, max: 300, step: 30 } as const;

/**
 * Valor que enseña el deslizador del tiempo: un `roundSeconds` antiguo fuera de la rejilla de 30 s (el contrato admite
 * cualquier entero de 30 a 300) se muestra en el paso más cercano. Solo se pinta así: la configuración no cambia hasta
 * que el host mueve el deslizador.
 */
export function connectionsSnapSeconds(seconds: number): number {
  const { min, max, step } = CONNECTIONS_TIME;
  return Math.min(max, Math.max(min, min + Math.round((seconds - min) / step) * step));
}

/**
 * Intento propio que merece llevar el foco a la placa: solo uno nuevo, visto llegar con la pantalla montada. Al montar
 * (o al reconectar con un `lastAttempt` previo) se toma como visto y no roba el foco; si el estado del jugador desaparece
 * y vuelve con el mismo intento, tampoco.
 */
export interface AttemptFocusState { seen: number | null; fresh: number | null }

export function nextAttemptFocus(state: AttemptFocusState | null, attemptedAt: number | null): AttemptFocusState {
  if (state === null) return { seen: attemptedAt, fresh: null };
  if (attemptedAt === null) return { seen: state.seen, fresh: null };
  if (state.seen === null || attemptedAt > state.seen) return { seen: attemptedAt, fresh: attemptedAt };
  return { seen: state.seen, fresh: state.fresh === attemptedAt ? attemptedAt : null };
}

/** Tiempo por puzle de los ajustes: «2 min», «1 min 30 s» o «30 s». */
export function connectionsTimeLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (!minutes) return `${rest} s`;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}
