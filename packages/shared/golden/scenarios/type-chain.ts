// Escenarios dorados de Type Chain. createInitialState baraja el orden de turnos y cada cadena nueva (inicio y tipo
// agotado) consume una extracción para elegir su tipo; los envíos no consumen random().
import { typeChainGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };
const dani: GamePlayer = { id: 'p4', displayName: 'Dani' };

function submit(playerId: string, pokemonId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'SUBMIT_POKEMON', pokemonId }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}

/** Envíos válidos encadenados uno por segundo; los jugadores se turnan en el orden dado. */
function chainRun(players: string[], pokemonIds: string[], start: number): GoldenStep[] {
  return pokemonIds.map((pokemonId, index) => submit(players[index % players.length]!, pokemonId, start + index * 1_000));
}

// Segunda cadena (psíquico, 11 en la Gen 2): Girafarig ya salió en la de tipo normal, pero aquí vuelve a valer.
const SECOND_CHAIN = ['girafarig', 'natu', 'xatu', 'espeon', 'slowking', 'slowking-galar', 'unown', 'wobbuffet', 'smoochum', 'lugia', 'celebi'];
// Tercera cadena (tierra): tres envíos más bastan para pasar de los 30 eventos recientes.
const THIRD_CHAIN = ['wooper', 'gligar', 'phanpy'];

const threePlayersSurvivor: GoldenScenario = {
  name: 'three-players-survivor',
  seed: 601,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { generations: [1], turnSeconds: 20 },
  steps: [
    // Orden p1 → p2 → p3; cadena de tipo bicho. Turno de Ana (1000–21000).
    submit('p2', 'caterpie', 2_000),
    submit('p1', 'missingno', 2_500),
    submit('p1', 'chikorita', 3_000),
    submit('p1', 'pikachu', 3_500),
    submit('p1', 'pikachu', 4_000),
    // Butterfree (bicho/volador) vale: basta con tener el tipo de la cadena entre los suyos.
    submit('p1', 'butterfree', 5_000),
    // Bruno (5000–25000) repite y luego acierta; Carla (7000–27000) acierta.
    submit('p2', 'butterfree', 6_000),
    submit('p2', 'weedle', 7_000),
    submit('p3', 'scyther', 8_000),
    // Ana (8000–28000) agota el turno: queda eliminada por tiempo.
    timeout(27_999),
    submit('p1', 'caterpie', 28_000),
    timeout(28_000),
    // Carla se desconecta fuera de su turno; al llegarle, activateTurn la elimina y Bruno sobrevive. Carla (1 Pokémon)
    // queda por delante de Ana (1 Pokémon) porque cayó más tarde.
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 29_000 },
    submit('p2', 'pinsir', 30_000),
    submit('p2', 'caterpie', 31_000),
    timeout(40_000),
  ],
};

