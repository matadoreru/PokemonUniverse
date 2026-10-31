// Escenarios dorados de Type Chain. createInitialState baraja el orden de turnos y cada cadena nueva (inicio y
// reinicio) consume una extracción para el Pokémon inicial; los envíos no consumen random().
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

const threePlayersSurvivor: GoldenScenario = {
  name: 'three-players-survivor',
  seed: 601,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { generations: [1], turnSeconds: 20 },
  steps: [
    // Orden p1 → p2 → p3; inicial Jolteon (eléctrico). Turno de Ana (1000–21000).
    submit('p2', 'pikachu', 2_000),
    submit('p1', 'missingno', 2_500),
    submit('p1', 'chikorita', 3_000),
    submit('p1', 'pikachu', 3_500),
    submit('p1', 'bulbasaur', 4_000),
    submit('p1', 'jolteon', 5_000),
    submit('p1', 'pikachu', 6_000),
    // Bruno (6000–26000) y Carla (7000–27000): Magneton comparte los dos tipos de Magnemite.
    submit('p2', 'magnemite', 7_000),
    submit('p3', 'magneton', 8_000),
    submit('p3', 'voltorb', 9_000),
    // Ana (9000–29000) agota el turno: queda eliminada por tiempo.
    timeout(28_999),
    submit('p1', 'raichu', 29_000),
    timeout(29_000),
    // Carla se desconecta fuera de su turno; al llegarle, activateTurn la elimina y Bruno sobrevive.
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 30_000 },
    submit('p2', 'electrode', 31_000),
    submit('p2', 'pikachu', 32_000),
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
    // Orden p2 → p4 → p3 → p1; inicial Totodile. Corsola de Galar no tiene continuación: la cadena se reinicia.
    ...chainRun(['p2', 'p4', 'p3', 'p1'], ['corsola', 'magcargo', 'typhlosion-hisui', 'misdreavus', 'corsola-galar'], 2_000),
    // Dani, jugador actual, se desconecta: handlePresenceChange la elimina y pasa el turno a Carla.
    { kind: 'presence', players: [ana, bruno, carla, { ...dani, connected: false }], now: 7_000 },
    // 41 intentos fuera del pool (generación 1): la lista pública se recorta a los 40 últimos.
    ...['bulbasaur', 'ivysaur', 'venusaur', 'charmander', 'charmeleon', 'charizard', 'squirtle', 'wartortle',
      'blastoise', 'caterpie', 'metapod', 'butterfree', 'weedle', 'kakuna', 'beedrill', 'pidgey', 'pidgeotto',
      'pidgeot', 'rattata', 'raticate', 'spearow', 'fearow', 'ekans', 'arbok', 'pikachu', 'raichu', 'sandshrew',
      'sandslash', 'nidoran-f', 'nidorina', 'nidoqueen', 'nidoran-m', 'nidorino', 'nidoking', 'clefairy', 'clefable',
      'vulpix', 'ninetales', 'jigglypuff', 'wigglytuff', 'zubat'].map((pokemonId, index) => submit('p3', pokemonId, 8_000 + index * 1_000)),
    submit('p3', 'hoothoot', 48_500),
    // 26 envíos válidos desde Delibird: los eventos recientes se recortan a los 30 últimos.
    ...chainRun(['p3', 'p1', 'p2'], ['hoothoot', 'sentret', 'furret', 'noctowl', 'ledyba', 'spinarak', 'ledian',
      'ariados', 'crobat', 'togetic', 'cleffa', 'igglybuff', 'togepi', 'marill', 'totodile', 'croconaw', 'feraligatr',
      'chinchou', 'pichu', 'lanturn', 'azumarill', 'politoed', 'wooper', 'wooper-paldea', 'quagsire', 'slowking'], 49_000),
    // Dani vuelve, pero sigue eliminada.
    { kind: 'presence', players: [ana, bruno, carla, dani], now: 75_000 },
    timeout(120_000),
    timeout(165_000),
  ],
};

const presenceAndTimeoutFinish: GoldenScenario = {
  name: 'presence-and-timeout-finish',
  seed: 603,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { generations: [2, 1, 2], turnSeconds: 10 },
  steps: [
    // Orden p2 → p1 → p3; inicial Muk de Alola (veneno/siniestro).
    submit('p2', 'umbreon', 2_000),
    submit('p1', 'sneasel', 3_000),
    // Carla, jugadora actual, se desconecta y queda eliminada; vuelve después como espectadora.
    { kind: 'presence', players: [ana, bruno, { ...carla, connected: false }], now: 4_000 },
    submit('p2', 'jynx', 5_000),
    { kind: 'presence', players: [ana, bruno, carla], now: 6_000 },
    submit('p3', 'smoochum', 7_000),
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
    submit('p2', 'pikachu', 2_000),
    // actionSchema es .strict(): una clave desconocida invalida la acción y detiene el escenario.
    { kind: 'action', playerId: 'p1', action: { type: 'SUBMIT_POKEMON', pokemonId: 'pikachu', extra: true }, now: 3_000 },
    submit('p1', 'pikachu', 4_000),
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
