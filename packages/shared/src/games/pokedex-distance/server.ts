import { allConnectedRequiredCompleted, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { defaultPokedexDistanceConfig, pokedexDistanceConfigSchema, type PokedexDistanceConfig } from './config.js';
import { buildResults, distanceBetween, elimination, emptyPlayerStats, farthestPlayerIds } from './rules.js';
import { pokedexDistanceActionSchema, type PokedexDistanceAction, type PokedexDistancePublicState, type PokedexDistanceState, type RoundResult } from './types.js';

const manifest = {
  id: 'pokedex-distance',
  name: 'Pokédex Distance',
  description: 'Elige un Pokémon cuyo número esté lo más cerca posible del objetivo.',
  minPlayers: 2,
} as const;
const RESULTS_DURATION_MS = 4_000;

function selectTarget(state: PokedexDistanceState, context: GameContext): number {
  const pool = context.pokemon.forGenerations(state.config.generations);
  if (pool.length === 0) throw new Error('The selected generations have no Pokémon');
  const index = Math.min(Math.floor(context.random() * pool.length), pool.length - 1);
  return pool[index]!.nationalDexNumber;
}

function beginRound(state: PokedexDistanceState, context: GameContext, eligibleIds: string[], tiebreakDepth: number): PokedexDistanceState {
  const isTiebreak = tiebreakDepth > 0;
  return {
    ...state,
    phase: isTiebreak ? 'TIEBREAKER_ACTIVE' : 'ROUND_ACTIVE',
    roundNumber: isTiebreak ? state.roundNumber : state.roundNumber + 1,
    tiebreakDepth,
    eligibleIds: [...eligibleIds],
    targetDexNumber: selectTarget(state, context),
    selections: {},
    lockedPokemonIds: [],
    roundStartedAt: context.now,
    roundEndsAt: context.now + state.config.roundSeconds * 1_000,
    lastRound: null,
    nextTransitionAt: null,
    pendingEligibleIds: [],
    pendingTiebreakDepth: 0,
  };
}

function finishIfWinner(state: PokedexDistanceState): PokedexDistanceState {
  if (state.survivorIds.length > 1) return state;
  return {
    ...state,
    phase: 'GAME_RESULTS',
    winnerId: state.survivorIds[0] ?? null,
    eligibleIds: [],
    roundEndsAt: null,
    nextTransitionAt: null,
  };
}

function eliminateAndContinue(
  state: PokedexDistanceState,
  playerIds: string[],
  reason: 'FARTHEST' | 'NO_RESPONSE',
  context: GameContext,
  roundResult: RoundResult,
): PokedexDistanceState {
  const eliminatedSet = new Set(playerIds);
  const survivorIds = state.survivorIds.filter((id) => !eliminatedSet.has(id));
  const next: PokedexDistanceState = {
    ...state,
    phase: 'ROUND_RESULTS',
    survivorIds,
    spectatorIds: [...new Set([...state.spectatorIds, ...playerIds])],
    lastRound: roundResult,
    eliminations: [...state.eliminations, elimination(playerIds, reason, state)],
    roundEndsAt: null,
    nextTransitionAt: context.now + RESULTS_DURATION_MS,
    pendingEligibleIds: survivorIds,
    pendingTiebreakDepth: 0,
  };
  return next;
}

function resolveRound(state: PokedexDistanceState, context: GameContext): PokedexDistanceState {
  const missing = state.eligibleIds.filter((id) => !state.selections[id]);
  if (missing.length > 0) {
    return eliminateAndContinue(state, missing, 'NO_RESPONSE', context, {
      targetDexNumber: state.targetDexNumber!, selections: state.selections, eliminatedIds: missing, reason: 'NO_RESPONSE', tiedIds: [],
    });
  }

  const farthest = farthestPlayerIds(state.selections);
  if (farthest.length > 1) {
    const tieResult: RoundResult = {
      targetDexNumber: state.targetDexNumber!, selections: state.selections, eliminatedIds: [], reason: 'TIE', tiedIds: farthest,
    };
    return {
      ...state,
      phase: 'ROUND_RESULTS',
      lastRound: tieResult,
      roundEndsAt: null,
      nextTransitionAt: context.now + RESULTS_DURATION_MS,
      pendingEligibleIds: farthest,
      pendingTiebreakDepth: state.tiebreakDepth + 1,
    };
  }

  const eliminatedId = farthest[0];
  if (!eliminatedId) return state;
  return eliminateAndContinue(state, [eliminatedId], 'FARTHEST', context, {
    targetDexNumber: state.targetDexNumber!, selections: state.selections, eliminatedIds: [eliminatedId], reason: 'FARTHEST', tiedIds: [],
  });
}

export const pokedexDistanceGame: MiniGameModule<PokedexDistanceConfig, PokedexDistanceState, PokedexDistanceAction, PokedexDistancePublicState> = {
  manifest,
  configSchema: pokedexDistanceConfigSchema,
  actionSchema: pokedexDistanceActionSchema,
  defaultConfig: defaultPokedexDistanceConfig,

  createInitialState(config, context) {
    const parsed = pokedexDistanceConfigSchema.parse(config);
    if (context.players.length < manifest.minPlayers) throw new Error(`At least ${manifest.minPlayers} players are required`);
    if (context.pokemon.forGenerations(parsed.generations).length < context.players.length) throw new Error('The Pokémon pool is too small for this player count');
    const playerStats = Object.fromEntries(context.players.map((player) => [player.id, emptyPlayerStats()]));
    return {
      phase: 'GAME_STARTING', config: parsed, initialPlayerIds: context.players.map((player) => player.id),
      survivorIds: context.players.map((player) => player.id), spectatorIds: [], roundNumber: 0, tiebreakDepth: 0,
      eligibleIds: [], targetDexNumber: null, selections: {}, lockedPokemonIds: [], roundStartedAt: null,
      roundEndsAt: null, nextTransitionAt: null, pendingEligibleIds: [], pendingTiebreakDepth: 0,
      lastRound: null, eliminations: [], playerStats, winnerId: null,
    };
  },

  start(state, context) {
    if (state.phase !== 'GAME_STARTING') throw new Error('Game already started');
    return beginRound(state, context, state.survivorIds, 0);
  },

  handleAction(state, playerId, action, context): GameActionResult<PokedexDistanceState> {
    if (action.type !== 'SELECT_POKEMON') return { state, accepted: false, error: 'Unknown action' };
    if (state.phase !== 'ROUND_ACTIVE' && state.phase !== 'TIEBREAKER_ACTIVE') return { state, accepted: false, error: 'No active round' };
    if (!state.eligibleIds.includes(playerId)) return { state, accepted: false, error: 'You are spectating this round' };
    if (state.selections[playerId]) return { state, accepted: false, error: 'Selection already locked' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state: resolveRound(state, context), accepted: false, error: 'Round has ended' };
    if (state.lockedPokemonIds.includes(action.pokemonId)) return { state, accepted: false, error: 'Ese Pokémon ya ha sido elegido.' };
    const pokemon = context.pokemon.byId(action.pokemonId);
    if (!pokemon || !state.config.generations.includes(pokemon.generation)) return { state, accepted: false, error: 'Pokémon is not in the configured pool' };

    const distance = distanceBetween(pokemon.nationalDexNumber, state.targetDexNumber!);
    const stats = state.playerStats[playerId] ?? emptyPlayerStats();
    let next: PokedexDistanceState = {
      ...state,
      selections: { ...state.selections, [playerId]: { pokemonId: pokemon.id, dexNumber: pokemon.nationalDexNumber, distance, selectedAt: context.now } },
      lockedPokemonIds: [...state.lockedPokemonIds, pokemon.id],
      playerStats: { ...state.playerStats, [playerId]: { ...stats, exactHits: stats.exactHits + (distance === 0 ? 1 : 0), distanceTotal: stats.distanceTotal + distance, selections: stats.selections + 1, roundsSurvived: stats.roundsSurvived + 1 } },
    };
    if (allConnectedRequiredCompleted(context, next.eligibleIds, (id) => Boolean(next.selections[id]))) next = resolveRound(next, context);
    return { state: next, accepted: true };
  },

  handleTimeout(state, context) {
    if (state.phase === 'ROUND_RESULTS' && context.now >= (state.nextTransitionAt ?? Infinity)) {
      if (state.survivorIds.length <= 1) return finishIfWinner(state);
      return beginRound(state, context, state.pendingEligibleIds, state.pendingTiebreakDepth);
    }
    if (state.phase !== 'ROUND_ACTIVE' && state.phase !== 'TIEBREAKER_ACTIVE') return state;
    if (context.now < (state.roundEndsAt ?? Infinity)) return state;
    return resolveRound(state, context);
  },

  handlePresenceChange(state, context) {
    if ((state.phase === 'ROUND_ACTIVE' || state.phase === 'TIEBREAKER_ACTIVE')
      && allConnectedRequiredCompleted(context, state.eligibleIds, (id) => Boolean(state.selections[id]))) {
      return resolveRound(state, context);
    }
    return state;
  },

  getPublicState(state, context) {
    const selections = Object.fromEntries(Object.entries(state.selections).map(([playerId, selection]) => {
      const pokemon = context.pokemon.byId(selection.pokemonId);
      return [playerId, { ...selection, pokemonName: pokemon?.name ?? 'Unknown', sprite: pokemon?.sprite ?? '' }];
    }));
    const lastRound = state.lastRound ? (() => {
      const target = context.pokemon.byDexNumber(state.lastRound!.targetDexNumber);
      if (!target) throw new Error('Round target is missing from the Pokémon catalog');
      const roundSelections = Object.fromEntries(Object.entries(state.lastRound!.selections).map(([playerId, selection]) => {
        const pokemon = context.pokemon.byId(selection.pokemonId);
        return [playerId, { ...selection, pokemonName: pokemon?.name ?? 'Unknown', sprite: pokemon?.sprite ?? '' }];
      }));
      return {
        ...state.lastRound!,
        eligibleIds: [...state.eligibleIds],
        targetPokemon: { id: target.id, name: target.name, nationalDexNumber: target.nationalDexNumber, sprite: target.sprite },
        selections: roundSelections,
      };
    })() : null;
    return {
      gameId: 'pokedex-distance', phase: state.phase, roundNumber: state.roundNumber,
      tiebreakDepth: state.tiebreakDepth, targetDexNumber: state.targetDexNumber, eligibleIds: state.eligibleIds,
      survivorIds: state.survivorIds, spectatorIds: state.spectatorIds, selections,
      lockedPokemonIds: state.lockedPokemonIds, roundStartedAt: state.roundStartedAt,
      roundEndsAt: state.roundEndsAt, lastRound, winnerId: state.winnerId,
      nextTransitionAt: state.nextTransitionAt,
      results: state.phase === 'GAME_RESULTS' ? buildResults(state) : null,
    };
  },
  getPlayerState(state, playerId) { return { canSelect: state.eligibleIds.includes(playerId) && !state.selections[playerId], selection: state.selections[playerId] ?? null }; },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildResults(state); },
};
