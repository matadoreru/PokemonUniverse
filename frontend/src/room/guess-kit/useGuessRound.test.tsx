import type { RoomView } from '@pokemon-universe/shared/public';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useGuessRound, type GuessRound, type GuessRoundGame, type GuessRoundOptions, type GuessRoundPlayer } from './useGuessRound';

interface Result { pokemon: { name: string }; solves: Record<string, { solveOrder: number; points: number }> }
const result: Result = { pokemon: { name: 'Lucario' }, solves: { p1: { solveOrder: 1, points: 13 } } };

const members = [
  { id: 'p1', displayName: 'Eru', role: 'PLAYER' },
  { id: 'p2', displayName: 'Ana', role: 'SPECTATOR' },
];
const room = { members, serverNow: Date.now() } as unknown as RoomView;
const guessing: GuessRoundPlayer = { canGuess: true, solved: false, solveOrder: null, cooldownUntil: null, roundPoints: 0, attemptCount: 0 };

function game(overrides: Partial<GuessRoundGame<Result>> = {}): GuessRoundGame<Result> {
  return { phase: 'ROUND_ACTIVE', roundNumber: 1, totalRounds: 3, attempts: [], roundEndsAt: Date.now() + 20_000, nextTransitionAt: null, lastRound: null, ...overrides };
}

/** Ejecuta el hook en un render de servidor y devuelve lo que dio. */
function run(options: Partial<GuessRoundOptions<Result>> = {}): GuessRound<Result> {
  let out: GuessRound<Result> | null = null;
  function Probe() { out = useGuessRound<Result>({ room, selfId: 'p1', game: game(), player: guessing, answer: (r) => r.pokemon.name, ...options }); return null; }
  renderToStaticMarkup(createElement(Probe));
  return out!;
}

describe('useGuessRound', () => {
  it('en la ronda: placa de adivinar, plazo «Tiempo» con su duración y mapas de la sala', () => {
    const round = run({ roundSeconds: 20 });
    expect(round.kind).toBe('guess');
    expect(round.active).toBe(true);
    expect(round.participating).toBe(true);
    expect(round.timer).toMatchObject({ label: 'Tiempo', totalMs: 20_000 });
    expect(round.colors.get('p2')).toBe(1);
    expect(round.members.get('p1')?.displayName).toBe('Eru');
    expect(round.announcement).toBe('');
  });

  it('privacidad: un lastRound sobrante en la ronda no sale (ni en el aviso ni en el veredicto)', () => {
    const round = run({ game: game({ lastRound: result }) });
    expect(round.lastRound).toBeNull();
    expect(round.panel.verdict).toBeNull();
    expect(round.announcement).not.toContain('Lucario');
  });

  it('en la revelación: la respuesta, el aviso, el veredicto, la cuenta atrás y el foco', () => {
    const round = run({ game: game({ phase: 'ROUND_RESULTS', lastRound: result, roundEndsAt: null, nextTransitionAt: Date.now() + 4_000 }), player: { ...guessing, canGuess: false, solved: true, solveOrder: 1, roundPoints: 13 } });
    expect(round.lastRound).toBe(result);
    expect(round.kind).toBe('reveal');
    expect(round.announcement).toBe('Ronda 1 terminada: era Lucario.');
    expect(round.panel.verdict).toMatchObject({ tone: 'ok', points: 13 });
    expect(round.panel.countdown).toMatch(/^Siguiente ronda en \d+s$/);
    expect(round.timer.label).toBe('Siguiente ronda');
    expect(round.panel.titleRef).toHaveProperty('current');
  });

  it('última ronda: el plazo y la cuenta atrás llevan a la clasificación', () => {
    const round = run({ game: game({ phase: 'ROUND_RESULTS', roundNumber: 3, lastRound: result, nextTransitionAt: Date.now() + 4_000 }) });
    expect(round.last).toBe(true);
    expect(round.timer.label).toBe('Clasificación');
    expect(round.panel.countdown).toMatch(/^Clasificación en \d+s$/);
  });

  it('tras un fallo propio: el último intento y el aviso fijo', () => {
    const attempts = [{ playerId: 'p1', guessedPokemon: { name: 'Raichu', sprite: '/r.png' }, attemptedAt: 1 }];
    const round = run({ game: game({ attempts }), player: { ...guessing, attemptCount: 1 } });
    expect(round.panel.lastWrong).toBe('Raichu');
    expect(round.announcement).toBe('Incorrecto (1 intento): Raichu no era. Hay una breve espera antes del siguiente intento.');
  });

  it('quién responde: por el rol del miembro, o lo que diga el juego (Palette y Cry por `player.role`)', () => {
    expect(run({ selfId: 'p2' }).kind).toBe('watching');
    expect(run({ participating: false }).kind).toBe('watching');
    expect(run({ selfId: 'p2', participating: true }).kind).toBe('guess');
    expect(run({ player: null }).kind).toBe('waiting');
  });
});
