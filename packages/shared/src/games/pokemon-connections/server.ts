import { allConnectedRequiredCompleted, isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { generateConnectionsPuzzle, shuffledConnectionsBoard } from './catalog.js';
import { defaultPokemonConnectionsConfig, pokemonConnectionsConfigSchema, type PokemonConnectionsConfig } from './config.js';
import { buildPokemonConnectionsResults, completionBonus, emptyPokemonConnectionsStats } from './rules.js';
import { pokemonConnectionsActionSchema, type ConnectionAnswerGroup, type PokemonConnectionsAction, type PokemonConnectionsPlayerState, type PokemonConnectionsProgress, type PokemonConnectionsPublicState, type PokemonConnectionsRoundResult, type PokemonConnectionsState } from './types.js';

export const POKEMON_CONNECTIONS_REVEAL_MS = 8_000;

const manifest = {
  id: 'pokemon-connections',
  name: 'Pokémon Connections',
  icon: '🧩',
  description: 'Encuentra en privado los grupos de Pokémon que comparten una conexión.',
  experimental: true,
  minPlayers: 1,
  profileStats: {
    metrics: [
      { key: 'roundsPlayed', label: 'Puzles jugados', aggregation: 'SUM' as const },
      { key: 'groupsFound', label: 'Grupos encontrados', aggregation: 'SUM' as const },
      { key: 'boardsSolved', label: 'Tableros completados', aggregation: 'SUM' as const },
      { key: 'mistakes', label: 'Errores', aggregation: 'SUM' as const },
      { key: 'nearMisses', label: 'Intentos a una', aggregation: 'SUM' as const },
      { key: 'podiumFinishes', label: 'Podios de velocidad', aggregation: 'SUM' as const },
      { key: 'solveTimeTotalMs', label: 'Tiempo total al resolver', aggregation: 'SUM' as const, format: 'DURATION_MS' as const },
      { key: 'bestSolveTimeMs', label: 'Mejor tiempo', aggregation: 'MIN' as const, format: 'DURATION_MS' as const },
    ],
    derivedMetrics: [
      { key: 'solveRate', label: 'Puzles completados', kind: 'PERCENT' as const, numerator: 'boardsSolved', denominator: ['roundsPlayed'] },
      { key: 'averageSolveTime', label: 'Tiempo medio', kind: 'AVERAGE' as const, numerator: 'solveTimeTotalMs', denominator: ['boardsSolved'], format: 'DURATION_MS' as const },
    ],
  },
};

function cloneGroup(group: ConnectionAnswerGroup): ConnectionAnswerGroup {
  return { ...group, pokemon: group.pokemon.map((pokemon) => ({ ...pokemon })) };
}

function emptyProgress(): PokemonConnectionsProgress {
  return {
    foundGroupIds: [], mistakesUsed: 0, status: 'PLAYING', completedAt: null,
    completionRank: null, roundPoints: 0, lastAttempt: null,
  };
}

function createProgress(playerIds: readonly string[]): Record<string, PokemonConnectionsProgress> {
  return Object.fromEntries(playerIds.map((playerId) => [playerId, emptyProgress()]));
}

function preparePuzzle(state: PokemonConnectionsState, context: GameContext): PokemonConnectionsState {
  const puzzle = generateConnectionsPuzzle(context, {
    groupSize: state.config.groupSize,
    pokemonCount: state.config.pokemonCount,
    generations: state.config.generations,
    usedPuzzleKeys: state.usedPuzzleKeys,
  });
  const usedPuzzleKeys = [...state.usedPuzzleKeys, puzzle.key];
  return {
    ...state,
    board: shuffledConnectionsBoard(puzzle.groups, context.random),
    answerGroups: puzzle.groups.map(cloneGroup),
    puzzleSource: puzzle.source,
    puzzleKey: puzzle.key,
    usedPuzzleKeys: usedPuzzleKeys.length > 50 ? usedPuzzleKeys.slice(-50) : usedPuzzleKeys,
  };
}

function activatePreparedRound(state: PokemonConnectionsState, context: GameContext): PokemonConnectionsState {
  return {
    ...state,
    phase: 'ROUND_ACTIVE',
    roundNumber: state.roundNumber + 1,
    progress: createProgress(state.playerIds),
    completionOrder: [],
    roundStartedAt: context.now,
    roundEndsAt: context.now + state.config.roundSeconds * 1_000,
    nextTransitionAt: null,
    lastRound: null,
  };
}

function beginNextRound(state: PokemonConnectionsState, context: GameContext): PokemonConnectionsState {
  if (state.roundNumber >= state.config.rounds) {
    return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null };
  }
  return activatePreparedRound(preparePuzzle(state, context), context);
}

