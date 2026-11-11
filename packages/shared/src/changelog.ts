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

/** `highlight` solo aparece cuando es `true`; con `exactOptionalPropertyTypes` encaja con el contrato generado del backend. */
export interface ChangelogChange {
  type: ChangelogCategory;
  text: string;
  highlight?: boolean;
}

/** Cambios destacados por versión, como máximo. */
export const MAX_CHANGELOG_HIGHLIGHTS = 3;
export const CHANGELOG_SUMMARY_MAX = 200;

export interface ChangelogEntry {
  id: string;
  version: string;
  title: string;
  /** Ausente si la versión no tiene resumen. */
  summary?: string;
  date: string;
  published: boolean;
  content: ChangelogChange[];
  createdAt: string;
  updatedAt: string;
}
