import type { ReactNode } from 'react';
import { ScreenTransition } from '../ui';

interface PhaseKeyRoom {
  phase: string;
  gamesPlayed: number;
  gameSkipState?: { gameInstanceId: string } | null | undefined;
}

/**
 * Clave de la pantalla de la sala: cambia al pasar de sala a partida, a resultados, a la votación o a los resultados de
 * la sesión, y entre una partida y la siguiente; nunca entre rondas ni fases de una misma partida (`ROUND_ACTIVE`,
 * `ROUND_RESULTS`… son todas «partida»). La votación y su recuento son la misma pantalla. La partida se identifica
 * con `gamesPlayed`, que solo sube al terminarla (la vista no siempre trae `gameSkipState`).
 */
export function phaseScreenKey(room: PhaseKeyRoom): string {
  switch (room.phase) {
    case 'LOBBY': return 'lobby';
    case 'NEXT_GAME_VOTE':
    case 'NEXT_GAME_VOTE_RESULTS': return `vote:${room.gamesPlayed}`;
    case 'GAME_RESULTS': return `results:${room.gamesPlayed}`;
    case 'SESSION_RESULTS': return 'session';
    default: return `game:${room.gamesPlayed}`;
  }
}

/**
 * Entrada suave entre las pantallas de la sala (la ruta sigue siendo `/room`): la de `ScreenTransition` con la clave
 * de `phaseScreenKey`, que no vuelve a montar la pantalla (solo reinicia la animación) y lleva el foco al `h1` nuevo.
 */
export function PhaseTransition({ room, children }: { room: PhaseKeyRoom; children: ReactNode }) {
  return <ScreenTransition routeKey={phaseScreenKey(room)} focusHeading>{children}</ScreenTransition>;
}
