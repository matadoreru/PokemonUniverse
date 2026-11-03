import type { PokedexDistancePublicState } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import {
  DISTANCE_HIDDEN_PICKED_LABEL, DISTANCE_SELECTION_VISIBILITY_LABEL, distanceMemberStatus, distanceSelectionVisibilityLabels,
  distanceSpectatorHint,
} from './pokedex-distance-selection';

function game(overrides: Partial<PokedexDistancePublicState>): PokedexDistancePublicState {
  return {
    gameId: 'pokedex-distance', phase: 'ROUND_ACTIVE', roundNumber: 1, tiebreakDepth: 0, targetDexNumber: 25,
    eligibleIds: ['p1', 'p2'], survivorIds: ['p1', 'p2'], spectatorIds: [], selections: {}, selectedIds: [],
    lockedPokemonIds: [], roundStartedAt: 0, roundEndsAt: 20_000, nextTransitionAt: null, lastRound: null, winnerId: null,
    results: null, ...overrides,
  };
}

describe('distanceMemberStatus', () => {
  it('en LIVE muestra el Pokémon elegido', () => {
    const live = game({
      selections: { p1: { pokemonId: 'pikachu', pokemonName: 'Pikachu', sprite: '/25.png', selectedAt: 1 } },
      selectedIds: ['p1'], lockedPokemonIds: ['pikachu'],
    });
    expect(distanceMemberStatus(live, 'p1')).toEqual({ kind: 'picked', pokemonName: 'Pikachu', sprite: '/25.png' });
  });

  it('en HIDDEN solo dice que ya ha elegido', () => {
    expect(distanceMemberStatus(game({ selectedIds: ['p1'] }), 'p1')).toEqual({ kind: 'hidden-picked' });
  });

  it('sin elegir sigue seleccionando', () => {
    expect(distanceMemberStatus(game({ selectedIds: ['p1'] }), 'p2')).toEqual({ kind: 'picking' });
  });
});

describe('textos de visibilidad de Pokédex Distance', () => {
  it('nombra el grupo y sus dos botones', () => {
    expect(DISTANCE_SELECTION_VISIBILITY_LABEL).toBe('Elecciones de los rivales');
    expect(distanceSelectionVisibilityLabels).toEqual({ HIDDEN: 'Ocultas', LIVE: 'Visibles' });
  });

  it('confirma la elección oculta sin revelarla', () => {
    expect(DISTANCE_HIDDEN_PICKED_LABEL).toBe('✓ Ya ha elegido');
  });

  it('el espectador solo sigue las selecciones en directo en LIVE', () => {
    expect(distanceSpectatorHint('LIVE')).toBe('Sigue las selecciones en directo.');
    expect(distanceSpectatorHint('HIDDEN')).toBe('Las elecciones se verán al revelar la ronda.');
  });
});
