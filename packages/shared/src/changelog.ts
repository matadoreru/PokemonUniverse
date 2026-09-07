import { z } from 'zod';

export const CHANGELOG_CATEGORIES = ['NEW', 'MINIGAMES', 'BALANCE', 'INTERFACE', 'IMPROVEMENTS', 'BUGS', 'TECHNICAL'] as const;
export const changelogCategorySchema = z.enum(CHANGELOG_CATEGORIES);
export type ChangelogCategory = z.infer<typeof changelogCategorySchema>;

export const CHANGELOG_CATEGORY_LABELS: Record<ChangelogCategory, string> = {
  NEW: 'Nuevo',
  MINIGAMES: 'Minijuegos',
  BALANCE: 'Balance',
  INTERFACE: 'Interfaz',
  IMPROVEMENTS: 'Mejoras',
  BUGS: 'Correcciones',
  TECHNICAL: 'Técnico',
};

export const changelogChangeSchema = z.object({
  type: changelogCategorySchema,
  text: z.string().trim().min(3, 'Describe el cambio con al menos 3 caracteres.').max(500),
}).strict();
export type ChangelogChange = z.infer<typeof changelogChangeSchema>;

export const changelogContentSchema = z.array(changelogChangeSchema).min(1, 'Añade al menos un cambio.').max(100);

export const createChangelogSchema = z.object({
  version: z.string().trim().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'Usa una versión como 0.8.0.'),
  title: z.string().trim().min(3).max(120),
  date: z.string().datetime({ offset: true }),
  published: z.boolean().default(false),
  content: changelogContentSchema,
}).strict();

export const updateChangelogSchema = createChangelogSchema.partial().refine((input) => Object.keys(input).length > 0, {
  message: 'Incluye al menos un campo para actualizar.',
});

export type CreateChangelogInput = z.infer<typeof createChangelogSchema>;
export type UpdateChangelogInput = z.infer<typeof updateChangelogSchema>;

export interface ChangelogEntry {
  id: string;
  version: string;
  title: string;
  date: string;
  published: boolean;
  content: ChangelogChange[];
  createdAt: string;
  updatedAt: string;
}
