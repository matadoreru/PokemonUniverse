import { avatarPresetIdSchema, DEFAULT_AVATAR, gameRegistry, guestSchema, loginSchema, registerSchema, type AuthUser, type AvatarRef, type UserProfileResponse, type UserRole } from '@pokemon-universe/shared';
import bcrypt from 'bcryptjs';
import express, { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AvatarService, MAX_AVATAR_UPLOAD_BYTES } from '../avatar/service.js';
import { FilesystemAvatarStorage } from '../avatar/storage.js';
import { prisma } from '../db.js';
import { env } from '../config.js';
import { requireUser } from './middleware.js';
import { notifyAvatarUpdated } from './profile-events.js';
import { AUTH_COOKIE, signIdentity } from './tokens.js';

export const authRouter = Router();
const avatarService = new AvatarService(new FilesystemAvatarStorage(env.AVATAR_STORAGE_DIR));
const avatarRateLimit = rateLimit({ windowMs: 15 * 60_000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false });
const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: env.COOKIE_SECURE, path: '/', maxAge: 30 * 24 * 60 * 60 * 1_000 };

async function establish(res: Response, identity: AuthUser): Promise<void> {
  res.cookie(AUTH_COOKIE, await signIdentity(identity), cookieOptions);
}

function avatarFromUser(user: { avatarType: string; avatarValue: string | null; avatarVersion: number }): AvatarRef {
  if (user.avatarType === 'PRESET') {
    const preset = avatarPresetIdSchema.safeParse(user.avatarValue);
    if (preset.success) return { type: 'PRESET', value: preset.data };
  }
  if (user.avatarType === 'CUSTOM' && user.avatarValue && /^[0-9a-f-]{36}\.webp$/.test(user.avatarValue)) return { type: 'CUSTOM', value: user.avatarValue, version: user.avatarVersion };
  return DEFAULT_AVATAR;
}

function identityFromUser(user: { id: string; username: string; email: string; role: UserRole; avatarType: string; avatarValue: string | null; avatarVersion: number }): AuthUser {
  return { id: user.id, displayName: user.username, email: user.email, role: user.role, kind: 'USER', avatar: avatarFromUser(user) };
}

function guestIdentity(displayName: string, avatar: AvatarRef): AuthUser {
  return { id: `guest_${randomUUID()}`, displayName, kind: 'GUEST', avatar };
}

function removePriorGuestAvatar(identity: AuthUser | undefined, except?: string): void {
  if (identity?.kind === 'GUEST' && identity.avatar.type === 'CUSTOM' && identity.avatar.value !== except) {
    void avatarService.remove(identity.avatar.value).catch(() => undefined);
  }
}

async function applyAvatar(userId: string, avatar: AvatarRef): Promise<AuthUser> {
  const previous = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarType: true, avatarValue: true } });
  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatarType: avatar.type, avatarValue: avatar.type === 'DEFAULT' ? null : avatar.value, avatarVersion: { increment: 1 } },
  });
  const identity = identityFromUser(user);
  notifyAvatarUpdated(userId, identity.avatar);
  if (previous.avatarType === 'CUSTOM' && previous.avatarValue && previous.avatarValue !== (avatar.type === 'CUSTOM' ? avatar.value : null)) void avatarService.remove(previous.avatarValue).catch(() => undefined);
  return identity;
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
    const identity = identityFromUser(user);
    await establish(res, identity);
    res.status(201).json({ user: identity });
  } catch (error) { next(error); }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) { res.status(401).json({ error: 'Invalid email or password' }); return; }
    const identity = identityFromUser(user);
    await establish(res, identity);
    res.json({ user: identity });
  } catch (error) { next(error); }
});

authRouter.post('/guest', async (req, res, next) => {
  try {
    const { displayName, avatarPresetId } = guestSchema.parse(req.body);
    const identity = guestIdentity(displayName, avatarPresetId ? { type: 'PRESET', value: avatarPresetId } : DEFAULT_AVATAR);
    await establish(res, identity);
    removePriorGuestAvatar(req.auth);
    res.status(201).json({ user: identity });
  } catch (error) { next(error); }
});

