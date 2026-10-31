// Escenarios dorados de ¿Quién es ese Pokémon? El token de recursos (`now` en base 36 y tres random()) se fija en
// createInitialState y cada ronda consume un random() para el objetivo, así que el seed fija los objetivos. Los pasos
// `asset` copian el token de la proyección grabada.
import { whosThatPokemonGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };

const baseConfig = { generations: [1], roundSeconds: 20, rounds: 3, hintsEnabled: false, includeRegionalForms: false };

function guess(playerId: string, pokemonId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'GUESS_POKEMON', pokemonId }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}
function asset(assetToken: string, roundNumber: number, assetId: string, now: number): GoldenStep {
  return { kind: 'asset', assetToken, roundNumber, assetId, now };
}

// Seed 901 desde now = 1000: Drowzee, Gengar y Golem.
const raceToken = 'rs-67e1f1-1gjpytd-18nyec9';
const threePlayersRace: GoldenScenario = {
  name: 'three-players-race',
  seed: 901,
  catalog: 'gen1-2',
  // encodeURIComponent: el espacio, la barra y la ü se codifican en las rutas públicas.
  roomCode: 'A B/ü',
  players: [ana, bruno, carla],
  config: baseConfig,
  steps: [
    // Ronda 1 (1000–21000), Drowzee: espectador, fuera del pool, fallo, enfriamiento y aciertos.
    guess('p9', 'drowzee', 2_000),
    guess('p1', 'chikorita', 2_500),
    guess('p1', 'hypno', 3_000),
    guess('p1', 'drowzee', 3_400),
    asset(raceToken, 1, 'shadow', 3_500),
    asset(raceToken, 1, 'reveal', 3_500),
    asset('rs-otra-partida', 1, 'shadow', 3_500),
    asset(raceToken, 0, 'shadow', 3_500),
    asset(raceToken, 1, 'stage-0', 3_500),
    guess('p1', 'drowzee', 4_000),
    guess('p1', 'drowzee', 4_500),
    guess('p2', 'drowzee', 9_000),
    timeout(20_999),
    // El plazo vence antes del timeout: la acción tardía resuelve la ronda aunque se rechace.
    guess('p3', 'drowzee', 21_000),
    guess('p3', 'drowzee', 22_000),
    asset(raceToken, 1, 'reveal', 22_000),
    asset(raceToken, 1, 'shadow', 22_000),
    timeout(25_000),
    // Ronda 2 (25000–45000), Gengar: Ana acierta y la desconexión de Bruno y Carla resuelve la ronda.
    asset(raceToken, 1, 'shadow', 26_000),
    asset(raceToken, 2, 'shadow', 26_000),
    guess('p1', 'gengar', 27_000),
    { kind: 'presence', players: [ana, { ...bruno, connected: false }, carla], now: 28_000 },
    { kind: 'presence', players: [ana, { ...bruno, connected: false }, { ...carla, connected: false }], now: 29_000 },
    timeout(33_000),
    // Ronda 3 (33000–53000), Golem: vuelven todos y nadie acierta.
    { kind: 'presence', players: [ana, bruno, carla], now: 34_000 },
    guess('p2', 'geodude', 35_000),
    timeout(53_000),
    timeout(57_000),
    asset(raceToken, 3, 'reveal', 57_000),
    asset(raceToken, 2, 'reveal', 57_000),
  ],
};

// Seed 903 con formas: Geodude de Alola, Tauros de Paldea y Typhlosion de Hisui (las formas no tienen etapa evolutiva:
// la tercera pista es TYPE_COUNT). Las pistas se revelan a 1/4, 2/4 y 3/4 de la ronda.
const hintsToken = 'rs-p7p1mi-1jb9vvk-1vu6ydp';
const hintsEnabled: GoldenScenario = {
  name: 'hints-enabled',
  seed: 903,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { generations: [2, 1], roundSeconds: 10, rounds: 3, hintsEnabled: true, includeRegionalForms: true },
  // El motor no lee pokemonVisuals: la silueta sale siempre del sprite.
  pokemonVisuals: {
    'geodude-alola': {
      pokemonId: 'geodude-alola', source: 'ARTWORK',
      location: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/10109.png',
    },
  },
  steps: [
    // Ronda 1 (1000–11000): pistas en 3500, 6000 y 8500.
    timeout(3_500),
    timeout(4_000),
    guess('p1', 'geodude', 4_500),
    timeout(9_000),
    asset(hintsToken, 1, 'shadow', 9_100),
    guess('p2', 'geodude-alola', 9_500),
    guess('p1', 'geodude-alola', 10_000),
    timeout(14_000),
    // Ronda 2 (14000–24000).
    timeout(17_000),
    timeout(24_000),
    asset(hintsToken, 2, 'reveal', 24_500),
    timeout(28_000),
    // Ronda 3 (28000–38000): Bruno se desconecta y el acierto de Ana resuelve.
    { kind: 'presence', players: [ana, { ...bruno, connected: false }], now: 29_000 },
    guess('p1', 'typhlosion-hisui', 30_000),
    asset(hintsToken, 3, 'reveal', 30_500),
    asset(hintsToken, 3, 'cry', 30_500),
    timeout(34_000),
    asset(hintsToken, 3, 'shadow', 34_500),
  ],
};

// Seed 904, un jugador: Marowak en la ronda 1; un acierto en solitario resuelve al instante.
const soloToken = 'rs-1smvrb5-1f07zul-qlnljz';
const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 904,
  catalog: 'gen1-2',
  players: [ana],
  config: { generations: [1, 2], roundSeconds: 10, rounds: 3, hintsEnabled: false, includeRegionalForms: false },
  steps: [
    asset(soloToken, 1, 'shadow', 1_500),
    asset(soloToken.toUpperCase(), 1, 'shadow', 1_500),
    guess('p1', 'marowak', 2_000),
    asset(soloToken, 1, 'reveal', 2_100),
    timeout(6_000),
    // actionSchema es .strict(): una clave desconocida invalida la acción y detiene el escenario.
    { kind: 'action', playerId: 'p1', action: { type: 'GUESS_POKEMON', pokemonId: 'pikachu', extra: true }, now: 7_000 },
    guess('p1', 'pikachu', 8_000),
  ],
};

export const whosThatPokemonScenarios: GoldenEngineEntry = {
  module: whosThatPokemonGame,
  scenarios: [threePlayersRace, hintsEnabled, invalidActionStops],
  configCases: [
    // Válidos: normalización de generaciones y límites.
    { ...baseConfig, generations: [2, 1, 2] },
    { ...baseConfig, generations: [9] },
    { ...baseConfig, roundSeconds: 10, rounds: 1 },
    { ...baseConfig, roundSeconds: 60, rounds: 20 },
    { ...baseConfig, roundSeconds: 10.0 },
    { ...baseConfig, hintsEnabled: true, includeRegionalForms: true },
    // Inválidos: límites, tipos y esquema .strict().
    { ...baseConfig, roundSeconds: 9 },
    { ...baseConfig, roundSeconds: 61 },
    { ...baseConfig, rounds: 0 },
    { ...baseConfig, rounds: 21 },
    { ...baseConfig, roundSeconds: 10.5 },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, generations: [1.5] },
    { ...baseConfig, generations: 1 },
    { ...baseConfig, hintsEnabled: 'false' },
    { ...baseConfig, includeRegionalForms: undefined },
    { ...baseConfig, unknownKey: 'no se admite' },
    [],
    null,
  ],
};
