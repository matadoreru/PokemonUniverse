import type { LearnsetGuessPublicState } from '@pokemon-universe/shared/public';
import { CheckCircle2, Equal, Lightbulb, Trophy } from 'lucide-react';
import { learnsetRecords, learnsetStatsLine } from '../games/learnset-guess/presentation';
import { learnsetModeLabel } from './learnset-texts';
import { Chip, Icon } from '../ui';
import { sharesPosition } from './results-ties';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, standingRows } from './ResultsShell';
import { useRoomMembers } from './room-members';
import type { GameResultsProps } from './room-command';
import { roundsLabel } from '../lib/format';

/**
 * Resultados de Learnset Guess: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con
 * insignia y «+N», aciertos, fallos, porcentaje y media de cada uno) y, al lado, los récords de la partida (más
 * aciertos, más aciertos con las pistas iniciales y la mejor ronda; empates juntos). Abajo, la acción del host. Un
 * empate a cero no corona.
 */
export function LearnsetGuessResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as LearnsetGuessPublicState; const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const members = useRoomMembers(room); const { nameOf } = members;
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows = standingRows(standings, members, (standing) => ({
    meta: <>{sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{learnsetStatsLine(standing.stats)}</span></>,
  }));
  // Revelación manual: «iniciales» es acertar con el primer grupo; el subtítulo nombra el modo.
  const manual = game.mode === 'MANUAL_REVEAL';
  const records = learnsetRecords(standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats })));
  const aside = <ResultsRecords id="learnset-records-title" records={[
    { key: 'correct', title: 'Más aciertos', icon: CheckCircle2, names: records.correct?.names ?? null, value: records.correct?.value ?? '', unit: records.correct?.value === '1' ? 'Pokémon acertado' : 'Pokémon acertados' },
    { key: 'initial', title: manual ? 'A la primera' : 'Con las pistas iniciales', icon: Lightbulb, names: records.initial?.names ?? null, value: records.initial?.value ?? '', unit: manual ? 'aciertos con el primer grupo' : 'aciertos antes de la primera pista nueva' },
    { key: 'bestRound', title: 'Mejor ronda', icon: Trophy, names: records.bestRound?.names ?? null, value: records.bestRound?.value ?? '', unit: 'puntos en una sola ronda' },
  ]} />;
  const actions = <ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación Learnset Guess" subtitle={`Learnset Guess${manual ? ` · ${learnsetModeLabel}` : ''} · ${roundsLabel(game.totalRounds)}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={actions} fillLarge />;
}
