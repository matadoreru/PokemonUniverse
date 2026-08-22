/** Dynamic scoring: field-size base plus a podium multiplier. */
export function pointsForPosition(playerCount: number, position: number): number {
  if (!Number.isInteger(playerCount) || !Number.isInteger(position) || playerCount < 1 || position < 1 || position > playerCount) {
    throw new RangeError('Invalid player count or position');
  }
  const base = playerCount - position + 1;
  if (position === 1) return base * 2;
  if (position === 2) return Math.ceil(base * 1.5);
  if (position === 3) return Math.ceil(base * 1.2);
  return base;
}
