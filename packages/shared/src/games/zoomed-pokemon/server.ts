import type { Pokemon } from '../../pokemon/types.js';
import { isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule, type PokemonVisualAsset } from '../contracts.js';
import { advanceTimedRound, cooldownMessage, cooldownRemainingMs, resolveWhenRequiredPlayersComplete, setPlayerCooldown } from '../infrastructure/timing.js';
import { defaultZoomedPokemonConfig, zoomedPokemonConfigSchema, type ZoomedPokemonConfig } from './config.js';
import { buildZoomedHints, buildZoomedPokemonResults, emptyZoomedPokemonStats, isUsableZoomedSprite, supportsArtwork, zoomedPoints, zoomStageAt, zoomStageSchedule, ZOOMED_POKEMON_ZOOM_STAGES } from './rules.js';
import { zoomedPokemonActionSchema, type ZoomedPokemonAction, type ZoomedPokemonPlayerState, type ZoomedPokemonPublicState, type ZoomedPokemonState, type ZoomedPokemonVisual } from './types.js';

export const ZOOMED_POKEMON_COOLDOWN_MS = 1_000;
export const ZOOMED_POKEMON_REVEAL_MS = 4_000;

const manifest = {
  id: 'zoomed-pokemon', name: 'Zoomed Pokémon', icon: '🔎',
  description: 'Reconoce el Pokémon mientras una cámara compartida se aleja progresivamente.', minPlayers: 1, maxPlayers: 100,
  profileStats: {
    metrics: [
      { key: 'correct', label: 'Pokémon acertados', aggregation: 'SUM' as const },
      { key: 'missed', label: 'Pokémon no acertados', aggregation: 'SUM' as const },
      { key: 'totalAttempts', label: 'Intentos totales', aggregation: 'SUM' as const },
      { key: 'firstTry', label: 'Aciertos al primer intento', aggregation: 'SUM' as const },
      { key: 'firstPositions', label: 'Primeras posiciones', aggregation: 'SUM' as const },
      { key: 'solveTimeTotalMs', label: 'Tiempo total en aciertos', aggregation: 'SUM' as const, format: 'DURATION_MS' as const },
      { key: 'bestTimeMs', label: 'Mejor tiempo', aggregation: 'MIN' as const, format: 'DURATION_MS' as const },
      { key: 'maxZoomSolves', label: 'Aciertos en máximo zoom', aggregation: 'SUM' as const },
      { key: 'solveStageTotal', label: 'Total de stages al resolver', aggregation: 'SUM' as const },
      { key: 'pointsFromRounds', label: 'Puntos históricos', aggregation: 'SUM' as const },
    ],
    derivedMetrics: [
      { key: 'solveRate', label: 'Tasa de resolución', kind: 'PERCENT' as const, numerator: 'correct', denominator: ['correct', 'missed'] },
      { key: 'averageSolveTime', label: 'Tiempo medio de acierto', kind: 'AVERAGE' as const, numerator: 'solveTimeTotalMs', denominator: ['correct'], format: 'DURATION_MS' as const },
      { key: 'averageSolveStage', label: 'Stage medio de resolución', kind: 'AVERAGE' as const, numerator: 'solveStageTotal', denominator: ['correct'] },
    ],
  },
};

const spriteAsset = (pokemon: Pokemon): PokemonVisualAsset => ({ pokemonId: pokemon.id, source: 'SPRITE', location: pokemon.sprite });
const revealPokemon = (pokemon: Pokemon) => ({ id: pokemon.id, name: pokemon.name, generation: pokemon.generation });
const assetPath = (state: ZoomedPokemonState, context: GameContext, assetId: 'active' | 'reveal') => `/api/rooms/${encodeURIComponent(context.roomCode ?? 'opaque')}/games/${state.assetToken}/rounds/${state.roundNumber}/options/${assetId}/sprite`;

function artworkIds(context: GameContext): Set<string> { return new Set(context.pokemonVisuals?.artworkPokemonIds() ?? []); }

export function zoomedPokemonPool(config: ZoomedPokemonConfig, context: GameContext): Pokemon[] {
  const arts = artworkIds(context);
  return context.pokemon.forGenerations(config.generations, { includeForms: config.includeForms }).filter((pokemon) => {
    const sprite = isUsableZoomedSprite(pokemon);
    if (config.imageMode === 'SPRITE') return sprite;
    if (config.imageMode === 'ARTWORK') return arts.has(pokemon.id);
    return sprite || arts.has(pokemon.id);
  }).filter((pokemon) => supportsArtwork(config, pokemon.id, arts));
}

