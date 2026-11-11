import { LEGENDARY_STATUS_LABELS, POKEMON_TYPE_LABELS } from '../labels.js';
import type { BingoCondition, BingoEvolutionStatus, BingoStatKey } from './types.js';

const statLabels: Record<BingoStatKey, string> = { hp: 'HP', attack: 'Ataque', defense: 'Defensa', specialAttack: 'At. Especial', specialDefense: 'Def. Especial', speed: 'Velocidad', baseStatTotal: 'Total stats' };

export function bingoWords(value: string): string { return value.split('-').map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' '); }

export function describeBingoCondition(condition: BingoCondition): string {
  if (condition.kind === 'GENERATION') return `Generación ${condition.generation}`;
  if (condition.kind === 'DEX') return condition.operator === 'RANGE' ? `Pokédex ${condition.value}–${condition.max}` : `Pokédex ${condition.operator === 'GT' ? '>' : '<'} ${condition.value}`;
  if (condition.kind === 'TYPE') return `Tipo ${POKEMON_TYPE_LABELS[condition.pokemonType]}`;
  if (condition.kind === 'TYPE_COMBINATION') return condition.pokemonTypes.map((type) => POKEMON_TYPE_LABELS[type]).join(' + ');
  if (condition.kind === 'TYPE_COUNT') return condition.count === 1 ? 'Monotipo' : 'Doble tipo';
  if (condition.kind === 'STAT') return `${statLabels[condition.stat]} ${condition.operator === 'GT' ? '>' : '<'} ${condition.value}`;
  if (condition.kind === 'PHYSICAL') {
    const divisor = 10; const unit = condition.metric === 'heightDecimeters' ? 'm' : 'kg'; const label = condition.metric === 'heightDecimeters' ? 'Altura' : 'Peso';
    return `${label} ${condition.operator === 'GT' ? '>' : '<'} ${(condition.value / divisor).toLocaleString('es-ES')} ${unit}`;
  }
  if (condition.kind === 'EVOLUTION') return ({ BASE: 'Pokémon base', MIDDLE: 'Evolución intermedia', FINAL: 'Evolución final', NONE: 'No evoluciona' } as Record<BingoEvolutionStatus, string>)[condition.status];
  if (condition.kind === 'LEGENDARY') return LEGENDARY_STATUS_LABELS[condition.status];
  if (condition.kind === 'COLOR') return `Color principal: ${bingoWords(condition.color)}`;
  return `Puede tener ${bingoWords(condition.ability)}`;
}
