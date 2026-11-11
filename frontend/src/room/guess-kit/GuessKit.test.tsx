import { Search } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GuessAttemptsFeed, GuessHints, GuessPanel, GuessPlayersPanel, GuessRevealBoard, GuessRoundReveal, type GuessPanelProps } from '.';
import {
  guessAnnouncement, guessFocusKey, guessOwnLastAttempt, guessPanelKind, guessRevealLines, guessScoreboard, guessSearchAutoFocus, guessSolvedOrders, guessVerdict,
} from './presentation';
import { member } from '../test-support/room-view';

// «Saltar minijuego» va en la cabecera (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('../RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));

const members = [member({ id: 'p1', displayName: 'Ana' }), member({ id: 'p2', displayName: 'Bruno' }), member({ id: 'p3', displayName: 'Carla', connected: false, presence: 'TEMPORARILY_DISCONNECTED' }), member({ id: 's1', displayName: 'Sara', role: 'SPECTATOR' })];
const attempt = (playerId: string, name: string, at: number) => ({ playerId, guessedPokemon: { id: name.toLowerCase(), name, sprite: `/api/pokemon/${name.toLowerCase()}/sprite` }, attemptedAt: at });
const selector = { pokemon: [], loading: false, loadError: '', onRetry: () => undefined, inputLabel: 'Buscar respuesta para la ronda 2', roundKey: 2, onGuess: async () => undefined };
const panel = (props: Partial<GuessPanelProps>) => renderToStaticMarkup(<GuessPanel kind="guess" titleRef={{ current: null }} question="¿Quién es ese Pokémon?" selector={selector} {...props} />);

describe('guess-kit: presentación', () => {
  it('elige la placa de abajo según la fase y el jugador', () => {
    const player = { participating: true, canGuess: true, solved: false };
    expect(guessPanelKind('ROUND_ACTIVE', player, false)).toBe('guess');
    expect(guessPanelKind('ROUND_ACTIVE', { ...player, canGuess: false, solved: true }, false)).toBe('solved');
    expect(guessPanelKind('ROUND_ACTIVE', { ...player, participating: false }, false)).toBe('watching');
    expect(guessPanelKind('ROUND_ACTIVE', { ...player, canGuess: false }, false)).toBe('out');
    expect(guessPanelKind('ROUND_ACTIVE', null, false)).toBe('waiting');
    expect(guessPanelKind('ROUND_RESULTS', player, true)).toBe('reveal');
    expect(guessPanelKind('ROUND_RESULTS', player, false)).toBe('waiting');
    expect(guessFocusKey('solved', 3)).toBe('solved-3');
    expect(guessFocusKey('reveal', 3)).toBe('reveal-3');
    expect(guessFocusKey('guess', 3)).toBeNull();
  });

  it('normaliza quién ha acertado (lista o registro) y el último fallo propio', () => {
    expect([...guessSolvedOrders([{ playerId: 'p2', solveOrder: 1 }])]).toEqual([['p2', 1]]);
    expect([...guessSolvedOrders({ p1: { solveOrder: 2 } })]).toEqual([['p1', 2]]);
    const attempts = [attempt('p1', 'Raichu', 1), attempt('p2', 'Mew', 2), attempt('p1', 'Pichu', 3)];
    expect(guessOwnLastAttempt(attempts, 'p1')?.guessedPokemon.name).toBe('Pichu');
    expect(guessOwnLastAttempt(attempts, 's1')).toBeNull();
  });

  it('marcador: sin espectadores, por puntos y con el mismo puesto en empate (el empate a cero no cuenta)', () => {
    const lines = guessScoreboard(members, { p1: 5, p2: 13, p3: 5 }, new Map([['p2', 1]]));
    expect(lines.map((line) => [line.member.id, line.position, line.tied, line.solveOrder])).toEqual([['p2', 1, false, 1], ['p1', 2, true, undefined], ['p3', 2, true, undefined]]);
    expect(guessScoreboard(members, {}, new Map()).every((line) => line.position === 1 && !line.tied)).toBe(true);
    expect(lines.map((line) => line.colorIndex)).toEqual([1, 0, 2]);
  });

  it('revelación: por orden de acierto, los que no acertaron detrás; intentos de attemptCounts o del acierto', () => {
    const solves = { p3: { solveOrder: 1, elapsedMs: 900, points: 13, attempts: 2 }, p1: { solveOrder: 2, elapsedMs: 4_000, points: 8, attempts: 1 } };
    const lines = guessRevealLines(members, solves, { p2: 3 });
    expect(lines.map((line) => [line.member.id, line.attempts])).toEqual([['p3', 2], ['p1', 1], ['p2', 3]]);
    expect(guessVerdict(solves, 'p1', true)).toEqual({ tone: 'ok', text: '¡Acertaste! 2.º en acertar', points: 8 });
    expect(guessVerdict(solves, 'p2', true).text).toBe('Esta vez no acertaste');
    expect(guessVerdict(solves, 's1', false).text).toBe('Estás observando');
  });

  it('la región viva dice cada cosa una vez, con texto fijo (sin la cuenta del enfriamiento)', () => {
    expect(guessAnnouncement({ kind: 'guess', roundNumber: 1 })).toBe('');
    expect(guessAnnouncement({ kind: 'guess', roundNumber: 1, lastWrong: 'Raichu', attemptCount: 1 })).toBe('Incorrecto (1 intento): Raichu no era. Hay una breve espera antes del siguiente intento.');
    expect(guessAnnouncement({ kind: 'solved', roundNumber: 1, solveOrder: 1, roundPoints: 13 })).toBe('Acierto, 1.º en acertar: 13 puntos esta ronda.');
    expect(guessAnnouncement({ kind: 'reveal', roundNumber: 4, answer: 'Lucario' })).toBe('Ronda 4 terminada: era Lucario.');
    expect(guessAnnouncement({ kind: 'watching', roundNumber: 1, lastWrong: 'Mew' })).toBe('');
  });
});

