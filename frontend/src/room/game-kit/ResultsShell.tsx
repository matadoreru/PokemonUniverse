import type { AvatarRef } from '@pokemon-universe/shared/public';
import { Crown, Trophy } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { AchievementNotice } from '../../achievements/AchievementNotice';
import { announcement } from '../../achievements/achievements-state';
import { useAchievements } from '../../achievements/AchievementsContext';
import { audio } from '../../audio';
import { Avatar } from '../../components/Avatar';
import { Badge, cx, Icon, Panel, Row, ScorePop } from '../../ui';
import type { RoomMembers } from '../room-members';
import s from './ResultsShell.module.css';

/** Efecto del final: el podio de la sesión da `game.win` al campeón y `game.podium` al resto; los resultados de una partida solo `game.win` al ganador. */
export function resultsCue({ podium, won }: { podium: boolean; won: boolean }): 'game.win' | 'game.podium' | null {
  if (won) return 'game.win';
  return podium ? 'game.podium' : null;
}

/** Puesto de la clasificación de unos resultados. */
export interface ResultsStanding {
  id: string;
  /** 1 es ganador (con empate, varios). */
  position: number;
  name: string;
  points: number;
  avatar?: AvatarRef | undefined;
  /** Color del jugador (`playerColor` de su orden en la sala). */
  color?: string | undefined;
  /** Línea secundaria: estadísticas del juego. */
  meta?: ReactNode;
  /** Sprite propio de la franja (p. ej. el Pokémon secreto de cada uno), a la derecha de los puntos; decorativo. */
  sprite?: string | undefined;
}

/**
 * Puestos de `ResultsShell` desde la clasificación del motor: id, puesto, puntos y el nombre, el avatar y el color de
 * cada jugador en la sala (`RoomMembers`); `extra` añade lo propio del juego (la línea de métricas, un sprite).
 */
export function standingRows<S extends { playerId: string; position: number; points: number }>(standings: readonly S[], members: RoomMembers, extra?: (standing: S) => Pick<ResultsStanding, 'meta' | 'sprite'>): ResultsStanding[] {
  return standings.map((standing) => ({
    id: standing.playerId,
    position: standing.position,
    name: members.nameOf(standing.playerId),
    points: standing.points,
    avatar: members.get(standing.playerId)?.avatar,
    color: members.colorOf(standing.playerId),
    ...extra?.(standing),
  }));
}

const defaultPoints = (points: number) => `${points} pts`;

/**
 * Podio (los tres primeros puestos, con avatar grande) y el resto en franjas; los ganadores con insignia y «+N». Con
 * `winnersNeedPoints` (la sesión) el primer puesto solo es ganador si tiene puntos: un empate a cero no corona a nadie.
 * Con `noWinner` (partidas cooperativas) nadie lleva insignia de ganador.
 */
export function ResultsStandings({ standings, selfId, pointsLabel = defaultPoints, winnersNeedPoints = false, noWinner = false }: { standings: readonly ResultsStanding[]; selfId?: string | undefined; pointsLabel?: (points: number) => string; winnersNeedPoints?: boolean; noWinner?: boolean }) {
  return <ol className={s.standings} aria-label="Clasificación">{standings.map((standing) => {
    const winner = !noWinner && standing.position === 1 && (!winnersNeedPoints || standing.points > 0);
    const podium = standing.position <= 3;
    return <li key={standing.id} className={podium ? s.podium : undefined} data-podium={podium || undefined}>
      <Row
        rank={standing.position}
        avatar={<span className={s.avatarBox}><Avatar name={standing.name} avatar={standing.avatar} size={podium ? 'md' : 'sm'} /></span>}
        name={standing.name}
        self={standing.id === selfId}
        {...(standing.color ? { color: standing.color } : {})}
        {...(winner || standing.meta ? { meta: <span className={s.meta}>{winner && <Badge><Icon icon={Crown} size={18} />Ganador</Badge>}{standing.meta}</span> } : {})}
        value={<span className={s.value}>
          <span className={s.points}>{winner && standing.points > 0 && <ScorePop points={standing.points} color={standing.color} className={s.pop} />}{pointsLabel(standing.points)}</span>
          {standing.sprite && <span className={s.sprite} data-testid="results-sprite"><img src={standing.sprite} alt="" /></span>}
        </span>}
      />
    </li>;
  })}</ol>;
}

