import { allConnectedRequiredCompleted, isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule, type WouldYouRatherPromptPair } from '../contracts.js';
import { defaultWouldYouRatherConfig, wouldYouRatherConfigSchema, type WouldYouRatherConfig } from './config.js';
import { officialWouldYouRatherPrompts } from './prompts.js';
import { buildWouldYouRatherResults, emptyWouldYouRatherStats, WOULD_YOU_RATHER_MAJORITY_POINTS, WOULD_YOU_RATHER_PREDICTION_POINTS } from './rules.js';
import { wouldYouRatherActionSchema, type WouldYouRatherAction, type WouldYouRatherOption, type WouldYouRatherPlayerState, type WouldYouRatherPublicState, type WouldYouRatherRoundResult, type WouldYouRatherState } from './types.js';

export const WOULD_YOU_RATHER_REVEAL_MS = 8_000;

const manifest = {
  id: 'would-you-rather',
  name: 'Would You Rather Pokémon',
  icon: '⚖️',
  description: 'Elige entre dos situaciones absurdas y predice qué preferirá la mayoría.',
  experimental: true,
  minPlayers: 3,
  profileStats: {
    metrics: [
      { key: 'roundsPlayed', label: 'Rondas jugadas', aggregation: 'SUM' as const },
      { key: 'ballotsSubmitted', label: 'Papeletas enviadas', aggregation: 'SUM' as const },
      { key: 'roundsMissed', label: 'Rondas sin respuesta', aggregation: 'SUM' as const },
      { key: 'majorityChoices', label: 'Elecciones mayoritarias', aggregation: 'SUM' as const },
      { key: 'correctPredictions', label: 'Mayorías predichas', aggregation: 'SUM' as const },
      { key: 'perfectRounds', label: 'Rondas perfectas', aggregation: 'SUM' as const },
      { key: 'pointsFromRounds', label: 'Puntos en rondas', aggregation: 'SUM' as const },
    ],
    derivedMetrics: [
      { key: 'predictionRate', label: 'Predicciones acertadas', kind: 'PERCENT' as const, numerator: 'correctPredictions', denominator: ['ballotsSubmitted'] },
    ],
  },
};

function promptPool(config: WouldYouRatherConfig, context: GameContext): WouldYouRatherPromptPair[] {
  const official = config.promptSource === 'CUSTOM' ? [] : officialWouldYouRatherPrompts;
  const custom = config.promptSource === 'OFFICIAL' ? [] : (context.hostWouldYouRatherPrompts ?? []);
  return [...official, ...custom.map((prompt) => ({ ...prompt, id: `would-you-rather-custom-${prompt.id}` }))];
}

function choosePrompt(state: WouldYouRatherState, context: GameContext): { promptId: string; usedPromptIds: string[] } {
  const unused = state.promptPool.filter((prompt) => !state.usedPromptIds.includes(prompt.id));
  const candidates = unused.length > 0 ? unused : state.promptPool;
  const selected = candidates[Math.floor(context.random() * candidates.length)]!;
  const usedPromptIds = unused.length === 0 ? [selected.id] : [...state.usedPromptIds, selected.id];
  return { promptId: selected.id, usedPromptIds: usedPromptIds.length >= state.promptPool.length ? [] : usedPromptIds };
}

function currentPrompt(state: WouldYouRatherState): WouldYouRatherPromptPair {
  return state.promptPool.find((prompt) => prompt.id === state.currentPromptId) ?? { id: '', optionA: '', optionB: '' };
}

function beginRound(state: WouldYouRatherState, context: GameContext): WouldYouRatherState {
  if (state.roundNumber >= state.config.rounds) return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null };
  const selected = choosePrompt(state, context);
  return {
    ...state, phase: 'ROUND_ACTIVE', roundNumber: state.roundNumber + 1, currentPromptId: selected.promptId,
    usedPromptIds: selected.usedPromptIds, ballots: {}, roundEndsAt: context.now + state.config.roundSeconds * 1_000,
    nextTransitionAt: null, lastRound: null,
  };
}

