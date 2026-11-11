import type { RoomView } from '@pokemon-universe/shared/public';
import { Check, IdCard, Search, Send, UserMinus, UserPlus, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { useRoom } from '../room/RoomContext';
import { Dialog, Drawer, Field, Pill, PillLink, Row, TabPanel, Tabs, type TabItem } from '../ui';
import { useFriends, type FriendsContextValue } from './FriendsContext';
import { FRIEND_STATUS_LABEL, friendErrorMessage, sentText, type FriendEntry } from './friends-state';
import s from './FriendsDrawer.module.css';

/** Se puede invitar desde el lobby a un amigo conectado (fuera de sala o en otra sin partida) que no esté ya en la tuya. */
export function canInviteFriend(room: RoomView | null, friend: Pick<FriendEntry, 'id' | 'status'>): boolean {
  if (!room || room.phase !== 'LOBBY') return false;
  if (friend.status !== 'ONLINE' && friend.status !== 'IN_ROOM') return false;
  return !room.members.some((member) => member.id === friend.id);
}

/** Línea de estado del formulario «Añadir amigo». */
type AddResult = { ok: true; text: string } | { ok: false; text: string } | null;

/** Cuerpo del diálogo: se monta al abrirlo, así que cada apertura empieza con el campo vacío y sin resultado. */
function AddFriendForm({ send }: Pick<FriendsContextValue, 'send'>) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AddResult>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = username.trim();
    if (!name) { setResult({ ok: false, text: 'Escribe un nombre de usuario.' }); return; }
    setBusy(true);
    setResult(null);
    void send(name).then((sent) => {
      setUsername('');
      setResult({ ok: true, text: sentText(sent) });
    }).catch((error: unknown) => setResult({ ok: false, text: friendErrorMessage(error) })).finally(() => setBusy(false));
  };
  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <Field label="Nombre de usuario" autoComplete="off" spellCheck={false} maxLength={24} value={username} error={result && !result.ok ? result.text : null}
        onChange={(event) => { setUsername(event.target.value); if (result) setResult(null); }} />
      <Pill type="submit" variant="yellow" icon={Send} loading={busy}>Enviar solicitud</Pill>
      {/* El error va en el campo (`Field`, con su alerta); el éxito, en esta región. El diálogo sigue abierto para otra. */}
      <p className={s.ok} role="status">{result?.ok ? result.text : ''}</p>
    </form>
  );
}

/** Diálogo «Añadir amigo»: único dueño de su resultado (éxito y error traducido). Solo «Cerrar» lo cierra. */
export function AddFriendDialog({ open, onClose, send }: { open: boolean; onClose(): void } & Pick<FriendsContextValue, 'send'>) {
  return (
    <Dialog open={open} title="Añadir amigo" onClose={onClose} width={420} actions={[{ label: 'Cerrar', variant: 'blue', onClick: () => undefined }]}>
      <AddFriendForm send={send} />
    </Dialog>
  );
}

/** Ruta del perfil de una cuenta por su nombre de usuario. */
export function profilePath(username: string): string {
  return `/u/${encodeURIComponent(username)}`;
}

/** Cuerpo de «Buscar jugador»: el nombre de usuario exacto (sin distinguir mayúsculas) lleva a su perfil. */
function FindPlayerForm({ onFound }: { onFound(path: string): void }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = username.trim();
    if (!name) { setError('Escribe un nombre de usuario.'); return; }
    onFound(profilePath(name));
  };
  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <Field label="Nombre de usuario" autoComplete="off" spellCheck={false} maxLength={24} value={username} error={error}
        onChange={(event) => { setUsername(event.target.value); if (error) setError(null); }} />
      <Pill type="submit" variant="yellow" icon={IdCard}>Ver perfil</Pill>
    </form>
  );
}

/** Diálogo «Buscar jugador»: abre el perfil y cierra el panel; si no existe, lo dice la página del perfil. */
export function FindPlayerDialog({ open, onClose, onFound }: { open: boolean; onClose(): void; onFound(path: string): void }) {
  return (
    <Dialog open={open} title="Buscar jugador" onClose={onClose} width={420} actions={[{ label: 'Cerrar', variant: 'blue', onClick: () => undefined }]}>
      {open && <FindPlayerForm onFound={onFound} />}
    </Dialog>
  );
}

type FriendsTab = 'friends' | 'incoming' | 'outgoing';

/**
 * Contenido del panel: «Añadir amigo» y tres pestañas (Amigos, Solicitudes, Enviadas). Va dentro del `Drawer`, que solo
 * lo monta abierto: cada apertura vuelve a «Amigos». Los errores REST de las filas, en línea; los de «Invitar», en el
 * aviso de la sala.
 */
