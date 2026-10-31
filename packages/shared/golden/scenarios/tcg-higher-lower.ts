// Escenarios dorados de Higher or Lower: Cartas. El mazo es contentDeck(pool, rounds + 1) sobre las cartas que
// devuelve tcgCards.cardsFor(config): sets, rarezas y precios decimales (las generaciones no filtran). Los precios
// se comparan como decimales canónicos; hay parejas con el mismo precio para cubrir SAME (2 puntos, sameCorrect).
// Un escenario sin tcgCards no es exportable (createInitialState lanza fuera del try del runner): el literal de
// checkAvailability con el catálogo nulo lo cubre TcgHigherLowerEngineTest.
import { tcgHigherLowerGame } from '../../dist/index.js';
import type { GamePlayer, TcgComparableCard } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };

function tcgCard(id: string, name: string, setId: string, rarity: string | null, price: string): TcgComparableCard {
  const [, localId = id] = id.split('-');
  return {
    id, name, localId, setId, setName: setId === 'sv1' ? 'Escarlata y Púrpura' : 'Evoluciones en Paldea', rarity,
    imageUrl: `https://assets.tcgdex.net/es/sv/${setId}/${localId}/high.webp`, price, currency: 'EUR', provider: 'cardmarket', variant: 'normal',
  };
}

const cards: TcgComparableCard[] = [
  tcgCard('sv1-001', 'Sprigatito', 'sv1', 'Common', '0.25'),
  tcgCard('sv1-025', 'Pikachu', 'sv1', 'Rare', '3.5'),
  tcgCard('sv1-004', 'Fuecoco', 'sv1', 'Common', '0.25'),
  tcgCard('sv2-012', 'Charizard ex', 'sv2', 'Rare', '12.75'),
  tcgCard('sv2-030', 'Tinkatink', 'sv2', 'Common', '1.1'),
  tcgCard('sv2-055', 'Gardevoir', 'sv2', 'Rare', '3.5'),
  tcgCard('sv2-199', 'Iono', 'sv2', null, '120'),
  tcgCard('sv1-081', 'Miraidon ex', 'sv1', 'Rare', '45.1'),
  tcgCard('sv2-203', 'Magikarp', 'sv2', 'Common', '999.99'),
  tcgCard('sv1-244', 'Koraidon ex', 'sv1', 'Rare', '1500'),
];

const baseConfig = {
  generations: [1, 2, 3, 4, 5, 6, 7, 8, 9], setIds: [], rarities: [], minPrice: null, maxPrice: null, showRarity: true, rounds: 5, roundSeconds: 15,
};

function answer(playerId: string, choice: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'ANSWER', choice }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

const twoPlayersFiveRounds: GoldenScenario = {
  name: 'two-players-five-rounds',
  seed: 101,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { ...baseConfig, showRarity: false },
  tcgCards: cards,
  steps: [
    // Ronda 1 (activa 1000–16000): la rareza no se ve hasta revelar; duplicado y ajeno rechazados.
    answer('p1', 'HIGHER', 2_000),
    answer('p1', 'LOWER', 2_500),
    answer('p9', 'HIGHER', 3_000),
    answer('p2', 'LOWER', 4_000),
    // Resultados (4000–7000): la comparación ya no está activa.
    answer('p1', 'SAME', 5_000),
    timeout(6_999),
    timeout(7_000),
    // Ronda 2 (activa 7000–22000): Bruno no responde y se revela por tiempo.
    answer('p1', 'SAME', 8_000),
    timeout(21_999),
    timeout(22_000),
    timeout(25_000),
    // Ronda 3 (activa 25000–40000): una respuesta justo en el límite llega tarde.
    answer('p2', 'HIGHER', 40_000),
    timeout(40_000),
    timeout(43_000),
    // Rondas 4 y 5.
    answer('p1', 'LOWER', 44_000),
    answer('p2', 'HIGHER', 45_000),
    timeout(48_000),
    answer('p2', 'SAME', 49_000),
    answer('p1', 'HIGHER', 50_000),
    timeout(53_000),
  ],
};

const setFilterPresence: GoldenScenario = {
  name: 'set-filter-presence',
  seed: 202,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  // Solo sv2 (deduplicado): 5 cartas, incluida la de rareza nula, para 6 posiciones del mazo.
  config: { ...baseConfig, setIds: ['sv2', 'sv2'], roundSeconds: 20 },
  tcgCards: cards,
  steps: [
    // Ronda 1: Ana y Bruno responden; Carla se desconecta y la ronda se resuelve sin esperar al tiempo.
    answer('p1', 'HIGHER', 2_000),
    answer('p2', 'LOWER', 3_000),
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 4_000 },
    timeout(7_000),
    // Ronda 2: Carla desconectada no puede responder; con los dos conectados basta.
    answer('p3', 'HIGHER', 8_000),
    answer('p2', 'SAME', 9_000),
    answer('p1', 'LOWER', 10_000),
    timeout(13_000),
    // Ronda 3: Carla vuelve y se agota el tiempo.
    { kind: 'presence', players: [ana, bruno, carla], now: 14_000 },
    answer('p3', 'HIGHER', 15_000),
    answer('p1', 'HIGHER', 16_000),
    timeout(33_000),
    timeout(36_000),
    // Rondas 4 y 5: todos responden.
    answer('p1', 'LOWER', 37_000),
    answer('p2', 'LOWER', 38_000),
    answer('p3', 'SAME', 39_000),
    timeout(42_000),
    answer('p3', 'LOWER', 43_000),
    answer('p2', 'HIGHER', 44_000),
    answer('p1', 'SAME', 45_000),
    timeout(48_000),
  ],
};

