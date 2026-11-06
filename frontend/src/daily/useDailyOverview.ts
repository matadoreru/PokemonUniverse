import { useCallback, useEffect, useState } from 'react';
import type { DailyOverviewResponse } from '../lib/api-contract';
import { useRoom } from '../room/RoomContext';
import { fetchDailyOverview } from './daily-api';

const TICK_MS = 30_000;
/** Margen tras `resetsAt` y mínimo del temporizador: un reloj adelantado no provoca un bucle de peticiones. */
const RESET_SLACK_MS = 1_000;

export interface DailyOverviewState {
  overview: DailyOverviewResponse | null;
  error: string | null;
  /** `Date.now()` de la última vuelta del reloj de la cuenta atrás (cada 30 s). */
  now: number;
  reload(): void;
}

/**
 * `GET /api/daily` mientras `enabled` (cuenta registrada sin sala en Jugar: el invitado recibiría `401`). Vuelve a pedirlo
 * al activarse otra vez (al salir de una sala), al llegar `resetsAt`, con `daily:recorded` y con `reload()`.
 */
export function useDailyOverview(enabled: boolean): DailyOverviewState {
  const { subscribe } = useRoom();
  const [overview, setOverview] = useState<DailyOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setError(null);
    fetchDailyOverview(controller.signal)
      .then((body) => { if (!controller.signal.aborted) { setOverview(body); setNow(Date.now()); } })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Request failed'); });
    return () => controller.abort();
  }, [enabled, version]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);

  const resetsAt = overview?.resetsAt;
  useEffect(() => {
    if (!enabled || !resetsAt) return;
    const delay = Math.max(RESET_SLACK_MS, Date.parse(resetsAt) - Date.now() + RESET_SLACK_MS);
    const timer = window.setTimeout(reload, delay);
    return () => window.clearTimeout(timer);
  }, [enabled, resetsAt, reload]);

  useEffect(() => (enabled ? subscribe('daily:recorded', reload) : undefined), [enabled, subscribe, reload]);

  return { overview, error, now, reload };
}