function groupIds(group: ConnectionAnswerGroup): Set<string> {
  return new Set(group.pokemon.map((pokemon) => pokemon.id));
}

function exactGroup(groups: readonly ConnectionAnswerGroup[], selectedIds: ReadonlySet<string>): ConnectionAnswerGroup | undefined {
  return groups.find((group) => {
    const ids = groupIds(group);
    return ids.size === selectedIds.size && [...selectedIds].every((id) => ids.has(id));
  });
}

function isNearMiss(groups: readonly ConnectionAnswerGroup[], selectedIds: ReadonlySet<string>): boolean {
  return groups.some((group) => group.pokemon.filter((pokemon) => selectedIds.has(pokemon.id)).length === selectedIds.size - 1);
}

function allRequiredDone(state: PokemonConnectionsState, context: GameContext): boolean {
  return allConnectedRequiredCompleted(context, state.playerIds, (playerId) => state.progress[playerId]?.status !== 'PLAYING');
}

function finishRound(state: PokemonConnectionsState, context: GameContext): PokemonConnectionsState {
  const progress = Object.fromEntries(state.playerIds.map((playerId) => {
    const current = state.progress[playerId] ?? emptyProgress();
    return [playerId, current.status === 'PLAYING' ? { ...current, status: 'TIMED_OUT' as const } : current];
  }));
  const playerStats = Object.fromEntries(state.playerIds.map((playerId) => {
    const current = state.playerStats[playerId] ?? emptyPokemonConnectionsStats();
    const player = progress[playerId]!;
    const elapsedMs = player.completedAt === null || state.roundStartedAt === null ? 0 : player.completedAt - state.roundStartedAt;
    return [playerId, {
      ...current,
      roundsPlayed: current.roundsPlayed + 1,
      boardsSolved: current.boardsSolved + (player.status === 'SOLVED' ? 1 : 0),
      podiumFinishes: current.podiumFinishes + ((player.completionRank ?? Infinity) <= 3 ? 1 : 0),
      solveTimeTotalMs: current.solveTimeTotalMs + elapsedMs,
      bestSolveTimeMs: elapsedMs > 0 && (current.bestSolveTimeMs === 0 || elapsedMs < current.bestSolveTimeMs) ? elapsedMs : current.bestSolveTimeMs,
    }];
  }));
  const players = Object.fromEntries(state.playerIds.map((playerId) => {
    const player = progress[playerId]!;
    return [playerId, {
      status: player.status as Exclude<typeof player.status, 'PLAYING'>,
      foundGroups: player.foundGroupIds.length,
      mistakesUsed: player.mistakesUsed,
      completionRank: player.completionRank,
      elapsedMs: player.completedAt === null || state.roundStartedAt === null ? null : player.completedAt - state.roundStartedAt,
      pointsAwarded: player.roundPoints,
    }];
  }));
  const lastRound: PokemonConnectionsRoundResult = {
    source: state.puzzleSource,
    groups: state.answerGroups.map(cloneGroup),
    players,
  };
  return {
    ...state,
    phase: 'ROUND_RESULTS',
    progress,
    playerStats,
    roundEndsAt: null,
    nextTransitionAt: context.now + POKEMON_CONNECTIONS_REVEAL_MS,
    lastRound,
  };
}

