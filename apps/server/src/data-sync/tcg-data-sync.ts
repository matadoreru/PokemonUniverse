import { Prisma, type DataSyncMode } from '@prisma/client';
import { prisma } from '../db.js';
import { SyncHttpClient } from './http-client.js';
import type { DataSyncAdapter, SyncResult } from './types.js';

const BASE_URL = 'https://api.tcgdex.net/v2/en';
interface TcgListItem { id: string; localId?: string; name: string; image?: string }
interface TcgSetPayload extends TcgListItem { series?: { id?: string; name?: string } | string; logo?: string; symbol?: string; releaseDate?: string; cardCount?: { total?: number; official?: number }; cards?: TcgListItem[] }
interface TcgCardPayload extends TcgListItem { category?: string; hp?: number; rarity?: string; illustrator?: string; dexId?: number[]; set?: { id: string }; pricing?: unknown; variants?: unknown; updated?: string }

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function imageUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /\.(png|webp|jpe?g)$/i.test(value) ? value : `${value}/high.webp`;
}

interface PriceLeaf { provider: string; currency: string; variant: string; market: number | undefined; low: number | undefined; mid: number | undefined; high: number | undefined; trend: number | undefined; metadata: Prisma.InputJsonValue }
export function priceLeaves(value: unknown): PriceLeaf[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const pricing = value as Record<string, unknown>; const leaves: PriceLeaf[] = [];
  const number = (record: Record<string, unknown>, key: string): number | undefined => typeof record[key] === 'number' ? record[key] : undefined;
  for (const [provider, raw] of Object.entries(pricing)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>; const currency = typeof record.unit === 'string' ? record.unit : provider === 'tcgplayer' ? 'USD' : 'EUR';
    if (provider === 'cardmarket') {
      leaves.push({ provider, currency, variant: 'standard', market: number(record, 'avg'), low: number(record, 'low'), mid: undefined, high: undefined, trend: number(record, 'trend'), metadata: json(record) });
      if (number(record, 'avg-holo') !== undefined || number(record, 'low-holo') !== undefined) leaves.push({ provider, currency, variant: 'holo', market: number(record, 'avg-holo'), low: number(record, 'low-holo'), mid: undefined, high: undefined, trend: number(record, 'trend-holo'), metadata: json(record) });
      continue;
    }
    for (const [variant, rawVariant] of Object.entries(record)) {
      if (variant === 'unit' || variant === 'updated' || !rawVariant || typeof rawVariant !== 'object' || Array.isArray(rawVariant)) continue;
      const prices = rawVariant as Record<string, unknown>;
      leaves.push({ provider, currency, variant, market: number(prices, 'marketPrice'), low: number(prices, 'lowPrice'), mid: number(prices, 'midPrice'), high: number(prices, 'highPrice'), trend: undefined, metadata: json(prices) });
    }
  }
  return leaves.filter((price) => price.market !== undefined || price.low !== undefined || price.mid !== undefined || price.high !== undefined || price.trend !== undefined);
}

export class TcgDataSync implements DataSyncAdapter {
  readonly source = 'TCGDEX' as const;
  constructor(private readonly http = new SyncHttpClient()) {}

  recordsAvailable(): Promise<number> { return prisma.tcgCard.count(); }

