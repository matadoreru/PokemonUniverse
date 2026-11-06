import type { GamePhase, GameResults, PokemonType, TypeDuelAttempt, TypeDuelPlayerState, TypeDuelPublicState, TypeDuelRoundResult } from '@pokemon-universe/shared/public';
import { pokemonTypeLabels } from '../../components/pokemon-type-labels';

/** Pantalla inferior de Type Duel: qué placa toca. */
export type TypeDuelPlateKind = 'pick' | 'locked' | 'reveal' | 'search' | 'watching' | 'invalid' | 'result' | 'waiting';

/**
 * Placa de la pantalla inferior. Solo usa lo proyectado: el tipo propio (`ownType`) y si se puede elegir o buscar; el
 * tipo del rival nunca entra aquí.
 */
export function typeDuelPlateKind(phase: GamePhase, player: Pick<TypeDuelPlayerState, 'participant' | 'canSelectType' | 'ownType'> | null): TypeDuelPlateKind {
  const participant = player?.participant === true;
  switch (phase) {
    case 'SELECTING_TYPES':
      if (!participant) return 'watching';
      return player?.canSelectType ? 'pick' : player?.ownType ? 'locked' : 'waiting';
    case 'TYPE_REVEAL': return participant ? 'reveal' : 'watching';
    case 'POKEMON_SEARCH': return participant ? 'search' : 'watching';
    case 'INVALID_COMBINATION': return 'invalid';
    case 'ROUND_RESULTS': return 'result';
    default: return 'waiting';
  }
}

/** Nombre de un tipo en español. */
export const typeLabel = (type: PokemonType) => pokemonTypeLabels[type];

/** Chip de la fase en la placa de la ronda. */
export function typeDuelPhaseLabel(phase: GamePhase): string {
  switch (phase) {
    case 'SELECTING_TYPES': return 'Elección secreta';
    case 'TYPE_REVEAL': return 'Revelación';
    case 'POKEMON_SEARCH': return 'Carrera';
    case 'INVALID_COMBINATION': return 'Sin solución';
    case 'ROUND_RESULTS': return 'Resultado';
    default: return 'Preparando';
  }
}

/** Etiqueta del temporizador de la placa de la ronda según la fase (el plazo ya lo da el servidor). */
export function typeDuelTimerLabel(game: Pick<TypeDuelPublicState, 'phase' | 'completedRounds' | 'totalRounds' | 'finalSelectionCycle'>): string {
  switch (game.phase) {
    case 'SELECTING_TYPES': return 'Elegir';
    case 'TYPE_REVEAL': return 'Empieza';
    case 'POKEMON_SEARCH': return 'Buscar';
    case 'INVALID_COMBINATION': return 'Sigue en';
    default: return game.completedRounds >= game.totalRounds || game.finalSelectionCycle ? 'Clasificación' : 'Siguiente ronda';
  }
}

/** Estado de un jugador en el marcador durante la ronda. */
export type TypeDuelMemberStatus =
  | { kind: 'watching' }
  | { kind: 'choosing' }
  | { kind: 'locked' }
  | { kind: 'type'; type: PokemonType }
  | { kind: 'won' }
  | { kind: 'lost' }
  | { kind: 'void' };

/**
 * Estado de un jugador en el marcador. Mientras se elige, de un duelista solo se sabe si ya ha bloqueado
 * (`typeSelectionCompletedIds`), nunca qué tipo; el tipo sale cuando el servidor lo revela (`revealedTypes`).
 */
export function typeDuelMemberStatus(game: Pick<TypeDuelPublicState, 'phase' | 'participants' | 'typeSelectionCompletedIds' | 'revealedTypes' | 'lastRound'>, id: string): TypeDuelMemberStatus {
  if (!game.participants.includes(id)) return { kind: 'watching' };
  if (game.phase === 'ROUND_RESULTS' && game.lastRound) {
    if (game.lastRound.winnerId === id) return { kind: 'won' };
    return game.lastRound.winnerId ? { kind: 'lost' } : { kind: 'void' };
  }
  if (game.phase === 'SELECTING_TYPES') return game.typeSelectionCompletedIds.includes(id) ? { kind: 'locked' } : { kind: 'choosing' };
  const type = game.revealedTypes[id];
  return type ? { kind: 'type', type } : { kind: 'locked' };
}

/** Último intento propio de la carrera (para el aviso bajo el buscador), o `null`. */
export function typeDuelOwnLastAttempt(attempts: readonly TypeDuelAttempt[], selfId: string): TypeDuelAttempt | null {
  for (let index = attempts.length - 1; index >= 0; index--) if (attempts[index]!.playerId === selfId) return attempts[index]!;
  return null;
}

