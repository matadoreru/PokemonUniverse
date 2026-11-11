import type { AbsurdPokedexPublicState } from '@pokemon-universe/shared/public';
import { absurdPokedexScoringLabel } from '@pokemon-universe/shared/public';
import { Equal, Laugh, Search, Trophy, VenetianMask, Vote } from 'lucide-react';
import { Chip, Icon } from '../ui';
import { guessTop } from './guess-kit';
import { sharesPosition } from './game-kit/results-ties';
import { ResultsHostActions, ResultsRecords, type ResultsRecordItem } from './game-kit/ResultsRecords';
import { ResultsShell, standingRows } from './game-kit/ResultsShell';
import { useRoomMembers } from './room-members';
import type { GameResultsProps } from './room-command';
import { plural, roundsLabel } from '../lib/format';
import s from '../games/absurd-pokedex/AbsurdPokedex.module.css';

type Stats = NonNullable<AbsurdPokedexPublicState['results']>['standings'][number]['stats'];
const num = (stats: Stats, key: string) => Number(stats[key] ?? 0);

/** Línea de métricas en texto; en `REAL_ENTRY` suma las oficiales acertadas, los engañados y las risas. */
export function absurdStatsLine(stats: Stats, mode: AbsurdPokedexPublicState['mode']): string {
  const parts = [plural(num(stats, 'roundWins'), 'victoria', 'victorias'), plural(num(stats, 'votesReceived'), 'voto recibido', 'votos recibidos')];
  if (mode === 'REAL_ENTRY') parts.push(plural(num(stats, 'realGuessed'), 'oficial acertada', 'oficiales acertadas'), plural(num(stats, 'playersFooled'), 'engañado', 'engañados'), `😂 ${num(stats, 'funnyVotesReceived')}`);
  parts.push(`${num(stats, 'entriesSubmitted')}/${num(stats, 'roundsPlayed')} entradas`);
  return parts.join(' · ');
}

/** Resultados de Pokédex Absurda: clasificación, regla de puntos y récords del modo; abajo, la acción del host. */
export function AbsurdPokedexResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as AbsurdPokedexPublicState;
  const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const members = useRoomMembers(room); const { nameOf } = members;
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows = standingRows(standings, members, (standing) => ({
    meta: <>{sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{absurdStatsLine(standing.stats, game.mode)}</span></>,
  }));
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const record = (key: string, title: string, icon: ResultsRecordItem['icon'], one: string, many: string): ResultsRecordItem => {
    const top = guessTop(entries, key);
    return { key, title, icon, names: top?.names ?? null, value: String(top?.value ?? ''), unit: top?.value === 1 ? one : many };
  };
  const records: ResultsRecordItem[] = game.mode === 'REAL_ENTRY'
    ? [
      record('realGuessed', 'Mejor ojo', Search, 'oficial acertada', 'oficiales acertadas'),
      record('playersFooled', 'Más engaños', VenetianMask, 'jugador engañado', 'jugadores engañados'),
      record('funnyVotesReceived', 'La más graciosa', Laugh, 'risa recibida', 'risas recibidas'),
    ]
    : [
      record('roundWins', 'Más victorias', Trophy, 'ronda ganada', 'rondas ganadas'),
      record('votesReceived', 'Más votos recibidos', Vote, 'voto recibido', 'votos recibidos'),
    ];
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Las entradas más absurdas" subtitle={`Pokédex Absurda · ${roundsLabel(game.totalRounds)}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={<ResultsRecords id="absurd-records-title" records={records} />}
    actions={<ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge>
    <p className={s.rule}>{absurdPokedexScoringLabel(game.mode)}</p>
  </ResultsShell>;
}