  async run(mode: DataSyncMode): Promise<SyncResult> {
    const existingIds = new Set((await prisma.tcgCard.findMany({ select: { id: true } })).map((row) => row.id));
    let cardIds: string[];
    if (mode === 'PRICE_REFRESH' && existingIds.size > 0) {
      cardIds = [...existingIds];
    } else {
      const sets = await this.http.json<TcgListItem[]>(`${BASE_URL}/sets`, 'TCGdex sets');
      cardIds = [];
      for (const setSummary of sets) {
        const set = await this.http.json<TcgSetPayload>(`${BASE_URL}/sets/${encodeURIComponent(setSummary.id)}`, `TCGdex set ${setSummary.id}`);
        await prisma.tcgSet.upsert({
          where: { id: set.id },
          create: { id: set.id, name: set.name, series: (typeof set.series === 'string' ? set.series : set.series?.name) ?? null, logoUrl: set.logo ?? null, symbolUrl: set.symbol ?? null, releaseDate: set.releaseDate ? new Date(set.releaseDate) : null, cardCount: set.cardCount?.total ?? set.cardCount?.official ?? null, metadata: json(set), sourceUpdatedAt: new Date() },
          update: { name: set.name, series: (typeof set.series === 'string' ? set.series : set.series?.name) ?? null, logoUrl: set.logo ?? null, symbolUrl: set.symbol ?? null, releaseDate: set.releaseDate ? new Date(set.releaseDate) : null, cardCount: set.cardCount?.total ?? set.cardCount?.official ?? null, metadata: json(set), sourceUpdatedAt: new Date() },
        });
        cardIds.push(...(set.cards ?? []).map((card) => card.id));
      }
    }

    let inserted = 0; let updated = 0; let skipped = 0;
    const uniqueIds = [...new Set(cardIds)];
    for (let start = 0; start < uniqueIds.length; start += 20) {
      const cards = await Promise.all(uniqueIds.slice(start, start + 20).map((id) => this.http.json<TcgCardPayload>(`${BASE_URL}/cards/${encodeURIComponent(id)}`, `TCGdex card ${id}`)));
      for (const card of cards) {
        const setId = card.set?.id;
        if (!setId) { skipped += 1; continue; }
        const exists = existingIds.has(card.id);
        if (mode !== 'PRICE_REFRESH' || !exists) {
          await prisma.tcgCard.upsert({
            where: { id: card.id },
            create: { id: card.id, localId: card.localId ?? null, setId, name: card.name, category: card.category ?? null, hp: card.hp ?? null, rarity: card.rarity ?? null, imageUrl: imageUrl(card.image) ?? null, illustrator: card.illustrator ?? null, metadata: json(card), sourceUpdatedAt: card.updated ? new Date(card.updated) : new Date() },
            update: { localId: card.localId ?? null, setId, name: card.name, category: card.category ?? null, hp: card.hp ?? null, rarity: card.rarity ?? null, imageUrl: imageUrl(card.image) ?? null, illustrator: card.illustrator ?? null, metadata: json(card), sourceUpdatedAt: card.updated ? new Date(card.updated) : new Date() },
          });
          if (exists) updated += 1; else { inserted += 1; existingIds.add(card.id); }
          const related = card.dexId?.length ? await prisma.pokemon.findMany({ where: { nationalDexNumber: { in: card.dexId }, isDefault: true }, select: { id: true } }) : [];
          await prisma.tcgCardPokemon.createMany({ data: related.map((pokemon) => ({ cardId: card.id, pokemonId: pokemon.id })), skipDuplicates: true });
        } else updated += 1;
        for (const price of priceLeaves(card.pricing)) {
          await prisma.tcgCardPrice.upsert({
            where: { cardId_provider_currency_variant: { cardId: card.id, provider: price.provider, currency: price.currency, variant: price.variant } },
            create: { cardId: card.id, provider: price.provider, currency: price.currency, variant: price.variant, market: price.market ?? null, low: price.low ?? null, mid: price.mid ?? null, high: price.high ?? null, trend: price.trend ?? null, metadata: price.metadata },
            update: { market: price.market ?? null, low: price.low ?? null, mid: price.mid ?? null, high: price.high ?? null, trend: price.trend ?? null, metadata: price.metadata, observedAt: new Date() },
          });
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const total = await prisma.tcgCard.count();
    return { processed: uniqueIds.length, inserted, updated, skipped, datasetVersion: String(total), details: { pricesRefreshed: mode === 'PRICE_REFRESH' } };
  }
}
