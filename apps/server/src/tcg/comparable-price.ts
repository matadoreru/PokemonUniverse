import { canonicalTcgPrice, compareTcgPrices, type TcgComparableCard, type TcgCardCatalog, type TcgCardFilters, type TcgFilterOptions } from '@pokemon-universe/shared';
import type { TcgCardRepository, TcgCatalogCardRow, TcgPriceRow } from './repository.js';

export interface TcgPriceLane { currency: string; provider: string; variant: string }

function validImage(value: string | null): value is string {
  if (!value) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}
function laneKey(lane: TcgPriceLane): string { return `${lane.currency}\0${lane.provider}\0${lane.variant}`; }
function parseLane(key: string): TcgPriceLane { const [currency = '', provider = '', variant = ''] = key.split('\0'); return { currency, provider, variant }; }
function lanePriority(lane: TcgPriceLane): number {
  const key = `${lane.currency}:${lane.provider.toLowerCase()}:${lane.variant.toLowerCase()}`;
  const priorities = ['EUR:cardmarket:standard', 'USD:tcgplayer:normal', 'EUR:cardmarket:holo', 'USD:tcgplayer:holofoil', 'USD:tcgplayer:reverseholofoil'];
  const index = priorities.indexOf(key); return index < 0 ? priorities.length : index;
}

export function getComparableCardPrice(card: TcgCatalogCardRow, lane: TcgPriceLane): { amount: string; price: TcgPriceRow } | null {
  const candidates = card.prices.filter((price) => price.currency === lane.currency && price.provider === lane.provider && price.variant === lane.variant)
    .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
  for (const price of candidates) { const amount = price.market === null ? null : canonicalTcgPrice(price.market); if (amount !== null) return { amount, price }; }
  return null;
}
function eligibleCard(card: TcgCatalogCardRow): boolean { return Boolean(card.id.trim() && card.localId?.trim() && card.name.trim() && card.set.id.trim() && card.set.name.trim() && validImage(card.imageUrl)); }
function matchesBase(card: TcgCatalogCardRow, filters: TcgCardFilters): boolean {
  return card.pokemonGenerations.some((generation) => filters.generations.includes(generation))
    && (filters.setIds.length === 0 || filters.setIds.includes(card.set.id))
    && (filters.rarities.length === 0 || card.rarity !== null && filters.rarities.includes(card.rarity));
}

export class CachedTcgCardCatalog implements TcgCardCatalog {
  private cards: TcgCatalogCardRow[] = [];
  constructor(private readonly repository: TcgCardRepository) {}
  async refresh(): Promise<void> { const next = (await this.repository.loadComparableCards()).filter(eligibleCard); this.cards = next; console.info(`[TCG catalog] loaded ${next.length} cards with image and market price from PostgreSQL`); }
  cardsFor(filters: TcgCardFilters): readonly TcgComparableCard[] {
    const base = this.cards.filter((card) => matchesBase(card, filters)); const lanes = new Map<string, number>();
    for (const card of base) for (const price of card.prices) { if (!/^[A-Z]{3}$/.test(price.currency) || !price.provider.trim() || !price.variant.trim() || price.market === null || canonicalTcgPrice(price.market) === null) continue; const key = laneKey(price); lanes.set(key, (lanes.get(key) ?? 0) + 1); }
    const orderedLanes = [...lanes].filter(([, count]) => count >= 2).map(([key]) => parseLane(key)).sort((a, b) => lanePriority(a) - lanePriority(b) || laneKey(a).localeCompare(laneKey(b)));
    for (const lane of orderedLanes) {
      const result: TcgComparableCard[] = [];
      for (const card of base) {
        const comparable = getComparableCardPrice(card, lane); if (!comparable) continue;
        if (filters.minPrice !== null && compareTcgPrices(comparable.amount, filters.minPrice) < 0) continue;
        if (filters.maxPrice !== null && compareTcgPrices(comparable.amount, filters.maxPrice) > 0) continue;
        result.push({ id: card.id, name: card.name, localId: card.localId!, setId: card.set.id, setName: card.set.name, rarity: card.rarity, imageUrl: card.imageUrl!, price: comparable.amount, currency: lane.currency, provider: lane.provider, variant: lane.variant });
      }
      if (result.length >= 2) return result;
    }
    return [];
  }
  options(): TcgFilterOptions {
    const priced = this.cards.filter((card) => card.pokemonGenerations.length > 0 && card.prices.some((price) => price.market !== null && canonicalTcgPrice(price.market) !== null));
    const sets = new Map<string, { name: string; ids: Set<string> }>(); const rarities = new Map<string, Set<string>>(); const generations = new Map<number, Set<string>>();
    for (const card of priced) { const set = sets.get(card.set.id) ?? { name: card.set.name, ids: new Set<string>() }; set.ids.add(card.id); sets.set(card.set.id, set); for (const generation of card.pokemonGenerations) { const ids = generations.get(generation) ?? new Set<string>(); ids.add(card.id); generations.set(generation, ids); } if (card.rarity) { const ids = rarities.get(card.rarity) ?? new Set<string>(); ids.add(card.id); rarities.set(card.rarity, ids); } }
    const allGenerations = [...generations.keys()].sort((a, b) => a - b);
    return { ready: this.cardsFor({ generations: allGenerations, setIds: [], rarities: [], minPrice: null, maxPrice: null }).length >= 2, cardCount: priced.length,
      generations: allGenerations.map((value) => ({ value, cardCount: generations.get(value)!.size })),
      sets: [...sets].map(([id, value]) => ({ id, name: value.name, cardCount: value.ids.size })).sort((a, b) => a.name.localeCompare(b.name)),
      rarities: [...rarities].map(([value, ids]) => ({ value, cardCount: ids.size })).sort((a, b) => a.value.localeCompare(b.value)),
    };
  }
}
