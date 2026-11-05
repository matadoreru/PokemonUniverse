import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { FriendsProvider } from '../friends/FriendsContext';
import { RoomProvider } from '../room/RoomContext';
import { Layout } from './Layout';

/** Rutas de la sesión de sala, las únicas en las que un invitado abre el `/ws`. */
const ROOM_PATHS = new Set(['/play', '/room']);

/** Un invitado solo abre el `/ws` en las rutas de sala; una cuenta registrada, en toda página (amigos e invitaciones). */
export function socketActive(kind: 'USER' | 'GUEST' | undefined, pathname: string): boolean {
  return kind === 'USER' || (kind === 'GUEST' && ROOM_PATHS.has(pathname));
}

/**
 * Raíz de la aplicación: el `/ws` (`RoomProvider`) y los amigos (`FriendsProvider`) envuelven el armazón, así la placa
 * «Amigos» y las invitaciones llegan en cualquier pantalla (spec de amigos). Sin sesión no se abre nada.
 */
export function SessionRoot() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  return <RoomProvider active={socketActive(user?.kind, pathname)}><FriendsProvider><Layout /></FriendsProvider></RoomProvider>;
}
