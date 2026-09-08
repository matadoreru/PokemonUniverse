import {
  ADMIN_PAGE_SIZE,
  createFeedbackSchema,
  gameRegistry,
  feedbackStatusSchema,
  type AuthUser,
  type FeedbackItem,
  type FeedbackOverview,
  type FeedbackStatus,
  type FeedbackType,
  type PaginatedAdminResponse,
} from '@pokemon-universe/shared';

export interface StoredFeedback {
  id: string;
  gameId: string;
  roomCode: string | null;
  type: FeedbackType;
  status: FeedbackStatus;
  description: string;
  authorUserId: string | null;
  authorDisplayName: string;
  authorKind: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeedbackFilters {
  status?: FeedbackStatus;
  type?: FeedbackType;
  search?: string;
}

export interface FeedbackRepository {
  create(data: Omit<StoredFeedback, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<StoredFeedback>;
  list(filters: FeedbackFilters, skip: number, take: number): Promise<StoredFeedback[]>;
  count(filters: FeedbackFilters): Promise<number>;
  updateStatus(id: string, status: FeedbackStatus): Promise<StoredFeedback | null>;
}

function view(entry: StoredFeedback): FeedbackItem {
  return {
    id: entry.id,
    gameId: entry.gameId,
    gameName: gameRegistry.get(entry.gameId)?.manifest.name ?? entry.gameId,
    roomCode: entry.roomCode,
    type: entry.type,
    status: entry.status,
    description: entry.description,
    author: {
      userId: entry.authorUserId,
      displayName: entry.authorDisplayName,
      kind: entry.authorKind === 'USER' ? 'USER' : 'GUEST',
    },
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export class FeedbackService {
  constructor(private readonly repository: FeedbackRepository) {}

  async submit(input: unknown, author: AuthUser): Promise<FeedbackItem> {
    const parsed = createFeedbackSchema.parse(input);
    if (!gameRegistry.get(parsed.gameId)) throw new UnknownFeedbackGameError();
    return view(await this.repository.create({
      gameId: parsed.gameId,
      roomCode: parsed.roomCode ?? null,
      type: parsed.type,
      description: parsed.description,
      authorUserId: author.kind === 'USER' ? author.id : null,
      authorDisplayName: author.displayName,
      authorKind: author.kind,
    }));
  }

  async list(filters: FeedbackFilters, page: number): Promise<PaginatedAdminResponse<FeedbackItem>> {
    const skip = (page - 1) * ADMIN_PAGE_SIZE;
    const [entries, total] = await Promise.all([
      this.repository.list(filters, skip, ADMIN_PAGE_SIZE),
      this.repository.count(filters),
    ]);
    return {
      items: entries.map(view),
      page,
      pageSize: ADMIN_PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
    };
  }

  async overview(): Promise<FeedbackOverview> {
    const [newBugs, newSuggestions, reviewing, resolved] = await Promise.all([
      this.repository.count({ status: 'NEW', type: 'BUG' }),
      this.repository.count({ status: 'NEW', type: 'SUGGESTION' }),
      this.repository.count({ status: 'REVIEWING' }),
      this.repository.count({ status: 'RESOLVED' }),
    ]);
    return { newBugs, newSuggestions, reviewing, resolved };
  }

  async updateStatus(id: string, status: unknown): Promise<FeedbackItem> {
    const parsed = feedbackStatusSchema.parse(status);
    const entry = await this.repository.updateStatus(id, parsed);
    if (!entry) throw new FeedbackNotFoundError();
    return view(entry);
  }
}

export class UnknownFeedbackGameError extends Error {
  readonly status = 400;
  constructor() { super('El minijuego seleccionado no existe.'); }
}

export class FeedbackNotFoundError extends Error {
  readonly status = 404;
  constructor() { super('Feedback no encontrado.'); }
}