describe('guess-kit: foco del buscador al empezar la ronda', () => {
  const media = (fine: boolean) => (query: string) => ({ matches: query === '(pointer: fine)' && fine });
  it('con ratón o teclado el buscador recibe el foco; en pantallas táctiles no (el teclado taparía la pista)', () => {
    expect(guessSearchAutoFocus(media(true))).toBe(true);
    expect(guessSearchAutoFocus(media(false))).toBe(false);
  });
  it('sin matchMedia (SSR, pruebas) no pide el foco', () => {
    expect(guessSearchAutoFocus(undefined)).toBe(false);
  });
});

describe('guess-kit: GuessPanel', () => {
  it('adivinar: el buscador con la etiqueta y la ronda del juego, sin región viva propia', () => {
    const html = panel({ attemptCount: 0 });
    expect(html).toContain('aria-label="Buscar respuesta para la ronda 2"');
    expect(html).toContain('¿Quién es ese Pokémon?');
    expect(html).toContain('Tu respuesta');
    expect(html).not.toMatch(/role="status"|aria-live/);
  });

  it('tras un fallo: la espera se ve (oculta a los lectores) y no bloquea la búsqueda; luego queda «X no era»', () => {
    const waiting = panel({ cooldownMs: 1_250, lastWrong: 'Raichu', attemptCount: 1 });
    expect(waiting).toMatch(/aria-hidden="true" data-testid="guess-cooldown"/);
    expect(waiting).toContain('Incorrecto · nuevo intento en 1.3s');
    expect(waiting).toContain('Tu respuesta · 1 intento');
    expect(waiting).toContain('aria-label="Buscar respuesta para la ronda 2"');
    const after = panel({ cooldownMs: 0, lastWrong: 'Raichu', attemptCount: 1 });
    expect(after).toContain('Raichu</span> no era');
    expect(after).not.toContain('guess-cooldown');
    // El fallo entra con una sacudida (una por intento); sin fallos no hay nota.
    expect(waiting).toMatch(/class="[^"]*motion-shake[^"]*" data-testid="guess-note"/);
    expect(after).toMatch(/class="[^"]*motion-shake[^"]*" data-testid="guess-note"/);
    expect(panel({ attemptCount: 0 })).not.toContain('guess-note');
  });

  it('compacta (Sketchmon): solo cambia la clase de la placa; el buscador, su ayuda y el estado siguen ahí', () => {
    const sectionClass = (html: string) => /^<section class="([^"]*)"/.exec(html)?.[1] ?? '';
    const plain = panel({ attemptCount: 1 });
    const compact = panel({ attemptCount: 1, compact: true });
    expect(sectionClass(compact)).not.toBe(sectionClass(plain));
    expect(sectionClass(compact).startsWith(sectionClass(plain))).toBe(true);
    expect(compact.replace(/^<section class="[^"]*"/, '')).toBe(plain.replace(/^<section class="[^"]*"/, ''));
    expect(compact).toContain('Tu respuesta · 1 intento');
    expect(compact).toContain('Enter elige la primera');
    expect(compact).not.toMatch(/role="status"|aria-live/);
  });

  it('acertado: «¡Acertado!» con el puesto en una insignia y los puntos; sin buscador', () => {
    const html = panel({ kind: 'solved', solveOrder: 2, roundPoints: 9 });
    expect(html).toContain('¡Acertado!');
    expect(html).toContain('2.º en acertar');
    expect(html).toContain('+9');
    expect(html).not.toContain('Buscar respuesta');
    expect(panel({ kind: 'solved', solveOrder: 1, roundPoints: 1, solvedTitle: '¡Paleta acertada!' })).toContain('¡Paleta acertada!');
  });

  it('observar, esperar y revelación', () => {
    const watching = panel({ kind: 'watching' });
    expect(watching).toContain('Estás observando');
    expect(watching).not.toContain('Buscar respuesta');
    expect(panel({ kind: 'waiting' })).toContain('Esperando al servidor…');
    // Quien entró con la partida empezada no puede adivinar en toda la partida: se le dice, sin «Esperando al servidor…».
    const out = panel({ kind: 'out' });
    expect(out).toContain('No juegas esta partida');
    expect(out).not.toContain('Esperando al servidor');
    expect(out).not.toContain('Buscar respuesta');
    const reveal = panel({ kind: 'reveal', verdict: { tone: 'ok', text: '¡Acertaste! 1.º en acertar', points: 13 }, countdown: 'Siguiente ronda en 4s' });
    expect(reveal).toContain('¡Acertaste! 1.º en acertar');
    expect(reveal).toContain('Siguiente ronda en 4s');
    expect(reveal).toContain('+13');
    expect(reveal).toMatch(/<h2 id="guess-plate-title" tabindex="-1"/);
  });
});

