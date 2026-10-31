// Escenarios dorados de Adivina el Grito. createInitialState lanza sin pokemonAudio o con un catálogo vacío, y
// runner.ts no captura ese error, así que todos los escenarios traen pokemonAudio (los casos sin él están en
// PokemonCryQuizEngineTest). El token (`now` en base 36 y tres random()) se fija al crear la partida; cada ronda
// consume un random() para el objetivo y otro más con cryVersion RANDOM.
import { pokemonCryQuizGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };
const dani: GamePlayer = { id: 'p4', displayName: 'Dani' };

const cries = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon';
// Subconjunto de gen1-2: con los dos gritos, solo uno, un latest vacío (falsy: no cuenta) y formas regionales.
const pokemonAudio = {
  bulbasaur: { latest: `${cries}/latest/1.ogg`, legacy: `${cries}/legacy/1.ogg` },
  charmander: { latest: `${cries}/latest/4.ogg` },
  squirtle: { latest: `${cries}/latest/7.ogg`, legacy: `${cries}/legacy/7.ogg` },
  pikachu: { latest: `${cries}/latest/25.ogg`, legacy: `${cries}/legacy/25.ogg` },
  eevee: { legacy: `${cries}/legacy/133.ogg` },
  'meowth-alola': { latest: `${cries}/latest/10107.ogg` },
  mewtwo: { latest: '', legacy: `${cries}/legacy/150.ogg` },
  chikorita: { latest: `${cries}/latest/152.ogg`, legacy: `${cries}/legacy/152.ogg` },
  togepi: { legacy: `${cries}/legacy/175.ogg` },
};

const baseConfig = { generations: [1], roundSeconds: 20, rounds: 5, cryVersion: 'LATEST', includeRegionalForms: false };

function guess(playerId: string, pokemonId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'GUESS_POKEMON', pokemonId }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}
function asset(assetToken: string, roundNumber: number, assetId: string, now: number): GoldenStep {
  return { kind: 'asset', assetToken, roundNumber, assetId, now };
}

// Seed 911, LATEST en gen 1 sin formas: el pool son los cuatro con grito latest (Mewtwo lo tiene vacío), así que la
// quinta ronda vuelve a elegir entre todos.
const raceToken = 'rs-d9riw6-6042kx-1s4hciu';
const latestRace: GoldenScenario = {
  name: 'latest-race',
  seed: 911,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: baseConfig,
  pokemonAudio,
  steps: [
    // Ronda 1 (1000–21000), Charmander: espectador, fuera de generación, sin grito latest, fallo y enfriamiento.
    guess('p9', 'charmander', 1_500),
    guess('p1', 'chikorita', 1_600),
    guess('p1', 'eevee', 1_700),
    guess('p1', 'bulbasaur', 2_000),
    guess('p1', 'charmander', 2_500),
    asset(raceToken, 1, 'cry', 2_600),
    asset(raceToken, 1, 'shadow', 2_600),
    asset('rs-otra-partida', 1, 'cry', 2_600),
    asset(raceToken, 2, 'cry', 2_600),
    guess('p1', 'charmander', 3_000),
    guess('p1', 'charmander', 3_500),
    guess('p2', 'charmander', 5_000),
    // El plazo vence antes del timeout: la acción tardía resuelve la ronda aunque se rechace.
    guess('p3', 'charmander', 21_000),
    guess('p3', 'charmander', 22_000),
    asset(raceToken, 1, 'cry', 22_000),
    timeout(25_000),
    // Ronda 2 (25000–45000): Dani entra como espectador; la desconexión de Bruno y Carla resuelve la ronda.
    { kind: 'presence', players: [ana, bruno, carla, dani], now: 26_000 },
    guess('p4', 'pikachu', 26_500),
    guess('p1', 'pikachu', 27_000),
    { kind: 'presence', players: [ana, { ...bruno, connected: false }, { ...carla, connected: false }, dani], now: 28_000 },
    asset(raceToken, 1, 'cry', 28_500),
    asset(raceToken, 2, 'cry', 28_500),
    timeout(32_000),
    // Ronda 3 (32000–52000): vuelven todos y nadie acierta.
    { kind: 'presence', players: [ana, bruno, carla, dani], now: 33_000 },
    timeout(52_000),
    timeout(56_000),
    // Ronda 4 (56000–76000).
    guess('p2', 'squirtle', 57_000),
    timeout(76_000),
    timeout(80_000),
    // Ronda 5 (80000–100000): pool agotado.
    timeout(100_000),
    timeout(104_000),
    asset(raceToken, 5, 'cry', 104_500),
  ],
};

