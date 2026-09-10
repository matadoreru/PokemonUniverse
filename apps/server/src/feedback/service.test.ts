import type { AuthUser, FeedbackStatus } from '@pokemon-universe/shared';
import { describe, expect, it } from 'vitest';
import { FeedbackNotFoundError, FeedbackService, UnknownFeedbackGameError, type FeedbackFilters, type FeedbackRepository, type StoredFeedback } from './service.js';

class MemoryFeedbackRepository implements FeedbackRepository {
  entries: StoredFeedback[] = [];
  private nextId = 1;

  async create(data: Omit<StoredFeedback, 'id' | 'status' | 'createdAt' | 'updatedAt'>) {
    const now = new Date(`2026-09-08T12:0${this.nextId}:00.000Z`);
    const entry: StoredFeedback = { id: `feedback-${this.nextId++}`, ...data, status: 'NEW', createdAt: now, updatedAt: now };
    this.entries.push(entry); return { ...entry };
  }

  async list(filters: FeedbackFilters, skip: number, take: number) {
    return this.filtered(filters).slice(skip, skip + take).map((entry) => ({ ...entry }));
  }

  async count(filters: FeedbackFilters) { return this.filtered(filters).length; }

  async updateStatus(id: string, status: FeedbackStatus) {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry) return null;
    entry.status = status; entry.updatedAt = new Date('2026-09-08T13:00:00.000Z'); return { ...entry };
  }

  private filtered(filters: FeedbackFilters) {
    return this.entries.filter((entry) => (!filters.status || entry.status === filters.status)
      && (!filters.reference || entry.reference === filters.reference)
      && (!filters.type || entry.type === filters.type)
      && (!filters.search || `${entry.description} ${entry.authorDisplayName} ${entry.reference} ${entry.gameId ?? ''} ${entry.roomCode ?? ''}`.toLowerCase().includes(filters.search.toLowerCase())));
  }
}

const user: AuthUser = { id: 'user-1', displayName: 'Eru', kind: 'USER', role: 'USER', email: 'eru@example.com', avatar: { type: 'DEFAULT' } };
const guest: AuthUser = { id: 'guest-1', displayName: 'Misty', kind: 'GUEST', avatar: { type: 'DEFAULT' } };

describe('FeedbackService', () => {
  it('stores general and minigame feedback for registered and guest users', async () => {
    const repository = new MemoryFeedbackRepository(); const service = new FeedbackService(repository);
    const registered = await service.submit({ gameId: 'shiny-vote', roomCode: 'PIKA42', type: 'BUG', description: 'El cursor aparece desplazado.' }, user);
    const anonymous = await service.submit({ type: 'SUGGESTION', description: 'Me gustaría poder elegir el patrón.' }, guest);
    expect(registered.author).toEqual({ userId: 'user-1', displayName: 'Eru', kind: 'USER' });
    expect(anonymous.author).toEqual({ userId: null, displayName: 'Misty', kind: 'GUEST' });
    expect(registered.reference).toBe('MINIGAME');
    expect(anonymous).toMatchObject({ reference: 'GENERAL', gameId: null, gameName: null });
    expect(registered.roomCode).toBe('PIKA42');
  });

  it('rejects unknown games before persisting', async () => {
    const repository = new MemoryFeedbackRepository(); const service = new FeedbackService(repository);
    await expect(service.submit({ gameId: 'missing-game', type: 'BUG', description: 'Este juego no debería existir.' }, user)).rejects.toBeInstanceOf(UnknownFeedbackGameError);
    expect(repository.entries).toHaveLength(0);
  });

  it('filters the admin inbox and reports status counts', async () => {
    const repository = new MemoryFeedbackRepository(); const service = new FeedbackService(repository);
    const bug = await service.submit({ gameId: 'shiny-vote', type: 'BUG', description: 'El cursor aparece desplazado.' }, user);
    await service.submit({ reference: 'ROOMS', type: 'SUGGESTION', description: 'Añadir más opciones a las salas.' }, guest);
    await service.updateStatus(bug.id, 'REVIEWING');
    expect((await service.list({ type: 'SUGGESTION' }, 1)).items).toHaveLength(1);
    expect((await service.list({ reference: 'ROOMS' }, 1)).items).toHaveLength(1);
    expect(await service.overview()).toEqual({ newBugs: 0, newSuggestions: 1, reviewing: 1, resolved: 0 });
  });

  it('rejects updates for feedback that no longer exists', async () => {
    const service = new FeedbackService(new MemoryFeedbackRepository());
    await expect(service.updateStatus('missing', 'RESOLVED')).rejects.toBeInstanceOf(FeedbackNotFoundError);
  });
});