describe('guess-kit: GuessPanel con contenido propio', () => {
  it('`content` sustituye a la placa de `kind` y `guess` sigue montando el buscador', () => {
    const html = panel({ content: { icon: Search, tone: 'ok', kicker: 'Intento enviado', title: 'Pikachu enviado', text: 'Esperando al resto.' } });
    expect(html).toContain('Pikachu enviado');
    // Junto al buscador la placa solo lleva el kicker y el título: la descripción no se pinta.
    expect(html).not.toContain('Esperando al resto.');
    expect(html).not.toContain('¿Quién es ese Pokémon?');
    expect(html).toContain('aria-label="Buscar respuesta para la ronda 2"');
    const waiting = panel({ kind: 'waiting', content: { icon: Search, tone: 'info', kicker: 'Ronda 2 cerrada', title: 'Siguiente ronda en 3s' } });
    expect(waiting).toContain('Siguiente ronda en 3s');
    expect(panel({ kind: 'waiting', content: { icon: Search, tone: 'info', kicker: 'Ronda 2 cerrada', title: 'Siguiente ronda en 3s', text: 'Sin buscador, con ayuda.' } })).toContain('Sin buscador, con ayuda.');
    expect(waiting).not.toContain('Buscar respuesta para la ronda 2');
  });
});

