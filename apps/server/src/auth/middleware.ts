import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db.js';
import { AUTH_COOKIE, verifyIdentity } from './tokens.js';

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[AUTH_COOKIE] as string | undefined;
  if (token) {
    try { req.auth = await verifyIdentity(token); } catch { delete req.auth; }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) { res.status(401).json({ error: 'Authentication required' }); return; }
  next();
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth || req.auth.kind !== 'USER') { res.status(401).json({ error: 'Registered account required' }); return; }
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.auth || req.auth.kind !== 'USER') { res.status(401).json({ error: 'Registered account required' }); return; }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth.id }, select: { role: true } });
    if (user?.role !== 'ADMIN') { res.status(403).json({ error: 'Administrator access required' }); return; }
    next();
  } catch (error) { next(error); }
}
