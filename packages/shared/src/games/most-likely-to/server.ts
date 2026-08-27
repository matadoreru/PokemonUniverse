import type { Pokemon } from '../../pokemon/types.js';
import { allConnectedRequiredCompleted, isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule, type SubjectiveCategory } from '../contracts.js';
import { defaultMostLikelyToConfig, mostLikelyToConfigSchema, type MostLikelyToConfig } from './config.js';
import { officialMostLikelyToPrompts } from './prompts.js';
import { buildMostLikelyToResults, emptyMostLikelyToStats, MOST_LIKELY_TO_WIN_POINTS } from './rules.js';
import { mostLikelyToActionSchema, type MostLikelyToAction, type MostLikelyToPlayerState, type MostLikelyToPokemon, type MostLikelyToPublicState, type MostLikelyToRoundResult, type MostLikelyToState, type MostLikelyToVoteRound } from './types.js';

export const MOST_LIKELY_TO_REVEAL_MS = 8_000;

const manifest = {
  id: 'most-likely-to',
  name: 'Most Likely To — Pokémon Edition',
  icon: '👉',
  description: 'Elige qué Pokémon encaja mejor con una situación y convence al grupo.',
  minPlayers: 3,
  profileStats: {
    metrics: [
      { key: 'roundsPlayed', label: 'Rondas jugadas', aggregation: 'SUM' as const },
      { key: 'answersSubmitted', label: 'Respuestas enviadas', aggregation: 'SUM' as const },
      { key: 'roundsMissed', label: 'Rondas sin respuesta', aggregation: 'SUM' as const },
      { key: 'votesCast', label: 'Votos emitidos', aggregation: 'SUM' as const },
      { key: 'votesReceived', label: 'Votos recibidos', aggregation: 'SUM' as const },
      { key: 'roundWins', label: 'Victorias', aggregation: 'SUM' as const },
      { key: 'soloWins', label: 'Victorias en solitario', aggregation: 'SUM' as const },
      { key: 'sharedWins', label: 'Victorias compartidas', aggregation: 'SUM' as const },
      { key: 'pointsFromRounds', label: 'Puntos en rondas', aggregation: 'SUM' as const },
    ],
    derivedMetrics: [
      { key: 'answerRate', label: 'Rondas respondidas', kind: 'PERCENT' as const, numerator: 'answersSubmitted', denominator: ['roundsPlayed'] },
    ],
  },
};

function summary(pokemon: Pokemon): MostLikelyToPokemon {
  return { id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite };
}

function promptPool(config: MostLikelyToConfig, context: GameContext): SubjectiveCategory[] {
  const official = config.promptSource === 'CUSTOM' ? [] : officialMostLikelyToPrompts;
  const custom = config.promptSource === 'OFFICIAL' ? [] : (context.hostCustomCategories ?? []);
  return [...official, ...custom.map((prompt) => ({ id: `most-likely-to-custom-${prompt.id}`, text: prompt.text }))];
}

function choosePrompt(state: MostLikelyToState, context: GameContext): { promptId: string; usedPromptIds: string[] } {
  const unused = state.promptPool.filter((prompt) => !state.usedPromptIds.includes(prompt.id));
  const candidates = unused.length > 0 ? unused : state.promptPool;
  const selected = candidates[Math.floor(context.random() * candidates.length)]!;
  const usedPromptIds = unused.length === 0 ? [selected.id] : [...state.usedPromptIds, selected.id];
  return { promptId: selected.id, usedPromptIds: usedPromptIds.length >= state.promptPool.length ? [] : usedPromptIds };
}

function promptText(state: MostLikelyToState): string {
  return state.promptPool.find((prompt) => prompt.id === state.currentPromptId)?.text ?? '';
}

function beginRound(state: MostLikelyToState, context: GameContext): MostLikelyToState {
  if (state.roundNumber >= state.config.rounds) return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null };
  const prompt = choosePrompt(state, context);
  return {
    ...state,
    phase: 'ROUND_ACTIVE',
    roundNumber: state.roundNumber + 1,
    currentPromptId: prompt.promptId,
    usedPromptIds: prompt.usedPromptIds,
    selections: {},
    votes: {},
    voteCandidates: [],
    voteRoundNumber: 1,
    voteHistory: [],
    roundEndsAt: context.now + state.config.selectionSeconds * 1_000,
    nextTransitionAt: null,
    lastRound: null,
  };
}