const chainResetAndLimits: GoldenScenario = {
  name: 'chain-reset-and-limits',
  seed: 602,
  catalog: 'gen1-2',
  players: [ana, bruno, carla, dani],
  config: { generations: [2], turnSeconds: 45 },
  steps: [
    // Orden p2 → p4 → p3 → p1; cadena de tipo normal (15 en la Gen 2).
    ...chainRun(['p2', 'p4', 'p3', 'p1'], ['sentret', 'furret', 'hoothoot', 'noctowl', 'igglybuff'], 2_000),
    // Dani, jugadora actual, se desconecta: handlePresenceChange la elimina y pasa el turno a Carla.
    { kind: 'presence', players: [ana, bruno, carla, { ...dani, connected: false }], now: 7_000 },
    // 41 intentos fuera del pool (generación 1): la lista pública se recorta a los 40 últimos.
    ...['bulbasaur', 'ivysaur', 'venusaur', 'charmander', 'charmeleon', 'charizard', 'squirtle', 'wartortle',
      'blastoise', 'caterpie', 'metapod', 'butterfree', 'weedle', 'kakuna', 'beedrill', 'pidgey', 'pidgeotto',
      'pidgeot', 'rattata', 'raticate', 'spearow', 'fearow', 'ekans', 'arbok', 'pikachu', 'raichu', 'sandshrew',
      'sandslash', 'nidoran-f', 'nidorina', 'nidoqueen', 'nidoran-m', 'nidorino', 'nidoking', 'clefairy', 'clefable',
      'vulpix', 'ninetales', 'jigglypuff', 'wigglytuff', 'zubat'].map((pokemonId, index) => submit('p3', pokemonId, 8_000 + index * 1_000)),
    submit('p3', 'aipom', 48_500),
    // Los 10 normales que quedan: al nombrar Blissey no queda ninguno y empieza otra cadena con otro tipo.
    ...chainRun(['p3', 'p1', 'p2'], ['aipom', 'girafarig', 'dunsparce', 'teddiursa', 'ursaring', 'porygon2', 'stantler',
      'smeargle', 'miltank', 'blissey'], 49_000),
    // Los usados vuelven a valer en la cadena nueva si tienen su tipo; los eventos recientes se recortan a los 30 últimos.
    ...chainRun(['p1', 'p2', 'p3'], SECOND_CHAIN, 59_000),
    // Al agotarse también el psíquico, la tercera cadena evita los dos tipos que ya han salido.
    ...chainRun(['p3', 'p1', 'p2'], THIRD_CHAIN, 70_000),
    // Dani vuelve, pero sigue eliminada.
    { kind: 'presence', players: [ana, bruno, carla, dani], now: 90_000 },
    timeout(140_000),
    timeout(185_000),
  ],
};

const presenceAndTimeoutFinish: GoldenScenario = {
  name: 'presence-and-timeout-finish',
  seed: 603,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { generations: [2, 1, 2], turnSeconds: 10 },
  steps: [
    // Orden p2 → p1 → p3; cadena de tipo lucha con las generaciones 1 y 2.
    submit('p2', 'machop', 2_000),
    submit('p1', 'hitmontop', 3_000),
    // Carla, jugadora actual, se desconecta y queda eliminada; vuelve después como espectadora.
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 4_000 },
    submit('p2', 'heracross', 5_000),
    { kind: 'presence', players: [ana, bruno, carla], now: 6_000 },
    submit('p3', 'tyrogue', 7_000),
    // Ana agota su turno (5000–15000): queda un superviviente.
    timeout(15_000),
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 604,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { generations: [1], turnSeconds: 15 },
  steps: [
    // Orden p2 → p1; cadena de tipo planta.
    submit('p2', 'bulbasaur', 2_000),
    // actionSchema es .strict(): una clave desconocida invalida la acción y detiene el escenario.
    { kind: 'action', playerId: 'p1', action: { type: 'SUBMIT_POKEMON', pokemonId: 'ivysaur', extra: true }, now: 3_000 },
    submit('p1', 'ivysaur', 4_000),
  ],
};

const baseConfig = { generations: [1], turnSeconds: 15 };

export const typeChainScenarios: GoldenEngineEntry = {
  module: typeChainGame,
  scenarios: [threePlayersSurvivor, chainResetAndLimits, presenceAndTimeoutFinish, invalidActionStops],
  configCases: [
    // Válidos: normalización de generaciones, límites de turnSeconds y enteros con decimal cero.
    { ...baseConfig, generations: [2, 1, 2] },
    { ...baseConfig, generations: [1] },
    { ...baseConfig, generations: [9] },
    { ...baseConfig, turnSeconds: 10 },
    { ...baseConfig, turnSeconds: 45 },
    { ...baseConfig, turnSeconds: 20.0 },
    // Inválidos: límites, tipos y esquema .strict().
    { ...baseConfig, turnSeconds: 9 },
    { ...baseConfig, turnSeconds: 46 },
    { ...baseConfig, turnSeconds: 15.5 },
    { ...baseConfig, turnSeconds: '15' },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, generations: [1.5] },
    { ...baseConfig, generations: 1 },
    { ...baseConfig, unknownKey: 'no se admite' },
    { generations: [1] },
    { turnSeconds: 15 },
    [],
    null,
  ],
};
