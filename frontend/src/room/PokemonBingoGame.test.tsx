import { defaultPokemonBingoConfig, type BingoPublicBoard, type PokemonBingoPlayerState, type PokemonBingoPublicState, type RoomView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PokemonBingoConfigPanel } from '../games/pokemon-bingo/ConfigPanel';
import { bingoAnnouncement, bingoAttemptText, bingoCellLabel, bingoClock, bingoFocusKey, bingoMoveText, bingoPlateKind, bingoPlayerOrder, bingoProgressText, bingoStatsLine } from '../games/pokemon-bingo/presentation';
import { PokemonBingoGame } from './PokemonBingoGame';
import { PokemonBingoResults } from './PokemonBingoResults';
import { expectSingleLiveRegion } from './test-support/live-regions';
import { member, roomView } from './test-support/room-view';
import { LEGACY } from '../styles/legacy-classes';

// «Saltar minijuego» va dentro de la pantalla (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('./RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
vi.mock('../hooks/usePokemonPool', () => ({ usePokemonPool: () => ({ pokemon: [{ id: 'pikachu', name: 'Pikachu', sprite: '/pikachu.png' }], error: '', loading: false, retry: () => undefined }) }));

const solution = { id: 'secret-solution', name: 'Solución Secreta', sprite: '/secret.png' };

function board(playerId: string, completed: number, withSolutions = false): BingoPublicBoard {
  return {
    playerId, completed, total: 4, lastProgressAt: 1_000 + completed,
    cells: [
      { id: `${playerId}-a`, conditions: [{ kind: 'TYPE', pokemonType: 'fire' }], assignment: completed > 0 ? { id: 'charmander', name: 'Charmander', sprite: '/charmander.png' } : null, possibleSolutions: [] },
      { id: `${playerId}-b`, conditions: [{ kind: 'GENERATION', generation: 1 }, { kind: 'TYPE_COUNT', count: 2 }], assignment: completed > 1 ? { id: 'bulbasaur', name: 'Bulbasaur', sprite: '/bulbasaur.png' } : null, possibleSolutions: withSolutions ? [solution] : [] },
      { id: `${playerId}-c`, conditions: [{ kind: 'TYPE', pokemonType: 'water' }], assignment: completed > 2 ? { id: 'squirtle', name: 'Squirtle', sprite: '/squirtle.png' } : null, possibleSolutions: withSolutions ? [solution] : [] },
      { id: `${playerId}-d`, conditions: [{ kind: 'TYPE_COUNT', count: 1 }], assignment: completed > 3 ? { id: 'rattata', name: 'Rattata', sprite: '/rattata.png' } : null, possibleSolutions: [] },
    ],
  };
}

function publicGame(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE', overrides: Partial<PokemonBingoPublicState> = {}): PokemonBingoPublicState {
  const done = phase !== 'ROUND_ACTIVE';
  return {
    gameId: 'pokemon-bingo', phase, width: 2, height: 2,
    roundEndsAt: phase === 'ROUND_ACTIVE' ? 121_000 : null, nextTransitionAt: phase === 'ROUND_RESULTS' ? 9_000 : null,
    winnerId: done ? 'p2' : null, bingoAt: done ? 1_000 : null,
    boards: { p1: board('p1', 1, phase === 'GAME_RESULTS'), p2: board('p2', done ? 4 : 2) },
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p2', standings: [
      { playerId: 'p2', position: 1, points: 3, won: true, stats: { games: 1, bingos: 1, cellsCompleted: 4, cellsTotal: 4, correctAssignments: 5, incorrectAttempts: 1, bestBingoTimeMs: 65_000 } },
      { playerId: 'p1', position: 2, points: 1, won: false, stats: { games: 1, bingos: 0, cellsCompleted: 1, cellsTotal: 4, correctAssignments: 1, incorrectAttempts: 2, bestBingoTimeMs: 0 } },
    ] } : null,
    ...overrides,
  };
}

function room(game: PokemonBingoPublicState, player: PokemonBingoPlayerState | null, hostId = 'p1'): RoomView {
  return roomView({ phase: game.phase, hostId,
    availableGames: [{ id: 'pokemon-bingo', name: 'Pokémon Bingo', icon: '🎉', description: 'Bingo', minPlayers: 1, profileStats: { metrics: [] } }],
    selectedGameId: 'pokemon-bingo', selectedGameConfig: { ...defaultPokemonBingoConfig, width: 2, height: 2, generations: [1] }, game, gamePlayerState: player,
    members: [
      member({ id: 'p1', displayName: 'Eru', roomRole: 'HOST', isHost: true, sessionPoints: 7 }),
      member({ id: 'p2', displayName: 'Ana', connected: false, presence: 'TEMPORARILY_DISCONNECTED', sessionPoints: 3 }),
      member({ id: 'p3', displayName: 'Leo', role: 'SPECTATOR' }),
    ],
  });
}

