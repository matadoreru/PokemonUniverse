import { WOULD_YOU_RATHER_MAJORITY_POINTS, WOULD_YOU_RATHER_PREDICTION_POINTS, type WouldYouRatherPublicState } from '@pokemon-universe/shared/public';
import { Equal, Sparkles, Target, Users } from 'lucide-react';
import { Chip, Icon } from '../../ui';
import { guessTop } from '../../room/guess-kit';
import { sharesPosition } from '../../room/game-kit/results-ties';
import { ResultsHostActions, ResultsRecords } from '../../room/game-kit/ResultsRecords';
import { ResultsShell, standingRows } from '../../room/game-kit/ResultsShell';
import { useRoomMembers } from '../../room/room-members';
import type { GameResultsProps } from '../../room/room-command';
import { roundsLabel } from '../../lib/format';
import s from './WouldYouRather.module.css';

type Stats = NonNullable<WouldYouRatherPublicState['results']>['standings'][number]['stats'];
const num = (stats: Stats, key: string) => Number(stats[key] ?? 0);
/** Una ronda perfecta: en la mayoría y habiéndola predicho. */
const PERFECT_ROUND_POINTS = WOULD_YOU_RATHER_MAJORITY_POINTS + WOULD_YOU_RATHER_PREDICTION_POINTS;

/** Línea de métricas en texto: predicciones acertadas, elecciones en la mayoría, papeletas enviadas y rondas perfectas. */
export function wouldYouRatherStatsLine(stats: Stats): string {
  const predictions = num(stats, 'correctPredictions');
  const perfect = num(stats, 'perfectRounds');
  return [
    `${predictions} ${predictions === 1 ? 'predicción' : 'predicciones'}`,
    `${num(stats, 'majorityChoices')} en mayoría`,
    `${num(stats, 'ballotsSubmitted')}/${num(stats, 'roundsPlayed')} papeletas`,
    `${perfect} ${perfect === 1 ? 'ronda perfecta' : 'rondas perfectas'}`,
  ].join(' · ');
}

/**
 * Resultados de Would You Rather: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con
 * insignia y «+N» y, en texto, predicciones, elecciones en la mayoría, papeletas y rondas perfectas), la regla de los
 * puntos y, al lado, los récords (más predicciones, más veces en la mayoría y rondas perfectas; empates juntos). Abajo, la
 * acción del host. Un empate a cero no corona.
 */
export function WouldYouRatherResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as WouldYouRatherPublicState;
  const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const members = useRoomMembers(room); const { nameOf } = members;
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows = standingRows(standings, members, (standing) => ({
    meta: <>{sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{wouldYouRatherStatsLine(standing.stats)}</span></>,
  }));
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const predictions = guessTop(entries, 'correctPredictions');
  const majority = guessTop(entries, 'majorityChoices');
  const perfect = guessTop(entries, 'perfectRounds');
  const aside = <ResultsRecords id="wyr-records-title" records={[
    { key: 'predictions', title: 'Mejor lectura de la sala', icon: Target, names: predictions?.names ?? null, value: String(predictions?.value ?? ''), unit: predictions?.value === 1 ? 'predicción acertada' : 'predicciones acertadas' },
    { key: 'majority', title: 'Más veces en la mayoría', icon: Users, names: majority?.names ?? null, value: String(majority?.value ?? ''), unit: majority?.value === 1 ? 'elección mayoritaria' : 'elecciones mayoritarias' },
    { key: 'perfect', title: 'Rondas perfectas', icon: Sparkles, names: perfect?.names ?? null, value: String(perfect?.value ?? ''), unit: perfect?.value === 1 ? `ronda con ${PERFECT_ROUND_POINTS} puntos` : `rondas con ${PERFECT_ROUND_POINTS} puntos` },
  ]} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Quien mejor leyó la sala" subtitle={`Would You Rather Pokémon · ${roundsLabel(game.totalRounds)}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={<ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge>
    <p className={s.rule}>Cada ronda daba hasta {PERFECT_ROUND_POINTS} puntos: {WOULD_YOU_RATHER_MAJORITY_POINTS} por formar parte de la mayoría y {WOULD_YOU_RATHER_PREDICTION_POINTS} por predecirla.</p>
  </ResultsShell>;
}
