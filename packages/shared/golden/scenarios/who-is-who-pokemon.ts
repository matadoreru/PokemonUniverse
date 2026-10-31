// Escenarios dorados de Quién es Quién — Pokémon. createInitialState consume random() con choose (un sorteo por
// elección sobre un pool que se encoge): boardSize para el tablero, uno por jugador para los equipos (pares → BLUE,
// impares → RED) y 2 secretos si es RANDOM; handleTimeout sortea un secreto por equipo que no lo eligió. Los ids del
// tablero, los equipos y los secretos de cada escenario salen de su seed y se anotan junto a él.
// Inalcanzables por acciones (WhoIsWhoPokemonEngineTest): los errores de createInitialState (lanzan fuera del try del
// runner) y 'Este equipo ya ha intentado adivinar en este turno.' (un intento siempre cambia de turno o termina).
import { whoIsWhoPokemonGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };
const dario: GamePlayer = { id: 'p4', displayName: 'Darío' };
const elena: GamePlayer = { id: 'p5', displayName: 'Elena' };

const baseConfig = {
  generations: [1], boardSize: 5, includeForms: false, turnSeconds: 10, rounds: 3, selectionSeconds: 30, secretSelection: 'RANDOM',
};

function act(playerId: string, type: string, pokemonId: string | null, now: number): GoldenStep {
  return { kind: 'action', playerId, action: pokemonId === null ? { type } : { type, pokemonId }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

// Seed 501: tablero lapras, sandslash, seadra, snorlax, geodude; BLUE p3+p2 (secreto lapras), RED p4+p1 (sandslash).
const randomSecretsDraw: GoldenScenario = {
  name: 'random-secrets-draw',
  seed: 501,
  catalog: 'gen1-2',
  players: [ana, bruno, carla, dario],
  config: baseConfig,
  steps: [
    // Ronda 1, turno 1 de BLUE (1000–11000).
    act('p9', 'END_TURN', null, 1_500),
    act('p2', 'SELECT_SECRET', 'seadra', 2_000),
    act('p1', 'END_TURN', null, 2_500),
    // RED descarta fuera de su turno: la lista es del equipo y se alterna (seadra entra y sale).
    act('p1', 'TOGGLE_DISCARD', 'seadra', 3_000),
    act('p4', 'TOGGLE_DISCARD', 'snorlax', 3_200),
    act('p1', 'TOGGLE_DISCARD', 'seadra', 3_400),
    act('p1', 'TOGGLE_DISCARD', 'pikachu', 3_500),
    act('p3', 'GUESS_POKEMON', 'pikachu', 4_000),
    // Fallo de BLUE: turno 2 de RED (4500–14500).
    act('p3', 'GUESS_POKEMON', 'geodude', 4_500),
    timeout(14_499),
    // Ronda 2: turno 3 de BLUE (14500–24500) y turno 4 de RED (16000–26000).
    timeout(14_500),
    act('p2', 'END_TURN', null, 16_000),
    // Un intento al límite se rechaza pero pasa el turno: ronda 3, turno 5 de BLUE (26000–36000).
    act('p1', 'GUESS_POKEMON', 'seadra', 26_000),
    act('p2', 'TOGGLE_DISCARD', 'sandslash', 27_000),
    act('p3', 'SELECT_SECRET', 'lapras', 36_000),
    timeout(36_000),
    // Turno 6 de RED: falla en la última ronda y la partida termina en empate.
    act('p4', 'GUESS_POKEMON', 'snorlax', 40_000),
    act('p1', 'END_TURN', null, 41_000),
  ],
};

// Seed 602: tablero gloom, snubbull, tentacruel, raticate-alola, ampharos, moltres, flaaffy, graveler (con formas);
// BLUE p3+p2, RED p1. Selección hasta 21000.
const playerChoiceSelectionTimeout: GoldenScenario = {
  name: 'player-choice-selection-timeout',
  seed: 602,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { ...baseConfig, generations: [2, 1], boardSize: 8, includeForms: true, selectionSeconds: 20, secretSelection: 'PLAYER_CHOICE' },
  steps: [
    act('p2', 'TOGGLE_DISCARD', 'gloom', 2_000),
    act('p2', 'END_TURN', null, 2_200),
    act('p3', 'SELECT_SECRET', 'raticate-alola', 3_000),
    act('p2', 'SELECT_SECRET', 'gloom', 3_500),
    act('p1', 'SELECT_SECRET', 'pikachu', 4_000),
    act('p1', 'SELECT_SECRET', 'ampharos', 21_000),
    // El plazo de selección sortea el secreto de RED y arranca el turno 1 de BLUE (21000–31000).
    timeout(21_000),
    act('p3', 'GUESS_POKEMON', 'moltres', 22_000),
    act('p1', 'GUESS_POKEMON', 'gloom', 23_000),
    // Ronda 2: turno 3 de BLUE agotado y turno 4 de RED (33000–43000) pasado a mano.
    timeout(33_000),
    act('p1', 'END_TURN', null, 34_000),
    // Ronda 3: entra una espectadora (sin equipo) que no puede actuar.
    { kind: 'presence', players: [ana, bruno, carla, elena], now: 35_000 },
    act('p5', 'END_TURN', null, 35_500),
    act('p2', 'END_TURN', null, 36_000),
    // RED acierta el secreto de BLUE y gana.
    act('p1', 'GUESS_POKEMON', 'raticate-alola', 37_000),
  ],
};

// Seed 703: tablero pineco, espeon, entei, raikou, crobat, dunsparce; BLUE p2, RED p1. Sin plazo de selección.
const presenceForfeit: GoldenScenario = {
  name: 'presence-forfeit',
  seed: 703,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { ...baseConfig, generations: [2], boardSize: 6, rounds: 5, turnSeconds: 15, selectionSeconds: 0, secretSelection: 'PLAYER_CHOICE' },
  steps: [
    timeout(5_000),
    act('p1', 'SELECT_SECRET', 'entei', 6_000),
    act('p2', 'SELECT_SECRET', 'crobat', 7_000),
    act('p2', 'END_TURN', null, 8_000),
    act('p1', 'END_TURN', null, 9_000),
    act('p2', 'GUESS_POKEMON', 'espeon', 10_000),
    timeout(25_000),
    // Ronda 3: desconectado no basta para perder (solo cuenta active), pero no puede actuar.
    { kind: 'presence', players: [{ ...ana, connected: false }, bruno], now: 26_000 },
    act('p1', 'TOGGLE_DISCARD', 'pineco', 26_500),
    act('p2', 'END_TURN', null, 27_000),
    // RED entero inactivo: gana BLUE; después la presencia ya no cambia nada.
    { kind: 'presence', players: [{ ...ana, active: false }, bruno], now: 28_000 },
    { kind: 'presence', players: [ana, bruno], now: 29_000 },
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 804,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { ...baseConfig, rounds: 1 },
  steps: [
    act('p1', 'END_TURN', null, 2_000),
    // Cada variante es .strict(): END_TURN con pokemonId no valida y detiene el escenario.
    act('p2', 'END_TURN', 'pikachu', 3_000),
    act('p2', 'END_TURN', null, 4_000),
  ],
};

export const whoIsWhoPokemonScenarios: GoldenEngineEntry = {
  module: whoIsWhoPokemonGame,
  scenarios: [randomSecretsDraw, playerChoiceSelectionTimeout, presenceForfeit, invalidActionStops],
  configCases: [
    // Válidos: generaciones (dedup + orden), límites y selectionSeconds por defecto (30) en su posición.
    { ...baseConfig, generations: [3, 1, 3, 2] },
    { ...baseConfig, boardSize: 50, turnSeconds: 120, rounds: 25, selectionSeconds: 120, secretSelection: 'PLAYER_CHOICE' },
    { ...baseConfig, boardSize: 5, turnSeconds: 10, rounds: 1, selectionSeconds: 0, includeForms: true },
    { ...baseConfig, selectionSeconds: undefined },
    { ...baseConfig, rounds: 10.0 },
    { ...baseConfig, generations: [9] },
    // Inválidos.
    { ...baseConfig, boardSize: 4 },
    { ...baseConfig, boardSize: 51 },
    { ...baseConfig, turnSeconds: 9 },
    { ...baseConfig, turnSeconds: 121 },
    { ...baseConfig, rounds: 0 },
    { ...baseConfig, rounds: 26 },
    { ...baseConfig, rounds: 10.5 },
    { ...baseConfig, selectionSeconds: -1 },
    { ...baseConfig, selectionSeconds: 121 },
    { ...baseConfig, selectionSeconds: null },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, secretSelection: 'random' },
    { ...baseConfig, secretSelection: 'CHOICE' },
    { ...baseConfig, includeForms: 'true' },
    { ...baseConfig, boardSize: '5' },
    { ...baseConfig, unknownKey: 'el esquema es estricto' },
    { ...baseConfig, boardSize: undefined },
    [],
    null,
  ],
};