/**
 * Marco de los resultados de una partida o de la sesión: trofeo, subtítulo y título (`h1`) en un panel azul noche (los hijos de los juegos aún sin migrar esperan fondo oscuro). Con
 * `standings` pinta además la clasificación del catálogo; sin ella, cada juego pone la suya en `children`.
 *
 * Con `aside` (las métricas propias del juego) pasa a pantalla ancha: desde 1024 px llena el alto del `main` sin scroll
 * de página, con la clasificación (y `children`) a la izquierda y `aside` a la derecha, cada columna con su propio
 * desplazamiento; en el móvil, una columna. `actions` queda abajo, siempre a la vista en escritorio.
 *
 * Con `fillLarge` (y `aside`), en escritorio grande (≥1600×900) el panel llena todo el alto y las franjas de la
 * clasificación reparten el alto de su columna (con tope) y van en grande; `aside` mide lo que necesita.
 *
 * Encima de la clasificación va el recuadro de logros recién conseguidos (`AchievementNotice`). Su única región viva,
 * siempre montada, anuncia esos logros: las pantallas de resultados no tienen otra.
 */
export function ResultsShell({ title, subtitle, won = false, podium = false, standings, selfId, pointsLabel, winnersNeedPoints, noWinner, aside, actions, fillLarge = false, children }: { title: string; subtitle: string; won?: boolean; podium?: boolean; standings?: readonly ResultsStanding[]; selfId?: string; pointsLabel?: (points: number) => string; /** Ver `ResultsStandings`. */ winnersNeedPoints?: boolean; /** Ver `ResultsStandings`. */ noWinner?: boolean; aside?: ReactNode; actions?: ReactNode; /** Ver arriba: pantalla llena en escritorio grande. */ fillLarge?: boolean; children?: ReactNode }) {
  // Solo al montar: un cambio posterior de `won` no repite el sonido.
  const initial = useRef({ podium, won });
  useEffect(() => {
    const cue = resultsCue(initial.current);
    if (cue) audio.play(cue);
  }, []);
  const achievements = useAchievements();
  const spoken = achievements.visible && achievements.queue.shownIn === 'GAME_RESULTS' ? announcement(achievements.queue) : '';
  const wide = aside != null;
  const ranking = standings && <ResultsStandings standings={standings} selfId={selfId} {...(pointsLabel ? { pointsLabel } : {})} {...(winnersNeedPoints ? { winnersNeedPoints } : {})} {...(noWinner ? { noWinner } : {})} />;
  return <section className={cx(s.shell, wide && s.wide, wide && fillLarge && s.fillLarge)}>
    <p className="sr-only" role="status" aria-live="polite">{spoken}</p>
    <Panel variant="dark" as="div" className={cx(wide && s.widePanel)} bodyClassName={cx(s.body, wide && s.wideBody)}>
      <header className={cx(s.head, wide && s.wideHead)}>
        <span className={s.trophy}><Icon icon={Trophy} size={32} /></span>
        <span className={s.headText}>
          <span className={s.subtitle}>{subtitle}</span>
          <h1 className={s.title}>{title}</h1>
        </span>
      </header>
      {wide
        ? <div className={s.columns}>
          <div className={s.column}><AchievementNotice />{ranking}{children}</div>
          <div className={s.column}>{aside}</div>
        </div>
        : <><AchievementNotice />{ranking}{children}</>}
      {actions && <div className={cx(s.actions, wide && s.wideActions)}>{actions}</div>}
    </Panel>
  </section>;
}
