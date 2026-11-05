import type { FriendInvite } from '@pokemon-universe/shared/public';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import type { FriendsResponse } from '../lib/api-contract';
import { useRoom } from '../room/RoomContext';
import { addInvite, applyPresence, emptyFriendsState, pendingCount, pruneInvites, removeInvite, setOverview, type FriendsState } from './friends-state';

/** Tras invitar, el botón dice «Invitado» este tiempo (el servidor rechaza repetir antes de 30 s). */
export const INVITED_MS = 30_000;
/** Cada cuánto se descartan las invitaciones caducadas que no tienen aviso en pantalla. */
const PRUNE_MS = 60_000;

export interface FriendsContextValue {
  /** `GET /api/friends`, con la lista ya ordenada; `null` sin cargar o con una cuenta de invitado. */
  overview: FriendsResponse | null;
  /** Solicitudes recibidas (la insignia de la placa). */
  pendingCount: number;
  /** Invitaciones recibidas que siguen vivas, la más reciente al final. */
  invites: FriendInvite[];
  /** Amigos invitados hace menos de `INVITED_MS`. */
  invited: ReadonlySet<string>;
  /** Placa «Amigos» y panel: solo cuentas registradas. */
  enabled: boolean;
  drawerOpen: boolean;
  openDrawer(): void;
  closeDrawer(): void;
  /** Las cuatro acciones REST lanzan el error del servidor en inglés: el panel lo traduce en línea (`friendErrorMessage`). */
  send(username: string): Promise<'request' | 'friend'>;
  accept(requestId: string): Promise<void>;
  decline(requestId: string): Promise<void>;
  remove(userId: string): Promise<void>;
  /** `room:invite`: el error sale en el aviso de la sala; quien llama solo lo captura. */
  invite(userId: string): Promise<void>;
  dismissInvite(inviteId: string): void;
}

const FriendsContext = createContext<FriendsContextValue | null>(null);

/**
 * Estado de amigos de la sesión (spec «Estado de la lista»): va dentro de `RoomProvider`, que tiene el `/ws`. Carga
 * `GET /api/friends` al abrir la sesión de una cuenta registrada, al reconectar y con cada `friends:changed`; aplica cada
 * `friends:presence` sin volver a pedirla y guarda las `friends:invite`. Con un invitado no pide nada ni escucha nada.
 */
export function FriendsProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const { connected, subscribe, inviteFriend } = useRoom();
  const userId = user?.kind === 'USER' ? user.id : null;
  const [state, setState] = useState<FriendsState>(emptyFriendsState);
  const [invited, setInvited] = useState<ReadonlySet<string>>(() => new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const loadSeq = useRef(0);
  const invitedTimers = useRef(new Map<string, number>());

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const overview = await api<FriendsResponse>('/friends');
    // Solo vale la última petición: una respuesta vieja no pisa a una más nueva.
    if (seq === loadSeq.current) setState((current) => setOverview(current, overview));
  }, []);
  // Un fallo al cargar deja la lista anterior; el siguiente `friends:changed` o la reconexión lo reintentan.
  const reload = useCallback(() => { void load().catch(() => undefined); }, [load]);

  // Otra cuenta (o ninguna): se empieza de cero.
  useEffect(() => {
    loadSeq.current++;
    setState(emptyFriendsState);
    setDrawerOpen(false);
    return () => { loadSeq.current++; };
  }, [userId]);

  // Al abrir la sesión y al reconectar: los avisos de presencia perdidos sin conexión no vuelven solos.
  useEffect(() => {
    if (userId && connected) reload();
  }, [userId, connected, reload]);

  useEffect(() => {
    if (!userId) return;
    const offs = [
      subscribe('friends:changed', () => reload()),
      subscribe('friends:presence', (presence) => setState((current) => applyPresence(current, presence))),
      subscribe('friends:invite', (invite) => setState((current) => addInvite(current, invite, Date.now()))),
    ];
    const prune = window.setInterval(() => setState((current) => pruneInvites(current, Date.now())), PRUNE_MS);
    return () => { for (const off of offs) off(); window.clearInterval(prune); };
  }, [userId, subscribe, reload]);

  useEffect(() => {
    const timers = invitedTimers.current;
    return () => { for (const timer of timers.values()) window.clearTimeout(timer); timers.clear(); };
  }, []);

  const markInvited = useCallback((friendId: string) => {
    const timers = invitedTimers.current;
    window.clearTimeout(timers.get(friendId));
    setInvited((current) => new Set(current).add(friendId));
    timers.set(friendId, window.setTimeout(() => {
      timers.delete(friendId);
      setInvited((current) => { const next = new Set(current); next.delete(friendId); return next; });
    }, INVITED_MS));
  }, []);

  const value = useMemo<FriendsContextValue>(() => ({
    overview: userId ? state.overview : null,
    pendingCount: userId ? pendingCount(state.overview) : 0,
    invites: userId ? state.invites : [],
    invited,
    enabled: Boolean(userId),
    drawerOpen: Boolean(userId) && drawerOpen,
    openDrawer: () => setDrawerOpen(true),
    closeDrawer: () => setDrawerOpen(false),
    async send(username) {
      const body = await api<{ request?: unknown; friend?: unknown }>('/friends/requests', { method: 'POST', body: JSON.stringify({ username }) });
      reload();
      return body.friend ? 'friend' : 'request';
    },
    async accept(requestId) { await api(`/friends/requests/${encodeURIComponent(requestId)}/accept`, { method: 'POST' }); reload(); },
    async decline(requestId) { await api(`/friends/requests/${encodeURIComponent(requestId)}`, { method: 'DELETE' }); reload(); },
    async remove(friendId) { await api(`/friends/${encodeURIComponent(friendId)}`, { method: 'DELETE' }); reload(); },
    async invite(friendId) { await inviteFriend(friendId); markInvited(friendId); },
    dismissInvite: (inviteId) => setState((current) => removeInvite(current, inviteId)),
  }), [drawerOpen, inviteFriend, invited, markInvited, reload, state, userId]);
  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

export function useFriends(): FriendsContextValue {
  const value = useContext(FriendsContext); if (!value) throw new Error('useFriends must be inside FriendsProvider'); return value;
}

/** Fuera de `FriendsProvider` (pantallas probadas sin proveedores, como el lobby), `null`. */
export function useOptionalFriends(): FriendsContextValue | null {
  return useContext(FriendsContext);
}
