import type { AvatarRef } from '@pokemon-universe/shared';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { AvatarStorageService } from './storage.js';

export const MAX_AVATAR_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_AVATAR_DIMENSION = 4_096;
export const AVATAR_OUTPUT_SIZE = 256;
const contentTypes = { jpeg: ['image/jpeg'], png: ['image/png'], webp: ['image/webp'] } as const;

export class AvatarValidationError extends Error {
  readonly status = 400;
}

export class AvatarService {
  constructor(private readonly storage: AvatarStorageService) {}

  async processAndStore(contents: Buffer, declaredContentType: string): Promise<AvatarRef & { type: 'CUSTOM' }> {
    if (!contents.length || contents.length > MAX_AVATAR_UPLOAD_BYTES) throw new AvatarValidationError('La imagen supera el límite de 5 MB.');
    let image: ReturnType<typeof sharp>;
    let metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
    try {
      image = sharp(contents, { failOn: 'warning', limitInputPixels: MAX_AVATAR_DIMENSION * MAX_AVATAR_DIMENSION });
      metadata = await image.metadata();
    } catch {
      throw new AvatarValidationError('El archivo no es una imagen JPEG, PNG o WEBP válida.');
    }
    const allowedTypes = metadata.format && metadata.format in contentTypes ? contentTypes[metadata.format as keyof typeof contentTypes] : null;
    if (!allowedTypes || !(allowedTypes as readonly string[]).includes(declaredContentType)) throw new AvatarValidationError('El archivo no es una imagen JPEG, PNG o WEBP válida.');
    if (!metadata.width || !metadata.height || metadata.width < 64 || metadata.height < 64 || metadata.width > MAX_AVATAR_DIMENSION || metadata.height > MAX_AVATAR_DIMENSION) {
      throw new AvatarValidationError('La imagen debe medir entre 64 y 4096 píxeles por lado.');
    }
    const output = await image.rotate().resize(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, { fit: 'cover', position: 'centre' }).webp({ quality: 84, effort: 5 }).toBuffer();
    const filename = `${randomUUID()}.webp`;
    await this.storage.write(filename, output);
    return { type: 'CUSTOM', value: filename, version: Date.now() };
  }

  read(filename: string): Promise<Buffer | null> { return this.storage.read(filename); }
  remove(filename: string): Promise<void> { return this.storage.remove(filename); }
}
