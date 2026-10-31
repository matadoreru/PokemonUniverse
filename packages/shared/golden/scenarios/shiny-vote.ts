// Escenarios dorados de Shiny Quiz. El token de recursos es solo `now` en base 36 (sin random()). Las opciones de la
// ronda 1 salen en start y las demás al revelar la ronda anterior (prepareNextRound): takeRandom, el índice correcto y
// un random() por cada señuelo (useShinySpriteForFake). Cada señuelo lleva la paleta siguiente de FAKE_SHINY_PALETTES.
import { shinyVoteGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };

const baseConfig = { generations: [1], roundSeconds: 20, rounds: 3, candidateMode: 'SAME_POKEMON', optionCount: 4, showVotes: true };

function vote(playerId: string, optionId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'VOTE', optionId }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}
function asset(assetToken: string, roundNumber: number, assetId: string, now: number): GoldenStep {
  return { kind: 'asset', assetToken, roundNumber, assetId, now };
}

// Seed 931 desde now = 1000 (token `rs`): Diglett (correcta A), Goldeen (C) y Weedle (D).
const samePokemon: GoldenScenario = {
  name: 'same-pokemon-show-votes',
  seed: 931,
  catalog: 'gen1-2',
  // encodeURIComponent: el espacio, la barra y la ü se codifican en las rutas públicas.
  roomCode: 'A B/ü',
  players: [ana, bruno, carla],
  config: baseConfig,
  steps: [
    // Ronda 1 (1000–21000): el shiny oficial es PIXEL_ART y cada señuelo PALETTE_RECOLOR con su paleta.
    asset('rs', 1, 'A', 1_100),
    asset('rs', 1, 'B', 1_100),
    asset('rs', 1, 'D', 1_100),
    asset('rs', 1, 'E', 1_100),
    asset('rs-otra', 1, 'A', 1_100),
    asset('rs', 0, 'A', 1_100),
    vote('p9', 'A', 1_500),
    vote('p1', 'E', 1_600),
    vote('p1', 'B', 2_000),
    vote('p1', 'A', 2_500),
    // Carla se desconecta: no puede votar y ya no hace falta para revelar.
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 3_500 },
    vote('p3', 'A', 3_600),
    vote('p2', 'A', 4_000),
    vote('p1', 'A', 4_500),
    asset('rs', 1, 'A', 4_600),
    timeout(7_000),
    // Ronda 2 (7000–27000): la acción tardía revela la ronda (y prepara la siguiente) aunque se rechace.
    { kind: 'presence', players: [ana, bruno, carla], now: 7_500 },
    vote('p1', 'C', 8_000),
    vote('p3', 'C', 8_500),
    vote('p2', 'B', 27_000),
    asset('rs', 1, 'A', 27_100),
    asset('rs', 2, 'C', 27_100),
    timeout(30_000),
    // Ronda 3 (30000–50000): nadie vota.
    timeout(50_000),
    timeout(53_000),
    asset('rs', 3, 'D', 53_100),
  ],
};

// Seed 932 desde una fecha realista: seis Pokémon distintos (cinco paletas de señuelo) con votos ocultos.
const t0 = 1_767_225_600_000;
const token = t0.toString(36);
const differentPokemon: GoldenScenario = {
  name: 'different-pokemon-hidden-votes',
  seed: 932,
  catalog: 'gen1-2',
  startNow: t0,
  players: [ana, bruno],
  config: { generations: [2, 1], roundSeconds: 10, rounds: 3, candidateMode: 'DIFFERENT_POKEMON', optionCount: 6, showVotes: false },
  steps: [
    // Ronda 1: Moltres, Cloyster, Blissey, Mewtwo (correcta D), Snubbull y Flareon.
    ...['A', 'B', 'C', 'D', 'E', 'F'].map((optionId) => asset(token, 1, optionId, t0 + 500)),
    vote('p1', 'D', t0 + 1_000),
    vote('p2', 'A', t0 + 2_000),
    timeout(t0 + 5_000),
    // Ronda 2 (correcta F).
    vote('p2', 'F', t0 + 6_000),
    asset(token, 1, 'D', t0 + 6_100),
    asset(token, 2, 'F', t0 + 6_100),
    timeout(t0 + 15_000),
    timeout(t0 + 18_000),
    // Ronda 3 (correcta D): los dos aciertan; el orden de voto da el bonus.
    vote('p2', 'D', t0 + 19_000),
    vote('p1', 'D', t0 + 19_500),
    timeout(t0 + 22_500),
  ],
};

// Seed 933, tres opciones en solitario: Poliwag (correcta C); una acción inválida detiene el escenario.
const threeOptions: GoldenScenario = {
  name: 'three-options-invalid-action',
  seed: 933,
  catalog: 'gen1-2',
  players: [ana],
  config: { ...baseConfig, generations: [1, 2], roundSeconds: 10, optionCount: 3 },
  steps: [
    asset('rs', 1, 'A', 1_100),
    asset('rs', 1, 'B', 1_100),
    asset('rs', 1, 'C', 1_100),
    asset('rs', 1, 'D', 1_100),
    vote('p1', 'C', 2_000),
    timeout(5_000),
    // optionId distingue mayúsculas: la acción no valida y el escenario se detiene.
    { kind: 'action', playerId: 'p1', action: { type: 'VOTE', optionId: 'b' }, now: 6_000 },
    vote('p1', 'B', 7_000),
  ],
};

export const shinyVoteScenarios: GoldenEngineEntry = {
  module: shinyVoteGame,
  scenarios: [samePokemon, differentPokemon, threeOptions],
  configCases: [
    // Válidos: normalización de generaciones, límites y claves desconocidas (el esquema no es .strict(): se quitan).
    { ...baseConfig, generations: [2, 1, 2] },
    { ...baseConfig, generations: [9] },
    { ...baseConfig, roundSeconds: 10, rounds: 1, optionCount: 3 },
    { ...baseConfig, roundSeconds: 60, rounds: 50, optionCount: 6 },
    { ...baseConfig, roundSeconds: 10.0 },
    { ...baseConfig, candidateMode: 'DIFFERENT_POKEMON', showVotes: false },
    { ...baseConfig, unknownKey: 'se descarta' },
    // Inválidos: límites, enum en minúscula y tipos.
    { ...baseConfig, roundSeconds: 9 },
    { ...baseConfig, roundSeconds: 61 },
    { ...baseConfig, rounds: 0 },
    { ...baseConfig, rounds: 51 },
    { ...baseConfig, optionCount: 2 },
    { ...baseConfig, optionCount: 7 },
    { ...baseConfig, optionCount: 4.5 },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, candidateMode: 'same_pokemon' },
    { ...baseConfig, showVotes: 'true' },
    { ...baseConfig, showVotes: undefined },
    [],
    null,
  ],
};
