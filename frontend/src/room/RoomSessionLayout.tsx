import { WifiOff, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useRoomMusic } from '../audio/useRoomMusic';
import { useAuth } from '../auth/AuthContext';
import { gameWinCue, roomRevealKey, useSfxCue } from '../hooks/useSfxCue';
import { HEADER_NOTICES_ID } from '../components/Layout';
import { createConnectionNotice, type ConnectionNoticeKind } from './connection-notice';
import { RoomProvider, useRoom } from './RoomContext';
import { RoomPlatePortal } from './RoomPlate';
import { SkipGameControl } from './SkipGameControl';

/** Región `status` del aviso de conexión: siempre montada para que se anuncie el cambio; vacía no ocupa alto. */
export function ConnectionNoticeRegion({ kind }: { kind: ConnectionNoticeKind }) {
  return <div className="connection-notice-region" role="status" aria-live="polite">
    {kind && <div className="connection-notice">
      <WifiOff className="shrink-0 text-electric" size={18} aria-hidden="true" />
      <span className="min-w-0 flex-1"><strong className="block">{kind === 'lost' ? 'Conexión perdida' : 'Conectando con la sala'}</strong><span className="block text-sm font-semibold text-ink/70">{kind === 'lost' ? 'Reconectando… Tu sesión sigue guardada.' : 'Estamos recuperando el estado de la sesión.'}</span></span>
    </div>}
  </div>;
}

/**
 * Aviso de conexión de la sala. Vive en el hueco de avisos de la cabecera fija: así sigue a la vista al hacer scroll y
 * nunca tapa la marca ni la navegación, tarde lo que tarde el primer `/ws`. «Conectando» solo aparece si la conexión
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
  const { connected, error, clearError, room, setGameSkipVote, leaveRoom } = useRoom();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useRoomMusic(room?.phase ?? null);
  // Revelación común a los minijuegos al entrar en resultados de ronda (salvo los que ya piden la suya).
  useSfxCue('game.reveal', roomRevealKey(room?.game as { gameId?: string; phase?: string; roundNumber?: number } | null | undefined));
  // Victoria común al llegar a los resultados de la partida si ganó el jugador local (salvo los que ya la dan).
  useSfxCue('game.win', gameWinCue(room, user?.id));
  // Si falla, el error ya sale en el aviso de la sala y se sigue en ella.
  const leave = () => void leaveRoom().then(() => navigate('/play')).catch(() => undefined);
  return <>
    {/* La placa de la sala (código y «Salir») va a la cabecera solo en `/room`: en `/play` la pantalla ya ofrece volver o salir. */}
    {room && pathname === '/room' && <RoomPlatePortal room={room} onLeave={leave} />}
    {room?.gameSkipState && <div className="content-row flex flex-wrap items-center justify-end gap-2 pt-3">
      <SkipGameControl key={`${room.gameSkipState.gameInstanceId}:${connected}`} state={room.gameSkipState} connected={connected} onSetVote={setGameSkipVote} />
    </div>}
    <Outlet />
    <ConnectionNotice connected={connected} />
    {error && <div className="fixed bottom-4 left-1/2 z-toast flex w-[min(92vw,36rem)] -translate-x-1/2 items-start gap-3 rounded-xl bg-berry px-4 py-3 font-bold text-night" role="alert">
      <span className="min-w-0 flex-1">{error}</span>
      <button type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg hover:bg-night/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-night" onClick={clearError} aria-label="Cerrar aviso"><X size={17} /></button>
    </div>}
  </>;
}

export function RoomSessionLayout() {
  return <RoomProvider><RoomSessionContent /></RoomProvider>;
}