describe('guess-kit: paneles', () => {
  it('marcador: franjas con color, «Acertó · 1.º» o «Buscando…» en texto, y el desconectado lo dice', () => {
    const html = renderToStaticMarkup(<GuessPlayersPanel lines={guessScoreboard(members, { p2: 13 }, new Map([['p2', 1]]))} selfId="p1" />);
    expect(html.match(/data-testid="guess-score-row"/g)).toHaveLength(3);
    expect(html).toContain('Acertó · 1.º');
    expect(html).toContain('Buscando…');
    expect(html).toContain('Sin conexión');
    expect(html).not.toContain('Sara');
  });

  it('intentos: el último arriba con «X probó» y «No era»; el vacío enseña a jugar sin región viva', () => {
    const map = new Map(members.map((entry) => [entry.id, entry]));
    const colors = new Map(members.map((entry, index) => [entry.id, index]));
    const html = renderToStaticMarkup(<GuessAttemptsFeed attempts={[attempt('p1', 'Raichu', 1), attempt('p2', 'Mew', 2)]} members={map} colors={colors} />);
    expect(html.indexOf('Mew')).toBeLessThan(html.indexOf('Raichu'));
    expect(html).toContain('Bruno probó');
    expect(html).toContain('No era');
    expect(html).toContain('alt=""');
    const empty = renderToStaticMarkup(<GuessAttemptsFeed attempts={[]} members={map} colors={colors} />);
    expect(empty).toContain('Todavía no hay intentos incorrectos.');
    expect(empty).not.toMatch(/role="status"|aria-live/);
  });

  it('pistas: nada sin pistas ni texto; un chip por pista', () => {
    expect(renderToStaticMarkup(<GuessHints hints={[]} />)).toBe('');
    expect(renderToStaticMarkup(<GuessHints hints={[]} emptyText="La primera pista aparecerá durante la ronda." />)).toContain('La primera pista aparecerá');
    const html = renderToStaticMarkup(<GuessHints hints={[{ key: 'a', label: 'Generación 4' }, { key: 'b', label: 'Es monotipo' }]} />);
    expect(html.match(/data-testid="guess-hint"/g)).toHaveLength(2);
  });

  it('revelación: puesto, tiempo, intentos y puntos; «No acertó» en texto; el detalle del juego', () => {
    const solves = { p2: { solveOrder: 1, elapsedMs: 1_000, points: 13, attempts: 1, speedPoints: 10 } };
    const html = renderToStaticMarkup(<GuessRevealBoard lines={guessRevealLines(members, solves, { p1: 2, p2: 1 })} selfId="p1" detail={({ solve }) => solve ? `Rapidez ${solve.speedPoints}` : null} />);
    expect(html.indexOf('Bruno')).toBeLessThan(html.indexOf('Ana'));
    expect(html).toContain('Acertó · 1.º');
    expect(html).toContain('1.0s · 1 intento');
    expect(html).toContain('Rapidez 10');
    expect(html).toContain('No acertó');
    expect(html).toContain('2 intentos');
    expect(html).toContain('+13');
    expect(html).not.toContain('Sara');
  });

  it('escena de la revelación: la carta con el nombre y la pista desvelada; varias respuestas', () => {
    const one = renderToStaticMarkup(<GuessRoundReveal answers={[{ name: 'Lucario', sprite: '/lucario.png' }]} details="Generación 4" clue={<span>silueta</span>} clueTitle="Así era su silueta" />);
    expect(one).toContain('alt="Lucario"');
    expect(one).toContain('data-answer-card="true"');
    expect(one).toContain('Así era su silueta');
    const several = renderToStaticMarkup(<GuessRoundReveal answers={[{ name: 'Mew' }, { name: 'Mewtwo' }]} />);
    expect(several).toContain('2 respuestas válidas');
  });

  it('escena de la revelación con una respuesta y su detalle: la ficha va con su carta (al lado en escritorio)', () => {
    const html = renderToStaticMarkup(<GuessRoundReveal answers={[{ id: 'mew', name: 'Mew', sprite: '/mew.png', detail: <span data-testid="answer-detail">PS 100</span> }]} />);
    expect(html).toMatch(/<li class="[^"]*_withDetail_[^"]*">.*data-answer-card="true".*data-testid="answer-detail".*<\/li>/);
    expect(html).not.toContain('respuestas válidas');
  });

  it('escena de la revelación con 6 respuestas: cada una con su clave y su detalle bajo la carta', () => {
    // Dos formas pueden compartir nombre: la clave es el id (React avisaría de claves repetidas con el nombre).
    const answers = ['a', 'b', 'c', 'd', 'e', 'f'].map((letter, index) => ({ id: `rotom-${letter}`, name: index < 2 ? 'Rotom' : `Rotom ${letter}`, sprite: `/rotom-${letter}.png`, detail: <span data-testid="answer-detail">PS {50 + index}</span> }));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const html = renderToStaticMarkup(<GuessRoundReveal answers={answers} />);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    expect(html).toContain('6 respuestas válidas');
    expect(html.match(/data-answer-card="true"/g)).toHaveLength(6);
    expect(html.match(/data-testid="answer-detail"/g)).toHaveLength(6);
    expect(html.indexOf('/rotom-f.png')).toBeLessThan(html.indexOf('PS 55'));
    expect(html).toContain('aria-label="Respuestas válidas"');
  });
});
