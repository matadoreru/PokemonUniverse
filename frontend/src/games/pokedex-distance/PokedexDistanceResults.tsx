import { gameModeLabel, type PokedexDistancePublicState } from '@pokemon-universe/shared/public';
import { Crosshair, Target } from 'lucide-react';
import { cx, Icon, Panel } from '../../ui';
import { distanceBestLabel, distanceCell, type DistanceCellTone, distanceResultsSummary, distanceResultsTitle, distanceRoundLabel, distanceStandingLabel, distanceStatsLine, distanceTableFootnote } from './pokedex-distance-results';
import { ResultsHostActions } from '../../room/game-kit/ResultsRecords';
import { ResultsShell, standingRows } from '../../room/game-kit/ResultsShell';
import { useRoomMembers } from '../../room/room-members';
import type { GameResultsProps } from '../../room/room-command';
import s from './PokedexDistanceResults.module.css';

const CELL_TONE: Record<DistanceCellTone, string | undefined> = {
  leaf: s.exact,
  aqua: s.near,
  ink: s.far,
  berry: s.fell,
  muted: s.muted,
};

/**
 * Resultados de Pokédex Distance: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con
 * insignia y «+N», la ronda en la que cayó cada uno y sus estadísticas) y, al lado, sus métricas: el mejor acierto y la
 * distancia por ronda (con los desempates como columnas). Abajo, la acción del host.
 */
export function PokedexDistanceResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as PokedexDistancePublicState; const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const winnerId = game.results?.winnerId ?? null;
  const history = game.roundHistory;
  const summary = distanceResultsSummary(history, standings.map((standing) => standing.playerId));
  const byPlayer = new Map(summary.players.map((player) => [player.playerId, player]));
  const members = useRoomMembers(room); const { nameOf } = members;
  const best = summary.best;
  // «Por puntos»: la clasificación (del servidor) va por puntos y nadie cae; el subtítulo lleva el nombre del modo.
  const pointsMode = game.mode === 'POINTS';
  const modeLabel = gameModeLabel('pokedex-distance', game);

  const rows = standingRows(standings, members, (standing) => {
    const player = byPlayer.get(standing.playerId);
    // «Ganador» ya lo pone la insignia de la franja: aquí solo la ronda en la que cayó.
    const label = player && !pointsMode && standing.playerId !== winnerId ? distanceStandingLabel(player, winnerId) : null;
    return {
      // En la franja propia (amarilla) el rojo no llega a AA: tinta oscura, el texto ya dice que cayó.
      meta: <>{label && <span className={standing.playerId === selfId ? s.fellTextSelf : s.fellText}>{label}</span>}<span>{distanceStatsLine(standing.stats)}</span></>,
    };
  });

  const bestHit = <Panel variant="cream" as="section" aria-labelledby="distance-best-title" bodyClassName={cx(s.best)}>
    <span className={cx(s.bestIcon, best?.distance === 0 && s.bestExact)}><Icon icon={best?.distance === 0 ? Crosshair : Target} size={32} /></span>
    <div className={s.bestText}>
      <h2 id="distance-best-title" className={s.kicker}>Mejor acierto</h2>
      {best
        ? <><strong className={s.bestName} title={nameOf(best.playerId)}>{nameOf(best.playerId)}</strong><p className={s.help}>{distanceBestLabel(best)}</p></>
        : <p className={s.help}>Nadie llegó a elegir un Pokémon en esta partida.</p>}
    </div>
    {best && <strong className={s.bestValue} aria-hidden="true">{best.distance}</strong>}
  </Panel>;

  const rounds = history.length > 0 && <Panel variant="cream" as="section" aria-labelledby="distance-rounds-title" className={cx(s.rounds)}>
    <h2 id="distance-rounds-title" className={s.sectionTitle}>Distancia por ronda</h2>
    {/* Desplazable con teclado: a 390 las últimas columnas quedan dentro de la caja. */}
    <div className={s.tableWrap} tabIndex={0} role="region" aria-labelledby="distance-rounds-title">
      <table className={s.table}>
        <thead><tr>
          <th scope="col" className={s.nameCell}>Entrenador</th>
          {history.map((record) => <th key={`${record.roundNumber}-${record.tiebreakDepth}`} scope="col" title={record.tiebreakDepth > 0 ? `Ronda ${record.roundNumber}, desempate ${record.tiebreakDepth} · objetivo #${record.targetDexNumber}` : `Ronda ${record.roundNumber} · objetivo #${record.targetDexNumber}`}>{distanceRoundLabel(record)}</th>)}
        </tr></thead>
        <tbody>{standings.map((standing) => <tr key={standing.playerId}>
          <th scope="row" className={s.nameCell}><span className={s.truncate} title={nameOf(standing.playerId)}>{nameOf(standing.playerId)}</span></th>
          {history.map((record) => { const cell = distanceCell(record, standing.playerId); return <td key={`${record.roundNumber}-${record.tiebreakDepth}`} className={CELL_TONE[cell.tone]} title={cell.label}><span aria-hidden="true">{cell.mark && `${cell.mark} `}{cell.text}</span><span className="sr-only">{cell.label}</span></td>; })}
        </tr>)}</tbody>
      </table>
    </div>
    <p className={s.foot}>{distanceTableFootnote(pointsMode)}</p>
  </Panel>;

  const actions = <ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} />;

  return <ResultsShell won={winnerId === selfId} title={distanceResultsTitle(pointsMode, winnerId, standings)} subtitle={`Pokédex Distance${modeLabel ? ` · ${modeLabel}` : ''} · Partida ${room.gamesPlayed}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={<div className={s.aside}>{bestHit}{rounds}</div>} actions={actions} fillLarge />;
}
