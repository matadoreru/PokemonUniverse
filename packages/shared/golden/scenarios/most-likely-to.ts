// Escenarios dorados de Most Likely To. Cada ronda consume una extracción de random para elegir la pregunta entre las
// no usadas (las usadas se vacían al agotar el mazo); ni createInitialState ni la votación consumen random.
import { mostLikelyToGame } from '../../dist/index.js';
import type { GamePlayer, SubjectiveCategory } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };
const dani: GamePlayer = { id: 'p4', displayName: 'Dani' };

function select(playerId: string, pokemonId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'SELECT_POKEMON', pokemonId }, now };
}
function vote(playerId: string, targetId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'VOTE_ANSWER', playerId: targetId }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

const hostCategories: SubjectiveCategory[] = [
  { id: 'host-1', text: '¿Qué Pokémon sería más probable que se comiese tu bocadillo?' },
  { id: 'host-2', text: '¿Qué Pokémon sería más probable que perdiese las llaves de casa?' },
];

const baseConfig = {
  generations: [1], rounds: 3, selectionSeconds: 15, votingSeconds: 15, promptSource: 'OFFICIAL', includeForms: false,
};

const officialRunoff: GoldenScenario = {
  name: 'official-runoff',
  seed: 711,
  catalog: 'gen1-2',
  players: [ana, bruno, carla, dani],
  config: baseConfig,
  steps: [
    // Ronda 1 (1000–16000): errores de selección; Ana cambia de elección antes de que todos elijan.
    select('p9', 'pikachu', 1_500),
    vote('p1', 'p2', 1_800),
    select('p1', 'rattata-alola', 2_000),
    select('p1', 'missingno', 2_100),
    select('p1', 'pikachu', 2_200),
    select('p1', 'eevee', 2_300),
    select('p2', 'snorlax', 3_000),
    select('p3', 'psyduck', 3_500),
    select('p4', 'gengar', 4_000),
    // Votación (4000–19000): empate entre Ana y Bruno.
    select('p1', 'mew', 4_500),
    vote('p1', 'p1', 5_000),
    vote('p1', 'p9', 5_100),
    vote('p1', 'p2', 5_500),
    vote('p1', 'p3', 5_600),
    vote('p2', 'p1', 6_000),
    vote('p3', 'p2', 6_500),
    vote('p4', 'p1', 7_000),
    // Desempate (7000–22000): Ana gana al vencer el tiempo; el voto de Dani llega tarde.
    vote('p3', 'p4', 7_500),
    vote('p1', 'p1', 7_600),
    vote('p1', 'p2', 8_000),
    vote('p2', 'p1', 8_500),
    vote('p3', 'p1', 9_000),
    vote('p4', 'p2', 22_000),
    timeout(21_999),
    timeout(22_000),
    timeout(30_000),
    // Ronda 2 (30000–45000): solo Ana elige y gana sin votación; Bruno llega tarde.
    select('p1', 'bulbasaur', 31_000),
    select('p2', 'charmander', 45_000),
    timeout(45_000),
    timeout(53_000),
    // Ronda 3 (53000–68000): Dani se desconecta y abre la votación; triple empate y desempate compartido.
    select('p1', 'jigglypuff', 54_000),
    select('p2', 'meowth', 54_500),
    select('p3', 'slowpoke', 55_000),
    { kind: 'presence', players: [ana, bruno, carla, { ...dani, connected: false }], now: 56_000 },
    vote('p1', 'p2', 57_000),
    vote('p2', 'p3', 57_500),
    vote('p3', 'p1', 58_000),
    vote('p1', 'p2', 58_500),
    vote('p2', 'p1', 59_000),
    timeout(73_000),
    timeout(81_000),
  ],
};

