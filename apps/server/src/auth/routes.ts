import { guestSchema, loginSchema, registerSchema, type AuthUser } from '@pokemon-universe/shared';
import bcrypt from 'bcryptjs';
import { Router, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db.js';
import { env } from '../config.js';
import { requireUser } from './middleware.js';
import { AUTH_COOKIE, signIdentity } from './tokens.js';

export const authRouter = Router();
const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: env.COOKIE_SECURE, path: '/', maxAge: 30 * 24 * 60 * 60 * 1_000 };

async function establish(res: Response, identity: AuthUser): Promise<void> {
  res.cookie(AUTH_COOKIE, await signIdentity(identity), cookieOptions);
}

authRouter.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const exists = await prisma.user.findFirst({ where: { OR: [{ email: input.email }, { username: input.username }] }, select: { id: true } });
    if (exists) { res.status(409).json({ error: 'Email or username already in use' }); return; }
    const user = await prisma.user.create({ data: {
      email: input.email, username: input.username, passwordHash: await bcrypt.hash(input.password, 12), avatarSeed: input.username,
      stats: { create: {} },
    } });
    const identity: AuthUser = { id: user.id, displayName: user.username, email: user.email, kind: 'USER' };
    await establish(res, identity);
    res.status(201).json({ user: identity });
  } catch (error) { next(error); }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) { res.status(401).json({ error: 'Invalid email or password' }); return; }
    const identity: AuthUser = { id: user.id, displayName: user.username, email: user.email, kind: 'USER' };
    await establish(res, identity);
    res.json({ user: identity });
  } catch (error) { next(error); }
});

authRouter.post('/guest', async (req, res, next) => {
  try {
    const { displayName } = guestSchema.parse(req.body);
    const identity: AuthUser = { id: `guest_${randomUUID()}`, displayName, kind: 'GUEST' };
    await establish(res, identity);
    res.status(201).json({ user: identity });
  } catch (error) { next(error); }
});

authRouter.post('/logout', (_req, res) => { res.clearCookie(AUTH_COOKIE, cookieOptions); res.status(204).end(); });
authRouter.get('/me', (req, res) => { res.json({ user: req.auth ?? null }); });

authRouter.get('/profile', requireUser, async (req, res, next) => {
  try {
    const profile = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.id }, select: {
      id: true, username: true, email: true, avatarSeed: true, createdAt: true,
      stats: true, gameStats: { select: { gameId: true, gamesPlayed: true, gamesWon: true, metrics: true } },
    } });
    res.json({ profile });
  } catch (error) { next(error); }
});
