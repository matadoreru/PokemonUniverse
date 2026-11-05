import type { FriendInvite, FriendStatus } from '@pokemon-universe/shared/public';
import type { FriendResponse, FriendsResponse } from '../lib/api-contract';

/** Un amigo de la lista (`GET /api/friends`). */
export type FriendEntry = FriendResponse;

/** Estado del `FriendsProvider`: la lista (sin cargar, `null`) y las invitaciones recibidas que siguen vivas. */
export interface FriendsState {
  overview: FriendsResponse | null;
  invites: FriendInvite[];
}

export const emptyFriendsState: FriendsState = { overview: null, invites: [] };

/** Orden de la lista: Jugando, En una sala, Conectado, Desconectado. */
const STATUS_ORDER: Record<FriendStatus, number> = { PLAYING: 0, IN_ROOM: 1, ONLINE: 2, OFFLINE: 3 };

export const FRIEND_STATUS_LABEL: Record<FriendStatus, string> = {
  PLAYING: 'Jugando',
  IN_ROOM: 'En una sala',
  ONLINE: 'Conectado',
  OFFLINE: 'Desconectado',
};

/** Por estado (`STATUS_ORDER`) y, dentro de cada uno, alfabético en español sin distinguir mayúsculas ni tildes. */
export function sortFriends(list: readonly FriendEntry[]): FriendEntry[] {
  return [...list].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.username.localeCompare(b.username, 'es', { sensitivity: 'base' }));
}

/** Lista recién pedida: se guarda ya ordenada. */
export function setOverview(state: FriendsState, overview: FriendsResponse | null): FriendsState {
  return { ...state, overview: overview && { ...overview, friends: sortFriends(overview.friends) } };
}

/** `friends:presence`: cambia el estado de un amigo y reordena. Sin lista o si no es amigo, el mismo estado. */
export function applyPresence(state: FriendsState, presence: { userId: string; status: FriendStatus }): FriendsState {
  const overview = state.overview;
  if (!overview || !overview.friends.some((friend) => friend.id === presence.userId)) return state;
  const friends = overview.friends.map((friend) => (friend.id === presence.userId ? { ...friend, status: presence.status } : friend));
  return { ...state, overview: { ...overview, friends: sortFriends(friends) } };
}

const alive = (invite: FriendInvite, now: number) => Date.parse(invite.expiresAt) > now;

/** Quita las invitaciones caducadas. Si no hay ninguna, el mismo estado. */
export function pruneInvites(state: FriendsState, now: number): FriendsState {
  const invites = state.invites.filter((invite) => alive(invite, now));
  return invites.length === state.invites.length ? state : { ...state, invites };
}

/** `friends:invite`: la nueva sustituye a la anterior del mismo amigo y va al final; una ya caducada no entra. */
export function addInvite(state: FriendsState, invite: FriendInvite, now: number): FriendsState {
  const invites = state.invites.filter((current) => current.from.id !== invite.from.id && alive(current, now));
  return { ...state, invites: alive(invite, now) ? [...invites, invite] : invites };
}

export function removeInvite(state: FriendsState, inviteId: string): FriendsState {
  return { ...state, invites: state.invites.filter((invite) => invite.inviteId !== inviteId) };
}

/** Lo que cuenta la insignia de la placa «Amigos»: solo las solicitudes recibidas. */
export function pendingCount(overview: FriendsResponse | null): number {
  return overview?.incoming.length ?? 0;
}

const GENERIC = 'No se pudo completar. Inténtalo de nuevo en unos segundos.';

/**
 * Errores de las rutas `/api/friends` (`FriendService` y el limitador `friendRequests`) en español, para el texto en línea
 * del panel. `api()` lanza `Error(body.error)`.
 */
export const FRIEND_ERROR_TRANSLATIONS: Record<string, string> = {
  'Cannot send a friend request to this user': 'No se puede enviar la solicitud a ese usuario.',
  'Friend limit reached': 'Has llegado al límite de 200 amigos.',
  'Too many pending requests': 'Tienes demasiadas solicitudes pendientes.',
  'Friend request not found': 'Esa solicitud ya no existe.',
  'Too many requests': 'Demasiadas solicitudes seguidas. Espera unos minutos y vuelve a probar.',
};

export function friendErrorMessage(error: unknown): string {
  const raw = (typeof error === 'string' ? error : error instanceof Error ? error.message : '').trim();
  return Object.hasOwn(FRIEND_ERROR_TRANSLATIONS, raw) ? FRIEND_ERROR_TRANSLATIONS[raw]! : GENERIC;
}
