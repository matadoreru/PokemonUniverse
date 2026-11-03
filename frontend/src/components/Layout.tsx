import type { AuthUser } from '@pokemon-universe/shared/public';
import { LogOut, Newspaper, ShieldCheck } from 'lucide-react';
import { Suspense } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useChangelog } from '../changelog/ChangelogContext';
import { Badge, HudPlate, Pill, PillLink, ScreenTransition } from '../ui';
import { Avatar } from './Avatar';
import { AudioButton } from './AudioButton';
import { RouteLoadingFallback } from './LoadingFallback';
import s from './Layout.module.css';

/** Hueco de la cabecera para avisos de toda la página, como el de conexión de la sala: van bajo las placas, nunca encima. */
export const HEADER_NOTICES_ID = 'app-header-notices';

/**
 * Cabecera de placas de HUD (spec §6): a la izquierda el logotipo (enlace a inicio) y el sonido; a la derecha Novedades,
 * Administración (solo ADMIN), el perfil y «Cerrar sesión». Por debajo de 640 px el logotipo pasa a «PU»; por debajo de
 * 1024 px Administración y el perfil quedan en píldoras redondas (por debajo de 640 px el ADMIN deja el perfil para no
 * desbordar el móvil).
 */
export function AppHeader({ user, onLogout, unreadChangelogCount = 0 }: { user: AuthUser | null; onLogout(): void; unreadChangelogCount?: number }) {
  const isAdmin = user?.kind === 'USER' && user.role === 'ADMIN';
  const profileLabel = user ? `Abrir perfil de ${user.displayName}` : '';
  return (
    <header className="relative z-hud" data-layout="hud-plates">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-2 px-3 pb-1 pt-3 sm:px-4 lg:px-6">
        <HudPlate>
          <Link to="/" className={`${s.logo} ol2 font-display text-26`} aria-label="Pokémon Universe, inicio">
            <span className="sm:hidden" aria-hidden="true">
              P<span className={s.accent}>U</span>
            </span>
            <span className="hidden sm:inline" aria-hidden="true">
              Pokémon <span className={s.accent}>Universe</span>
            </span>
          </Link>
          <AudioButton />
        </HudPlate>
        <HudPlate>
          <span className="relative inline-flex">
            <PillLink to="/changelog" size="round" icon={Newspaper} aria-label={unreadChangelogCount ? `Novedades, ${unreadChangelogCount} versiones sin leer` : 'Novedades'} title="Novedades" />
            {unreadChangelogCount > 0 && (
              <span className="pointer-events-none absolute -right-2 -top-2" data-layer aria-hidden="true">
                <Badge>{unreadChangelogCount > 9 ? '9+' : unreadChangelogCount}</Badge>
              </span>
            )}
          </span>
          {isAdmin && (
            <>
              <span className="contents lg:hidden">
                <PillLink to="/admin" size="round" icon={ShieldCheck} aria-label="Abrir panel de administración" title="Administración" />
              </span>
              <span className="hidden lg:contents">
                <PillLink to="/admin" icon={ShieldCheck} aria-label="Abrir panel de administración" title="Administración">
                  Administración
                </PillLink>
              </span>
            </>
          )}
          {user?.kind === 'USER' && (
            <>
              {/* El ADMIN deja el perfil por debajo de 640 px: con Administración, la placa no cabría en el móvil. */}
              <span className={isAdmin ? 'hidden sm:contents lg:hidden' : 'contents lg:hidden'}>
                <PillLink to="/profile" variant="cream" size="round" aria-label={profileLabel} title={user.displayName}>
                  <Avatar name={user.displayName} avatar={user.avatar} size="sm" className="!text-13" />
                </PillLink>
              </span>
              <span className="hidden lg:contents">
                <PillLink to="/profile" variant="cream" aria-label={profileLabel} className={s.profile}>
                  <Avatar name={user.displayName} avatar={user.avatar} size="sm" className="!text-13" />
                  <span className={s.name} title={user.displayName}>
                    {user.displayName}
                  </span>
                </PillLink>
              </span>
            </>
          )}
          {user?.kind === 'GUEST' && (
            <span className={s.guest}>
              <Avatar name={user.displayName} avatar={user.avatar} size="md" />
              <span className={`${s.name} hidden lg:block`} title={user.displayName}>
                {user.displayName}
              </span>
            </span>
          )}
          {user && <Pill size="round" variant="ghost" icon={LogOut} aria-label="Cerrar sesión" title="Cerrar sesión" onClick={onLogout} />}
        </HudPlate>
      </div>
      <div id={HEADER_NOTICES_ID} />
    </header>
  );
}

/**
 * Armazón de pantalla completa (spec §2): rejilla de `100dvh` con la cabecera arriba y el `main` debajo, que se desplaza
 * por dentro mientras haya pantallas sin rediseñar. Cada ruta nueva entra con `ScreenTransition`.
 */
export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { unreadCount } = useChangelog();
  return (
    <div className="grid h-[100dvh] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
      <AppHeader user={user} unreadChangelogCount={unreadCount} onLogout={() => void logout().then(() => navigate('/'))} />
      <main className="min-h-0 overflow-y-auto">
        <ScreenTransition routeKey={pathname}>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Outlet />
          </Suspense>
        </ScreenTransition>
      </main>
    </div>
  );
}
