// Escenarios dorados de Pokédex Distance. Cada beginRound (normal o desempate) consume un único random() para el
// objetivo, así que cada escenario encadena ≥ 3 rondas con un seed distinto: una extracción de más o de menos cambia
// el objetivo de todas las rondas siguientes. Con generations [1, 2] el pool son los 251 Pokémon por defecto en orden
// de Pokédex (objetivo = floor(r · 251) + 1).
import { pokedexDistanceGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };
const dario: GamePlayer = { id: 'p4', displayName: 'Darío' };

const baseConfig = { generations: [1, 2], roundSeconds: 20 };

function select(playerId: string, pokemonId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'SELECT_POKEMON', pokemonId }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}
function presence(players: GamePlayer[], now: number): GoldenStep {
  return { kind: 'presence', players, now };
}

const threePlayersFullGame: GoldenScenario = {
  name: 'three-players-full-game',
  seed: 101,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: baseConfig,
  steps: [
    // Ronda 1 (1000–21000, objetivo #35): Ana acierta exacto; Carla (#1) es la más lejana y queda eliminada.
    select('p1', 'clefairy', 2_000),
    select('p2', 'wigglytuff', 3_000),
    select('p3', 'bulbasaur', 4_000),
    // Resultados hasta 10000.
    timeout(9_999),
    timeout(10_000),
    // Ronda 2 (10000–30000, objetivo #192): Carla ya es espectadora; Ana (#190) y Bruno (#194) empatan a distancia 2.
    select('p3', 'pikachu', 11_000),
    select('p1', 'aipom', 12_000),
    select('p2', 'wooper', 13_000),
    // Desempate (19000–39000, objetivo #136): Bruno (#150) queda eliminado y Ana gana.
    timeout(19_000),
    select('p1', 'flareon', 20_000),
    select('p2', 'mewtwo', 21_000),
    timeout(27_000),
    timeout(30_000),
  ],
};

const repeatedTiebreaks: GoldenScenario = {
  name: 'repeated-tiebreaks',
  seed: 202,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: baseConfig,
  steps: [
    // Ronda 1 (objetivo #33): Ana (#30) y Bruno (#36) empatan como los más lejanos; Carla acierta.
    select('p1', 'nidorina', 2_000),
    select('p2', 'clefable', 3_000),
    select('p3', 'nidorino', 4_000),
    // Desempate 1 (10000–30000, objetivo #242): Carla sobrevive pero no juega; nuevo empate (orden Bruno, Ana).
    timeout(10_000),
    select('p3', 'blissey', 11_000),
    select('p2', 'entei', 12_000),
    select('p1', 'magby', 13_000),
    // Desempate 2 (19000–39000, objetivo #55): Raichu (#26) y Doduo (#84) quedan a 29: tercer empate.
    timeout(19_000),
    select('p1', 'raichu', 20_000),
    select('p2', 'doduo', 21_000),
    // Desempate 3 (27000–47000, objetivo #125): Bruno no responde y cae por NO_RESPONSE.
    timeout(27_000),
    select('p1', 'electabuzz', 28_000),
    timeout(46_999),
    timeout(47_000),
    // Ronda 2 (53000–73000, objetivo #92): vuelven a jugar todos los supervivientes; Ana (#100) queda eliminada.
    timeout(53_000),
    select('p3', 'gastly', 54_000),
    select('p1', 'voltorb', 55_000),
    timeout(61_000),
  ],
};

const presenceDisconnects: GoldenScenario = {
  name: 'presence-disconnects',
  seed: 303,
  catalog: 'gen1-2',
  players: [ana, bruno, carla, dario],
  config: baseConfig,
  steps: [
    // Ronda 1 (1000–21000, objetivo #234): Darío se desconecta; la ronda se resuelve con la última selección de los
    // conectados y Darío cae por NO_RESPONSE aunque Carla (#200) fuera la más lejana.
    select('p1', 'kingdra', 2_000),
    presence([ana, bruno, carla, { ...dario, connected: false }], 3_000),
    select('p2', 'magby', 4_000),
    select('p3', 'misdreavus', 5_000),
    // Una reconexión durante los resultados no cambia nada.
    presence([ana, bruno, carla, dario], 6_000),
    // Ronda 2 (11000–31000, objetivo #202): Bruno desconectado puede seleccionar; cuando Carla se desconecta, el
    // único conectado (Ana) ya ha elegido y la ronda se resuelve: Carla cae por NO_RESPONSE.
    timeout(11_000),
    presence([ana, { ...bruno, connected: false }, carla, dario], 12_000),
    select('p2', 'wobbuffet', 13_000),
    select('p1', 'stantler', 14_000),
    presence([ana, { ...bruno, connected: false }, { ...carla, connected: false }, dario], 15_000),
    // Ronda 3 (21000–41000, objetivo #88): todos vuelven, nadie elige y ambos caen: partida sin ganador.
    timeout(21_000),
    presence([ana, bruno, carla, dario], 22_000),
    timeout(40_999),
    timeout(41_000),
    timeout(47_000),
  ],
};