function eligibleVoterIds(state: MostLikelyToState, context: GameContext): string[] {
  return state.playerIds.filter((playerId) => isPlayerRequired(context, playerId) && state.voteCandidates.some((candidateId) => candidateId !== playerId));
}

function allEligibleVoted(state: MostLikelyToState, context: GameContext): boolean {
  return eligibleVoterIds(state, context).every((playerId) => Boolean(state.votes[playerId]));
}

function voteRecord(state: MostLikelyToState): MostLikelyToVoteRound {
  return { number: state.voteRoundNumber, candidateIds: [...state.voteCandidates], votes: { ...state.votes } };
}

function finishRound(state: MostLikelyToState, winnerIds: string[], voteHistory: MostLikelyToVoteRound[], context: GameContext): MostLikelyToState {
  const winnerSet = new Set(winnerIds);
  const decisiveVotes = voteHistory.at(-1)?.votes ?? {};
  const voteCounts = Object.fromEntries(Object.keys(state.selections).map((playerId) => [playerId, 0]));
  for (const targetId of Object.values(decisiveVotes)) if (targetId in voteCounts) voteCounts[targetId] = (voteCounts[targetId] ?? 0) + 1;
  const pointsAwarded = Object.fromEntries(state.playerIds.map((playerId) => [playerId, winnerSet.has(playerId) ? MOST_LIKELY_TO_WIN_POINTS : 0]));
  const scores = Object.fromEntries(state.playerIds.map((playerId) => [playerId, (state.scores[playerId] ?? 0) + (pointsAwarded[playerId] ?? 0)]));
  const playerStats = Object.fromEntries(state.playerIds.map((playerId) => {
    const current = state.playerStats[playerId] ?? emptyMostLikelyToStats();
    const won = winnerSet.has(playerId);
    return [playerId, {
      ...current,
      roundsPlayed: current.roundsPlayed + 1,
      answersSubmitted: current.answersSubmitted + (state.selections[playerId] ? 1 : 0),
      roundsMissed: current.roundsMissed + (state.selections[playerId] ? 0 : 1),
      votesReceived: current.votesReceived + (voteCounts[playerId] ?? 0),
      roundWins: current.roundWins + (won ? 1 : 0),
      soloWins: current.soloWins + (won && winnerIds.length === 1 ? 1 : 0),
      sharedWins: current.sharedWins + (won && winnerIds.length > 1 ? 1 : 0),
      pointsFromRounds: current.pointsFromRounds + (pointsAwarded[playerId] ?? 0),
    }];
  }));
  const answers = Object.entries(state.selections).map(([playerId, pokemon]) => ({
    playerId,
    pokemon: { ...pokemon },
    votesReceived: voteCounts[playerId] ?? 0,
    won: winnerSet.has(playerId),
  }));
  const lastRound: MostLikelyToRoundResult = {
    prompt: promptText(state),
    answers,
    voteRounds: voteHistory.map((round) => ({ ...round, candidateIds: [...round.candidateIds], votes: { ...round.votes } })),
    winnerIds: [...winnerIds],
    pointsAwarded,
  };
  return {
    ...state,
    phase: 'ROUND_RESULTS',
    voteHistory,
    scores,
    playerStats,
    roundEndsAt: null,
    nextTransitionAt: context.now + MOST_LIKELY_TO_REVEAL_MS,
    lastRound,
  };
}

