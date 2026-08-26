import { ADMIN_PAGE_SIZE, gameRegistry, type AdminActiveRoom, type AdminGameHistoryItem, type AdminRoomHistoryItem, type AdminUserItem, type PaginatedAdminResponse } from '@pokemon-universe/shared';
import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../auth/middleware.js';
import { prisma } from '../db.js';

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().trim().max(80).default(''),
});

function paginated<T>(items: T[], page: number, total: number): PaginatedAdminResponse<T> {
  return { items, page, pageSize: ADMIN_PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
}

export function createAdminRouter(getActiveRooms: () => AdminActiveRoom[]): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get('/summary', async (_req, res, next) => {
    try {
      const activeRooms = getActiveRooms();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [registeredUsers, interruptedToday] = await Promise.all([
        prisma.user.count(),
        prisma.gameHistory.count({ where: { status: 'INTERRUPTED', startedAt: { gte: today } } }),
      ]);
      res.json({
        activeRooms: activeRooms.length,
        gamesInProgress: activeRooms.filter((room) => room.gameId !== null).length,
        registeredUsers, interruptedToday, updatedAt: new Date().toISOString(),
      });
    } catch (error) { next(error); }
  });

  router.get('/active-rooms', (req, res, next) => {
    try {
      const query = pageQuery.parse(req.query);
      const needle = query.search.toLocaleLowerCase('es');
      const filtered = getActiveRooms().filter((room) => !needle
        || room.code.toLocaleLowerCase('es').includes(needle)
        || room.hostDisplayName.toLocaleLowerCase('es').includes(needle)
        || room.participants.some((participant) => participant.displayName.toLocaleLowerCase('es').includes(needle)));
      const start = (query.page - 1) * ADMIN_PAGE_SIZE;
      res.json(paginated(filtered.slice(start, start + ADMIN_PAGE_SIZE), query.page, filtered.length));
    } catch (error) { next(error); }
  });

  router.get('/rooms', async (req, res, next) => {
    try {
      const query = pageQuery.extend({ status: z.enum(['ACTIVE', 'CLOSED', 'INTERRUPTED']).optional() }).parse(req.query);
      const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.search ? { OR: [
          { roomCode: { contains: query.search, mode: 'insensitive' as const } },
          { hostDisplayName: { contains: query.search, mode: 'insensitive' as const } },
        ] } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.roomHistory.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * ADMIN_PAGE_SIZE, take: ADMIN_PAGE_SIZE, include: { _count: { select: { games: true } } } }),
        prisma.roomHistory.count({ where }),
      ]);
      const items: AdminRoomHistoryItem[] = rows.map((room) => ({
        id: room.id, code: room.roomCode, hostDisplayName: room.hostDisplayName, hostUserId: room.hostUserId,
        maxPlayers: room.maxPlayers, status: room.status, closeReason: room.closeReason,
        gamesStarted: room._count.games, createdAt: room.createdAt.toISOString(), endedAt: room.endedAt?.toISOString() ?? null,
      }));
      res.json(paginated(items, query.page, total));
    } catch (error) { next(error); }
  });

  router.get('/games', async (req, res, next) => {
    try {
      const query = pageQuery.extend({
        status: z.enum(['IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'INTERRUPTED']).optional(),
        gameId: z.string().trim().max(64).optional(),
      }).parse(req.query);
      const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.gameId ? { gameId: query.gameId } : {}),
        ...(query.search ? { OR: [
          { roomCode: { contains: query.search, mode: 'insensitive' as const } },
          { results: { some: { displayName: { contains: query.search, mode: 'insensitive' as const } } } },
        ] } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.gameHistory.findMany({ where, orderBy: { startedAt: 'desc' }, skip: (query.page - 1) * ADMIN_PAGE_SIZE, take: ADMIN_PAGE_SIZE, include: { results: { orderBy: { position: 'asc' } } } }),
        prisma.gameHistory.count({ where }),
      ]);
      const items: AdminGameHistoryItem[] = rows.map((game) => ({
        id: game.id, roomCode: game.roomCode, gameId: game.gameId,
        gameName: gameRegistry.get(game.gameId)?.manifest.name ?? game.gameId,
        playerCount: game.playerCount, status: game.status, startedAt: game.startedAt.toISOString(), endedAt: game.endedAt?.toISOString() ?? null,
        participants: game.results.map((result) => ({ displayName: result.displayName, userId: result.userId, position: result.position, points: result.points })),
      }));
      res.json(paginated(items, query.page, total));
    } catch (error) { next(error); }
  });

  router.get('/users', async (req, res, next) => {
    try {
      const query = pageQuery.extend({ role: z.enum(['USER', 'ADMIN']).optional() }).parse(req.query);
      const where = {
        ...(query.role ? { role: query.role } : {}),
        ...(query.search ? { OR: [
          { username: { contains: query.search, mode: 'insensitive' as const } },
          { email: { contains: query.search, mode: 'insensitive' as const } },
        ] } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * ADMIN_PAGE_SIZE, take: ADMIN_PAGE_SIZE, include: { stats: true } }),
        prisma.user.count({ where }),
      ]);
      const items: AdminUserItem[] = rows.map((user) => ({
        id: user.id, username: user.username, email: user.email, role: user.role,
        gamesPlayed: user.stats?.gamesPlayed ?? 0, gamesWon: user.stats?.gamesWon ?? 0, totalPoints: user.stats?.totalPoints ?? 0,
        createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString(),
      }));
      res.json(paginated(items, query.page, total));
    } catch (error) { next(error); }
  });

  return router;
}
