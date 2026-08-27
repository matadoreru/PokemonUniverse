import type { Pokemon } from '../../pokemon/types.js';
import { allConnectedRequiredCompleted, isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { allEligibleRunoffVotersCompleted, eligibleRunoffVoterIds, leadingRunoffCandidateIds, recordRunoffVoteRound } from '../infrastructure/runoff-voting.js';
import { defaultPokemonRedFlagConfig, pokemonRedFlagConfigSchema, type PokemonRedFlagConfig } from './config.js';
import { buildPokemonRedFlagResults, emptyPokemonRedFlagStats, POKEMON_RED_FLAG_WIN_POINTS } from './rules.js';
import { pokemonRedFlagActionSchema, type PokemonFlagMode, type PokemonRedFlagAction, type PokemonRedFlagPlayerState, type PokemonRedFlagPublicState, type PokemonRedFlagRoundResult, type PokemonRedFlagState, type PokemonRedFlagVoteRound } from './types.js';

export const POKEMON_RED_FLAG_REVEAL_MS = 8_000;

const manifest = {
  id: 'pokemon-red-flag',
  name: 'Pokémon Red Flag / Green Flag',
  icon: '🚩',
  description: 'Escribe la red o green flag más divertida de un Pokémon y gana la votación anónima.',
  experimental: true,
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
    derivedMetrics: [{ key: 'answerRate', label: 'Rondas respondidas', kind: 'PERCENT' as const, numerator: 'answersSubmitted', denominator: ['roundsPlayed'] }],
  },
};

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

function summary(pokemon: Pokemon) {
  return { id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite };
}

function answerSlots(playerIds: readonly string[], roundNumber: number, context: GameContext): Record<string, string> {
  const opaqueIds = shuffle(playerIds.map((_id, index) => `rf-${roundNumber}-${index + 1}`), context.random);
  return Object.fromEntries(playerIds.map((playerId, index) => [playerId, opaqueIds[index]!])) as Record<string, string>;
}

function beginRound(state: PokemonRedFlagState, context: GameContext): PokemonRedFlagState {
  if (state.roundNumber >= state.config.rounds) return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null };
  const roundNumber = state.roundNumber + 1;
  const pokemonId = state.pokemonDeckIds[(roundNumber - 1) % state.pokemonDeckIds.length]!;
  const pokemon = context.pokemon.byId(pokemonId)!;
  const flagMode: PokemonFlagMode = state.config.mode === 'MIXED' ? context.random() < .5 ? 'RED' : 'GREEN' : state.config.mode;
  context.preloadImage?.(pokemon.sprite);
  return {
    ...state, phase: 'ROUND_ACTIVE', roundNumber, currentPokemon: summary(pokemon), flagMode, answerSlots: answerSlots(state.playerIds, roundNumber, context),
    drafts: {}, answers: {}, answerOrder: [], votes: {}, voteCandidates: [], voteRoundNumber: 1, voteHistory: [],
    roundEndsAt: context.now + state.config.phaseSeconds * 1_000, nextTransitionAt: null, lastRound: null,
  };
}

function eligibleVoterIds(state: PokemonRedFlagState, context: GameContext): string[] {
  return eligibleRunoffVoterIds(state.playerIds, state.voteCandidates, (playerId) => isPlayerRequired(context, playerId), (playerId, answerId) => state.answers[answerId]?.authorId !== playerId);
}

function allEligibleVoted(state: PokemonRedFlagState, context: GameContext): boolean {
  return allEligibleRunoffVotersCompleted(eligibleVoterIds(state, context), state.votes);
}

function voteRecord(state: PokemonRedFlagState): PokemonRedFlagVoteRound {
  return recordRunoffVoteRound(state.voteRoundNumber, state.voteCandidates, state.votes);
}

