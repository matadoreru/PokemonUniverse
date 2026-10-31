// Escenarios dorados de Pokédle Race. createInitialState baraja el pool una vez (los secretos de cada jugador salen
// de esa baraja); las rondas y los intentos no consumen random().
import { pokeddleRaceGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };

const allClues = {
  generation: true, dexNumber: true, types: true, typeCount: true,
  hp: true, attack: true, defense: true, specialAttack: true, specialDefense: true, speed: true, baseStatTotal: true,
  height: true, weight: true, evolutionStage: true, legendaryStatus: true, color: true, abilities: true,
};
const defaultClues = { ...allClues, baseStatTotal: false, legendaryStatus: false, color: false, abilities: false };
const noClues = Object.fromEntries(Object.keys(allClues).map((key) => [key, false]));
const baseConfig = { generations: [1], roundSeconds: 20, maxRounds: 10, clues: defaultClues };

function guess(playerId: string, pokemonId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'GUESS_POKEMON', pokemonId }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

const allCluesRace: GoldenScenario = {
  name: 'all-clues-race',
  seed: 611,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { generations: [2, 1], roundSeconds: 20, maxRounds: 4, clues: allClues },
  steps: [
    // Secretos: Ana Rapidash, Bruno Hoppip, Carla Ditto. Ronda 1 (1000–21000).
    guess('p9', 'pikachu', 2_000),
    guess('p1', 'rapidash-galar', 2_500),
    guess('p1', 'missingno', 2_700),
    guess('p1', 'ponyta', 3_000),
    guess('p1', 'rapidash', 3_500),
    guess('p2', 'skiploom', 4_000),
    guess('p3', 'ditto', 5_000),
    guess('p3', 'mew', 6_000),
    timeout(7_999),
    timeout(8_000),
    // Ronda 2 (8000–28000): Carla ya resolvió; Ana acierta y Bruno llega tarde.
    guess('p3', 'mew', 9_000),
    guess('p1', 'rapidash', 10_000),
    timeout(27_999),
    guess('p2', 'jumpluff', 28_000),
    timeout(31_000),
    // Ronda 3 (31000–51000): Bruno se desconecta y la ronda se resuelve sin respuesta.
    { kind: 'presence', players: [ana, { ...bruno, connected: false }, carla], now: 32_000 },
    { kind: 'presence', players: [ana, bruno, carla], now: 33_000 },
    timeout(35_000),
    // Ronda 4 (35000–55000): Bruno acierta y la carrera termina antes del máximo de rondas.
    guess('p2', 'hoppip', 36_000),
    timeout(39_000),
    guess('p2', 'hoppip', 40_000),
  ],
};

const defaultCluesMaxRounds: GoldenScenario = {
  name: 'default-clues-max-rounds',
  seed: 612,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { generations: [1, 2, 1], roundSeconds: 10, maxRounds: 3, clues: defaultClues },
  steps: [
    // Secretos: Ana Porygon, Bruno Gloom, Carla Heracross. Ronda 1 (1000–11000): Carla no responde.
    guess('p1', 'magnemite', 2_000),
    guess('p2', 'oddish', 3_000),
    timeout(11_000),
    timeout(14_000),
    // Ronda 2 (14000–24000): Ana acierta; todos responden y la ronda se resuelve sola.
    guess('p1', 'porygon', 15_000),
    guess('p2', 'vileplume', 16_000),
    guess('p3', 'scyther', 17_000),
    timeout(20_000),
    // Ronda 3 (20000–30000): última ronda; Bruno y Carla terminan sin resolver.
    guess('p2', 'bellossom', 21_000),
    timeout(30_000),
    timeout(33_000),
  ],
};

const fewCluesTwoPlayers: GoldenScenario = {
  name: 'few-clues-two-players',
  seed: 614,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: {
    generations: [1], roundSeconds: 60, maxRounds: 30,
    clues: { ...noClues, types: true, typeCount: true, baseStatTotal: true, legendaryStatus: true, color: true, abilities: true },
  },
  steps: [
    // Secretos: Ana Dragonite, Bruno Dewgong. Ronda 1 (1000–61000).
    guess('p1', 'dragonair', 2_000),
    guess('p2', 'seel', 3_000),
    timeout(6_000),
    // Ronda 2 (6000–66000).
    guess('p2', 'lapras', 7_000),
    guess('p1', 'dragonite', 8_000),
    timeout(11_000),
    // Ronda 3 (11000–71000): Bruno resuelve y la carrera termina.
    guess('p1', 'dragonite', 12_000),
    guess('p2', 'dewgong', 13_000),
    timeout(16_000),
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 615,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: baseConfig,
  steps: [
    guess('p1', 'pikachu', 2_000),
    // actionSchema es .strict(): una clave desconocida invalida la acción y detiene el escenario.
    { kind: 'action', playerId: 'p2', action: { type: 'GUESS_POKEMON', pokemonId: 'pikachu', extra: true }, now: 3_000 },
    guess('p2', 'pikachu', 4_000),
  ],
};

export const pokeddleRaceScenarios: GoldenEngineEntry = {
  module: pokeddleRaceGame,
  scenarios: [allCluesRace, defaultCluesMaxRounds, fewCluesTwoPlayers, invalidActionStops],
  configCases: [
    // Válidos: normalización de generaciones, límites, enteros con decimal cero, sin pistas (el esquema lo admite)
    // y claves desconocidas dentro de clues (ese subesquema no es .strict(): se descartan).
    { ...baseConfig, generations: [2, 1, 2] },
    { ...baseConfig, generations: [9] },
    { ...baseConfig, roundSeconds: 10, maxRounds: 1 },
    { ...baseConfig, roundSeconds: 60, maxRounds: 30 },
    { ...baseConfig, roundSeconds: 20.0 },
    { ...baseConfig, clues: noClues },
    { ...baseConfig, clues: { ...allClues, bogus: true } },
    // Inválidos: límites, tipos, pistas incompletas y raíz .strict().
    { ...baseConfig, roundSeconds: 9 },
    { ...baseConfig, roundSeconds: 61 },
    { ...baseConfig, maxRounds: 0 },
    { ...baseConfig, maxRounds: 31 },
    { ...baseConfig, roundSeconds: 20.5 },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, clues: { ...allClues, color: undefined } },
    { ...baseConfig, clues: { ...allClues, color: 'yes' } },
    { ...baseConfig, clues: null },
    { ...baseConfig, unknownKey: 'no se admite' },
    { generations: [1], roundSeconds: 20, maxRounds: 10 },
    [],
    null,
  ],
};
