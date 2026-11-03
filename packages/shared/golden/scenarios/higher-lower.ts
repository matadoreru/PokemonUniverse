// Escenarios dorados de Higher or Lower (motor piloto de la etapa 2A). Cada escenario juega ≥ 3 rondas con un
// seed distinto para que cualquier deriva en el consumo de random() aparezca en la elección de categoría o Pokémon.
import { higherLowerGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };

const baseConfig = {
  generations: [1, 2],
  categories: ['DEX_NUMBER', 'HP', 'ATTACK', 'DEFENSE', 'SPECIAL_ATTACK', 'SPECIAL_DEFENSE', 'SPEED', 'BASE_STAT_TOTAL'],
  showPreviousValue: true,
  answerVisibility: 'LIVE',
  difficulty: 'NORMAL',
  roundSeconds: 20,
  rounds: 3,
};

function answer(playerId: string, choice: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'ANSWER', choice }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

const twoPlayersThreeRounds: GoldenScenario = {
  name: 'two-players-three-rounds',
  seed: 11,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { ...baseConfig, answerVisibility: 'REVEAL' },
  steps: [
    // Ronda 1 (activa 1000–21000): respuestas ocultas hasta el reveal; duplicado y ajeno rechazados.
    answer('p1', 'HIGHER', 3_000),
    answer('p1', 'LOWER', 3_500),
    answer('p9', 'HIGHER', 4_000),
    answer('p2', 'LOWER', 5_000),
    // Resultados (5000–8000): la ronda ya no está activa.
    answer('p1', 'SAME', 6_000),
    timeout(7_999),
    timeout(8_000),
    // Ronda 2 (activa 8000–28000): Bruno no responde y se revela por tiempo.
    answer('p1', 'SAME', 10_000),
    timeout(27_999),
    timeout(28_000),
    timeout(31_000),
    // Ronda 3 (activa 31000–51000): una respuesta justo en el límite llega tarde.
    answer('p2', 'HIGHER', 51_000),
    timeout(51_000),
    timeout(54_000),
  ],
};

const realtimeVisibility: GoldenScenario = {
  name: 'realtime-visibility',
  seed: 22,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { ...baseConfig, generations: [2], categories: ['HP', 'SPEED'], difficulty: 'EASY', roundSeconds: 15 },
  steps: [
    // Ronda 1 (activa 1000–16000): cada respuesta se ve en tiempo real.
    answer('p2', 'LOWER', 2_000),
    answer('p1', 'HIGHER', 2_500),
    answer('p3', 'SAME', 4_000),
    timeout(7_000),
    // Ronda 2 (activa 7000–22000).
    answer('p3', 'HIGHER', 9_000),
    answer('p1', 'LOWER', 12_000),
    timeout(22_000),
    timeout(25_000),
    // Ronda 3 (activa 25000–40000).
    answer('p1', 'HIGHER', 26_000),
    answer('p2', 'HIGHER', 27_000),
    answer('p3', 'LOWER', 28_000),
    timeout(31_000),
  ],
};

const presenceResolvesRound: GoldenScenario = {
  name: 'presence-resolves-round',
  seed: 33,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { ...baseConfig, difficulty: 'HARD', categories: ['ATTACK', 'DEFENSE', 'SPEED'], rounds: 3 },
  steps: [
    // Ronda 1: Ana y Bruno responden; Carla se desconecta y la ronda se resuelve sin esperar al tiempo.
    answer('p1', 'HIGHER', 2_000),
    answer('p2', 'LOWER', 3_000),
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 4_000 },
    timeout(7_000),
    // Ronda 2: Carla desconectada no puede responder; con los dos conectados basta.
    answer('p3', 'HIGHER', 8_000),
    answer('p2', 'HIGHER', 9_000),
    answer('p1', 'SAME', 10_000),
    timeout(13_000),
    // Ronda 3: Carla vuelve (no resuelve: aún no ha respondido) y se agota el tiempo.
    { kind: 'presence', players: [ana, bruno, carla], now: 14_000 },
    answer('p1', 'LOWER', 15_000),
    answer('p2', 'LOWER', 16_000),
    timeout(33_000),
    timeout(36_000),
  ],
};

