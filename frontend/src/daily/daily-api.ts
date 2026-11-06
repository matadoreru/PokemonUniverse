import { api } from '../lib/api';
import type { DailyLeaderboardResponse, DailyOverviewResponse } from '../lib/api-contract';

/** `403` de la clasificación sin fila propia de hoy (`DailyController`). */
export const PLAY_FIRST = "Play today's challenge first";

export function fetchDailyOverview(signal?: AbortSignal): Promise<DailyOverviewResponse> {
  return api<DailyOverviewResponse>('/daily', signal ? { signal } : undefined);
}

export function fetchDailyLeaderboard(signal?: AbortSignal): Promise<DailyLeaderboardResponse> {
  return api<DailyLeaderboardResponse>('/daily/leaderboard', signal ? { signal } : undefined);
}
