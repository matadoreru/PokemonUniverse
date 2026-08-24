import { describe, expect, it } from 'vitest';
import { clientGameRegistry } from './registry';

describe('client minigame registry', () => {
  it('keeps every existing minigame and adds Guess from Stats', () => {
    expect(clientGameRegistry.list().map(({ id, name }) => [id, name])).toEqual([
      ['pokedex-distance', 'Pokédex Distance'],
      ['shiny-vote', 'Shiny Quiz'],
      ['pokemon-impostor', 'Pokémon Impostor'],
      ['higher-lower', 'Higher or Lower'],
      ['type-duel', 'Type Duel'],
      ['learnset-guess', 'Learnset Guess'],
      ['pokeddle-race', 'Pokédle Race'],
      ['pokemon-bingo', 'Pokémon Bingo'],
      ['whos-that-pokemon', '¿Quién es ese Pokémon?'],
      ['pokedex-entry-guess', 'Pokédex Entry Guess'],
      ['type-chain', 'Type Chain'],
      ['guess-from-stats', 'Guess from Stats'],
      ['zoomed-pokemon', 'Zoomed Pokémon'],
    ]);
  });
});