function chooseVisual(config: ZoomedPokemonConfig, pokemon: Pokemon, context: GameContext): ZoomedPokemonVisual {
  const artwork = context.pokemonVisuals?.artworkFor(pokemon.id) ?? null;
  const usableSprite = isUsableZoomedSprite(pokemon);
  let selected: PokemonVisualAsset | null = null;
  if (config.imageMode === 'ARTWORK') selected = artwork;
  else if (config.imageMode === 'SPRITE') selected = usableSprite ? spriteAsset(pokemon) : null;
  else if (artwork && usableSprite) selected = context.random() < 0.5 ? artwork : spriteAsset(pokemon);
  else selected = artwork ?? (usableSprite ? spriteAsset(pokemon) : null);
  if (!selected) throw new Error('El Pokémon seleccionado no dispone de una imagen válida.');
  return { pokemonId: pokemon.id, source: selected.source, location: selected.location, focusSeed: Math.floor(context.random() * 0x7fff_ffff) };
}

function beginRound(state: ZoomedPokemonState, context: GameContext): ZoomedPokemonState {
  const allCandidates = state.poolIds.map((id) => context.pokemon.byId(id)).filter((pokemon): pokemon is Pokemon => Boolean(pokemon));
  if (!allCandidates.length) {
    if (state.config.imageMode === 'ARTWORK') throw new Error('No hay artworks disponibles para las generaciones seleccionadas.');
    throw new Error('No hay imágenes válidas para las generaciones seleccionadas.');
  }
  let candidates = allCandidates.filter((pokemon) => !state.usedPokemonIds.includes(pokemon.id));
  if (!candidates.length) candidates = allCandidates;
  const target = candidates[Math.min(Math.floor(context.random() * candidates.length), candidates.length - 1)]!;
  const visual = chooseVisual(state.config, target, context);
  const roundStartedAt = context.now; const schedule = zoomStageSchedule(roundStartedAt, state.config.roundSeconds);
  context.preloadImage?.(visual.location);
  return {
    ...state, phase: 'ROUND_ACTIVE', roundNumber: state.roundNumber + 1, targetPokemonId: target.id, visual,
    usedPokemonIds: [...new Set([...state.usedPokemonIds, target.id])], attempts: [], attemptCounts: {}, solves: {}, cooldownUntil: {}, lastAttemptResult: {},
    currentZoomStage: 0, roundStartedAt, roundEndsAt: roundStartedAt + state.config.roundSeconds * 1_000, nextTransitionAt: schedule[0] ?? null, lastRound: null,
  };
}

function resolveRound(state: ZoomedPokemonState, context: GameContext): ZoomedPokemonState {
  if (state.phase !== 'ROUND_ACTIVE') return state;
  const target = context.pokemon.byId(state.targetPokemonId ?? ''); if (!target || !state.visual) throw new Error('El objetivo visual ya no está disponible.');
  const playerStats = { ...state.playerStats };
  for (const playerId of state.playerIds) if (!state.solves[playerId]) {
    const stats = playerStats[playerId] ?? emptyZoomedPokemonStats(); playerStats[playerId] = { ...stats, missed: stats.missed + 1 };
  }
  return {
    ...state, phase: 'ROUND_RESULTS', playerStats, roundEndsAt: null, nextTransitionAt: context.now + ZOOMED_POKEMON_REVEAL_MS,
    lastRound: { pokemon: revealPokemon(target), imageSourceType: state.visual.source, solves: { ...state.solves }, attemptCounts: { ...state.attemptCounts } },
  };
}

function finish(state: ZoomedPokemonState): ZoomedPokemonState { return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }; }

