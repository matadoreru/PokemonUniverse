import type { PokedexDistancePublicState, RoomMemberView } from '@pokemon-universe/shared/public';
import { ArrowRightLeft, CheckCircle2, Crown, Eye, MoreVertical, Star, UserMinus, UserRoundCog } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { audio } from '../audio';
import { Avatar } from '../components/Avatar';
import { Badge, Chip, Dialog, Icon, Pill, Row } from '../ui';
import { playerColor } from './player-color';
import { distanceMemberStatus, distanceMemberStatusLabels } from './pokedex-distance-selection';
import s from './PlayerList.module.css';

interface Props {
  members: RoomMemberView[];
  game?: PokedexDistancePublicState | null;
  selfId: string;
  canManage?: boolean;
  onSetRoomRole?(id: string, role: 'CO_HOST' | 'MEMBER'): void;
  onTransferHost?(id: string): void;
  onKick?(id: string): void;
  /** Tras confirmar una expulsión o un traspaso del Host: la fila (o su botón) desaparece, así que el foco va a otro sitio. */
  onConfirmed?(): void;
}

function sameMembers(left: RoomMemberView[], right: RoomMemberView[]): boolean {
  return left.length === right.length && left.every((member, index) => {
    const other = right[index];
    return other && member.id === other.id && member.displayName === other.displayName && member.roomRole === other.roomRole
      && member.presence === other.presence && member.sessionPoints === other.sessionPoints && member.role === other.role
      && member.ready === other.ready
      && JSON.stringify(member.avatar) === JSON.stringify(other.avatar);
  });
}

/**
 * ¿Ha entrado o salido alguien entre dos listas? Compara los conectados; si cambia la conexión del propio jugador
 * (la suya o su reconexión) no suena nada: ese cambio no es de otro.
 */
export function presenceChange(before: RoomMemberView[], after: RoomMemberView[], selfId: string): 'join' | 'leave' | null {
  const connected = (list: RoomMemberView[]) => new Set(list.filter((member) => member.presence === 'CONNECTED').map((member) => member.id));
  const prev = connected(before);
  const next = connected(after);
  if (prev.has(selfId) !== next.has(selfId)) return null;
  const joined = [...next].some((id) => id !== selfId && !prev.has(id));
  const left = [...prev].some((id) => id !== selfId && !next.has(id));
  return joined ? 'join' : left ? 'leave' : null;
}

/**
 * Estado de la franja en el lobby, siempre en texto: conexión, «Listo» o «Sin confirmar». El host no lleva texto (basta
 * su insignia «Host»): `label` vacío, y la lista no lo pinta.
 */
export function memberReadiness(member: RoomMemberView): { kind: 'host' | 'away' | 'ready' | 'pending'; label: string } {
  if (member.roomRole === 'HOST') return { kind: 'host', label: '' };
  if (member.presence !== 'CONNECTED') return { kind: 'away', label: member.presence === 'LEFT' ? 'Fuera de la sala' : 'Reconectando…' };
  return member.ready ? { kind: 'ready', label: 'Listo' } : { kind: 'pending', label: 'Sin confirmar' };
}

/** Acción del host pendiente de confirmar (las que no tienen vuelta atrás fácil). */
type Pending = { kind: 'kick' | 'transfer'; member: RoomMemberView };

const confirmCopy = {
  kick: { title: (name: string) => `¿Expulsar a ${name}?`, body: 'Saldrá de la sala ahora mismo.', action: 'Expulsar de la sala' },
  transfer: { title: (name: string) => `¿Transferir el Host a ${name}?`, body: 'Tú pasarás a ser Co-host.', action: 'Transferir Host' },
} as const;