const veryHardSinglePlayer: GoldenScenario = {
  name: 'difficulty-very-hard-single-player',
  seed: 44,
  catalog: 'gen1-2',
  players: [ana],
  config: {
    ...baseConfig,
    generations: [1],
    categories: ['BASE_STAT_TOTAL', 'DEX_NUMBER', 'ATTACK'],
    showPreviousValue: false,
    difficulty: 'VERY_HARD',
    roundSeconds: 10,
    rounds: 5,
  },
  steps: [
    // Cuatro aciertos seguidos (SAME vale 3; la racha 3 y 4 suma +1) y la quinta ronda se agota sin respuesta.
    answer('p1', 'SAME', 2_000),
    timeout(5_000),
    answer('p1', 'LOWER', 6_000),
    timeout(9_000),
    answer('p1', 'HIGHER', 10_000),
    timeout(13_000),
    answer('p1', 'LOWER', 14_000),
    timeout(17_000),
    timeout(28_000),
    timeout(31_000),
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 55,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { ...baseConfig, difficulty: 'VERY_EASY' },
  steps: [
    answer('p1', 'HIGHER', 2_000),
    // actionSchema es .strict(): una clave desconocida invalida la acción y detiene el escenario.
    { kind: 'action', playerId: 'p2', action: { type: 'ANSWER', choice: 'LOWER', extra: true }, now: 3_000 },
    answer('p2', 'LOWER', 4_000),
  ],
};

const disconnectedCannotAnswer: GoldenScenario = {
  name: 'disconnected-cannot-answer',
  seed: 66,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { ...baseConfig, answerVisibility: 'REVEAL', roundSeconds: 15 },
  steps: [
    // Ronda 1 (activa 1000–16000): Carla se desconecta sin responder; su proyección privada pasa a canAnswer false
    // mientras la ronda sigue activa, y su respuesta se rechaza.
    answer('p1', 'HIGHER', 2_000),
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 3_000 },
    answer('p3', 'LOWER', 3_500),
    answer('p2', 'LOWER', 4_000),
    timeout(7_000),
    // Ronda 2 (activa 7000–22000): Carla vuelve y recupera los botones.
    { kind: 'presence', players: [ana, bruno, carla], now: 8_000 },
    answer('p3', 'SAME', 9_000),
    answer('p1', 'LOWER', 10_000),
    answer('p2', 'HIGHER', 11_000),
    timeout(14_000),
    // Ronda 3 (activa 14000–29000): Bruno se desconecta tras responder y la ronda se agota.
    answer('p2', 'HIGHER', 15_000),
    { kind: 'presence', players: [ana, { ...bruno, connected: false }, carla], now: 16_000 },
    timeout(29_000),
    timeout(32_000),
  ],
};

const revealDefaultSpeedBonus: GoldenScenario = {
  name: 'reveal-default-speed-bonus',
  seed: 707,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { ...baseConfig, answerVisibility: 'REVEAL' },
  steps: [
    // Ronda 1 (activa 1000–21000, mitad en 11000): las respuestas siguen ocultas hasta el reveal. Ana acierta a
    // 10999 ms (+1 de rapidez), Bruno acierta justo en la mitad (sin bonus) y Carla falla rápido (sin bonus).
    answer('p3', 'HIGHER', 2_000),
    answer('p1', 'LOWER', 10_999),
    answer('p2', 'LOWER', 11_000),
    timeout(14_000),
    // Ronda 2 (activa 14000–34000, mitad en 24000): acierto rápido y lento; Carla no responde.
    answer('p2', 'LOWER', 15_000),
    answer('p1', 'LOWER', 30_000),
    timeout(34_000),
    timeout(37_000),
    // Ronda 3 (activa 37000–57000): todos aciertan deprisa; Ana y Bruno encadenan racha 3 (+1).
    answer('p1', 'HIGHER', 38_000),
    answer('p2', 'HIGHER', 39_000),
    answer('p3', 'HIGHER', 40_000),
    timeout(43_000),
  ],
};

export const higherLowerScenarios: GoldenEngineEntry = {
  module: higherLowerGame,
  scenarios: [twoPlayersThreeRounds, realtimeVisibility, presenceResolvesRound, veryHardSinglePlayer, invalidActionStops, disconnectedCannotAnswer, revealDefaultSpeedBonus],
  configCases: [
    // Válidos: normalización de generaciones (dedup + orden) y categorías (dedup, primer orden), clave extra ignorada.
    { ...baseConfig, generations: [2, 1, 2, 1] },
    { ...baseConfig, categories: ['SPEED', 'HP', 'SPEED', 'DEX_NUMBER', 'HP'] },
    { ...baseConfig, generations: [9, 3, 3], unknownKey: 'se ignora' },
    { ...baseConfig, roundSeconds: 10, rounds: 1, difficulty: 'VERY_HARD', answerVisibility: 'REVEAL', showPreviousValue: false },
    { ...baseConfig, roundSeconds: 60, rounds: 50 },
    // Inválidos.
    { ...baseConfig, generations: [] },
    { ...baseConfig, roundSeconds: 9 },
    { ...baseConfig, rounds: 51 },
    { ...baseConfig, roundSeconds: 10.5 },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, categories: [] },
    { ...baseConfig, categories: ['WEIGHT'] },
    { ...baseConfig, difficulty: 'IMPOSSIBLE' },
    { ...baseConfig, answerVisibility: 'HIDDEN' },
    // El literal anterior al renombrado (§11.2) ya no valida.
    { ...baseConfig, answerVisibility: 'REALTIME' },
    { ...baseConfig, showPreviousValue: 'yes' },
    { ...baseConfig, rounds: '3' },
    { ...baseConfig, rounds: undefined },
    [],
    null,
  ],
};
