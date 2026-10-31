// Escenarios dorados de Adivina por la Paleta. El catálogo exportado no trae paletas (las calcula el data-sync), así
// que cada escenario las superpone con catalogPatch: colores literales de 8 tonos y pesos sin normalizar. El motor
// solo usa Pokémon por defecto con al menos 3 colores; los pesos de longitud distinta caen al reparto uniforme.
import { pokemonPaletteGuessGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenCatalogPatch, GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };

const weights = [34, 21, 13, 8, 5, 3, 2, 1];
const paletteOf = (palette: string[], paletteWeights: number[] = weights) => ({ palette, paletteWeights });

/** Doce Pokémon de primera generación con paleta completa, más los casos que el pool descarta. */
const gen1Patch: GoldenCatalogPatch = {
  bulbasaur: paletteOf(['#78c850', '#4e8234', '#a7db8d', '#2f6b4f', '#d8f0c0', '#c03028', '#f8f8f8', '#203820']),
  charmander: paletteOf(['#f08030', '#f8d030', '#c03028', '#9c531f', '#fac000', '#3070b0', '#f8f8f8', '#402010']),
  squirtle: paletteOf(['#6890f0', '#9db7f5', '#a8783c', '#e0c068', '#445e9c', '#f8f8f8', '#c0a060', '#283850'], [9, 8, 7, 6, 5, 4, 3, 2]),
  pikachu: paletteOf(['#f8d030', '#a1871f', '#c03028', '#fae078', '#383838', '#f8f8f8', '#e0a000', '#704010']),
  jigglypuff: paletteOf(['#ee99ac', '#f4bdc9', '#3890b8', '#9b6470', '#f8f8f8', '#283848', '#c06080', '#ffe0e8'], [0.4, 0.2, 0.1, 0.1, 0.08, 0.06, 0.04, 0.02]),
  meowth: paletteOf(['#e8d8a0', '#a8a878', '#f8d030', '#6d6d4e', '#c03028', '#f8f8f8', '#8a6a30', '#383020']),
  psyduck: paletteOf(['#f8d030', '#fae078', '#e0a000', '#a1871f', '#f8f8f8', '#383838', '#c0a860', '#704010']),
  geodude: paletteOf(['#b8a038', '#8d7d4b', '#d1c17d', '#6d5e26', '#f8f8f8', '#383020', '#a89048', '#504010']),
  gastly: paletteOf(['#705898', '#493963', '#a292bc', '#383838', '#f8f8f8', '#c03028', '#201030', '#d0c0f0'], [1, 1, 1, 1, 1, 1, 1, 1]),
  onix: paletteOf(['#a8a8a8', '#787878', '#d0d0d0', '#585858', '#f8f8f8', '#383838', '#909090', '#b8b8c8']),
  eevee: paletteOf(['#a8783c', '#e0c068', '#f8f0d0', '#704820', '#383020', '#f8f8f8', '#c09050', '#503010']),
  snorlax: paletteOf(['#386878', '#f0e0c0', '#284858', '#a8a090', '#f8f8f8', '#183038', '#d0c8b0', '#506878']),
  dragonite: paletteOf(['#f0a840', '#f8d088', '#58a8a8', '#a87020', '#f8f8f8', '#383020', '#d08830', '#406870']),
  mewtwo: paletteOf(['#c8b8d8', '#9070b0', '#f8f0f8', '#605070', '#383038', '#a890c0', '#e0d0e8', '#704890']),
  mew: paletteOf(['#f8c0d8', '#f090b8', '#fff0f8', '#c06090', '#3890b8', '#f8f8f8', '#e0a0c0', '#803050']),
  // Fuera del pool: dos colores no bastan y las formas no entran (forGenerations sin includeForms).
  magikarp: paletteOf(['#f08030', '#f8f8f8'], [3, 1]),
  'raichu-alola': paletteOf(['#d08030', '#f8d030', '#a060c0', '#f8f8f8', '#704010', '#383838', '#e0a060', '#5030a0']),
};

/** Tres Pokémon de segunda generación; Totodile trae pesos de otra longitud (colores con peso uniforme). */
const gen2Patch: GoldenCatalogPatch = {
  chikorita: paletteOf(['#a8e070', '#78c850', '#f8f0a0', '#4e8234', '#c8a020', '#f8f8f8', '#305020', '#e0d080']),
  cyndaquil: paletteOf(['#304860', '#f8e0a0', '#f08030', '#c03028', '#182838', '#f8f8f8', '#d0b070', '#f8d030']),
  totodile: paletteOf(['#5090d0', '#c03028', '#f8e0a0', '#305080', '#f8f8f8', '#383838', '#a0c0e0', '#d0b070'], [5, 4, 3, 2, 1, 1]),
};

const baseConfig = { generations: [1], roundSeconds: 20, rounds: 3, paletteSize: 8, hintsEnabled: false, hintKinds: [] as string[] };

function guess(playerId: string, pokemonId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'GUESS_POKEMON', pokemonId }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

