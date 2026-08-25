import { WifiOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { RoomProvider, useRoom } from './RoomContext';

function RoomSessionContent() {
  const { connected, error, clearError } = useRoom();
  const [wasConnected, setWasConnected] = useState(false);
  useEffect(() => { if (connected) setWasConnected(true); }, [connected]);
  return <>
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
