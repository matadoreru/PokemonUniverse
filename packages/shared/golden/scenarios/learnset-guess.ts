// Escenarios dorados de Learnset Guess. El objetivo de cada ronda se elige en beginRound (una extracción de random()
// por ronda), así que el seed fija los Pokémon; las pistas extra se revelan cada 7 s en handleTimeout (tickActive).
import { learnsetGuessGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };

const baseConfig = { generations: [1], showLevels: true, showEvolution: true, roundSeconds: 30, rounds: 3 };

function guess(playerId: string, pokemonId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'GUESS_POKEMON', pokemonId }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

const hintsAndRace: GoldenScenario = {
  name: 'hints-and-race',
  seed: 805,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: baseConfig,
  steps: [
    // Ronda 1 (1000–31000), Pinsir: un grupo inicial y siete extra (8000, 15000, 22000, 29000).
    guess('p9', 'pikachu', 2_000),
    guess('p1', 'chikorita', 2_500),
    guess('p1', 'rapidash-galar', 2_600),
    guess('p1', 'bulbasaur', 3_000),
    guess('p1', 'bulbasaur', 3_400),
    timeout(7_999),
    timeout(8_000),
    // Un único timeout tardío revela dos grupos a la vez (15000 y 22000).
    timeout(22_500),
    guess('p2', 'pinsir', 23_000),
    guess('p2', 'pinsir', 23_500),
    guess('p1', 'scyther', 24_000),
    // La acción en el instante de cierre resuelve la ronda aunque se rechace.
    guess('p1', 'pinsir', 31_000),
    guess('p3', 'pinsir', 31_500),
    timeout(35_000),
    // Ronda 2 (35000–65000), Tauros: dos aciertos con las pistas iniciales y Carla se desconecta.
    guess('p1', 'tauros', 36_000),
    guess('p2', 'tauros', 37_000),
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 38_000 },
    timeout(42_000),
    // Ronda 3 (42000–72000), Venonat: Carla vuelve como observadora conectada; nadie acierta.
    { kind: 'presence', players: [ana, bruno, carla], now: 43_000 },
    guess('p3', 'venomoth', 44_000),
    timeout(49_000),
    timeout(72_000),
    timeout(76_000),
    guess('p1', 'venonat', 77_000),
  ],
};

const hiddenLevels: GoldenScenario = {
  name: 'hidden-levels-crystal',
  seed: 811,
  catalog: 'gen1-2',
  players: [ana, bruno],
  // Generaciones desordenadas y repetidas: referencia Crystal (generación 2); sin niveles ni pista de evolución.
  config: { generations: [2, 1, 2], showLevels: false, showEvolution: false, roundSeconds: 15, rounds: 4 },
  steps: [
    // Ronda 1 (1000–16000), Poliwhirl: pistas a 8000 y 15000; la siguiente caería después del cierre.
    guess('p1', 'poliwag', 2_000),
    guess('p1', 'poliwrath', 3_000),
    timeout(8_000),
    timeout(15_000),
    guess('p2', 'poliwhirl', 15_500),
    timeout(16_000),
    timeout(20_000),
    // Ronda 2 (20000–35000), Elekid: Bruno acierta y la desconexión de Ana resuelve la ronda.
    guess('p2', 'elekid', 21_000),
    { kind: 'presence', players: [{ ...ana, connected: false }, bruno], now: 22_000 },
    timeout(26_000),
    // Ronda 3 (26000–41000), Victreebel: sin grupos extra (nextTransitionAt nulo). Ana observa y vuelve.
    guess('p1', 'victreebel', 27_000),
    { kind: 'presence', players: [ana, bruno], now: 28_000 },
    timeout(30_000),
    guess('p1', 'victreebel', 31_000),
    guess('p2', 'weepinbell', 32_000),
    guess('p2', 'victreebel', 32_500),
    timeout(41_000),
    timeout(45_000),
    // Ronda 4 (45000–60000), Suicune: la pista de 52000 llega justo en su plazo.
    timeout(52_000),
    guess('p1', 'suicune', 53_000),
    guess('p2', 'suicune', 54_000),
    timeout(58_000),
  ],
};

