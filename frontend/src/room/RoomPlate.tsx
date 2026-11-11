import { gameModeLabel, type RoomView } from '@pokemon-universe/shared/public';
import { Check, Copy, DoorOpen } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HEADER_ROOM_ID } from '../components/Layout';
import { HudPlate, Pill } from '../ui';
import { useRoomLinkShare } from './room-link';
import s from './RoomPlate.module.css';

/**
 * Nombre del juego en curso; añade « · <modo>» si corre en un modo que no es Clásico: lo lee del estado público (`mode`)
 * y, si este aún no lo trae, de la configuración elegida.
 */
function gameTitle(room: RoomView): string {
  const game = room.game as { gameId?: string; mode?: unknown } | null;
  const gameId = game?.gameId ?? room.daily?.gameId ?? room.selectedGameId;
  const name = room.availableGames?.find((manifest) => manifest.id === gameId)?.name ?? 'Partida';
  const config = typeof game?.mode === 'string' ? game : gameId === room.selectedGameId ? room.selectedGameConfig : null;
  const mode = gameModeLabel(gameId, config);
  return mode ? `${name} · ${mode}` : name;
}

/** Antetítulo y título de la placa según la fase de la sala; la del reto diario lleva siempre «Reto diario» y el juego. */
export function roomPlateHeading(room: RoomView): { kicker: string; title: string } {
  if (room.daily) return { kicker: 'Reto diario', title: gameTitle(room) };
  if (room.phase === 'LOBBY') return { kicker: 'Prepara la partida', title: 'Lobby de la sala' };
  if (room.phase === 'NEXT_GAME_VOTE' || room.phase === 'NEXT_GAME_VOTE_RESULTS') return { kicker: 'Sala', title: 'Siguiente minijuego' };
  if (room.phase === 'SESSION_RESULTS') return { kicker: 'Sala', title: 'Resultados de la sesión' };
  return { kicker: 'Sala', title: gameTitle(room) };
}

/**
 * Placa de la sala (antes la barra del lobby): antetítulo, título, el código con su botón de copiar el enlace de la sala
 * (`/play?sala=CÓDIGO`; en táctil abre el menú de compartir) y «Salir». El título
 * es texto, no `h1`: el encabezado de cada pantalla sigue en el `main`, que es donde lo busca el foco de ruta.
 * A menos de 1024 px «Salir» es una píldora redonda; a menos de 640 px se oculta además el texto (antetítulo y título) y
 * solo quedan el código y «Salir». Fuera del lobby, «Salir» pide confirmación (lo decide `onLeave`, en la sesión). La
 * sala del reto diario es privada: sin código ni botón de copiar.
 */
export function RoomPlate({ room, onLeave }: { room: RoomView; onLeave(): void }) {
  const { copied, share } = useRoomLinkShare(room.code);
  const { kicker, title } = roomPlateHeading(room);
  return (
    <HudPlate className={s.plate ?? ''}>
      <span className={s.text} title={`${kicker} · ${title}`}>
        <span className={s.kicker}>{kicker}</span>
        <span className={s.title}>{title}</span>
      </span>
      <span className={s.actions}>
        {!room.daily && <>
          <Pill variant="cream" icon={copied ? Check : Copy} onClick={share} aria-label={`Copiar enlace de la sala ${room.code}`} title="Copiar enlace de la sala">
            <span className={s.code}>{room.code}</span>
          </Pill>
          <span className="sr-only" aria-live="polite">{copied ? 'Código copiado' : ''}</span>
        </>}
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
