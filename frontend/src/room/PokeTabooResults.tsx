import type { PokeTabooPublicState } from '@pokemon-universe/shared/public';
import { POKE_TABOO_DESCRIPTOR_POINTS, POKE_TABOO_GUESSER_MAX_POINTS, POKE_TABOO_GUESSER_MIN_POINTS } from '@pokemon-universe/shared/public';
import { Equal, Mic, Search, Target } from 'lucide-react';
import { tabooStatsLine } from '../games/poke-taboo/presentation';
import { Chip, Icon } from '../ui';
import { guessTop } from './guess-kit';
import { sharesPosition } from './game-kit/results-ties';
import { ResultsHostActions, ResultsRecords } from './game-kit/ResultsRecords';
import { ResultsShell, standingRows } from './game-kit/ResultsShell';
import { useRoomMembers } from './room-members';
import type { GameResultsProps } from './room-command';
import s from '../games/poke-taboo/PokeTaboo.module.css';

/**
 * Resultados de PokéTaboo: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con insignia y
 * «+N» y, en texto, adivinados, al primer intento, turnos describiendo con acierto y los puntos por adivinar y por
 * describir), la regla de los puntos y, al lado, los récords (más adivinados, al primer intento y mejor descriptor;
 * empates juntos). Abajo, la acción del host. Un empate a cero no corona.
 */
export function PokeTabooResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as PokeTabooPublicState;
  const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const members = useRoomMembers(room); const { nameOf } = members;
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows = standingRows(standings, members, (standing) => ({
    meta: <>{sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{tabooStatsLine(standing.stats)}</span></>,
  }));
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const guessed = guessTop(entries, 'guessedPokemon');
  const firstTry = guessTop(entries, 'firstTry');
  const describer = guessTop(entries, 'descriptorSuccesses');
  const aside = <ResultsRecords id="poke-taboo-records-title" records={[
    { key: 'guessed', title: 'Más Pokémon adivinados', icon: Search, names: guessed?.names ?? null, value: String(guessed?.value ?? ''), unit: guessed?.value === 1 ? 'Pokémon adivinado' : 'Pokémon adivinados' },
    { key: 'first', title: 'Al primer intento', icon: Target, names: firstTry?.names ?? null, value: String(firstTry?.value ?? ''), unit: firstTry?.value === 1 ? 'acierto sin fallar' : 'aciertos sin fallar' },
    { key: 'describer', title: 'Mejor descriptor', icon: Mic, names: describer?.names ?? null, value: String(describer?.value ?? ''), unit: describer?.value === 1 ? 'turno describiendo con acierto' : 'turnos describiendo con acierto' },
  ]} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Así ha ido la partida" subtitle={`PokéTaboo · ${game.totalRounds} ${game.totalRounds === 1 ? 'turno' : 'turnos'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={<ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge>
    <p className={s.resultsRule}>Puntos por descubrir Pokémon y por ayudar al grupo a encontrarlos: quien acierta suma de {POKE_TABOO_GUESSER_MAX_POINTS} a {POKE_TABOO_GUESSER_MIN_POINTS} según lo rápido y quien describe, {POKE_TABOO_DESCRIPTOR_POINTS}.</p>
  </ResultsShell>;
}
