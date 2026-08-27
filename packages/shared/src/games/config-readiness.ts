import { BINGO_FAMILY_KEYS, type BingoFamilyKey } from './pokemon-bingo/config.js';
import { POKEDDLE_CLUE_KEYS } from './pokeddle-race/config.js';

export interface GameConfigReadinessContext {
  hostCustomCategoryCount?: number;
  hostWouldYouRatherPromptCount?: number;
}

const bingoFamilyLabels: Record<BingoFamilyKey, string> = {
  generation: 'Generación',
  dexNumber: 'Número Pokédex',
  type: 'Tipo',
  typeCombination: 'Combinación exacta',
  typeCount: 'Monotipo / doble tipo',
  hp: 'HP',
  attack: 'Ataque',
  defense: 'Defensa',
  specialAttack: 'At. Especial',
  specialDefense: 'Def. Especial',
  speed: 'Velocidad',
  baseStatTotal: 'Total stats',
  height: 'Altura',
  weight: 'Peso',
  evolutionStage: 'Estado evolutivo',
  legendaryStatus: 'Legendario / Mítico',
  color: 'Color oficial',
  abilities: 'Habilidades',
};

const singleBingoFamilyCapacity: Partial<Record<BingoFamilyKey, number>> = {
  generation: 9,
  dexNumber: 11,
  type: 18,
  typeCount: 2,
  hp: 6,
  attack: 6,
  defense: 6,
  specialAttack: 6,
  specialDefense: 6,
  speed: 6,
  baseStatTotal: 6,
  height: 6,
  weight: 6,
  evolutionStage: 4,
  legendaryStatus: 3,
  color: 10,
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Validates lobby requirements that cannot be represented by a game's Zod schema alone. */
export function validateGameConfigReadiness(
  gameId: string,
  config: unknown,
  context: GameConfigReadinessContext = {},
): string | null {
  const value = record(config);
  if (gameId === 'pokeddle-race') {
    const clues = record(value.clues);
    if (!POKEDDLE_CLUE_KEYS.some((key) => clues[key] === true)) return 'Selecciona al menos una pista.';
  }
  if (gameId === 'pokemon-bingo') {
    const families = record(value.families);
    const active = BINGO_FAMILY_KEYS.filter((key) => families[key] === true);
    if (active.length === 0) return 'Selecciona al menos una familia de condiciones.';
    const width = typeof value.width === 'number' ? value.width : 0;
    const height = typeof value.height === 'number' ? value.height : 0;
    if (active.length === 1 && width > 0 && height > 0) {
      const family = active[0]!;
      const capacity = family === 'generation'
        ? (Array.isArray(value.generations) ? value.generations.length : 0)
        : singleBingoFamilyCapacity[family];
      if (capacity !== undefined && width * height > capacity) {
        return `No hay suficientes condiciones distintas de “${bingoFamilyLabels[family]}” para un tablero ${width}×${height}.`;
      }
    }
  }
  if (gameId === 'one-of-us-is-fake' && value.categorySource === 'CUSTOM' && (context.hostCustomCategoryCount ?? 0) < 2) {
    return `El host necesita al menos 2 categorías personales activas; ahora hay ${context.hostCustomCategoryCount ?? 0}.`;
  }
  if ((gameId === 'secret-ranking' || gameId === 'most-likely-to') && value.promptSource === 'CUSTOM' && (context.hostCustomCategoryCount ?? 0) < 1) {
    return 'El host necesita al menos una pregunta personal activa para usar solo preguntas personalizadas.';
  }
  if (gameId === 'would-you-rather' && value.promptSource === 'CUSTOM' && (context.hostWouldYouRatherPromptCount ?? 0) < 1) {
    return 'El host necesita al menos un dilema personal activo para usar solo dilemas personalizados.';
  }
  return null;
}
