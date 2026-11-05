import { shuffled as shuffle } from '../infrastructure/random.js';
import { timedGameLifecycle } from '../infrastructure/lifecycle.js';
import type { Pokemon, PokemonType } from '../../pokemon/types.js';
import { isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { cooldownMessage, cooldownRemainingMs, setPlayerCooldown } from '../infrastructure/timing.js';
import { defaultTypeChainConfig, typeChainConfigSchema, type TypeChainConfig } from './config.js';
import { buildTypeChainResults, emptyTypeChainStats, getValidTypeChainCandidates, hasTypeChainType, typeChainEligibleTypes, typeChainWinner } from './rules.js';
import { typeChainActionSchema, type TypeChainAction, type TypeChainEvent, type TypeChainInvalidReason, type TypeChainPlayerState, type TypeChainPokemonView, type TypeChainPublicState, type TypeChainState } from './types.js';

export const TYPE_CHAIN_INVALID_COOLDOWN_MS = 1_000;
export const TYPE_CHAIN_MAX_TURNS = 500;
export const TYPE_CHAIN_MAX_RECENT_ATTEMPTS = 40;
export const TYPE_CHAIN_MAX_RECENT_EVENTS = 30;

const manifest = {
  id: 'type-chain', name: 'Type Chain', icon: '⛓️', description: 'Cada cadena tiene un tipo: por turnos, nombra un Pokémon de ese tipo sin repetir. Gana quien más nombre.', minPlayers: 2, maxPlayers: 8,
  profileStats: {
    metrics: [
      { key: 'validSubmissions', label: 'Pokémon nombrados', aggregation: 'SUM' as const },
      { key: 'invalidAttempts', label: 'Intentos inválidos', aggregation: 'SUM' as const },
      { key: 'turnsSurvived', label: 'Turnos sobrevividos', aggregation: 'SUM' as const },
      { key: 'timeoutEliminations', label: 'Eliminaciones por timeout', aggregation: 'SUM' as const },
      { key: 'longestChain', label: 'Cadena más larga', aggregation: 'MAX' as const },
    ],
    derivedMetrics: [
      { key: 'validSubmissionRate', label: 'Tasa de intentos válidos', kind: 'PERCENT' as const, numerator: 'validSubmissions', denominator: ['validSubmissions', 'invalidAttempts'] },
    ],
  },
};

const pokemonView = (pokemon: Pokemon): TypeChainPokemonView => ({ id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite, types: [...pokemon.types] });
function pool(state: TypeChainState, context: GameContext): Pokemon[] { return state.poolIds.map((id) => context.pokemon.byId(id)).filter((pokemon): pokemon is Pokemon => Boolean(pokemon)); }
function appendEvent(events: TypeChainEvent[], event: TypeChainEvent): TypeChainEvent[] { return [...events, event].slice(-TYPE_CHAIN_MAX_RECENT_EVENTS); }

/**
 * Tipo de una cadena nueva, al azar (una extracción) entre los que tienen Pokémon suficientes en el pool: primero los
 * que aún no han tenido cadena en la partida; si ya salieron todos, cualquiera menos el de la cadena que acaba.
 */
export function selectTypeChainType(allowed: readonly Pokemon[], usedChainTypes: readonly PokemonType[], currentType: PokemonType | null, random: () => number): PokemonType | null {
  const eligible = typeChainEligibleTypes(allowed);
  const fresh = eligible.filter((type) => !usedChainTypes.includes(type)); const other = eligible.filter((type) => type !== currentType);
  const options = fresh.length ? fresh : other.length ? other : eligible; if (!options.length) return null;
  return options[Math.min(Math.floor(random() * options.length), options.length - 1)] ?? null;
}

function nextActivePlayer(state: TypeChainState, afterPlayerId: string): string | null {
  const start = state.turnOrder.indexOf(afterPlayerId);
  for (let offset = 1; offset <= state.turnOrder.length; offset += 1) {
    const candidate = state.turnOrder[(start + offset + state.turnOrder.length) % state.turnOrder.length]!;
    if (state.activePlayerIds.includes(candidate)) return candidate;
  }
  return null;
}

function finish(state: TypeChainState, reason: 'SURVIVOR' | 'MAX_TURNS'): TypeChainState {
  const longestChain = Math.max(state.longestChain, state.chain.length);
  return { ...state, phase: 'GAME_RESULTS', longestChain, currentPlayerId: null, turnStartedAt: null, roundEndsAt: null, nextTransitionAt: null, finishReason: reason, winnerId: typeChainWinner(state) };
}

/** Cadena nueva, vacía y con otro tipo; los usados vuelven a valer (el bloqueo es por cadena). */
function newChain(state: TypeChainState, context: GameContext): TypeChainState {
  const chainType = selectTypeChainType(pool(state, context), state.usedChainTypes, state.chainType, context.random); if (!chainType) throw new Error('No hay Pokémon suficientes para crear una cadena con esta configuración.');
  const previousLength = state.chain.length;
  return {
    ...state, chainNumber: state.chainNumber + 1, chainType, usedChainTypes: [...state.usedChainTypes, chainType], chain: [], usedPokemonIds: [],
    longestChain: Math.max(state.longestChain, previousLength), events: state.chainType ? appendEvent(state.events, { kind: 'CHAIN_RESET', previousLength, previousType: state.chainType, chainType, at: context.now }) : state.events,
  };
}

function eliminateOnly(state: TypeChainState, playerId: string, reason: 'TIMEOUT' | 'DISCONNECTED', context: GameContext): TypeChainState {
  if (!state.activePlayerIds.includes(playerId)) return state;
  const stats = state.playerStats[playerId] ?? emptyTypeChainStats();
  const elimination = { playerId, reason, turnNumber: state.turnNumber, eliminatedAt: context.now, eliminationOrder: state.eliminations.length + 1 } as const;
  return {
    ...state, activePlayerIds: state.activePlayerIds.filter((id) => id !== playerId), spectatorIds: [...new Set([...state.spectatorIds, playerId])],
    eliminations: [...state.eliminations, elimination], events: appendEvent(state.events, { kind: 'ELIMINATION', playerId, reason, at: context.now }),
    playerStats: { ...state.playerStats, [playerId]: { ...stats, timeoutEliminations: stats.timeoutEliminations + (reason === 'TIMEOUT' ? 1 : 0) } },
  };
}

function activateTurn(state: TypeChainState, requestedPlayerId: string, context: GameContext): TypeChainState {
  let next = state; let playerId: string | null = requestedPlayerId;
  while (playerId && !isPlayerRequired(context, playerId)) {
    const removed = playerId; next = eliminateOnly(next, removed, 'DISCONNECTED', context);
    if (next.activePlayerIds.length <= 1) return finish(next, 'SURVIVOR');
    playerId = nextActivePlayer(next, removed);
  }
  if (!playerId || next.activePlayerIds.length <= 1) return finish(next, 'SURVIVOR');
  if (!next.chainType) throw new Error('La cadena no tiene tipo.');
  // Si ya no queda ningún Pokémon sin usar de ese tipo, nadie queda eliminado: empieza otra cadena con otro tipo.
  const remaining = getValidTypeChainCandidates({ chainType: next.chainType, allowedPokemon: pool(next, context), usedPokemonIds: new Set(next.usedPokemonIds) });
  if (!remaining.length) next = newChain(next, context);
  const lastAttempt = { ...next.lastAttempt }; delete lastAttempt[playerId];
  return { ...next, phase: 'TURN_ACTIVE', currentPlayerId: playerId, turnNumber: next.turnNumber + 1, turnStartedAt: context.now, roundEndsAt: context.now + next.config.turnSeconds * 1_000, nextTransitionAt: null, cooldownUntil: { ...next.cooldownUntil, [playerId]: 0 }, lastAttempt };
}

function invalidAttempt(state: TypeChainState, playerId: string, pokemon: Pokemon, reason: TypeChainInvalidReason, context: GameContext): TypeChainState {
  const stats = state.playerStats[playerId] ?? emptyTypeChainStats();
  return {
    ...state,
    invalidAttempts: [...state.invalidAttempts, { playerId, pokemon: pokemonView(pokemon), reason, attemptedAt: context.now }].slice(-TYPE_CHAIN_MAX_RECENT_ATTEMPTS),
    cooldownUntil: setPlayerCooldown(state.cooldownUntil, playerId, context.now, TYPE_CHAIN_INVALID_COOLDOWN_MS),
    lastAttempt: { ...state.lastAttempt, [playerId]: { reason, pokemonName: pokemon.name, attemptedAt: context.now } },
    playerStats: { ...state.playerStats, [playerId]: { ...stats, invalidAttempts: stats.invalidAttempts + 1 } },
  };
}

export const typeChainGame: MiniGameModule<TypeChainConfig, TypeChainState, TypeChainAction, TypeChainPublicState> = {
  getLifecycle: timedGameLifecycle,
  manifest, configSchema: typeChainConfigSchema, actionSchema: typeChainActionSchema, defaultConfig: defaultTypeChainConfig,
  createInitialState(config, context) {
    const parsed = typeChainConfigSchema.parse(config); if (context.players.length < manifest.minPlayers) throw new Error(`Se necesitan al menos ${manifest.minPlayers} jugadores.`);
    const allowed = context.pokemon.forGenerations(parsed.generations, { includeForms: true }).filter((pokemon) => pokemon.types.length > 0);
    if (!typeChainEligibleTypes(allowed).length) throw new Error('No hay suficientes Pokémon para crear una cadena con esta configuración.');
    const playerIds = context.players.map((player) => player.id); const turnOrder = shuffle(playerIds, context.random);
    return {
      phase: 'GAME_STARTING', config: parsed, playerIds, turnOrder, activePlayerIds: [...turnOrder], spectatorIds: [], poolIds: allowed.map((pokemon) => pokemon.id), chainNumber: 0, chainType: null, usedChainTypes: [], chain: [], usedPokemonIds: [], longestChain: 0,
      turnNumber: 0, completedTurns: 0, currentPlayerId: null, turnStartedAt: null, roundEndsAt: null, nextTransitionAt: null, cooldownUntil: {}, invalidAttempts: [], lastAttempt: {}, eliminations: [], events: [],
      playerStats: Object.fromEntries(playerIds.map((id) => [id, emptyTypeChainStats()])), winnerId: null, finishReason: null,
    };
  },
  start(state, context) {
    if (state.phase !== 'GAME_STARTING') throw new Error('La partida ya ha comenzado.');
    const withType = newChain(state, context); return activateTurn(withType, withType.turnOrder[0]!, context);
  },
  handleAction(state, playerId, action, context): GameActionResult<TypeChainState> {
    if (state.phase !== 'TURN_ACTIVE') return { state, accepted: false, error: 'No hay un turno activo.' };
    if (state.currentPlayerId !== playerId) return { state, accepted: false, error: 'No es tu turno.' };
    if (!state.activePlayerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'Ya no participas en esta cadena.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state, accepted: false, error: 'El turno ha terminado.' };
    if (cooldownRemainingMs(context.now, state.cooldownUntil[playerId]) > 0) return { state, accepted: false, error: cooldownMessage(context.now, state.cooldownUntil[playerId]) };
    const candidate = context.pokemon.byId(action.pokemonId); if (!candidate) return { state, accepted: false, error: 'Pokémon desconocido.' };
    if (!state.poolIds.includes(candidate.id)) return { state: invalidAttempt(state, playerId, candidate, 'OUT_OF_POOL', context), accepted: true };
    if (state.usedPokemonIds.includes(candidate.id)) return { state: invalidAttempt(state, playerId, candidate, 'ALREADY_USED', context), accepted: true };
    const chainType = state.chainType; if (!chainType) return { state, accepted: false, error: 'La cadena no tiene tipo.' };
    if (!hasTypeChainType(candidate, chainType)) return { state: invalidAttempt(state, playerId, candidate, 'WRONG_TYPE', context), accepted: true };
    const stats = state.playerStats[playerId] ?? emptyTypeChainStats(); const named = pokemonView(candidate); const completedTurns = state.completedTurns + 1;
    const successful: TypeChainState = {
      ...state, chain: [...state.chain, { pokemon: named, playedBy: playerId, turnNumber: state.turnNumber }], usedPokemonIds: [...state.usedPokemonIds, candidate.id], longestChain: Math.max(state.longestChain, state.chain.length + 1), completedTurns,
      cooldownUntil: { ...state.cooldownUntil, [playerId]: 0 }, events: appendEvent(state.events, { kind: 'SUCCESS', playerId, pokemon: named, chainType, at: context.now }),
      playerStats: { ...state.playerStats, [playerId]: { ...stats, validSubmissions: stats.validSubmissions + 1, turnsSurvived: stats.turnsSurvived + 1 } },
    };
    if (completedTurns >= TYPE_CHAIN_MAX_TURNS) return { state: finish(successful, 'MAX_TURNS'), accepted: true };
    const nextId = nextActivePlayer(successful, playerId); return { state: activateTurn(successful, nextId!, context), accepted: true };
  },
  handleTimeout(state, context) {
    if (state.phase !== 'TURN_ACTIVE' || context.now < (state.roundEndsAt ?? Infinity) || !state.currentPlayerId) return state;
    const eliminatedId = state.currentPlayerId; const eliminated = eliminateOnly(state, eliminatedId, 'TIMEOUT', context);
    if (eliminated.activePlayerIds.length <= 1) return finish(eliminated, 'SURVIVOR');
    return activateTurn(eliminated, nextActivePlayer(eliminated, eliminatedId)!, context);
  },
  handlePresenceChange(state, context) {
    if (state.phase !== 'TURN_ACTIVE' || !state.currentPlayerId || isPlayerRequired(context, state.currentPlayerId)) return state;
    const eliminatedId = state.currentPlayerId; const eliminated = eliminateOnly(state, eliminatedId, 'DISCONNECTED', context);
    if (eliminated.activePlayerIds.length <= 1) return finish(eliminated, 'SURVIVOR');
    return activateTurn(eliminated, nextActivePlayer(eliminated, eliminatedId)!, context);
  },
  getPublicState(state) {
    return {
      gameId: 'type-chain', phase: state.phase, turnOrder: state.turnOrder, activePlayerIds: state.activePlayerIds, eliminatedPlayerIds: state.eliminations.map((entry) => entry.playerId),
      currentPlayerId: state.currentPlayerId, nextPlayerId: state.currentPlayerId ? nextActivePlayer(state, state.currentPlayerId) : null, turnNumber: state.turnNumber, chainNumber: state.chainNumber,
      chainType: state.chainType, chain: state.chain, usedPokemonIds: state.usedPokemonIds, longestChain: Math.max(state.longestChain, state.chain.length),
      namedCounts: Object.fromEntries(state.playerIds.map((id) => [id, state.playerStats[id]?.validSubmissions ?? 0])), turnStartedAt: state.turnStartedAt, roundEndsAt: state.roundEndsAt,
      invalidAttempts: state.invalidAttempts, eliminations: state.eliminations, events: state.events, results: state.phase === 'GAME_RESULTS' ? buildTypeChainResults(state) : null,
    };
  },
  getPlayerState(state, playerId, context): TypeChainPlayerState {
    const eliminated = state.spectatorIds.includes(playerId);
    return { canSubmit: state.phase === 'TURN_ACTIVE' && state.currentPlayerId === playerId && !eliminated && isPlayerRequired(context, playerId), isCurrentPlayer: state.currentPlayerId === playerId, eliminated, cooldownUntil: state.cooldownUntil[playerId] ?? null, lastAttempt: state.lastAttempt[playerId] ?? null };
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; }, getResults(state) { return buildTypeChainResults(state); },
};
