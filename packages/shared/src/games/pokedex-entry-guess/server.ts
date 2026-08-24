import { isPokedexEntryPokemonCatalog, type PokedexEntry, type PokedexEntryPokemonCatalog, type Pokemon } from '../../pokemon/types.js';
import { allConnectedRequiredCompleted, isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { defaultPokedexEntryGuessConfig, pokedexEntryGuessConfigSchema, type PokedexEntryGuessConfig } from './config.js';
import { buildPokedexEntryHints, buildPokedexEntryResults, emptyPokedexEntryStats, pokedexEntryKey, pokedexEntryReferenceGeneration, pokedexEntryRoundPoints, resolvePokedexEntry, sanitizePokedexEntry } from './rules.js';
import { pokedexEntryGuessActionSchema, type PokedexEntryGuessAction, type PokedexEntryGuessPlayerState, type PokedexEntryGuessPublicState, type PokedexEntryGuessRoundPublicResult, type PokedexEntryGuessRoundTarget, type PokedexEntryGuessState } from './types.js';

export const POKEDEX_ENTRY_GUESS_COOLDOWN_MS = 1_000;
export const POKEDEX_ENTRY_GUESS_REVEAL_MS = 4_000;

const manifest = {
  id: 'pokedex-entry-guess', name: 'Pokédex Entry Guess', icon: '📖',
  description: 'Reconoce al Pokémon por una entrada oficial de la Pokédex en español.', minPlayers: 2, maxPlayers: 8,
  profileStats: {
    metrics: [
      { key: 'correct', label: 'Pokémon acertados', aggregation: 'SUM' as const },
      { key: 'missed', label: 'Pokémon no acertados', aggregation: 'SUM' as const },
      { key: 'totalAttempts', label: 'Intentos totales', aggregation: 'SUM' as const },
      { key: 'firstTry', label: 'Aciertos al primer intento', aggregation: 'SUM' as const },
      { key: 'roundFirsts', label: 'Primeras posiciones de ronda', aggregation: 'SUM' as const },
      { key: 'solveTimeTotalMs', label: 'Tiempo total en aciertos', aggregation: 'SUM' as const, format: 'DURATION_MS' as const },
      { key: 'bestTimeMs', label: 'Mejor tiempo', aggregation: 'MIN' as const, format: 'DURATION_MS' as const },
      { key: 'pointsFromRounds', label: 'Puntos en rondas', aggregation: 'SUM' as const },
    ],
    derivedMetrics: [
      { key: 'solveRate', label: 'Tasa de resolución', kind: 'PERCENT' as const, numerator: 'correct', denominator: ['correct', 'missed'] },
      { key: 'guessAccuracy', label: 'Precisión de intentos', kind: 'PERCENT' as const, numerator: 'correct', denominator: ['totalAttempts'] },
      { key: 'averageSolveTime', label: 'Tiempo medio para acertar', kind: 'AVERAGE' as const, numerator: 'solveTimeTotalMs', denominator: ['correct'], format: 'DURATION_MS' as const },
    ],
  },
};

function requireEntries(context: GameContext): PokedexEntryPokemonCatalog {
  if (!isPokedexEntryPokemonCatalog(context.pokemon)) throw new Error('El catálogo Pokémon no contiene entradas Pokédex en español. Ejecuta el seed actualizado.');
  return context.pokemon;
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.min(Math.floor(random() * (index + 1)), index);
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

interface Candidate { pokemon: Pokemon; entries: readonly PokedexEntry[] }

export function pokedexEntryCandidatePool(config: PokedexEntryGuessConfig, context: GameContext): Candidate[] {
  const catalog = requireEntries(context); const reference = pokedexEntryReferenceGeneration(config.generations);
  return catalog.forGenerations(config.generations).flatMap((pokemon) => {
    if (pokemon.isDefault === false) return [];
    const entries = catalog.pokedexEntries(pokemon.id);
    return resolvePokedexEntry(entries, reference, () => 0) ? [{ pokemon, entries }] : [];
  });
}

export function preparePokedexEntryRoundDeck(config: PokedexEntryGuessConfig, context: GameContext): PokedexEntryGuessRoundTarget[] {
  const candidates = pokedexEntryCandidatePool(config, context);
  const minimum = Math.min(config.rounds, 2);
  if (candidates.length < minimum) throw new Error('No hay suficientes Pokémon con entradas Pokédex válidas en español para esta configuración.');
  const reference = pokedexEntryReferenceGeneration(config.generations); const deck: PokedexEntryGuessRoundTarget[] = []; const usedEntries = new Set<string>();
  while (deck.length < config.rounds) {
    for (const candidate of shuffle(candidates, context.random)) {
      const entry = resolvePokedexEntry(candidate.entries, reference, context.random, usedEntries);
      if (!entry) continue;
      deck.push({ pokemonId: candidate.pokemon.id, entry }); usedEntries.add(pokedexEntryKey(entry));
      if (deck.length >= config.rounds) break;
    }
  }
  for (const target of deck) { const pokemon = context.pokemon.byId(target.pokemonId); if (pokemon) context.preloadImage?.(pokemon.sprite); }
  return deck;
}

function activeTarget(state: PokedexEntryGuessState): PokedexEntryGuessRoundTarget | null { return state.roundDeck[state.roundNumber - 1] ?? null; }
const revealPokemon = (pokemon: Pokemon) => ({ id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite, generation: pokemon.generation });

function beginRound(state: PokedexEntryGuessState, context: GameContext): PokedexEntryGuessState {
  const nextRound = state.roundNumber + 1; const target = state.roundDeck[nextRound - 1];
  if (!target || !context.pokemon.byId(target.pokemonId)) throw new Error('No se pudo preparar la siguiente entrada Pokédex.');
  return {
    ...state, phase: 'ROUND_ACTIVE', roundNumber: nextRound, attempts: [], attemptCounts: {}, solves: {}, cooldownUntil: {}, lastAttemptResult: {},
    roundStartedAt: context.now, roundEndsAt: context.now + state.config.roundSeconds * 1_000, nextTransitionAt: null, lastRound: null,
  };
}

function resolveRound(state: PokedexEntryGuessState, context: GameContext): PokedexEntryGuessState {
  if (state.phase !== 'ROUND_ACTIVE') return state;
  const target = activeTarget(state); const pokemon = target ? context.pokemon.byId(target.pokemonId) : undefined;
  if (!target || !pokemon) throw new Error('La respuesta de la ronda ya no está disponible.');
  const playerStats = { ...state.playerStats };
  for (const playerId of state.playerIds) if (!state.solves[playerId]) {
    const stats = playerStats[playerId] ?? emptyPokedexEntryStats(); playerStats[playerId] = { ...stats, missed: stats.missed + 1 };
  }
  return {
    ...state, phase: 'ROUND_RESULTS', playerStats, roundEndsAt: null, nextTransitionAt: context.now + POKEDEX_ENTRY_GUESS_REVEAL_MS,
    lastRound: { pokemon: revealPokemon(pokemon), entry: target.entry, solves: { ...state.solves }, attemptCounts: { ...state.attemptCounts } },
  };
}

function finish(state: PokedexEntryGuessState): PokedexEntryGuessState { return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }; }

function publicRoundResult(state: PokedexEntryGuessState): PokedexEntryGuessRoundPublicResult | null {
  if (!state.lastRound || (state.phase !== 'ROUND_RESULTS' && state.phase !== 'GAME_RESULTS')) return null;
  return {
    pokemon: { name: state.lastRound.pokemon.name, sprite: state.lastRound.pokemon.sprite, generation: state.lastRound.pokemon.generation },
    entry: { text: state.lastRound.entry.text, generation: state.lastRound.entry.generation, versionLabel: state.lastRound.entry.versionLabel },
    solves: state.lastRound.solves, attemptCounts: state.lastRound.attemptCounts,
  };
}

export const pokedexEntryGuessGame: MiniGameModule<PokedexEntryGuessConfig, PokedexEntryGuessState, PokedexEntryGuessAction, PokedexEntryGuessPublicState> = {
  manifest, configSchema: pokedexEntryGuessConfigSchema, actionSchema: pokedexEntryGuessActionSchema, defaultConfig: defaultPokedexEntryGuessConfig,
  createInitialState(config, context) {
    const parsed = pokedexEntryGuessConfigSchema.parse(config);
    if (context.players.length < manifest.minPlayers) throw new Error(`Se necesitan al menos ${manifest.minPlayers} jugadores.`);
    const playerIds = context.players.map((player) => player.id);
    return {
      phase: 'GAME_STARTING', config: parsed, referenceGeneration: pokedexEntryReferenceGeneration(parsed.generations), playerIds,
      roundDeck: preparePokedexEntryRoundDeck(parsed, context), roundNumber: 0, attempts: [], attemptCounts: {}, solves: {}, cooldownUntil: {}, lastAttemptResult: {},
      scores: Object.fromEntries(playerIds.map((id) => [id, 0])), playerStats: Object.fromEntries(playerIds.map((id) => [id, emptyPokedexEntryStats()])),
      roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null, lastRound: null,
    };
  },
  start(state, context) { if (state.phase !== 'GAME_STARTING') throw new Error('La partida ya ha comenzado.'); return beginRound(state, context); },
  handleAction(state, playerId, action, context): GameActionResult<PokedexEntryGuessState> {
    if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'No hay una ronda activa.' };
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'Estás observando esta ronda.' };
    if (state.solves[playerId]) return { state, accepted: false, error: 'Ya has acertado esta ronda.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state: resolveRound(state, context), accepted: false, error: 'El tiempo ha terminado.' };
    if (context.now < (state.cooldownUntil[playerId] ?? 0)) return { state, accepted: false, error: `Espera ${Math.ceil(((state.cooldownUntil[playerId] ?? 0) - context.now) / 100) / 10}s antes de volver a intentar.` };
    const guessed = context.pokemon.byId(action.pokemonId);
    if (!guessed || guessed.isDefault === false || !state.config.generations.includes(guessed.generation)) return { state, accepted: false, error: 'Ese Pokémon no pertenece al pool configurado.' };
    const target = activeTarget(state); if (!target) return { state, accepted: false, error: 'La respuesta no está disponible.' };
    const attemptCount = (state.attemptCounts[playerId] ?? 0) + 1; const stats = state.playerStats[playerId] ?? emptyPokedexEntryStats();
    if (guessed.id === target.pokemonId) {
      const solveOrder = Object.keys(state.solves).length + 1; const points = pokedexEntryRoundPoints(state.playerIds.length, solveOrder); const elapsedMs = context.now - state.roundStartedAt!;
      let next: PokedexEntryGuessState = {
        ...state, attemptCounts: { ...state.attemptCounts, [playerId]: attemptCount },
        solves: { ...state.solves, [playerId]: { solveOrder, solvedAt: context.now, elapsedMs, points, attempts: attemptCount } },
        lastAttemptResult: { ...state.lastAttemptResult, [playerId]: { result: 'CORRECT', attemptedAt: context.now } },
        scores: { ...state.scores, [playerId]: (state.scores[playerId] ?? 0) + points },
        playerStats: { ...state.playerStats, [playerId]: {
          ...stats, correct: stats.correct + 1, totalAttempts: stats.totalAttempts + 1, firstTry: stats.firstTry + (attemptCount === 1 ? 1 : 0),
          roundFirsts: stats.roundFirsts + (solveOrder === 1 ? 1 : 0), solveTimeTotalMs: stats.solveTimeTotalMs + elapsedMs,
          bestTimeMs: stats.bestTimeMs <= 0 ? elapsedMs : Math.min(stats.bestTimeMs, elapsedMs), pointsFromRounds: stats.pointsFromRounds + points,
        } },
      };
      if (allConnectedRequiredCompleted(context, next.playerIds, (id) => Boolean(next.solves[id]))) next = resolveRound(next, context);
      return { state: next, accepted: true };
    }
    return { accepted: true, state: {
      ...state, attempts: [...state.attempts, { playerId, guessedPokemon: { id: guessed.id, name: guessed.name, sprite: guessed.sprite }, attemptedAt: context.now }],
      attemptCounts: { ...state.attemptCounts, [playerId]: attemptCount }, cooldownUntil: { ...state.cooldownUntil, [playerId]: context.now + POKEDEX_ENTRY_GUESS_COOLDOWN_MS },
      lastAttemptResult: { ...state.lastAttemptResult, [playerId]: { result: 'INCORRECT', attemptedAt: context.now } },
      playerStats: { ...state.playerStats, [playerId]: { ...stats, totalAttempts: stats.totalAttempts + 1 } },
    } };
  },
  handleTimeout(state, context) {
    if (state.phase === 'ROUND_RESULTS' && context.now >= (state.nextTransitionAt ?? Infinity)) return state.roundNumber >= state.config.rounds ? finish(state) : beginRound(state, context);
    if (state.phase === 'ROUND_ACTIVE' && context.now >= (state.roundEndsAt ?? Infinity)) return resolveRound(state, context);
    return state;
  },
  handlePresenceChange(state, context) {
    return state.phase === 'ROUND_ACTIVE' && allConnectedRequiredCompleted(context, state.playerIds, (id) => Boolean(state.solves[id])) ? resolveRound(state, context) : state;
  },
  getPublicState(state, context) {
    const target = activeTarget(state); const pokemon = target ? context.pokemon.byId(target.pokemonId) : undefined;
    return {
      gameId: 'pokedex-entry-guess', phase: state.phase, roundNumber: state.roundNumber, totalRounds: state.config.rounds, referenceGeneration: state.referenceGeneration,
      entryText: state.phase === 'ROUND_ACTIVE' && target && pokemon ? sanitizePokedexEntry(target.entry.text, pokemon) : null,
      hints: state.phase === 'ROUND_ACTIVE' && pokemon ? buildPokedexEntryHints(pokemon, state.config) : [], attempts: state.attempts,
      solvedPlayers: Object.entries(state.solves).map(([playerId, solve]) => ({ playerId, solveOrder: solve.solveOrder })).sort((a, b) => a.solveOrder - b.solveOrder),
      scores: state.scores, roundStartedAt: state.roundStartedAt, roundEndsAt: state.roundEndsAt, nextTransitionAt: state.nextTransitionAt,
      lastRound: publicRoundResult(state), results: state.phase === 'GAME_RESULTS' ? buildPokedexEntryResults(state) : null,
    };
  },
  getPlayerState(state, playerId, context): PokedexEntryGuessPlayerState {
    const solve = state.solves[playerId];
    return {
      canGuess: state.phase === 'ROUND_ACTIVE' && state.playerIds.includes(playerId) && isPlayerRequired(context, playerId) && !solve,
      solved: Boolean(solve), solveOrder: solve?.solveOrder ?? null, cooldownUntil: state.cooldownUntil[playerId] ?? null,
      roundPoints: solve?.points ?? 0, attemptCount: state.attemptCounts[playerId] ?? 0, lastAttempt: state.lastAttemptResult[playerId] ?? null,
    };
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildPokedexEntryResults(state); },
};
