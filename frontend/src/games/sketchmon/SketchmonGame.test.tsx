import { defaultSketchmonConfig, type RoomView, type SketchmonGalleryEntry, type SketchmonPlayerState, type SketchmonPublicState, type SketchmonRoundResult } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SketchmonConfigPanel } from './ConfigPanel';
import { SketchmonGame } from './SketchmonGame';
import { brushDotSize } from './SketchmonCanvas';
import { SketchmonResults } from './SketchmonResults';
import { expectSingleLiveRegion } from '../../room/test-support/live-regions';
import { member, roomView } from '../../room/test-support/room-view';
import { LEGACY } from '../../styles/legacy-classes';

// «Saltar minijuego» lee la sala: sin votación de salto no pinta nada.
vi.mock('../../room/RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));
// El pool del buscador nunca contiene el secreto (si lo tuviera, el test de privacidad fallaría en falso).
vi.mock('../../hooks/usePokemonPool', () => ({ usePokemonPool: () => ({ pokemon: [{ id: 'pikachu', name: 'Pikachu', sprite: '/pikachu.png', generation: 1, types: ['electric'] }], loading: false, error: '', retry: () => undefined }) }));

const MEDALS = /🥇|🥈|🥉|🏆/;

const drawing = [{ id: 'line_1', tool: 'PENCIL' as const, color: '#182033' as const, width: 8, points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }] }];
const lastRound: SketchmonRoundResult = {
  reason: 'GUESSED', pokemon: { id: 'lucario', name: 'Lucario', sprite: '/lucario.png', generation: 4, types: ['fighting', 'steel'] },
  drawerId: 'p1', winnerId: 'p2', elapsedMs: 12_300, guesserPoints: 5, drawerPoints: 3, winnerAttemptCount: 2, drawing,
};
const gallery: SketchmonGalleryEntry[] = [
  { ...lastRound, roundNumber: 1, lapNumber: 1 },
  { ...lastRound, pokemon: { id: 'gengar', name: 'Gengar', sprite: '/gengar.png', generation: 1, types: ['ghost', 'poison'] }, drawerId: 'p2', winnerId: null, reason: 'TIMEOUT', roundNumber: 2, lapNumber: 1 },
];

function publicGame(phase: 'ROUND_ACTIVE' | 'ROUND_RESULTS' | 'GAME_RESULTS' = 'ROUND_ACTIVE', round: SketchmonRoundResult | null = lastRound): SketchmonPublicState {
  return {
    gameId: 'sketchmon', phase, roundNumber: 1, totalRounds: 3, lapNumber: 1, totalLaps: 1,
    drawerId: 'p1', nextDrawerId: 'p2', drawerOrder: ['p1', 'p2', 'p3'],
    strokes: drawing,
    visibleHints: [{ kind: 'GENERATION', generation: 4 }, { kind: 'TYPES', types: ['fighting', 'steel'] }],
    attempts: [{ playerId: 'p3', guessedPokemon: { id: 'gengar', name: 'Gengar', sprite: '/gengar.png' }, attemptedAt: 2_000 }],
    scores: { p1: 3, p2: 5, p3: 0 }, roundStartedAt: 1_000, roundEndsAt: phase === 'ROUND_ACTIVE' ? 91_000 : null,
    nextTransitionAt: phase === 'ROUND_RESULTS' ? 7_000 : null,
    // Un `lastRound` sobrante en la ronda: la pantalla no debe leerlo fuera de la revelación.
    lastRound: round,
    gallery: phase === 'GAME_RESULTS' ? gallery : [],
    results: phase === 'GAME_RESULTS' ? { winnerId: 'p2', standings: [
      { playerId: 'p2', position: 1, points: 5, won: true, stats: { guessedPokemon: 1, firstTry: 0, totalAttempts: 2, firstCorrectResponses: 1, drawingRounds: 1, drawingSuccesses: 0, drawingFailures: 1, pointsFromGuessing: 5, pointsFromDrawing: 0 } },
      { playerId: 'p1', position: 2, points: 3, won: false, stats: { guessedPokemon: 0, firstTry: 0, totalAttempts: 0, firstCorrectResponses: 0, drawingRounds: 1, drawingSuccesses: 1, drawingFailures: 0, pointsFromGuessing: 0, pointsFromDrawing: 3 } },
      { playerId: 'p3', position: 3, points: 0, won: false, stats: { guessedPokemon: 0, firstTry: 0, totalAttempts: 1, firstCorrectResponses: 0, drawingRounds: 1, drawingSuccesses: 0, drawingFailures: 1, pointsFromGuessing: 0, pointsFromDrawing: 0 } },
    ] } : null,
  };
}

