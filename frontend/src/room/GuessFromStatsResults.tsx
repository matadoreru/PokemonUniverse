import type { GameResultsProps } from './room-command';
import { GuessResults } from './guess-kit/GuessResults';

/** Resultados de Guess from Stats: los comunes de los juegos de adivinar (`GuessResults`), con sus unidades. */
export function GuessFromStatsResults(props: GameResultsProps) {
  return <GuessResults {...props} gameName="Guess from Stats" recordsId="stats-records-title" correctUnit={['ficha reconocida', 'fichas reconocidas']} fastestUnit="desde que salieron las estadísticas" />;
}
