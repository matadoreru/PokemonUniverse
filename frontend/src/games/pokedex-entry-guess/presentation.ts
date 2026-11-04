import type { PokedexEntryGuessHint, PokemonLegendaryStatus } from '@pokemon-universe/shared/public';
import { pokemonTypeLabels } from '../../components/pokemon-type-labels';

const categoryLabels: Record<PokemonLegendaryStatus, string> = { NORMAL: 'No legendario', LEGENDARY: 'Legendario', MYTHICAL: 'Mítico' };

/** Texto de una pista adicional de Pokédex Entry Guess (los de siempre). */
export function describePokedexEntryHint(hint: PokedexEntryGuessHint): string {
  if (hint.kind === 'GENERATION') return `Generación ${hint.value}`;
  if (hint.kind === 'TYPE') return `Tipo ${pokemonTypeLabels[hint.value]}`;
  if (hint.kind === 'TYPE_COUNT') return hint.value === 1 ? 'Monotipo' : 'Dos tipos';
  if (hint.kind === 'CATEGORY') return categoryLabels[hint.value];
  if (hint.stages <= 1) return 'No evoluciona';
  if (hint.stage <= 1) return 'Pokémon base';
  if (hint.stage >= hint.stages) return 'Evolución final';
  return 'Evolución intermedia';
}

/** Marca con la que el servidor tapa el nombre en la entrada (`sanitizePokedexEntry`). */
export const ENTRY_MASK = '???';

/** La entrada en trozos: texto y huecos donde iba el nombre (se pintan como una tira tapada, con «???» en texto). */
export function entrySegments(text: string): Array<{ masked: boolean; text: string }> {
  const parts = text.split(ENTRY_MASK);
  return parts.flatMap((part, index) => [
    ...(index > 0 ? [{ masked: true, text: ENTRY_MASK }] : []),
    ...(part ? [{ masked: false, text: part }] : []),
  ]);
}

/**
 * Mayor tamaño de letra (entero, entre `min` y `max`) con el que el texto cabe en su caja sin desplazarse: búsqueda
 * binaria sobre `fits(px)`. Si ni el mínimo cabe, el mínimo (la caja se desplaza por dentro).
 */
export function fitFontSize(fits: (px: number) => boolean, min: number, max: number): number {
  let lo = min; let hi = Math.max(min, max);
  if (!fits(lo)) return min;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid; else hi = mid - 1;
  }
  return lo;
}
