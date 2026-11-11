import type {
  GamePhase, GameResults, SketchmonAction, SketchmonAttempt, SketchmonColor, SketchmonHint, SketchmonPlayerState, SketchmonPoint, SketchmonPublicState,
  SketchmonRoundResult, SketchmonTool,
} from '@pokemon-universe/shared/public';
import { SKETCHMON_COLORS } from '@pokemon-universe/shared/public';
import type { PhaseStep } from '../../room/social-kit';
import type { GameAction } from '../../room/room-command';

/**
 * Textos y lógica pura de Sketchmon (Arcade DS F8): las herramientas del lienzo (nombres de colores y grosores, la
 * navegación de la paleta, los atajos de deshacer y rehacer, el troceado de los trazos en lotes y su envío sin aviso
 * global), el orden de turnos en texto, el título, la región viva, la revelación y la línea de métricas. Sin React.
 */

// ── Herramientas ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type DrawOperation = Extract<SketchmonAction, { type: 'DRAW_BATCH' }>['operations'][number];

/** Nombre de cada color de la paleta del motor: el color nunca va solo (la muestra lleva su nombre). */
export const SKETCH_COLOR_NAMES: Record<SketchmonColor, string> = {
  '#182033': 'Negro', '#ffffff': 'Blanco', '#7b8496': 'Gris', '#e24671': 'Rosa',
  '#ef4444': 'Rojo', '#f97316': 'Naranja', '#e1a817': 'Amarillo', '#84cc16': 'Lima',
  '#27965c': 'Verde', '#10a6c3': 'Turquesa', '#2563eb': 'Azul', '#7457c7': 'Morado',
  '#d946ef': 'Magenta', '#9a5b3c': 'Marrón',
};

export const SKETCH_COLORS: readonly SketchmonColor[] = SKETCHMON_COLORS;

export function sketchColorName(color: SketchmonColor): string {
  return SKETCH_COLOR_NAMES[color];
}

/** Grosores del lápiz y de la goma (en la escala del motor, 2–32) con su nombre. */
export const SKETCH_WIDTHS = [
  { value: 4, name: 'Fino' },
  { value: 8, name: 'Medio' },
  { value: 14, name: 'Grueso' },
  { value: 22, name: 'Muy grueso' },
] as const;
export type SketchWidth = (typeof SKETCH_WIDTHS)[number]['value'];

export const SKETCH_TOOLS: readonly { value: SketchmonTool; name: string }[] = [
  { value: 'PENCIL', name: 'Lápiz' },
  { value: 'ERASER', name: 'Goma' },
  { value: 'FILL', name: 'Relleno' },
];

/** Nombre accesible del lienzo según la herramienta: qué hace arrastrar o tocar. */
export function sketchCanvasLabel(tool: SketchmonTool): string {
  if (tool === 'ERASER') return 'Lienzo de Sketchmon. Goma: arrastra para borrar.';
  if (tool === 'FILL') return 'Lienzo de Sketchmon. Relleno: toca una zona para pintarla.';
  return 'Lienzo de Sketchmon. Lápiz: arrastra para dibujar.';
}

/** La muestra de la paleta a la que lleva una tecla (grupo de radio: flechas circulares, Inicio y Fin); `null` si ninguna. */
export function nextPaletteIndex(index: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0;
  if (!step) return null;
  const from = index >= 0 && index < count ? index : step === 1 ? -1 : 0;
  return (from + step + count) % count;
}

/** Ctrl+Z (o Cmd+Z) deshace y con Mayús rehace; nunca mientras se escribe en un campo. */
export function sketchmonHistoryShortcut(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key'>, typing = false): 'UNDO_STROKE' | 'REDO_STROKE' | null {
  if (typing || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return null;
  return event.shiftKey ? 'REDO_STROKE' : 'UNDO_STROKE';
}

/**
 * Si una pulsación empieza un trazo: solo con el lienzo habilitado (`canDraw`), el puntero principal y, con ratón, el
 * botón izquierdo. Sin `canDraw` no se pinta nada en local (el servidor lo rechazaría y saldría el aviso de sincronizar).
 */
export function strokeStartAllowed(enabled: boolean, event: Pick<PointerEvent, 'isPrimary' | 'pointerType' | 'button'>): boolean {
  return enabled && event.isPrimary && (event.pointerType !== 'mouse' || event.button === 0);
}

/** Distancia mínima entre dos puntos seguidos de un trazo (en la escala 0–1 del lienzo). */
export const SKETCH_POINT_DISTANCE = 0.002;

export function farEnough(left: SketchmonPoint, right: SketchmonPoint, distance = SKETCH_POINT_DISTANCE): boolean {
  return Math.hypot(left.x - right.x, left.y - right.y) >= distance;
}

/** Punto normalizado (0–1, recortado al lienzo) de unas coordenadas de cliente. */
export function normalizedPoint(bounds: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number): SketchmonPoint {
  const clamp = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);
  return { x: clamp((clientX - bounds.left) / bounds.width), y: clamp((clientY - bounds.top) / bounds.height) };
}

