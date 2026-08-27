import { pointsForPosition } from '../../scoring.js';
import type { Pokemon } from '../../pokemon/types.js';
import { isPlayerRequired, type GameContext, type GameResults, type MiniGameModule } from '../contracts.js';
import { cooldownRemainingMs, setPlayerCooldown } from '../infrastructure/timing.js';
import { activeBingoFamilies, defaultPokemonBingoConfig, pokemonBingoConfigSchema, type PokemonBingoConfig } from './config.js';
import { buildBingoConditionTemplates, generateBingoBoard } from './generator.js';
import { describeBingoCondition, hasCompleteBingoMetadata, pokemonMatchesBingoCell } from './rules.js';
import { pokemonBingoActionSchema, type BingoBoardState, type BingoPrivateAttempt, type BingoPublicBoard, type PokemonBingoAction, type PokemonBingoPlayerState, type PokemonBingoPublicState, type PokemonBingoState } from './types.js';

export const BINGO_INCORRECT_COOLDOWN_MS = 1_000;
export const BINGO_REVEAL_MS = 8_000;
const pokemonView = (pokemon: Pokemon) => ({ id: pokemon.id, name: pokemon.name, sprite: pokemon.sprite });
const completedCells = (board: BingoBoardState) => Object.keys(board.assignments).length;

const manifest = {
  id: 'pokemon-bingo', name: 'Pokémon Bingo', icon: '🎉',
  description: 'Completa antes que nadie un tablero de condiciones con Pokémon distintos.', minPlayers: 1, maxPlayers: 8,
  profileStats: {
    metrics: [
      { key: 'games', label: 'Partidas registradas', aggregation: 'SUM' as const },
      { key: 'bingos', label: 'Bingos', aggregation: 'SUM' as const },
      { key: 'cellsCompleted', label: 'Casillas completadas', aggregation: 'SUM' as const },
      { key: 'cellsTotal', label: 'Casillas totales', aggregation: 'SUM' as const },
      { key: 'correctAssignments', label: 'Pokémon correctos', aggregation: 'SUM' as const },
      { key: 'incorrectAttempts', label: 'Pokémon incorrectos', aggregation: 'SUM' as const },
      { key: 'bestBingoTimeMs', label: 'Mejor tiempo de Bingo', aggregation: 'MIN' as const, format: 'DURATION_MS' as const },
    ],
    derivedMetrics: [
      { key: 'completionRate', label: 'Tablero completado', kind: 'PERCENT' as const, numerator: 'cellsCompleted', denominator: ['cellsTotal'] },
      { key: 'bingoRate', label: 'Bingos por partida', kind: 'PERCENT' as const, numerator: 'bingos', denominator: ['games'] },
    ],
  },
};

function finish(state: PokemonBingoState): PokemonBingoState { return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, nextTransitionAt: null }; }
function findCell(board: BingoBoardState, cellId: string) { return board.cells.find((cell) => cell.id === cellId); }
function assignedCell(board: BingoBoardState, pokemonId: string): string | undefined { return Object.entries(board.assignments).find(([, assigned]) => assigned === pokemonId)?.[0]; }

function privateAttempt(state: PokemonBingoState, playerId: string, attempt: BingoPrivateAttempt, cooldown = false): PokemonBingoState {
  return { ...state, lastAttempts: { ...state.lastAttempts, [playerId]: attempt }, ...(cooldown ? { cooldownUntil: setPlayerCooldown(state.cooldownUntil, playerId, attempt.attemptedAt, BINGO_INCORRECT_COOLDOWN_MS) } : {}) };
}

function finishIfBingo(state: PokemonBingoState, playerId: string, context: GameContext): PokemonBingoState {
  const board = state.boards[playerId]!; if (completedCells(board) !== board.cells.length) return state;
  return { ...state, phase: 'ROUND_RESULTS', winnerId: playerId, bingoAt: context.now, roundEndsAt: null, nextTransitionAt: context.now + BINGO_REVEAL_MS };
}

function validAssignmentState(state: PokemonBingoState, playerId: string, board: BingoBoardState, pokemon: Pokemon, cellId: string, context: GameContext): PokemonBingoState {
  const priorStats = state.playerStats[playerId]!;
  const next = privateAttempt({
    ...state,
    boards: { ...state.boards, [playerId]: board },
    playerStats: { ...state.playerStats, [playerId]: { ...priorStats, correctAssignments: priorStats.correctAssignments + 1 } },
    cooldownUntil: { ...state.cooldownUntil, [playerId]: 0 },
  }, playerId, { cellId, pokemonId: pokemon.id, pokemonName: pokemon.name, attemptedAt: context.now, correct: true, message: `${pokemon.name} colocado correctamente.` });
  return finishIfBingo(next, playerId, context);
}

