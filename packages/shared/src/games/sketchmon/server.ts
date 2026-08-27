import type { Pokemon } from '../../pokemon/types.js';
import { isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { cooldownMessage, cooldownRemainingMs, setPlayerCooldown } from '../infrastructure/timing.js';
import { defaultSketchmonConfig, sketchmonConfigSchema, type SketchmonConfig } from './config.js';
import { buildSketchmonResults, emptySketchmonStats, SKETCHMON_DRAWER_POINTS, sketchmonGuesserPoints } from './rules.js';
import { sketchmonActionSchema, type SketchmonAction, type SketchmonGalleryEntry, type SketchmonHint, type SketchmonPlayerState, type SketchmonPokemonReveal, type SketchmonPublicState, type SketchmonState, type SketchmonStroke } from './types.js';

export const SKETCHMON_GUESS_COOLDOWN_MS = 750;
export const SKETCHMON_REVEAL_MS = 6_000;
export const SKETCHMON_SPRITE_PREVIEW_MS = 3_000;

const manifest = {
  id: 'sketchmon', name: 'Sketchmon', icon: '🎨',
  description: 'Dibuja un Pokémon en tiempo real para que el resto lo descubra.', experimental: true, minPlayers: 2,
  profileStats: {
    metrics: [
      { key: 'guessedPokemon', label: 'Pokémon adivinados', aggregation: 'SUM' },
      { key: 'firstTry', label: 'Aciertos al primer intento', aggregation: 'SUM' },
      { key: 'totalAttempts', label: 'Intentos totales', aggregation: 'SUM' },
      { key: 'firstCorrectResponses', label: 'Primeras respuestas correctas', aggregation: 'SUM' },
      { key: 'drawingRounds', label: 'Rondas dibujando', aggregation: 'SUM' },
      { key: 'drawingSuccesses', label: 'Dibujos adivinados', aggregation: 'SUM' },
      { key: 'drawingFailures', label: 'Dibujos no adivinados', aggregation: 'SUM' },
      { key: 'pointsFromGuessing', label: 'Puntos por adivinar', aggregation: 'SUM' },
      { key: 'pointsFromDrawing', label: 'Puntos por dibujar', aggregation: 'SUM' },
    ],
    derivedMetrics: [
      { key: 'drawingSuccessRate', label: 'Tasa de dibujos adivinados', kind: 'PERCENT', numerator: 'drawingSuccesses', denominator: ['drawingSuccesses', 'drawingFailures'] },
    ],
  },
} as const;

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.min(Math.floor(random() * (index + 1)), index);
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

function drawerOrder(playerIds: readonly string[], laps: number, random: () => number): string[] {
  return Array.from({ length: laps }, () => shuffled(playerIds, random)).flat();
}

export function sketchmonPool(config: SketchmonConfig, context: GameContext): Pokemon[] {
  return context.pokemon.forGenerations(config.generations, { includeForms: config.includeForms })
    .filter((pokemon) => Boolean(pokemon.id && pokemon.name && pokemon.sprite) && (config.includeForms || pokemon.isDefault !== false));
}

function reveal(pokemon: Pokemon): SketchmonPokemonReveal {
  return { id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite, generation: pokemon.generation, types: [...pokemon.types] };
}

function cloneDrawing(strokes: readonly SketchmonStroke[]): SketchmonStroke[] {
  return strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) }));
}

export function sketchmonHintDeadlines(roundStartedAt: number, roundSeconds: number): number[] {
  const duration = roundSeconds * 1_000;
  return [1 / 3, 5 / 9, 7 / 9].map((fraction) => roundStartedAt + Math.round(duration * fraction));
}

function evolutionHint(pokemon: Pokemon): string {
  if (pokemon.evolutionStage === undefined || pokemon.evolutionStageCount === undefined) return 'Evolución desconocida';
  if (pokemon.evolutionStageCount <= 1) return 'No evoluciona';
  if (pokemon.evolutionStage >= pokemon.evolutionStageCount) return 'Evolución final';
  if (pokemon.evolutionStage <= 1) return 'Primera etapa evolutiva';
  return `Etapa ${pokemon.evolutionStage} de ${pokemon.evolutionStageCount}`;
}

