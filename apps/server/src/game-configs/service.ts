import { gameRegistry, type RegisteredGame } from '@pokemon-universe/shared';
import { isDeepStrictEqual } from 'node:util';
import type { UserGameConfigRepository } from './prisma-repository.js';

type ConfigPath = Array<string | number>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function mergeKnown(defaultValue: unknown, storedValue: unknown): unknown {
  if (!isRecord(defaultValue)) return storedValue === undefined ? clone(defaultValue) : clone(storedValue);
  if (!isRecord(storedValue)) return clone(defaultValue);
  return Object.fromEntries(Object.entries(defaultValue).map(([key, nestedDefault]) => [
    key,
    mergeKnown(nestedDefault, storedValue[key]),
  ]));
}

function normalizedIssuePath(path: ConfigPath): ConfigPath {
  const arrayIndex = path.findIndex((segment) => typeof segment === 'number');
  return arrayIndex >= 0 ? path.slice(0, arrayIndex) : path;
}

function valueAtPath(value: unknown, path: ConfigPath): unknown {
  let current = value;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
    } else {
      if (!isRecord(current)) return undefined;
      current = current[segment];
    }
  }
  return current;
}

function replaceAtPath(value: unknown, path: ConfigPath, replacement: unknown): unknown {
  if (path.length === 0) return clone(replacement);
  const result = clone(value);
  let current = result;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index]!;
    current = typeof segment === 'number'
      ? (current as unknown[])[segment]
      : (current as Record<string, unknown>)[segment];
  }
  const final = path[path.length - 1]!;
  if (typeof final === 'number') (current as unknown[])[final] = clone(replacement);
  else (current as Record<string, unknown>)[final] = clone(replacement);
  return result;
}

/**
 * Merges stored preferences into current defaults, drops retired keys and repairs
 * invalid branches. This lets additive and most narrowing schema changes migrate
 * without discarding the user's unrelated settings.
 */
export function migrateStoredGameConfig(game: RegisteredGame, stored: unknown): unknown {
  const fallback = game.configSchema.parse(game.defaultConfig);
  let candidate = mergeKnown(fallback, stored);
  const priorCandidates = new Set<string>();

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const result = game.configSchema.safeParse(candidate);
    if (result.success) return result.data;

    const fingerprint = JSON.stringify(candidate);
    if (priorCandidates.has(fingerprint)) return fallback;
    priorCandidates.add(fingerprint);

    const paths = result.error.issues.map((issue) => normalizedIssuePath(issue.path));
    if (paths.some((path) => path.length === 0)) return fallback;
    for (const path of paths) candidate = replaceAtPath(candidate, path, valueAtPath(fallback, path));
  }
  return fallback;
}

interface PendingWrite {
  userId: string;
  gameId: string;
  config: unknown;
}

export interface UserGameConfigPreferences {
  forUser(userId: string): ReadonlyMap<string, unknown>;
  save(userId: string, gameId: string, config: unknown): void;
}

export const noOpUserGameConfigPreferences: UserGameConfigPreferences = {
  forUser: () => new Map(),
  save: () => undefined,
};

export class UserGameConfigService implements UserGameConfigPreferences {
  private readonly byUser = new Map<string, Map<string, unknown>>();
  private readonly pending = new Map<string, PendingWrite>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly writes = new Map<string, Promise<void>>();

  constructor(private readonly repository: UserGameConfigRepository) {}

  async load(): Promise<void> {
    const rows = await this.repository.list();
    const migrations: PendingWrite[] = [];
    for (const row of rows) {
      const game = gameRegistry.get(row.gameId);
      if (!game) continue;
      const config = migrateStoredGameConfig(game, row.config);
      this.userMap(row.userId).set(row.gameId, config);
      if (!isDeepStrictEqual(config, row.config)) migrations.push({ ...row, config });
    }
    await Promise.all(migrations.map((entry) => this.repository.upsert(entry.userId, entry.gameId, entry.config)));
  }

  forUser(userId: string): ReadonlyMap<string, unknown> {
    return this.byUser.get(userId) ?? new Map();
  }

  save(userId: string, gameId: string, config: unknown): void {
    const game = gameRegistry.get(gameId);
    if (!game) return;
    const parsed = game.configSchema.parse(config);
    this.userMap(userId).set(gameId, parsed);
    const key = this.key(userId, gameId);
    this.pending.set(key, { userId, gameId, config: parsed });
    const priorTimer = this.timers.get(key);
    if (priorTimer) clearTimeout(priorTimer);
    const timer = setTimeout(() => {
      this.timers.delete(key);
      void this.persist(key);
    }, 250);
    timer.unref();
    this.timers.set(key, timer);
  }

  async flush(): Promise<void> {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    await Promise.all([...this.pending.keys()].map((key) => this.persist(key)));
    await Promise.all(this.writes.values());
  }

  private userMap(userId: string): Map<string, unknown> {
    let configs = this.byUser.get(userId);
    if (!configs) { configs = new Map(); this.byUser.set(userId, configs); }
    return configs;
  }

  private key(userId: string, gameId: string): string {
    return `${userId}\u0000${gameId}`;
  }

  private persist(key: string): Promise<void> {
    const next = this.pending.get(key);
    if (!next) return this.writes.get(key) ?? Promise.resolve();
    this.pending.delete(key);
    const prior = this.writes.get(key) ?? Promise.resolve();
    const write = prior.catch(() => undefined)
      .then(() => this.repository.upsert(next.userId, next.gameId, next.config))
      .catch((error) => console.error(`Failed to persist game config for ${next.gameId}`, error))
      .finally(() => {
        if (this.writes.get(key) !== write) return;
        this.writes.delete(key);
        if (this.pending.has(key)) void this.persist(key);
      });
    this.writes.set(key, write);
    return write;
  }
}
