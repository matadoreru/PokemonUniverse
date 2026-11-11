import type { WhoIsWhoPublicState } from '@pokemon-universe/shared/public';
import { Crown, Equal, Flag } from 'lucide-react';
import type { CSSProperties } from 'react';
import { TEAM_COLOR, TEAM_NAME, TEAMS, whoResultRule, whoResultTitle, whoStatsLine } from '../games/who-is-who-pokemon/presentation';
import { Badge, Card, Chip, Icon, Panel } from '../ui';
import { sharesPosition } from './results-ties';
import { ResultsHostActions } from './ResultsRecords';
import { ResultsShell, standingRows } from './ResultsShell';
import { useRoomMembers } from './room-members';
import type { GameResultsProps } from './room-command';
import s from '../games/who-is-who-pokemon/WhoIsWho.module.css';

/**
 * Resultados de Quién es Quién: «¡Ganó el Equipo X!» o «Empate» (si se acaban las rondas nadie suma), la clasificación
 * del catálogo con los aciertos y fallos de cada uno y, al lado, los dos equipos con su secreto ya revelado y sus
 * jugadores. Abajo, la acción del host. Un empate a cero no corona a nadie.
 */
export function WhoIsWhoPokemonResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as WhoIsWhoPublicState;
  const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const members = useRoomMembers(room); const { nameOf } = members;
  const teamOf = (playerId: string) => TEAMS.find((team) => game.teams[team].playerIds.includes(playerId)) ?? null;
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows = standingRows(standings, members, (standing) => {
    const team = teamOf(standing.playerId);
    return {
      meta: <>
        {sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}
        {team && <span>{TEAM_NAME[team]}</span>}
        <span>{whoStatsLine(standing.stats)}</span>
      </>,
    };
  });
  const winner = game.winnerTeam;
  const won = winner !== null && game.teams[winner].playerIds.includes(selfId);
  const aside = <Panel title="Los secretos" variant="dark" scroll scrollLabel="Los secretos de los equipos">
    <ul className={s.resultTeams} aria-label="Equipos y sus secretos">{TEAMS.map((team) => {
      const secret = game.revealedSecrets[team];
      return <li key={team} className={s.resultTeam} style={{ '--team': TEAM_COLOR[team] } as CSSProperties} data-testid={`who-result-${team}`}>
        {secret ? <Card size="sm" sprite={secret.sprite} name={secret.name} number={secret.nationalDexNumber} decorativeSprite /> : <Card size="sm" name="Sin secreto" />}
        <span className={s.resultTeamText}>
          <span className={s.resultTeamName}><Icon icon={Flag} size={18} />{TEAM_NAME[team]}{winner === team && <Badge><Icon icon={Crown} size={18} />Ganador</Badge>}</span>
          <span className={s.resultTeamMembers}>Secreto: {secret?.name ?? '—'}</span>
          <span className={s.resultTeamMembers}>{game.teams[team].playerIds.map(nameOf).join(', ') || 'Sin jugadores'}</span>
        </span>
      </li>;
    })}</ul>
  </Panel>;
  const guesses = game.guesses.length;
  return <ResultsShell won={won} title={whoResultTitle(winner)} subtitle={`Quién es Quién · ${game.turnNumber} ${game.turnNumber === 1 ? 'turno' : 'turnos'} · ${guesses} ${guesses === 1 ? 'intento' : 'intentos'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={<ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando al host…" />} fillLarge>
    <p className={s.resultsRule}>{whoResultRule(winner, game.guesses.at(-1)?.correct === true)}</p>
  </ResultsShell>;
}
