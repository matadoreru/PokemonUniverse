import type { PrismaClient } from '@prisma/client';

export interface TcgPriceRow {
  provider: string; currency: string; variant: string; market: string | null; observedAt: Date;
}
export interface TcgCatalogCardRow {
  id: string; localId: string | null; name: string; rarity: string | null; imageUrl: string | null;
  set: { id: string; name: string }; pokemonGenerations: number[]; prices: TcgPriceRow[];
}

export interface TcgCardRepository {
  findById(id: string): Promise<unknown>;
  count(): Promise<number>;
  loadComparableCards(): Promise<TcgCatalogCardRow[]>;
}

export class PrismaTcgCardRepository implements TcgCardRepository {
  constructor(private readonly db: PrismaClient) {}
  findById(id: string): Promise<unknown> {
    return this.db.tcgCard.findUnique({ where: { id }, include: { set: true, pokemon: { include: { pokemon: true } }, prices: true } });
  }
  count(): Promise<number> { return this.db.tcgCard.count(); }
  async loadComparableCards(): Promise<TcgCatalogCardRow[]> {
    const cards = await this.db.tcgCard.findMany({
      where: { imageUrl: { not: null }, prices: { some: { market: { not: null } } } },
      select: { id: true, localId: true, name: true, rarity: true, imageUrl: true, set: { select: { id: true, name: true } }, pokemon: { select: { pokemon: { select: { generation: true } } } }, prices: { where: { market: { not: null } }, select: { provider: true, currency: true, variant: true, market: true, observedAt: true } } },
    });
    return cards.map(({ pokemon, ...card }) => ({ ...card, pokemonGenerations: [...new Set(pokemon.map((relation) => relation.pokemon.generation))], prices: card.prices.map((price) => ({ ...price, market: price.market?.toString() ?? null })) }));
  }
}
