import type { GameResultsProps } from '../../room/room-command';
import { GuessResults } from '../../room/guess-kit/GuessResults';

/** Resultados de ¿Quién es ese Pokémon?: los comunes de los juegos de adivinar (`GuessResults`), con sus unidades. */
export function WhosThatPokemonResults(props: GameResultsProps) {
  return <GuessResults {...props} gameName="¿Quién es ese Pokémon?" recordsId="whos-that-records-title" correctUnit={['silueta reconocida', 'siluetas reconocidas']} fastestUnit="desde que salió la silueta" />;
}
