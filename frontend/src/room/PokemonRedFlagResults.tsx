import { RED_FLAG_WIN_POINTS, type PokemonRedFlagPublicState, type RoomView } from '@pokemon-universe/shared/public';
import { Equal, MessageSquareHeart, Trophy, Vote } from 'lucide-react';
import { Chip, Icon } from '../ui';
import { guessTop } from './guess-kit';
import { playerColor } from './player-color';
import { sharesPosition } from './results-ties';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, type ResultsStanding } from './ResultsShell';
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
export function PokemonRedFlagResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as PokemonRedFlagPublicState;
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
      meta: <>{sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{redFlagStatsLine(standing.stats)}</span></>,
    };
  });
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const wins = guessTop(entries, 'roundWins');
  const votes = guessTop(entries, 'votesReceived');
  const solo = guessTop(entries, 'soloWins');
  const aside = <ResultsRecords id="red-flag-records-title" records={[
    { key: 'wins', title: 'Más victorias', icon: Trophy, names: wins?.names ?? null, value: String(wins?.value ?? ''), unit: wins?.value === 1 ? 'ronda ganada' : 'rondas ganadas' },
    { key: 'votes', title: 'Más votos recibidos', icon: Vote, names: votes?.names ?? null, value: String(votes?.value ?? ''), unit: votes?.value === 1 ? 'voto decisivo' : 'votos decisivos' },
    { key: 'solo', title: 'Victorias en solitario', icon: MessageSquareHeart, names: solo?.names ?? null, value: String(solo?.value ?? ''), unit: solo?.value === 1 ? 'ronda sin empate' : 'rondas sin empate' },
  ]} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Las frases más votadas" subtitle={`La Frase Pokémon · ${game.totalRounds} ${game.totalRounds === 1 ? 'ronda' : 'rondas'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={<ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge>
    <p className={s.rule}>Cada victoria vale {RED_FLAG_WIN_POINTS} puntos, también cuando el empate persiste tras la segunda vuelta.</p>
  </ResultsShell>;
}
