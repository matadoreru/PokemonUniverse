import type { PokedexDistancePublicState, RoomMemberView } from '@pokemon-universe/shared/public';
import { ArrowRightLeft, Check, CheckCircle2, Clock, Crown, Eye, MessageSquare, MessageSquareOff, MoreVertical, Star, UserCheck, UserMinus, UserPlus, UserRoundCog } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { audio } from '../audio';
import { Avatar } from '../components/Avatar';
import { useOptionalFriends, type FriendsContextValue } from '../friends/FriendsContext';
import { friendErrorMessage, friendRelation, isGuestId, sentText } from '../friends/friends-state';
import { Badge, Chip, Dialog, Icon, Pill, Row } from '../ui';
import { canMuteInChat } from './chat/LobbyChat';
import { playerColor } from '../lib/player-color';
import { distanceMemberStatus, distanceMemberStatusLabels } from '../games/pokedex-distance/pokedex-distance-selection';
import s from './PlayerList.module.css';

interface Props {
  members: RoomMemberView[];
  game?: PokedexDistancePublicState | null;
  selfId: string;
  canManage?: boolean;
  /**
   * Lobby: una cuenta registrada puede pedir la amistad (o aceptarla) desde «Gestionar a…» a otra cuenta de la sala. Sin
   * él (la lista de Pokédex Distance en partida), solo las acciones del host.
   */
  friendActions?: boolean;
  onSetRoomRole?(id: string, role: 'CO_HOST' | 'MEMBER'): void;
  onTransferHost?(id: string): void;
  onKick?(id: string): void;
  /** Lobby: silenciar o quitar el silencio en el chat (Host y Co-host, según las reglas de `canMuteInChat`). */
  onSetChatMute?(id: string, muted: boolean): void;
  /** Tras confirmar una expulsión o un traspaso del Host: la fila (o su botón) desaparece, así que el foco va a otro sitio. */
  onConfirmed?(): void;
}

