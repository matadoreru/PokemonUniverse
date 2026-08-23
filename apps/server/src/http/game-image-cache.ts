const gameImageCache = new Map<string, Promise<{ body: Buffer; contentType: string }>>();

function trustedSpriteUrl(source: string): URL {
  const sourceUrl = new URL(source);
  if (sourceUrl.protocol !== 'https:' || sourceUrl.hostname !== 'raw.githubusercontent.com') {
    throw new Error('Untrusted game image source');
  }
  return sourceUrl;
}

export function loadGameImage(source: string): Promise<{ body: Buffer; contentType: string }> {
  const sourceUrl = trustedSpriteUrl(source);
  let cached = gameImageCache.get(source);
  if (!cached) {
    cached = fetch(sourceUrl).then(async (image) => {
      if (!image.ok) throw new Error(`Sprite source returned ${image.status}`);
      return { body: Buffer.from(await image.arrayBuffer()), contentType: image.headers.get('content-type') ?? 'image/png' };
    }).catch((error) => {
      gameImageCache.delete(source);
      throw error;
    });
    gameImageCache.set(source, cached);
    if (gameImageCache.size > 256) gameImageCache.delete(gameImageCache.keys().next().value!);
  }
  return cached;
}

export function preloadGameImage(source: string): void {
  void loadGameImage(source).catch((error) => console.error('Failed to preload game image', error));
}
