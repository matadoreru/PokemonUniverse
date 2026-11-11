import type { RoomMemberView } from '@pokemon-universe/shared/public';
import { Check, Equal, Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { Badge, Chip, Icon, Panel, Row, ScoreValue } from '../../ui';
import { playerColor } from '../../lib/player-color';
import { attemptsText, guessSeconds, guessSprite, ordinal, type GuessAttemptLike, type GuessRevealLine, type GuessRevealSolveLike, type GuessScoreLine } from './presentation';
import { UNKNOWN_PLAYER_NAME } from '../room-members';
import s from './GuessSide.module.css';

const offline = (member: RoomMemberView) => member.presence !== undefined && member.presence !== 'CONNECTED';

/**
 * Marcador en vivo (columna lateral): una franja por jugador (sin espectadores) con su color, avatar, puntos y, en
 * texto, si ya acertó esta ronda («Acertó · 1.º») o sigue buscando. Los desconectados lo dicen en su franja.
 */
export function GuessPlayersPanel({ lines, selfId, title = 'Marcador', className }: { lines: readonly GuessScoreLine[]; selfId: string; title?: string; className?: string | undefined }) {
  return <Panel title={title} variant="dark" scroll scrollLabel="Marcador de la partida" {...(className ? { className } : {})} right={<Badge tone="cream">{`${lines.length} ${lines.length === 1 ? 'jugador' : 'jugadores'}`}</Badge>}>
    <ol className={s.rows} aria-label="Marcador">{lines.map(({ member, points, position, colorIndex, solveOrder, tied }) => <li key={member.id} data-testid="guess-score-row" aria-current={member.id === selfId ? 'true' : undefined}>
      <Row rank={position} name={member.displayName} color={playerColor(colorIndex)} self={member.id === selfId} disconnected={offline(member)}
        avatar={<Avatar name={member.displayName} avatar={member.avatar} level={member.level} size="sm" />}
        meta={<span className={s.rowMeta}>
          {solveOrder ? <Chip tone="ok" icon={<Icon icon={Check} size={18} />}>Acertó · {ordinal(solveOrder)}</Chip> : <Chip tone="neutral" icon={<Icon icon={Search} size={18} />}>Buscando…</Chip>}
          {tied && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}
        </span>}
        value={<ScoreValue value={points} self={member.id === selfId} quiet color={playerColor(colorIndex)} className={s.score} data-testid="guess-score"><small> pts</small></ScoreValue>} />
    </li>)}</ol>
  </Panel>;
}

/**
 * Intentos públicos (columna lateral): los fallos de la ronda, el último arriba, con el sprite (decorativo), el nombre
 * del Pokémon, quién lo probó y «No era». El vacío enseña a jugar y no es región viva (la pantalla ya tiene la suya).
 */
export function GuessAttemptsFeed({ attempts, members, colors, title = 'Intentos públicos', emptyText = 'Cada fallo sale aquí para todos. Tras un fallo hay una breve espera antes del siguiente intento.', className }: {
  attempts: readonly GuessAttemptLike[];
  members: ReadonlyMap<string, RoomMemberView>;
  /** Índice de cada jugador en la sala (para `playerColor`). */
  colors: ReadonlyMap<string, number>;
  title?: string;
  /** Línea de ayuda del vacío («Todavía no hay intentos incorrectos.»). */
  emptyText?: string;
  className?: string | undefined;
}) {
  const ordered = [...attempts].reverse();
  return <Panel title={title} variant="dark" scroll scrollLabel="Intentos públicos de la ronda" {...(className ? { className } : {})} right={<Badge tone="cream">{attempts.length}</Badge>}
    status={ordered.length === 0 ? { kind: 'empty', title: 'Todavía no hay intentos incorrectos.', text: emptyText, live: false } : null}>
    <ul className={s.rows} aria-label="Intentos de la ronda">{ordered.map((attempt, index) => {
      const name = members.get(attempt.playerId)?.displayName ?? UNKNOWN_PLAYER_NAME;
      return <li key={`${attempt.playerId}-${attempt.attemptedAt}-${index}`} data-testid="guess-attempt">
        <Row name={attempt.guessedPokemon.name} color={playerColor(colors.get(attempt.playerId) ?? 0)}
          avatar={<img className={s.attemptSprite} src={guessSprite(attempt.guessedPokemon.sprite)} alt="" />}
          meta={<span className={s.rowMeta}><span className={s.attemptBy}>{name} probó</span><Chip tone="bad" icon={<Icon icon={X} size={18} />}>No era</Chip></span>} />
      </li>;
    })}</ul>
  </Panel>;
}

/**
 * Cómo acabó cada jugador en la revelación (columna lateral): por orden de acierto, con el puesto, el tiempo, los
 * intentos y los puntos de la ronda; quien no acertó lo dice en texto («No acertó»). `detail` añade lo propio de cada
 * juego (p. ej. «Rapidez 10 + orden 3», «Zoom ×4», «Eligió X»), en su propia línea y partido en dos si no cabe: nunca
 * se corta con elipsis (el `title` no llega al teclado ni al tacto).
 */
export function GuessRevealBoard<S extends GuessRevealSolveLike>({ lines, selfId, detail, title = 'Puntos de la ronda', className }: { lines: readonly GuessRevealLine<S>[]; selfId: string; detail?: (line: GuessRevealLine<S>) => ReactNode; title?: string; className?: string | undefined }) {
  return <Panel title={title} variant="dark" scroll scrollLabel="Puntos de la ronda" {...(className ? { className } : {})}>
    <ol className={s.rows} aria-label="Resultado de cada jugador">{lines.map((line) => {
      const { member, colorIndex, solve, attempts } = line;
      const extra = detail?.(line);
      return <li key={member.id} data-testid="guess-reveal-row">
        <Row {...(solve ? { rank: solve.solveOrder } : {})} name={member.displayName} color={playerColor(colorIndex)} self={member.id === selfId} disconnected={offline(member)}
          avatar={<Avatar name={member.displayName} avatar={member.avatar} level={member.level} size="sm" />}
          meta={<span className={s.rowMeta}>{solve
            ? <><Chip tone="ok" icon={<Icon icon={Check} size={18} />}>Acertó · {ordinal(solve.solveOrder)}</Chip><span className={s.stat} title={`${guessSeconds(solve.elapsedMs)} · ${attemptsText(attempts)}`}>{guessSeconds(solve.elapsedMs)} · {attemptsText(attempts)}</span></>
            : <><Chip tone="bad" icon={<Icon icon={X} size={18} />}>No acertó</Chip><span className={s.stat}>{attemptsText(attempts)}</span></>}
          {extra && <span className={s.detail} data-testid="guess-reveal-detail">{extra}</span>}</span>}
          value={<span className={s.score}>+{solve?.points ?? 0}</span>} />
      </li>;
    })}</ol>
  </Panel>;
}
