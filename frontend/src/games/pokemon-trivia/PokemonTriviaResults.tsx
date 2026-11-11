import type { PokemonTriviaPublicState } from '@pokemon-universe/shared/public';
import { CheckCircle2, Equal, Target, Timer } from 'lucide-react';
import { triviaAccuracy, triviaCategoryScores } from './presentation';
import { Chip, Icon } from '../../ui';
import { guessSeconds, guessTop } from '../../room/guess-kit';
import { sharesPosition } from '../../room/game-kit/results-ties';
import { ResultsHostActions, ResultsRecords } from '../../room/game-kit/ResultsRecords';
import { ResultsShell, standingRows } from '../../room/game-kit/ResultsShell';
import { useRoomMembers } from '../../room/room-members';
import type { GameResultsProps } from '../../room/room-command';
import s from './PokemonTrivia.module.css';

/**
 * Resultados de Pokémon Trivia: la clasificación del catálogo (`ResultsShell`: podio, ganador y «+N») con, en texto, los
 * aciertos, la precisión y los aciertos por categoría de cada jugador («Tipos 2/3»). Al lado, los récords: más
 * aciertos, la respuesta correcta más rápida y la mejor precisión. Un empate a cero no corona.
 */
export function PokemonTriviaResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as PokemonTriviaPublicState; const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const members = useRoomMembers(room); const { nameOf } = members;
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows = standingRows(standings, members, (standing) => {
    const correct = Number(standing.stats.correct ?? 0); const answers = Number(standing.stats.answers ?? 0);
    const categories = triviaCategoryScores(standing.stats);
    return {
      meta: <>
        {sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}
        <span>{`${correct} ${correct === 1 ? 'acierto' : 'aciertos'} de ${answers} · ${triviaAccuracy(standing.stats)}% de precisión`}</span>
        {categories.length > 0 && <span className={s.categories} aria-label="Aciertos por categoría">{categories.map((category) => <span key={category.type} className={s.category}>{category.label} {category.correct}/{category.answers}</span>)}</span>}
      </>,
    };
  });
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const most = guessTop(entries, 'correct');
  const fastest = guessTop(entries, 'fastestCorrectMs', true);
  const accuracy = guessTop(entries.filter((entry) => Number(entry.stats.answers ?? 0) > 0), triviaAccuracy);
  const aside = <ResultsRecords id="trivia-records-title" records={[
    { key: 'correct', title: 'Más aciertos', icon: CheckCircle2, names: most?.names ?? null, value: String(most?.value ?? ''), unit: most?.value === 1 ? 'respuesta correcta' : 'respuestas correctas' },
    { key: 'fastest', title: 'Acierto más rápido', icon: Timer, names: fastest?.names ?? null, value: fastest ? guessSeconds(fastest.value) : '', unit: 'desde que salió la pregunta' },
    { key: 'accuracy', title: 'Mejor precisión', icon: Target, names: accuracy?.names ?? null, value: accuracy ? `${accuracy.value}%` : '', unit: 'de sus respuestas, correctas' },
  ]} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación final" subtitle={`Pokémon Trivia · ${game.totalRounds} ${game.totalRounds === 1 ? 'pregunta' : 'preguntas'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={<ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge />;
}
