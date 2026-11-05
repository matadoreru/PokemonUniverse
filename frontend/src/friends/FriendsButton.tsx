import { Users } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HEADER_FRIENDS_ID } from '../components/Layout';
import { Pill } from '../ui';
import { useFriends } from './FriendsContext';

/** Texto accesible de la placa: el nombre y, si hay, las solicitudes recibidas. */
export function friendsButtonLabel(pending: number): string {
  if (pending === 0) return 'Amigos';
  return `Amigos, ${pending} ${pending === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'}`;
}

/** Placa «Amigos» con la insignia de solicitudes recibidas. Solo para cuentas registradas. */
export function FriendsButton() {
  const { enabled, pendingCount, openDrawer } = useFriends();
  if (!enabled) return null;
  return <Pill size="round" icon={Users} aria-label={friendsButtonLabel(pendingCount)} title="Amigos" aria-haspopup="dialog" {...(pendingCount > 0 ? { badge: String(Math.min(pendingCount, 99)) } : {})} onClick={openDrawer} />;
}

/** La placa va al hueco de la cabecera (`HEADER_FRIENDS_ID`), que solo existe con una cuenta registrada. */
export function FriendsButtonPortal() {
  const { enabled } = useFriends();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setSlot(enabled ? document.getElementById(HEADER_FRIENDS_ID) : null); }, [enabled]);
  return slot ? createPortal(<FriendsButton />, slot) : null;
}
