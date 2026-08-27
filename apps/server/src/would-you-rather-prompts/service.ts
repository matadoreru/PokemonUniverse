import { createCustomWouldYouRatherPromptSchema, importCustomWouldYouRatherPromptsSchema, updateCustomWouldYouRatherPromptSchema, type CustomWouldYouRatherPromptView, type WouldYouRatherPromptPair } from '@pokemon-universe/shared';

export interface StoredWouldYouRatherPrompt {
  id: string;
  userId: string;
  optionA: string;
  optionB: string;
  normalizedKey: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WouldYouRatherPromptRepository {
  findAll(): Promise<StoredWouldYouRatherPrompt[]>;
  create(userId: string, optionA: string, optionB: string, normalizedKey: string): Promise<StoredWouldYouRatherPrompt>;
  update(userId: string, id: string, data: { optionA?: string; optionB?: string; normalizedKey?: string; enabled?: boolean }): Promise<StoredWouldYouRatherPrompt | null>;
  delete(userId: string, id: string): Promise<boolean>;
}

export function normalizeWouldYouRatherOption(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

export function wouldYouRatherPromptKey(optionA: string, optionB: string): string {
  return [normalizeWouldYouRatherOption(optionA), normalizeWouldYouRatherOption(optionB)].sort().join('::');
}

function view(prompt: StoredWouldYouRatherPrompt): CustomWouldYouRatherPromptView {
  return {
    id: prompt.id, optionA: prompt.optionA, optionB: prompt.optionB, enabled: prompt.enabled,
    createdAt: prompt.createdAt.toISOString(), updatedAt: prompt.updatedAt.toISOString(),
  };
}

export class WouldYouRatherPromptService {
  private readonly byUser = new Map<string, StoredWouldYouRatherPrompt[]>();
  private readonly listeners = new Set<(userId: string) => void>();

  constructor(private readonly repository: WouldYouRatherPromptRepository) {}

  async load(): Promise<void> {
    this.byUser.clear();
    for (const prompt of await this.repository.findAll()) this.insertCached(prompt);
  }

  onChanged(listener: (userId: string) => void): () => void {
    this.listeners.add(listener); return () => this.listeners.delete(listener);
  }

  list(userId: string): CustomWouldYouRatherPromptView[] {
    return [...(this.byUser.get(userId) ?? [])].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()).map(view);
  }

  enabled(userId: string): WouldYouRatherPromptPair[] {
    return (this.byUser.get(userId) ?? []).filter((prompt) => prompt.enabled).map(({ id, optionA, optionB }) => ({ id, optionA, optionB }));
  }

  async create(userId: string, input: unknown): Promise<CustomWouldYouRatherPromptView> {
    const { optionA, optionB } = createCustomWouldYouRatherPromptSchema.parse(input);
    this.assertDifferent(optionA, optionB);
    const normalizedKey = wouldYouRatherPromptKey(optionA, optionB);
    this.assertUnique(userId, normalizedKey);
    const created = await this.repository.create(userId, optionA, optionB, normalizedKey);
    this.insertCached(created); this.notify(userId); return view(created);
  }

  async update(userId: string, id: string, input: unknown): Promise<CustomWouldYouRatherPromptView> {
    const parsed = updateCustomWouldYouRatherPromptSchema.parse(input);
    const current = (this.byUser.get(userId) ?? []).find((prompt) => prompt.id === id);
    if (!current) throw new WouldYouRatherPromptNotFoundError();
    const optionA = parsed.optionA ?? current.optionA;
    const optionB = parsed.optionB ?? current.optionB;
    this.assertDifferent(optionA, optionB);
    const normalizedKey = wouldYouRatherPromptKey(optionA, optionB);
    this.assertUnique(userId, normalizedKey, id);
    const updated = await this.repository.update(userId, id, {
      ...(parsed.optionA === undefined ? {} : { optionA: parsed.optionA }),
      ...(parsed.optionB === undefined ? {} : { optionB: parsed.optionB }),
      ...(parsed.optionA === undefined && parsed.optionB === undefined ? {} : { normalizedKey }),
      ...(parsed.enabled === undefined ? {} : { enabled: parsed.enabled }),
    });
    if (!updated) throw new WouldYouRatherPromptNotFoundError();
    this.byUser.set(userId, (this.byUser.get(userId) ?? []).map((prompt) => prompt.id === id ? updated : prompt));
    this.notify(userId); return view(updated);
  }

  async import(userId: string, input: unknown): Promise<CustomWouldYouRatherPromptView[]> {
    const { prompts } = importCustomWouldYouRatherPromptsSchema.parse(input);
    const keys = prompts.map((prompt) => wouldYouRatherPromptKey(prompt.optionA, prompt.optionB));
    if (new Set(keys).size !== keys.length) throw new DuplicateWouldYouRatherPromptError('El JSON contiene dilemas duplicados o invertidos.');
    for (const key of keys) this.assertUnique(userId, key);
    const created: StoredWouldYouRatherPrompt[] = [];
    for (const [index, prompt] of prompts.entries()) {
      created.push(await this.repository.create(userId, prompt.optionA, prompt.optionB, keys[index]!));
    }
    for (const prompt of created) this.insertCached(prompt);
    this.notify(userId);
    return created.map(view);
  }

  async delete(userId: string, id: string): Promise<void> {
    if (!(await this.repository.delete(userId, id))) throw new WouldYouRatherPromptNotFoundError();
    this.byUser.set(userId, (this.byUser.get(userId) ?? []).filter((prompt) => prompt.id !== id));
    this.notify(userId);
  }

  private assertDifferent(optionA: string, optionB: string): void {
    if (normalizeWouldYouRatherOption(optionA) === normalizeWouldYouRatherOption(optionB)) throw new InvalidWouldYouRatherPromptError();
  }

  private assertUnique(userId: string, normalizedKey: string, ignoredId?: string): void {
    if ((this.byUser.get(userId) ?? []).some((prompt) => prompt.id !== ignoredId && prompt.normalizedKey === normalizedKey)) throw new DuplicateWouldYouRatherPromptError();
  }

  private insertCached(prompt: StoredWouldYouRatherPrompt): void {
    this.byUser.set(prompt.userId, [...(this.byUser.get(prompt.userId) ?? []), prompt]);
  }

  private notify(userId: string): void { for (const listener of this.listeners) listener(userId); }
}

export class DuplicateWouldYouRatherPromptError extends Error {
  readonly status = 409;
  constructor(message = 'Ya tienes una pareja igual o equivalente.') { super(message); }
}
export class InvalidWouldYouRatherPromptError extends Error {
  readonly status = 400;
  constructor() { super('Las dos opciones deben ser diferentes.'); }
}
export class WouldYouRatherPromptNotFoundError extends Error {
  readonly status = 404;
  constructor() { super('Pareja no encontrada.'); }
}
