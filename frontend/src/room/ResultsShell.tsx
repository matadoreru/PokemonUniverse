import type { AvatarRef } from '@pokemon-universe/shared/public';
import { Crown, Trophy } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { audio } from '../audio';
import { Avatar } from '../components/Avatar';
import { Badge, cx, Icon, Panel, Row, ScorePop } from '../ui';
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
}

const defaultPoints = (points: number) => `${points} pts`;

/**
 * Podio (los tres primeros puestos, con avatar grande) y el resto en franjas; los ganadores con insignia y «+N». Con
 * `winnersNeedPoints` (la sesión) el primer puesto solo es ganador si tiene puntos: un empate a cero no corona a nadie.
 */
export function ResultsStandings({ standings, selfId, pointsLabel = defaultPoints, winnersNeedPoints = false }: { standings: readonly ResultsStanding[]; selfId?: string | undefined; pointsLabel?: (points: number) => string; winnersNeedPoints?: boolean }) {
  return <ol className={s.standings} aria-label="Clasificación">{standings.map((standing) => {
    const winner = standing.position === 1 && (!winnersNeedPoints || standing.points > 0);
    const podium = standing.position <= 3;
    return <li key={standing.id} className={podium ? s.podium : undefined} data-podium={podium || undefined}>
      <Row
        rank={standing.position}
        avatar={<Avatar name={standing.name} avatar={standing.avatar} size={podium ? 'md' : 'sm'} />}
        name={standing.name}
        self={standing.id === selfId}
        {...(standing.color ? { color: standing.color } : {})}
        {...(winner || standing.meta ? { meta: <span className={s.meta}>{winner && <Badge><Icon icon={Crown} size={18} />Ganador</Badge>}{standing.meta}</span> } : {})}
        value={<span className={s.points}>{winner && standing.points > 0 && <ScorePop points={standing.points} color={standing.color} className={s.pop} />}{pointsLabel(standing.points)}</span>}
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
 */
export function ResultsShell({ title, subtitle, won = false, podium = false, standings, selfId, pointsLabel, winnersNeedPoints, aside, actions, children }: { title: string; subtitle: string; won?: boolean; podium?: boolean; standings?: readonly ResultsStanding[]; selfId?: string; pointsLabel?: (points: number) => string; /** Ver `ResultsStandings`. */ winnersNeedPoints?: boolean; aside?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  // Solo al montar: un cambio posterior de `won` no repite el sonido.
  const initial = useRef({ podium, won });
  useEffect(() => {
    const cue = resultsCue(initial.current);
    if (cue) audio.play(cue);
  }, []);
  const wide = aside != null;
  const ranking = standings && <ResultsStandings standings={standings} selfId={selfId} {...(pointsLabel ? { pointsLabel } : {})} {...(winnersNeedPoints ? { winnersNeedPoints } : {})} />;
  return <section className={cx(s.shell, wide && s.wide)}>
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
          <div className={s.column}>{ranking}{children}</div>
          <div className={s.column}>{aside}</div>
        </div>
        : <>{ranking}{children}</>}
      {actions && <div className={cx(s.actions, wide && s.wideActions)}>{actions}</div>}
    </Panel>
  </section>;
}
