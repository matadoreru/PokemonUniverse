import { Prisma } from '@prisma/client';
import sharp from 'sharp';
import { prisma } from '../db.js';
import { SyncHttpClient } from './http-client.js';

export const POKEMON_PALETTE_VERSION = 1;
export const POKEMON_PALETTE_SIZE = 6;
export const MIN_PLAYABLE_POKEMON_PALETTES = 100;

type Metadata = Record<string, unknown>;

function metadataRecord(value: unknown): Metadata {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Metadata : {};
}

export function persistedPokemonPalette(metadata: unknown, sprite: string): string[] | null {
  const record = metadataRecord(metadata);
  if (record.paletteVersion !== POKEMON_PALETTE_VERSION || record.paletteSpriteUrl !== sprite || !Array.isArray(record.palette)) return null;
  const colors = record.palette.filter((color): color is string => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color));
  return colors.length >= 3 ? colors.slice(0, POKEMON_PALETTE_SIZE) : null;
}

function hex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function distance(left: readonly number[], right: readonly number[]): number {
  return Math.sqrt((left[0]! - right[0]!) ** 2 + (left[1]! - right[1]!) ** 2 + (left[2]! - right[2]!) ** 2);
}

/** Extracts a stable, alpha-aware palette from a sprite. Quantization keeps
 * results deterministic across machines and ignores transparent/background pixels. */
export async function extractPokemonPalette(source: Uint8Array, size = POKEMON_PALETTE_SIZE): Promise<string[]> {
  const decoded = await sharp(source).ensureAlpha().resize(96, 96, { fit: 'inside', withoutEnlargement: true, kernel: sharp.kernel.nearest }).raw().toBuffer({ resolveWithObject: true });
  const buckets = new Map<string, { rgb: [number, number, number]; count: number }>();
  for (let index = 0; index < decoded.data.length; index += 4) {
    if (decoded.data[index + 3]! < 96) continue;
    const raw: [number, number, number] = [decoded.data[index]!, decoded.data[index + 1]!, decoded.data[index + 2]!];
    if (Math.max(...raw) < 20 || Math.min(...raw) > 248) continue;
    const rgb = raw.map((channel) => Math.min(255, Math.round(channel / 24) * 24)) as [number, number, number];
    const key = rgb.join(':'); const current = buckets.get(key);
    buckets.set(key, current ? { ...current, count: current.count + 1 } : { rgb, count: 1 });
  }
  const ranked = [...buckets.values()].sort((left, right) => right.count - left.count || left.rgb.join(':').localeCompare(right.rgb.join(':')));
  const selected: Array<[number, number, number]> = [];
  for (const candidate of ranked) {
    if (selected.every((color) => distance(color, candidate.rgb) >= 42)) selected.push(candidate.rgb);
    if (selected.length >= size) break;
  }
  if (selected.length < 3) throw new Error('El sprite no contiene una paleta suficientemente variada.');
  return selected.map((color) => hex(...color));
}

export async function countPersistedPokemonPalettes(): Promise<number> {
  const rows = await prisma.pokemon.findMany({ where: { isDefault: true }, select: { sprite: true, metadata: true } });
  return rows.filter((row) => persistedPokemonPalette(row.metadata, row.sprite)).length;
}

export async function syncMissingPokemonPalettes(http = new SyncHttpClient()): Promise<{ processed: number; updated: number; skipped: number; failed: number }> {
  const rows = await prisma.pokemon.findMany({ where: { isDefault: true }, select: { id: true, sprite: true, metadata: true }, orderBy: { nationalDexNumber: 'asc' } });
  let updated = 0; let skipped = 0; let failed = 0;
  for (let start = 0; start < rows.length; start += 6) {
    await Promise.all(rows.slice(start, start + 6).map(async (row) => {
      if (persistedPokemonPalette(row.metadata, row.sprite)) { skipped += 1; return; }
      try {
        const url = new URL(row.sprite);
        if (url.protocol !== 'https:' || url.hostname !== 'raw.githubusercontent.com') throw new Error('Untrusted sprite source');
        const palette = await extractPokemonPalette(await http.bytes(row.sprite, `sprite palette ${row.id}`));
        const metadata = { ...metadataRecord(row.metadata), palette, paletteVersion: POKEMON_PALETTE_VERSION, paletteSpriteUrl: row.sprite };
        await prisma.pokemon.update({ where: { id: row.id }, data: { metadata: metadata as Prisma.InputJsonValue } });
        updated += 1;
      } catch (error) {
        failed += 1;
        console.error(`[DataSync] palette skipped pokemon=${row.id} error=${error instanceof Error ? error.message : String(error)}`);
      }
    }));
  }
  return { processed: rows.length, updated, skipped, failed };
}
