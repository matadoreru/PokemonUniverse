// Escenarios dorados de Pokémon Connections. random() solo se consume al preparar cada puzle (createInitialState y
// el paso a la ronda siguiente, por timeout o por ADVANCE_ROUND), nunca en las acciones: los grupos de cada ronda se
// leyeron de un primer export solo con timeouts y las jugadas de abajo los resuelven. Con gen1-2 ninguna plantilla
// curada tiene todos sus Pokémon (todas piden alguno de gen 3+), así que los puzles salen dinámicos; la rama curada
// la cubre PokemonConnectionsEngineTest con un catálogo sintético.
import { pokemonConnectionsGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };
const diego: GamePlayer = { id: 'p4', displayName: 'Diego' };

function submit(playerId: string, pokemonIds: string[], now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'SUBMIT_GROUP', pokemonIds }, now };
}
function advance(playerId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'ADVANCE_ROUND' }, now };
}
function timeout(now: number): GoldenStep {
  return { kind: 'timeout', now };
}
function presenceAt(now: number, ...players: GamePlayer[]): GoldenStep {
  return { kind: 'presence', players, now };
}
function offline(player: GamePlayer): GamePlayer {
  return { ...player, connected: false };
}
function left(player: GamePlayer): GamePlayer {
  return { ...player, active: false };
}
/** Un grupo por paso, cada `gap` ms desde `start`. */
function solve(playerId: string, groups: string[][], start: number, gap = 500): GoldenStep[] {
  return groups.map((group, index) => submit(playerId, group, start + index * gap));
}

// Ronda 1 de race-and-errors: forma regional, mascotas de portada, solo machos y 200 kg o más.
const raceRound1 = [
  ['vulpix', 'arcanine', 'persian', 'grimer'],
  ['venusaur', 'pikachu', 'charizard', 'eevee'],
  ['nidoking', 'hitmonlee', 'hitmonchan', 'nidorino'],
  ['dragonite', 'gyarados', 'onix', 'snorlax'],
];
// Ronda 3: legendarios, Bicho, rosa y Pokémon de Ash.
const raceRound3 = [
  ['moltres', 'articuno', 'zapdos', 'mewtwo'],
  ['weedle', 'kakuna', 'beedrill', 'pinsir'],
  ['wigglytuff', 'porygon', 'mew', 'clefairy'],
  ['pidgeot', 'dragonite', 'squirtle', 'charizard'],
];

const raceAndErrors: GoldenScenario = {
  name: 'race-and-errors',
  seed: 1401,
  catalog: 'gen1-2',
  players: [ana, bruno, carla, diego],
  config: { generations: [1], groupSize: 4, pokemonCount: 16, mistakesAllowed: 4, roundSeconds: 120, rounds: 3 },
  steps: [
    // Ronda 1: rechazos de fase, de jugador ajeno, de tamaño (3, repetido, 5), de tablero y de grupo ya encontrado.
    advance('p1', 2_000),
    submit('p9', raceRound1[0]!, 2_500),
    submit('p1', ['vulpix', 'arcanine', 'persian'], 3_000),
    submit('p1', ['vulpix', 'vulpix', 'arcanine', 'persian'], 3_500),
    submit('p1', ['vulpix', 'arcanine', 'persian', 'grimer', 'venusaur'], 4_000),
    submit('p1', ['vulpix', 'arcanine', 'persian', 'mewtwo'], 4_500),
    // Un acierto en otro orden (attemptedPokemonIds conserva el del jugador) y un Pokémon ya resuelto.
    submit('p1', ['grimer', 'vulpix', 'arcanine', 'persian'], 5_000),
    submit('p1', ['grimer', 'venusaur', 'pikachu', 'charizard'], 5_500),
    // Fallo a una (3 de portada) y fallo lejano (2 y 2).
    submit('p1', ['venusaur', 'pikachu', 'charizard', 'nidoking'], 6_000),
    submit('p1', ['venusaur', 'pikachu', 'nidoking', 'hitmonlee'], 6_500),
    // Ana completa la primera (+3), Bruno segundo (+2), Carla tercera (+1) y Diego cuarto (sin bonificación).
    ...solve('p1', raceRound1.slice(1), 7_000),
    submit('p1', raceRound1[0]!, 8_500),
    ...solve('p2', [...raceRound1].reverse(), 9_000),
    ...solve('p3', raceRound1, 11_000),
    submit('p4', ['vulpix', 'venusaur', 'nidoking', 'dragonite'], 13_000),
    ...solve('p4', raceRound1, 13_500),
    // Resultados: no se envían grupos, solo el Host avanza y el timeout antes de tiempo no hace nada.
    submit('p2', raceRound1[0]!, 16_000),
    advance('p2', 16_500),
    timeout(17_000),
    advance('p1', 18_000),
    // Ronda 2 (Pokémon de Misty, verde, varias cabezas, Fuego): Carla queda eliminada con 4 errores.
    submit('p1', ['staryu', 'scyther', 'exeggcute', 'charmeleon'], 19_000),
    submit('p2', ['starmie', 'ivysaur', 'dugtrio', 'growlithe'], 20_000),
    submit('p2', ['magneton', 'exeggutor', 'dugtrio', 'exeggcute'], 21_000),
    submit('p3', ['staryu', 'starmie', 'scyther', 'ivysaur'], 22_000),
    submit('p3', ['staryu', 'starmie', 'scyther', 'exeggcute'], 23_000),
    submit('p3', ['staryu', 'starmie', 'goldeen', 'vulpix'], 24_000),
    submit('p3', ['charmeleon', 'growlithe', 'ponyta', 'venusaur'], 25_000),
    submit('p3', ['staryu', 'starmie', 'goldeen', 'gyarados'], 26_000),
    // En el plazo exacto la acción se rechaza; el timeout cierra la ronda con Ana, Bruno y Diego sin terminar.
    submit('p1', ['staryu', 'starmie', 'goldeen', 'gyarados'], 138_000),
    timeout(138_000),
    timeout(168_000),
    // Ronda 3: Bruno la completa más rápido que en la ronda 1 (mejor tiempo nuevo); Ana, más lenta.
    ...solve('p2', raceRound3, 169_000, 1_000),
    ...solve('p1', raceRound3, 200_000, 1_000),
    timeout(288_000),
    advance('p1', 290_000),
    // Partida terminada: ni grupos ni timeouts cambian nada.
    submit('p2', raceRound3[0]!, 291_000),
    timeout(400_000),
  ],
};

