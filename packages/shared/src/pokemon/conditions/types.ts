import type { PokemonLegendaryStatus, PokemonType } from '../types.js';

export const BINGO_FAMILY_KEYS = [
  'generation', 'dexNumber', 'type', 'typeCombination', 'typeCount',
  'hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed', 'baseStatTotal',
  'height', 'weight', 'evolutionStage', 'legendaryStatus', 'color', 'abilities',
] as const;
export type BingoFamilyKey = (typeof BINGO_FAMILY_KEYS)[number];

export type BingoComparisonOperator = 'GT' | 'LT';
export type BingoStatKey = 'hp' | 'attack' | 'defense' | 'specialAttack' | 'specialDefense' | 'speed' | 'baseStatTotal';
export type BingoEvolutionStatus = 'BASE' | 'MIDDLE' | 'FINAL' | 'NONE';
export type BingoCondition =
  | { kind: 'GENERATION'; generation: number }
  | { kind: 'DEX'; operator: BingoComparisonOperator | 'RANGE'; value: number; max?: number }
  | { kind: 'TYPE'; pokemonType: PokemonType }
  | { kind: 'TYPE_COMBINATION'; pokemonTypes: [PokemonType, PokemonType] }
  | { kind: 'TYPE_COUNT'; count: 1 | 2 }
  | { kind: 'STAT'; stat: BingoStatKey; operator: BingoComparisonOperator; value: number }
  | { kind: 'PHYSICAL'; metric: 'heightDecimeters' | 'weightHectograms'; operator: BingoComparisonOperator; value: number }
  | { kind: 'EVOLUTION'; status: BingoEvolutionStatus }
  | { kind: 'LEGENDARY'; status: PokemonLegendaryStatus }
  | { kind: 'COLOR'; color: string }
  | { kind: 'ABILITY'; ability: string };

export interface BingoCell { id: string; conditions: BingoCondition[] }
export interface ConditionGenerationOptions {
  generations: readonly number[];
  families: Record<BingoFamilyKey, boolean>;
  maxConditions: 1 | 2;
  combinationLimit: number;
}