function FriendsPanel({ friends }: { friends: FriendsContextValue }) {
  const { room } = useRoom();
  const { overview, invited } = friends;
  const idBase = useId();
  const [tab, setTab] = useState<FriendsTab>('friends');
  const [adding, setAdding] = useState(false);
  const [finding, setFinding] = useState(false);
  const navigate = useNavigate();
  // El panel vive por encima de las rutas: al abrir un perfil se cierra, o seguiría tapándolo.
  const openProfile = (path: string) => { setFinding(false); friends.closeDrawer(); navigate(path); };
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
  const pending = incoming.length;
  const panelClass = s.panel ?? '';
  const items: TabItem<FriendsTab>[] = [
    { key: 'friends', label: 'Amigos' },
    {
      key: 'incoming',
      // El número se ve en la insignia y se lee en el nombre de la pestaña («Solicitudes (2 pendientes)»).
      label: <>Solicitudes{pending > 0 && <span className="sr-only">{` (${pending} ${pending === 1 ? 'pendiente' : 'pendientes'})`}</span>}</>,
      badge: pending > 0 ? <span aria-hidden="true">{pending}</span> : undefined,
    },
    { key: 'outgoing', label: 'Enviadas' },
  ];
  return (
    <div className={s.stack}>
      <div className={s.top}>
        <Pill variant="yellow" icon={UserPlus} aria-haspopup="dialog" onClick={() => setAdding(true)}>Añadir amigo</Pill>
        <Pill variant="blue" icon={Search} aria-haspopup="dialog" onClick={() => setFinding(true)}>Buscar jugador</Pill>
      </div>
      <p className={s.error} role="alert">{error ?? ''}</p>
      <div>
        <Tabs items={items} active={tab} onChange={setTab} label="Amigos y solicitudes" idBase={idBase} className={s.tabs ?? ''} />
        <TabPanel idBase={idBase} tabKey="friends" className={panelClass} hidden={tab !== 'friends'}>
          {overview === null ? <p className={s.empty}>Cargando tus amigos…</p> : list.length === 0 ? <p className={s.empty}>Todavía no tienes amigos. Añade a alguien por su nombre de usuario.</p> : (
            <ul className={s.list}>
              {list.map((friend) => {
                const done = invited.has(friend.id);
                return (
                  <li key={friend.id}>
                    <Row name={friend.username} avatar={<Avatar name={friend.username} avatar={friend.avatar} level={friend.level} size="sm" />}
                      meta={<span className={s.status} data-status={friend.status}>{FRIEND_STATUS_LABEL[friend.status]}</span>}>
                      <span className={s.actions}>
                        {canInviteFriend(room, friend) && (
                          // Redondo, como «Ver perfil» y «Quitar»: con tres acciones de texto, el nombre y el estado no caben en el panel.
                          <Pill size="round" variant={done ? 'ghost' : 'yellow'} icon={done ? Check : UserPlus} loading={busy === `invite:${friend.id}`} disabled={done || busy !== null} aria-label={done ? `${friend.username} invitado` : `Invitar a ${friend.username}`} title={done ? 'Invitado' : 'Invitar a la sala'} onClick={() => invite(friend.id)} />
                        )}
                        <PillLink size="round" variant="ghost" icon={IdCard} to={profilePath(friend.username)} aria-label={`Ver perfil de ${friend.username}`} title="Ver perfil" onClick={() => friends.closeDrawer()} />
                        <Pill size="round" variant="ghost" icon={UserMinus} disabled={busy !== null} aria-label={`Quitar a ${friend.username}`} aria-haspopup="dialog" title="Quitar" onClick={() => setRemoving(friend)} />
                      </span>
                    </Row>
                  </li>
                );
              })}
            </ul>
          )}
        </TabPanel>
        <TabPanel idBase={idBase} tabKey="incoming" className={panelClass} hidden={tab !== 'incoming'}>
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
        </TabPanel>
        <TabPanel idBase={idBase} tabKey="outgoing" className={panelClass} hidden={tab !== 'outgoing'}>
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
        </TabPanel>
      </div>
      <AddFriendDialog open={adding} onClose={() => setAdding(false)} send={friends.send} />
      <FindPlayerDialog open={finding} onClose={() => setFinding(false)} onFound={openProfile} />
      <Dialog open={removing !== null} title={removing ? `¿Quitar a ${removing.username}?` : 'Quitar amigo'} onClose={() => setRemoving(null)} width={420}
        actions={[
          { label: 'Cancelar', variant: 'blue', autoFocus: true, onClick: () => undefined },
          { label: 'Quitar', variant: 'danger', onClick: () => { if (removing) { const id = removing.id; run(`remove:${id}`, () => friends.remove(id)); } } },
        ]}>
        <p>Dejaréis de ser amigos. Podrás enviarle otra solicitud cuando quieras.</p>
      </Dialog>
    </div>
  );
}

/** Panel «Amigos» (spec §Interfaz): el `Drawer` y, dentro, el contenido con sus pestañas. */
export function FriendsDrawer() {
  const friends = useFriends();
  return (
    <Drawer open={friends.drawerOpen} title="Amigos" onClose={friends.closeDrawer}>
      <FriendsPanel friends={friends} />
    </Drawer>
  );
}
