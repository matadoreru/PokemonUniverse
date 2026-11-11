import type { UserProfileResponse } from '@pokemon-universe/shared/public';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AvatarEditor } from '../components/AvatarEditor';
import { api } from '../lib/api';
import type { AchievementsResponse } from '../lib/api-contract';
import { HudPlate, Panel, Screen, ScreenHeader, StateBox, type StateBoxProps } from '../ui';
import { LevelMeter, ProfileDetail, ProfileGames, ProfileLayout, ProfileName, ProfileSummary, useProfileTab, type AchievementsState } from '../profile/ProfileParts';
import { ProfilePrivacy } from '../profile/ProfilePrivacy';

/**
 * Perfil (spec §2, página larga): a la izquierda (arriba en móvil) la placa con el avatar grande, su píldora de
 * cámara para el editor, el nombre, la fecha de alta y la privacidad, y el resumen global; a la derecha (abajo en
 * móvil) las estadísticas por juego en franjas que se abren para ver sus métricas, con scroll dentro del panel.
 */
export function ProfilePage() {
  const { user, updateUser, syncLevel } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, changeTab] = useProfileTab();
  const location = useLocation();
  const [achievements, setAchievements] = useState<AchievementsState>({ status: 'loading' });

  const load = useCallback(() => {
    setFailed(false);
    void api<{ profile: UserProfileResponse }>('/auth/profile')
      .then((body) => {
        setProfile(body.profile);
        if (body.profile.progress) syncLevel(body.profile.progress.level);
      })
      .catch(() => setFailed(true));
  }, [syncLevel]);
  // Los logros se piden a la vez que el perfil: un fallo suyo no tumba las estadísticas.
  const loadAchievements = useCallback((silent = false) => {
    if (!silent) setAchievements({ status: 'loading' });
    void api<AchievementsResponse>('/achievements')
      .then((data) => setAchievements({ status: 'ready', data }))
      .catch(() => setAchievements({ status: 'error' }));
  }, []);
  useEffect(() => { if (user?.kind === 'USER') { load(); loadAchievements(); } }, [user?.id, user?.kind, load, loadAchievements]);
  // «Ver mis logros» estando ya en el perfil no remonta la página: al entrar en la pestaña (o al repetir la navegación) se
  // vuelven a pedir en silencio, o no saldría el logro recién desbloqueado.
  const firstVisit = useRef(true);
  useEffect(() => {
    if (firstVisit.current) { firstVisit.current = false; return; }
    if (tab === 'logros' && user?.kind === 'USER') loadAchievements(true);
  }, [tab, location.key, user?.kind, loadAchievements]);

  if (user?.kind !== 'USER') return <Navigate to="/play" replace />;

  const status: StateBoxProps | null = failed
    ? { kind: 'error', title: 'No se pudo cargar tu perfil', text: 'Comprueba la conexión y vuelve a intentarlo.', action: { label: 'Reintentar', onClick: load } }
    : !profile ? { kind: 'loading', title: 'Cargando perfil' } : null;

  if (status || !profile) {
    return (
      <Screen width="narrow">
        {/* Mientras carga o si falla, la pantalla sigue teniendo su `h1` (el foco de ruta y los lectores de pantalla lo buscan). */}
        <ScreenHeader title="Perfil de entrenador" />
        <Panel status={status} className="w-full" aria-label="Perfil de entrenador" />
      </Screen>
    );
  }

  return (
    <ProfileLayout aside={<>
      <HudPlate size="block">
        <AvatarEditor
          name={profile.user.username}
          avatar={profile.user.avatar}
          level={profile.progress?.level}
          onSaved={(nextUser) => { updateUser(nextUser); setProfile((current) => current ? { ...current, user: { ...current.user, avatar: nextUser.avatar } } : current); }}
        />
        <ProfileName username={profile.user.username} createdAt={profile.user.createdAt}>
          <ProfilePrivacy value={profile.profileVisibility ?? 'EVERYONE'} onSaved={(profileVisibility) => setProfile((current) => current ? { ...current, profileVisibility } : current)} />
        </ProfileName>
        {profile.progress && <LevelMeter progress={profile.progress} />}
      </HudPlate>
      <ProfileSummary globalStats={profile.globalStats} games={profile.games} />
    </>}>
      <ProfileDetail tab={tab} onTab={changeTab} achievements={achievements} onRetry={() => loadAchievements()}>
        <ProfileGames
          games={profile.games}
          empty={<StateBox kind="empty" onCream title="Todavía no has jugado ninguna partida" text="Crea una sala, invita a tus amigos y elige un minijuego: tus estadísticas aparecerán aquí." action={{ label: 'Ir a jugar', onClick: () => navigate('/play') }} />}
        />
      </ProfileDetail>
    </ProfileLayout>
  );
}
