import type { PokemonTriviaPublicState, RoomView } from '@pokemon-universe/shared/public';
import { CheckCircle2, Equal, Target, Timer } from 'lucide-react';
import { triviaAccuracy, triviaCategoryScores } from '../games/pokemon-trivia/presentation';
import { Chip, Icon } from '../ui';
import { guessSeconds, guessTop } from './guess-kit';
import { playerColor } from './player-color';
import { sharesPosition } from './results-ties';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, type ResultsStanding } from './ResultsShell';
import s from '../games/pokemon-trivia/PokemonTrivia.module.css';

/**
 * Resultados de Pokémon Trivia: la clasificación del catálogo (`ResultsShell`: podio, ganador y «+N») con, en texto, los
 * aciertos, la precisión y los aciertos por categoría de cada jugador («Tipos 2/3»). Al lado, los récords: más
 * aciertos, la respuesta correcta más rápida y la mejor precisión. Un empate a cero no corona.
 */
export function PokemonTriviaResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as PokemonTriviaPublicState; const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const nameOf = (playerId: string) => room.members.find((member) => member.id === playerId)?.displayName ?? 'Entrenador';
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows: ResultsStanding[] = standings.map((standing) => {
    const index = room.members.findIndex((member) => member.id === standing.playerId);
    const correct = Number(standing.stats.correct ?? 0); const answers = Number(standing.stats.answers ?? 0);
    const categories = triviaCategoryScores(standing.stats);
    return {
      id: standing.playerId,
      position: standing.position,
      name: nameOf(standing.playerId),
      points: standing.points,
      avatar: room.members[index]?.avatar,
      color: playerColor(Math.max(0, index)),
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
