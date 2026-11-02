// Escenarios dorados de Sketchmon. createInitialState baraja el orden de dibujantes (una extracción por jugador y
// vuelta, de size - 1 a 1) y cada ronda que empieza consume una extracción para el Pokémon objetivo; una ronda saltada
// porque su dibujante no está conectado no consume random(). Los trazos llevan pocos puntos: la proyección pública los
// repite en cada paso. Los límites de 16 384 puntos y 1 024 trazos necesitan más de 64 lotes y se cubren en
// SketchmonEngineTest con estados construidos a mano.
import { sketchmonGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };

interface Point { x: number; y: number }
type Operation =
  | { kind: 'START'; stroke: { id: string; tool: string; color: string; width: number; points: Point[] } }
  | { kind: 'APPEND'; strokeId: string; points: Point[] };

function start(id: string, tool: string, color: string, width: number, points: Point[]): Operation {
  return { kind: 'START', stroke: { id, tool, color, width, points } };
}
function append(strokeId: string, points: Point[]): Operation {
  return { kind: 'APPEND', strokeId, points };
}
function draw(playerId: string, operations: Operation[], now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'DRAW_BATCH', operations }, now };
}
function edit(playerId: string, type: 'UNDO_STROKE' | 'REDO_STROKE' | 'CLEAR_DRAWING', now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type }, now };
}
function guess(playerId: string, pokemonId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'GUESS_POKEMON', pokemonId }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}
function presence(players: GamePlayer[], now: number): GoldenStep {
  return { kind: 'presence', players, now };
}
function offline(player: GamePlayer): GamePlayer {
  return { ...player, connected: false };
}
/** `count` puntos en diagonal, con coordenadas decimales y los extremos 0 y 1. */
function line(count: number): Point[] {
  return Array.from({ length: count }, (_, index) => ({ x: index / (count - 1 || 1), y: 1 - index / 64 }));
}

const baseConfig = {
  generations: [1], roundSeconds: 60, laps: 1, hintsEnabled: false, memoryPreviewEnabled: false, includeForms: false,
};

// Seed 1670 con pistas: dibujan Bruno, Carla y Ana; Tentacruel, Graveler y Articuno (que no evoluciona). Pistas a 1/3,
// 5/9 y 7/9 de 60 s.
const drawUndoRedoGuess: GoldenScenario = {
  name: 'draw-undo-redo-guess',
  seed: 1670,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { ...baseConfig, hintsEnabled: true },
  steps: [
    // Ronda 1 (1000–61000), dibuja Bruno: pistas en 21000, 34333 y 47667.
    draw('p9', [start('a', 'PENCIL', '#182033', 4, [{ x: 0.5, y: 0.5 }])], 1_500),
    draw('p1', [start('a', 'PENCIL', '#182033', 4, [{ x: 0.5, y: 0.5 }])], 2_000),
    edit('p1', 'UNDO_STROKE', 2_100),
    // Pilas vacías y lienzo vacío: aceptadas sin cambios.
    edit('p2', 'UNDO_STROKE', 2_200),
    edit('p2', 'REDO_STROKE', 2_300),
    edit('p2', 'CLEAR_DRAWING', 2_400),
    draw('p2', [
      start('s1', 'PENCIL', '#182033', 4, [{ x: 0.1, y: 0.2 }, { x: 0.15, y: 0.25 }]),
      append('s1', [{ x: 0.2, y: 0.3 }]),
    ], 2_500),
    // Un lote rechazado no aplica ninguna operación, ni las anteriores al error.
    draw('p2', [
      start('s2', 'ERASER', '#ffffff', 32, [{ x: 0, y: 1 }]),
      append('fantasma', [{ x: 0.3, y: 0.3 }]),
    ], 3_000),
    draw('p2', [start('s1', 'PENCIL', '#182033', 4, [{ x: 0.9, y: 0.9 }])], 3_100),
    draw('p2', [
      start('s2', 'FILL', '#e24671', 2, [{ x: 0.5, y: 0.5 }]),
      start('s2', 'FILL', '#e24671', 2, [{ x: 0.6, y: 0.6 }]),
    ], 3_200),
    draw('p2', [
      start('s2', 'FILL', '#e24671', 2, [{ x: 0.5, y: 0.5 }]),
      start('s-3_X', 'PENCIL', '#9a5b3c', 8, [{ x: 1, y: 0 }, { x: 0.333, y: 0.666 }]),
    ], 3_300),
    edit('p2', 'UNDO_STROKE', 3_400),
    edit('p2', 'UNDO_STROKE', 3_500),
    edit('p2', 'REDO_STROKE', 3_600),
    edit('p2', 'CLEAR_DRAWING', 3_700),
    edit('p2', 'UNDO_STROKE', 3_800),
    // APPEND no vacía la pila de rehacer: el REDO siguiente recupera el lienzo vacío del CLEAR.
    draw('p2', [append('s2', [{ x: 0.55, y: 0.6 }])], 3_900),
    edit('p2', 'REDO_STROKE', 4_000),
    edit('p2', 'UNDO_STROKE', 4_100),
    guess('p2', 'tentacruel', 4_200),
    guess('p1', 'pidgey', 5_000),
    guess('p1', 'tentacruel', 5_300),
    guess('p3', 'chikorita', 5_400),
    guess('p3', 'no-existe', 5_500),
    timeout(21_000),
    guess('p3', 'rattata', 22_000),
    timeout(30_000),
    // El rechazo devuelve el estado con la segunda pista ya revelada.
    draw('p1', [start('b', 'PENCIL', '#182033', 4, [{ x: 0.5, y: 0.5 }])], 35_000),
    guess('p1', 'tentacruel', 36_000),
    guess('p3', 'tentacruel', 36_500),
    timeout(41_999),
    timeout(42_000),
    // Ronda 2 (42000–102000), dibuja Carla: pistas en 62000, 75333 y 88667; Bruno acierta al primer intento.
    draw('p3', [start('r2', 'PENCIL', '#ef4444', 6, line(4))], 43_000),
    timeout(62_000),
    timeout(75_333),
    timeout(88_667),
    guess('p2', 'graveler', 89_000),
    timeout(95_000),
    // Ronda 3 (95000–155000), dibuja Ana: pistas en 115000, 128333 y 141667; nadie acierta y la acción tardía
    // resuelve la ronda aunque se rechace.
    draw('p1', [start('r3', 'PENCIL', '#2563eb', 10, line(3))], 96_000),
    guess('p2', 'spearow', 100_000),
    timeout(115_000),
    timeout(128_333),
    timeout(141_667),
    guess('p3', 'articuno', 155_000),
    guess('p3', 'articuno', 155_500),
    timeout(161_000),
  ],
};

