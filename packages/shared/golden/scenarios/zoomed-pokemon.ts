// Escenarios dorados de Zoomed Pokémon. El token de recursos (`now` en base 36 y tres random()) se fija en
// createInitialState; cada ronda consume un random() para el objetivo y otro para focusSeed. Con pokemonVisuals el modo
// MIXED prefiere el artwork; sin ellos (o en SPRITE) usa el sprite. Las etapas de zoom avanzan a 1/4, 2/4 y 3/4 de la
// ronda con los timeouts (tickActive), pero la puntuación usa la etapa por tiempo del momento del acierto.
import { zoomedPokemonGame } from '../../dist/index.js';
import type { GamePlayer, PokemonVisualAsset } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };

const artwork = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';
const artworkIds: Record<string, number> = {
  bulbasaur: 1, charmander: 4, squirtle: 7, pikachu: 25, vulpix: 37, psyduck: 54, machop: 66, gengar: 94, onix: 95,
  eevee: 133, snorlax: 143, dragonite: 149, mew: 151, 'vulpix-alola': 10103,
};
// Subconjunto de gen1-2 con artwork; algunas entradas traen dimensiones y caja alfa (el motor no las lee).
const pokemonVisuals: Record<string, PokemonVisualAsset> = Object.fromEntries(Object.entries(artworkIds).map(([id, dex]) => [
  id,
  dex === 66 || dex === 7
    ? { pokemonId: id, source: 'ARTWORK', location: `${artwork}/${dex}.png`, width: 475, height: 475, alphaBounds: { x: 0.1, y: 0.05, width: 0.8, height: 0.9 } }
    : { pokemonId: id, source: 'ARTWORK', location: `${artwork}/${dex}.png` },
]));

const baseConfig = {
  generations: [1], imageMode: 'MIXED', roundSeconds: 20, rounds: 3, hintsEnabled: false,
  hintKinds: ['GENERATION', 'TYPE', 'EVOLUTION'], includeForms: false,
};

function guess(playerId: string, pokemonId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'GUESS_POKEMON', pokemonId }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}
function asset(assetToken: string, roundNumber: number, assetId: string, now: number): GoldenStep {
  return { kind: 'asset', assetToken, roundNumber, assetId, now };
}

// Seed 958: Victreebel (sprite), Machop y Squirtle (artwork). Etapas en +5000, +10000 y +15000.
const mixedToken = 'rs-1vlc1zm-14j4y38-j0613t';
const mixedWithVisuals: GoldenScenario = {
  name: 'mixed-with-visuals',
  seed: 958,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { ...baseConfig, hintsEnabled: true, hintKinds: ['CATEGORY', 'TYPE', 'GENERATION', 'TYPE', 'EVOLUTION', 'TYPE_COUNT'] },
  pokemonVisuals,
  steps: [
    // Ronda 1 (1000–21000): espectador, fuera del pool de respuesta, fallo y enfriamiento.
    guess('p9', 'victreebel', 1_500),
    guess('p1', 'chikorita', 1_600),
    guess('p1', 'weepinbell', 2_000),
    guess('p1', 'victreebel', 2_500),
    asset(mixedToken, 1, 'stage-0', 2_600),
    asset(mixedToken, 1, 'stage-1', 2_600),
    asset(mixedToken, 1, 'reveal', 2_600),
    asset(mixedToken, 1, 'stage-4', 2_600),
    asset('rs-otra-partida', 1, 'stage-0', 2_600),
    asset(mixedToken, 0, 'stage-0', 2_600),
    timeout(6_000),
    asset(mixedToken, 1, 'stage-1', 6_100),
    guess('p1', 'victreebel', 7_000),
    guess('p1', 'victreebel', 7_500),
    timeout(11_000),
    guess('p2', 'victreebel', 12_000),
    timeout(16_000),
    timeout(16_500),
    // El plazo vence antes del timeout: la acción tardía resuelve la ronda aunque se rechace.
    guess('p3', 'victreebel', 21_000),
    guess('p3', 'victreebel', 22_000),
    asset(mixedToken, 1, 'stage-3', 22_000),
    asset(mixedToken, 1, 'reveal', 22_000),
    timeout(25_000),
    // Ronda 2 (25000–45000), artwork: acierto en máximo zoom y la desconexión de los demás resuelve.
    guess('p1', 'machop', 25_500),
    { kind: 'presence', players: [ana, { ...bruno, connected: false }, { ...carla, connected: false }], now: 26_000 },
    asset(mixedToken, 1, 'stage-0', 26_500),
    asset(mixedToken, 2, 'stage-2', 26_500),
    timeout(30_000),
    // Ronda 3 (30000–50000): vuelven todos y nadie acierta.
    { kind: 'presence', players: [ana, bruno, carla], now: 31_000 },
    timeout(50_000),
    timeout(54_000),
    asset(mixedToken, 3, 'reveal', 54_500),
  ],
};

/** 41 fallos por jugador (uno por segundo): la lista pública se recorta a los 80 últimos. */
function wrongGuessFlood(start: number): GoldenStep[] {
  return Array.from({ length: 41 }, (_, index) => [
    guess('p1', 'espeon', start + index * 1_000),
    guess('p2', 'espeon', start + index * 1_000 + 500),
  ]).flat();
}

