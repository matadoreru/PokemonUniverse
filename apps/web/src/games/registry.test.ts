import { describe, expect, it } from 'vitest';
import { clientGameRegistry } from './registry';

describe('client minigame registry', () => {
  it('lists all five minigames together', () => {
    expect(clientGameRegistry.list().map(({ id, name }) => [id, name])).toEqual([
      ['pokedex-distance', 'Pokédex Distance'],
      ['shiny-vote', 'Shiny Quiz'],
      ['pokemon-impostor', 'Pokémon Impostor'],
      ['higher-lower', 'Higher or Lower'],
      ['type-duel', 'Type Duel'],
    ]);
  });
});
