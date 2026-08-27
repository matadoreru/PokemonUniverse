import type { Pokemon } from '../../pokemon/types.js';
import { defaultPokemonBingoConfig } from '../pokemon-bingo/config.js';
import { buildBingoConditionTemplates } from '../pokemon-bingo/generator.js';
import { bingoCellKey, bingoWords, describeBingoCondition, pokemonMatchesBingoCell } from '../pokemon-bingo/rules.js';
import type { BingoCondition, BingoStatKey } from '../pokemon-bingo/types.js';
import type { BluffAuctionCondition, BluffAuctionCuratedCategory, BluffAuctionRule } from './types.js';

const curatedCategoryDexNumbers: Record<BluffAuctionCuratedCategory, ReadonlySet<number>> = {
  DOG: new Set([37, 38, 58, 59, 209, 210, 228, 229, 261, 262, 309, 310, 506, 507, 508, 676, 744, 745, 835, 836, 888, 889, 926, 927, 942, 943, 971, 972]),
  CAT: new Set([52, 53, 300, 301, 431, 432, 509, 510, 667, 668, 677, 678, 725, 726, 727, 906, 907, 908]),
  STARTER: new Set([1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501, 650, 653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912]),
  FOSSIL: new Set([138, 139, 140, 141, 142, 345, 346, 347, 348, 408, 409, 410, 411, 564, 565, 566, 567, 696, 697, 698, 699, 880, 881, 882, 883]),
  PSEUDO_LEGENDARY: new Set([149, 248, 373, 376, 445, 635, 706, 784, 887, 998]),
  ULTRA_BEAST: new Set([793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806]),
};

const curatedCategoryLabels: Record<BluffAuctionCuratedCategory, string> = {
  DOG: 'Inspirado claramente en un perro o cánido', CAT: 'Inspirado claramente en un gato o felino',
  STARTER: 'Pokémon inicial en su primera etapa', FOSSIL: 'Pokémon fósil',
  PSEUDO_LEGENDARY: 'Pseudolegendario completamente evolucionado', ULTRA_BEAST: 'Ultraente',
};

const statLabels: Record<BingoStatKey, string> = {
  hp: 'PS', attack: 'Ataque', defense: 'Defensa', specialAttack: 'Ataque especial',
  specialDefense: 'Defensa especial', speed: 'Velocidad', baseStatTotal: 'BST',
};

function describeCondition(condition: BluffAuctionRule): string {
  if (condition.kind === 'CURATED_CATEGORY') return curatedCategoryLabels[condition.category];
  if (condition.kind === 'STAT') {
    if (condition.operator === 'GT' && condition.value === 99) return `${statLabels[condition.stat]} ≥ 100`;
    return `${statLabels[condition.stat]} ${condition.operator === 'GT' ? '>' : '<'} ${condition.value}`;
  }
  if (condition.kind === 'ABILITY') return `Tiene la habilidad ${bingoWords(condition.ability)}`;
  return describeBingoCondition(condition);
}

export function describeBluffAuctionConditions(conditions: readonly BluffAuctionRule[]): { description: string; clauses: string[] } {
  const clauses = conditions.map(describeCondition);
  return { description: clauses.join(' + '), clauses };
}

export function pokemonMatchesBluffAuctionCondition(pokemon: Pokemon, condition: { conditions: readonly BluffAuctionRule[] }): boolean {
  return condition.conditions.every((rule) => rule.kind === 'CURATED_CATEGORY'
    ? curatedCategoryDexNumbers[rule.category].has(pokemon.nationalDexNumber)
    : pokemonMatchesBingoCell(pokemon, { conditions: [rule] }));
}

function bluffConditionKey(conditions: readonly BluffAuctionRule[]): string {
  const curated = conditions.find((condition) => condition.kind === 'CURATED_CATEGORY');
  return curated?.kind === 'CURATED_CATEGORY' ? `CURATED:${curated.category}` : bingoCellKey({ conditions: conditions as BingoCondition[] });
}

