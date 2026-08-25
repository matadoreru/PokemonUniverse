import type { ZoomedPokemonConfig } from '@pokemon-universe/shared';

export function validateZoomedPokemonConfig(config: unknown): string | null {
  const value = config as Partial<ZoomedPokemonConfig>;
  if (!value.generations?.length) return 'Selecciona al menos una generación.';
  return null;
}
