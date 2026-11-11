import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { SKETCHMON_COLORS, type SketchmonAction, type SketchmonColor, type SketchmonPoint, type SketchmonStroke, type SketchmonTool } from '@pokemon-universe/shared/public';
import {
  appendPendingPoints, farEnough, normalizedPoint, sendDrawBatch, sketchmonHistoryShortcut, strokeStartAllowed, takeDrawBatch, type DrawOperation, type SketchWidth,
} from '../games/sketchmon/presentation';
import { typingTarget } from './shortcuts';
import { cx } from '../ui';
import s from '../games/sketchmon/Sketchmon.module.css';

/**
 * El lienzo de Sketchmon: el dibujo (lápiz, goma y relleno por inundación) sobre un `<canvas>` 4:3 con los puntos en
 * escala 0–1 (todos ven el mismo dibujo a cualquier tamaño) y, para quien dibuja, `useSketchPad`: el trazo optimista,
 * el envío de los trazos en lotes y las acciones de historial (deshacer, rehacer y limpiar).
 */

type GameAction = (action: unknown, options?: { report?: boolean }) => Promise<void>;

const FLUSH_INTERVAL_MS = 250;

function colorBytes(color: string): [number, number, number, number] {
  return [Number.parseInt(color.slice(1, 3), 16), Number.parseInt(color.slice(3, 5), 16), Number.parseInt(color.slice(5, 7), 16), 255];
}

function floodFill(context: CanvasRenderingContext2D, point: SketchmonPoint, color: string) {
  const { width, height } = context.canvas; if (width <= 0 || height <= 0) return;
  const image = context.getImageData(0, 0, width, height); const pixels = image.data;
  const startX = Math.min(width - 1, Math.max(0, Math.floor(point.x * width)));
  const startY = Math.min(height - 1, Math.max(0, Math.floor(point.y * height)));
  const start = (startY * width + startX) * 4;
  const target = [pixels[start]!, pixels[start + 1]!, pixels[start + 2]!, pixels[start + 3]!] as const;
  const replacement = colorBytes(color);
  if (target.every((value, index) => value === replacement[index])) return;
  const matches = (offset: number) => target.every((value, index) => pixels[offset + index] === value);
  const stack = [startX, startY];
  while (stack.length) {
    const y = stack.pop()!; const x = stack.pop()!; const offset = (y * width + x) * 4;
    if (!matches(offset)) continue;
    pixels[offset] = replacement[0]; pixels[offset + 1] = replacement[1]; pixels[offset + 2] = replacement[2]; pixels[offset + 3] = replacement[3];
    if (x > 0) stack.push(x - 1, y); if (x + 1 < width) stack.push(x + 1, y);
    if (y > 0) stack.push(x, y - 1); if (y + 1 < height) stack.push(x, y + 1);
  }
  context.putImageData(image, 0, 0);
}

function drawStroke(context: CanvasRenderingContext2D, stroke: SketchmonStroke, width: number, height: number) {
  if (!stroke.points.length) return;
  if (stroke.tool === 'FILL') { floodFill(context, stroke.points[0]!, stroke.color); return; }
  context.save();
  context.globalCompositeOperation = stroke.tool === 'ERASER' ? 'destination-out' : 'source-over';
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = Math.max(1, stroke.width * width / 900);
  const first = stroke.points[0]!;
  if (stroke.points.length === 1) {
    context.beginPath(); context.arc(first.x * width, first.y * height, context.lineWidth / 2, 0, Math.PI * 2); context.fill();
  } else {
    context.beginPath(); context.moveTo(first.x * width, first.y * height);
    for (const point of stroke.points.slice(1)) context.lineTo(point.x * width, point.y * height);
    context.stroke();
  }
  context.restore();
}

function renderDrawing(canvas: HTMLCanvasElement, strokes: readonly SketchmonStroke[], optimisticStroke: SketchmonStroke | null) {
  const context = canvas.getContext('2d'); if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const stroke of strokes) drawStroke(context, stroke, canvas.width, canvas.height);
  if (!optimisticStroke) return;
  const authoritativeLength = strokes.find((stroke) => stroke.id === optimisticStroke.id)?.points.length ?? 0;
  if (authoritativeLength >= optimisticStroke.points.length) return;
  const points = optimisticStroke.points.slice(Math.max(0, authoritativeLength - 1));
  drawStroke(context, { ...optimisticStroke, points }, canvas.width, canvas.height);
}

function pointFromEvent(canvas: HTMLCanvasElement, event: PointerEvent): SketchmonPoint {
  return normalizedPoint(canvas.getBoundingClientRect(), event.clientX, event.clientY);
}

export interface SketchSurfaceHandlers {
  onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>): void;
  onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>): void;
  onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>): void;
}

/**
 * El `<canvas>` del dibujo: su tamaño lo pone el CSS (4:3, lo escala su contenedor); el búfer sigue al tamaño en pantalla
 * (hasta 2× de densidad) y se vuelve a pintar entero. `data-stroke-count` dice cuántos trazos tiene (pruebas E2E).
 */