function room(player: SketchmonPlayerState | null, game: SketchmonPublicState = publicGame(), config: Record<string, unknown> = {}): RoomView {
  return roomView({ phase: game.phase,
    members: [
      member({ id: 'p1', displayName: 'Ana', roomRole: 'HOST', isHost: true }),
      member({ id: 'p2', displayName: 'Pedro' }),
      member({ id: 'p3', displayName: 'Carlos' }),
      member({ id: 'p4', displayName: 'Eru', role: 'SPECTATOR' }),
    ],
    availableGames: [{ id: 'sketchmon', name: 'Sketchmon', icon: '🎨', description: 'Dibuja', minPlayers: 2, profileStats: { metrics: [] } }],
    selectedGameId: 'sketchmon', selectedGameConfig: { ...config, generations: [1, 4], roundSeconds: 90, laps: 1, hintsEnabled: true, memoryPreviewEnabled: false, includeForms: false }, game, gamePlayerState: player,
  });
}

const render = (player: SketchmonPlayerState | null, selfId: string, game?: SketchmonPublicState, config?: Record<string, unknown>) => renderToStaticMarkup(createElement(SketchmonGame, { room: room(player, game, config), selfId, onAction: async () => undefined }));
const drawer = (secretPokemon: Extract<SketchmonPlayerState, { role: 'DRAWER' }>['secretPokemon'] = { name: 'Lucario', sprite: '/lucario.png', previewEndsAt: null, types: ['fighting', 'steel'] }) =>
  render({ role: 'DRAWER', canDraw: true, secretPokemon }, 'p1');
const guesser = () => render({ role: 'GUESSER', canGuess: true, cooldownUntil: null, attemptCount: 1 }, 'p2');
const spectator = () => render({ role: 'SPECTATOR' }, 'p4');

/** El texto visible más `alt`, `title` y `aria-label`: lo que un jugador o un lector de pantalla podría leer. */
function visible(html: string): string {
  const attrs = [...html.matchAll(/(?:alt|title|aria-label)="([^"]*)"/g)].map((match) => match[1]);
  return `${html.replace(/<[^>]+>/g, ' ')} ${attrs.join(' ')}`;
}

