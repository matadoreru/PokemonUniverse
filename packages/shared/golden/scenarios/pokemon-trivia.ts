// Escenarios dorados de Pokémon Trivia. Cada ronda genera su pregunta con random() (orden de tipos, objetivo,
// distractores y orden de opciones), así que el seed fija las preguntas; las respuestas no consumen random().
import { pokemonTriviaGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };

const allTypes = ['TYPE', 'GENERATION', 'HP', 'ATTACK', 'DEFENSE', 'SPECIAL_ATTACK', 'SPECIAL_DEFENSE', 'SPEED', 'BST', 'HEIGHT', 'WEIGHT', 'DEX_NUMBER'];
const baseConfig = { generations: [1, 2], roundSeconds: 20, rounds: 4, optionCount: 4, difficulty: 'NORMAL', questionTypes: allTypes };

function answer(playerId: string, optionId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'ANSWER', optionId }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

const mixedQuestionTypes: GoldenScenario = {
  name: 'mixed-question-types',
  seed: 601,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: baseConfig,
  steps: [
    // Ronda 1 (1000–21000): espectador, respuesta bloqueada y reveal al responder todos.
    answer('p9', 'A', 2_000),
    answer('p1', 'A', 3_000),
    answer('p1', 'B', 3_500),
    answer('p2', 'B', 5_000),
    answer('p3', 'D', 9_000),
    // Resultados (9000–13000).
    answer('p2', 'A', 10_000),
    timeout(13_000),
    // Ronda 2 (13000–33000): una respuesta llega justo al límite y revela la ronda aunque se rechace.
    answer('p1', 'B', 14_000),
    answer('p3', 'A', 33_000),
    timeout(37_000),
    // Ronda 3 (37000–57000): se agota sin respuestas.
    timeout(57_000),
    timeout(61_000),
    // Ronda 4 (61000–81000).
    answer('p2', 'C', 62_000),
    answer('p3', 'D', 70_000),
    answer('p1', 'A', 80_999),
    timeout(85_000),
  ],
};

const threeOptionsHard: GoldenScenario = {
  name: 'three-options-hard',
  seed: 602,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { ...baseConfig, generations: [1], roundSeconds: 15, optionCount: 3, difficulty: 'HARD', questionTypes: ['HEIGHT', 'WEIGHT', 'HP'] },
  steps: [
    // Ronda 1 (1000–16000): con tres opciones la D no existe; Carla se desconecta y la ronda se resuelve.
    answer('p1', 'D', 2_000),
    answer('p1', 'A', 2_500),
    answer('p2', 'B', 3_000),
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 4_000 },
    timeout(8_000),
    // Ronda 2 (8000–23000): Carla desconectada observa.
    answer('p3', 'A', 9_000),
    answer('p1', 'C', 10_000),
    answer('p2', 'A', 11_000),
    timeout(15_000),
    // Ronda 3 (15000–30000): Carla vuelve; la ronda espera su respuesta.
    { kind: 'presence', players: [ana, bruno, carla], now: 16_000 },
    answer('p1', 'B', 17_000),
    answer('p2', 'A', 18_000),
    answer('p3', 'C', 19_000),
    timeout(23_000),
    // Ronda 4 (23000–38000).
    answer('p3', 'B', 24_000),
    timeout(38_000),
    timeout(42_000),
  ],
};

const generationOnlyReusesKeys: GoldenScenario = {
  name: 'generation-only-reuses-keys',
  seed: 603,
  catalog: 'gen1-2',
  players: [ana],
  config: { ...baseConfig, roundSeconds: 10, rounds: 4, difficulty: 'EASY', questionTypes: ['GENERATION'] },
  steps: [
    // Solo hay dos claves (GENERATION:1 y GENERATION:2): a partir de la tercera ronda se reinician las usadas.
    answer('p1', 'B', 2_000),
    timeout(6_000),
    answer('p1', 'B', 7_000),
    timeout(11_000),
    answer('p1', 'A', 12_000),
    timeout(16_000),
    answer('p1', 'D', 17_000),
    timeout(21_000),
  ],
};

const easyTypeAndDex: GoldenScenario = {
  name: 'easy-type-and-dex',
  seed: 604,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { ...baseConfig, generations: [2], rounds: 5, difficulty: 'EASY', questionTypes: ['TYPE', 'DEX_NUMBER', 'BST', 'SPEED', 'DEX_NUMBER'] },
  steps: [
    answer('p1', 'A', 3_000),
    answer('p2', 'B', 4_000),
    timeout(8_000),
    answer('p2', 'C', 9_000),
    answer('p1', 'D', 10_000),
    timeout(14_000),
    answer('p1', 'D', 16_000),
    timeout(34_000),
    timeout(38_000),
    answer('p2', 'A', 39_000),
    answer('p1', 'D', 40_000),
    timeout(44_000),
    answer('p1', 'A', 45_000),
    answer('p2', 'B', 46_000),
    timeout(50_000),
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 605,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: baseConfig,
  steps: [
    answer('p1', 'A', 2_000),
    // optionId fuera de A–D: la acción no valida y el escenario se detiene.
    answer('p2', 'E', 3_000),
    answer('p2', 'B', 4_000),
  ],
};

export const pokemonTriviaScenarios: GoldenEngineEntry = {
  module: pokemonTriviaGame,
  scenarios: [mixedQuestionTypes, threeOptionsHard, generationOnlyReusesKeys, easyTypeAndDex, invalidActionStops],
  configCases: [
    // Válidos: normalización de generaciones, límites y tipos repetidos (no se deduplican).
    { ...baseConfig, generations: [2, 1, 1] },
    { ...baseConfig, roundSeconds: 10, rounds: 1, optionCount: 3 },
    { ...baseConfig, roundSeconds: 60, rounds: 30, optionCount: 4 },
    { ...baseConfig, roundSeconds: 10.0, difficulty: 'HARD' },
    { ...baseConfig, questionTypes: ['HP', 'HP', 'TYPE', 'HP', 'HP', 'HP', 'HP', 'HP', 'HP', 'HP', 'HP', 'HP'] },
    { ...baseConfig, generations: [1, 2], questionTypes: ['GENERATION'] },
    { ...baseConfig, generations: [1], questionTypes: ['GENERATION', 'TYPE'] },
    // Inválidos: límites, enumerados, esquema .strict() y superRefine de generación.
    { ...baseConfig, roundSeconds: 9 },
    { ...baseConfig, roundSeconds: 61 },
    { ...baseConfig, rounds: 0 },
    { ...baseConfig, rounds: 31 },
    { ...baseConfig, optionCount: 2 },
    { ...baseConfig, optionCount: 5 },
    { ...baseConfig, optionCount: 3.5 },
    { ...baseConfig, difficulty: 'VERY_HARD' },
    { ...baseConfig, questionTypes: [] },
    { ...baseConfig, questionTypes: [...allTypes, 'HP'] },
    { ...baseConfig, questionTypes: ['COLOR'] },
    { ...baseConfig, generations: [1], questionTypes: ['GENERATION'] },
    { ...baseConfig, generations: [] },
    { ...baseConfig, unknownKey: 'no se admite' },
    { ...baseConfig, rounds: '4' },
    { ...baseConfig, difficulty: undefined },
    [],
    null,
  ],
};
