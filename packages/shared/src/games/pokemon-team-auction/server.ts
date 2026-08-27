import { isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { defaultPokemonTeamAuctionConfig, pokemonTeamAuctionConfigSchema, type PokemonTeamAuctionConfig } from './config.js';
import { buildTeamAuctionResults, participantStats } from './rules.js';
import { pokemonTeamAuctionActionSchema, type PokemonTeamAuctionAction, type PokemonTeamAuctionPlayerState, type PokemonTeamAuctionPublicState, type PokemonTeamAuctionState, type TeamAuctionBidEvent, type TeamAuctionLotResult, type TeamAuctionParticipant, type TeamAuctionPokemon } from './types.js';

const manifest = {
  id: 'pokemon-team-auction',
  name: 'Pokémon Team Auction',
  recommended: true,
  icon: '💰',
  description: 'Construye tu equipo pujando por Pokémon en una subasta visible.',
  experimental: true,
  minPlayers: 2,
  profileStats: {
    metrics: [
      { key: 'lotsWon', label: 'Lotes ganados', aggregation: 'SUM' as const },
      { key: 'pokemonWon', label: 'Pokémon adquiridos', aggregation: 'SUM' as const },
      { key: 'bstTotal', label: 'BST del equipo', aggregation: 'SUM' as const },
      { key: 'coinsRemaining', label: 'Monedas restantes', aggregation: 'SUM' as const },
      { key: 'legendaryCount', label: 'Legendarios', aggregation: 'SUM' as const },
      { key: 'mythicalCount', label: 'Míticos', aggregation: 'SUM' as const },
      { key: 'unownedLots', label: 'Lotes sin dueño', aggregation: 'SUM' as const },
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

function rotate<T>(values: readonly T[], offset: number): T[] {
  if (values.length === 0) return [];
  const start = offset % values.length;
  return [...values.slice(start), ...values.slice(0, start)];
}

function poolFor(context: GameContext, config: PokemonTeamAuctionConfig, totalLots: number): TeamAuctionPokemon[] {
  const pool = context.pokemon.forGenerations(config.generations, { includeForms: config.includeForms })
    .filter((pokemon) => pokemon.sprite && (config.includeForms || pokemon.isDefault !== false));
  if (pool.length === 0) throw new Error('No hay Pokémon disponibles con estas generaciones.');
  const shuffledPool = shuffled(pool, context.random);
  return Array.from({ length: totalLots }, (_, index) => {
    const pokemon = shuffledPool[index % shuffledPool.length]!;
    return {
      id: pokemon.id,
      name: pokemon.name,
      sprite: pokemon.sprite,
      baseStatTotal: pokemon.baseStatTotal,
      legendaryStatus: pokemon.legendaryStatus ?? 'NORMAL',
    };
  });
}

function copyPokemon(pokemon: TeamAuctionPokemon): TeamAuctionPokemon {
  return { ...pokemon };
}

function copyParticipant(participant: TeamAuctionParticipant): TeamAuctionParticipant {
  return { coins: participant.coins, team: participant.team.map(copyPokemon), playerId: participant.playerId };
}

function participant(state: PokemonTeamAuctionState, playerId: string): TeamAuctionParticipant | undefined {
  return state.participants[playerId];
}

function requiredBid(state: PokemonTeamAuctionState): number {
  return (state.currentBid ?? 0) + 1;
}

function currentTurnPlayerId(state: PokemonTeamAuctionState): string | null {
  if (state.phase !== 'ROUND_ACTIVE' || state.turnOrder.length === 0) return null;
  return state.turnOrder[state.turnIndex % state.turnOrder.length] ?? null;
}

function eligibleForLot(state: PokemonTeamAuctionState, playerId: string, context: GameContext): boolean {
  const current = participant(state, playerId);
  return Boolean(current && current.team.length < 6 && isPlayerRequired(context, playerId) && current.coins >= requiredBid(state));
}

function finishGame(state: PokemonTeamAuctionState): PokemonTeamAuctionState {
  const playerStats = Object.fromEntries(state.playerIds.map((playerId) => {
    const current = state.participants[playerId]!;
    return [playerId, participantStats(current, state.lotHistory.filter((lot) => lot.winnerId === playerId).length, state.lotHistory.filter((lot) => lot.winnerId === null).length)];
  }));
  const results = buildTeamAuctionResults({ ...state, phase: 'GAME_RESULTS', playerStats });
  return { ...state, phase: 'GAME_RESULTS', currentBid: null, currentBidderId: null, passedPlayerIds: [], playerStats, results };
}

function beginLot(state: PokemonTeamAuctionState, lotIndex: number, context: GameContext): PokemonTeamAuctionState {
  if (lotIndex >= state.lots.length) return finishGame(state);
  const next: PokemonTeamAuctionState = {
    ...state,
    phase: 'ROUND_ACTIVE',
    currentLotIndex: lotIndex,
    currentBid: null,
    currentBidderId: null,
    passedPlayerIds: [],
    turnOrder: rotate(shuffled(state.playerIds, context.random), lotIndex % Math.max(1, state.playerIds.length)),
    turnIndex: 0,
  };
  return normalizeTurn(next, context);
}

function settleLot(state: PokemonTeamAuctionState, context: GameContext): PokemonTeamAuctionState {
  const lot = state.lots[state.currentLotIndex];
  if (!lot) return finishGame(state);
  const result: TeamAuctionLotResult = {
    lotNumber: state.currentLotIndex + 1,
    pokemon: copyPokemon(lot),
    winnerId: state.currentBidderId,
    bid: state.currentBid ?? 0,
  };
  if (!state.currentBidderId || state.currentBid === null) {
    return beginLot({ ...state, lotHistory: [...state.lotHistory, result] }, state.currentLotIndex + 1, context);
  }
  const winner = participant(state, state.currentBidderId);
  if (!winner || winner.coins < state.currentBid || winner.team.length >= 6) return beginLot({ ...state, lotHistory: [...state.lotHistory, { ...result, winnerId: null, bid: 0 }] }, state.currentLotIndex + 1, context);
  const participants = Object.fromEntries(Object.entries(state.participants).map(([playerId, current]) => [playerId, copyParticipant(current)]));
  const updatedWinner = participants[state.currentBidderId]!;
  updatedWinner.coins -= state.currentBid;
  updatedWinner.team.push(copyPokemon(lot));
  return beginLot({ ...state, participants, lotHistory: [...state.lotHistory, result] }, state.currentLotIndex + 1, context);
}

function normalizeTurn(state: PokemonTeamAuctionState, context: GameContext): PokemonTeamAuctionState {
  let next = state;
  let checked = 0;
  while (checked < next.turnOrder.length) {
    const currentId = currentTurnPlayerId(next);
    if (!currentId) return settleLot(next, context);
    const current = participant(next, currentId);
    const canAct = Boolean(current && current.team.length < 6 && isPlayerRequired(context, currentId) && !next.passedPlayerIds.includes(currentId) && currentId !== next.currentBidderId && current.coins >= requiredBid(next));
    if (canAct) return next;
    if (!next.passedPlayerIds.includes(currentId) && currentId !== next.currentBidderId) {
      const pass: TeamAuctionBidEvent = { lotNumber: next.currentLotIndex + 1, playerId: currentId, type: 'PASS' };
      next = { ...next, passedPlayerIds: [...next.passedPlayerIds, currentId], bidHistory: [...next.bidHistory, pass] };
    }
    next = { ...next, turnIndex: (next.turnIndex + 1) % Math.max(1, next.turnOrder.length) };
    checked += 1;
    const active = next.turnOrder.filter((playerId) => !next.passedPlayerIds.includes(playerId) && playerId !== next.currentBidderId && eligibleForLot(next, playerId, context));
    if (active.length === 0) return settleLot(next, context);
  }
  return settleLot(next, context);
}

export const pokemonTeamAuctionGame: MiniGameModule<PokemonTeamAuctionConfig, PokemonTeamAuctionState, PokemonTeamAuctionAction, PokemonTeamAuctionPublicState> = {
  manifest,
  configSchema: pokemonTeamAuctionConfigSchema,
  actionSchema: pokemonTeamAuctionActionSchema,
  defaultConfig: defaultPokemonTeamAuctionConfig,
  createInitialState(config, context) {
    const parsed = pokemonTeamAuctionConfigSchema.parse(config);
    const playerIds = context.players.map((player) => player.id);
    const lots = poolFor(context, parsed, playerIds.length * 6);
    const participants = Object.fromEntries(playerIds.map((playerId) => [playerId, { playerId, coins: parsed.initialBudget, team: [] }]));
    return {
      phase: 'GAME_STARTING', config: parsed, playerIds, lots, currentLotIndex: -1,
      currentBid: null, currentBidderId: null, turnOrder: [], turnIndex: 0, passedPlayerIds: [], bidHistory: [], lotHistory: [],
      participants, playerStats: Object.fromEntries(playerIds.map((playerId) => [playerId, participantStats(participants[playerId]!, 0, 0)])),
      scores: Object.fromEntries(playerIds.map((playerId) => [playerId, 0])), results: null,
    };
  },
  start(state, context) {
    return beginLot(state, 0, context);
  },
  handleAction(state, playerId, action, context): GameActionResult<PokemonTeamAuctionState> {
    if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'La subasta ya ha terminado.' };
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'No puedes participar en esta subasta.' };
    if (currentTurnPlayerId(state) !== playerId) return { state, accepted: false, error: 'No es tu turno.' };
    const current = participant(state, playerId);
    if (!current || current.team.length >= 6) return { state, accepted: false, error: 'Tu equipo ya está completo.' };
    if (action.type === 'RAISE_BID') {
      const minimum = requiredBid(state);
      if (action.amount < minimum) return { state, accepted: false, error: `La puja mínima es ${minimum}.` };
      if (action.amount > current.coins) return { state, accepted: false, error: 'No tienes suficientes monedas para esa puja.' };
      const bid: TeamAuctionBidEvent = { lotNumber: state.currentLotIndex + 1, playerId, type: 'BID', amount: action.amount };
      const next = { ...state, currentBid: action.amount, currentBidderId: playerId, bidHistory: [...state.bidHistory, bid], turnIndex: (state.turnIndex + 1) % Math.max(1, state.turnOrder.length) };
      return { state: normalizeTurn(next, context), accepted: true };
    }
    const pass: TeamAuctionBidEvent = { lotNumber: state.currentLotIndex + 1, playerId, type: 'PASS' };
    const next = { ...state, passedPlayerIds: [...state.passedPlayerIds, playerId], bidHistory: [...state.bidHistory, pass], turnIndex: (state.turnIndex + 1) % Math.max(1, state.turnOrder.length) };
    return { state: normalizeTurn(next, context), accepted: true };
  },
  handleTimeout(state) {
    return state;
  },
  handlePresenceChange(state, context) {
    return state.phase === 'ROUND_ACTIVE' ? normalizeTurn(state, context) : state;
  },
  getPublicState(state) {
    const current = state.lots[state.currentLotIndex] ?? null;
    return {
      gameId: 'pokemon-team-auction', phase: state.phase, lotNumber: state.currentLotIndex + 1, totalLots: state.lots.length,
      currentPokemon: current ? copyPokemon(current) : null, currentBid: state.currentBid, minimumBid: requiredBid(state), currentBidderId: state.currentBidderId,
      currentTurnPlayerId: currentTurnPlayerId(state), turnOrder: [...state.turnOrder], passedPlayerIds: [...state.passedPlayerIds],
      bidHistory: state.bidHistory.map((event) => ({ ...event })), lotHistory: state.lotHistory.map((lot) => ({ ...lot, pokemon: copyPokemon(lot.pokemon) })),
      participants: Object.fromEntries(Object.entries(state.participants).map(([playerId, currentParticipant]) => [playerId, copyParticipant(currentParticipant)])),
      scores: Object.fromEntries(state.playerIds.map((playerId) => [playerId, state.participants[playerId]?.team.reduce((total, pokemon) => total + pokemon.baseStatTotal, 0) ?? 0])),
      results: state.phase === 'GAME_RESULTS' ? state.results ?? buildTeamAuctionResults(state) : null,
    };
  },
  getPlayerState(state, playerId, context): PokemonTeamAuctionPlayerState {
    const current = participant(state, playerId);
    if (!current || !state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { role: 'SPECTATOR', canRaise: false, canPass: false, minimumBid: requiredBid(state), coins: 0, team: [] };
    const canAct = state.phase === 'ROUND_ACTIVE' && currentTurnPlayerId(state) === playerId && !state.passedPlayerIds.includes(playerId) && current.team.length < 6 && current.coins >= requiredBid(state) && playerId !== state.currentBidderId;
    return { role: 'PLAYER', canRaise: canAct, canPass: state.phase === 'ROUND_ACTIVE' && currentTurnPlayerId(state) === playerId && !state.passedPlayerIds.includes(playerId) && playerId !== state.currentBidderId, minimumBid: requiredBid(state), coins: current.coins, team: current.team.map(copyPokemon) };
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildTeamAuctionResults(state); },
};