function resolveVote(state: MostLikelyToState, context: GameContext): MostLikelyToState {
  if (state.voteCandidates.length === 0) return finishRound(state, [], state.voteHistory, context);
  const recorded = voteRecord(state);
  const history = [...state.voteHistory, recorded];
  const tallies = Object.fromEntries(state.voteCandidates.map((candidateId) => [candidateId, 0]));
  for (const targetId of Object.values(state.votes)) if (targetId in tallies) tallies[targetId] = (tallies[targetId] ?? 0) + 1;
  const maximum = Math.max(...Object.values(tallies));
  const tied = state.voteCandidates.filter((candidateId) => tallies[candidateId] === maximum);
  if (tied.length === 1) return finishRound(state, tied, history, context);
  if (state.phase === 'REVOTE') return finishRound(state, tied, history, context);
  return {
    ...state,
    phase: 'REVOTE',
    votes: {},
    voteCandidates: tied,
    voteRoundNumber: 2,
    voteHistory: history,
    roundEndsAt: context.now + state.config.votingSeconds * 1_000,
  };
}

function beginVoting(state: MostLikelyToState, context: GameContext): MostLikelyToState {
  const voteCandidates = Object.keys(state.selections);
  const next: MostLikelyToState = {
    ...state,
    phase: 'VOTING',
    votes: {},
    voteCandidates,
    voteRoundNumber: 1,
    voteHistory: [],
    roundEndsAt: context.now + state.config.votingSeconds * 1_000,
  };
  if (voteCandidates.length === 0) return finishRound(next, [], [], context);
  if (voteCandidates.length === 1) return finishRound(next, voteCandidates, [], context);
  return next;
}

function cloneRoundResult(result: MostLikelyToRoundResult | null): MostLikelyToRoundResult | null {
  if (!result) return null;
  return {
    ...result,
    answers: result.answers.map((answer) => ({ ...answer, pokemon: { ...answer.pokemon } })),
    voteRounds: result.voteRounds.map((round) => ({ ...round, candidateIds: [...round.candidateIds], votes: { ...round.votes } })),
    winnerIds: [...result.winnerIds],
    pointsAwarded: { ...result.pointsAwarded },
  };
}

