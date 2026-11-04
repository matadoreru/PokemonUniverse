import type { WhoIsWhoPublicState } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { boardLayout, boardMove, CARD_MIN, CARD_RATIO, cursorLabel, downCountText, previousTurnGuess, teamStatus, whoAnnouncement, whoFocusKey, whoHeading, whoResultRule, whoResultTitle, whoStatsLine } from './presentation';

const base = {
  gameId: 'who-is-who-pokemon', phase: 'TURN_ACTIVE', board: [{ id: 'pikachu', nationalDexNumber: 25, name: 'Pikachu', sprite: '/p.png' }],
  teams: { BLUE: { playerIds: ['a'], secretReady: true }, RED: { playerIds: ['b'], secretReady: true } }, currentTeam: 'RED',
  roundNumber: 1, turnNumber: 2, totalRounds: 25, roundStartedAt: 0, roundEndsAt: 1, guesses: [], winnerTeam: null,
  revealedSecrets: { BLUE: null, RED: null }, results: null,
} satisfies WhoIsWhoPublicState;
const nameOf = (id: string) => ({ a: 'Ana', b: 'Beto' })[id] ?? id;

describe('boardLayout', () => {
  it('elige las columnas que dan la carta más grande sin desplazar', () => {
    const layout = boardLayout(24, 900, 420, 8);
    expect(layout.fits).toBe(true);
    const rows = Math.ceil(24 / layout.columns);
    expect(layout.columns * layout.card + (layout.columns - 1) * 8).toBeLessThanOrEqual(900);
    expect(rows * layout.card * CARD_RATIO + (rows - 1) * 8).toBeLessThanOrEqual(420.5);
    expect(layout.card).toBeGreaterThanOrEqual(CARD_MIN);
  });
  it('a 1280×720 el tablero de 24 (por defecto) cabe entero en el cuerpo del panel (~840×236): tres filas', () => {
    const layout = boardLayout(24, 840, 236, 8);
    expect(layout.fits).toBe(true);
    expect(Math.ceil(24 / layout.columns)).toBeLessThanOrEqual(3);
    expect(layout.card).toBeGreaterThanOrEqual(44);
  });
  it('a 1920 las cartas crecen', () => {
    expect(boardLayout(24, 1150, 720, 8).card).toBeGreaterThan(boardLayout(24, 850, 420, 8).card * 1.25);
  });
  it('sin sitio para el mínimo: tantas columnas como quepan y se desplaza', () => {
    const layout = boardLayout(50, 340, 300, 8);
    expect(layout.fits).toBe(false);
    expect(layout.columns).toBe(Math.floor((340 + 8) / (CARD_MIN + 8)));
    expect(layout.card).toBeGreaterThanOrEqual(CARD_MIN);
  });
  it('sin medir, una reserva que no rompe', () => {
    expect(boardLayout(10, 0, 0, 8)).toEqual({ columns: 6, card: CARD_MIN, fits: false });
  });
  it('con pocas cartas no pasan del máximo', () => {
    expect(boardLayout(5, 3000, 3000, 8).card).toBe(200);
  });
});

describe('cursorLabel', () => {
  it('encima de la punta o al lado en la primera fila (nunca sobre la franja del nombre); apagada a los 1,5 s quieta', () => {
    expect(cursorLabel(120, 0)).toEqual({ beside: false, quiet: false, top: null });
    expect(cursorLabel(20, 0).beside).toBe(true);
    // Al lado, arrimada al borde de arriba del tablero (8 px por encima), sea cual sea la altura de la punta.
    expect(cursorLabel(20, 0).top).toBe(-28);
    expect(cursorLabel(40, 0).top).toBe(-48);
    expect(cursorLabel(-3, 0).top).toBe(-8);
    expect(cursorLabel(120, 1_400).quiet).toBe(false);
    expect(cursorLabel(120, 1_600).quiet).toBe(true);
  });
});

describe('boardMove', () => {
  it('flechas, Inicio y Fin por la rejilla; sin salirse', () => {
    expect(boardMove(0, 'ArrowRight', 4, 10)).toBe(1);
    expect(boardMove(0, 'ArrowLeft', 4, 10)).toBe(0);
    expect(boardMove(1, 'ArrowDown', 4, 10)).toBe(5);
    expect(boardMove(8, 'ArrowDown', 4, 10)).toBe(8);
    expect(boardMove(5, 'ArrowUp', 4, 10)).toBe(1);
    expect(boardMove(5, 'Home', 4, 10)).toBe(0);
    expect(boardMove(5, 'End', 4, 10)).toBe(9);
    expect(boardMove(5, 'a', 4, 10)).toBeNull();
  });
});

describe('textos', () => {
  it('título y región viva según el turno y el rol', () => {
    expect(whoHeading(base, { team: 'RED', canChooseSecret: false })).toBe('Vuestro turno');
    expect(whoHeading(base, { team: 'BLUE', canChooseSecret: false })).toBe('Turno del Equipo Rojo');
    expect(whoHeading(base, null)).toBe('Turno del Equipo Rojo');
    expect(whoAnnouncement({ game: base, player: null, nameOf })).toBe('Turno 2: le toca al Equipo Rojo.');
  });
  it('el fallo del turno anterior entra en la región viva; uno más viejo, no', () => {
    const guess = { team: 'BLUE' as const, playerId: 'a', pokemonId: 'pikachu', correct: false, attemptedAt: 1, turnNumber: 1 };
    const game = { ...base, guesses: [guess] };
    expect(previousTurnGuess(game)).toEqual(guess);
    expect(whoAnnouncement({ game, player: null, nameOf })).toBe('Ana (Equipo Azul) probó Pikachu: no era. Turno 2: le toca al Equipo Rojo.');
    expect(previousTurnGuess({ ...game, turnNumber: 3 })).toBeNull();
  });
  it('antes de los secretos', () => {
    const waiting = { ...base, teams: { ...base.teams, RED: { playerIds: ['b'], secretReady: false } } };
    expect(whoHeading(waiting, { team: 'RED', canChooseSecret: true })).toBe('Elegid vuestro Pokémon secreto');
    expect(whoHeading(waiting, { team: 'BLUE', canChooseSecret: false })).toBe('Esperando los secretos');
    expect(teamStatus(waiting, 'RED').text).toBe('Eligiendo secreto');
    expect(teamStatus(waiting, 'BLUE').text).toBe('Secreto elegido');
    expect(teamStatus(base, 'RED').text).toBe('Tiene el turno');
  });
  it('la clave del foco cambia con el turno y al cerrar el diálogo', () => {
    expect(whoFocusKey(base, true)).not.toBe(whoFocusKey(base, false));
    expect(whoFocusKey(base, false)).not.toBe(whoFocusKey({ ...base, turnNumber: 3 }, false));
  });
  it('resultados y estadísticas', () => {
    expect(whoResultTitle('RED')).toBe('¡Ganó el Equipo Rojo!');
    expect(whoResultTitle(null)).toBe('Empate');
    expect(whoResultRule('BLUE', false)).toContain('se quedó sin jugadores');
    expect(whoStatsLine({ correctGuesses: 1, incorrectGuesses: 2, turnsPlayed: 3 })).toBe('1 acierto · 2 fallos');
    expect(whoStatsLine({})).toBe('Sin intentos de adivinar');
    expect(downCountText(1, 24)).toBe('1 de 24 bajadas');
  });
});