const customCategoriesPresence: GoldenScenario = {
  name: 'custom-categories-presence',
  seed: 713,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  hostCustomCategories: hostCategories,
  config: { ...baseConfig, generations: [2, 1, 2], selectionSeconds: 120, promptSource: 'CUSTOM', includeForms: true },
  steps: [
    // Ronda 1 (1000–121000): las formas regionales entran en el pool; la desconexión de Carla abre la votación.
    select('p1', 'raichu-alola', 2_000),
    select('p2', 'chikorita', 3_000),
    { kind: 'presence', players: [ana, bruno, carla], now: 3_500 },
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 4_000 },
    // Votación (4000–19000): Ana vota y la desconexión de Bruno la cierra.
    vote('p1', 'p2', 5_000),
    { kind: 'presence', players: [ana, { ...bruno, connected: false }, { ...carla, connected: false }], now: 6_000 },
    timeout(14_000),
    // Ronda 2 (14000–134000): todos vuelven y nadie elige; la votación se cierra sin candidatos.
    { kind: 'presence', players: [ana, bruno, carla], now: 15_000 },
    timeout(134_000),
    timeout(142_000),
    // Ronda 3 (142000–262000): se vacían las preguntas usadas; Ana gana en solitario.
    select('p1', 'togepi', 143_000),
    select('p2', 'lapras', 144_000),
    select('p3', 'ditto', 145_000),
    vote('p3', 'p1', 146_000),
    vote('p1', 'p3', 147_000),
    vote('p2', 'p1', 148_000),
    timeout(156_000),
  ],
};

const bothSourcesTimeouts: GoldenScenario = {
  name: 'both-sources-timeouts',
  seed: 723,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  hostCustomCategories: hostCategories,
  config: { ...baseConfig, rounds: 4, votingSeconds: 20, promptSource: 'BOTH' },
  steps: [
    // Ronda 1 (1000–16000): eligen dos al vencer la selección; la votación vence con un voto.
    select('p1', 'onix', 2_000),
    select('p3', 'abra', 3_000),
    timeout(16_000),
    vote('p2', 'p3', 17_000),
    timeout(36_000),
    timeout(44_000),
    // Ronda 2 (44000–59000): todos eligen; nadie vota y el empate total pasa a desempate, que también vence.
    select('p1', 'magikarp', 45_000),
    select('p2', 'ditto', 46_000),
    select('p3', 'muk', 47_000),
    timeout(67_000),
    vote('p1', 'p2', 68_000),
    timeout(87_000),
    timeout(95_000),
    // Ronda 3 (95000–110000): pregunta del host; Bruno gana en solitario.
    select('p1', 'zubat', 96_000),
    select('p2', 'golbat', 97_000),
    select('p3', 'golem', 98_000),
    vote('p1', 'p2', 99_000),
    vote('p2', 'p3', 100_000),
    vote('p3', 'p2', 101_000),
    timeout(109_000),
    // Ronda 4 (109000–124000): nadie elige.
    timeout(124_000),
    timeout(132_000),
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 719,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: baseConfig,
  steps: [
    // Un id vacío no valida y detiene el escenario.
    select('p1', 'pikachu', 2_000),
    select('p2', '', 3_000),
    select('p3', 'eevee', 4_000),
  ],
};

export const mostLikelyToScenarios: GoldenEngineEntry = {
  module: mostLikelyToGame,
  scenarios: [officialRunoff, customCategoriesPresence, bothSourcesTimeouts, invalidActionStops],
  configCases: [
    // Válidos: normalización de generaciones, límites, las tres fuentes y enteros con decimal cero.
    { ...baseConfig, generations: [2, 1, 2] },
    { ...baseConfig, generations: [9] },
    { ...baseConfig, rounds: 1, selectionSeconds: 15, votingSeconds: 15 },
    { ...baseConfig, rounds: 10, selectionSeconds: 120, votingSeconds: 120 },
    { ...baseConfig, rounds: 3.0 },
    { ...baseConfig, promptSource: 'CUSTOM', includeForms: true },
    { ...baseConfig, promptSource: 'BOTH' },
    // Inválidos: límites, tipos, enum y raíz .strict().
    { ...baseConfig, rounds: 0 },
    { ...baseConfig, rounds: 11 },
    { ...baseConfig, selectionSeconds: 14 },
    { ...baseConfig, selectionSeconds: 121 },
    { ...baseConfig, votingSeconds: 14 },
    { ...baseConfig, votingSeconds: 121 },
    { ...baseConfig, votingSeconds: 30.5 },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, includeForms: 'no' },
    { ...baseConfig, promptSource: 'HOST' },
    { ...baseConfig, unknownKey: 'no se admite' },
    { generations: [1], rounds: 3, selectionSeconds: 15, votingSeconds: 15, promptSource: 'OFFICIAL' },
    [],
    null,
  ],
};