function hintsFor(pokemon: Pokemon): SketchmonHint[] {
  return [
    { kind: 'GENERATION', generation: pokemon.generation },
    { kind: 'TYPES', types: [...pokemon.types] },
    { kind: 'EVOLUTION', text: evolutionHint(pokemon) },
  ];
}

function advanceHints(state: SketchmonState, context: GameContext): SketchmonState {
  if (state.phase !== 'ROUND_ACTIVE' || state.roundStartedAt === null) return state;
  const target = context.pokemon.byId(state.targetPokemonId ?? '');
  const deadlines = state.config.hintsEnabled ? sketchmonHintDeadlines(state.roundStartedAt, state.config.roundSeconds) : [];
  const revealedCount = deadlines.filter((deadline) => context.now >= deadline).length;
  const pending = [
    deadlines[revealedCount],
    state.config.memoryPreviewEnabled && context.now < state.roundStartedAt + SKETCHMON_SPRITE_PREVIEW_MS
      ? state.roundStartedAt + SKETCHMON_SPRITE_PREVIEW_MS
      : undefined,
  ].filter((deadline): deadline is number => deadline !== undefined);
  const nextTransitionAt = pending.length ? Math.min(...pending) : null;
  const visibleHints = target && state.config.hintsEnabled ? hintsFor(target).slice(0, revealedCount) : state.visibleHints;
  if (visibleHints.length === state.visibleHints.length && nextTransitionAt === state.nextTransitionAt) return state;
  return { ...state, visibleHints, nextTransitionAt };
}

function incrementDrawingFailure(state: SketchmonState, drawerId: string): SketchmonState {
  const stats = state.playerStats[drawerId] ?? emptySketchmonStats();
  return { ...state, playerStats: { ...state.playerStats, [drawerId]: {
    ...stats, drawingRounds: stats.drawingRounds + 1, drawingFailures: stats.drawingFailures + 1,
  } } };
}

function finish(state: SketchmonState): SketchmonState {
  return {
    ...state, phase: 'GAME_RESULTS', targetPokemonId: null, drawerId: null, strokes: [], undoStack: [], redoStack: [], visibleHints: [], attempts: [],
    roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null, lastRound: null,
  };
}

function selectTarget(state: SketchmonState, context: GameContext): Pokemon {
  const pool = state.poolIds.map((id) => context.pokemon.byId(id)).filter((pokemon): pokemon is Pokemon => Boolean(pokemon));
  let candidates = pool.filter((pokemon) => !state.usedPokemonIds.includes(pokemon.id));
  if (!candidates.length) candidates = pool;
  const selected = candidates[Math.min(Math.floor(context.random() * candidates.length), candidates.length - 1)];
  if (!selected) throw new Error('No hay Pokémon disponibles para Sketchmon.');
  return selected;
}

function beginNextRound(initial: SketchmonState, context: GameContext): SketchmonState {
  let state = initial;
  const totalRounds = state.drawerOrder.length;
  while (state.roundNumber < totalRounds) {
    const roundNumber = state.roundNumber + 1;
    const drawerId = state.drawerOrder[roundNumber - 1]!;
    if (!isPlayerRequired(context, drawerId)) {
      state = incrementDrawingFailure({ ...state, roundNumber }, drawerId);
      continue;
    }
    const target = selectTarget(state, context);
    context.preloadImage?.(target.sprite);
    const roundStartedAt = context.now;
    const firstHintAt = state.config.hintsEnabled ? sketchmonHintDeadlines(roundStartedAt, state.config.roundSeconds)[0]! : null;
    const previewEndsAt = state.config.memoryPreviewEnabled ? roundStartedAt + SKETCHMON_SPRITE_PREVIEW_MS : null;
    return {
      ...state, phase: 'ROUND_ACTIVE', roundNumber, targetPokemonId: target.id, drawerId,
      usedPokemonIds: [...new Set([...state.usedPokemonIds, target.id])], strokes: [], undoStack: [], redoStack: [], visibleHints: [], attempts: [],
      attemptCounts: {}, cooldownUntil: {}, roundStartedAt,
      roundEndsAt: roundStartedAt + state.config.roundSeconds * 1_000,
      nextTransitionAt: firstHintAt === null ? previewEndsAt : previewEndsAt === null ? firstHintAt : Math.min(firstHintAt, previewEndsAt),
      lastRound: null,
    };
  }
  return finish(state);
}

