import type { Pokemon } from '../../pokemon/types.js';
import type { BingoFamilyKey, PokemonBingoConfig } from './config.js';
import type { BingoCell, BingoCondition, BingoEvolutionStatus, BingoStatKey } from './types.js';

const typeLabels: Record<string, string> = {
  normal: 'Normal', fire: 'Fuego', water: 'Agua', electric: 'Eléctrico', grass: 'Planta', ice: 'Hielo', fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho', rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada',
};
const statLabels: Record<BingoStatKey, string> = { hp: 'HP', attack: 'Ataque', defense: 'Defensa', specialAttack: 'At. Especial', specialDefense: 'Def. Especial', speed: 'Velocidad', baseStatTotal: 'Total stats' };
const legendaryLabels = { NORMAL: 'No legendario', LEGENDARY: 'Legendario', MYTHICAL: 'Mítico' } as const;

export function bingoWords(value: string): string { return value.split('-').map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' '); }

export function bingoConditionFamily(condition: BingoCondition): BingoFamilyKey {
  if (condition.kind === 'GENERATION') return 'generation';
  if (condition.kind === 'DEX') return 'dexNumber';
  if (condition.kind === 'TYPE') return 'type';
  if (condition.kind === 'TYPE_COMBINATION') return 'typeCombination';
  if (condition.kind === 'TYPE_COUNT') return 'typeCount';
  if (condition.kind === 'STAT') return condition.stat;
  if (condition.kind === 'PHYSICAL') return condition.metric === 'heightDecimeters' ? 'height' : 'weight';
  if (condition.kind === 'EVOLUTION') return 'evolutionStage';
  if (condition.kind === 'LEGENDARY') return 'legendaryStatus';
  if (condition.kind === 'COLOR') return 'color';
  return 'abilities';
}

export function bingoConditionKey(condition: BingoCondition): string {
  if (condition.kind === 'GENERATION') return `GEN:${condition.generation}`;
  if (condition.kind === 'DEX') return `DEX:${condition.operator}:${condition.value}:${condition.max ?? ''}`;
  if (condition.kind === 'TYPE') return `TYPE:${condition.pokemonType}`;
  if (condition.kind === 'TYPE_COMBINATION') return `TYPES:${[...condition.pokemonTypes].sort().join('+')}`;
  if (condition.kind === 'TYPE_COUNT') return `TYPE_COUNT:${condition.count}`;
  if (condition.kind === 'STAT') return `STAT:${condition.stat}:${condition.operator}:${condition.value}`;
  if (condition.kind === 'PHYSICAL') return `PHYSICAL:${condition.metric}:${condition.operator}:${condition.value}`;
  if (condition.kind === 'EVOLUTION') return `EVOLUTION:${condition.status}`;
  if (condition.kind === 'LEGENDARY') return `LEGENDARY:${condition.status}`;
  if (condition.kind === 'COLOR') return `COLOR:${condition.color}`;
  return `ABILITY:${condition.ability}`;
}

export function bingoCellKey(cell: Pick<BingoCell, 'conditions'>): string {
  return cell.conditions.map(bingoConditionKey).sort().join('&');
}

