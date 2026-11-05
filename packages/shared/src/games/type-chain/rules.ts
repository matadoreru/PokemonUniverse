import { POKEMON_TYPES, type Pokemon, type PokemonType } from '../../pokemon/types.js';
import { pointsForPosition } from '../../scoring.js';
import type { GameResults, GameStanding } from '../contracts.js';
import type { TypeChainPlayerStats, TypeChainState } from './types.js';

/** Pokémon del pool que debe tener un tipo para poder ser el de una cadena. */
export const TYPE_CHAIN_MIN_TYPE_POKEMON = 10;

/** ¿Vale el Pokémon en una cadena de este tipo? Basta con que sea uno de sus tipos. */
export function hasTypeChainType(candidate: Pokemon, chainType: PokemonType): boolean { return candidate.types.includes(chainType); }

/** Tipos que pueden ser el de una cadena (en el orden de `POKEMON_TYPES`): los que tienen al menos `TYPE_CHAIN_MIN_TYPE_POKEMON` en el pool. */
export function typeChainEligibleTypes(allowed: readonly Pokemon[]): PokemonType[] {
  return POKEMON_TYPES.filter((type) => allowed.filter((pokemon) => hasTypeChainType(pokemon, type)).length >= TYPE_CHAIN_MIN_TYPE_POKEMON);
}

/** Lo que aún se puede nombrar en la cadena: del pool, con el tipo de la cadena y sin usar. */
export function getValidTypeChainCandidates({ chainType, allowedPokemon, usedPokemonIds }: { chainType: PokemonType; allowedPokemon: readonly Pokemon[]; usedPokemonIds: ReadonlySet<string> }): Pokemon[] {
  return allowedPokemon.filter((candidate) => !usedPokemonIds.has(candidate.id) && hasTypeChainType(candidate, chainType));
}

export function emptyTypeChainStats(): TypeChainPlayerStats { return { validSubmissions: 0, invalidAttempts: 0, turnsSurvived: 0, timeoutEliminations: 0 }; }

/** Cuánto aguantó: los que siguen en pie, por encima de todos; entre los eliminados, el que cayó más tarde. */
function survival(state: TypeChainState, playerId: string): number {
  return state.eliminations.find((entry) => entry.playerId === playerId)?.eliminationOrder ?? state.eliminations.length + 1;
}

/**
 * Orden de la clasificación: más Pokémon nombrados; si empatan, quien aguantó más; luego, menos intentos que no valieron;
 * por último, el id (solo para que el orden sea estable: no cambia el puesto).
 */
function rankingCompare(state: TypeChainState, left: string, right: string): number {
  const a = state.playerStats[left] ?? emptyTypeChainStats(); const b = state.playerStats[right] ?? emptyTypeChainStats();
  return b.validSubmissions - a.validSubmissions || survival(state, right) - survival(state, left) || a.invalidAttempts - b.invalidAttempts || left.localeCompare(right);
}

/** Comparten puesto si empatan en todo menos el id (solo pasa entre jugadores que siguen en pie). */
function tied(state: TypeChainState, left: string, right: string): boolean {
  const a = state.playerStats[left] ?? emptyTypeChainStats(); const b = state.playerStats[right] ?? emptyTypeChainStats();
  return a.validSubmissions === b.validSubmissions && survival(state, left) === survival(state, right) && a.invalidAttempts === b.invalidAttempts;
}

/** Clasificación de todos los jugadores de la partida (sigan en pie o no), con puestos compartidos en los empates. */
export function typeChainRanking(state: TypeChainState): Array<{ playerId: string; position: number }> {
  const ordered = [...state.playerIds].sort((a, b) => rankingCompare(state, a, b)); let prior: string | null = null; let position = 0;
  return ordered.map((playerId, index) => { if (!prior || !tied(state, prior, playerId)) position = index + 1; prior = playerId; return { playerId, position }; });
}

/** Ganador: el primero de la clasificación si no comparte el puesto. */
export function typeChainWinner(state: TypeChainState): string | null {
  const ranking = typeChainRanking(state);
  if (!ranking[0]) return null;
  return ranking[1]?.position === 1 ? null : ranking[0].playerId;
}

export function buildTypeChainResults(state: TypeChainState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  const longestChain = Math.max(state.longestChain, state.chain.length); const ranking = typeChainRanking(state); const total = state.playerIds.length;
  const standings: GameStanding[] = ranking.map(({ playerId, position }) => ({
    playerId, position, points: pointsForPosition(total, position), won: playerId === state.winnerId,
    stats: { ...(state.playerStats[playerId] ?? emptyTypeChainStats()), longestChain },
  }));
  return { winnerId: state.winnerId, standings };
}
