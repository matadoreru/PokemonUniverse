import { describe, expect, it } from 'vitest';
import { clientGameRegistry } from './registry';

describe('client minigame registry', () => {
  it('lists Pokédex Distance, Shiny Quiz and Pokémon Impostor together', () => {
    expect(clientGameRegistry.list().map(({ id, name }) => [id, name])).toEqual([
      ['pokedex-distance', 'Pokédex Distance'],
      ['shiny-vote', 'Shiny Quiz'],
      ['pokemon-impostor', 'Pokémon Impostor'],
    ]);
  });
});
