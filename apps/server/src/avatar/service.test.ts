import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { AVATAR_OUTPUT_SIZE, AvatarService, MAX_AVATAR_UPLOAD_BYTES } from './service.js';
import type { AvatarStorageService } from './storage.js';

class MemoryAvatarStorage implements AvatarStorageService {
  readonly files = new Map<string, Buffer>();

  async write(filename: string, contents: Buffer): Promise<void> { this.files.set(filename, contents); }
  async read(filename: string): Promise<Buffer | null> { return this.files.get(filename) ?? null; }
  async remove(filename: string): Promise<void> { this.files.delete(filename); }
}

describe('AvatarService', () => {
  it('validates, strips the source and stores a square 256px WebP', async () => {
    const storage = new MemoryAvatarStorage();
    const service = new AvatarService(storage);
    const source = await sharp({
      create: { width: 640, height: 320, channels: 4, background: { r: 244, g: 74, b: 112, alpha: 1 } },
    }).png().withMetadata({ exif: { IFD0: { Artist: 'private metadata' } } }).toBuffer();

    const avatar = await service.processAndStore(source, 'image/png');
    const stored = storage.files.get(avatar.value);

    expect(avatar).toMatchObject({ type: 'CUSTOM' });
    expect(avatar.value).toMatch(/^[0-9a-f-]{36}\.webp$/);
    expect(stored).toBeDefined();
    const metadata = await sharp(stored).metadata();
    expect(metadata).toMatchObject({ format: 'webp', width: AVATAR_OUTPUT_SIZE, height: AVATAR_OUTPUT_SIZE });
    expect(metadata.exif).toBeUndefined();
  });

  it('rejects invalid contents and forged MIME declarations', async () => {
    const service = new AvatarService(new MemoryAvatarStorage());
    await expect(service.processAndStore(Buffer.from('<svg onload="alert(1)"/>'), 'image/png')).rejects.toThrow();
    const png = await sharp({ create: { width: 128, height: 128, channels: 3, background: '#222' } }).png().toBuffer();
    await expect(service.processAndStore(png, 'image/jpeg')).rejects.toThrow(/JPEG, PNG o WEBP/);
  });

  it('rejects excessive payloads and dimensions', async () => {
    const service = new AvatarService(new MemoryAvatarStorage());
    await expect(service.processAndStore(Buffer.alloc(MAX_AVATAR_UPLOAD_BYTES + 1), 'image/png')).rejects.toThrow(/5 MB/);
    const tiny = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#222' } }).png().toBuffer();
    await expect(service.processAndStore(tiny, 'image/png')).rejects.toThrow(/64 y 4096/);
  });
});