/** Veredicto propio del resultado del duelo (kicker de la placa inferior). */
export function typeDuelVerdict(lastRound: Pick<TypeDuelRoundResult, 'winnerId'> | null, selfId: string, participant: boolean): string {
  if (!participant) return 'Estás observando';
  if (!lastRound?.winnerId) return 'Nadie puntúa';
  return lastRound.winnerId === selfId ? '¡Ganaste el duelo!' : 'Perdiste el duelo';
}

/**
 * Aviso de la región `status` (siempre montada). No repite los textos visibles que localizan las E2E (los títulos del
 * resultado, «Elegid un tipo en secreto», «Duelo de tipos», «Monotipo»): lo dice con otras palabras. Durante la
 * elección solo habla del tipo propio.
 */
export function typeDuelAnnouncement({ kind, roundNumber, ownType, requiredTypes, solutionCount, lastAttempt, verdict }: {
  kind: TypeDuelPlateKind;
  roundNumber: number;
  ownType: PokemonType | null;
  requiredTypes: readonly PokemonType[] | null;
  solutionCount: number | null;
  lastAttempt: TypeDuelAttempt | null;
  verdict: string;
}): string {
  const target = requiredTypes?.length ? requiredTypes.map(typeLabel).join(' y ') : '';
  switch (kind) {
    case 'pick': return `Ronda ${roundNumber}: elige tu tipo. El rival no lo verá hasta la revelación.`;
    case 'locked': return ownType ? `Has bloqueado ${typeLabel(ownType)}. Esperando al rival.` : 'Tipo bloqueado.';
    case 'reveal': return target ? `Tipos al descubierto: ${target}${solutionCount !== null ? `, ${solutionCount} posibles` : ''}.` : 'Tipos al descubierto.';
    case 'search':
      if (lastAttempt) return lastAttempt.correct ? `${lastAttempt.pokemonName} es válido.` : `${lastAttempt.pokemonName} no vale. Prueba otro.`;
      return target ? `Carrera: busca un Pokémon de tipo ${target}.` : 'Carrera en marcha.';
    case 'watching': return `Ronda ${roundNumber}: observas el duelo.`;
    case 'invalid': return 'Ningún Pokémon tiene esa combinación.';
    case 'result': return `Duelo terminado: ${verdict.replace(/[¡!]/g, '').toLowerCase()}.`;
    default: return 'Preparando el duelo.';
  }
}

/** Clave del foco (ver `useFocusOnTransition`): al bloquear el tipo y al ver el resultado, el título de la placa. */
export function typeDuelFocusKey(kind: TypeDuelPlateKind, roundNumber: number, invalidCombinations: number): string | null {
  if (kind === 'locked') return `locked-${roundNumber}-${invalidCombinations}`;
  return kind === 'result' ? `result-${roundNumber}` : null;
}

