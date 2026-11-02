// Escenarios dorados de Pokémon Bluff Auction. createInitialState genera las condiciones (baraja las plantillas
// simples para combinarlas) y cada ronda elige una condición con random() antes de barajar el orden de puja. Las
// rondas de las giras se resuelven con un pase, un Pokémon que no cumple y otro que sí, para recorrer las familias de
// condición sin tocar los plazos.
import { pokemonBluffAuctionGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };
const diego: GamePlayer = { id: 'p4', displayName: 'Diego' };

function raise(playerId: string, amount: number, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'RAISE_BID', amount }, now };
}
function pass(playerId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'PASS_BID' }, now };
}
function submit(playerId: string, pokemonId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'SUBMIT_POKEMON', pokemonId }, now };
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

/**
 * Una ronda de gira por fila: quien tiene el turno pasa, el otro jugador apuesta 1, falla con un Pokémon del pool que
 * no cumple y acierta con uno que sí; los resultados se cierran por timeout a los 5 s.
 */
type TourRound = [passerId: string, bidderId: string, wrongId: string, rightId: string];
function tour(rounds: readonly TourRound[], start: number): GoldenStep[] {
  let now = start;
  return rounds.flatMap(([passerId, bidderId, wrongId, rightId]) => {
    const steps = [
      pass(passerId, now + 1_000),
      submit(bidderId, wrongId, now + 2_000),
      submit(bidderId, rightId, now + 3_000),
      timeout(now + 8_000),
    ];
    now += 8_000;
    return steps;
  });
}

const biddingErrors: GoldenScenario = {
  name: 'bidding-errors',
  seed: 1301,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { generations: [1], bidSeconds: 20, demonstrationSeconds: 30, rounds: 5 },
  steps: [
    // Ronda 1 (Tipo Volador + BST < 350), turno Bruno → Carla → Ana: rechazos de jugador ajeno, turno, fase y límites.
    raise('p9', 1, 1_500),
    raise('p1', 1, 2_000),
    submit('p2', 'pidgey', 2_500),
    raise('p2', 152, 3_000),
    raise('p2', 2, 3_500),
    raise('p3', 2, 4_000),
    raise('p3', 3, 4_500),
    // Ana pasa y el turno vuelve a Bruno, que sube a 4; Carla pasa y Bruno queda como apostador.
    pass('p1', 5_000),
    raise('p2', 4, 6_000),
    pass('p3', 7_000),
    // Demostración: pujar ya no vale, solo el apostador demuestra y solo con especies del pool (sin formas ni gen 2).
    pass('p2', 8_000),
    submit('p3', 'pidgey', 8_500),
    submit('p2', 'missingno', 9_000),
    submit('p2', 'chikorita', 9_500),
    submit('p2', 'raichu-alola', 9_700),
    // Un fallo resta 3 s, repetirlo es DUPLICATE y cuatro aciertos completan la apuesta.
    submit('p2', 'bulbasaur', 10_000),
    submit('p2', 'bulbasaur', 10_500),
    submit('p2', 'pidgey', 11_000),
    submit('p2', 'zubat', 11_500),
    submit('p2', 'spearow', 12_000),
    submit('p2', 'doduo', 12_500),
    // En los resultados no se puja; el timeout antes de tiempo no cambia nada.
    raise('p1', 1, 13_000),
    timeout(15_000),
    timeout(17_500),
    // Ronda 2: pujar en el plazo exacto se rechaza; Bruno y Carla agotan su turno y Ana demuestra 1 por defecto.
    raise('p2', 1, 37_500),
    timeout(37_500),
    timeout(57_500),
    // El timeout antes del plazo de la demostración no hace nada; un fallo que agota el tiempo cierra la ronda.
    timeout(80_000),
    submit('p1', 'bulbasaur', 86_000),
    timeout(91_000),
    // Ronda 3: Ana puja el pool entero y nadie la sube; la apuesta es imposible y la ronda se cierra al instante.
    raise('p1', 151, 92_000),
    pass('p3', 93_000),
    pass('p2', 94_000),
    timeout(99_000),
    // Ronda 4 (Defensa > 70): Bruno gana la puja con 3, acierta uno (+5 s) y el plazo de la demostración vence.
    raise('p1', 2, 100_000),
    raise('p2', 3, 101_000),
    pass('p3', 102_000),
    pass('p1', 103_000),
    submit('p2', 'venusaur', 104_000),
    timeout(138_000),
    timeout(143_000),
    // Ronda 5 (Tipo Bicho + Velocidad > 72): Carla puja 1, los demás pasan y la completa con Scyther.
    raise('p3', 1, 144_000),
    pass('p2', 145_000),
    pass('p1', 146_000),
    submit('p3', 'scyther', 147_000),
    timeout(152_000),
    // La partida ha terminado: ni pujas ni timeouts cambian nada.
    raise('p1', 1, 153_000),
    timeout(200_000),
  ],
};

