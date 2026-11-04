/** Récord de la partida: el mejor valor y quién lo logró (con empate, todos). */
export interface ShinyRecord {
  value: number;
  names: string[];
}

type Stats = Readonly<Record<string, number | undefined>>;

/** Mejor valor de una estadística de la clasificación; `null` si nadie pasó de cero. */
function best(entries: readonly { name: string; stats: Stats }[], key: string): ShinyRecord | null {
  const value = Math.max(0, ...entries.map((entry) => entry.stats[key] ?? 0));
  if (value <= 0) return null;
  return { value, names: entries.filter((entry) => (entry.stats[key] ?? 0) === value).map((entry) => entry.name) };
}

/** Récords de Shiny Quiz a partir de la clasificación pública: más aciertos y mejor precisión. */
export function shinyRecords(entries: readonly { name: string; stats: Stats }[]): { correct: ShinyRecord | null; accuracy: ShinyRecord | null } {
  return { correct: best(entries, 'correctVotes'), accuracy: best(entries, 'accuracy') };
}
