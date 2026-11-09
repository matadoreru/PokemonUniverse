import type { AbsurdPokedexEntryResult, AbsurdPokedexRoundResult } from '@pokemon-universe/shared/public';
import { describe, expect, it, vi } from 'vitest';
import { absurdModeTitle, absurdVotePayload, createDraftScheduler, fooledNames, sortedRoundEntries, toggleFunny } from './presentation';

const entry = (id: string, votesReceived: number, extra: Partial<AbsurdPokedexEntryResult> = {}): AbsurdPokedexEntryResult => ({
  id, text: id, authorId: 'p1', isReal: false, votesReceived, funnyVotesReceived: 0, votedBy: [], funnyVotedBy: [], ...extra,
});
const round = (mode: 'CLASSIC' | 'REAL_ENTRY', entries: AbsurdPokedexEntryResult[]): AbsurdPokedexRoundResult => ({
  mode, pokemon: { id: 'gengar', name: 'Gengar', sprite: '/g.png', nationalDexNumber: 94, types: ['ghost'] }, skipped: false, entries,
  realEntry: mode === 'REAL_ENTRY' ? { id: 'real', versionLabel: 'Pokémon Rojo' } : null, winnerPlayerIds: [], pointsAwarded: {}, missingPlayerIds: [],
});
const names = (id: string) => ({ p1: 'Ana', p2: 'Luis', p3: 'Eru' })[id] ?? id;

describe('Pokédex Absurda: presentación', () => {
  it('titula cada modo', () => {
    expect(absurdModeTitle('CLASSIC')).toBe('La más absurda');
    expect(absurdModeTitle('REAL_ENTRY')).toBe('¿Cuál es la real?');
  });

  it('fooledNames lista a quienes votaron la entrada inventada', () => {
    expect(fooledNames(entry('a', 0), names)).toBe('');
    expect(fooledNames(entry('a', 1, { votedBy: ['p1'] }), names)).toBe('Engañó a Ana');
    expect(fooledNames(entry('a', 2, { votedBy: ['p1', 'p2'] }), names)).toBe('Engañó a Ana y Luis');
    expect(fooledNames(entry('real', 2, { votedBy: ['p1', 'p2'], isReal: true, authorId: null }), names)).toBe('');
  });

  it('sortedRoundEntries: la oficial primero en REAL_ENTRY y luego por votos; en Clásico solo por votos', () => {
    const entries = [entry('a', 1), entry('real', 0, { isReal: true, authorId: null }), entry('b', 3), entry('c', 3)];
    expect(sortedRoundEntries(round('REAL_ENTRY', entries)).map((e) => e.id)).toEqual(['real', 'b', 'c', 'a']);
    expect(sortedRoundEntries(round('CLASSIC', entries)).map((e) => e.id)).toEqual(['b', 'c', 'a', 'real']);
  });

  it('el voto lleva la graciosa solo en REAL_ENTRY', () => {
    expect(absurdVotePayload('REAL_ENTRY', 'a', 'b')).toEqual({ type: 'VOTE_ABSURD', entryId: 'a', funnyEntryId: 'b' });
    expect(absurdVotePayload('REAL_ENTRY', 'a', null)).toEqual({ type: 'VOTE_ABSURD', entryId: 'a' });
    expect(absurdVotePayload('CLASSIC', 'a', 'b')).toEqual({ type: 'VOTE_ABSURD', entryId: 'a' });
  });

  it('el conmutador de la graciosa marca, cambia y suelta', () => {
    expect(toggleFunny(null, 'a')).toBe('a');
    expect(toggleFunny('a', 'b')).toBe('b');
    expect(toggleFunny('b', 'b')).toBeNull();
  });

  it('el borrador espera al debounce, envía solo el último y se vuelca al desmontar', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const draft = createDraftScheduler(send, '', 400);
    draft.schedule('h'); draft.schedule('ho'); draft.schedule('hola');
    vi.advanceTimersByTime(399);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenLastCalledWith('hola');
    draft.schedule('hola mundo');
    draft.flush();
    expect(send).toHaveBeenLastCalledWith('hola mundo');
    vi.advanceTimersByTime(1_000);
    expect(send).toHaveBeenCalledTimes(2);
    draft.schedule('x'); draft.cancel(); vi.advanceTimersByTime(1_000); draft.flush();
    expect(send).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
