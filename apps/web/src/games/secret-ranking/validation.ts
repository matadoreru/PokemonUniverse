import type { RoomView, SecretRankingConfig } from '@pokemon-universe/shared';

export function validateSecretRankingConfig(config: unknown, room?: RoomView): string | null {
  const value = config as SecretRankingConfig;
  if (value.promptSource === 'CUSTOM' && (room?.hostCustomCategoryCount ?? 0) < 1) {
    return 'El host necesita al menos una pregunta personal activa para usar solo preguntas personalizadas.';
  }
  return null;
}
