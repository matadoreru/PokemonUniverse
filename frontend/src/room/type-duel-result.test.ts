import type { TypeDuelRoundResult } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import { typeDuelHeading, typeDuelResultText, typeDuelSolutionsText } from './type-duel-result';

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
  it('DISCONNECT_FORFEIT names the winner and the duelist who did not come back', () => {
    expect(typeDuelResultText(round({ reason: 'DISCONNECT_FORFEIT', winnerId: 'p1', disconnectedIds: ['p2'] }), participants, nameOf)).toEqual({ title: 'Ana gana', detail: 'Bruno se desconectó.' });
  });
  it('DISCONNECTED names who left', () => {
    expect(typeDuelResultText(round({ reason: 'DISCONNECTED', disconnectedIds: ['p2'] }), participants, nameOf)).toEqual({ title: 'Duelo anulado', detail: 'Bruno se desconectó.' });
  });
  it('DISCONNECTED names both duelists when both left', () => {
    expect(typeDuelResultText(round({ reason: 'DISCONNECTED', disconnectedIds: ['p1', 'p2'] }), participants, nameOf)).toEqual({ title: 'Duelo anulado', detail: 'Ana y Bruno se desconectaron.' });
  });
  it('INVALID_COMBINATION explains the three impossible tries', () => {
    expect(typeDuelResultText(round({ reason: 'INVALID_COMBINATION', requiredTypes: ['dragon', 'fairy'] }), participants, nameOf)).toEqual({ title: 'Combinación imposible', detail: 'Ninguna combinación elegida tenía Pokémon válidos: el duelo cuenta sin puntos.' });
  });
});

describe('typeDuelSolutionsText', () => {
  it('uses the singular for a single valid Pokémon', () => {
    expect(typeDuelSolutionsText(1)).toBe('1 Pokémon tiene esta combinación');
  });
  it('uses the plural otherwise', () => {
    expect(typeDuelSolutionsText(25)).toBe('25 Pokémon tienen esta combinación');
  });
});

describe('typeDuelHeading', () => {
  it('names the duel while the VS block shows the duelists', () => {
    expect(typeDuelHeading('TYPE_REVEAL', ['Ana', 'Bruno'])).toBe('Duelo de tipos');
    expect(typeDuelHeading('POKEMON_SEARCH', ['Ana', 'Bruno'])).toBe('Duelo de tipos');
  });
  it('keeps both names in the other phases', () => {
    expect(typeDuelHeading('SELECTING_TYPES', ['Ana', 'Bruno'])).toBe('Ana VS Bruno');
    expect(typeDuelHeading('ROUND_RESULTS', ['Ana', 'Bruno'])).toBe('Ana VS Bruno');
  });
});
