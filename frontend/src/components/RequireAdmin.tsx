import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-[60vh] place-items-center font-display text-2xl">Cargando…</div>;
  return user?.kind === 'USER' && user.role === 'ADMIN' ? children : <Navigate to="/play" replace />;
}
