import type { PokedexDistancePublicState, PokedexDistanceSelectionVisibility } from '@pokemon-universe/shared/public';

/** Título del grupo de visibilidad en el panel de configuración. */
export const DISTANCE_SELECTION_VISIBILITY_LABEL = 'Elecciones de los rivales';

/** Botones del panel de configuración para cada modo de visibilidad. */
export const distanceSelectionVisibilityLabels: Record<PokedexDistanceSelectionVisibility, string> = { HIDDEN: 'Ocultas', LIVE: 'Visibles' };

/** Cut-in y tarjeta de quien acierta el número exacto del objetivo. */
export const DISTANCE_EXACT_HIT_TITLE = '¡Acierto exacto!';

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

export interface DistanceRoundOutcome {
  title: string;
  /** Línea bajo las tarjetas de resultado, o `null` si no hace falta explicar nada. */
  note: string | null;
  /** Si la tarjeta del jugador lleva la etiqueta «Empate». */
  showTiedChip(playerId: string): boolean;
}

/**
 * Cabecera y nota del resultado de una ronda. Un `FARTHEST` con `tiedIds` es un empate resuelto a la fuerza en el tope
 * de desempates (`MAX_TIEBREAK_DEPTH`): se explica el criterio y el eliminado lleva solo «Eliminado».
 */
export function distanceRoundOutcome(round: Pick<PokedexDistancePublicState['lastRound'] & object, 'reason' | 'eliminatedIds' | 'tiedIds'>): DistanceRoundOutcome {
  const forcedTie = round.reason === 'FARTHEST' && round.tiedIds.length > 0;
  const title = round.reason === 'TIE' ? '⚔️ Empate en la peor distancia'
    : forcedTie ? '⚔️ Empate tras 3 desempates'
      : round.reason === 'NO_RESPONSE' ? '⏱️ Tiempo agotado' : '📏 Distancias calculadas';
  const note = round.reason === 'TIE' ? 'Solo los jugadores empatados jugarán la ronda de desempate.'
    : forcedTie ? 'Cae quien eligió último; si eligieron a la vez, caen todos.' : null;
  return {
    title,
    note,
    showTiedChip: (playerId) => round.tiedIds.includes(playerId) && !(forcedTie && round.eliminatedIds.includes(playerId)),
  };
}

/** Cuántos de los que juegan la ronda ya han elegido (solo `selectedIds`: nunca qué). */
export function distancePickedCountText(selected: number, eligible: number): string {
  return `${selected} de ${eligible} ${selected === 1 ? 'ha' : 'han'} elegido`;
}
