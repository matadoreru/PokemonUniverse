import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  ROOM_MAX_PLAYERS: z.coerce.number().int().min(2).max(100).default(8),
  RECONNECT_GRACE_MS: z.coerce.number().int().min(5_000).max(300_000).default(30_000),
  AVATAR_STORAGE_DIR: z.string().min(1).default(process.env.NODE_ENV === 'production' ? '/data/avatars' : '.data/avatars'),
  PU_COMMIT_SHA: z.string().default(''),
});

export const env = schema.parse(process.env);