const presenceAndElimination: GoldenScenario = {
  name: 'presence-and-elimination',
  seed: 1402,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { generations: [2, 1, 2], groupSize: 3, pokemonCount: 9, mistakesAllowed: 1, roundSeconds: 60, rounds: 3 },
  steps: [
    // Ronda 1 (iniciales finales, rojo, sin evoluciones): con un único error permitido, Ana queda eliminada al
    // fallar a una.
    submit('p1', ['meganium', 'typhlosion', 'kingler'], 2_000),
    submit('p1', ['meganium', 'typhlosion', 'blastoise'], 2_500),
    submit('p2', ['meganium', 'typhlosion', 'blastoise'], 3_000),
    // Carla se desconecta y no puede jugar; Diego entra como espectador.
    presenceAt(4_000, ana, bruno, offline(carla)),
    submit('p3', ['articuno', 'zapdos', 'mewtwo'], 4_500),
    presenceAt(5_000, ana, bruno, offline(carla), diego),
    submit('p4', ['articuno', 'zapdos', 'mewtwo'], 5_500),
    // Bruno se desconecta: solo queda Ana conectada y ya eliminada, así que la ronda se cierra.
    presenceAt(6_000, ana, offline(bruno), offline(carla), diego),
    presenceAt(7_000, ana, bruno, carla, diego),
    timeout(36_000),
    // Ronda 2 (objetos animados, Jessie y James, negro): Ana la completa y todos se desconectan; nadie queda
    // pendiente.
    submit('p1', ['magnemite', 'electrode', 'voltorb'], 37_000),
    submit('p1', ['victreebel', 'meowth', 'arbok'], 38_000),
    submit('p1', ['houndoom', 'sneasel', 'umbreon'], 39_000),
    presenceAt(40_000, offline(ana), offline(bruno), offline(carla), diego),
    presenceAt(41_000, ana, bruno, carla),
    timeout(70_000),
    // Ronda 3 (portada, solo cabeza, Acero): Carla abandona; Bruno termina y Ana, eliminada, cierra la ronda.
    presenceAt(71_000, ana, bruno, left(carla)),
    submit('p2', ['lugia', 'ho-oh', 'eevee'], 72_000),
    submit('p2', ['pineco', 'shellder', 'sunkern'], 73_000),
    submit('p2', ['scizor', 'magnemite', 'magneton'], 74_000),
    submit('p1', ['lugia', 'pineco', 'scizor'], 75_000),
    timeout(105_000),
    advance('p1', 106_000),
  ],
};

const largeBoard: GoldenScenario = {
  name: 'large-board',
  seed: 1403,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { generations: [2], groupSize: 5, pokemonCount: 25, mistakesAllowed: 10, roundSeconds: 300, rounds: 3 },
  steps: [
    // Ronda 1 (Ash, solo cabeza, rojo, blanco, Agua): un acierto de cada uno y un fallo a una.
    submit('p1', ['pineco', 'misdreavus', 'forretress', 'unown', 'sunkern'], 2_000),
    submit('p1', ['ledian', 'delibird', 'ariados', 'scizor', 'smeargle'], 3_000),
    submit('p2', ['feraligatr', 'croconaw', 'quagsire', 'politoed'], 4_000),
    submit('p2', ['feraligatr', 'croconaw', 'quagsire', 'politoed', 'azumarill'], 5_000),
    timeout(300_999),
    timeout(301_000),
    timeout(331_000),
    // Ronda 2: Bruno completa los cinco grupos y Ana se queda sin tiempo.
    ...solve('p2', [
      ['chikorita', 'celebi', 'jumpluff', 'meganium', 'sunkern'],
      ['sneasel', 'swinub', 'piloswine', 'smoochum', 'delibird'],
      ['ariados', 'scizor', 'yanma', 'spinarak', 'ledyba'],
      ['granbull', 'cleffa', 'snubbull', 'togepi', 'azumarill'],
      ['raikou', 'elekid', 'mareep', 'pichu', 'lanturn'],
    ], 332_000, 1_000),
    timeout(631_000),
    advance('p2', 661_000),
    advance('p1', 661_500),
    // Ronda 3: Diego entra como espectador; Ana acierta Tierra y la ronda acaba por tiempo.
    presenceAt(662_000, ana, bruno, diego),
    submit('p1', ['quagsire', 'pupitar', 'steelix', 'larvitar', 'piloswine'], 663_000),
    timeout(961_500),
    timeout(991_500),
  ],
};