const rarityPriceFilter: GoldenScenario = {
  name: 'rarity-price-filter-single-player',
  seed: 303,
  catalog: 'gen1-2',
  players: [ana],
  // Rare entre 3.5 (no canónico en la entrada: 03.50) y 50: Pikachu, Charizard ex, Gardevoir y Miraidon ex.
  config: { ...baseConfig, rarities: ['Rare', 'Rare'], minPrice: '03.50', maxPrice: '50', rounds: 6, roundSeconds: 10 },
  tcgCards: cards,
  startNow: 50_000,
  steps: [
    // Cuatro aciertos seguidos (el SAME de Pikachu y Gardevoir vale 2), la quinta se agota sin respuesta y la racha
    // vuelve a 0; la sexta se acierta.
    answer('p1', 'LOWER', 51_000),
    timeout(54_000),
    answer('p1', 'SAME', 55_000),
    timeout(58_000),
    answer('p1', 'HIGHER', 59_000),
    timeout(62_000),
    answer('p1', 'LOWER', 63_000),
    timeout(66_000),
    timeout(76_000),
    timeout(79_000),
    answer('p1', 'LOWER', 80_000),
    timeout(83_000),
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 404,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { ...baseConfig, minPrice: '120' },
  tcgCards: cards,
  steps: [
    answer('p1', 'HIGHER', 2_000),
    // actionSchema es .strict() y el enum distingue mayúsculas: 'higher' invalida la acción y detiene el escenario.
    answer('p2', 'higher', 3_000),
    answer('p2', 'LOWER', 4_000),
  ],
};

export const tcgHigherLowerScenarios: GoldenEngineEntry = {
  module: tcgHigherLowerGame,
  scenarios: [twoPlayersFiveRounds, setFilterPresence, rarityPriceFilter, invalidActionStops],
  configCases: [
    // Válidos: generaciones (dedup + orden), sets y rarezas (dedup, primer orden), clave extra ignorada.
    { ...baseConfig, generations: [3, 1, 3, 2] },
    { ...baseConfig, setIds: ['sv2', 'sv1', 'sv2'], rarities: ['Rare', 'Common', 'Rare'], unknownKey: 'se ignora' },
    { ...baseConfig, rounds: 5, roundSeconds: 5 },
    { ...baseConfig, rounds: 50, roundSeconds: 60, showRarity: false },
    { ...baseConfig, rounds: 10.0 },
    // Precios: se guardan tal cual (sin canonizar); iguales como decimales es válido.
    { ...baseConfig, minPrice: '007.50', maxPrice: '7.5' },
    { ...baseConfig, minPrice: '0', maxPrice: null },
    { ...baseConfig, minPrice: null, maxPrice: '999.990' },
    { ...baseConfig, minPrice: '9.99', maxPrice: '10' },
    { ...baseConfig, minPrice: '999', maxPrice: '1000' },
    // Inválidos.
    { ...baseConfig, minPrice: '10', maxPrice: '9.99' },
    { ...baseConfig, minPrice: '1000', maxPrice: '999.99' },
    { ...baseConfig, minPrice: '1.' },
    { ...baseConfig, minPrice: '.5' },
    { ...baseConfig, minPrice: '-1' },
    { ...baseConfig, minPrice: '1,5' },
    { ...baseConfig, maxPrice: ' 1' },
    { ...baseConfig, maxPrice: '1e3' },
    { ...baseConfig, maxPrice: '' },
    { ...baseConfig, minPrice: 5 },
    { ...baseConfig, minPrice: undefined },
    { ...baseConfig, rounds: 4 },
    { ...baseConfig, rounds: 51 },
    { ...baseConfig, roundSeconds: 4 },
    { ...baseConfig, roundSeconds: 61 },
    { ...baseConfig, roundSeconds: 10.5 },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, setIds: [''] },
    { ...baseConfig, rarities: [''] },
    { ...baseConfig, setIds: 'sv1' },
    { ...baseConfig, rarities: [1] },
    { ...baseConfig, showRarity: 'yes' },
    { ...baseConfig, rounds: '5' },
    { ...baseConfig, setIds: undefined },
    [],
    null,
  ],
};
