import type { WhoIsWhoCursorPosition } from '@pokemon-universe/shared';

export interface BoardRect { left: number; top: number; width: number; height: number }
export interface LocalCardRect { left: number; top: number; width: number; height: number }
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function normalizeBoardPointer(clientX: number, clientY: number, rect: BoardRect): WhoIsWhoCursorPosition | null {
  if (![clientX, clientY, rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return null;
  return { x: clamp((clientX - rect.left) / rect.width, 0, 1), y: clamp((clientY - rect.top) / rect.height, 0, 1) };
}

export function projectBoardCursor(position: WhoIsWhoCursorPosition, width: number, height: number, edgeInset = 8, card?: LocalCardRect): { left: number; top: number; labelBelow: boolean; labelLeft: boolean } {
  const safeWidth = Math.max(0, width); const safeHeight = Math.max(0, height); const insetX = Math.min(edgeInset, safeWidth / 2); const insetY = Math.min(edgeInset, safeHeight / 2);
  const logicalX = card && position.cardX !== undefined ? card.left + position.cardX * card.width : position.x * safeWidth;
  const logicalY = card && position.cardY !== undefined ? card.top + position.cardY * card.height : position.y * safeHeight;
  const left = clamp(logicalX, insetX, safeWidth - insetX); const top = clamp(logicalY, insetY, safeHeight - insetY);
  return { left, top, labelBelow: top < safeHeight * 0.18, labelLeft: left > safeWidth * 0.72 };
}
