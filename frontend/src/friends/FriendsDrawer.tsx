import type { RoomView } from '@pokemon-universe/shared/public';
import { Check, Send, UserMinus, UserPlus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Avatar } from '../components/Avatar';
import { useRoom } from '../room/RoomContext';
import { Dialog, Drawer, Field, Pill, Row } from '../ui';
import { useFriends, type FriendsContextValue } from './FriendsContext';
import { FRIEND_STATUS_LABEL, friendErrorMessage, type FriendEntry } from './friends-state';
import s from './FriendsDrawer.module.css';

/** Se puede invitar desde el lobby a un amigo conectado (fuera de sala o en otra sin partida) que no esté ya en la tuya. */
export function canInviteFriend(room: RoomView | null, friend: Pick<FriendEntry, 'id' | 'status'>): boolean {
  if (!room || room.phase !== 'LOBBY') return false;
  if (friend.status !== 'ONLINE' && friend.status !== 'IN_ROOM') return false;
  return !room.members.some((member) => member.id === friend.id);
}

/** Línea de estado del formulario «Añadir amigo». */
type AddResult = { ok: true; text: string } | { ok: false; text: string } | null;

function AddFriend({ send }: Pick<FriendsContextValue, 'send'>) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AddResult>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = username.trim();
    if (!name) { setResult({ ok: false, text: 'Escribe un nombre de usuario.' }); return; }
    setBusy(true);
    setResult(null);
    void send(name).then((kind) => {
      setUsername('');
      setResult({ ok: true, text: kind === 'friend' ? `Ya sois amigos: ${name} te había enviado una solicitud.` : `Solicitud enviada a ${name}.` });
    }).catch((error: unknown) => setResult({ ok: false, text: friendErrorMessage(error) })).finally(() => setBusy(false));
  };
  return (
    <section className={s.section} aria-labelledby="friends-add">
      <h3 id="friends-add" className={s.heading}>Añadir amigo</h3>
      <form className={s.form} onSubmit={submit} noValidate>
        <Field label="Nombre de usuario" autoComplete="off" spellCheck={false} maxLength={24} value={username} error={result && !result.ok ? result.text : null}
          onChange={(event) => { setUsername(event.target.value); if (result) setResult(null); }} />
        <Pill type="submit" variant="yellow" icon={Send} loading={busy}>Enviar solicitud</Pill>
      </form>
      {/* El error va en el campo (`Field`, con su alerta); el éxito, en esta región siempre montada. */}
      <p className={s.ok} role="status">{result?.ok ? result.text : ''}</p>
    </section>
  );
}

/**
 * Panel «Amigos» (spec §Interfaz): añadir por nombre de usuario, solicitudes recibidas, amigos (con «Invitar» en el
 * lobby) y solicitudes enviadas. Los errores REST se enseñan en línea; los de «Invitar» van al aviso de la sala.
 */
