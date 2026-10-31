// Escenarios dorados de One of Us Is Fake. Cada ronda consume, en orden: la categoría principal, la del fake, el
// jugador fake y la baraja del orden de revelado. Un desempate que vuelve a empatar entre todos los candidatos consume
// una extracción más para elegir al expulsado. createInitialState no consume random ni comprueba el mínimo de jugadores.
import { oneOfUsIsFakeGame } from '../../dist/index.js';
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
  return { kind: 'action', playerId, action: { type: 'VOTE_PLAYER', playerId: targetId }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

const hostCategories: SubjectiveCategory[] = [
  { id: 'host-1', text: 'Pokémon que se comerían tu bocadillo' },
  { id: 'host-2', text: 'Pokémon que perderían las llaves de casa' },
];

const baseConfig = {
  generations: [1], selectionSeconds: 15, discussionSeconds: 30, rounds: 3, fakeKnows: true, categorySource: 'OFFICIAL',
  includeRegionalForms: false,
};

const officialRevotes: GoldenScenario = {
  name: 'official-revotes',
  seed: 753,
  catalog: 'gen1-2',
  players: [ana, bruno, carla, dani],
  config: baseConfig,
  steps: [
    // Ronda 1 (1000–16000), fake Dani (lo sabe). Errores de selección; Ana cambia de elección.
    select('p9', 'pikachu', 1_500),
    vote('p1', 'p2', 1_800),
    select('p1', 'rattata-alola', 2_000),
    select('p1', 'missingno', 2_100),
    select('p1', 'pikachu', 2_200),
    select('p1', 'eevee', 2_300),
    select('p2', 'snorlax', 3_000),
    select('p3', 'psyduck', 3_500),
    select('p4', 'gengar', 4_000),
    // Revelado (cada 650 ms), luego discusión (6600–36600): los normales descubren a Dani.
    select('p1', 'mew', 4_200),
    vote('p1', 'p2', 4_300),
    timeout(4_649),
    timeout(4_650),
    timeout(5_300),
    timeout(5_950),
    timeout(6_600),
    vote('p1', 'p1', 7_000),
    vote('p1', 'p9', 7_100),
    vote('p1', 'p4', 7_500),
    vote('p1', 'p3', 7_600),
    vote('p2', 'p4', 8_000),
    vote('p3', 'p4', 8_500),
    vote('p4', 'p1', 9_000),
    vote('p2', 'p1', 9_500),
    timeout(15_000),
    // Ronda 2 (15000–30000), fake Carla. Empate total, desempate parcial (tercera votación) y expulsión de Ana.
    select('p1', 'bulbasaur', 16_000),
    select('p2', 'charmander', 16_500),
    select('p3', 'squirtle', 17_000),
    select('p4', 'pidgey', 17_500),
    timeout(18_150),
    timeout(18_800),
    timeout(19_450),
    timeout(20_100),
    vote('p1', 'p2', 21_000),
    vote('p2', 'p1', 21_500),
    vote('p3', 'p4', 22_000),
    vote('p4', 'p3', 22_500),
    vote('p1', 'p2', 23_000),
    vote('p2', 'p1', 23_500),
    vote('p3', 'p1', 24_000),
    vote('p4', 'p2', 24_500),
    vote('p3', 'p4', 25_000),
    vote('p1', 'p2', 25_500),
    vote('p2', 'p1', 26_000),
    vote('p3', 'p1', 26_500),
    vote('p4', 'p1', 54_500),
    timeout(54_500),
    timeout(60_500),
    // Ronda 3 (60500–75500), fake Carla, que elige tarde. Todo por tiempo: desempate total y expulsión al azar.
    select('p1', 'onix', 61_000),
    select('p2', 'abra', 62_000),
    select('p3', 'zubat', 75_500),
    timeout(75_500),
    timeout(76_150),
    timeout(76_800),
    timeout(77_450),
    timeout(78_100),
    timeout(108_100),
    timeout(138_100),
    timeout(144_100),
  ],
};

const customCategoriesPresence: GoldenScenario = {
  name: 'custom-categories-presence',
  seed: 761,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  hostCustomCategories: hostCategories,
  config: {
    ...baseConfig, generations: [2, 1, 2], selectionSeconds: 120, fakeKnows: false, categorySource: 'CUSTOM',
    includeRegionalForms: true,
  },
  steps: [
    // Ronda 1 (1000–121000): solo las dos categorías del host; la desconexión de Carla cierra la selección.
    select('p1', 'raichu-alola', 2_000),
    select('p2', 'chikorita', 3_000),
    { kind: 'presence', players: [ana, bruno, carla], now: 3_500 },
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 4_000 },
    select('p3', 'togepi', 4_100),
    timeout(4_650),
    timeout(5_300),
    timeout(5_950),
    // Discusión (5950–35950): Ana vota y la desconexión de Bruno la cierra.
    vote('p1', 'p2', 6_000),
    { kind: 'presence', players: [ana, { ...bruno, connected: false }, { ...carla, connected: false }], now: 6_500 },
    timeout(12_500),
    // Ronda 2 (12500–132500): todos vuelven; Ana se desconecta y el desempate total se resuelve al azar.
    { kind: 'presence', players: [ana, bruno, carla], now: 13_000 },
    select('p1', 'lapras', 14_000),
    select('p2', 'ditto', 15_000),
    select('p3', 'eevee', 16_000),
    timeout(16_650),
    timeout(17_300),
    timeout(17_950),
    { kind: 'presence', players: [{ ...ana, connected: false }, bruno, carla], now: 18_000 },
    vote('p2', 'p3', 18_500),
    vote('p3', 'p2', 19_000),
    // Ana, desconectada, vota en el instante del cierre del desempate: el plazo se comprueba antes que la presencia.
    vote('p1', 'p2', 49_000),
    vote('p2', 'p3', 19_500),
    vote('p3', 'p2', 20_000),
    timeout(26_000),
    // Ronda 3 (26000–146000).
    { kind: 'presence', players: [ana, bruno, carla], now: 26_500 },
    select('p1', 'mareep', 27_000),
    select('p2', 'wooper', 27_500),
    select('p3', 'sentret', 28_000),
    timeout(28_650),
    timeout(29_300),
    timeout(29_950),
    vote('p1', 'p2', 30_000),
    vote('p2', 'p1', 30_500),
    vote('p3', 'p1', 31_000),
    timeout(37_000),
  ],
};

