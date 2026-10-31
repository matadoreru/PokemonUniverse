// Escenarios dorados de Secret Ranking. Cada ronda consume, en orden, una extracción para la pregunta y la baraja de
// los Pokémon no usados (y otra baraja si quedan menos de cinco); ni createInitialState ni las acciones consumen random.
import { secretRankingGame } from '../../dist/index.js';
import type { GamePlayer, SubjectiveCategory } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };
const dani: GamePlayer = { id: 'p4', displayName: 'Dani' };

function rank(playerId: string, pokemonIds: string[], now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'SUBMIT_RANKING', pokemonIds }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

const hostCategories: SubjectiveCategory[] = [
  { id: 'host-1', text: 'De más dormilón a menos dormilón' },
  { id: 'host-2', text: 'De mejor a peor cantante de ducha' },
];

const baseConfig = { generations: [1], rounds: 3, roundSeconds: 15, promptSource: 'OFFICIAL', includeForms: false };

const officialDistances: GoldenScenario = {
  name: 'official-distances',
  seed: 731,
  catalog: 'gen1-2',
  players: [ana, bruno, carla, dani],
  config: baseConfig,
  steps: [
    // Ronda 1 (1000–16000): hypno, mr-mime, shellder, wartortle, psyduck. Distancias fraccionarias (tres pares).
    rank('p9', ['hypno', 'mr-mime', 'shellder', 'wartortle', 'psyduck'], 1_500),
    rank('p1', ['hypno', 'mr-mime', 'shellder', 'wartortle', 'pikachu'], 2_000),
    rank('p1', ['hypno', 'mr-mime', 'shellder', 'wartortle', 'psyduck'], 2_500),
    rank('p1', ['psyduck', 'mr-mime', 'shellder', 'wartortle', 'hypno'], 2_600),
    rank('p2', ['mr-mime', 'hypno', 'shellder', 'wartortle', 'psyduck'], 3_000),
    rank('p3', ['hypno', 'wartortle', 'shellder', 'mr-mime', 'psyduck'], 3_500),
    rank('p4', ['hypno', 'mr-mime', 'shellder', 'wartortle', 'psyduck'], 4_000),
    rank('p2', ['hypno', 'mr-mime', 'shellder', 'wartortle', 'psyduck'], 4_500),
    timeout(11_999),
    timeout(12_000),
    // Ronda 2 (12000–27000): marowak, zubat, nidoking, geodude, sandslash. Tres rankings idénticos; Dani llega tarde.
    rank('p1', ['zubat', 'marowak', 'nidoking', 'geodude', 'sandslash'], 13_000),
    rank('p2', ['zubat', 'marowak', 'nidoking', 'geodude', 'sandslash'], 14_000),
    rank('p3', ['zubat', 'marowak', 'nidoking', 'geodude', 'sandslash'], 15_000),
    rank('p4', ['zubat', 'marowak', 'nidoking', 'geodude', 'sandslash'], 27_000),
    timeout(27_000),
    timeout(35_000),
    // Ronda 3 (35000–50000): grimer, alakazam, nidoqueen, clefable, slowbro. Un solo ranking: consenso sin puntos.
    rank('p2', ['slowbro', 'clefable', 'nidoqueen', 'alakazam', 'grimer'], 36_000),
    timeout(49_999),
    timeout(50_000),
    timeout(58_000),
  ],
};

const customCategoriesPresence: GoldenScenario = {
  name: 'custom-categories-presence',
  seed: 733,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  hostCustomCategories: hostCategories,
  config: { ...baseConfig, generations: [2, 1, 2], roundSeconds: 120, promptSource: 'CUSTOM', includeForms: true },
  steps: [
    // Ronda 1 (1000–121000): graveler, umbreon, weezing-galar, weezing, dratini. La desconexión de Carla la cierra.
    rank('p1', ['graveler', 'umbreon', 'weezing-galar', 'weezing', 'dratini'], 2_000),
    rank('p2', ['dratini', 'weezing', 'weezing-galar', 'umbreon', 'graveler'], 3_000),
    { kind: 'presence', players: [ana, bruno, carla], now: 3_500 },
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 4_000 },
    rank('p3', ['graveler', 'umbreon', 'weezing-galar', 'weezing', 'dratini'], 4_500),
    timeout(12_000),
    // Ronda 2 (12000–132000): aerodactyl, slowking, slowbro, grimer-alola, skarmory. Carla vuelve y se va otra vez.
    { kind: 'presence', players: [ana, bruno, carla], now: 13_000 },
    rank('p1', ['slowking', 'slowbro', 'aerodactyl', 'skarmory', 'grimer-alola'], 14_000),
    rank('p2', ['slowbro', 'slowking', 'aerodactyl', 'grimer-alola', 'skarmory'], 15_000),
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 16_000 },
    timeout(24_000),
    // Ronda 3 (24000–144000): ursaring, sentret, sandslash, ampharos, seaking; las preguntas usadas se vacían.
    { kind: 'presence', players: [ana, bruno, carla], now: 25_000 },
    rank('p3', ['seaking', 'ampharos', 'sandslash', 'sentret', 'ursaring'], 26_000),
    rank('p1', ['ursaring', 'sentret', 'sandslash', 'ampharos', 'seaking'], 27_000),
    rank('p2', ['sentret', 'ursaring', 'sandslash', 'seaking', 'ampharos'], 28_000),
    timeout(36_000),
  ],
};

