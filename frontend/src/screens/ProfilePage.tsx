import type { LevelProgress, UserProfileResponse } from '@pokemon-universe/shared/public';
import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AvatarEditor } from '../components/AvatarEditor';
import { api } from '../lib/api';
import { formatDerivedMetric, formatStoredMetric, sortProfileGames, winRate } from '../profile/profileStats';
import { Bar, cx, HudPlate, Panel, Pill, Row, Screen, ScreenHeader, StateBox, type StateBoxProps } from '../ui';
import { GameArt } from '../games/GameArt';
import tone from '../styles/tones.module.css';

type ProfileGame = UserProfileResponse['games'][number];

const memberSince = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

/** Dato grande del resumen: número en display con numerales tabulares y su etiqueta debajo. */
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <strong className={cx('ol font-display text-34 font-extrabold tabular-nums lg:text-44', tone.textYellow)}>{value}</strong>
      <span className={cx('text-13 font-extrabold uppercase tracking-[.06em]', tone.textSky2)}>{label}</span>
    </div>
  );
}

/** Nivel y barra de experiencia hasta el siguiente: la barra mide solo el tramo del nivel actual. */
export function LevelMeter({ progress }: { progress: LevelProgress }) {
  const next = progress.level + 1;
  const gained = Math.max(0, progress.xp - progress.levelXp);
  const span = Math.max(1, progress.nextLevelXp - progress.levelXp);
  const missing = Math.max(0, progress.nextLevelXp - progress.xp);
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="level-meter">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <strong className={cx('ol font-display text-22 font-extrabold', tone.textYellow)}>Nivel {progress.level}</strong>
        <span className={cx('text-13 font-extrabold tabular-nums', tone.textSky2)}>{progress.xp} XP en total</span>
      </p>
      <Bar value={gained} max={span} label={`Experiencia hacia el nivel ${next}`} showValue valueText={`${gained}/${span} XP`} />
      <p className={cx('text-13 font-bold', tone.textSky2)}>Faltan {missing} XP para el nivel {next}</p>
    </div>
  );
}