const bothSourcesTimeouts: GoldenScenario = {
  name: 'both-sources-timeouts',
  seed: 765,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  hostCustomCategories: hostCategories,
  config: { ...baseConfig, categorySource: 'BOTH' },
  steps: [
    // Ronda 1 (1000–16000): categoría del fake del host; nadie elige y la discusión vence con un voto.
    timeout(16_000),
    timeout(16_650),
    timeout(17_300),
    timeout(17_950),
    vote('p1', 'p2', 18_000),
    timeout(47_950),
    timeout(53_950),
    // Ronda 2 (53950–68950): solo Ana elige.
    select('p1', 'magikarp', 54_000),
    timeout(68_950),
    timeout(69_600),
    timeout(70_250),
    timeout(70_900),
    vote('p1', 'p3', 71_000),
    vote('p2', 'p3', 71_500),
    vote('p3', 'p1', 72_000),
    timeout(78_000),
    // Ronda 3 (78000–93000).
    select('p1', 'mew', 79_000),
    select('p2', 'mewtwo', 79_500),
    select('p3', 'ditto', 80_000),
    timeout(80_650),
    timeout(81_300),
    timeout(81_950),
    vote('p1', 'p2', 82_000),
    vote('p2', 'p3', 82_500),
    vote('p3', 'p2', 83_000),
    timeout(89_000),
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 769,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: baseConfig,
  steps: [
    // Un voto sin jugador no valida y detiene el escenario.
    select('p1', 'pikachu', 2_000),
    vote('p2', '', 3_000),
    select('p3', 'eevee', 4_000),
  ],
};

export const oneOfUsIsFakeScenarios: GoldenEngineEntry = {
  module: oneOfUsIsFakeGame,
  scenarios: [officialRevotes, customCategoriesPresence, bothSourcesTimeouts, invalidActionStops],
  configCases: [
    // Válidos: normalización de generaciones, límites, las tres fuentes y enteros con decimal cero.
    { ...baseConfig, generations: [2, 1, 2] },
    { ...baseConfig, generations: [9] },
    { ...baseConfig, selectionSeconds: 15, discussionSeconds: 30, rounds: 1 },
    { ...baseConfig, selectionSeconds: 120, discussionSeconds: 600, rounds: 30 },
    { ...baseConfig, rounds: 3.0 },
    { ...baseConfig, fakeKnows: false, categorySource: 'CUSTOM', includeRegionalForms: true },
    { ...baseConfig, categorySource: 'BOTH' },
    // Inválidos: límites, tipos, enum y raíz .strict().
    { ...baseConfig, selectionSeconds: 14 },
    { ...baseConfig, selectionSeconds: 121 },
    { ...baseConfig, discussionSeconds: 29 },
    { ...baseConfig, discussionSeconds: 601 },
    { ...baseConfig, rounds: 0 },
    { ...baseConfig, rounds: 31 },
    { ...baseConfig, rounds: 2.5 },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, fakeKnows: 'sí' },
    { ...baseConfig, includeRegionalForms: 1 },
    { ...baseConfig, categorySource: 'HOST' },
    { ...baseConfig, unknownKey: 'no se admite' },
    {
      generations: [1], selectionSeconds: 15, discussionSeconds: 30, rounds: 3, fakeKnows: true, categorySource: 'OFFICIAL',
    },
    [],
    null,
  ],
};