function sameMembers(left: RoomMemberView[], right: RoomMemberView[]): boolean {
  return left.length === right.length && left.every((member, index) => {
    const other = right[index];
    return other && member.id === other.id && member.displayName === other.displayName && member.roomRole === other.roomRole
      && member.presence === other.presence && member.sessionPoints === other.sessionPoints && member.role === other.role
      && member.ready === other.ready && Boolean(member.chatMuted) === Boolean(other.chatMuted)
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

/** Resultado de la acción de amistad del menú, que es su único dueño. */
type FriendResult = { ok: boolean; text: string } | null;

/**
 * Acción de amistad del menú según la relación: enviar la solicitud (por el nombre visible, que en una cuenta es su
 * nombre de usuario), «Solicitud enviada», aceptar la que te mandó o «Ya sois amigos». El resultado va aquí mismo.
 */
function FriendAction({ member, friends }: { member: RoomMemberView; friends: FriendsContextValue }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FriendResult>(null);
  const relation = friendRelation(friends.overview, member.id);
  const name = member.displayName;
  const run = (action: () => Promise<string>) => {
    setBusy(true);
    setResult(null);
    void action().then((text) => setResult({ ok: true, text }))
      .catch((error: unknown) => setResult({ ok: false, text: friendErrorMessage(error) })).finally(() => setBusy(false));
  };
  return (
    <>
      {relation.kind === 'none' && <Pill variant="yellow" block icon={UserPlus} loading={busy} onClick={() => run(async () => sentText(await friends.send(name)))}>Enviar solicitud de amistad</Pill>}
      {relation.kind === 'outgoing' && <Pill variant="cream" block icon={Clock} disabled>Solicitud enviada</Pill>}
      {relation.kind === 'incoming' && <Pill variant="yellow" block icon={Check} loading={busy} onClick={() => run(async () => { await friends.accept(relation.requestId); return `${name} y tú ya sois amigos.`; })}>Aceptar solicitud de amistad</Pill>}
      {relation.kind === 'friend' && <Pill variant="cream" block icon={UserCheck} disabled>Ya sois amigos</Pill>}
      <div>
        <p className={s.friendOk} role="status">{result?.ok ? result.text : ''}</p>
        <p className={s.friendError} role="alert">{result && !result.ok ? result.text : ''}</p>
      </div>
    </>
  );
}

interface MemberMenuProps {
  member: RoomMemberView;
  /** El host (con `MANAGE_ROLES`) sobre otro que no es el Host: Co-host, Transferir Host y Expulsar. */
  hostActions: boolean;
  /** Quien mira puede silenciar a esta persona en el chat (Host o Co-host); no depende de `hostActions`. */
  canMuteChat: boolean;
  /** Amigos de quien mira; sin cuenta registrada (o sobre un invitado) no hay acción de amistad. */
  friends: FriendsContextValue | null;
  onSetRoomRole?: ((id: string, role: 'CO_HOST' | 'MEMBER') => void) | undefined;
  onSetChatMute?: ((id: string, muted: boolean) => void) | undefined;
  onAsk?(kind: 'kick' | 'transfer'): void;
  onClose?(): void;
}

/** Cuerpo del diálogo «Gestionar a…»: se monta al abrirlo, así que el resultado de la amistad empieza vacío cada vez. */
export function MemberMenu({ member, hostActions, canMuteChat, friends, onSetRoomRole, onSetChatMute, onAsk, onClose }: MemberMenuProps) {
  const befriend = Boolean(friends?.enabled) && !isGuestId(member.id);
  return (
    <div className={s.menu}>
      {hostActions && <>
        <Pill variant="cream" block icon={UserRoundCog} onClick={() => { onClose?.(); onSetRoomRole?.(member.id, member.roomRole === 'CO_HOST' ? 'MEMBER' : 'CO_HOST'); }}>
          {member.roomRole === 'CO_HOST' ? 'Quitar Co-host' : 'Hacer Co-host'}
        </Pill>
        {member.presence === 'CONNECTED' && <Pill variant="cream" block icon={ArrowRightLeft} onClick={() => onAsk?.('transfer')}>Transferir Host</Pill>}
      </>}
      {/* Sin confirmación: se deshace con otro clic. */}
      {canMuteChat && <Pill variant="cream" block icon={member.chatMuted ? MessageSquare : MessageSquareOff} onClick={() => { onClose?.(); onSetChatMute?.(member.id, !member.chatMuted); }}>
        {member.chatMuted ? 'Quitar el silencio del chat' : 'Silenciar en el chat'}
      </Pill>}
      {befriend && friends && <FriendAction member={member} friends={friends} />}
      {hostActions && <Pill variant="danger" block icon={UserMinus} onClick={() => onAsk?.('kick')}>Expulsar de la sala</Pill>}
    </div>
  );
}

export const PlayerList = memo(function PlayerList({ members, game, selfId, canManage = false, friendActions = false, onSetRoomRole, onTransferHost, onKick, onSetChatMute, onConfirmed }: Props) {
  const friends = useOptionalFriends();
  // Amistad desde el menú: solo en el lobby y con una cuenta registrada, sobre otra cuenta (nunca sobre un invitado).
  const befriend = friendActions && Boolean(friends?.enabled);
  const hostManages = (member: RoomMemberView) => canManage && member.roomRole !== 'HOST' && member.id !== selfId;
  const friendManages = (member: RoomMemberView) => befriend && member.id !== selfId && !isGuestId(member.id);
  // Silenciar en el chat: el Host y el Co-host (este sin las acciones de gestión de personas), solo en el lobby.
  const selfRole = members.find((member) => member.id === selfId)?.roomRole ?? 'MEMBER';
  const muteManages = (member: RoomMemberView) => Boolean(onSetChatMute) && canMuteInChat(selfId, selfRole, member);
  const anyMute = members.some(muteManages);
  const previousMembers = useRef(members);
  // Menú «Gestionar a…» (del host, o de amistad) y, aparte, la confirmación del host: dos diálogos con su Esc y su foco.
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
          const manageable = hostManages(member) || friendManages(member) || muteManages(member);
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
                  {member.chatMuted && <Chip icon={<Icon icon={MessageSquareOff} size={18} />}>Silenciado<span className="sr-only"> en el chat</span></Chip>}
                  {!game && (readiness.kind === 'ready'
                    ? <Chip tone="ok" icon={<Icon icon={CheckCircle2} size={18} />}>Listo</Chip>
                    : readiness.kind !== 'host' && <span className={readiness.kind === 'away' ? s.away : undefined}>{readiness.label}</span>)}
                </>;
          return (
            <li key={member.id}>
              <Row
                name={member.displayName}
                avatar={<Avatar name={member.displayName} avatar={member.avatar} presence={member.presence} level={member.level} size="md" />}
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
      {(canManage || befriend || anyMute) && <Dialog open={Boolean(menuMember)} title={menuMember ? `Gestionar a ${menuMember.displayName}` : 'Gestionar jugador'} onClose={closeMenu} width={420}
        actions={[{ label: 'Cerrar', variant: 'blue', onClick: closeMenu }]}>
        {menuMember && <MemberMenu key={menuMember.id} member={menuMember} hostActions={hostManages(menuMember)} canMuteChat={muteManages(menuMember)} friends={befriend ? friends : null}
          onSetRoomRole={onSetRoomRole} onSetChatMute={onSetChatMute} onAsk={(kind) => ask(kind, menuMember)} onClose={closeMenu} />}
      </Dialog>}
      {canManage && <>
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
}, (previous, next) => previous.selfId === next.selfId && previous.canManage === next.canManage && previous.friendActions === next.friendActions && Boolean(previous.onSetChatMute) === Boolean(next.onSetChatMute) && previous.game === next.game && sameMembers(previous.members, next.members));