function finishRound(state: PokemonRedFlagState, winningAnswerIds: string[], voteHistory: PokemonRedFlagVoteRound[], context: GameContext): PokemonRedFlagState {
  const winnerIds = winningAnswerIds.map((answerId) => state.answers[answerId]?.authorId).filter((id): id is string => Boolean(id));
  const winnerSet = new Set(winnerIds); const decisiveVotes = voteHistory.at(-1)?.votes ?? {};
  const voteCounts = Object.fromEntries(Object.keys(state.answers).map((answerId) => [answerId, 0]));
  for (const answerId of Object.values(decisiveVotes)) if (answerId in voteCounts) voteCounts[answerId] = (voteCounts[answerId] ?? 0) + 1;
  const pointsAwarded = Object.fromEntries(state.playerIds.map((playerId) => [playerId, winnerSet.has(playerId) ? POKEMON_RED_FLAG_WIN_POINTS : 0]));
  const scores = Object.fromEntries(state.playerIds.map((playerId) => [playerId, (state.scores[playerId] ?? 0) + (pointsAwarded[playerId] ?? 0)]));
  const playerStats = Object.fromEntries(state.playerIds.map((playerId) => {
    const current = state.playerStats[playerId] ?? emptyPokemonRedFlagStats(); const ownAnswerId = state.answerSlots[playerId]; const won = winnerSet.has(playerId);
    return [playerId, {
      ...current, roundsPlayed: current.roundsPlayed + 1, answersSubmitted: current.answersSubmitted + (ownAnswerId && state.answers[ownAnswerId] ? 1 : 0),
      roundsMissed: current.roundsMissed + (ownAnswerId && state.answers[ownAnswerId] ? 0 : 1), votesReceived: current.votesReceived + (ownAnswerId ? voteCounts[ownAnswerId] ?? 0 : 0),
      roundWins: current.roundWins + (won ? 1 : 0), soloWins: current.soloWins + (won && winnerIds.length === 1 ? 1 : 0),
      sharedWins: current.sharedWins + (won && winnerIds.length > 1 ? 1 : 0), pointsFromRounds: current.pointsFromRounds + (pointsAwarded[playerId] ?? 0),
    }];
  }));
  const winningSet = new Set(winningAnswerIds);
  const lastRound: PokemonRedFlagRoundResult = {
    flagMode: state.flagMode,
    pokemon: { ...state.currentPokemon! },
    answers: Object.values(state.answers).map((answer) => ({ ...answer, votesReceived: voteCounts[answer.id] ?? 0, won: winningSet.has(answer.id) })),
    voteRounds: voteHistory.map((round) => ({ ...round, candidateIds: [...round.candidateIds], votes: { ...round.votes } })),
    winningAnswerIds: [...winningAnswerIds], winnerIds, pointsAwarded, missingPlayerIds: state.playerIds.filter((playerId) => !state.answers[state.answerSlots[playerId]!]),
  };
  return { ...state, phase: 'ROUND_RESULTS', voteHistory, scores, playerStats, roundEndsAt: null, nextTransitionAt: context.now + POKEMON_RED_FLAG_REVEAL_MS, lastRound };
}

function resolveVote(state: PokemonRedFlagState, context: GameContext): PokemonRedFlagState {
  if (state.voteCandidates.length === 0) return finishRound(state, [], state.voteHistory, context);
  const recorded = voteRecord(state); const history = [...state.voteHistory, recorded];
  const tied = leadingRunoffCandidateIds(state.voteCandidates, state.votes);
  if (tied.length === 1) return finishRound(state, tied, history, context);
  if (state.phase === 'REVOTE') return finishRound(state, tied, history, context);
  return { ...state, phase: 'REVOTE', votes: {}, voteCandidates: tied, voteRoundNumber: 2, voteHistory: history, roundEndsAt: context.now + state.config.phaseSeconds * 1_000 };
}

function beginVoting(state: PokemonRedFlagState, context: GameContext): PokemonRedFlagState {
  const answers = { ...state.answers };
  for (const playerId of state.playerIds) {
    const text = state.drafts[playerId]?.trim(); const answerId = state.answerSlots[playerId];
    if (text && answerId && !answers[answerId]) answers[answerId] = { id: answerId, authorId: playerId, text };
  }
  const answerOrder = shuffle(Object.keys(answers), context.random);
  const voteCandidates = [...answerOrder];
  const next = { ...state, phase: 'VOTING' as const, answers, votes: {}, answerOrder, voteCandidates, voteRoundNumber: 1, voteHistory: [], roundEndsAt: context.now + state.config.phaseSeconds * 1_000 };
  if (voteCandidates.length === 0) return finishRound(next, [], [], context);
  if (voteCandidates.length === 1 && eligibleVoterIds(next, context).length === 0) return finishRound(next, voteCandidates, [], context);
  return next;
}

