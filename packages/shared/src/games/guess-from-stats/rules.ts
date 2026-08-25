import type { Pokemon } from '../../pokemon/types.js';
import { buildRankedResults, pointsForPosition } from '../../scoring.js';
import type { GameResults } from '../contracts.js';
import type { GuessFromStatsConfig, GuessFromStatsField } from './config.js';
import type { GuessFromStatsEvolution, GuessFromStatsHint, GuessFromStatsPlayerStats, GuessFromStatsState, GuessFromStatsVisibleStat } from './types.js';

const statOrder: GuessFromStatsField[] = ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed', 'bst'];
export function pokemonBaseStatTotal(pokemon: Pokemon): number { return pokemon.hp + pokemon.attack + pokemon.defense + pokemon.specialAttack + pokemon.specialDefense + pokemon.speed; }
export function guessFromStatsValue(pokemon: Pokemon, key: GuessFromStatsField): number { return key === 'bst' ? pokemonBaseStatTotal(pokemon) : pokemon[key]; }
export function buildGuessFromStatsVisibleStats(pokemon: Pokemon, config: GuessFromStatsConfig): GuessFromStatsVisibleStat[] {
  return statOrder.filter((key) => config.stats[key]).map((key) => ({ key, value: guessFromStatsValue(pokemon, key) }));
}

export function normalizeGuessFromStatsEvolution(pokemon: Pokemon): GuessFromStatsEvolution | null {
  const stage = pokemon.evolutionStage; const stages = pokemon.evolutionStageCount;
  if (!stage || !stages) return null; if (stages <= 1) return 'NO_EVOLUTION'; if (stage <= 1) return 'BASE'; if (stage >= stages) return 'FINAL'; return 'MIDDLE';
}

export function hasGuessFromStatsHintData(pokemon: Pokemon, config: GuessFromStatsConfig): boolean {
  if (!config.hintsEnabled) return true;
  return (!config.hints.evolution || normalizeGuessFromStatsEvolution(pokemon) !== null)
    && (!config.hints.height || typeof pokemon.heightDecimeters === 'number')
    && (!config.hints.weight || typeof pokemon.weightHectograms === 'number')
    && (!config.hints.category || Boolean(pokemon.legendaryStatus));
}

export function buildGuessFromStatsHints(pokemon: Pokemon, config: GuessFromStatsConfig): GuessFromStatsHint[] {
  if (!config.hintsEnabled) return [];
  const hints: GuessFromStatsHint[] = [];
  if (config.hints.generation) hints.push({ kind: 'GENERATION', value: pokemon.generation });
  if (config.hints.types) hints.push({ kind: 'TYPES', value: [...new Set(pokemon.types)].sort() });
  if (config.hints.typeCount) hints.push({ kind: 'TYPE_COUNT', value: new Set(pokemon.types).size });
  const evolution = normalizeGuessFromStatsEvolution(pokemon); if (config.hints.evolution && evolution) hints.push({ kind: 'EVOLUTION', value: evolution });
  if (config.hints.height && pokemon.heightDecimeters !== undefined) hints.push({ kind: 'HEIGHT', decimeters: pokemon.heightDecimeters });
  if (config.hints.weight && pokemon.weightHectograms !== undefined) hints.push({ kind: 'WEIGHT', hectograms: pokemon.weightHectograms });
  if (config.hints.category && pokemon.legendaryStatus) hints.push({ kind: 'CATEGORY', value: pokemon.legendaryStatus });
  return hints;
}

export function buildGuessFromStatsSignature(pokemon: Pokemon, config: GuessFromStatsConfig): string {
  const stats = buildGuessFromStatsVisibleStats(pokemon, config).map(({ key, value }) => `${key}:${value}`);
  const hints = buildGuessFromStatsHints(pokemon, config).map((hint) => {
    if (hint.kind === 'TYPES') return `types:${[...hint.value].sort().join(',')}`;
    if (hint.kind === 'EVOLUTION' || hint.kind === 'GENERATION' || hint.kind === 'TYPE_COUNT' || hint.kind === 'CATEGORY') return `${hint.kind.toLowerCase()}:${hint.value}`;
    if (hint.kind === 'HEIGHT') return `height:${hint.decimeters}`;
    return `weight:${hint.hectograms}`;
  });
  return [...stats, ...hints].join('|');
}

export function equivalentGuessFromStatsPokemon(source: Pokemon, allowed: readonly Pokemon[], config: GuessFromStatsConfig): Pokemon[] {
  const signature = buildGuessFromStatsSignature(source, config);
  return allowed.filter((pokemon) => buildGuessFromStatsSignature(pokemon, config) === signature);
}

export function guessFromStatsRoundPoints(playerCount: number, solveOrder: number): number { return pointsForPosition(playerCount, solveOrder); }
export function emptyGuessFromStatsPlayerStats(): GuessFromStatsPlayerStats { return { correct: 0, missed: 0, totalAttempts: 0, firstTry: 0, roundFirsts: 0, solveTimeTotalMs: 0, bestTimeMs: 0, pointsFromRounds: 0 }; }

export function buildGuessFromStatsResults(state: GuessFromStatsState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  return buildRankedResults(state.playerIds.map((playerId) => ({ playerId, points: state.scores[playerId] ?? 0, stats: state.playerStats[playerId] ?? emptyGuessFromStatsPlayerStats() })), {
    compare: (left, right) => right.points - left.points || right.stats.roundFirsts - left.stats.roundFirsts || right.stats.correct - left.stats.correct || left.stats.totalAttempts - right.stats.totalAttempts || left.playerId.localeCompare(right.playerId),
    tieKey: (entry) => `${entry.points}:${entry.stats.roundFirsts}:${entry.stats.correct}:${entry.stats.totalAttempts}`,
  });
}
