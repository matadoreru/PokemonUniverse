import { allConnectedRequiredCompleted, isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule, type SubjectiveCategory } from '../contracts.js';
import { defaultOneOfUsIsFakeConfig, oneOfUsIsFakeConfigSchema, type OneOfUsIsFakeConfig } from './config.js';
import { officialSubjectiveCategories } from './categories.js';
import { buildOneOfUsIsFakeResults, emptyOneOfUsIsFakeStats, FAKE_ROUND_POINTS, NORMAL_ROUND_POINTS } from './rules.js';
import { oneOfUsIsFakeActionSchema, type FakeRoundResult, type OneOfUsIsFakeAction, type OneOfUsIsFakePlayerState, type OneOfUsIsFakePublicState, type OneOfUsIsFakeState } from './types.js';

export const FAKE_CHOICE_REVEAL_MS = 650;
export const FAKE_ROUND_RESULT_MS = 6_000;

const manifest = {
  id: 'one-of-us-is-fake', name: 'One of Us Is Fake', icon: '🕵️',
  description: 'Elegid Pokémon para categorías secretas y descubrid quién recibió una diferente.', minPlayers: 3,
  profileStats: {
    metrics: [
      { key: 'roundsPlayed', label: 'Rondas jugadas', aggregation: 'SUM' as const },
      { key: 'victoriesAsFake', label: 'Victorias como fake', aggregation: 'SUM' as const },
      { key: 'victoriesAsNormal', label: 'Victorias como normal', aggregation: 'SUM' as const },
      { key: 'timesFake', label: 'Veces como fake', aggregation: 'SUM' as const },
      { key: 'fakeDiscovered', label: 'Fake descubierto', aggregation: 'SUM' as const },
      { key: 'fakeUndiscovered', label: 'Fake no descubierto', aggregation: 'SUM' as const },
      { key: 'correctVotes', label: 'Votos correctos', aggregation: 'SUM' as const },
      { key: 'incorrectVotes', label: 'Votos incorrectos', aggregation: 'SUM' as const },
      { key: 'normalWronglySelected', label: 'Expulsado siendo normal', aggregation: 'SUM' as const },
    ],
  },
};

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  }
  return copy;
}

function categoryPool(config: OneOfUsIsFakeConfig, context: GameContext): SubjectiveCategory[] {
  const official = config.categorySource === 'CUSTOM' ? [] : officialSubjectiveCategories;
  const custom = config.categorySource === 'OFFICIAL' ? [] : (context.hostCustomCategories ?? []);
  return [...official, ...custom.map((category) => ({ ...category, id: `custom-${category.id}` }))];
}

function chooseCategories(state: OneOfUsIsFakeState, context: GameContext): { main: SubjectiveCategory; fake: SubjectiveCategory; used: string[] } {
  const unused = state.categoryPool.filter((category) => !state.usedCategoryIds.includes(category.id));
  const firstPool = unused.length > 0 ? unused : state.categoryPool;
  const main = firstPool[Math.floor(context.random() * firstPool.length)]!;
  const remainingUnused = unused.filter((category) => category.id !== main.id);
  const secondPool = remainingUnused.length > 0 ? remainingUnused : state.categoryPool.filter((category) => category.id !== main.id);
  const fake = secondPool[Math.floor(context.random() * secondPool.length)]!;
  const used = [...new Set([...state.usedCategoryIds, main.id, fake.id])];
  return { main, fake, used: used.length === state.categoryPool.length ? [] : used };
}

function categoryText(state: OneOfUsIsFakeState, id: string | null): string {
  return state.categoryPool.find((category) => category.id === id)?.text ?? '';
}