export function SketchmonCanvasSurface({ strokes, label, optimisticStroke = null, handlers, brush, className, testId }: {
  strokes: readonly SketchmonStroke[];
  label: string;
  optimisticStroke?: SketchmonStroke | null;
  /** Solo quien dibuja: el puntero (ratón, lápiz o dedo) dibuja. */
  handlers?: SketchSurfaceHandlers | undefined;
  /** Solo quien dibuja: el pincel que enseña el cursor de color. */
  brush?: SketchBrush | undefined;
  className?: string | undefined;
  testId?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef({ strokes, optimisticStroke });
  drawingRef.current = { strokes, optimisticStroke };
  const editable = Boolean(handlers);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return undefined;
    const resize = () => {
      const bounds = canvas.getBoundingClientRect(); const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(bounds.width * ratio)); const height = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const drawing = drawingRef.current;
      renderDrawing(canvas, drawing.strokes, drawing.optimisticStroke);
    };
    resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(canvas); window.addEventListener('resize', resize);
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize); };
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current; if (canvas) renderDrawing(canvas, strokes, optimisticStroke);
  }, [optimisticStroke, strokes]);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const brushRef = useRef(brush);
  brushRef.current = brush;
  const moveCursor = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const cursor = cursorRef.current; if (!cursor) return;
    if (event.pointerType === 'touch') { cursor.hidden = true; return; }
    const bounds = event.currentTarget.getBoundingClientRect();
    cursor.style.transform = `translate(${event.clientX - bounds.left}px, ${event.clientY - bounds.top}px)`;
    if (dotRef.current && brushRef.current) {
      const size = `${brushDotSize(brushRef.current, bounds.width)}px`;
      dotRef.current.style.width = size; dotRef.current.style.height = size;
    }
    cursor.hidden = false;
  };
  const hideCursor = () => { if (cursorRef.current) cursorRef.current.hidden = true; };
  const canvas = <canvas
    ref={canvasRef}
    className={cx(s.canvas, editable && s.canvasEditable, brush && s.canvasBrush, className)}
    aria-label={label}
    role="img"
    data-stroke-count={strokes.length}
    {...(testId ? { 'data-testid': testId } : {})}
    {...(handlers ? {
      onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => { moveCursor(event); handlers.onPointerDown(event); },
      onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => { moveCursor(event); handlers.onPointerMove(event); },
      onPointerUp: handlers.onPointerUp,
      onPointerCancel: (event: ReactPointerEvent<HTMLCanvasElement>) => { hideCursor(); handlers.onPointerUp(event); },
      onPointerLeave: hideCursor,
    } : {})}
    onContextMenu={(event) => { if (editable) event.preventDefault(); }}
  />;
  if (!brush) return canvas;
  return <>
    {canvas}
    <span ref={cursorRef} hidden aria-hidden="true" data-testid="sketch-brush-cursor" className={s.brushCursor}>
      <span ref={dotRef} className={cx(s.brushDot, brush.tool === 'ERASER' && s.brushEraser)} style={brush.tool === 'ERASER' ? undefined : { background: brush.color }} />
    </span>
  </>;
}

/** Lo que el cursor de color necesita del pincel de quien dibuja. */
export interface SketchBrush { tool: SketchmonTool; color: SketchmonColor; width: SketchWidth }

/** El diámetro del punto en px: el del trazo en pantalla (`drawStroke`: grosor × ancho / 900); el relleno, uno fijo. */
export function brushDotSize(brush: SketchBrush, canvasWidth: number): number {
  return brush.tool === 'FILL' ? 12 : Math.max(6, brush.width * canvasWidth / 900);
}

export interface SketchPad {
  tool: SketchmonTool;
  setTool(tool: SketchmonTool): void;
  color: SketchmonColor;
  setColor(color: SketchmonColor): void;
  width: SketchWidth;
  setWidth(width: SketchWidth): void;
  optimisticStroke: SketchmonStroke | null;
  handlers: SketchSurfaceHandlers;
  /** Fallo al sincronizar los trazos (el aviso global no lo dice: van con `report: false`). */
  syncError: string | null;
  /** Cuenta de fallos de sincronización: con el mismo texto repetido, el anuncio se vuelve a decir. */
  syncErrorSeq: number;
  undo(): void;
  redo(): void;
  clear(): void;
}

/**
 * Lo de quien dibuja: la herramienta, el color y el grosor, el trazo optimista (se ve al momento y se retira cuando el
 * servidor lo tiene entero), los trazos pendientes que salen en lotes cada 250 ms (con `report: false`: dibujar no borra
 * el aviso global) y deshacer, rehacer y limpiar (con aviso global, como cualquier acción). Ctrl+Z y Ctrl+Mayús+Z, solo
 * con `enabled` y fuera de los campos de texto. `resetKey` (la ronda) suelta el trazo a medias y lo pendiente.
 */
