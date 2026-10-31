// Escenarios dorados de Guess from Stats. La baraja se prepara en createInitialState (barajados completos del pool
// con formas), así que el seed fija los objetivos de todas las rondas; los intentos no consumen random().
import { guessFromStatsGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };

const allStats = { hp: true, attack: true, defense: true, specialAttack: true, specialDefense: true, speed: true, bst: false };
const noHints = { generation: false, types: false, typeCount: false, evolution: false, height: false, weight: false, category: false };
const allHints = { generation: true, types: true, typeCount: true, evolution: true, height: true, weight: true, category: true };
const baseConfig = {
  generations: [1],
  roundSeconds: 20,
  rounds: 3,
  stats: allStats,
  hintsEnabled: false,
  hints: { generation: true, types: true, typeCount: false, evolution: true, height: false, weight: false, category: false },
};

function guess(playerId: string, pokemonId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'GUESS_POKEMON', pokemonId }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

/** 51 intentos fallidos (tres jugadores, uno por segundo cada uno): la lista pública se recorta a los 48 últimos. */
function wrongGuessFlood(start: number): GoldenStep[] {
  const wrong = ['bulbasaur', 'ivysaur', 'venusaur', 'squirtle', 'wartortle', 'blastoise', 'caterpie', 'metapod',
    'butterfree', 'weedle', 'kakuna', 'pidgey', 'pidgeotto', 'pidgeot', 'rattata', 'raticate', 'spearow'];
  return wrong.flatMap((pokemonId, index) => [
    guess('p1', pokemonId, start + index * 1_000),
    guess('p2', pokemonId, start + index * 1_000 + 300),
    guess('p3', pokemonId, start + index * 1_000 + 600),
  ]);
}

const threePlayersRace: GoldenScenario = {
  name: 'three-players-race',
  seed: 501,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: baseConfig,
  steps: [
    // Ronda 1 (1000–21000), Charmander: espectador, fuera del pool, fallo con enfriamiento y dos aciertos.
    guess('p9', 'pikachu', 2_000),
    guess('p1', 'chikorita', 2_500),
    guess('p1', 'bulbasaur', 3_000),
    guess('p1', 'charmander', 3_400),
    guess('p1', 'charmander', 4_000),
    guess('p1', 'charmander', 4_500),
    guess('p2', 'charmander', 6_000),
    timeout(20_999),
    timeout(21_000),
    // Resultados (21000–25000).
    guess('p3', 'charmander', 22_000),
    timeout(25_000),
    // Ronda 2 (25000–45000), Rapidash: la forma de Galar tiene la misma firma y también vale.
    guess('p3', 'rapidash-galar', 26_000),
    guess('p1', 'ponyta', 27_000),
    guess('p2', 'rapidash', 45_000),
    timeout(45_000),
    timeout(49_000),
    // Ronda 3 (49000–69000), Beedrill: 51 fallos, Ana acierta y la desconexión de los demás resuelve la ronda.
    ...wrongGuessFlood(50_000),
    guess('p1', 'beedrill', 67_500),
    { kind: 'presence', players: [ana, { ...bruno, connected: false }, carla], now: 67_800 },
    { kind: 'presence', players: [ana, { ...bruno, connected: false }, { ...carla, connected: false }], now: 68_000 },
    timeout(72_000),
  ],
};

const equivalentSignatures: GoldenScenario = {
  name: 'equivalent-signatures',
  seed: 502,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { ...baseConfig, generations: [2, 1], roundSeconds: 30, rounds: 4, stats: { ...allStats, attack: false, defense: false, specialAttack: false, specialDefense: false }, hints: noHints },
  steps: [
    // Ronda 1 (1000–31000), firma hp:90|speed:90: Moltres y Moltres de Galar son equivalentes.
    guess('p1', 'moltres', 3_000),
    guess('p2', 'zapdos', 4_000),
    guess('p2', 'moltres-galar', 5_000),
    timeout(9_000),
    // Ronda 2 (9000–39000): nadie responde.
    timeout(39_000),
    timeout(43_000),
    // Ronda 3 (43000–73000).
    guess('p2', 'hitmonlee', 44_000),
    guess('p1', 'hitmonchan', 45_000),
    timeout(73_000),
    timeout(77_000),
    // Ronda 4 (77000–107000): cuatro Pokémon distintos comparten hp:60|speed:110.
    guess('p1', 'gengar', 78_000),
    guess('p2', 'dodrio', 79_000),
    timeout(83_000),
  ],
};

