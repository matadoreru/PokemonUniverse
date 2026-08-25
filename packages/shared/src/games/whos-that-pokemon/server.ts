import type { Pokemon } from '../../pokemon/types.js';
import { isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { advanceTimedRound, cooldownMessage, cooldownRemainingMs, resolveWhenRequiredPlayersComplete, setPlayerCooldown } from '../infrastructure/timing.js';
import { defaultWhosThatPokemonConfig, whosThatPokemonConfigSchema, type WhosThatPokemonConfig } from './config.js';
import { buildWhoPokemonHints, buildWhoPokemonResults, emptyWhoPokemonStats, isUsableWhoPokemonSprite, whoPokemonHintSchedule, whoPokemonPoints } from './rules.js';
import { whosThatPokemonActionSchema, type WhosThatPokemonAction, type WhosThatPokemonPlayerState, type WhosThatPokemonPublicState, type WhosThatPokemonRoundPublicResult, type WhosThatPokemonState } from './types.js';

export const WHOS_THAT_POKEMON_COOLDOWN_MS = 1_000;
export const WHOS_THAT_POKEMON_REVEAL_MS = 4_000;

const manifest = {
  id: 'whos-that-pokemon', name: '¿Quién es ese Pokémon?', icon: '❓',
  description: 'Reconoce la silueta antes que nadie y suma más puntos cuanto más rápido aciertes.', minPlayers: 1, maxPlayers: 8,
  profileStats: {
    metrics: [
      { key: 'correct', label: 'Pokémon acertados', aggregation: 'SUM' as const },
      { key: 'missed', label: 'Pokémon no acertados', aggregation: 'SUM' as const },
      { key: 'totalAttempts', label: 'Intentos totales', aggregation: 'SUM' as const },
      { key: 'firstTry', label: 'Aciertos al primer intento', aggregation: 'SUM' as const },
      { key: 'solveTimeTotalMs', label: 'Tiempo total en aciertos', aggregation: 'SUM' as const, format: 'DURATION_MS' as const },
      { key: 'bestTimeMs', label: 'Mejor tiempo', aggregation: 'MIN' as const, format: 'DURATION_MS' as const },
      { key: 'pointsFromRounds', label: 'Puntos en rondas', aggregation: 'SUM' as const },
    ],
    derivedMetrics: [
      { key: 'solveRate', label: 'Tasa de resolución', kind: 'PERCENT' as const, numerator: 'correct', denominator: ['correct', 'missed'] },
      { key: 'accuracy', label: 'Precisión', kind: 'PERCENT' as const, numerator: 'correct', denominator: ['totalAttempts'] },
      { key: 'averageSolveTime', label: 'Tiempo medio para acertar', kind: 'AVERAGE' as const, numerator: 'solveTimeTotalMs', denominator: ['correct'], format: 'DURATION_MS' as const },
    ],
  },
};

const reveal = (pokemon: Pokemon) => ({ id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite });
const assetPath = (state: WhosThatPokemonState, context: GameContext, assetId: 'shadow' | 'reveal') => `/api/rooms/${encodeURIComponent(context.roomCode ?? 'opaque')}/games/${state.assetToken}/rounds/${state.roundNumber}/options/${assetId}/sprite`;

export function whosThatPokemonPool(config: WhosThatPokemonConfig, context: GameContext): Pokemon[] {
  return context.pokemon.forGenerations(config.generations, { includeForms: config.includeRegionalForms }).filter(isUsableWhoPokemonSprite);
}

function beginRound(state: WhosThatPokemonState, context: GameContext): WhosThatPokemonState {
  const allCandidates = state.poolIds.map((id) => context.pokemon.byId(id)).filter((pokemon): pokemon is Pokemon => Boolean(pokemon));
  if (!allCandidates.length) throw new Error('No hay Pokémon con sprites válidos para esta configuración.');
  let candidates = allCandidates.filter((pokemon) => !state.usedPokemonIds.includes(pokemon.id));
  if (!candidates.length) candidates = allCandidates;
  const target = candidates[Math.min(Math.floor(context.random() * candidates.length), candidates.length - 1)]!;
  const roundStartedAt = context.now; const roundEndsAt = roundStartedAt + state.config.roundSeconds * 1_000;
  const hints = state.config.hintsEnabled ? buildWhoPokemonHints(target) : [];
  const hintSchedule = whoPokemonHintSchedule(roundStartedAt, state.config.roundSeconds, hints.length);
  context.preloadImage?.(target.sprite);
  return {
    ...state, phase: 'ROUND_ACTIVE', roundNumber: state.roundNumber + 1, targetPokemonId: target.id,
    usedPokemonIds: [...new Set([...state.usedPokemonIds, target.id])], attempts: [], attemptCounts: {}, solves: {}, cooldownUntil: {}, lastAttemptResult: {},
    revealedHintCount: 0, roundStartedAt, roundEndsAt, nextTransitionAt: hintSchedule[0] ?? null, lastRound: null,
  };
}

function resolveRound(state: WhosThatPokemonState, context: GameContext): WhosThatPokemonState {
  if (state.phase !== 'ROUND_ACTIVE') return state;
  const target = context.pokemon.byId(state.targetPokemonId ?? '');
  if (!target) throw new Error('El Pokémon objetivo ya no está disponible.');
  const playerStats = { ...state.playerStats };
  for (const playerId of state.playerIds) if (!state.solves[playerId]) {
    const stats = playerStats[playerId] ?? emptyWhoPokemonStats();
    playerStats[playerId] = { ...stats, missed: stats.missed + 1 };
  }
  return {
    ...state, phase: 'ROUND_RESULTS', playerStats, roundEndsAt: null, nextTransitionAt: context.now + WHOS_THAT_POKEMON_REVEAL_MS,
    lastRound: { pokemon: { ...reveal(target), generation: target.generation }, solves: { ...state.solves }, attemptCounts: { ...state.attemptCounts } },
  };
}

function finish(state: WhosThatPokemonState): WhosThatPokemonState {
  return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null };
}

