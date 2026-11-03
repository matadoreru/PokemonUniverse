import { describe, expect, it } from 'vitest';
import { normalizeBoardPointer, projectBoardCursor } from './who-is-who-cursor-position';

describe('Who is Who shared cursor coordinates', () => {
  const board = { left: 100, top: 50, width: 1_000, height: 500 };

  it('normalizes the corners and center relative to the team board', () => {
    expect(normalizeBoardPointer(100, 50, board)).toEqual({ x: 0, y: 0 });
    expect(normalizeBoardPointer(1_100, 550, board)).toEqual({ x: 1, y: 1 });
    expect(normalizeBoardPointer(600, 300, board)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('projects the same logical point accurately on a differently sized board', () => {
    const normalized = normalizeBoardPointer(530, 410, board);
    expect(normalized).toEqual({ x: 0.43, y: 0.72 });
    expect(projectBoardCursor(normalized!, 600, 300)).toMatchObject({ left: 258, top: 216 });
  });

  it('anchors to the same card after a responsive grid reflow', () => {
    const position = { x: 0.8, y: 0.2, pokemonId: 'forretress', cardX: 0.5, cardY: 0.6 };
    expect(projectBoardCursor(position, 320, 700, 8, { left: 42, top: 310, width: 70, height: 90 })).toMatchObject({ left: 77, top: 364 });
  });

  it('clamps pointer input and visual output at every edge', () => {
    expect(normalizeBoardPointer(-10, 900, board)).toEqual({ x: 0, y: 1 });
    expect(projectBoardCursor({ x: 0, y: 0 }, 400, 200)).toEqual({ left: 8, top: 8, labelBelow: true, labelLeft: false });
    expect(projectBoardCursor({ x: 1, y: 1 }, 400, 200)).toEqual({ left: 392, top: 192, labelBelow: false, labelLeft: true });
    expect(projectBoardCursor({ x: 0.5, y: 0.5 }, 400, 200)).toEqual({ left: 200, top: 100, labelBelow: false, labelLeft: false });
  });

  it('rejects invalid or dimensionless board measurements', () => {
    expect(normalizeBoardPointer(Number.NaN, 10, board)).toBeNull();
    expect(normalizeBoardPointer(10, 10, { ...board, width: 0 })).toBeNull();
    expect(normalizeBoardPointer(10, 10, { ...board, height: Number.POSITIVE_INFINITY })).toBeNull();
  });
});