authRouter.post('/guest/custom-avatar', avatarRateLimit, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_AVATAR_UPLOAD_BYTES }), async (req, res, next) => {
  let stored: AvatarRef & { type: 'CUSTOM' } | null = null;
  try {
    const { displayName } = guestSchema.parse({ displayName: req.query.displayName });
    if (!Buffer.isBuffer(req.body)) { res.status(415).json({ error: 'Usa una imagen JPEG, PNG o WEBP.' }); return; }
    const processed = await avatarService.processAndStore(req.body, req.get('Content-Type') ?? '');
    stored = processed;
    const identity = guestIdentity(displayName, processed);
    await establish(res, identity);
    removePriorGuestAvatar(req.auth, processed.value);
    res.status(201).json({ user: identity });
  } catch (error) {
    if (stored) await avatarService.remove(stored.value).catch(() => undefined);
    next(error);
  }
});

authRouter.post('/logout', (req, res) => { removePriorGuestAvatar(req.auth); res.clearCookie(AUTH_COOKIE, cookieOptions); res.status(204).end(); });
authRouter.get('/me', (req, res) => { res.json({ user: req.auth ?? null }); });

authRouter.get('/avatars/:filename', async (req, res, next) => {
  try {
    const contents = await avatarService.read(req.params.filename);
    if (!contents) { res.status(404).end(); return; }
    res.type('image/webp'); res.set('Cache-Control', 'public, max-age=31536000, immutable'); res.send(contents);
  } catch (error) { next(error); }
});

authRouter.put('/profile/avatar/preset', requireUser, avatarRateLimit, async (req, res, next) => {
  try {
    const { presetId } = z.object({ presetId: avatarPresetIdSchema }).strict().parse(req.body);
    const user = await applyAvatar(req.auth!.id, { type: 'PRESET', value: presetId });
    await establish(res, user); res.json({ user });
  } catch (error) { next(error); }
});

authRouter.delete('/profile/avatar', requireUser, avatarRateLimit, async (req, res, next) => {
  try {
    const user = await applyAvatar(req.auth!.id, DEFAULT_AVATAR);
    await establish(res, user); res.json({ user });
  } catch (error) { next(error); }
});

authRouter.put('/profile/avatar/custom', requireUser, avatarRateLimit, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_AVATAR_UPLOAD_BYTES }), async (req, res, next) => {
  let stored: AvatarRef & { type: 'CUSTOM' } | null = null;
  try {
    if (!Buffer.isBuffer(req.body)) { res.status(415).json({ error: 'Usa una imagen JPEG, PNG o WEBP.' }); return; }
    const processed = await avatarService.processAndStore(req.body, req.get('Content-Type') ?? '');
    stored = processed;
    const user = await applyAvatar(req.auth!.id, processed);
    await establish(res, user); res.json({ user });
  } catch (error) {
    if (stored) await avatarService.remove(stored.value).catch(() => undefined);
    next(error);
  }
});

authRouter.get('/profile', requireUser, async (req, res, next) => {
  try {
    const profile = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.id }, select: {
      id: true, username: true, email: true, avatarType: true, avatarValue: true, avatarVersion: true, createdAt: true,
      stats: true, gameStats: { select: { gameId: true, gamesPlayed: true, gamesWon: true, points: true, metrics: true } },
    } });
    const byGame = new Map(profile.gameStats.map((stats) => [stats.gameId, stats]));
    const response: UserProfileResponse = {
      user: { id: profile.id, username: profile.username, email: profile.email, avatar: avatarFromUser(profile), createdAt: profile.createdAt.toISOString() },
      globalStats: {
        gamesPlayed: profile.stats?.gamesPlayed ?? 0,
        gamesWon: profile.stats?.gamesWon ?? 0,
        totalPoints: profile.stats?.totalPoints ?? 0,
      },
      games: gameRegistry.manifests().map((manifest) => {
        const stored = byGame.get(manifest.id);
        const metrics = stored?.metrics && typeof stored.metrics === 'object' && !Array.isArray(stored.metrics)
          ? Object.fromEntries(Object.entries(stored.metrics).filter((entry): entry is [string, number] => typeof entry[1] === 'number')) : {};
        return { ...manifest, stats: { gameId: manifest.id, gamesPlayed: stored?.gamesPlayed ?? 0, gamesWon: stored?.gamesWon ?? 0, points: stored?.points ?? 0, metrics } };
      }),
    };
    res.json({ profile: response });
  } catch (error) { next(error); }
});
