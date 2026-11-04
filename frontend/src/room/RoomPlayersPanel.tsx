import type { RoomMemberView } from '@pokemon-universe/shared/public';
import { Badge, Panel } from '../ui';
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
}

/** Placa de jugadores de la sala: las franjas de `PlayerList` en un panel con su contador de conectados; la lista se desplaza dentro. */
export function RoomPlayersPanel({ members, maxPlayers, className, ...list }: Props) {
  const connected = members.filter((member) => member.presence === 'CONNECTED').length;
  return (
    <Panel title="Jugadores" aria-label="Jugadores" scroll className={className ?? ''} right={<><Badge tone="yellow">{`${connected} / ${maxPlayers}`}</Badge><span className="sr-only">conectados</span></>}>
      <PlayerList members={members} {...list} />
    </Panel>
  );
}
