import { RED_FLAG_WIN_POINTS, type PokemonRedFlagPublicState } from '@pokemon-universe/shared/public';
import { Equal, MessageSquareHeart, Trophy, Vote } from 'lucide-react';
import { Chip, Icon } from '../ui';
import { guessTop } from './guess-kit';
import { sharesPosition } from './game-kit/results-ties';
import { ResultsHostActions, ResultsRecords } from './game-kit/ResultsRecords';
import { ResultsShell, standingRows } from './game-kit/ResultsShell';
import { useRoomMembers } from './room-members';
import type { GameResultsProps } from './room-command';
import { roundsLabel } from '../lib/format';
import s from '../games/pokemon-red-flag/PokemonRedFlag.module.css';

type Stats = NonNullable<PokemonRedFlagPublicState['results']>['standings'][number]['stats'];
const num = (stats: Stats, key: string) => Number(stats[key] ?? 0);

/** Línea de métricas en texto: victorias (en solitario y compartidas), votos recibidos y respuestas enviadas. */
export function redFlagStatsLine(stats: Stats): string {
  const wins = num(stats, 'roundWins');
  const votes = num(stats, 'votesReceived');
  const shared = num(stats, 'sharedWins');
  return [
    `${wins} ${wins === 1 ? 'victoria' : 'victorias'}`,
    `${num(stats, 'soloWins')} en solitario`,
    `${shared} ${shared === 1 ? 'compartida' : 'compartidas'}`,
    `${votes} ${votes === 1 ? 'voto recibido' : 'votos recibidos'}`,
    `${num(stats, 'answersSubmitted')}/${num(stats, 'roundsPlayed')} respuestas`,
  ].join(' · ');
}

/**
 * Resultados de La Frase Pokémon: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con
 * insignia y «+N» y, en texto, victorias en solitario y compartidas, votos recibidos y respuestas enviadas), la regla de
 * los 3 puntos y, al lado, los récords (más victorias, más votos recibidos y victorias en solitario; empates juntos).
 * Abajo, la acción del host. Un empate a cero no corona.
 */
export function PokemonRedFlagResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as PokemonRedFlagPublicState;
  const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const members = useRoomMembers(room); const { nameOf } = members;
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows = standingRows(standings, members, (standing) => ({
    meta: <>{sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{redFlagStatsLine(standing.stats)}</span></>,
  }));
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const wins = guessTop(entries, 'roundWins');
  const votes = guessTop(entries, 'votesReceived');
  const solo = guessTop(entries, 'soloWins');
  const aside = <ResultsRecords id="red-flag-records-title" records={[
    { key: 'wins', title: 'Más victorias', icon: Trophy, names: wins?.names ?? null, value: String(wins?.value ?? ''), unit: wins?.value === 1 ? 'ronda ganada' : 'rondas ganadas' },
    { key: 'votes', title: 'Más votos recibidos', icon: Vote, names: votes?.names ?? null, value: String(votes?.value ?? ''), unit: votes?.value === 1 ? 'voto decisivo' : 'votos decisivos' },
    { key: 'solo', title: 'Victorias en solitario', icon: MessageSquareHeart, names: solo?.names ?? null, value: String(solo?.value ?? ''), unit: solo?.value === 1 ? 'ronda sin empate' : 'rondas sin empate' },
  ]} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Las frases más votadas" subtitle={`La Frase Pokémon · ${roundsLabel(game.totalRounds)}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={<ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge>
    <p className={s.rule}>Cada victoria vale {RED_FLAG_WIN_POINTS} puntos, también cuando el empate persiste tras la segunda vuelta.</p>
  </ResultsShell>;
}