export function buildBluffAuctionConditions(pool: readonly Pokemon[], generations: readonly number[], random: () => number): Array<BluffAuctionCondition & { candidatePokemonIds: string[] }> {
  const bingoTemplates = buildBingoConditionTemplates(pool, {
    ...defaultPokemonBingoConfig,
    generations: [...generations],
    width: 2,
    height: 2,
    maxConditionsPerCell: 2,
    families: {
      generation: true, dexNumber: true, type: true, typeCombination: true, typeCount: true,
      hp: true, attack: true, defense: true, specialAttack: true, specialDefense: true, speed: true,
      baseStatTotal: true, height: pool.every((pokemon) => (pokemon.heightDecimeters ?? 0) > 0),
      weight: pool.every((pokemon) => (pokemon.weightHectograms ?? 0) > 0),
      evolutionStage: pool.every((pokemon) => Boolean(pokemon.evolutionStage && pokemon.evolutionStageCount)),
      legendaryStatus: pool.some((pokemon) => pokemon.legendaryStatus === 'LEGENDARY' || pokemon.legendaryStatus === 'MYTHICAL'),
      color: false, abilities: pool.some((pokemon) => (pokemon.abilities?.length ?? 0) > 0),
    },
  }, random);
  const byKey = new Map<string, { conditions: BluffAuctionRule[]; key: string; candidatePokemonIds: string[]; difficulty: string }>(
    bingoTemplates.map((template) => [template.key, { ...template, conditions: [...template.conditions] }]),
  );
  const curated: BingoCondition[][] = [
    [{ kind: 'STAT', stat: 'baseStatTotal', operator: 'GT', value: 500 }],
    [{ kind: 'STAT', stat: 'speed', operator: 'GT', value: 99 }],
    [{ kind: 'STAT', stat: 'attack', operator: 'LT', value: 60 }],
    [{ kind: 'DEX', operator: 'LT', value: 151 }],
    [{ kind: 'TYPE_COUNT', count: 1 }], [{ kind: 'TYPE_COUNT', count: 2 }],
    [{ kind: 'EVOLUTION', status: 'FINAL' }],
    [{ kind: 'LEGENDARY', status: 'LEGENDARY' }], [{ kind: 'LEGENDARY', status: 'MYTHICAL' }],
    [{ kind: 'TYPE', pokemonType: 'water' }, { kind: 'STAT', stat: 'speed', operator: 'GT', value: 80 }],
    [{ kind: 'GENERATION', generation: 3 }, { kind: 'STAT', stat: 'baseStatTotal', operator: 'GT', value: 500 }],
    [{ kind: 'TYPE', pokemonType: 'fire' }, { kind: 'STAT', stat: 'attack', operator: 'GT', value: 99 }],
  ];
  if (pool.every((pokemon) => (pokemon.weightHectograms ?? 0) > 0)) curated.push([{ kind: 'PHYSICAL', metric: 'weightHectograms', operator: 'GT', value: 2_000 }]);
  if (pool.every((pokemon) => (pokemon.heightDecimeters ?? 0) > 0)) curated.push([{ kind: 'PHYSICAL', metric: 'heightDecimeters', operator: 'LT', value: 10 }]);
  for (const conditions of curated) {
    const key = bingoCellKey({ conditions });
    const candidatePokemonIds = pool.filter((pokemon) => pokemonMatchesBingoCell(pokemon, { conditions })).map((pokemon) => pokemon.id);
    if (candidatePokemonIds.length > 0) byKey.set(key, { conditions, key, candidatePokemonIds, difficulty: 'HARD' });
  }
  for (const category of Object.keys(curatedCategoryDexNumbers) as BluffAuctionCuratedCategory[]) {
    const conditions: BluffAuctionRule[] = [{ kind: 'CURATED_CATEGORY', category }];
    const key = `CURATED:${category}`;
    const candidatePokemonIds = pool.filter((pokemon) => pokemonMatchesBluffAuctionCondition(pokemon, { conditions })).map((pokemon) => pokemon.id);
    if (candidatePokemonIds.length >= 3) byKey.set(key, { conditions, key, candidatePokemonIds, difficulty: 'HARD' });
  }
  const singles = bingoTemplates.filter((template) => template.conditions.length === 1);
  const typeConditions = singles.filter((template) => template.conditions[0]?.kind === 'TYPE');
  const statConditions = singles.filter((template) => template.conditions[0]?.kind === 'STAT' && ['attack', 'speed', 'baseStatTotal'].includes(template.conditions[0].stat));
  const generationConditions = singles.filter((template) => template.conditions[0]?.kind === 'GENERATION');
  const combinedPairs = [
    ...typeConditions.flatMap((type) => statConditions.map((stat) => [type.conditions[0]!, stat.conditions[0]!] as BingoCondition[])),
    ...generationConditions.flatMap((generation) => statConditions.filter((stat) => stat.conditions[0]?.kind === 'STAT' && stat.conditions[0].stat === 'baseStatTotal').map((stat) => [generation.conditions[0]!, stat.conditions[0]!] as BingoCondition[])),
  ];
  for (const conditions of combinedPairs) {
    const key = bingoCellKey({ conditions }); if (byKey.has(key)) continue;
    const candidatePokemonIds = pool.filter((pokemon) => pokemonMatchesBingoCell(pokemon, { conditions })).map((pokemon) => pokemon.id);
    if (candidatePokemonIds.length > 0) byKey.set(key, { conditions, key, candidatePokemonIds, difficulty: 'HARD' });
  }
  const allTemplates = [...byKey.values()];
  const minimum = Math.min(pool.length, Math.max(3, Math.ceil(pool.length * .015)));
  const maximum = Math.max(minimum, Math.floor(pool.length * .48));
  const interesting = allTemplates.filter((template) => template.candidatePokemonIds.length >= minimum && template.candidatePokemonIds.length <= maximum);
  const source = interesting.length > 0 ? interesting : allTemplates.filter((template) => template.candidatePokemonIds.length > 0 && template.candidatePokemonIds.length < pool.length);
  return source.map((template) => ({
    key: bluffConditionKey(template.conditions), conditions: template.conditions,
    ...describeBluffAuctionConditions(template.conditions), candidatePokemonIds: template.candidatePokemonIds,
  }));
}