export const mostLikelyToGame: MiniGameModule<MostLikelyToConfig, MostLikelyToState, MostLikelyToAction, MostLikelyToPublicState> = {
  manifest,
  configSchema: mostLikelyToConfigSchema,
  actionSchema: mostLikelyToActionSchema,
  defaultConfig: defaultMostLikelyToConfig,
  createInitialState(config, context) {
    const parsed = mostLikelyToConfigSchema.parse(config);
    if (context.players.length < manifest.minPlayers) throw new Error('Most Likely To necesita al menos 3 jugadores.');
    const pool = context.pokemon.forGenerations(parsed.generations, { includeForms: parsed.includeForms })
      .filter((pokemon) => pokemon.sprite && (parsed.includeForms || pokemon.isDefault !== false));
    if (pool.length === 0) throw new Error('No hay Pokémon disponibles con esta configuración.');
    const prompts = promptPool(parsed, context);
    if (prompts.length === 0) throw new Error('No hay preguntas activas para Most Likely To.');
    const playerIds = context.players.map((player) => player.id);
    return {
      phase: 'GAME_STARTING', config: parsed, playerIds, pokemonPoolIds: pool.map((pokemon) => pokemon.id), promptPool: prompts,
      usedPromptIds: [], roundNumber: 0, currentPromptId: null, selections: {}, votes: {}, voteCandidates: [], voteRoundNumber: 1, voteHistory: [],
      scores: Object.fromEntries(playerIds.map((playerId) => [playerId, 0])),
      playerStats: Object.fromEntries(playerIds.map((playerId) => [playerId, emptyMostLikelyToStats()])),
      roundEndsAt: null, nextTransitionAt: null, lastRound: null,
    };
  },
  start(state, context) { return beginRound(state, context); },
  handleAction(state, playerId, action, context): GameActionResult<MostLikelyToState> {
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'No puedes participar en esta ronda.' };
    if (action.type === 'SELECT_POKEMON') {
      if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'La selección ya ha terminado.' };
      if (context.now >= (state.roundEndsAt ?? 0)) return { state, accepted: false, error: 'El tiempo ha terminado.' };
      const pokemon = context.pokemon.byId(action.pokemonId);
      if (!pokemon || !state.pokemonPoolIds.includes(pokemon.id)) return { state, accepted: false, error: 'Ese Pokémon no pertenece al pool configurado.' };
      const next = { ...state, selections: { ...state.selections, [playerId]: summary(pokemon) } };
      return { state: allConnectedRequiredCompleted(context, state.playerIds, (id) => Boolean(next.selections[id])) ? beginVoting(next, context) : next, accepted: true };
    }
    if (state.phase !== 'VOTING' && state.phase !== 'REVOTE') return { state, accepted: false, error: 'La votación no está activa.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state, accepted: false, error: 'El tiempo de votación ha terminado.' };
    if (action.playerId === playerId) return { state, accepted: false, error: 'No puedes votar tu propia respuesta.' };
    if (!state.voteCandidates.includes(action.playerId)) return { state, accepted: false, error: 'Esa respuesta no es candidata en esta votación.' };
    if (state.votes[playerId]) return { state, accepted: false, error: 'Tu voto ya está bloqueado.' };
    const stats = state.playerStats[playerId] ?? emptyMostLikelyToStats();
    const next = {
      ...state,
      votes: { ...state.votes, [playerId]: action.playerId },
      playerStats: { ...state.playerStats, [playerId]: { ...stats, votesCast: stats.votesCast + 1 } },
    };
    return { state: allEligibleVoted(next, context) ? resolveVote(next, context) : next, accepted: true };
  },
  handleTimeout(state, context) {
    if (state.phase === 'ROUND_ACTIVE' && context.now >= (state.roundEndsAt ?? Infinity)) return beginVoting(state, context);
    if ((state.phase === 'VOTING' || state.phase === 'REVOTE') && context.now >= (state.roundEndsAt ?? Infinity)) return resolveVote(state, context);
    if (state.phase === 'ROUND_RESULTS' && context.now >= (state.nextTransitionAt ?? Infinity)) return beginRound(state, context);
    return state;
  },
  handlePresenceChange(state, context) {
    if (state.phase === 'ROUND_ACTIVE' && allConnectedRequiredCompleted(context, state.playerIds, (id) => Boolean(state.selections[id]))) return beginVoting(state, context);
    if ((state.phase === 'VOTING' || state.phase === 'REVOTE') && allEligibleVoted(state, context)) return resolveVote(state, context);
    return state;
  },
  getPublicState(state) {
    const revealAnswers = state.phase === 'VOTING' || state.phase === 'REVOTE';
    return {
      gameId: 'most-likely-to', phase: state.phase, roundNumber: state.roundNumber, totalRounds: state.config.rounds,
      prompt: promptText(state), playerIds: [...state.playerIds], selectionCompletedIds: Object.keys(state.selections),
      revealedAnswers: revealAnswers ? Object.entries(state.selections).map(([playerId, pokemon]) => ({ playerId, pokemon: { ...pokemon } })) : [],
      votedPlayerIds: Object.keys(state.votes), voteCandidates: [...state.voteCandidates], voteRoundNumber: state.voteRoundNumber,
      scores: { ...state.scores }, roundEndsAt: state.roundEndsAt, nextTransitionAt: state.nextTransitionAt,
      lastRound: state.phase === 'ROUND_RESULTS' || state.phase === 'GAME_RESULTS' ? cloneRoundResult(state.lastRound) : null,
      results: state.phase === 'GAME_RESULTS' ? buildMostLikelyToResults(state) : null,
    };
  },
  getPlayerState(state, playerId, context): MostLikelyToPlayerState {
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { role: 'SPECTATOR', canSelect: false, ownChoice: null, canVote: false, ownVotePlayerId: null };
    return {
      role: 'PLAYER',
      canSelect: state.phase === 'ROUND_ACTIVE',
      ownChoice: state.selections[playerId] ? { ...state.selections[playerId]! } : null,
      canVote: (state.phase === 'VOTING' || state.phase === 'REVOTE') && !state.votes[playerId] && state.voteCandidates.some((candidateId) => candidateId !== playerId),
      ownVotePlayerId: state.votes[playerId] ?? null,
    };
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildMostLikelyToResults(state); },
};
