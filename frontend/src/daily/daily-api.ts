import { api } from '../lib/api';
import type { DailyLeaderboardResponse, DailyOverviewResponse } from '../lib/api-contract';

/** `403` de la clasificación sin fila propia de hoy (`DailyController`). */
export const PLAY_FIRST = "Play today's challenge first";

export function fetchDailyOverview(signal?: AbortSignal): Promise<DailyOverviewResponse> {
  return api<DailyOverviewResponse>('/daily', signal ? { signal } : undefined);
}

/**
 * La clasificación de hoy o, con `date` (AAAA-MM-DD), la de ese día: los resultados de una partida que cruzó la
 * medianoche de Madrid piden la del día en que empezó (hoy no hay fila propia y daría el `403`).
 */
export function fetchDailyLeaderboard(signal?: AbortSignal, date?: string): Promise<DailyLeaderboardResponse> {
  const path = date ? `/daily/leaderboard?date=${encodeURIComponent(date)}` : '/daily/leaderboard';
  return api<DailyLeaderboardResponse>(path, signal ? { signal } : undefined);
}