const hintsEnabled: GoldenScenario = {
  name: 'hints-enabled',
  seed: 503,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: {
    ...baseConfig,
    generations: [1, 2],
    roundSeconds: 15,
    stats: { ...allStats, hp: false, attack: false, defense: false, specialAttack: false, speed: false, bst: true },
    hintsEnabled: true,
    hints: allHints,
  },
  steps: [
    // Ronda 1 (1000–16000): todas las pistas; las formas sin evolución conocida quedan fuera del pool.
    guess('p1', 'mew', 2_000),
    guess('p3', 'mewtwo', 3_000),
    timeout(16_000),
    timeout(20_000),
    // Ronda 2 (20000–35000): Bruno acierta y la desconexión de Ana y Carla resuelve la ronda.
    guess('p2', 'noctowl', 21_000),
    { kind: 'presence', players: [{ ...ana, connected: false }, bruno, { ...carla, connected: false }], now: 22_000 },
    timeout(26_000),
    // Ronda 3 (26000–41000): Ana desconectada observa; vuelve y acierta.
    guess('p1', 'forretress', 27_000),
    { kind: 'presence', players: [ana, bruno, carla], now: 28_000 },
    guess('p1', 'forretress', 29_000),
    guess('p2', 'pineco', 30_000),
    guess('p3', 'forretress', 31_000),
    timeout(41_000),
    timeout(45_000),
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 504,
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

export const guessFromStatsScenarios: GoldenEngineEntry = {
  module: guessFromStatsGame,
  scenarios: [threePlayersRace, equivalentSignatures, hintsEnabled, invalidActionStops],
  configCases: [
    // Válidos: normalización de generaciones, límites, dos estadísticas, pistas vacías con hintsEnabled false.
    { ...baseConfig, generations: [2, 1, 2] },
    { ...baseConfig, generations: [9] },
    { ...baseConfig, roundSeconds: 15, rounds: 1 },
    { ...baseConfig, roundSeconds: 60, rounds: 20 },
    { ...baseConfig, roundSeconds: 15.0 },
    { ...baseConfig, stats: { hp: true, attack: false, defense: false, specialAttack: false, specialDefense: false, speed: false, bst: true } },
    { ...baseConfig, hintsEnabled: false, hints: noHints },
    { ...baseConfig, hintsEnabled: true, hints: { ...noHints, weight: true } },
    // Inválidos: límites, superRefine y esquemas .strict() (raíz, stats y hints).
    { ...baseConfig, roundSeconds: 14 },
    { ...baseConfig, roundSeconds: 61 },
    { ...baseConfig, rounds: 0 },
    { ...baseConfig, rounds: 21 },
    { ...baseConfig, roundSeconds: 15.5 },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, stats: { ...allStats, hp: false, attack: false, defense: false, specialAttack: false, specialDefense: false } },
    { ...baseConfig, hintsEnabled: true, hints: noHints },
    { ...baseConfig, unknownKey: 'no se admite' },
    { ...baseConfig, stats: { ...allStats, weight: true } },
    { ...baseConfig, hints: { ...noHints, shape: true } },
    { ...baseConfig, hints: { generation: true } },
    { ...baseConfig, stats: { ...allStats, hp: 'yes' } },
    { ...baseConfig, hintsEnabled: 1 },
    { ...baseConfig, rounds: undefined },
    [],
    null,
  ],
};
