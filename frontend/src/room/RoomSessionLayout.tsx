import { WifiOff } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useRoomMusic } from '../audio/useRoomMusic';
import { useAuth } from '../auth/AuthContext';
import { gameWinCue, roomRevealKey, useSfxCue } from '../hooks/useSfxCue';
import { HEADER_NOTICES_ID } from '../components/Layout';
import { useFeedbackTarget } from '../components/feedback-target';
import { cx, Dialog, Icon } from '../ui';
import { createConnectionNotice, type ConnectionNoticeKind } from './connection-notice';
import n from './ConnectionNotice.module.css';
import { useRoom } from './RoomContext';
import { RoomPlatePortal } from './RoomPlate';
import { skipRowInLayout } from './game-skip-slot';
import { SkipGameControl } from './SkipGameControl';

/**
 * Región `status` del aviso de conexión: siempre montada para que se anuncie el cambio; vacía no se ve. Con aviso es una
 * ventana flotante (crema, contorno y sombra dura) con un anillo que gira mientras conecta. Las clases globales
 * `connection-notice*` solo sirven de gancho a las E2E.
 */
export function ConnectionNoticeRegion({ kind }: { kind: ConnectionNoticeKind }) {
  return <div className={`connection-notice-region ${n.region}`} role="status" aria-live="polite" data-layer="notice">
    {kind && <div className={cx('connection-notice', n.card, kind === 'lost' && n.lost)}>
      <span className={n.badge}>
        <Icon icon={WifiOff} size={22} />
        {kind === 'connecting' && <span className={n.spinner} aria-hidden="true" />}
      </span>
      <span className={n.text}>
        <strong className={n.title}>{kind === 'lost' ? 'Conexión perdida' : 'Conectando con la sala'}</strong>
        <span className={n.line}>{kind === 'lost' ? 'Reconectando… Tu sesión sigue guardada.' : 'Estamos recuperando el estado de la sesión.'}</span>
      </span>
    </div>}
  </div>;
}

/**
 * Aviso de conexión de la sala. Vive en el hueco de avisos, bajo la fila de la cabecera: así sigue a la vista al hacer
 * scroll y nunca tapa las placas, tarde lo que tarde el primer `/ws`. «Conectando» solo aparece si la conexión
 * tarda más de `CONNECTING_NOTICE_DELAY_MS`; una conexión perdida se avisa al momento (`connection-notice.ts`).
 */
function ConnectionNotice({ connected }: { connected: boolean }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [kind, setKind] = useState<ConnectionNoticeKind>(null);
  const noticeRef = useRef<ReturnType<typeof createConnectionNotice> | null>(null);
  useLayoutEffect(() => { setSlot(document.getElementById(HEADER_NOTICES_ID)); }, []);
  useEffect(() => {
    const notice = createConnectionNotice(setKind);
    noticeRef.current = notice;
    return () => { notice.dispose(); noticeRef.current = null; };
  }, []);
  useEffect(() => { noticeRef.current?.update(connected); }, [connected]);
  const region = <ConnectionNoticeRegion kind={kind} />;
  return slot ? createPortal(region, slot) : region;
}

function RoomSessionContent() {
  const { connected, room, setGameSkipVote, leaveRoom, holdRoomSession } = useRoom();
  // Estas rutas enganchan la pestaña a la sesión de sala; al salir de ellas el asiento sigue con esta conexión.
  useEffect(() => holdRoomSession(), [holdRoomSession]);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useRoomMusic(room?.phase ?? null);
  // La píldora «Enviar feedback» de la cabecera lleva el minijuego en curso (o el elegido) y la sala.
  useFeedbackTarget(room ? (room.game as { gameId?: string } | null)?.gameId ?? room.selectedGameId : null, room?.code);
  // Revelación común a los minijuegos al entrar en resultados de ronda (salvo los que ya piden la suya).
  useSfxCue('game.reveal', roomRevealKey(room?.game as { gameId?: string; phase?: string; roundNumber?: number } | null | undefined));
  // Victoria común al llegar a los resultados de la partida si ganó el jugador local (salvo los que ya la dan).
  useSfxCue('game.win', gameWinCue(room, user?.id));
  // Si falla, el error ya sale en el aviso de la sala y se sigue en ella.
  const leave = () => void leaveRoom().then(() => navigate('/play')).catch(() => undefined);
  // En el lobby se sale sin preguntar; en partida (o votación, resultados…) se confirma antes.
  const [confirmLeave, setConfirmLeave] = useState(false);
  const askLeave = () => { if (room?.phase === 'LOBBY') leave(); else setConfirmLeave(true); };
  return <>
    {/* La placa de la sala (código y «Salir») va a la cabecera solo en `/room`: en `/play` la pantalla ya ofrece volver o salir. */}
    {room && pathname === '/room' && <RoomPlatePortal room={room} onLeave={askLeave} />}
    <Dialog open={confirmLeave} title="¿Salir de la partida?" onClose={() => setConfirmLeave(false)} width={420}
      actions={[
        { label: 'Cancelar', variant: 'blue', autoFocus: true, onClick: () => undefined },
        { label: 'Salir', variant: 'danger', onClick: leave },
      ]}>
      <p>Dejarás la sala ahora mismo; el resto seguirá jugando sin ti.</p>
    </Dialog>
    {/* En la intro y en los juegos rediseñados el control va dentro de su pantalla (que llena el alto del `main` sin scroll). */}
    {room?.gameSkipState && skipRowInLayout(room) && <div className="content-row flex flex-wrap items-center justify-end gap-2 pt-3">
      <SkipGameControl key={`${room.gameSkipState.gameInstanceId}:${connected}`} state={room.gameSkipState} connected={connected} onSetVote={setGameSkipVote} />
    </div>}
    <Outlet />
    <ConnectionNotice connected={connected} />
    {/* El aviso de errores de la sala (`RoomNotice`), la placa «Amigos», su panel y las invitaciones van en `Layout`:
        existen en toda página. */}
  </>;
}

/**
 * Sesión de sala de `/play` y `/room`. `RoomProvider` y `FriendsProvider` viven en la raíz (`SessionRoot`): el `/ws` de
 * una cuenta registrada sigue abierto en toda página, pero solo estas rutas lo enganchan a la sala (`holdRoomSession`).
 * El aviso de conexión es solo de estas rutas (habla de la sala).
 */
export function RoomSessionLayout() {
  return <RoomSessionContent />;
}
