import type { OneOfUsIsFakeConfig, RoomView } from '@pokemon-universe/shared';

export function validateOneOfUsIsFakeConfig(config: unknown, room?: RoomView): string | null {
  const value = config as Partial<OneOfUsIsFakeConfig>;
  if (value.categorySource === 'CUSTOM' && (room?.hostCustomCategoryCount ?? 0) < 2) {
    return `El host necesita al menos 2 categorías personales activas; ahora hay ${room?.hostCustomCategoryCount ?? 0}.`;
  }
  return null;
}
