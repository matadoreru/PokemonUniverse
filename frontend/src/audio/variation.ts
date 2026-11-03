/**
 * Variación determinista de los efectos (spec §8), portada de Inazuma: cada disparo recibe un
 * pequeño desvío de tono y de ganancia derivado de una semilla (un contador), nunca de
 * `Math.random`, para que la misma secuencia de disparos suene siempre igual.
 */

/** Mezcla de 32 bits (xorshift-multiply) de varios enteros. */
export function hash32(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) {
    h ^= (p | 0) + 0x7f4a7c15;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/** Generador lineal congruente: secuencia reproducible en [0, 1). */
export class Lcg {
  private s: number;
  constructor(seed: number) {
    this.s = (seed >>> 0) || 1;
  }
  next(): number {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
}

export interface Variation {
  /** Desvío de tono en cents, en [−cents, +cents]. */
  cents: number;
  /** Multiplicador de ganancia, en [1 − gain, 1 + gain]. */
  gain: number;
}

/** Variación de un disparo a partir de su semilla y de los rangos de `sfx.json → variation`. */
export function variationFor(seed: number, range: { cents: number; gain: number }): Variation {
  const r = new Lcg(hash32(seed));
  return { cents: (r.next() * 2 - 1) * range.cents, gain: 1 + (r.next() * 2 - 1) * range.gain };
}
