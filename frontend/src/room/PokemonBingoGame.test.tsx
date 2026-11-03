import type { BingoPublicBoard } from '@pokemon-universe/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PokemonBingoBoard } from './PokemonBingoGame';

const board: BingoPublicBoard = {
  playerId: 'p1',
  completed: 1,
  total: 2,
  lastProgressAt: 1_000,
  cells: [
    {
      id: 'assigned',
      conditions: [{ kind: 'TYPE_COUNT', count: 2 }],
      assignment: { id: 'steelix', name: 'Steelix', sprite: '/steelix.png' },
      possibleSolutions: [],
    },
    {
      id: 'empty',
      conditions: [{ kind: 'GENERATION', generation: 9 }],
      assignment: null,
      possibleSolutions: [],
    },
  ],
};

describe('Pokémon Bingo board layout', () => {
  it('gives assigned Pokémon visual priority and keeps empty cells compact', () => {
    const markup = renderToStaticMarkup(createElement(PokemonBingoBoard, {
      board,
      width: 3,
      selectedCellId: 'assigned',
      interactive: true,
      onSelect: () => undefined,
    }));

    expect(markup).toContain('h-28 w-28');
    expect(markup).toContain('[image-rendering:pixelated]');
    expect(markup).toContain('minmax(12rem, 1fr)');
    expect(markup).toContain('ring-2 ring-electric/30');
    expect(markup).not.toContain('border-dashed');
  });
});
