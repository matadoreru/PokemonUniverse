import type { AuthUser } from '@pokemon-universe/shared';
import { LogOut, Newspaper, ShieldCheck } from 'lucide-react';
import { Suspense } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useChangelog } from '../changelog/ChangelogContext';
import { Avatar } from './Avatar';
import { RouteLoadingFallback } from './LoadingFallback';
import { ThemeToggle } from './ThemeToggle';

export function AppHeader({ user, onLogout, unreadChangelogCount = 0 }: { user: AuthUser | null; onLogout(): void; unreadChangelogCount?: number }) {
  return <header className="sticky top-0 z-40 border-b border-ink/10 bg-cream/95" data-layout="centered-brand"><div className="mx-auto grid w-full max-w-[96rem] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-3 py-2.5 sm:px-5 md:px-8">
    <span className="justify-self-start"><ThemeToggle /></span>
    <Link to="/" className="justify-self-center whitespace-nowrap font-display text-sm font-bold no-underline sm:text-xl" aria-label="Pokémon Universe, inicio">
      <span className="sm:hidden">P<span className="text-berry">U</span></span><span className="hidden sm:inline">Pokémon <span className="text-berry">Universe</span></span>
    </Link>
    <div className="flex min-w-0 items-center justify-self-end gap-1 sm:gap-2">
      <Link className="relative inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-2 text-sm font-extrabold text-ink/70 no-underline transition hover:bg-ink/[0.06] hover:text-ink" to="/changelog" aria-label={unreadChangelogCount ? `Novedades, ${unreadChangelogCount} versiones sin leer` : 'Novedades'} title="Novedades"><Newspaper size={19} /><span className="hidden xl:inline">Novedades</span>{unreadChangelogCount > 0 && <span className="absolute right-0.5 top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-berry px-1 text-[.62rem] font-black leading-none text-white" aria-hidden="true">{unreadChangelogCount > 9 ? '9+' : unreadChangelogCount}</span>}</Link>
      {user && <>
      {user.kind === 'USER' && user.role === 'ADMIN' && <Link className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-2 text-sm font-extrabold text-ink/70 no-underline transition hover:bg-ink/[0.06] hover:text-ink" to="/admin" aria-label="Abrir panel de administración" title="Administración"><ShieldCheck size={19} /><span className="hidden lg:inline">Administración</span></Link>}
      {user.kind === 'USER' && <Link className={`${user.role === 'ADMIN' ? 'hidden sm:flex' : 'flex'} min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-1.5 text-sm font-extrabold no-underline transition hover:bg-ink/[0.06] sm:px-2.5`} to="/profile" aria-label={`Abrir perfil de ${user.displayName}`}><Avatar name={user.displayName} avatar={user.avatar} size="sm" /><span className="hidden max-w-36 truncate sm:inline">{user.displayName}</span></Link>}
      {user.kind === 'GUEST' && <span className="inline-flex min-h-10 items-center gap-2 rounded-xl px-1.5 sm:bg-ink/5 sm:px-2.5"><Avatar name={user.displayName} avatar={user.avatar} size="sm" /><span className="hidden max-w-36 truncate text-sm font-extrabold sm:inline">{user.displayName}</span></span>}
      <button aria-label="Cerrar sesión" title="Cerrar sesión" className="icon-button" onClick={onLogout}><LogOut size={19} /></button>
      </>}
    </div>
  </div></header>;
}

export function Layout() {
  const { user, logout } = useAuth(); const navigate = useNavigate();
  const { unreadCount } = useChangelog();
  return <div className="flex min-h-screen flex-col">
    <AppHeader user={user} unreadChangelogCount={unreadCount} onLogout={() => void logout().then(() => navigate('/'))} />
    <main className="flex-1"><Suspense fallback={<RouteLoadingFallback />}><Outlet /></Suspense></main>
    <footer className="mx-auto max-w-7xl px-5 py-8 text-center text-sm font-bold text-ink/60">Proyecto fan no afiliado a Nintendo, Game Freak ni The Pokémon Company. Todos los nombres de productos son marcas registradas de sus respectivos dueños.</footer>
  </div>;
}
