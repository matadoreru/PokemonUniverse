import type { OddOneOutRoundResult } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { roundOutcome, votedCountText } from './presentation';

const lastRound: OddOneOutRoundResult = {
  roundNumber: 1,
  intruderOptionId: 'C',
  category: { id: 'fossil', label: 'Pokémon fósiles', explanation: 'Se resucitan de un fósil.' },
  votes: { p1: { optionId: 'C', votedAt: 1 }, p2: { optionId: 'A', votedAt: 2 } },
  points: { p1: 4, p2: 0 },
};

describe('El Intruso: presentación', () => {
  it('cuenta los votos con singular y plural', () => {
    expect(votedCountText(1, 4)).toBe('1 de 4 ha votado');
    expect(votedCountText(3, 4)).toBe('3 de 4 han votado');
    expect(votedCountText(0, 4)).toBe('0 de 4 han votado');
  });

  it('resume la ronda de cada jugador', () => {
    expect(roundOutcome(lastRound, 'p1')).toEqual({ title: '¡Era el intruso!', tone: 'ok' });
    expect(roundOutcome(lastRound, 'p2')).toEqual({ title: 'No era ese', tone: 'bad' });
    expect(roundOutcome(lastRound, 'p3')).toEqual({ title: 'Sin voto', tone: 'info' });
    expect(roundOutcome(null, 'p1')).toEqual({ title: 'Sin voto', tone: 'info' });
  });
});
