// Escenarios dorados de Pokédex Entry Guess. La baraja (Pokémon y entrada) se prepara en createInitialState, así que el
// seed fija todas las rondas; los intentos no consumen random(). gen1-2 solo trae entradas en español de las
// generaciones 6 a 8: con referencia 1 o 2 se usa la generación más antigua disponible (6) y con referencia 7, la 7.
import { pokedexEntryGuessGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };

const allHints = { generation: true, type: true, evolution: true, typeCount: true, category: true };
const noHints = { generation: false, type: false, evolution: false, typeCount: false, category: false };
const baseConfig = {
  generations: [1],
  roundSeconds: 25,
  rounds: 3,
  hintsEnabled: false,
  hints: { generation: true, type: true, evolution: true, typeCount: false, category: false },
};

function guess(playerId: string, pokemonId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'GUESS_POKEMON', pokemonId }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

const hintsRace: GoldenScenario = {
  name: 'hints-race',
  seed: 29,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { ...baseConfig, hintsEnabled: true, hints: allHints },
  steps: [
    // Ronda 1 (1000–26000), Mr. Mime: la entrada oculta «Mr. Mime» (letras separadas por puntuación y espacio).
    guess('p9', 'pikachu', 2_000),
    guess('p1', 'chikorita', 2_500),
    guess('p1', 'rapidash-galar', 2_600),
    guess('p1', 'jynx', 3_000),
    guess('p1', 'mr-mime', 3_400),
    guess('p2', 'mr-mime', 5_000),
    guess('p2', 'mr-mime', 5_500),
    guess('p1', 'mr-mime', 6_000),
    // La acción en el instante de cierre resuelve la ronda aunque se rechace.
    guess('p3', 'mr-mime', 26_000),
    guess('p3', 'mr-mime', 26_500),
    timeout(30_000),
    // Ronda 2 (30000–55000), Ivysaur: Carla acierta y la desconexión de Ana y Bruno resuelve la ronda.
    guess('p3', 'ivysaur', 31_000),
    { kind: 'presence', players: [{ ...ana, connected: false }, { ...bruno, connected: false }, carla], now: 32_000 },
    timeout(36_000),
    // Ronda 3 (36000–61000), Rapidash: vuelven todos; nadie acierta.
    { kind: 'presence', players: [ana, bruno, carla], now: 37_000 },
    guess('p1', 'ponyta', 38_000),
    timeout(60_999),
    timeout(61_000),
    timeout(65_000),
    guess('p1', 'rapidash', 66_000),
  ],
};

const historicalEntries: GoldenScenario = {
  name: 'historical-entries',
  seed: 12,
  catalog: 'gen1-2',
  players: [bruno, ana],
  // Referencia 7: se eligen entradas de la generación 7 (Sol/Luna y Let's Go). Sin pistas adicionales.
  config: { ...baseConfig, generations: [7, 1, 7], roundSeconds: 15, rounds: 4, hintsEnabled: false, hints: noHints },
  steps: [
    // Ronda 1 (1000–16000), Gengar: Bruno falla, espera el enfriamiento y acierta justo al terminar.
    guess('p1', 'gengar', 2_000),
    guess('p2', 'haunter', 3_000),
    guess('p2', 'gengar', 3_500),
    guess('p2', 'gengar', 4_000),
    timeout(8_000),
    // Ronda 2 (8000–23000), Machop: nadie responde.
    timeout(22_999),
    timeout(23_000),
    timeout(27_000),
    // Ronda 3 (27000–42000), Drowzee: Bruno se desconecta y el acierto de Ana resuelve la ronda.
    { kind: 'presence', players: [{ ...bruno, connected: false }, ana], now: 28_000 },
    guess('p1', 'hypno', 29_000),
    guess('p1', 'drowzee', 30_000),
    timeout(34_000),
    // Ronda 4 (34000–49000), Farfetch’d: Bruno observa, vuelve y ambos aciertan.
    guess('p2', 'farfetchd', 35_000),
    { kind: 'presence', players: [bruno, ana], now: 36_000 },
    guess('p2', 'farfetchd', 37_000),
    guess('p1', 'farfetchd-galar', 37_500),
    guess('p1', 'farfetchd', 38_000),
    timeout(42_000),
  ],
};

const johtoHints: GoldenScenario = {
  name: 'johto-hints',
  seed: 17,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { ...baseConfig, generations: [2], roundSeconds: 60, hintsEnabled: true, hints: { ...noHints, evolution: true, typeCount: true, category: true } },
  steps: [
    // Ronda 1 (1000–61000), Mantine: nadie responde.
    guess('p2', 'pikachu', 2_000),
    timeout(61_000),
    timeout(65_000),
    // Ronda 2 (65000–125000), Ampharos.
    guess('p1', 'mareep', 66_000),
    guess('p1', 'ampharos', 67_000),
    guess('p2', 'ampharos', 68_000),
    timeout(72_000),
    // Ronda 3 (72000–132000), Ho-Oh: categoría legendaria.
    guess('p2', 'lugia', 73_000),
    guess('p1', 'ho-oh', 74_000),
    timeout(132_000),
    timeout(136_000),
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 13,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: baseConfig,
  steps: [
    guess('p1', 'pikachu', 2_000),
    // actionSchema es .strict() y limita pokemonId a 96 caracteres: la acción no valida y detiene el escenario.
    guess('p2', 'x'.repeat(97), 3_000),
    guess('p2', 'raichu', 4_000),
  ],
};

export const pokedexEntryGuessScenarios: GoldenEngineEntry = {
  module: pokedexEntryGuessGame,
  scenarios: [hintsRace, historicalEntries, johtoHints, invalidActionStops],
  configCases: [
    // Válidos: normalización de generaciones, límites y pistas vacías con hintsEnabled false.
    { ...baseConfig, generations: [2, 1, 2] },
    { ...baseConfig, generations: [9] },
    { ...baseConfig, roundSeconds: 15, rounds: 1 },
    { ...baseConfig, roundSeconds: 60, rounds: 20 },
    { ...baseConfig, roundSeconds: 15.0 },
    { ...baseConfig, hintsEnabled: false, hints: noHints },
    { ...baseConfig, hintsEnabled: true, hints: { ...noHints, category: true } },
    // Inválidos: límites, superRefine y esquemas .strict() (raíz y hints).
    { ...baseConfig, roundSeconds: 14 },
    { ...baseConfig, roundSeconds: 61 },
    { ...baseConfig, rounds: 0 },
    { ...baseConfig, rounds: 21 },
    { ...baseConfig, roundSeconds: 15.5 },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, hintsEnabled: true, hints: noHints },
    { ...baseConfig, unknownKey: 'no se admite' },
    { ...baseConfig, hints: { ...noHints, height: true } },
    { ...baseConfig, hints: { generation: true } },
    { ...baseConfig, hints: { ...noHints, type: 'yes' } },
    { ...baseConfig, hintsEnabled: 1 },
    { ...baseConfig, rounds: undefined },
    { ...baseConfig, hints: null },
    [],
    null,
  ],
};