function bingoRanking(state: PokemonBingoState): string[] {
  const playerOrder = new Map(state.playerIds.map((id, index) => [id, index]));
  return [...state.playerIds].sort((left, right) => {
    if (left === state.winnerId) return -1; if (right === state.winnerId) return 1;
    const a = state.boards[left]!; const b = state.boards[right]!;
    return completedCells(b) - completedCells(a) || a.lastProgressAt - b.lastProgressAt || playerOrder.get(left)! - playerOrder.get(right)!;
  });
}

export function buildPokemonBingoResults(state: PokemonBingoState): GameResults {
  const ordered = bingoRanking(state);
  return { winnerId: state.winnerId, standings: ordered.map((playerId, index) => {
    const board = state.boards[playerId]!; const playerStats = state.playerStats[playerId]!; const bingo = playerId === state.winnerId;
    return { playerId, position: index + 1, points: pointsForPosition(ordered.length, index + 1), won: bingo, stats: {
      games: 1, bingos: bingo ? 1 : 0, cellsCompleted: completedCells(board), cellsTotal: board.cells.length,
      correctAssignments: playerStats.correctAssignments, incorrectAttempts: playerStats.incorrectAttempts,
      bestBingoTimeMs: bingo && state.bingoAt ? state.bingoAt - state.gameStartedAt : 0,
    } };
  }) };
}

function publicBoard(state: PokemonBingoState, playerId: string, context: GameContext): BingoPublicBoard {
  const board = state.boards[playerId]!; const revealSolutions = state.phase === 'GAME_RESULTS';
  return {
    playerId, completed: completedCells(board), total: board.cells.length, lastProgressAt: board.lastProgressAt,
    cells: board.cells.map((cell) => {
      const assigned = context.pokemon.byId(board.assignments[cell.id] ?? '');
      const possibleSolutions = revealSolutions && !assigned
        ? state.poolIds.map((id) => context.pokemon.byId(id)!).filter((pokemon) => pokemonMatchesBingoCell(pokemon, cell)).slice(0, 3).map(pokemonView)
        : [];
      return { ...cell, assignment: assigned ? pokemonView(assigned) : null, possibleSolutions };
    }),
  };
}

