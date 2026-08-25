import type { CustomCategoryView, SubjectiveCategory } from '@pokemon-universe/shared';
import { createCustomCategorySchema, updateCustomCategorySchema } from '@pokemon-universe/shared';

export interface StoredCustomCategory {
  id: string;
  userId: string;
  text: string;
  normalizedText: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomCategoryRepository {
  findAll(): Promise<StoredCustomCategory[]>;
  create(userId: string, text: string, normalizedText: string): Promise<StoredCustomCategory>;
  update(userId: string, id: string, data: { text?: string; normalizedText?: string; enabled?: boolean }): Promise<StoredCustomCategory | null>;
  delete(userId: string, id: string): Promise<boolean>;
}

export function normalizeCustomCategory(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function view(category: StoredCustomCategory): CustomCategoryView {
  return {
    id: category.id, text: category.text, enabled: category.enabled,
    createdAt: category.createdAt.toISOString(), updatedAt: category.updatedAt.toISOString(),
  };
}

export class CustomCategoryService {
  private readonly byUser = new Map<string, StoredCustomCategory[]>();
  private readonly listeners = new Set<(userId: string) => void>();

  constructor(private readonly repository: CustomCategoryRepository) {}

  async load(): Promise<void> {
    this.byUser.clear();
    for (const category of await this.repository.findAll()) this.insertCached(category);
  }

  onChanged(listener: (userId: string) => void): () => void {
    this.listeners.add(listener); return () => this.listeners.delete(listener);
  }

  list(userId: string): CustomCategoryView[] {
    return [...(this.byUser.get(userId) ?? [])].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()).map(view);
  }

  enabled(userId: string): SubjectiveCategory[] {
    return (this.byUser.get(userId) ?? []).filter((category) => category.enabled).map(({ id, text }) => ({ id, text }));
  }

  async create(userId: string, input: unknown): Promise<CustomCategoryView> {
    const { text } = createCustomCategorySchema.parse(input);
    this.assertUnique(userId, normalizeCustomCategory(text));
    const created = await this.repository.create(userId, text, normalizeCustomCategory(text));
    this.insertCached(created); this.notify(userId); return view(created);
  }

  async update(userId: string, id: string, input: unknown): Promise<CustomCategoryView> {
    const parsed = updateCustomCategorySchema.parse(input);
    const normalizedText = parsed.text === undefined ? undefined : normalizeCustomCategory(parsed.text);
    if (normalizedText !== undefined) this.assertUnique(userId, normalizedText, id);
    const updated = await this.repository.update(userId, id, {
      ...(parsed.text === undefined ? {} : { text: parsed.text, normalizedText: normalizedText! }),
      ...(parsed.enabled === undefined ? {} : { enabled: parsed.enabled }),
    });
    if (!updated) throw new CustomCategoryNotFoundError();
    const categories = this.byUser.get(userId) ?? [];
    this.byUser.set(userId, categories.map((category) => category.id === id ? updated : category));
    this.notify(userId); return view(updated);
  }

  async delete(userId: string, id: string): Promise<void> {
    if (!(await this.repository.delete(userId, id))) throw new CustomCategoryNotFoundError();
    this.byUser.set(userId, (this.byUser.get(userId) ?? []).filter((category) => category.id !== id));
    this.notify(userId);
  }

  private assertUnique(userId: string, normalizedText: string, ignoredId?: string): void {
    if ((this.byUser.get(userId) ?? []).some((category) => category.id !== ignoredId && category.normalizedText === normalizedText)) {
      throw new DuplicateCustomCategoryError();
    }
  }

  private insertCached(category: StoredCustomCategory): void {
    this.byUser.set(category.userId, [...(this.byUser.get(category.userId) ?? []), category]);
  }

  private notify(userId: string): void { for (const listener of this.listeners) listener(userId); }
}

export class DuplicateCustomCategoryError extends Error {
  readonly status = 409;
  constructor() { super('Ya tienes una categoría igual o equivalente.'); }
}
export class CustomCategoryNotFoundError extends Error {
  readonly status = 404;
  constructor() { super('Categoría no encontrada.'); }
}