export function useSketchPad({ strokes, onAction, enabled, resetKey }: { strokes: readonly SketchmonStroke[]; onAction: GameAction; enabled: boolean; resetKey: number }): SketchPad {
  const [tool, setTool] = useState<SketchmonTool>('PENCIL');
  const [color, setColor] = useState<SketchmonColor>(SKETCHMON_COLORS[0]);
  const [width, setWidth] = useState<SketchWidth>(8);
  const [optimisticStroke, setOptimisticStroke] = useState<SketchmonStroke | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncErrorSeq, setSyncErrorSeq] = useState(0);
  const activePointer = useRef<number | null>(null);
  const activeStroke = useRef<SketchmonStroke | null>(null);
  const pendingOperations = useRef<DrawOperation[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionQueue = useRef<Promise<void>>(Promise.resolve());
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const dropStroke = () => { activePointer.current = null; activeStroke.current = null; setOptimisticStroke(null); };

  /** En orden: un lote no adelanta a otro. Los trazos enseñan su fallo en el lienzo; el resto, en el aviso global. */
  function queue(send: () => Promise<void>, local: boolean) {
    actionQueue.current = actionQueue.current.catch(() => undefined).then(send).catch((caught: unknown) => {
      dropStroke();
      if (!local) return;
      setSyncError(caught instanceof Error && caught.message ? caught.message : 'No se pudo sincronizar el dibujo.');
      setSyncErrorSeq((seq) => seq + 1);
    });
  }

  function scheduleFlush() {
    if (flushTimer.current) return;
    flushTimer.current = setTimeout(() => { flushTimer.current = null; flush(false); }, FLUSH_INTERVAL_MS);
  }

  function flush(all: boolean) {
    if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
    do {
      const { batch, rest } = takeDrawBatch(pendingOperations.current);
      pendingOperations.current = rest;
      if (batch.length) queue(() => sendDrawBatch(onActionRef.current, batch), true);
    } while (all && pendingOperations.current.length);
    if (pendingOperations.current.length) scheduleFlush();
  }

  function startStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!strokeStartAllowed(enabled, event)) return;
    event.currentTarget.setPointerCapture?.(event.pointerId); activePointer.current = event.pointerId; setSyncError(null);
    const first = pointFromEvent(event.currentTarget, event.nativeEvent);
    const stroke: SketchmonStroke = { id: crypto.randomUUID(), tool, color, width, points: [first] };
    activeStroke.current = stroke; setOptimisticStroke(stroke);
    pendingOperations.current = [...pendingOperations.current, { kind: 'START', stroke: { ...stroke, points: [{ ...first }] } }];
    if (tool === 'FILL') { activePointer.current = null; activeStroke.current = null; flush(true); } else scheduleFlush();
  }

  function continueStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const current = activeStroke.current;
    if (!current || activePointer.current !== event.pointerId) return;
    const nativeEvents = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    const additions: SketchmonPoint[] = [];
    let previous = current.points.at(-1)!;
    for (const nativeEvent of nativeEvents.length ? nativeEvents : [event.nativeEvent]) {
      const point = pointFromEvent(event.currentTarget, nativeEvent);
      if (farEnough(previous, point)) { additions.push(point); previous = point; }
    }
    if (!additions.length) return;
    current.points.push(...additions); setOptimisticStroke({ ...current, points: [...current.points] });
    pendingOperations.current = appendPendingPoints(pendingOperations.current, current.id, additions);
    scheduleFlush();
  }

  function finishStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (activePointer.current !== event.pointerId) return;
    continueStroke(event);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    activePointer.current = null; activeStroke.current = null;
    flush(true);
  }

  useEffect(() => {
    if (!optimisticStroke || activeStroke.current) return;
    const serverStroke = strokes.find((stroke) => stroke.id === optimisticStroke.id);
    if (serverStroke && serverStroke.points.length >= optimisticStroke.points.length) setOptimisticStroke(null);
  }, [optimisticStroke, strokes]);

  // Ronda nueva: fuera el trazo a medias, lo pendiente y el fallo de la anterior.
  const firstReset = useRef(true);
  useEffect(() => {
    if (firstReset.current) { firstReset.current = false; return; }
    if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
    pendingOperations.current = [];
    activePointer.current = null; activeStroke.current = null;
    setOptimisticStroke(null); setSyncError(null);
  }, [resetKey]);

  useEffect(() => () => { if (flushTimer.current) clearTimeout(flushTimer.current); }, []);

  function history(type: 'UNDO_STROKE' | 'REDO_STROKE' | 'CLEAR_DRAWING') {
    setSyncError(null); dropStroke();
    flush(true); queue(() => onActionRef.current({ type } satisfies SketchmonAction), false);
  }

  const historyRef = useRef(history);
  historyRef.current = history;
  const onKeyDown = useCallback((event: KeyboardEvent) => {
    const action = sketchmonHistoryShortcut(event, typingTarget(event.target));
    if (!action) return;
    event.preventDefault(); historyRef.current(action);
  }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, onKeyDown]);

  return {
    tool, setTool, color, setColor, width, setWidth, optimisticStroke, syncError, syncErrorSeq,
    handlers: { onPointerDown: startStroke, onPointerMove: continueStroke, onPointerUp: finishStroke },
    undo: () => history('UNDO_STROKE'), redo: () => history('REDO_STROKE'), clear: () => history('CLEAR_DRAWING'),
  };
}