export const zoomedPokemonGame: MiniGameModule<ZoomedPokemonConfig, ZoomedPokemonState, ZoomedPokemonAction, ZoomedPokemonPublicState> = {
  manifest, configSchema: zoomedPokemonConfigSchema, actionSchema: zoomedPokemonActionSchema, defaultConfig: defaultZoomedPokemonConfig,
  createInitialState(config, context) {
    const parsed = zoomedPokemonConfigSchema.parse(config);
    if (context.players.length < manifest.minPlayers) throw new Error(`Se necesitan al menos ${manifest.minPlayers} jugadores.`);
    const pool = zoomedPokemonPool(parsed, context);
    if (!pool.length) {
      if (parsed.imageMode === 'ARTWORK') throw new Error('No hay artworks disponibles para las generaciones seleccionadas.');
      throw new Error('No hay imágenes válidas para las generaciones seleccionadas.');
    }
    const playerIds = context.players.map((player) => player.id);
    const guessPoolIds = context.pokemon.forGenerations(parsed.generations, { includeForms: parsed.includeForms }).filter(isUsableZoomedSprite).map((pokemon) => pokemon.id);
    const randomToken = Array.from({ length: 3 }, () => Math.floor(context.random() * 0x1_0000_0000).toString(36)).join('-');
    return {
      phase: 'GAME_STARTING', config: parsed, assetToken: `${context.now.toString(36)}-${randomToken}`, playerIds, poolIds: pool.map((pokemon) => pokemon.id), guessPoolIds, roundNumber: 0,
      targetPokemonId: null, visual: null, usedPokemonIds: [], attempts: [], attemptCounts: {}, solves: {}, cooldownUntil: {}, lastAttemptResult: {},
      scores: Object.fromEntries(playerIds.map((id) => [id, 0])), playerStats: Object.fromEntries(playerIds.map((id) => [id, emptyZoomedPokemonStats()])),
      currentZoomStage: 0, roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null, lastRound: null,
    };
  },
  start(state, context) { if (state.phase !== 'GAME_STARTING') throw new Error('La partida ya ha comenzado.'); return beginRound(state, context); },
  handleAction(state, playerId, action, context): GameActionResult<ZoomedPokemonState> {
    if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'No hay una ronda activa.' };
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'Estás observando esta ronda.' };
    if (state.solves[playerId]) return { state, accepted: false, error: 'Ya has acertado esta ronda.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state: resolveRound(state, context), accepted: false, error: 'El tiempo ha terminado.' };
    if (cooldownRemainingMs(context.now, state.cooldownUntil[playerId]) > 0) return { state, accepted: false, error: cooldownMessage(context.now, state.cooldownUntil[playerId]) };
    const guessed = context.pokemon.byId(action.pokemonId);
    if (!guessed || !state.guessPoolIds.includes(guessed.id)) return { state, accepted: false, error: 'Ese Pokémon o forma no pertenece al pool configurado.' };
    const attemptCount = (state.attemptCounts[playerId] ?? 0) + 1; const stats = state.playerStats[playerId] ?? emptyZoomedPokemonStats();
    if (guessed.id === state.targetPokemonId) {
      const solveOrder = Object.keys(state.solves).length + 1; const points = zoomedPoints(state.playerIds.length, solveOrder);
      const elapsedMs = context.now - state.roundStartedAt!; const zoomStage = zoomStageAt(state.roundStartedAt!, state.config.roundSeconds, context.now);
      const source = state.visual?.source ?? 'SPRITE';
      let next: ZoomedPokemonState = {
        ...state,
        attemptCounts: { ...state.attemptCounts, [playerId]: attemptCount },
        solves: { ...state.solves, [playerId]: { solvedAt: context.now, elapsedMs, solveOrder, zoomStage, zoom: ZOOMED_POKEMON_ZOOM_STAGES[zoomStage]!, points, attempts: attemptCount } },
        lastAttemptResult: { ...state.lastAttemptResult, [playerId]: { result: 'CORRECT', attemptedAt: context.now } },
        scores: { ...state.scores, [playerId]: (state.scores[playerId] ?? 0) + points },
        playerStats: { ...state.playerStats, [playerId]: {
          ...stats, correct: stats.correct + 1, totalAttempts: stats.totalAttempts + 1, firstTry: stats.firstTry + (attemptCount === 1 ? 1 : 0), firstPositions: stats.firstPositions + (solveOrder === 1 ? 1 : 0),
          solveTimeTotalMs: stats.solveTimeTotalMs + elapsedMs, bestTimeMs: stats.bestTimeMs <= 0 ? elapsedMs : Math.min(stats.bestTimeMs, elapsedMs), maxZoomSolves: stats.maxZoomSolves + (zoomStage === 0 ? 1 : 0),
          solveStageTotal: stats.solveStageTotal + zoomStage + 1, pointsFromRounds: stats.pointsFromRounds + points,
          solvesBySprite: stats.solvesBySprite + (source === 'SPRITE' ? 1 : 0), solvesByArtwork: stats.solvesByArtwork + (source === 'ARTWORK' ? 1 : 0),
        } },
      };
      next = resolveWhenRequiredPlayersComplete(next, context, next.playerIds, (id) => Boolean(next.solves[id]), resolveRound);
      return { state: next, accepted: true };
    }
    return { accepted: true, state: {
      ...state,
      attempts: [...state.attempts, { playerId, guessedPokemon: { id: guessed.id, name: guessed.name, sprite: guessed.sprite }, attemptedAt: context.now }].slice(-80),
      attemptCounts: { ...state.attemptCounts, [playerId]: attemptCount }, cooldownUntil: setPlayerCooldown(state.cooldownUntil, playerId, context.now, ZOOMED_POKEMON_COOLDOWN_MS),
      lastAttemptResult: { ...state.lastAttemptResult, [playerId]: { result: 'INCORRECT', attemptedAt: context.now } },
      playerStats: { ...state.playerStats, [playerId]: { ...stats, totalAttempts: stats.totalAttempts + 1 } },
    } };
  },
  handleTimeout(state, context) {
    return advanceTimedRound(state, context, {
      beginNext: beginRound, resolveActive: resolveRound, finish, isComplete: (current) => current.roundNumber >= current.config.rounds,
      tickActive(current) {
        const currentZoomStage = zoomStageAt(current.roundStartedAt!, current.config.roundSeconds, context.now);
        if (currentZoomStage === current.currentZoomStage) return current;
        const schedule = zoomStageSchedule(current.roundStartedAt!, current.config.roundSeconds);
        return { ...current, currentZoomStage, nextTransitionAt: schedule[currentZoomStage] ?? null };
      },
    });
  },
  handlePresenceChange(state, context) { return resolveWhenRequiredPlayersComplete(state, context, state.playerIds, (id) => Boolean(state.solves[id]), resolveRound); },
  getPublicState(state, context) {
    const target = context.pokemon.byId(state.targetPokemonId ?? '');
    const active = state.phase === 'ROUND_ACTIVE' && state.visual;
    const lastRound = state.lastRound && (state.phase === 'ROUND_RESULTS' || state.phase === 'GAME_RESULTS') ? {
      pokemon: { name: state.lastRound.pokemon.name, generation: state.lastRound.pokemon.generation }, imageUrl: assetPath(state, context, 'reveal'), initialCropUrl: assetPath(state, context, 'active'),
      imageSourceType: state.lastRound.imageSourceType, solves: state.lastRound.solves, attemptCounts: state.lastRound.attemptCounts,
    } : null;
    return {
      gameId: 'zoomed-pokemon', phase: state.phase, roundNumber: state.roundNumber, totalRounds: state.config.rounds,
      imageUrl: active ? assetPath(state, context, 'active') : null, imageSourceType: active ? state.visual!.source : null, focusPoint: { x: 0.5, y: 0.5 }, zoomStages: ZOOMED_POKEMON_ZOOM_STAGES,
      currentZoomStage: state.currentZoomStage, visibleHints: active && state.config.hintsEnabled && target ? buildZoomedHints(target, state.config.hintKinds) : [],
      attempts: state.attempts, solves: Object.fromEntries(Object.entries(state.solves).map(([id, solve]) => [id, { solveOrder: solve.solveOrder, zoomStage: solve.zoomStage }])), scores: state.scores,
      roundStartedAt: state.roundStartedAt, roundEndsAt: state.roundEndsAt, nextTransitionAt: state.nextTransitionAt, lastRound,
      results: state.phase === 'GAME_RESULTS' ? buildZoomedPokemonResults(state) : null,
    };
  },
  getPlayerState(state, playerId, context): ZoomedPokemonPlayerState {
    const solve = state.solves[playerId]; return {
      canGuess: state.phase === 'ROUND_ACTIVE' && state.playerIds.includes(playerId) && isPlayerRequired(context, playerId) && !solve,
      solved: Boolean(solve), solveOrder: solve?.solveOrder ?? null, cooldownUntil: state.cooldownUntil[playerId] ?? null, roundPoints: solve?.points ?? 0,
      attemptCount: state.attemptCounts[playerId] ?? 0, lastAttempt: state.lastAttemptResult[playerId] ?? null,
    };
  },
  resolveAsset(state, request) {
    if (state.assetToken !== request.assetToken || state.roundNumber !== request.roundNumber || !state.visual) return null;
    if (request.assetId === 'active' && (state.phase === 'ROUND_ACTIVE' || state.phase === 'ROUND_RESULTS')) return { source: state.visual.location, transform: 'FOCUSED_NORMALIZED', focusSeed: state.visual.focusSeed };
    if (request.assetId === 'reveal' && (state.phase === 'ROUND_RESULTS' || state.phase === 'GAME_RESULTS')) return { source: state.visual.location, transform: 'NORMALIZED' };
    return null;
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildZoomedPokemonResults(state); },
};