// Seed 1614, dos vueltas con pistas, vista previa y formas: Arcanine, Dunsparce, (Magikarp, cancelada) y
// Sandshrew de Alola, que no tiene etapa evolutiva.
const hintsPreviewLaps: GoldenScenario = {
  name: 'hints-preview-laps',
  seed: 1614,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: {
    generations: [2, 1, 2], roundSeconds: 90, laps: 2,
    hintsEnabled: true, memoryPreviewEnabled: true, includeForms: true,
  },
  steps: [
    // Ronda 1 (1000–91000), dibuja Ana: vista previa hasta 4000; pistas en 31000, 51000 y 71000.
    draw('p1', [start('a1', 'PENCIL', '#84cc16', 12, line(3))], 2_000),
    timeout(3_999),
    timeout(4_000),
    guess('p2', 'growlithe', 20_000),
    timeout(31_000),
    timeout(51_000),
    timeout(71_000),
    guess('p2', 'arcanine', 75_000),
    timeout(81_000),
    // Ronda 2 (81000–171000), dibuja Bruno: Ana se desconecta y vuelve; nadie acierta y el timeout resuelve.
    draw('p2', [start('b1', 'ERASER', '#7b8496', 20, line(2))], 82_000),
    presence([offline(ana), bruno], 83_000),
    guess('p1', 'dunsparce', 83_500),
    presence([ana, bruno], 84_000),
    timeout(170_999),
    timeout(171_000),
    timeout(177_000),
    // Ronda 3 (177000), dibuja Ana: se desconecta y la ronda se cancela; empieza la 4 con Bruno.
    draw('p1', [start('c1', 'FILL', '#d946ef', 2, [{ x: 0.5, y: 0.5 }])], 177_500),
    presence([offline(ana), bruno], 178_000),
    draw('p2', [start('d1', 'PENCIL', '#10a6c3', 3, line(2))], 179_000),
    presence([ana, bruno], 180_000),
    timeout(208_000),
    timeout(228_000),
    timeout(248_000),
    guess('p1', 'sandshrew-alola', 250_000),
    timeout(256_000),
  ],
};

