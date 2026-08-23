import { GENERATION_LEARNSET_SOURCES, isLearnsetPokemonCatalog, type Generation, type LearnsetPokemonCatalog, type Pokemon, type ResolvedLevelUpMove } from '../../pokemon/types.js';
import { allConnectedRequiredCompleted, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { defaultLearnsetGuessConfig, learnsetGuessConfigSchema, type LearnsetGuessConfig } from './config.js';
import { buildLearnsetResults, emptyLearnsetStats, learnsetPoints } from './rules.js';
import { learnsetGuessActionSchema, type LearnsetGuessAction, type LearnsetGuessPlayerState, type LearnsetGuessPublicState, type LearnsetGuessState, type LearnsetMoveGroup, type LearnsetMoveHint } from './types.js';

export const LEARNSET_INITIAL_MAX_LEVEL = 15;
export const LEARNSET_HINT_INTERVAL_MS = 3_000;
export const LEARNSET_GUESS_COOLDOWN_MS = 1_000;
export const LEARNSET_RESULT_DURATION_MS = 4_000;

const manifest = {
  id: 'learnset-guess', name: 'Learnset Guess', icon: '📚',
  description: 'Descubre el Pokémon mientras se revela progresivamente su learnset por nivel.', minPlayers: 2,
  profileStats: {
    metrics: [
      { key: 'correct', label: 'Pokémon acertados', aggregation: 'SUM' },
      { key: 'missed', label: 'Pokémon fallados', aggregation: 'SUM' },
      { key: 'initialSolves', label: 'Aciertos con pistas iniciales', aggregation: 'SUM' },
      { key: 'incorrectGuesses', label: 'Intentos incorrectos', aggregation: 'SUM' },
      { key: 'pointsFromSolves', label: 'Puntos de aciertos', aggregation: 'SUM' },
      { key: 'bestRoundPoints', label: 'Mejor ronda', aggregation: 'MAX' },
    ],
    derivedMetrics: [
      { key: 'accuracy', label: 'Precisión', kind: 'PERCENT', numerator: 'correct', denominator: ['correct', 'missed'] },
      { key: 'averagePoints', label: 'Puntos medios por acierto', kind: 'AVERAGE', numerator: 'pointsFromSolves', denominator: ['correct'] },
    ],
  },
} as const;

export function learnsetReferenceGeneration(generations: readonly number[]): Generation {
  return Math.max(...generations) as Generation;
}

function requireLearnsets(context: GameContext): LearnsetPokemonCatalog {
  if (!isLearnsetPokemonCatalog(context.pokemon)) throw new Error('The Pokémon catalog has no learnset data');
  return context.pokemon;
}

export function groupLearnset(learnset: readonly ResolvedLevelUpMove[]): ResolvedLevelUpMove[][] {
  const groups = new Map<number, ResolvedLevelUpMove[]>();
  for (const entry of [...learnset].sort((a, b) => a.level - b.level || a.move.name.localeCompare(b.move.name))) {
    groups.set(entry.level, [...(groups.get(entry.level) ?? []), entry]);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([, entries]) => entries);
}

export function evolutionHint(stage: number, stages: number): string {
  if (stages <= 1) return 'No evoluciona';
  if (stage <= 1) return `Pokémon base · etapa 1 de ${stages}`;
  if (stage >= stages) return `Evolución final · etapa ${stage} de ${stages}`;
  return `Evolución intermedia · etapa ${stage} de ${stages}`;
}

function hint(entry: ResolvedLevelUpMove, showLevels: boolean): LearnsetMoveHint {
  return { moveId: entry.moveId, name: entry.move.name, level: showLevels ? entry.level : null, type: entry.move.type, category: entry.move.category };
}

function groupsForState(state: LearnsetGuessState): ResolvedLevelUpMove[][] { return groupLearnset(state.learnset); }
function visibleGroupCount(state: LearnsetGuessState): number { return state.initialGroupCount + state.revealedExtraGroups; }

function publicGroups(state: LearnsetGuessState): LearnsetMoveGroup[] {
  return groupsForState(state).slice(0, visibleGroupCount(state)).map((entries, index) => ({
    level: state.config.showLevels ? entries[0]!.level : null,
    moves: entries.map((entry) => hint(entry, state.config.showLevels)),
    stage: Math.max(0, index - state.initialGroupCount + 1),
  }));
}

function candidatePool(state: LearnsetGuessState, context: GameContext): Array<{ pokemon: Pokemon; learnset: readonly ResolvedLevelUpMove[] }> {
  const catalog = requireLearnsets(context); const reference = state.referenceGeneration;
  return catalog.forGenerations(state.config.generations).flatMap((pokemon) => {
    if (pokemon.isDefault === false || pokemon.generation > reference) return [];
    const learnset = catalog.levelUpMoves(pokemon.id, reference);
    if (new Set(learnset.map((entry) => entry.moveId)).size < 2) return [];
    if (!learnset.some((entry) => entry.level <= LEARNSET_INITIAL_MAX_LEVEL)) return [];
    if (state.config.showEvolution && !catalog.evolutionInfo(pokemon.id)) return [];
    return [{ pokemon, learnset }];
  });
}

function beginRound(state: LearnsetGuessState, context: GameContext): LearnsetGuessState {
  const allCandidates = candidatePool(state, context);
  if (!allCandidates.length) throw new Error('No hay Pokémon con learnsets válidos para esa selección de generaciones. Ejecuta el seed actualizado.');
  let candidates = allCandidates.filter((entry) => !state.usedPokemonIds.includes(entry.pokemon.id));
  if (!candidates.length) candidates = allCandidates;
  const selected = candidates[Math.min(Math.floor(context.random() * candidates.length), candidates.length - 1)]!;
  const groups = groupLearnset(selected.learnset); const initialGroupCount = groups.filter((entries) => entries[0]!.level <= LEARNSET_INITIAL_MAX_LEVEL).length;
  const roundEndsAt = context.now + state.config.roundSeconds * 1_000;
  const hasExtra = groups.length > initialGroupCount && context.now + LEARNSET_HINT_INTERVAL_MS < roundEndsAt;
  const catalog = requireLearnsets(context);
  context.preloadImage?.(selected.pokemon.sprite);
  return {
    ...state, phase: 'ROUND_ACTIVE', roundNumber: state.roundNumber + 1, correctPokemonId: selected.pokemon.id,
    usedPokemonIds: [...new Set([...state.usedPokemonIds, selected.pokemon.id])], learnset: [...selected.learnset],
    evolutionInfo: catalog.evolutionInfo(selected.pokemon.id) ?? null, initialGroupCount, revealedExtraGroups: 0,
    attempts: [], solves: {}, cooldownUntil: {}, roundStartedAt: context.now, roundEndsAt,
    nextTransitionAt: hasExtra ? context.now + LEARNSET_HINT_INTERVAL_MS : null, lastRound: null,
  };
}

function resolveRound(state: LearnsetGuessState, context: GameContext): LearnsetGuessState {
  const pokemon = context.pokemon.byId(state.correctPokemonId!);
  if (!pokemon) throw new Error('Learnset Guess answer is missing from the catalog');
  const visibleMoves = groupsForState(state).slice(0, visibleGroupCount(state)).flat().map((entry) => hint(entry, state.config.showLevels));
  const playerStats = { ...state.playerStats };
  for (const playerId of state.playerIds) if (!state.solves[playerId]) {
    const stats = playerStats[playerId] ?? emptyLearnsetStats(); playerStats[playerId] = { ...stats, missed: stats.missed + 1 };
  }
  return {
    ...state, phase: 'ROUND_RESULTS', playerStats, roundEndsAt: null, nextTransitionAt: context.now + LEARNSET_RESULT_DURATION_MS,
    lastRound: {
      pokemon: { id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite, nationalDexNumber: pokemon.nationalDexNumber, generation: pokemon.generation },
      referenceGeneration: state.referenceGeneration, referenceSource: GENERATION_LEARNSET_SOURCES[state.referenceGeneration].label,
      revealedMoves: visibleMoves, learnset: state.learnset.map((entry) => hint(entry, state.config.showLevels)), solves: { ...state.solves },
    },
  };
}

function finish(state: LearnsetGuessState): LearnsetGuessState {
  return { ...state, phase: 'GAME_RESULTS', correctPokemonId: null, learnset: [], evolutionInfo: null, roundEndsAt: null, nextTransitionAt: null };
}

export const learnsetGuessGame: MiniGameModule<LearnsetGuessConfig, LearnsetGuessState, LearnsetGuessAction, LearnsetGuessPublicState> = {
  manifest, configSchema: learnsetGuessConfigSchema, actionSchema: learnsetGuessActionSchema, defaultConfig: defaultLearnsetGuessConfig,
  createInitialState(config, context) {
    const parsed = learnsetGuessConfigSchema.parse(config); if (context.players.length < manifest.minPlayers) throw new Error(`At least ${manifest.minPlayers} players are required`);
    const referenceGeneration = learnsetReferenceGeneration(parsed.generations);
    const scores = Object.fromEntries(context.players.map((player) => [player.id, 0]));
    const playerStats = Object.fromEntries(context.players.map((player) => [player.id, emptyLearnsetStats()]));
    return {
      phase: 'GAME_STARTING', config: parsed, playerIds: context.players.map((player) => player.id), roundNumber: 0, referenceGeneration,
      correctPokemonId: null, usedPokemonIds: [], learnset: [], evolutionInfo: null, initialGroupCount: 0, revealedExtraGroups: 0,
      attempts: [], solves: {}, cooldownUntil: {}, scores, playerStats, roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null, lastRound: null,
    };
  },
  start(state, context) { if (state.phase !== 'GAME_STARTING') throw new Error('Game already started'); return beginRound(state, context); },
  handleAction(state, playerId, action, context): GameActionResult<LearnsetGuessState> {
    if (action.type !== 'GUESS_POKEMON') return { state, accepted: false, error: 'Unknown action' };
    if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'No active round' };
    if (!state.playerIds.includes(playerId)) return { state, accepted: false, error: 'You are spectating' };
    if (state.solves[playerId]) return { state, accepted: false, error: 'Ya has acertado esta ronda.' };
    if (context.now < (state.cooldownUntil[playerId] ?? 0)) return { state, accepted: false, error: `Espera ${Math.ceil(((state.cooldownUntil[playerId] ?? 0) - context.now) / 100) / 10}s antes de volver a intentar.` };
    const guessed = context.pokemon.byId(action.pokemonId);
    if (!guessed || guessed.isDefault === false || !state.config.generations.includes(guessed.generation)) return { state, accepted: false, error: 'Pokémon no disponible en esta partida.' };
    if (guessed.id === state.correctPokemonId) {
      const revealStage = state.revealedExtraGroups; const points = learnsetPoints(revealStage); const stats = state.playerStats[playerId] ?? emptyLearnsetStats();
      let next: LearnsetGuessState = {
        ...state, solves: { ...state.solves, [playerId]: { solvedAt: context.now, revealStage, points } }, scores: { ...state.scores, [playerId]: (state.scores[playerId] ?? 0) + points },
        playerStats: { ...state.playerStats, [playerId]: { ...stats, correct: stats.correct + 1, initialSolves: stats.initialSolves + (revealStage === 0 ? 1 : 0), pointsFromSolves: stats.pointsFromSolves + points, bestRoundPoints: Math.max(stats.bestRoundPoints, points) } },
      };
      if (allConnectedRequiredCompleted(context, next.playerIds, (id) => Boolean(next.solves[id]))) next = resolveRound(next, context);
      return { state: next, accepted: true };
    }
    const stats = state.playerStats[playerId] ?? emptyLearnsetStats();
    return { accepted: true, state: {
      ...state, attempts: [...state.attempts, { playerId, pokemonId: guessed.id, pokemonName: guessed.name, sprite: guessed.sprite, attemptedAt: context.now }],
      cooldownUntil: { ...state.cooldownUntil, [playerId]: context.now + LEARNSET_GUESS_COOLDOWN_MS },
      playerStats: { ...state.playerStats, [playerId]: { ...stats, incorrectGuesses: stats.incorrectGuesses + 1 } },
    } };
  },
  handleTimeout(state, context) {
    if (state.phase === 'ROUND_RESULTS' && context.now >= (state.nextTransitionAt ?? Infinity)) return state.roundNumber >= state.config.rounds ? finish(state) : beginRound(state, context);
    if (state.phase !== 'ROUND_ACTIVE') return state;
    if (context.now >= (state.roundEndsAt ?? Infinity)) return resolveRound(state, context);
    if (context.now < (state.nextTransitionAt ?? Infinity)) return state;
    const groups = groupsForState(state); const availableExtras = groups.length - state.initialGroupCount;
    let revealedExtraGroups = state.revealedExtraGroups; let deadline = state.nextTransitionAt!;
    while (revealedExtraGroups < availableExtras && context.now >= deadline) { revealedExtraGroups += 1; deadline += LEARNSET_HINT_INTERVAL_MS; }
    const nextTransitionAt = revealedExtraGroups < availableExtras && deadline < (state.roundEndsAt ?? Infinity) ? deadline : null;
    return { ...state, revealedExtraGroups, nextTransitionAt };
  },
  handlePresenceChange(state, context) {
    if (state.phase === 'ROUND_ACTIVE' && allConnectedRequiredCompleted(context, state.playerIds, (id) => Boolean(state.solves[id]))) return resolveRound(state, context);
    return state;
  },
  getPublicState(state) {
    return {
      gameId: 'learnset-guess', phase: state.phase, roundNumber: state.roundNumber, totalRounds: state.config.rounds,
      referenceGeneration: state.referenceGeneration, referenceSource: GENERATION_LEARNSET_SOURCES[state.referenceGeneration].label,
      visibleGroups: state.phase === 'ROUND_ACTIVE' ? publicGroups(state) : [],
      evolutionHint: state.phase === 'ROUND_ACTIVE' && state.config.showEvolution && state.evolutionInfo ? evolutionHint(state.evolutionInfo.stage, state.evolutionInfo.stages) : null,
      attempts: state.attempts, solvedPlayerIds: Object.keys(state.solves), roundStartedAt: state.roundStartedAt,
      roundEndsAt: state.roundEndsAt, nextTransitionAt: state.nextTransitionAt, lastRound: state.phase === 'ROUND_RESULTS' ? state.lastRound : null,
      scores: state.scores, results: state.phase === 'GAME_RESULTS' ? buildLearnsetResults(state) : null,
    };
  },
  getPlayerState(state, playerId): LearnsetGuessPlayerState {
    const solve = state.solves[playerId];
    return { canGuess: state.phase === 'ROUND_ACTIVE' && state.playerIds.includes(playerId) && !solve, solved: Boolean(solve), cooldownUntil: state.cooldownUntil[playerId] ?? null, roundPoints: solve?.points ?? 0 };
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; }, getResults(state) { return buildLearnsetResults(state); },
};
