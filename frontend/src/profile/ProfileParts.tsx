/** Piezas del perfil que comparten el propio (`ProfilePage`) y el público (`PublicProfilePage`). */
import type { LevelProgress, UserProfileResponse } from '@pokemon-universe/shared/public';
import { ChevronDown } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AchievementsPanel } from '../achievements/AchievementsPanel';
import type { AchievementsResponse } from '../lib/api-contract';
import { formatDerivedMetric, formatStoredMetric, gameWinRate, globalWinRate, sortProfileGames, visibleStoredMetrics } from './profileStats';
import { Bar, cx, Panel, Pill, Row, Screen, StateBox, TabPanel, Tabs } from '../ui';
import { GameArt } from '../games/GameArt';
import tone from '../styles/tones.module.css';
import shape from '../styles/shapes.module.css';

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
    // A todo el ancho de la placa, en su propia fila: en una columna estrecha la barra casi no se veía.
    <div className="flex min-w-0 basis-full flex-col gap-2" data-testid="level-meter">
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
    ['Winrate', gameWinRate(stats)],
    ...visibleStoredMetrics(profileStats.metrics, stats.metrics).map((metric): [string, string] => [metric.label, formatStoredMetric(metric, stats.metrics[metric.key] ?? 0)]),
    ...(profileStats.derivedMetrics ?? []).map((metric): [string, string] => [metric.label, formatDerivedMetric(metric, stats.metrics)]),
  ];
  return (
    <dl id={id} className={cx('mx-2 grid grid-cols-2 gap-x-4 gap-y-3 px-4 pb-3 pt-4 sm:grid-cols-3', shape.franjaFoot, tone.borderNavy, tone.bgCream2, tone.textInk)}>
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className={cx('text-13 font-bold', tone.textInk2)}>{label}</dt>
          <dd className="font-display text-22 font-extrabold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}


export type ProfileTab = 'estadisticas' | 'logros';

/** Pestaña que abre el parámetro `?tab=`: solo «logros» cambia la de por defecto. */
export function tabFromParam(value: string | null): ProfileTab {
  return value === 'logros' ? 'logros' : 'estadisticas';
}

/** Pestaña del perfil en la URL (`?tab=logros`), sin añadir entradas al historial. */
export function useProfileTab(): [ProfileTab, (tab: ProfileTab) => void] {
  const [params, setParams] = useSearchParams();
  const tab = tabFromParam(params.get('tab'));
  return [tab, (next) => setParams(next === 'logros' ? { tab: 'logros' } : {}, { replace: true })];
}

/** Los logros de la cuenta: cargando, con su respuesta o fallidos (la pestaña «Estadísticas» no depende de ello). */
export type AchievementsState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: AchievementsResponse };

/**
 * Panel derecho del perfil: pestañas «Estadísticas» y «Logros» (esta con la insignia desbloqueados/total). Si los logros
 * fallan, solo su pestaña muestra el error con «Reintentar». `emptyAchievements` sustituye a la lista si no hay ninguno
 * (el perfil de otra cuenta solo trae los desbloqueados).
 */
export function ProfileDetail({ tab, onTab, achievements, onRetry, emptyAchievements, children }: {
  tab: ProfileTab; onTab: (tab: ProfileTab) => void; achievements: AchievementsState; onRetry: () => void; emptyAchievements?: ReactNode; children: ReactNode;
}) {
  const badge = achievements.status === 'ready' ? `${achievements.data.unlocked}/${achievements.data.total}` : undefined;
  return (
    <Panel title={tab === 'logros' ? 'Logros' : 'Estadísticas por juego'} scroll className="lg:min-h-0">
      <Tabs
        idBase="perfil"
        label="Secciones del perfil"
        active={tab}
        onChange={onTab}
        items={[{ key: 'estadisticas', label: 'Estadísticas' }, { key: 'logros', label: 'Logros', ...(badge ? { badge } : {}) }]}
      />
      <TabPanel idBase="perfil" tabKey={tab}>
        {tab === 'estadisticas' ? children
          : achievements.status === 'ready' ? (achievements.data.achievements.length === 0 && emptyAchievements ? emptyAchievements : <AchievementsPanel data={achievements.data} />)
          : achievements.status === 'error' ? <StateBox kind="error" onCream title="No se pudieron cargar tus logros" text="Comprueba la conexión y vuelve a intentarlo." action={{ label: 'Reintentar', onClick: onRetry }} />
          : <StateBox kind="loading" onCream title="Cargando logros" />}
      </TabPanel>
    </Panel>
  );
}

/** Rejilla del perfil: la placa y el resumen a la izquierda (arriba en móvil) y el detalle a la derecha, que llena el alto. */
export function ProfileLayout({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <Screen fill>
      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-8 2xl:gap-12">
        {/* La placa y el resumen, centrados en el alto junto a la lista, que lo llena con su scroll. */}
        <div className="flex min-w-0 flex-col gap-5 lg:min-h-0 lg:justify-center 2xl:gap-6">{aside}</div>
        {children}
      </div>
    </Screen>
  );
}

/** Nombre, antetítulo y fecha de alta de la placa del perfil (sin fecha en un perfil privado de otra cuenta). */
export function ProfileName({ username, createdAt, children }: { username: string; createdAt: string | null; children?: ReactNode }) {
  return (
    <div className="min-w-0 flex-1">
      <p className={cx('text-13 font-extrabold uppercase tracking-[.08em]', tone.textSky2)}>Perfil de entrenador</p>
      <h1 className={cx('ol2 font-display text-26 font-extrabold [overflow-wrap:anywhere] sm:text-34 2xl:text-44', tone.textWhite)}>{username}</h1>
      {createdAt && <p className={cx('mt-1 text-15 font-bold', tone.textSky2)}>Miembro desde el {memberSince.format(new Date(createdAt))}</p>}
      {children}
    </div>
  );
}

/** Totales de la cuenta: partidas, victorias, winrate y puntos, con cuántos juegos ha probado. */
export function ProfileSummary({ globalStats, games }: Pick<UserProfileResponse, 'globalStats' | 'games'>) {
  const played = games.filter((game) => game.stats.gamesPlayed > 0).length;
  return (
    <Panel title="Resumen" variant="dark" right={`${played} de ${games.length} juegos`} bodyClassName="px-5 py-5">
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
        <Stat label="Partidas" value={globalStats.gamesPlayed} />
        <Stat label="Victorias" value={globalStats.gamesWon} />
        <Stat label="Winrate" value={globalWinRate(globalStats, games)} />
        <Stat label="Puntos" value={globalStats.totalPoints} />
      </div>
    </Panel>
  );
}

/**
 * Franjas de los minijuegos (las jugadas primero) que se abren para ver sus métricas; abre la primera jugada. `empty`
 * va encima si aún no ha jugado ninguno.
 */
export function ProfileGames({ games, empty }: { games: readonly ProfileGame[]; empty?: ReactNode }) {
  const sorted = useMemo(() => sortProfileGames(games), [games]);
  const [openId, setOpenId] = useState<string | null>(() => sorted.find((game) => game.stats.gamesPlayed > 0)?.id ?? null);
  const played = sorted.some((game) => game.stats.gamesPlayed > 0);
  return (
    <>
      {!played && empty && <div className="mb-3">{empty}</div>}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 p-1" aria-label="Minijuegos">
        {sorted.map((game) => {
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
    </>
  );
}
