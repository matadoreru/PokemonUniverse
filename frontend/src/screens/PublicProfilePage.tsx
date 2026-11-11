import { Check, Clock, Lock, UserCheck, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { useFriends } from '../friends/FriendsContext';
import { friendErrorMessage, friendRelation, sentText } from '../friends/friends-state';
import { api } from '../lib/api';
import type { PublicProfileResponse } from '../lib/api-contract';
import { cx, HudPlate, Icon, Panel, Pill, Screen, ScreenHeader, StateBox, type StateBoxProps } from '../ui';
import tone from '../styles/tones.module.css';
import { LevelMeter, ProfileDetail, ProfileGames, ProfileLayout, ProfileName, ProfileSummary, useProfileTab } from '../profile/ProfileParts';

/** Mensaje del servidor para un nombre que no es de ninguna cuenta (`UsersController`). */
const NOT_FOUND = 'User not found';

type LoadState = { status: 'loading' } | { status: 'notFound' } | { status: 'error' } | { status: 'ready'; profile: PublicProfileResponse };

/** Por qué no se ve el perfil: «Solo amigos» o «Nadie». */
export function privateText(profile: Pick<PublicProfileResponse, 'visibility'>): string {
  return profile.visibility === 'NOBODY'
    ? 'Ha decidido no mostrar su nivel, sus estadísticas ni sus logros a nadie.'
    : 'Solo sus amigos pueden ver su nivel, sus estadísticas y sus logros.';
}

/**
 * Botón de amistad del perfil según la relación que manda el servidor. Tras cada acción se vuelve a pedir el perfil
 * (`onChanged`): hacerse amigos puede abrir un perfil «Solo amigos». El resultado es lo único que se anuncia en la
 * pantalla ya cargada.
 */
export function FriendshipAction({ profile, onChanged }: { profile: PublicProfileResponse; onChanged(): void }) {
  const friends = useFriends();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  // Tras el éxito la píldora pulsada desaparece (pasa a otra deshabilitada): el foco va al resultado, no al `body`. Ya
  // pintado, porque vacío está oculto y no admite el foco.
  useEffect(() => { if (result?.ok) statusRef.current?.focus(); }, [result]);
  const name = profile.user.username;
  const run = (action: () => Promise<string>) => {
    setBusy(true);
    setResult(null);
    void action().then((text) => { setResult({ ok: true, text }); onChanged(); })
      .catch((error: unknown) => setResult({ ok: false, text: friendErrorMessage(error) })).finally(() => setBusy(false));
  };
  const requestId = profile.requestId;
  return (
    <div className="flex basis-full flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {profile.friendship === 'NONE' && <Pill variant="yellow" icon={UserPlus} loading={busy} onClick={() => run(async () => sentText(await friends.send(name)))}>Añadir amigo</Pill>}
        {profile.friendship === 'PENDING_SENT' && <Pill variant="cream" icon={Clock} disabled>Solicitud enviada</Pill>}
        {profile.friendship === 'PENDING_RECEIVED' && requestId && <Pill variant="yellow" icon={Check} loading={busy} onClick={() => run(async () => { await friends.accept(requestId); return `${name} y tú ya sois amigos.`; })}>Aceptar solicitud</Pill>}
        {profile.friendship === 'FRIENDS' && <Pill variant="cream" icon={UserCheck} disabled>Ya sois amigos</Pill>}
      </div>
      {/* Como en «Gestionar a…» de la sala: el éxito en `status` y el fallo en `alert`, siempre montados (vacíos no ocupan). */}
      <p ref={statusRef} tabIndex={-1} className={cx('text-15 font-bold empty:hidden', tone.textSky2)} role="status">{result?.ok ? result.text : ''}</p>
      <p className={cx('text-15 font-extrabold empty:hidden', tone.textYellow)} role="alert">{result && !result.ok ? result.text : ''}</p>
    </div>
  );
}

/**
 * Perfil de otra cuenta (`/u/:username`, spec de perfiles públicos): la misma composición que el propio, en solo
 * lectura y con el botón de amistad. Si es privado para quien mira, la placa (nombre, avatar y amistad) y, en lugar del
 * detalle, «Este perfil es privado». Solo cuentas registradas: un invitado vuelve a jugar; el dueño, a su perfil.
 */
export function PublicProfilePage() {
  const { user } = useAuth();
  const { username = '' } = useParams();
  const friends = useFriends();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [tab, changeTab] = useProfileTab();
  const seq = useRef(0);

  const load = useCallback((silent = false) => {
    const mine = ++seq.current;
    if (!silent) setState({ status: 'loading' });
    void api<{ profile: PublicProfileResponse }>(`/users/${encodeURIComponent(username)}/profile`)
      .then((body) => { if (mine === seq.current) setState({ status: 'ready', profile: body.profile }); })
      .catch((error: unknown) => {
        if (mine !== seq.current) return;
        // Al refrescar en silencio, un fallo deja el perfil que ya se veía.
        if (silent) return;
        setState(error instanceof Error && error.message === NOT_FOUND ? { status: 'notFound' } : { status: 'error' });
      });
  }, [username]);
  useEffect(() => { if (user?.kind === 'USER') load(); }, [user?.id, user?.kind, load]);

  // Si la amistad cambia desde fuera (te aceptan, te quitan…), el perfil se vuelve a pedir: puede abrirse o cerrarse.
  const targetId = state.status === 'ready' ? state.profile.user.id : null;
  const relation = targetId ? friendRelation(friends.overview, targetId).kind : null;
  const lastRelation = useRef(relation);
  useEffect(() => {
    if (lastRelation.current !== null && relation !== null && relation !== lastRelation.current) load(true);
    lastRelation.current = relation;
  }, [relation, load]);

  if (user?.kind !== 'USER') return <Navigate to="/play" replace />;
  if (state.status === 'ready' && state.profile.friendship === 'SELF') return <Navigate to="/profile" replace />;

  if (state.status !== 'ready') {
    const status: StateBoxProps = state.status === 'loading' ? { kind: 'loading', title: 'Cargando perfil' }
      : state.status === 'notFound' ? { kind: 'empty', title: 'No hay ningún jugador con ese nombre.', text: 'Comprueba cómo se escribe su nombre de usuario.' }
      : { kind: 'error', title: 'No se pudo cargar el perfil', text: 'Comprueba la conexión y vuelve a intentarlo.', action: { label: 'Reintentar', onClick: () => load() } };
    return (
      <Screen width="narrow">
        <ScreenHeader title="Perfil de entrenador" />
        <Panel status={status} className="w-full" aria-label="Perfil de entrenador" />
      </Screen>
    );
  }

  const { profile } = state;
  const reload = () => load(true);
  const plate = (
    <HudPlate size="block">
      <Avatar name={profile.user.username} avatar={profile.user.avatar} level={profile.progress?.level} size="xxl" className={cx('border-[3px]', tone.borderNavy)} />
      <ProfileName username={profile.user.username} createdAt={profile.user.createdAt ?? null} />
      {profile.progress && <LevelMeter progress={profile.progress} />}
      <FriendshipAction profile={profile} onChanged={reload} />
    </HudPlate>
  );

  // La placa va siempre en la misma posición del árbol: si el perfil se abre al hacerse amigos, no se remonta (ni pierde
  // el foco ni el resultado de la acción de amistad).
  if (profile.private || !profile.stats || !profile.achievements) {
    return (
      <ProfileLayout aside={<>{plate}{null}</>}>
        <Panel title="Estadísticas y logros" className="lg:min-h-0" bodyClassName="flex flex-col items-center gap-4 px-5 py-8 text-center lg:justify-center">
          <Icon icon={Lock} size={32} />
          <h2 className="font-display text-26 font-extrabold">Este perfil es privado</h2>
          <p className="max-w-[36ch] text-15 font-bold">{privateText(profile)}</p>
        </Panel>
      </ProfileLayout>
    );
  }

  const { stats, achievements } = profile;
  return (
    <ProfileLayout aside={<>{plate}<ProfileSummary globalStats={stats.globalStats} games={stats.games} /></>}>
      <ProfileDetail
        tab={tab}
        onTab={changeTab}
        achievements={{ status: 'ready', data: achievements }}
        onRetry={reload}
        emptyAchievements={<StateBox kind="empty" live={false} onCream title="Todavía no ha desbloqueado ningún logro" />}
      >
        <ProfileGames games={stats.games} empty={<StateBox kind="empty" live={false} onCream title="Todavía no ha jugado ninguna partida" />} />
      </ProfileDetail>
    </ProfileLayout>
  );
}
