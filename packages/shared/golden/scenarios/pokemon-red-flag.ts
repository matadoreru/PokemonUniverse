// Escenarios dorados de Pokémon Red Flag. createInitialState baraja el mazo de Pokémon; cada ronda consume, en orden,
// el modo (solo con MIXED) y la baraja de los huecos de respuesta; cada votación baraja el orden de las respuestas.
import { pokemonRedFlagGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };
const dani: GamePlayer = { id: 'p4', displayName: 'Dani' };

function draft(playerId: string, text: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'UPDATE_RED_FLAG_DRAFT', text }, now };
}
function submit(playerId: string, text: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'SUBMIT_RED_FLAG', text }, now };
}
function vote(playerId: string, answerId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'VOTE_RED_FLAG', answerId }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

const baseConfig = { generations: [1], rounds: 3, phaseSeconds: 30, includeForms: false, mode: 'RED' };

const redModeVotes: GoldenScenario = {
  name: 'red-mode-votes',
  seed: 621,
  catalog: 'gen1-2',
  players: [ana, bruno, carla, dani],
  config: { ...baseConfig, phaseSeconds: 15 },
  steps: [
    // Ronda 1 (1000–16000), Caterpie. Huecos: Ana rf-1-4, Bruno rf-1-2, Carla rf-1-3, Dani rf-1-1.
    draft('p9', 'Hola', 1_500),
    vote('p1', 'rf-1-2', 1_800),
    // Zod recorta la respuesta enviada con el trim de JS (también el espacio de no separación).
    submit('p1', '\u00a0 Siempre llega tarde  ', 2_000),
    draft('p1', 'Otra idea', 2_500),
    submit('p1', 'Otra idea', 2_600),
    draft('p2', 'Muerde los cables', 3_000),
    submit('p2', 'Muerde los cables', 3_500),
    submit('p3', 'Nunca devuelve las Poké Balls', 4_000),
    submit('p4', 'Evoluciona sin avisar', 5_000),
    // Votación (5000–20000): todos responden y Bruno gana en solitario.
    draft('p1', 'Tarde', 5_500),
    submit('p1', 'Tarde', 5_600),
    vote('p1', 'rf-1-4', 6_000),
    vote('p1', 'rf-9-9', 6_100),
    vote('p1', 'rf-1-2', 6_500),
    vote('p1', 'rf-1-3', 6_600),
    vote('p3', 'rf-1-2', 7_000),
    vote('p4', 'rf-1-3', 7_500),
    vote('p2', 'rf-1-4', 8_000),
    timeout(15_999),
    timeout(16_000),
    // Ronda 2 (16000–31000). Huecos: Ana rf-2-3, Bruno rf-2-2, Carla rf-2-1, Dani rf-2-4.
    submit('p1', 'Se come tus bayas', 17_000),
    submit('p2', 'Ronca en el PC', 17_500),
    submit('p3', 'Usa Salpicadura en combate', 18_000),
    submit('p4', 'No sabe nadar', 18_500),
    // Votación (18500–33500): empate entre Ana y Bruno, que pasa a una segunda votación entre ambos.
    vote('p1', 'rf-2-2', 19_000),
    vote('p2', 'rf-2-3', 19_500),
    vote('p3', 'rf-2-2', 20_000),
    vote('p4', 'rf-2-3', 20_500),
    // Desempate (20500–35500): Bruno gana.
    vote('p3', 'rf-2-1', 21_000),
    vote('p1', 'rf-2-3', 21_100),
    vote('p1', 'rf-2-2', 21_500),
    vote('p2', 'rf-2-3', 22_000),
    vote('p3', 'rf-2-2', 22_500),
    vote('p4', 'rf-2-2', 23_000),
    timeout(31_000),
    // Ronda 3 (31000–46000). Huecos: Ana rf-3-2, Bruno rf-3-3, Carla rf-3-1, Dani rf-3-4.
    submit('p1', 'Te deja en visto', 32_000),
    submit('p2', 'Cambia de tipo cada martes', 32_500),
    submit('p3', 'Huele a Muk', 33_000),
    submit('p4', 'Solo come Caramelos Raros', 33_500),
    // Votación (33500–48500): solo votan Ana y Bruno; al vencer, el empate pasa a desempate.
    vote('p1', 'rf-3-3', 34_000),
    vote('p2', 'rf-3-2', 34_500),
    timeout(48_500),
    // Desempate (48500–63500): sigue empatado al vencer y la victoria se comparte.
    vote('p3', 'rf-3-2', 49_000),
    vote('p4', 'rf-3-3', 49_500),
    vote('p1', 'rf-3-3', 63_500),
    timeout(63_500),
    timeout(71_500),
  ],
};

