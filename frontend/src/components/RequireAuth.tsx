import { Navigate, useLocation } from 'react-router-dom';
import { authRedirectState } from '../auth/auth-redirect';
import { useAuth } from '../auth/AuthContext';

/** Ruta solo con sesión: sin ella manda a `/auth` y guarda el destino (p. ej. `/play?sala=PIKA42`) para después. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="grid min-h-[60vh] place-items-center font-display text-26">Cargando…</div>;
  return user ? children : <Navigate to="/auth" replace state={authRedirectState(location)} />;
}
