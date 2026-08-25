import { X } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { RoomProvider, useRoom } from './RoomContext';

function RoomSessionContent() {
  const { error, clearError } = useRoom();
  return <>
    <Outlet />
    {error && <div className="fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,36rem)] -translate-x-1/2 items-start gap-3 rounded-xl bg-berry px-4 py-3 font-bold text-white" role="alert">
      <span className="min-w-0 flex-1">{error}</span>
      <button type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" onClick={clearError} aria-label="Cerrar aviso"><X size={17} /></button>
    </div>}
  </>;
}

export function RoomSessionLayout() {
  return <RoomProvider><RoomSessionContent /></RoomProvider>;
}
