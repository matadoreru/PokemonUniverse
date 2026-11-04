import type { ReactNode } from 'react';
import { ScreenSplit } from '../ui';
import s from './SessionScreen.module.css';

export interface SessionScreenProps {
  /** Pantalla principal (en móvil, bajo `side`). */
  main: ReactNode;
  /** Columna lateral desde 1024 px (los jugadores); en móvil, arriba del todo. */
  side: ReactNode;
  /** La acción de la pantalla: bajo la principal en escritorio y pegada al fondo en móvil, siempre a la vista. */
  action: ReactNode;
}

/**
 * Armazón de las pantallas de sala con jugadores (spec §2 y §6, lobby): `ScreenSplit` con los mismos bordes que la
 * cabecera. En escritorio llena el alto del `main` sin scroll de página (la principal se desplaza por dentro y la
 * columna de jugadores también); en móvil, jugadores arriba, la principal y la acción abajo con la bisagra.
 */
export function SessionScreen({ main, side, action }: SessionScreenProps) {
  return (
    <div className={`content-row ${s.screen}`}>
      <ScreenSplit fill sideFirst top={main} side={side} bottom={action} />
    </div>
  );
}
