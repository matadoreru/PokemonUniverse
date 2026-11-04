import { type PokemonTeamAuctionPublicState, type RoomView } from '@pokemon-universe/shared/public';
import { Coins, Equal, Gavel, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { teamStatsLine } from '../games/pokemon-team-auction/presentation';
import s from '../games/pokemon-team-auction/TeamAuction.module.css';
import { Card, Chip, cx, Icon, Panel } from '../ui';
import { guessTop } from './guess-kit';
import { playerColor } from './player-color';
import { sharesPosition } from './results-ties';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, type ResultsStanding } from './ResultsShell';

/**
 * Resultados de Pokémon Team Auction: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con
 * insignia y «+N», los puntos en BST) con, en texto, BST, Pokémon, legendarios, míticos, monedas y lotes ganados, y los
 * sprites del equipo; la regla del desempate. Al lado, los récords y los Pokémon sin dueño. Abajo, la acción del host
 * («Ver clasificación final» si la sesión ha terminado). Sin medallas emoji.
 */
export function PokemonTeamAuctionResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as PokemonTeamAuctionPublicState;
  const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const unowned = game.lotHistory.filter((lot) => lot.winnerId === null);
  const members = useMemo(() => new Map(room.members.map((member) => [member.id, member])), [room.members]);
  const nameOf = (playerId: string) => members.get(playerId)?.displayName ?? 'Entrenador';
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows: ResultsStanding[] = standings.map((standing) => {
    const index = room.members.findIndex((member) => member.id === standing.playerId);
    const team = game.participants[standing.playerId]?.team ?? [];
    const stats = { ...standing.stats, coinsRemaining: standing.stats.coinsRemaining ?? game.participants[standing.playerId]?.coins ?? 0 };
    return {
      id: standing.playerId,
      position: standing.position,
      name: nameOf(standing.playerId),
      points: standing.points,
      avatar: room.members[index]?.avatar,
      color: playerColor(Math.max(0, index)),
      meta: <>
        {sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}
        <span>{teamStatsLine(stats)}</span>
        {team.length > 0 && <span className={s.teamLine}>{team.map((pokemon, i) => <img key={`${pokemon.id}-${i}`} src={pokemon.sprite} alt={pokemon.name} title={`${pokemon.name} · BST ${pokemon.baseStatTotal}`} />)}</span>}
      </>,
    };
  });
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const lots = guessTop(entries, 'lotsWon');
  const coins = guessTop(entries, 'coinsRemaining');
  const legends = guessTop(entries, (stats) => (stats.legendaryCount ?? 0) + (stats.mythicalCount ?? 0));
  const records = <ResultsRecords id="team-auction-records-title" records={[
    { key: 'lots', title: 'Más lotes ganados', icon: Gavel, names: lots?.names ?? null, value: String(lots?.value ?? ''), unit: lots?.value === 1 ? 'lote ganado' : 'lotes ganados' },
    { key: 'coins', title: 'Más ahorrador', icon: Coins, names: coins?.names ?? null, value: String(coins?.value ?? ''), unit: coins?.value === 1 ? 'moneda sin gastar' : 'monedas sin gastar' },
    { key: 'legends', title: 'Legendarios y míticos', icon: Sparkles, names: legends?.names ?? null, value: String(legends?.value ?? ''), unit: legends?.value === 1 ? 'Pokémon legendario o mítico' : 'Pokémon legendarios o míticos' },
  ]} />;
  const unownedPanel = unowned.length > 0 && <Panel variant="cream" as="section" aria-labelledby="unowned-pokemon" bodyClassName={cx(s.unowned)}>
    <h2 id="unowned-pokemon" className={s.unownedTitle}>Pokémon sin dueño</h2>
    <p className={s.unownedHelp}>No hubo ninguna puja mínima válida para estos lotes.</p>
    <ul className={s.unownedList}>{unowned.map((lot) => <li key={lot.lotNumber}><Card size="sm" sprite={lot.pokemon.sprite} name={lot.pokemon.name} decorativeSprite><Chip tone="bad">Lote {lot.lotNumber}</Chip></Card></li>)}</ul>
  </Panel>;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="La mesa final" subtitle="Pokémon Team Auction · Resultados"
    standings={rows} selfId={selfId} winnersNeedPoints pointsLabel={(points) => `${points} BST`} aside={<>{records}{unownedPanel}</>}
    actions={<ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge>
    <p className={s.rule}>Gana el equipo con mayor BST. En caso de empate cuentan las monedas, los legendarios y los míticos.</p>
  </ResultsShell>;
}