function cloneRoundResult(result: PokemonRedFlagRoundResult | null): PokemonRedFlagRoundResult | null {
  return result ? { ...result, pokemon: { ...result.pokemon }, answers: result.answers.map((answer) => ({ ...answer })), voteRounds: result.voteRounds.map((round) => ({ ...round, candidateIds: [...round.candidateIds], votes: { ...round.votes } })), winningAnswerIds: [...result.winningAnswerIds], winnerIds: [...result.winnerIds], pointsAwarded: { ...result.pointsAwarded }, missingPlayerIds: [...result.missingPlayerIds] } : null;
}

export const pokemonRedFlagGame: MiniGameModule<PokemonRedFlagConfig, PokemonRedFlagState, PokemonRedFlagAction, PokemonRedFlagPublicState> = {
  manifest, configSchema: pokemonRedFlagConfigSchema, actionSchema: pokemonRedFlagActionSchema, defaultConfig: defaultPokemonRedFlagConfig,
  createInitialState(config, context) {
    const parsed = pokemonRedFlagConfigSchema.parse(config);
    if (context.players.length < manifest.minPlayers) throw new Error('Pokémon Red Flag necesita al menos 3 jugadores.');
    const pool = context.pokemon.forGenerations(parsed.generations, { includeForms: parsed.includeForms }).filter((pokemon) => pokemon.sprite && (parsed.includeForms || pokemon.isDefault !== false));
    if (pool.length === 0) throw new Error('No hay Pokémon disponibles con esta configuración.');
    const playerIds = context.players.map((player) => player.id);
    return {
      phase: 'GAME_STARTING', config: parsed, playerIds, pokemonDeckIds: shuffle(pool.map((pokemon) => pokemon.id), context.random), roundNumber: 0,
      currentPokemon: null, flagMode: parsed.mode === 'GREEN' ? 'GREEN' : 'RED', answerSlots: {}, drafts: {}, answers: {}, answerOrder: [], votes: {}, voteCandidates: [], voteRoundNumber: 1, voteHistory: [],
      scores: Object.fromEntries(playerIds.map((id) => [id, 0])), playerStats: Object.fromEntries(playerIds.map((id) => [id, emptyPokemonRedFlagStats()])),
      roundEndsAt: null, nextTransitionAt: null, lastRound: null,
    };
  },
  start(state, context) { return beginRound(state, context); },
  handleAction(state, playerId, action, context): GameActionResult<PokemonRedFlagState> {
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'No puedes participar en esta ronda.' };
    if (action.type === 'UPDATE_RED_FLAG_DRAFT') {
      if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'La escritura ya ha terminado.' };
      if (context.now >= (state.roundEndsAt ?? 0)) return { state: beginVoting(state, context), accepted: false, error: 'El tiempo ha terminado.' };
      const answerId = state.answerSlots[playerId]!;
      if (state.answers[answerId]) return { state, accepted: false, error: 'Tu respuesta ya está bloqueada.' };
      return { state: { ...state, drafts: { ...state.drafts, [playerId]: action.text } }, accepted: true };
    }
    if (action.type === 'SUBMIT_RED_FLAG') {
      if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'La escritura ya ha terminado.' };
      if (context.now >= (state.roundEndsAt ?? 0)) return { state, accepted: false, error: 'El tiempo ha terminado.' };
      const answerId = state.answerSlots[playerId]!;
      if (state.answers[answerId]) return { state, accepted: false, error: 'Tu respuesta ya está bloqueada.' };
      const next = { ...state, drafts: { ...state.drafts, [playerId]: action.text }, answers: { ...state.answers, [answerId]: { id: answerId, authorId: playerId, text: action.text } } };
      return { state: allConnectedRequiredCompleted(context, state.playerIds, (id) => Boolean(next.answers[next.answerSlots[id]!])) ? beginVoting(next, context) : next, accepted: true };
    }
    if (state.phase !== 'VOTING' && state.phase !== 'REVOTE') return { state, accepted: false, error: 'La votación no está activa.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state, accepted: false, error: 'El tiempo de votación ha terminado.' };
    const answer = state.answers[action.answerId];
    if (!answer || !state.voteCandidates.includes(action.answerId)) return { state, accepted: false, error: 'Esa respuesta no es candidata.' };
    if (answer.authorId === playerId) return { state, accepted: false, error: 'No puedes votar tu propia respuesta.' };
    if (state.votes[playerId]) return { state, accepted: false, error: 'Tu voto ya está bloqueado.' };
    const stats = state.playerStats[playerId] ?? emptyPokemonRedFlagStats();
    const next = { ...state, votes: { ...state.votes, [playerId]: action.answerId }, playerStats: { ...state.playerStats, [playerId]: { ...stats, votesCast: stats.votesCast + 1 } } };
    return { state: allEligibleVoted(next, context) ? resolveVote(next, context) : next, accepted: true };
  },
  handleTimeout(state, context) {
    if (state.phase === 'ROUND_ACTIVE' && context.now >= (state.roundEndsAt ?? Infinity)) return beginVoting(state, context);
    if ((state.phase === 'VOTING' || state.phase === 'REVOTE') && context.now >= (state.roundEndsAt ?? Infinity)) return resolveVote(state, context);
    if (state.phase === 'ROUND_RESULTS' && context.now >= (state.nextTransitionAt ?? Infinity)) return beginRound(state, context);
    return state;
  },
  handlePresenceChange(state, context) {
    if (state.phase === 'ROUND_ACTIVE') {
      const allAnswered = allConnectedRequiredCompleted(context, state.playerIds, (id) => Boolean(state.answers[state.answerSlots[id]!]));
      if (allAnswered) return beginVoting(state, context);
    }
    if ((state.phase === 'VOTING' || state.phase === 'REVOTE') && allEligibleVoted(state, context)) return resolveVote(state, context);
    return state;
  },
  getPublicState(state) {
    const voting = state.phase === 'VOTING' || state.phase === 'REVOTE';
    return {
      gameId: 'pokemon-red-flag', phase: state.phase, roundNumber: state.roundNumber, totalRounds: state.config.rounds,
      pokemon: state.currentPokemon ? { ...state.currentPokemon } : null, flagMode: state.flagMode, playerIds: [...state.playerIds], submittedPlayerIds: Object.values(state.answers).map((answer) => answer.authorId),
      revealedAnswers: voting ? state.answerOrder.flatMap((answerId) => { const answer = state.answers[answerId]; return answer ? [{ id: answer.id, text: answer.text }] : []; }) : [],
      votedPlayerIds: Object.keys(state.votes), voteCandidateIds: [...state.voteCandidates], voteRoundNumber: state.voteRoundNumber,
      scores: { ...state.scores }, roundEndsAt: state.roundEndsAt, nextTransitionAt: state.nextTransitionAt,
      lastRound: state.phase === 'ROUND_RESULTS' || state.phase === 'GAME_RESULTS' ? cloneRoundResult(state.lastRound) : null,
      results: state.phase === 'GAME_RESULTS' ? buildPokemonRedFlagResults(state) : null,
    };
  },
  getPlayerState(state, playerId, context): PokemonRedFlagPlayerState {
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { role: 'SPECTATOR', canSubmit: false, ownDraft: '', ownAnswer: null, canVote: false, ownVoteAnswerId: null, ownAnswerId: null };
    const ownAnswerId = state.answerSlots[playerId] ?? null; const ownAnswer = ownAnswerId ? state.answers[ownAnswerId] : undefined;
    return {
      role: 'PLAYER', canSubmit: state.phase === 'ROUND_ACTIVE' && !ownAnswer, ownDraft: state.drafts[playerId] ?? '',
      ownAnswer: ownAnswer ? { id: ownAnswer.id, text: ownAnswer.text } : null,
      canVote: (state.phase === 'VOTING' || state.phase === 'REVOTE') && !state.votes[playerId] && state.voteCandidates.some((answerId) => state.answers[answerId]?.authorId !== playerId),
      ownVoteAnswerId: state.votes[playerId] ?? null, ownAnswerId,
    };
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildPokemonRedFlagResults(state); },
};
