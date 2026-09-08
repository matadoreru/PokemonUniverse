import { z } from 'zod';

export const FEEDBACK_TYPES = ['BUG', 'SUGGESTION'] as const;
export const feedbackTypeSchema = z.enum(FEEDBACK_TYPES);
export type FeedbackType = z.infer<typeof feedbackTypeSchema>;

export const FEEDBACK_STATUSES = ['NEW', 'REVIEWING', 'RESOLVED'] as const;
export const feedbackStatusSchema = z.enum(FEEDBACK_STATUSES);
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  BUG: 'Problema',
  SUGGESTION: 'Sugerencia',
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  NEW: 'Nuevo',
  REVIEWING: 'Revisando',
  RESOLVED: 'Solucionado',
};

export const createFeedbackSchema = z.object({
  gameId: z.string().trim().min(1, 'Selecciona un minijuego.').max(64),
  roomCode: z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/, 'El código de sala no es válido.').optional(),
  type: feedbackTypeSchema,
  description: z.string().trim().min(10, 'Describe el feedback con al menos 10 caracteres.').max(2_000, 'El feedback no puede superar los 2.000 caracteres.'),
}).strict();
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;

export const updateFeedbackStatusSchema = z.object({ status: feedbackStatusSchema }).strict();

export interface FeedbackItem {
  id: string;
  gameId: string;
  gameName: string;
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