export function describeBingoCondition(condition: BingoCondition): string {
  if (condition.kind === 'GENERATION') return `Generación ${condition.generation}`;
  if (condition.kind === 'DEX') return condition.operator === 'RANGE' ? `Pokédex ${condition.value}–${condition.max}` : `Pokédex ${condition.operator === 'GT' ? '>' : '<'} ${condition.value}`;
  if (condition.kind === 'TYPE') return `Tipo ${typeLabels[condition.pokemonType]}`;
  if (condition.kind === 'TYPE_COMBINATION') return condition.pokemonTypes.map((type) => typeLabels[type]).join(' + ');
  if (condition.kind === 'TYPE_COUNT') return condition.count === 1 ? 'Monotipo' : 'Doble tipo';
  if (condition.kind === 'STAT') return `${statLabels[condition.stat]} ${condition.operator === 'GT' ? '>' : '<'} ${condition.value}`;
  if (condition.kind === 'PHYSICAL') {
    const divisor = 10; const unit = condition.metric === 'heightDecimeters' ? 'm' : 'kg'; const label = condition.metric === 'heightDecimeters' ? 'Altura' : 'Peso';
    return `${label} ${condition.operator === 'GT' ? '>' : '<'} ${(condition.value / divisor).toLocaleString('es-ES')} ${unit}`;
  }
  if (condition.kind === 'EVOLUTION') return ({ BASE: 'Pokémon base', MIDDLE: 'Evolución intermedia', FINAL: 'Evolución final', NONE: 'No evoluciona' } as Record<BingoEvolutionStatus, string>)[condition.status];
  if (condition.kind === 'LEGENDARY') return legendaryLabels[condition.status];
  if (condition.kind === 'COLOR') return `Color principal: ${bingoWords(condition.color)}`;
  return `Puede tener ${bingoWords(condition.ability)}`;
}

function compare(value: number, operator: 'GT' | 'LT', threshold: number): boolean { return operator === 'GT' ? value > threshold : value < threshold; }

export function pokemonMatchesBingoCondition(pokemon: Pokemon, condition: BingoCondition): boolean {
  if (condition.kind === 'GENERATION') return pokemon.generation === condition.generation;
  if (condition.kind === 'DEX') return condition.operator === 'RANGE' ? pokemon.nationalDexNumber >= condition.value && pokemon.nationalDexNumber <= (condition.max ?? condition.value) : compare(pokemon.nationalDexNumber, condition.operator, condition.value);
  if (condition.kind === 'TYPE') return pokemon.types.includes(condition.pokemonType);
  if (condition.kind === 'TYPE_COMBINATION') {
    const expected = new Set(condition.pokemonTypes); return pokemon.types.length === 2 && pokemon.types.every((type) => expected.has(type));
  }
  if (condition.kind === 'TYPE_COUNT') return pokemon.types.length === condition.count;
  if (condition.kind === 'STAT') return compare(pokemon[condition.stat], condition.operator, condition.value);
  if (condition.kind === 'PHYSICAL') return compare(pokemon[condition.metric] ?? 0, condition.operator, condition.value);
  if (condition.kind === 'EVOLUTION') {
    const stage = pokemon.evolutionStage ?? 1; const stages = pokemon.evolutionStageCount ?? 1;
    return condition.status === 'NONE' ? stages === 1 : condition.status === 'BASE' ? stages > 1 && stage === 1 : condition.status === 'MIDDLE' ? stage > 1 && stage < stages : stages > 1 && stage === stages;
  }
  if (condition.kind === 'LEGENDARY') return (pokemon.legendaryStatus ?? 'NORMAL') === condition.status;
  if (condition.kind === 'COLOR') return pokemon.color === condition.color;
  return Boolean(pokemon.abilities?.includes(condition.ability));
}

export function pokemonMatchesBingoCell(pokemon: Pokemon, cell: Pick<BingoCell, 'conditions'>): boolean {
  return cell.conditions.every((condition) => pokemonMatchesBingoCondition(pokemon, condition));
}

export function hasCompleteBingoMetadata(pokemon: Pokemon, config: PokemonBingoConfig): boolean {
  const families = config.families;
  return (!families.height || (pokemon.heightDecimeters ?? 0) > 0)
    && (!families.weight || (pokemon.weightHectograms ?? 0) > 0)
    && (!families.evolutionStage || Boolean(pokemon.evolutionStage && pokemon.evolutionStageCount))
    && (!families.legendaryStatus || Boolean(pokemon.legendaryStatus))
    && (!families.color || Boolean(pokemon.color && pokemon.color !== 'unknown'))
    && (!families.abilities || Boolean(pokemon.abilities?.length));
}

