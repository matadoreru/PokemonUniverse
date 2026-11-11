import type { GameResults } from '@pokemon-universe/shared/public';
import { CheckCircle2, Equal, Target, Timer } from 'lucide-react';
import { Chip, Icon } from '../../ui';
import { sharesPosition } from '../results-ties';
import { ResultsHostActions, ResultsRecords, type ResultsRecordItem } from '../ResultsRecords';
import { ResultsShell, standingRows } from '../ResultsShell';
import { useRoomMembers } from '../room-members';
import type { GameResultsProps } from '../room-command';
import { guessRecords, guessStatsLine, type GuessStats } from './results';

/** Lo que leen los resultados del estado público de cualquiera de los seis juegos de adivinar. */
interface GuessResultsGame { totalRounds: number; results: GameResults | null }

export interface GuessResultsOptions {
  /** Nombre del juego en el subtítulo («¿Quién es ese Pokémon? · 5 rondas»). */
  gameName: string;
  /** Id del título de los récords (`*-records-title`). */
  recordsId: string;
  /** Unidad de «Más aciertos» en singular y en plural («silueta reconocida», «siluetas reconocidas»). */
  correctUnit: readonly [string, string];
  /** Unidad de «Acierto más rápido» («desde que salió la silueta»). */
  fastestUnit: string;
  /** Métricas propias del juego al final de la línea de cada jugador («3 a máximo zoom»). */
  statsExtras?(stats: GuessStats): string[];
  /** Tercer récord en lugar de «Al primer intento» (Zoomed: «A máximo zoom»). */
  thirdRecord?(entries: readonly { name: string; stats: GuessStats }[]): ResultsRecordItem;
}

/**
 * Resultados de los juegos de adivinar: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador
 * con insignia y «+N» y, en texto, aciertos, sin acertar, intentos, precisión, media, mejor tiempo y al primer intento,
 * más los extras del juego) y, al lado, los récords de la partida (más aciertos, acierto más rápido y al primer intento
 * o el tercero propio del juego; empates juntos). Abajo, la acción del host. Un empate a cero no corona.
 */
export function GuessResults({ room, selfId, onLobby, onEnd, gameName, recordsId, correctUnit, fastestUnit, statsExtras, thirdRecord }: GameResultsProps & GuessResultsOptions) {
  const game = room.game as GuessResultsGame; const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const members = useRoomMembers(room); const { nameOf } = members;
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows = standingRows(standings, members, (standing) => ({
    meta: <>{sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{guessStatsLine(standing.stats, statsExtras?.(standing.stats) ?? [])}</span></>,
  }));
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const records = guessRecords(entries);
  const aside = <ResultsRecords id={recordsId} records={[
    { key: 'correct', title: 'Más aciertos', icon: CheckCircle2, names: records.correct?.names ?? null, value: records.correct?.value ?? '', unit: records.correct?.value === '1' ? correctUnit[0] : correctUnit[1] },
    { key: 'fastest', title: 'Acierto más rápido', icon: Timer, names: records.fastest?.names ?? null, value: records.fastest?.value ?? '', unit: fastestUnit },
    thirdRecord ? thirdRecord(entries) : { key: 'firstTry', title: 'Al primer intento', icon: Target, names: records.firstTry?.names ?? null, value: records.firstTry?.value ?? '', unit: records.firstTry?.value === '1' ? 'acierto sin fallar antes' : 'aciertos sin fallar antes' },
  ]} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación final" subtitle={`${gameName} · ${game.totalRounds} ${game.totalRounds === 1 ? 'ronda' : 'rondas'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={<ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge />;
}
