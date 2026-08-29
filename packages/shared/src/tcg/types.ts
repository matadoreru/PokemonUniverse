export interface TcgComparableCard {
  id: string;
  name: string;
  localId: string;
  setId: string;
  setName: string;
  rarity: string | null;
  imageUrl: string;
  /** Canonical, non-negative decimal. It is compared without converting to a float. */
  price: string;
  currency: string;
  provider: string;
  variant: string;
}

export interface TcgCardFilters {
  generations: readonly number[];
  setIds: readonly string[];
  rarities: readonly string[];
  minPrice: string | null;
  maxPrice: string | null;
}

export interface TcgSetOption { id: string; name: string; cardCount: number }
export interface TcgRarityOption { value: string; cardCount: number }
export interface TcgGenerationOption { value: number; cardCount: number }
export interface TcgFilterOptions {
  ready: boolean;
  cardCount: number;
  generations: TcgGenerationOption[];
  sets: TcgSetOption[];
  rarities: TcgRarityOption[];
}

/** Synchronous, server-owned view over the PostgreSQL-backed TCG cache. */
export interface TcgCardCatalog {
  cardsFor(filters: TcgCardFilters): readonly TcgComparableCard[];
  options(): TcgFilterOptions;
}
