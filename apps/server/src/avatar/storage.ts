import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface AvatarStorageService {
  write(filename: string, contents: Buffer): Promise<void>;
  read(filename: string): Promise<Buffer | null>;
  remove(filename: string): Promise<void>;
}

const SAFE_AVATAR_FILENAME = /^[0-9a-f-]{36}\.webp$/;

export class FilesystemAvatarStorage implements AvatarStorageService {
  constructor(private readonly directory: string) {}

  private resolve(filename: string): string {
    if (!SAFE_AVATAR_FILENAME.test(filename)) throw new Error('Invalid avatar filename');
    return path.join(this.directory, filename);
  }

  async write(filename: string, contents: Buffer): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.resolve(filename), contents, { flag: 'wx', mode: 0o600 });
  }

  async read(filename: string): Promise<Buffer | null> {
    try { return await readFile(this.resolve(filename)); } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async remove(filename: string): Promise<void> {
    await rm(this.resolve(filename), { force: true });
  }
}
