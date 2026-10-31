// Escenarios dorados de Type Duel. handleTimeout es propio (cinco fases temporizadas): cada escenario recorre varias
// y entre todos cubren SELECTING_TYPES (abandono y sin tipos), TYPE_REVEAL, INVALID_COMBINATION, POKEMON_SEARCH y
// ROUND_RESULTS, cada literal de error de server.ts, la presencia y una acción que no valida.
import { typeDuelGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };
const dani: GamePlayer = { id: 'p4', displayName: 'Dani' };

const baseConfig = { generations: [1, 2], typeSelectSeconds: 10, searchSeconds: 20, rounds: 3 };

function selectType(playerId: string, pokemonType: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'SELECT_TYPE', pokemonType }, now };
}
function attempt(playerId: string, pokemonId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'ATTEMPT_POKEMON', pokemonId }, now };
}
function continueRound(playerId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'CONTINUE' }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

const twoDuelistsFullCycle: GoldenScenario = {
  name: 'two-duelists-full-cycle',
  seed: 101,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: baseConfig,
  steps: [
    // Ronda 1, elección de tipos (1000–11000): el tipo propio solo lo ve su dueño hasta que ambos eligen.
    attempt('p1', 'charizard', 2_000),
    selectType('p1', 'fire', 2_500),
    selectType('p1', 'water', 3_000),
    selectType('p2', 'flying', 4_000),
    // TYPE_REVEAL (4000–6000).
    selectType('p1', 'fire', 5_000),
    continueRound('p1', 5_500),
    timeout(5_999),
    timeout(6_000),
    // POKEMON_SEARCH (6000–26000): fallo, enfriamiento, Pokémon desconocido y acierto de Bruno.
    attempt('p1', 'pikachu', 7_000),
    attempt('p1', 'charmander', 7_300),
    attempt('p2', 'missingno', 7_500),
    attempt('p2', 'charizard', 9_000),
    // ROUND_RESULTS (9000–19000): solo el anfitrión puede avanzar antes de tiempo.
    attempt('p2', 'moltres', 9_500),
    continueRound('p2', 10_000),
    continueRound('p1', 11_000),
    // Ronda 2 (11000–21000): combinación imposible, se repite la elección sin gastar ronda.
    selectType('p1', 'dragon', 12_000),
    selectType('p2', 'fairy', 13_000),
    timeout(15_999),
    timeout(16_000),
    // Solo Bruno elige: gana por abandono; Ana llega tarde.
    selectType('p2', 'fire', 17_000),
    selectType('p1', 'water', 26_000),
    timeout(26_000),
    timeout(36_000),
    // Ronda 3 (36000–46000): monotipo agua; la carrera se agota y se muestran ocho soluciones.
    selectType('p1', 'water', 37_000),
    selectType('p2', 'water', 38_000),
    timeout(40_000),
    attempt('p1', 'squirtle', 60_000),
    timeout(60_000),
    continueRound('p2', 61_000),
    timeout(70_000),
    continueRound('p1', 71_000),
  ],
};