/** Foco itinerante de la rejilla de tipos: índice al que lleva la tecla, o `null` si la tecla no mueve. */
export function typeGridMove(index: number, key: string, columns: number, count: number): number | null {
  const cols = Math.max(1, columns);
  switch (key) {
    case 'ArrowRight': return Math.min(count - 1, index + 1);
    case 'ArrowLeft': return Math.max(0, index - 1);
    case 'ArrowDown': return index + cols < count ? index + cols : index;
    case 'ArrowUp': return index - cols >= 0 ? index - cols : index;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}

/** Línea de estadísticas de un jugador en los resultados. */
export function typeDuelStatsLine(stats: Readonly<Record<string, number | undefined>>): string {
  const played = stats.duelsPlayed ?? 0;
  // Sin duelos, un «0 %» engañaría: solo se dice que no le tocó.
  if (played === 0) return 'No jugó ningún duelo';
  const won = stats.duelsWon ?? 0;
  const misses = stats.incorrectAttempts ?? 0;
  const average = stats.averageCorrectTimeMs ?? 0;
  const parts = [`Ganó ${won} de ${played}`, `${stats.winRate ?? 0}%`, `${misses} ${misses === 1 ? 'fallo' : 'fallos'}`];
  if (average > 0) parts.push(`media ${(average / 1000).toFixed(1)}s`);
  return parts.join(' · ');
}

/** Récord de la partida: el valor (ya en texto) y quién lo tiene (empates juntos); `null` si nadie lo consiguió. */
export interface TypeDuelRecord { value: string; names: string[] }

type StandingStats = GameResults['standings'][number]['stats'];

function bestOf(entries: readonly { name: string; stats: StandingStats }[], score: (stats: StandingStats) => number | null, lowerIsBetter: boolean): { value: number; names: string[] } | null {
  const scored = entries.map((entry) => ({ name: entry.name, value: score(entry.stats) })).filter((entry): entry is { name: string; value: number } => entry.value !== null);
  if (scored.length === 0) return null;
  const best = lowerIsBetter ? Math.min(...scored.map((entry) => entry.value)) : Math.max(...scored.map((entry) => entry.value));
  return { value: best, names: scored.filter((entry) => entry.value === best).map((entry) => entry.name) };
}

/**
 * Récords de los resultados: más duelos ganados, mejor porcentaje (de quien jugó alguno con victoria) y el acierto medio
 * más rápido. Sin ganadores, `null` en los tres (nadie lo consiguió).
 */
export function typeDuelRecords(entries: readonly { name: string; stats: StandingStats }[]): { wins: TypeDuelRecord | null; winRate: TypeDuelRecord | null; fastest: TypeDuelRecord | null } {
  const num = (stats: StandingStats, key: string) => Number(stats[key] ?? 0);
  const wins = bestOf(entries, (stats) => num(stats, 'duelsWon') > 0 ? num(stats, 'duelsWon') : null, false);
  const winRate = bestOf(entries, (stats) => num(stats, 'duelsWon') > 0 ? num(stats, 'winRate') : null, false);
  const fastest = bestOf(entries, (stats) => num(stats, 'averageCorrectTimeMs') > 0 ? num(stats, 'averageCorrectTimeMs') : null, true);
  return {
    wins: wins && { value: String(wins.value), names: wins.names },
    winRate: winRate && { value: `${winRate.value}%`, names: winRate.names },
    fastest: fastest && { value: `${(fastest.value / 1000).toFixed(1)}s`, names: fastest.names },
  };
}

// ------------------------------------------------------------------------------------------------- Cooperativo

/** `COOP`: la combinación en texto («Agua y Tierra», «Psíquico»). */
export function typeDuelCombinationText(types: readonly PokemonType[]): string {
  return types.map(typeLabel).join(' y ');
}

/** `COOP`: chip de la fase en la placa de la ronda. */
export function typeDuelCoopPhaseLabel(phase: GamePhase): string {
  switch (phase) {
    case 'POKEMON_SEARCH': return 'Búsqueda conjunta';
    case 'ROUND_RESULTS': return 'Resultado';
    default: return 'Preparando';
  }
}

/** `COOP`: título del resultado de la ronda (cuántos encontró el grupo de los que había). */
export function typeDuelCoopRoundTitle(reason: TypeDuelRoundResult['reason'] | null, found: number, total: number): string {
  if (reason === 'ALL_FOUND' || (total > 0 && found >= total)) return '¡Los encontrasteis todos!';
  if (found === 0) return 'No encontrasteis ninguno';
  return `Encontrasteis ${found} de ${total}`;
}

/** `COOP`: cuántos Pokémon aportó cada jugador en la partida, de más a menos (empates comparten puesto). */
export function typeDuelCoopRanking(playerIds: readonly string[], contributions: Readonly<Record<string, number>>, nameOf: (id: string) => string): Array<{ id: string; count: number; position: number }> {
  const sorted = [...playerIds].sort((a, b) => (contributions[b] ?? 0) - (contributions[a] ?? 0) || nameOf(a).localeCompare(nameOf(b)));
  return sorted.map((id) => {
    const count = contributions[id] ?? 0;
    return { id, count, position: sorted.findIndex((other) => (contributions[other] ?? 0) === count) + 1 };
  });
}

/**
 * `COOP`: aviso de la región `status` (siempre montada). Durante la búsqueda dice la combinación y el contador del
 * grupo; tras un intento propio, si sumó o no valía. El duplicado no se repite aquí: lo publica el aviso de la sala.
 */
export function typeDuelCoopAnnouncement({ phase, roundNumber, combination, found, total, lastAttempt, player }: {
  phase: GamePhase;
  roundNumber: number;
  combination: readonly PokemonType[];
  found: number;
  total: number;
  lastAttempt: TypeDuelAttempt | null;
  player: boolean;
}): string {
  const target = typeDuelCombinationText(combination);
  switch (phase) {
    case 'POKEMON_SEARCH':
      if (player && lastAttempt) return lastAttempt.correct ? `${lastAttempt.pokemonName} suma para el grupo: ${found} de ${total}.` : `${lastAttempt.pokemonName} no tiene esos tipos.`;
      return `Ronda ${roundNumber}: buscad juntos Pokémon de tipo ${target}. Hay ${total}.`;
    case 'ROUND_RESULTS': return `Ronda terminada: el grupo encontró ${found} de ${total}.`;
    default: return 'Preparando la búsqueda conjunta.';
  }
}

/** `COOP`: línea de un jugador en los resultados (su aportación al total del grupo). */
export function typeDuelCoopStatsLine(stats: Readonly<Record<string, number | undefined>>): string {
  const contribution = stats.contribution ?? 0;
  const total = stats.groupTotal ?? 0;
  if (contribution === 0) return 'No aportó ningún Pokémon';
  return `Aportó ${contribution} de ${total}${total > 0 ? ` · ${Math.round((contribution / total) * 100)}%` : ''}`;
}