// Seed 1603, sin pistas ni vista previa, 120 s: el orden es Ana, Carla y Bruno. La desconexión de Ana cancela su
// ronda; Ana vuelve y acierta la de Carla, y la ronda de Bruno se salta porque está desconectado: fin de partida.
const drawerDisconnects: GoldenScenario = {
  name: 'drawer-disconnects',
  seed: 1603,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { ...baseConfig, roundSeconds: 120 },
  steps: [
    draw('p1', [start('x', 'PENCIL', '#e1a817', 5, line(2))], 2_000),
    guess('p2', 'pikachu', 2_500),
    presence([offline(ana), bruno, carla], 3_000),
    guess('p1', 'jolteon', 3_200),
    presence([ana, bruno, carla], 3_500),
    draw('p3', [start('y', 'PENCIL', '#27965c', 7, line(3))], 3_600),
    // El id se compara tal cual: mayúsculas, tildes y espacios no encuentran el Pokémon.
    guess('p2', 'JOLTEON', 3_700),
    guess('p2', '  Jólteon ', 3_800),
    guess('p1', 'jolteon', 4_000),
    presence([ana, offline(bruno), carla], 6_000),
    timeout(9_999),
    timeout(10_000),
    guess('p1', 'jolteon', 11_000),
  ],
};

// Seed 1604, dos jugadores y tres vueltas con vista previa y sin pistas: dibujan Bruno (Nidorina) y Ana (Mr. Mime) en
// la primera vuelta, y Ana (Electabuzz) y Bruno en la segunda. Un lote en el límite (8 operaciones de 32 puntos,
// grosores 2 y 32) se acepta; un trazo de 33 puntos no valida y detiene el escenario.
const tools = ['PENCIL', 'ERASER', 'FILL'];
const colors = ['#182033', '#ffffff', '#7b8496', '#e24671', '#ef4444', '#f97316', '#e1a817', '#84cc16'];
const fullBatch = Array.from({ length: 8 }, (_, index) =>
  start(`max_${index}`, tools[index % 3]!, colors[index]!, index % 2 ? 32 : 2, line(32)));
const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 1604,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { ...baseConfig, laps: 3, memoryPreviewEnabled: true },
  steps: [
    // Ronda 1 (1000–61000): Ana acierta en el primer segundo (5 puntos).
    draw('p2', [start('n', 'PENCIL', '#f97316', 4, line(2))], 1_500),
    guess('p1', 'nidorina', 2_000),
    timeout(8_000),
    // Ronda 2 (8000–68000): vista previa hasta 11000; Bruno acierta a los 22 s (4 puntos).
    timeout(11_000),
    guess('p2', 'mr-mime', 30_000),
    timeout(36_000),
    // Ronda 3 (36000–96000), segunda vuelta: Bruno acierta a los 45 s (3 puntos).
    guess('p2', 'electabuzz', 81_000),
    timeout(87_000),
    // Ronda 4 (87000–147000).
    draw('p2', fullBatch, 88_000),
    draw('p2', [start('demasiados', 'PENCIL', '#182033', 4, line(33))], 89_000),
    guess('p1', 'pikachu', 90_000),
  ],
};

export const sketchmonScenarios: GoldenEngineEntry = {
  module: sketchmonGame,
  scenarios: [drawUndoRedoGuess, hintsPreviewLaps, drawerDisconnects, invalidActionStops],
  configCases: [
    {
      generations: [1, 2, 3, 4, 5, 6, 7, 8, 9], roundSeconds: 90, laps: 1,
      hintsEnabled: false, memoryPreviewEnabled: false, includeForms: false,
    },
    // Válidos: normalización de generaciones, cada límite en el borde y enteros con decimal cero.
    { ...baseConfig, generations: [3, 1, 3, 2, 1] },
    { ...baseConfig, generations: [9] },
    { ...baseConfig, roundSeconds: 120, laps: 3 },
    { ...baseConfig, roundSeconds: 90.0, laps: 2.0 },
    { ...baseConfig, hintsEnabled: true, memoryPreviewEnabled: true, includeForms: true },
    baseConfig,
    // Inválidos: generaciones, tiempos fuera de la lista, cada límite justo fuera, decimales, tipos y faltantes.
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [1.5] },
    { ...baseConfig, generations: '1' },
    { ...baseConfig, roundSeconds: 75 },
    { ...baseConfig, roundSeconds: 59 },
    { ...baseConfig, roundSeconds: 121 },
    { ...baseConfig, roundSeconds: 60.5 },
    { ...baseConfig, roundSeconds: '60' },
    { ...baseConfig, laps: 0 },
    { ...baseConfig, laps: 4 },
    { ...baseConfig, laps: 1.5 },
    { ...baseConfig, laps: 9007199254740992 },
    { ...baseConfig, hintsEnabled: 'true' },
    { ...baseConfig, memoryPreviewEnabled: null },
    { ...baseConfig, includeForms: undefined },
    // .strict(): una clave desconocida invalida la configuración.
    { ...baseConfig, unknownKey: 'no se admite' },
    [],
    null,
  ],
};
