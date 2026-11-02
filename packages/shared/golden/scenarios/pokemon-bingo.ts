// Escenarios dorados de Pokémon Bingo. createInitialState solo consume random() al generar los cartones: con
// maxConditionsPerCell 2 baraja primero las plantillas simples (combinaciones) y después cada cartón saca una
// extracción por casilla y por intento, jugador a jugador (variante index * 97).
import { pokemonBingoGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };
const dani: GamePlayer = { id: 'p4', displayName: 'Dani' };

function assign(playerId: string, cellId: string, pokemonId: string, now: number, moveExisting?: boolean): GoldenStep {
  const action = { type: 'ASSIGN_POKEMON', cellId, pokemonId, ...(moveExisting !== undefined ? { moveExisting } : {}) };
  return { kind: 'action', playerId, action, now };
}
function move(playerId: string, fromCellId: string, toCellId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'MOVE_POKEMON', fromCellId, toCellId }, now };
}
function remove(playerId: string, cellId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'REMOVE_POKEMON', cellId }, now };
}
function skip(playerId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'SKIP_RESULTS' }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

const families = {
  generation: true, dexNumber: true, type: true, typeCombination: true, typeCount: true,
  hp: true, attack: true, defense: true, specialAttack: true, specialDefense: true, speed: true, baseStatTotal: false,
  height: true, weight: true, evolutionStage: true,
  legendaryStatus: false, color: false, abilities: false,
};
const allFamilies = Object.fromEntries(Object.keys(families).map((key) => [key, true]));
const baseConfig = { width: 3, height: 3, durationSeconds: 120, generations: [1], maxConditionsPerCell: 1, families };

const threePlayerBingo: GoldenScenario = {
  name: 'three-player-bingo',
  seed: 701,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { ...baseConfig, width: 2, height: 2, durationSeconds: 60, families: { ...families, generation: false } },
  steps: [
    // Partida 1000–61000. Ana: Veneno + Volador, Altura < 1,7 m, Altura < 1,2 m, Defensa < 50.
    // Bruno: Tipo Roca, Defensa < 63, Pokédex > 53, Tipo Tierra.
    // Carla: Normal + Hada, base, Velocidad > 63, Altura > 1,7 m.
    skip('p1', 1_500),
    assign('p9', 'cell-1', 'zubat', 1_600),
    remove('p1', 'cell-9', 2_000),
    remove('p1', 'cell-1', 2_100),
    assign('p1', 'cell-9', 'zubat', 2_200),
    assign('p1', 'cell-1', 'chikorita', 2_300),
    assign('p1', 'cell-1', 'missingno', 2_400),
    assign('p3', 'cell-1', 'jigglypuff', 2_450),
    // Fallo: un segundo de espera, que no bloquea quitar Pokémon pero sí colocarlos y moverlos.
    assign('p1', 'cell-1', 'bulbasaur', 2_500),
    assign('p1', 'cell-1', 'zubat', 3_000),
    move('p1', 'cell-1', 'cell-2', 3_100),
    remove('p1', 'cell-2', 3_200),
    assign('p1', 'cell-1', 'zubat', 3_500),
    assign('p1', 'cell-1', 'zubat', 3_600),
    assign('p1', 'cell-3', 'bulbasaur', 3_700),
    assign('p1', 'cell-2', 'bulbasaur', 3_800),
    assign('p1', 'cell-2', 'bulbasaur', 3_900, false),
    assign('p1', 'cell-2', 'bulbasaur', 4_000, true),
    move('p1', 'cell-2', 'cell-2', 4_100),
    move('p1', 'cell-3', 'cell-4', 4_200),
    move('p1', 'cell-2', 'cell-9', 4_300),
    move('p1', 'cell-2', 'cell-1', 4_400),
    move('p1', 'cell-2', 'cell-4', 4_900),
    move('p1', 'cell-2', 'cell-4', 5_400),
    remove('p1', 'cell-4', 5_500),
    // Carla se desconecta y Dani entra tarde: ninguno de los dos puede tocar un tablero.
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }, dani], now: 5_600 },
    assign('p3', 'cell-2', 'bulbasaur', 5_700),
    assign('p4', 'cell-1', 'zubat', 5_800),
    assign('p2', 'cell-1', 'geodude', 6_000),
    assign('p2', 'cell-2', 'bulbasaur', 6_100),
    assign('p2', 'cell-3', 'psyduck', 6_200),
    // Bingo de Bruno: resultados hasta 14300.
    assign('p2', 'cell-4', 'sandshrew', 6_300),
    assign('p1', 'cell-3', 'bulbasaur', 6_400),
    remove('p1', 'cell-1', 6_450),
    skip('p2', 6_500),
    skip('p3', 6_550),
    skip('p1', 6_600),
    skip('p1', 6_700),
    move('p1', 'cell-1', 'cell-2', 6_800),
  ],
};

const timeoutRevealsSolutions: GoldenScenario = {
  name: 'timeout-reveals-solutions',
  seed: 702,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { ...baseConfig, generations: [2, 1], maxConditionsPerCell: 2, durationSeconds: 60 },
  steps: [
    // Partida 1000–61000 con casillas de dos condiciones; nadie completa el cartón.
    assign('p1', 'cell-6', 'bulbasaur', 2_000),
    assign('p1', 'cell-1', 'lapras', 3_000),
    assign('p1', 'cell-8', 'bulbasaur', 4_000),
    assign('p2', 'cell-1', 'venusaur', 5_000),
    assign('p2', 'cell-3', 'muk', 6_000),
    assign('p2', 'cell-9', 'venusaur', 7_000),
    assign('p2', 'cell-9', 'bulbasaur', 8_000),
    assign('p1', 'cell-9', 'lapras', 9_000),
    assign('p1', 'cell-9', 'lapras', 9_500, true),
    move('p1', 'cell-9', 'cell-1', 10_000),
    timeout(60_999),
    // Al vencer, la acción se rechaza y la partida termina revelando hasta tres soluciones por casilla vacía.
    assign('p2', 'cell-6', 'squirtle', 61_000),
    assign('p2', 'cell-6', 'squirtle', 61_100),
    timeout(70_000),
  ],
};

