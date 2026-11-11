/** Textos con número y concordancia que repiten las pantallas: «1 ronda», «3 rondas», «Ana, Eru y Leo». */

/** «1 acierto», «2 aciertos», «0 aciertos»: el número y la forma que le toca. */
export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** «1 segundo», «30 segundos». */
export const secondsLabel = (seconds: number) => plural(seconds, 'segundo', 'segundos');

/** «1 ronda», «5 rondas». */
export const roundsLabel = (rounds: number) => plural(rounds, 'ronda', 'rondas');

/** «Ana», «Ana y Eru», «Ana, Eru y Leo» (lista vacía: ''). */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
}