const mixedModePresence: GoldenScenario = {
  name: 'mixed-mode-presence',
  seed: 623,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { generations: [2, 1, 2], rounds: 3, phaseSeconds: 120, includeForms: true, mode: 'MIXED' },
  steps: [
    // Ronda 1 (1000–121000): solo borradores. El de Ana queda vacío al recortarlo y el de Bruno pasa a respuesta.
    draft('p1', '   ', 2_000),
    draft('p2', ' Duerme todo el día\u3000', 3_000),
    draft('p2', ' Duerme todo el día y la noche\u3000', 4_000),
    submit('p3', 'Tarde', 121_000),
    // Un borrador fuera de tiempo abre la votación (y se rechaza).
    draft('p3', 'Tarde', 121_000),
    timeout(121_500),
    // Votación (121000–241000): Ana vota y la desconexión de Carla la cierra.
    { kind: 'presence', players: [ana, bruno, carla], now: 122_000 },
    vote('p1', 'rf-1-2', 122_500),
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 123_000 },
    timeout(131_000),
    // Ronda 2 (131000–251000): Ana responde y, al desconectarse Bruno, no queda nadie que pueda votar.
    draft('p3', 'Espectadora', 132_000),
    submit('p1', 'Colecciona calcetines', 133_000),
    { kind: 'presence', players: [ana, { ...bruno, connected: false }, { ...carla, connected: false }], now: 134_000 },
    timeout(142_000),
    // Ronda 3 (142000–262000): todos vuelven, nadie responde y la votación se cierra sin candidatas.
    { kind: 'presence', players: [ana, bruno, carla], now: 143_000 },
    timeout(262_000),
    timeout(270_000),
  ],
};

const greenModeTimeouts: GoldenScenario = {
  name: 'green-mode-timeouts',
  seed: 626,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { ...baseConfig, phaseSeconds: 20, mode: 'GREEN' },
  steps: [
    // Ronda 1 (1000–21000): triple empate y desempate que cierra la desconexión de Bruno.
    submit('p1', 'Comparte sus bayas', 2_000),
    { kind: 'presence', players: [ana, bruno, carla], now: 2_500 },
    submit('p2', 'Te despierta con Canto', 3_000),
    submit('p3', 'Siempre trae Pociones', 4_000),
    vote('p1', 'rf-1-3', 5_000),
    vote('p2', 'rf-1-2', 5_500),
    vote('p3', 'rf-1-1', 6_000),
    vote('p1', 'rf-1-3', 7_000),
    vote('p3', 'rf-1-3', 7_500),
    { kind: 'presence', players: [ana, { ...bruno, connected: false }, carla], now: 8_000 },
    timeout(16_000),
    // Ronda 2 (16000–36000): responden Ana y Carla; Bruno vuelve durante la votación, que cierra el tiempo.
    submit('p1', 'Abraza fuerte', 17_000),
    submit('p3', 'Ríe con todo', 18_000),
    { kind: 'presence', players: [ana, bruno, carla], now: 19_000 },
    vote('p1', 'rf-2-3', 20_000),
    timeout(38_000),
    timeout(46_000),
    // Ronda 3 (46000–66000): solo un borrador de Ana; gana sin votos al vencer la votación.
    draft('p1', 'Te presta su gorra', 47_000),
    timeout(66_000),
    timeout(86_000),
    timeout(94_000),
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 627,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: baseConfig,
  steps: [
    // El borrador admite 100 caracteres sin recortar; el envío se recorta antes de contar (100 + espacios vale).
    draft('p1', 'x'.repeat(100), 2_000),
    submit('p1', `  ${'y'.repeat(100)}  `, 3_000),
    // Un envío que queda vacío al recortarlo no valida y detiene el escenario.
    submit('p2', ' \u00a0\t ', 4_000),
    submit('p2', 'Válida', 5_000),
  ],
};

export const pokemonRedFlagScenarios: GoldenEngineEntry = {
  module: pokemonRedFlagGame,
  scenarios: [redModeVotes, mixedModePresence, greenModeTimeouts, invalidActionStops],
  configCases: [
    // Válidos: normalización de generaciones, límites, los tres modos y enteros con decimal cero.
    { ...baseConfig, generations: [2, 1, 2] },
    { ...baseConfig, generations: [9] },
    { ...baseConfig, rounds: 1, phaseSeconds: 15 },
    { ...baseConfig, rounds: 10, phaseSeconds: 120 },
    { ...baseConfig, rounds: 3.0 },
    { ...baseConfig, includeForms: true, mode: 'GREEN' },
    { ...baseConfig, mode: 'MIXED' },
    // Inválidos: límites, tipos, enum y raíz .strict().
    { ...baseConfig, rounds: 0 },
    { ...baseConfig, rounds: 11 },
    { ...baseConfig, phaseSeconds: 14 },
    { ...baseConfig, phaseSeconds: 121 },
    { ...baseConfig, phaseSeconds: 30.5 },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, includeForms: 'no' },
    { ...baseConfig, mode: 'BLUE' },
    { ...baseConfig, mode: 'red' },
    { ...baseConfig, unknownKey: 'no se admite' },
    { generations: [1], rounds: 3, phaseSeconds: 30, includeForms: false },
    [],
    null,
  ],
};
