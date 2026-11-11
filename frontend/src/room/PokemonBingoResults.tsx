import type { PokemonBingoPublicState } from '@pokemon-universe/shared/public';
import { Grid3x3, Trophy } from 'lucide-react';
import { useState } from 'react';
import { BingoBoard } from '../games/pokemon-bingo/BingoParts';
import { bingoProgressText, bingoStatsLine } from '../games/pokemon-bingo/presentation';
import { Chip, Icon, Panel, TabPanel, Tabs } from '../ui';
import { ResultsHostActions } from './ResultsRecords';
import { ResultsShell, standingRows } from './ResultsShell';
import { useRoomMembers } from './room-members';
import type { GameResultsProps } from './room-command';

/**
 * Resultados de Pokémon Bingo: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con
 * insignia y «+N», y la línea de casillas, correctos, fallos y el tiempo del bingo) y, al lado, el tablero final de cada
 * jugador en pestañas (`Tabs`), con los Pokémon que valían en las casillas que quedaron vacías («Podías usar»).
 */
export function PokemonBingoResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as PokemonBingoPublicState;
  const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const members = useRoomMembers(room); const { nameOf } = members;
  const ids = standings.length ? standings.map((standing) => standing.playerId) : Object.keys(game.boards);
  const [tab, setTab] = useState(ids[0] ?? selfId);
  const active = game.boards[tab] ? tab : ids[0] ?? null;
  const board = active ? game.boards[active] ?? null : null;
  const rows = standingRows(standings, members, (standing) => ({
    meta: <>{standing.playerId === game.winnerId && <Chip tone="ok" icon={<Icon icon={Trophy} size={18} />}>Bingo</Chip>}<span>{bingoStatsLine(standing.stats)}</span></>,
  }));
  const aside = <Panel title="Tableros finales" variant="dark" as="section" right={board ? <Chip tone={board.completed === board.total ? 'ok' : 'neutral'} icon={<Icon icon={Grid3x3} size={18} />}>{bingoProgressText(board)}</Chip> : null}>
    <Tabs label="Tablero final de cada jugador" idBase="bingo-final" active={active ?? ''} onChange={setTab}
      items={ids.map((id) => ({ key: id, label: `${id === selfId ? `${nameOf(id)} (tú)` : nameOf(id)} · ${game.boards[id]?.completed ?? 0}/${game.boards[id]?.total ?? 0}` }))} />
    {board && active && <TabPanel idBase="bingo-final" tabKey={active}>
      <BingoBoard board={board} width={game.width} height={game.height} showSolutions label={`Tablero final de ${nameOf(active)}`} />
    </TabPanel>}
  </Panel>;
  const actions = <ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title={game.winnerId ? `Bingo de ${nameOf(game.winnerId)}` : 'Tiempo agotado'}
    subtitle={`Pokémon Bingo · tablero ${game.width}×${game.height}${game.winnerId ? '' : ' · nadie completó el tablero'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={actions} fillLarge />;
}
