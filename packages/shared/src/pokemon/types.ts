export interface LocalizedText { [locale: string]: string }

export const POKEMON_TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'] as const;
export type PokemonType = (typeof POKEMON_TYPES)[number];

export interface Pokemon {
  id: string;
  nationalDexNumber: number;
  name: string;
  generation: number;
  sprite: string;
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  baseStatTotal: number;
  names?: LocalizedText;
  types: PokemonType[];
}

export interface PokemonCatalog {
  all(): readonly Pokemon[];
  byId(id: string): Pokemon | undefined;
  byDexNumber(number: number): Pokemon | undefined;
  forGenerations(generations: readonly number[]): readonly Pokemon[];
}

export const GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type Generation = (typeof GENERATIONS)[number];