const threePlayersPalettes: GoldenScenario = {
  name: 'three-players-palettes',
  seed: 701,
  catalog: 'gen1-2',
  catalogPatch: gen1Patch,
  players: [ana, bruno, carla],
  config: baseConfig,
  steps: [
    // Ronda 1 (1000–21000): espectador, fuera del pool (dos colores y forma regional), fallo con enfriamiento.
    guess('p9', 'pikachu', 2_000),
    guess('p1', 'magikarp', 2_500),
    guess('p1', 'raichu-alola', 2_600),
    guess('p1', 'onix', 3_000),
    guess('p1', 'gastly', 3_400),
    guess('p1', 'gastly', 4_000),
    guess('p1', 'gastly', 4_500),
    guess('p2', 'gastly', 6_000),
    timeout(21_000),
    // Resultados (21000–25000).
    guess('p3', 'gastly', 22_000),
    timeout(25_000),
    // Ronda 2 (25000–45000): una respuesta justo al límite se rechaza y revela la ronda.
    guess('p3', 'dragonite', 26_000),
    guess('p2', 'dragonite', 45_000),
    timeout(49_000),
    // Ronda 3 (49000–69000): todos aciertan y la ronda se resuelve sola.
    guess('p2', 'snorlax', 50_000),
    guess('p3', 'snorlax', 51_000),
    guess('p1', 'snorlax', 52_000),
    timeout(56_000),
  ],
};

const hintsAndSmallPalette: GoldenScenario = {
  name: 'hints-and-small-palette',
  seed: 702,
  catalog: 'gen1-2',
  catalogPatch: gen1Patch,
  players: [ana, bruno, carla],
  config: { ...baseConfig, roundSeconds: 15, rounds: 4, paletteSize: 5, hintsEnabled: true, hintKinds: ['CATEGORY', 'EVOLUTION', 'TYPE', 'TYPE_COUNT', 'GENERATION', 'TYPE'] },
  steps: [
    // Ronda 1 (1000–16000): cinco colores renormalizados y todas las pistas; Carla se desconecta y resuelve.
    guess('p1', 'psyduck', 3_000),
    guess('p2', 'psyduck', 4_000),
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 5_000 },
    timeout(9_000),
    // Ronda 2 (9000–24000): Carla observa; se agota el tiempo.
    guess('p3', 'onix', 10_000),
    guess('p1', 'onix', 11_000),
    timeout(24_000),
    timeout(28_000),
    // Ronda 3 (28000–43000): Carla vuelve.
    { kind: 'presence', players: [ana, bruno, carla], now: 29_000 },
    guess('p3', 'geodude', 30_000),
    guess('p2', 'geodude', 32_000),
    timeout(43_000),
    timeout(47_000),
    // Ronda 4 (47000–62000).
    guess('p1', 'pikachu', 48_000),
    timeout(62_000),
    timeout(66_000),
  ],
};

const poolExhaustedGen2: GoldenScenario = {
  name: 'pool-exhausted-gen2',
  seed: 703,
  catalog: 'gen1-2',
  catalogPatch: gen2Patch,
  players: [ana],
  config: { ...baseConfig, generations: [2], roundSeconds: 10, rounds: 4, hintKinds: ['GENERATION'] },
  steps: [
    // Tres paletas y cuatro rondas: la cuarta vuelve a elegir entre todo el pool (Totodile otra vez). Totodile trae
    // pesos de otra longitud y sus colores salen con peso uniforme.
    guess('p1', 'cyndaquil', 2_000),
    timeout(6_000),
    guess('p1', 'totodile', 7_000),
    timeout(16_000),
    timeout(20_000),
    guess('p1', 'totodile', 21_000),
    timeout(25_000),
    guess('p1', 'totodile', 26_000),
    timeout(30_000),
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 704,
  catalog: 'gen1-2',
  catalogPatch: gen1Patch,
  players: [ana, bruno],
  config: baseConfig,
  steps: [
    guess('p1', 'pikachu', 2_000),
    // pokemonId vacío: la acción no valida y el escenario se detiene.
    guess('p2', '', 3_000),
    guess('p2', 'pikachu', 4_000),
  ],
};

export const pokemonPaletteGuessScenarios: GoldenEngineEntry = {
  module: pokemonPaletteGuessGame,
  scenarios: [threePlayersPalettes, hintsAndSmallPalette, poolExhaustedGen2, invalidActionStops],
  configCases: [
    // Válidos: normalización de generaciones y de hintKinds (dedup en orden), límites y lista de pistas vacía.
    { ...baseConfig, generations: [2, 1, 2] },
    { ...baseConfig, hintKinds: ['TYPE', 'GENERATION', 'TYPE', 'CATEGORY', 'GENERATION'] },
    { ...baseConfig, roundSeconds: 10, rounds: 1, paletteSize: 5 },
    { ...baseConfig, roundSeconds: 60, rounds: 20, paletteSize: 8 },
    { ...baseConfig, roundSeconds: 10.0, hintsEnabled: true, hintKinds: [] },
    // Inválidos: límites, enumerados, tipos y esquema .strict().
    { ...baseConfig, roundSeconds: 9 },
    { ...baseConfig, roundSeconds: 61 },
    { ...baseConfig, rounds: 0 },
    { ...baseConfig, rounds: 21 },
    { ...baseConfig, paletteSize: 4 },
    { ...baseConfig, paletteSize: 9 },
    { ...baseConfig, paletteSize: 6.5 },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, hintKinds: ['SHAPE'] },
    { ...baseConfig, hintKinds: 'TYPE' },
    { ...baseConfig, hintsEnabled: 'no' },
    { ...baseConfig, unknownKey: 'no se admite' },
    { ...baseConfig, hintKinds: undefined },
    [],
    null,
  ],
};
