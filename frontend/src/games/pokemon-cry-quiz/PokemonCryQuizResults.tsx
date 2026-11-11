import type { GameResultsProps } from '../../room/room-command';
import { GuessResults } from '../../room/guess-kit/GuessResults';

/** Resultados de Adivina el Grito: los comunes de los juegos de adivinar (`GuessResults`), con sus unidades. */
export function PokemonCryQuizResults(props: GameResultsProps) {
  return <GuessResults {...props} gameName="Adivina el Grito" recordsId="cry-records-title" correctUnit={['grito reconocido', 'gritos reconocidos']} fastestUnit="desde que empezó la ronda" />;
}