/** Puntos por operación `APPEND` y operaciones por lote (los máximos del esquema del motor). */
export const SKETCH_POINTS_PER_APPEND = 32;
export const SKETCH_OPERATIONS_PER_BATCH = 8;

/**
 * Añade puntos de un trazo a las operaciones pendientes: alarga la última `APPEND` del mismo trazo hasta 32 puntos y
 * abre otra cuando se llena. Devuelve una lista nueva (no toca la de entrada).
 */
export function appendPendingPoints(pending: readonly DrawOperation[], strokeId: string, points: readonly SketchmonPoint[]): DrawOperation[] {
  const next = pending.slice();
  for (const point of points) {
    const last = next.at(-1);
    if (last?.kind === 'APPEND' && last.strokeId === strokeId && last.points.length < SKETCH_POINTS_PER_APPEND) {
      next[next.length - 1] = { ...last, points: [...last.points, { ...point }] };
    } else next.push({ kind: 'APPEND', strokeId, points: [{ ...point }] });
  }
  return next;
}

/** Primer lote (hasta 8 operaciones) y lo que queda. */
export function takeDrawBatch(pending: readonly DrawOperation[]): { batch: DrawOperation[]; rest: DrawOperation[] } {
  return { batch: pending.slice(0, SKETCH_OPERATIONS_PER_BATCH), rest: pending.slice(SKETCH_OPERATIONS_PER_BATCH) };
}

/**
 * Envía un lote de trazos. Van varias veces por segundo mientras se dibuja: con `report: false` no limpian ni publican
 * el aviso global de la sala (un dueño por error); su fallo lo enseña el lienzo.
 */
export function sendDrawBatch(onAction: GameAction, operations: DrawOperation[]): Promise<void> {
  return onAction({ type: 'DRAW_BATCH', operations } satisfies SketchmonAction, { report: false });
}

// ── Pantalla ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const SKETCH_STEPS: readonly PhaseStep[] = [
  { key: 'draw', label: 'Dibujar y adivinar' },
  { key: 'reveal', label: 'Revelación' },
];

export function sketchCurrentStep(phase: GamePhase): string | null {
  if (phase === 'ROUND_ACTIVE') return 'draw';
  if (phase === 'ROUND_RESULTS') return 'reveal';
  return null;
}

/** Insignia de la placa: «Dibujo 2 de 3 · Vuelta 1 de 1». */
export function sketchRoundLabel(game: Pick<SketchmonPublicState, 'roundNumber' | 'totalRounds' | 'lapNumber' | 'totalLaps'>): string {
  return `Dibujo ${game.roundNumber} de ${game.totalRounds} · Vuelta ${game.lapNumber} de ${game.totalLaps}`;
}

export type SketchRole = 'drawer' | 'guesser' | 'watcher' | 'waiting';

export function sketchRole(player: SketchmonPlayerState | null): SketchRole {
  if (!player) return 'waiting';
  if (player.role === 'DRAWER') return 'drawer';
  if (player.role === 'GUESSER') return 'guesser';
  return 'watcher';
}

export type SketchTurnStatus = 'drawing' | 'drew' | 'next' | 'done' | 'pending';

/** Dónde está cada jugador en el orden de la vuelta: dibuja ahora (en la revelación, «dibujó»), es el siguiente, ya dibujó o le toca después. */
export function sketchTurnStatus(game: Pick<SketchmonPublicState, 'phase' | 'roundNumber' | 'drawerOrder' | 'drawerId' | 'nextDrawerId' | 'lastRound'>, playerId: string): SketchTurnStatus {
  const drawer = game.phase === 'ROUND_RESULTS' ? game.lastRound?.drawerId ?? game.drawerId : game.drawerId;
  if (playerId === drawer) return game.phase === 'ROUND_RESULTS' ? 'drew' : 'drawing';
  if (playerId === game.nextDrawerId) return 'next';
  const size = game.drawerOrder.length;
  const turnInLap = size ? (Math.max(1, game.roundNumber) - 1) % size : 0;
  const index = game.drawerOrder.indexOf(playerId);
  return index >= 0 && index < turnInLap ? 'done' : 'pending';
}

export const SKETCH_TURN_TEXT: Record<SketchTurnStatus, string> = {
  drawing: 'Dibuja ahora',
  drew: 'Dibujó',
  next: 'Siguiente',
  done: 'Ya dibujó',
  pending: 'Le toca después',
};

/** `h1` corto de la placa de la ronda. El nombre del secreto solo llega aquí desde el estado propio de quien dibuja. */
export function sketchHeading({ phase, role, drawerName, secretName, result }: { phase: GamePhase; role: SketchRole; drawerName: string | null; secretName: string | null; result: SketchmonRoundResult | null }): string {
  if (result) return `¡Era ${result.pokemon.name}!`;
  if (phase !== 'ROUND_ACTIVE' || !drawerName) return 'Preparando dibujo…';
  if (role === 'drawer') return secretName ? `Dibuja a ${secretName}` : 'Dibuja tu Pokémon';
  if (role === 'guesser') return `¿Qué Pokémon dibuja ${drawerName}?`;
  return `${drawerName} está dibujando`;
}

