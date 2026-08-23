import type { PokedexDistancePublicState, RoomMemberView } from '@pokemon-universe/shared';
import { ArrowRightLeft, Crown, Eye, MoreVertical, Star, UserMinus, UserRoundCog, WifiOff } from 'lucide-react';
import { memo } from 'react';

interface Props {
  members: RoomMemberView[];
  game?: PokedexDistancePublicState | null;
  selfId: string;
  canManage?: boolean;
  onSetRoomRole?(id: string, role: 'CO_HOST' | 'MEMBER'): void;
  onTransferHost?(id: string): void;
  onKick?(id: string): void;
}

const roomRoleCopy = {
  HOST: { label: 'Host', icon: Crown, className: 'text-electric' },
  CO_HOST: { label: 'Co-host', icon: Star, className: 'text-aqua' },
  MEMBER: { label: 'Miembro', icon: null, className: 'text-ink/40' },
} as const;

const presenceCopy = {
  CONNECTED: { label: 'Conectado', dot: 'bg-leaf' },
  TEMPORARILY_DISCONNECTED: { label: 'Reconectando', dot: 'animate-pulse bg-electric' },
  LEFT: { label: 'Desconectado', dot: 'bg-ink/25' },
} as const;

function sameMembers(left: RoomMemberView[], right: RoomMemberView[]): boolean {
  return left.length === right.length && left.every((member, index) => {
    const other = right[index];
    return other && member.id === other.id && member.displayName === other.displayName && member.roomRole === other.roomRole
      && member.presence === other.presence && member.sessionPoints === other.sessionPoints && member.role === other.role;
  });
}

export const PlayerList = memo(function PlayerList({ members, game, selfId, canManage = false, onSetRoomRole, onTransferHost, onKick }: Props) {
  return (
    <div className="space-y-2.5">
      {members.map((member) => {
        const role = roomRoleCopy[member.roomRole];
        const RoleIcon = role.icon;
        const presence = presenceCopy[member.presence];
        const manageable = canManage && member.roomRole !== 'HOST' && member.id !== selfId;
        const selection = game?.selections[member.id];
        return (
          <div key={member.id} className={`relative flex min-h-16 items-center gap-3 rounded-2xl border-2 p-2.5 ${member.presence === 'LEFT' ? 'border-ink/5 bg-ink/[.03] opacity-60' : 'border-ink/10 bg-surface-raised'}`}>
            <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-aqua/70 to-electric/80 font-display font-bold text-night">
              {member.displayName.slice(0, 1).toUpperCase()}
              <span className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-surface-raised ${presence.dot}`} title={presence.label} aria-label={presence.label} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-extrabold">
                <span className="truncate">{member.displayName}</span>
                {member.id === selfId && <span className="text-xs text-ink/35">(tú)</span>}
                {!member.connected && <WifiOff size={14} className="shrink-0 text-electric" aria-hidden="true" />}
              </div>
              {selection ? <p className="truncate text-sm font-bold text-ink/55">→ {selection.pokemonName}</p> : game && member.role === 'PLAYER' ? <p className="text-sm font-bold text-ink/35">seleccionando…</p> : <div className="mt-0.5 flex items-center gap-2 text-xs font-extrabold">
                <span className={`inline-flex items-center gap-1 ${role.className}`}>{RoleIcon && <RoleIcon size={13} fill="currentColor" />} {role.label}</span>
                <span className="text-ink/25">·</span>
                <span className="text-ink/40">{member.role === 'SPECTATOR' ? 'Espectador' : `${member.sessionPoints} pts`}</span>
              </div>}
            </div>
            {selection && <img className="h-12 w-12 object-contain" src={selection.sprite} alt="" />}
            {game && member.role === 'SPECTATOR' && <Eye size={17} className="text-ink/40" />}
            {manageable && (
              <details className="group relative">
                <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-xl text-ink/45 transition hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua [&::-webkit-details-marker]:hidden" aria-label={`Gestionar a ${member.displayName}`}>
                  <MoreVertical size={19} />
                </summary>
                <div className="absolute right-0 top-11 z-30 w-56 rounded-2xl border-2 border-ink/10 bg-surface p-2 shadow-card">
                  <button className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-extrabold hover:bg-ink/5" onClick={() => onSetRoomRole?.(member.id, member.roomRole === 'CO_HOST' ? 'MEMBER' : 'CO_HOST')}>
                    <UserRoundCog size={16} /> {member.roomRole === 'CO_HOST' ? 'Quitar Co-host' : 'Hacer Co-host'}
                  </button>
                  {member.presence === 'CONNECTED' && <button className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-extrabold hover:bg-ink/5" onClick={() => onTransferHost?.(member.id)}><ArrowRightLeft size={16} /> Transferir Host</button>}
                  <button className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-extrabold text-berry hover:bg-berry/10" onClick={() => onKick?.(member.id)}><UserMinus size={16} /> Expulsar de la sala</button>
                </div>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}, (previous, next) => previous.selfId === next.selfId && previous.canManage === next.canManage && previous.game === next.game && sameMembers(previous.members, next.members));