const exhaustedHints: GoldenScenario = {
  name: 'exhausted-hints',
  seed: 801,
  catalog: 'gen1-2',
  players: [bruno, ana],
  config: { ...baseConfig, roundSeconds: 120 },
  steps: [
    // Ronda 1 (1000–121000), Exeggutor: un solo grupo extra; tras revelarlo no quedan pistas pendientes.
    timeout(8_000),
    guess('p1', 'exeggcute', 9_000),
    guess('p2', 'exeggutor', 10_000),
    guess('p1', 'exeggutor', 10_500),
    timeout(14_500),
    // Ronda 2 (14500–134500), Pinsir: un timeout muy tardío revela todos los grupos de golpe.
    timeout(80_000),
    guess('p1', 'pinsir', 81_000),
    timeout(134_500),
    timeout(138_500),
    // Ronda 3 (138500–258500), Jigglypuff: tres grupos iniciales; nadie acierta.
    guess('p2', 'clefairy', 139_000),
    guess('p2', 'wigglytuff', 139_999),
    guess('p2', 'wigglytuff', 140_000),
    timeout(258_500),
    timeout(262_500),
  ],
};

const disconnectedNotMissed: GoldenScenario = {
  name: 'disconnected-not-missed',
  seed: 812,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: baseConfig,
  steps: [
    // Ronda 1 (1000–31000), Dodrio: Ana acierta, Carla se desconecta y la ronda se resuelve por tiempo; solo Bruno suma missed.
    guess('p1', 'dodrio', 1_500),
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 2_000 },
    timeout(31_000),
    timeout(35_000),
    // Ronda 2 (35000–65000), Farfetch'd: Carla vuelve y nadie acierta; los tres suman missed.
    { kind: 'presence', players: [ana, bruno, carla], now: 36_000 },
    timeout(65_000),
    timeout(69_000),
    // Ronda 3 (69000–99000), Persian: resolución por tiempo y fin de partida.
    timeout(99_000),
    timeout(103_000),
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 806,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: baseConfig,
  steps: [
    guess('p1', 'pikachu', 2_000),
    // actionSchema es .strict() y limita pokemonId a 64 caracteres: la acción no valida y detiene el escenario.
    guess('p2', 'x'.repeat(65), 3_000),
    guess('p2', 'raichu', 4_000),
  ],
};

export const learnsetGuessScenarios: GoldenEngineEntry = {
  module: learnsetGuessGame,
  scenarios: [hintsAndRace, hiddenLevels, exhaustedHints, invalidActionStops, disconnectedNotMissed],
  configCases: [
    // Válidos: normalización de generaciones y límites.
    { ...baseConfig, generations: [2, 1, 2] },
    { ...baseConfig, generations: [9] },
    { ...baseConfig, generations: [1, 9] },
    { ...baseConfig, roundSeconds: 15, rounds: 1 },
    { ...baseConfig, roundSeconds: 120, rounds: 20 },
    { ...baseConfig, roundSeconds: 15.0 },
    { ...baseConfig, showLevels: false, showEvolution: false },
    // Inválidos: límites, tipos y esquema .strict().
    { ...baseConfig, roundSeconds: 14 },
    { ...baseConfig, roundSeconds: 121 },
    { ...baseConfig, rounds: 0 },
    { ...baseConfig, rounds: 21 },
    { ...baseConfig, rounds: 2.5 },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, generations: [1.5] },
    { ...baseConfig, generations: 1 },
    { ...baseConfig, showLevels: 'true' },
    { ...baseConfig, showEvolution: 1 },
    { ...baseConfig, unknownKey: 'no se admite' },
    { ...baseConfig, rounds: undefined },
    { generations: [1], showLevels: true, roundSeconds: 30, rounds: 3 },
    'generations',
    [],
    null,
  ],
};