function resolveRound(state: SketchmonState, context: GameContext, winnerId: string | null): SketchmonState {
  if (state.phase !== 'ROUND_ACTIVE') return state;
  const target = context.pokemon.byId(state.targetPokemonId ?? '');
  const drawerId = state.drawerId;
  if (!target || !drawerId || state.roundStartedAt === null) throw new Error('El secreto de Sketchmon ya no está disponible.');
  const elapsedMs = Math.max(0, Math.min(state.config.roundSeconds * 1_000, context.now - state.roundStartedAt));
  const scores = { ...state.scores }; const playerStats = { ...state.playerStats };
  let guesserPoints = 0; let awardedDrawerPoints = 0;
  if (winnerId) {
    guesserPoints = sketchmonGuesserPoints(elapsedMs); awardedDrawerPoints = SKETCHMON_DRAWER_POINTS;
    scores[winnerId] = (scores[winnerId] ?? 0) + guesserPoints;
    scores[drawerId] = (scores[drawerId] ?? 0) + awardedDrawerPoints;
    const winnerStats = playerStats[winnerId] ?? emptySketchmonStats();
    const attemptCount = state.attemptCounts[winnerId] ?? 0;
    playerStats[winnerId] = {
      ...winnerStats, guessedPokemon: winnerStats.guessedPokemon + 1,
      firstTry: winnerStats.firstTry + (attemptCount === 1 ? 1 : 0),
      firstCorrectResponses: winnerStats.firstCorrectResponses + 1,
      pointsFromGuessing: winnerStats.pointsFromGuessing + guesserPoints,
    };
  }
  const drawerStats = playerStats[drawerId] ?? emptySketchmonStats();
  playerStats[drawerId] = {
    ...drawerStats, drawingRounds: drawerStats.drawingRounds + 1,
    drawingSuccesses: drawerStats.drawingSuccesses + (winnerId ? 1 : 0),
    drawingFailures: drawerStats.drawingFailures + (winnerId ? 0 : 1),
    pointsFromDrawing: drawerStats.pointsFromDrawing + awardedDrawerPoints,
  };
  const drawing = cloneDrawing(state.strokes);
  const lastRound = {
    reason: winnerId ? 'GUESSED' as const : 'TIMEOUT' as const,
    pokemon: reveal(target), drawerId, winnerId, elapsedMs, guesserPoints,
    drawerPoints: awardedDrawerPoints, winnerAttemptCount: winnerId ? state.attemptCounts[winnerId] ?? 0 : null,
    drawing,
  };
  const galleryEntry: SketchmonGalleryEntry = {
    ...lastRound, roundNumber: state.roundNumber,
    lapNumber: Math.floor((state.roundNumber - 1) / state.playerIds.length) + 1,
  };
  return {
    ...state, phase: 'ROUND_RESULTS', scores, playerStats, roundEndsAt: null,
    nextTransitionAt: context.now + SKETCHMON_REVEAL_MS, lastRound,
    gallery: [...state.gallery, galleryEntry],
  };
}

function applyDrawingBatch(state: SketchmonState, action: Extract<SketchmonAction, { type: 'DRAW_BATCH' }>): GameActionResult<SketchmonState> {
  const strokes = cloneDrawing(state.strokes);
  const undoStack = state.undoStack.map(cloneDrawing);
  let redoStack = state.redoStack.map(cloneDrawing);
  for (const operation of action.operations) {
    if (operation.kind === 'START') {
      if (strokes.some((stroke) => stroke.id === operation.stroke.id)) return { state, accepted: false, error: 'Ese trazo ya existe.' };
      undoStack.push(cloneDrawing(strokes));
      redoStack = [];
      strokes.push({ ...operation.stroke, points: operation.stroke.points.map((point) => ({ ...point })) });
    } else {
      const stroke = strokes.find((candidate) => candidate.id === operation.strokeId);
      if (!stroke) return { state, accepted: false, error: 'No se puede continuar un trazo inexistente.' };
      stroke.points.push(...operation.points.map((point) => ({ ...point })));
    }
  }
  return { state: { ...state, strokes, undoStack, redoStack }, accepted: true };
}

