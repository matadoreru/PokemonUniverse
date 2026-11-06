import { dailyShareText, formatDailyPoints, isDailyGameId, type DailyGameId } from '@pokemon-universe/shared/public';
import type { DailyOverviewResponse } from '../lib/api-contract';

/** Confirmación de «Abandonar el reto» en Jugar y de «Salir» durante la partida del reto. */
export const ABANDON_DAILY_TEXT = 'Si sales ahora, el reto de hoy cuenta como jugado y no entrarás en la clasificación.';

/** Qué ofrece la fila del reto en Jugar según el estado propio de hoy. */
export type DailyRowAction = 'play' | 'resume' | 'result' | 'leaderboard';

export function dailyRowAction(overview: Pick<DailyOverviewResponse, 'status'>): DailyRowAction {
  switch (overview.status) {
    case 'IN_PROGRESS': return 'resume';
    case 'FINISHED': return 'result';
    case 'ABANDONED': return 'leaderboard';
    default: return 'play';
  }
}

/** Texto del chip de la fila: «612 pts · 3.º de 40» si terminó (el puesto empatado lo da el servidor), «Abandonado» o nada. */
export function dailyChipText(overview: Pick<DailyOverviewResponse, 'status' | 'result'>): string | null {
  if (overview.status === 'ABANDONED') return 'Abandonado';
  if (overview.status !== 'FINISHED' || !overview.result) return null;
  const { score, position, total } = overview.result;
  return `${formatDailyPoints(score)} pts · ${position}.º de ${total}`;
}

export function dailyPlayersText(players: number): string {
  if (players <= 0) return 'Nadie ha jugado todavía';
  return `${players} ${players === 1 ? 'ha jugado' : 'han jugado'} hoy`;
}

/**
 * Cuenta atrás hasta `resetsAt` (la medianoche de Madrid, en ISO). Resta instantes, no horas de reloj: el día del cambio
 * de hora salen 23 o 25 h. Los segundos se truncan; por debajo del minuto (o ya pasada la hora), «menos de 1 min».
 */
export function countdownText(resetsAt: string, now: number): string {
  const minutes = Math.floor((Date.parse(resetsAt) - now) / 60_000);
  if (!(minutes >= 1)) return 'Nuevo reto en menos de 1 min';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `Nuevo reto en ${rest} min`;
  return rest === 0 ? `Nuevo reto en ${hours} h` : `Nuevo reto en ${hours} h ${rest} min`;
}

export interface DailyResultInput {
  gameId: string;
  date: string;
  roundCount: number;
  result: { score: number; correct: number; rounds: readonly number[] };
}

/** El texto para compartir del resultado, o `null` si el juego no es del reto (respuesta inesperada del servidor). */
export function dailyResultText(input: DailyResultInput, origin: string): string | null {
  if (!isDailyGameId(input.gameId)) return null;
  const gameId: DailyGameId = input.gameId;
  return dailyShareText({ gameId, date: input.date, score: input.result.score, correct: input.result.correct, roundCount: input.roundCount, rounds: input.result.rounds, origin });
}

/** La línea de emojis (o de distancias) del texto para compartir. */
export function dailyResultDetail(input: DailyResultInput): string {
  return dailyResultText(input, '')?.split('\n')[2] ?? '';
}

/** Lo que usa «Compartir» de `navigator` (inyectable en las pruebas). */
export interface ShareNavigator {
  share?: (data: { text: string }) => Promise<void>;
  clipboard?: { writeText(text: string): Promise<void> };
}

/**
 * «Compartir»: la hoja del sistema si existe (cancelarla no es un error) y, si no, el portapapeles. Devuelve lo que
 * anuncia la región viva de la pantalla.
 */
export async function shareDailyResult(text: string, nav: ShareNavigator = navigator): Promise<string> {
  if (typeof nav.share === 'function') {
    try { await nav.share({ text }); } catch { /* Cancelada o rechazada: la hoja del sistema ya se ha visto. */ }
    return '';
  }
  try {
    if (!nav.clipboard) throw new Error('Sin portapapeles');
    await nav.clipboard.writeText(text);
    return 'Resultado copiado';
  } catch {
    return 'No se pudo copiar el resultado';
  }
}
