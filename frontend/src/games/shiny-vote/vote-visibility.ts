import type { ShinyVoteVisibility } from '@pokemon-universe/shared/public';

/** Título del grupo de visibilidad en el panel de configuración. */
export const SHINY_VOTE_VISIBILITY_LABEL = 'Votos de otros jugadores';

/** Botones del panel de configuración para cada modo de visibilidad. */
export const shinyVisibilityLabels: Record<ShinyVoteVisibility, string> = { REVEAL: 'Al revelar', LIVE: 'En directo' };

/** Si se pintan los votantes de cada opción: en directo siempre, al revelar solo tras cerrarse la ronda. */
export function shinyVotersVisible(visibility: ShinyVoteVisibility, revealed: boolean): boolean {
  return visibility === 'LIVE' || revealed;
}

/** Chip de la cabecera de la partida con el modo de visibilidad. */
export function shinyVisibilityChip(visibility: ShinyVoteVisibility): string {
  return visibility === 'LIVE' ? 'Votos en directo' : 'Votos al revelar';
}