const presence: GoldenScenario = {
  name: 'presence-bidder-left',
  seed: 1302,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: { generations: [2, 1, 2], bidSeconds: 0, demonstrationSeconds: 20, rounds: 5 },
  steps: [
    // Ronda 1 (habilidad Espesura), turno Carla → Bruno → Ana. Sin plazo de puja, el timeout no hace nada.
    timeout(2_000),
    // Carla se desconecta en su turno y pasa sola; desconectada no puede actuar.
    presenceAt(3_000, ana, bruno, offline(carla)),
    raise('p3', 1, 3_500),
    // Diego entra como espectador; Ana se desconecta fuera de su turno, así que nada cambia todavía.
    presenceAt(4_000, ana, bruno, offline(carla), diego),
    raise('p4', 1, 4_500),
    presenceAt(5_000, offline(ana), bruno, offline(carla), diego),
    // Bruno puja 2 y, al llegar el turno a Ana desconectada, ella pasa sola: Bruno demuestra.
    raise('p2', 2, 5_500),
    // Bruno se desconecta sin irse: la ronda sigue, pero no puede demostrar hasta volver.
    presenceAt(6_000, offline(ana), offline(bruno), offline(carla), diego),
    submit('p2', 'chikorita', 6_500),
    presenceAt(7_000, offline(ana), bruno, offline(carla), diego),
    submit('p2', 'chikorita', 7_500),
    submit('p2', 'meganium', 8_000),
    presenceAt(10_000, ana, bruno, carla, diego),
    timeout(13_000),
    // Ronda 2 (Planta + Veneno): Carla gana la puja, acierta uno y abandona la sala: la ronda se cierra por abandono.
    raise('p3', 2, 14_000),
    pass('p1', 15_000),
    pass('p2', 16_000),
    submit('p3', 'oddish', 17_000),
    presenceAt(18_000, ana, bruno, { ...carla, active: false }, diego),
    presenceAt(20_000, ana, bruno, carla, diego),
    timeout(23_000),
    // Ronda 3 (Tipo Hielo + BST > 335): Ana y Bruno pasan sin puja y Carla demuestra 1 con Lapras.
    pass('p1', 24_000),
    pass('p2', 25_000),
    submit('p3', 'lapras', 26_000),
    timeout(31_000),
    // Ronda 4 (Tipo Normal + Velocidad < 76): Bruno sube a 3, acierta uno, falla otro y se le acaba el tiempo.
    raise('p3', 1, 32_000),
    pass('p1', 33_000),
    raise('p2', 3, 34_000),
    pass('p3', 35_000),
    submit('p2', 'pidgey', 36_000),
    submit('p2', 'bulbasaur', 37_000),
    timeout(57_000),
    timeout(62_000),
    // Ronda 5 (Tipo Hielo + Velocidad < 76, 7 válidos): Ana apuesta 8, imposible. Bruno y Carla empatan a puntos.
    pass('p3', 63_000),
    raise('p1', 8, 64_000),
    pass('p2', 65_000),
    timeout(70_000),
  ],
};

// Gira de 20 rondas sobre las generaciones 1 y 2: físicas, generación, tipo, combinación de tipos, número de tipos,
// estadística, habilidad, Pokédex y legendario.
const tourGenerations: GoldenScenario = {
  name: 'tour-generations-1-2',
  seed: 1314,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { generations: [2, 1, 2], bidSeconds: 120, demonstrationSeconds: 60, rounds: 20 },
  steps: tour([
    ['p1', 'p2', 'sandslash', 'pidgey'],
    ['p2', 'p1', 'paras', 'clefable'],
    ['p1', 'p2', 'wigglytuff', 'kadabra'],
    ['p1', 'p2', 'growlithe', 'fearow'],
    ['p2', 'p1', 'tentacool', 'venonat'],
    ['p2', 'p1', 'doduo', 'omastar'],
    ['p1', 'p2', 'hypno', 'piloswine'],
    ['p2', 'p1', 'hitmonchan', 'clefairy'],
    ['p1', 'p2', 'ditto', 'quagsire'],
    ['p1', 'p2', 'articuno', 'omastar'],
    ['p1', 'p2', 'dratini', 'poliwhirl'],
    ['p2', 'p1', 'furret', 'weedle'],
    ['p2', 'p1', 'marill', 'psyduck'],
    ['p1', 'p2', 'espeon', 'stantler'],
    ['p2', 'p1', 'wobbuffet', 'wigglytuff'],
    ['p2', 'p1', 'ditto', 'raichu'],
    ['p1', 'p2', 'houndoom', 'voltorb'],
    ['p1', 'p2', 'nidorino', 'sunflora'],
    ['p1', 'p2', 'weedle', 'horsea'],
    ['p2', 'p1', 'pidgeot', 'poliwrath'],
  ], 1_000),
};

