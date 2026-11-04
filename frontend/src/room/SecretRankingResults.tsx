import type { RoomView, SecretRankingPublicState } from '@pokemon-universe/shared/public';
import { Crosshair, Equal, Sparkles, Trophy } from 'lucide-react';
import { closestAverage, formatDistance, secretRankingStatsLine } from '../games/secret-ranking/presentation';
import { Chip, Icon } from '../ui';
import { guessTop } from './guess-kit';
import { playerColor } from './player-color';
import { sharesPosition } from './results-ties';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, type ResultsStanding } from './ResultsShell';
import s from '../games/secret-ranking/SecretRanking.module.css';

/**
 * Resultados de Secret Ranking: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con
 * insignia y «+N» y, en texto, victorias de ronda, coincidencias perfectas, rankings enviados y distancia media), la regla
 * de los puntos y, al lado, los récords (más victorias, coincidencias perfectas y menor distancia media; empates juntos).
 * Abajo, la acción del host. Un empate a cero no corona.
 */
export function SecretRankingResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as SecretRankingPublicState;
  const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const nameOf = (playerId: string) => room.members.find((member) => member.id === playerId)?.displayName ?? 'Entrenador';
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows: ResultsStanding[] = standings.map((standing) => {
    const index = room.members.findIndex((member) => member.id === standing.playerId);
    return {
      id: standing.playerId,
      position: standing.position,
      name: nameOf(standing.playerId),
      points: standing.points,
      avatar: room.members[index]?.avatar,
      color: playerColor(Math.max(0, index)),
      meta: <>{sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{secretRankingStatsLine(standing.stats)}</span></>,
    };
  });
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const wins = guessTop(entries, 'roundWins');
  const perfect = guessTop(entries, 'perfectMatches');
  const closest = closestAverage(entries);
  const aside = <ResultsRecords id="secret-ranking-records-title" records={[
    { key: 'wins', title: 'Más rondas ganadas', icon: Trophy, names: wins?.names ?? null, value: String(wins?.value ?? ''), unit: wins?.value === 1 ? 'ronda como el más cercano' : 'rondas como el más cercano' },
    { key: 'perfect', title: 'Coincidencias perfectas', icon: Sparkles, names: perfect?.names ?? null, value: String(perfect?.value ?? ''), unit: perfect?.value === 1 ? 'ranking idéntico a la media' : 'rankings idénticos a la media' },
    { key: 'closest', title: 'Mente más sincronizada', icon: Crosshair, names: closest?.names ?? null, value: closest ? formatDistance(closest.value) : '', unit: 'de distancia media a los demás' },
  ]} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="La mente más sincronizada" subtitle={`Secret Ranking · ${game.totalRounds} ${game.totalRounds === 1 ? 'ronda' : 'rondas'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={<ResultsHostActions host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge>
    <p className={s.rule}>Los puntos se obtienen por cercanía en cada ronda. La media de referencia de cada persona excluye siempre su propio ranking.</p>
  </ResultsShell>;
}
