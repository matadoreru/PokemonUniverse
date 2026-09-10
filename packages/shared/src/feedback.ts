import { z } from 'zod';

export const FEEDBACK_TYPES = ['BUG', 'SUGGESTION'] as const;
export const feedbackTypeSchema = z.enum(FEEDBACK_TYPES);
export type FeedbackType = z.infer<typeof feedbackTypeSchema>;

export const FEEDBACK_REFERENCES = ['GENERAL', 'MINIGAME', 'ROOMS', 'ACCOUNT', 'INTERFACE', 'CHANGELOG', 'OTHER'] as const;
export const feedbackReferenceSchema = z.enum(FEEDBACK_REFERENCES);
export type FeedbackReference = z.infer<typeof feedbackReferenceSchema>;

export const FEEDBACK_STATUSES = ['NEW', 'REVIEWING', 'RESOLVED'] as const;
export const feedbackStatusSchema = z.enum(FEEDBACK_STATUSES);
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  BUG: 'Problema',
  SUGGESTION: 'Sugerencia',
};

export const FEEDBACK_REFERENCE_LABELS: Record<FeedbackReference, string> = {
  GENERAL: 'Pokémon Universe en general',
  MINIGAME: 'Un minijuego',
  ROOMS: 'Salas y partidas',
  ACCOUNT: 'Cuenta y acceso',
  INTERFACE: 'Interfaz y navegación',
  CHANGELOG: 'Novedades y versiones',
  OTHER: 'Otro tema',
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  NEW: 'Nuevo',
  REVIEWING: 'Revisando',
  RESOLVED: 'Solucionado',
};

export const createFeedbackSchema = z.object({
  reference: feedbackReferenceSchema.optional(),
  gameId: z.string().trim().min(1, 'Selecciona un minijuego.').max(64).optional(),
  roomCode: z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/, 'El código de sala no es válido.').optional(),
  type: feedbackTypeSchema,
  description: z.string().trim().min(10, 'Describe el feedback con al menos 10 caracteres.').max(2_000, 'El feedback no puede superar los 2.000 caracteres.'),
}).strict().superRefine((input, context) => {
  const reference = input.reference ?? (input.gameId ? 'MINIGAME' : 'GENERAL');
  if (reference === 'MINIGAME' && !input.gameId) {
    context.addIssue({ code: 'custom', path: ['gameId'], message: 'Selecciona un minijuego.' });
  }
  if (reference !== 'MINIGAME' && input.gameId) {
    context.addIssue({ code: 'custom', path: ['gameId'], message: 'El minijuego solo se incluye cuando el feedback hace referencia a uno.' });
  }
}).transform((input) => ({
  ...input,
  reference: input.reference ?? (input.gameId ? 'MINIGAME' : 'GENERAL'),
}));
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;

export const updateFeedbackStatusSchema = z.object({ status: feedbackStatusSchema }).strict();

export interface FeedbackItem {
  id: string;
  reference: FeedbackReference;
  gameId: string | null;
  gameName: string | null;
  roomCode: string | null;
  type: FeedbackType;
  status: FeedbackStatus;
  description: string;
  author: { userId: string | null; displayName: string; kind: 'USER' | 'GUEST' };
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackOverview {
  newBugs: number;
  newSuggestions: number;
  reviewing: number;
  resolved: number;
}
