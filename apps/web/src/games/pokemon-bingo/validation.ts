import { BINGO_FAMILY_KEYS, type BingoFamilyKey, type PokemonBingoConfig } from '@pokemon-universe/shared';

export const bingoFamilyLabels: Record<BingoFamilyKey, string> = { generation: 'Generación', dexNumber: 'Número Pokédex', type: 'Tipo', typeCombination: 'Combinación exacta', typeCount: 'Monotipo / doble tipo', hp: 'HP', attack: 'Ataque', defense: 'Defensa', specialAttack: 'At. Especial', specialDefense: 'Def. Especial', speed: 'Velocidad', baseStatTotal: 'Total stats', height: 'Altura', weight: 'Peso', evolutionStage: 'Estado evolutivo', legendaryStatus: 'Legendario / Mítico', color: 'Color oficial', abilities: 'Habilidades' };
const singleFamilyCapacity: Partial<Record<BingoFamilyKey, number>> = { generation: 9, dexNumber: 11, type: 18, typeCount: 2, hp: 6, attack: 6, defense: 6, specialAttack: 6, specialDefense: 6, speed: 6, baseStatTotal: 6, height: 6, weight: 6, evolutionStage: 4, legendaryStatus: 3, color: 10 };

export function validatePokemonBingoConfig(config: unknown): string | null {
  const value = config as Partial<PokemonBingoConfig>; if (!value.families) return 'Selecciona al menos una familia de condiciones.';
  const active = BINGO_FAMILY_KEYS.filter((key) => value.families?.[key]); if (!active.length) return 'Selecciona al menos una familia de condiciones.';
  if (active.length === 1 && value.width && value.height) {
    const family = active[0]!; const capacity = family === 'generation' ? value.generations?.length ?? 0 : singleFamilyCapacity[family];
    if (capacity !== undefined && value.width * value.height > capacity) return `No hay suficientes condiciones distintas de “${bingoFamilyLabels[family]}” para un tablero ${value.width}×${value.height}.`;
  }
  return null;
}
