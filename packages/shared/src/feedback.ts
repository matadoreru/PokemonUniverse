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
