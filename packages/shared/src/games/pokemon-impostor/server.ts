import type { Pokemon } from '../../pokemon/types.js';
import { connectedRequiredPlayerIds, isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { resolveWhenRequiredPlayersComplete } from '../infrastructure/timing.js';
import { defaultPokemonImpostorConfig, pokemonImpostorConfigSchema, type PokemonImpostorConfig } from './config.js';
import { buildPokemonImpostorResults, impostorWinner } from './rules.js';
import {
  pokemonImpostorActionSchema,
  type ImpostorClue,
  type ImpostorPlayerStats,
  type ImpostorRole,
  type ImpostorVoteResult,
  type PokemonImpostorAction,
  type PokemonImpostorPlayerState,
  type PokemonImpostorPublicState,
  type PokemonImpostorState,
} from './types.js';

const ROLE_REVEAL_MS = 5_000;
const VOTE_RESULTS_MS = 3_000;
const ELIMINATION_MS = 4_000;
const manifest = {
  id: 'pokemon-impostor',
  name: 'Pokémon Impostor',
  icon: '🕵️',
  description: 'Da pistas, detecta a quienes no conocen el Pokémon y expulsa a los impostores.',
  minPlayers: 3,
  profileStats: {
    metrics: [
      { key: 'playedAsInnocent', label: 'Como inocente', aggregation: 'SUM' },
      { key: 'wonAsInnocent', label: 'Victorias de inocente', aggregation: 'SUM' },
      { key: 'playedAsImpostor', label: 'Como impostor', aggregation: 'SUM' },
      { key: 'wonAsImpostor', label: 'Victorias de impostor', aggregation: 'SUM' },
      { key: 'pokemonGuessed', label: 'Pokémon adivinados', aggregation: 'SUM' },
      { key: 'cluesSubmitted', label: 'Pistas enviadas', aggregation: 'SUM' },
    ],
    derivedMetrics: [
      { key: 'innocentWinRate', label: 'Winrate inocente', kind: 'PERCENT', numerator: 'wonAsInnocent', denominator: ['playedAsInnocent'] },
      { key: 'impostorWinRate', label: 'Winrate impostor', kind: 'PERCENT', numerator: 'wonAsImpostor', denominator: ['playedAsImpostor'] },
    ],
  },
} as const;

function takeRandom<T>(source: readonly T[], count: number, random: () => number): T[] {
  const pool = [...source];
  const selected: T[] = [];
  while (selected.length < count && pool.length > 0) {
    const index = Math.min(Math.floor(random() * pool.length), pool.length - 1);
    selected.push(pool.splice(index, 1)[0]!);
  }
  return selected;
}

function choosePokemon(config: PokemonImpostorConfig, context: GameContext): Pokemon {
  const pool = context.pokemon.forGenerations(config.generations);
  if (pool.length === 0) throw new Error('Las generaciones seleccionadas no contienen Pokémon.');
  return pool[Math.min(Math.floor(context.random() * pool.length), pool.length - 1)]!;
}

function beginCluePhase(state: PokemonImpostorState, context: GameContext): PokemonImpostorState {
  const roundNumber = state.roundNumber + 1;
  const connectedAliveIds = connectedRequiredPlayerIds(context, state.aliveIds);
  let clueOrder = takeRandom(connectedAliveIds, connectedAliveIds.length, context.random);
  if (clueOrder.length > 1 && clueOrder.every((id, index) => id === state.clueOrder[index])) {
    clueOrder = [...clueOrder.slice(1), clueOrder[0]!];
  }
  return {
    ...state,
    phase: 'CLUE_PHASE',
    roundNumber,
    clues: { ...state.clues, [roundNumber]: {} },
    clueOrder,
    currentClueTurnIndex: 0,
    votes: {},
    voteCandidateIds: [...state.aliveIds],
    votingRound: 0,
    roundStartedAt: context.now,
    roundEndsAt: clueOrder.length > 0 ? context.now + state.config.clueSeconds * 1_000 : null,
    nextTransitionAt: null,
    lastVoteResult: null,
    eliminationReveal: null,
  };
}

function advanceClueTurn(
  state: PokemonImpostorState,
  context: GameContext,
  skippedStatus?: 'TIMEOUT' | 'DISCONNECTED',
): PokemonImpostorState {
  const roundClues = { ...(state.clues[state.roundNumber] ?? {}) };
  const currentId = state.clueOrder[state.currentClueTurnIndex];
  if (currentId && skippedStatus && roundClues[currentId] === undefined) {
    roundClues[currentId] = { text: null, submittedAt: null, status: skippedStatus };
  }
  let nextIndex = state.currentClueTurnIndex + 1;
  while (nextIndex < state.clueOrder.length) {
    const nextId = state.clueOrder[nextIndex]!;
    if (isPlayerRequired(context, nextId)) break;
    if (roundClues[nextId] === undefined) roundClues[nextId] = { text: null, submittedAt: null, status: 'DISCONNECTED' };
    nextIndex += 1;
  }
  const next = {
    ...state,
    clues: { ...state.clues, [state.roundNumber]: roundClues },
    currentClueTurnIndex: nextIndex,
  };
  if (nextIndex >= state.clueOrder.length) return beginVoting(next, context);
  return {
    ...next,
    roundStartedAt: context.now,
    roundEndsAt: context.now + state.config.clueSeconds * 1_000,
  };
}

function beginVoting(state: PokemonImpostorState, context: GameContext, candidateIds = state.aliveIds): PokemonImpostorState {
  return {
    ...state,
    phase: 'VOTING',
    votes: {},
    voteCandidateIds: [...candidateIds],
    votingRound: state.votingRound + 1,
    roundStartedAt: context.now,
    roundEndsAt: context.now + state.config.voteSeconds * 1_000,
    nextTransitionAt: null,
    lastVoteResult: null,
  };
}

function resolveVoting(state: PokemonImpostorState, context: GameContext): PokemonImpostorState {
  if (state.phase !== 'VOTING') return state;
  const tallies = Object.fromEntries(state.voteCandidateIds.map((id) => [id, 0]));
  for (const vote of Object.values(state.votes)) tallies[vote.targetId] = (tallies[vote.targetId] ?? 0) + 1;
  const maximum = Math.max(...Object.values(tallies));
  const tiedIds = state.voteCandidateIds.filter((id) => tallies[id] === maximum);
  const result: ImpostorVoteResult = {
    kind: tiedIds.length > 1 ? 'TIE' : 'ELIMINATION',
    votes: { ...state.votes },
    tallies,
    tiedIds: tiedIds.length > 1 ? tiedIds : [],
    eliminatedId: tiedIds.length === 1 ? tiedIds[0]! : null,
  };
  return { ...state, phase: 'VOTE_RESULTS', roundEndsAt: null, nextTransitionAt: context.now + VOTE_RESULTS_MS, lastVoteResult: result };
}

function beginElimination(state: PokemonImpostorState, context: GameContext): PokemonImpostorState {
  const playerId = state.lastVoteResult?.eliminatedId;
  if (!playerId) return state;
  const aliveIds = state.aliveIds.filter((id) => id !== playerId);
  const eliminatedIds = [...state.eliminatedIds, playerId];
  return {
    ...state,
    phase: 'ELIMINATION',
    aliveIds,
    eliminatedIds,
    spectatorIds: [...eliminatedIds],
    eliminationReveal: { playerId, role: state.roles[playerId]! },
    winnerTeam: impostorWinner(aliveIds, state.roles),
    roundEndsAt: null,
    nextTransitionAt: context.now + ELIMINATION_MS,
  };
}

function finishGame(state: PokemonImpostorState): PokemonImpostorState {
  return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null };
}

