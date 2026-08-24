import { validFocusPoint, type GameAssetResolution, type GameAssetTransform } from '@pokemon-universe/shared';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { localArtworkPath } from '../pokemon/visual-assets.js';

const gameImageCache = new Map<string, Promise<{ body: Buffer; contentType: string }>>();

function trustedSpriteUrl(source: string): URL {
  const sourceUrl = new URL(source);
  if (sourceUrl.protocol !== 'https:' || sourceUrl.hostname !== 'raw.githubusercontent.com') {
    throw new Error('Untrusted game image source');
  }
  return sourceUrl;
}

function resolution(asset: string | GameAssetResolution): { source: string; transform: GameAssetTransform; focusSeed?: number } {
  return typeof asset === 'string' ? { source: asset, transform: 'ORIGINAL' } : asset;
}

async function sourceBuffer(source: string): Promise<{ body: Buffer; contentType: string }> {
  const localPath = localArtworkPath(source);
  if (localPath) return { body: await readFile(localPath), contentType: 'image/png' };
  const image = await fetch(trustedSpriteUrl(source));
  if (!image.ok) throw new Error(`Sprite source returned ${image.status}`);
  return { body: Buffer.from(await image.arrayBuffer()), contentType: image.headers.get('content-type') ?? 'image/png' };
}

export async function createNormalizedPokemonImage(source: Buffer, focusSeed?: number): Promise<Buffer> {
  const normalized = await sharp(source).ensureAlpha().trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(472, 472, { fit: 'contain', position: 'centre', background: { r: 0, g: 0, b: 0, alpha: 0 }, withoutEnlargement: false })
    .extend({ top: 20, bottom: 20, left: 20, right: 20, background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer({ resolveWithObject: true });
  if (focusSeed === undefined) return sharp(normalized.data, { raw: normalized.info }).png().toBuffer();
  const alpha = new Uint8Array(normalized.info.width * normalized.info.height);
  for (let sourceIndex = 3, target = 0; sourceIndex < normalized.data.length; sourceIndex += 4, target += 1) alpha[target] = normalized.data[sourceIndex]!;
  const focus = validFocusPoint({ width: normalized.info.width, height: normalized.info.height, alpha }, focusSeed);
  if (!focus) throw new Error('Visual asset does not contain enough visible pixels');
  const offsetX = Math.round(normalized.info.width / 2 - focus.x * normalized.info.width);
  const offsetY = Math.round(normalized.info.height / 2 - focus.y * normalized.info.height);
  const shifted = Buffer.alloc(normalized.data.length);
  for (let y = 0; y < normalized.info.height; y += 1) for (let x = 0; x < normalized.info.width; x += 1) {
    const targetX = x + offsetX; const targetY = y + offsetY;
    if (targetX < 0 || targetY < 0 || targetX >= normalized.info.width || targetY >= normalized.info.height) continue;
    const sourceIndex = (y * normalized.info.width + x) * 4; const targetIndex = (targetY * normalized.info.width + targetX) * 4;
    normalized.data.copy(shifted, targetIndex, sourceIndex, sourceIndex + 4);
  }
  return sharp(shifted, { raw: normalized.info }).png().toBuffer();
}

/** Produces a fixed-size, alpha-preserving black silhouette without retaining source RGB pixels. */
export async function createPokemonSilhouette(source: Buffer): Promise<Buffer> {
  const normalized = await sharp(source)
    .ensureAlpha()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(320, 320, { fit: 'contain', position: 'centre', background: { r: 0, g: 0, b: 0, alpha: 0 }, withoutEnlargement: false })
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let index = 0; index < normalized.data.length; index += 4) {
    normalized.data[index] = 0;
    normalized.data[index + 1] = 0;
    normalized.data[index + 2] = 0;
  }
  return sharp(normalized.data, { raw: normalized.info }).png().toBuffer();
}

export function loadGameImage(asset: string | GameAssetResolution): Promise<{ body: Buffer; contentType: string }> {
  const { source, transform, focusSeed } = resolution(asset);
  const cacheKey = `${transform}:${focusSeed ?? ''}:${source}`;
  let cached = gameImageCache.get(cacheKey);
  if (!cached) {
    cached = sourceBuffer(source).then(async (image) => {
      if (transform === 'SILHOUETTE') return { body: await createPokemonSilhouette(image.body), contentType: 'image/png' };
      if (transform === 'NORMALIZED' || transform === 'FOCUSED_NORMALIZED') return { body: await createNormalizedPokemonImage(image.body, transform === 'FOCUSED_NORMALIZED' ? focusSeed ?? 0 : undefined), contentType: 'image/png' };
      return image;
    }).catch((error) => {
      gameImageCache.delete(cacheKey);
      throw error;
    });
    gameImageCache.set(cacheKey, cached);
    if (gameImageCache.size > 256) gameImageCache.delete(gameImageCache.keys().next().value!);
  }
  return cached;
}

export function preloadGameImage(source: string): void {
  void loadGameImage(source).catch((error) => console.error('Failed to preload game image', error));
}