// Seed 961 sin pokemonVisuals: MIXED recurre al sprite. Umbreon, Persian e Ivysaur; etapas en +15000, +30000, +45000.
const spriteToken = 'rs-hm9nvr-fc4kqm-1ppvtnu';
const mixedWithoutVisuals: GoldenScenario = {
  name: 'mixed-without-visuals',
  seed: 961,
  catalog: 'gen1-2',
  // encodeURIComponent: el espacio, la barra y la ü se codifican en las rutas públicas.
  roomCode: 'A B/ü',
  players: [ana, bruno],
  config: { ...baseConfig, generations: [2, 1], roundSeconds: 60, includeForms: true },
  steps: [
    // Ronda 1 (1000–61000): 82 fallos; Ana acierta sin que ningún timeout haya movido la etapa pública.
    asset(spriteToken, 1, 'stage-0', 1_500),
    ...wrongGuessFlood(2_000),
    guess('p1', 'umbreon', 43_000),
    timeout(46_000),
    guess('p2', 'umbreon', 47_000),
    asset(spriteToken, 1, 'reveal', 47_500),
    timeout(51_000),
    // Ronda 2 (51000–111000): nadie acierta.
    timeout(111_000),
    timeout(115_000),
    // Ronda 3 (115000–175000): Bruno acierta y la desconexión de Ana resuelve.
    guess('p2', 'ivysaur', 116_000),
    { kind: 'presence', players: [{ ...ana, connected: false }, bruno], now: 117_000 },
    timeout(121_000),
    asset(spriteToken, 3, 'stage-1', 121_500),
    asset(spriteToken, 2, 'stage-1', 121_500),
  ],
};

// Seed 962, ARTWORK: el pool es solo lo que tiene artwork (con formas). Pikachu, Eevee y Machop; etapas cada 3750 ms.
const artworkToken = 'rs-eskc8t-1eo800o-1ikabmu';
const artworkOnly: GoldenScenario = {
  name: 'artwork-only',
  seed: 962,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: {
    ...baseConfig, generations: [1, 2], imageMode: 'ARTWORK', roundSeconds: 15, hintsEnabled: true,
    hintKinds: ['GENERATION', 'TYPE', 'TYPE_COUNT', 'EVOLUTION', 'CATEGORY'], includeForms: true,
  },
  pokemonVisuals,
  steps: [
    // Ronda 1 (1000–16000).
    timeout(4_750),
    timeout(8_500),
    timeout(12_250),
    asset(artworkToken, 1, 'stage-3', 12_300),
    guess('p1', 'pikachu', 13_000),
    guess('p2', 'raichu-alola', 13_500),
    timeout(16_000),
    asset(artworkToken, 1, 'stage-2', 16_500),
    timeout(20_000),
    // Ronda 2 (20000–35000).
    guess('p2', 'eevee', 21_000),
    guess('p1', 'eevee', 22_000),
    timeout(26_000),
    // Ronda 3 (26000–41000).
    timeout(41_000),
    timeout(45_000),
    asset(artworkToken, 3, 'reveal', 45_500),
  ],
};

// Seed 963, SPRITE en solitario: Pidgey en la ronda 1; una acción inválida detiene el escenario.
const soloToken = 'rs-650sbm-1ci64rh-1lgeoyr';
const spriteModeInvalidAction: GoldenScenario = {
  name: 'sprite-mode-invalid-action',
  seed: 963,
  catalog: 'gen1-2',
  players: [ana],
  config: { ...baseConfig, imageMode: 'SPRITE', roundSeconds: 15 },
  pokemonVisuals,
  steps: [
    asset(soloToken, 1, 'stage-0', 1_500),
    guess('p1', 'pidgey', 2_000),
    asset(soloToken, 1, 'reveal', 2_100),
    timeout(6_000),
    // El literal del tipo distingue mayúsculas: la acción no valida y el escenario se detiene.
    { kind: 'action', playerId: 'p1', action: { type: 'guess_pokemon', pokemonId: 'pidgey' }, now: 7_000 },
    guess('p1', 'pidgey', 8_000),
  ],
};

export const zoomedPokemonScenarios: GoldenEngineEntry = {
  module: zoomedPokemonGame,
  scenarios: [mixedWithVisuals, mixedWithoutVisuals, artworkOnly, spriteModeInvalidAction],
  configCases: [
    // Válidos: normalización (generaciones ordenadas, hintKinds sin duplicados en orden de aparición) y límites.
    { ...baseConfig, generations: [2, 1, 2] },
    { ...baseConfig, generations: [9] },
    { ...baseConfig, hintKinds: ['TYPE', 'GENERATION', 'TYPE'] },
    { ...baseConfig, hintKinds: [] },
    { ...baseConfig, roundSeconds: 15, rounds: 1 },
    { ...baseConfig, roundSeconds: 60, rounds: 20 },
    { ...baseConfig, roundSeconds: 15.0 },
    { ...baseConfig, imageMode: 'ARTWORK', includeForms: true },
    { ...baseConfig, imageMode: 'SPRITE', hintsEnabled: true },
    // Inválidos: límites, enums en minúscula, tipos y esquema .strict().
    { ...baseConfig, roundSeconds: 14 },
    { ...baseConfig, roundSeconds: 61 },
    { ...baseConfig, rounds: 0 },
    { ...baseConfig, rounds: 21 },
    { ...baseConfig, roundSeconds: 15.5 },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, imageMode: 'mixed' },
    { ...baseConfig, imageMode: 'SHINY' },
    { ...baseConfig, hintKinds: ['type'] },
    { ...baseConfig, hintKinds: ['HEIGHT'] },
    { ...baseConfig, hintKinds: 'TYPE' },
    { ...baseConfig, includeForms: undefined },
    { ...baseConfig, unknownKey: 'no se admite' },
    [],
    null,
  ],
};
