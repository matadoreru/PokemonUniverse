export interface LocalizedText { [locale: string]: string }

export interface Pokemon {
  id: string;
  nationalDexNumber: number;
  name: string;
  generation: number;
  sprite: string;
  names?: LocalizedText;
  types?: string[];
}

export interface PokemonCatalog {
  all(): readonly Pokemon[];
  byId(id: string): Pokemon | undefined;
  byDexNumber(number: number): Pokemon | undefined;
  forGenerations(generations: readonly number[]): readonly Pokemon[];
}

export const GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type Generation = (typeof GENERATIONS)[number];
