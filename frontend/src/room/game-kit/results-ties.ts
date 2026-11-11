/**
 * ¿Comparte su puesto con otro? Lo usan los marcadores y las clasificaciones de varios juegos para el chip «Empate».
 * Con `withPoints`, un empate a cero (al empezar) no cuenta.
 */
export function sharesPosition(ranking: readonly { id: string; position: number }[], id: string, points: (id: string) => number, withPoints = false): boolean {
  const own = ranking.find((entry) => entry.id === id);
  if (!own || (withPoints && points(id) <= 0)) return false;
  return ranking.filter((entry) => entry.position === own.position).length > 1;
}
