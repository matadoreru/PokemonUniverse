import { pointsForPosition } from '../../scoring.js';
import type { Pokemon } from '../../pokemon/types.js';
import { connectedRequiredPlayerIds, isPlayerRequired, type GameContext, type GameResults, type MiniGameModule } from '../contracts.js';
import { advanceTimedRound } from '../infrastructure/timing.js';
import { activePokeddleClues, defaultPokeddleRaceConfig, pokeddleRaceConfigSchema, type PokeddleRaceConfig } from './config.js';
import { buildPokeddleFeedback, hasCompletePokeddleMetadata, shufflePokeddlePool } from './rules.js';
import { pokeddleRaceActionSchema, type PokeddleBoardRow, type PokeddlePublicBoard, type PokeddleRaceAction, type PokeddleRacePlayerState, type PokeddleRacePublicState, type PokeddleRaceState, type PokeddleResultStats } from './types.js';

export const POKEDDLE_REVEAL_MS = 3_000;
const emptyStats = () => ({ roundsParticipated: 0, validGuesses: 0, missedRounds: 0 });
const reveal = (pokemon: Pokemon) => ({ id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite });

const manifest = {
  id: 'pokeddle-race', name: 'Pokédle Race', icon: '🏁',
  description: 'Descubre tu Pokémon secreto mediante pistas comparativas antes que tus rivales.', minPlayers: 2, maxPlayers: 8,
  profileStats: {
    metrics: [
      { key: 'resolved', label: 'Pokémon resueltos', aggregation: 'SUM' as const },
      { key: 'unresolved', label: 'Pokémon no resueltos', aggregation: 'SUM' as const },
      { key: 'totalGuesses', label: 'Intentos totales', aggregation: 'SUM' as const },
      { key: 'guessesToSolveTotal', label: 'Intentos en resoluciones', aggregation: 'SUM' as const },
      { key: 'resolutionRoundsTotal', label: 'Rondas hasta resolver', aggregation: 'SUM' as const },
      { key: 'bestResolutionRounds', label: 'Mejor resolución', aggregation: 'MIN' as const },
      { key: 'bestTimeMs', label: 'Mejor tiempo', aggregation: 'MIN' as const, format: 'DURATION_MS' as const },
      { key: 'missedRounds', label: 'Rondas sin responder', aggregation: 'SUM' as const },
    ],
    derivedMetrics: [
      { key: 'solveRate', label: 'Porcentaje de resolución', kind: 'PERCENT' as const, numerator: 'resolved', denominator: ['resolved', 'unresolved'] },
      { key: 'averageGuesses', label: 'Intentos medios al resolver', kind: 'AVERAGE' as const, numerator: 'guessesToSolveTotal', denominator: ['resolved'] },
      { key: 'averageSolveRound', label: 'Ronda media de resolución', kind: 'AVERAGE' as const, numerator: 'resolutionRoundsTotal', denominator: ['resolved'] },
    ],
  },
};

function eligibleUnsolved(state: PokeddleRaceState): string[] { return state.playerIds.filter((id) => !state.solved[id]); }
function allRequiredGuessed(state: PokeddleRaceState, context: GameContext): boolean {
  return connectedRequiredPlayerIds(context, eligibleUnsolved(state)).every((id) => Boolean(state.currentGuesses[id]));
}
function beginRound(state: PokeddleRaceState, context: GameContext): PokeddleRaceState {
  return { ...state, phase: 'ROUND_ACTIVE', roundNumber: state.roundNumber + 1, currentGuesses: {}, roundStartedAt: context.now, roundEndsAt: context.now + state.config.roundSeconds * 1_000, nextTransitionAt: null };
}
function isRaceComplete(state: PokeddleRaceState): boolean { return eligibleUnsolved(state).length === 0 || state.roundNumber >= state.config.maxRounds; }
function finish(state: PokeddleRaceState): PokeddleRaceState { return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }; }