const bothSourcesTimeouts: GoldenScenario = {
  name: 'both-sources-timeouts',
  seed: 773,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  hostCustomCategories: hostCategories,
  config: { ...baseConfig, generations: [2], rounds: 4, roundSeconds: 20, promptSource: 'BOTH' },
  steps: [
    // Ronda 1 (1000–21000): pineco, ledyba, girafarig, snubbull, feraligatr. Dos rankings al vencer el tiempo.
    rank('p1', ['pineco', 'ledyba', 'girafarig', 'snubbull', 'feraligatr'], 2_000),
    rank('p2', ['ledyba', 'pineco', 'girafarig', 'feraligatr', 'snubbull'], 3_000),
    timeout(21_000),
    timeout(29_000),
    // Ronda 2 (29000–49000): pregunta del host; nadie envía y no hay consenso.
    timeout(49_000),
    timeout(57_000),
    // Ronda 3 (57000–77000): granbull, hitmontop, slugma, smoochum, ariados. Empate en la distancia.
    rank('p1', ['granbull', 'hitmontop', 'slugma', 'smoochum', 'ariados'], 58_000),
    rank('p2', ['hitmontop', 'granbull', 'slugma', 'smoochum', 'ariados'], 59_000),
    rank('p3', ['granbull', 'hitmontop', 'slugma', 'ariados', 'smoochum'], 60_000),
    timeout(68_000),
    // Ronda 4 (68000–88000): umbreon, sunkern, meganium, azumarill, togetic.
    rank('p3', ['togetic', 'azumarill', 'meganium', 'sunkern', 'umbreon'], 69_000),
    timeout(88_000),
    timeout(96_000),
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 779,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: baseConfig,
  steps: [
    // Un ranking con un Pokémon repetido no valida (refine de Zod) y detiene el escenario.
    rank('p1', ['pikachu', 'pikachu', 'eevee', 'mew', 'onix'], 2_000),
    rank('p2', ['pikachu', 'eevee', 'mew', 'onix', 'abra'], 3_000),
  ],
};

export const secretRankingScenarios: GoldenEngineEntry = {
  module: secretRankingGame,
  scenarios: [officialDistances, customCategoriesPresence, bothSourcesTimeouts, invalidActionStops],
  configCases: [
    // Válidos: normalización de generaciones, límites, las tres fuentes y enteros con decimal cero.
    { ...baseConfig, generations: [2, 1, 2] },
    { ...baseConfig, generations: [9] },
    { ...baseConfig, rounds: 1, roundSeconds: 15 },
    { ...baseConfig, rounds: 10, roundSeconds: 120 },
    { ...baseConfig, rounds: 3.0 },
    { ...baseConfig, promptSource: 'CUSTOM', includeForms: true },
    { ...baseConfig, promptSource: 'BOTH' },
    // Inválidos: límites, tipos, enum y raíz .strict().
    { ...baseConfig, rounds: 0 },
    { ...baseConfig, rounds: 11 },
    { ...baseConfig, roundSeconds: 14 },
    { ...baseConfig, roundSeconds: 121 },
    { ...baseConfig, roundSeconds: 30.5 },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, includeForms: 'no' },
    { ...baseConfig, promptSource: 'official' },
    { ...baseConfig, unknownKey: 'no se admite' },
    { generations: [1], rounds: 3, roundSeconds: 15, promptSource: 'OFFICIAL' },
    [],
    null,
  ],
};
