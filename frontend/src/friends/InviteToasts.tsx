import type { FriendInvite } from '@pokemon-universe/shared/public';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from '../room/RoomContext';
import { ActionToast, Dialog } from '../ui';
import { useFriends } from './FriendsContext';
import s from './InviteToasts.module.css';

/** Texto secundario del aviso: el minijuego elegido, si lo hay, y el código de la sala. */
export function inviteText(invite: Pick<FriendInvite, 'roomCode' | 'gameName'>): string {
  return invite.gameName ? `${invite.gameName} · sala ${invite.roomCode}` : `Sala ${invite.roomCode}`;
}

/**
 * Invitaciones recibidas (spec §Invitaciones): un `ActionToast` por amigo con «Unirse» y «Ahora no», discreto durante una
 * partida. «Unirse» entra con `room:join`; si ya estás en otra sala, antes pregunta y sale de ella. Un fallo lo enseña el
 * aviso de la sala (un solo dueño) y la invitación se quita igual, salga bien o mal. Caducada, desaparece.
 */
export function InviteToasts() {
  const { invites, dismissInvite } = useFriends();
  const { room, joinRoom, leaveRoom } = useRoom();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<FriendInvite | null>(null);
  const ignoreFailure = () => undefined;
  const ownCode = room?.code ?? null;

  // Ya estás en esa sala (entraste con el código o desde otra pestaña): la invitación sobra.
  useEffect(() => {
    for (const invite of invites) if (invite.roomCode === ownCode) dismissInvite(invite.inviteId);
  }, [invites, ownCode, dismissInvite]);

  const enter = (invite: FriendInvite, leaveFirst: boolean) => {
    dismissInvite(invite.inviteId);
    const join = async () => {
      if (leaveFirst) await leaveRoom();
      await joinRoom(invite.roomCode, { reportError: true });
      navigate('/room');
    };
    void join().catch(ignoreFailure);
  };
  const accept = (invite: FriendInvite) => {
    if (room) setConfirm(invite);
    else enter(invite, false);
  };

  const visible = invites.filter((invite) => invite.roomCode !== ownCode);
  const quiet = Boolean(room && room.phase !== 'LOBBY' && room.game);
  return <>
    {visible.length > 0 && <div className={s.stack} data-layer="invites">
      {visible.map((invite) => (
        <ActionToast key={invite.inviteId} quiet={quiet} title={`${invite.from.username} te invita a su sala`} text={inviteText(invite)}
          expiresAt={Date.parse(invite.expiresAt)} onExpire={() => dismissInvite(invite.inviteId)}
          primary={{ label: 'Unirse', onClick: () => accept(invite) }}
          secondary={{ label: 'Ahora no', onClick: () => dismissInvite(invite.inviteId) }} />
      ))}
    </div>}
    <Dialog open={confirm !== null} title="¿Cambiar de sala?" onClose={() => setConfirm(null)} width={420}
      actions={[
        { label: 'Quedarme', variant: 'blue', autoFocus: true, onClick: () => undefined },
        { label: 'Unirme', variant: 'yellow', onClick: () => { if (confirm) enter(confirm, true); } },
      ]}>
      <p>{confirm ? `Saldrás de tu sala actual. ¿Unirte a la sala de ${confirm.from.username}?` : ''}</p>
    </Dialog>
  </>;
}
