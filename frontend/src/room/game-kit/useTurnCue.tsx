import type { RoomView } from '@pokemon-universe/shared/public';
import { useEffect, useState } from 'react';
import { audio } from '../../audio';
import { MomentCutin } from '../../ui';
import s from './TurnCue.module.css';

/** Lo que dura «¡Te toca!» en pantalla (y la ventana del rebote de la placa): un cut-in corto. */
export const TURN_CUE_MS = 1_000;
/** Título del cut-in del turno propio. */
export const TURN_CUE_TITLE = '¡Te toca!';

const STORAGE_KEY = 'pu:turn-cue';
/** Respaldo en memoria si `sessionStorage` no está (ventana privada, pruebas): sobrevive al montaje, no a la recarga. */
let memorySeen: string | null = null;

/** Almacén del último turno propio ya anunciado (un único valor: las claves llevan la sala y la partida). */
export interface TurnCueStore {
  read(): string | null;
  write(key: string): void;
}

/** El de la pestaña: `sessionStorage` con respaldo en memoria (cada acceso puede lanzar y se ignora). */
export const sessionTurnCueStore: TurnCueStore = {
  read() {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY) ?? memorySeen;
    } catch {
      return memorySeen;
    }
  },
  write(key) {
    memorySeen = key;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, key);
    } catch {
      // Sin almacenamiento basta la memoria: tras recargar volvería a salir una vez.
    }
  },
};

/**
 * Clave de un turno propio para `useTurnCue`: sala + partida (`gameInstanceId`) + el turno del juego («vuelta:jugador»,
 * el `bidEpoch` de una subasta…). Así un turno igual de otra partida vuelve a anunciarse. Sin turno, `null`.
 */
export function roomTurnKey(room: Pick<RoomView, 'code' | 'gameSkipState'>, turn: string | number | null | undefined): string | null {
  if (turn === null || turn === undefined) return null;
  return `${room.code}:${room.gameSkipState?.gameInstanceId ?? ''}:${turn}`;
}

/** ¿Se anuncia ahora? Solo si es tu turno, hay clave y no es la del último turno ya anunciado. */
export function turnCueFires(isMyTurn: boolean, turnKey: string | null, seenKey: string | null): boolean {
  return isMyTurn && turnKey !== null && turnKey !== seenKey;
}

/**
 * Marca el turno como anunciado si toca anunciarlo y dice si toca: la parte con efectos de `useTurnCue`, aparte para
 * probarla sin montar nada.
 */
export function claimTurnCue(store: TurnCueStore, isMyTurn: boolean, turnKey: string | null): boolean {
  if (!turnKey || !turnCueFires(isMyTurn, turnKey, store.read())) return false;
  store.write(turnKey);
  return true;
}

/**
 * «¡Te toca!» (A6): cuando empieza un turno tuyo (`turnKey` nuevo con `isMyTurn`), suena `ui.open` una vez y devuelve la
 * clave del turno durante `TURN_CUE_MS` (después, `null`): con ella la pantalla pinta `TurnCutin` y el rebote de la
 * placa (`turnBumpClass`). Cada turno se anuncia una sola vez por pestaña: al montar en mitad de un turno ya anunciado
 * (una recarga o una reconexión) no vuelve a salir; al montar al principio de la partida con tu turno, sí. El hook es el
 * único dueño del sonido: el cut-in va sin el suyo.
 */
export function useTurnCue(isMyTurn: boolean, turnKey: string | null, store: TurnCueStore = sessionTurnCueStore): string | null {
  const [fresh, setFresh] = useState<string | null>(null);
  useEffect(() => {
    if (!claimTurnCue(store, isMyTurn, turnKey)) return;
    audio.play('ui.open');
    setFresh(turnKey);
  }, [isMyTurn, turnKey, store]);
  useEffect(() => {
    if (fresh === null) return undefined;
    const timer = setTimeout(() => setFresh(null), TURN_CUE_MS);
    return () => clearTimeout(timer);
  }, [fresh]);
  return isMyTurn && fresh !== null && fresh === turnKey ? fresh : null;
}

/** Clase del rebote suave de la placa de la acción mientras dura «¡Te toca!» (nada con movimiento reducido). */
export function turnBumpClass(cue: string | null): string | undefined {
  return cue ? s.bump : undefined;
}

/**
 * Cut-in corto «¡Te toca!» de `useTurnCue`: sin región viva (lo dice la de la pantalla) ni sonido propio. No intercepta
 * el puntero ni el Espacio (`skippable={false}`): dura 1 s y el turno ya está en marcha, así el primer trazo, clic o
 * tecla llega a la pantalla de debajo en vez de gastarse en saltarlo. Montado con la clave del turno: el mismo título en
 * otro turno vuelve a salir.
 */
export function TurnCutin({ cue }: { cue: string | null }) {
  if (!cue) return null;
  return <MomentCutin key={cue} tone="yellow" title={TURN_CUE_TITLE} holdMs={TURN_CUE_MS} silent skippable={false} />;
}
