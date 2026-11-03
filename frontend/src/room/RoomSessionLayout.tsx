import { MessageSquareWarning, RefreshCw, WifiOff, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Outlet } from 'react-router-dom';
import { HEADER_NOTICES_ID } from '../components/Layout';
import { RoomProvider, useRoom } from './RoomContext';
import { SkipGameControl } from './SkipGameControl';

/**
 * Aviso de conexión de la sala. Vive en el hueco de avisos de la cabecera fija: así sigue a la vista al hacer scroll y
 * nunca tapa la marca ni la navegación, tarde lo que tarde el primer `/ws`. La región `status` está siempre montada
 * para que los lectores de pantalla anuncien el cambio; vacía no ocupa alto. Tras perder la conexión ofrece reintentar
 * ya, sin esperar al siguiente intento automático.
 */
export function ConnectionNotice({ connected, wasConnected, onReconnect }: { connected: boolean; wasConnected: boolean; onReconnect(): void }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setSlot(document.getElementById(HEADER_NOTICES_ID)); }, []);
  const region = <div className="connection-notice-region" role="status" aria-live="polite">
    {!connected && <div className="connection-notice">
      <WifiOff className="shrink-0 text-electric" size={18} aria-hidden="true" />
      <span className="min-w-0 flex-1 basis-56"><strong className="block">{wasConnected ? 'Conexión perdida' : 'Conectando con la sala'}</strong><span className="block text-sm font-semibold text-ink/70">{wasConnected ? 'Reconectando… Tu sesión sigue guardada.' : 'Estamos recuperando el estado de la sesión.'}</span></span>
      {wasConnected && <button type="button" className="btn-ghost w-full shrink-0 py-2 text-sm sm:w-auto" onClick={onReconnect}><RefreshCw size={16} aria-hidden="true" />Reintentar ahora</button>}
    </div>}
  </div>;
  return slot ? createPortal(region, slot) : region;
}

function RoomSessionContent() {
  const { connected, error, clearError, reconnect, room, setGameSkipVote } = useRoom();
  const [wasConnected, setWasConnected] = useState(false);
  useEffect(() => { if (connected) setWasConnected(true); }, [connected]);
  const feedbackUrl = room ? `/feedback?${new URLSearchParams({ game: (room.game as { gameId?: string } | null)?.gameId ?? room.selectedGameId, room: room.code })}` : '';
  const gameOwnsFeedbackLink = (room?.game as { gameId?: string } | null)?.gameId === 'shiny-vote' && room?.phase !== 'GAME_RESULTS';
  return <>
    {room && <div className="mx-auto flex w-full max-w-[96rem] flex-wrap items-center justify-end gap-2 px-3 pt-3 sm:px-5 lg:px-8">
      {room.gameSkipState && <SkipGameControl key={`${room.gameSkipState.gameInstanceId}:${connected}`} state={room.gameSkipState} connected={connected} onSetVote={setGameSkipVote} />}
      {!gameOwnsFeedbackLink && <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-extrabold text-ink/60 no-underline transition-colors hover:bg-ink/[.06] hover:text-ink" to={feedbackUrl}><MessageSquareWarning size={18} />Reportar problema o sugerencia</Link>}
    </div>}
    <Outlet />
    <ConnectionNotice connected={connected} wasConnected={wasConnected} onReconnect={reconnect} />
    {error && <div className="fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,36rem)] -translate-x-1/2 items-start gap-3 rounded-xl bg-berry px-4 py-3 font-bold text-white" role="alert">
      <span className="min-w-0 flex-1">{error}</span>
      <button type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" onClick={clearError} aria-label="Cerrar aviso"><X size={17} /></button>
    </div>}
  </>;
}

export function RoomSessionLayout() {
  return <RoomProvider><RoomSessionContent /></RoomProvider>;
}
