import type { GameStanding, ImpostorRole, PokemonImpostorPlayerState, PokemonImpostorPublicState } from '@pokemon-universe/shared/public';
import { Crown, ShieldCheck, Skull } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { Badge, Card, Chip, cx, Icon, Panel, Row } from '../ui';
import { useRoomMembers } from './room-members';
import { impostorFinishText } from './pokemon-impostor-texts';
import { ResultsHostActions } from './game-kit/ResultsRecords';
import { ResultsShell } from './game-kit/ResultsShell';
import type { GameResultsProps } from './room-command';
import s from '../games/pokemon-impostor/PokemonImpostorResults.module.css';

/** Línea de cada jugador en los resultados: pistas dadas y si llegó al final o lo expulsaron. */
export function impostorResultLine(stats: GameStanding['stats'] | undefined): string {
  const clues = stats?.cluesSubmitted ?? 0;
  return `${clues} ${clues === 1 ? 'pista' : 'pistas'} · ${stats?.survived === 1 ? 'llegó al final' : 'expulsado'}`;
}

/** Jugadores de un equipo (según los roles que publica el servidor al final), en el orden de la partida. */
export function impostorTeam(playerIds: readonly string[], roles: Readonly<Record<string, ImpostorRole>> | null, role: ImpostorRole): string[] {
  return playerIds.filter((id) => roles?.[id] === role);
}

/**
 * Resultados de Pokémon Impostor: el equipo ganador como título, los dos equipos con sus jugadores (el rol que tenía
 * cada uno, sus pistas y si lo expulsaron) y, al lado, el Pokémon secreto y cómo acabó la partida.
 */
export function PokemonImpostorResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as PokemonImpostorPublicState;
  const player = room.gamePlayerState as PokemonImpostorPlayerState;
  const host = room.hostId === selfId;
  const impostorsWon = game.winnerTeam === 'IMPOSTORS';
  const standings = game.results?.standings ?? [];
  const byPlayer = new Map(standings.map((standing) => [standing.playerId, standing]));
  const members = useRoomMembers(room); const { nameOf } = members;
  const guesserId = standings.find((standing) => standing.stats.pokemonGuessed === 1)?.playerId ?? null;
  const finishText = impostorFinishText(game.finishReason, guesserId ? nameOf(guesserId) : null);
  const won = byPlayer.get(selfId)?.won ?? false;

  const team = (role: ImpostorRole) => {
    const winners = (role === 'IMPOSTOR') === impostorsWon;
    const ids = impostorTeam(game.playerIds, player.revealedRoles, role);
    const title = role === 'IMPOSTOR' ? 'Impostores' : 'Inocentes';
    return <section className={cx(s.team, role === 'IMPOSTOR' ? s.impostor : s.innocent)} aria-labelledby={`impostor-team-${role}`}>
      <h2 id={`impostor-team-${role}`} className={s.teamTitle}>
        <span className={s.teamIcon}><Icon icon={role === 'IMPOSTOR' ? Skull : ShieldCheck} size={18} /></span>
        {title}
        {winners && <Badge><Icon icon={Crown} size={18} />Ganan</Badge>}
      </h2>
      <ol className={s.rows} aria-label={title}>{ids.map((id) => {
        const name = nameOf(id);
        return <li key={id}><Row name={name} self={id === selfId} color={members.colorOf(id)}
          avatar={<span className={s.rowAvatar}><Avatar name={name} avatar={members.get(id)?.avatar} size="md" /></span>}
          meta={<span className={s.meta}>
            <Chip tone={role === 'IMPOSTOR' ? 'bad' : 'info'}>{role === 'IMPOSTOR' ? 'IMPOSTOR' : 'INOCENTE'}</Chip>
            <span>{impostorResultLine(byPlayer.get(id)?.stats)}</span>
          </span>} />
        </li>;
      })}</ol>
    </section>;
  };

  const aside = <div className={s.aside}>
    {player.secretPokemon && <Panel variant="cream" as="section" aria-labelledby="impostor-secret-title" bodyClassName={cx(s.secret)}>
      <h2 id="impostor-secret-title" className={s.kicker}>Pokémon secreto</h2>
      <div className={s.secretCard}><Card size="fill" name={player.secretPokemon.name} sprite={player.secretPokemon.sprite} decorativeSprite /></div>
    </Panel>}
    {finishText && <Panel variant="cream" as="section" aria-labelledby="impostor-finish-title" bodyClassName={cx(s.finish)}>
      <span className={cx(s.finishIcon, impostorsWon ? s.impostor : s.innocent)}><Icon icon={impostorsWon ? Skull : ShieldCheck} size={32} /></span>
      <div>
        <h2 id="impostor-finish-title" className={s.kicker}>Cómo acabó</h2>
        <p className={s.finishText}>{finishText}</p>
      </div>
    </Panel>}
  </div>;

  const actions = <ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} />;

  return <ResultsShell won={won} title={`Ganan ${impostorsWon ? 'los impostores' : 'los inocentes'}`} subtitle="Pokémon Impostor · Partida terminada" aside={aside} actions={actions}>
    <div className={s.teams}>{impostorsWon ? <>{team('IMPOSTOR')}{team('INNOCENT')}</> : <>{team('INNOCENT')}{team('IMPOSTOR')}</>}</div>
  </ResultsShell>;
}