export const sketchmonGame: MiniGameModule<SketchmonConfig, SketchmonState, SketchmonAction, SketchmonPublicState> = {
  manifest,
  configSchema: sketchmonConfigSchema,
  actionSchema: sketchmonActionSchema,
  defaultConfig: defaultSketchmonConfig,
  createInitialState(config, context) {
    const parsed = sketchmonConfigSchema.parse(config);
    if (context.players.length < manifest.minPlayers) throw new Error(`Se necesitan al menos ${manifest.minPlayers} jugadores.`);
    const pool = sketchmonPool(parsed, context);
    if (!pool.length) throw new Error('No hay Pokémon disponibles para esa configuración.');
    const playerIds = context.players.map((player) => player.id);
    return {
      phase: 'GAME_STARTING', config: parsed, playerIds, drawerOrder: drawerOrder(playerIds, parsed.laps, context.random),
      poolIds: pool.map((pokemon) => pokemon.id), usedPokemonIds: [], roundNumber: 0, targetPokemonId: null,
      drawerId: null, strokes: [], undoStack: [], redoStack: [], visibleHints: [], attempts: [], attemptCounts: {}, cooldownUntil: {},
      scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
      playerStats: Object.fromEntries(playerIds.map((id) => [id, emptySketchmonStats()])),
      roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null, lastRound: null, gallery: [],
    };
  },
  start(state, context) {
    if (state.phase !== 'GAME_STARTING') throw new Error('La partida ya ha comenzado.');
    return beginNextRound(state, context);
  },
  handleAction(initial, playerId, action, context): GameActionResult<SketchmonState> {
    if (initial.phase !== 'ROUND_ACTIVE') return { state: initial, accepted: false, error: 'No hay una ronda activa.' };
    if (!initial.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state: initial, accepted: false, error: 'Estás observando esta ronda.' };
    if (context.now >= (initial.roundEndsAt ?? 0)) return { state: resolveRound(initial, context, null), accepted: false, error: 'El tiempo ha terminado.' };
    const state = advanceHints(initial, context);
    if (action.type === 'DRAW_BATCH') {
      if (playerId !== state.drawerId) return { state, accepted: false, error: 'Solo quien dibuja puede añadir trazos.' };
      return applyDrawingBatch(state, action);
    }
    if (action.type === 'UNDO_STROKE' || action.type === 'REDO_STROKE' || action.type === 'CLEAR_DRAWING') {
      if (playerId !== state.drawerId) return { state, accepted: false, error: 'Solo quien dibuja puede editar el lienzo.' };
      if (action.type === 'CLEAR_DRAWING') {
        if (!state.strokes.length) return { state, accepted: true };
        return { state: { ...state, strokes: [], undoStack: [...state.undoStack.map(cloneDrawing), cloneDrawing(state.strokes)], redoStack: [] }, accepted: true };
      }
      if (action.type === 'UNDO_STROKE') {
        const previous = state.undoStack.at(-1); if (!previous) return { state, accepted: true };
        return { state: { ...state, strokes: cloneDrawing(previous), undoStack: state.undoStack.slice(0, -1).map(cloneDrawing), redoStack: [...state.redoStack.map(cloneDrawing), cloneDrawing(state.strokes)] }, accepted: true };
      }
      const next = state.redoStack.at(-1); if (!next) return { state, accepted: true };
      return { state: { ...state, strokes: cloneDrawing(next), undoStack: [...state.undoStack.map(cloneDrawing), cloneDrawing(state.strokes)], redoStack: state.redoStack.slice(0, -1).map(cloneDrawing) }, accepted: true };
    }
    if (playerId === state.drawerId) return { state, accepted: false, error: 'Quien dibuja no puede adivinar.' };
    if (cooldownRemainingMs(context.now, state.cooldownUntil[playerId]) > 0) return { state, accepted: false, error: cooldownMessage(context.now, state.cooldownUntil[playerId]) };
    const guessed = context.pokemon.byId(action.pokemonId);
    if (!guessed || !state.poolIds.includes(guessed.id)) return { state, accepted: false, error: 'Ese Pokémon no pertenece al pool configurado.' };
    const attemptCount = (state.attemptCounts[playerId] ?? 0) + 1;
    const stats = state.playerStats[playerId] ?? emptySketchmonStats();
    let next: SketchmonState = {
      ...state, attemptCounts: { ...state.attemptCounts, [playerId]: attemptCount },
      playerStats: { ...state.playerStats, [playerId]: { ...stats, totalAttempts: stats.totalAttempts + 1 } },
    };
    if (guessed.id === state.targetPokemonId) return { state: resolveRound(next, context, playerId), accepted: true };
    next = {
      ...next,
      attempts: [...next.attempts, { playerId, guessedPokemon: { id: guessed.id, name: guessed.name, sprite: guessed.sprite }, attemptedAt: context.now }],
      cooldownUntil: setPlayerCooldown(next.cooldownUntil, playerId, context.now, SKETCHMON_GUESS_COOLDOWN_MS),
    };
    return { state: next, accepted: true };
  },
  handleTimeout(state, context) {
    if (state.phase === 'ROUND_ACTIVE' && context.now >= (state.roundEndsAt ?? Infinity)) return resolveRound(state, context, null);
    if (state.phase === 'ROUND_ACTIVE') return advanceHints(state, context);
    if (state.phase === 'ROUND_RESULTS' && context.now >= (state.nextTransitionAt ?? Infinity)) return beginNextRound(state, context);
    return state;
  },
  handlePresenceChange(state, context) {
    if (state.phase !== 'ROUND_ACTIVE' || !state.drawerId || isPlayerRequired(context, state.drawerId)) return state;
    const canceled = incrementDrawingFailure(state, state.drawerId);
    return beginNextRound({
      ...canceled, targetPokemonId: null, drawerId: null, strokes: [], undoStack: [], redoStack: [], visibleHints: [], attempts: [],
      roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null, lastRound: null,
    }, context);
  },
  getPublicState(state, context) {
    const totalRounds = state.drawerOrder.length;
    const lapNumber = Math.min(state.config.laps, Math.floor(Math.max(0, state.roundNumber - 1) / state.playerIds.length) + 1);
    const lapStart = Math.max(0, lapNumber - 1) * state.playerIds.length;
    const nextDrawerId = state.drawerOrder.slice(state.roundNumber).find((id) => isPlayerRequired(context, id)) ?? null;
    return {
      gameId: 'sketchmon', phase: state.phase, roundNumber: state.roundNumber, totalRounds, lapNumber,
      totalLaps: state.config.laps, drawerId: state.drawerId, nextDrawerId,
      drawerOrder: state.drawerOrder.slice(lapStart, lapStart + state.playerIds.length),
      strokes: cloneDrawing(state.strokes), visibleHints: state.visibleHints.map((hint) => ({ ...hint })),
      attempts: state.attempts.map((attempt) => ({ ...attempt, guessedPokemon: { ...attempt.guessedPokemon } })),
      scores: { ...state.scores }, roundStartedAt: state.roundStartedAt, roundEndsAt: state.roundEndsAt,
      nextTransitionAt: state.nextTransitionAt,
      lastRound: state.phase === 'ROUND_RESULTS' && state.lastRound ? { ...state.lastRound, drawing: cloneDrawing(state.lastRound.drawing) } : null,
      gallery: state.phase === 'GAME_RESULTS' ? state.gallery.map((entry) => ({ ...entry, drawing: cloneDrawing(entry.drawing) })) : [],
      results: state.phase === 'GAME_RESULTS' ? buildSketchmonResults(state) : null,
    };
  },
  getPlayerState(state, playerId, context): SketchmonPlayerState {
    const participating = state.playerIds.includes(playerId) && isPlayerRequired(context, playerId);
    if (!participating) return { role: 'SPECTATOR' };
    if (state.phase === 'ROUND_ACTIVE' && playerId === state.drawerId) {
      const target = context.pokemon.byId(state.targetPokemonId ?? '');
      const previewEndsAt = state.config.memoryPreviewEnabled && state.roundStartedAt !== null
        ? state.roundStartedAt + SKETCHMON_SPRITE_PREVIEW_MS
        : null;
      const previewVisible = previewEndsAt === null || context.now < previewEndsAt;
      return {
        role: 'DRAWER', canDraw: Boolean(target),
        secretPokemon: target ? {
          name: target.name,
          sprite: previewVisible ? target.sprite : null,
          previewEndsAt,
          types: state.config.memoryPreviewEnabled ? [] : [...target.types],
        } : null,
      };
    }
    return {
      role: 'GUESSER', canGuess: state.phase === 'ROUND_ACTIVE' && playerId !== state.drawerId,
      cooldownUntil: state.cooldownUntil[playerId] ?? null, attemptCount: state.attemptCounts[playerId] ?? 0,
    };
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildSketchmonResults(state); },
};