function resolveRound(state: WouldYouRatherState, context: GameContext): WouldYouRatherState {
  const totals: Record<WouldYouRatherOption, number> = { A: 0, B: 0 };
  for (const ballot of Object.values(state.ballots)) totals[ballot.preference] += 1;
  const majority: WouldYouRatherOption | null = totals.A === totals.B ? null : totals.A > totals.B ? 'A' : 'B';
  const players = Object.entries(state.ballots).map(([playerId, ballot]) => {
    const majorityPoint = majority !== null && ballot.preference === majority ? WOULD_YOU_RATHER_MAJORITY_POINTS : 0;
    const predictionPoints = majority !== null && ballot.prediction === majority ? WOULD_YOU_RATHER_PREDICTION_POINTS : 0;
    return { playerId, ...ballot, majorityPoint, predictionPoints, totalPoints: majorityPoint + predictionPoints };
  });
  const awarded = Object.fromEntries(players.map((player) => [player.playerId, player.totalPoints]));
  const scores = Object.fromEntries(state.playerIds.map((playerId) => [playerId, (state.scores[playerId] ?? 0) + (awarded[playerId] ?? 0)]));
  const playerStats = Object.fromEntries(state.playerIds.map((playerId) => {
    const current = state.playerStats[playerId] ?? emptyWouldYouRatherStats();
    const result = players.find((player) => player.playerId === playerId);
    return [playerId, {
      ...current,
      roundsPlayed: current.roundsPlayed + 1,
      ballotsSubmitted: current.ballotsSubmitted + (result ? 1 : 0),
      roundsMissed: current.roundsMissed + (result ? 0 : 1),
      majorityChoices: current.majorityChoices + (result?.majorityPoint ? 1 : 0),
      correctPredictions: current.correctPredictions + (result?.predictionPoints ? 1 : 0),
      perfectRounds: current.perfectRounds + (result?.totalPoints === 3 ? 1 : 0),
      pointsFromRounds: current.pointsFromRounds + (result?.totalPoints ?? 0),
    }];
  }));
  const prompt = currentPrompt(state);
  const lastRound: WouldYouRatherRoundResult = {
    prompt: { optionA: prompt.optionA, optionB: prompt.optionB }, totals, majority, players,
    missingPlayerIds: state.playerIds.filter((playerId) => !state.ballots[playerId]),
  };
  return { ...state, phase: 'ROUND_RESULTS', scores, playerStats, roundEndsAt: null, nextTransitionAt: context.now + WOULD_YOU_RATHER_REVEAL_MS, lastRound };
}

function cloneRoundResult(result: WouldYouRatherRoundResult | null): WouldYouRatherRoundResult | null {
  return result ? { ...result, prompt: { ...result.prompt }, totals: { ...result.totals }, players: result.players.map((player) => ({ ...player })), missingPlayerIds: [...result.missingPlayerIds] } : null;
}

export const wouldYouRatherGame: MiniGameModule<WouldYouRatherConfig, WouldYouRatherState, WouldYouRatherAction, WouldYouRatherPublicState> = {
  manifest,
  configSchema: wouldYouRatherConfigSchema,
  actionSchema: wouldYouRatherActionSchema,
  defaultConfig: defaultWouldYouRatherConfig,
  createInitialState(config, context) {
    const parsed = wouldYouRatherConfigSchema.parse(config);
    if (context.players.length < manifest.minPlayers) throw new Error('Would You Rather necesita al menos 3 jugadores.');
    const prompts = promptPool(parsed, context);
    if (prompts.length === 0) throw new Error('No hay parejas activas para Would You Rather.');
    const playerIds = context.players.map((player) => player.id);
    return {
      phase: 'GAME_STARTING', config: parsed, playerIds, promptPool: prompts, usedPromptIds: [], roundNumber: 0,
      currentPromptId: null, ballots: {}, scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
      playerStats: Object.fromEntries(playerIds.map((id) => [id, emptyWouldYouRatherStats()])),
      roundEndsAt: null, nextTransitionAt: null, lastRound: null,
    };
  },
  start(state, context) { return beginRound(state, context); },
  handleAction(state, playerId, action, context): GameActionResult<WouldYouRatherState> {
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'No puedes participar en esta ronda.' };
    if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'La votación ya ha terminado.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state, accepted: false, error: 'El tiempo ha terminado.' };
    if (state.ballots[playerId]) return { state, accepted: false, error: 'Tu papeleta ya está bloqueada.' };
    const next = { ...state, ballots: { ...state.ballots, [playerId]: { preference: action.preference, prediction: action.prediction } } };
    return { state: allConnectedRequiredCompleted(context, state.playerIds, (id) => Boolean(next.ballots[id])) ? resolveRound(next, context) : next, accepted: true };
  },
  handleTimeout(state, context) {
    if (state.phase === 'ROUND_ACTIVE' && context.now >= (state.roundEndsAt ?? Infinity)) return resolveRound(state, context);
    if (state.phase === 'ROUND_RESULTS' && context.now >= (state.nextTransitionAt ?? Infinity)) return beginRound(state, context);
    return state;
  },
  handlePresenceChange(state, context) {
    return state.phase === 'ROUND_ACTIVE' && allConnectedRequiredCompleted(context, state.playerIds, (id) => Boolean(state.ballots[id])) ? resolveRound(state, context) : state;
  },
  getPublicState(state) {
    const prompt = currentPrompt(state);
    return {
      gameId: 'would-you-rather', phase: state.phase, roundNumber: state.roundNumber, totalRounds: state.config.rounds,
      prompt: { optionA: prompt.optionA, optionB: prompt.optionB }, playerIds: [...state.playerIds],
      submittedPlayerIds: Object.keys(state.ballots), scores: { ...state.scores }, roundEndsAt: state.roundEndsAt,
      nextTransitionAt: state.nextTransitionAt, lastRound: state.phase === 'ROUND_RESULTS' || state.phase === 'GAME_RESULTS' ? cloneRoundResult(state.lastRound) : null,
      results: state.phase === 'GAME_RESULTS' ? buildWouldYouRatherResults(state) : null,
    };
  },
  getPlayerState(state, playerId, context): WouldYouRatherPlayerState {
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { role: 'SPECTATOR', canSubmit: false, ownBallot: null };
    return { role: 'PLAYER', canSubmit: state.phase === 'ROUND_ACTIVE' && !state.ballots[playerId], ownBallot: state.ballots[playerId] ? { ...state.ballots[playerId]! } : null };
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildWouldYouRatherResults(state); },
};
