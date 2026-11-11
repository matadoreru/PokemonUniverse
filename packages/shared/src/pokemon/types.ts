export interface LocalizedText { [locale: string]: string }

export const POKEMON_TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'] as const;
export type PokemonType = (typeof POKEMON_TYPES)[number];
export const MOVE_CATEGORIES = ['physical', 'special', 'status'] as const;
export type MoveCategory = (typeof MOVE_CATEGORIES)[number];

export const POKEMON_LEGENDARY_STATUSES = ['NORMAL', 'LEGENDARY', 'MYTHICAL'] as const;
export type PokemonLegendaryStatus = (typeof POKEMON_LEGENDARY_STATUSES)[number];

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
  /** Persisted shiny sprite reference populated by DataSync, never derived by a game. */
  shinySprite?: string;
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  baseStatTotal: number;
  /** PokéAPI stores height in decimetres and weight in hectograms. */
  heightDecimeters?: number;
  weightHectograms?: number;
  evolutionStage?: number;
  evolutionStageCount?: number;
  legendaryStatus?: PokemonLegendaryStatus;
  /** Official species colour classification from PokéAPI, never sprite analysis. */
  color?: string;
  /** Dominant sprite colours extracted and persisted exclusively by DataSync. */
  palette?: readonly string[];
  /** Approximate visible share of each palette colour, normalized by DataSync. */
  paletteWeights?: readonly number[];
  /** Official Spanish names for normal and hidden abilities, intentionally kept together. */
  abilities?: string[];
  names?: LocalizedText;
  types: PokemonType[];
}

export const GENERATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type Generation = (typeof GENERATIONS)[number];
