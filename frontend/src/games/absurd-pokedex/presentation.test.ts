import type { AbsurdPokedexEntryResult, AbsurdPokedexRoundResult } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { absurdModeTitle, fooledNames, sortedRoundEntries } from './presentation';

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
});