describe('Sketchmon: quien dibuja', () => {
  it('ve su Pokémon secreto en un Panel, solo para él, con la regla', () => {
    const html = drawer();
    expect(html).toContain('data-testid="sketch-secret"');
    expect(html).toContain('Tu Pokémon secreto');
    expect(html).toContain('Solo lo ves tú');
    expect(html).toContain('Dibuja a Lucario');
    for (const text of ['Lucha', 'Acero', 'No escribas letras, números, nombres ni símbolos que revelen directamente el Pokémon.', 'Ctrl+Z deshace; Ctrl+Mayús+Z rehace.']) expect(html).toContain(text);
  });

  it('con el modo memoria, pasada la vista previa, la referencia queda oculta (solo el nombre)', () => {
    const html = drawer({ name: 'Lucario', sprite: null, previewEndsAt: 0, types: [] });
    expect(html).toContain('Referencia oculta.');
    expect(html).toContain('Ahora dibuja de memoria: solo conservas el nombre.');
    expect(html).not.toContain('src="/lucario.png"');
  });

  it('dibuja con las herramientas del catálogo: lápiz, goma y relleno, grosor, paleta con nombre, deshacer, rehacer y limpiar', () => {
    const html = drawer();
    expect(html).toContain('aria-label="Herramientas de dibujo"');
    expect(html).toMatch(/role="radiogroup" aria-label="Herramienta"[^]*Lápiz[^]*Goma[^]*Relleno/);
    expect(html).toMatch(/role="radiogroup" aria-label="Grosor"[^]*Fino[^]*Medio[^]*Grueso[^]*Muy grueso/);
    expect(html).toMatch(/role="radiogroup" aria-label="Color"/);
    expect(html.match(/role="radio" aria-checked="(true|false)" aria-label="[^"]+"/g)?.length).toBe(14);
    expect(html).toContain('aria-label="Rojo"');
    expect(html).toMatch(/Color: <strong>Negro<\/strong>/);
    for (const label of ['Deshacer último trazo', 'Rehacer último trazo', 'Limpiar lienzo']) expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain('Lienzo de Sketchmon. Lápiz: arrastra para dibujar.');
    expect(html).toContain('data-stroke-count="1"');
    expect(html).not.toContain('Buscar respuesta para el dibujo');
  });

  it('pinta la insignia del dibujo y una sola región viva, sin alertas locales ni clases heredadas', () => {
    const html = drawer();
    expect(html).toContain('Dibujo 1 de 3 · Vuelta 1 de 1');
    expect(html).toContain('Dibujas tú');
    expectSingleLiveRegion(html);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(LEGACY);
  });
});

describe('Sketchmon: privacidad del secreto', () => {
  it.each([['quien adivina', guesser], ['quien observa', spectator]])('%s no recibe en el DOM el secreto ni el panel de quien dibuja', (_role, view) => {
    const html = view();
    const text = visible(html);
    for (const leak of ['Lucario', 'Tu Pokémon secreto', 'Solo lo ves tú', '¡Era', 'acertó', 'Puntos del dibujo', 'Herramientas de dibujo']) expect(text).not.toContain(leak);
    expect(html).not.toContain('sketch-secret');
    expect(html).not.toContain('/lucario.png');
  });

  it('quien dibuja tiene el cursor de color del pincel (oculto hasta mover el puntero); los demás no', () => {
    const html = drawer();
    expect(html).toMatch(/<span hidden="" aria-hidden="true" data-testid="sketch-brush-cursor"[^>]*><span [^>]*style="background:#[0-9a-fA-F]{6}"/);
    expect(guesser()).not.toContain('sketch-brush-cursor');
    expect(spectator()).not.toContain('sketch-brush-cursor');
  });

  it('el punto del cursor mide lo que el trazo en pantalla, con un mínimo visible; el relleno, uno fijo', () => {
    expect(brushDotSize({ tool: 'PENCIL', color: '#182033', width: 22 }, 900)).toBe(22);
    expect(brushDotSize({ tool: 'ERASER', color: '#182033', width: 22 }, 450)).toBe(11);
    expect(brushDotSize({ tool: 'PENCIL', color: '#182033', width: 4 }, 450)).toBe(6);
    expect(brushDotSize({ tool: 'FILL', color: '#182033', width: 22 }, 900)).toBe(12);
  });

  it('quien adivina ve el lienzo en directo, las pistas, el buscador y los intentos', () => {
    const html = guesser();
    expect(html).toContain('¿Qué Pokémon dibuja Ana?');
    expect(html).toContain('Dibujo en directo de Ana');
    expect(html).toContain('En directo');
    expect(html).toContain('Pistas automáticas');
    expect(html).toContain('Generación 4');
    expect(html).toContain('Tipo: Lucha / Acero');
    expect(html).toContain('Buscar respuesta para el dibujo 1');
    expect(html).toContain('Tu respuesta · 1 intento');
    expect(html).toContain('Gengar');
    expect(html).not.toContain('aria-label="Herramientas de dibujo"');
    expectSingleLiveRegion(html);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toMatch(LEGACY);
  });

  it('quien observa sigue el dibujo y los intentos sin buscador ni herramientas', () => {
    const html = spectator();
    expect(html).toContain('Estás observando: puedes seguir el dibujo y los intentos.');
    expect(html).toContain('Dibujo en directo de Ana');
    expect(html).not.toContain('Buscar respuesta para el dibujo');
    expect(html).not.toContain('Limpiar lienzo');
  });

  it('el orden de turnos dice en texto quién dibuja, quién va después y los puntos', () => {
    const html = guesser();
    expect(html).toContain('Orden de turnos');
    expect(html).toMatch(/Ana[^]*Dibuja ahora[^]*3 pts/);
    expect(html).toMatch(/Pedro[^]*Siguiente[^]*5 pts/);
    expect(html).toMatch(/Carlos[^]*Le toca después/);
    expect(html).toContain('el orden se vuelve a mezclar en la siguiente');
  });

  it('sin trazos dice que espera el primero', () => {
    const html = render({ role: 'GUESSER', canGuess: true, cooldownUntil: null, attemptCount: 0 }, 'p2', { ...publicGame(), strokes: [], attempts: [] });
    expect(html).toContain('Esperando el primer trazo…');
    expect(html).toContain('Todavía no hay intentos incorrectos.');
  });
});

describe('Sketchmon: revelación', () => {
  const reveal = (player: SketchmonPlayerState, selfId: string, round: SketchmonRoundResult = lastRound) => render(player, selfId, publicGame('ROUND_RESULTS', round));

  it('revela el Pokémon, quién acertó, en cuánto, el dibujo final y los puntos del dibujo', () => {
    const html = reveal({ role: 'GUESSER', canGuess: false, cooldownUntil: null, attemptCount: 2 }, 'p2');
    expect(html).toContain('¡Era Lucario!');
    expect(html).toContain('Pedro acertó Lucario en 2 intentos (12,3 s).');
    for (const text of ['Lucha', 'Acero', 'Generación 4', 'Dibujo de Ana', 'Dibujo final de Lucario']) expect(html).toContain(text);
    expect(html).toContain('Puntos del dibujo');
    expect(html).toMatch(/Pedro[^]*Acertó · 2 intentos[^]*\+5/);
    expect(html).toMatch(/Ana[^]*Dibujó[^]*\+3/);
    expect(html).toContain('¡Lo adivinaste en 2 intentos!');
    expectSingleLiveRegion(html);
    expect(html).not.toMatch(LEGACY);
  });

  it('por tiempo lo dice en texto y quien dibujaba no suma', () => {
    const html = reveal({ role: 'GUESSER', canGuess: false, cooldownUntil: null, attemptCount: 0 }, 'p1');
    const timeout = reveal({ role: 'GUESSER', canGuess: false, cooldownUntil: null, attemptCount: 0 }, 'p1', { ...lastRound, reason: 'TIMEOUT', winnerId: null, guesserPoints: 0, drawerPoints: 0, winnerAttemptCount: null });
    expect(html).toContain('Tu dibujo funcionó');
    expect(timeout).toContain('Se acabó el tiempo: nadie lo adivinó. Era Lucario.');
    expect(timeout).toContain('Dibujó · nadie acertó');
    expect(timeout).toContain('Nadie adivinó tu dibujo');
  });
});

describe('Sketchmon: resultados y ajustes', () => {
  it('la clasificación del catálogo con las métricas, los récords y la galería de dibujos, sin medallas', () => {
    const html = renderToStaticMarkup(createElement(SketchmonResults, { room: room(null, publicGame('GAME_RESULTS')), selfId: 'p1', onLobby: () => undefined, onEnd: () => undefined }));
    expect(html).toContain('La galería de la partida');
    expect(html).toContain('1 adivinado · 0 al primer intento · 0/1 dibujos descubiertos · +5 adivinando · +0 dibujando');
    for (const text of ['Mejor dibujante', 'Más Pokémon adivinados', 'Los dibujos de la partida', 'Dibujo de Lucario por Ana', 'de Ana · Vuelta 1', 'Adivinado', 'Sin acierto', 'Continuar sesión']) expect(html).toContain(text);
    expect(html.match(/data-testid="sketch-gallery-item"/g)).toHaveLength(2);
    expect(html).not.toMatch(MEDALS);
    expect(html).not.toMatch(LEGACY);
  });

  it('los ajustes usan los controles del catálogo con los valores del motor', () => {
    const html = renderToStaticMarkup(createElement(SketchmonConfigPanel, { config: defaultSketchmonConfig, disabled: false, onChange: async () => undefined }));
    for (const text of ['Tiempo por dibujo', '60 s', '90 s', '120 s', 'Vueltas', 'Cada jugador dibuja una vez por vuelta, en un orden nuevo.', 'Memoria de 3 segundos', 'Pistas automáticas', 'Formas compatibles', 'Intentos públicos', 'El Pokémon secreto solo se envía a quien dibuja.']) expect(html).toContain(text);
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/role="switch"/g)).toHaveLength(4);
  });
});

describe('Sketchmon: intentos públicos apagados', () => {
  const off = { publicAttempts: false };
  const hiddenGame = { ...publicGame(), attempts: [] };
  const miss = { playerId: 'p3', guessedPokemon: { id: 'riolu', name: 'Riolu', sprite: '/riolu.png' }, attemptedAt: 2_500 };

  it('quien dibuja sigue viendo los fallos de los demás', () => {
    const html = render({ role: 'DRAWER', canDraw: true, secretPokemon: null, attempts: [miss] }, 'p1', hiddenGame, off);
    expect(html).toContain('Riolu');
    expect(html).toContain('Carlos');
  });

  it('quien adivina no ve el panel de intentos', () => {
    const html = render({ role: 'GUESSER', canGuess: true, cooldownUntil: null, attemptCount: 0, attempts: [] }, 'p2', hiddenGame, off);
    expect(html).not.toContain('Todavía no hay intentos incorrectos.');
    expect(html).not.toContain('Riolu');
  });

  it('quien observa no ve el panel de intentos', () => {
    const html = render({ role: 'SPECTATOR' }, 'p4', hiddenGame, off);
    expect(html).not.toContain('Todavía no hay intentos incorrectos.');
  });
});
