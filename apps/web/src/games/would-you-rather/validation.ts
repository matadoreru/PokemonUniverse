import type { RoomView, WouldYouRatherConfig } from '@pokemon-universe/shared';

export function validateWouldYouRatherConfig(config: unknown, room?: RoomView): string | null {
  const value = config as WouldYouRatherConfig;
  if (value.promptSource === 'CUSTOM' && (room?.hostWouldYouRatherPromptCount ?? 0) < 1) return 'El host necesita al menos un dilema personal activo para usar solo dilemas personalizados.';
  return null;
}