/** Una pista automática en texto (las de tipos llevan además sus insignias). */
export function sketchHintText(hint: SketchmonHint, typeLabel: (type: string) => string): string {
  if (hint.kind === 'GENERATION') return `Generación ${hint.generation}`;
  if (hint.kind === 'TYPES') return `Tipo: ${hint.types.map(typeLabel).join(' / ')}`;
  return hint.text;
}

const attemptsText = (count: number) => `${count} ${count === 1 ? 'intento' : 'intentos'}`;
/** Segundos con una cifra decimal y coma («12,3 s»). */
export const sketchSeconds = (ms: number) => `${(Math.max(0, ms) / 1_000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

/** Resumen de la revelación (también para la región viva). */
export function sketchRevealSummary(result: SketchmonRoundResult, nameOf: (id: string) => string): string {
  if (!result.winnerId) return `Se acabó el tiempo: nadie lo adivinó. Era ${result.pokemon.name}.`;
  return `${nameOf(result.winnerId)} acertó ${result.pokemon.name} en ${attemptsText(result.winnerAttemptCount ?? 1)} (${sketchSeconds(result.elapsedMs)}).`;
}

/**
 * Texto de la única región viva: el comienzo del dibujo, el fallo propio, la pista automática más reciente, el fallo al
 * sincronizar el dibujo (quien dibuja) y la revelación.
 */
export function sketchAnnouncement({ phase, roundNumber, role, drawerName, secretName, ownLast, hints, syncError, syncErrorSeq = 0, result, nameOf, typeLabel }: {
  phase: GamePhase;
  roundNumber: number;
  role: SketchRole;
  drawerName: string | null;
  secretName: string | null;
  ownLast: SketchmonAttempt | null;
  hints: readonly SketchmonHint[];
  syncError: string | null;
  /**
   * Cuántas veces ha fallado la sincronización: un fallo repetido con el mismo texto alterna un espacio duro final
   * (invisible) para que la región viva cambie y se vuelva a anunciar.
   */
  syncErrorSeq?: number;
  result: SketchmonRoundResult | null;
  nameOf: (id: string) => string;
  typeLabel: (type: string) => string;
}): string {
  if (result) return `Dibujo ${roundNumber} terminado. ${sketchRevealSummary(result, nameOf)}`;
  if (phase !== 'ROUND_ACTIVE' || !drawerName) return '';
  if (role === 'drawer' && syncError) return syncErrorSeq % 2 ? `${syncError}\u00A0` : syncError;
  if (ownLast) return `${ownLast.guessedPokemon.name} no era. Nuevo intento en un momento.`;
  const hint = hints.at(-1);
  if (hint) return `Pista: ${sketchHintText(hint, typeLabel)}.`;
  if (role === 'drawer') return `Dibujo ${roundNumber}: te toca dibujar${secretName ? ` a ${secretName}` : ''}. No escribas letras, números ni su nombre.`;
  if (role === 'guesser') return `Dibujo ${roundNumber}: dibuja ${drawerName}. Busca el Pokémon cuando lo sepas.`;
  return `Dibujo ${roundNumber}: dibuja ${drawerName}.`;
}

export interface SketchVerdict { tone: 'ok' | 'bad' | 'info'; text: string; points: number }

export function sketchVerdict(result: SketchmonRoundResult, selfId: string, participating: boolean): SketchVerdict {
  if (result.winnerId === selfId) return { tone: 'ok', text: `¡Lo adivinaste en ${attemptsText(result.winnerAttemptCount ?? 1)}!`, points: result.guesserPoints };
  if (result.drawerId === selfId) {
    return result.winnerId ? { tone: 'ok', text: 'Tu dibujo funcionó', points: result.drawerPoints } : { tone: 'bad', text: 'Nadie adivinó tu dibujo', points: 0 };
  }
  if (!participating) return { tone: 'info', text: 'Estás observando', points: 0 };
  return result.winnerId ? { tone: 'bad', text: 'Otro jugador lo adivinó antes', points: 0 } : { tone: 'bad', text: 'Nadie lo adivinó', points: 0 };
}

type Stats = GameResults['standings'][number]['stats'];
const num = (stats: Stats, key: string) => Number(stats[key] ?? 0);

/** Línea de métricas de los resultados: adivinados, al primer intento, dibujos descubiertos y los puntos de cada parte. */
export function sketchStatsLine(stats: Stats): string {
  const guessed = num(stats, 'guessedPokemon');
  return [
    `${guessed} ${guessed === 1 ? 'adivinado' : 'adivinados'}`,
    `${num(stats, 'firstTry')} al primer intento`,
    `${num(stats, 'drawingSuccesses')}/${num(stats, 'drawingRounds')} dibujos descubiertos`,
    `+${num(stats, 'pointsFromGuessing')} adivinando`,
    `+${num(stats, 'pointsFromDrawing')} dibujando`,
  ].join(' · ');
}
