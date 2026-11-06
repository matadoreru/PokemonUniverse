import type { RoomView } from '@pokemon-universe/shared/public';
import { createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { DailyLeaderboardResponse } from '../lib/api-contract';
import { DailyLeaderboardView } from './DailyLeaderboard';
import { DailyResultSummary, DailyResultsScreen } from './DailyResultsScreen';
import { shareDailyResult } from './daily-state';

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', kind: 'USER', displayName: 'ash', avatar: { type: 'DEFAULT' } } }) }));
vi.mock('../room/RoomContext', () => ({ useRoom: () => ({ subscribe: () => () => undefined }) }));
vi.mock('./daily-api', () => ({ fetchDailyLeaderboard: () => new Promise(() => undefined), PLAY_FIRST: "Play today's challenge first" }));

const result = { score: 612, correct: 7, rounds: [1, 1, 0, 1, 1, 1, 0, 1, 1, -1] };
const room = {
  code: 'DAILY1', phase: 'GAME_RESULTS', selectedGameId: 'higher-lower', game: { gameId: 'higher-lower' },
  availableGames: [{ id: 'higher-lower', name: 'Higher or Lower' }], members: [{ id: 'u1', displayName: 'ash' }],
  daily: { gameId: 'higher-lower', date: '2026-11-07', roundCount: 10, result },
} as unknown as RoomView;
const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const render = <P extends object>(element: FunctionComponent<P>, props: P) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(element, props)));

describe('DailyResultsScreen', () => {
  it('título con el juego y la fecha, la puntuación, los aciertos y la línea de emojis', () => {
    const markup = render(DailyResultsScreen, { room, onLeave: () => undefined });
    expect(text(markup)).toContain('Reto diario · Higher or Lower');
    expect(text(markup)).toContain('07/11/2026');
    expect(text(markup)).toContain('612');
    expect(text(markup)).toContain('7/10');
    expect(markup).toContain('✅✅❌✅✅✅❌✅✅⌛');
    expect(markup).toMatch(/<button[^>]*>.*Compartir/);
    expect(markup).toMatch(/<button[^>]*>.*Volver a Jugar/);
  });

  it('una sola región viva, siempre montada', () => {
    const markup = render(DailyResultsScreen, { room, onLeave: () => undefined });
    expect(markup.match(/role="status"|aria-live=/g)).toHaveLength(1);
    expect(markup).not.toContain('role="alert"');
  });

  it('la región viva anuncia «Resultado copiado»', () => {
    const markup = render(DailyResultSummary, { gameId: 'higher-lower', date: '2026-11-07', roundCount: 10, result, announcement: 'Resultado copiado', onShare: () => undefined });
    expect(markup).toMatch(/role="status"[^>]*>Resultado copiado</);
  });
});

describe('shareDailyResult', () => {
  it('sin `navigator.share`, copia al portapapeles y anuncia «Resultado copiado»', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    await expect(shareDailyResult('texto', { clipboard: { writeText } })).resolves.toBe('Resultado copiado');
    expect(writeText).toHaveBeenCalledWith('texto');
  });
  it('con `navigator.share`, lo usa y no anuncia nada; cancelar no es un error', async () => {
    const share = vi.fn(() => Promise.resolve());
    await expect(shareDailyResult('texto', { share, clipboard: { writeText: vi.fn() } })).resolves.toBe('');
    expect(share).toHaveBeenCalledWith({ text: 'texto' });
    const cancel = vi.fn(() => Promise.reject(new DOMException('cancelado', 'AbortError')));
    await expect(shareDailyResult('texto', { share: cancel })).resolves.toBe('');
  });
  it('si el portapapeles falla, lo dice', async () => {
    await expect(shareDailyResult('texto', { clipboard: { writeText: () => Promise.reject(new Error('no')) } })).resolves.toBe('No se pudo copiar el resultado');
  });
});

describe('DailyLeaderboardView', () => {
  const entry = (position: number, userId: string, username: string, score: number) => ({ position, userId, username, avatar: { type: 'DEFAULT' as const }, score, correct: 7, finishedAt: '2026-11-07T10:00:00Z' });
  const board = (me: DailyLeaderboardResponse['me'], entries = [entry(1, 'u2', 'misty', 700)]): DailyLeaderboardResponse => ({ date: '2026-11-07', gameId: 'higher-lower', total: entries.length, entries, me });

  it('«Guardando tu resultado…» mientras la fila propia sigue en curso', () => {
    const markup = render(DailyLeaderboardView, { data: board({ status: 'IN_PROGRESS', position: null, score: null, correct: null, rounds: null }), error: null, self: { id: 'u1', name: 'ash' } });
    expect(text(markup)).toContain('Guardando tu resultado…');
    expect(text(markup)).toContain('misty');
  });

  it('«Guardando tu resultado…» también si aún no hay fila (403)', () => {
    const markup = render(DailyLeaderboardView, { data: null, error: "Play today's challenge first", self: { id: 'u1', name: 'ash' } });
    expect(text(markup)).toContain('Guardando tu resultado…');
    expect(markup).not.toContain('role="alert"');
  });

  it('con la fila propia, sin aviso y marcada', () => {
    const entries = [entry(1, 'u2', 'misty', 700), entry(2, 'u1', 'ash', 612)];
    const markup = render(DailyLeaderboardView, { data: board({ status: 'FINISHED', position: 2, score: 612, correct: 7, rounds: [] }, entries), error: null, self: { id: 'u1', name: 'ash' } });
    expect(text(markup)).not.toContain('Guardando tu resultado…');
    expect(text(markup)).toContain('ash');
    expect(text(markup)).toContain('(tú)');
  });

  it('la fila propia fuera de las primeras va al final', () => {
    const markup = render(DailyLeaderboardView, { data: board({ status: 'FINISHED', position: 77, score: 10, correct: 1, rounds: [] }), error: null, self: { id: 'u1', name: 'ash' } });
    expect(text(markup)).toMatch(/misty .* 77 .*ash/);
  });
});
