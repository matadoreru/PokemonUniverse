import { Eraser, PaintBucket, Pencil, Redo2, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { SKETCHMON_COLORS, type SketchmonAction, type SketchmonPoint, type SketchmonStroke, type SketchmonTool } from '@pokemon-universe/shared';

type DrawBatchAction = Extract<SketchmonAction, { type: 'DRAW_BATCH' }>;
type DrawOperation = DrawBatchAction['operations'][number];

const WIDTHS = [4, 8, 14, 22] as const;
const FLUSH_INTERVAL_MS = 250;
const POINT_DISTANCE = 0.002;
const COLOR_LABELS: Record<(typeof SKETCHMON_COLORS)[number], string> = {
  '#182033': 'Negro', '#ffffff': 'Blanco', '#7b8496': 'Gris', '#e24671': 'Rosa',
  '#ef4444': 'Rojo', '#f97316': 'Naranja', '#e1a817': 'Amarillo', '#84cc16': 'Lima',
  '#27965c': 'Verde', '#10a6c3': 'Turquesa', '#2563eb': 'Azul', '#7457c7': 'Morado',
  '#d946ef': 'Magenta', '#9a5b3c': 'Marrón',
};

export function sketchmonHistoryShortcut(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key'>): 'UNDO_STROKE' | 'REDO_STROKE' | null {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return null;
  return event.shiftKey ? 'REDO_STROKE' : 'UNDO_STROKE';
}

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
  const bounds = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  };
}

function farEnough(left: SketchmonPoint, right: SketchmonPoint): boolean {
  return Math.hypot(left.x - right.x, left.y - right.y) >= POINT_DISTANCE;
}

export function SketchmonCanvasSurface({ strokes, label, optimisticStroke = null, onPointerDown, onPointerMove, onPointerUp }: {
  strokes: readonly SketchmonStroke[];
  label: string;
  optimisticStroke?: SketchmonStroke | null;
  onPointerDown?(event: ReactPointerEvent<HTMLCanvasElement>): void;
  onPointerMove?(event: ReactPointerEvent<HTMLCanvasElement>): void;
  onPointerUp?(event: ReactPointerEvent<HTMLCanvasElement>): void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef({ strokes, optimisticStroke });
  drawingRef.current = { strokes, optimisticStroke };
  const editable = Boolean(onPointerDown);
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
  return <canvas
    ref={canvasRef}
    className={`sketchmon-canvas ${editable ? 'cursor-crosshair' : 'cursor-default'}`}
    aria-label={label}
    role="img"
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerUp}
    onContextMenu={(event) => { if (editable) event.preventDefault(); }}
  />;
}

