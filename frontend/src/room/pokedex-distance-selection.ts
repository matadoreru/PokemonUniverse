import type { PokedexDistancePublicState, PokedexDistanceSelectionVisibility } from '@pokemon-universe/shared/public';

/** Título del grupo de visibilidad en el panel de configuración. */
export const DISTANCE_SELECTION_VISIBILITY_LABEL = 'Elecciones de los rivales';

/** Botones del panel de configuración para cada modo de visibilidad. */
export const distanceSelectionVisibilityLabels: Record<PokedexDistanceSelectionVisibility, string> = { HIDDEN: 'Ocultas', LIVE: 'Visibles' };

/** Cut-in y tarjeta de quien acierta el número exacto del objetivo. */
export const DISTANCE_EXACT_HIT_TITLE = '¡Acierto exacto!';

/**
 * ¿Toca confeti? Al revelar la ronda, si la elección propia es exactamente el objetivo (distancia 0). Solo con la
 * ronda ya resuelta (`ROUND_RESULTS` y su `lastRound`).
 */
export function distanceExactAtReveal(game: Pick<PokedexDistancePublicState, 'phase' | 'lastRound'>, selfId: string): boolean {
  return game.phase === 'ROUND_RESULTS' && game.lastRound?.selections[selfId]?.distance === 0;
}

/** Estado de un jugador que ya ha elegido cuando las elecciones de los rivales están ocultas. */
export const DISTANCE_HIDDEN_PICKED_LABEL = '✓ Ya ha elegido';

export type DistanceMemberStatus =
  | { kind: 'picked'; pokemonName: string; sprite: string }
  | { kind: 'hidden-picked' }
  | { kind: 'picking' }
  /** Sigue en la partida pero no juega esta ronda de desempate. */
  | { kind: 'waiting' }
  /** Entró con la partida empezada: la observa. */
  | { kind: 'watching' }
  /** Cayó en una ronda anterior. */
  | { kind: 'out' };

/** Texto del estado de un jugador en la lista de la ronda (el de `hidden-picked` lo buscan las E2E). */
export const distanceMemberStatusLabels: Record<Exclude<DistanceMemberStatus['kind'], 'picked'>, string> = {
  'hidden-picked': DISTANCE_HIDDEN_PICKED_LABEL,
  picking: 'seleccionando…',
  waiting: 'Espera el desempate',
  watching: 'Observando',
  out: 'Eliminado',
};

/**
 * Qué se sabe de la elección de un jugador en la ronda en curso: el Pokémon si la proyección lo publica (`LIVE`),
 * solo que ya ha elegido si está oculta (`HIDDEN`, por `selectedIds`), que aún está eligiendo o, si no juega la ronda,
 * por qué (espera el desempate, observa o ya cayó).
 */
