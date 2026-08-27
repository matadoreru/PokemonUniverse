import type { MostLikelyToConfig, RoomView } from '@pokemon-universe/shared';

export function validateMostLikelyToConfig(config: unknown, room?: RoomView): string | null {
  const value = config as MostLikelyToConfig;
  if (value.promptSource === 'CUSTOM' && (room?.hostCustomCategoryCount ?? 0) < 1) {
    return 'El host necesita al menos una pregunta personal activa para usar solo preguntas personalizadas.';
  }
  return null;
}