const soloBoard12: GoldenScenario = {
  name: 'solo-board-12',
  seed: 1404,
  catalog: 'gen1-2',
  players: [ana],
  config: { generations: [1, 2], groupSize: 4, pokemonCount: 12, mistakesAllowed: 2, roundSeconds: 30, rounds: 3 },
  steps: [
    // Tablero de 12 (rama curada con 3 grupos, sin candidatas en gen1-2): Ana sola cierra la ronda al resolverla.
    ...solve('p1', [
      ['magmar', 'electabuzz', 'machoke', 'poliwhirl'],
      ['horsea', 'corsola', 'politoed', 'psyduck'],
      ['sudowoodo', 'geodude', 'forretress', 'vulpix'],
    ], 2_000, 1_000),
    timeout(34_000),
    // Ronda 2: dos errores la eliminan y cierran la ronda.
    submit('p1', ['arcanine', 'houndour', 'dragonair', 'gengar'], 35_000),
    submit('p1', ['dragonite', 'kingdra', 'gastly', 'growlithe'], 36_000),
    timeout(66_000),
    timeout(96_000),
    timeout(126_000),
    // Una acción que no valida (dos ids) detiene el escenario.
    submit('p1', ['gastly', 'gengar'], 127_000),
  ],
};

const base = { generations: [1], groupSize: 4, pokemonCount: 16, mistakesAllowed: 4, roundSeconds: 120, rounds: 5 };

export const pokemonConnectionsScenarios: GoldenEngineEntry = {
  module: pokemonConnectionsGame,
  scenarios: [raceAndErrors, presenceAndElimination, largeBoard, soloBoard12],
  configCases: [
    { generations: [1, 2, 3, 4, 5, 6, 7, 8, 9], groupSize: 4, pokemonCount: 16, mistakesAllowed: 4, roundSeconds: 120, rounds: 5 },
    // Normalización de generaciones y límites válidos.
    { ...base, generations: [3, 1, 3, 2, 1] },
    { ...base, generations: [9] },
    { ...base, groupSize: 3, pokemonCount: 9 },
    { ...base, groupSize: 3, pokemonCount: 15 },
    { ...base, groupSize: 4, pokemonCount: 12 },
    { ...base, groupSize: 4, pokemonCount: 20 },
    { ...base, groupSize: 5, pokemonCount: 15 },
    { ...base, groupSize: 5, pokemonCount: 25 },
    { ...base, mistakesAllowed: 1 },
    { ...base, mistakesAllowed: 10 },
    { ...base, roundSeconds: 30 },
    { ...base, roundSeconds: 300 },
    { ...base, rounds: 1 },
    { ...base, rounds: 20 },
    // Inválidas: generaciones, cada límite justo fuera, tableros sin 3–5 grupos completos y tipos.
    { ...base, generations: [0] },
    { ...base, generations: [10] },
    { ...base, generations: [] },
    { ...base, generations: [1.5] },
    { groupSize: 4, pokemonCount: 16, mistakesAllowed: 4, roundSeconds: 120, rounds: 5 },
    { ...base, groupSize: 2, pokemonCount: 10 },
    { ...base, groupSize: 6, pokemonCount: 24 },
    { ...base, groupSize: 3, pokemonCount: 8 },
    { ...base, groupSize: 5, pokemonCount: 26 },
    { ...base, groupSize: 4, pokemonCount: 24 },
    { ...base, groupSize: 4, pokemonCount: 9 },
    { ...base, groupSize: 5, pokemonCount: 10 },
    { ...base, groupSize: 3, pokemonCount: 18 },
    { ...base, mistakesAllowed: 0 },
    { ...base, mistakesAllowed: 11 },
    { ...base, roundSeconds: 29 },
    { ...base, roundSeconds: 301 },
    { ...base, rounds: 0 },
    { ...base, rounds: 21 },
    { ...base, groupSize: 4.5 },
    { ...base, rounds: 9007199254740992 },
    { ...base, pokemonCount: '16' },
    { ...base, rounds: null },
    { ...base, extra: true },
    { generations: [1], groupSize: 4, pokemonCount: 16, mistakesAllowed: 4, roundSeconds: 120 },
    null,
    [],
  ],
};