export function FriendsDrawer() {
  const friends = useFriends();
  const { room } = useRoom();
  const { overview, drawerOpen, closeDrawer, invited } = friends;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<FriendEntry | null>(null);
  const ignoreFailure = () => undefined;

  const run = (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    void action().catch((failure: unknown) => setError(friendErrorMessage(failure))).finally(() => setBusy(null));
  };
  const invite = (friendId: string) => {
    setBusy(`invite:${friendId}`);
    // El aviso de la sala enseña el fallo (un solo dueño): aquí solo se suelta el botón.
    void friends.invite(friendId).catch(ignoreFailure).finally(() => setBusy(null));
  };

  const incoming = overview?.incoming ?? [];
  const outgoing = overview?.outgoing ?? [];
  const list = overview?.friends ?? [];
  return (
    <Drawer open={drawerOpen} title="Amigos" onClose={closeDrawer}>
      <div className={s.stack}>
        <AddFriend send={friends.send} />
        <p className={s.error} role="alert">{error ?? ''}</p>

        <section className={s.section} aria-labelledby="friends-incoming">
          <h3 id="friends-incoming" className={s.heading}>Solicitudes</h3>
          {incoming.length === 0 ? <p className={s.empty}>No tienes solicitudes pendientes.</p> : (
            <ul className={s.list}>
              {incoming.map((request) => {
                const from = request.from;
                if (!from) return null;
                return (
                  <li key={request.id}>
                    <Row name={from.username} avatar={<Avatar name={from.username} avatar={from.avatar} size="sm" />} meta="Quiere ser tu amigo">
                      <span className={s.actions}>
                        <Pill size="round" variant="yellow" icon={Check} title="Aceptar" loading={busy === `accept:${request.id}`} disabled={busy !== null} aria-label={`Aceptar a ${from.username}`} onClick={() => run(`accept:${request.id}`, () => friends.accept(request.id))}/>
                        <Pill size="round" variant="ghost" icon={X} title="Rechazar" loading={busy === `decline:${request.id}`} disabled={busy !== null} aria-label={`Rechazar a ${from.username}`} onClick={() => run(`decline:${request.id}`, () => friends.decline(request.id))}/>
                      </span>
                    </Row>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={s.section} aria-labelledby="friends-list">
          <h3 id="friends-list" className={s.heading}>Amigos</h3>
          {overview === null ? <p className={s.empty}>Cargando tus amigos…</p> : list.length === 0 ? <p className={s.empty}>Aún no tienes amigos. Añade a alguien por su nombre de usuario.</p> : (
            <ul className={s.list}>
              {list.map((friend) => {
                const done = invited.has(friend.id);
                return (
                  <li key={friend.id}>
                    <Row name={friend.username} avatar={<Avatar name={friend.username} avatar={friend.avatar} level={friend.level} size="sm" />}
                      meta={<span className={s.status} data-status={friend.status}>{FRIEND_STATUS_LABEL[friend.status]}</span>}>
                      <span className={s.actions}>
                        {canInviteFriend(room, friend) && (
                          <Pill size="small" variant={done ? 'ghost' : 'yellow'} icon={done ? Check : UserPlus} loading={busy === `invite:${friend.id}`} disabled={done || busy !== null} aria-label={done ? `${friend.username} invitado` : `Invitar a ${friend.username}`} onClick={() => invite(friend.id)}>
                            {done ? 'Invitado' : 'Invitar'}
                          </Pill>
                        )}
                        <Pill size="round" variant="ghost" icon={UserMinus} disabled={busy !== null} aria-label={`Quitar a ${friend.username}`} aria-haspopup="dialog" title="Quitar" onClick={() => setRemoving(friend)} />
                      </span>
                    </Row>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={s.section} aria-labelledby="friends-outgoing">
          <h3 id="friends-outgoing" className={s.heading}>Enviadas</h3>
          {outgoing.length === 0 ? <p className={s.empty}>No has enviado solicitudes.</p> : (
            <ul className={s.list}>
              {outgoing.map((request) => {
                const to = request.to;
                if (!to) return null;
                return (
                  <li key={request.id}>
                    <Row name={to.username} avatar={<Avatar name={to.username} avatar={to.avatar} size="sm" />} meta="Pendiente">
                      <Pill size="small" variant="ghost" icon={X} loading={busy === `cancel:${request.id}`} disabled={busy !== null} aria-label={`Cancelar la solicitud a ${to.username}`} onClick={() => run(`cancel:${request.id}`, () => friends.decline(request.id))}>Cancelar</Pill>
                    </Row>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      <Dialog open={removing !== null} title={removing ? `¿Quitar a ${removing.username}?` : 'Quitar amigo'} onClose={() => setRemoving(null)} width={420}
        actions={[
          { label: 'Cancelar', variant: 'blue', autoFocus: true, onClick: () => undefined },
          { label: 'Quitar', variant: 'danger', onClick: () => { if (removing) { const id = removing.id; run(`remove:${id}`, () => friends.remove(id)); } } },
        ]}>
        <p>Dejaréis de ser amigos. Podrás enviarle otra solicitud cuando quieras.</p>
      </Dialog>
    </Drawer>
  );
}
