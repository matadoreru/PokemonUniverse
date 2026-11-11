/**
 * Color de cada jugador (banda de su franja, «+N»): sale de los tokens por su orden de llegada a la sala
 * (`room.members`), así es el mismo en la lista de jugadores, el marcador y los resultados. Nunca va solo: el nombre
 * acompaña siempre.
 */
export const PLAYER_COLORS = [
  'var(--info)',
  'var(--yellow)',
  'var(--ok)',
  'var(--red)',
  'var(--orange)',
  'var(--blue-l)',
  'var(--type-psychic)',
  'var(--type-flying)',
] as const;

export function playerColor(index: number): string {
  const size = PLAYER_COLORS.length;
  return PLAYER_COLORS[((Math.trunc(index) % size) + size) % size]!;
}
