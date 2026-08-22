import type { ClientToServerEvents, ServerToClientEvents } from '@pokemon-universe/shared';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { parse } from 'cookie';
import { Server } from 'socket.io';
import { ZodError } from 'zod';
import { authRouter } from './auth/routes.js';
import { optionalAuth } from './auth/middleware.js';
import { AUTH_COOKIE, verifyIdentity } from './auth/tokens.js';
import { env } from './config.js';
import { prisma } from './db.js';
import { apiRouter, registerGameImageResolver } from './http/routes.js';
import { loadPokemonCatalog } from './pokemon/catalog.js';
import { RoomManager } from './rooms/manager.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use(rateLimit({
  windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false,
  skip: (req) => /^\/api\/rooms\/[^/]+\/games\/[^/]+\/rounds\/\d+\/options\/[A-D]\/sprite$/.test(req.path),
}));
app.use(optionalAuth);
app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, limit: 30 }), authRouter);
app.use('/api', apiRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  void next;
  if (error instanceof ZodError) { res.status(400).json({ error: error.issues[0]?.message ?? 'Invalid input', issues: error.issues }); return; }
  console.error(error);
  res.status(500).json({ error: env.NODE_ENV === 'production' ? 'Internal server error' : error instanceof Error ? error.message : 'Unknown error' });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { identity: Awaited<ReturnType<typeof verifyIdentity>> }>(httpServer, {
  cors: { origin: env.WEB_ORIGIN, credentials: true }, transports: ['websocket', 'polling'],
  connectionStateRecovery: { maxDisconnectionDuration: env.RECONNECT_GRACE_MS, skipMiddlewares: false },
  maxHttpBufferSize: 32_768,
});

io.use(async (socket, next) => {
  try {
    const cookies = parse(socket.handshake.headers.cookie ?? '');
    const token = cookies[AUTH_COOKIE]; if (!token) throw new Error('Authentication required');
    socket.data.identity = await verifyIdentity(token); next();
  } catch { next(new Error('Authentication required')); }
});

const catalog = await loadPokemonCatalog();
const rooms = new RoomManager(io, catalog);
registerGameImageResolver((code, assetToken, roundNumber, optionId) => rooms.shinyOptionSprite(code, assetToken, roundNumber, optionId));
io.on('connection', (socket) => {
  const recentEvents: number[] = [];
  socket.use((_event, next) => {
    const now = Date.now(); while (recentEvents[0] && recentEvents[0] < now - 10_000) recentEvents.shift();
    if (recentEvents.length >= 50) { next(new Error('Rate limit exceeded')); return; }
    recentEvents.push(now); next();
  });
  rooms.bind(socket);
});

httpServer.listen(env.PORT, () => console.info(`API listening on :${env.PORT} with ${catalog.all().length} Pokémon`));

async function shutdown(): Promise<void> {
  io.close(); httpServer.close(); await prisma.$disconnect(); process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