export const pokemonConnectionsGame: MiniGameModule<PokemonConnectionsConfig, PokemonConnectionsState, PokemonConnectionsAction, PokemonConnectionsPublicState> = {
  manifest,
  configSchema: pokemonConnectionsConfigSchema,
  actionSchema: pokemonConnectionsActionSchema,
  defaultConfig: defaultPokemonConnectionsConfig,
  createInitialState(config, context) {
    const parsed = pokemonConnectionsConfigSchema.parse(config);
    const playerIds = context.players.map((player) => player.id);
    const base: PokemonConnectionsState = {
      phase: 'GAME_STARTING', config: parsed, playerIds, roundNumber: 0,
      board: [], answerGroups: [], puzzleSource: 'DYNAMIC', puzzleKey: '', usedPuzzleKeys: [],
      progress: createProgress(playerIds), completionOrder: [],
      scores: Object.fromEntries(playerIds.map((playerId) => [playerId, 0])),
      playerStats: Object.fromEntries(playerIds.map((playerId) => [playerId, emptyPokemonConnectionsStats()])),
      roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null, lastRound: null,
    };
    return preparePuzzle(base, context);
  },
  start(state, context) {
    return activatePreparedRound(state, context);
  },
  handleAction(state, playerId, action, context): GameActionResult<PokemonConnectionsState> {
    if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'La ronda no está activa.' };
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'No puedes participar en esta ronda.' };
    const current = state.progress[playerId];
    if (!current || current.status !== 'PLAYING') return { state, accepted: false, error: 'Ya no puedes enviar más grupos en esta ronda.' };
    const uniqueIds = new Set(action.pokemonIds);
    if (uniqueIds.size !== state.config.groupSize || action.pokemonIds.length !== state.config.groupSize) {
      return { state, accepted: false, error: `Selecciona exactamente ${state.config.groupSize} Pokémon distintos.` };
    }
    const boardIds = new Set(state.board.map((pokemon) => pokemon.id));
    if ([...uniqueIds].some((id) => !boardIds.has(id))) return { state, accepted: false, error: 'La selección contiene un Pokémon ajeno al tablero.' };
    const foundIds = new Set(current.foundGroupIds.flatMap((groupId) => state.answerGroups.find((group) => group.id === groupId)?.pokemon.map((pokemon) => pokemon.id) ?? []));
    if ([...uniqueIds].some((id) => foundIds.has(id))) return { state, accepted: false, error: 'Ese Pokémon ya pertenece a un grupo encontrado.' };
    const remainingGroups = state.answerGroups.filter((group) => !current.foundGroupIds.includes(group.id));
    const matched = exactGroup(remainingGroups, uniqueIds);
    if (matched) {
      const foundGroupIds = [...current.foundGroupIds, matched.id];
      const solved = foundGroupIds.length === state.answerGroups.length;
      const completionRank = solved ? state.completionOrder.length + 1 : null;
      const bonus = completionRank === null ? 0 : completionBonus(completionRank);
      const progress: PokemonConnectionsProgress = {
        ...current,
        foundGroupIds,
        status: solved ? 'SOLVED' : 'PLAYING',
        completedAt: solved ? context.now : null,
        completionRank,
        roundPoints: current.roundPoints + 1 + bonus,
        lastAttempt: { kind: 'CORRECT', attemptedPokemonIds: [...uniqueIds], nearMiss: false, attemptedAt: context.now },
      };
      const stats = state.playerStats[playerId] ?? emptyPokemonConnectionsStats();
      const next: PokemonConnectionsState = {
        ...state,
        progress: { ...state.progress, [playerId]: progress },
        completionOrder: solved ? [...state.completionOrder, playerId] : state.completionOrder,
        scores: { ...state.scores, [playerId]: (state.scores[playerId] ?? 0) + 1 + bonus },
        playerStats: { ...state.playerStats, [playerId]: { ...stats, groupsFound: stats.groupsFound + 1 } },
      };
      return { state: allRequiredDone(next, context) ? finishRound(next, context) : next, accepted: true };
    }
    const nearMiss = isNearMiss(remainingGroups, uniqueIds);
    const mistakesUsed = current.mistakesUsed + 1;
    const progress: PokemonConnectionsProgress = {
      ...current,
      mistakesUsed,
      status: mistakesUsed >= state.config.mistakesAllowed ? 'ELIMINATED' : 'PLAYING',
      lastAttempt: { kind: 'INCORRECT', attemptedPokemonIds: [...uniqueIds], nearMiss, attemptedAt: context.now },
    };
    const stats = state.playerStats[playerId] ?? emptyPokemonConnectionsStats();
    const next: PokemonConnectionsState = {
      ...state,
      progress: { ...state.progress, [playerId]: progress },
      playerStats: { ...state.playerStats, [playerId]: { ...stats, mistakes: stats.mistakes + 1, nearMisses: stats.nearMisses + (nearMiss ? 1 : 0) } },
    };
    return { state: allRequiredDone(next, context) ? finishRound(next, context) : next, accepted: true };
  },
  handleTimeout(state, context) {
    if (state.phase === 'ROUND_ACTIVE' && context.now >= (state.roundEndsAt ?? Infinity)) return finishRound(state, context);
    if (state.phase === 'ROUND_RESULTS' && context.now >= (state.nextTransitionAt ?? Infinity)) return beginNextRound(state, context);
    return state;
  },
  handlePresenceChange(state, context) {
    return state.phase === 'ROUND_ACTIVE' && allRequiredDone(state, context) ? finishRound(state, context) : state;
  },
  getPublicState(state) {
    return {
      gameId: 'pokemon-connections',
      phase: state.phase,
      roundNumber: state.roundNumber,
      totalRounds: state.config.rounds,
      groupSize: state.config.groupSize,
      groupCount: state.answerGroups.length,
      board: state.board.map((pokemon) => ({ ...pokemon })),
      playerProgress: Object.fromEntries(state.playerIds.map((playerId) => {
        const progress = state.progress[playerId] ?? emptyProgress();
        return [playerId, { foundGroups: progress.foundGroupIds.length, status: progress.status }];
      })),
      scores: { ...state.scores },
      roundStartedAt: state.roundStartedAt,
      roundEndsAt: state.roundEndsAt,
      nextTransitionAt: state.nextTransitionAt,
      lastRound: (state.phase === 'ROUND_RESULTS' || state.phase === 'GAME_RESULTS') && state.lastRound ? {
        ...state.lastRound,
        groups: state.lastRound.groups.map(cloneGroup),
        players: Object.fromEntries(Object.entries(state.lastRound.players).map(([id, player]) => [id, { ...player }])),
      } : null,
      results: state.phase === 'GAME_RESULTS' ? buildPokemonConnectionsResults(state) : null,
    };
  },
  getPlayerState(state, playerId): PokemonConnectionsPlayerState {
    const progress = state.progress[playerId];
    if (!progress || !state.playerIds.includes(playerId)) return { role: 'SPECTATOR' };
    const found = new Set(progress.foundGroupIds);
    return {
      role: 'PLAYER',
      canSubmit: state.phase === 'ROUND_ACTIVE' && progress.status === 'PLAYING',
      foundGroups: state.answerGroups.filter((group) => found.has(group.id)).map(cloneGroup),
      mistakesUsed: progress.mistakesUsed,
      mistakesAllowed: state.config.mistakesAllowed,
      status: progress.status,
      completionRank: progress.completionRank,
      roundPoints: progress.roundPoints,
      lastAttempt: progress.lastAttempt ? { ...progress.lastAttempt, attemptedPokemonIds: [...progress.lastAttempt.attemptedPokemonIds] } : null,
    };
  },
  isFinished(state) {
    return state.phase === 'GAME_RESULTS';
  },
  getResults(state) {
    return buildPokemonConnectionsResults(state);
  },
};
