import type { PrismaClient } from '@prisma/client';

export interface MoveRepository {
  findById(id: string): Promise<{ id: string; name: string; type: string; category: string } | null>;
  levelUpLearnset(pokemonId: string, generation: number): Promise<Array<{ level: number; move: { id: string; name: string; type: string; category: string } }>>;
}

export class PrismaMoveRepository implements MoveRepository {
  constructor(private readonly db: PrismaClient) {}
  findById(id: string) { return this.db.move.findUnique({ where: { id }, select: { id: true, name: true, type: true, category: true } }); }
  async levelUpLearnset(pokemonId: string, generation: number) {
    return this.db.pokemonLevelUpMove.findMany({ where: { pokemonId, referenceGeneration: generation }, orderBy: [{ level: 'asc' }, { move: { name: 'asc' } }], select: { level: true, move: { select: { id: true, name: true, type: true, category: true } } } });
  }
}
