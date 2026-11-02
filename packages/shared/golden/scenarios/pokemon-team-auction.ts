// Escenarios dorados de Pokémon Team Auction. createInitialState baraja el pool de Pokémon (seis lotes por jugador) y
// cada lote baraja el orden de turno antes de rotarlo. Los pasos automáticos (sin monedas, desconectado o equipo
// completo) se registran como PASS en bidHistory y cuentan en el turnNumber de actionEpoch.
import { pokemonTeamAuctionGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };

function raise(playerId: string, amount: number, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'RAISE_BID', amount }, now };
}
function pass(playerId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'PASS_BID' }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

const baseConfig = { generations: [1], bidSeconds: 20, initialBudget: 10, includeForms: false };

const biddingErrorsTimeouts: GoldenScenario = {
  name: 'bidding-errors-timeouts',
  seed: 1201,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: baseConfig,
  steps: [
    // Lote 1 (Chansey), turno Carla → Ana → Bruno: rechazos de jugador ajeno, turno y monedas.
    raise('p9', 1, 1_500),
    raise('p1', 1, 2_000),
    raise('p3', 11, 2_500),
    raise('p3', 2, 3_000),
    // La puja mínima es la actual + 1; se admiten saltos.
    raise('p1', 2, 3_500),
    raise('p1', 4, 4_000),
    pass('p2', 4_500),
    raise('p3', 6, 5_000),
    // Ana pasa: Bruno ya pasó y Carla es la mejor postora, así que Carla gana el lote por 6.
    pass('p1', 5_500),
    // Lote 2 (Moltres, legendario), turno Bruno → Carla → Ana. Carla agota su turno: la puja en el plazo exacto se
    // rechaza y el timeout la hace pasar.
    raise('p2', 1, 6_000),
    timeout(25_999),
    raise('p3', 2, 26_000),
    timeout(26_000),
    raise('p1', 5, 27_000),
    raise('p2', 9, 28_000),
    // Ana agota su turno y Bruno gana el lote por 9 al vencer el plazo.
    timeout(48_000),
    // Lote 3: todos pasan y el lote queda sin dueño.
    pass('p2', 49_000),
    pass('p1', 50_000),
    pass('p3', 51_000),
    // Lote 4: a Bruno (1 moneda) no le llega para 5 y pasa solo; Carla gana por 4 y se queda sin monedas.
    raise('p1', 2, 52_000),
    raise('p3', 4, 53_000),
    pass('p1', 54_000),
    // Lote 5: Carla pasa sola al empezar; Bruno no puede cubrir 2 y Ana gana al instante.
    raise('p1', 1, 55_000),
  ],
};

const topBidderPresence: GoldenScenario = {
  name: 'top-bidder-presence',
  seed: 1202,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: baseConfig,
  steps: [
    // Lote 1 (Jolteon), turno Bruno → Ana → Carla. Bruno puja y se desconecta: sigue siendo el mejor postor.
    raise('p2', 3, 2_000),
    { kind: 'presence', players: [ana, { ...bruno, connected: false }, carla], now: 3_000 },
    raise('p2', 4, 3_500),
    pass('p1', 4_000),
    // La desconexión de Carla, a quien le toca, la hace pasar: Bruno gana el lote desconectado.
    { kind: 'presence', players: [ana, { ...bruno, connected: false }, { ...carla, connected: false }], now: 5_000 },
    // Lote 2: solo queda Ana, que gana por 1. En el lote 3 Bruno y Carla pasan solos al empezar.
    raise('p1', 1, 6_000),
    { kind: 'presence', players: [ana, bruno, carla], now: 7_000 },
    pass('p1', 8_000),
    // Lote 4: Bruno puja y los demás agotan su turno; el lote se adjudica por timeout.
    raise('p2', 2, 9_000),
    timeout(29_000),
    timeout(49_000),
    // Lote 5: Carla, a quien le toca, se desconecta y pasa; el plazo se reinicia para Ana.
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 50_000 },
    raise('p1', 3, 51_000),
    pass('p2', 52_000),
  ],
};

