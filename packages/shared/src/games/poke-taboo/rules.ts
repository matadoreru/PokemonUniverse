import type { Pokemon } from '../../pokemon/types.js';
import { buildRankedResults } from '../../scoring.js';
import type { GameResults } from '../contracts.js';
import type { PokeTabooPlayerStats, PokeTabooState } from './types.js';

export const POKE_TABOO_GUESSER_MAX_POINTS = 5;
export const POKE_TABOO_GUESSER_MIN_POINTS = 1;
export const POKE_TABOO_DESCRIPTOR_POINTS = 2;

export function emptyPokeTabooStats(): PokeTabooPlayerStats {
  return {
    guessedPokemon: 0,
    firstTry: 0,
    totalAttempts: 0,
    firstCorrectResponses: 0,
    descriptorRounds: 0,
    descriptorSuccesses: 0,
    descriptorFailures: 0,
    pointsFromGuessing: 0,
    pointsFromDescribing: 0,
  };
}

export function pokeTabooGuesserPoints(roundStartedAt: number, roundSeconds: number, solvedAt: number): number {
  const duration = roundSeconds * 1_000;
  const elapsed = Math.max(0, Math.min(duration, solvedAt - roundStartedAt));
  const band = Math.min(4, Math.floor(elapsed / duration * 5));
  return Math.max(POKE_TABOO_GUESSER_MIN_POINTS, POKE_TABOO_GUESSER_MAX_POINTS - band);
}

export function normalizeTabooText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

export function tabooPokemonAliases(pokemon: Pokemon): string[] {
  const idWithoutForm = pokemon.id.replace(/-(alola|galar|hisui|paldea)$/, '')
    .replace(/^tauros-paldea-(combat|blaze|aqua)-breed$/, 'tauros');
  const values = [pokemon.name, pokemon.id.replace(/-/g, ' '), idWithoutForm.replace(/-/g, ' '), ...Object.values(pokemon.names ?? {})];
  return [...new Set(values.map(normalizeTabooText).filter(Boolean))];
}

export function containsTabooPokemonName(message: string, pokemon: Pokemon): boolean {
  const normalized = normalizeTabooText(message);
  const compact = normalized.replace(/\s/g, '');
  return tabooPokemonAliases(pokemon).some((alias) => {
    const bounded = ` ${normalized} `.includes(` ${alias} `);
    return bounded || compact.includes(alias.replace(/\s/g, ''));
  });
}

export function buildPokeTabooResults(state: PokeTabooState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  return buildRankedResults(state.playerIds.map((playerId) => ({
    playerId,
    points: state.scores[playerId] ?? 0,
    stats: state.playerStats[playerId] ?? emptyPokeTabooStats(),
  })), {
    compare: (left, right) => right.points - left.points
      || right.stats.guessedPokemon - left.stats.guessedPokemon
      || right.stats.descriptorSuccesses - left.stats.descriptorSuccesses
      || left.playerId.localeCompare(right.playerId),
    tieKey: (entry) => entry.points,
  });
}
