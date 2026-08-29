import type { Pokemon } from '../../pokemon/types.js';
import { isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { defaultWhoIsWhoPokemonConfig, whoIsWhoPokemonConfigSchema, type WhoIsWhoPokemonConfig } from './config.js';
import { buildWhoIsWhoResults, WHO_IS_WHO_WIN_POINTS } from './rules.js';
import { whoIsWhoPokemonActionSchema, type WhoIsWhoPokemonAction, type WhoIsWhoPlayerState, type WhoIsWhoPublicState, type WhoIsWhoState, type WhoIsWhoTeam } from './types.js';

const manifest = { id: 'who-is-who-pokemon', name: 'Quién es Quién — Pokémon', icon: '🃏', description: 'Dos equipos se enfrentan para descubrir el Pokémon secreto rival.', minPlayers: 2, profileStats: { metrics: [{ key: 'wins', label: 'Victorias', aggregation: 'SUM' as const }, { key: 'turnsPlayed', label: 'Turnos jugados', aggregation: 'SUM' as const }, { key: 'correctGuesses', label: 'Aciertos', aggregation: 'SUM' as const }, { key: 'incorrectGuesses', label: 'Fallos', aggregation: 'SUM' as const }] } } as const;
const teams: WhoIsWhoTeam[] = ['BLUE', 'RED'];
const card = (pokemon: Pokemon) => ({ id: pokemon.id, nationalDexNumber: pokemon.nationalDexNumber, name: pokemon.name, sprite: pokemon.sprite });
function choose<T>(items: readonly T[], count: number, random: () => number): T[] { const pool = [...items]; const result: T[] = []; while (result.length < count && pool.length) { const index = Math.min(Math.floor(random() * pool.length), pool.length - 1); result.push(pool.splice(index, 1)[0]!); } return result; }
function teamFor(state: WhoIsWhoState, playerId: string): WhoIsWhoTeam | null { return teams.find((team) => state.teams[team].playerIds.includes(playerId)) ?? null; }
function finish(state: WhoIsWhoState, winnerTeam: WhoIsWhoTeam | null): WhoIsWhoState {
  const scores = { ...state.scores }; if (winnerTeam) for (const id of state.teams[winnerTeam].playerIds) scores[id] = (scores[id] ?? 0) + WHO_IS_WHO_WIN_POINTS;
  const playerStats = { ...state.playerStats }; if (winnerTeam) for (const id of state.teams[winnerTeam].playerIds) playerStats[id] = { ...playerStats[id]!, wins: playerStats[id]!.wins + 1 };
  return { ...state, phase: 'GAME_RESULTS', roundEndsAt: null, winnerTeam, scores, playerStats, results: null };
}
function beginNextRound(state: WhoIsWhoState, context: GameContext): WhoIsWhoState {
  return { ...state, currentTeam: 'BLUE', roundNumber: state.roundNumber + 1, turnNumber: state.turnNumber + 1,
    roundStartedAt: context.now, roundEndsAt: context.now + state.config.turnSeconds * 1_000 };
}
function advanceTurn(state: WhoIsWhoState, context: GameContext): WhoIsWhoState {
  if (state.currentTeam === 'RED') { if (state.roundNumber >= state.config.rounds) return finish(state, null); return beginNextRound(state, context); }
  return { ...state, currentTeam: 'RED', turnNumber: state.turnNumber + 1, roundStartedAt: context.now, roundEndsAt: context.now + state.config.turnSeconds * 1_000 };
}
export const whoIsWhoPokemonGame: MiniGameModule<WhoIsWhoPokemonConfig, WhoIsWhoState, WhoIsWhoPokemonAction, WhoIsWhoPublicState> = {
  manifest, configSchema: whoIsWhoPokemonConfigSchema, actionSchema: whoIsWhoPokemonActionSchema, defaultConfig: defaultWhoIsWhoPokemonConfig,
  createInitialState(config, context) {
    const parsed = whoIsWhoPokemonConfigSchema.parse(config); const pool = [...context.pokemon.forGenerations(parsed.generations, { includeForms: parsed.includeForms })];
    if (context.players.length < 2) throw new Error('Se necesitan al menos 2 jugadores.'); if (pool.length < parsed.boardSize) throw new Error(`No hay suficientes Pokémon para un tablero de ${parsed.boardSize}.`);
    const selected = choose(pool, parsed.boardSize, context.random); const shuffledPlayers = choose(context.players, context.players.length, context.random); const blue = shuffledPlayers.filter((_, index) => index % 2 === 0).map((player) => player.id); const red = shuffledPlayers.filter((_, index) => index % 2 === 1).map((player) => player.id);
    const secrets = parsed.secretSelection === 'RANDOM' ? choose(selected, 2, context.random) : [];
    return { phase: 'GAME_STARTING', config: parsed, playerIds: context.players.map((player) => player.id), board: selected.map(card), teams: { BLUE: { playerIds: blue, secretPokemonId: secrets[0]?.id ?? null, discardedPokemonIds: [] }, RED: { playerIds: red, secretPokemonId: secrets[1]?.id ?? null, discardedPokemonIds: [] } }, currentTeam: 'BLUE', roundNumber: 1, turnNumber: 1, roundStartedAt: null, roundEndsAt: null, scores: Object.fromEntries(context.players.map((player) => [player.id, 0])), playerStats: Object.fromEntries(context.players.map((player) => [player.id, { wins: 0, turnsPlayed: 0, correctGuesses: 0, incorrectGuesses: 0 }])), guesses: [], winnerTeam: null, results: null };
  },
  start(state, context) { const ready = teams.every((team) => state.teams[team].secretPokemonId !== null); return { ...state, phase: 'TURN_ACTIVE', roundStartedAt: ready ? context.now : null, roundEndsAt: ready ? context.now + state.config.turnSeconds * 1_000 : null }; },
  handleAction(state, playerId, action, context): GameActionResult<WhoIsWhoState> {
    const team = teamFor(state, playerId); if (!team || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'No puedes actuar en esta partida.' };
    if (state.phase !== 'TURN_ACTIVE') return { state, accepted: false, error: 'La partida no está en un turno activo.' };
    if (action.type === 'SELECT_SECRET') {
      if (state.config.secretSelection !== 'PLAYER_CHOICE') return { state, accepted: false, error: 'Los Pokémon secretos se asignan aleatoriamente.' };
      if (state.teams[team].secretPokemonId) return { state, accepted: false, error: 'Tu equipo ya ha elegido su Pokémon secreto.' };
      if (!state.board.some((pokemon) => pokemon.id === action.pokemonId)) return { state, accepted: false, error: 'Ese Pokémon no está en el tablero.' };
      const next = { ...state, teams: { ...state.teams, [team]: { ...state.teams[team], secretPokemonId: action.pokemonId } } };
      const ready = teams.every((candidate) => next.teams[candidate].secretPokemonId !== null);
      return { state: ready ? { ...next, roundStartedAt: context.now, roundEndsAt: context.now + state.config.turnSeconds * 1_000 } : next, accepted: true };
    }
    if (teams.some((candidate) => state.teams[candidate].secretPokemonId === null)) return { state, accepted: false, error: 'Esperando a que ambos equipos elijan su Pokémon secreto.' };
    if (action.type === 'TOGGLE_DISCARD') { if (!state.board.some((pokemon) => pokemon.id === action.pokemonId)) return { state, accepted: false, error: 'Ese Pokémon no está en el tablero.' }; const current = new Set(state.teams[team].discardedPokemonIds); if (current.has(action.pokemonId)) current.delete(action.pokemonId); else current.add(action.pokemonId); return { state: { ...state, teams: { ...state.teams, [team]: { ...state.teams[team], discardedPokemonIds: [...current] } } }, accepted: true }; }
    if (team !== state.currentTeam) return { state, accepted: false, error: 'Es el turno del otro equipo.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state: advanceTurn(state, context), accepted: false, error: 'El tiempo ha terminado.' };
    if (action.type === 'END_TURN') return { state: advanceTurn(state, context), accepted: true };
    const alreadyGuessed = state.guesses.some((guess) => guess.team === team && guess.turnNumber === state.turnNumber); if (alreadyGuessed) return { state, accepted: false, error: 'Este equipo ya ha intentado adivinar en este turno.' }; const pokemon = state.board.find((entry) => entry.id === action.pokemonId); if (!pokemon) return { state, accepted: false, error: 'Ese Pokémon no está en el tablero.' }; const correct = pokemon.id === state.teams[team === 'BLUE' ? 'RED' : 'BLUE'].secretPokemonId; const guess = { team, playerId, pokemonId: pokemon.id, correct, attemptedAt: context.now, turnNumber: state.turnNumber }; const stats = state.playerStats[playerId]!; const next = { ...state, guesses: [...state.guesses, guess], playerStats: { ...state.playerStats, [playerId]: { ...stats, correctGuesses: stats.correctGuesses + (correct ? 1 : 0), incorrectGuesses: stats.incorrectGuesses + (correct ? 0 : 1), turnsPlayed: stats.turnsPlayed + 1 } } }; return correct ? { state: finish(next, team), accepted: true } : { state: advanceTurn(next, context), accepted: true };
  },
  handleTimeout(state, context) { return state.phase === 'TURN_ACTIVE' && state.roundEndsAt !== null && context.now >= state.roundEndsAt ? advanceTurn(state, context) : state; },
  handlePresenceChange(state, context) { for (const team of teams) if (state.teams[team].playerIds.every((id) => !context.players.some((player) => player.id === id && player.active !== false))) return finish(state, team === 'BLUE' ? 'RED' : 'BLUE'); return state; },
  // The public projection intentionally does not need the player-specific context.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getPublicState(state, context) { const reveal = state.phase === 'GAME_RESULTS'; const revealedSecrets = Object.fromEntries(teams.map((team) => [team, reveal ? state.board.find((pokemon) => pokemon.id === state.teams[team].secretPokemonId) ?? null : null])) as WhoIsWhoPublicState['revealedSecrets']; return { gameId: 'who-is-who-pokemon', phase: state.phase, board: state.board, teams: { BLUE: { playerIds: state.teams.BLUE.playerIds, secretReady: state.teams.BLUE.secretPokemonId !== null }, RED: { playerIds: state.teams.RED.playerIds, secretReady: state.teams.RED.secretPokemonId !== null } }, currentTeam: state.currentTeam, roundNumber: state.roundNumber, turnNumber: state.turnNumber, totalRounds: state.config.rounds, roundStartedAt: state.roundStartedAt, roundEndsAt: state.roundEndsAt, guesses: state.guesses.map((guess) => ({ ...guess, pokemonId: state.phase === 'GAME_RESULTS' ? guess.pokemonId : guess.pokemonId })), winnerTeam: state.winnerTeam, revealedSecrets, results: state.phase === 'GAME_RESULTS' ? buildWhoIsWhoResults(state) : null }; },
  getPlayerState(state, playerId, context) { const team = teamFor(state, playerId); const ownSecret = team ? state.board.find((pokemon) => pokemon.id === state.teams[team].secretPokemonId) ?? null : null; const lastGuess = [...state.guesses].reverse().find((guess) => guess.playerId === playerId) ?? null; const guessUsed = Boolean(team && state.guesses.some((guess) => guess.team === team && guess.turnNumber === state.turnNumber)); const required = Boolean(team && isPlayerRequired(context, playerId)); const allSecretsReady = teams.every((candidate) => state.teams[candidate].secretPokemonId !== null); const canAct = Boolean(required && allSecretsReady && state.phase === 'TURN_ACTIVE' && state.currentTeam === team); return { role: team ? 'PLAYER' : 'SPECTATOR', team, ownSecret, discardedPokemonIds: team ? state.teams[team].discardedPokemonIds : [], canChooseSecret: Boolean(required && state.config.secretSelection === 'PLAYER_CHOICE' && !ownSecret), canManageBoard: Boolean(required && allSecretsReady && state.phase === 'TURN_ACTIVE'), canAct, canGuess: canAct && !guessUsed, guessUsed, lastGuess } as WhoIsWhoPlayerState; },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return state.results ?? buildWhoIsWhoResults(state); },
};
