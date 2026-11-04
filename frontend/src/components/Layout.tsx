import type { AuthUser } from '@pokemon-universe/shared/public';
import { House, LogOut, MessageSquareWarning, ShieldCheck } from 'lucide-react';
import { Suspense } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { HudPlate, Pill, PillLink, ScreenTransition } from '../ui';
import { Avatar } from './Avatar';
import { AudioButton } from './AudioButton';
import { RouteLoadingFallback } from './LoadingFallback';
import s from './Layout.module.css';

/** Hueco de la cabecera para avisos de toda la página, como el de conexión de la sala: van bajo las placas, nunca encima. */
export const HEADER_NOTICES_ID = 'app-header-notices';

/**
 * Cabecera de HUD (spec §6, ajustada por el usuario el 2026-11-04): una sola placa a la derecha con el inicio (casa), el sonido,
 * «Enviar feedback», Administración (solo ADMIN), el perfil y «Cerrar sesión». Sin logotipo ni Novedades (las novedades
 * están en Inicio). Todo son píldoras redondas de 44 px, así que cabe a 390 px sin menú; el perfil muestra el nombre
 * desde 1024 px y Administración su texto desde 1280 px.
 */
export function AppHeader({ user, onLogout }: { user: AuthUser | null; onLogout(): void }) {
  const isAdmin = user?.kind === 'USER' && user.role === 'ADMIN';
  const profileLabel = user ? `Abrir perfil de ${user.displayName}` : '';
  return (
    <header className="relative z-hud" data-layout="hud-plates">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-end gap-2 px-3 pb-1 pt-3 sm:px-4 lg:px-6">
        <HudPlate>
          <PillLink nav to="/" size="round" icon={House} aria-label="Ir al inicio" title="Inicio" />
          <AudioButton />
          {user && <PillLink nav to="/feedback" size="round" icon={MessageSquareWarning} aria-label="Enviar feedback" title="Enviar feedback" />}
          {isAdmin && (
            <>
              <span className="contents xl:hidden">
                <PillLink nav to="/admin" size="round" icon={ShieldCheck} aria-label="Abrir panel de administración" title="Administración" />
              </span>
              <span className="hidden xl:contents">
                <PillLink nav to="/admin" icon={ShieldCheck} aria-label="Abrir panel de administración" title="Administración">
                  Administración
                </PillLink>
              </span>
            </>
          )}
          {user?.kind === 'USER' && (
            <>
              <span className="contents lg:hidden">
                <PillLink nav to="/profile" variant="cream" size="round" aria-label={profileLabel} title={user.displayName}>
                  <Avatar name={user.displayName} avatar={user.avatar} size="sm" className="!text-13" />
                </PillLink>
              </span>
              <span className="hidden lg:contents">
                <PillLink nav to="/profile" variant="cream" aria-label={profileLabel} className={s.profile}>
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
  return (
    <div className="grid h-[100dvh] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
      <AppHeader user={user} onLogout={() => void logout().then(() => navigate('/'))} />
      <main className="min-h-0 overflow-y-auto">
        <ScreenTransition routeKey={pathname} focusHeading>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Outlet />
          </Suspense>
        </ScreenTransition>
      </main>
    </div>
  );
}
