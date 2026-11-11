import type { RoomMemberView, ShinyVotePublicState } from '@pokemon-universe/shared/public';
import { Check, CircleDashed, Eye, UserX, X } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { playerColor } from '../../room/player-color';
import { Badge, Chip, cx, Icon, Panel, Row } from '../../ui';
import s from './ShinyVote.module.css';

function memberName(member: RoomMemberView | undefined) {
  return member?.displayName ?? 'Entrenador';
}

/** Marcador ordenado por puntos (empates por nombre) con la posición compartida en los empates. */
export function shinyRanking(game: Pick<ShinyVotePublicState, 'playerIds' | 'scores'>, members: ReadonlyMap<string, RoomMemberView>): { id: string; position: number }[] {
  const score = (id: string) => game.scores[id] ?? 0;
  const ranking = [...game.playerIds].sort((left, right) => score(right) - score(left) || memberName(members.get(left)).localeCompare(memberName(members.get(right))));
  return ranking.map((id) => ({ id, position: ranking.findIndex((other) => score(other) === score(id)) + 1 }));
}

/**
 * Marcador de la partida (columna lateral): una franja por jugador con su color, los puntos y si ha votado; la opción
 * votada solo al revelar (con los votos al revelar, antes no se sabe ni se pinta). Votos de la ronda en la cabecera.
 * En Supervivencia (`alive` presente) los votos cuentan solo a quien sigue en pie, la cabecera dice cuántos quedan, la
 * columna derecha son las rondas superadas y quien cayó lleva «Eliminado» (en la revelación de su caída, aún su voto).
 */
export function ShinyGameSidebar({ game, members, colors, selfId, className }: {
  game: ShinyVotePublicState;
  members: ReadonlyMap<string, RoomMemberView>;
  /** Color de cada jugador por su orden en la sala (`playerColor`). */
  colors: ReadonlyMap<string, number>;
  selfId: string;
  className?: string | undefined;
}) {
  const reveal = game.phase === 'ROUND_RESULTS';
  const voted = new Set(game.votedPlayerIds);
  const privateVotes = game.voteVisibility === 'REVEAL' && !reveal;
  const survival = game.alive !== undefined;
  const playing = game.alive ?? game.playerIds;
  const votes = game.votedPlayerIds.filter((id) => playing.includes(id)).length;
  const fellNow = new Set(reveal ? game.lastRound?.missedPlayerIds ?? [] : []);
  return <Panel title="Marcador" variant="dark" scroll scrollLabel="Marcador de la partida" {...(className ? { className } : {})}
    right={<Badge tone="cream">{`${survival ? votes : game.votedPlayerIds.length} / ${playing.length} votos`}</Badge>}>
    <p className={s.sideHint}>{survival && <><strong>{playing.length} en pie</strong> · </>}{game.pendingPlayerIds.length > 0 ? `Pendientes · ${game.pendingPlayerIds.length}` : 'Todos han votado'}{privateVotes && <> · <strong>Elección privada</strong> hasta revelar</>}</p>
    <ol className={s.rows} aria-label="Clasificación de la partida">{shinyRanking(game, members).map(({ id, position }) => {
      const member = members.get(id);
      const name = memberName(member);
      const vote = reveal ? game.votes[id] : undefined;
      const correct = vote?.optionId === game.correctOptionId;
      const status = member?.role === 'SPECTATOR'
        ? <Chip tone="neutral" icon={<Icon icon={Eye} size={18} />}>Espectador</Chip>
        : survival && !playing.includes(id) && !fellNow.has(id)
          ? <Chip tone="bad" icon={<Icon icon={UserX} size={18} />}>Eliminado</Chip>
        : !voted.has(id)
          ? <Chip tone="neutral" icon={<Icon icon={CircleDashed} size={18} />}>Pendiente</Chip>
          : vote
            ? <Chip tone={correct ? 'ok' : 'bad'} icon={<Icon icon={correct ? Check : X} size={18} />}>{vote.optionId}<span className="sr-only">{correct ? ': acertó' : ': falló'}</span></Chip>
            : <Chip tone="ok" icon={<Icon icon={Check} size={18} />}>Votó</Chip>;
      return <li key={id} aria-current={id === selfId ? 'true' : undefined}>
        <Row rank={position} name={name} color={playerColor(colors.get(id) ?? 0)} self={id === selfId} disconnected={member?.presence !== undefined && member.presence !== 'CONNECTED'}
          avatar={<Avatar name={name} avatar={member?.avatar} level={member?.level} size="sm" />}
          meta={<span className={s.rowMeta}>{status}</span>}
          value={<span className={cx(s.score)}>{game.scores[id] ?? 0}<small>{survival ? ' rondas' : ' pts'}</small></span>} />
      </li>;
    })}</ol>
  </Panel>;
}
