import type { GameResultsProps } from './room-command';
import { GuessResults } from './guess-kit/GuessResults';

/** Resultados de Pokédex Entry Guess: los comunes de los juegos de adivinar (`GuessResults`), con sus unidades. */
export function PokedexEntryGuessResults(props: GameResultsProps) {
  return <GuessResults {...props} gameName="Pokédex Entry Guess" recordsId="entry-records-title" correctUnit={['entrada reconocida', 'entradas reconocidas']} fastestUnit="desde que salió la entrada" />;
}
