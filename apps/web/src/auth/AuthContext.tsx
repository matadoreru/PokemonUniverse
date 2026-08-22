import type { AuthUser } from '@pokemon-universe/shared';
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { api } from '../lib/api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  register(username: string, email: string, password: string): Promise<void>;
  guest(displayName: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void api<{ user: AuthUser | null }>('/auth/me').then((body) => setUser(body.user)).finally(() => setLoading(false)); }, []);
  const value = useMemo<AuthContextValue>(() => ({
    user, loading,
    async login(email, password) { const body = await api<{ user: AuthUser }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); setUser(body.user); },
    async register(username, email, password) { const body = await api<{ user: AuthUser }>('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) }); setUser(body.user); },
    async guest(displayName) { const body = await api<{ user: AuthUser }>('/auth/guest', { method: 'POST', body: JSON.stringify({ displayName }) }); setUser(body.user); },
    async logout() { await api('/auth/logout', { method: 'POST' }); setUser(null); },
  }), [loading, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be inside AuthProvider'); return value;
}