const fourPlayersBalancedPairs: GoldenScenario = {
  name: 'four-players-balanced-pairs',
  seed: 202,
  catalog: 'gen1-2',
  players: [ana, bruno, carla, dani],
  config: { ...baseConfig, generations: [1], typeSelectSeconds: 5, searchSeconds: 15 },
  steps: [
    // Ronda 1 (1000–6000): nadie elige tipo; se cancela sin gastar ronda y la pareja siguiente cambia.
    timeout(6_000),
    timeout(16_000),
    // Los espectadores no pueden elegir; los duelistas eligen tierra y acero (incluye formas regionales).
    selectType('p1', 'ground', 17_000),
    selectType('p2', 'steel', 17_200),
    selectType('p3', 'ground', 17_400),
    selectType('p4', 'steel', 17_600),
    timeout(19_600),
    // Búsqueda: un Pokémon de generación 2 está fuera del pool; luego aciertos simultáneos.
    attempt('p1', 'chikorita', 20_000),
    attempt('p2', 'chikorita', 20_100),
    attempt('p3', 'chikorita', 20_200),
    attempt('p4', 'chikorita', 20_300),
    attempt('p1', 'dugtrio-alola', 22_000),
    attempt('p2', 'dugtrio-alola', 22_100),
    attempt('p3', 'dugtrio-alola', 22_200),
    attempt('p4', 'dugtrio-alola', 22_300),
    timeout(34_600),
    timeout(37_000),
    // Ronda siguiente: prioridad a los menos usados.
    selectType('p1', 'electric', 38_000),
    selectType('p2', 'electric', 38_100),
    selectType('p3', 'electric', 38_200),
    selectType('p4', 'electric', 38_300),
    timeout(40_300),
    timeout(55_300),
    timeout(65_300),
    selectType('p1', 'psychic', 66_000),
    selectType('p2', 'psychic', 66_100),
    selectType('p3', 'psychic', 66_200),
    selectType('p4', 'psychic', 66_300),
    timeout(68_300),
    timeout(83_300),
    timeout(93_300),
  ],
};

const presenceAndEarlyFinish: GoldenScenario = {
  name: 'presence-and-early-finish',
  seed: 303,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { ...baseConfig, rounds: 5 },
  steps: [
    // Ronda 1: un duelista se desconecta durante la elección y la ronda se cancela sin ganador.
    selectType('p1', 'grass', 2_000),
    selectType('p2', 'grass', 2_100),
    selectType('p3', 'grass', 2_200),
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 3_000 },
    selectType('p3', 'fire', 3_500),
    timeout(13_000),
    // Ronda con los dos conectados: elección, revelación y búsqueda.
    selectType('p1', 'bug', 14_000),
    selectType('p2', 'poison', 14_500),
    timeout(16_500),
    attempt('p1', 'beedrill', 17_000),
    timeout(27_000),
    { kind: 'presence', players: [ana, { ...bruno, connected: false }, { ...carla, connected: false }], now: 28_000 },
    timeout(37_000),
    continueRound('p1', 38_000),
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 404,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: baseConfig,
  steps: [
    selectType('p1', 'ice', 2_000),
    // pokemonType fuera de POKEMON_TYPES: la acción no valida y el escenario se detiene.
    selectType('p2', 'shadow', 3_000),
    selectType('p2', 'ice', 4_000),
  ],
};

export const typeDuelScenarios: GoldenEngineEntry = {
  module: typeDuelGame,
  scenarios: [twoDuelistsFullCycle, fourPlayersBalancedPairs, presenceAndEarlyFinish, invalidActionStops],
  configCases: [
    // Válidos: normalización de generaciones, límites inferiores y superiores, clave extra ignorada.
    { ...baseConfig, generations: [2, 1, 2] },
    { ...baseConfig, generations: [9, 1], unknownKey: 'se ignora' },
    { ...baseConfig, typeSelectSeconds: 5, searchSeconds: 10, rounds: 1 },
    { ...baseConfig, typeSelectSeconds: 60, searchSeconds: 60, rounds: 50 },
    { ...baseConfig, typeSelectSeconds: 15.0 },
    // Inválidos: justo fuera de cada límite, tipos y ausencias.
    { ...baseConfig, typeSelectSeconds: 4 },
    { ...baseConfig, typeSelectSeconds: 61 },
    { ...baseConfig, searchSeconds: 9 },
    { ...baseConfig, searchSeconds: 61 },
    { ...baseConfig, rounds: 0 },
    { ...baseConfig, rounds: 51 },
    { ...baseConfig, rounds: 2.5 },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, generations: 1 },
    { ...baseConfig, searchSeconds: '20' },
    { ...baseConfig, typeSelectSeconds: undefined },
    [],
    null,
  ],
};
