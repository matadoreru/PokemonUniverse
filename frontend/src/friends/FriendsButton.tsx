import { Users } from 'lucide-react';
import { Pill } from '../ui';
import { useOptionalFriends } from './FriendsContext';

/** Texto accesible de la placa: el nombre y, si hay, las solicitudes recibidas. */
export function friendsButtonLabel(pending: number): string {
  if (pending === 0) return 'Amigos';
  return `Amigos, ${pending} ${pending === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'}`;
}

/**
 * Placa «Amigos» de la cabecera con la insignia de solicitudes recibidas. Solo para cuentas registradas; fuera de
 * `FriendsProvider` (la cabecera probada sola) no se pinta.
 */
export function FriendsButton() {
  const friends = useOptionalFriends();
  if (!friends?.enabled) return null;
  const { pendingCount, openDrawer } = friends;
  return <Pill size="round" icon={Users} aria-label={friendsButtonLabel(pendingCount)} title="Amigos" aria-haspopup="dialog" {...(pendingCount > 0 ? { badge: String(Math.min(pendingCount, 99)) } : {})} onClick={openDrawer} />;
}
