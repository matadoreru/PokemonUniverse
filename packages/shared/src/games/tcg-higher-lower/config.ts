import { z } from 'zod';

const optionalPriceSchema = z.string().regex(/^\d+(?:\.\d+)?$/, 'Introduce un precio válido.').nullable();

export const tcgHigherLowerConfigSchema = z.object({
  setIds: z.array(z.string().min(1)).transform((items) => [...new Set(items)]),
  rarities: z.array(z.string().min(1)).transform((items) => [...new Set(items)]),
  minPrice: optionalPriceSchema,
  maxPrice: optionalPriceSchema,
  rounds: z.number().int().min(5).max(50),
  roundSeconds: z.number().int().min(5).max(60),
}).superRefine((value, context) => {
  if (value.minPrice !== null && value.maxPrice !== null && compareTcgPrices(value.minPrice, value.maxPrice) > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['maxPrice'], message: 'El precio máximo debe ser igual o mayor que el mínimo.' });
  }
});

export type TcgHigherLowerConfig = z.infer<typeof tcgHigherLowerConfigSchema>;
export const defaultTcgHigherLowerConfig: TcgHigherLowerConfig = {
  setIds: [], rarities: [], minPrice: null, maxPrice: null, rounds: 10, roundSeconds: 15,
};

export function canonicalTcgPrice(value: string): string | null {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [integer = '0', fraction = ''] = value.split('.');
  const normalizedInteger = integer.replace(/^0+(?=\d)/, '');
  const normalizedFraction = fraction.replace(/0+$/, '');
  return normalizedFraction ? `${normalizedInteger}.${normalizedFraction}` : normalizedInteger;
}

export function compareTcgPrices(left: string, right: string): number {
  const a = canonicalTcgPrice(left); const b = canonicalTcgPrice(right);
  if (a === null || b === null) throw new Error('Invalid canonical TCG price');
  const [ai = '0', af = ''] = a.split('.'); const [bi = '0', bf = ''] = b.split('.');
  if (ai.length !== bi.length) return ai.length > bi.length ? 1 : -1;
  if (ai !== bi) return ai > bi ? 1 : -1;
  const width = Math.max(af.length, bf.length);
  const ap = af.padEnd(width, '0'); const bp = bf.padEnd(width, '0');
  return ap === bp ? 0 : ap > bp ? 1 : -1;
}
