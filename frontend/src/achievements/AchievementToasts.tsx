import type { ReactElement } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ActionToast } from '../ui';
import { ACHIEVEMENTS_HREF } from './AchievementNotice';
import { queueTitle, toastText } from './achievements-state';
import { useAchievements } from './AchievementsContext';

/** Ruta de la sala, la que pinta los resultados con su recuadro de logros. */
const ROOM_PATH = '/room';

/**
 * Aviso flotante de logros fuera de partida (spec §Flujo, punto 7): en el lobby, en los resultados de la sesión y sin sala,
 * un `ActionToast` educado (`role="status"`) con los nombres (o el récord), «Ver mis logros» y «Cerrar». En los resultados
 * de una partida manda el recuadro de `ResultsShell`, salvo si el jugador se fue a otra pantalla sin salir de la sala:
 * entonces sale aquí, o no lo vería nunca. Nunca a mitad de partida: la cola no se enseña en esas fases.
 *
 * Devuelve los avisos sueltos (con su `key`): `Layout` los pone en la única pila, junto a las invitaciones.
 */
export function useAchievementToasts(): ReactElement[] {
  const { queue, visible, acknowledge } = useAchievements();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const inResultsBox = queue.shownIn === 'GAME_RESULTS' && pathname === ROOM_PATH;
  if (!visible || inResultsBox) return [];
  const text = toastText(queue);
  return [
    <ActionToast key="achievements" live="status" title={queueTitle(queue)} {...(text ? { text } : {})}
      primary={{ label: 'Ver mis logros', onClick: () => { acknowledge(); navigate(ACHIEVEMENTS_HREF); } }}
      secondary={{ label: 'Cerrar', onClick: acknowledge }} />,
  ];
}