const everyRejection: GoldenScenario = {
  name: 'every-rejection',
  seed: 404,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { generations: [1], roundSeconds: 10 },
  steps: [
    // Ronda 1 (1000–11000, objetivo #54 de los 151 de la generación 1).
    select('p1', 'psyduck', 2_000),
    select('p1', 'golduck', 2_500), // Selection already locked
    select('p2', 'psyduck', 3_000), // Ese Pokémon ya ha sido elegido.
    select('p2', 'chikorita', 3_500), // generación 2 fuera del pool
    select('p2', 'raichu-alola', 3_750), // forma no por defecto fuera del pool
    select('p2', 'missingno', 4_000), // id desconocido
    select('p9', 'golduck', 4_500), // You are spectating this round
    select('p2', 'golduck', 5_000),
    timeout(10_999),
    // En el plazo exacto la acción llega tarde y resuelve la ronda (Carla cae por NO_RESPONSE).
    select('p3', 'grimer', 11_000),
    select('p1', 'golduck', 12_000), // No active round
    // Ronda 2 (17000–27000, objetivo #136): Carla es espectadora; Ana (#130) y Bruno (#142) empatan.
    timeout(17_000),
    select('p3', 'flareon', 18_000),
    select('p1', 'gyarados', 19_000),
    select('p2', 'aerodactyl', 20_000),
    // Desempate (26000–36000, objetivo #23): Ana elige Raichu (#26) y Bruno acierta.
    timeout(26_000),
    select('p1', 'raichu', 27_000),
    select('p2', 'ekans', 28_000),
    timeout(34_000),
    select('p1', 'golduck', 35_000), // No active round en GAME_RESULTS
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 505,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: baseConfig,
  steps: [
    select('p1', 'bulbasaur', 2_000),
    // pokemonId: z.string().min(1): la cadena vacía invalida la acción y detiene el escenario.
    select('p2', '', 3_000),
    select('p2', 'ivysaur', 4_000),
  ],
};

const roundsSurvivedAndForms: GoldenScenario = {
  name: 'rounds-survived-and-forms',
  seed: 606,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: baseConfig,
  steps: [
    // Ronda 1 (1000–21000, objetivo #250): la forma de Alola se rechaza; Carla (#240) es la más lejana y cae sin
    // sumar roundsSurvived, mientras Ana y Bruno suman 1.
    select('p3', 'raichu-alola', 2_000),
    select('p1', 'ho-oh', 2_500),
    select('p2', 'celebi', 3_000),
    select('p3', 'magby', 4_000),
    // Ronda 2 (10000–30000, objetivo #146): Carla es espectadora; Ana (#140) y Bruno (#152) empatan a 6 y el empate
    // no suma.
    timeout(10_000),
    select('p3', 'kabuto', 11_000), // You are spectating this round
    select('p1', 'kabuto', 12_000),
    select('p2', 'chikorita', 13_000),
    // Desempate (19000–39000, objetivo #225): Bruno (#200) cae; solo Ana suma la ronda 2 y gana con 2.
    timeout(19_000),
    select('p2', 'misdreavus', 20_000),
    select('p1', 'delibird', 21_000),
    timeout(27_000),
  ],
};

export const pokedexDistanceScenarios: GoldenEngineEntry = {
  module: pokedexDistanceGame,
  scenarios: [threePlayersFullGame, repeatedTiebreaks, presenceDisconnects, everyRejection, invalidActionStops, roundsSurvivedAndForms],
  configCases: [
    // Válidos: generaciones deduplicadas y ordenadas, clave extra ignorada, límites de roundSeconds.
    { generations: [2, 1, 2], roundSeconds: 20 },
    { generations: [9, 3, 3], roundSeconds: 60, unknownKey: 'se ignora' },
    { generations: [1], roundSeconds: 10 },
    { generations: [1, 2, 3, 4, 5, 6, 7, 8, 9], roundSeconds: 20.0 },
    // Inválidos.
    { generations: [1, 2], roundSeconds: 9 },
    { generations: [1, 2], roundSeconds: 61 },
    { generations: [1, 2], roundSeconds: 10.5 },
    { generations: [1, 2], roundSeconds: '20' },
    { generations: [1, 2] },
    { generations: [], roundSeconds: 20 },
    { generations: [0], roundSeconds: 20 },
    { generations: [10], roundSeconds: 20 },
    { generations: [1.5], roundSeconds: 20 },
    { generations: 1, roundSeconds: 20 },
    { roundSeconds: 20 },
    [],
    null,
  ],
};