const fullTeamsNoTimer: GoldenScenario = {
  name: 'full-teams-no-timer',
  seed: 1203,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { generations: [2, 1, 2], initialBudget: 100, bidSeconds: 0, includeForms: true },
  steps: [
    // Sin temporizador: el timeout no hace nada. Ana compra los seis primeros lotes y completa su equipo.
    timeout(1_500),
    raise('p1', 2, 2_000),
    pass('p2', 3_000),
    raise('p1', 3, 4_000),
    pass('p2', 5_000),
    pass('p2', 6_000),
    raise('p1', 1, 7_000),
    raise('p1', 2, 8_000),
    pass('p2', 9_000),
    pass('p2', 10_000),
    raise('p1', 3, 11_000),
    pass('p2', 12_000),
    raise('p1', 1, 13_000),
    // Con el equipo completo Ana pasa sola y Bruno gana cada lote al pujar; el último con todas sus monedas.
    raise('p2', 2, 14_000),
    raise('p2', 3, 15_000),
    raise('p2', 1, 16_000),
    raise('p2', 2, 17_000),
    raise('p2', 3, 18_000),
    raise('p2', 89, 19_000),
    // La subasta ha terminado.
    pass('p1', 20_000),
    timeout(21_000),
  ],
};

const budgetExhausted: GoldenScenario = {
  name: 'budget-exhausted',
  seed: 1304,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { generations: [1, 2], bidSeconds: 20, initialBudget: 1, includeForms: false },
  steps: [
    // Con una moneda cada uno, quien puja gana al instante: nadie más puede cubrir 2.
    raise('p2', 1, 2_000),
    pass('p1', 3_000),
    raise('p3', 1, 4_000),
    // Ana gana el lote 3 y, sin monedas en la mesa, el resto de lotes se cierran sin dueño hasta el final.
    raise('p1', 1, 5_000),
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 1204,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { ...baseConfig, initialBudget: 1, bidSeconds: 120 },
  steps: [
    pass('p1', 2_000),
    // Una puja no entera no valida y detiene el escenario.
    raise('p2', 1.5, 3_000),
    raise('p2', 1, 4_000),
  ],
};

export const pokemonTeamAuctionScenarios: GoldenEngineEntry = {
  module: pokemonTeamAuctionGame,
  scenarios: [biddingErrorsTimeouts, topBidderPresence, fullTeamsNoTimer, budgetExhausted, invalidActionStops],
  configCases: [
    // Válidos: normalización de generaciones, límites, bidSeconds por defecto y enteros con decimal cero.
    { ...baseConfig, generations: [2, 1, 2] },
    { ...baseConfig, generations: [9] },
    { ...baseConfig, bidSeconds: 0, initialBudget: 1 },
    { ...baseConfig, bidSeconds: 120, initialBudget: 100 },
    { generations: [1], initialBudget: 10, includeForms: true },
    { ...baseConfig, bidSeconds: 30.0 },
    // Inválidos: límites, tipos y raíz .strict().
    { ...baseConfig, bidSeconds: -1 },
    { ...baseConfig, bidSeconds: 121 },
    { ...baseConfig, bidSeconds: 20.5 },
    { ...baseConfig, bidSeconds: null },
    { ...baseConfig, initialBudget: 0 },
    { ...baseConfig, initialBudget: 101 },
    { ...baseConfig, initialBudget: 10.5 },
    { ...baseConfig, initialBudget: '10' },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, generations: [1.5] },
    { ...baseConfig, generations: 1 },
    { ...baseConfig, includeForms: 'no' },
    { ...baseConfig, unknownKey: 'no se admite' },
    { generations: [1], bidSeconds: 20, includeForms: false },
    { generations: [1], bidSeconds: 20, initialBudget: 10 },
    [],
    null,
  ],
};
