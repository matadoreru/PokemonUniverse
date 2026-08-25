import { validFocusPoint, type GameAssetRecolor, type GameAssetResolution, type GameAssetTransform } from '@pokemon-universe/shared';
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

function resolution(asset: string | GameAssetResolution): { source: string; transform: GameAssetTransform; focusSeed?: number; recolor?: GameAssetRecolor } {
  return typeof asset === 'string' ? { source: asset, transform: 'ORIGINAL' } : asset;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rgbToHsl(red: number, green: number, blue: number): [number, number, number] {
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const lightness = (maximum + minimum) / 2;
  const delta = maximum - minimum;
  if (delta === 0) return [0, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (maximum === red) hue = ((green - blue) / delta) % 6;
  else if (maximum === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return [((hue * 60) + 360) % 360, saturation, lightness];
}

function hueChannel(first: number, second: number, hue: number): number {
  const wrapped = ((hue % 1) + 1) % 1;
  if (wrapped < 1 / 6) return first + (second - first) * 6 * wrapped;
  if (wrapped < 1 / 2) return second;
  if (wrapped < 2 / 3) return first + (second - first) * (2 / 3 - wrapped) * 6;
  return first;
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  if (saturation === 0) return [lightness, lightness, lightness];
  const second = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const first = 2 * lightness - second;
  const normalizedHue = hue / 360;
  return [
    hueChannel(first, second, normalizedHue + 1 / 3),
    hueChannel(first, second, normalizedHue),
    hueChannel(first, second, normalizedHue - 1 / 3),
  ];
}

function recolorPixels(data: Buffer, recolor: GameAssetRecolor): void {
  const hueShift = ((recolor.hueShiftDegrees % 360) + 360) % 360;
  const saturationScale = clamp(recolor.saturationScale, 0.5, 1.15);
  const lightnessScale = clamp(recolor.lightnessScale, 0.85, 1.15);
  const contrast = clamp(recolor.contrast, 0.8, 1.1);
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    const red = data[index]! / 255;
    const green = data[index + 1]! / 255;
    const blue = data[index + 2]! / 255;
    const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    if (chroma < 0.055 || lightness < 0.07 || lightness > 0.94) continue;
    const nextSaturation = clamp(saturation * saturationScale, 0, 0.88);
    const contrastedLightness = 0.5 + (lightness - 0.5) * contrast;
    const nextLightness = clamp(contrastedLightness * lightnessScale, 0.04, 0.96);
    const [nextRed, nextGreen, nextBlue] = hslToRgb((hue + hueShift) % 360, nextSaturation, nextLightness);
    data[index] = Math.round(nextRed * 255);
    data[index + 1] = Math.round(nextGreen * 255);
    data[index + 2] = Math.round(nextBlue * 255);
  }
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

/** Recolours at native resolution, then uses an exact nearest-neighbour pixel-art canvas. */
export async function createPokemonSpriteImage(source: Buffer, recolor?: GameAssetRecolor): Promise<Buffer> {
  const decoded = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (recolor) recolorPixels(decoded.data, recolor);
  return sharp(decoded.data, { raw: decoded.info })
    .resize(192, 192, {
      fit: 'contain',
      position: 'centre',
      kernel: sharp.kernel.nearest,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

export function loadGameImage(asset: string | GameAssetResolution): Promise<{ body: Buffer; contentType: string }> {
  const { source, transform, focusSeed, recolor } = resolution(asset);
  const recolorKey = recolor ? `${recolor.hueShiftDegrees}:${recolor.saturationScale}:${recolor.lightnessScale}:${recolor.contrast}` : '';
  const cacheKey = `${transform}:${focusSeed ?? ''}:${recolorKey}:${source}`;
  let cached = gameImageCache.get(cacheKey);
  if (!cached) {
    cached = sourceBuffer(source).then(async (image) => {
      if (transform === 'SILHOUETTE') return { body: await createPokemonSilhouette(image.body), contentType: 'image/png' };
      if (transform === 'NORMALIZED' || transform === 'FOCUSED_NORMALIZED') return { body: await createNormalizedPokemonImage(image.body, transform === 'FOCUSED_NORMALIZED' ? focusSeed ?? 0 : undefined), contentType: 'image/png' };
      if (transform === 'PIXEL_ART') return { body: await createPokemonSpriteImage(image.body), contentType: 'image/png' };
      if (transform === 'PALETTE_RECOLOR') {
        if (!recolor) throw new Error('Palette recolor transform requires recolor parameters');
        return { body: await createPokemonSpriteImage(image.body, recolor), contentType: 'image/png' };
      }
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