function publicRoundResult(state: WhosThatPokemonState, context: GameContext): WhosThatPokemonRoundPublicResult | null {
  if (!state.lastRound || (state.phase !== 'ROUND_RESULTS' && state.phase !== 'GAME_RESULTS')) return null;
  return {
    pokemon: { name: state.lastRound.pokemon.name, generation: state.lastRound.pokemon.generation, sprite: assetPath(state, context, 'reveal') },
    solves: state.lastRound.solves,
    attemptCounts: state.lastRound.attemptCounts,
  };
}

export const whosThatPokemonGame: MiniGameModule<WhosThatPokemonConfig, WhosThatPokemonState, WhosThatPokemonAction, WhosThatPokemonPublicState> = {
  manifest, configSchema: whosThatPokemonConfigSchema, actionSchema: whosThatPokemonActionSchema, defaultConfig: defaultWhosThatPokemonConfig,
  createInitialState(config, context) {
    const parsed = whosThatPokemonConfigSchema.parse(config);
    if (context.players.length < manifest.minPlayers) throw new Error(`Se necesitan al menos ${manifest.minPlayers} jugadores.`);
    const pool = whosThatPokemonPool(parsed, context);
    if (!pool.length) throw new Error('No hay Pokémon con sprites válidos en las generaciones seleccionadas.');
    const playerIds = context.players.map((player) => player.id);
    const randomToken = Array.from({ length: 3 }, () => Math.floor(context.random() * 0x1_0000_0000).toString(36)).join('-');
    return {
      phase: 'GAME_STARTING', config: parsed, assetToken: `${context.now.toString(36)}-${randomToken}`, playerIds, poolIds: pool.map((pokemon) => pokemon.id), roundNumber: 0,
      targetPokemonId: null, usedPokemonIds: [], attempts: [], attemptCounts: {}, solves: {}, cooldownUntil: {}, lastAttemptResult: {},
      scores: Object.fromEntries(playerIds.map((id) => [id, 0])), playerStats: Object.fromEntries(playerIds.map((id) => [id, emptyWhoPokemonStats()])),
      revealedHintCount: 0, roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null, lastRound: null,
    };
  },
  start(state, context) { if (state.phase !== 'GAME_STARTING') throw new Error('La partida ya ha comenzado.'); return beginRound(state, context); },
  handleAction(state, playerId, action, context): GameActionResult<WhosThatPokemonState> {
    if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'No hay una ronda activa.' };
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'Estás observando esta ronda.' };
    if (state.solves[playerId]) return { state, accepted: false, error: 'Ya has acertado esta ronda.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state: resolveRound(state, context), accepted: false, error: 'El tiempo ha terminado.' };
    if (cooldownRemainingMs(context.now, state.cooldownUntil[playerId]) > 0) return { state, accepted: false, error: cooldownMessage(context.now, state.cooldownUntil[playerId]) };
    const guessed = context.pokemon.byId(action.pokemonId);
    if (!guessed || !state.poolIds.includes(guessed.id)) return { state, accepted: false, error: 'Ese Pokémon no pertenece al pool configurado.' };
    const attemptCount = (state.attemptCounts[playerId] ?? 0) + 1;
    const stats = state.playerStats[playerId] ?? emptyWhoPokemonStats();
    if (guessed.id === state.targetPokemonId) {
      const elapsedMs = context.now - state.roundStartedAt!; const points = whoPokemonPoints(state.roundStartedAt!, state.config.roundSeconds, context.now);
      let next: WhosThatPokemonState = {
        ...state,
        attemptCounts: { ...state.attemptCounts, [playerId]: attemptCount },
        solves: { ...state.solves, [playerId]: { solvedAt: context.now, elapsedMs, points, attempts: attemptCount } },
        lastAttemptResult: { ...state.lastAttemptResult, [playerId]: { result: 'CORRECT', attemptedAt: context.now } },
        scores: { ...state.scores, [playerId]: (state.scores[playerId] ?? 0) + points },
        playerStats: { ...state.playerStats, [playerId]: {
          ...stats, correct: stats.correct + 1, totalAttempts: stats.totalAttempts + 1, firstTry: stats.firstTry + (attemptCount === 1 ? 1 : 0),
          solveTimeTotalMs: stats.solveTimeTotalMs + elapsedMs, bestTimeMs: stats.bestTimeMs <= 0 ? elapsedMs : Math.min(stats.bestTimeMs, elapsedMs), pointsFromRounds: stats.pointsFromRounds + points,
        } },
      };
      next = resolveWhenRequiredPlayersComplete(next, context, next.playerIds, (id) => Boolean(next.solves[id]), resolveRound);
      return { state: next, accepted: true };
    }
    return { accepted: true, state: {
      ...state,
      attempts: [...state.attempts, { playerId, guessedPokemon: reveal(guessed), attemptedAt: context.now }],
      attemptCounts: { ...state.attemptCounts, [playerId]: attemptCount },
      cooldownUntil: setPlayerCooldown(state.cooldownUntil, playerId, context.now, WHOS_THAT_POKEMON_COOLDOWN_MS),
      lastAttemptResult: { ...state.lastAttemptResult, [playerId]: { result: 'INCORRECT', attemptedAt: context.now } },
      playerStats: { ...state.playerStats, [playerId]: { ...stats, totalAttempts: stats.totalAttempts + 1 } },
    } };
  },
  handleTimeout(state, context) {
    return advanceTimedRound(state, context, {
      beginNext: beginRound, resolveActive: resolveRound, finish, isComplete: (current) => current.roundNumber >= current.config.rounds,
      tickActive(current) {
        if (!current.config.hintsEnabled || context.now < (current.nextTransitionAt ?? Infinity)) return current;
        const target = context.pokemon.byId(current.targetPokemonId ?? ''); if (!target) return current;
        const hints = buildWhoPokemonHints(target); const schedule = whoPokemonHintSchedule(current.roundStartedAt!, current.config.roundSeconds, hints.length);
        const revealedHintCount = schedule.filter((deadline) => context.now >= deadline).length;
        return { ...current, revealedHintCount, nextTransitionAt: schedule[revealedHintCount] ?? null };
      },
    });
  },
  handlePresenceChange(state, context) { return resolveWhenRequiredPlayersComplete(state, context, state.playerIds, (id) => Boolean(state.solves[id]), resolveRound); },
  getPublicState(state, context) {
    const target = context.pokemon.byId(state.targetPokemonId ?? '');
    return {
      gameId: 'whos-that-pokemon', phase: state.phase, roundNumber: state.roundNumber, totalRounds: state.config.rounds,
      silhouetteSprite: state.phase === 'ROUND_ACTIVE' && target ? assetPath(state, context, 'shadow') : null,
      visibleHints: state.phase === 'ROUND_ACTIVE' && state.config.hintsEnabled && target ? buildWhoPokemonHints(target).slice(0, state.revealedHintCount) : [],
      attempts: state.attempts, solvedPlayerIds: Object.keys(state.solves), scores: state.scores,
      roundStartedAt: state.roundStartedAt, roundEndsAt: state.roundEndsAt, nextTransitionAt: state.nextTransitionAt,
      lastRound: publicRoundResult(state, context), results: state.phase === 'GAME_RESULTS' ? buildWhoPokemonResults(state) : null,
    };
  },
  getPlayerState(state, playerId, context): WhosThatPokemonPlayerState {
    const solve = state.solves[playerId];
    return {
      canGuess: state.phase === 'ROUND_ACTIVE' && state.playerIds.includes(playerId) && isPlayerRequired(context, playerId) && !solve,
      solved: Boolean(solve), cooldownUntil: state.cooldownUntil[playerId] ?? null, roundPoints: solve?.points ?? 0,
      attemptCount: state.attemptCounts[playerId] ?? 0, lastAttempt: state.lastAttemptResult[playerId] ?? null,
    };
  },
  resolveAsset(state, request, context) {
    if (state.assetToken !== request.assetToken || state.roundNumber !== request.roundNumber) return null;
    const target = context.pokemon.byId(state.targetPokemonId ?? ''); if (!target) return null;
    if (request.assetId === 'shadow') return { source: target.sprite, transform: 'SILHOUETTE' };
    if (request.assetId === 'reveal' && (state.phase === 'ROUND_RESULTS' || state.phase === 'GAME_RESULTS')) return { source: target.sprite, transform: 'ORIGINAL' };
    return null;
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildWhoPokemonResults(state); },
};