function resolveRound(state: PokeddleRaceState, context: GameContext): PokeddleRaceState {
  if (state.phase !== 'ROUND_ACTIVE') return state;
  const boards = Object.fromEntries(Object.entries(state.boards).map(([id, rows]) => [id, [...rows]]));
  const solved = { ...state.solved }; const playerStats = { ...state.playerStats };
  for (const playerId of eligibleUnsolved(state)) {
    const prior = state.playerStats[playerId]!; const stats = { ...prior, roundsParticipated: prior.roundsParticipated + 1 };
    const answer = state.currentGuesses[playerId]; let row: PokeddleBoardRow;
    if (!answer) {
      stats.missedRounds += 1;
      row = { round: state.roundNumber, status: 'NO_GUESS', guessedPokemon: null, feedback: null, correct: false, submittedAt: null };
    } else {
      const guess = context.pokemon.byId(answer.pokemonId)!; const secret = context.pokemon.byId(state.secretPokemonIds[playerId]!)!;
      stats.validGuesses += 1; const correct = guess.id === secret.id;
      row = { round: state.roundNumber, status: 'GUESS', guessedPokemon: reveal(guess), feedback: buildPokeddleFeedback(guess, secret, state.config), correct, submittedAt: answer.submittedAt };
      if (correct) solved[playerId] = { round: state.roundNumber, validGuesses: stats.validGuesses, solvedAt: answer.submittedAt };
    }
    boards[playerId]!.push(row); playerStats[playerId] = stats;
  }
  return { ...state, phase: 'ROUND_RESULTS', boards, solved, playerStats, roundEndsAt: null, nextTransitionAt: context.now + POKEDDLE_REVEAL_MS };
}

function ranking(state: PokeddleRaceState): string[] {
  const order = new Map(state.playerIds.map((id, index) => [id, index]));
  return [...state.playerIds].sort((left, right) => {
    const a = state.solved[left]; const b = state.solved[right];
    if (a && !b) return -1; if (!a && b) return 1;
    if (a && b) return a.round - b.round || a.validGuesses - b.validGuesses || a.solvedAt - b.solvedAt || order.get(left)! - order.get(right)!;
    const aStats = state.playerStats[left]!; const bStats = state.playerStats[right]!;
    return bStats.validGuesses - aStats.validGuesses || aStats.missedRounds - bStats.missedRounds || order.get(left)! - order.get(right)!;
  });
}

export function buildPokeddleResults(state: PokeddleRaceState): GameResults {
  const ordered = ranking(state); const firstSolved = ordered.find((id) => state.solved[id]);
  return {
    winnerId: firstSolved ?? null,
    standings: ordered.map((playerId, index) => {
      const solve = state.solved[playerId]; const stats = state.playerStats[playerId]!; const resolved = Boolean(solve);
      const resultStats: PokeddleResultStats = {
        resolved: resolved ? 1 : 0, unresolved: resolved ? 0 : 1,
        totalGuesses: stats.validGuesses, guessesToSolveTotal: solve?.validGuesses ?? 0,
        resolutionRoundsTotal: solve?.round ?? 0, bestResolutionRounds: solve?.round ?? 0,
        bestTimeMs: solve ? solve.solvedAt - state.gameStartedAt : 0,
        missedRounds: stats.missedRounds, roundsParticipated: stats.roundsParticipated,
      };
      return { playerId, position: index + 1, points: resolved ? pointsForPosition(ordered.length, index + 1) : 0, won: playerId === firstSolved, stats: resultStats };
    }),
  };
}

function publicBoard(state: PokeddleRaceState, playerId: string, context: GameContext): PokeddlePublicBoard {
  const solve = state.solved[playerId]; const mayReveal = Boolean(solve) || state.phase === 'GAME_RESULTS';
  const secret = mayReveal ? context.pokemon.byId(state.secretPokemonIds[playerId]!) : undefined;
  const stats = state.playerStats[playerId]!;
  return { playerId, rows: state.boards[playerId]!, solved: Boolean(solve), solvedRound: solve?.round ?? null, solvedAt: solve?.solvedAt ?? null, validGuesses: stats.validGuesses, missedRounds: stats.missedRounds, revealedPokemon: secret ? reveal(secret) : null };
}