const fullFamiliesTimeout: GoldenScenario = {
  name: 'full-families-timeout',
  seed: 703,
  catalog: 'gen1-2',
  players: [ana],
  startNow: 5_000,
  config: {
    width: 6, height: 6, durationSeconds: 300, generations: [2, 1, 2], maxConditionsPerCell: 2, families: allFamilies,
  },
  steps: [
    // Partida 5000–305000 de un solo jugador en un cartón 6×6 con todas las familias.
    assign('p1', 'cell-8', 'shellder', 6_000),
    assign('p1', 'cell-36', 'nidoking', 7_000),
    assign('p1', 'cell-29', 'oddish', 8_000),
    assign('p1', 'cell-15', 'oddish', 9_000),
    assign('p1', 'cell-22', 'shellder', 10_000),
    assign('p1', 'cell-22', 'jigglypuff', 10_500),
    assign('p1', 'cell-24', 'pikachu', 11_000),
    assign('p1', 'cell-28', 'pikachu', 11_500),
    assign('p1', 'cell-28', 'pikachu', 12_000, true),
    timeout(304_999),
    timeout(305_000),
    skip('p1', 305_500),
  ],
};

const soloBingoReveal: GoldenScenario = {
  name: 'solo-bingo-reveal',
  seed: 704,
  catalog: 'gen1-2',
  players: [ana],
  config: {
    width: 2, height: 2, durationSeconds: 90, generations: [2], maxConditionsPerCell: 1,
    families: {
      ...families, generation: false, dexNumber: false, type: false, typeCombination: false, hp: false, attack: false,
      defense: false, specialAttack: false, specialDefense: false, speed: false, baseStatTotal: true, height: false,
      weight: false, legendaryStatus: true, color: true, abilities: true, unknownFamily: true,
    },
  },
  steps: [
    // Partida 1000–91000: Legendario, base, Total stats > 465 y color verde.
    assign('p1', 'cell-4', 'chikorita', 2_000),
    assign('p1', 'cell-2', 'chikorita', 2_500),
    assign('p1', 'cell-2', 'cyndaquil', 3_000),
    assign('p1', 'cell-3', 'meganium', 4_000),
    assign('p1', 'cell-1', 'raikou', 5_000),
    // Bingo: resultados hasta 13000.
    timeout(12_999),
    // El revelado vence sin que el anfitrión lo salte.
    timeout(13_000),
    skip('p1', 13_500),
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 705,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { ...baseConfig, width: 2, height: 2 },
  steps: [
    remove('p1', 'cell-1', 2_000),
    // Una casilla vacía no valida y detiene el escenario.
    remove('p1', '', 3_000),
    remove('p1', 'cell-1', 4_000),
  ],
};

export const pokemonBingoScenarios: GoldenEngineEntry = {
  module: pokemonBingoGame,
  scenarios: [threePlayerBingo, timeoutRevealsSolutions, fullFamiliesTimeout, soloBingoReveal, invalidActionStops],
  configCases: [
    // Válidos: límites, normalización de generaciones, enteros con decimal cero y familias con claves de más.
    baseConfig,
    { ...baseConfig, width: 2, height: 6 },
    { ...baseConfig, width: 6, height: 2 },
    { ...baseConfig, durationSeconds: 60 },
    { ...baseConfig, durationSeconds: 300 },
    { ...baseConfig, generations: [9, 1, 9, 3] },
    { ...baseConfig, generations: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    { ...baseConfig, maxConditionsPerCell: 2 },
    { ...baseConfig, maxConditionsPerCell: 1.0, width: 4.0 },
    { ...baseConfig, families: { ...families, extra: 'se descarta' } },
    { ...baseConfig, families: allFamilies },
    { ...baseConfig, families: Object.fromEntries(Object.keys(families).map((key) => [key, false])) },
    // Inválidos: límites, tipos, literales y raíz .strict().
    { ...baseConfig, width: 1 },
    { ...baseConfig, width: 7 },
    { ...baseConfig, height: 1 },
    { ...baseConfig, height: 7 },
    { ...baseConfig, width: 2.5 },
    { ...baseConfig, durationSeconds: 59 },
    { ...baseConfig, durationSeconds: 301 },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, generations: [1.5] },
    { ...baseConfig, generations: 1 },
    { ...baseConfig, maxConditionsPerCell: 0 },
    { ...baseConfig, maxConditionsPerCell: 3 },
    { ...baseConfig, maxConditionsPerCell: 1.5 },
    { ...baseConfig, maxConditionsPerCell: '1' },
    { ...baseConfig, families: { ...families, color: 'false' } },
    { ...baseConfig, families: { ...families, abilities: undefined } },
    { ...baseConfig, families: [] },
    { ...baseConfig, families: null },
    { ...baseConfig, unknownKey: 'no se admite' },
    { width: 3, height: 3, durationSeconds: 120, generations: [1], maxConditionsPerCell: 1 },
    [],
    null,
  ],
};