/** Métricas de un juego, bajo su franja: las comunes y las propias del juego (con su formato). */
function GameMetrics({ game, id }: { game: ProfileGame; id: string }) {
  const { stats, profileStats } = game;
  const items: [string, string][] = [
    ['Victorias', String(stats.gamesWon)],
    ['Winrate', winRate(stats.gamesWon, stats.gamesPlayed)],
    ...profileStats.metrics.map((metric): [string, string] => [metric.label, formatStoredMetric(metric, stats.metrics[metric.key] ?? 0)]),
    ...(profileStats.derivedMetrics ?? []).map((metric): [string, string] => [metric.label, formatDerivedMetric(metric, stats.metrics)]),
  ];
  return (
    <dl id={id} className={cx('mx-2 grid grid-cols-2 gap-x-4 gap-y-3 rounded-b-[var(--r-franja)] border-x-[2.5px] border-b-[2.5px] px-4 pb-3 pt-4 sm:grid-cols-3', tone.borderNavy, tone.bgCream2, tone.textInk)}>
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className={cx('text-13 font-bold', tone.textInk2)}>{label}</dt>
          <dd className="font-display text-22 font-extrabold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Perfil (spec §2, página larga): a la izquierda (arriba en móvil) la placa con el avatar grande, su píldora de
 * cámara para el editor, el nombre y la fecha de alta, y el resumen global; a la derecha (abajo en móvil) las
 * estadísticas por juego en franjas que se abren para ver sus métricas, con scroll dentro del panel.
 */
export function ProfilePage() {
  const { user, updateUser, syncLevel } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    void api<{ profile: UserProfileResponse }>('/auth/profile')
      .then((body) => {
        setProfile(body.profile);
        if (body.profile.progress) syncLevel(body.profile.progress.level);
        setOpenId((current) => current ?? body.profile.games.find((game) => game.stats.gamesPlayed > 0)?.id ?? null);
      })
      .catch(() => setFailed(true));
  }, [syncLevel]);
  useEffect(() => { if (user?.kind === 'USER') load(); }, [user?.id, user?.kind, load]);
  const games = useMemo(() => sortProfileGames(profile?.games ?? []), [profile]);

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

  const { globalStats } = profile;
  const played = games.filter((game) => game.stats.gamesPlayed > 0).length;
  return (
    <Screen fill>
      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-8 2xl:gap-12">
      {/* La placa y el resumen, centrados en el alto junto a la lista, que lo llena con su scroll. */}
      <div className="flex min-w-0 flex-col gap-5 lg:min-h-0 lg:justify-center 2xl:gap-6">
        <HudPlate className="w-full !gap-5 !p-5 lg:!p-6">
          <AvatarEditor
            name={profile.user.username}
            avatar={profile.user.avatar}
            level={profile.progress?.level}
            onSaved={(nextUser) => { updateUser(nextUser); setProfile((current) => current ? { ...current, user: { ...current.user, avatar: nextUser.avatar } } : current); }}
          />
          <div className="min-w-0">
            <p className={cx('text-13 font-extrabold uppercase tracking-[.08em]', tone.textSky2)}>Perfil de entrenador</p>
            <h1 className={cx('ol2 font-display text-26 font-extrabold [overflow-wrap:anywhere] sm:text-34 2xl:text-44', tone.textWhite)}>{profile.user.username}</h1>
            <p className={cx('mt-1 text-15 font-bold', tone.textSky2)}>Miembro desde el {memberSince.format(new Date(profile.user.createdAt))}</p>
          </div>
          {profile.progress && <LevelMeter progress={profile.progress} />}
        </HudPlate>
        <Panel title="Resumen" variant="dark" right={`${played} de ${games.length} juegos`} bodyClassName="px-5 py-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            <Stat label="Partidas" value={globalStats.gamesPlayed} />
            <Stat label="Victorias" value={globalStats.gamesWon} />
            <Stat label="Winrate" value={winRate(globalStats.gamesWon, globalStats.gamesPlayed)} />
            <Stat label="Puntos" value={globalStats.totalPoints} />
          </div>
        </Panel>
      </div>

      <Panel title="Estadísticas por juego" right={played ? `${played} ${played === 1 ? 'jugado' : 'jugados'}` : undefined} scroll className="lg:min-h-0">
        {played === 0 && (
          <div className="mb-3">
            <StateBox kind="empty" title="Todavía no has jugado ninguna partida" text="Crea una sala, invita a tus amigos y elige un minijuego: tus estadísticas aparecerán aquí." action={{ label: 'Ir a jugar', onClick: () => navigate('/play') }} />
          </div>
        )}
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 p-1" aria-label="Minijuegos">
          {games.map((game) => {
            const hasStats = game.stats.gamesPlayed > 0;
            const open = hasStats && openId === game.id;
            const detailId = `perfil-juego-${game.id}`;
            return (
              <li key={game.id}>
                <Row
                  avatar={<span className="grid h-9 w-9 place-items-center" aria-hidden="true"><GameArt gameId={game.id} size={32} /></span>}
                  name={game.name}
                  meta={hasStats ? `${game.stats.gamesPlayed} ${game.stats.gamesPlayed === 1 ? 'partida' : 'partidas'} · ${game.stats.gamesWon} ${game.stats.gamesWon === 1 ? 'victoria' : 'victorias'}` : 'Sin jugar'}
                  value={hasStats ? `${game.stats.points} pts` : undefined}
                >
                  {hasStats && (
                    <Pill
                      size="round"
                      variant="cream"
                      icon={ChevronDown}
                      aria-expanded={open}
                      aria-controls={open ? detailId : undefined}
                      aria-label={`${open ? 'Ocultar' : 'Ver'} estadísticas de ${game.name}`}
                      className={cx('shrink-0 [&_svg]:transition-transform', open && '[&_svg]:rotate-180')}
                      onClick={() => setOpenId(open ? null : game.id)}
                    />
                  )}
                </Row>
                {open && <GameMetrics game={game} id={detailId} />}
              </li>
            );
          })}
        </ul>
      </Panel>
      </div>
    </Screen>
  );
}
