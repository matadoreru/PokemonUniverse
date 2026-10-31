// Escenarios dorados de PokéTaboo. createInitialState baraja el orden de descriptores; cada ronda que arranca consume
// una extracción para el Pokémon secreto. Las pistas y los intentos no consumen random().
import { pokeTabooGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };

function hint(playerId: string, text: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'SEND_HINT', text }, now };
}
function guess(playerId: string, pokemonId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'GUESS_POKEMON', pokemonId }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

const baseConfig = { generations: [1], roundSeconds: 30, laps: 1, includeRegionalForms: true };

const threePlayersHints: GoldenScenario = {
  name: 'three-players-hints',
  seed: 631,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: baseConfig,
  steps: [
    // Orden de descriptores p3 → p1 → p2. Ronda 1 (1000–31000): Carla describe a Slowbro de Galar.
    hint('p9', 'Hola', 1_500),
    hint('p1', 'Es rosa', 2_000),
    // Mayúsculas, tildes y espacios de más: el texto normalizado contiene el nombre (con límites o compacto).
    hint('p3', '  Es un SLÓWBRO   raro ', 2_500),
    hint('p3', 'Parece un slow-bro', 2_600),
    hint('p3', '  Su forma de GALÁR es   rosa  ', 3_000),
    hint('p3', 'Psíquico y veneno', 3_200),
    hint('p3', 'Psíquico y veneno', 3_500),
    guess('p3', 'slowbro', 4_000),
    guess('p1', 'chikorita', 4_500),
    guess('p1', 'slowbro', 5_000),
    guess('p1', 'slowpoke-galar', 5_500),
    guess('p2', 'slowbro-galar', 10_000),
    guess('p1', 'slowbro-galar', 11_000),
    timeout(13_999),
    timeout(14_000),
    // Ronda 2 (14000–44000): Ana describe y se desconecta; su ronda se cancela y empieza la de Bruno.
    hint('p1', 'Unicornio de Galar', 15_000),
    guess('p2', 'rapidash-galar', 16_000),
    { kind: 'presence', players: [{ ...ana, connected: false }, bruno, carla], now: 17_000 },
    // Ronda 3 (17000–47000): Ana vuelve como adivina; el intento al límite cierra la ronda sin acierto.
    { kind: 'presence', players: [ana, bruno, carla], now: 18_000 },
    guess('p3', 'horsea', 19_000),
    guess('p1', 'seadra', 47_000),
    timeout(51_000),
    hint('p2', 'Tarde', 52_000),
  ],
};

const lapsAndAbsentDescriptor: GoldenScenario = {
  name: 'laps-and-absent-descriptor',
  seed: 632,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { generations: [2, 1, 2], roundSeconds: 45, laps: 2, includeRegionalForms: false },
  steps: [
    // Orden p2 → p1 → p2 → p1 (dos vueltas). Ronda 1 (1000–46000): Bruno describe a Gyarados; Ana acierta al
    // primer intento en la primera banda de tiempo.
    hint('p2', 'Dragón furioso que sale de un pez', 1_500),
    guess('p1', 'gyarados', 2_000),
    // Ana se desconecta en los resultados: su ronda como descriptora (la 2) se salta al arrancar la siguiente.
    { kind: 'presence', players: [{ ...ana, connected: false }, bruno], now: 3_000 },
    timeout(6_000),
    // Ronda 3 (6000–51000): Bruno describe; Ana vuelve y acierta en el último tramo, al segundo intento.
    { kind: 'presence', players: [ana, bruno], now: 7_000 },
    hint('p2', 'Tiene una flor enorme', 8_000),
    guess('p1', 'ivysaur', 48_000),
    guess('p1', 'venusaur', 50_000),
    timeout(54_000),
    // Ronda 4 (54000–99000): Ana describe y nadie acierta.
    hint('p1', 'Es un imán', 55_000),
    timeout(99_000),
    timeout(103_000),
  ],
};

/** 24 pistas (el máximo por ronda), una cada 500 ms, y una más que se rechaza. */
function hintFlood(playerId: string, start: number): GoldenStep[] {
  return Array.from({ length: 25 }, (_unused, index) => hint(playerId, `Pista número ${index + 1}`, start + index * 500));
}

const hintLimit: GoldenScenario = {
  name: 'hint-limit',
  seed: 633,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { generations: [1, 2], roundSeconds: 120, laps: 1, includeRegionalForms: true },
  steps: [
    // Orden p1 → p2 → p3. Ronda 1 (1000–121000): Ana describe a Totodile con 24 pistas; la 25.ª se rechaza.
    ...hintFlood('p1', 2_000),
    guess('p2', 'totodile', 30_000),
    timeout(34_000),
    // Ronda 2 (34000–154000): Bruno describe a Lugia y Carla acierta.
    hint('p2', 'Guardián de las Islas Remolino', 35_000),
    guess('p3', 'lugia', 60_000),
    timeout(64_000),
    // Ronda 3 (64000–184000): Ana acierta justo en el inicio de la última banda (1 punto).
    hint('p3', 'Patea muy lejos', 65_000),
    guess('p2', 'hitmonchan', 70_000),
    guess('p1', 'hitmonlee', 160_000),
    // Bruno y Carla empatan a 6 puntos (y en aciertos y rondas de descriptor): comparten la primera posición.
    timeout(164_000),
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 634,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: baseConfig,
  steps: [
    // La pista se recorta con el trim de JS antes de contar: 180 caracteres más espacios valen.
    hint('p1', `\u00a0 ${'x'.repeat(180)}\u3000`, 2_000),
    hint('p2', `\u00a0 ${'x'.repeat(180)}\u3000`, 2_000),
    // Una pista que queda vacía al recortarla no valida y detiene el escenario.
    hint('p1', ' \u00a0\t ', 3_000),
    hint('p2', 'Válida', 4_000),
  ],
};

export const pokeTabooScenarios: GoldenEngineEntry = {
  module: pokeTabooGame,
  scenarios: [threePlayersHints, lapsAndAbsentDescriptor, hintLimit, invalidActionStops],
  configCases: [
    // Válidos: normalización de generaciones, cada duración admitida, límites de vueltas y enteros con decimal cero.
    { ...baseConfig, generations: [2, 1, 2] },
    { ...baseConfig, generations: [9] },
    { ...baseConfig, roundSeconds: 45 },
    { ...baseConfig, roundSeconds: 60 },
    { ...baseConfig, roundSeconds: 90 },
    { ...baseConfig, roundSeconds: 120, laps: 5 },
    { ...baseConfig, roundSeconds: 60.0, laps: 1.0 },
    { ...baseConfig, includeRegionalForms: false },
    // Inválidos: duraciones fuera de la lista, límites de vueltas, tipos y raíz .strict().
    { ...baseConfig, roundSeconds: 29 },
    { ...baseConfig, roundSeconds: 31 },
    { ...baseConfig, roundSeconds: 59 },
    { ...baseConfig, roundSeconds: 121 },
    { ...baseConfig, roundSeconds: 30.5 },
    { ...baseConfig, roundSeconds: '30' },
    { ...baseConfig, laps: 0 },
    { ...baseConfig, laps: 6 },
    { ...baseConfig, laps: 1.5 },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, includeRegionalForms: 'yes' },
    { ...baseConfig, unknownKey: 'no se admite' },
    { generations: [1], roundSeconds: 30, laps: 1 },
    [],
    null,
  ],
};