function beginRound(state: OneOfUsIsFakeState, context: GameContext): OneOfUsIsFakeState {
  if (state.roundNumber >= state.config.rounds) return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null };
  const { main, fake, used } = chooseCategories(state, context);
  const fakePlayerId = state.playerIds[Math.floor(context.random() * state.playerIds.length)]!;
  const stats = Object.fromEntries(state.playerIds.map((playerId) => {
    const current = state.playerStats[playerId] ?? emptyOneOfUsIsFakeStats();
    return [playerId, playerId === fakePlayerId ? { ...current, timesFake: current.timesFake + 1 } : current];
  }));
  return {
    ...state, phase: 'ROUND_ACTIVE', roundNumber: state.roundNumber + 1, fakePlayerId,
    mainCategoryId: main.id, fakeCategoryId: fake.id, usedCategoryIds: used,
    selections: {}, revealOrder: shuffled(state.playerIds, context.random), revealedCount: 0,
    votes: {}, voteCandidates: [...state.playerIds], voteRoundNumber: 1, voteHistory: [],
    playerStats: stats, roundEndsAt: context.now + state.config.selectionSeconds * 1_000,
    nextTransitionAt: null, lastRound: null,
  };
}

function beginReveal(state: OneOfUsIsFakeState, context: GameContext): OneOfUsIsFakeState {
  return { ...state, phase: 'CHOICE_REVEAL', revealedCount: 0, roundEndsAt: null, nextTransitionAt: context.now + FAKE_CHOICE_REVEAL_MS };
}

function advanceReveal(state: OneOfUsIsFakeState, context: GameContext): OneOfUsIsFakeState {
  const nextCount = state.revealedCount + 1;
  if (nextCount < state.revealOrder.length) return { ...state, revealedCount: nextCount, nextTransitionAt: context.now + FAKE_CHOICE_REVEAL_MS };
  return {
    ...state, phase: 'DISCUSSION', revealedCount: state.revealOrder.length,
    roundEndsAt: context.now + state.config.discussionSeconds * 1_000, nextTransitionAt: null,
  };
}

function eligibleVoters(state: OneOfUsIsFakeState, context: GameContext): string[] {
  return state.playerIds.filter((playerId) => isPlayerRequired(context, playerId));
}

function allEligibleVoted(state: OneOfUsIsFakeState, context: GameContext): boolean {
  return eligibleVoters(state, context).every((playerId) => Boolean(state.votes[playerId]));
}

function finishRound(state: OneOfUsIsFakeState, selectedPlayerId: string, context: GameContext): OneOfUsIsFakeState {
  const fakePlayerId = state.fakePlayerId!;
  const normalsWin = selectedPlayerId === fakePlayerId;
  const pointsAwarded = Object.fromEntries(state.playerIds.map((playerId) => [
    playerId,
    normalsWin ? (playerId === fakePlayerId ? 0 : NORMAL_ROUND_POINTS) : (playerId === fakePlayerId ? FAKE_ROUND_POINTS : 0),
  ]));
  const scores = Object.fromEntries(state.playerIds.map((playerId) => [playerId, (state.scores[playerId] ?? 0) + (pointsAwarded[playerId] ?? 0)]));
  const playerStats = Object.fromEntries(state.playerIds.map((playerId) => {
    const current = state.playerStats[playerId] ?? emptyOneOfUsIsFakeStats();
    const isFake = playerId === fakePlayerId;
    return [playerId, {
      ...current,
      roundsPlayed: current.roundsPlayed + 1,
      victoriesAsFake: current.victoriesAsFake + (isFake && !normalsWin ? 1 : 0),
      victoriesAsNormal: current.victoriesAsNormal + (!isFake && normalsWin ? 1 : 0),
      fakeDiscovered: current.fakeDiscovered + (isFake && normalsWin ? 1 : 0),
      fakeUndiscovered: current.fakeUndiscovered + (isFake && !normalsWin ? 1 : 0),
      normalWronglySelected: current.normalWronglySelected + (!isFake && playerId === selectedPlayerId ? 1 : 0),
    }];
  }));
  const voteHistory = [...state.voteHistory, { number: state.voteRoundNumber, candidateIds: [...state.voteCandidates], votes: { ...state.votes } }];
  const lastRound: FakeRoundResult = {
    fakePlayerId, selectedPlayerId, winner: normalsWin ? 'NORMALS' : 'FAKE',
    mainCategory: categoryText(state, state.mainCategoryId), fakeCategory: categoryText(state, state.fakeCategoryId),
    players: state.playerIds.map((playerId) => ({
      playerId, category: categoryText(state, playerId === fakePlayerId ? state.fakeCategoryId : state.mainCategoryId),
      pokemon: state.selections[playerId] ?? null, isFake: playerId === fakePlayerId,
    })),
    voteRounds: voteHistory, pointsAwarded,
  };
  return { ...state, phase: 'ROUND_RESULTS', votes: {}, voteHistory, scores, playerStats, roundEndsAt: null, nextTransitionAt: context.now + FAKE_ROUND_RESULT_MS, lastRound };
}

