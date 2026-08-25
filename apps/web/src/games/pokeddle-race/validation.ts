import { POKEDDLE_CLUE_KEYS, type PokeddleRaceConfig } from '@pokemon-universe/shared';

export function validatePokeddleConfig(config: unknown): string | null {
  const value = config as Partial<PokeddleRaceConfig>;
  return value.clues && POKEDDLE_CLUE_KEYS.some((key) => value.clues?.[key]) ? null : 'Selecciona al menos una pista.';
}
