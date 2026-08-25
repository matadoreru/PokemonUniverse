import { guessFromStatsConfigSchema } from '@pokemon-universe/shared';

export function validateGuessFromStatsConfig(config: unknown): string | null {
  const result = guessFromStatsConfigSchema.safeParse(config); if (result.success) return null;
  return result.error.issues[0]?.message ?? 'Configuración inválida.';
}
