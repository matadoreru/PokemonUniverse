import type { PokedexDistancePublicState, PokedexDistanceSelectionVisibility } from '@pokemon-universe/shared/public';

/** Título del grupo de visibilidad en el panel de configuración. */
export const DISTANCE_SELECTION_VISIBILITY_LABEL = 'Elecciones de los rivales';

/** Botones del panel de configuración para cada modo de visibilidad. */
export const distanceSelectionVisibilityLabels: Record<PokedexDistanceSelectionVisibility, string> = { HIDDEN: 'Ocultas', LIVE: 'Visibles' };

/** Estado de un jugador que ya ha elegido cuando las elecciones de los rivales están ocultas. */
export const DISTANCE_HIDDEN_PICKED_LABEL = '✓ Ya ha elegido';

export type DistanceMemberStatus =
  | { kind: 'picked'; pokemonName: string; sprite: string }
  | { kind: 'hidden-picked' }
  | { kind: 'picking' };

/**
 * Qué se sabe de la elección de un jugador en la ronda en curso: el Pokémon si la proyección lo publica (`LIVE`),
 * solo que ya ha elegido si está oculta (`HIDDEN`, por `selectedIds`), o que aún está eligiendo.
 */
export function distanceMemberStatus(game: PokedexDistancePublicState, memberId: string): DistanceMemberStatus {
  const selection = game.selections[memberId];
  if (selection) return { kind: 'picked', pokemonName: selection.pokemonName, sprite: selection.sprite };
  if (game.selectedIds.includes(memberId)) return { kind: 'hidden-picked' };
  return { kind: 'picking' };
}

/** Texto para quien observa la ronda: en `HIDDEN` no hay selecciones en directo que seguir. */
export function distanceSpectatorHint(visibility: PokedexDistanceSelectionVisibility): string {
  return visibility === 'LIVE' ? 'Sigue las selecciones en directo.' : 'Las elecciones se verán al revelar la ronda.';
}