function resolveVote(state: OneOfUsIsFakeState, context: GameContext): OneOfUsIsFakeState {
  const recorded = { number: state.voteRoundNumber, candidateIds: [...state.voteCandidates], votes: { ...state.votes } };
  const tallies = Object.fromEntries(state.voteCandidates.map((candidate) => [candidate, 0]));
  for (const target of Object.values(state.votes)) if (target in tallies) tallies[target] = (tallies[target] ?? 0) + 1;
  const maximum = Math.max(...Object.values(tallies));
  const tied = state.voteCandidates.filter((candidate) => tallies[candidate] === maximum);
  if (tied.length === 1) return finishRound(state, tied[0]!, context);
  if (state.phase === 'REVOTE' && tied.length === state.voteCandidates.length) {
    return finishRound(state, tied[Math.floor(context.random() * tied.length)]!, context);
  }
  return {
    ...state, phase: 'REVOTE', votes: {}, voteCandidates: tied,
    voteRoundNumber: state.voteRoundNumber + 1, voteHistory: [...state.voteHistory, recorded],
    roundEndsAt: context.now + state.config.discussionSeconds * 1_000, nextTransitionAt: null,
  };
}

export const oneOfUsIsFakeGame: MiniGameModule<OneOfUsIsFakeConfig, OneOfUsIsFakeState, OneOfUsIsFakeAction, OneOfUsIsFakePublicState> = {
  manifest, configSchema: oneOfUsIsFakeConfigSchema, actionSchema: oneOfUsIsFakeActionSchema, defaultConfig: defaultOneOfUsIsFakeConfig,
  createInitialState(config, context) {
    const parsed = oneOfUsIsFakeConfigSchema.parse(config);
    const pool = context.pokemon.forGenerations(parsed.generations, { includeForms: parsed.includeRegionalForms });
    if (pool.length === 0) throw new Error('No hay Pokémon disponibles con esta configuración.');
    const categories = categoryPool(parsed, context);
    if (categories.length < 2) throw new Error('Se necesitan al menos 2 categorías activas para iniciar la partida.');
    const playerIds = context.players.map((player) => player.id);
    return {
      phase: 'GAME_STARTING', config: parsed, playerIds, poolIds: pool.map((pokemon) => pokemon.id), categoryPool: categories,
      usedCategoryIds: [], roundNumber: 0, fakePlayerId: null, mainCategoryId: null, fakeCategoryId: null,
      selections: {}, revealOrder: [], revealedCount: 0, votes: {}, voteCandidates: [], voteRoundNumber: 1,
      voteHistory: [], scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
      playerStats: Object.fromEntries(playerIds.map((id) => [id, emptyOneOfUsIsFakeStats()])),
      roundEndsAt: null, nextTransitionAt: null, lastRound: null,
    };
  },
  start(state, context) { return beginRound(state, context); },
  handleAction(state, playerId, action, context): GameActionResult<OneOfUsIsFakeState> {
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'No puedes actuar en esta ronda.' };
    if (action.type === 'SELECT_POKEMON') {
      if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'La selección ya ha terminado.' };
      const pokemon = context.pokemon.byId(action.pokemonId);
      if (!pokemon || !state.poolIds.includes(pokemon.id)) return { state, accepted: false, error: 'Ese Pokémon no pertenece al pool configurado.' };
      const next = { ...state, selections: { ...state.selections, [playerId]: { id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite } } };
      return { state: allConnectedRequiredCompleted(context, state.playerIds, (id) => Boolean(next.selections[id])) ? beginReveal(next, context) : next, accepted: true };
    }
    if (state.phase !== 'DISCUSSION' && state.phase !== 'REVOTE') return { state, accepted: false, error: 'La votación no está activa.' };
    if (action.playerId === playerId) return { state, accepted: false, error: 'No puedes votarte a ti mismo.' };
    if (!state.voteCandidates.includes(action.playerId)) return { state, accepted: false, error: 'Ese jugador no es candidato en esta votación.' };
    if (state.votes[playerId]) return { state, accepted: false, error: 'Tu voto ya está bloqueado.' };
    const current = state.playerStats[playerId] ?? emptyOneOfUsIsFakeStats();
    const next = {
      ...state, votes: { ...state.votes, [playerId]: action.playerId },
      playerStats: { ...state.playerStats, [playerId]: {
        ...current,
        correctVotes: current.correctVotes + (action.playerId === state.fakePlayerId ? 1 : 0),
        incorrectVotes: current.incorrectVotes + (action.playerId === state.fakePlayerId ? 0 : 1),
      } },
    };
    return { state: allEligibleVoted(next, context) ? resolveVote(next, context) : next, accepted: true };
  },
  handleTimeout(state, context) {
    if (state.phase === 'ROUND_ACTIVE' && context.now >= (state.roundEndsAt ?? Infinity)) return beginReveal(state, context);
    if (state.phase === 'CHOICE_REVEAL' && context.now >= (state.nextTransitionAt ?? Infinity)) return advanceReveal(state, context);
    if ((state.phase === 'DISCUSSION' || state.phase === 'REVOTE') && context.now >= (state.roundEndsAt ?? Infinity)) return resolveVote(state, context);
    if (state.phase === 'ROUND_RESULTS' && context.now >= (state.nextTransitionAt ?? Infinity)) return beginRound(state, context);
    return state;
  },
  handlePresenceChange(state, context) {
    if (state.phase === 'ROUND_ACTIVE' && allConnectedRequiredCompleted(context, state.playerIds, (id) => Boolean(state.selections[id]))) return beginReveal(state, context);
    if ((state.phase === 'DISCUSSION' || state.phase === 'REVOTE') && allEligibleVoted(state, context)) return resolveVote(state, context);
    return state;
  },
  getPublicState(state) {
    const revealedIds = new Set(state.revealOrder.slice(0, state.revealedCount));
    return {
      gameId: 'one-of-us-is-fake', phase: state.phase, roundNumber: state.roundNumber, totalRounds: state.config.rounds,
      playerIds: [...state.playerIds],
      selectionCompletedIds: Object.keys(state.selections),
      revealedChoices: state.revealOrder.flatMap((playerId) => revealedIds.has(playerId) && state.selections[playerId] ? [{ playerId, pokemon: state.selections[playerId]! }] : []),
      votedPlayerIds: Object.keys(state.votes), voteCandidates: [...state.voteCandidates], voteRoundNumber: state.voteRoundNumber,
      scores: { ...state.scores }, roundEndsAt: state.roundEndsAt, nextTransitionAt: state.nextTransitionAt,
      lastRound: state.phase === 'ROUND_RESULTS' ? state.lastRound : null,
      results: state.phase === 'GAME_RESULTS' ? buildOneOfUsIsFakeResults(state) : null,
    };
  },
  getPlayerState(state, playerId, context): OneOfUsIsFakePlayerState {
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { role: 'SPECTATOR' };
    const myCategory = categoryText(state, playerId === state.fakePlayerId ? state.fakeCategoryId : state.mainCategoryId);
    const base = {
      role: 'PLAYER' as const, myCategory, ownChoice: state.selections[playerId] ?? null,
      canSelect: state.phase === 'ROUND_ACTIVE', canVote: (state.phase === 'DISCUSSION' || state.phase === 'REVOTE') && !state.votes[playerId],
      ownVotePlayerId: state.votes[playerId] ?? null,
    };
    return state.config.fakeKnows && playerId === state.fakePlayerId ? { ...base, isFake: true } : base;
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildOneOfUsIsFakeResults(state); },
};
