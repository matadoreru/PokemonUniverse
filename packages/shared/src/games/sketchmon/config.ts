import { z } from 'zod';
import { GENERATIONS } from '../../pokemon/types.js';
import { pokemonGenerationsSchema } from '../config.js';

const sketchmonRoundSeconds = [60, 90, 120] as const;

export const sketchmonConfigSchema = z.object({
  generations: pokemonGenerationsSchema,
  roundSeconds: z.number().int().refine(
    (value) => sketchmonRoundSeconds.includes(value as (typeof sketchmonRoundSeconds)[number]),
    'El tiempo debe ser 60, 90 o 120 segundos.',
  ),
  laps: z.number().int().min(1).max(3),
  hintsEnabled: z.boolean(),
  memoryPreviewEnabled: z.boolean(),
  includeForms: z.boolean(),
  /** Fallos de la ronda visibles para todos; apagado, cada jugador solo ve los suyos (el servidor no envía los demás). */
  publicAttempts: z.boolean().default(true),
}).strict();

export type SketchmonConfig = z.infer<typeof sketchmonConfigSchema>;

export const defaultSketchmonConfig: SketchmonConfig = {
  generations: [...GENERATIONS],
  roundSeconds: 90,
  laps: 1,
  hintsEnabled: false,
  memoryPreviewEnabled: false,
  includeForms: false,
  publicAttempts: true,
};
