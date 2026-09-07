import {
  changelogContentSchema,
  createChangelogSchema,
  updateChangelogSchema,
  type ChangelogEntry,
  type ChangelogChange,
} from '@pokemon-universe/shared';

export interface StoredChangelog {
  id: string;
  version: string;
  title: string;
  date: Date;
  published: boolean;
  content: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChangelogRepository {
  list(publishedOnly: boolean): Promise<StoredChangelog[]>;
  findByVersion(version: string): Promise<StoredChangelog | null>;
  create(data: { version: string; title: string; date: Date; published: boolean; content: ChangelogChange[] }): Promise<StoredChangelog>;
  update(id: string, data: Partial<{ version: string; title: string; date: Date; published: boolean; content: ChangelogChange[] }>): Promise<StoredChangelog | null>;
  delete(id: string): Promise<boolean>;
}

function view(entry: StoredChangelog): ChangelogEntry {
  return {
    id: entry.id,
    version: entry.version,
    title: entry.title,
    date: entry.date.toISOString(),
    published: entry.published,
    content: changelogContentSchema.parse(entry.content),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export class ChangelogService {
  constructor(private readonly repository: ChangelogRepository) {}

  async listPublished(): Promise<ChangelogEntry[]> {
    return (await this.repository.list(true)).map(view);
  }

  async listAll(): Promise<ChangelogEntry[]> {
    return (await this.repository.list(false)).map(view);
  }

  async create(input: unknown): Promise<ChangelogEntry> {
    const parsed = createChangelogSchema.parse(input);
    if (await this.repository.findByVersion(parsed.version)) throw new DuplicateChangelogVersionError();
    return view(await this.repository.create({ ...parsed, date: new Date(parsed.date) }));
  }

  async update(id: string, input: unknown): Promise<ChangelogEntry> {
    const parsed = updateChangelogSchema.parse(input);
    if (parsed.version !== undefined) {
      const duplicate = await this.repository.findByVersion(parsed.version);
      if (duplicate && duplicate.id !== id) throw new DuplicateChangelogVersionError();
    }
    const updated = await this.repository.update(id, {
      ...(parsed.version === undefined ? {} : { version: parsed.version }),
      ...(parsed.title === undefined ? {} : { title: parsed.title }),
      ...(parsed.date === undefined ? {} : { date: new Date(parsed.date) }),
      ...(parsed.published === undefined ? {} : { published: parsed.published }),
      ...(parsed.content === undefined ? {} : { content: parsed.content }),
    });
    if (!updated) throw new ChangelogNotFoundError();
    return view(updated);
  }

  async delete(id: string): Promise<void> {
    if (!(await this.repository.delete(id))) throw new ChangelogNotFoundError();
  }
}

export class DuplicateChangelogVersionError extends Error {
  readonly status = 409;
  constructor() { super('Ya existe una entrada con esta versión.'); }
}

export class ChangelogNotFoundError extends Error {
  readonly status = 404;
  constructor() { super('Versión no encontrada.'); }
}
