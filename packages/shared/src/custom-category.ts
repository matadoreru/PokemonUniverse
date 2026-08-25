import { z } from 'zod';

export const customCategoryTextSchema = z.string().trim().min(4, 'Escribe al menos 4 caracteres.').max(160, 'La categoría no puede superar 160 caracteres.');
export const createCustomCategorySchema = z.object({ text: customCategoryTextSchema }).strict();
export const updateCustomCategorySchema = z.object({
  text: customCategoryTextSchema.optional(),
  enabled: z.boolean().optional(),
}).strict().refine((value) => value.text !== undefined || value.enabled !== undefined, 'No hay cambios que guardar.');

export interface CustomCategoryView {
  id: string;
  text: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
