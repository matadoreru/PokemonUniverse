import { MessageSquareWarning, WifiOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { RoomProvider, useRoom } from './RoomContext';
import { SkipGameControl } from './SkipGameControl';

function RoomSessionContent() {
  const { connected, error, clearError, room, setGameSkipVote } = useRoom();
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
    {!connected && <div className="fixed left-1/2 top-3 z-40 flex w-[min(92vw,32rem)] -translate-x-1/2 items-start gap-3 rounded-xl bg-night px-4 py-3 font-bold text-white shadow-card" role="status" aria-live="polite"><WifiOff className="mt-0.5 shrink-0 text-electric" size={18} /><span><strong className="block">{wasConnected ? 'Conexión perdida' : 'Conectando con la sala'}</strong><span className="block text-sm text-white/75">{wasConnected ? 'Reconectando… Tu sesión sigue guardada.' : 'Estamos recuperando el estado de la sesión.'}</span></span></div>}
    {error && <div className="fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,36rem)] -translate-x-1/2 items-start gap-3 rounded-xl bg-berry px-4 py-3 font-bold text-white" role="alert">
      <span className="min-w-0 flex-1">{error}</span>
      <button type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" onClick={clearError} aria-label="Cerrar aviso"><X size={17} /></button>
    </div>}
  </>;
}

export function RoomSessionLayout() {
  return <RoomProvider><RoomSessionContent /></RoomProvider>;
}