export const pokemonBingoGame: MiniGameModule<PokemonBingoConfig, PokemonBingoState, PokemonBingoAction, PokemonBingoPublicState> = {
  manifest, configSchema: pokemonBingoConfigSchema, actionSchema: pokemonBingoActionSchema, defaultConfig: defaultPokemonBingoConfig,
  createInitialState(config, context) {
    const parsed = pokemonBingoConfigSchema.parse(config); if (activeBingoFamilies(parsed).length === 0) throw new Error('Selecciona al menos una familia de condiciones.');
    if (context.players.length < manifest.minPlayers) throw new Error(`Se necesitan al menos ${manifest.minPlayers} jugadores.`);
    const cellCount = parsed.width * parsed.height;
    const pool = context.pokemon.forGenerations(parsed.generations).filter((pokemon) => hasCompleteBingoMetadata(pokemon, parsed));
    if (pool.length < cellCount) throw new Error(`No se puede generar un tablero ${parsed.width}×${parsed.height}: el pool solo contiene ${pool.length} Pokémon válidos.`);
    const templates = buildBingoConditionTemplates(pool, parsed, context.random); const signatures = new Set<string>(); const boards: Record<string, BingoBoardState> = {};
    context.players.forEach((player, index) => {
      const generated = generateBingoBoard(templates, pool, parsed.width, parsed.height, context.random, signatures, index * 97);
      signatures.add(generated.signature); boards[player.id] = { cells: generated.cells, assignments: {}, solutionPokemonIds: generated.solutionPokemonIds, lastProgressAt: context.now };
    });
    const playerIds = context.players.map((player) => player.id);
    return { phase: 'GAME_STARTING', config: parsed, playerIds, poolIds: pool.map((pokemon) => pokemon.id), boards,
      playerStats: Object.fromEntries(playerIds.map((id) => [id, { correctAssignments: 0, incorrectAttempts: 0 }])), cooldownUntil: {}, lastAttempts: {},
      winnerId: null, bingoAt: null, gameStartedAt: context.now, roundEndsAt: null, nextTransitionAt: null };
  },
  start(state, context) { return { ...state, phase: 'ROUND_ACTIVE', gameStartedAt: context.now, roundEndsAt: context.now + state.config.durationSeconds * 1_000 }; },
  handleAction(state, playerId, action, context) {
    if (action.type === 'SKIP_RESULTS') {
      if (state.phase !== 'ROUND_RESULTS') return { state, accepted: false, error: 'El resultado todavía no se puede saltar.' };
      if (!context.hostId || playerId !== context.hostId) return { state, accepted: false, error: 'Solo el host puede continuar.' };
      return { state: finish(state), accepted: true };
    }
    if (state.phase !== 'ROUND_ACTIVE') return { state, accepted: false, error: 'La partida ya ha terminado.' };
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'No puedes modificar este tablero.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state: finish(state), accepted: false, error: 'El tiempo ha terminado.' };
    const board = state.boards[playerId]!;
    if (action.type === 'REMOVE_POKEMON') {
      if (!findCell(board, action.cellId)) return { state, accepted: false, error: 'Casilla desconocida.' };
      if (!board.assignments[action.cellId]) return { state, accepted: false, error: 'La casilla ya está vacía.' };
      const assignments = { ...board.assignments }; delete assignments[action.cellId];
      return { state: { ...state, boards: { ...state.boards, [playerId]: { ...board, assignments, lastProgressAt: context.now } } }, accepted: true };
    }
    if (cooldownRemainingMs(context.now, state.cooldownUntil[playerId]) > 0) return { state, accepted: false, error: 'Espera un momento antes de confirmar otro Pokémon.' };
    if (action.type === 'MOVE_POKEMON') {
      if (action.fromCellId === action.toCellId) return { state, accepted: false, error: 'Selecciona otra casilla de destino.' };
      const target = findCell(board, action.toCellId); const pokemonId = board.assignments[action.fromCellId]; const pokemon = pokemonId ? context.pokemon.byId(pokemonId) : undefined;
      if (!findCell(board, action.fromCellId) || !target || !pokemon) return { state, accepted: false, error: 'Movimiento inválido.' };
      if (!pokemonMatchesBingoCell(pokemon, target)) {
        const priorStats = state.playerStats[playerId]!;
        const attempt = { cellId: target.id, pokemonId: pokemon.id, pokemonName: pokemon.name, attemptedAt: context.now, correct: false, message: `❌ ${pokemon.name} no cumple la casilla de destino.` };
        const next = privateAttempt({ ...state, playerStats: { ...state.playerStats, [playerId]: { ...priorStats, incorrectAttempts: priorStats.incorrectAttempts + 1 } } }, playerId, attempt, true);
        return { state: next, accepted: true };
      }
      const assignments = { ...board.assignments }; delete assignments[action.fromCellId]; assignments[action.toCellId] = pokemon.id;
      const nextBoard = { ...board, assignments, lastProgressAt: context.now };
      return { state: validAssignmentState(state, playerId, nextBoard, pokemon, action.toCellId, context), accepted: true };
    }
    const cell = findCell(board, action.cellId); const pokemon = context.pokemon.byId(action.pokemonId);
    if (!cell || !pokemon || !state.poolIds.includes(pokemon.id)) return { state, accepted: false, error: 'Pokémon o casilla fuera del pool configurado.' };
    if (!pokemonMatchesBingoCell(pokemon, cell)) {
      const priorStats = state.playerStats[playerId]!;
      const attempt = { cellId: cell.id, pokemonId: pokemon.id, pokemonName: pokemon.name, attemptedAt: context.now, correct: false, message: `❌ ${pokemon.name} no cumple esta casilla.` };
      const next = privateAttempt({ ...state, playerStats: { ...state.playerStats, [playerId]: { ...priorStats, incorrectAttempts: priorStats.incorrectAttempts + 1 } } }, playerId, attempt, true);
      return { state: next, accepted: true };
    }
    const existingCell = assignedCell(board, pokemon.id);
    if (existingCell && existingCell !== cell.id && !action.moveExisting) {
      const source = findCell(board, existingCell)!;
      return { state, accepted: false, error: `${pokemon.name} ya está usado en “${source.conditions.map(describeBingoCondition).join(' + ')}”. Confirma para moverlo.` };
    }
    if (existingCell === cell.id) return { state, accepted: true };
    const assignments = { ...board.assignments }; if (existingCell) delete assignments[existingCell]; assignments[cell.id] = pokemon.id;
    const nextBoard = { ...board, assignments, lastProgressAt: context.now };
    return { state: validAssignmentState(state, playerId, nextBoard, pokemon, cell.id, context), accepted: true };
  },
  handleTimeout(state, context) {
    if (state.phase === 'ROUND_ACTIVE' && context.now >= (state.roundEndsAt ?? Infinity)) return finish(state);
    if (state.phase === 'ROUND_RESULTS' && context.now >= (state.nextTransitionAt ?? Infinity)) return finish(state);
    return state;
  },
  getPublicState(state, context) { return { gameId: 'pokemon-bingo', phase: state.phase, width: state.config.width, height: state.config.height, roundEndsAt: state.roundEndsAt, nextTransitionAt: state.nextTransitionAt, winnerId: state.winnerId, bingoAt: state.bingoAt, boards: Object.fromEntries(state.playerIds.map((id) => [id, publicBoard(state, id, context)])), results: state.phase === 'GAME_RESULTS' ? buildPokemonBingoResults(state) : null }; },
  getPlayerState(state, playerId, context): PokemonBingoPlayerState { return { canAct: state.phase === 'ROUND_ACTIVE' && state.playerIds.includes(playerId) && isPlayerRequired(context, playerId), cooldownUntil: state.cooldownUntil[playerId] ?? null, lastAttempt: state.lastAttempts[playerId] ?? null }; },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildPokemonBingoResults(state); },
};
