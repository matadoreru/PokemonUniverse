import type { Pokemon } from '../../pokemon/types.js';
import { isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { buildBluffAuctionConditions } from './conditions.js';
import { defaultPokemonBluffAuctionConfig, pokemonBluffAuctionConfigSchema, type PokemonBluffAuctionConfig } from './config.js';
import { BLUFF_BIDDER_SUCCESS_POINTS, BLUFF_OTHERS_SUCCESS_POINTS, buildPokemonBluffAuctionResults, emptyBluffAuctionStats } from './rules.js';
import { pokemonBluffAuctionActionSchema, type BluffAuctionRoundResult, type PokemonBluffAuctionAction, type PokemonBluffAuctionPlayerState, type PokemonBluffAuctionPublicState, type PokemonBluffAuctionState } from './types.js';

export const BLUFF_SECONDS_PER_ATTEMPT = 5;
export const BLUFF_RESULT_REVEAL_MS = 5_000;

const manifest = {
  id: 'pokemon-bluff-auction', name: 'Pokémon Bluff Auction', icon: '🔨',
  description: 'Puja cuántos Pokémon puedes nombrar y demuestra tu apuesta ante el grupo.', minPlayers: 2,
  profileStats: {
    metrics: [
      { key: 'roundsWon', label: 'Rondas ganadas', aggregation: 'SUM' as const },
      { key: 'bidderRounds', label: 'Rondas como apostador', aggregation: 'SUM' as const },
      { key: 'completedBids', label: 'Apuestas completadas', aggregation: 'SUM' as const },
      { key: 'failedBids', label: 'Apuestas falladas', aggregation: 'SUM' as const },
      { key: 'correctPokemon', label: 'Pokémon correctos', aggregation: 'SUM' as const },
      { key: 'incorrectPokemon', label: 'Pokémon incorrectos', aggregation: 'SUM' as const },
      { key: 'highestCompletedBid', label: 'Mayor apuesta completada', aggregation: 'MAX' as const },
      { key: 'highestAttemptedBid', label: 'Mayor apuesta intentada', aggregation: 'MAX' as const },
      { key: 'impossibleBids', label: 'Apuestas imposibles', aggregation: 'SUM' as const },
    ],
    derivedMetrics: [{
      key: 'bidderSuccessRate', label: 'Éxito como apostador', kind: 'PERCENT' as const,
      numerator: 'completedBids', denominator: ['completedBids', 'failedBids'],
    }],
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

function canonicalPool(context: GameContext, config: PokemonBluffAuctionConfig): Pokemon[] {
  const byDex = new Map<number, Pokemon>();
  for (const pokemon of context.pokemon.forGenerations(config.generations, { includeForms: false })) {
    if (pokemon.isDefault === false || byDex.has(pokemon.nationalDexNumber)) continue;
    byDex.set(pokemon.nationalDexNumber, pokemon);
  }
  return [...byDex.values()];
}

function currentTurnPlayerId(state: PokemonBluffAuctionState): string | null {
  if (state.phase !== 'ROUND_ACTIVE' || state.bidOrder.length === 0) return null;
  return state.bidOrder[state.turnIndex % state.bidOrder.length] ?? null;
}

function activeBidderIds(state: PokemonBluffAuctionState): string[] {
  return state.bidOrder.filter((playerId) => !state.passedPlayerIds.includes(playerId));
}

function playerDefinitivelyLeft(context: GameContext, playerId: string): boolean {
  return context.players.find((player) => player.id === playerId)?.active === false;
}

function selectCondition(state: PokemonBluffAuctionState, context: GameContext) {
  const unused = state.conditionTemplates.filter((template) => !state.usedConditionKeys.includes(template.key));
  const source = unused.length > 0 ? unused : state.conditionTemplates;
  const selected = source[Math.floor(context.random() * source.length)]!;
  const used = [...new Set([...state.usedConditionKeys, selected.key])];
  return { selected, used: used.length === state.conditionTemplates.length ? [] : used };
}

function beginRound(state: PokemonBluffAuctionState, context: GameContext): PokemonBluffAuctionState {
  if (state.roundNumber >= state.config.rounds) return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null };
  const { selected, used } = selectCondition(state, context);
  return {
    ...state, phase: 'ROUND_ACTIVE', roundNumber: state.roundNumber + 1,
    condition: { key: selected.key, conditions: selected.conditions, description: selected.description, clauses: selected.clauses },
    validPokemonIds: [...selected.candidatePokemonIds], usedConditionKeys: used,
    bidOrder: shuffled(state.playerIds, context.random), turnIndex: 0, passedPlayerIds: [],
    currentBid: null, currentBidderId: null, bidHistory: [], bidderId: null, targetBid: null,
    attempts: [], usedPokemonIds: [], correctCount: 0, incorrectCount: 0,
    roundEndsAt: null, nextTransitionAt: null, lastRound: null,
  };
}

function updateBidderStartStats(state: PokemonBluffAuctionState, bidderId: string, bid: number) {
  const stats = state.playerStats[bidderId] ?? emptyBluffAuctionStats();
  return { ...state.playerStats, [bidderId]: {
    ...stats, bidderRounds: stats.bidderRounds + 1,
    highestAttemptedBid: Math.max(stats.highestAttemptedBid, bid),
  } };
}

function finishRound(state: PokemonBluffAuctionState, context: GameContext, success: boolean, reason: BluffAuctionRoundResult['reason']): PokemonBluffAuctionState {
  const bidderId = state.bidderId!; const bid = state.targetBid!;
  const pointsAwarded = Object.fromEntries(state.playerIds.map((playerId) => [
    playerId, success ? (playerId === bidderId ? BLUFF_BIDDER_SUCCESS_POINTS : 0) : (playerId === bidderId ? 0 : BLUFF_OTHERS_SUCCESS_POINTS),
  ]));
  const scores = Object.fromEntries(state.playerIds.map((playerId) => [playerId, (state.scores[playerId] ?? 0) + (pointsAwarded[playerId] ?? 0)]));
  const playerStats = Object.fromEntries(state.playerIds.map((playerId) => {
    const stats = state.playerStats[playerId] ?? emptyBluffAuctionStats();
    const bidder = playerId === bidderId;
    return [playerId, {
      ...stats,
      roundsWon: stats.roundsWon + ((success && bidder) || (!success && !bidder) ? 1 : 0),
      completedBids: stats.completedBids + (success && bidder ? 1 : 0),
      failedBids: stats.failedBids + (!success && bidder ? 1 : 0),
      highestCompletedBid: Math.max(stats.highestCompletedBid, success && bidder ? bid : 0),
      impossibleBids: stats.impossibleBids + (bidder && reason === 'IMPOSSIBLE' ? 1 : 0),
    }];
  }));
  const lastRound: BluffAuctionRoundResult = {
    bidderId, bid, success, reason,
    condition: { description: state.condition!.description, clauses: [...state.condition!.clauses] },
    attempts: [...state.attempts], correctCount: state.correctCount, incorrectCount: state.incorrectCount,
    validPokemonCount: reason === 'IMPOSSIBLE' ? state.validPokemonIds.length : null, pointsAwarded,
  };
  return { ...state, phase: 'ROUND_RESULTS', scores, playerStats, roundEndsAt: null, nextTransitionAt: context.now + BLUFF_RESULT_REVEAL_MS, lastRound };
}

function beginDemonstration(state: PokemonBluffAuctionState, context: GameContext, bidderId: string): PokemonBluffAuctionState {
  const bid = state.currentBid ?? 1;
  const next = {
    ...state, phase: 'POKEMON_SEARCH' as const, bidderId, targetBid: bid, currentBid: bid,
    currentBidderId: bidderId, playerStats: updateBidderStartStats(state, bidderId, bid),
    roundEndsAt: context.now + state.config.demonstrationSeconds * 1_000, nextTransitionAt: null,
  };
  return bid > state.validPokemonIds.length ? finishRound(next, context, false, 'IMPOSSIBLE') : next;
}

function settleIfOneRemains(state: PokemonBluffAuctionState, context: GameContext): PokemonBluffAuctionState {
  const active = activeBidderIds(state);
  return active.length <= 1 ? beginDemonstration(state, context, active[0] ?? state.currentBidderId ?? state.bidOrder[0]!) : state;
}

function advanceTurn(state: PokemonBluffAuctionState, context: GameContext): PokemonBluffAuctionState {
  let next = state; let checked = 0;
  while (checked < next.bidOrder.length) {
    const index = (next.turnIndex + 1) % next.bidOrder.length;
    next = { ...next, turnIndex: index };
    const playerId = currentTurnPlayerId(next)!;
    if (!next.passedPlayerIds.includes(playerId) && isPlayerRequired(context, playerId)) break;
    if (!next.passedPlayerIds.includes(playerId)) next = {
      ...next, passedPlayerIds: [...next.passedPlayerIds, playerId],
      bidHistory: [...next.bidHistory, { playerId, type: 'PASS' }],
    };
    const settled = settleIfOneRemains(next, context); if (settled.phase !== 'ROUND_ACTIVE') return settled;
    checked += 1;
  }
  return settleIfOneRemains(next, context);
}

export const pokemonBluffAuctionGame: MiniGameModule<PokemonBluffAuctionConfig, PokemonBluffAuctionState, PokemonBluffAuctionAction, PokemonBluffAuctionPublicState> = {
  manifest, configSchema: pokemonBluffAuctionConfigSchema, actionSchema: pokemonBluffAuctionActionSchema, defaultConfig: defaultPokemonBluffAuctionConfig,
  createInitialState(config, context) {
    const parsed = pokemonBluffAuctionConfigSchema.parse(config); const pool = canonicalPool(context, parsed);
    if (pool.length === 0) throw new Error('No hay especies normales disponibles para estas generaciones.');
    const templates = buildBluffAuctionConditions(pool, parsed.generations, context.random);
    if (templates.length === 0) throw new Error('No se pudieron generar condiciones interesantes para este pool.');
    const playerIds = context.players.map((player) => player.id);
    return {
      phase: 'GAME_STARTING', config: parsed, playerIds, poolIds: pool.map((pokemon) => pokemon.id), conditionTemplates: templates,
      usedConditionKeys: [], roundNumber: 0, condition: null, validPokemonIds: [], bidOrder: [], turnIndex: 0,
      passedPlayerIds: [], currentBid: null, currentBidderId: null, bidHistory: [], bidderId: null, targetBid: null,
      attempts: [], usedPokemonIds: [], correctCount: 0, incorrectCount: 0,
      scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
      playerStats: Object.fromEntries(playerIds.map((id) => [id, emptyBluffAuctionStats()])),
      roundEndsAt: null, nextTransitionAt: null, lastRound: null,
    };
  },
  start(state, context) { return beginRound(state, context); },
  handleAction(state, playerId, action, context): GameActionResult<PokemonBluffAuctionState> {
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'No puedes actuar ahora.' };
    if (action.type === 'RAISE_BID' || action.type === 'PASS_BID') {
      if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'La subasta ya ha terminado.' };
      if (currentTurnPlayerId(state) !== playerId) return { state, accepted: false, error: 'No es tu turno.' };
      if (state.passedPlayerIds.includes(playerId)) return { state, accepted: false, error: 'Ya has pasado esta ronda.' };
      if (action.type === 'RAISE_BID') {
        const minimum = (state.currentBid ?? 0) + 1;
        if (action.amount < minimum) return { state, accepted: false, error: `La puja mínima es ${minimum}.` };
        if (action.amount > state.poolIds.length) return { state, accepted: false, error: `La puja máxima es ${state.poolIds.length}.` };
        const next = { ...state, currentBid: action.amount, currentBidderId: playerId, bidHistory: [...state.bidHistory, { playerId, type: 'BID' as const, amount: action.amount }] };
        return { state: advanceTurn(next, context), accepted: true };
      }
      const next = { ...state, passedPlayerIds: [...state.passedPlayerIds, playerId], bidHistory: [...state.bidHistory, { playerId, type: 'PASS' as const }] };
      const settled = settleIfOneRemains(next, context);
      return { state: settled.phase === 'ROUND_ACTIVE' ? advanceTurn(settled, context) : settled, accepted: true };
    }
    if (state.phase !== 'POKEMON_SEARCH' || state.bidderId !== playerId) return { state, accepted: false, error: 'Solo el apostador puede demostrar la apuesta.' };
    const pokemon = context.pokemon.byId(action.pokemonId);
    if (!pokemon || !state.poolIds.includes(pokemon.id)) return { state, accepted: false, error: 'Ese Pokémon no pertenece al pool de especies configurado.' };
    if (state.usedPokemonIds.includes(pokemon.id)) {
      return { state: { ...state, attempts: [...state.attempts, { pokemon: { id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite }, result: 'DUPLICATE', submittedAt: context.now }] }, accepted: true };
    }
    const correct = state.validPokemonIds.includes(pokemon.id); const stats = state.playerStats[playerId] ?? emptyBluffAuctionStats();
    const next: PokemonBluffAuctionState = {
      ...state, usedPokemonIds: [...state.usedPokemonIds, pokemon.id],
      attempts: [...state.attempts, { pokemon: { id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite }, result: correct ? 'CORRECT' : 'INCORRECT', submittedAt: context.now }],
      correctCount: state.correctCount + (correct ? 1 : 0), incorrectCount: state.incorrectCount + (correct ? 0 : 1),
      roundEndsAt: (state.roundEndsAt ?? context.now) + BLUFF_SECONDS_PER_ATTEMPT * 1_000,
      playerStats: { ...state.playerStats, [playerId]: {
        ...stats, correctPokemon: stats.correctPokemon + (correct ? 1 : 0), incorrectPokemon: stats.incorrectPokemon + (correct ? 0 : 1),
      } },
    };
    return { state: next.correctCount >= (next.targetBid ?? Infinity) ? finishRound(next, context, true, 'COMPLETED') : next, accepted: true };
  },
  handleTimeout(state, context) {
    if (state.phase === 'POKEMON_SEARCH' && context.now >= (state.roundEndsAt ?? Infinity)) return finishRound(state, context, false, 'TIMEOUT');
    if (state.phase === 'ROUND_RESULTS' && context.now >= (state.nextTransitionAt ?? Infinity)) return beginRound(state, context);
    return state;
  },
  handlePresenceChange(state, context) {
    if (state.phase === 'ROUND_ACTIVE') {
      const turnPlayerId = currentTurnPlayerId(state);
      if (turnPlayerId && !isPlayerRequired(context, turnPlayerId)) {
        const next = state.passedPlayerIds.includes(turnPlayerId) ? state : {
          ...state, passedPlayerIds: [...state.passedPlayerIds, turnPlayerId],
          bidHistory: [...state.bidHistory, { playerId: turnPlayerId, type: 'PASS' as const }],
        };
        const settled = settleIfOneRemains(next, context);
        return settled.phase === 'ROUND_ACTIVE' ? advanceTurn(settled, context) : settled;
      }
    }
    if (state.phase === 'POKEMON_SEARCH' && state.bidderId && playerDefinitivelyLeft(context, state.bidderId)) return finishRound(state, context, false, 'BIDDER_LEFT');
    return state;
  },
  getPublicState(state) {
    return {
      gameId: 'pokemon-bluff-auction', phase: state.phase, roundNumber: state.roundNumber, totalRounds: state.config.rounds,
      playerIds: [...state.playerIds], condition: state.condition ? { description: state.condition.description, clauses: [...state.condition.clauses] } : null,
      bidOrder: [...state.bidOrder], currentTurnPlayerId: currentTurnPlayerId(state), passedPlayerIds: [...state.passedPlayerIds],
      currentBid: state.currentBid, minimumBid: (state.currentBid ?? 0) + 1, currentBidderId: state.currentBidderId,
      bidHistory: [...state.bidHistory], maxBid: state.poolIds.length, bidderId: state.bidderId, targetBid: state.targetBid,
      attempts: [...state.attempts], correctCount: state.correctCount, incorrectCount: state.incorrectCount,
      remainingCount: Math.max(0, (state.targetBid ?? 0) - state.correctCount), scores: { ...state.scores },
      roundEndsAt: state.roundEndsAt, nextTransitionAt: state.nextTransitionAt,
      lastRound: state.phase === 'ROUND_RESULTS' ? state.lastRound : null,
      results: state.phase === 'GAME_RESULTS' ? buildPokemonBluffAuctionResults(state) : null,
    };
  },
  getPlayerState(state, playerId, context): PokemonBluffAuctionPlayerState {
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { role: 'SPECTATOR', canRaise: false, canPass: false, canSubmitPokemon: false };
    return {
      role: 'PLAYER', canRaise: state.phase === 'ROUND_ACTIVE' && currentTurnPlayerId(state) === playerId && !state.passedPlayerIds.includes(playerId),
      canPass: state.phase === 'ROUND_ACTIVE' && currentTurnPlayerId(state) === playerId && !state.passedPlayerIds.includes(playerId),
      canSubmitPokemon: state.phase === 'POKEMON_SEARCH' && state.bidderId === playerId,
    };
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildPokemonBluffAuctionResults(state); },
};
