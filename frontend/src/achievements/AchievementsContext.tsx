import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useRoom } from '../room/RoomContext';
import { acknowledge, emptyAchievementsQueue, enqueue, isVisible, phaseChanged, type AchievementsPhase, type AchievementsQueue } from './achievements-state';

export interface AchievementsContextValue {
  queue: AchievementsQueue;
  /** Fase en la que se mira la cola (`NO_ROOM` sin sala). */
  phase: AchievementsPhase;
  /** La cola se ve ahora (ver `isVisible`). */
  visible: boolean;
  /** «Cerrar» o «Ver mis logros»: vacía la cola. */
  acknowledge(): void;
}

/** Valor del contexto a partir de la cola y la fase; también lo usan los tests del recuadro. */
export function achievementsValue(queue: AchievementsQueue, phase: AchievementsPhase, onAcknowledge: () => void): AchievementsContextValue {
  return { queue, phase, visible: isVisible(queue, phase), acknowledge: onAcknowledge };
}

const EMPTY_VALUE = achievementsValue(emptyAchievementsQueue, 'NO_ROOM', () => undefined);

export const AchievementsContext = createContext<AchievementsContextValue | null>(null);

/**
 * Logros recién conseguidos (spec §Flujo, punto 6): va dentro de `RoomProvider`, que tiene el `/ws`, y guarda en memoria
 * los `achievements:unlocked`. Solo escucha con una cuenta registrada y empieza de cero al cambiar de cuenta. Con cada
 * cambio de fase y cada aviso aplica `phaseChanged`, que retiene la cola mientras hay partida en juego. Nunca la vacía al
 * desmontar nada: `StrictMode` desmonta y vuelve a montar, y eso perdería el aviso.
 */
export function AchievementsProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const { room, subscribe } = useRoom();
  const userId = user?.kind === 'USER' ? user.id : null;
  const phase: AchievementsPhase = room?.phase ?? 'NO_ROOM';
  const [queue, setQueue] = useState<AchievementsQueue>(emptyAchievementsQueue);

  // Otra cuenta (o ninguna): se empieza de cero.
  useEffect(() => {
    setQueue(emptyAchievementsQueue);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    return subscribe('achievements:unlocked', (payload) => setQueue((current) => enqueue(current, payload)));
  }, [userId, subscribe]);

  // Tras cada aviso y cada cambio de fase; `phaseChanged` devuelve la misma cola si no cambia nada, así que no da vueltas.
  useEffect(() => {
    setQueue((current) => phaseChanged(current, phase));
  }, [phase, queue]);

  const onAcknowledge = useCallback(() => setQueue(acknowledge()), []);
  const value = useMemo(() => achievementsValue(userId ? queue : emptyAchievementsQueue, phase, onAcknowledge), [onAcknowledge, phase, queue, userId]);
  return <AchievementsContext.Provider value={value}>{children}</AchievementsContext.Provider>;
}

/** Fuera del proveedor (la galería, los tests de los resultados), una cola vacía. */
export function useAchievements(): AchievementsContextValue {
  return useContext(AchievementsContext) ?? EMPTY_VALUE;
}
