import type { TypeDuelRoundResult } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { typeDuelResultText } from './type-duel-result';

const participants = ['p1', 'p2'] as const;
const nameOf = (id: string) => ({ p1: 'Ana', p2: 'Bruno' } as Record<string, string>)[id] ?? id;
function round(overrides: Partial<TypeDuelRoundResult>): TypeDuelRoundResult {
  return { reason: 'WINNER', winnerId: null, attempts: [], solutions: [], requiredTypes: null, selectedTypes: {}, disconnectedIds: [], ...overrides };
}

describe('typeDuelResultText', () => {
  it('WINNER names the winner without detail', () => {
    expect(typeDuelResultText(round({ reason: 'WINNER', winnerId: 'p1' }), participants, nameOf)).toEqual({ title: 'Ana gana', detail: null });
  });
  it('TIMEOUT says nobody found a Pokémon', () => {
    expect(typeDuelResultText(round({ reason: 'TIMEOUT' }), participants, nameOf)).toEqual({ title: 'Tiempo agotado', detail: 'Nadie encontró un Pokémon con esa combinación.' });
  });
  it('TYPE_FORFEIT names the winner and the rival who did not choose', () => {
    expect(typeDuelResultText(round({ reason: 'TYPE_FORFEIT', winnerId: 'p1' }), participants, nameOf)).toEqual({ title: 'Ana gana', detail: 'Bruno no eligió tipo a tiempo.' });
  });
  it('TYPE_TIMEOUT counts the duel without points', () => {
    expect(typeDuelResultText(round({ reason: 'TYPE_TIMEOUT' }), participants, nameOf)).toEqual({ title: 'Ninguno eligió tipo', detail: 'El duelo cuenta sin puntos.' });
  });
  it('DISCONNECTED names who left', () => {
    expect(typeDuelResultText(round({ reason: 'DISCONNECTED', disconnectedIds: ['p2'] }), participants, nameOf)).toEqual({ title: 'Duelo anulado', detail: 'Bruno se desconectó.' });
  });
  it('INVALID_COMBINATION explains the three impossible tries', () => {
    expect(typeDuelResultText(round({ reason: 'INVALID_COMBINATION', requiredTypes: ['dragon', 'fairy'] }), participants, nameOf)).toEqual({ title: 'Combinación imposible', detail: 'Tres intentos sin ningún Pokémon válido: el duelo cuenta sin puntos.' });
  });
});
