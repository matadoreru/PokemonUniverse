import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

/** Contexto del feedback (minijuego y sala) que lleva la píldora «Enviar feedback» de la cabecera. */
export interface FeedbackTarget {
  game?: string | null | undefined;
  room?: string | null | undefined;
}

/** Enlace a `/feedback` con el contexto que haya (`?game=&room=`); sin contexto, la página a secas. */
export function feedbackHref(target: FeedbackTarget | null): string {
  const params = new URLSearchParams();
  if (target?.game) params.set('game', target.game);
  if (target?.room) params.set('room', target.room);
  const query = params.toString();
  return query ? `/feedback?${query}` : '/feedback';
}

interface FeedbackTargetValue {
  target: FeedbackTarget | null;
  setTarget(target: FeedbackTarget | null): void;
}

// Por defecto no hay proveedor (pruebas de piezas sueltas): sin contexto y sin efecto.
const FeedbackTargetContext = createContext<FeedbackTargetValue>({ target: null, setTarget: () => undefined });

/** Lo pone el armazón (`Layout`), por encima de la sesión de sala, que es quien conoce la sala. */
export function FeedbackTargetProvider({ children }: PropsWithChildren) {
  const [target, setTarget] = useState<FeedbackTarget | null>(null);
  const value = useMemo(() => ({ target, setTarget }), [target]);
  return <FeedbackTargetContext.Provider value={value}>{children}</FeedbackTargetContext.Provider>;
}

/** Enlace de feedback para la cabecera. */
export function useFeedbackHref(): string {
  return feedbackHref(useContext(FeedbackTargetContext).target);
}

/** Mientras esté montado, la cabecera envía el feedback con este minijuego y esta sala; al desmontarse lo quita. */
export function useFeedbackTarget(game: string | null | undefined, room: string | null | undefined): void {
  const { setTarget } = useContext(FeedbackTargetContext);
  useEffect(() => {
    setTarget(game || room ? { game, room } : null);
  }, [setTarget, game, room]);
  useEffect(() => () => setTarget(null), [setTarget]);
}
