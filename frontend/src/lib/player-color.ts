/**
 * Color de cada jugador (banda de su franja, «+N»): sale de los tokens por su orden de llegada a la sala
 * (`room.members`), así es el mismo en la lista de jugadores, el marcador y los resultados. Nunca va solo: el nombre
 * acompaña siempre.
 *
 * Ninguno es un color de estado (acierto, fallo, aviso, información), para no confundirse con el resultado de una
 * respuesta; todos son claros y se ven sobre el azul noche de las bandas y los paneles. Los parecidos (los dos rosas,
 * el amarillo y el tierra) quedan lejos en el orden: los cinco primeros jugadores no comparten tono.
 */
export const PLAYER_COLORS = [
  'var(--blue-l)',
  'var(--yellow)',
  'var(--type-fairy)',
  'var(--type-ice)',
  'var(--orange)',
  'var(--type-flying)',
  'var(--type-ground)',
  'var(--type-psychic)',
] as const;

export function playerColor(index: number): string {
  const size = PLAYER_COLORS.length;
  return PLAYER_COLORS[((Math.trunc(index) % size) + size) % size]!;
}
