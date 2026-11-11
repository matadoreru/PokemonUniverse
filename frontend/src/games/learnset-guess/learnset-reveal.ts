import type { LearnsetMoveHint } from '@pokemon-universe/shared/public';

const moveKey = (move: LearnsetMoveHint) => `${move.moveId}:${move.level}`;

/** Marca qué entradas del learnset llegaron a verse. Es un multiconjunto: con niveles ocultos, un movimiento repetido se marca tantas veces como se reveló. */
export function revealedLearnsetFlags(learnset: LearnsetMoveHint[], revealedMoves: LearnsetMoveHint[]): boolean[] {
  const remaining = new Map<string, number>();
  for (const move of revealedMoves) remaining.set(moveKey(move), (remaining.get(moveKey(move)) ?? 0) + 1);
  return learnset.map((move) => {
    const count = remaining.get(moveKey(move)) ?? 0;
    if (count <= 0) return false;
    remaining.set(moveKey(move), count - 1);
    return true;
  });
}
