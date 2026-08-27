import { z } from 'zod';

export const wouldYouRatherOptionTextSchema = z.string().trim().min(4, 'Escribe al menos 4 caracteres.').max(180, 'La opción no puede superar 180 caracteres.');

function optionsDiffer(value: { optionA?: string; optionB?: string }): boolean {
  if (value.optionA === undefined || value.optionB === undefined) return true;
  return value.optionA.localeCompare(value.optionB, 'es', { sensitivity: 'base' }) !== 0;
}

export const createCustomWouldYouRatherPromptSchema = z.object({
  optionA: wouldYouRatherOptionTextSchema,
  optionB: wouldYouRatherOptionTextSchema,
}).strict().refine(optionsDiffer, { message: 'Las dos opciones deben ser diferentes.', path: ['optionB'] });

export const updateCustomWouldYouRatherPromptSchema = z.object({
  optionA: wouldYouRatherOptionTextSchema.optional(),
  optionB: wouldYouRatherOptionTextSchema.optional(),
  enabled: z.boolean().optional(),
}).strict().refine((value) => value.optionA !== undefined || value.optionB !== undefined || value.enabled !== undefined, 'No hay cambios que guardar.');

export const importCustomWouldYouRatherPromptsSchema = z.object({
  version: z.literal(1),
  prompts: z.array(createCustomWouldYouRatherPromptSchema).min(1, 'Incluye al menos un dilema.').max(100, 'Puedes importar hasta 100 dilemas cada vez.'),
}).strict();

export type ImportCustomWouldYouRatherPrompts = z.infer<typeof importCustomWouldYouRatherPromptsSchema>;

export interface CustomWouldYouRatherPromptView {
  id: string;
  optionA: string;
  optionB: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