function normalizedClue(value: string): string {
  return value.trim().normalize('NFC');
}

export const pokemonImpostorGame: MiniGameModule<PokemonImpostorConfig, PokemonImpostorState, PokemonImpostorAction, PokemonImpostorPublicState> = {
  manifest,
  configSchema: pokemonImpostorConfigSchema,
  actionSchema: pokemonImpostorActionSchema,
  defaultConfig: defaultPokemonImpostorConfig,

  createInitialState(config, context) {
    const parsed = pokemonImpostorConfigSchema.parse(config);
    if (context.players.length < manifest.minPlayers) throw new Error(`Se necesitan al menos ${manifest.minPlayers} jugadores.`);
    if (parsed.impostorCount * 2 >= context.players.length) throw new Error('Debe haber más inocentes que impostores al comenzar.');
    const secretPokemon = choosePokemon(parsed, context);
    const impostorIds = new Set(takeRandom(context.players.map((player) => player.id), parsed.impostorCount, context.random));
    const roles: Record<string, ImpostorRole> = Object.fromEntries(context.players.map((player) => [player.id, impostorIds.has(player.id) ? 'IMPOSTOR' : 'INNOCENT']));
    const playerStats: Record<string, ImpostorPlayerStats> = Object.fromEntries(context.players.map((player) => [player.id, { cluesSubmitted: 0, votesCast: 0 }]));
    return {
      phase: 'GAME_STARTING', config: parsed, playerIds: context.players.map((player) => player.id), roles,
      secretPokemonId: secretPokemon.id, aliveIds: context.players.map((player) => player.id), eliminatedIds: [], spectatorIds: [],
      roundNumber: 0, clues: {}, clueOrder: [], currentClueTurnIndex: 0, guessAttempts: {}, votes: {}, voteCandidateIds: [], votingRound: 0, roundStartedAt: null,
      roundEndsAt: null, nextTransitionAt: null, lastVoteResult: null, eliminationReveal: null, winnerTeam: null, playerStats,
    };
  },

  start(state, context) {
    if (state.phase !== 'GAME_STARTING') throw new Error('La partida ya ha comenzado.');
    return { ...state, phase: 'ROLE_REVEAL', roundStartedAt: context.now, nextTransitionAt: context.now + ROLE_REVEAL_MS };
  },

  handleAction(state, playerId, action, context): GameActionResult<PokemonImpostorState> {
    if (!state.playerIds.includes(playerId)) return { state, accepted: false, error: 'No participas en esta partida.' };
    if (!state.aliveIds.includes(playerId)) return { state, accepted: false, error: 'Estás observando la partida.' };
    if (!isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'No estás conectado como participante.' };
    if (action.type === 'GUESS_POKEMON') {
      if (state.phase !== 'CLUE_PHASE') return { state, accepted: false, error: 'Solo puedes adivinar durante la fase de pistas.' };
      if (state.roles[playerId] !== 'IMPOSTOR') return { state, accepted: false, error: 'Solo los impostores pueden intentar adivinar.' };
      if (context.now >= (state.roundEndsAt ?? 0)) return { state: advanceClueTurn(state, context, 'TIMEOUT'), accepted: false, error: 'El tiempo para adivinar ha terminado.' };
      if (state.guessAttempts[playerId]) return { state, accepted: false, error: 'Ya has utilizado tu intento.' };
      const pokemon = context.pokemon.byId(action.pokemonId);
      if (!pokemon || !state.config.generations.includes(pokemon.generation)) return { state, accepted: false, error: 'Pokémon fuera del pool configurado.' };
      const correct = pokemon.id === state.secretPokemonId;
      const next: PokemonImpostorState = {
        ...state,
        guessAttempts: { ...state.guessAttempts, [playerId]: { pokemonId: pokemon.id, correct, guessedAt: context.now } },
        winnerTeam: correct ? 'IMPOSTORS' : state.winnerTeam,
        phase: correct ? 'GAME_RESULTS' : state.phase,
        roundEndsAt: correct ? null : state.roundEndsAt,
        nextTransitionAt: correct ? null : state.nextTransitionAt,
      };
      return { state: next, accepted: true };
    }
    if (action.type === 'SUBMIT_CLUE') {
      if (state.phase !== 'CLUE_PHASE') return { state, accepted: false, error: 'No estamos en la fase de pistas.' };
      if (context.now >= (state.roundEndsAt ?? 0)) return { state, accepted: false, error: 'El tiempo para enviar pistas ha terminado.' };
      if (state.clueOrder[state.currentClueTurnIndex] !== playerId) return { state, accepted: false, error: 'No es tu turno de pista.' };
      const roundClues = state.clues[state.roundNumber] ?? {};
      if (roundClues[playerId] !== undefined) return { state, accepted: false, error: 'Tu pista ya está bloqueada.' };
      const text = normalizedClue(action.text);
      if (!text) return { state, accepted: false, error: 'Escribe una pista.' };
      if ([...text].length > 25) return { state, accepted: false, error: 'La pista no puede superar 25 caracteres.' };
      const clue: ImpostorClue = { text, submittedAt: context.now, status: 'SUBMITTED' };
      const stats = state.playerStats[playerId]!;
      const next: PokemonImpostorState = {
        ...state,
        clues: { ...state.clues, [state.roundNumber]: { ...roundClues, [playerId]: clue } },
        playerStats: { ...state.playerStats, [playerId]: { ...stats, cluesSubmitted: stats.cluesSubmitted + 1 } },
      };
      return { state: advanceClueTurn(next, context), accepted: true };
    }

    if (state.phase !== 'VOTING') return { state, accepted: false, error: 'No estamos en la fase de votación.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state, accepted: false, error: 'El tiempo para votar ha terminado.' };
    if (state.votes[playerId]) return { state, accepted: false, error: 'Tu voto ya está bloqueado.' };
    if (action.targetId === playerId) return { state, accepted: false, error: 'No puedes votarte a ti mismo.' };
    if (!state.voteCandidateIds.includes(action.targetId) || !state.aliveIds.includes(action.targetId)) return { state, accepted: false, error: 'Ese jugador no es candidato.' };
    const stats = state.playerStats[playerId]!;
    let next: PokemonImpostorState = {
      ...state,
      votes: { ...state.votes, [playerId]: { targetId: action.targetId, votedAt: context.now } },
      playerStats: { ...state.playerStats, [playerId]: { ...stats, votesCast: stats.votesCast + 1 } },
    };
    next = resolveWhenRequiredPlayersComplete(next, context, next.aliveIds, (id) => Boolean(next.votes[id]), resolveVoting, 'VOTING');
    return { state: next, accepted: true };
  },

  handleTimeout(state, context) {
    if (state.phase === 'ROLE_REVEAL' && context.now >= (state.nextTransitionAt ?? Infinity)) return beginCluePhase(state, context);
    if (state.phase === 'CLUE_PHASE' && context.now >= (state.roundEndsAt ?? Infinity)) return advanceClueTurn(state, context, 'TIMEOUT');
    if (state.phase === 'VOTING' && context.now >= (state.roundEndsAt ?? Infinity)) return resolveVoting(state, context);
    if (state.phase === 'VOTE_RESULTS' && context.now >= (state.nextTransitionAt ?? Infinity)) {
      return state.lastVoteResult?.kind === 'TIE' ? beginVoting(state, context, state.lastVoteResult.tiedIds) : beginElimination(state, context);
    }
    if (state.phase === 'ELIMINATION' && context.now >= (state.nextTransitionAt ?? Infinity)) {
      return state.winnerTeam ? finishGame(state) : beginCluePhase(state, context);
    }
    return state;
  },

  handlePresenceChange(state, context) {
    if (state.phase === 'CLUE_PHASE') {
      if (state.clueOrder.length === 0) {
        const connectedAliveIds = connectedRequiredPlayerIds(context, state.aliveIds);
        if (connectedAliveIds.length > 0) {
          return {
            ...state,
            clueOrder: takeRandom(connectedAliveIds, connectedAliveIds.length, context.random),
            currentClueTurnIndex: 0,
            roundStartedAt: context.now,
            roundEndsAt: context.now + state.config.clueSeconds * 1_000,
          };
        }
      }
      const currentId = state.clueOrder[state.currentClueTurnIndex];
      if (currentId && !isPlayerRequired(context, currentId)) return advanceClueTurn(state, context, 'DISCONNECTED');
    }
    return resolveWhenRequiredPlayersComplete(state, context, state.aliveIds, (id) => Boolean(state.votes[id]), resolveVoting, 'VOTING');
  },

  getPublicState(state) {
    return {
      gameId: 'pokemon-impostor', phase: state.phase, playerIds: state.playerIds, aliveIds: state.aliveIds,
      eliminatedIds: state.eliminatedIds, spectatorIds: state.spectatorIds, roundNumber: state.roundNumber, clues: state.clues,
      clueOrder: state.clueOrder, currentClueTurnIndex: state.currentClueTurnIndex,
      currentCluePlayerId: state.phase === 'CLUE_PHASE' ? state.clueOrder[state.currentClueTurnIndex] ?? null : null,
      cluePendingIds: state.phase === 'CLUE_PHASE' ? state.clueOrder.slice(state.currentClueTurnIndex).filter((id) => state.clues[state.roundNumber]?.[id] === undefined) : [],
      voteCompletedIds: state.phase === 'VOTING' ? Object.keys(state.votes) : [], voteCandidateIds: state.voteCandidateIds,
      votingRound: state.votingRound, roundStartedAt: state.roundStartedAt, roundEndsAt: state.roundEndsAt,
      nextTransitionAt: state.nextTransitionAt, lastVoteResult: state.phase === 'VOTE_RESULTS' || state.phase === 'ELIMINATION' ? state.lastVoteResult : null,
      eliminationReveal: state.phase === 'ELIMINATION' || state.phase === 'GAME_RESULTS' ? state.eliminationReveal : null,
      winnerTeam: state.winnerTeam,
      results: state.phase === 'GAME_RESULTS' ? buildPokemonImpostorResults(state) : null,
    };
  },

  getPlayerState(state, playerId, context): PokemonImpostorPlayerState {
    const role = state.roles[playerId] ?? null;
    const eliminated = state.eliminatedIds.includes(playerId);
    const maySeeSecrets = role === 'INNOCENT' || eliminated || state.phase === 'GAME_RESULTS';
    const pokemon = maySeeSecrets ? context.pokemon.byId(state.secretPokemonId) : undefined;
    return {
      role,
      secretPokemon: pokemon ? { name: pokemon.name, sprite: pokemon.sprite } : null,
      revealedRoles: eliminated || state.phase === 'GAME_RESULTS' ? { ...state.roles } : null,
      alive: state.aliveIds.includes(playerId),
      canSubmitClue: state.phase === 'CLUE_PHASE' && state.aliveIds.includes(playerId) && isPlayerRequired(context, playerId) && state.clueOrder[state.currentClueTurnIndex] === playerId && state.clues[state.roundNumber]?.[playerId] === undefined,
      ownClue: state.clues[state.roundNumber]?.[playerId] ?? null,
      canGuessPokemon: state.phase === 'CLUE_PHASE' && state.aliveIds.includes(playerId) && isPlayerRequired(context, playerId) && role === 'IMPOSTOR' && !state.guessAttempts[playerId],
      guessUsed: Boolean(state.guessAttempts[playerId]),
      guessCorrect: state.guessAttempts[playerId]?.correct ?? null,
      canVote: state.phase === 'VOTING' && state.aliveIds.includes(playerId) && isPlayerRequired(context, playerId) && !state.votes[playerId],
      ownVote: state.votes[playerId] ?? null,
    };
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildPokemonImpostorResults(state); },
};
