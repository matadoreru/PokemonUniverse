import { type PokemonBluffAuctionPublicState } from '@pokemon-universe/shared/public';
import { CheckCircle2, Equal, Gavel, Trophy } from 'lucide-react';
import { bluffStatsLine } from '../games/pokemon-bluff-auction/presentation';
import b from '../games/pokemon-bluff-auction/BluffAuction.module.css';
import { Chip, Icon } from '../ui';
import { guessTop } from './guess-kit';
import { sharesPosition } from './results-ties';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, standingRows } from './ResultsShell';
import { useRoomMembers } from './room-members';
import type { GameResultsProps } from './room-command';

/**
 * Resultados de Pokémon Bluff Auction: la clasificación del catálogo (`ResultsShell` con `standings`: ganador con
 * insignia, sin medallas emoji) con, en texto, rondas ganadas, apuestas cumplidas, récord, correctos e imposibles; la
 * regla de la puntuación y del desempate. Al lado, los récords. Abajo, la acción del host.
 */
export function PokemonBluffAuctionResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as PokemonBluffAuctionPublicState;
  const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const members = useRoomMembers(room); const { nameOf } = members;
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows = standingRows(standings, members, (standing) => ({
    meta: <>
      {sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}
      <span>{bluffStatsLine(standing.stats)}</span>
    </>,
  }));
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const record = guessTop(entries, 'highestCompletedBid');
  const correct = guessTop(entries, 'correctPokemon');
  const rounds = guessTop(entries, 'roundsWon');
  const records = <ResultsRecords id="bluff-auction-records-title" records={[
    { key: 'record', title: 'Mayor apuesta cumplida', icon: Gavel, names: record?.names ?? null, value: String(record?.value ?? ''), unit: 'Pokémon demostrados' },
    { key: 'correct', title: 'Más Pokémon correctos', icon: CheckCircle2, names: correct?.names ?? null, value: String(correct?.value ?? ''), unit: correct?.value === 1 ? 'Pokémon correcto' : 'Pokémon correctos' },
    { key: 'rounds', title: 'Más rondas ganadas', icon: Trophy, names: rounds?.names ?? null, value: String(rounds?.value ?? ''), unit: rounds?.value === 1 ? 'ronda ganada' : 'rondas ganadas' },
  ]} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="La mesa final" subtitle="Pokémon Bluff Auction · Resultados"
    standings={rows} selfId={selfId} winnersNeedPoints aside={records}
    actions={<ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge>
    <p className={b.resultsRule}>La clasificación suma las apuestas demostradas (+5) y las rondas en las que el grupo pilló un farol (+2 a cada rival). En caso de empate cuentan las rondas ganadas y la mayor apuesta cumplida.</p>
  </ResultsShell>;
}
