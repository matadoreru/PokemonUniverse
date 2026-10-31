// Escenarios dorados de Would You Rather Pokémon. Cada ronda consume una extracción de random para elegir la pareja
// entre las no usadas (las usadas se vacían al agotar el mazo); createInitialState no consume random.
import { wouldYouRatherGame } from '../../dist/index.js';
import type { GamePlayer, WouldYouRatherPromptPair } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };
const dani: GamePlayer = { id: 'p4', displayName: 'Dani' };

function ballot(playerId: string, preference: string, prediction: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'SUBMIT_BALLOT', preference, prediction }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

const hostPrompts: WouldYouRatherPromptPair[] = [
  { id: 'host-1', optionA: 'Que Pikachu te despierte con Impactrueno', optionB: 'Que Jigglypuff te duerma en el examen' },
  { id: 'host-2', optionA: 'Bañarte con un Tentacruel', optionB: 'Cenar con un Grimer' },
];

const baseConfig = { rounds: 3, roundSeconds: 15, promptSource: 'OFFICIAL' };

const officialMajority: GoldenScenario = {
  name: 'official-majority',
  seed: 701,
  catalog: 'gen1-2',
  players: [ana, bruno, carla, dani],
  config: baseConfig,
  steps: [
    // Ronda 1 (1000–16000): un espectador no participa y la papeleta repetida se rechaza.
    ballot('p9', 'A', 'A', 1_500),
    ballot('p1', 'A', 'A', 2_000),
    ballot('p1', 'B', 'B', 2_500),
    ballot('p2', 'A', 'B', 3_000),
    ballot('p3', 'B', 'A', 3_500),
    // Mayoría A (3 contra 1): Ana hace una ronda perfecta.
    ballot('p4', 'A', 'A', 4_000),
    ballot('p4', 'A', 'A', 4_500),
    timeout(11_999),
    timeout(12_000),
    // Ronda 2 (12000–27000): mayoría A (2 contra 1); Dani llega tarde.
    ballot('p1', 'A', 'B', 13_000),
    ballot('p2', 'B', 'B', 14_000),
    ballot('p3', 'A', 'A', 15_000),
    ballot('p4', 'B', 'A', 27_000),
    timeout(27_000),
    ballot('p4', 'B', 'A', 28_000),
    timeout(35_000),
    // Ronda 3 (35000–50000): mayoría B con dos papeletas al vencer el tiempo.
    ballot('p2', 'B', 'B', 36_000),
    ballot('p3', 'B', 'A', 37_000),
    timeout(50_000),
    timeout(58_000),
  ],
};

const customPromptsPresence: GoldenScenario = {
  name: 'custom-prompts-presence',
  seed: 703,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  hostWouldYouRatherPrompts: hostPrompts,
  config: { rounds: 3, roundSeconds: 120, promptSource: 'CUSTOM' },
  steps: [
    // Ronda 1 (1000–121000): solo dos parejas del host; la desconexión de Carla cierra la ronda.
    ballot('p1', 'B', 'B', 2_000),
    ballot('p2', 'B', 'A', 3_000),
    { kind: 'presence', players: [ana, bruno, carla], now: 3_500 },
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 4_000 },
    ballot('p3', 'A', 'A', 4_500),
    timeout(12_000),
    // Ronda 2 (12000–132000): agota el mazo y las usadas se vacían.
    ballot('p1', 'A', 'A', 13_000),
    { kind: 'presence', players: [ana, bruno, carla], now: 14_000 },
    ballot('p3', 'A', 'B', 15_000),
    ballot('p2', 'B', 'B', 16_000),
    timeout(24_000),
    // Ronda 3 (24000–144000): Bruno se desconecta tras votar Ana y Carla.
    ballot('p1', 'B', 'A', 25_000),
    ballot('p3', 'B', 'B', 26_000),
    { kind: 'presence', players: [ana, { ...bruno, connected: false }, carla], now: 27_000 },
    timeout(35_000),
  ],
};

const bothSourcesTimeouts: GoldenScenario = {
  name: 'both-sources-timeouts',
  seed: 708,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  hostWouldYouRatherPrompts: hostPrompts,
  config: { rounds: 4, roundSeconds: 20, promptSource: 'BOTH' },
  steps: [
    // Ronda 1 (1000–21000): nadie vota; la ronda se cierra sin mayoría.
    timeout(21_000),
    timeout(29_000),
    // Ronda 2 (29000–49000): pareja del host; una papeleta sola es mayoría.
    ballot('p2', 'A', 'A', 30_000),
    timeout(49_000),
    timeout(57_000),
    // Ronda 3 (57000–77000).
    ballot('p1', 'B', 'A', 58_000),
    ballot('p3', 'B', 'B', 59_000),
    timeout(77_000),
    timeout(85_000),
    // Ronda 4 (85000–105000).
    ballot('p1', 'A', 'A', 86_000),
    ballot('p2', 'A', 'B', 87_000),
    ballot('p3', 'B', 'A', 88_000),
    timeout(96_000),
  ],
};

const officialIgnoresHost: GoldenScenario = {
  name: 'official-ignores-host',
  seed: 709,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  hostWouldYouRatherPrompts: hostPrompts,
  config: { ...baseConfig, rounds: 1 },
  steps: [
    // Con OFFICIAL las parejas del host no entran en el mazo; una opción fuera del enum no valida.
    ballot('p1', 'A', 'B', 2_000),
    ballot('p2', 'C', 'A', 3_000),
    ballot('p3', 'A', 'A', 4_000),
  ],
};

export const wouldYouRatherScenarios: GoldenEngineEntry = {
  module: wouldYouRatherGame,
  scenarios: [officialMajority, customPromptsPresence, bothSourcesTimeouts, officialIgnoresHost],
  configCases: [
    // Válidos: límites, las tres fuentes y enteros con decimal cero.
    baseConfig,
    { ...baseConfig, rounds: 1, roundSeconds: 15 },
    { ...baseConfig, rounds: 10, roundSeconds: 120 },
    { ...baseConfig, rounds: 3.0 },
    { ...baseConfig, promptSource: 'CUSTOM' },
    { ...baseConfig, promptSource: 'BOTH' },
    // Inválidos: límites, tipos, enum y raíz .strict().
    { ...baseConfig, rounds: 0 },
    { ...baseConfig, rounds: 11 },
    { ...baseConfig, roundSeconds: 14 },
    { ...baseConfig, roundSeconds: 121 },
    { ...baseConfig, roundSeconds: 30.5 },
    { ...baseConfig, rounds: '3' },
    { ...baseConfig, promptSource: 'official' },
    { ...baseConfig, promptSource: 'HOST' },
    { ...baseConfig, unknownKey: 'no se admite' },
    { rounds: 3, roundSeconds: 15 },
    [],
    null,
  ],
};
