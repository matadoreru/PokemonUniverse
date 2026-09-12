/** Pure Fisher–Yates. The injected random source returns a number in [0, 1). */
export function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.min(index, Math.floor(random() * (index + 1)));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

/** A finite deck, refilled without immediately repeating the preceding card. */
export function contentDeck<T>(pool: readonly T[], length: number, random: () => number, key: (item: T) => string): T[] {
  if (!Number.isInteger(length) || length < 0) throw new Error('Invalid deck length');
  if (length > 0 && pool.length === 0) throw new Error('Empty content pool');
  const result: T[] = [];
  while (result.length < length) {
    const batch = shuffled(pool, random);
    const previous = result.at(-1);
    if (previous && batch[0] && key(previous) === key(batch[0])) {
      const other = batch.findIndex((item) => key(item) !== key(previous));
      if (other > 0) [batch[0], batch[other]] = [batch[other]!, batch[0]!];
    }
    result.push(...batch.slice(0, length - result.length));
  }
  return result;
}
