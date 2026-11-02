// Escenarios dorados de Pokémon Impostor. createInitialState consume una extracción para el Pokémon secreto y una por
// impostor; cada fase de pistas baraja (una extracción por jugador conectado y vivo) el orden de turnos, igual que una
// presencia que reconecta a alguien cuando el orden quedó vacío. Las pistas, los votos y los intentos no consumen
// random().
import { pokemonImpostorGame } from '../../dist/index.js';
import type { GamePlayer } from '../../dist/index.js';
import type { GoldenEngineEntry } from './index.js';
import type { GoldenScenario, GoldenStep } from '../types.js';

const ana: GamePlayer = { id: 'p1', displayName: 'Ana' };
const bruno: GamePlayer = { id: 'p2', displayName: 'Bruno' };
const carla: GamePlayer = { id: 'p3', displayName: 'Carla' };
const dani: GamePlayer = { id: 'p4', displayName: 'Dani' };
const eva: GamePlayer = { id: 'p5', displayName: 'Eva' };
const intruso: GamePlayer = { id: 'p9', displayName: 'Intruso' };

function clue(playerId: string, text: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'SUBMIT_CLUE', text }, now };
}
function vote(playerId: string, targetId: string, now: number): GoldenStep {
  return { kind: 'action', playerId, action: { type: 'VOTE', targetId }, now };
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

const baseConfig = { generations: [1], impostorCount: 1, clueSeconds: 10, voteSeconds: 10 };

// Mayúsculas, tildes (una de ellas descompuesta: «E» + U+0301), espacios dobles internos y espacios de no separación
// (U+00A0, U+3000) en los bordes: trim() + NFC.
const accentedClue = '   Ratón  ÉLÉCTRICO 　';
// 25 puntos de código (50 unidades UTF-16): el límite cuenta puntos de código, no unidades.
const emojiClue = '\u{1F525}'.repeat(25);

const tieAndParity: GoldenScenario = {
  name: 'tie-and-parity',
  seed: 1504,
  catalog: 'gen1-2',
  players: [ana, bruno, carla, dani, eva],
  config: baseConfig,
  steps: [
    // Revelado de roles (1000–6000): Dani es el impostor; acciones fuera de fase.
    vote('p9', 'p1', 2_000),
    clue('p1', 'hola', 2_100),
    guess('p4', 'voltorb', 2_200),
    vote('p1', 'p2', 2_300),
    timeout(5_999),
    timeout(6_000),
    // Ronda 1 de pistas.
    clue('p3', 'Bola', 6_500),
    guess('p1', 'voltorb', 6_600),
    clue('p4', accentedClue, 7_000),
    clue('p3', '   ', 7_500),
    clue('p3', 'abcdefghijklmnopqrstuvwxyz', 7_600),
    clue('p3', emojiClue, 8_000),
    timeout(17_999),
    timeout(18_000),
    clue('p2', 'Redondo', 18_500),
    clue('p1', 'Pokébola', 19_000),
    // Votación 1: empate entre Dani y Eva.
    vote('p1', 'p1', 19_500),
    vote('p1', 'p9', 19_600),
    vote('p1', 'p4', 19_700),
    vote('p1', 'p2', 19_800),
    clue('p1', 'tarde', 19_900),
    vote('p2', 'p4', 20_000),
    vote('p3', 'p5', 20_100),
    vote('p4', 'p5', 20_200),
    vote('p5', 'p1', 20_300),
    timeout(23_299),
    timeout(23_300),
    // Desempate (23300–33300) entre Dani y Eva: Carla no vota y Eva sale.
    vote('p1', 'p2', 23_500),
    vote('p1', 'p5', 24_000),
    vote('p2', 'p5', 24_500),
    vote('p4', 'p5', 25_000),
    vote('p5', 'p4', 25_500),
    vote('p3', 'p5', 33_300),
    timeout(33_300),
    timeout(36_300),
    vote('p5', 'p1', 37_000),
    timeout(40_300),
    // Ronda 2 (40300–50300): Dani falla su único intento; el turno de Ana vence sin timeout.
    guess('p4', 'chikorita', 41_000),
    guess('p4', 'missingno', 41_100),
    guess('p4', 'pikachu', 41_200),
    guess('p4', 'magnemite', 41_300),
    clue('p4', 'Bola', 41_500),
    clue('p1', 'Tarde', 51_500),
    guess('p4', 'voltorb', 51_500),
    clue('p2', 'Chispa', 52_000),
    clue('p3', 'Imán', 52_500),
    vote('p1', 'p3', 53_000),
    vote('p2', 'p3', 53_500),
    vote('p3', 'p4', 53_800),
    vote('p4', 'p3', 54_000),
    timeout(57_000),
    timeout(61_000),
    // Ronda 3: nadie da pistas ni vota; el empate entre todos repite la votación y Dani gana por paridad.
    timeout(71_000),
    timeout(81_000),
    timeout(91_000),
    timeout(101_000),
    timeout(104_000),
    vote('p1', 'p2', 105_000),
    vote('p4', 'p2', 105_500),
    vote('p2', 'p4', 106_000),
    timeout(109_000),
    timeout(113_000),
  ],
};

const guessAndPresence: GoldenScenario = {
  name: 'guess-and-presence',
  seed: 1502,
  catalog: 'gen1-2',
  players: [ana, bruno, carla, dani, eva],
  config: { generations: [2, 1, 2], impostorCount: 2, clueSeconds: 120, voteSeconds: 90 },
  steps: [
    // Revelado (1000–6000): entra un espectador y se desconectan todos los vivos.
    presence([ana, bruno, carla, dani, eva, intruso], 2_000),
    presence([offline(ana), offline(bruno), offline(carla), offline(dani), offline(eva), intruso], 5_000),
    timeout(6_000),
    // Ronda 1 sin nadie conectado: el orden queda vacío y sin plazo hasta que vuelven Ana, Bruno y Carla.
    guess('p5', 'weedle', 6_500),
    clue('p1', 'Gusano', 6_600),
    presence([ana, bruno, carla, offline(dani), offline(eva), intruso], 7_000),
    presence([ana, bruno, carla, dani, eva, intruso], 8_000),
    timeout(9_000),
    clue('p3', 'Bicho', 10_000),
    // Ana (turno actual) y Bruno se desconectan: los dos turnos se saltan y empieza la votación.
    presence([offline(ana), offline(bruno), carla, dani, eva, intruso], 11_000),
    presence([ana, bruno, carla, dani, eva, intruso], 12_000),
    vote('p1', 'p4', 12_500),
    vote('p2', 'p4', 13_000),
    vote('p3', 'p4', 13_500),
    vote('p5', 'p1', 14_000),
    // Dani (impostor) se desconecta sin votar y la presencia cierra la votación.
    presence([ana, bruno, carla, offline(dani), eva, intruso], 15_000),
    timeout(18_000),
    // Solo Ana y Carla están conectadas al empezar la ronda 2: la baraja repite el orden anterior (Carla, Ana) y se
    // rota a Ana, Carla.
    presence([ana, offline(bruno), carla, dani, offline(eva), intruso], 20_000),
    timeout(22_000),
    presence([ana, bruno, carla, dani, eva, intruso], 22_500),
    // Ronda 2: Eva adivina el Pokémon y ganan los dos impostores (sin winnerId único).
    guess('p5', 'weedle', 23_000),
    vote('p1', 'p5', 23_500),
  ],
};

const innocentsWin: GoldenScenario = {
  name: 'innocents-win',
  seed: 1509,
  catalog: 'gen1-2',
  players: [ana, bruno, carla, dani],
  config: { ...baseConfig, clueSeconds: 15, voteSeconds: 20, unknownKey: 'se descarta' },
  steps: [
    // Dani es el impostor (Eevee). La clave desconocida de la configuración se descarta al normalizar.
    timeout(6_000),
    // Ronda 1 (orden Dani, Bruno, Ana, Carla).
    clue('p4', 'Marrón', 7_000),
    clue('p2', 'Evoluciones', 8_000),
    clue('p1', 'Piedras', 9_000),
    clue('p3', 'Zorro', 10_000),
    // Votación con plazo vencido: empate entre Ana y Bruno y desempate.
    vote('p1', 'p2', 11_000),
    vote('p2', 'p1', 12_000),
    timeout(29_999),
    timeout(30_000),
    timeout(33_000),
    vote('p3', 'p1', 34_000),
    vote('p4', 'p1', 34_500),
    vote('p1', 'p2', 35_000),
    vote('p2', 'p1', 35_500),
    timeout(38_500),
    timeout(42_500),
    // Ronda 2 (orden Bruno, Carla, Dani): Dani se desconecta en su turno y la votación lo expulsa sin su voto.
    clue('p2', 'Normal', 43_000),
    clue('p3', 'Ocho evoluciones', 44_000),
    presence([ana, bruno, carla, offline(dani)], 45_000),
    vote('p4', 'p2', 46_000),
    vote('p2', 'p4', 46_500),
    vote('p3', 'p4', 47_000),
    timeout(50_000),
    presence([ana, bruno, carla, dani], 52_000),
    timeout(54_000),
  ],
};

const invalidActionStops: GoldenScenario = {
  name: 'invalid-action-stops',
  seed: 1511,
  catalog: 'gen1-2',
  players: [ana, bruno, carla],
  config: baseConfig,
  steps: [
    // Una pista de 201 unidades UTF-16 no valida (.max(200)) y detiene el escenario.
    timeout(6_000),
    clue('p1', 'x'.repeat(201), 7_000),
    clue('p1', 'Fantasma', 8_000),
  ],
};

export const pokemonImpostorScenarios: GoldenEngineEntry = {
  module: pokemonImpostorGame,
  scenarios: [tieAndParity, guessAndPresence, innocentsWin, invalidActionStops],
  configCases: [
    { generations: [1, 2, 3, 4, 5, 6, 7, 8, 9], impostorCount: 1, clueSeconds: 15, voteSeconds: 20 },
    // Válidos: normalización de generaciones, cada límite en el borde, enteros con decimal cero y claves desconocidas
    // (el esquema no es .strict(): se descartan).
    { ...baseConfig, generations: [3, 1, 3, 2, 1] },
    { ...baseConfig, generations: [9] },
    { ...baseConfig, impostorCount: 10 },
    { ...baseConfig, clueSeconds: 120 },
    { ...baseConfig, voteSeconds: 90 },
    { ...baseConfig, impostorCount: 2.0, clueSeconds: 30.0 },
    { ...baseConfig, unknownKey: 'se descarta', mode: 'classic' },
    // Mínimos de impostorCount, clueSeconds y voteSeconds.
    baseConfig,
    // Inválidos: generaciones, cada límite justo fuera, decimales, enteros no seguros, tipos y faltantes.
    { ...baseConfig, generations: [0] },
    { ...baseConfig, generations: [10] },
    { ...baseConfig, generations: [] },
    { ...baseConfig, generations: [1.5] },
    { ...baseConfig, generations: '1' },
    { ...baseConfig, impostorCount: 0 },
    { ...baseConfig, impostorCount: 11 },
    { ...baseConfig, impostorCount: 1.5 },
    { ...baseConfig, clueSeconds: 9 },
    { ...baseConfig, clueSeconds: 121 },
    { ...baseConfig, voteSeconds: 9 },
    { ...baseConfig, voteSeconds: 91 },
    { ...baseConfig, voteSeconds: 9007199254740992 },
    { ...baseConfig, clueSeconds: '15' },
    { ...baseConfig, impostorCount: null },
    { generations: [1], impostorCount: 1, clueSeconds: 15 },
    [],
    null,
  ],
};