export const pokeddleRaceGame: MiniGameModule<PokeddleRaceConfig, PokeddleRaceState, PokeddleRaceAction, PokeddleRacePublicState> = {
  manifest, configSchema: pokeddleRaceConfigSchema, actionSchema: pokeddleRaceActionSchema, defaultConfig: defaultPokeddleRaceConfig,
  createInitialState(config, context) {
    const parsed = pokeddleRaceConfigSchema.parse(config);
    if (context.players.length < manifest.minPlayers) throw new Error(`Se necesitan al menos ${manifest.minPlayers} jugadores.`);
    if (activePokeddleClues(parsed).length === 0) throw new Error('Selecciona al menos una pista.');
    const pool = context.pokemon.forGenerations(parsed.generations).filter((pokemon) => hasCompletePokeddleMetadata(pokemon, parsed));
    if (!pool.length) throw new Error('No hay Pokémon con datos completos para esta configuración.');
    const shuffled = shufflePokeddlePool(pool, context.random);
    const playerIds = context.players.map((player) => player.id);
    const secrets = Object.fromEntries(playerIds.map((id, index) => [id, shuffled[index % shuffled.length]!.id]));
    return {
      phase: 'GAME_STARTING', config: parsed, playerIds, poolIds: pool.map((pokemon) => pokemon.id), secretPokemonIds: secrets,
      roundNumber: 0, currentGuesses: {}, boards: Object.fromEntries(playerIds.map((id) => [id, []])), solved: {},
      playerStats: Object.fromEntries(playerIds.map((id) => [id, emptyStats()])), gameStartedAt: context.now,
      roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null,
    };
  },
  start(state, context) { return beginRound(state, context); },
  handleAction(state, playerId, action, context) {
    if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'No hay una ronda activa.' };
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'No puedes participar en esta ronda.' };
    if (state.solved[playerId]) return { state, accepted: false, error: 'Ya has encontrado tu Pokémon.' };
    if (state.currentGuesses[playerId]) return { state, accepted: false, error: 'Ya has respondido en esta ronda.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state: resolveRound(state, context), accepted: false, error: 'El tiempo ha terminado.' };
    const pokemon = context.pokemon.byId(action.pokemonId);
    if (!pokemon || !state.poolIds.includes(pokemon.id)) return { state, accepted: false, error: 'Ese Pokémon no pertenece al pool configurado.' };
    let next = { ...state, currentGuesses: { ...state.currentGuesses, [playerId]: { pokemonId: pokemon.id, submittedAt: context.now } } };
    if (allRequiredGuessed(next, context)) next = resolveRound(next, context);
    return { state: next, accepted: true };
  },
  handleTimeout(state, context) { return advanceTimedRound(state, context, { beginNext: beginRound, resolveActive: resolveRound, finish, isComplete: isRaceComplete }); },
  handlePresenceChange(state, context) { return state.phase === 'ROUND_ACTIVE' && allRequiredGuessed(state, context) ? resolveRound(state, context) : state; },
  getPublicState(state, context) {
    return {
      gameId: 'pokeddle-race', phase: state.phase, roundNumber: state.roundNumber, maxRounds: state.config.maxRounds,
      roundStartedAt: state.roundStartedAt, roundEndsAt: state.roundEndsAt, nextTransitionAt: state.nextTransitionAt,
      answeredPlayerIds: Object.keys(state.currentGuesses), activePlayerIds: eligibleUnsolved(state),
      boards: Object.fromEntries(state.playerIds.map((id) => [id, publicBoard(state, id, context)])),
      enabledClues: activePokeddleClues(state.config), results: state.phase === 'GAME_RESULTS' ? buildPokeddleResults(state) : null,
    };
  },
  getPlayerState(state, playerId, context): PokeddleRacePlayerState {
    return { canGuess: state.phase === 'ROUND_ACTIVE' && state.playerIds.includes(playerId) && isPlayerRequired(context, playerId) && !state.solved[playerId] && !state.currentGuesses[playerId], hasGuessedThisRound: Boolean(state.currentGuesses[playerId]), solved: Boolean(state.solved[playerId]) };
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildPokeddleResults(state); },
};