export function distanceMemberStatus(game: PokedexDistancePublicState, memberId: string): DistanceMemberStatus {
  const selection = game.selections[memberId];
  if (selection) return { kind: 'picked', pokemonName: selection.pokemonName, sprite: selection.sprite };
  if (game.selectedIds.includes(memberId)) return { kind: 'hidden-picked' };
  if (game.eligibleIds.includes(memberId)) return { kind: 'picking' };
  if (game.survivorIds.includes(memberId)) return { kind: 'waiting' };
  if (game.spectatorIds.includes(memberId)) return { kind: 'watching' };
  return { kind: 'out' };
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

/** Franja de un jugador en los resultados de la ronda. */
export interface DistanceRoundRow {
  playerId: string;
  /** `null`: no respondió. */
  distance: number | null;
  eliminated: boolean;
  /** Lleva la etiqueta «Empate» (como `showTiedChip`). */
  tied: boolean;
  exact: boolean;
}

/**
 * Franjas del resultado de una ronda, de la más cercana a la más lejana y, al final, quien no respondió; con la misma
 * distancia mantiene el orden de la ronda. Solo usa la ronda ya resuelta (`lastRound`).
 */
export function distanceRoundRows(round: Pick<PokedexDistancePublicState['lastRound'] & object, 'eligibleIds' | 'selections' | 'reason' | 'eliminatedIds' | 'tiedIds'>): DistanceRoundRow[] {
  const outcome = distanceRoundOutcome(round);
  const rows = round.eligibleIds.map((playerId) => {
    const distance = round.selections[playerId]?.distance ?? null;
    return { playerId, distance, eliminated: round.eliminatedIds.includes(playerId), tied: outcome.showTiedChip(playerId), exact: distance === 0 };
  });
  const key = (row: DistanceRoundRow) => row.distance ?? Number.POSITIVE_INFINITY;
  return rows.map((row, index) => ({ row, index })).sort((a, b) => key(a.row) - key(b.row) || a.index - b.index).map(({ row }) => row);
}

/**
 * Clave del foco de la pantalla (`useFocusOnTransition`): al bloquear la elección propia (el buscador se desmonta) y al
 * revelar la ronda, el foco va al título de la placa inferior. `null` mientras se elige o sin nada que enfocar.
 */
export function distanceFocusKey(phase: PokedexDistancePublicState['phase'], roundKey: string, hasSelection: boolean): string | null {
  if (phase === 'ROUND_RESULTS') return `reveal:${roundKey}`;
  const active = phase === 'ROUND_ACTIVE' || phase === 'TIEBREAKER_ACTIVE';
  return active && hasSelection ? `locked:${roundKey}` : null;
}

/**
 * Texto de la región `role="status"` de la pantalla: la ronda que empieza, la elección propia bloqueada o el veredicto
 * de la ronda (con la distancia propia). Con otras palabras que la pantalla: no repite los textos que buscan las E2E.
 */
export function distanceAnnouncement({ phase, roundNumber, target, eligible, hasSelection, exactHit, ownPickName, lastRound, selfId }: {
  phase: PokedexDistancePublicState['phase'];
  roundNumber: number;
  /** Objetivo ya formateado (`#025`). */
  target: string;
  eligible: boolean;
  hasSelection: boolean;
  exactHit: boolean;
  ownPickName: string | null;
  lastRound: Pick<PokedexDistancePublicState['lastRound'] & object, 'eligibleIds' | 'selections' | 'reason' | 'eliminatedIds' | 'tiedIds'> | null;
  selfId: string;
}): string {
  if (phase === 'ROUND_RESULTS' && lastRound) {
    const outcome = distanceRoundOutcome(lastRound);
    // La regla con otras palabras que la nota de la placa (`outcome.note`), que las E2E buscan como texto.
    const rule = lastRound.reason === 'TIE' ? 'Los empatados juegan un desempate.'
      : outcome.note ? 'Sin más desempates: cae quien eligió más tarde.' : 'Cae el más alejado del objetivo.';
    const verdict = `Ronda ${roundNumber} revelada: ${outcome.title}. ${rule}`;
    if (!lastRound.eligibleIds.includes(selfId)) return verdict;
    const distance = lastRound.selections[selfId]?.distance;
    const own = distance === undefined ? 'No elegiste a tiempo.' : `Te quedaste a ${distance}.`;
    return `${verdict} ${own}${lastRound.eliminatedIds.includes(selfId) ? ' Quedas fuera de la partida.' : ''}`;
  }
  const active = phase === 'ROUND_ACTIVE' || phase === 'TIEBREAKER_ACTIVE';
  if (!active || !eligible) return '';
  if (exactHit) return `Distancia 0 con ${ownPickName ?? 'tu Pokémon'}: es el objetivo ${target}.`;
  if (hasSelection) return `${ownPickName ? `Has elegido ${ownPickName}` : 'Has elegido'}: tu elección queda bloqueada hasta la revelación.`;
  return `Ronda ${roundNumber}: busca el Pokémon más cercano al objetivo ${target}.`;
}