const playing: PokemonBingoPlayerState = { canAct: true, cooldownUntil: null, lastAttempt: null };
const render = (view: RoomView, selfId = 'p1') => renderToStaticMarkup(createElement(PokemonBingoGame, { room: view, selfId, onAction: async () => undefined }));

describe('PokemonBingoGame', () => {
  it('pinta el tablero propio como cartas conmutadoras con la condición, el colocado y la vacía', () => {
    const html = render(room(publicGame(), playing));
    const own = html.slice(html.indexOf('aria-label="Tu tablero: elige una casilla"'));
    expect(own.match(/data-bingo-cell="p1-/g)).toHaveLength(4);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Casilla 1: Tipo Fuego. Charmander, completa"');
    expect(html).toContain('aria-label="Casilla 2: Generación 1 + Doble tipo. Vacía"');
    // Completa: el tic de la esquina y el texto para lectores, sin chip que robe alto al sprite.
    expect(html).toContain('<span class="sr-only">Completa</span>');
    expect(html).not.toMatch(/_chip_[^"]*"[^>]*>(<svg[\s\S]*?<\/svg>)?Completa</);
    expect(html).toContain('Vacía');
    expect(html).toContain('--cols:2');
    // La casilla elegida (la primera) con el buscador y «Quitar Pokémon».
    expect(html).toContain('Casilla seleccionada · 1 de 4');
    expect(html).toContain('id="guess-plate-title"');
    expect(html).toContain('aria-label="Buscar Pokémon para la casilla 1"');
    expect(html).toContain('Quitar Pokémon');
    expect(html).toContain('Actualmente: <strong>Charmander</strong>');
    expect(html).toContain('Tu progreso · 1/4');
    expect(html).toContain('7 pts');
    // Una sola región viva, «Saltar minijuego» dentro de la pantalla y nada heredado.
    expectSingleLiveRegion(html);
    expect(html).toContain('data-testid="pokemon-bingo-screen"');
    expect(html).not.toMatch(LEGACY);
    expect(html).not.toContain('🎉');
  });

  it('dice el último intento sin el «❌» y enseña la espera sin bloquear la búsqueda', () => {
    const wrong: PokemonBingoPlayerState = { canAct: true, cooldownUntil: 1_800, lastAttempt: { cellId: 'p1-b', pokemonId: 'pikachu', pokemonName: 'Pikachu', attemptedAt: 900, correct: false, message: '❌ Pikachu no cumple esta casilla.' } };
    const html = render(room(publicGame(), wrong));
    expect(html).toContain('data-testid="bingo-cooldown"');
    expect(html).toMatch(/Espera 0\.8s · puedes cambiar de casilla/);
    expect(html).toMatch(/role="status" aria-live="polite">Incorrecto: Pikachu no cumple esta casilla\. Hay una breve espera antes del siguiente intento\.</);
    expect(html).not.toContain('❌');
    // Sin espera: el chip del último intento.
    const after = render(room(publicGame(), { ...wrong, cooldownUntil: null }));
    expect(after).toContain('data-testid="bingo-feedback"');
    expect(after).toContain('Pikachu no cumple esta casilla.');
    // …y la región viva se vacía (el chip se ve, pero ya no se anuncia).
    expect(after).toContain('role="status" aria-live="polite"></p>');
  });

  it('dos fallos idénticos seguidos se anuncian los dos: la región se vacía entre uno y otro', () => {
    const fallo = (attemptedAt: number) => ({ cellId: 'a', pokemonId: 'x', pokemonName: 'X', attemptedAt, correct: false, message: '❌ X no cumple esta casilla.' });
    const texto = 'Incorrecto: X no cumple esta casilla. Hay una breve espera antes del siguiente intento.';
    // Lo que va diciendo la región: el primer fallo, vacía al acabar la espera y el segundo fallo (mismo texto) otra vez.
    const region = [
      bingoAnnouncement({ kind: 'pick', attempt: fallo(1_000), cooldownMs: 1_000 }),
      bingoAnnouncement({ kind: 'pick', attempt: fallo(1_000), cooldownMs: 0 }),
      bingoAnnouncement({ kind: 'pick', attempt: fallo(2_500), cooldownMs: 1_000 }),
    ];
    expect(region).toEqual([texto, '', texto]);
    // Cada paso cambia el contenido de la región: ningún fallo queda en silencio.
    expect(region.every((actual, i) => i === 0 || actual !== region[i - 1])).toBe(true);
  });

  it('no pinta las soluciones posibles durante la ronda aunque llegaran', () => {
    const leaked = publicGame('ROUND_ACTIVE', { boards: { p1: board('p1', 1, true), p2: board('p2', 2, true) } });
    const html = render(room(leaked, playing));
    expect(html).not.toContain('Solución Secreta');
    expect(html).not.toContain('/secret.png');
    expect(html).not.toContain('Podías usar');
  });

  it('lista los tableros de todos: el del rival se abre con un botón y el propio no', () => {
    const html = render(room(publicGame(), playing));
    expect(html.match(/data-testid="bingo-player-row"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Ver tablero de Ana: 2/4 casillas"');
    expect(html).not.toContain('Ver tablero de Eru');
    expect(html).toContain('Eru (tú)');
    expect(html).toContain('Sin conexión');
  });

  it('el espectador ve los tableros sin elegir casillas ni buscador', () => {
    const html = render(room(publicGame(), null), 'p3');
    expect(html).toContain('Estás observando');
    expect(html).toContain('Tableros en directo');
    expect(html).not.toContain('aria-pressed');
    expect(html).not.toContain('Buscar Pokémon para');
    expect(html).toContain('Ver tablero de Eru');
    expect(html).toContain('Ver tablero de Ana');
  });

  it('quien no puede actuar ve su tablero sin buscador', () => {
    const html = render(room(publicGame(), { ...playing, canAct: false }));
    expect(html).toContain('No puedes colocar Pokémon');
    expect(html).not.toContain('aria-pressed');
    expect(html).not.toContain('Buscar Pokémon para');
  });

  it('el bingo: el cut-in, el ganador, la cuenta atrás y «Saltar y continuar» solo para el host', () => {
    const host = render(room(publicGame('ROUND_RESULTS'), { ...playing, canAct: false }));
    expect(host).toContain('¡BINGO!');
    expect(host).toContain('Ana ha completado el tablero');
    expect(host).toContain('La clasificación aparecerá en 8s.');
    expect(host).toContain('Saltar y continuar');
    expect(host).not.toContain('🎉');
    expect(host).not.toContain('Buscar Pokémon para');
    // El bingo lo dice la única región de la pantalla: el cut-in solo se ve.
    expectSingleLiveRegion(host);
    expect(host).toMatch(/role="status" aria-live="polite">¡Bingo! Ana completó el tablero\.<\/p>/);
    const guest = render(room(publicGame('ROUND_RESULTS'), { ...playing, canAct: false }, 'p2'));
    expect(guest).not.toContain('Saltar y continuar');
    expect(guest).toContain('El host puede continuar antes.');
    const winner = render(room(publicGame('ROUND_RESULTS'), { ...playing, canAct: false }), 'p2');
    expect(winner).toContain('¡Has completado tu tablero!');
    expect(winner).toMatch(/role="status" aria-live="polite">¡Bingo! Completaste tu tablero\.<\/p>/);
  });
});

describe('PokemonBingoResults', () => {
  const results = (selfId = 'p1', game = publicGame('GAME_RESULTS')) => renderToStaticMarkup(createElement(PokemonBingoResults, { room: room(game, null), selfId, onLobby: () => undefined, onEnd: () => undefined }));

  it('clasificación con la línea de métricas y el tablero final en pestañas con «Podías usar»', () => {
    const html = results();
    expect(html).toContain('Bingo de Ana');
    expect(html).toContain('4/4 casillas · 5 correctos · 1 fallo · bingo en 1:05');
    expect(html).toContain('1/4 casillas · 1 correcto · 2 fallos');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Tablero final de cada jugador"');
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toContain('Eru (tú)');
    // La primera pestaña es el ganador: su tablero está completo, sin soluciones.
    expect(html).toContain('aria-label="Tablero final de Ana"');
    expect(html).not.toMatch(LEGACY);
    expect(html).not.toMatch(/🎉|🥇|🥈|🥉/);
  });

  it('sin bingo dice «Tiempo agotado»', () => {
    const html = results('p1', publicGame('GAME_RESULTS', { winnerId: null, results: { winnerId: null, standings: [
      { playerId: 'p1', position: 1, points: 3, won: false, stats: { cellsCompleted: 1, cellsTotal: 4, correctAssignments: 1, incorrectAttempts: 0 } },
      { playerId: 'p2', position: 2, points: 1, won: false, stats: { cellsCompleted: 0, cellsTotal: 4, correctAssignments: 0, incorrectAttempts: 0 } },
    ] } }));
    expect(html).toContain('Tiempo agotado');
    expect(html).toContain('nadie completó el tablero');
    // La primera pestaña es la tuya: las casillas vacías dicen qué valía.
    expect(html).toContain('Podías usar');
    expect(html).toContain('Solución Secreta');
  });
});

describe('presentación de Pokémon Bingo', () => {
  it('textos de la casilla, el progreso y el último intento', () => {
    expect(bingoCellLabel({ conditions: [{ kind: 'TYPE', pokemonType: 'fire' }, { kind: 'GENERATION', generation: 2 }] })).toBe('Tipo Fuego + Generación 2');
    expect(bingoProgressText({ completed: 3, total: 9 })).toBe('3/9 casillas');
    expect(bingoAttemptText('❌ Pikachu no cumple esta casilla.')).toBe('Pikachu no cumple esta casilla.');
    expect(bingoAttemptText('Pikachu colocado correctamente.')).toBe('Pikachu colocado correctamente.');
    expect(bingoClock(65_000)).toBe('1:05');
  });

  it('la placa según la fase y el jugador', () => {
    expect(bingoPlateKind('ROUND_ACTIVE', { hasBoard: true, canAct: true })).toBe('pick');
    expect(bingoPlateKind('ROUND_ACTIVE', { hasBoard: true, canAct: false })).toBe('blocked');
    expect(bingoPlateKind('ROUND_ACTIVE', { hasBoard: false, canAct: false })).toBe('watching');
    expect(bingoPlateKind('ROUND_RESULTS', { hasBoard: true, canAct: false })).toBe('bingo');
    expect(bingoPlateKind('GAME_STARTING', { hasBoard: true, canAct: false })).toBe('waiting');
    expect(bingoFocusKey('bingo')).toBe('bingo');
    expect(bingoFocusKey('pick')).toBeNull();
    expect(bingoFocusKey('pick', 2_000)).toBe('placed-2000');
    expect(bingoFocusKey('bingo', 2_000)).toBe('bingo');
    expect(bingoFocusKey('watching', 2_000)).toBeNull();
  });

  it('el anuncio: el intento una vez, con la espera solo si falló; el bingo no', () => {
    const attempt = { cellId: 'a', pokemonId: 'x', pokemonName: 'X', attemptedAt: 1, correct: true, message: 'X colocado correctamente.' };
    expect(bingoAnnouncement({ kind: 'pick', attempt })).toBe('X colocado correctamente.');
    expect(bingoAnnouncement({ kind: 'pick', attempt: { ...attempt, correct: false, message: '❌ X no cumple esta casilla.' }, cooldownMs: 800 })).toBe('Incorrecto: X no cumple esta casilla. Hay una breve espera antes del siguiente intento.');
    expect(bingoAnnouncement({ kind: 'pick', attempt: null })).toBe('');
    expect(bingoAnnouncement({ kind: 'bingo', attempt })).toBe('');
  });

  it('el texto de mover, las métricas y el orden de los tableros', () => {
    const move = bingoMoveText({ pokemonName: 'Lapras', from: { conditions: [{ kind: 'TYPE', pokemonType: 'water' }] }, to: { conditions: [{ kind: 'TYPE', pokemonType: 'ice' }] } });
    expect(move.title).toBe('¿Mover a Lapras?');
    expect(move.used).toBe('Lapras ya está usado en «Tipo Agua».');
    expect(move.question).toContain('¿Moverlo a «Tipo Hielo»?');
    expect(bingoStatsLine({ cellsCompleted: 9, cellsTotal: 9, correctAssignments: 10, incorrectAttempts: 0, bingos: 1, bestBingoTimeMs: 90_000 })).toBe('9/9 casillas · 10 correctos · 0 fallos · bingo en 1:30');
    const boards = { a: board('a', 1), b: board('b', 3), c: board('c', 3), w: board('w', 0) };
    boards.c.lastProgressAt = 0;
    expect(bingoPlayerOrder(boards, ['a', 'b', 'c', 'w'], 'w')).toEqual(['w', 'c', 'b', 'a']);
  });
});

describe('PokemonBingoConfigPanel', () => {
  it('controles del catálogo: tamaño con Segmented, familias con Toggle y el aviso de validación', () => {
    const html = renderToStaticMarkup(createElement(PokemonBingoConfigPanel, { config: defaultPokemonBingoConfig, disabled: false, onChange: async () => undefined }));
    expect(html.match(/role="radiogroup"/g)).toHaveLength(3);
    expect(html.match(/role="switch"/g)).toHaveLength(18);
    expect(html).toContain('3 × 3 · 9 casillas');
    expect(html).toContain('2:00 minutos');
    expect(html).not.toContain('role="alert"');
    // `GenerationSelector` sigue siendo el heredado (F9): el resto, sin clases heredadas.
    expect(html.replace(/<section>.*?<\/section>/, '')).not.toMatch(LEGACY);
    const none = { ...defaultPokemonBingoConfig, families: Object.fromEntries(Object.keys(defaultPokemonBingoConfig.families).map((key) => [key, false])) };
    const invalid = renderToStaticMarkup(createElement(PokemonBingoConfigPanel, { config: none, disabled: false, onChange: async () => undefined }));
    expect(invalid).toMatch(/role="alert">Selecciona al menos una familia/);
  });
});
