import type { RoomMemberView } from '@pokemon-universe/shared/public';
import { useCallback, useRef } from 'react';
import { Badge, Panel, StateBox, type StateBoxProps } from '../ui';
import { connectedCount } from './lobby-state';
import { PlayerList } from './PlayerList';

interface Props {
  members: RoomMemberView[];
  maxPlayers: number;
  selfId: string;
  canManage: boolean;
  onSetRoomRole(id: string, role: 'CO_HOST' | 'MEMBER'): void;
  onTransferHost(id: string): void;
  onKick(id: string): void;
  /** Silenciar o quitar el silencio en el chat (Host y Co-host). */
  onSetChatMute?(id: string, muted: boolean): void;
  className?: string;
  /** Clase del cuerpo que se desplaza (el lobby le pone el tope de alto por debajo de 1024 px). */
  bodyClassName?: string;
  /** Sala vacía: con un solo jugador conectado se pinta bajo su franja (sin región viva: el lobby tiene la suya). */
  empty?: Omit<StateBoxProps, 'live'> | null;
}

/**
 * Placa de jugadores de la sala: las franjas de `PlayerList` en un panel con su contador de conectados; la lista se
 * desplaza dentro. Tras confirmar una expulsión o un traspaso del Host el foco pasa al título del panel: el diálogo lo
 * devuelve a una fila (o a un botón) que está a punto de desaparecer. Con una cuenta registrada, «Gestionar a…» también
 * sirve para pedir la amistad a otra cuenta de la sala. Mientras solo hay un jugador conectado, `empty` invita a traer
 * a más (copiar el enlace e invitar amigos).
 */
export function RoomPlayersPanel({ members, maxPlayers, className, bodyClassName, empty, ...list }: Props) {
  const connected = connectedCount(members);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Después de que el diálogo cierre y devuelva su foco (en su efecto): una tarea más tarde.
  const focusTitle = useCallback(() => { window.setTimeout(() => titleRef.current?.focus(), 0); }, []);
  return (
    <Panel title="Jugadores" titleRef={titleRef} aria-label="Jugadores" scroll scrollLabel="Lista de jugadores" className={className ?? ''} bodyClassName={bodyClassName ?? ''} right={<><Badge tone="yellow">{`${connected} / ${maxPlayers}`}</Badge><span className="sr-only">conectados</span></>}>
      <PlayerList members={members} onConfirmed={focusTitle} friendActions {...list} />
      {empty && connected <= 1 && <StateBox {...empty} live={false} />}
    </Panel>
  );
}
