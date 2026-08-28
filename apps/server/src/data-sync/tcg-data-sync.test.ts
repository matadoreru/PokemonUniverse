import { describe, expect, it } from 'vitest';
import { priceLeaves } from './tcg-data-sync.js';

describe('TCG price refresh normalization', () => {
  it('extracts available provider prices into stable upsert keys', () => {
    expect(priceLeaves({ cardmarket: { unit: 'EUR', avg: 12.4, low: 10, trend: 11.8 }, tcgplayer: { unit: 'USD', holofoil: { marketPrice: 14.2, lowPrice: 9, highPrice: 20 } } })).toEqual([
      expect.objectContaining({ provider: 'cardmarket', currency: 'EUR', variant: 'standard', market: 12.4, low: 10, trend: 11.8 }),
      expect.objectContaining({ provider: 'tcgplayer', currency: 'USD', variant: 'holofoil', market: 14.2, low: 9, high: 20 }),
    ]);
  });
});
