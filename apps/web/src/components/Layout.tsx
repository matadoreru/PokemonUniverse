import { LogOut, UserRound } from 'lucide-react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Layout() {
  const { user, logout } = useAuth(); const navigate = useNavigate();
  return <div className="min-h-screen">
    <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 md:px-8">
      <Link to="/" className="flex items-center gap-3 font-display text-xl font-bold no-underline">
        <span className="pokeball-mark h-10 w-10 border-2 border-ink" />
        <span>Pokémon <span className="text-berry">Universe</span></span>
      </Link>
      {user && <div className="flex items-center gap-2">
        {user.kind === 'USER' && <Link className="btn-ghost min-h-9 px-3 py-1.5 text-sm" to="/profile"><UserRound size={17} />{user.displayName}</Link>}
        {user.kind === 'GUEST' && <span className="chip">Invitado · {user.displayName}</span>}
        <button aria-label="Cerrar sesión" className="rounded-xl p-2 hover:bg-ink/5" onClick={() => void logout().then(() => navigate('/'))}><LogOut size={20} /></button>
      </div>}
    </header>
    <main><Outlet /></main>
    <footer className="mx-auto max-w-7xl px-5 py-10 text-center text-sm font-bold text-ink/45">Proyecto fan no afiliado a Nintendo, Game Freak ni The Pokémon Company.</footer>
  </div>;
}