// Gira de 20 rondas sobre la generación 1: categoría curada (cánidos), evolución, legendario y combinaciones de
// estadística con Pokédex y tipo.
const tourKanto: GoldenScenario = {
  name: 'tour-kanto',
  seed: 1359,
  catalog: 'gen1-2',
  players: [ana, bruno],
  config: { generations: [1], bidSeconds: 120, demonstrationSeconds: 60, rounds: 20 },
  steps: tour([
    ['p1', 'p2', 'kakuna', 'mewtwo'],
    ['p2', 'p1', 'nidorino', 'moltres'],
    ['p1', 'p2', 'paras', 'farfetchd'],
    ['p2', 'p1', 'persian', 'chansey'],
    ['p1', 'p2', 'machop', 'omanyte'],
    ['p2', 'p1', 'magneton', 'wigglytuff'],
    ['p2', 'p1', 'drowzee', 'mr-mime'],
    ['p2', 'p1', 'lickitung', 'butterfree'],
    ['p2', 'p1', 'scyther', 'exeggutor'],
    ['p2', 'p1', 'flareon', 'abra'],
    ['p2', 'p1', 'dragonair', 'ninetales'],
    ['p2', 'p1', 'beedrill', 'onix'],
    ['p2', 'p1', 'fearow', 'dragonair'],
    ['p2', 'p1', 'vileplume', 'omastar'],
    ['p2', 'p1', 'venonat', 'dewgong'],
    ['p2', 'p1', 'machamp', 'starmie'],
    ['p2', 'p1', 'seaking', 'exeggcute'],
    ['p2', 'p1', 'venonat', 'rapidash'],
    ['p2', 'p1', 'scyther', 'nidoran-f'],
    ['p2', 'p1', 'lapras', 'zapdos'],
  ], 1_000),
};

const invalidActionStops: GoldenScenario = {
  name: 'solo-invalid-action-stops',
  seed: 1305,
  catalog: 'gen1-2',
  players: [ana],
  config: { generations: [2], bidSeconds: 20, demonstrationSeconds: 20, rounds: 5 },
  steps: [
    // Con un solo jugador, su pase deja la subasta sin activos y demuestra 1 como primero del orden de puja.
    pass('p1', 2_000),
    // Pikachu no está en el pool de la generación 2; Xatu cumple Tipo Volador + BST > 465.
    submit('p1', 'pikachu', 2_500),
    submit('p1', 'xatu', 3_000),
    timeout(8_000),
    // Una puja de 0 no valida y detiene el escenario.
    raise('p1', 0, 9_000),
    raise('p1', 1, 10_000),
  ],
};

const baseConfig = { generations: [1], bidSeconds: 20, demonstrationSeconds: 30, rounds: 10 };

export const pokemonBluffAuctionScenarios: GoldenEngineEntry = {
  module: pokemonBluffAuctionGame,
  scenarios: [biddingErrors, presence, tourGenerations, tourKanto, invalidActionStops],
  configCases: [
    // Válidos: normalización de generaciones, límites, valores admitidos y bidSeconds por defecto.
    { ...baseConfig, generations: [2, 1, 2] },
    { ...baseConfig, generations: [9] },
    { ...baseConfig, bidSeconds: 0, demonstrationSeconds: 20, rounds: 5 },
    { ...baseConfig, bidSeconds: 120, demonstrationSeconds: 45, rounds: 15 },
    { ...baseConfig, demonstrationSeconds: 60, rounds: 20 },
    { generations: [1, 2], demonstrationSeconds: 30, rounds: 10 },
    // Inválidos: límites, valores fuera de la lista, tipos, claves que faltan y raíz .strict().
    { ...baseConfig, bidSeconds: -1 },
    { ...baseConfig, bidSeconds: 121 },
    { ...baseConfig, bidSeconds: 20.5 },
    { ...baseConfig, bidSeconds: null },
    { ...baseConfig, bidSeconds: '20' },
    { ...baseConfig, demonstrationSeconds: 25 },
    { ...baseConfig, demonstrationSeconds: 30.5 },
    { ...baseConfig, demonstrationSeconds: 0 },
    { ...baseConfig, demonstrationSeconds: '30' },
    { ...baseConfig, rounds: 0 },
    { ...baseConfig, rounds: 7 },
    { ...baseConfig, rounds: 25 },
    { ...baseConfig, rounds: 10.5 },
    { ...baseConfig, rounds: null },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, generations: [1.5] },
    { ...baseConfig, generations: 1 },
    { ...baseConfig, unknownKey: 'no se admite' },
    { generations: [1], bidSeconds: 20, rounds: 10 },
    { generations: [1], bidSeconds: 20, demonstrationSeconds: 30 },
    { bidSeconds: 20, demonstrationSeconds: 30, rounds: 10 },
    [],
    null,
    'ronda',
  ],
};
