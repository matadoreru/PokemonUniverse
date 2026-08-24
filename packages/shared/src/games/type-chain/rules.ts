import type { Pokemon, PokemonType } from '../../pokemon/types.js';
import { pointsForPosition } from '../../scoring.js';
import type { GameResults, GameStanding } from '../contracts.js';
import type { TypeChainPlayerStats, TypeChainState } from './types.js';

export function sharedPokemonTypes(previous: Pokemon, candidate: Pokemon): PokemonType[] {
  const candidateTypes = new Set(candidate.types);
  return [...new Set(previous.types)].filter((type) => candidateTypes.has(type));
}

export function isValidTypeChainTransition(previous: Pokemon, candidate: Pokemon): boolean { return sharedPokemonTypes(previous, candidate).length === 1; }

export function getValidTypeChainCandidates({ previousPokemon, allowedPokemon, usedPokemonIds }: { previousPokemon: Pokemon; allowedPokemon: readonly Pokemon[]; usedPokemonIds: ReadonlySet<string> }): Pokemon[] {
  return allowedPokemon.filter((candidate) => !usedPokemonIds.has(candidate.id) && isValidTypeChainTransition(previousPokemon, candidate));
}

export function emptyTypeChainStats(): TypeChainPlayerStats { return { validSubmissions: 0, invalidAttempts: 0, turnsSurvived: 0, timeoutEliminations: 0 }; }

function failsafeCompare(state: TypeChainState, left: string, right: string): number {
  const a = state.playerStats[left] ?? emptyTypeChainStats(); const b = state.playerStats[right] ?? emptyTypeChainStats();
  return b.validSubmissions - a.validSubmissions || a.invalidAttempts - b.invalidAttempts || left.localeCompare(right);
}

function tiedFailsafe(state: TypeChainState, left: string, right: string): boolean {
  const a = state.playerStats[left] ?? emptyTypeChainStats(); const b = state.playerStats[right] ?? emptyTypeChainStats();
  return a.validSubmissions === b.validSubmissions && a.invalidAttempts === b.invalidAttempts;
}

export function typeChainRanking(state: TypeChainState): Array<{ playerId: string; position: number }> {
  if (state.finishReason === 'SURVIVOR') {
    const ordered = [...state.activePlayerIds, ...[...state.eliminations].reverse().map((entry) => entry.playerId)];
    return ordered.map((playerId, index) => ({ playerId, position: index + 1 }));
  }
  const alive = [...state.activePlayerIds].sort((a, b) => failsafeCompare(state, a, b)); let prior: string | null = null; let position = 0;
  const rankedAlive = alive.map((playerId, index) => { if (!prior || !tiedFailsafe(state, prior, playerId)) position = index + 1; prior = playerId; return { playerId, position }; });
  return [...rankedAlive, ...[...state.eliminations].reverse().map((entry, index) => ({ playerId: entry.playerId, position: alive.length + index + 1 }))];
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