export function SketchmonCanvas({ strokes, onAction }: { strokes: readonly SketchmonStroke[]; onAction(action: unknown): Promise<void> }) {
  const [tool, setTool] = useState<SketchmonTool>('PENCIL');
  const [color, setColor] = useState<(typeof SKETCHMON_COLORS)[number]>(SKETCHMON_COLORS[0]);
  const [width, setWidth] = useState<(typeof WIDTHS)[number]>(8);
  const [optimisticStroke, setOptimisticStroke] = useState<SketchmonStroke | null>(null);
  const [error, setError] = useState('');
  const activePointer = useRef<number | null>(null);
  const activeStroke = useRef<SketchmonStroke | null>(null);
  const pendingOperations = useRef<DrawOperation[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionQueue = useRef<Promise<void>>(Promise.resolve());

  function queueAction(action: unknown) {
    actionQueue.current = actionQueue.current.catch(() => undefined).then(() => onAction(action)).catch((caught: unknown) => {
      activePointer.current = null; activeStroke.current = null; setOptimisticStroke(null);
      setError(caught instanceof Error ? caught.message : 'No se pudo sincronizar el dibujo.');
    });
  }

  function scheduleFlush() {
    if (flushTimer.current) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null; flush(false);
    }, FLUSH_INTERVAL_MS);
  }

  function flush(all: boolean) {
    if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
    do {
      const operations = pendingOperations.current.splice(0, 8);
      if (operations.length) queueAction({ type: 'DRAW_BATCH', operations } satisfies SketchmonAction);
    } while (all && pendingOperations.current.length);
    if (pendingOperations.current.length) scheduleFlush();
  }

  function appendPending(strokeId: string, points: SketchmonPoint[]) {
    for (const point of points) {
      const last = pendingOperations.current.at(-1);
      if (last?.kind === 'APPEND' && last.strokeId === strokeId && last.points.length < 32) last.points.push(point);
      else pendingOperations.current.push({ kind: 'APPEND', strokeId, points: [point] });
    }
    scheduleFlush();
  }

  function startStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.currentTarget.setPointerCapture(event.pointerId); activePointer.current = event.pointerId; setError('');
    const first = pointFromEvent(event.currentTarget, event.nativeEvent);
    const stroke: SketchmonStroke = {
      id: crypto.randomUUID(), tool, color, width, points: [first],
    };
    activeStroke.current = stroke; setOptimisticStroke(stroke);
    pendingOperations.current.push({ kind: 'START', stroke: { ...stroke, points: [{ ...first }] } });
    if (tool === 'FILL') {
      activePointer.current = null; activeStroke.current = null; flush(true);
    } else scheduleFlush();
  }

  function continueStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const current = activeStroke.current;
    if (!current || activePointer.current !== event.pointerId) return;
    const nativeEvents = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    const additions: SketchmonPoint[] = [];
    let previous = current.points.at(-1)!;
    for (const nativeEvent of nativeEvents) {
      const point = pointFromEvent(event.currentTarget, nativeEvent);
      if (farEnough(previous, point)) { additions.push(point); previous = point; }
    }
    if (!additions.length) return;
    current.points.push(...additions); setOptimisticStroke({ ...current, points: [...current.points] });
    appendPending(current.id, additions.map((point) => ({ ...point })));
  }

  function finishStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (activePointer.current !== event.pointerId) return;
    continueStroke(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    activePointer.current = null; activeStroke.current = null;
    flush(true);
  }

  useEffect(() => {
    if (!optimisticStroke || activeStroke.current) return;
    const serverStroke = strokes.find((stroke) => stroke.id === optimisticStroke.id);
    if (serverStroke && serverStroke.points.length >= optimisticStroke.points.length) setOptimisticStroke(null);
  }, [optimisticStroke, strokes]);

  useEffect(() => () => { if (flushTimer.current) clearTimeout(flushTimer.current); }, []);

  function undo() {
    setError(''); setOptimisticStroke(null); activeStroke.current = null; activePointer.current = null;
    flush(true); queueAction({ type: 'UNDO_STROKE' } satisfies SketchmonAction);
  }

  function redo() {
    setError(''); setOptimisticStroke(null); activeStroke.current = null; activePointer.current = null;
    flush(true); queueAction({ type: 'REDO_STROKE' } satisfies SketchmonAction);
  }

  function clear() {
    setError(''); setOptimisticStroke(null); activeStroke.current = null; activePointer.current = null;
    flush(true); queueAction({ type: 'CLEAR_DRAWING' } satisfies SketchmonAction);
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = sketchmonHistoryShortcut(event); if (!action) return;
      event.preventDefault(); if (action === 'REDO_STROKE') redo(); else undo();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const empty = strokes.length === 0 && !optimisticStroke;
  return <div>
    <div className="relative overflow-hidden rounded-xl border border-night/15 bg-white shadow-inner">
      <SketchmonCanvasSurface strokes={strokes} optimisticStroke={optimisticStroke} label="Lienzo de Sketchmon. Arrastra para dibujar o toca para rellenar." onPointerDown={startStroke} onPointerMove={continueStroke} onPointerUp={finishStroke} />
      {empty && <div className="pointer-events-none absolute inset-0 grid place-items-center"><span className="rounded-full bg-night/70 px-3 py-1.5 text-sm font-extrabold text-white">Empieza tu dibujo</span></div>}
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Herramientas de dibujo">
      <div className="flex rounded-xl border border-ink/10 bg-surface-raised p-1" role="group" aria-label="Herramienta">
        <button type="button" className={`icon-button ${tool === 'PENCIL' ? 'bg-aqua/15 text-aqua' : ''}`} aria-pressed={tool === 'PENCIL'} aria-label="Lápiz" onClick={() => setTool('PENCIL')}><Pencil size={20} /></button>
        <button type="button" className={`icon-button ${tool === 'ERASER' ? 'bg-aqua/15 text-aqua' : ''}`} aria-pressed={tool === 'ERASER'} aria-label="Goma" onClick={() => setTool('ERASER')}><Eraser size={20} /></button>
        <button type="button" className={`icon-button ${tool === 'FILL' ? 'bg-aqua/15 text-aqua' : ''}`} aria-pressed={tool === 'FILL'} aria-label="Relleno" onClick={() => setTool('FILL')}><PaintBucket size={20} /></button>
      </div>
      <div className="flex min-h-12 items-center gap-1 rounded-xl border border-ink/10 bg-surface-raised px-2" role="group" aria-label="Grosor">
        {WIDTHS.map((option) => <button type="button" key={option} className={`grid h-10 w-10 place-items-center rounded-lg ${width === option ? 'bg-electric/15 ring-2 ring-electric' : 'hover:bg-ink/[.07]'}`} aria-label={`Grosor ${option}`} aria-pressed={width === option} onClick={() => setWidth(option)}><span className="rounded-full bg-ink" style={{ width: Math.max(4, option), height: Math.max(4, option) }} /></button>)}
      </div>
      <div className="flex min-h-12 flex-wrap items-center gap-0.5 rounded-xl border border-ink/10 bg-surface-raised p-1.5" role="group" aria-label="Color">
        {SKETCHMON_COLORS.map((option) => <button type="button" key={option} className={`grid h-8 w-8 place-items-center rounded-md ${color === option ? 'ring-2 ring-aqua' : 'hover:bg-ink/[.07]'}`} aria-label={`Color ${COLOR_LABELS[option]}`} aria-pressed={color === option} onClick={() => setColor(option)}><span className="h-5 w-5 rounded-full border border-night/25" style={{ backgroundColor: option }} /></button>)}
      </div>
      <div className="ml-auto flex gap-1">
        <button type="button" className="icon-button border border-ink/10 bg-surface-raised" aria-label="Deshacer último trazo" onClick={undo}><Undo2 size={20} /></button>
        <button type="button" className="icon-button border border-ink/10 bg-surface-raised" aria-label="Rehacer último trazo" onClick={redo}><Redo2 size={20} /></button>
        <button type="button" className="icon-button border border-berry/20 bg-berry/[.06] text-berry" aria-label="Limpiar lienzo" onClick={clear}><Trash2 size={20} /></button>
      </div>
    </div>
    <p className="mt-2 text-xs font-bold text-ink/55">Lápiz, goma y relleno. Ctrl+Z deshace; Ctrl+Mayús+Z rehace.</p>
    {error && <p className="status-error mt-2" role="alert">{error}</p>}
  </div>;
}
