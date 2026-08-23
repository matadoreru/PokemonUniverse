export interface LocalizedText { [locale: string]: string }

export const POKEMON_TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'] as const;
export type PokemonType = (typeof POKEMON_TYPES)[number];
export const MOVE_CATEGORIES = ['physical', 'special', 'status'] as const;
export type MoveCategory = (typeof MOVE_CATEGORIES)[number];

export interface Move {
  id: string;
  name: string;
  type: PokemonType;
  category: MoveCategory;
  names?: LocalizedText;
}

export interface LevelUpMove {
  moveId: string;
  level: number;
}

export interface ResolvedLevelUpMove extends LevelUpMove {
  move: Move;
}

export interface PokemonEvolutionInfo {
  stage: number;
  stages: number;
}

export const GENERATION_LEARNSET_SOURCES = {
  1: { versionGroup: 'yellow', label: 'Pokémon Yellow' },
  2: { versionGroup: 'crystal', label: 'Pokémon Crystal' },
  3: { versionGroup: 'emerald', label: 'Pokémon Emerald' },
  4: { versionGroup: 'heartgold-soulsilver', label: 'Pokémon HeartGold / SoulSilver' },
  5: { versionGroup: 'black-2-white-2', label: 'Pokémon Black 2 / White 2' },
  6: { versionGroup: 'omega-ruby-alpha-sapphire', label: 'Pokémon Omega Ruby / Alpha Sapphire' },
  7: { versionGroup: 'ultra-sun-ultra-moon', label: 'Pokémon Ultra Sun / Ultra Moon' },
  8: { versionGroup: 'sword-shield', label: 'Pokémon Sword / Shield' },
  9: { versionGroup: 'scarlet-violet', label: 'Pokémon Scarlet / Violet' },
} as const;

export interface Pokemon {
  id: string;
  nationalDexNumber: number;
  name: string;
  generation: number;
  /** False for regional/battle variants that share a National Pokédex number. */
  isDefault?: boolean;
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
  forGenerations(generations: readonly number[], options?: { includeForms?: boolean }): readonly Pokemon[];
}

export interface LearnsetPokemonCatalog extends PokemonCatalog {
  levelUpMoves(pokemonId: string, referenceGeneration: Generation): readonly ResolvedLevelUpMove[];
  evolutionInfo(pokemonId: string): PokemonEvolutionInfo | undefined;
}

export function isLearnsetPokemonCatalog(catalog: PokemonCatalog): catalog is LearnsetPokemonCatalog {
  const candidate = catalog as Partial<LearnsetPokemonCatalog>;
  return typeof candidate.levelUpMoves === 'function' && typeof candidate.evolutionInfo === 'function';
}

export const GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type Generation = (typeof GENERATIONS)[number];
