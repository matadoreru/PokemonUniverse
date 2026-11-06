import type { AuthUser } from '@pokemon-universe/shared/public';
import { House, LogOut, MessageSquareWarning, ShieldCheck } from 'lucide-react';
import { Suspense } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { HudPlate, Pill, PillLink, ScreenTransition } from '../ui';
import { Avatar } from './Avatar';
import { FeedbackTargetProvider, useFeedbackHref } from './feedback-target';
import { AudioButton } from './AudioButton';
import { AchievementToasts } from '../achievements/AchievementToasts';
import { FriendsButton } from '../friends/FriendsButton';
import { FriendsDrawer } from '../friends/FriendsDrawer';
import { InviteToasts } from '../friends/InviteToasts';
import { RoomNotice } from '../room/RoomNotice';
import { RouteLoadingFallback } from './LoadingFallback';
import s from './Layout.module.css';

/**
 * Hueco de avisos flotantes de toda la página, como el de conexión de la sala: una capa de alto cero arriba del `main`,
 * así quedan bajo las placas de la cabecera (nunca encima) y no ocupan sitio.
 */
export const HEADER_NOTICES_ID = 'app-header-notices';

/**
 * Hueco izquierdo de la cabecera para la placa de la sala (código y «Salir»), que pinta la sesión de sala con un portal.
 * Vacío no ocupa sitio; a menos de 640 px baja a su propia fila bajo la placa del HUD para no solaparse con ella.
 */
export const HEADER_ROOM_ID = 'app-header-room';


/**
 * Cabecera de HUD (spec §6, ajustada por el usuario el 2026-11-04): una sola placa a la derecha con el inicio (casa), el sonido,
 * «Enviar feedback», Administración (solo ADMIN), el perfil y «Cerrar sesión». Sin logotipo ni Novedades (las novedades
 * están en Inicio). Todo son píldoras redondas de 44 px, así que cabe a 390 px sin menú; el perfil muestra el nombre
 * desde 1024 px y Administración su texto desde 1280 px.
 */
export function AppHeader({ user, level = null, onLogout }: { user: AuthUser | null; level?: number | null; onLogout(): void }) {
  const isAdmin = user?.kind === 'USER' && user.role === 'ADMIN';
  const profileLabel = user ? `Abrir perfil de ${user.displayName}${level ? ` (nivel ${level})` : ''}` : '';
  // Dentro de una sala lleva su contexto (`?game=&room=`), que pone la sesión de sala.
  const feedback = useFeedbackHref();
  return (
    // Reserva, como el `main`, el hueco de su barra de scroll: así la fila queda centrada igual que el contenido de debajo.
    // `scrollbar-gutter` solo vale con `overflow` distinto de `visible`, de ahí el `overflow-hidden`. No recorta nada: el
    // anillo de foco (5 px), las insignias (-8 px) y la barra de la píldora actual (-9 px) caben en el relleno de su placa
    // (8 px + 3 px de contorno) y la sombra de 4 px de la placa, en el `pb-2`.
    <header className="relative z-hud overflow-hidden [scrollbar-gutter:stable]" data-layout="hud-plates">
      {/* Mismos bordes que el contenido (`content-row`). */}
      <div className="content-row flex flex-wrap items-stretch justify-end gap-3 pb-2 pt-3 sm:flex-nowrap">
        <div id={HEADER_ROOM_ID} className="order-last flex w-full min-w-0 empty:hidden sm:order-none sm:w-auto sm:flex-1" />
        <HudPlate>
          <PillLink nav to="/" size="round" icon={House} aria-label="Ir al inicio" title="Inicio" />
          <AudioButton />
          {/* «Amigos»: solo con una cuenta registrada (lo decide `FriendsProvider`). */}
          <FriendsButton />
          {user && <PillLink nav to={feedback} size="round" icon={MessageSquareWarning} aria-label="Enviar feedback" title="Enviar feedback" />}
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
                <PillLink nav to="/profile" size="round" aria-label={profileLabel} title={user.displayName}>
                  <Avatar name={user.displayName} avatar={user.avatar} level={level} size="sm" className="!text-13" />
                </PillLink>
              </span>
              <span className="hidden lg:contents">
                <PillLink nav to="/profile" aria-label={profileLabel} className={s.profile}>
                  <Avatar name={user.displayName} avatar={user.avatar} level={level} size="sm" className="!text-13" />
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
          {user && <Pill size="round" variant="danger" icon={LogOut} aria-label="Cerrar sesión" title="Cerrar sesión" onClick={onLogout} />}
        </HudPlate>
      </div>
    </header>
  );
}

/**
 * Armazón de pantalla completa (spec §2): rejilla de `100dvh` con la cabecera arriba y el `main` debajo. El `main` se
 * desplaza por dentro solo en el móvil; en escritorio el E2E exige que no se desborde. Cada ruta nueva entra con
 * `ScreenTransition`.
 *
 * El `main` es `relative` para ser el bloque contenedor de todo lo `absolute` sin antepasado posicionado (los `sr-only`
 * de una leyenda o de una etiqueta oculta): si no, su bloque contenedor es la vista inicial, escapan del recorte del
 * `main` y alargan el documento (401 px en la rotación del lobby a 390 px).
 */
export function Layout() {
  const { user, level, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <FeedbackTargetProvider>
      <div className="grid h-[100dvh] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
        <AppHeader user={user} level={level} onLogout={() => void logout().then(() => navigate('/'))} />
        <main className="relative min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
          {/* Hueco de avisos flotantes (conexión de la sala): capa de alto cero pegada arriba, bajo la cabecera. */}
          <div id={HEADER_NOTICES_ID} className="sticky top-0 z-toast h-0" />
          <ScreenTransition routeKey={pathname} focusHeading>
            <Suspense fallback={<RouteLoadingFallback />}>
              <Outlet />
            </Suspense>
          </ScreenTransition>
        </main>
      </div>
      {/* En toda página (dentro de `SessionRoot`): el panel «Amigos», las invitaciones recibidas y el único aviso de
          errores de la sala, que también enseña un «Unirse» fallido desde Inicio o Perfil; y los logros fuera de partida. */}
      <FriendsDrawer />
      <InviteToasts />
      <AchievementToasts />
      <RoomNotice />
    </FeedbackTargetProvider>
  );
}
