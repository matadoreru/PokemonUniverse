import type { GameResultsProps } from '../../room/room-command';
import { GuessResults } from '../../room/guess-kit/GuessResults';

/** Resultados de Adivina por la Paleta: los comunes de los juegos de adivinar (`GuessResults`), con sus unidades. */
export function PokemonPaletteGuessResults(props: GameResultsProps) {
  return <GuessResults {...props} gameName="Adivina por la Paleta" recordsId="palette-records-title" correctUnit={['paleta reconocida', 'paletas reconocidas']} fastestUnit="desde que salió la paleta" />;
}