// Seed 912, RANDOM en gen 1-2 con formas: cada ronda sortea entre las versiones disponibles del objetivo.
const randomToken = 'rs-es5wdk-1d4ayug-30ezr7';
const randomVersions: GoldenScenario = {
  name: 'random-versions',
  seed: 912,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { generations: [2, 1], roundSeconds: 10, rounds: 4, cryVersion: 'RANDOM', includeRegionalForms: true },
  pokemonAudio,
  steps: [
    // Ronda 1 (1000–11000).
    asset(randomToken, 1, 'cry', 1_500),
    guess('p1', 'pikachu', 2_000),
    guess('p2', 'pikachu', 3_000),
    timeout(7_000),
    // Ronda 2 (7000–17000).
    asset(randomToken, 2, 'cry', 7_500),
    guess('p2', 'meowth-alola', 8_000),
    timeout(17_000),
    timeout(21_000),
    // Ronda 3 (21000–31000): Ana acierta y la desconexión de Bruno resuelve.
    guess('p1', 'chikorita', 22_000),
    { kind: 'presence', players: [ana, { ...bruno, connected: false }], now: 23_000 },
    asset(randomToken, 3, 'cry', 23_500),
    timeout(27_000),
    // Ronda 4 (27000–37000).
    { kind: 'presence', players: [ana, bruno], now: 28_000 },
    guess('p2', 'charmander', 29_000),
    guess('p1', 'charmander', 30_000),
    timeout(34_000),
    asset(randomToken, 4, 'cry', 34_500),
    asset(randomToken, 3, 'cry', 34_500),
  ],
};

// Seed 913, LEGACY en solitario: el acierto resuelve al instante; una acción inválida detiene el escenario.
const soloToken = 'rs-tf3mpt-1c4aj62-gczdw6';
const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 913,
  catalog: 'gen1-2',
  players: [ana],
  config: { generations: [1, 2], roundSeconds: 10, rounds: 3, cryVersion: 'LEGACY', includeRegionalForms: false },
  pokemonAudio,
  steps: [
    asset(soloToken, 1, 'cry', 1_500),
    asset(soloToken, 1, 'CRY', 1_500),
    guess('p1', 'eevee', 2_000),
    timeout(6_000),
    asset(soloToken, 2, 'cry', 6_500),
    // pokemonId de 97 caracteres: actionSchema lo rechaza y el escenario se detiene.
    { kind: 'action', playerId: 'p1', action: { type: 'GUESS_POKEMON', pokemonId: 'x'.repeat(97) }, now: 7_000 },
    guess('p1', 'chikorita', 8_000),
  ],
};

export const pokemonCryQuizScenarios: GoldenEngineEntry = {
  module: pokemonCryQuizGame,
  scenarios: [latestRace, randomVersions, invalidActionStops],
  configCases: [
    // Válidos: normalización de generaciones, límites y las tres versiones.
    { ...baseConfig, generations: [2, 1, 2] },
    { ...baseConfig, generations: [9] },
    { ...baseConfig, roundSeconds: 10, rounds: 1 },
    { ...baseConfig, roundSeconds: 60, rounds: 20 },
    { ...baseConfig, roundSeconds: 10.0 },
    { ...baseConfig, cryVersion: 'LEGACY', includeRegionalForms: true },
    { ...baseConfig, cryVersion: 'RANDOM' },
    // Inválidos: límites, enum en minúscula, tipos y esquema .strict().
    { ...baseConfig, roundSeconds: 9 },
    { ...baseConfig, roundSeconds: 61 },
    { ...baseConfig, rounds: 0 },
    { ...baseConfig, rounds: 21 },
    { ...baseConfig, rounds: 1.5 },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, cryVersion: 'latest' },
    { ...baseConfig, cryVersion: 'BOTH' },
    { ...baseConfig, cryVersion: undefined },
    { ...baseConfig, includeRegionalForms: 'no' },
    { ...baseConfig, unknownKey: 'no se admite' },
    [],
    null,
  ],
};
