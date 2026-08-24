import type { GameAssetResolution, GameAssetTransform } from '@pokemon-universe/shared';
import sharp from 'sharp';

const gameImageCache = new Map<string, Promise<{ body: Buffer; contentType: string }>>();

function trustedSpriteUrl(source: string): URL {
  const sourceUrl = new URL(source);
  if (sourceUrl.protocol !== 'https:' || sourceUrl.hostname !== 'raw.githubusercontent.com') {
    throw new Error('Untrusted game image source');
  }
  return sourceUrl;
}

function resolution(asset: string | GameAssetResolution): { source: string; transform: GameAssetTransform } {
  return typeof asset === 'string' ? { source: asset, transform: 'ORIGINAL' } : asset;
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
  const { source, transform } = resolution(asset);
  const sourceUrl = trustedSpriteUrl(source);
  const cacheKey = `${transform}:${source}`;
  let cached = gameImageCache.get(cacheKey);
  if (!cached) {
    cached = fetch(sourceUrl).then(async (image) => {
      if (!image.ok) throw new Error(`Sprite source returned ${image.status}`);
      const body = Buffer.from(await image.arrayBuffer());
      return transform === 'SILHOUETTE'
        ? { body: await createPokemonSilhouette(body), contentType: 'image/png' }
        : { body, contentType: image.headers.get('content-type') ?? 'image/png' };
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
