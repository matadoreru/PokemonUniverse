import { SKETCHMON_COLORS, type SketchmonPublicState, type SketchmonRoundResult } from '@pokemon-universe/shared/public';
import { describe, expect, it, vi } from 'vitest';
import {
  appendPendingPoints, farEnough, nextPaletteIndex, normalizedPoint, sendDrawBatch, SKETCH_COLOR_NAMES, SKETCH_WIDTHS, sketchAnnouncement, sketchCanvasLabel,
  sketchHeading, sketchmonHistoryShortcut, sketchRevealSummary, sketchSeconds, sketchStatsLine, sketchTurnStatus, sketchVerdict, strokeStartAllowed, takeDrawBatch, type DrawOperation,
} from './presentation';

describe('Sketchmon: herramientas', () => {
  it('sin `canDraw` una pulsación no empieza trazo; con él, solo el puntero principal y el botón izquierdo', () => {
    const mouse = { isPrimary: true, pointerType: 'mouse', button: 0 };
    expect(strokeStartAllowed(false, mouse)).toBe(false);
    expect(strokeStartAllowed(false, { ...mouse, pointerType: 'touch' })).toBe(false);
    expect(strokeStartAllowed(true, mouse)).toBe(true);
    expect(strokeStartAllowed(true, { ...mouse, button: 2 })).toBe(false);
    expect(strokeStartAllowed(true, { ...mouse, isPrimary: false })).toBe(false);
    expect(strokeStartAllowed(true, { isPrimary: true, pointerType: 'pen', button: -1 })).toBe(true);
  });

  it('cada color de la paleta del motor tiene un nombre propio (el color nunca va solo)', () => {
    const names = SKETCHMON_COLORS.map((color) => SKETCH_COLOR_NAMES[color]);
    expect(names.every((name) => typeof name === 'string' && name.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(SKETCHMON_COLORS.length);
  });

  it('los grosores tienen nombre y caben en el esquema del motor (2–32)', () => {
    expect(SKETCH_WIDTHS.map((width) => width.name)).toEqual(['Fino', 'Medio', 'Grueso', 'Muy grueso']);
    expect(SKETCH_WIDTHS.every(({ value }) => value >= 2 && value <= 32)).toBe(true);
  });

  it('la paleta se recorre con flechas circulares, Inicio y Fin', () => {
    expect(nextPaletteIndex(0, 'ArrowRight', 14)).toBe(1);
    expect(nextPaletteIndex(13, 'ArrowRight', 14)).toBe(0);
    expect(nextPaletteIndex(0, 'ArrowLeft', 14)).toBe(13);
    expect(nextPaletteIndex(4, 'ArrowDown', 14)).toBe(5);
    expect(nextPaletteIndex(4, 'ArrowUp', 14)).toBe(3);
    expect(nextPaletteIndex(7, 'Home', 14)).toBe(0);
    expect(nextPaletteIndex(7, 'End', 14)).toBe(13);
    expect(nextPaletteIndex(-1, 'ArrowRight', 14)).toBe(0);
    expect(nextPaletteIndex(3, 'Enter', 14)).toBeNull();
    expect(nextPaletteIndex(0, 'ArrowRight', 0)).toBeNull();
  });

  it('Ctrl+Z deshace y Ctrl+Mayús+Z rehace, salvo escribiendo en un campo', () => {
    expect(sketchmonHistoryShortcut({ ctrlKey: true, metaKey: false, shiftKey: false, key: 'z' })).toBe('UNDO_STROKE');
    expect(sketchmonHistoryShortcut({ ctrlKey: false, metaKey: true, shiftKey: true, key: 'Z' })).toBe('REDO_STROKE');
    expect(sketchmonHistoryShortcut({ ctrlKey: false, metaKey: false, shiftKey: false, key: 'z' })).toBeNull();
    expect(sketchmonHistoryShortcut({ ctrlKey: true, metaKey: false, shiftKey: false, key: 'y' })).toBeNull();
    expect(sketchmonHistoryShortcut({ ctrlKey: true, metaKey: false, shiftKey: false, key: 'z' }, true)).toBeNull();
  });

  it('el nombre del lienzo dice qué hace la herramienta', () => {
    expect(sketchCanvasLabel('PENCIL')).toContain('arrastra para dibujar');
    expect(sketchCanvasLabel('ERASER')).toContain('arrastra para borrar');
    expect(sketchCanvasLabel('FILL')).toContain('toca una zona para pintarla');
  });

  it('los puntos se normalizan al lienzo (0–1) y se descartan los que no se mueven', () => {
    const bounds = { left: 10, top: 20, width: 400, height: 300 };
    expect(normalizedPoint(bounds, 210, 170)).toEqual({ x: 0.5, y: 0.5 });
    expect(normalizedPoint(bounds, -50, 900)).toEqual({ x: 0, y: 1 });
    expect(normalizedPoint({ left: 0, top: 0, width: 0, height: 0 }, 5, 5)).toEqual({ x: 0, y: 0 });
    expect(farEnough({ x: 0.1, y: 0.1 }, { x: 0.1005, y: 0.1 })).toBe(false);
    expect(farEnough({ x: 0.1, y: 0.1 }, { x: 0.11, y: 0.1 })).toBe(true);
  });

  it('los puntos de un trazo se agrupan en operaciones de hasta 32 y en lotes de hasta 8 (sin tocar la lista de entrada)', () => {
    const start: DrawOperation = { kind: 'START', stroke: { id: 's1', tool: 'PENCIL', color: '#182033', width: 8, points: [{ x: 0, y: 0 }] } };
    const points = Array.from({ length: 40 }, (_, index) => ({ x: index / 100, y: 0.5 }));
    const before = [start];
    const pending = appendPendingPoints(before, 's1', points);
    expect(before).toHaveLength(1);
    expect(pending.map((operation) => operation.kind)).toEqual(['START', 'APPEND', 'APPEND']);
    expect(pending[1]!.kind === 'APPEND' && pending[1]!.points.length).toBe(32);
    expect(pending[2]!.kind === 'APPEND' && pending[2]!.points.length).toBe(8);
    // Otro trazo abre su propia operación.
    expect(appendPendingPoints(pending, 's2', [{ x: 1, y: 1 }]).at(-1)).toEqual({ kind: 'APPEND', strokeId: 's2', points: [{ x: 1, y: 1 }] });
    const many = Array.from({ length: 11 }, (_, index): DrawOperation => ({ kind: 'APPEND', strokeId: `s${index}`, points: [{ x: 0, y: 0 }] }));
    const { batch, rest } = takeDrawBatch(many);
    expect(batch).toHaveLength(8);
    expect(rest).toHaveLength(3);
  });

  it('los trazos se envían sin aviso global (`report: false`): dibujar no borra el error de otra acción', async () => {
    const onAction = vi.fn(async () => undefined);
    const operations: DrawOperation[] = [{ kind: 'APPEND', strokeId: 's1', points: [{ x: 0.2, y: 0.2 }] }];
    await sendDrawBatch(onAction, operations);
    expect(onAction).toHaveBeenCalledWith({ type: 'DRAW_BATCH', operations }, { report: false });
  });
});

const round: SketchmonRoundResult = {
  reason: 'GUESSED', pokemon: { id: 'lucario', name: 'Lucario', sprite: '/l.png', generation: 4, types: ['fighting'] },
  drawerId: 'p1', winnerId: 'p2', elapsedMs: 9_050, guesserPoints: 5, drawerPoints: 3, winnerAttemptCount: 1, drawing: [],
};
const nameOf = (id: string) => ({ p1: 'Ana', p2: 'Pedro', p3: 'Carlos' })[id] ?? 'Entrenador';
const typeLabel = (type: string) => (type === 'fighting' ? 'Lucha' : type);

describe('Sketchmon: pantalla', () => {
  it('el orden de turnos en texto: dibuja ahora, siguiente, ya dibujó y le toca después', () => {
    const game: Pick<SketchmonPublicState, 'phase' | 'roundNumber' | 'drawerOrder' | 'drawerId' | 'nextDrawerId' | 'lastRound'> = {
      phase: 'ROUND_ACTIVE', roundNumber: 2, drawerOrder: ['p1', 'p2', 'p3', 'p4'], drawerId: 'p2', nextDrawerId: 'p3', lastRound: null,
    };
    expect(['p1', 'p2', 'p3', 'p4'].map((id) => sketchTurnStatus(game, id))).toEqual(['done', 'drawing', 'next', 'pending']);
    expect(sketchTurnStatus({ ...game, phase: 'ROUND_RESULTS', lastRound: { ...round, drawerId: 'p2' } }, 'p2')).toBe('drew');
  });

  it('el título solo nombra el secreto con el estado de quien dibuja', () => {
    expect(sketchHeading({ phase: 'ROUND_ACTIVE', role: 'drawer', drawerName: 'Ana', secretName: 'Lucario', result: null })).toBe('Dibuja a Lucario');
    expect(sketchHeading({ phase: 'ROUND_ACTIVE', role: 'guesser', drawerName: 'Ana', secretName: null, result: null })).toBe('¿Qué Pokémon dibuja Ana?');
    expect(sketchHeading({ phase: 'ROUND_ACTIVE', role: 'watcher', drawerName: 'Ana', secretName: null, result: null })).toBe('Ana está dibujando');
    expect(sketchHeading({ phase: 'ROUND_RESULTS', role: 'guesser', drawerName: 'Ana', secretName: null, result: round })).toBe('¡Era Lucario!');
  });

  it('la revelación dice quién acertó, en cuántos intentos y en cuánto tiempo, o que se acabó el tiempo', () => {
    expect(sketchSeconds(9_050)).toBe('9,1 s');
    expect(sketchRevealSummary(round, nameOf)).toBe('Pedro acertó Lucario en 1 intento (9,1 s).');
    expect(sketchRevealSummary({ ...round, winnerId: null, reason: 'TIMEOUT' }, nameOf)).toBe('Se acabó el tiempo: nadie lo adivinó. Era Lucario.');
  });

  it('la región viva: inicio, fallo propio, pista, fallo de sincronización (solo quien dibuja) y revelación', () => {
    const base = { phase: 'ROUND_ACTIVE' as const, roundNumber: 1, drawerName: 'Ana', secretName: null, ownLast: null, hints: [], syncError: null, result: null, nameOf, typeLabel };
    expect(sketchAnnouncement({ ...base, role: 'guesser' })).toBe('Dibujo 1: dibuja Ana. Busca el Pokémon cuando lo sepas.');
    expect(sketchAnnouncement({ ...base, role: 'drawer', secretName: 'Lucario' })).toContain('te toca dibujar a Lucario');
    expect(sketchAnnouncement({ ...base, role: 'drawer', syncError: 'El dibujo ha alcanzado el límite de puntos.' })).toBe('El dibujo ha alcanzado el límite de puntos.');
    expect(sketchAnnouncement({ ...base, role: 'guesser', syncError: 'x' })).not.toBe('x');
    expect(sketchAnnouncement({ ...base, role: 'guesser', hints: [{ kind: 'TYPES', types: ['fighting'] }] })).toBe('Pista: Tipo: Lucha.');
    expect(sketchAnnouncement({ ...base, role: 'guesser', ownLast: { playerId: 'p2', guessedPokemon: { id: 'riolu', name: 'Riolu', sprite: '' }, attemptedAt: 1 } })).toContain('Riolu no era.');
    expect(sketchAnnouncement({ ...base, role: 'guesser', phase: 'ROUND_RESULTS', result: round })).toBe('Dibujo 1 terminado. Pedro acertó Lucario en 1 intento (9,1 s).');
  });

  it('un fallo de sincronización repetido con el mismo texto cambia el anuncio para volver a decirse', () => {
    const base = { phase: 'ROUND_ACTIVE' as const, roundNumber: 1, role: 'drawer' as const, drawerName: 'Ana', secretName: null, ownLast: null, hints: [], result: null, nameOf, typeLabel };
    const error = 'El dibujo ha alcanzado el límite de puntos.';
    const first = sketchAnnouncement({ ...base, syncError: error, syncErrorSeq: 1 });
    const second = sketchAnnouncement({ ...base, syncError: error, syncErrorSeq: 2 });
    expect(first).not.toBe(second);
    expect(first.trim()).toBe(error);
    expect(second.trim()).toBe(error);
  });

  it('el veredicto propio de la revelación', () => {
    expect(sketchVerdict(round, 'p2', true)).toEqual({ tone: 'ok', text: '¡Lo adivinaste en 1 intento!', points: 5 });
    expect(sketchVerdict(round, 'p1', true)).toEqual({ tone: 'ok', text: 'Tu dibujo funcionó', points: 3 });
    expect(sketchVerdict({ ...round, winnerId: null }, 'p1', true)).toEqual({ tone: 'bad', text: 'Nadie adivinó tu dibujo', points: 0 });
    expect(sketchVerdict(round, 'p3', true).text).toBe('Otro jugador lo adivinó antes');
    expect(sketchVerdict(round, 'p4', false).text).toBe('Estás observando');
  });

  it('la línea de métricas de los resultados', () => {
    expect(sketchStatsLine({ guessedPokemon: 2, firstTry: 1, drawingSuccesses: 1, drawingRounds: 1, pointsFromGuessing: 9, pointsFromDrawing: 3 }))
      .toBe('2 adivinados · 1 al primer intento · 1/1 dibujos descubiertos · +9 adivinando · +3 dibujando');
  });
});
