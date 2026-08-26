import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.hoisted(() => vi.fn());
vi.mock('../db.js', () => ({ prisma: { user: { findUnique } } }));
vi.mock('./tokens.js', () => ({ AUTH_COOKIE: 'pu_session', verifyIdentity: vi.fn() }));

import { requireAdmin } from './middleware.js';

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('administrator authorization', () => {
  beforeEach(() => findUnique.mockReset());

  it('checks the current database role before allowing access', async () => {
    findUnique.mockResolvedValue({ role: 'ADMIN' });
    const req = { auth: { id: 'admin-1', kind: 'USER' } };
    const res = response(); const next = vi.fn();

    await requireAdmin(req as never, res as never, next);

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'admin-1' }, select: { role: true } });
    expect(next).toHaveBeenCalledOnce();
  });

  it('revokes access immediately when the stored role is no longer ADMIN', async () => {
    findUnique.mockResolvedValue({ role: 'USER' });
    const req = { auth: { id: 'former-admin', kind: 'USER', role: 'ADMIN' } };
    const res = response(); const next = vi.fn();

    await requireAdmin(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects guests without querying registered accounts', async () => {
    const req = { auth: { id: 'guest-1', kind: 'GUEST' } };
    const res = response(); const next = vi.fn();

    await requireAdmin(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
