import type { AuthUser } from '@pokemon-universe/shared/public';
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { api } from '../lib/api';
import type { MeResponse, LoginResponse, RegisterResponse, GuestResponse, ProgressResponse } from '../lib/api-contract';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login(identifier: string, password: string): Promise<void>;
  register(username: string, email: string, password: string): Promise<void>;
  guest(displayName: string, avatar?: Blob): Promise<void>;
  updateUser(user: AuthUser): void;
  /** Nivel de la cuenta registrada (insignia del avatar de la cabecera); `null` para invitados o mientras carga. */
  level: number | null;
  /** Pone el nivel que ya conoce otra pantalla (la sala lo recibe en vivo al terminar cada partida, el perfil al cargar). */
  syncLevel(level: number): void;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<number | null>(null);
  const registeredId = user?.kind === 'USER' ? user.id : null;
  useEffect(() => {
    setLevel(null);
    if (!registeredId) return;
    const controller = new AbortController();
    // Sin nivel no pasa nada: la cabecera enseña el avatar sin insignia.
    void api<ProgressResponse>('/auth/progress', { signal: controller.signal })
      .then((body) => { if (!controller.signal.aborted) setLevel(body.progress.level); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [registeredId]);
  useEffect(() => {
    const controller = new AbortController();
    void api<MeResponse>('/auth/me', { signal: controller.signal })
      .then((body) => { if (!controller.signal.aborted) setUser(body.user); })
      .catch(() => { if (!controller.signal.aborted) setUser(null); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const value = useMemo<AuthContextValue>(() => ({
    user, loading, level, syncLevel: setLevel,
    async login(identifier, password) { const body = await api<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) }); setUser(body.user); },
    async register(username, email, password) { const body = await api<RegisterResponse>('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) }); setUser(body.user); },
    async guest(displayName, avatar) {
      const body = avatar instanceof Blob
        ? await api<GuestResponse>(`/auth/guest/custom-avatar?displayName=${encodeURIComponent(displayName)}`, { method: 'POST', headers: { 'Content-Type': avatar.type }, body: avatar })
        : await api<GuestResponse>('/auth/guest', { method: 'POST', body: JSON.stringify({ displayName }) });
      setUser(body.user);
    },
    updateUser(nextUser) { setUser(nextUser); },
    async logout() { await api('/auth/logout', { method: 'POST' }); setUser(null); },
  }), [level, loading, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be inside AuthProvider'); return value;
}
