import type { RoomView } from '@pokemon-universe/shared/public';
import { Check, Copy, DoorOpen } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HEADER_ROOM_ID } from '../components/Layout';
import { HudPlate, Pill } from '../ui';
import s from './RoomPlate.module.css';

/** Antetítulo y título de la placa según la fase de la sala. */
export function roomPlateHeading(room: RoomView): { kicker: string; title: string } {
  if (room.phase === 'LOBBY') return { kicker: 'Prepara la partida', title: 'Lobby de la sala' };
  if (room.phase === 'NEXT_GAME_VOTE' || room.phase === 'NEXT_GAME_VOTE_RESULTS') return { kicker: 'Sala', title: 'Siguiente minijuego' };
  if (room.phase === 'SESSION_RESULTS') return { kicker: 'Sala', title: 'Resultados de la sesión' };
  const gameId = (room.game as { gameId?: string } | null)?.gameId ?? room.selectedGameId;
  return { kicker: 'Sala', title: room.availableGames?.find((game) => game.id === gameId)?.name ?? 'Partida' };
}

/**
 * Placa de la sala (antes la barra del lobby): antetítulo, título, el código con su botón de copiar y «Salir». El título
 * es texto, no `h1`: el encabezado de cada pantalla sigue en el `main`, que es donde lo busca el foco de ruta.
 * A menos de 1024 px «Salir» es una píldora redonda; a menos de 640 px se oculta además el texto (antetítulo y título) y
 * solo quedan el código y «Salir». Fuera del lobby, «Salir» pide confirmación (lo decide `onLeave`, en la sesión).
 */
export function RoomPlate({ room, onLeave }: { room: RoomView; onLeave(): void }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const { kicker, title } = roomPlateHeading(room);
  const copyCode = () => void navigator.clipboard.writeText(room.code).then(() => {
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1_800);
  }).catch(() => undefined);
  return (
    <HudPlate className={s.plate ?? ''}>
      <span className={s.text} title={`${kicker} · ${title}`}>
        <span className={s.kicker}>{kicker}</span>
        <span className={s.title}>{title}</span>
      </span>
      <span className={s.actions}>
        <Pill variant="cream" icon={copied ? Check : Copy} onClick={copyCode} aria-label={`Copiar código de sala ${room.code}`} title="Copiar código">
          <span className={s.code}>{room.code}</span>
        </Pill>
        <span className="sr-only" aria-live="polite">{copied ? 'Código copiado' : ''}</span>
        <span className="contents lg:hidden">
          <Pill size="round" variant="ghost" icon={DoorOpen} aria-label="Salir de la sala" title="Salir de la sala" onClick={onLeave} />
        </span>
        <span className="hidden lg:contents">
          <Pill variant="ghost" icon={DoorOpen} aria-label="Salir de la sala" onClick={onLeave}>Salir</Pill>
        </span>
      </span>
    </HudPlate>
  );
}

/** Lleva la placa al hueco izquierdo de la cabecera (`HEADER_ROOM_ID`); sin hueco (pruebas), no pinta nada. */
export function RoomPlatePortal(props: { room: RoomView; onLeave(): void }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setSlot(document.getElementById(HEADER_ROOM_ID)); }, []);
  return slot ? createPortal(<RoomPlate {...props} />, slot) : null;
}
