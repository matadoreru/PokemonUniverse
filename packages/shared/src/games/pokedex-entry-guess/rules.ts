import { buildRankedResults, pointsForPosition } from '../../scoring.js';
import type { PokedexEntry, Pokemon } from '../../pokemon/types.js';
import type { GameResults } from '../contracts.js';
import type { PokedexEntryGuessConfig } from './config.js';
import type { PokedexEntryGuessHint, PokedexEntryGuessPlayerStats, PokedexEntryGuessState } from './types.js';

export function pokedexEntryReferenceGeneration(generations: readonly number[]): number { return Math.max(...generations); }
export function pokedexEntryKey(entry: PokedexEntry): string { return `${entry.pokemonId}:${entry.generation}:${entry.version}`; }

export function resolvePokedexEntry(entries: readonly PokedexEntry[], referenceGeneration: number, random: () => number, excluded = new Set<string>()): PokedexEntry | null {
  const spanish = entries.filter((entry) => entry.language === 'es');
  if (!spanish.length) return null;
  const historical = spanish.filter((entry) => entry.generation <= referenceGeneration);
  const generation = historical.length
    ? Math.max(...historical.map((entry) => entry.generation))
    : Math.min(...spanish.map((entry) => entry.generation));
  const nearest = spanish.filter((entry) => entry.generation === generation);
  const unused = nearest.filter((entry) => !excluded.has(pokedexEntryKey(entry)));
  const choices = unused.length ? unused : nearest;
  return choices[Math.min(Math.floor(random() * choices.length), choices.length - 1)] ?? null;
}

function aliasesFor(pokemon: Pokemon): string[] {
  const aliases = new Set([pokemon.name, pokemon.id.replaceAll('-', ' '), ...Object.values(pokemon.names ?? {})]);
  if (pokemon.id === 'nidoran-f') aliases.add('Nidoran♀');
  if (pokemon.id === 'nidoran-m') aliases.add('Nidoran♂');
  return [...aliases].map((entry) => entry.normalize('NFC').trim()).filter((entry) => entry.length >= 2).sort((a, b) => b.length - a.length);
}

function aliasPattern(alias: string): string {
  const letters = [...alias].filter((character) => /[\p{L}\p{N}]/u.test(character));
  return letters.map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\p{P}\\p{S}]*');
}

export function sanitizePokedexEntry(text: string, pokemon: Pokemon): string {
  let result = text.replace(/\s+/g, ' ').trim();
  for (const alias of aliasesFor(pokemon)) {
    const pattern = aliasPattern(alias); if (!pattern) continue;
    result = result.replace(new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'giu'), '???');
  }
  return result;
}

export function buildPokedexEntryHints(pokemon: Pokemon, config: PokedexEntryGuessConfig): PokedexEntryGuessHint[] {
  if (!config.hintsEnabled) return [];
  const hints: PokedexEntryGuessHint[] = [];
  if (config.hints.generation) hints.push({ kind: 'GENERATION', value: pokemon.generation });
  if (config.hints.type) hints.push({ kind: 'TYPE', value: pokemon.types[0]! });
  if (config.hints.evolution && pokemon.evolutionStage && pokemon.evolutionStageCount) hints.push({ kind: 'EVOLUTION', stage: pokemon.evolutionStage, stages: pokemon.evolutionStageCount });
  if (config.hints.typeCount) hints.push({ kind: 'TYPE_COUNT', value: pokemon.types.length });
  if (config.hints.category && pokemon.legendaryStatus) hints.push({ kind: 'CATEGORY', value: pokemon.legendaryStatus });
  return hints;
}

export function pokedexEntryRoundPoints(playerCount: number, solveOrder: number): number { return pointsForPosition(playerCount, solveOrder); }
export function emptyPokedexEntryStats(): PokedexEntryGuessPlayerStats {
  return { correct: 0, missed: 0, totalAttempts: 0, firstTry: 0, roundFirsts: 0, solveTimeTotalMs: 0, bestTimeMs: 0, pointsFromRounds: 0 };
}

export function buildPokedexEntryResults(state: PokedexEntryGuessState): GameResults {
  if (state.phase !== 'GAME_RESULTS') throw new Error('Results are unavailable before the game finishes');
  return buildRankedResults(state.playerIds.map((playerId) => ({ playerId, points: state.scores[playerId] ?? 0, stats: state.playerStats[playerId] ?? emptyPokedexEntryStats() })), {
    compare: (left, right) => right.points - left.points || right.stats.roundFirsts - left.stats.roundFirsts || right.stats.correct - left.stats.correct || left.stats.totalAttempts - right.stats.totalAttempts || left.playerId.localeCompare(right.playerId),
    tieKey: (entry) => `${entry.points}:${entry.stats.roundFirsts}:${entry.stats.correct}:${entry.stats.totalAttempts}`,
  });
}