export const PlayerList = memo(function PlayerList({ members, game, selfId, canManage = false, onSetRoomRole, onTransferHost, onKick, onConfirmed }: Props) {
  const previousMembers = useRef(members);
  // Menú del host para un jugador y, aparte, la confirmación: dos diálogos para que cada uno tenga su Esc y su foco.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    const change = presenceChange(previousMembers.current, members, selfId);
    previousMembers.current = members;
    if (change) audio.play(change === 'join' ? 'room.join' : 'room.leave');
  }, [members, selfId]);
  const menuMember = menuFor ? members.find((member) => member.id === menuFor) ?? null : null;
  const closeMenu = () => setMenuFor(null);
  const ask = (kind: Pending['kind'], member: RoomMemberView) => { setMenuFor(null); setPending({ kind, member }); };
  const confirm = pending ? confirmCopy[pending.kind] : null;
  return (
    <>
      <ul className={s.list}>
        {members.map((member, index) => {
          const manageable = canManage && member.roomRole !== 'HOST' && member.id !== selfId;
          const status = game ? distanceMemberStatus(game, member.id) : null;
          const selection = status?.kind === 'picked' ? status : null;
          const readiness = memberReadiness(member);
          const away = member.presence !== 'CONNECTED';
          const meta = selection
            ? <span className={s.clip}>→ {selection.pokemonName}</span>
            : status && status.kind !== 'picked' && member.role === 'PLAYER'
              ? <span className={status.kind === 'out' ? s.away : undefined}>{distanceMemberStatusLabels[status.kind]}</span>
              : <>
                  {/* Tu fila ya va en otro color: «(tú)» solo para lectores de pantalla. */}
                  {member.id === selfId && <span className="sr-only">(tú)</span>}
                  {member.roomRole === 'HOST' && <Badge tone="navy"><Icon icon={Crown} size={18} /> Host</Badge>}
                  {member.roomRole === 'CO_HOST' && <Badge tone="cream"><Icon icon={Star} size={18} /> Co-host</Badge>}
                  {member.role === 'SPECTATOR' && <span>Espectador</span>}
                  {!game && (readiness.kind === 'ready'
                    ? <Chip tone="ok" icon={<Icon icon={CheckCircle2} size={18} />}>Listo</Chip>
                    : readiness.kind !== 'host' && <span className={readiness.kind === 'away' ? s.away : undefined}>{readiness.label}</span>)}
                </>;
          return (
            <li key={member.id}>
              <Row
                name={member.displayName}
                avatar={<Avatar name={member.displayName} avatar={member.avatar} presence={member.presence} size="md" />}
                meta={<span className={s.meta}>{meta}</span>}
                value={!game && member.role === 'PLAYER' ? <span className={s.points}>{member.sessionPoints}<small> pts</small></span> : undefined}
                color={playerColor(index)}
                self={member.id === selfId}
                disconnected={away}
              >
                {selection && <img className={s.sprite} src={selection.sprite} alt="" />}
                {game && member.role === 'SPECTATOR' && <Icon icon={Eye} size={18} label="Espectador" />}
                {manageable && <Pill size="round" variant="blue" icon={MoreVertical} aria-label={`Gestionar a ${member.displayName}`} title={`Gestionar a ${member.displayName}`} onClick={() => setMenuFor(member.id)} />}
              </Row>
            </li>
          );
        })}
      </ul>
      {canManage && <>
        <Dialog open={Boolean(menuMember)} title={menuMember ? `Gestionar a ${menuMember.displayName}` : 'Gestionar jugador'} onClose={closeMenu} width={420}
          actions={[{ label: 'Cerrar', variant: 'blue', onClick: closeMenu }]}>
          {menuMember && <div className={s.menu}>
            <Pill variant="cream" block icon={UserRoundCog} onClick={() => { closeMenu(); onSetRoomRole?.(menuMember.id, menuMember.roomRole === 'CO_HOST' ? 'MEMBER' : 'CO_HOST'); }}>
              {menuMember.roomRole === 'CO_HOST' ? 'Quitar Co-host' : 'Hacer Co-host'}
            </Pill>
            {menuMember.presence === 'CONNECTED' && <Pill variant="cream" block icon={ArrowRightLeft} onClick={() => ask('transfer', menuMember)}>Transferir Host</Pill>}
            <Pill variant="danger" block icon={UserMinus} onClick={() => ask('kick', menuMember)}>Expulsar de la sala</Pill>
          </div>}
        </Dialog>
        <Dialog open={Boolean(pending)} title={pending && confirm ? confirm.title(pending.member.displayName) : 'Confirmar'} onClose={() => setPending(null)} width={420}
          actions={pending && confirm ? [
            { label: 'Cancelar', variant: 'blue', autoFocus: true, onClick: () => undefined },
            { label: confirm.action, variant: pending.kind === 'kick' ? 'danger' : 'yellow', onClick: () => { (pending.kind === 'kick' ? onKick : onTransferHost)?.(pending.member.id); onConfirmed?.(); } },
          ] : []}>
          {confirm && <p>{confirm.body}</p>}
        </Dialog>
      </>}
    </>
  );
}, (previous, next) => previous.selfId === next.selfId && previous.canManage === next.canManage && previous.game === next.game && sameMembers(previous.members, next.members));
