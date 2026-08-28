import type { PrismaClient } from '@prisma/client';

export interface TcgCardRepository {
  findById(id: string): Promise<unknown>;
  count(): Promise<number>;
}

export class PrismaTcgCardRepository implements TcgCardRepository {
  constructor(private readonly db: PrismaClient) {}
  findById(id: string): Promise<unknown> {
    return this.db.tcgCard.findUnique({ where: { id }, include: { set: true, pokemon: { include: { pokemon: true } }, prices: true } });
  }
  count(): Promise<number> { return this.db.tcgCard.count(); }
}
