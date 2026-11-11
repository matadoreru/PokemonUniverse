import { describeBingoCondition, type BingoPrivateAttempt, type BingoPublicBoard, type BingoPublicCell, type GamePhase } from '@pokemon-universe/shared/public';

/** Texto de la casilla: sus condiciones unidas con «+» («Tipo Fuego + Generación 1»). */
export const bingoCellLabel = (cell: Pick<BingoPublicCell, 'conditions'>) => cell.conditions.map(describeBingoCondition).join(' + ');

/** Mensaje del último intento sin el «❌» del servidor: el tono lo pone el chip (icono y color), el texto lo dice todo. */
export const bingoAttemptText = (message: string) => message.replace(/^\s*❌\s*/u, '').trim();

/** «3/9 casillas». */
export const bingoProgressText = (board: Pick<BingoPublicBoard, 'completed' | 'total'>) => `${board.completed}/${board.total} ${board.total === 1 ? 'casilla' : 'casillas'}`;

/**
 * Qué pinta la placa inferior. `pick`: el buscador junto a la casilla elegida. `blocked`: tiene tablero pero el servidor
 * no le deja actuar. `watching`: sin tablero (espectador o entró tarde). `bingo`: los 8 s tras el bingo de alguien.
 */
export type BingoPlateKind = 'pick' | 'blocked' | 'watching' | 'bingo' | 'waiting';

export function bingoPlateKind(phase: GamePhase, { hasBoard, canAct }: { hasBoard: boolean; canAct: boolean }): BingoPlateKind {
  if (phase === 'ROUND_RESULTS') return 'bingo';
  if (phase !== 'ROUND_ACTIVE') return 'waiting';
  if (!hasBoard) return 'watching';
  return canAct ? 'pick' : 'blocked';
}

/**
 * Destino del foco (el título de la placa): al pasar al bingo y tras colocar un Pokémon (el buscador se vacía y su
 * resultado, que tenía el foco, desaparece). Así el foco no cae al `body`.
 */
export function bingoFocusKey(kind: BingoPlateKind, placedAt: number | null = null): string | null {
  if (kind === 'bingo') return 'bingo';
  return kind === 'pick' && placedAt !== null ? `placed-${placedAt}` : null;
}

/**
 * Texto de la única región viva de la pantalla. En la ronda, el último intento propio (y, si falló, que hay una espera:
 * la cuenta atrás no se anuncia, solo se ve). En el bingo, quién lo ha cantado (el `Cutin` solo se ve).
 * Un fallo solo se dice mientras dura su espera: al acabar, la región se vacía, y así un segundo fallo idéntico (mismo
 * texto) vuelve a cambiarla y se anuncia otra vez.
 */
export function bingoAnnouncement({ kind, attempt, cooldownMs = 0, winner = null }: { kind: BingoPlateKind; attempt: BingoPrivateAttempt | null; cooldownMs?: number; winner?: { name: string; self: boolean } | null }): string {
  if (kind === 'bingo') return winner ? `¡Bingo! ${winner.self ? 'Completaste tu tablero.' : `${winner.name} completó el tablero.`}` : '';
  if (kind === 'watching') return 'Estás observando: los tableros se actualizan en directo.';
  if (kind === 'blocked') return 'Ahora no puedes colocar Pokémon en tu tablero.';
  if (kind !== 'pick' || !attempt) return '';
  const text = bingoAttemptText(attempt.message);
  if (attempt.correct) return text;
  return cooldownMs > 0 ? `Incorrecto: ${text} Hay una breve espera antes del siguiente intento.` : '';
}

/** Confirmación de mover un Pokémon que ya está en otra casilla (antes, `window.confirm`). */
export function bingoMoveText({ pokemonName, from, to }: { pokemonName: string; from: Pick<BingoPublicCell, 'conditions'>; to: Pick<BingoPublicCell, 'conditions'> }) {
  return {
    title: `¿Mover a ${pokemonName}?`,
    used: `${pokemonName} ya está usado en «${bingoCellLabel(from)}».`,
    question: `¿Moverlo a «${bingoCellLabel(to)}»? La otra casilla quedará vacía.`,
  };
}

/** Duración en minutos y segundos («1:05»). */
export function bingoClock(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Línea de métricas de un jugador en los resultados: «7/9 casillas · 8 correctos · 2 fallos» (+ el tiempo del bingo). */
export function bingoStatsLine(stats: Record<string, number | undefined>): string {
  const completed = stats.cellsCompleted ?? 0;
  const total = stats.cellsTotal ?? 0;
  const correct = stats.correctAssignments ?? 0;
  const wrong = stats.incorrectAttempts ?? 0;
  const parts = [bingoProgressText({ completed, total }), `${correct} ${correct === 1 ? 'correcto' : 'correctos'}`, `${wrong} ${wrong === 1 ? 'fallo' : 'fallos'}`];
  if ((stats.bingos ?? 0) > 0 && (stats.bestBingoTimeMs ?? 0) > 0) parts.push(`bingo en ${bingoClock(stats.bestBingoTimeMs!)}`);
  return parts.join(' · ');
}

/**
 * Orden de los jugadores en el panel lateral: el del bingo primero y luego más casillas y antes (como la clasificación
 * del servidor); a igualdad, el orden de la sala.
 */
export function bingoPlayerOrder(boards: Record<string, BingoPublicBoard>, order: readonly string[], winnerId: string | null): string[] {
  const index = (id: string) => { const at = order.indexOf(id); return at === -1 ? order.length : at; };
  return Object.keys(boards).sort((left, right) => {
    if (left === winnerId) return -1;
    if (right === winnerId) return 1;
    const a = boards[left]!; const b = boards[right]!;
    return b.completed - a.completed || a.lastProgressAt - b.lastProgressAt || index(left) - index(right);
  });
}
