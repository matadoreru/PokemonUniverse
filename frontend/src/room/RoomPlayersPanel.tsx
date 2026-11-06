import type { RoomMemberView } from '@pokemon-universe/shared/public';
import { useCallback, useRef } from 'react';
import { Badge, Panel } from '../ui';
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
  className?: string;
  /** Clase del cuerpo que se desplaza (el lobby le pone el tope de alto por debajo de 1024 px). */
  bodyClassName?: string;
}

/**
 * Placa de jugadores de la sala: las franjas de `PlayerList` en un panel con su contador de conectados; la lista se
 * desplaza dentro. Tras confirmar una expulsión o un traspaso del Host el foco pasa al título del panel: el diálogo lo
 * devuelve a una fila (o a un botón) que está a punto de desaparecer. Con una cuenta registrada, «Gestionar a…» también
 * sirve para pedir la amistad a otra cuenta de la sala.
 */
export function RoomPlayersPanel({ members, maxPlayers, className, bodyClassName, ...list }: Props) {
  const connected = connectedCount(members);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Después de que el diálogo cierre y devuelva su foco (en su efecto): una tarea más tarde.
  const focusTitle = useCallback(() => { window.setTimeout(() => titleRef.current?.focus(), 0); }, []);
  return (
    <Panel title="Jugadores" titleRef={titleRef} aria-label="Jugadores" scroll scrollLabel="Lista de jugadores" className={className ?? ''} bodyClassName={bodyClassName ?? ''} right={<><Badge tone="yellow">{`${connected} / ${maxPlayers}`}</Badge><span className="sr-only">conectados</span></>}>
      <PlayerList members={members} onConfirmed={focusTitle} friendActions {...list} />
    </Panel>
  );
}
